// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/modals/CreateAppointmentModal.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Modale "Nuovo appuntamento" / "Duplica appuntamento". Sezioni:
//
//   1. Header con titolo, info orario, warning overlap (se presente)
//   2. Riga 1: Luogo (Studio/Domicilio) + Sede o indirizzo + Giorno
//   3. Riga 2: Orario (select) + Durata (1h / 1.5h / 2h)
//   4. Sezione "Tipologia e Prezzo": trattamento, prezzo standard
//      (fatturato/contanti), checkbox prezzo personalizzato + input
//   5. Sezione "Appuntamento ricorrente": checkbox + giorni settimana +
//      frequenza + data finale + preview count
//   6. Sezione paziente: search input + bottone "+ Nuovo Paziente Rapido",
//      form quick patient (nome/cognome/telefono), lista risultati
//   7. Footer: Annulla + Crea (apre WhatsAppConfirm)
//
// In modalità duplica (duplicateMode=true), il paziente è già selezionato
// e si mostra solo la pill (no search), no quick patient.
//
// Tutti gli stati restano nel page.tsx — questo componente è "stupido":
// riceve dati e chiama callback. È molto verboso (~30 props) ma chiaro.
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useState, useEffect, useMemo } from "react";
import {
  THEME, ALL_TREATMENTS, DEFAULT_CLINIC_SITE,
  fmtTime, parseDateInput, toDateInputValue, generateRecurringStarts,
  type LocationType, type TreatmentType, type PatientLite,
  type PracticeSettings,
} from "../../utils";
import QuickPatientForm from "../QuickPatientForm";
import PackagePickerSection from "@/src/components/packages/PackagePickerSection";

export type CreateAppointmentModalProps = {
  // ─── Generale ─────────────────────────────────────────────
  duplicateMode: boolean;
  onClose: () => void;
  showAllUpcoming: boolean;

  // Apre il dialog WA Confirm (passa al flusso successivo)
  onRequestCreate: () => void;

  // ─── Orario ───────────────────────────────────────────────
  createStartISO: string;
  createEndISO: string;
  selectedDuration: "0.5" | "0.75" | "1" | "1.5" | "2";
  setSelectedDuration: (d: "0.5" | "0.75" | "1" | "1.5" | "2") => void;
  selectedStartTime: string;
  setSelectedStartTime: (s: string) => void;
  setCreateStartISO: (iso: string) => void;
  setCreateEndISO: (iso: string) => void;
  /** Slot disponibili per il selettore orario */
  timeSelectSlots: string[];

  // Modalità duplica: usa duplicateDate/Time invece dei generali
  duplicateDate: string;
  duplicateTime: string;
  setDuplicateDate: (d: string) => void;
  setDuplicateTime: (t: string) => void;
  updateDuplicateDateTime: (newDate: string, newTime: string) => void;

  // ─── Overlap warning ──────────────────────────────────────
  overlapWarning: string | null;
  practiceSettings: PracticeSettings | null;

  // ─── Luogo ────────────────────────────────────────────────
  createLocation: LocationType;
  setCreateLocation: (l: LocationType) => void;
  createClinicSite: string;
  setCreateClinicSite: (s: string) => void;
  createDomicileAddress: string;
  setCreateDomicileAddress: (s: string) => void;

  // ─── Multi-sede (mig. 014, fase 2) ────────────────────────
  /** Sedi disponibili (vuoto se multi-sede non attivo o non ancora migrato) */
  studioLocations?: Array<{ id: string; name: string; address: string | null; is_primary: boolean; border_color: string | null }>;
  /** ID sede selezionata; null = sede principale (o nessuna sede) */
  createLocationId?: string | null;
  setCreateLocationId?: (id: string | null) => void;
  /** Toggle multi_location_enabled — se false, il dropdown non si vede */
  multiLocationEnabled?: boolean;

  // ─── Trattamento e prezzo ─────────────────────────────────
  treatmentType: TreatmentType;
  setTreatmentType: (t: TreatmentType) => void;
  priceType: "invoiced" | "cash";
  setPriceType: (p: "invoiced" | "cash") => void;
  /** Metodo pagamento (solo se priceType === "invoiced"). Obbligatorio per fatturati. */
  paymentMethod: "cash" | "pos" | "bank_transfer" | null;
  setPaymentMethod: (m: "cash" | "pos" | "bank_transfer" | null) => void;
  useCustomPrice: boolean;
  setUseCustomPrice: (v: boolean) => void;
  customAmount: string;
  setCustomAmount: (s: string) => void;
  computedDefaultAmount: number;
  /** Default amount per (treatment, price) */
  getDefaultAmount: (t: TreatmentType, p: "invoiced" | "cash") => number;

  // ─── Ricorrente ───────────────────────────────────────────
  isRecurring: boolean;
  setIsRecurring: (v: boolean) => void;
  recurringDays: number[];
  toggleRecurringDay: (dow: number) => void;
  recurringFrequency: 1 | 2 | 3 | 4;
  setRecurringFrequency: (f: 1 | 2 | 3 | 4) => void;
  recurringUntil: string;
  setRecurringUntil: (s: string) => void;
  /** Etichette giorni della settimana (LUN..SAB) */
  dayLabels: { dow: number; label: string }[];

  // ─── Paziente ─────────────────────────────────────────────
  q: string;
  setQ: (s: string) => void;
  searching: boolean;
  patientResults: PatientLite[];
  selectedPatient: PatientLite | null;
  setSelectedPatient: (p: PatientLite | null) => void;
  loadLastPatientSettings: (patientId: string) => void;

  // Quick patient
  quickPatientOpen: boolean;
  setQuickPatientOpen: (v: boolean) => void;
  quickPatientFirstName: string;
  setQuickPatientFirstName: (s: string) => void;
  quickPatientLastName: string;
  setQuickPatientLastName: (s: string) => void;
  quickPatientPhone: string;
  setQuickPatientPhone: (s: string) => void;
  creatingQuickPatient: boolean;
  createQuickPatient: () => void;

  // ─── Gruppo (mig. 014) ────────────────────────────────────
  isGroupAppointment: boolean;
  setIsGroupAppointment: (v: boolean) => void;
  groupTitle: string;
  setGroupTitle: (s: string) => void;
  groupMaxParticipants: string;
  setGroupMaxParticipants: (s: string) => void;
  groupPricePerPerson: string;
  setGroupPricePerPerson: (s: string) => void;
  groupRecurringMode: "closed" | "open";
  setGroupRecurringMode: (m: "closed" | "open") => void;

  // ─── Partecipanti iniziali (mig. 014, step 6.1) ───────────
  /** Lista dei pazienti già selezionati come partecipanti iniziali */
  initialParticipants: Array<{ id: string; first_name: string | null; last_name: string | null; phone?: string | null }>;
  /** Aggiungi un paziente alla lista iniziale */
  addInitialParticipant: (patient: { id: string; first_name: string | null; last_name: string | null; phone?: string | null }) => void;
  /** Rimuovi un paziente dalla lista iniziale */
  removeInitialParticipant: (patientId: string) => void;
  /** Funzione di ricerca pazienti per il campo search */
  searchPatientsForGroup: (query: string) => Promise<Array<{ id: string; first_name: string | null; last_name: string | null; phone?: string | null }>>;
  /** Crea paziente rapido per gruppo (mig. 015). Restituisce il paziente creato o null in caso di errore. */
  createQuickPatientForGroup?: (payload: { first_name: string; last_name: string; phone: string | null }) => Promise<{ id: string; first_name: string | null; last_name: string | null; phone?: string | null } | null>;

  // ─── Pacchetti sedute (mig. 014_packages) ─────────────────
  /** Pacchetto sedute selezionato per scalare la seduta. null = pagamento singolo */
  selectedPackageId: string | null;
  setSelectedPackageId: (id: string | null) => void;

  // ─── Multi-operatore (mig. 019/022, Fase 4d) ──────────────
  /** Toggle multi_operator_enabled — se false, il selettore non si vede */
  multiOperatorEnabled?: boolean;
  /** Membri attivi del team (richiesto se multiOperatorEnabled = true) */
  members?: Array<{
    user_id: string | null;
    invite_token?: string | null;
    display_name: string | null;
    display_color?: string | null;
    signature_short?: string | null;
  }>;
  /** ID operatore selezionato (UUID auth.users) o null = non assegnato */
  createOperatorId?: string | null;
  setCreateOperatorId?: (id: string | null) => void;
  /**
   * Eventi correnti caricati nel calendario, usati per detect dei conflitti
   * di operatore. Quando l'utente cambia operatore o orario, controlliamo se
   * c'è già un appuntamento per quell'operatore in quell'intervallo.
   */
  existingEvents?: Array<{
    id: string;
    start: Date;
    end: Date;
    operator_id?: string | null;
    status: string;
    patient_name: string;
  }>;

  // ─── Submit ───────────────────────────────────────────────
  creating: boolean;
};

