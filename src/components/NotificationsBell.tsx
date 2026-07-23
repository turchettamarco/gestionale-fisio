// src/components/NotificationsBell.tsx
// ═══════════════════════════════════════════════════════════════════════
// Campanella unificata (desktop + mobile).
//
// SEZIONI nel dropdown:
//   1. Prenotazioni dal sito (opzionale, prop bookingSection)
//      → counter pending + click apre BookingRequestsPanel esterno
//   2. Notifiche conferme/annullamenti pazienti (prop enabled)
//      → polling /api/notifications, mark-as-read, click apre appuntamento
//
// Il badge sul bottone è la SOMMA di prenotazioni pending + notifiche unread.
//
// La campanella è nascosta solo se entrambe le sezioni sono disabilitate.
// ═══════════════════════════════════════════════════════════════════════
"use client";

import { Icon } from "@/src/components/icons";
import { useEffect, useRef, useState, useCallback } from "react";

export type NotificationItem = {
  id: string;
  type: "confirm" | "cancel" | "booking" | "assigned" | "moved" | "unassigned";
  appointment_id: string | null;
  patient_id: string | null;
  payload: {
    patient_name?: string;
    appointment_start?: string;
  };
  created_at: string;
  read_at: string | null;
};

type Props = {
  // Se false → bell nascosto
  enabled: boolean;
  // Click su una notifica → callback per aprire l'appuntamento
  onAppointmentClick?: (appointmentId: string) => void;
  // Posizione del dropdown ("right" = aperto verso sinistra, default)
  dropdownAlign?: "left" | "right";
  // Tema colori
  primaryColor?: string;   // default teal
  dangerColor?: string;    // default red
  // ─── Sezione prenotazioni online (opzionale) ──────────────────
  // Se attiva, in cima al dropdown appare una sezione "Prenotazioni dal sito"
  // con il counter pending e un pulsante che apre il pannello dedicato.
  bookingSection?: {
    enabled: boolean;
    pendingCount: number;
    onOpenPanel: () => void;
  };
};

const POLL_MS = 30000;

