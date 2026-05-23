// ═══════════════════════════════════════════════════════════════════════
// src/components/certificates/AttendanceCertificateDialog.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Modale per generare un attestato di presenza CUMULATIVO dalla scheda
// paziente. Usato sia dal layout desktop (`app/(protected)/patients/[id]`)
// sia dal layout mobile (`app/mobile/(protected)/patients/[id]`).
//
// Funzionalità:
//   • Filtro per range di date (dal/al) — precompilato con la finestra
//     che copre TUTTI gli appuntamenti del paziente
//   • Lista appuntamenti dentro il range con checkbox per
//     selezionare/deselezionare singolarmente
//   • Bottoni "Seleziona tutti" / "Deseleziona tutti"
//   • Mostra conteggio sedute selezionate in basso
//   • Bottone "Genera PDF" che chiama generateMultiCertificate
//
// Filtra di default solo gli appuntamenti effettivamente svolti
// (status === "done"), perché l'attestato di presenza ha senso solo per
// le sedute concluse.
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useMemo, useState } from "react";
import { generateMultiCertificate } from "@/src/lib/certificateLoader";

// Tipo minimo richiesto: tutti gli appuntamenti del paziente
export type AppointmentLite = {
  id: string;
  start_at: string;        // ISO
  status: string;          // "done", "scheduled", ...
  treatment_type?: string | null;
};

