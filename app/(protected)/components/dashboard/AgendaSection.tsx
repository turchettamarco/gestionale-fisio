// app/(protected)/components/dashboard/AgendaSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Colonna centrale: Agenda con tab (Oggi / 7 giorni / Settimana) e righe
// appuntamento espandibili con azioni (eseguito, incassa, WA, note, etc.).
// ═══════════════════════════════════════════════════════════════════════

"use client";

import Link from "next/link";
import { THEME } from "./shared/theme";
import {
  fmtTime, fmtWeekday, formatDateRelative,
  patientName, pickPatient,
} from "./shared/utils";
import { StatusPill } from "./shared/StatusPill";
import type { AppointmentRow, Bucket, Status } from "./shared/types";
import PaidPill from "@/src/components/PaidPill";
import { usePrivacyMode, usePrivacyDisplay } from "@/src/contexts/PrivacyModeContext";
import type { PaymentMethod } from "@/src/components/PaidPopover";

export type AgendaSectionProps = {
  loading: boolean;
  tab: "today" | "next7" | "thisWeek";
  setTab: (v: "today" | "next7" | "thisWeek") => void;
  activeBuckets: Bucket[];

  expandedId: string | null;
  setExpandedId: (id: string | null) => void;

  rowNotes: Record<string, string>;
  setRowNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;

  busyRow: Record<string, boolean>;
  savingNote: string | null;

  onSetStatus: (id: string, next: Status) => void;
  onTogglePaid: (id: string, isPaid: boolean) => void;
  onUpdatePayment?: (
    id: string,
    next: {
      is_paid: boolean;
      paid_at: string | null;
      payment_method: PaymentMethod | null;
    }
  ) => Promise<void> | void;
  onSendWA: (a: AppointmentRow) => void;
  onSaveNote: (id: string) => void;
};