export default function NotificationsBell({
  enabled,
  onAppointmentClick,
  dropdownAlign = "right",
  primaryColor = "#0d9488",
  dangerColor = "#dc2626",
  bookingSection,
}: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnreadCount(data.unread_count ?? 0);
    } catch (e) {
      // silenzioso: errore di rete non blocca l'app
    }
  }, [enabled]);

  // Polling ogni 30s
  useEffect(() => {
    if (!enabled) return;
    loadNotifications();
    const interval = setInterval(loadNotifications, POLL_MS);
    return () => clearInterval(interval);
  }, [enabled, loadNotifications]);

  // Chiusura cliccando fuori
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function markAsRead(notificationId: string) {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notificationId }),
      });
      // Rimozione ottimistica dalla lista (Opzione A: la notifica scompare)
      setItems(prev => prev.filter(n => n.id !== notificationId));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (e) {
      // silenzioso
    }
  }

  async function markAllAsRead() {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }

  function onClickItem(item: NotificationItem) {
    void markAsRead(item.id);
    if (item.appointment_id && onAppointmentClick) {
      onAppointmentClick(item.appointment_id);
    }
    setOpen(false);
  }

  // Visibile se è attiva la sezione notifiche standard OPPURE la sezione prenotazioni
  const visible = enabled || (bookingSection?.enabled === true);
  if (!visible) return null;

  // Badge totale = notifiche non lette + prenotazioni pending (se attive)
  const bookingPending = bookingSection?.enabled ? bookingSection.pendingCount : 0;
  const totalBadge = unreadCount + bookingPending;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* Bottone campanella */}
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        aria-label="Notifiche"
        style={{
          position: "relative",
          background: "transparent",
          border: "none",
          borderRadius: 10,
          width: 38,
          height: 38,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "#fff",
          fontSize: 18,
          padding: 0,
          transition: "background 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        <Icon name="bell" size={17} color="#fff" />
        {totalBadge > 0 && (
          <span
            title={`${totalBadge} da leggere`}
            style={{
              position: "absolute", top: 5, right: 6,
              width: 9, height: 9, borderRadius: "50%",
              background: "#FBBF24",
              border: "1.5px solid rgba(255,255,255,0.9)",
              boxSizing: "border-box",
            }}
          />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            [dropdownAlign === "right" ? "right" : "left"]: 0,
            width: 360,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: 480,
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 12px 40px rgba(15,23,42,0.18)",
            border: "1px solid #e2e8f0",
            zIndex: 1000,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            color: "#0f172a",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#f8fafc",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {enabled ? "Notifiche" : "Avvisi"}
            </div>
            {enabled && unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                disabled={loading}
                style={{
                  background: "transparent",
                  border: "none",
                  color: primaryColor,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: loading ? "wait" : "pointer",
                  padding: "4px 8px",
                  borderRadius: 6,
                }}
              >
                Segna tutte come lette
              </button>
            )}
          </div>

          {/* ─── Sezione Prenotazioni dal sito (se abilitata) ─── */}
          {bookingSection?.enabled && (
            <button
              onClick={() => {
                bookingSection.onOpenPanel();
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "12px 16px",
                background: bookingSection.pendingCount > 0 ? "#fff7ed" : "#fff",
                border: "none",
                borderBottom: "1px solid #e2e8f0",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = bookingSection.pendingCount > 0 ? "#ffedd5" : "#f8fafc")}
              onMouseLeave={e => (e.currentTarget.style.background = bookingSection.pendingCount > 0 ? "#fff7ed" : "#fff")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>📅</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>
                    Prenotazioni dal sito
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    {bookingSection.pendingCount > 0
                      ? `${bookingSection.pendingCount} in attesa di conferma`
                      : "Nessuna richiesta in attesa"}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {bookingSection.pendingCount > 0 && (
                  <span style={{
                    minWidth: 22, height: 22, padding: "0 6px",
                    borderRadius: 11, background: "#f97316", color: "#fff",
                    fontSize: 11, fontWeight: 800,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {bookingSection.pendingCount}
                  </span>
                )}
                <span style={{ color: "#94a3b8", fontSize: 14 }}>›</span>
              </div>
            </button>
          )}

          {/* Lista notifiche */}
          {enabled && (
            <div style={{ overflowY: "auto", flex: 1 }}>
              {items.length === 0 ? (
                <div style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>📭</div>
                  Nessuna notifica
                </div>
              ) : (
                items.map(n => <NotificationRow key={n.id} item={n} onClick={() => onClickItem(n)} />)
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Singola riga della lista ──────────────────────────────────────────
function NotificationRow({ item, onClick }: { item: NotificationItem; onClick: () => void }) {
  const isUnread = !item.read_at;
  // Le notifiche di team (mig. 076) portano un messaggio già formattato e
  // usano start_at; quelle storiche dei pazienti usano appointment_start.
  const teamMessage = (item.payload as { message?: string } | null)?.message ?? null;
  const patientName = teamMessage || item.payload?.patient_name || "Paziente";
  const rawStart = item.payload?.appointment_start
    ?? (item.payload as { start_at?: string } | null)?.start_at;
  const apptStart = rawStart ? new Date(rawStart) : null;

  const apptStr = apptStart
    ? apptStart.toLocaleString("it-IT", {
        weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "";

  // Icona + colore in base al tipo
  let icon = "🔔";
  let color = "#64748b";
  let label = "Notifica";
  if (item.type === "cancel") {
    icon = "✗";
    color = "#dc2626";
    label = "Annullato";
  } else if (item.type === "confirm") {
    icon = "✓";
    color = "#16a34a";
    label = "Confermato";
  } else if (item.type === "booking") {
    icon = "📅";
    color = "#2563eb";
    label = "Prenotato online";
  } else if (item.type === "assigned") {
    // Notifiche di team (mig. 076): riguardano l'agenda dell'operatore.
    icon = "👤";
    color = "#0f766e";
    label = "Assegnata a te";
  } else if (item.type === "moved") {
    icon = "🔄";
    color = "#1d4ed8";
    label = "Seduta spostata";
  } else if (item.type === "unassigned") {
    icon = "↩";
    color = "#64748b";
    label = "Non più tua";
  }

  // "5 min fa" / "ieri" / "lun 3 Mag"
  const ago = item.created_at ? timeAgo(new Date(item.created_at)) : "";

  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid #f1f5f9",
        cursor: "pointer",
        background: isUnread ? "#f0f9ff" : "#fff",
        display: "flex",
        gap: 10,
        transition: "background 0.1s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = isUnread ? "#e0f2fe" : "#f8fafc")}
      onMouseLeave={e => (e.currentTarget.style.background = isUnread ? "#f0f9ff" : "#fff")}
    >
      {/* Icona */}
      <div
        style={{
          width: 36,
          height: 36,
          minWidth: 36,
          borderRadius: 10,
          background: `${color}1a`,
          color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 16,
        }}
      >
        {icon}
      </div>

      {/* Testo */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>
          <span style={{ color }}>{label}</span>
          {" — "}
          <span>{patientName}</span>
        </div>
        <div style={{ fontSize: 11, color: "#64748b" }}>
          {apptStr && <span>{apptStr}</span>}
          {apptStr && ago && <span style={{ margin: "0 6px" }}>·</span>}
          {ago && <span>{ago}</span>}
        </div>
      </div>

      {/* Pallino non letto */}
      {isUnread && (
        <div
          style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#2563eb", alignSelf: "center", flexShrink: 0,
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
