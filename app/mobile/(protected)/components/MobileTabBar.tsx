"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Barra di navigazione inferiore condivisa da tutte le pagine mobile.
// Unica fonte di verità: niente più barre duplicate nelle singole pagine.
const ITEMS = [
  { href: "/mobile", label: "Home", icon: "⌂" },
  { href: "/mobile/calendar", label: "Calendario", icon: "▦" },
  { href: "/mobile/patients", label: "Pazienti", icon: "◉" },
  { href: "/mobile/reports", label: "Report", icon: "◈" },
  { href: "/mobile/noleggio", label: "Noleggio", icon: "🔌" },
  { href: "/mobile/settings", label: "Impost.", icon: "⚙" },
];

const BLUE = "#2563eb";
const GRAY = "#94a3b8";
const BORDER = "#e2e8f0";
const GRADIENT = "linear-gradient(135deg,#0d9488,#2563eb)";

// Altezza del contenuto della barra (icone + testo), SENZA la safe-area.
// Compatta: le icone siedono in basso, vicino alla home bar arrotondata.
const BAR_CONTENT_H = 48;

export default function MobileTabBar() {
  const pathname = usePathname() || "/mobile";

  const isActive = (href: string) => {
    if (href === "/mobile") return pathname === "/mobile";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <nav
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "#fff",
        borderTop: `1px solid ${BORDER}`, display: "flex", zIndex: 40,
        height: `calc(${BAR_CONTENT_H}px + env(safe-area-inset-bottom,0px))`,
        paddingBottom: "env(safe-area-inset-bottom,0px)",
        boxShadow: "0 -1px 8px rgba(15,23,42,0.04)",
      }}
    >
      {ITEMS.map(item => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 2,
              textDecoration: "none", paddingTop: 5, paddingBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 18, lineHeight: 1,
                ...(active
                  ? { background: GRADIENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }
                  : { color: GRAY }),
              }}
            >
              {item.icon}
            </span>
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? BLUE : GRAY }}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

// Spaziatore da inserire in fondo al contenuto di ogni pagina, così l'ultimo
// elemento non finisce sotto la barra fissa (include la safe-area iOS).
export function MobileTabBarSpacer() {
  return <div style={{ height: `calc(${BAR_CONTENT_H}px + env(safe-area-inset-bottom,0px))` }} />;
}
