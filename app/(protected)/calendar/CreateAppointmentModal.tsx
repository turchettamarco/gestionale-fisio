"use client";
type Props = any;

import React from "react";

export default function CreateAppointmentModal(props: any) {
  const {
    THEME,
    createClinicSite,
    createDomicileAddress,
    createLocation,
    createOpen,
    createQuickPatient,
    createStartISO,
    createEndISO,
    creating,
    creatingQuickPatient,
    customAmount,
    d,
    dayLabels,
    duplicateMode,
    isRecurring,
    patientResults,
    priceType,
    q,
    quickPatientFirstName,
    quickPatientLastName,
    quickPatientOpen,
    quickPatientPhone,
    recurringUntil,
    recurringDays,
    searching,
    selectedDuration,
    selectedPatient,
    setCreateOpen,
    setCreateLocation,
    setCreateClinicSite,
    setCreateDomicileAddress,
    setCreateStartISO,
    setCreateEndISO,
    setQ,
    setPatientResults,
    setSelectedPatient,
    setSelectedDuration,
    setTreatmentType,
    setPriceType,
    setIsRecurring,
    setRecurringUntil,
    setQuickPatientOpen,
    setQuickPatientFirstName,
    setQuickPatientLastName,
    setQuickPatientPhone,
    setShowWhatsAppConfirm,
    setCustomAmount,
    setDuplicateDate,
    setDuplicateTime,
    duplicateDate,
    duplicateTime,
    selectedStartTime,
    setSelectedStartTime,
    setUseCustomPrice,
    showAllUpcoming,
    timeSelectSlots,
    fmtTime,
    toDateInputValue,
    parseDateInput,
    toggleRecurringDay,
    getDefaultAmount,
    computedDefaultAmount,
    treatmentType,
    updateDuplicateDateTime,
    useCustomPrice
  } = props;

  if (!createOpen) return null;

  return (
            <div
          className={`no-print sidebar-scroll ${showAllUpcoming ? "show-scrollbar" : ""}`}
          onClick={() => setCreateOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 800,
              maxWidth: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              background: THEME.panelBg,
              color: THEME.text,
              borderRadius: 12,
              border: `1px solid ${THEME.borderSoft}`,
              boxShadow: "0 18px 60px rgba(15,23,42,0.25)",
              padding: 24,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: THEME.blueDark, letterSpacing: -0.2 }}>
                  {duplicateMode ? "Duplica appuntamento" : "Nuovo appuntamento"}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: THEME.muted, fontWeight: 900 }}>
                  {createStartISO ? `${fmtTime(createStartISO)} → ${fmtTime(createEndISO)} • ${selectedDuration} ora${selectedDuration === "1" ? "" : "e"}` : "Seleziona orario"}
                </div>
              </div>

              <button
                onClick={() => setCreateOpen(false)}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelSoft,
                  color: THEME.text,
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                  Luogo
                  <select
                    value={createLocation}
                    onChange={(e) => setCreateLocation(e.target.value as any)}
                    style={{
                      width: "100%",
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelBg,
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    <option value="studio">Studio</option>
                    <option value="domicile">Domicilio</option>
                  </select>
                </label>
              </div>

              <div>
                {createLocation === "studio" ? (
                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    Sede
                    <input
                      value={createClinicSite}
                      onChange={(e) => setCreateClinicSite(e.target.value)}
                      placeholder="Es. Studio Pontecorvo"
                      style={{
                        width: "100%",
                        marginTop: 8,
                        padding: 10,
                        borderRadius: 8,
                        border: `1px solid ${THEME.borderSoft}`,
                        background: THEME.panelBg,
                        color: THEME.text,
                        outline: "none",
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    />
                  </label>
                ) : (
                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    Indirizzo domicilio
                    <input
                      value={createDomicileAddress}
                      onChange={(e) => setCreateDomicileAddress(e.target.value)}
                      placeholder="Via..., n..., città..."
                      style={{
                        width: "100%",
                        marginTop: 8,
                        padding: 10,
                        borderRadius: 8,
                        border: `1px solid ${THEME.borderSoft}`,
                        background: THEME.panelBg,
                        color: THEME.text,
                        outline: "none",
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    />
                  </label>
                )}
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                  {duplicateMode ? "Nuovo giorno" : "Giorno"}
                  <input
                    type="date"
                    value={duplicateMode ? duplicateDate : toDateInputValue(new Date(createStartISO))}
                    onChange={(e) => {
                      if (duplicateMode) {
                        setDuplicateDate(e.target.value);
                        updateDuplicateDateTime(e.target.value, duplicateTime);
                      } else {
                        const date = parseDateInput(e.target.value);
                        const [hours, minutes] = selectedStartTime.split(':').map(Number);
                        date.setHours(hours, minutes, 0, 0);
                        const durationHours = parseFloat(selectedDuration);
                        const endDate = new Date(date.getTime() + durationHours * 60 * 60000);
                        setCreateStartISO(date.toISOString());
                        setCreateEndISO(endDate.toISOString());
                      }
                    }}
                    style={{
                      width: "100%",
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelBg,
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  />
                </label>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                  {duplicateMode ? "Nuovo orario" : "Orario"}
                  <select
                    value={duplicateMode ? duplicateTime : selectedStartTime}
                    onChange={(e) => {
                      if (duplicateMode) {
                        setDuplicateTime(e.target.value);
                        updateDuplicateDateTime(duplicateDate, e.target.value);
                      } else {
                        setSelectedStartTime(e.target.value);
                      }
                    }}
                    style={{
                      width: "100%",
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelBg,
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    {timeSelectSlots.map((time: any) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                  Durata
                  <select
                    value={selectedDuration}
                    onChange={(e) => {
                      const newDuration = e.target.value as "1" | "1.5" | "2";
                      setSelectedDuration(newDuration);
                      if (duplicateMode && duplicateDate && duplicateTime) {
                        updateDuplicateDateTime(duplicateDate, duplicateTime);
                      }
                    }}
                    style={{
                      width: "100%",
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelBg,
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 800,
                      fontSize: 13,
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

            <div style={{ marginBottom: 20, border: `1px solid ${THEME.border}`, padding: 16, borderRadius: 8, background: THEME.panelSoft }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft, marginBottom: 12 }}>
                Tipologia e Prezzo
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 8 }}>
                    Trattamento
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setTreatmentType("seduta")}
                      style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: 8,
                        border: `1px solid ${treatmentType === "seduta" ? THEME.blueDark : THEME.borderSoft}`,
                        background: treatmentType === "seduta" ? THEME.blue : "#fff",
                        color: treatmentType === "seduta" ? "#fff" : THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 13,
                      }}
                    >
                      Seduta
                    </button>
                    <button
                      onClick={() => setTreatmentType("macchinario")}
                      style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: 8,
                        border: `1px solid ${treatmentType === "macchinario" ? THEME.blueDark : THEME.borderSoft}`,
                        background: treatmentType === "macchinario" ? THEME.blue : "#fff",
                        color: treatmentType === "macchinario" ? "#fff" : THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 13,
                      }}
                    >
                      Solo Macchinario
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 8 }}>
                    Prezzo
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setPriceType("invoiced")}
                      style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: 8,
                        border: `1px solid ${priceType === "invoiced" ? THEME.greenDark : THEME.borderSoft}`,
                        background: priceType === "invoiced" ? THEME.green : "#fff",
                        color: priceType === "invoiced" ? "#fff" : THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 13,
                      }}
                    >
                      {`€ ${Number(getDefaultAmount(treatmentType, "invoiced") ?? 0).toFixed(2)} fatturato`}
                    </button>
                    <button
                      onClick={() => setPriceType("cash")}
                      style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: 8,
                        border: `1px solid ${priceType === "cash" ? THEME.amber : THEME.borderSoft}`,
                        background: priceType === "cash" ? "rgba(249,115,22,0.1)" : "#fff",
                        color: priceType === "cash" ? THEME.amber : THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 13,
                      }}
                    >
                      {`€ ${Number(getDefaultAmount(treatmentType, "cash") ?? 0).toFixed(2)} contanti`}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${THEME.border}`, paddingTop: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 12, fontWeight: 900, color: THEME.text, fontSize: 14, marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    checked={useCustomPrice}
                    onChange={(e) => {
                      setUseCustomPrice(e.target.checked);
                      if (!e.target.checked) {
                        setCustomAmount("");
                      }
                    }}
                    style={{ width: 18, height: 18 }}
                  />
                  Imposta prezzo personalizzato
                

                </label>

                {useCustomPrice && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: THEME.text }}>€</div>
                    <input
  value={customAmount}
  onChange={(e) => {
    const value = e.target.value;
    setCustomAmount(value);
  }}
  placeholder="Importo personalizzato (0 per gratis)"
  style={{
    flex: 1,
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${THEME.blue}`,
    background: "#fff",
    color: THEME.text,
    outline: "none",
    fontWeight: 800,
    fontSize: 13,
  }}
