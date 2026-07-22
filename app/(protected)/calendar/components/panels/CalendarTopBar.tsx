// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/panels/CalendarTopBar.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Barra superiore sticky del calendario (rinnovata).
// Funge da NAVIGAZIONE GLOBALE dell'app, non da toolbar del calendario.
//
// SINISTRA: Logo + nav links (Home, Calendario, Report, Noleggio, Pazienti)
// CENTRO:   vuoto (dà respiro visivo)
// DESTRA:   Ricerca globale (⌘K) · Campanella unificata · Avatar utente
//
// La navigazione tempo (◀ Oggi ▶), il selettore vista (Giorno/Settimana/Mese)
// e il menu Stampa sono stati spostati nella CalendarToolbar bianca sotto.
//
// La campanella unica gestisce sia prenotazioni dal sito che notifiche
// conferme/annullamenti tramite il componente NotificationsBell.
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useState, type RefObject } from "react";
import ConvenzioniMenuItem from "@/src/components/ConvenzioniMenuItem";
import Link from "next/link";
import { BuildInfo } from "@/src/components/BuildInfo";
import NotificationsBell from "@/src/components/NotificationsBell";
import { THEME } from "../../utils";

export type CalendarTopBarProps = {
  // ─── Notifiche prenotazioni dal sito ─────────────────────────
  pendingBookingsCount: number;
  onOpenBookingPanel: () => void;
  // Se false, sezione prenotazioni nascosta nella campanella
  showBookingBell?: boolean;

  // ─── Notifiche conferme/annullamenti pazienti ─────────────────
  notificationsBellEnabled: boolean;
  onNotificationAppointmentClick?: (appointmentId: string) => void;

  // ─── Menu utente ──────────────────────────────────────────────
  userMenuOpen: boolean;
  setUserMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  userMenuRef: RefObject<HTMLDivElement | null>;
  userInitials: string;
  onLogout: () => void;

  // ─── Agenda Ospiti (mig. 029, Step 5g) ────────────────────────
  /** Lista degli ospiti attivi dello studio per la voce "Agenda Ospiti".
   *  Se la feature è disattiva o non ci sono ospiti, omettere/array vuoto:
   *  la voce non viene renderizzata. */
  guestPractitionersForMenu?: Array<{
    id: string;
    first_name: string;
    last_name: string;
    specialty: string;
    display_color: string | null;
  }>;
  /** mig. 031 — Se true e 2+ ospiti, la voce nel menu diventa link unico
   *  alla pagina indice /ospiti invece del submenu collassabile. */
  useGuestIndexPage?: boolean;
};

const NAV_ITEMS = [
  { href: "/",         label: "Home"       },
  { href: "/calendar", label: "Calendario", active: true },
  { href: "/reports",  label: "Report"     },
  { href: "/noleggio", label: "Noleggio"   },
  { href: "/patients", label: "Pazienti"   },
] as const;