export default function CreateAppointmentModal(props: CreateAppointmentModalProps) {
  const {
    duplicateMode, onClose, showAllUpcoming, onRequestCreate,
    createStartISO, createEndISO, selectedDuration, setSelectedDuration,
    selectedStartTime, setSelectedStartTime,
    setCreateStartISO, setCreateEndISO, timeSelectSlots,
    duplicateDate, duplicateTime, setDuplicateDate, setDuplicateTime, updateDuplicateDateTime,
    overlapWarning, practiceSettings,
    createLocation, setCreateLocation,
    createClinicSite, setCreateClinicSite,
    createDomicileAddress, setCreateDomicileAddress,
    studioLocations, createLocationId, setCreateLocationId, multiLocationEnabled,
    treatmentType, setTreatmentType,
    priceType, setPriceType,
    paymentMethod, setPaymentMethod,
    useCustomPrice, setUseCustomPrice,
    customAmount, setCustomAmount,
    computedDefaultAmount, getDefaultAmount,
    isRecurring, setIsRecurring,
    recurringDays, toggleRecurringDay,
    recurringFrequency, setRecurringFrequency,
    recurringUntil, setRecurringUntil, dayLabels,
    q, setQ, searching, patientResults,
    selectedPatient, setSelectedPatient, loadLastPatientSettings,
    quickPatientOpen, setQuickPatientOpen,
    quickPatientFirstName, setQuickPatientFirstName,
    quickPatientLastName, setQuickPatientLastName,
    quickPatientPhone, setQuickPatientPhone,
    creatingQuickPatient, createQuickPatient,
    isGroupAppointment, setIsGroupAppointment,
    groupTitle, setGroupTitle,
    groupMaxParticipants, setGroupMaxParticipants,
    groupPricePerPerson, setGroupPricePerPerson,
    groupRecurringMode, setGroupRecurringMode,
    initialParticipants, addInitialParticipant, removeInitialParticipant,
    searchPatientsForGroup,
    createQuickPatientForGroup,
    selectedPackageId, setSelectedPackageId,
    multiOperatorEnabled,
    members,
    createOperatorId,
    setCreateOperatorId,
    existingEvents,
    creating,
  } = props;

  // ─── Helpers ────────────────────────────────────────────────────
  const overlapMode = practiceSettings?.overlap_mode ?? "warn";
  const isBlock = overlapMode === "block";
  const isVisualOverlap = overlapMode === "visual";

  // ─── Multi-operatore: conflict detection (Fase 4d, mig. 022) ─────
  // Quando lo studio è multi-op e c'è un operatore selezionato, calcoliamo
  // se l'orario di inizio/fine si sovrappone a un appuntamento esistente
  // per lo stesso operatore. Mostriamo un warning sopra al footer del modale.
  const operatorConflict = useMemo(() => {
    if (!multiOperatorEnabled) return null;
    if (!createOperatorId) return null;
    if (!existingEvents || existingEvents.length === 0) return null;

    // Calcola orario corrente (rispetta duplicateMode)
    const startISO = duplicateMode && duplicateDate && duplicateTime
      ? new Date(`${duplicateDate}T${duplicateTime}:00`).toISOString()
      : createStartISO;
    const endISO = createEndISO;
    if (!startISO || !endISO) return null;

    const start = new Date(startISO).getTime();
    const end = new Date(endISO).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return null;

    // Cerca primo conflitto
    for (const ev of existingEvents) {
      if (ev.operator_id !== createOperatorId) continue;
      if (ev.status === "cancelled") continue;
      const evStart = ev.start.getTime();
      const evEnd = ev.end.getTime();
      // Sovrapposizione classica: NOT (evEnd <= start || evStart >= end)
      if (!(evEnd <= start || evStart >= end)) {
        return {
          patient: ev.patient_name,
          time: `${ev.start.getHours().toString().padStart(2, "0")}:${ev.start.getMinutes().toString().padStart(2, "0")}`,
        };
      }
    }
    return null;
  }, [multiOperatorEnabled, createOperatorId, existingEvents, createStartISO, createEndISO, duplicateMode, duplicateDate, duplicateTime]);

  // ─── Search partecipanti iniziali (mig. 014, step 6.1) ────────
  const [participantsSearchQ, setParticipantsSearchQ] = useState("");
  const [participantsSearchResults, setParticipantsSearchResults] = useState<
    Array<{ id: string; first_name: string | null; last_name: string | null; phone?: string | null }>
  >([]);
  // Quick patient inside group flow (mig. 015)
  const [quickGroupOpen, setQuickGroupOpen] = useState(false);
  const [quickGroupBusy, setQuickGroupBusy] = useState(false);

  const alreadyAddedIds = useMemo(
    () => new Set(initialParticipants.map(p => p.id)),
    [initialParticipants]
  );

  // Debounced search (200ms)
  useEffect(() => {
    if (!isGroupAppointment) {
      setParticipantsSearchResults([]);
      return;
    }
    const q = participantsSearchQ.trim();
    if (!q) {
      setParticipantsSearchResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await searchPatientsForGroup(q);
        if (!cancelled) {
          setParticipantsSearchResults(res.filter(p => !alreadyAddedIds.has(p.id)).slice(0, 8));
        }
      } catch {
        if (!cancelled) setParticipantsSearchResults([]);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [participantsSearchQ, alreadyAddedIds, isGroupAppointment, searchPatientsForGroup]);

  // Per i gruppi non serve un paziente selezionato; serve invece il titolo.
  // Inoltre se ci sono partecipanti iniziali, non devono superare il max.
  const groupValid = isGroupAppointment
    ? !!groupTitle.trim()
      && parseInt(groupMaxParticipants, 10) >= 2
      && initialParticipants.length <= parseInt(groupMaxParticipants, 10)
    : true;
  const submitDisabled = creating
    || (!isGroupAppointment && !selectedPatient)
    || (isGroupAppointment && !groupValid)
    || (isBlock && !!overlapWarning);

  // Cambio data manuale (no duplicate)
  const handleManualDateChange = (newDateStr: string) => {
    const date = parseDateInput(newDateStr);
    const [hours, minutes] = selectedStartTime.split(":").map(Number);
    date.setHours(hours, minutes, 0, 0);
    const durationHours = parseFloat(selectedDuration);
    const endDate = new Date(date.getTime() + durationHours * 60 * 60000);
    setCreateStartISO(date.toISOString());
    setCreateEndISO(endDate.toISOString());
  };

  return (
    <div
      className={`no-print sidebar-scroll ${showAllUpcoming ? "show-scrollbar" : ""}`}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(30,64,175,0.35)",
        zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 780,
          maxWidth: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          background: THEME.panelBg,
          color: THEME.text,
          borderRadius: 16,
          border: `2px solid ${THEME.border}`,
          boxShadow: "0 24px 64px rgba(30,64,175,0.2)",
          padding: "32px 28px",
        }}
      >
        {/* ─── Header ──────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: THEME.blue, letterSpacing: -0.3 }}>
              {duplicateMode ? "Duplica appuntamento" : "Nuovo appuntamento"}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: THEME.muted, fontWeight: 600, letterSpacing: 0.3 }}>
              {createStartISO
                ? `${fmtTime(createStartISO)} → ${fmtTime(createEndISO)} • ${selectedDuration} ora${selectedDuration === "1" ? "" : "e"}`
                : "Seleziona orario"}
            </div>
            {overlapWarning && !isVisualOverlap && (
              <div style={{
                marginTop: 8, padding: "8px 12px", borderRadius: 8,
                background: isBlock ? "rgba(220,38,38,0.08)" : "rgba(245,158,11,0.08)",
                border: `1px solid ${isBlock ? "rgba(220,38,38,0.25)" : "rgba(245,158,11,0.3)"}`,
                color: isBlock ? THEME.red : "#92400e",
                fontSize: 12, fontWeight: 600,
              }}>
                {isBlock ? "⛔" : "⚠️"} {overlapWarning}
                {isBlock && (
                  <div style={{ fontSize: 11, marginTop: 3, fontWeight: 500 }}>
                    Modifica l&apos;orario per procedere.
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            style={{
              width: 42, height: 42, borderRadius: 10,
              border: `2px solid ${THEME.border}`,
              background: THEME.panelSoft,
              color: THEME.blue,
              cursor: "pointer", fontWeight: 800, fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>

        {/* ─── Riga 1: Luogo + Sede/Indirizzo + Giorno ────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
          {/* Luogo */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft }}>
              Luogo
              <select
                value={createLocation}
                onChange={e => setCreateLocation(e.target.value as LocationType)}
                style={{
                  width: "100%", marginTop: 8, padding: 10, borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelBg, color: THEME.text,
                  outline: "none", fontWeight: 600, fontSize: 13,
                }}
              >
                <option value="studio">Studio</option>
                <option value="domicile">Domicilio</option>
              </select>
            </label>
          </div>

          {/* Sede o indirizzo */}
          <div>
            {createLocation === "studio" ? (
              multiLocationEnabled && studioLocations && studioLocations.length > 0 ? (
                // ─ Multi-sede ON: dropdown sedi configurate ─
                <label style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft }}>
                  Sede
                  {(() => {
                    const selectedLoc = studioLocations.find(l => l.id === createLocationId)
                                     ?? studioLocations.find(l => l.is_primary)
                                     ?? studioLocations[0];
                    const borderColor = selectedLoc && !selectedLoc.is_primary && selectedLoc.border_color
                      ? selectedLoc.border_color
                      : THEME.borderSoft;
                    const borderWidth = selectedLoc && !selectedLoc.is_primary ? 2 : 1;
                    return (
                      <>
                        <select
                          value={createLocationId ?? selectedLoc?.id ?? ""}
                          onChange={e => {
                            const id = e.target.value || null;
                            setCreateLocationId?.(id);
                            // Sincronizza anche createClinicSite (campo testuale legacy)
                            // col nome della sede selezionata, così i messaggi WA
                            // continuano a mostrare il label corretto.
                            if (id) {
                              const loc = studioLocations.find(l => l.id === id);
                              if (loc) setCreateClinicSite(loc.name);
                            }
                          }}
                          style={{
                            width: "100%", marginTop: 8, padding: 10, borderRadius: 8,
                            border: `${borderWidth}px solid ${borderColor}`,
                            background: THEME.panelBg, color: THEME.text,
                            outline: "none", fontWeight: 600, fontSize: 13,
                          }}
                        >
                          {studioLocations.map(loc => (
                            <option key={loc.id} value={loc.id}>
                              {loc.name}{loc.is_primary ? " (principale)" : ""}
                            </option>
                          ))}
                        </select>
                        {selectedLoc?.address && (
                          <div style={{
                            marginTop: 4, fontSize: 11,
                            color: selectedLoc.is_primary ? THEME.muted : (selectedLoc.border_color || THEME.muted),
                            fontWeight: 500,
                          }}>
                            📍 {selectedLoc.address}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </label>
              ) : (
                // ─ Multi-sede OFF (o non ancora migrato): input testo libero come prima ─
                <label style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft }}>
                  Sede
                  <input
                    value={createClinicSite}
                    onChange={e => setCreateClinicSite(e.target.value)}
                    placeholder={`Es. ${DEFAULT_CLINIC_SITE}`}
                    style={{
                      width: "100%", marginTop: 8, padding: 10, borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelBg, color: THEME.text,
                      outline: "none", fontWeight: 600, fontSize: 13,
                    }}
                  />
                </label>
              )
            ) : (
              <label style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft }}>
                Indirizzo
                <input
                  value={createDomicileAddress}
                  onChange={e => setCreateDomicileAddress(e.target.value)}
                  placeholder="Via, numero civico, città"
                  style={{
                    width: "100%", marginTop: 8, padding: 10, borderRadius: 8,
                    border: `1px solid ${THEME.borderSoft}`,
                    background: THEME.panelBg, color: THEME.text,
                    outline: "none", fontWeight: 600, fontSize: 13,
                  }}
                />
              </label>
            )}
          </div>

          {/* Giorno */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft }}>
              {duplicateMode ? "Nuovo giorno" : "Giorno"}
              <input
                type="date"
                value={duplicateMode ? duplicateDate : toDateInputValue(new Date(createStartISO))}
                onChange={e => {
                  if (duplicateMode) {
                    setDuplicateDate(e.target.value);
                    updateDuplicateDateTime(e.target.value, duplicateTime);
                  } else {
                    handleManualDateChange(e.target.value);
                  }
                }}
                style={{
                  width: "100%", marginTop: 8, padding: 10, borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelBg, color: THEME.text,
                  outline: "none", fontWeight: 600, fontSize: 13,
                }}
              />
            </label>
          </div>
        </div>

        {/* ─── Riga 2: Orario + Durata ──────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft }}>
              {duplicateMode ? "Nuovo orario" : "Orario"}
              <select
                value={duplicateMode ? duplicateTime : selectedStartTime}
                onChange={e => {
                  if (duplicateMode) {
                    setDuplicateTime(e.target.value);
                    updateDuplicateDateTime(duplicateDate, e.target.value);
                  } else {
                    setSelectedStartTime(e.target.value);
                  }
                }}
                style={{
                  width: "100%", marginTop: 8, padding: 10, borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelBg, color: THEME.text,
                  outline: "none", fontWeight: 600, fontSize: 13,
                }}
              >
                {timeSelectSlots.map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft }}>
              Durata
              <select
                value={selectedDuration}
                onChange={e => {
                  const newDuration = e.target.value as "0.5" | "0.75" | "1" | "1.5" | "2";
                  setSelectedDuration(newDuration);
                  if (duplicateMode && duplicateDate && duplicateTime) {
                    updateDuplicateDateTime(duplicateDate, duplicateTime);
                  }
                }}
                style={{
                  width: "100%", marginTop: 8, padding: 10, borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelBg, color: THEME.text,
                  outline: "none", fontWeight: 600, fontSize: 13,
                }}
              >
                <option value="0.5">30 min</option>
                <option value="0.75">45 min</option>
                <option value="1">1 ora</option>
                <option value="1.5">1.5 ore</option>
                <option value="2">2 ore</option>
              </select>
            </label>
          </div>

          <div></div>
        </div>

        {/* ─── Toggle: Appuntamento di gruppo (mig. 014) ──────────── */}
        {!duplicateMode && (
          <div
            onClick={() => setIsGroupAppointment(!isGroupAppointment)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              marginBottom: 16,
              borderRadius: 8,
              border: `1.5px solid ${isGroupAppointment ? THEME.teal : THEME.border}`,
              background: isGroupAppointment ? `${THEME.teal}10` : THEME.panelSoft,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>👥</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: isGroupAppointment ? THEME.teal : THEME.textSoft }}>
                  Appuntamento di gruppo
                </div>
                <div style={{ fontSize: 11, color: THEME.muted, marginTop: 1 }}>
                  Più pazienti, prezzo per persona (Posturale, Pilates, ecc.)
                </div>
              </div>
            </div>
            {/* Toggle switch */}
            <div
              style={{
                width: 40,
                height: 22,
                borderRadius: 11,
                background: isGroupAppointment ? THEME.teal : THEME.border,
                position: "relative",
                transition: "background 0.2s",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#fff",
                  position: "absolute",
                  top: 2,
                  left: isGroupAppointment ? 20 : 2,
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              />
            </div>
          </div>
        )}

        {/* ─── Form GRUPPO (visibile solo se isGroupAppointment) ─── */}
        {isGroupAppointment && (
          <div style={{ marginBottom: 20, border: `1.5px solid ${THEME.teal}33`, padding: 16, borderRadius: 8, background: `${THEME.teal}08` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: THEME.teal, marginBottom: 4 }}>
              Dati gruppo
            </div>
            <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 14, lineHeight: 1.5 }}>
              💡 Puoi aggiungere i pazienti già qui sotto, oppure dopo dalla scheda del gruppo.
            </div>

            {/* Titolo */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 6 }}>
                Titolo del gruppo
              </div>
              <input
                type="text"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="Es. Posturale di gruppo, Pilates, Ginnastica…"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 7,
                  border: `1.5px solid ${THEME.border}`,
                  fontSize: 13,
                  fontWeight: 500,
                  outline: "none",
                  background: "#fff",
                  color: THEME.text,
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Max + Prezzo per persona */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 6 }}>
                  Max partecipanti
                </div>
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={groupMaxParticipants}
                  onChange={(e) => setGroupMaxParticipants(e.target.value.replace(/[^0-9]/g, ""))}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 7,
                    border: `1.5px solid ${THEME.border}`,
                    fontSize: 13,
                    fontWeight: 600,
                    outline: "none",
                    background: "#fff",
                    color: THEME.text,
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 6 }}>
                  Prezzo per persona
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: THEME.muted }}>€</span>
                  <input
                    type="text"
                    value={groupPricePerPerson}
                    onChange={(e) => {
                      // Accetta solo numeri e punto/virgola
                      const v = e.target.value.replace(/[^0-9.,]/g, "");
                      setGroupPricePerPerson(v);
                    }}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: 7,
                      border: `1.5px solid ${THEME.border}`,
                      fontSize: 13,
                      fontWeight: 600,
                      outline: "none",
                      background: "#fff",
                      color: THEME.text,
                      textAlign: "right",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Anteprima totale potenziale */}
            <div style={{ padding: "8px 12px", background: "#fff", border: `1px solid ${THEME.teal}22`, borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: THEME.muted }}>
                Totale potenziale ({groupMaxParticipants || 0} × {groupPricePerPerson || "0"}€)
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: THEME.teal }}>
                {(() => {
                  const n = parseInt(groupMaxParticipants, 10) || 0;
                  const p = parseFloat((groupPricePerPerson || "0").replace(",", ".")) || 0;
                  return (n * p).toFixed(2);
                })()}€
              </span>
            </div>

            {/* ─── Partecipanti iniziali (step 6.1) ─────────────── */}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${THEME.teal}33` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted }}>
                  Partecipanti iniziali (opzionale)
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  color: initialParticipants.length > (parseInt(groupMaxParticipants, 10) || 0)
                    ? "#dc2626"
                    : THEME.teal,
                }}>
                  {initialParticipants.length}/{parseInt(groupMaxParticipants, 10) || 0} selezionati
                </div>
              </div>

              {/* Quick patient (mig. 015): bottone + form inline.
                  Visibile solo se è disponibile la callback di creazione. */}
              {createQuickPatientForGroup && !quickGroupOpen && (
                <button
                  type="button"
                  onClick={() => setQuickGroupOpen(true)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    marginBottom: 8,
                    borderRadius: 7,
                    border: `1px dashed ${THEME.teal}`,
                    background: "rgba(13,148,136,0.04)",
                    color: THEME.teal,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  + Nuovo paziente rapido
                </button>
              )}

              {createQuickPatientForGroup && quickGroupOpen && (
                <QuickPatientForm
                  busy={quickGroupBusy}
                  compact
                  onCancel={() => setQuickGroupOpen(false)}
                  onSubmit={async (payload) => {
                    setQuickGroupBusy(true);
                    try {
                      const created = await createQuickPatientForGroup(payload);
                      if (created) {
                        addInitialParticipant(created);
                        setQuickGroupOpen(false);
                      }
                    } finally {
                      setQuickGroupBusy(false);
                    }
                  }}
                />
              )}

              {/* Search */}
              <div style={{ position: "relative", marginBottom: 8 }}>
                <input
                  type="text"
                  value={participantsSearchQ}
                  onChange={(e) => setParticipantsSearchQ(e.target.value)}
                  placeholder="🔍 Cerca paziente per cognome o nome…"
                  style={{
                    width: "100%", padding: "8px 12px", borderRadius: 6,
                    border: `1.5px solid ${THEME.border}`,
                    background: "#fff",
                    fontSize: 13, color: THEME.text,
                    outline: "none", boxSizing: "border-box",
                    fontFamily: "inherit",
                  }}
                />

                {/* Dropdown risultati */}
                {participantsSearchResults.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0,
                    marginTop: 2, zIndex: 10,
                    background: "#fff",
                    border: `1.5px solid ${THEME.border}`,
                    borderRadius: 6,
                    maxHeight: 220,
                    overflowY: "auto",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  }}>
                    {participantsSearchResults.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          addInitialParticipant(p);
                          setParticipantsSearchQ("");
                          setParticipantsSearchResults([]);
                        }}
                        style={{
                          padding: "8px 12px",
                          cursor: "pointer",
                          borderBottom: `1px solid ${THEME.border}`,
                          fontSize: 12,
                          color: THEME.text,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = `${THEME.teal}08`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {(p.last_name || "").trim()} {(p.first_name || "").trim()}
                        </span>
                        {p.phone && (
                          <span style={{ fontSize: 10, color: THEME.muted }}>{p.phone}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {participantsSearchQ.trim() && participantsSearchResults.length === 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0,
                    marginTop: 2, zIndex: 10,
                    background: "#fff",
                    border: `1.5px solid ${THEME.border}`,
                    borderRadius: 6,
                    padding: "10px 12px",
                    fontSize: 12, color: THEME.muted, fontStyle: "italic",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  }}>
                    Nessun paziente trovato
                  </div>
                )}
              </div>

              {/* Chip dei pazienti selezionati */}
              {initialParticipants.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                  {initialParticipants.map((p) => {
                    const initials =
                      ((p.last_name || "").trim()[0] || "") +
                      ((p.first_name || "").trim()[0] || "");
                    return (
                      <div
                        key={p.id}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "4px 4px 4px 8px",
                          background: "#fff",
                          border: `1.5px solid ${THEME.teal}66`,
                          borderRadius: 99,
                          fontSize: 11,
                        }}
                      >
                        <span style={{
                          width: 18, height: 18, borderRadius: "50%",
                          background: THEME.teal, color: "#fff",
                          fontSize: 9, fontWeight: 700,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          {initials.toUpperCase() || "?"}
                        </span>
                        <span style={{ color: THEME.text, fontWeight: 600 }}>
                          {(p.last_name || "").trim()} {(p.first_name || "").trim()}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeInitialParticipant(p.id)}
                          style={{
                            width: 18, height: 18, borderRadius: "50%",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: THEME.muted,
                            fontSize: 13, fontWeight: 700,
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            padding: 0, lineHeight: 1,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "#dc2626"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = THEME.muted; }}
                          aria-label="Rimuovi paziente"
                        >×</button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Errore se troppi partecipanti */}
              {initialParticipants.length > (parseInt(groupMaxParticipants, 10) || 0) && (
                <div style={{
                  marginTop: 6, padding: "6px 10px",
                  background: "rgba(220,38,38,0.08)",
                  border: "1px solid rgba(220,38,38,0.25)",
                  borderRadius: 6,
                  fontSize: 11, color: "#7f1d1d",
                }}>
                  ⚠️ Hai selezionato più pazienti del massimo. Aumenta il numero massimo o rimuovine qualcuno.
                </div>
              )}
            </div>

            {/* Modalità ricorrente (solo se isRecurring && isGroup) */}
            {isRecurring && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${THEME.teal}33` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 8 }}>
                  Modalità ricorrenza
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <label
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 8,
                      padding: 10, borderRadius: 6,
                      border: `1.5px solid ${groupRecurringMode === "closed" ? THEME.teal : THEME.border}`,
                      background: groupRecurringMode === "closed" ? `${THEME.teal}10` : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="group-rec-mode"
                      checked={groupRecurringMode === "closed"}
                      onChange={() => setGroupRecurringMode("closed")}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>🔒 Chiuso</div>
                      <div style={{ fontSize: 10, color: THEME.muted, lineHeight: 1.4 }}>
                        Stessi pazienti ogni settimana
                      </div>
                    </div>
                  </label>
                  <label
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 8,
                      padding: 10, borderRadius: 6,
                      border: `1.5px solid ${groupRecurringMode === "open" ? THEME.teal : THEME.border}`,
                      background: groupRecurringMode === "open" ? `${THEME.teal}10` : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="group-rec-mode"
                      checked={groupRecurringMode === "open"}
                      onChange={() => setGroupRecurringMode("open")}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>🚪 Aperto</div>
                      <div style={{ fontSize: 10, color: THEME.muted, lineHeight: 1.4 }}>
                        Slot vuoti, aggiungi volta per volta
                      </div>
                    </div>
                  </label>
                </div>
                <div style={{ fontSize: 10, color: THEME.muted, marginTop: 6, fontStyle: "italic" }}>
                  Nota: la replica automatica dei pazienti su tutte le occorrenze (modalità chiuso) sarà attiva nel prossimo aggiornamento.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Operatore (Multi-op, Fase 4d, mig. 019/022) ─────────────────────
            Visibile solo se multi_operator_enabled = true. Permette di scegliere
            chi svolge la seduta tra i membri attivi del team. Sotto, eventuale
            warning se l'orario è in conflitto con un altro appuntamento dello
            stesso operatore. */}
        {multiOperatorEnabled && members && members.length > 0 && setCreateOperatorId && (
          <div style={{ marginBottom: 20, border: `1.5px solid ${THEME.border}`, padding: 16, borderRadius: 8, background: THEME.panelSoft }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft, marginBottom: 12 }}>
              Operatore
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {members
                .filter(m => m.user_id != null)
                .map(m => {
                  const id = m.user_id as string;
                  const isSelected = createOperatorId === id;
                  const color = m.display_color || "#94a3b8";
                  const initials = (m.signature_short || m.display_name || "?").substring(0, 2).toUpperCase();
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setCreateOperatorId(isSelected ? null : id)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 12px 6px 6px",
                        borderRadius: 99,
                        background: isSelected ? color : "#fff",
                        border: isSelected ? `2px solid ${color}` : `1.5px solid ${THEME.border}`,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all 0.15s",
                      }}
                    >
                      <span
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: "50%",
                          background: isSelected ? "#fff" : color,
                          color: isSelected ? color : "#fff",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 800,
                        }}
                      >
                        {initials}
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: isSelected ? "#fff" : THEME.text,
                        }}
                      >
                        {m.display_name || "—"}
                      </span>
                    </button>
                  );
                })}
              {/* Bottone "Nessuno" per assegnare a nessuno */}
              <button
                type="button"
                onClick={() => setCreateOperatorId(null)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px 6px 6px",
                  borderRadius: 99,
                  background: createOperatorId === null ? "#94a3b8" : "#fff",
                  border: createOperatorId === null ? "2px solid #94a3b8" : `1.5px solid ${THEME.border}`,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: createOperatorId === null ? "#fff" : "#94a3b8",
                    color: createOperatorId === null ? "#475569" : "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  ?
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: createOperatorId === null ? "#fff" : THEME.muted,
                  }}
                >
                  Non assegnato
                </span>
              </button>
            </div>

            {/* Warning conflitto orario per operatore */}
            {operatorConflict && (
              <div style={{
                marginTop: 12,
                padding: "10px 12px",
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.3)",
                borderRadius: 8,
                fontSize: 12,
                color: "#92400e",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span style={{ fontSize: 16 }}>⚠️</span>
                <span>
                  Conflitto: questo operatore ha già <strong>{operatorConflict.patient}</strong> alle <strong>{operatorConflict.time}</strong>. Puoi comunque salvare ma verifica.
                </span>
              </div>
            )}
          </div>
        )}

        {/* ─── Tipologia e Prezzo (NASCOSTO se gruppo) ──────────────────────── */}
        {!isGroupAppointment && (
        <div style={{ marginBottom: 20, border: `1.5px solid ${THEME.border}`, padding: 16, borderRadius: 8, background: THEME.panelSoft }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft, marginBottom: 12 }}>
            Tipologia e Prezzo
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            {/* Trattamento */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 8 }}>
                Trattamento
              </div>
              <div style={{ position: "relative" }}>
                {/* Pallino colore a sinistra */}
                <div style={{
                  position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                  width: 12, height: 12, borderRadius: "50%",
                  background: ALL_TREATMENTS.find(t => t.value === treatmentType)?.color ?? "#94a3b8",
                  pointerEvents: "none", zIndex: 1,
                  border: "1px solid rgba(0,0,0,0.06)",
                }} />
                <select
                  value={treatmentType}
                  onChange={e => setTreatmentType(e.target.value as TreatmentType)}
                  style={{
                    width: "100%", padding: "9px 32px 9px 32px", borderRadius: 7,
                    border: `1.5px solid ${THEME.borderSoft}`, fontSize: 13, fontWeight: 700,
                    background: "#fff", color: THEME.text, cursor: "pointer",
                    appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
                  }}
                >
                  {ALL_TREATMENTS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {/* Freccia destra */}
                <div style={{
                  position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                  pointerEvents: "none", color: THEME.muted, fontSize: 10,
                }}>▼</div>
              </div>
            </div>

            {/* Prezzo standard */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 8 }}>
                Prezzo
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setPriceType("invoiced")}
                  style={{
                    flex: 1, padding: "12px", borderRadius: 8,
                    border: `1px solid ${priceType === "invoiced" ? THEME.greenDark : THEME.borderSoft}`,
                    background: priceType === "invoiced" ? THEME.green : "#fff",
                    color: priceType === "invoiced" ? "#fff" : THEME.text,
                    cursor: "pointer", fontWeight: 600, fontSize: 13,
                  }}
                >
                  {`€ ${Number(getDefaultAmount(treatmentType, "invoiced") ?? 0).toFixed(2)} fatturato`}
                </button>
                <button
                  onClick={() => setPriceType("cash")}
                  style={{
                    flex: 1, padding: "12px", borderRadius: 8,
                    border: `1px solid ${priceType === "cash" ? THEME.amber : THEME.borderSoft}`,
                    background: priceType === "cash" ? "rgba(245,158,11,0.1)" : "#fff",
                    color: priceType === "cash" ? THEME.amber : THEME.text,
                    cursor: "pointer", fontWeight: 600, fontSize: 13,
                  }}
                >
                  {`€ ${Number(getDefaultAmount(treatmentType, "cash") ?? 0).toFixed(2)} contanti`}
                </button>
              </div>

              {/* ── Metodo Pagamento — visibile solo se "Fatturato" ── */}
              {priceType === "invoiced" && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: THEME.muted, marginBottom: 6 }}>
                    Metodo pagamento <span style={{ color: "#dc2626" }}>*</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {([
                      { v: "cash",          label: "Contanti" },
                      { v: "pos",           label: "POS" },
                      { v: "bank_transfer", label: "Bonifico" },
                    ] as const).map(opt => {
                      const active = paymentMethod === opt.v;
                      return (
                        <button
                          key={opt.v}
                          onClick={() => setPaymentMethod(opt.v)}
                          style={{
                            flex: 1, padding: "9px 6px", borderRadius: 7,
                            border: `1px solid ${active ? THEME.blue : THEME.borderSoft}`,
                            background: active ? "rgba(37,99,235,0.08)" : "#fff",
                            color: active ? THEME.blue : THEME.text,
                            cursor: "pointer", fontWeight: 600, fontSize: 12,
                          }}
                        >{opt.label}</button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Prezzo personalizzato */}
          <div style={{ borderTop: `1px solid ${THEME.border}`, paddingTop: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 12, fontWeight: 600, color: THEME.text, fontSize: 14, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={useCustomPrice}
                onChange={e => {
                  setUseCustomPrice(e.target.checked);
                  if (!e.target.checked) setCustomAmount("");
                }}
                style={{ width: 18, height: 18 }}
              />
              Imposta prezzo personalizzato
            </label>

            {useCustomPrice && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: THEME.text }}>€</div>
                <input
                  value={customAmount}
                  onChange={e => setCustomAmount(e.target.value)}
                  placeholder="Importo personalizzato (0 per gratis)"
                  style={{
                    flex: 1, padding: "8px 10px", borderRadius: 8,
                    border: `1px solid ${THEME.blue}`,
                    background: THEME.panelBg, color: THEME.text,
                    outline: "none", fontWeight: 600, fontSize: 13,
                  }}
                />
                <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                  Inserisci l&apos;importo in euro (0 per terapia gratuita)
                </div>
              </div>
            )}
          </div>

          {/* Totale */}
          <div style={{ marginTop: 12, fontSize: 13, color: THEME.muted, fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Totale:</span>
            <strong style={{ color: THEME.text, fontSize: 16 }}>
              {useCustomPrice && customAmount !== ""
                ? `€ ${parseFloat(customAmount.replace(",", ".")).toFixed(2)}`
                : `€ ${Number(computedDefaultAmount ?? 0).toFixed(2)}`}
            </strong>
          </div>
        </div>
        )}

        {/* ─── Ricorrente ──────────────────────────────── */}
        <div style={{ marginBottom: 20, border: `1.5px solid ${THEME.border}`, background: THEME.panelSoft, padding: 16, borderRadius: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 12, fontWeight: 600, color: THEME.text, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={e => setIsRecurring(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            Appuntamento ricorrente
          </label>

          {isRecurring && (
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: THEME.muted }}>Giorni</div>
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {dayLabels.map(d => {
                    const active = recurringDays.includes(d.dow);
                    return (
                      <button
                        key={d.dow}
                        onClick={() => toggleRecurringDay(d.dow)}
                        title="Seleziona/deseleziona"
                        style={{
                          padding: "8px 10px", borderRadius: 8,
                          border: `1px solid ${active ? THEME.blueDark : THEME.borderSoft}`,
                          background: active ? THEME.blue : "#fff",
                          color: active ? "#fff" : THEME.text,
                          cursor: "pointer", fontWeight: 600, fontSize: 12,
                        }}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>

                {/* Frequenza */}
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 6 }}>Frequenza</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {([1, 2, 3, 4] as const).map(freq => (
                      <button
                        key={freq}
                        onClick={() => setRecurringFrequency(freq)}
                        style={{
                          padding: "6px 12px", borderRadius: 6,
                          border: `1px solid ${recurringFrequency === freq ? THEME.blueDark : THEME.borderSoft}`,
                          background: recurringFrequency === freq ? THEME.blue : "#fff",
                          color: recurringFrequency === freq ? "#fff" : THEME.text,
                          cursor: "pointer", fontWeight: 600, fontSize: 11,
                        }}
                      >
                        {freq === 1 ? "Ogni sett." : `Ogni ${freq} sett.`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview count */}
                {(() => {
                  try {
                    const previewStarts = generateRecurringStarts({
                      firstStart: new Date(createStartISO),
                      untilDate: parseDateInput(recurringUntil),
                      weekDays: recurringDays,
                      frequency: recurringFrequency,
                    });
                    return (
                      <div style={{
                        marginTop: 10, fontSize: 12,
                        color: THEME.blue, fontWeight: 700,
                        background: "rgba(37,99,235,0.06)",
                        padding: "6px 10px", borderRadius: 6,
                      }}>
                        📅 Verranno creati {previewStarts.length} appuntamenti
                      </div>
                    );
                  } catch {
                    return null;
                  }
                })()}
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: THEME.muted }}>
                  Ripeti fino a
                  <input
                    type="date"
                    value={recurringUntil}
                    onChange={e => setRecurringUntil(e.target.value)}
                    style={{
                      width: "100%", marginTop: 8, padding: 10, borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelBg, color: THEME.text,
                      outline: "none", fontWeight: 600, fontSize: 13,
                    }}
                  />
                </label>
                <div style={{ marginTop: 12, fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                  Limite sicurezza: max 200 appuntamenti per inserimento.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── Sezione paziente (NASCOSTA se gruppo) ─────────────── */}
        {!isGroupAppointment && (
        <>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft }}>
              {duplicateMode ? "Paziente" : "Seleziona paziente"}
            </div>
            {!duplicateMode && (
              <button
                onClick={() => setQuickPatientOpen(true)}
                style={{
                  padding: "8px 16px", borderRadius: 8,
                  border: `1px solid ${THEME.greenDark}`,
                  background: THEME.green, color: "#fff",
                  cursor: "pointer", fontWeight: 600, fontSize: 12,
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <span style={{ fontSize: 14 }}>➕</span>
                Nuovo Paziente Rapido
              </button>
            )}
          </div>

          {duplicateMode && selectedPatient ? (
            // Pill paziente in duplica
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderRadius: 8,
              background: "rgba(37,99,235,0.07)",
              border: `1.5px solid ${THEME.blue}`,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: THEME.blue,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 800, fontSize: 13, flexShrink: 0,
              }}>
                {((selectedPatient.last_name?.[0] ?? "") + (selectedPatient.first_name?.[0] ?? "")).toUpperCase() || "?"}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: THEME.text }}>
                  {selectedPatient.last_name} {selectedPatient.first_name}
                </div>
                <div style={{ fontSize: 11, color: THEME.muted, marginTop: 1 }}>
                  Paziente copiato dall&apos;appuntamento originale
                </div>
              </div>
            </div>
          ) : (
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Cerca per nome o cognome (min 2 lettere)..."
              style={{
                width: "100%", padding: 10, borderRadius: 8,
                border: `1px solid ${THEME.borderSoft}`,
                background: THEME.panelBg, color: THEME.text,
                outline: "none", fontWeight: 600, fontSize: 13,
              }}
            />
          )}
        </div>

        {/* Quick patient form */}
        {quickPatientOpen && (
          <div style={{
            border: `1px solid ${THEME.blue}`,
            background: "rgba(91,130,168,0.03)",
            padding: 16, borderRadius: 8, marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: THEME.blueDark, marginBottom: 12 }}>
              Inserisci dati paziente rapido
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              <input
                value={quickPatientFirstName}
                onChange={e => setQuickPatientFirstName(e.target.value)}
                placeholder="Nome *"
                style={{
                  padding: "8px 10px", borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelBg, color: THEME.text,
                  outline: "none", fontWeight: 600, fontSize: 13,
                }}
              />
              <input
                value={quickPatientLastName}
                onChange={e => setQuickPatientLastName(e.target.value)}
                placeholder="Cognome *"
                style={{
                  padding: "8px 10px", borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelBg, color: THEME.text,
                  outline: "none", fontWeight: 600, fontSize: 13,
                }}
              />
              <input
                value={quickPatientPhone}
                onChange={e => setQuickPatientPhone(e.target.value)}
                placeholder="Telefono (opzionale)"
                style={{
                  padding: "8px 10px", borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelBg, color: THEME.text,
                  outline: "none", fontWeight: 600, fontSize: 13,
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                Stato: <strong style={{ color: THEME.amber }}>DA COMPLETARE</strong>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setQuickPatientOpen(false)}
                  style={{
                    padding: "8px 16px", borderRadius: 8,
                    border: `1px solid ${THEME.borderSoft}`,
                    background: THEME.panelSoft, color: THEME.text,
                    cursor: "pointer", fontWeight: 600, fontSize: 12,
                  }}
                >
                  Annulla
                </button>
                <button
                  onClick={createQuickPatient}
                  disabled={creatingQuickPatient || !quickPatientFirstName.trim() || !quickPatientLastName.trim()}
                  style={{
                    padding: "8px 16px", borderRadius: 8,
                    border: `1px solid ${THEME.greenDark}`,
                    background: THEME.green, color: "#fff",
                    cursor: creatingQuickPatient ? "not-allowed" : "pointer",
                    fontWeight: 600, fontSize: 12,
                    opacity: creatingQuickPatient || !quickPatientFirstName.trim() || !quickPatientLastName.trim() ? 0.6 : 1,
                  }}
                >
                  {creatingQuickPatient ? "Creazione..." : "Crea Paziente"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lista risultati search */}
        {!duplicateMode && (
          <div style={{
            border: `1.5px solid ${THEME.border}`,
            background: THEME.panelBg,
            borderRadius: 8, overflow: "hidden",
          }}>
            <div style={{
              padding: 10, fontSize: 13, color: THEME.muted, fontWeight: 600,
              background: THEME.panelSoft,
            }}>
              {searching ? "Ricerca in corso..." : `Risultati: ${patientResults.length}`}
            </div>

            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {patientResults.length === 0 && !quickPatientOpen && (
                <div style={{ padding: 20, fontSize: 13, color: THEME.muted, fontWeight: 600, textAlign: "center" }}>
                  {q.trim().length < 2 ? "Scrivi almeno 2 lettere per iniziare la ricerca" : "Nessun risultato trovato"}
                </div>
              )}

              {patientResults.map(p => {
                const active = selectedPatient?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedPatient(p);
                      if (!duplicateMode) loadLastPatientSettings(p.id);
                    }}
                    style={{
                      width: "100%", textAlign: "left", padding: 16, border: "none",
                      borderTop: `1px solid ${THEME.border}`,
                      background: active ? "rgba(37,99,235,0.08)" : "#fff",
                      cursor: "pointer",
                      display: "flex", justifyContent: "space-between", gap: 12,
                      fontWeight: 600, color: THEME.text, fontSize: 13,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                      <span style={{ fontSize: 14 }}>{p.last_name} {p.first_name}</span>
                      {p.treatment && (
                        <span style={{ fontSize: 12, color: THEME.muted, marginTop: 4, fontWeight: 600 }}>
                          Trattamento: {p.treatment}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                      {p.phone ?? ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer info paziente selezionato */}
        <div style={{ marginTop: 16, fontSize: 13, color: THEME.muted, fontWeight: 600 }}>
          Selezionato:{" "}
          <strong style={{ color: THEME.text }}>
            {selectedPatient ? `${selectedPatient.last_name} ${selectedPatient.first_name}` : "-"}
          </strong>
          {selectedPatient && selectedPatient.treatment && (
            <span style={{ marginLeft: 16 }}>
              • Trattamento: <strong style={{ color: THEME.text }}>{selectedPatient.treatment}</strong>
            </span>
          )}
          {selectedPatient && !duplicateMode && (
            <span style={{ marginLeft: 8, fontSize: 11, color: THEME.green }}>
              ✓ Impostazioni ultimo appuntamento applicate
            </span>
          )}
        </div>
        </>
        )}

        {/* ─── Picker pacchetto sedute ─── (mostra solo se paziente selezionato e non gruppo) */}
        {!isGroupAppointment && selectedPatient && (
          <PackagePickerSection
            patientId={selectedPatient.id}
            value={selectedPackageId}
            onChange={setSelectedPackageId}
          />
        )}

        {/* ─── Bottoni azione ───────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 28 }}>
          <button
            onClick={onClose}
            style={{
              padding: "12px 22px", borderRadius: 10,
              border: `2px solid ${THEME.border}`,
              background: THEME.panelSoft, color: THEME.text,
              cursor: "pointer", fontWeight: 700,
              minWidth: 120, fontSize: 13, letterSpacing: 0.3,
            }}
          >
            Annulla
          </button>

          <button
            onClick={onRequestCreate}
            disabled={submitDisabled}
            style={{
              padding: "12px 22px", borderRadius: 10, border: "none",
              background: submitDisabled ? THEME.gray : "linear-gradient(135deg, #0d9488, #2563eb)",
              color: "#fff",
              cursor: submitDisabled ? "not-allowed" : "pointer",
              fontWeight: 700, minWidth: 200,
              opacity: submitDisabled ? 0.6 : 1,
              fontSize: 13, letterSpacing: 0.3,
              boxShadow: submitDisabled ? "none" : "0 4px 16px rgba(37,99,235,0.3)",
            }}
          >
            {creating ? "Creazione..." : isGroupAppointment ? (isRecurring ? "Crea ricorrenza gruppo" : "Crea gruppo") : isRecurring ? "Crea ricorrenza" : "Crea appuntamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
