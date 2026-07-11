// src/components/AppNavbar.tsx
// ═══════════════════════════════════════════════════════════════════════
// Navbar globale UNICA, usata da TUTTE le pagine protected, calendario incluso.
//
// Il calendario passa due prop opzionali (onNotificationAppointmentClick +
// bookingSection) per: saltare alla data dell'appuntamento in-pagina quando si
// clicca una notifica, e mostrare la sezione "Prenotazioni dal sito" nella
// campanella. Le altre pagine non le passano e si comportano normalmente.
//
// REGOLA: qualsiasi modifica alla nav globale (nuovo link, badge, scorciatoia)
// si fa QUI, in un solo posto. Non esistono più altre navbar duplicate.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";
import { BuildInfo } from "@/src/components/BuildInfo";
import NotificationsBell from "@/src/components/NotificationsBell";
import { useCurrentStudio } from "@/src/contexts/StudioContext";

export type AppNavbarSection =
  | "home" | "calendar" | "reports" | "noleggio" | "patients"
  | "domicili" | "contabilita" | "settings" | "piano" | "none";

export type AppNavbarProps = {
  /** Sezione attiva — evidenzia il link corrispondente nella nav */
  active: AppNavbarSection;
  /** Rimuove l'ombra sotto la barra (per fondersi con l'header gradiente della home) */
  flat?: boolean;
  /** Callback opzionale per il bottone refresh — se omesso il bottone non appare */
  onRefresh?: () => void;
  /** Solo calendario: click su notifica appuntamento → salta alla data in-pagina. */
  onNotificationAppointmentClick?: (appointmentId: string) => void;
  /** Solo calendario: sezione "Prenotazioni dal sito" nella campanella. */
  bookingSection?: { enabled: boolean; pendingCount: number; onOpenPanel: () => void };
};

