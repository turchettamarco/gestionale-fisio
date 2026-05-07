// src/components/AppNavbar.tsx
// ═══════════════════════════════════════════════════════════════════════
// Navbar globale unificata, usata da tutte le pagine protected eccetto
// /calendar (che mantiene la sua CalendarTopBar dedicata per via della
// campanella prenotazioni dal sito + click-to-navigate appuntamenti).
//
// Pagine che la usano:
//   - / (Home)
//   - /reports (riga 1, sotto c'è il sub-header Report)
//   - /patients
//   - /noleggio
//   - /settings (sopra la sub-nav delle sezioni)
//   - /piano (sopra la sub-nav dei piani)
//
// Per uniformità futura: qualsiasi modifica alla nav globale (nuovo link,
// badge, scorciatoia) si fa qui in un solo posto.
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
  | "settings" | "piano" | "none";

export type AppNavbarProps = {
  /** Sezione attiva — evidenzia il link corrispondente nella nav */
  active: AppNavbarSection;
  /** Callback opzionale per il bottone refresh — se omesso il bottone non appare */
  onRefresh?: () => void;
};

export default function AppNavbar({ active, onRefresh }: AppNavbarProps) {
  // ── User menu (gestione interna: ogni pagina non deve preoccuparsene) ──
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const { studio: currentStudio } = useCurrentStudio();
  const bellEnabled = (currentStudio as any)?.notify_bell_enabled !== false;

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

  const navItems: { href: string; label: string; key: AppNavbarSection }[] = [
    { href: "/",         label: "Home",       key: "home"     },
    { href: "/calendar", label: "Calendario", key: "calendar" },
    { href: "/reports",  label: "Report",     key: "reports"  },
    { href: "/noleggio", label: "Noleggio",   key: "noleggio" },
    { href: "/patients", label: "Pazienti",   key: "patients" },
  ];

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
          boxShadow: "0 2px 16px rgba(13,148,136,0.20)", gap: 8,
        }}
      >
        {/* Sinistra: logo + nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0, minWidth: 0 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(255,255,255,0.2)", border: "1.5px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>F</div>
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

          <NotificationsBell enabled={bellEnabled} />

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
