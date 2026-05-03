// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/panels/CalendarTopBar.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Barra superiore sticky del calendario. Contiene:
//   • Logo + nav links (Home, Calendario, Report, Noleggio, Pazienti)
//   • Frecce di navigazione (giorno/settimana/mese precedente/successivo)
//   • Selettore settimana (vista week) o titolo data
//   • Pulsante "Oggi"
//   • Selettore vista (Giorno / Settimana / Mese)
//   • Menu Stampa (4 voci)
//   • Pulsante ricerca globale (apre Cmd+K)
//   • Bell notifiche prenotazioni dal sito (con badge counter)
//   • Menu utente (Impostazioni, Piano, Logout)
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { type RefObject } from "react";
import Link from "next/link";
import { BuildInfo } from "@/src/components/BuildInfo";
import NotificationsBell from "@/src/components/NotificationsBell";
import {
  THEME, formatDMY, startOfISOWeekMonday,
} from "../../utils";

export type CalendarTopBarProps = {
  // ─── Vista corrente ────────────────────────────────────────────
  viewType: "day" | "week" | "month";
  onSetViewType: (v: "day" | "week" | "month") => void;
  currentDate: Date;
  setCurrentDate: (d: Date | ((prev: Date) => Date)) => void;

  // ─── Navigazione ──────────────────────────────────────────────
  onGoToPreviousWeek: () => void;
  onGoToNextWeek: () => void;
  onGoToPreviousMonth: () => void;
  onGoToNextMonth: () => void;
  onGoToToday: () => void;
  /** Selettore settimana (in vista week) */
  weekOptions: { value: string; label: string }[];
  onGotoWeekStart: (iso: string) => void;

  // ─── Menu stampa ──────────────────────────────────────────────
  printMenuOpen: boolean;
  setPrintMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  printMenuRef: RefObject<HTMLDivElement | null>;
  onPrintCalendar: () => void;
  onExportToPDF: () => void;
  onExportToGoogleCalendar: () => void;

  // ─── Notifiche prenotazioni ───────────────────────────────────
  bookingPanelOpen: boolean;
  pendingBookingsCount: number;
  onToggleBookingPanel: () => void;
  // Se false, nasconde completamente la campanella prenotazioni online (default)
  showBookingBell?: boolean;

  // ─── Notifiche conferme/annullamenti pazienti (Fase N2) ───────
  notificationsBellEnabled: boolean;
  onNotificationAppointmentClick?: (appointmentId: string) => void;

  // ─── Menu utente ──────────────────────────────────────────────
  userMenuOpen: boolean;
  setUserMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  userMenuRef: RefObject<HTMLDivElement | null>;
  userInitials: string;
  onLogout: () => void;
};

const NAV_ITEMS = [
  { href: "/",         label: "Home"       },
  { href: "/calendar", label: "Calendario", active: true },
  { href: "/reports",  label: "Report"     },
  { href: "/noleggio", label: "Noleggio"   },
  { href: "/patients", label: "Pazienti"   },
] as const;

const MESI_SHORT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

const printMenuItemStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px 18px",
  border: "none",
  background: "transparent",
  color: THEME.text,
  cursor: "pointer",
  fontWeight: 600,
  textAlign: "left",
  borderBottom: `1px solid ${THEME.borderSoft}`,
  fontSize: 13,
  letterSpacing: 0.2,
};

const printMenuLastItemStyle: React.CSSProperties = {
  ...printMenuItemStyle,
  borderBottom: "none",
};