export type AttendanceCertificateDialogProps = {
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  appointments: AppointmentLite[];
  onClose: () => void;
  /** Variante mobile: layout più compatto */
  mobile?: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function fmtDateLong(d: Date): string {
  return d
    .toLocaleDateString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    .replace(/^./, (c) => c.toUpperCase());
}

// ── Component ────────────────────────────────────────────────────────────

export default function AttendanceCertificateDialog({
  patientId,
  patientFirstName,
  patientLastName,
  appointments,
  onClose,
  mobile = false,
}: AttendanceCertificateDialogProps) {
  // Considero solo appuntamenti "done"
  const doneAppts = useMemo(
    () =>
      appointments
        .filter((a) => a.status === "done")
        .sort(
          (a, b) =>
            new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
        ),
    [appointments]
  );

  // Range date: default = primo → ultimo appuntamento done
  const defaultFrom = doneAppts.length > 0
    ? ymd(new Date(doneAppts[0].start_at))
    : ymd(new Date());
  const defaultTo = doneAppts.length > 0
    ? ymd(new Date(doneAppts[doneAppts.length - 1].start_at))
    : ymd(new Date());

  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);

  // Set di id selezionati (default = tutti gli appuntamenti dentro il range)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const s = new Set<string>();
    doneAppts.forEach((a) => s.add(a.id));
    return s;
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Filtro per range corrente (recalcolato a ogni cambio data)
  const filteredAppts = useMemo(() => {
    if (!fromDate || !toDate) return doneAppts;
    const from = new Date(fromDate + "T00:00:00").getTime();
    const to = new Date(toDate + "T23:59:59").getTime();
    return doneAppts.filter((a) => {
      const t = new Date(a.start_at).getTime();
      return t >= from && t <= to;
    });
  }, [doneAppts, fromDate, toDate]);

  // Quando cambia il range, aggiorno la selezione: tutti dentro il range
  // selezionati di default, tutti fuori rimossi.
  useEffect(() => {
    setSelectedIds(new Set(filteredAppts.map((a) => a.id)));
  }, [filteredAppts]);

  const selectedCount = selectedIds.size;

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(filteredAppts.map((a) => a.id)));
  }
  function deselectAll() {
    setSelectedIds(new Set());
  }

  async function handleGenerate() {
    if (selectedCount === 0) {
      setError("Seleziona almeno una data");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const dates = filteredAppts
        .filter((a) => selectedIds.has(a.id))
        .map((a) => ({
          date: new Date(a.start_at),
          treatmentLabel:
            a.treatment_type === "macchinario"
              ? "Seduta strumentale"
              : "Fisioterapia",
        }));

      await generateMultiCertificate({
        patientId,
        dates,
      });
      // Chiudo dopo il download
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore generazione attestato");
    } finally {
      setBusy(false);
    }
  }

  // ── UI styles (inline per restare consistente col resto del progetto) ───
  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.55)",
    display: "flex",
    alignItems: mobile ? "flex-end" : "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: mobile ? 0 : 16,
  };
  const dialogStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: mobile ? "16px 16px 0 0" : 12,
    width: mobile ? "100%" : "min(640px, 100%)",
    maxHeight: mobile ? "90vh" : "85vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
  };
  const headerStyle: React.CSSProperties = {
    padding: "16px 20px",
    borderBottom: "1px solid #e2e8f0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };
  const bodyStyle: React.CSSProperties = {
    padding: 20,
    overflow: "auto",
    flex: 1,
  };
  const footerStyle: React.CSSProperties = {
    padding: "14px 20px",
    borderTop: "1px solid #e2e8f0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    background: "#f8fafc",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "#64748b",
    display: "block",
    marginBottom: 4,
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#fff",
    fontSize: 14,
    color: "#0f172a",
    outline: "none",
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
              📄 Attestato di presenza
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              {patientFirstName} {patientLastName}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 22,
              cursor: "pointer",
              color: "#64748b",
              lineHeight: 1,
            }}
            aria-label="Chiudi"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {doneAppts.length === 0 ? (
            <div
              style={{
                padding: 30,
                textAlign: "center",
                color: "#64748b",
                fontSize: 14,
              }}
            >
              Nessuna seduta completata per questo paziente.
              <br />
              L'attestato si può generare solo per appuntamenti svolti.
            </div>
          ) : (
            <>
              {/* Range date */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: mobile ? "1fr 1fr" : "1fr 1fr",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div>
                  <label style={labelStyle}>Dal</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Al</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Toolbar selezione */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                  fontSize: 12,
                  color: "#64748b",
                }}
              >
                <span>
                  {filteredAppts.length} sedut
                  {filteredAppts.length === 1 ? "a" : "e"} nel periodo
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={selectAll}
                    style={{
                      background: "transparent",
                      border: "1px solid #cbd5e1",
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 12,
                      cursor: "pointer",
                      color: "#0f172a",
                    }}
                  >
                    Tutti
                  </button>
                  <button
                    onClick={deselectAll}
                    style={{
                      background: "transparent",
                      border: "1px solid #cbd5e1",
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 12,
                      cursor: "pointer",
                      color: "#0f172a",
                    }}
                  >
                    Nessuno
                  </button>
                </div>
              </div>

              {/* Lista con checkbox */}
              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                {filteredAppts.length === 0 ? (
                  <div
                    style={{
                      padding: 20,
                      textAlign: "center",
                      color: "#94a3b8",
                      fontSize: 13,
                    }}
                  >
                    Nessuna seduta nel range selezionato.
                  </div>
                ) : (
                  filteredAppts.map((a, i) => {
                    const checked = selectedIds.has(a.id);
                    const date = new Date(a.start_at);
                    return (
                      <label
                        key={a.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "10px 12px",
                          cursor: "pointer",
                          borderTop: i === 0 ? "none" : "1px solid #f1f5f9",
                          background: checked ? "#f0fdfa" : "#fff",
                          transition: "background 0.1s",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(a.id)}
                          style={{
                            marginRight: 12,
                            width: 18,
                            height: 18,
                            cursor: "pointer",
                          }}
                        />
                        <span
                          style={{
                            fontSize: 14,
                            color: "#0f172a",
                            fontWeight: checked ? 600 : 400,
                          }}
                        >
                          {fmtDateLong(date)}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              {error && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "8px 12px",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#dc2626",
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                >
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <div style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>
            {selectedCount} sedut{selectedCount === 1 ? "a" : "e"} selezionat
            {selectedCount === 1 ? "a" : "e"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              disabled={busy}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#0f172a",
                fontWeight: 600,
                cursor: busy ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              Annulla
            </button>
            <button
              onClick={handleGenerate}
              disabled={busy || selectedCount === 0 || doneAppts.length === 0}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: "1px solid #0d9488",
                background:
                  busy || selectedCount === 0 || doneAppts.length === 0
                    ? "#94a3b8"
                    : "#0d9488",
                color: "#fff",
                fontWeight: 700,
                cursor:
                  busy || selectedCount === 0 || doneAppts.length === 0
                    ? "not-allowed"
                    : "pointer",
                fontSize: 13,
              }}
            >
              {busy ? "Genero…" : "📄 Genera PDF"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
