// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/views/DaySidebar.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Colonna destra della Vista GIORNO (larghezza fissa 280px). Contiene:
//   • Header con etichetta "Oggi" / data formattata + giorno settimana
//   • Strip KPI (4 celle): Appuntamenti / Eseguiti / Fatturato / Non pagati
//   • Bottone tratteggiato "+ Nuovo appuntamento" (apre createModal alle 9:00)
//   • Lista appuntamenti del giorno (ordinata per orario, esclusi i cancellati)
//     con: orario, badge WEB / €✓, nome paziente, tipo+importo, e azioni
//     rapide (Esegui / Paga / 📲 WA)
//   • Footer riassuntivo con N pagati / N totali e fatturato giornaliero
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import {
  THEME, fmtTime, statusBg, statusColor,
  type CalendarEvent,
} from "../../utils";
import PaidIconButton from "@/src/components/PaidIconButton";
import type { PaymentMethod } from "@/src/components/PaidPopover";
import PackageBadge from "@/src/components/packages/PackageBadge";

const GG = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

export type DaySidebarProps = {
  /** Data corrente */
  currentDate: Date;
  /** Eventi del giorno (filtrati e ordinati dal parent) */
  dayEvents: CalendarEvent[];

  /** Click su un appuntamento → apre il modale di modifica.
      Il page.tsx esegue il setup completo dello stato (selectedEvent + edit*). */
  onSelectEvent: (event: CalendarEvent) => void;
  /** Bottone "+ Nuovo appuntamento" → apre createModal con orario 9:00 */
  onCreateNew: () => void;

  /** Toggle eseguito */
  onToggleDone: (eventId: string, currentStatus: CalendarEvent["status"]) => void;
  /** Toggle pagato */
  onTogglePaid: (eventId: string, currentlyPaid: boolean) => void;
  /** Nuovo handler completo (metodo + data). Se presente, sostituisce il bottone "Paga". */
  onUpdatePayment?: (
    eventId: string,
    next: {
      is_paid: boolean;
      paid_at: string | null;
      payment_method: PaymentMethod | null;
    }
  ) => Promise<void> | void;
  /** Invia promemoria WA */
  onSendReminder: (eventId: string, phone?: string, firstName?: string) => void;
};