export default function CalendarTopBar({
  viewType, onSetViewType,
  currentDate, setCurrentDate,
  onGoToPreviousWeek, onGoToNextWeek,
  onGoToPreviousMonth, onGoToNextMonth,
  onGoToToday,
  weekOptions, onGotoWeekStart,
  printMenuOpen, setPrintMenuOpen, printMenuRef,
  onPrintCalendar, onExportToPDF, onExportToGoogleCalendar,
  bookingPanelOpen, pendingBookingsCount, onToggleBookingPanel,
  showBookingBell = false,
  notificationsBellEnabled, onNotificationAppointmentClick,
  userMenuOpen, setUserMenuOpen, userMenuRef,
  userInitials, onLogout,
}: CalendarTopBarProps) {

  // Helper: titolo del periodo corrente (per giorno/mese)
  const periodTitle =
    viewType === "month"
      ? `${MESI_SHORT[currentDate.getMonth()]} ${currentDate.getFullYear()}`
      : formatDMY(currentDate);

  // Handler: freccia indietro (delega in base alla vista)
  const handlePrev = () => {
    if (viewType === "week") onGoToPreviousWeek();
    else if (viewType === "month") onGoToPreviousMonth();
    else setCurrentDate(d => { const x = new Date(d); x.setDate(x.getDate() - 1); return x; });
  };

  // Handler: freccia avanti
  const handleNext = () => {
    if (viewType === "week") onGoToNextWeek();
    else if (viewType === "month") onGoToNextMonth();
    else setCurrentDate(d => { const x = new Date(d); x.setDate(x.getDate() + 1); return x; });
  };

  // Handler: trigger ricerca globale (simula Cmd+K)
  const handleGlobalSearch = () => {
    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
    window.dispatchEvent(event);
  };

  return (
    <header className="no-print" style={{
      position: "sticky", top: 0, zIndex: 30,
      background: "linear-gradient(135deg, #0d9488, #2563eb)",
      borderBottom: "none",
      padding: "0 20px", height: 58,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      boxShadow: "0 2px 12px rgba(13,148,136,0.18)",
      gap: 8,
    }}>

      {/* ─── LEFT: Logo + Nav ───────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: "rgba(255,255,255,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 800, fontSize: 14, letterSpacing: -0.5,
            border: "1.5px solid rgba(255,255,255,0.3)",
          }}>F</div>
          <span className="mob-hide" style={{ fontWeight: 700, fontSize: 15, color: "#fff", letterSpacing: 0.5, textTransform: "uppercase" }}>
            Fisio<span style={{ color: "#fff", fontWeight: 800 }}>Hub</span>
          </span>
        </div>
        <nav className="mob-hide" style={{ display: "flex", gap: 2 }}>
          {NAV_ITEMS.map(item => {
            const active = "active" in item && item.active;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: "6px 12px", borderRadius: 8,
                  fontSize: 12, fontWeight: 700, textDecoration: "none",
                  background: active ? "rgba(255,255,255,0.2)" : "transparent",
                  color: active ? "#fff" : "rgba(255,255,255,0.8)",
                  letterSpacing: 0.3,
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ─── CENTER: Navigazione + selettore vista + stampa ─────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "center", minWidth: 0 }}>

        {/* Freccia indietro */}
        <button onClick={handlePrev}
          style={{ width: 30, height: 30, borderRadius: 7, border: "1.5px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          ‹
        </button>

        {/* Titolo periodo / selettore settimana */}
        {viewType === "week" ? (
          <select
            value={startOfISOWeekMonday(currentDate).toISOString()}
            onChange={(e) => onGotoWeekStart(e.target.value)}
            className="mob-hide"
            style={{
              padding: "6px 28px 6px 10px", borderRadius: 8,
              border: "1.5px solid rgba(255,255,255,0.35)",
              background: "rgba(255,255,255,0.18)",
              color: "#fff", fontWeight: 700, outline: "none",
              fontSize: 12, height: 32, maxWidth: 240,
              appearance: "none" as const, WebkitAppearance: "none" as const,
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' stroke='%23ffffff' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center",
              cursor: "pointer", flexShrink: 0,
            }}
          >
            {weekOptions.map(o => (
              <option key={o.value} value={o.value} style={{ color: "#0f172a", background: "#fff" }}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", whiteSpace: "nowrap", flexShrink: 0, textShadow: "0 1px 3px rgba(0,0,0,0.15)", minWidth: 100, textAlign: "center" }}>
            {periodTitle}
          </div>
        )}

        {/* Freccia avanti */}
        <button onClick={handleNext}
          style={{ width: 30, height: 30, borderRadius: 7, border: "1.5px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          ›
        </button>

        {/* Oggi */}
        <button onClick={onGoToToday}
          style={{ padding: "5px 12px", borderRadius: 7, border: "1.5px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 11, flexShrink: 0, whiteSpace: "nowrap" }}>
          Oggi
        </button>

        {/* Selettore vista */}
        <div className="cal-period-btns" style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: 2, flexShrink: 0 }}>
          {(["day", "week", "month"] as const).map(v => (
            <button
              key={v}
              onClick={() => onSetViewType(v)}
              style={{
                padding: "4px 10px", borderRadius: 6, border: "none",
                cursor: "pointer", fontSize: 11, fontWeight: 700,
                background: viewType === v ? "rgba(255,255,255,0.9)" : "transparent",
                color: viewType === v ? "#1e40af" : "rgba(255,255,255,0.85)",
                transition: "all 0.15s",
              }}
            >
              {v === "day" ? "Giorno" : v === "week" ? "Settimana" : "Mese"}
            </button>
          ))}
        </div>

        {/* Menu stampa */}
        <div ref={printMenuRef} style={{ position: "relative", flexShrink: 0, zIndex: 40 }}>
          <button
            onClick={() => setPrintMenuOpen(!printMenuOpen)}
            style={{
              padding: "6px 14px", borderRadius: 8,
              border: "1.5px solid rgba(255,255,255,0.35)",
              background: "rgba(255,255,255,0.18)",
              color: "#fff", cursor: "pointer", fontWeight: 700,
              height: 34, display: "flex", alignItems: "center", gap: 6,
              fontSize: 12, whiteSpace: "nowrap",
            }}
          >
            🖨️ Stampa
            <span style={{ fontSize: 9 }}>▼</span>
          </button>

          {printMenuOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0,
              background: THEME.panelBg, border: `2px solid ${THEME.border}`,
              borderRadius: 12, boxShadow: "0 12px 40px rgba(30,64,175,0.18)",
              zIndex: 9999, minWidth: 220, overflow: "hidden",
            }}>
              <button
                onClick={() => { onSetViewType("day"); onPrintCalendar(); }}
                style={printMenuItemStyle}
                onMouseEnter={e => (e.currentTarget.style.background = THEME.panelSoft)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                ◈ Stampa giorno
              </button>
              <button
                onClick={() => { onSetViewType("week"); onPrintCalendar(); }}
                style={printMenuItemStyle}
                onMouseEnter={e => (e.currentTarget.style.background = THEME.panelSoft)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                ◫ Stampa settimana
              </button>
              <button
                onClick={onExportToPDF}
                style={printMenuItemStyle}
                onMouseEnter={e => (e.currentTarget.style.background = THEME.panelSoft)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                ▤ Esporta PDF
              </button>
              <button
                onClick={onExportToGoogleCalendar}
                style={printMenuLastItemStyle}
                onMouseEnter={e => (e.currentTarget.style.background = THEME.panelSoft)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                ▦ Esporta Google Calendar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── RIGHT: Ricerca + Notifiche + User ───────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>

        {/* Ricerca globale (Cmd+K) */}
        <button
          onClick={handleGlobalSearch}
          className="mob-hide"
          title="Ricerca globale"
          style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)", cursor: "pointer", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}
        >
          🔍 <kbd style={{ fontSize: 10, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, padding: "0 4px" }}>⌘K</kbd>
        </button>

        {/* Bell notifiche prenotazioni — visibile solo se attivata in impostazioni */}
        {showBookingBell && (
          <button
            onClick={onToggleBookingPanel}
            style={{
              position: "relative", width: 32, height: 32, borderRadius: 8,
              border: "1.5px solid rgba(255,255,255,0.3)",
              background: bookingPanelOpen ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.12)",
              color: "#fff", cursor: "pointer", fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            🔔
            {pendingBookingsCount > 0 && (
              <span style={{
                position: "absolute", top: -4, right: -4,
                width: 16, height: 16, borderRadius: "50%",
                background: "#f97316", color: "#fff",
                fontSize: 9, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px solid #fff",
              }}>
                {pendingBookingsCount}
              </span>
            )}
          </button>
        )}

        {/* Bell notifiche conferme/annullamenti pazienti (Fase N2) */}
        <NotificationsBell
          enabled={notificationsBellEnabled}
          onAppointmentClick={onNotificationAppointmentClick}
        />

        {/* Menu utente */}
        <div ref={userMenuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setUserMenuOpen(v => !v)}
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: "2px solid rgba(255,255,255,0.35)", cursor: "pointer",
              background: "rgba(255,255,255,0.2)",
              color: "#fff", fontWeight: 700, fontSize: 12,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {userInitials}
          </button>
          {userMenuOpen && (
            <div style={{
              position: "absolute", right: 0, top: "calc(100% + 8px)", width: 200,
              background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
              borderRadius: 12, boxShadow: "0 12px 32px rgba(30,64,175,0.15)",
              overflow: "hidden", zIndex: 60,
            }}>
              <Link
                href="/settings"
                onClick={() => setUserMenuOpen(false)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
                  color: THEME.text, textDecoration: "none", fontSize: 13, fontWeight: 600,
                  borderBottom: `1.5px solid ${THEME.border}`,
                }}
              >
                ⚙️ Impostazioni
              </Link>
              <Link
                href="/piano"
                onClick={() => setUserMenuOpen(false)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
                  color: THEME.text, textDecoration: "none", fontSize: 13, fontWeight: 600,
                  borderBottom: `1.5px solid ${THEME.border}`,
                }}
              >
                💎 Piano
              </Link>
              <button
                type="button"
                onClick={onLogout}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "12px 16px", background: "transparent", border: "none",
                  cursor: "pointer", color: THEME.red, fontWeight: 600, fontSize: 13,
                }}
              >
                ⏻ Logout
              </button>
              <BuildInfo />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
