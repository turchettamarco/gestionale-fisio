// ═══════════════════════════════════════════════════════════════════════
// src/hooks/calendar/useAppointmentMutations.ts
// ═══════════════════════════════════════════════════════════════════════
// Cos'è:
//   Hook che raccoglie TUTTE le mutazioni sugli appuntamenti
//   (create/save/delete + toggle rapidi + bulk + quick patient).
//   Estratto da calendar/page.tsx (refactor B3.7, ultimo hook).
//
// Dove si usa:
//   In app/(protected)/calendar/page.tsx, dopo gli altri 6 hook e
//   dopo che TUTTI i form state (create+edit+group+recurring+
//   duplicate+quickPatient) sono stati dichiarati. Le mutazioni
//   leggono i form values via closure attraverso l'options bag.
//
// Cosa fa:
//   - createAppointment(sendWhatsApp): valida + INSERT singolo o
//     ricorrente, gestisce gruppi con partecipanti iniziali (closed/
//     open mode), check overlap, default payment_method, integrazione
//     WhatsApp opzionale, reset form post-creazione
//   - saveAppointment: UPDATE dell'appuntamento selezionato dai campi
//     edit*, gestione is_paid/paid_at coerente con CHECK constraint
//     mig. 010
//   - deleteAppointment: DELETE con conferma
//   - toggleDoneQuick(apptId, current): toggle status booked↔done con
//     auto-pagamento coerente (done implica is_paid=true, paid_at=now)
//   - togglePaidQuick(apptId, currentlyPaid): toggle is_paid mantenendo
//     paid_at coerente
//   - handleUpdatePayment: handler completo per PaidIconButton/PaidPill
//     che setta is_paid + paid_at + payment_method insieme
//   - bulkMarkPaid: segna come pagati tutti gli appuntamenti selezionati
//     in modalità bulk
//   - createQuickPatient: crea un paziente "rapido" da CreateModal,
//     lo seleziona automaticamente come paziente dell'appuntamento
//   - createQuickPatientCore: crea paziente con tenancy corretta,
//     ritorna l'oggetto. Usato da componenti gruppo (decidono loro
//     cosa farne)
//
// Dipendenze: TANTE — vedi UseAppointmentMutationsOptions
//
// Note:
//   - Zero modifiche di comportamento rispetto al codice originale.
//   - Mantengo IDENTICHE le deps array dei useCallback originali,
//     anche dove l'ESLint avrebbe segnalato dipendenze mancanti
//     (es. saveAppointment manca editPaymentMethod e practiceSettings
//     nelle sue deps): il refactor non corregge bug.
//   - checkOverlap viene passato come prop perché è anche usato da
//     un effect del modale create che resta in pagina.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { getStudioBranding } from "@/src/lib/studioBranding";
import { translateError } from "@/src/lib/translateError";
import {
  addDays,
  startOfISOWeekMonday,
  parseDateInput,
  generateRecurringStarts,
  formatDateRelative,
  fmtTime,
  openWhatsApp,
  CLINIC_ADDRESSES,
  type CalendarEvent,
  type LocationType,
  type PatientLite,
  type PracticeSettings,
  type Status,
  type TreatmentType,
} from "@/app/(protected)/calendar/utils";
import type { Studio, StudioLocationLite } from "@/src/contexts/StudioContext";
import type { TreatmentCatalogRow } from "./useCalendarBootstrap";
import type { InitialParticipant } from "./useGroupOperations";

/* ─── tipi: form state raggruppato ─── */

export type SelectedEventLite = {
  id: string;
  title: string;
  patient_id?: string;
  location?: LocationType | null;
  clinic_site?: string | null;
  domicile_address?: string | null;
  treatment?: string | null;
  diagnosis?: string | null;
  amount?: number | null;
  treatment_type?: string | null;
  price_type?: string | null;
  start?: Date;
  end?: Date;
} | null;

/** Stato del modale CREATE (form di creazione appuntamento) */
export interface CreateFormState {
  createStartISO: string;
  createEndISO: string;
  createLocation: LocationType;
  createClinicSite: string;
  createDomicileAddress: string;
  createLocationId: string | null;
  treatmentType: TreatmentType;
  priceType: "invoiced" | "cash";
  paymentMethod: "cash" | "pos" | "bank_transfer" | null;
  customAmount: string;
  useCustomPrice: boolean;
  // Ricorrenza
  isRecurring: boolean;
  recurringDays: number[];
  recurringUntil: string;
  recurringFrequency: 1 | 2 | 3 | 4;
  // Gruppo (mig. 014)
  isGroupAppointment: boolean;
  groupTitle: string;
  groupMaxParticipants: string;
  groupPricePerPerson: string;
  groupRecurringMode: "closed" | "open";
  // Pacchetto sedute (mig. 014_packages):
  // se valorizzato, l'appuntamento scala una seduta dal pacchetto e
  // l'incasso non viene gestito sulla seduta singola
  selectedPackageId?: string | null;
  // Multi-operatore (mig. 019/022, Fase 4d):
  // operatore selezionato. null = non assegnato. In single-op è ignorato.
  createOperatorId?: string | null;
  // Multi-stanza (mig. 019, Fase Stanze):
  // stanza selezionata. null = nessuna. Ignorato in single-room.
  createRoomId?: string | null;
}

