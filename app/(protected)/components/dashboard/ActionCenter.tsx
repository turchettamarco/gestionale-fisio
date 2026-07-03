"use client";
// app/(protected)/components/dashboard/ActionCenter.tsx
// ═══════════════════════════════════════════════════════════════════════
// Home v2 — "⚡ Da fare": UNA lista prioritizzata che consolida ciò che
// prima era sparso in sei card diverse:
//
//   ⚠️ sedute imminenti da confermare      → bottone Conferma
//   🌐 prenotazioni web in attesa          → bottone Apri
//   📲 promemoria WhatsApp per domani      → bottone Invia
//   💶 saldi aperti per paziente           → link alla cartella
//   📦 noleggi in scadenza                 → WhatsApp
//   🎂 compleanni di oggi                  → WhatsApp auguri
//   🚗 domicili di oggi (informativo)
//
// Vuota = "Tutto fatto ✨". È il cuore pratico della nuova home.
// ═══════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { THEME } from "./shared/theme";
import { fmtTime, money, openWA, patientName, pickPatient } from "./shared/utils";
import { usePrivacyMode, usePrivacyDisplay, useDisplayPatientPhone } from "@/src/contexts/PrivacyModeContext";
import type {
  AppointmentRow, Status, WebBooking, OpenBalanceGroup, NoleggioExpiring, BirthdayRow,
} from "./shared/types";

export type ActionCenterProps = {
  alertAppts: AppointmentRow[];
  remindersToSend: AppointmentRow[];
  onSendWA: (a: AppointmentRow) => void;
  onSetStatus: (id: string, s: Status) => void;
  showBookingCard: boolean;
  webBookings: WebBooking[];
  onOpenWebPopup: (b: WebBooking) => void;
  openBalanceGroups: OpenBalanceGroup[];
  loadingBalances: boolean;
  noleggioExpiring: NoleggioExpiring[];
  birthdays: BirthdayRow[];
  domicilesToday: AppointmentRow[];
};

type Item = {
  key: string;
  icon: string;
  color: string;      // colore accento del chip icona
  title: string;
  sub?: string;
  action?: { label: string; onClick?: () => void; href?: string };
};

function IconChip({ icon, color }: { icon: string; color: string }) {
  return (
    <span style={{
      width: 30, height: 30, borderRadius: 9, flexShrink: 0,
      background: `${color}14`, display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: 14,
    }}>{icon}</span>
  );
}

import { useState } from "react";