export default function DaySidebar({
  currentDate, dayEvents,
  onSelectEvent, onCreateNew,
  onToggleDone, onTogglePaid, onUpdatePayment, onSendReminder,
}: DaySidebarProps) {

  // KPI calcolati
  const totRev    = dayEvents.reduce((s, ev) => s + (ev.amount ?? 0), 0);
  const totDone   = dayEvents.filter(ev => ev.status === "done").length;
  const totPaid   = dayEvents.filter(ev => ev.is_paid).length;
  const totUnpaid = dayEvents.filter(ev => !ev.is_paid && ev.status !== "cancelled").length;

  // Header label
  const today = new Date();
  const isToday =
    currentDate.getDate() === today.getDate() &&
    currentDate.getMonth() === today.getMonth() &&
    currentDate.getFullYear() === today.getFullYear();
  const dayLabel = `${GG[currentDate.getDay()]} ${currentDate.getDate()} ${MESI[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  return (
    <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden", color: THEME.text }}>

      {/* Header sidebar */}
      <div style={{ background: "linear-gradient(135deg, #0d9488, #2563eb)", padding: "14px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 2 }}>
          {isToday ? "Oggi" : dayLabel}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
          {isToday ? dayLabel : ""}
        </div>
      </div>

      {/* KPI strip 2×2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderBottom: `1px solid ${THEME.border}` }}>
        {[
          { label: "Appuntamenti", val: dayEvents.length, color: THEME.blue },
          { label: "Eseguiti", val: totDone, color: THEME.green },
          { label: "Fatturato", val: `€${Math.round(totRev)}`, color: THEME.teal },
          { label: "Non pagati", val: totUnpaid, color: totUnpaid > 0 ? THEME.amber : THEME.muted },
        ].map((k, i) => (
          <div
            key={i}
            style={{
              padding: "10px 14px",
              borderBottom: i < 2 ? `1px solid ${THEME.border}` : "none",
              borderRight: i % 2 === 0 ? `1px solid ${THEME.border}` : "none",
            }}
          >
            <div style={{ fontSize: 10, color: THEME.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 }}>
              {k.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color, lineHeight: 1 }}>
              {k.val}
            </div>
          </div>
        ))}
      </div>

      {/* Bottone nuovo appuntamento */}
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${THEME.border}` }}>
        <button
          onClick={onCreateNew}
          style={{
            width: "100%", padding: "8px 0", borderRadius: 8,
            border: `1.5px dashed ${THEME.teal}`,
            background: "rgba(13,148,136,0.04)", color: THEME.teal,
            cursor: "pointer", fontWeight: 700, fontSize: 12,
            letterSpacing: 0.3,
          }}
        >
          + Nuovo appuntamento
        </button>
      </div>

      {/* Lista appuntamenti */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {dayEvents.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center", color: THEME.muted, fontSize: 13 }}>
            Nessun appuntamento<br />
            <span style={{ fontSize: 11 }}>Clicca sulla griglia per aggiungerne uno</span>
          </div>
        ) : dayEvents.map(ev => {
          const isDone = ev.status === "done";
          const isPaid = !!ev.is_paid;
          const waSent = !!ev.whatsapp_sent_at;
          const isWeb  = ev.calendar_note?.startsWith("[WEB|");

          return (
            <div
              key={ev.id}
              onClick={() => onSelectEvent(ev)}
              className="cal-event-card"
              style={{
                margin: "4px 10px",
                borderRadius: 8,
                border: `1.5px solid ${statusColor(ev.status)}22`,
                background: statusBg(ev.status) + "18",
                borderLeft: `4px solid ${statusColor(ev.status)}`,
                padding: "9px 10px",
                cursor: "pointer",
                transition: "all 0.12s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = statusBg(ev.status) + "30"; }}
              onMouseLeave={e => { e.currentTarget.style.background = statusBg(ev.status) + "18"; }}
            >
              {/* Orario + badge */}
              <div className="ev-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: statusColor(ev.status) }}>
                  {fmtTime(ev.start.toISOString())}
                  <span style={{ fontWeight: 500, color: THEME.muted }}> – {fmtTime(ev.end.toISOString())}</span>
                </span>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {isWeb && (
                    <span style={{ fontSize: 9, fontWeight: 800, background: "#facc15", color: "#78350f", padding: "1px 5px", borderRadius: 3 }}>WEB</span>
                  )}
                  {isPaid && (
                    <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(22,163,74,0.15)", color: THEME.green, padding: "1px 5px", borderRadius: 3 }}>€✓</span>
                  )}
                </div>
              </div>

              {/* Nome paziente */}
              <div className="ev-name" style={{ fontSize: 13, fontWeight: 700, color: THEME.text, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ev.patient_name}
              </div>

              {/* Tipo + importo */}
              <div className="ev-meta" style={{ fontSize: 11, color: THEME.muted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {ev.package_id && <PackageBadge packageId={ev.package_id} variant="default" />}
                <span>
                  {ev.treatment_type === "macchinario" ? "Macchinario" : "Seduta"}
                  {ev.location === "domicile" ? " · 🏠 Domicilio" : ""}
                  {ev.amount ? ` · €${ev.amount}` : ""}
                </span>
              </div>

              {/* Azioni rapide */}
              <div style={{ display: "flex", gap: 5 }}>
                <button
                  title={isDone ? "Annulla eseguita" : "Segna eseguita"}
                  onClick={e => { e.stopPropagation(); onToggleDone(ev.id, ev.status); }}
                  style={{
                    flex: 1, padding: "4px 0", borderRadius: 5, border: "none",
                    background: isDone ? THEME.green : "rgba(22,163,74,0.12)",
                    color: isDone ? "#fff" : THEME.green,
                    cursor: "pointer", fontWeight: 700, fontSize: 11,
                  }}
                >
                  {isDone ? "✓ Eseguita" : "Esegui"}
                </button>
                {onUpdatePayment ? (
                  <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }} onClick={e => e.stopPropagation()}>
                    <PaidIconButton
                      data={{
                        is_paid: isPaid,
                        paid_at: ev.paid_at,
                        payment_method: ev.payment_method,
                        price_type: ev.price_type,
                      }}
                      onUpdate={async (next) => onUpdatePayment(ev.id, next)}
                      tone="dark"
                      size={22}
                    />
                  </div>
                ) : (
                  <button
                    title={isPaid ? "Pagato" : "Segna pagato"}
                    onClick={e => { e.stopPropagation(); onTogglePaid(ev.id, isPaid); }}
                    style={{
                      flex: 1, padding: "4px 0", borderRadius: 5, border: "none",
                      background: isPaid ? THEME.teal : "rgba(13,148,136,0.1)",
                      color: isPaid ? "#fff" : THEME.teal,
                      cursor: "pointer", fontWeight: 700, fontSize: 11,
                    }}
                  >
                    {isPaid ? "€ Pagato" : "Paga"}
                  </button>
                )}
                {ev.patient_phone && (
                  <button
                    title={waSent ? "Reinvia WA" : "Invia promemoria WA"}
                    onClick={e => {
                      e.stopPropagation();
                      onSendReminder(ev.id, ev.patient_phone ?? undefined, ev.patient_first_name ?? undefined);
                    }}
                    style={{
                      width: 30, padding: "4px 0", borderRadius: 5, border: "none",
                      background: waSent ? "rgba(37,211,102,0.2)" : "rgba(37,211,102,0.1)",
                      color: "#128C7E", cursor: "pointer", fontWeight: 700, fontSize: 13,
                      flexShrink: 0,
                    }}
                  >
                    📲
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer totali */}
      {dayEvents.length > 0 && (
        <div style={{ borderTop: `1px solid ${THEME.border}`, padding: "10px 14px", background: THEME.panelSoft }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
              {totPaid}/{dayEvents.length} pagati
            </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: THEME.teal }}>
              €{Math.round(totRev).toLocaleString("it-IT")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
