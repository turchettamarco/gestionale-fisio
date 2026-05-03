// app/(protected)/components/dashboard/DashboardNavBar.tsx
// ═══════════════════════════════════════════════════════════════════════
// Navbar sticky della dashboard con search, refresh, push toggle, menu utente.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BuildInfo } from "@/src/components/BuildInfo";
import NotificationsBell from "@/src/components/NotificationsBell";
import { THEME } from "./shared/theme";

export type DashboardNavBarProps = {
  userEmail: string | null;
  userInitials: string;
  onRefresh: () => void;
  pushEnabled: boolean;
  pushLoading: boolean;
  onRequestPushPermission: () => void;
  onLogout: () => void;
  // Bell notifiche pazienti (Fase N2)
  notificationsBellEnabled: boolean;
  onNotificationAppointmentClick?: (appointmentId: string) => void;
};

export default function DashboardNavBar(p: DashboardNavBarProps) {
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

  const navItems = [
    { href: "/",         label: "Home",         active: true  },
    { href: "/calendar", label: "Calendario",   active: false },
    { href: "/reports",  label: "Report",       active: false },
    { href: "/noleggio", label: "Noleggio",     active: false },
    { href: "/patients", label: "Pazienti",     active: false },
  ];

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 40, background: "linear-gradient(135deg,#0d9488,#2563eb)", padding: "0 24px", height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 2px 16px rgba(13,148,136,0.20)", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(255,255,255,0.2)", border: "1.5px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>F</div>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#fff", letterSpacing: 0.8, textTransform: "uppercase" }}>
            Fisio<span style={{ fontWeight: 800 }}>Hub</span>
          </span>
        </div>
        <nav style={{ display: "flex", gap: 1 }}>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} style={{ padding: "5px 11px", borderRadius: 7, fontSize: 12, fontWeight: 700, background: item.active ? "rgba(255,255,255,0.22)" : "transparent", color: item.active ? "#fff" : "rgba(255,255,255,0.78)", letterSpacing: 0.2 }}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <button
          className="th"
          onClick={() => window.dispatchEvent(new CustomEvent("fisiohub:open-search"))}
          title="Cerca pazienti e appuntamenti (Ctrl+K)"
          style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 7, padding: "0 11px", height: 30, color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
        >
          <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>⌕</span>
          <span>Cerca pazienti…</span>
          <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,0.18)", fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>Ctrl K</span>
        </button>
        <button onClick={p.onRefresh} style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.14)", color: "#fff", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>↺</button>

        <button
          onClick={p.onRequestPushPermission}
          disabled={p.pushLoading || p.pushEnabled}
          title={p.pushEnabled ? "Notifiche attive" : "Attiva notifiche push"}
          style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid rgba(255,255,255,0.28)", background: p.pushEnabled ? "rgba(134,239,172,0.25)" : "rgba(255,255,255,0.14)", color: "#fff", cursor: p.pushEnabled ? "default" : "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", opacity: p.pushLoading ? 0.6 : 1 }}
        >
          {p.pushLoading ? "…" : p.pushEnabled ? "🔔" : "🔕"}
        </button>

        {/* Bell notifiche pazienti (Fase N2) */}
        <NotificationsBell
          enabled={p.notificationsBellEnabled}
          onAppointmentClick={p.onNotificationAppointmentClick}
        />

        <div ref={userMenuRef} style={{ position: "relative" }}>
          <button onClick={() => setUserMenuOpen(v => !v)} style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid rgba(255,255,255,0.32)", background: "rgba(255,255,255,0.18)", color: "#fff", fontWeight: 800, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {p.userInitials}
          </button>
          {userMenuOpen && (
            <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 196, background: "#fff", border: `1px solid ${THEME.border}`, borderRadius: 10, boxShadow: "0 8px 28px rgba(15,23,42,0.12)", overflow: "hidden", zIndex: 60 }}>
              <div style={{ padding: "10px 15px", borderBottom: `1px solid ${THEME.border}`, fontSize: 12, color: THEME.muted }}>{p.userEmail}</div>
              <Link href="/settings" onClick={() => setUserMenuOpen(false)} style={{ display: "block", padding: "10px 15px", color: THEME.text, fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${THEME.border}` }}>Impostazioni</Link>
              <Link href="/piano" onClick={() => setUserMenuOpen(false)} style={{ display: "block", padding: "10px 15px", color: THEME.text, fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${THEME.border}`, textDecoration: "none" }}>💎 Piano</Link>
              <button onClick={p.onLogout} style={{ width: "100%", padding: "10px 15px", background: "transparent", border: "none", cursor: "pointer", color: THEME.red, fontWeight: 600, fontSize: 13, textAlign: "left" }}>Logout</button>
              <BuildInfo />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
