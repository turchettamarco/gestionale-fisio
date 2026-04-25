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

import {
  THEME, ALL_TREATMENTS, DEFAULT_CLINIC_SITE,
  fmtTime, parseDateInput, toDateInputValue, generateRecurringStarts,
  type LocationType, type TreatmentType, type PatientLite,
  type PracticeSettings,
} from "../../utils";

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
  selectedDuration: "1" | "1.5" | "2";
  setSelectedDuration: (d: "1" | "1.5" | "2") => void;
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

  // ─── Trattamento e prezzo ─────────────────────────────────
  treatmentType: TreatmentType;
  setTreatmentType: (t: TreatmentType) => void;
  priceType: "invoiced" | "cash";
  setPriceType: (p: "invoiced" | "cash") => void;
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
    treatmentType, setTreatmentType,
    priceType, setPriceType,
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
    creating,
  } = props;

  // ─── Helpers ────────────────────────────────────────────────────
  const overlapMode = practiceSettings?.overlap_mode ?? "warn";
  const isBlock = overlapMode === "block";
  const isVisualOverlap = overlapMode === "visual";
  const submitDisabled = creating || !selectedPatient || (isBlock && !!overlapWarning);

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
                  const newDuration = e.target.value as "1" | "1.5" | "2";
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
                <option value="1">1 ora</option>
                <option value="1.5">1.5 ore</option>
                <option value="2">2 ore</option>
              </select>
            </label>
          </div>

          <div></div>
        </div>

        {/* ─── Tipologia e Prezzo ──────────────────────── */}
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ALL_TREATMENTS.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setTreatmentType(t.value as TreatmentType)}
                    style={{
                      padding: "7px 12px", borderRadius: 7,
                      cursor: "pointer", fontWeight: 700, fontSize: 13,
                      border: `2px solid ${treatmentType === t.value ? t.color : THEME.borderSoft}`,
                      background: treatmentType === t.value ? t.color : "#fff",
                      color: treatmentType === t.value ? "#fff" : THEME.text,
                      transition: "all 0.15s",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
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

        {/* ─── Sezione paziente ───────────────────────── */}
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
            {creating ? "Creazione..." : isRecurring ? "Crea ricorrenza" : "Crea appuntamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
