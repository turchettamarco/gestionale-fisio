"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";
import { COLORS } from "@/src/theme/tokens";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { usePermissions } from "@/src/hooks/usePermissions";

// ─────────────────────────────────────────────────────────────────────
// Barra di navigazione inferiore — Restyling Direzione A (R1).
// Icone SVG a tratto uniforme al posto dei glifi testuali/emoji,
// superficie warm (#FFFDF9), voce attiva in teal.
// ─────────────────────────────────────────────────────────────────────

type TabItem = {
  href: string;
  label: string;
  icon: IconName;
  match: string[];
  exact?: boolean;
};

const ITEMS: TabItem[] = [
  { href: "/", label: "Home", icon: "home", match: ["/"], exact: true },
  { href: "/calendar", label: "Agenda", icon: "calendar", match: ["/calendar"] },
  { href: "/patients", label: "Pazienti", icon: "users", match: ["/patients"] },
  { href: "/reports", label: "Report", icon: "chart", match: ["/reports"] },
  { href: "/noleggio", label: "Noleggio", icon: "plug", match: ["/noleggio"] },
  { href: "/domicili", label: "Domicili", icon: "pulse", match: ["/domicili"] },
  { href: "/settings", label: "Impost.", icon: "settings", match: ["/settings"] },
];

// Altezza del contenuto della barra (icone + testo), SENZA la safe-area.
const BAR_CONTENT_H = 48;

export default function MobileTabBar() {
  const { studio } = useCurrentStudio();
  const { can, isOwner } = usePermissions();
  // Permessi (mig. 071): le voci compaiono solo se il collaboratore ha il
  // permesso corrispondente. Un terapista con livello Base vede Home,
  // Agenda e Pazienti.
  const items = ITEMS.filter(it => {
    if (it.href === "/domicili" && studio?.feature_domicili !== true) return false;
    switch (it.href) {
      case "/reports":   return can("money.reports");
      case "/noleggio":  return can("money.accounting");
      case "/domicili":  return can("manage.domicili");
      case "/settings":  return isOwner || can("manage.settings");
      default:           return true;
    }
  });

  const pathname = usePathname() || "/";

  const isActive = (item: TabItem) => {
    if (item.exact) return item.match.includes(pathname);
    return item.match.some(m => pathname === m || pathname.startsWith(m + "/"));
  };

  return (
    <nav
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: COLORS.surfaceSoft,
        borderTop: `1px solid ${COLORS.line}`, display: "flex", zIndex: 40,
        height: `calc(${BAR_CONTENT_H}px + env(safe-area-inset-bottom,0px))`,
        paddingBottom: "env(safe-area-inset-bottom,0px)",
        boxShadow: "0 -1px 8px rgba(26,29,36,0.04)",
      }}
    >
      {items.map(item => {
        const active = isActive(item);
        const color = active ? COLORS.teal : COLORS.warm400;
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 3,
              textDecoration: "none", paddingTop: 6, paddingBottom: 4,
            }}
          >
            <Icon name={item.icon} size={19} color={color} strokeWidth={active ? 2.2 : 2} />
            <span style={{
              fontSize: 10, lineHeight: 1,
              fontWeight: active ? 700 : 500,
              color: active ? COLORS.teal : COLORS.warm400,
            }}>
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
