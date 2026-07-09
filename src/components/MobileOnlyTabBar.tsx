"use client";

// ─────────────────────────────────────────────────────────────────────
// MobileOnlyTabBar — rende la MobileTabBar (con spaziatore) SOLO sotto
// i 768px. Serve alle pagine server già responsive (es. Ospiti) che
// prima ricevevano la tab bar dal layout /mobile: basta aggiungere
// <MobileOnlyTabBar /> in fondo alla pagina.
// ─────────────────────────────────────────────────────────────────────

import MobileTabBar, { MobileTabBarSpacer } from "./MobileTabBar";
import { useIsMobile } from "@/src/hooks/useIsMobile";

export default function MobileOnlyTabBar() {
  const isMobile = useIsMobile();
  if (!isMobile) return null;
  return (
    <>
      <MobileTabBarSpacer />
      <MobileTabBar />
    </>
  );
}
