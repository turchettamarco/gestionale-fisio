// app/(protected)/settings/components/SettingsNavBar.tsx
// ═══════════════════════════════════════════════════════════════════════
// Navbar sticky della pagina Impostazioni con menu utente.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BuildInfo } from "@/src/components/BuildInfo";
import { THEME } from "./shared/theme";

export type SettingsNavBarProps = {
  userEmail: string | null;
  onLogout: () => void;
};

export default function SettingsNavBar({ userEmail, onLogout }: SettingsNavBarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

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

  const userInitials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "?";

  const navItems = [
    { href: "/",         label: "Home",          active: false },
    { href: "/calendar", label: "Calendario",    active: false },
    { href: "/reports",  label: "Report",        active: false },
    { href: "/patients", label: "Pazienti",      active: false },
    { href: "/noleggio", label: "Noleggio",      active: false },
    { href: "/settings", label: "Impostazioni",  active: true  },
  ];

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 30, background: "linear-gradient(135deg,#0d9488,#2563eb)", padding: "0 20px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 2px 12px rgba(13,148,136,0.18)", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.2)", border: "1.5px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 14 }}>F</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#fff", letterSpacing: 0.5, textTransform: "uppercase" }}>
            Fisio<span style={{ fontWeight: 800 }}>Hub</span>
          </span>
        </div>
        <nav style={{ display: "flex", gap: 2 }}>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: item.active ? "rgba(255,255,255,0.2)" : "transparent", color: item.active ? "#fff" : "rgba(255,255,255,0.8)", letterSpacing: 0.3 }}>
              <span className="th">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <div ref={userMenuRef} style={{ position: "relative" }}>
          <button onClick={() => setUserMenuOpen(v => !v)} style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.2)", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{userInitials}</button>
          {userMenuOpen && (
            <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 200, background: "#fff", border: `1px solid ${THEME.border}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(15,23,42,0.10)", overflow: "hidden", zIndex: 60 }}>
              <div style={{ padding: "11px 16px", borderBottom: `1px solid ${THEME.border}`, fontSize: 12, color: THEME.muted }}>{userEmail}</div>
              <Link href="/piano" onClick={() => setUserMenuOpen(false)} style={{ display: "block", padding: "11px 16px", color: THEME.text, textDecoration: "none", fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${THEME.border}` }}>💎 Piano</Link>
              <button onClick={onLogout} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", background: "transparent", border: "none", cursor: "pointer", color: THEME.red, fontWeight: 600, fontSize: 13 }}>Logout</button>
              <BuildInfo />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