/** Stato del modale EDIT (form di modifica appuntamento esistente) */
export interface EditFormState {
  editStatus: Status;
  editNote: string;
  editAmount: string;
  editTreatmentType: TreatmentType;
  editPriceType: "invoiced" | "cash";
  editPaymentMethod: "cash" | "pos" | "bank_transfer" | null;
  editDate: string;
  editStartTime: string;
  editDuration: "0.5" | "0.75" | "1" | "1.5" | "2";
  // Multi-operatore (mig. 019/022, Fase 4d.1):
  editOperatorId?: string | null;
  // Multi-stanza (mig. 019, Fase Stanze):
  editRoomId?: string | null;
}

/** Stato del modale "crea paziente rapido" */
export interface QuickPatientFormState {
  quickPatientFirstName: string;
  quickPatientLastName: string;
  quickPatientPhone: string;
}

/* ─── tipi: opzioni hook ─── */

export interface UseAppointmentMutationsOptions {
  // Form state (raggruppati)
  createForm: CreateFormState;
  editForm: EditFormState;
  quickPatientForm: QuickPatientFormState;

  // Setter form state per reset post-mutation
  setCreateOpen: Dispatch<SetStateAction<boolean>>;
  setCreating: Dispatch<SetStateAction<boolean>>;
  setQuickPatientOpen: Dispatch<SetStateAction<boolean>>;
  setQuickPatientFirstName: Dispatch<SetStateAction<string>>;
  setQuickPatientLastName: Dispatch<SetStateAction<string>>;
  setQuickPatientPhone: Dispatch<SetStateAction<string>>;
  setCreatingQuickPatient: Dispatch<SetStateAction<boolean>>;

  // Stato selezione (search hook)
  selectedPatient: PatientLite | null;
  setSelectedPatient: Dispatch<SetStateAction<PatientLite | null>>;
  setPatientResults: Dispatch<SetStateAction<PatientLite[]>>;

  // Selected event (modale modifica/elimina)
  selectedEvent: SelectedEventLite;
  setSelectedEvent: Dispatch<SetStateAction<SelectedEventLite>>;

  // Bulk (search hook)
  bulkSelected: Set<string>;
  setBulkSelected: Dispatch<SetStateAction<Set<string>>>;
  setBulkMode: Dispatch<SetStateAction<boolean>>;

  // Gruppi (groups hook)
  initialParticipants: InitialParticipant[];
  setInitialParticipants: Dispatch<SetStateAction<InitialParticipant[]>>;

  // Pacchetti sedute (mig. 014_packages) — setter per reset post-create
  setSelectedPackageId?: Dispatch<SetStateAction<string | null>>;

  // Bootstrap
  currentStudio: Studio | null;
  currentStudioId: string | null;
  studioLocations: StudioLocationLite[];
  practiceSettings: PracticeSettings | null;
  getDefaultAmount: (
    tType: TreatmentType,
    pType: "invoiced" | "cash"
  ) => number;
  treatmentCatalog: TreatmentCatalogRow[];

  // Events
  setError: Dispatch<SetStateAction<string>>;
  currentDate: Date;
  loadAppointments: (
    startDate: Date,
    endDate: Date,
    retryCount?: number
  ) => Promise<void>;

  // Helper (resta in pagina)
  checkOverlap: (
    startISO: string,
    endISO: string,
    excludeId?: string
  ) => string | null;
}

export interface UseAppointmentMutationsReturn {
  createAppointment: (sendWhatsApp?: boolean) => Promise<void>;
  saveAppointment: () => Promise<void>;
  deleteAppointment: () => Promise<void>;
  toggleDoneQuick: (apptId: string, current: Status) => Promise<void>;
  togglePaidQuick: (apptId: string, currentlyPaid: boolean) => Promise<void>;
  handleUpdatePayment: (
    apptId: string,
    next: {
      is_paid: boolean;
      paid_at: string | null;
      payment_method: "cash" | "pos" | "bank_transfer" | null;
    }
  ) => Promise<void>;
  bulkMarkPaid: () => Promise<void>;
  createQuickPatient: () => Promise<void>;
  createQuickPatientCore: (payload: {
    first_name: string;
    last_name: string;
    phone: string | null;
  }) => Promise<PatientLite | null>;
}

/* ─── hook ─── */

