// app/(protected)/components/dashboard/RightInsightSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Colonna destra (insight) della dashboard:
//   1. Prenotazioni dal sito (lista compatta cliccabile)
//   2. Stats settimana vs scorsa
//   3. Da ricontattare (pazienti inattivi)
//   4. Pazienti recenti
// ═══════════════════════════════════════════════════════════════════════

"use client";

import Link from "next/link";
import { THEME } from "./shared/theme";
import NotificationsCard from "@/src/components/NotificationsCard";
import { usePrivacyMode, useDisplayPatientPhone, usePrivacyDisplay } from "@/src/contexts/PrivacyModeContext";
import {
  fmtDate, fmtPhone, money, openWA, patientName, pickPatient,
} from "./shared/utils";
import type {
  AppointmentRow, InactivePatientRow, WebBooking, WeekStats,
} from "./shared/types";

export type RightInsightSectionProps = {
  // Prenotazioni web
  webBookings: WebBooking[];
  webBookingActionId: string | null;
  onRefreshWebBookings: () => void;
  onOpenWebPopup: (b: WebBooking) => void;
  onConfirmWebBooking: (b: WebBooking) => void;

  // Stats settimana
  weekStats: WeekStats;

  // Da ricontattare
  inactiveThreshold: 30 | 45 | 60;
  setInactiveThreshold: (v: 30 | 45 | 60) => void;
  inactiveLoading: boolean;
  inactivePatients: InactivePatientRow[];
  contactedPatients: Set<string>;
  setContactedPatients: React.Dispatch<React.SetStateAction<Set<string>>>;

  // Pazienti recenti
  recentPatients: AppointmentRow[];

  // Toggle UI legacy: mostra card "Prenotazioni dal sito" (default false)
  showBookingCard?: boolean;
};

