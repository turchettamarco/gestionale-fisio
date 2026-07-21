// app/(protected)/components/dashboard/LeftColumnSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Colonna sinistra della dashboard:
//   1. Card "Prossimo appuntamento" (con form di modifica orario)
//   2. "Oggi — prossimi" (resto della giornata)
//   3. "Domiciliari oggi"
//   4. "WhatsApp domani" (promemoria da inviare)
//   5. "Note del giorno" (post-it localStorage)
// ═══════════════════════════════════════════════════════════════════════

"use client";

import Link from "next/link";
import { THEME, inpStyle } from "./shared/theme";
import { fmtTime, pad2, patientName, pickPatient } from "./shared/utils";
import { usePrivacyMode, useDisplayPatientPhone, usePrivacyDisplay } from "@/src/contexts/PrivacyModeContext";
import { StatusPill } from "./shared/StatusPill";
import type { AppointmentRow, Status } from "./shared/types";
import PaidPill from "@/src/components/PaidPill";
import type { PaymentMethod } from "@/src/components/PaidPopover";

export type LeftColumnSectionProps = {
  // Prossimo
  focusNext: AppointmentRow | null;
  nextCountdown: string;

  // Form di modifica orario per "prossimo"
  editNextTime: boolean;
  setEditNextTime: (v: boolean) => void;
  editDate: string; setEditDate: (v: string) => void;
  editStart: string; setEditStart: (v: string) => void;
  editDuration: "0.5" | "0.75" | "1" | "1.5" | "2"; setEditDuration: (v: "0.5" | "0.75" | "1" | "1.5" | "2") => void;
  savingTime: boolean;
  onSaveNextTime: () => void;

  // Azioni su appuntamenti
  onSetStatus: (id: string, next: Status) => void;
  onTogglePaid: (id: string, isPaid: boolean) => void;
  /** Nuovo handler completo: scrive is_paid + paid_at + payment_method coerentemente. */
  onUpdatePayment?: (
    id: string,
    next: {
      is_paid: boolean;
      paid_at: string | null;
      payment_method: PaymentMethod | null;
    }
  ) => Promise<void> | void;
  onSendWA: (a: AppointmentRow) => void;

  // Resto di oggi
  remainingToday: AppointmentRow[];

  // Domiciliari oggi
  domicilesToday: AppointmentRow[];

  // WA domani
  tomorrowAppts: AppointmentRow[];
  remindersToSend: AppointmentRow[];

  // Note del giorno
  dayNote: string;
  onSaveDayNote: (val: string) => void;
};

