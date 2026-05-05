// ═══════════════════════════════════════════════════════════════════════
// src/hooks/calendar/useGroupOperations.ts
// ═══════════════════════════════════════════════════════════════════════
// Cos'è:
//   Hook che gestisce tutte le operazioni sugli appuntamenti di gruppo
//   (mig. 014): aggiunta/rimozione/aggiornamento partecipanti, modifica
//   gruppo, eliminazione, duplicazione, e la lista dei "partecipanti
//   iniziali" durante la creazione di un nuovo gruppo.
//   Estratto da calendar/page.tsx (refactor B3.5).
//
// Dove si usa:
//   In app/(protected)/calendar/page.tsx, dopo useCalendarEvents.
//   `initialParticipants` viene poi consumato anche da
//   useAppointmentMutations (hook 7) durante la INSERT del nuovo gruppo.
//
// Cosa fa:
//   - initialParticipants + addInitialParticipant + removeInitialParticipant:
//     buffer dei pazienti selezionati nel modale "Crea gruppo" prima
//     dell'INSERT (sono inseriti tutti insieme dopo l'INSERT del padre)
//   - reloadGroupEvent(appointmentId): ricarica un singolo evento gruppo
//     con i partecipanti aggiornati e fa merge in events[]
//   - onAddParticipant: INSERT in appointment_participants
//   - onUpdateParticipant: UPDATE con coerenza paid_at <-> payment_status
//     e checked_in_at <-> attendance_status
//   - onRemoveParticipant: DELETE
//   - onMarkAllPaid: UPDATE bulk dei partecipanti unpaid → paid (cash)
//   - onUpdateGroup: UPDATE titolo/max/prezzo del gruppo
//   - onDeleteGroup: DELETE (CASCADE rimuove anche i partecipanti)
//   - onDuplicateGroup: duplica il gruppo a una nuova data, opzionalmente
//     con i partecipanti azzerati (status seduta ricomincia da zero)
//
// Dipendenze:
//   - events, setEvents (events): per find sorgente + merge dopo reload
//   - currentStudio, currentStudioId, practiceSettings (bootstrap): per
//     INSERT del gruppo duplicato (tenancy + default status)
//   - currentDate, loadAppointments (events): per refresh dopo duplica
//   - setSelectedEvent (mutations): per chiudere il modal dopo
//     delete/duplicate del gruppo
//
// Note:
//   - Zero modifiche di comportamento rispetto al codice originale.
//   - L'helper coerenza paid_at <-> payment_status replica il vincolo
//     di mig. 010 (appointments_paid_consistency) anche per i
//     partecipanti dei gruppi.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { supabase } from "@/src/lib/supabaseClient";
import {
  addDays,
  startOfISOWeekMonday,
  type AppointmentParticipant,
  type CalendarEvent,
  type PracticeSettings,
} from "@/app/(protected)/calendar/utils";
import type { Studio } from "@/src/contexts/StudioContext";

/* ─── tipi ─── */

export type InitialParticipant = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone?: string | null;
};

export interface UseGroupOperationsOptions {
  events: CalendarEvent[];
  setEvents: Dispatch<SetStateAction<CalendarEvent[]>>;
  currentStudio: Studio | null;
  currentStudioId: string | null;
  practiceSettings: PracticeSettings | null;
  currentDate: Date;
  loadAppointments: (
    startDate: Date,
    endDate: Date,
    retryCount?: number
  ) => Promise<void>;
  setSelectedEvent: Dispatch<SetStateAction<any>>;
}

export interface UseGroupOperationsReturn {
  // Buffer "creazione gruppo"
  initialParticipants: InitialParticipant[];
  setInitialParticipants: Dispatch<SetStateAction<InitialParticipant[]>>;
  addInitialParticipant: (p: InitialParticipant) => void;
  removeInitialParticipant: (patientId: string) => void;

  // Operazioni su gruppo esistente
  reloadGroupEvent: (appointmentId: string) => Promise<void>;
  onAddParticipant: (
    appointmentId: string,
    patientId: string,
    price: number
  ) => Promise<void>;
  onUpdateParticipant: (
    participantId: string,
    patch: Partial<
      Pick<
        AppointmentParticipant,
        | "payment_status"
        | "payment_method"
        | "attendance_status"
        | "price"
        | "participant_notes"
      >
    >
  ) => Promise<void>;
  onRemoveParticipant: (participantId: string) => Promise<void>;
  onMarkAllPaid: (appointmentId: string) => Promise<void>;
  onUpdateGroup: (
    appointmentId: string,
    patch: Partial<
      Pick<
        CalendarEvent,
        "group_title" | "group_max_participants" | "group_price_per_person"
      >
    >
  ) => Promise<void>;
  onDeleteGroup: (appointmentId: string) => Promise<void>;
  onDuplicateGroup: (
    sourceAppointmentId: string,
    newStart: Date,
    withParticipants: boolean
  ) => Promise<void>;
}