export default function RightInsightSection(p: RightInsightSectionProps) {
  const { privacyMode } = usePrivacyMode();
  const displayPhone = useDisplayPatientPhone();
  const { maskName } = usePrivacyDisplay();
  const pendingCount = p.webBookings.filter(b => b.status === "pending").length;
  const visibleInactive = p.inactivePatients.filter(pt => !p.contactedPatients.has(pt.patient_id));

  return (
    <div className="col-right">

      {/* ─── NOTIFICHE PAZIENTI o PRENOTAZIONI WEB (in base al toggle studio) ─── */}
      {p.showBookingCard ? (
        // Card "Prenotazioni dal sito" (legacy, attivabile dalle impostazioni)
        <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${THEME.border}`, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ background: "linear-gradient(135deg,#7c3aed,#2563eb)", padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: "#fff" }}>🌐 Prenotazioni dal sito</span>
              {pendingCount > 0 && (
                <span style={{ fontSize: 10, fontWeight: 800, color: "#7c3aed", background: "#facc15", borderRadius: 99, padding: "1px 7px" }}>{pendingCount}</span>
              )}
            </div>
            <button onClick={p.onRefreshWebBookings} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 5, padding: "3px 8px", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>↻</button>
          </div>
          {p.webBookings.length === 0 ? (
            <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12, color: THEME.muted }}>Nessuna prenotazione ricevuta</div>
          ) : (
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {p.webBookings.map(b => {
                const isPending   = b.status === "pending";
                const isConfirmed = b.status === "confirmed";
                const badgeStyle: React.CSSProperties = isPending
                  ? { background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa" }
                  : isConfirmed
                    ? { background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }
                    : { background: "#f8fafc", color: "#94a3b8", border: "1px solid #e2e8f0" };
                const badgeLabel = isPending ? "In attesa" : isConfirmed ? "Confermata" : "Annullata";
                const dateStr = new Date(b.requested_date + "T12:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short" });

                return (
                  <div
                    key={b.id}
                    onClick={() => p.onOpenWebPopup(b)}
                    style={{ padding: "10px 14px", borderBottom: `1px solid ${THEME.border}`, cursor: "pointer", opacity: b.status === "cancelled" ? 0.6 : 1 }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: THEME.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{privacyMode ? maskName(b.patient_name) : b.patient_name}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: THEME.teal, flexShrink: 0, marginLeft: 8 }}>{dateStr} {b.requested_time.slice(0, 5)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, color: THEME.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.service_name}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, borderRadius: 99, padding: "1px 7px", ...badgeStyle }}>{badgeLabel}</span>
                    </div>
                    {isPending && (
                      <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                        <button
                          onClick={e => { e.stopPropagation(); p.onConfirmWebBooking(b); }}
                          disabled={!!p.webBookingActionId}
                          style={{ flex: 1, padding: "5px", border: "none", borderRadius: 6, background: THEME.teal, color: "#fff", fontWeight: 700, fontSize: 10, cursor: "pointer", opacity: p.webBookingActionId ? 0.6 : 1 }}
                        >
                          ✓ Conferma
                        </button>
                        <a
                          href={`tel:${b.patient_phone}`}
                          onClick={e => e.stopPropagation()}
                          style={{ flex: 1, padding: "5px", border: `1px solid ${THEME.border}`, borderRadius: 6, background: "#fff", color: THEME.text, fontWeight: 700, fontSize: 10, cursor: "pointer", textDecoration: "none", textAlign: "center" }}
                        >
                          📞 {b.patient_phone}
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        // Default: card "Notifiche pazienti" (Fase N2)
        <div style={{ marginBottom: 12 }}>
          <NotificationsCard />
        </div>
      )}

      {/* ─── STATS SETTIMANA ───────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${THEME.border}`, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${THEME.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: THEME.text }}>Settimana</span>
          <span style={{ fontSize: 11, color: THEME.muted }}>vs scorsa</span>
        </div>
        <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { label: "Eseguite",      curr: p.weekStats.this.done,    prev: p.weekStats.last.done,    fmt: (n: number) => String(n), warn: false },
            { label: "Non pagate",    curr: p.weekStats.this.notPaid, prev: p.weekStats.last.notPaid, fmt: (n: number) => String(n), warn: true  },
            { label: "Totale atteso", curr: p.weekStats.this.expected, prev: p.weekStats.last.expected, fmt: money,                   warn: false },
          ].map(k => {
            const dir   = k.curr === k.prev ? "flat" : k.curr > k.prev ? "up" : "down";
            const d     = k.prev === 0 ? (k.curr === 0 ? 0 : 100) : ((k.curr - k.prev) / k.prev) * 100;
            const shown = Math.round(Math.abs(d));
            const isGood = k.warn ? dir === "down" : dir === "up";
            const dc    = dir === "flat" ? THEME.muted : isGood ? THEME.green : THEME.red;
            return (
              <div key={k.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 7, background: THEME.panelSoft }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: THEME.text }}>{k.label}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: THEME.text }}>{k.fmt(k.curr)}</span>
                  {dir !== "flat" && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: dc, background: `${dc}18`, padding: "1px 5px", borderRadius: 3 }}>
                      {dir === "up" ? "↑" : "↓"}{shown}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── DA RICONTATTARE ───────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${THEME.border}`, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${THEME.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 12, color: THEME.text }}>Da ricontattare</span>
            <div style={{ fontSize: 10, color: THEME.muted, marginTop: 1 }}>assenti &gt;{p.inactiveThreshold}gg</div>
          </div>
          <div style={{ display: "flex", border: `1px solid ${THEME.border}`, borderRadius: 5, overflow: "hidden" }}>
            {([30, 45, 60] as const).map(d => (
              <button key={d} onClick={() => p.setInactiveThreshold(d)} style={{ padding: "3px 8px", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, background: p.inactiveThreshold === d ? THEME.amber : "#fff", color: p.inactiveThreshold === d ? "#fff" : THEME.muted }}>
                {d}g
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: "8px 12px", maxHeight: 280, overflowY: "auto" }}>
          {p.inactiveLoading ? (
            <div style={{ color: THEME.muted, fontSize: 12, padding: "10px 0" }}>Caricamento…</div>
          ) : visibleInactive.length === 0 ? (
            <div style={{ color: THEME.muted, fontSize: 12, textAlign: "center", padding: "14px 0" }}>Nessun paziente da rincorrere.</div>
          ) : (
            visibleInactive.map((pt, i, arr) => (
              <div key={pt.patient_id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 4px", borderBottom: i < arr.length - 1 ? `1px solid ${THEME.border}` : "none" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Link href={`/patients/${pt.patient_id}`} style={{ fontWeight: 600, fontSize: 12, color: THEME.text, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {privacyMode ? maskName(pt) : ((pt.last_name + " " + pt.first_name).trim() || "Paziente")}
                  </Link>
                  <div style={{ fontSize: 10, color: THEME.amber, marginTop: 1 }}>{pt.days_since_last}gg · {fmtDate(pt.last_done_at)}</div>
                  {pt.phone && <a href={`tel:${pt.phone}`} style={{ fontSize: 10, color: THEME.blue, display: "block", marginTop: 1 }}>{displayPhone(pt.phone)}</a>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
                  {pt.phone && (
                    <button
                      onClick={() => {
                        const c = fmtPhone(pt.phone!);
                        if (!c) return;
                        const msg = `Ciao ${pt.first_name || ""}, come stai? Ti scrivo per sapere se vuoi prenotare una seduta.`;
                        openWA(pt.phone!, msg);
                      }}
                      style={{ padding: "3px 7px", borderRadius: 4, border: "none", background: THEME.green, color: "#fff", fontWeight: 700, fontSize: 10, cursor: "pointer" }}
                    >
                      WA
                    </button>
                  )}
                  <button
                    onClick={() => p.setContactedPatients(prev => new Set([...prev, pt.patient_id]))}
                    style={{ padding: "3px 7px", borderRadius: 4, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.muted, fontWeight: 600, fontSize: 10, cursor: "pointer" }}
                  >
                    ✓
                  </button>
                </div>
              </div>
            ))
          )}
          {p.contactedPatients.size > 0 && (
            <button onClick={() => p.setContactedPatients(new Set())} style={{ width: "100%", marginTop: 6, padding: "4px 0", border: "none", background: "transparent", color: THEME.muted, fontSize: 10, cursor: "pointer" }}>
              Ripristina {p.contactedPatients.size} nascosti
            </button>
          )}
        </div>
      </div>

      {/* ─── PAZIENTI RECENTI ──────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${THEME.border}`, overflow: "hidden" }}>
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${THEME.border}` }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: THEME.text }}>Pazienti recenti</span>
        </div>
        <div style={{ padding: "4px 0" }}>
          {p.recentPatients.map((a, i) => (
            <div key={a.patient_id} className="rh ar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: i < p.recentPatients.length - 1 ? `1px solid ${THEME.border}` : "none" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <Link href={`/patients/${a.patient_id}`} style={{ fontWeight: 600, fontSize: 12, color: THEME.text, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {privacyMode ? maskName(pickPatient(a.patients)) : patientName(a.patients)}
                </Link>
                <div style={{ fontSize: 10, color: THEME.muted, marginTop: 1 }}>{fmtDate(a.start_at)}</div>
              </div>
              <Link href={`/patients/${a.patient_id}`} style={{ fontSize: 11, color: THEME.blue, fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>→</Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
