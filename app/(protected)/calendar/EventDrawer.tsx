"use client";
type Props = any;

import React from "react";
import Link from "next/link";

export default function EventDrawer(props: any) {
  const {
    THEME,
    statusColor,
    statusLabel,
    events,
    getEventColor,
    deleteAppointment,
    editAmount,
    editDate,
    editDuration,
    editNote,
    editPriceType,
    editStartTime,
    editStatus,
    editTreatmentType,
    setSelectedEvent,
    setEditDate,
    setEditStartTime,
    setEditDuration,
    setEditTreatmentType,
    setEditPriceType,
    setEditAmount,
    setEditStatus,
    setEditNote,
    eventColors,
    openCreateModal,
    saveAppointment,
    selectedEvent,
    sendReminder,
    setEventColors,
    showAllUpcoming,
    timeSelectSlots
  } = props;

  if (!selectedEvent) return null;

  return (
            <div
          className={`no-print sidebar-scroll ${showAllUpcoming ? "show-scrollbar" : ""}`}
          onClick={() => setSelectedEvent(null)}
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
              width: 700,
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
                <div style={{ fontSize: 20, fontWeight: 900, color: THEME.blueDark, letterSpacing: -0.2 }}>{selectedEvent.title}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: THEME.muted, fontWeight: 900 }}>
                  Stato: <strong style={{ color: statusColor(editStatus) }}>{statusLabel(editStatus)}</strong>
                  {selectedEvent.location === "domicile" && (
                    <span style={{ marginLeft: 12, color: THEME.amber, fontWeight: 900 }}>🏠 DOMICILIO</span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setSelectedEvent(null)}
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

            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <button
                onClick={() => {
                  const event = events.find((e: any) => e.id === selectedEvent.id);
                  if (event) {
                    openCreateModal(event.start, event.start.getHours(), event.start.getMinutes(), event);
                    setSelectedEvent(null);
                  }
                }}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: `1px solid ${THEME.blueDark}`,
                  background: THEME.blue,
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>📋</span>
                Duplica
              </button>
            </div>

            <div style={{ marginBottom: 20, border: `1px solid ${THEME.border}`, padding: 16, borderRadius: 8, background: THEME.panelSoft }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft, marginBottom: 12 }}>
                Modifica Data e Orario
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 8 }}>
                    Data
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    style={{
                      width: "100%",
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
                
                <div>
                  <label style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 8 }}>
                    Orario Inizio
                  </label>
                  <select
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: "#fff",
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
                </div>
                
                <div>
                  <label style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 8 }}>
                    Durata
                  </label>
                  <select
                    value={editDuration}
                    onChange={(e) => setEditDuration(e.target.value as "1" | "1.5" | "2")}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: "#fff",
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
                </div>
              </div>
              
              <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 900, marginTop: 8 }}>
                Nuovo orario: {editDate && editStartTime ? 
                  `${editDate.split('-').reverse().join('/')} alle ${editStartTime}` : 
                  "Seleziona data e orario"}
              </div>
            </div>

            <div style={{ marginBottom: 20, border: `1px solid ${THEME.border}`, padding: 16, borderRadius: 8, background: THEME.panelSoft }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft, marginBottom: 12 }}>
                Trattamento e Prezzo
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 8 }}>
                    Trattamento
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setEditTreatmentType("seduta")}
                      style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: `1px solid ${editTreatmentType === "seduta" ? THEME.blueDark : THEME.borderSoft}`,
                        background: editTreatmentType === "seduta" ? THEME.blue : "#fff",
                        color: editTreatmentType === "seduta" ? "#fff" : THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      Seduta
                    </button>
                    <button
                      onClick={() => setEditTreatmentType("macchinario")}
                      style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: `1px solid ${editTreatmentType === "macchinario" ? THEME.blueDark : THEME.borderSoft}`,
                        background: editTreatmentType === "macchinario" ? THEME.blue : "#fff",
                        color: editTreatmentType === "macchinario" ? "#fff" : THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      Solo Macchinario
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 8 }}>
                    Fatturazione
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setEditPriceType("invoiced")}
                      style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: `1px solid ${editPriceType === "invoiced" ? THEME.greenDark : THEME.borderSoft}`,
                        background: editPriceType === "invoiced" ? THEME.green : "#fff",
                        color: editPriceType === "invoiced" ? "#fff" : THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      Fatturato
                    </button>
                    <button
                      onClick={() => setEditPriceType("cash")}
                      style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: `1px solid ${editPriceType === "cash" ? THEME.amber : THEME.borderSoft}`,
                        background: editPriceType === "cash" ? "rgba(249,115,22,0.1)" : "#fff",
                        color: editPriceType === "cash" ? THEME.amber : THEME.text,
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      Contanti
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted, marginBottom: 8 }}>
                  Importo (€)
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={editAmount}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9.,]/g, '');
                      setEditAmount(value);
                    }}
                    placeholder="Importo personalizzato(lasciare vuoto per prezzo standard)"
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
                  <button
                    onClick={() => {
                      const standardPrice = editTreatmentType === "seduta" 
                        ? (editPriceType === "invoiced" ? "40" : "35")
                        : (editPriceType === "invoiced" ? "25" : "20");
                      setEditAmount(standardPrice);
                    }}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelSoft,
                      color: THEME.text,
                      cursor: "pointer",
                      fontWeight: 900,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Usa standard
                  </button>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: THEME.muted, fontWeight: 900 }}>
                  {editAmount ? `Totale: € ${parseFloat(editAmount.replace(',', '.')).toFixed(2)}` : 
                   `Prezzo standard: € ${editTreatmentType === "seduta" 
                     ? (editPriceType === "invoiced" ? "40.00" : "35.00")
                     : (editPriceType === "invoiced" ? "25.00" : "20.00")}`}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: THEME.muted }}>Colore personalizzato:</div>
                <input
                  type="color"
                  value={eventColors[selectedEvent?.patient_id || ""] || getEventColor(events.find((e: any) => e.id === selectedEvent?.id) || { status: "booked" })}
                  onChange={(e) => {
                    if (selectedEvent?.patient_id) {
                      setEventColors((prev: any) => ({
                        ...prev,
                        [selectedEvent.patient_id!]: e.target.value
                      }));
                    }
                  }}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    border: `1px solid ${THEME.border}`,
                    cursor: "pointer",
                  }}
                />
                <button
                  onClick={() => {
                    if (selectedEvent?.patient_id) {
                      setEventColors((prev: any) => {
                        const newColors = { ...prev };
                        delete newColors[selectedEvent.patient_id!];
                        return newColors;
                      });
                    }
                  }}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: `1px solid ${THEME.borderSoft}`,
                    background: THEME.panelSoft,
                    color: THEME.text,
                    fontSize: 11,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Reset
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 900, color: THEME.textSoft, marginBottom: 8 }}>
                  Stato
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
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
                  >
                    <option value="booked">Prenotato</option>
                    <option value="confirmed">Confermato</option>
                    <option value="done">Eseguito</option>
                    <option value="not_paid">Non pagata</option>
                    <option value="cancelled">Annullato</option>
                  </select>
                </label>
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft, marginBottom: 8 }}>
                  Promemoria
                </div>
                <button
                  onClick={() => {
                    const event = events.find((e: any) => e.id === selectedEvent.id);
                    if (event) {
                      sendReminder(event.id, event.patient_phone ?? undefined, event.patient_first_name ?? undefined);
                    }
                  }}
                  disabled={!events.find((e: any) => e.id === selectedEvent.id)?.patient_phone}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: 8,
                    border: `1px solid ${THEME.greenDark}`,
                    background: "#25d366",
                    color: "#fff",
                    cursor: events.find((e: any) => e.id === selectedEvent.id)?.patient_phone ? "pointer" : "not-allowed",
                    fontWeight: 900,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    opacity: events.find((e: any) => e.id === selectedEvent.id)?.patient_phone ? 1 : 0.6,
                  }}
                >
                  <span>📱</span>
                  Invia promemoria WhatsApp
                </button>
              </div>
            </div>

            <label style={{ display: "block", fontSize: 13, fontWeight: 900, color: THEME.textSoft, marginBottom: 20 }}>
              Nota
              <textarea
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                rows={4}
                style={{
                  width: "100%",
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: "#fff",
                  color: THEME.text,
                  outline: "none",
                  resize: "vertical",
                  fontWeight: 800,
                  fontSize: 13,
                }}
              />
            </label>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
              <button
                onClick={deleteAppointment}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: `1px solid rgba(220,38,38,0.40)`,
                  background: "rgba(220,38,38,0.08)",
                  color: THEME.red,
                  cursor: "pointer",
                  fontWeight: 900,
                  minWidth: 120,
                  fontSize: 13,
                }}
              >
                Elimina
              </button>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Link
                  href={selectedEvent.patient_id ? `/patients/${selectedEvent.patient_id}` : "#"}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 8,
                    border: `1px solid ${THEME.borderSoft}`,
                    background: THEME.panelSoft,
                    color: THEME.text,
                    fontWeight: 900,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    minWidth: 170,
                    justifyContent: "center",
                    opacity: selectedEvent.patient_id ? 1 : 0.5,
                    pointerEvents: selectedEvent.patient_id ? "auto" : "none",
                    fontSize: 13,
                  }}
                >
                  Scheda paziente
                </Link>

                <button
                  onClick={saveAppointment}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 8,
                    border: `1px solid ${THEME.greenDark}`,
                    background: THEME.green,
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                    minWidth: 140,
                    fontSize: 13,
                  }}
                >
                  Salva modifiche
                </button>
              </div>
            </div>

            <div style={{ marginTop: 16, fontSize: 12, color: THEME.muted, fontWeight: 900 }}>
              Nota: "Annullato" mantiene lo storico · "Elimina" rimuove dal DB.
            </div>
          </div>
        </div>
  );
}