export default function LeftColumnSection(p: LeftColumnSectionProps) {
  const { privacyMode } = usePrivacyMode();
  const displayPhone = useDisplayPatientPhone();
  const { maskName } = usePrivacyDisplay();
  return (
    <div>

      {/* ─── PROSSIMO APPUNTAMENTO ─────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 14, border: `1px solid ${THEME.border}`, boxShadow: "0 2px 12px rgba(15,23,42,0.07)", overflow: "hidden", marginBottom: 12 }}>
        <div style={{ background: "linear-gradient(135deg,#0c4a6e,#0d9488)", padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: 0.8 }}>Prossimo</span>
            {p.nextCountdown && (
              <span style={{ fontSize: 12, fontWeight: 700, color: "#86efac", background: "rgba(134,239,172,0.15)", padding: "2px 8px", borderRadius: 4 }}>{p.nextCountdown}</span>
            )}
          </div>
          {!p.focusNext ? (
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, padding: "8px 0" }}>Nessun appuntamento in arrivo</div>
          ) : (
            <>
              <div style={{ fontSize: 30, fontWeight: 900, color: "#fff", letterSpacing: -1, lineHeight: 1, marginBottom: 6 }}>{fmtTime(p.focusNext.start_at)}</div>
              <Link href={`/patients/${p.focusNext.patient_id}`} style={{ fontSize: 16, fontWeight: 700, color: "#fff", display: "block", marginBottom: 4 }}>{privacyMode ? maskName(pickPatient(p.focusNext.patients)) : patientName(p.focusNext.patients)}</Link>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                {p.focusNext.location === "studio" ? p.focusNext.clinic_site || "Studio" : `Domicilio — ${p.focusNext.domicile_address || "—"}`}
                {p.focusNext.amount ? ` · ${p.focusNext.amount}€` : ""}
              </div>
            </>
          )}
        </div>

        {p.focusNext && (
          <div style={{ padding: "12px 16px" }}>
            {!p.editNextTime ? (
              <>
                {/* Stato pagamento */}
                {p.onUpdatePayment ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: THEME.panelSoft, border: `1px solid ${THEME.border}` }}>
                    <PaidPill
                      data={{
                        is_paid: !!p.focusNext.is_paid,
                        paid_at: p.focusNext.paid_at ?? null,
                        payment_method: p.focusNext.payment_method ?? null,
                        price_type: p.focusNext.price_type ?? null,
                      }}
                      onUpdate={async (next) => p.onUpdatePayment!(p.focusNext!.id, next)}
                    />
                    <span style={{ flex: 1 }} />
                    <StatusPill status={p.focusNext.status} />
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: THEME.panelSoft, border: `1px solid ${THEME.border}` }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.focusNext.is_paid ? THEME.green : p.focusNext.status === "done" ? THEME.red : THEME.gray, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: THEME.muted, flex: 1 }}>
                      {p.focusNext.is_paid ? "Pagato" : p.focusNext.status === "done" ? "Non pagato" : "In attesa"}
                    </span>
                    <StatusPill status={p.focusNext.status} />
                  </div>
                )}

                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  <button
                    onClick={() => p.onSetStatus(p.focusNext!.id, p.focusNext!.status === "done" ? "confirmed" : "done")}
                    style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: "none", background: p.focusNext.status === "done" ? "rgba(22,163,74,0.10)" : THEME.teal, color: p.focusNext.status === "done" ? THEME.green : "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                  >
                    {p.focusNext.status === "done" ? "Annulla" : "Segna eseguito"}
                  </button>
                  {!p.onUpdatePayment && p.focusNext.status === "done" && !p.focusNext.is_paid && (
                    <button
                      onClick={() => p.onTogglePaid(p.focusNext!.id, true)}
                      style={{ padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${THEME.green}`, background: "rgba(22,163,74,0.06)", color: THEME.green, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                    >
                      Incassa
                    </button>
                  )}
                  {pickPatient(p.focusNext.patients)?.phone && (
                    <button
                      onClick={() => p.onSendWA(p.focusNext!)}
                      style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.green, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                    >
                      WA
                    </button>
                  )}
                  <button
                    onClick={() => { if (confirm("Annullare?")) p.onSetStatus(p.focusNext!.id, "cancelled"); }}
                    style={{ padding: "9px 10px", borderRadius: 8, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.red, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                  >
                    ✕
                  </button>
                </div>

                <button
                  onClick={() => {
                    const d = new Date(p.focusNext!.start_at);
                    p.setEditDate(d.toISOString().slice(0, 10));
                    p.setEditStart(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
                    p.setEditNextTime(true);
                  }}
                  style={{ width: "100%", marginTop: 8, padding: "6px", borderRadius: 6, border: `1px solid ${THEME.border}`, background: "transparent", color: THEME.muted, fontSize: 11, fontWeight: 600, cursor: "pointer", textAlign: "center" }}
                >
                  Modifica orario
                </button>
              </>
            ) : (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>DATA</div>
                    <input type="date" value={p.editDate} onChange={e => p.setEditDate(e.target.value)} style={{ ...inpStyle, width: "100%" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>ORARIO</div>
                    <input type="time" step={900} value={p.editStart} onChange={e => p.setEditStart(e.target.value)} style={{ ...inpStyle, width: "100%" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>DURATA</div>
                    <select
                      value={p.editDuration}
                      onChange={e => p.setEditDuration(e.target.value as "0.5" | "0.75" | "1" | "1.5" | "2")}
                      style={{ ...inpStyle, width: "100%", appearance: "none" as const }}
                    >
                      <option value="0.5">30min</option>
                      <option value="0.75">45min</option>
                      <option value="1">1h</option>
                      <option value="1.5">1h30</option>
                      <option value="2">2h</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 7 }}>
                  <button onClick={p.onSaveNextTime} disabled={p.savingTime} style={{ flex: 1, padding: "8px", borderRadius: 7, border: "none", background: THEME.teal, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                    {p.savingTime ? "Salvo…" : "Salva"}
                  </button>
                  <button onClick={() => p.setEditNextTime(false)} style={{ padding: "8px 12px", borderRadius: 7, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.muted, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── RESTO DI OGGI ─────────────────────────────────────────── */}
      {p.remainingToday.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${THEME.border}`, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ padding: "11px 16px", borderBottom: `1px solid ${THEME.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: THEME.text }}>Oggi — prossimi</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: THEME.muted, background: THEME.panelSoft, padding: "2px 7px", borderRadius: 4 }}>{p.remainingToday.length}</span>
          </div>
          {p.remainingToday.map((a, i) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderBottom: i < p.remainingToday.length - 1 ? `1px solid ${THEME.border}` : "none" }}>
              <div>
                <Link href={`/patients/${a.patient_id}`} style={{ fontWeight: 600, fontSize: 13, color: THEME.text }}>{privacyMode ? maskName(pickPatient(a.patients)) : patientName(a.patients)}</Link>
                <div style={{ fontSize: 11, color: THEME.muted, marginTop: 1 }}>
                  {fmtTime(a.start_at)} · {a.location === "studio" ? a.clinic_site || "Studio" : "Dom."}
                </div>
              </div>
              <StatusPill status={a.status} />
            </div>
          ))}
        </div>
      )}

      {/* ─── DOMICILIARI ───────────────────────────────────────────── */}
      {p.domicilesToday.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${THEME.border}`, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ padding: "11px 16px", borderBottom: `1px solid ${THEME.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: THEME.text }}>Domiciliari oggi</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: THEME.amber, background: "rgba(249,115,22,0.08)", padding: "2px 7px", borderRadius: 4 }}>{p.domicilesToday.length}</span>
          </div>
          {p.domicilesToday.map((a, i) => (
            <div key={a.id} style={{ padding: "9px 14px", borderBottom: i < p.domicilesToday.length - 1 ? `1px solid ${THEME.border}` : "none" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <Link href={`/patients/${a.patient_id}`} style={{ fontWeight: 700, fontSize: 13, color: THEME.text }}>{privacyMode ? maskName(pickPatient(a.patients)) : patientName(a.patients)}</Link>
                  <div style={{ fontSize: 11, color: THEME.amber, marginTop: 2, fontWeight: 600 }}>📍 {a.domicile_address || "—"}</div>
                  {pickPatient(a.patients)?.phone && (
                    <a href={`tel:${pickPatient(a.patients)!.phone}`} style={{ fontSize: 11, color: THEME.blue, display: "block", marginTop: 2 }}>
                      {displayPhone(pickPatient(a.patients)!.phone)}
                    </a>
                  )}
                </div>
                <div style={{ flexShrink: 0, marginTop: 2 }}><StatusPill status={a.status} /></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── WHATSAPP DOMANI ───────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${THEME.border}`, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${THEME.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: THEME.text }}>WhatsApp domani</span>
          <span style={{ fontSize: 11, color: THEME.muted }}>{p.tomorrowAppts.length - p.remindersToSend.length}/{p.tomorrowAppts.length} inviati</span>
        </div>
        {p.remindersToSend.length === 0 ? (
          <div style={{ padding: "14px 16px", fontSize: 13, color: THEME.green, fontWeight: 600 }}>Tutti i promemoria inviati ✓</div>
        ) : (
          p.remindersToSend.map((a, i) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderBottom: i < p.remindersToSend.length - 1 ? `1px solid ${THEME.border}` : "none" }}>
              <div>
                <Link href={`/patients/${a.patient_id}`} style={{ fontWeight: 600, fontSize: 13, color: THEME.text }}>{privacyMode ? maskName(pickPatient(a.patients)) : patientName(a.patients)}</Link>
                <div style={{ fontSize: 11, color: THEME.amber, marginTop: 1 }}>{fmtTime(a.start_at)}</div>
              </div>
              <button
                onClick={() => p.onSendWA(a)}
                style={{ padding: "5px 11px", borderRadius: 6, border: "none", background: THEME.green, color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" }}
              >
                WA
              </button>
            </div>
          ))
        )}
      </div>

      {/* ─── POST-IT NOTE DEL GIORNO ───────────────────────────────── */}
      <div style={{ background: "#fffbeb", borderRadius: 12, border: "1px solid #fde68a", overflow: "hidden" }}>
        <div style={{ padding: "11px 16px", borderBottom: "1px solid #fde68a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: "#92400e" }}>Note del giorno</span>
          <span style={{ fontSize: 10, color: "#a16207", fontWeight: 500 }}>auto-salva</span>
        </div>
        <textarea
          value={p.dayNote}
          onChange={e => p.onSaveDayNote(e.target.value)}
          placeholder="Mario porta la RM · Chiamare Lucia · ..."
          rows={3}
          style={{ width: "100%", padding: "10px 14px", border: "none", background: "transparent", fontSize: 13, fontWeight: 500, resize: "vertical", outline: "none", color: "#78350f", boxSizing: "border-box" }}
        />
      </div>
    </div>
  );
}