/* ─── hook ─── */

export function useGroupOperations(
  options: UseGroupOperationsOptions
): UseGroupOperationsReturn {
  const {
    events,
    setEvents,
    currentStudio,
    currentStudioId,
    practiceSettings,
    currentDate,
    loadAppointments,
    setSelectedEvent,
  } = options;

  /* ─── Buffer "creazione gruppo" ─── */
  // Lista dei pazienti selezionati DURANTE la creazione del gruppo.
  // Vengono inseriti tutti insieme dopo l'INSERT del padre.
  const [initialParticipants, setInitialParticipants] = useState<
    InitialParticipant[]
  >([]);

  const addInitialParticipant = useCallback(
    (p: InitialParticipant) => {
      setInitialParticipants((prev) =>
        prev.find((x) => x.id === p.id) ? prev : [...prev, p]
      );
    },
    []
  );

  const removeInitialParticipant = useCallback((patientId: string) => {
    setInitialParticipants((prev) => prev.filter((p) => p.id !== patientId));
  }, []);

  /* ─── reloadGroupEvent ─── */
  /** Ricarica un singolo evento gruppo (con partecipanti aggiornati) e aggiorna events[] */
  const reloadGroupEvent = useCallback(
    async (appointmentId: string) => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          `
        appointment_participants (
          id, appointment_id, patient_id, price, payment_status, payment_method, paid_at,
          attendance_status, checked_in_at, participant_notes, created_at,
          patients:patient_id ( first_name, last_name, phone )
        ),
        is_group, group_title, group_max_participants, group_price_per_person
      `
        )
        .eq("id", appointmentId)
        .single();
      if (error || !data) return;

      setEvents((prev) =>
        prev.map((ev) => {
          if (ev.id !== appointmentId) return ev;
          const newParticipants: AppointmentParticipant[] = (
            data.appointment_participants ?? []
          ).map(
            (p: {
              id: string;
              appointment_id: string;
              patient_id: string;
              price: number | null;
              payment_status?: string | null;
              payment_method?: string | null;
              paid_at?: string | null;
              attendance_status?: string | null;
              checked_in_at?: string | null;
              participant_notes?: string | null;
              created_at?: string;
              patients?:
                | Array<{
                    first_name?: string;
                    last_name?: string;
                    phone?: string;
                  }>
                | { first_name?: string; last_name?: string; phone?: string }
                | null;
            }) => {
              const pp = Array.isArray(p.patients) ? p.patients[0] : p.patients;
              return {
                id: p.id,
                appointment_id: p.appointment_id,
                patient_id: p.patient_id,
                price: Number(p.price ?? 0),
                payment_status: (p.payment_status === "paid"
                  ? "paid"
                  : "unpaid") as "paid" | "unpaid",
                payment_method: (p.payment_method ?? null) as
                  | "cash"
                  | "pos"
                  | "bank_transfer"
                  | null,
                paid_at: p.paid_at ?? null,
                attendance_status: (p.attendance_status === "present" ||
                p.attendance_status === "absent"
                  ? p.attendance_status
                  : "pending") as "pending" | "present" | "absent",
                checked_in_at: p.checked_in_at ?? null,
                participant_notes: p.participant_notes ?? null,
                created_at: p.created_at ?? new Date().toISOString(),
                patient_first_name: pp?.first_name ?? null,
                patient_last_name: pp?.last_name ?? null,
                patient_phone: pp?.phone ?? null,
              };
            }
          );
          return {
            ...ev,
            is_group: data.is_group ?? ev.is_group,
            group_title: data.group_title ?? ev.group_title,
            group_max_participants:
              data.group_max_participants ?? ev.group_max_participants,
            group_price_per_person:
              data.group_price_per_person ?? ev.group_price_per_person,
            participants: newParticipants,
          };
        })
      );
    },
    [setEvents]
  );

  /* ─── onAddParticipant ─── */
  /** Aggiungi un paziente al gruppo (creando una riga in appointment_participants) */
  const onAddParticipant = useCallback(
    async (appointmentId: string, patientId: string, price: number) => {
      const { error } = await supabase
        .from("appointment_participants")
        .insert({
          appointment_id: appointmentId,
          patient_id: patientId,
          price,
          payment_status: "unpaid",
          attendance_status: "pending",
        });
      if (error) {
        alert("Errore aggiunta partecipante: " + error.message);
        return;
      }
      await reloadGroupEvent(appointmentId);
    },
    [reloadGroupEvent]
  );

  /* ─── onUpdateParticipant ─── */
  /** Aggiorna campi del partecipante */
  const onUpdateParticipant = useCallback(
    async (
      participantId: string,
      patch: Partial<
        Pick<
          AppointmentParticipant,
          | "payment_status"
          | "payment_method"
          | "attendance_status"
          | "price"
          | "participant_notes"
        >
      >
    ) => {
      // Coerenza paid_at <-> payment_status (vincolo DB)
      const dbPatch: Record<string, unknown> = { ...patch };
      if (patch.payment_status === "paid") {
        dbPatch.paid_at = new Date().toISOString();
      } else if (patch.payment_status === "unpaid") {
        dbPatch.paid_at = null;
        dbPatch.payment_method = null;
      }
      if (patch.attendance_status === "present") {
        dbPatch.checked_in_at = new Date().toISOString();
      } else if (
        patch.attendance_status === "pending" ||
        patch.attendance_status === "absent"
      ) {
        dbPatch.checked_in_at = null;
      }

      // Recupero appointment_id (serve per ricaricare l'evento dopo update)
      const { data: pRow } = await supabase
        .from("appointment_participants")
        .select("appointment_id")
        .eq("id", participantId)
        .single();
      const apptId = pRow?.appointment_id;

      const { error } = await supabase
        .from("appointment_participants")
        .update(dbPatch)
        .eq("id", participantId);
      if (error) {
        alert("Errore aggiornamento partecipante: " + error.message);
        return;
      }
      if (apptId) await reloadGroupEvent(apptId);
    },
    [reloadGroupEvent]
  );

  /* ─── onRemoveParticipant ─── */
  /** Rimuovi un paziente dal gruppo */
  const onRemoveParticipant = useCallback(
    async (participantId: string) => {
      const { data: pRow } = await supabase
        .from("appointment_participants")
        .select("appointment_id")
        .eq("id", participantId)
        .single();
      const apptId = pRow?.appointment_id;

      const { error } = await supabase
        .from("appointment_participants")
        .delete()
        .eq("id", participantId);
      if (error) {
        alert("Errore rimozione partecipante: " + error.message);
        return;
      }
      if (apptId) await reloadGroupEvent(apptId);
    },
    [reloadGroupEvent]
  );

  /* ─── onMarkAllPaid ─── */
  /** Segna tutti i partecipanti come pagati (bulk) */
  const onMarkAllPaid = useCallback(
    async (appointmentId: string) => {
      const nowISO = new Date().toISOString();
      const { error } = await supabase
        .from("appointment_participants")
        .update({
          payment_status: "paid",
          paid_at: nowISO,
          payment_method: "cash",
        })
        .eq("appointment_id", appointmentId)
        .eq("payment_status", "unpaid");
      if (error) {
        alert("Errore aggiornamento pagamenti: " + error.message);
        return;
      }
      await reloadGroupEvent(appointmentId);
    },
    [reloadGroupEvent]
  );

  /* ─── onUpdateGroup ─── */
  /** Modifica titolo/max/prezzo del gruppo */
  const onUpdateGroup = useCallback(
    async (
      appointmentId: string,
      patch: Partial<
        Pick<
          CalendarEvent,
          "group_title" | "group_max_participants" | "group_price_per_person"
        >
      >
    ) => {
      const dbPatch: Record<string, unknown> = {};
      if (patch.group_title !== undefined)
        dbPatch.group_title = patch.group_title;
      if (patch.group_max_participants !== undefined)
        dbPatch.group_max_participants = patch.group_max_participants;
      if (patch.group_price_per_person !== undefined)
        dbPatch.group_price_per_person = patch.group_price_per_person;

      const { error } = await supabase
        .from("appointments")
        .update(dbPatch)
        .eq("id", appointmentId);
      if (error) {
        alert("Errore aggiornamento gruppo: " + error.message);
        return;
      }
      await reloadGroupEvent(appointmentId);
    },
    [reloadGroupEvent]
  );

  /* ─── onDeleteGroup ─── */
  /** Elimina un appuntamento di gruppo (CASCADE rimuove anche i partecipanti) */
  const onDeleteGroup = useCallback(
    async (appointmentId: string) => {
      const { error } = await supabase
        .from("appointments")
        .delete()
        .eq("id", appointmentId);
      if (error) {
        alert("Errore eliminazione gruppo: " + error.message);
        return;
      }
      setEvents((prev) => prev.filter((e) => e.id !== appointmentId));
      setSelectedEvent(null);
    },
    [setEvents, setSelectedEvent]
  );

  /* ─── onDuplicateGroup ─── */
  /**
   * Step 6.2: duplica un gruppo esistente alla nuova data, opzionalmente
   * con i partecipanti. I partecipanti duplicati hanno:
   * - stesso patient_id e stesso price (sono dati "stampino")
   * - payment_status='unpaid', attendance_status='pending', participant_notes=null
   *   (sono stato della seduta, ricominciano da zero)
   */
  const onDuplicateGroup = useCallback(
    async (
      sourceAppointmentId: string,
      newStart: Date,
      withParticipants: boolean
    ) => {
      // 1) Trova il gruppo sorgente nello state events
      const source = events.find((e) => e.id === sourceAppointmentId);
      if (!source) {
        alert("Gruppo sorgente non trovato. Ricarica la pagina e riprova.");
        return;
      }
      if (!source.is_group) {
        alert("L'appuntamento sorgente non è un gruppo.");
        return;
      }

      // 2) Calcola end_at usando la stessa durata dell'originale
      const srcStart = new Date(source.start);
      const srcEnd = new Date(source.end);
      const durationMs = srcEnd.getTime() - srcStart.getTime();
      const newEnd = new Date(newStart.getTime() + durationMs);

      // 3) Recupera userId per owner_id (se non già nel session)
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        alert("Sessione scaduta. Effettua di nuovo il login.");
        return;
      }
      const studioId = currentStudioId;
      if (!studioId) {
        alert("Studio non disponibile. Ricarica la pagina.");
        return;
      }

      // 4) INSERT del nuovo gruppo (mantiene titolo/max/prezzo dell'originale)
      const { data: created, error: createErr } = await supabase
        .from("appointments")
        .insert({
          patient_id: null,
          start_at: newStart.toISOString(),
          end_at: newEnd.toISOString(),
          status: practiceSettings?.default_appointment_status ?? "confirmed",
          location: source.location ?? "studio",
          clinic_site: source.clinic_site ?? (currentStudio?.name || "Studio"),
          domicile_address: source.domicile_address ?? null,
          treatment_type: null,
          price_type: null,
          payment_method: null,
          amount: null,
          owner_id: userId,
          studio_id: studioId,
          is_group: true,
          group_title: source.group_title,
          group_max_participants: source.group_max_participants,
          group_price_per_person: source.group_price_per_person,
        })
        .select()
        .single();
      if (createErr || !created) {
        alert(
          "Errore duplicazione gruppo: " +
            (createErr?.message || "errore sconosciuto")
        );
        return;
      }

      // 5) Se richiesto, INSERT batch dei partecipanti (azzerati per stato seduta)
      if (
        withParticipants &&
        source.participants &&
        source.participants.length > 0
      ) {
        const partRows = source.participants.map((p) => ({
          appointment_id: created.id,
          patient_id: p.patient_id,
          price: p.price,
          payment_status: "unpaid",
          attendance_status: "pending",
          participant_notes: null,
        }));
        const { error: partErr } = await supabase
          .from("appointment_participants")
          .insert(partRows);
        if (partErr) {
          console.error("[duplicate-group] errore partecipanti:", partErr);
          alert(
            `Gruppo duplicato, ma errore nell'aggiungere i partecipanti: ${partErr.message}\n` +
              `Puoi aggiungerli manualmente dalla scheda del nuovo gruppo.`
          );
        }
      }

      // 6) Ricarica appuntamenti per vedere il nuovo gruppo nel calendar
      const startOfWeek = startOfISOWeekMonday(currentDate);
      const endOfWeek = addDays(startOfWeek, 7);
      await loadAppointments(startOfWeek, endOfWeek);

      // 7) Chiudi il modal corrente (sorgente) e mostra messaggio
      setSelectedEvent(null);
      const niceDate = newStart.toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      const niceTime = newStart.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      });
      alert(`✓ Gruppo duplicato per ${niceDate} alle ${niceTime}.`);
    },
    [
      events,
      currentStudioId,
      currentStudio,
      practiceSettings,
      currentDate,
      loadAppointments,
      setSelectedEvent,
    ]
  );

  return {
    // Buffer creazione
    initialParticipants,
    setInitialParticipants,
    addInitialParticipant,
    removeInitialParticipant,

    // Operazioni
    reloadGroupEvent,
    onAddParticipant,
    onUpdateParticipant,
    onRemoveParticipant,
    onMarkAllPaid,
    onUpdateGroup,
    onDeleteGroup,
    onDuplicateGroup,
  };
}