/>
                    <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 900 }}>
                      Inserisci l'importo in euro (0 per terapia gratuita)
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 12, fontSize: 13, color: THEME.muted, fontWeight: 900, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Totale:</span>
                <strong style={{ color: THEME.text, fontSize: 16 }}>
                  {useCustomPrice && customAmount !== "" ? 
                    `€ ${parseFloat(customAmount.replace(',', '.')).toFixed(2)}` :
                    `€ ${Number(computedDefaultAmount ?? 0).toFixed(2)}`
                  }
                </strong>
              </div>
            </div>

            <div style={{ marginBottom: 20, border: `1px solid ${THEME.border}`, background: THEME.panelSoft, padding: 16, borderRadius: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 12, fontWeight: 900, color: THEME.text, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                Appuntamento ricorrente
              </label>

              {isRecurring && (
                <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: THEME.muted }}>Giorni</div>
                    <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {dayLabels.map((d: any) => {
                        const active = recurringDays.includes(d.dow);
                        return (
                          <button
                            key={d.dow}
                            onClick={() => toggleRecurringDay(d.dow)}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: `1px solid ${active ? THEME.blueDark : THEME.borderSoft}`,
                              background: active ? THEME.blue : "#fff",
                              color: active ? "#fff" : THEME.text,
                              cursor: "pointer",
                              fontWeight: 900,
                              fontSize: 12,
                            }}
                            title="Seleziona/deseleziona"
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 12, fontSize: 12, color: THEME.muted, fontWeight: 900 }}>
                      Creerò un appuntamento per ogni giorno selezionato fino alla data finale.
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 13, fontWeight: 900, color: THEME.muted }}>
                      Ripeti fino a
                      <input
                        type="date"
                        value={recurringUntil}
                        onChange={(e) => setRecurringUntil(e.target.value)}
                        style={{
                          width: "100%",
                          marginTop: 8,
                          padding: 10,
                          borderRadius: 8,
                          border: `1px solid ${THEME.borderSoft}`,
                          background: "#fff",
                          color: THEME.text,
                          outline: "none",
                          fontWeight: 800,
                          fontSize: 13,
                        }}
                      />
                    </label>

                    <div style={{ marginTop: 12, fontSize: 12, color: THEME.muted, fontWeight: 900 }}>
                      Limite sicurezza: max 200 appuntamenti per inserimento.
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                  Seleziona paziente
                </div>
                <button
                  onClick={() => setQuickPatientOpen(true)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: `1px solid ${THEME.greenDark}`,
                    background: THEME.green,
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: 14 }}>➕</span>
                  Nuovo Paziente Rapido
                </button>
              </div>

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cerca per nome o cognome (min 2 lettere)..."
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: "#fff",
                  color: THEME.text,
                  outline: "none",
                  fontWeight: 800,
                  fontSize: 13,
                }}
              />
            </div>

            {quickPatientOpen && (
              <div style={{ 
                border: `1px solid ${THEME.blue}`, 
                background: "rgba(37, 99, 235, 0.03)", 
                padding: 16, 
                borderRadius: 8,
                marginBottom: 16 
              }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: THEME.blueDark, marginBottom: 12 }}>
                  Inserisci dati paziente rapido
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <input
                    value={quickPatientFirstName}
                    onChange={(e) => setQuickPatientFirstName(e.target.value)}
                    placeholder="Nome *"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: "#fff",
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  />
                  <input
                    value={quickPatientLastName}
                    onChange={(e) => setQuickPatientLastName(e.target.value)}
                    placeholder="Cognome *"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: "#fff",
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  />
                  <input
                    value={quickPatientPhone}
                    onChange={(e) => setQuickPatientPhone(e.target.value)}
                    placeholder="Telefono (opzionale)"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: "#fff",
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  />
                </div>
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 900 }}>
                    Stato: <strong style={{ color: THEME.amber }}>DA COMPLETARE</strong>
                  </div>
                  
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setQuickPatientOpen(false)}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border: `1px solid ${THEME.borderSoft}`,
                        background: THEME.panelSoft,
                        color: THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      Annulla
                    </button>
                    <button
                      onClick={createQuickPatient}
                      disabled={creatingQuickPatient || !quickPatientFirstName.trim() || !quickPatientLastName.trim()}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border: `1px solid ${THEME.greenDark}`,
                        background: THEME.green,
                        color: "#fff",
                        cursor: creatingQuickPatient ? "not-allowed" : "pointer",
                        fontWeight: 900,
                        fontSize: 12,
                        opacity: creatingQuickPatient || !quickPatientFirstName.trim() || !quickPatientLastName.trim() ? 0.6 : 1,
                      }}
                    >
                      {creatingQuickPatient ? "Creazione..." : "Crea Paziente"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ border: `1px solid ${THEME.border}`, background: "#fff", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: 10, fontSize: 13, color: THEME.muted, fontWeight: 900, background: THEME.panelSoft }}>
                {searching ? "Ricerca in corso..." : `Risultati: ${patientResults.length}`}
              </div>

              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {patientResults.length === 0 && !quickPatientOpen && (
                  <div style={{ padding: 20, fontSize: 13, color: THEME.muted, fontWeight: 900, textAlign: "center" }}>
                    {q.trim().length < 2 ? "Scrivi almeno 2 lettere per iniziare la ricerca" : "Nessun risultato trovato"}
                  </div>
                )}

                {patientResults.map((p: any) => {
                  const active = selectedPatient?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPatient(p)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: 16,
                        border: "none",
                        borderTop: `1px solid ${THEME.border}`,
                        background: active ? "rgba(37, 99, 235, 0.08)" : "#fff",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        fontWeight: 900,
                        color: THEME.text,
                        fontSize: 13,
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                        <span style={{ fontSize: 14 }}>
                          {p.last_name} {p.first_name}
                        </span>
                        {p.treatment && (
                          <span style={{ fontSize: 12, color: THEME.muted, marginTop: 4, fontWeight: 900 }}>
                            Trattamento: {p.treatment}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 900 }}>{p.phone ?? ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 16, fontSize: 13, color: THEME.muted, fontWeight: 900 }}>
              Selezionato:{" "}
              <strong style={{ color: THEME.text }}>
                {selectedPatient ? `${selectedPatient.last_name} ${selectedPatient.first_name}` : "-"}
              </strong>
              {selectedPatient && selectedPatient.treatment && (
                <span style={{ marginLeft: 16 }}>
                  • Trattamento: <strong style={{ color: THEME.text }}>{selectedPatient.treatment}</strong>
                </span>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <button
                onClick={() => setCreateOpen(false)}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelSoft,
                  color: THEME.text,
                  cursor: "pointer",
                  fontWeight: 900,
                  minWidth: 120,
                  fontSize: 13,
                }}
              >
                Annulla
              </button>

              <button
                onClick={() => setShowWhatsAppConfirm(true)}
                disabled={creating || !selectedPatient}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: `1px solid ${THEME.greenDark}`,
                  background: THEME.green,
                  color: "#fff",
                  cursor: creating || !selectedPatient ? "not-allowed" : "pointer",
                  fontWeight: 900,
                  minWidth: 200,
                  opacity: creating || !selectedPatient ? 0.6 : 1,
                  fontSize: 13,
                }}
              >
                {creating ? "Creazione..." : isRecurring ? "Crea ricorrenza" : "Crea appuntamento"}
              </button>
            </div>
          </div>
        </div>
  );
}