export default function ActionCenter(p: ActionCenterProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const { privacyMode } = usePrivacyMode();
  const { maskName } = usePrivacyDisplay();
  const displayPhone = useDisplayPatientPhone();
  void displayPhone;

  const nameOf = (a: AppointmentRow) =>
    privacyMode ? maskName(pickPatient(a.patients)) : patientName(a.patients);
  const maskFree = (full: string) =>
    privacyMode ? maskName(full) : full;

  const items: Item[] = [];

  // ⚠️ Conferme urgenti (entro 60')
  for (const a of p.alertAppts) {
    items.push({
      key: `conf-${a.id}`, icon: "⚠️", color: "#f97316",
      title: `Conferma ${nameOf(a)}`,
      sub: `seduta alle ${fmtTime(a.start_at)} · entro 1 ora`,
      action: { label: "Conferma", onClick: () => p.onSetStatus(a.id, "confirmed") },
    });
  }

  // 🌐 Prenotazioni web pending
  if (p.showBookingCard) {
    for (const b of p.webBookings.filter(x => x.status === "pending").slice(0, 4)) {
      items.push({
        key: `web-${b.id}`, icon: "🌐", color: "#7c3aed",
        title: `Prenotazione dal sito: ${maskFree(b.patient_name)}`,
        sub: `${b.requested_date.slice(5).replace("-", "/")} alle ${b.requested_time.slice(0, 5)} · ${b.service_name}`,
        action: { label: "Apri", onClick: () => p.onOpenWebPopup(b) },
      });
    }
  }

  // 📲 Promemoria WhatsApp per domani
  const rem = p.remindersToSend.slice(0, 5);
  for (const a of rem) {
    items.push({
      key: `rem-${a.id}`, icon: "📲", color: "#16a34a",
      title: `Promemoria a ${nameOf(a)}`,
      sub: `domani alle ${fmtTime(a.start_at)}`,
      action: { label: "Invia", onClick: () => p.onSendWA(a) },
    });
  }
  if (p.remindersToSend.length > 5) {
    items.push({
      key: "rem-more", icon: "📲", color: "#16a34a",
      title: `…e altri ${p.remindersToSend.length - 5} promemoria per domani`,
    });
  }

  // 💶 Saldi aperti (top 3 per importo)
  const balances = [...p.openBalanceGroups].sort((a, b) => b.total - a.total).slice(0, 3);
  for (const g of balances) {
    items.push({
      key: `bal-${g.patient_id}`, icon: "💶", color: "#dc2626",
      title: `${maskFree(g.patient_name)} · ${money(g.total)} da incassare`,
      sub: `${g.sessions} sedut${g.sessions === 1 ? "a" : "e"} non pagat${g.sessions === 1 ? "a" : "e"}`,
      action: { label: "Apri", href: `/patients/${g.patient_id}` },
    });
  }

  // 📦 Noleggi in scadenza (top 3)
  for (const n of p.noleggioExpiring.slice(0, 3)) {
    items.push({
      key: `nol-${n.id}`, icon: "📦", color: "#2563eb",
      title: `${n.device_name} · ${maskFree(n.patient_name)}`,
      sub: n.days_remaining <= 0 ? "scade oggi" : `scade tra ${n.days_remaining} giorn${n.days_remaining === 1 ? "o" : "i"}`,
      action: n.patient_phone ? {
        label: "📲",
        onClick: () => openWA(n.patient_phone!, `Ciao! Ti ricordo che il noleggio ${n.device_name} è in scadenza. Fammi sapere se vuoi prolungarlo o organizzare il ritiro. 🙂`),
      } : undefined,
    });
  }

  // 🎂 Compleanni di oggi
  for (const b of p.birthdays.filter(x => x.isToday).slice(0, 3)) {
    items.push({
      key: `bday-${b.patient_id}`, icon: "🎂", color: "#db2777",
      title: `Compleanno di ${maskFree(b.name)} (${b.age})`,
      action: b.phone ? {
        label: "🎉 Auguri",
        onClick: () => openWA(b.phone!, `Tanti auguri di buon compleanno, ${b.first_name}! 🎂🎉`),
      } : undefined,
    });
  }

  // 🚗 Domicili di oggi (informativo)
  if (p.domicilesToday.length > 0) {
    items.push({
      key: "dom-info", icon: "🚗", color: "#0d9488",
      title: `${p.domicilesToday.length} domicili${p.domicilesToday.length === 1 ? "o" : ""} oggi`,
      sub: p.domicilesToday.map(a => `${fmtTime(a.start_at)} ${nameOf(a)}`).join(" · "),
    });
  }

  const visible = items.filter(i => !dismissed.has(i.key));
  const actionable = visible.filter(i => i.action).length;
  const dismiss = (k: string) => setDismissed(s => new Set(s).add(k));

  return (
    <div style={{ background: "#fff", border: `1px solid ${THEME.border}`, borderRadius: 16, boxShadow: "0 1px 3px rgba(15,23,42,0.05)", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${THEME.border}`, background: "linear-gradient(135deg,rgba(13,148,136,0.045),rgba(37,99,235,0.045))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 26, height: 26, borderRadius: 9, background: "linear-gradient(135deg,rgba(13,148,136,0.14),rgba(37,99,235,0.14))", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>⚡</span><span style={{ fontSize: 13.5, fontWeight: 700, color: THEME.text }}>Da fare</span></span>
        {actionable > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg,#0d9488,#2563eb)", borderRadius: 999, padding: "2px 9px" }}>
            {actionable}
          </span>
        )}
      </div>

      {visible.length === 0 ? (
        <div style={{ padding: "22px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>✨</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.text }}>Tutto fatto</div>
          <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>Nessuna azione in sospeso.</div>
        </div>
      ) : (
        <div>
          {visible.map((it, i) => (
            <div key={it.key} className="rh ar" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: i < visible.length - 1 ? `1px solid ${THEME.border}` : "none" }}>
              <IconChip icon={it.icon} color={it.color} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
                {it.sub && <div style={{ fontSize: 11, color: "#64748b", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.sub}</div>}
              </div>
              {it.action && (
                it.action.href ? (
                  <Link href={it.action.href} style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${it.color}`, color: it.color, fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>
                    {it.action.label}
                  </Link>
                ) : (
                  <button
                    onClick={it.action.onClick}
                    style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: it.color, color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}
                  >{it.action.label}</button>
                )
              )}
              {!it.action && (
                <button onClick={() => dismiss(it.key)} title="Nascondi"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#b6c2d4", fontWeight: 700, fontSize: 13, padding: "2px 4px" }}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