export default function CalendarTopBar({
  pendingBookingsCount,
  onOpenBookingPanel,
  showBookingBell = false,
  notificationsBellEnabled,
  onNotificationAppointmentClick,
  userMenuOpen, setUserMenuOpen, userMenuRef,
  userInitials, onLogout,
  guestPractitionersForMenu,
  useGuestIndexPage,
}: CalendarTopBarProps) {

  // Handler ricerca globale (simula Cmd+K)
  const handleGlobalSearch = () => {
    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
    window.dispatchEvent(event);
  };

  // Voce "Agenda Ospiti" smart (mig. 029, Step 5g + mig. 031, Step 5e):
  //   - 0 ospiti        → voce non renderizzata
  //   - 1 ospite        → click → /ospiti/{id} (diretto)
  //   - 2+ ospiti + flag OFF → expand inline con sotto-lista ospiti
  //   - 2+ ospiti + flag ON  → click → /ospiti (pagina indice)
  const hasGuests = !!guestPractitionersForMenu && guestPractitionersForMenu.length > 0;
  const singleGuest = guestPractitionersForMenu && guestPractitionersForMenu.length === 1
    ? guestPractitionersForMenu[0] : null;
  const multipleGuests = guestPractitionersForMenu && guestPractitionersForMenu.length > 1
    ? guestPractitionersForMenu : null;
  const showIndexLink = useGuestIndexPage === true
    && !!guestPractitionersForMenu
    && guestPractitionersForMenu.length >= 2;
  const [guestSubmenuOpen, setGuestSubmenuOpen] = useState(false);

  return (
    <header className="no-print cal-header" style={{
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
          <span className="mob-hide tab-hide" style={{ fontWeight: 700, fontSize: 15, color: "#fff", letterSpacing: 0.5, textTransform: "uppercase" }}>
            Fisio<span style={{ color: "#fff", fontWeight: 800 }}>Hub</span>
          </span>
        </div>
        <nav className="mob-hide nav-tab-compact" style={{ display: "flex", gap: 2 }}>
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

      {/* ─── RIGHT: Ricerca + Campanella unificata + User ───────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>

        {/* Ricerca globale (Cmd+K) */}
        <button
          onClick={handleGlobalSearch}
          className="mob-hide"
          title="Ricerca globale"
          style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)", cursor: "pointer", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}
        >
          🔍 <kbd className="tab-hide" style={{ fontSize: 10, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, padding: "0 4px" }}>⌘K</kbd>
        </button>

        {/* Campanella UNICA: prenotazioni dal sito + notifiche conferme */}
        <NotificationsBell
          enabled={notificationsBellEnabled}
          onAppointmentClick={onNotificationAppointmentClick}
          bookingSection={showBookingBell ? {
            enabled: true,
            pendingCount: pendingBookingsCount,
            onOpenPanel: onOpenBookingPanel,
          } : undefined}
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
              {/* Voce Agenda Ospiti (mig. 029, Step 5g + mig. 031 5e) */}
              {hasGuests && showIndexLink && (
                <Link
                  href="/ospiti"
                  onClick={() => setUserMenuOpen(false)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
                    color: THEME.text, textDecoration: "none", fontSize: 13, fontWeight: 600,
                    borderBottom: `1.5px solid ${THEME.border}`,
                  }}
                >
                  📋 Agenda Ospiti
                </Link>
              )}
              {hasGuests && !showIndexLink && singleGuest && (
                <Link
                  href={`/ospiti/${singleGuest.id}`}
                  onClick={() => setUserMenuOpen(false)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
                    color: THEME.text, textDecoration: "none", fontSize: 13, fontWeight: 600,
                    borderBottom: `1.5px solid ${THEME.border}`,
                  }}
                >
                  📋 Agenda {singleGuest.first_name}
                </Link>
              )}
              {hasGuests && !showIndexLink && multipleGuests && (
                <>
                  <button
                    type="button"
                    onClick={() => setGuestSubmenuOpen(o => !o)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                      gap: 8, padding: "12px 16px",
                      background: "transparent", border: "none", cursor: "pointer",
                      color: THEME.text, fontSize: 13, fontWeight: 600,
                      borderBottom: `1.5px solid ${THEME.border}`,
                      textAlign: "left",
                    }}
                  >
                    <span>📋 Agenda Ospiti</span>
                    <span style={{ fontSize: 11, color: THEME.muted }}>
                      {guestSubmenuOpen ? "▾" : "▸"}
                    </span>
                  </button>
                  {guestSubmenuOpen && (
                    <div style={{ borderBottom: `1.5px solid ${THEME.border}` }}>
                      {multipleGuests.map(g => (
                        <Link
                          key={g.id}
                          href={`/ospiti/${g.id}`}
                          onClick={() => setUserMenuOpen(false)}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "10px 16px 10px 32px",
                            color: THEME.text, textDecoration: "none",
                            fontSize: 12, fontWeight: 600,
                            background: THEME.panelSoft,
                          }}
                        >
                          <span style={{
                            width: 8, height: 8, borderRadius: "50%",
                            background: g.display_color || "#DB2777",
                            flexShrink: 0,
                          }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {g.first_name} {g.last_name}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              )}
              <ConvenzioniMenuItem onNavigate={() => setUserMenuOpen(false)} />
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
                Piano
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
