// src/components/NotificationsCard.tsx
// ═══════════════════════════════════════════════════════════════════════
// Card "Notifiche pazienti" per home desktop.
//
// Mostra le ultime notifiche non lette (cancel/confirm/booking).
// Click su una riga → naviga al calendario sul giorno dell'appuntamento
// + marca come letta.
//
// Empty state amichevole se non ci sono notifiche.
// ═══════════════════════════════════════════════════════════════════════
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type NotificationItem = {
  id: string;
  type: "confirm" | "cancel" | "booking";
  appointment_id: string | null;
  patient_id: string | null;
  payload: { patient_name?: string; appointment_start?: string };
  created_at: string;
  read_at: string | null;
};

const POLL_MS = 30000;
const MAX_DISPLAY = 6;

const T = {
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  panelBg: "#ffffff",
  panelSoft: "#f8fafc",
  green: "#16a34a",
  red: "#dc2626",
  blue: "#2563eb",
  teal: "#0d9488",
};

export default function NotificationsCard() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnreadCount(data.unread_count ?? 0);
    } catch (e) {
      // silenzioso
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const i = setInterval(load, POLL_MS);
    return () => clearInterval(i);
  }, [load]);

  async function markRead(notificationId: string) {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notificationId }),
      });
      setItems(prev => prev.filter(n => n.id !== notificationId));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (e) {
      // silenzioso
    }
  }

  async function markAllRead() {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_all: true }),
      });
      setItems([]);
      setUnreadCount(0);
    } catch (e) {
      // silenzioso
    }
  }

  function onClickItem(it: NotificationItem) {
    void markRead(it.id);
    if (it.payload?.appointment_start) {
      const d = new Date(it.payload.appointment_start);
      const dateStr = d.toISOString().split("T")[0];
      router.push(`/calendar?date=${dateStr}`);
    }
  }

  // Mostro solo le prime N notifiche
  const display = items.slice(0, MAX_DISPLAY);

  return (
    <div
      style={{
        background: T.panelBg,
        borderRadius: 14,
        border: `1px solid ${T.border}`,
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 280,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 18px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: T.panelSoft,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔔</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
              Notifiche pazienti
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
              Conferme e annullamenti dal link WhatsApp
            </div>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => void markAllRead()}
            style={{
              background: "transparent",
              border: "none",
              color: T.teal,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 6,
            }}
          >
            Segna tutte lette
          </button>
        )}
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: T.muted, fontSize: 13 }}>
            Caricamento…
          </div>
        ) : display.length === 0 ? (
          <div style={{ padding: 36, textAlign: "center", color: T.muted }}>
            <div style={{ fontSize: 38, marginBottom: 8 }}>📭</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4 }}>
              Tutto in regola
            </div>
            <div style={{ fontSize: 11 }}>
              Nessuna notifica al momento.<br />
              Comparirà qui se un paziente conferma o annulla un appuntamento.
            </div>
          </div>
        ) : (
          display.map(n => <NotifRow key={n.id} item={n} onClick={() => onClickItem(n)} />)
        )}
      </div>

      {/* Footer (se più di MAX_DISPLAY) */}
      {items.length > MAX_DISPLAY && (
        <div
          style={{
            padding: "10px 18px",
            borderTop: `1px solid ${T.border}`,
            fontSize: 11,
            color: T.muted,
            textAlign: "center",
          }}
        >
          Altre {items.length - MAX_DISPLAY} notifiche più vecchie nella campanella.
        </div>
      )}
    </div>
  );
}

// ─── Riga singola ──────────────────────────────────────────────────────
function NotifRow({ item, onClick }: { item: NotificationItem; onClick: () => void }) {
  const isUnread = !item.read_at;
  const patientName = item.payload?.patient_name || "Paziente";
  const apptStart = item.payload?.appointment_start
    ? new Date(item.payload.appointment_start)
    : null;
  const apptStr = apptStart
    ? apptStart.toLocaleString("it-IT", {
        weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "";

  let icon = "🔔";
  let color = T.muted;
  let label = "Notifica";
  if (item.type === "cancel")  { icon = "✗"; color = T.red;   label = "Annullato"; }
  if (item.type === "confirm") { icon = "✓"; color = T.green; label = "Confermato"; }
  if (item.type === "booking") { icon = "📅"; color = T.blue;  label = "Prenotato online"; }

  const ago = timeAgo(new Date(item.created_at));

  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 18px",
        borderBottom: `1px solid #f1f5f9`,
        cursor: "pointer",
        background: isUnread ? "#f0f9ff" : "#fff",
        display: "flex",
        gap: 12,
        transition: "background 0.1s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = isUnread ? "#e0f2fe" : "#f8fafc")}
      onMouseLeave={e => (e.currentTarget.style.background = isUnread ? "#f0f9ff" : "#fff")}
    >
      <div
        style={{
          width: 36, height: 36, minWidth: 36, borderRadius: 10,
          background: `${color}1a`, color,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 16, flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 2 }}>
          <span style={{ color }}>{label}</span>
          {" — "}
          <span>{patientName}</span>
        </div>
        <div style={{ fontSize: 11, color: T.muted }}>
          {apptStr && <span>{apptStr}</span>}
          {apptStr && ago && <span style={{ margin: "0 6px" }}>·</span>}
          {ago && <span>{ago}</span>}
        </div>
      </div>
      {isUnread && (
        <div
          style={{
            width: 8, height: 8, borderRadius: "50%",
            background: T.blue, alignSelf: "center", flexShrink: 0,
          }}
        />
      )}
    </div>
  );
}

function timeAgo(date: Date): string {
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "ora";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h fa`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "ieri";
  if (diffDay < 7) return `${diffDay} g fa`;
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}