export function useAppointmentMutations(
  options: UseAppointmentMutationsOptions
): UseAppointmentMutationsReturn {
  const {
    createForm,
    editForm,
    quickPatientForm,
    setCreateOpen,
    setCreating,
    setQuickPatientOpen,
    setQuickPatientFirstName,
    setQuickPatientLastName,
    setQuickPatientPhone,
    setCreatingQuickPatient,
    selectedPatient,
    setSelectedPatient,
    setPatientResults,
    selectedEvent,
    setSelectedEvent,
    bulkSelected,
    setBulkSelected,
    setBulkMode,
    initialParticipants,
    setInitialParticipants,
    setSelectedPackageId,
    currentStudio,
    currentStudioId,
    practiceSettings,
    getDefaultAmount,
    setError,
    currentDate,
    loadAppointments,
    checkOverlap,
  } = options;

  /* ─── bulkMarkPaid ─── */
  const bulkMarkPaid = useCallback(async () => {
    if (bulkSelected.size === 0) return;
    setError("");
    const ids = Array.from(bulkSelected);
    // Mantiene coerenza col CHECK constraint appointments_paid_consistency:
    // is_paid=true ↔ paid_at NOT NULL (mig. 010).
    const nowIso = new Date().toISOString();

    for (const id of ids) {
      const { error } = await supabase
        .from("appointments")
        .update({ is_paid: true, paid_at: nowIso })
        .eq("id", id);
      if (error) {
        setError(`Errore aggiornamento: ${translateError(error)}`);
        return;
      }
    }

    setBulkSelected(new Set());
    setBulkMode(false);
    const startOfWeek = startOfISOWeekMonday(currentDate);
    const endOfWeek = addDays(startOfWeek, 7);
    await loadAppointments(startOfWeek, endOfWeek);
  }, [
    bulkSelected,
    currentDate,
    loadAppointments,
    setBulkMode,
    setBulkSelected,
    setError,
  ]);

  /* ─── toggleDoneQuick ─── */
  const toggleDoneQuick = useCallback(
    async (apptId: string, current: Status) => {
      setError("");
      const next: Status = current === "done" ? "confirmed" : "done";

      // Mantiene coerenza col CHECK constraint appointments_paid_consistency:
      // is_paid=true ↔ paid_at NOT NULL (mig. 010).
      const willBePaid = next === "done";
      const payload = willBePaid
        ? { status: next, is_paid: true, paid_at: new Date().toISOString() }
        : { status: next, is_paid: false, paid_at: null };
      const { error } = await supabase
        .from("appointments")
        .update(payload)
        .eq("id", apptId);

      if (error) {
        setError(`Errore aggiornamento stato: ${translateError(error)}`);
        return;
      }

      const startOfWeek = startOfISOWeekMonday(currentDate);
      const endOfWeek = addDays(startOfWeek, 7);
      await loadAppointments(startOfWeek, endOfWeek);
    },
    [currentDate, loadAppointments, setError]
  );

  /* ─── togglePaidQuick ─── */
  const togglePaidQuick = useCallback(
    async (apptId: string, currentlyPaid: boolean) => {
      setError("");
      // Mantiene coerenza col CHECK constraint appointments_paid_consistency:
      // is_paid=true ↔ paid_at NOT NULL (mig. 010).
      const willBePaid = !currentlyPaid;
      const payload = willBePaid
        ? { is_paid: true, paid_at: new Date().toISOString() }
        : { is_paid: false, paid_at: null };
      const { error } = await supabase
        .from("appointments")
        .update(payload)
        .eq("id", apptId);
      if (error) {
        setError(`Errore aggiornamento pagamento: ${translateError(error)}`);
        return;
      }
      const startOfWeek = startOfISOWeekMonday(currentDate);
      const endOfWeek = addDays(startOfWeek, 7);
      await loadAppointments(startOfWeek, endOfWeek);
    },
    [currentDate, loadAppointments, setError]
  );

  /* ─── handleUpdatePayment ─── */
  // Handler completo per il PaidIconButton/PaidPill: scrive is_paid + paid_at +
  // payment_method tutti insieme, in modo coerente con il CHECK constraint
  // (mig. 010) e con l'invariante "non fatturato = sempre contante" (mig. 011,
  // garantita anche dal trigger DB).
  const handleUpdatePayment = useCallback(
    async (
      apptId: string,
      next: {
        is_paid: boolean;
        paid_at: string | null;
        payment_method: "cash" | "pos" | "bank_transfer" | null;
      }
    ) => {
      setError("");
      const payload: Record<string, unknown> = {
        is_paid: next.is_paid,
        paid_at: next.paid_at,
      };
      // payment_method va settato esplicitamente solo quando l'utente lo
      // sceglie nel popover. Se non pagato, lo azzeriamo.
      if (!next.is_paid) {
        payload.payment_method = null;
      } else if (next.payment_method) {
        payload.payment_method = next.payment_method;
      }
      const { error } = await supabase
        .from("appointments")
        .update(payload)
        .eq("id", apptId);
      if (error) {
        setError(`Errore aggiornamento pagamento: ${translateError(error)}`);
        return;
      }
      const startOfWeek = startOfISOWeekMonday(currentDate);
      const endOfWeek = addDays(startOfWeek, 7);
      await loadAppointments(startOfWeek, endOfWeek);
    },
    [currentDate, loadAppointments, setError]
  );

  /* ─── createQuickPatient ─── */
  const createQuickPatient = useCallback(async () => {
    const { quickPatientFirstName, quickPatientLastName, quickPatientPhone } =
      quickPatientForm;
    if (!quickPatientFirstName.trim() || !quickPatientLastName.trim()) {
      setError("Inserisci nome e cognome per il nuovo paziente.");
      return;
    }
    if (!currentStudioId) {
      setError("Studio non disponibile. Riprova tra un momento.");
      return;
    }

    setCreatingQuickPatient(true);
    setError("");

    try {
      // Recupera owner_id (auth user) per la multi-tenancy
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData?.user?.id;
      if (!ownerId) {
        setError("Sessione scaduta. Effettua di nuovo il login.");
        setCreatingQuickPatient(false);
        return;
      }

      const { data, error } = await supabase
        .from("patients")
        .insert({
          first_name: quickPatientFirstName.trim(),
          last_name: quickPatientLastName.trim(),
          phone: quickPatientPhone.trim() || null,
          status: "da_completare",
          owner_id: ownerId, // multi-tenancy
          studio_id: currentStudioId, // multi-tenancy
          created_at: new Date().toISOString(),
        })
        .select("id, first_name, last_name, phone")
        .single();

      if (error) throw error;

      if (data) {
        const newPatient: PatientLite = {
          id: data.id,
          first_name: data.first_name,
          last_name: data.last_name,
          phone: data.phone,
        };

        setSelectedPatient(newPatient);
        setPatientResults((prev) => [newPatient, ...prev]);
        setQuickPatientOpen(false);
        setQuickPatientFirstName("");
        setQuickPatientLastName("");
        setQuickPatientPhone("");

        setError("Paziente creato con successo! Ora puoi creare l'appuntamento.");
      }
    } catch (err: unknown) {
      setError(`Errore creazione paziente: ${translateError(err)}`);
    } finally {
      setCreatingQuickPatient(false);
    }
  }, [
    quickPatientForm,
    currentStudioId,
    setError,
    setCreatingQuickPatient,
    setSelectedPatient,
    setPatientResults,
    setQuickPatientOpen,
    setQuickPatientFirstName,
    setQuickPatientLastName,
    setQuickPatientPhone,
  ]);

  /* ─── createQuickPatientCore ─── */
  // ─── Quick patient per gruppo (nuovo, mig. 015) ───────────────────
  // Usato sia in fase di creazione gruppo (CreateAppointmentModal con
  // isGroupAppointment=true) sia in aggiunta partecipanti a gruppo
  // esistente (GroupEventModal). Crea il paziente con tenancy e lo
  // restituisce; il chiamante decide cosa farne (aggiungerlo a
  // initialParticipants oppure invocare onAddParticipant).
  const createQuickPatientCore = useCallback(
    async (payload: {
      first_name: string;
      last_name: string;
      phone: string | null;
    }): Promise<PatientLite | null> => {
      if (!currentStudioId) {
        setError("Studio non disponibile. Riprova tra un momento.");
        return null;
      }
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData?.user?.id;
      if (!ownerId) {
        setError("Sessione scaduta. Effettua di nuovo il login.");
        return null;
      }
      try {
        const { data, error } = await supabase
          .from("patients")
          .insert({
            first_name: payload.first_name,
            last_name: payload.last_name,
            phone: payload.phone,
            status: "da_completare",
            owner_id: ownerId,
            studio_id: currentStudioId,
            created_at: new Date().toISOString(),
          })
          .select("id, first_name, last_name, phone")
          .single();
        if (error) throw error;
        if (!data) return null;
        return {
          id: data.id,
          first_name: data.first_name,
          last_name: data.last_name,
          phone: data.phone,
        };
      } catch (err: unknown) {
        setError(`Errore creazione paziente: ${translateError(err)}`);
        return null;
      }
    },
    [currentStudioId, setError]
  );

  /* ─── createAppointment (il mostro: 343 righe nell'originale) ─── */
  const createAppointment = useCallback(
    async (sendWhatsApp: boolean = false) => {
      const {
        createStartISO,
        createEndISO,
        createLocation,
        createClinicSite,
        createDomicileAddress,
        createLocationId,
        treatmentType,
        priceType,
        paymentMethod,
        useCustomPrice,
        customAmount,
        isRecurring,
        recurringDays,
        recurringUntil,
        recurringFrequency,
        isGroupAppointment,
        groupTitle,
        groupMaxParticipants,
        groupPricePerPerson,
        groupRecurringMode,
      } = createForm;

      setError("");

      // Per gli appuntamenti di gruppo, NON serve un paziente selezionato
      // (i partecipanti verranno aggiunti dopo dal SelectedEventModal).
      // Servono però titolo, max partecipanti e prezzo per persona.
      if (isGroupAppointment) {
        if (!groupTitle.trim()) {
          setError(
            'Inserisci un titolo per il gruppo (es. "Posturale di gruppo").'
          );
          return;
        }
        const maxN = parseInt(groupMaxParticipants, 10);
        if (isNaN(maxN) || maxN < 2) {
          setError("Numero massimo partecipanti non valido (minimo 2).");
          return;
        }
        const pricePP = parseFloat(groupPricePerPerson.replace(",", "."));
        if (isNaN(pricePP) || pricePP < 0) {
          setError("Prezzo per persona non valido.");
          return;
        }
      } else if (!selectedPatient) {
        setError("Seleziona un paziente prima di creare l'appuntamento.");
        return;
      }
      if (!createStartISO || !createEndISO) {
        setError("Orari appuntamento non validi.");
        return;
      }

      if (createLocation === "studio") {
        if (!createClinicSite.trim()) {
          setError("Inserisci il nome della sede (clinic_site).");
          return;
        }
      } else {
        if (createDomicileAddress.trim().length < 5) {
          setError("Inserisci un indirizzo domicilio valido (min 5 caratteri).");
          return;
        }
      }

      const firstStart = new Date(createStartISO);
      const firstEnd = new Date(createEndISO);
      const durationMs = firstEnd.getTime() - firstStart.getTime();
      if (durationMs <= 0) {
        setError("Durata appuntamento non valida.");
        return;
      }

      // Feature: Check overlap before creating
      if (!isRecurring) {
        const overlap = checkOverlap(createStartISO, createEndISO);
        if (overlap) {
          const proceed = window.confirm(`${overlap}\n\nVuoi procedere comunque?`);
          if (!proceed) return;
        }
      }

      if (isRecurring) {
        if (recurringDays.length === 0) {
          setError("Seleziona almeno un giorno per la ricorrenza.");
          return;
        }
        const until = parseDateInput(recurringUntil);
        if (until < firstStart) {
          setError(
            "La data 'Ripeti fino a' non può essere precedente alla prima data."
          );
          return;
        }
      }

      let amount: number | null = null;
      if (isGroupAppointment) {
        // Per i gruppi, "amount" sull'appointment padre resta NULL.
        // Il totale si calcola come somma dei prezzi dei partecipanti.
        amount = null;
      } else if (useCustomPrice && customAmount !== "") {
        const parsed = parseFloat(customAmount.replace(",", "."));
        if (!isNaN(parsed) && parsed >= 0) {
          amount = parsed;
        }
      } else {
        // Se nei Settings hai disattivato "applica automaticamente", lasciamo vuoto a meno che non sia custom
        const autoApply = practiceSettings?.auto_apply_prices ?? true;
        if (autoApply) {
          amount = getDefaultAmount(treatmentType, priceType);
        } else {
          amount = null;
        }
      }

      // Validazione: se fatturato, payment_method è obbligatorio SOLO se l'utente
      // ha attivato il check bloccante nelle impostazioni (default true per retro-compat).
      // Se non bloccante e l'utente non ha scelto, applichiamo automaticamente il
      // default configurato (default "pos") senza interrompere il flusso.
      // (skip per i gruppi: i pagamenti sono per singolo partecipante)
      let effectivePaymentMethod = paymentMethod;
      if (!isGroupAppointment && priceType === "invoiced" && !paymentMethod) {
        const required = practiceSettings?.payment_method_required ?? true;
        if (required) {
          alert("Seleziona il metodo di pagamento (Contanti, POS o Bonifico).");
          return;
        }
        // Non bloccante → applica il default
        effectivePaymentMethod = (practiceSettings?.default_payment_method ??
          "pos") as "cash" | "pos" | "bank_transfer";
      }

      setCreating(true);

      // Per i gruppi, patient_id=null e is_group=true.
      // Il vincolo CHECK del DB richiede patient_id NULL quando is_group=TRUE.
      const basePayload = isGroupAppointment
        ? {
            patient_id: null,
            status: (practiceSettings?.default_appointment_status ??
              "confirmed") as Status,
            calendar_note: null as string | null,
            location: createLocation,
            clinic_site:
              createLocation === "studio" ? createClinicSite.trim() : null,
            // Multi-sede (mig. 014, fase 2): scrivi location_id solo se la sede
            // è "studio" e il toggle multi-sede è ON e c'è una sede selezionata.
            // Altrimenti null → fallback alla sede principale lato lettura.
            location_id:
              createLocation === "studio" &&
              currentStudio?.multi_location_enabled &&
              createLocationId
                ? createLocationId
                : null,
            domicile_address:
              createLocation === "domicile"
                ? createDomicileAddress.trim()
                : null,
            treatment_type: null,
            price_type: null,
            payment_method: null,
            amount: null,
            studio_id: currentStudioId,
            // Multi-op (mig. 019/022): assegna operator_id se selezionato
            operator_id: createForm.createOperatorId ?? null,
            // Multi-stanza (mig. 019, Fase Stanze)
            room_id: createForm.createRoomId ?? null,
            // Campi gruppo (mig. 014)
            is_group: true,
            group_title: groupTitle.trim(),
            group_max_participants: parseInt(groupMaxParticipants, 10),
            group_price_per_person: parseFloat(
              groupPricePerPerson.replace(",", ".")
            ),
          }
        : {
            patient_id: selectedPatient!.id,
            status: (practiceSettings?.default_appointment_status ??
              "confirmed") as Status,
            calendar_note: null as string | null,
            location: createLocation,
            clinic_site:
              createLocation === "studio" ? createClinicSite.trim() : null,
            location_id:
              createLocation === "studio" &&
              currentStudio?.multi_location_enabled &&
              createLocationId
                ? createLocationId
                : null,
            domicile_address:
              createLocation === "domicile"
                ? createDomicileAddress.trim()
                : null,
            treatment_type: treatmentType,
            price_type: priceType,
            // Se la seduta scala da un pacchetto, niente metodo pagamento
            // sulla singola (l'incasso vive sui package_payments)
            payment_method: createForm.selectedPackageId
              ? null
              : priceType === "invoiced"
              ? effectivePaymentMethod
              : null,
            // Stesso ragionamento per amount: NULL quando scala da pacchetto
            amount: createForm.selectedPackageId ? null : amount,
            // Pacchetto: se selezionato, link diretto. is_paid resta a false
            // (la singola seduta non è "pagata" nel senso classico, è coperta
            // dal pacchetto. I report incassano dai versamenti pacchetto.)
            package_id: createForm.selectedPackageId ?? null,
            studio_id: currentStudioId, // multi-tenancy
            // Multi-op (mig. 019/022): assegna operator_id se selezionato
            operator_id: createForm.createOperatorId ?? null,
            // Multi-stanza (mig. 019, Fase Stanze): assegna room_id se selezionata
            room_id: createForm.createRoomId ?? null,
            is_group: false,
          };

      try {
        let createdAppointmentId: string | null = null;

        if (!isRecurring) {
          const payload = {
            ...basePayload,
            start_at: firstStart.toISOString(),
            end_at: firstEnd.toISOString(),
          };

          const { data, error: insErr } = await supabase
            .from("appointments")
            .insert(payload)
            .select()
            .single();
          if (insErr) throw new Error(insErr.message);

          if (data) {
            createdAppointmentId = data.id;

            // ─── Step 6.1: inserisci i partecipanti iniziali (se ci sono) ──
            if (
              isGroupAppointment &&
              initialParticipants.length > 0 &&
              createdAppointmentId
            ) {
              const pricePP = parseFloat(
                groupPricePerPerson.replace(",", ".")
              );
              const partRows = initialParticipants.map((p) => ({
                appointment_id: createdAppointmentId,
                patient_id: p.id,
                price: isFinite(pricePP) ? pricePP : 0,
                payment_status: "unpaid",
                attendance_status: "pending",
              }));
              const { error: partErr } = await supabase
                .from("appointment_participants")
                .insert(partRows);
              if (partErr) {
                // Non blocchiamo: il gruppo è creato. Mostriamo un warning.
                console.error(
                  "[create-group] errore inserimento partecipanti:",
                  partErr
                );
                alert(
                  `Gruppo creato, ma c'è stato un errore nell'aggiungere i partecipanti: ${partErr.message}\n` +
                    `Puoi aggiungerli manualmente dalla scheda del gruppo.`
                );
              }
            }

            // Per i gruppi non c'è un singolo paziente a cui inviare il WA.
            // I promemoria a tutti i partecipanti verranno inviati dopo, dal SelectedEventModal.
            if (sendWhatsApp && !isGroupAppointment && selectedPatient) {
              if (!(selectedPatient.phone || "").trim()) {
                alert("Nessun telefono registrato per questo paziente");
              } else {
                const dataRelativa = formatDateRelative(firstStart);
                const ora = fmtTime(firstStart.toISOString());

                let luogo = "";
                if (createLocation === "studio") {
                  luogo =
                    currentStudio?.address ||
                    CLINIC_ADDRESSES[createClinicSite] ||
                    createClinicSite ||
                    "";
                } else {
                  luogo = `Presso il suo domicilio (${createDomicileAddress})`;
                }

                const nomePaziente = selectedPatient.first_name || "Cliente";
                const firma = [
                  getStudioBranding(currentStudio).signatureName,
                  getStudioBranding(currentStudio).signatureTitle,
                ]
                  .filter(Boolean)
                  .join("\n");

                const message = `Grazie per averci scelto.
Ricordiamo il prossimo appuntamento fissato per ${dataRelativa} alle ${ora}.

📍 ${luogo}

A presto${firma ? `,\n${firma}` : ""}`;

                openWhatsApp(selectedPatient.phone || "", message);

                // Segna WhatsApp inviato per questo appuntamento (timestamp = verità)
                if (createdAppointmentId) {
                  const nowIso = new Date().toISOString();
                  await supabase
                    .from("appointments")
                    .update({ whatsapp_sent_at: nowIso, whatsapp_sent: true })
                    .eq("id", createdAppointmentId);
                }
              }
            }
          }
        } else {
          const until = parseDateInput(recurringUntil);

          const starts = generateRecurringStarts({
            firstStart,
            untilDate: until,
            weekDays: recurringDays,
            frequency: recurringFrequency,
          });

          if (starts.length > 200) {
            throw new Error(
              `Ricorrenza troppo ampia: ${starts.length} appuntamenti. Riduci l'intervallo o i giorni selezionati.`
            );
          }

          const rows = starts.map((s) => ({
            ...basePayload,
            start_at: s.toISOString(),
            end_at: new Date(s.getTime() + durationMs).toISOString(),
          }));

          const { data: insertedRows, error: insErr } = await supabase
            .from("appointments")
            .insert(rows)
            .select("id, start_at");
          if (insErr) throw new Error(insErr.message);

          // ─── Step 6.1: partecipanti iniziali per gruppi ricorrenti ─────
          // Modalità "closed": replica i pazienti su TUTTE le occorrenze
          // Modalità "open": solo la prima occorrenza riceve i partecipanti
          if (
            isGroupAppointment &&
            initialParticipants.length > 0 &&
            insertedRows &&
            insertedRows.length > 0
          ) {
            const pricePP = parseFloat(groupPricePerPerson.replace(",", "."));
            // Ordina cronologicamente per identificare la "prima" occorrenza
            const sortedAppts = [...insertedRows].sort(
              (a, b) =>
                new Date(a.start_at).getTime() -
                new Date(b.start_at).getTime()
            );
            const targetAppts =
              groupRecurringMode === "closed"
                ? sortedAppts // tutti
                : sortedAppts.slice(0, 1); // solo il primo
            const allPartRows: Array<Record<string, unknown>> = [];
            for (const a of targetAppts) {
              for (const p of initialParticipants) {
                allPartRows.push({
                  appointment_id: a.id,
                  patient_id: p.id,
                  price: isFinite(pricePP) ? pricePP : 0,
                  payment_status: "unpaid",
                  attendance_status: "pending",
                });
              }
            }
            const { error: partErr } = await supabase
              .from("appointment_participants")
              .insert(allPartRows);
            if (partErr) {
              console.error(
                "[create-group-recurring] errore inserimento partecipanti:",
                partErr
              );
              alert(
                `Gruppi creati, ma c'è stato un errore nell'aggiungere i partecipanti: ${partErr.message}\n` +
                  `Puoi aggiungerli manualmente dalle schede dei gruppi.`
              );
            }
          }

          if (sendWhatsApp) {
            alert(
              "Per appuntamenti ricorrenti, WhatsApp non viene inviato automaticamente per evitare troppi messaggi."
            );
          }
        }

        setCreateOpen(false);
        // Reset partecipanti iniziali per il prossimo gruppo (step 6.1)
        setInitialParticipants([]);
        // Reset pacchetto selezionato (mig. 014_packages)
        setSelectedPackageId?.(null);
        const startOfWeek = startOfISOWeekMonday(currentDate);
        const endOfWeek = addDays(startOfWeek, 7);
        await loadAppointments(startOfWeek, endOfWeek);
      } catch (e: unknown) {
        setError(`Errore creazione appuntamento: ${translateError(e)}`);
      } finally {
        setCreating(false);
      }
    },
    // Replico le deps array dell'originale: tutto ciò che era listato + i setter
    // di reset (necessari ora che li riceviamo come prop)
    [
      createForm,
      selectedPatient,
      practiceSettings,
      getDefaultAmount,
      currentDate,
      loadAppointments,
      checkOverlap,
      initialParticipants,
      currentStudio,
      currentStudioId,
      setCreateOpen,
      setCreating,
      setError,
      setInitialParticipants,
    ]
  );

  /* ─── saveAppointment ─── */
  const saveAppointment = useCallback(async () => {
    if (!selectedEvent) return;

    const {
      editStatus,
      editNote,
      editAmount,
      editTreatmentType,
      editPriceType,
      editPaymentMethod,
      editDate,
      editStartTime,
      editDuration,
    } = editForm;

    setError("");

    let amount: number | null = null;
    if (editAmount !== "" && editAmount !== null && editAmount !== undefined) {
      const parsed = parseFloat(editAmount.replace(",", "."));
      if (!isNaN(parsed) && parsed >= 0) {
        amount = parsed;
      }
    }

    // Calcola nuove date e orari se modificati
    let newStartDate = selectedEvent.start;
    let newEndDate = selectedEvent.end;

    if (editDate && editStartTime) {
      const [hours, minutes] = editStartTime.split(":").map(Number);
      newStartDate = parseDateInput(editDate);
      newStartDate.setHours(hours, minutes, 0, 0);

      const durationHours = parseFloat(editDuration);
      newEndDate = new Date(
        newStartDate.getTime() + durationHours * 60 * 60000
      );
    }

    if (!newStartDate || !newEndDate) {
      alert("Errore: data o ora non valida");
      return;
    }

    const ALLOWED = new Set([
      "booked",
      "confirmed",
      "done",
      "cancelled",
      "not_paid",
    ]);

    const normalizedStatus =
      (editStatus as string) === "no_show"
        ? ("not_paid" as Status)
        : editStatus;

    if (!ALLOWED.has(normalizedStatus)) {
      setError(`STATUS ILLEGALE: ${String(normalizedStatus)}`);
      return;
    }

    // Validazione: se fatturato, payment_method è obbligatorio SOLO se bloccante.
    let effectiveEditPaymentMethod = editPaymentMethod;
    if (editPriceType === "invoiced" && !editPaymentMethod) {
      const required = practiceSettings?.payment_method_required ?? true;
      if (required) {
        alert("Seleziona il metodo di pagamento (Contanti, POS o Bonifico).");
        return;
      }
      effectiveEditPaymentMethod = (practiceSettings?.default_payment_method ??
        "pos") as "cash" | "pos" | "bank_transfer";
    }

    // Creiamo l'oggetto di aggiornamento.
    // is_paid segue lo stato: done => pagato, altrimenti non pagato.
    // paid_at deve essere coerente con is_paid (CHECK appointments_paid_consistency, mig. 010).
    const willBePaid = normalizedStatus === "done";
    const updateData = {
      status: normalizedStatus,
      is_paid: willBePaid,
      paid_at: willBePaid ? new Date().toISOString() : null,
      calendar_note: editNote,
      amount: amount,
      treatment_type: editTreatmentType,
      price_type: editPriceType,
      payment_method:
        editPriceType === "invoiced" ? effectiveEditPaymentMethod : null,
      start_at: newStartDate.toISOString(),
      end_at: newEndDate.toISOString(),
      // Multi-op (mig. 019/022, Fase 4d.1)
      operator_id: editForm.editOperatorId ?? null,
      // Multi-stanza (mig. 019, Fase Stanze)
      room_id: editForm.editRoomId ?? null,
    };

    // Rimuoviamo le proprietà undefined/null
    // ECCEZIONE: payment_method, paid_at, operator_id, room_id devono poter
    // essere settati a null (riassegnare a "non assegnato/nessuna stanza" è
    // valido, idem per gli altri come da mig. 010 e check constraint).
    const cleanedData = Object.fromEntries(
      Object.entries(updateData).filter(([k, v]) => {
        if (k === "payment_method" || k === "paid_at" || k === "operator_id" || k === "room_id") return v !== undefined; // null è valido
        return v !== null && v !== undefined;
      })
    );

    try {
      const { error } = await supabase
        .from("appointments")
        .update(cleanedData)
        .eq("id", selectedEvent.id);

      if (error) {
        setError(`Errore salvataggio: ${translateError(error)}`);
        return;
      }

      setSelectedEvent(null);
      const startOfWeek = startOfISOWeekMonday(currentDate);
      const endOfWeek = addDays(startOfWeek, 7);
      await loadAppointments(startOfWeek, endOfWeek);
    } catch (err: unknown) {
      setError(`Errore salvataggio: ${translateError(err)}`);
    }
  }, [
    selectedEvent,
    editForm,
    practiceSettings,
    currentDate,
    loadAppointments,
    setError,
    setSelectedEvent,
  ]);

  /* ─── deleteAppointment ─── */
  const deleteAppointment = useCallback(async () => {
    if (!selectedEvent) return;

    const ok = window.confirm(
      "Vuoi eliminare definitivamente questo appuntamento?"
    );
    if (!ok) return;

    setError("");

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", selectedEvent.id);

    if (error) {
      setError(`Errore eliminazione: ${translateError(error)}`);
      return;
    }

    setSelectedEvent(null);
    const startOfWeek = startOfISOWeekMonday(currentDate);
    const endOfWeek = addDays(startOfWeek, 7);
    await loadAppointments(startOfWeek, endOfWeek);
  }, [
    selectedEvent,
    currentDate,
    loadAppointments,
    setError,
    setSelectedEvent,
  ]);

  return {
    createAppointment,
    saveAppointment,
    deleteAppointment,
    toggleDoneQuick,
    togglePaidQuick,
    handleUpdatePayment,
    bulkMarkPaid,
    createQuickPatient,
    createQuickPatientCore,
  };
}