export default function AppNavbar({ active, onRefresh, onNotificationAppointmentClick, bookingSection, flat }: AppNavbarProps) {
  // ── User menu (gestione interna: ogni pagina non deve preoccuparsene) ──
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const { studio: currentStudio } = useCurrentStudio();
  const bellEnabled = (currentStudio as any)?.notify_bell_enabled !== false;

  // ── Agenda Ospiti (mig. 029, Step 5g) ────────────────────────────────
  // Carichiamo gli ospiti attivi solo se la feature è ON a livello studio.
  // Logica della voce nel menu:
  //   - 0 ospiti  → voce non renderizzata
  //   - 1 ospite  → click → /ospiti/{id} (diretto)
  //   - 2+ ospiti → click → expand inline con sotto-lista nominativa
  const guestEnabled = (currentStudio as any)?.guest_practitioners_enabled === true;
  const [guestList, setGuestList] = useState<Array<{
    id: string; first_name: string; last_name: string;
    specialty: string; display_color: string | null;
  }>>([]);
  const [guestSubmenuOpen, setGuestSubmenuOpen] = useState(false);

  useEffect(() => {
    if (!guestEnabled || !currentStudio?.id) {
      setGuestList([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("guest_practitioners")
        .select("id, first_name, last_name, specialty, display_color")
        .eq("studio_id", currentStudio.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      if (error) { console.error("Errore caricamento ospiti per navbar:", error); return; }
      setGuestList((data ?? []) as Array<{
        id: string; first_name: string; last_name: string;
        specialty: string; display_color: string | null;
      }>);
    })();
    return () => { cancelled = true; };
  }, [guestEnabled, currentStudio?.id]);

  const hasGuests = guestList.length > 0;
  // mig. 031 — Se il toggle è ON e ci sono 2+ ospiti, mostriamo voce unica
  // "Agenda Ospiti" che porta alla pagina indice /ospiti. Altrimenti comportamento
  // smart: 1=link diretto, 2+=submenu collassabile.
  const useGuestIndex = (currentStudio as { use_guest_index_page?: boolean })?.use_guest_index_page === true;
  const singleGuest = guestList.length === 1 ? guestList[0] : null;
  const multipleGuests = guestList.length > 1 ? guestList : null;
  const showIndexLink = useGuestIndex && guestList.length >= 2;

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data?.user?.email ?? null);
    })();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!userMenuOpen) return;
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [userMenuOpen]);

  const handleLogout = async () => {
    try { await supabase.auth.signOut(); } finally {
      setUserMenuOpen(false);
      window.location.href = "/login";
    }
  };

  const userInitials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "?";

  const allNavItems: { href: string; label: string; key: AppNavbarSection }[] = [
    { href: "/",         label: "Home",       key: "home"     },
    { href: "/calendar", label: "Calendario", key: "calendar" },
    { href: "/reports",  label: "Report",     key: "reports"  },
    { href: "/noleggio", label: "Noleggio",   key: "noleggio" },
    { href: "/patients", label: "Pazienti",   key: "patients" },
    { href: "/domicili", label: "Domicili",   key: "domicili" },
    { href: "/contabilita", label: "Contabilità", key: "contabilita" },
  ];
  // Domicili: visibile solo se il feature flag dello studio è attivo (mig. 056)
  const navItems = allNavItems.filter(it => it.key !== "domicili" || currentStudio?.feature_domicili === true);

  // Color tokens hardcoded per indipendenza dal contesto theme di una pagina
  const COL = {
    border: "#e2e8f0",
    text:   "#0f172a",
    muted:  "#64748b",
    red:    "#dc2626",
  };

  return (
    <>
      <style>{`
        @media (max-width: 900px) {
          .app-nav-search-text, .app-nav-search-kbd { display: none; }
          .app-nav-search { padding: 0 8px !important; }
        }
        @media (max-width: 640px) {
          .app-nav-logo-text { display: none; }
          .app-nav-link { padding: 5px 8px !important; font-size: 11px !important; }
          .app-nav-outer { padding: 0 12px !important; }
        }
        @media print {
          .app-nav-outer { display: none !important; }
        }
      `}</style>
      <header
        className="app-nav-outer"
        style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "linear-gradient(135deg,#0d9488,#2563eb)",
          padding: "0 20px", height: 54,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: flat ? "none" : "0 2px 16px rgba(13,148,136,0.20)", gap: 8,
        }}
      >
        {/* Sinistra: logo + nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0, minWidth: 0 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* Logo FisioHub (mark vettoriale). Sfondo del cerchio già gradient teal→blu nel SVG,
                quindi non serve cornice colorata: lo mostriamo "nudo" sulla navbar gradient. */}
            <img
              src="/logo-mark.svg"
              alt="FisioHub"
              width={28}
              height={28}
              style={{ display: "block", flexShrink: 0 }}
            />
            <span className="app-nav-logo-text" style={{ fontWeight: 700, fontSize: 14, color: "#fff", letterSpacing: 0.5, textTransform: "uppercase" }}>
              Fisio<span style={{ fontWeight: 800 }}>Hub</span>
            </span>
          </Link>
          <nav style={{ display: "flex", gap: 2, minWidth: 0 }}>
            {navItems.map(item => {
              const isActive = item.key === active;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="app-nav-link"
                  style={{
                    padding: "6px 11px", borderRadius: 7,
                    fontSize: 12, fontWeight: 700, letterSpacing: 0.2,
                    background: isActive ? "rgba(255,255,255,0.22)" : "transparent",
                    color: isActive ? "#fff" : "rgba(255,255,255,0.78)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Destra: search + refresh + bell + user menu */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button
            className="app-nav-search"
            onClick={() => window.dispatchEvent(new CustomEvent("fisiohub:open-search"))}
            title="Cerca pazienti e appuntamenti (Ctrl+K)"
            style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 7, padding: "0 11px", height: 30, color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
          >
            <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>⌕</span>
            <span className="app-nav-search-text">Cerca pazienti…</span>
            <span className="app-nav-search-kbd" style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,0.18)", fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>Ctrl K</span>
          </button>

          {onRefresh && (
            <button
              onClick={onRefresh}
              title="Aggiorna"
              style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.14)", color: "#fff", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}
            >↺</button>
          )}

          <NotificationsBell
            enabled={bellEnabled}
            onAppointmentClick={onNotificationAppointmentClick}
            bookingSection={bookingSection}
          />

          <div ref={userMenuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              title={userEmail ?? "Profilo"}
              style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid rgba(255,255,255,0.32)", background: "rgba(255,255,255,0.18)", color: "#fff", fontWeight: 800, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              {userInitials}
            </button>
            {userMenuOpen && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 200, background: "#fff", border: `1px solid ${COL.border}`, borderRadius: 10, boxShadow: "0 8px 28px rgba(15,23,42,0.12)", overflow: "hidden", zIndex: 60 }}>
                <div style={{ padding: "10px 15px", borderBottom: `1px solid ${COL.border}`, fontSize: 12, color: COL.muted, overflow: "hidden", textOverflow: "ellipsis" }}>{userEmail}</div>
                {hasGuests && showIndexLink && (
                  <Link
                    href="/ospiti"
                    onClick={() => setUserMenuOpen(false)}
                    style={{ display: "block", padding: "10px 15px", color: COL.text, fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${COL.border}` }}
                  >
                    📋 Agenda Ospiti
                  </Link>
                )}
                {hasGuests && !showIndexLink && singleGuest && (
                  <Link
                    href={`/ospiti/${singleGuest.id}`}
                    onClick={() => setUserMenuOpen(false)}
                    style={{ display: "block", padding: "10px 15px", color: COL.text, fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${COL.border}` }}
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
                        padding: "10px 15px", background: "transparent", border: "none",
                        cursor: "pointer", color: COL.text, fontSize: 13, fontWeight: 600,
                        borderBottom: `1px solid ${COL.border}`, textAlign: "left",
                      }}
                    >
                      <span>📋 Agenda Ospiti</span>
                      <span style={{ fontSize: 10, color: COL.muted }}>
                        {guestSubmenuOpen ? "▾" : "▸"}
                      </span>
                    </button>
                    {guestSubmenuOpen && (
                      <div style={{ borderBottom: `1px solid ${COL.border}` }}>
                        {multipleGuests.map(g => (
                          <Link
                            key={g.id}
                            href={`/ospiti/${g.id}`}
                            onClick={() => setUserMenuOpen(false)}
                            style={{
                              display: "flex", alignItems: "center", gap: 8,
                              padding: "8px 15px 8px 32px",
                              color: COL.text, fontSize: 12, fontWeight: 600,
                              background: "#f8fafc", textDecoration: "none",
                            }}
                          >
                            <span style={{
                              width: 8, height: 8, borderRadius: "50%",
                              background: g.display_color || "#DB2777", flexShrink: 0,
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
                <Link href="/settings" onClick={() => setUserMenuOpen(false)} style={{ display: "block", padding: "10px 15px", color: COL.text, fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${COL.border}` }}>Impostazioni</Link>
                <Link href="/piano" onClick={() => setUserMenuOpen(false)} style={{ display: "block", padding: "10px 15px", color: COL.text, fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${COL.border}`, textDecoration: "none" }}>💎 Piano</Link>
                <button onClick={handleLogout} style={{ width: "100%", padding: "10px 15px", background: "transparent", border: "none", cursor: "pointer", color: COL.red, fontWeight: 600, fontSize: 13, textAlign: "left" }}>Logout</button>
                <BuildInfo />
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