export default function AgendaSection(p: AgendaSectionProps) {
  const { privacyMode } = usePrivacyMode();
  const { maskName } = usePrivacyDisplay();
  const tabs = [
    { key: "today",    label: "Oggi"      },
    { key: "next7",    label: "7 giorni"  },
    { key: "thisWeek", label: "Settimana" },
  ] as const;

  return (
    <div>
      <div style={{ background: "#fff", borderRadius: 14, border: `1px solid ${THEME.border}`, boxShadow: "0 1px 6px rgba(15,23,42,0.04)", overflow: "hidden" }}>

        {/* Toolbar */}
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${THEME.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: THEME.text, flex: 1 }}>Agenda</span>
          <div style={{ display: "flex", border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: "hidden" }}>
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => p.setTab(t.key)}
                style={{ padding: "6px 14px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: p.tab === t.key ? THEME.teal : "#fff", color: p.tab === t.key ? "#fff" : THEME.muted, transition: "background 0.15s" }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div style={{ padding: "8px 0" }}>
          {p.loading ? (
            <div style={{ padding: "32px 18px", color: THEME.muted, fontSize: 13, textAlign: "center" }}>Caricamento…</div>
          ) : p.activeBuckets.length === 0 ? (
            <div style={{ padding: "48px 18px", color: THEME.muted, fontSize: 13, textAlign: "center", fontWeight: 500 }}>Nessun appuntamento per questo periodo.</div>
          ) : (
            p.activeBuckets.map(bucket => {
              const rel = formatDateRelative(bucket.date);
              return (
                <div key={bucket.dayKey}>
                  {/* Day separator */}
                  <div style={{ padding: "6px 18px 6px", display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: THEME.blue, textTransform: "capitalize" }}>{rel}</span>
                    <span style={{ fontSize: 11, color: THEME.muted }}>
                      {fmtWeekday(bucket.date)} · {bucket.date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
                    </span>
                    <div style={{ flex: 1, height: 1, background: THEME.border, marginLeft: 4 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: THEME.muted, background: THEME.panelSoft, padding: "1px 7px", borderRadius: 3 }}>{bucket.items.length}</span>
                  </div>

                  {bucket.items.map(a => {
                    const name   = privacyMode ? maskName(pickPatient(a.patients)) : patientName(a.patients);
                    const phone  = pickPatient(a.patients)?.phone || "";
                    const waSent = Boolean(a.whatsapp_sent_at);
                    const isExp  = p.expandedId === a.id;
                    const busy   = !!p.busyRow[a.id];
                    const isDone = a.status === "done";
                    const isPaid = !!a.is_paid;

                    return (
                      <div key={a.id}>
                        {/* Riga compatta */}
                        <div
                          className="ar rh"
                          style={{ padding: "9px 18px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", background: isExp ? "rgba(37,99,235,0.02)" : "transparent" }}
                          onClick={() => p.setExpandedId(isExp ? null : a.id)}
                        >
                          {/* Checkbox eseguito */}
                          <button
                            onClick={e => { e.stopPropagation(); p.onSetStatus(a.id, isDone ? "confirmed" : "done"); }}
                            disabled={busy || a.status === "cancelled"}
                            style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${isDone ? THEME.green : THEME.border}`, background: isDone ? THEME.green : "transparent", cursor: busy || a.status === "cancelled" ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                          >
                            {isDone && <span style={{ color: "#fff", fontSize: 9, fontWeight: 800, lineHeight: 1 }}>✓</span>}
                          </button>

                          {/* Ora */}
                          <span style={{ fontSize: 13, fontWeight: 700, color: isDone ? THEME.gray : THEME.blue, flexShrink: 0, width: 40, fontVariantNumeric: "tabular-nums" }}>
                            {fmtTime(a.start_at)}
                          </span>

                          {/* Nome + status */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                              <Link href={`/patients/${a.patient_id}`} onClick={e => e.stopPropagation()} style={{ fontWeight: 600, fontSize: 13, color: isDone ? THEME.muted : THEME.text, textDecoration: isDone ? "line-through" : "none" }}>
                                {name}
                              </Link>
                              <StatusPill status={a.status} />
                              {waSent && <span style={{ fontSize: 10, color: THEME.green, fontWeight: 700 }}>WA ✓</span>}
                            </div>
                            <div style={{ fontSize: 11, color: THEME.muted, marginTop: 1 }}>
                              {a.location === "studio" ? a.clinic_site || "Studio" : "Domicilio"}
                              {a.amount ? ` · ${a.amount}€` : ""}
                            </div>
                          </div>

                          {/* Pallino € */}
                          {a.status !== "cancelled" && (
                            <div
                              onClick={e => { e.stopPropagation(); if (isDone) p.onTogglePaid(a.id, !isPaid); }}
                              title={isPaid ? "Pagato" : "Non pagato"}
                              style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, border: `2px solid ${isPaid ? THEME.green : isDone ? THEME.red : THEME.border}`, background: isPaid ? THEME.green : isDone ? "rgba(220,38,38,0.06)" : "transparent", cursor: isDone ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center" }}
                            >
                              {isPaid && <span style={{ color: "#fff", fontSize: 9, fontWeight: 800 }}>€</span>}
                            </div>
                          )}

                          {/* WA rapido */}
                          {phone && a.status !== "cancelled" && (
                            <button
                              onClick={e => { e.stopPropagation(); p.onSendWA(a); }}
                              title={waSent ? "Promemoria già inviato — rinvia" : "Invia promemoria WhatsApp"}
                              style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: waSent ? "rgba(22,163,74,0.12)" : "#25d366", color: waSent ? THEME.green : "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                            >
                              {waSent ? "✓" : "WA"}
                            </button>
                          )}

                          <span style={{ color: THEME.muted, fontSize: 10, flexShrink: 0, transform: isExp ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
                        </div>

                        {/* PANNELLO ESPANSO */}
                        {isExp && (
                          <div className="fade-in" style={{ margin: "0 14px 8px", borderRadius: 10, background: THEME.panelSoft, border: `1px solid ${THEME.border}`, padding: "12px 14px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                              {[
                                { l: "Importo", v: a.amount ? `${a.amount}€` : "—" },
                                { l: "Tipo",    v: a.treatment_type || "—" },
                                { l: "Luogo",   v: a.location === "studio" ? a.clinic_site || "Studio" : `Dom. ${a.domicile_address || ""}` },
                              ].map(d => (
                                <div key={d.l} style={{ background: "#fff", borderRadius: 6, padding: "7px 10px", border: `1px solid ${THEME.border}` }}>
                                  <div style={{ fontSize: 10.5, color: "#8494ab", fontWeight: 600, marginBottom: 2 }}>{d.l}</div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: THEME.text }}>{d.v}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 10.5, color: "#8494ab", fontWeight: 600, marginBottom: 5 }}>Nota seduta</div>
                              <textarea
                                value={p.rowNotes[a.id] || ""}
                                onChange={e => p.setRowNotes(m => ({ ...m, [a.id]: e.target.value }))}
                                rows={2}
                                placeholder="Tecniche, esercizi, risposta del paziente…"
                                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: `1.5px solid ${THEME.border}`, fontSize: 12, resize: "vertical", outline: "none", background: "#fff", color: THEME.text, boxSizing: "border-box" }}
                                onClick={e => e.stopPropagation()}
                              />
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button onClick={e => { e.stopPropagation(); p.onSaveNote(a.id); }} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: THEME.teal, color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                                {p.savingNote === a.id ? "Salvo…" : "Salva nota"}
                              </button>
                              {!isDone && a.status !== "cancelled" && (
                                <button onClick={e => { e.stopPropagation(); p.onSetStatus(a.id, "done"); }} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: THEME.green, color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                                  Eseguito
                                </button>
                              )}
                              {isDone && p.onUpdatePayment && (
                                <PaidPill
                                  data={{
                                    is_paid: !!a.is_paid,
                                    paid_at: a.paid_at ?? null,
                                    payment_method: a.payment_method ?? null,
                                    price_type: a.price_type ?? null,
                                  }}
                                  onUpdate={async (next) => p.onUpdatePayment!(a.id, next)}
                                />
                              )}
                              {isDone && !p.onUpdatePayment && !isPaid && (
                                <button onClick={e => { e.stopPropagation(); p.onTogglePaid(a.id, true); }} style={{ padding: "6px 12px", borderRadius: 6, border: `1.5px solid ${THEME.green}`, background: "rgba(22,163,74,0.06)", color: THEME.green, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                                  Incassa
                                </button>
                              )}
                              {isDone && !p.onUpdatePayment && isPaid && (
                                <button onClick={e => { e.stopPropagation(); p.onTogglePaid(a.id, false); }} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.muted, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                                  Annulla pagamento
                                </button>
                              )}
                              {phone && (
                                <button onClick={e => { e.stopPropagation(); p.onSendWA(a); }} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.green, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                                  WA
                                </button>
                              )}
                              {a.status !== "cancelled" && (
                                <button onClick={e => { e.stopPropagation(); if (confirm("Annullare?")) p.onSetStatus(a.id, "cancelled"); }} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.red, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                                  Annulla
                                </button>
                              )}
                              <Link href={`/patients/${a.patient_id}`} onClick={e => e.stopPropagation()} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.blue, fontWeight: 700, fontSize: 11 }}>
                                Scheda →
                              </Link>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
