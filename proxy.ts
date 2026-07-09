// proxy.ts (Next 16: ex middleware)
// ═══════════════════════════════════════════════════════════════════════
// UNIFICAZIONE COMPLETATA (Tappe 1-10, luglio 2026)
//
// L'app è ora un unico albero di route responsive: non esiste più il
// mondo parallelo /mobile né lo sniffing dello user-agent. Ogni pagina
// decide da sola come rendersi (useIsMobile, < 768px).
//
// Questo proxy resta SOLO per retrocompatibilità: vecchi segnalibri,
// PWA installate tempo fa e link inviati ai pazienti su WhatsApp che
// puntano ancora a /mobile/... vengono riportati all'URL pulito.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";

const PUBLIC_FILE = /\.(.*)$/;

// Path legacy senza equivalente 1:1 nell'albero unificato
const LEGACY_MAP: Record<string, string> = {
  "/agenda": "/", // la vecchia /mobile/agenda è coperta dall'agenda in home
};

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Escludi assets, Next internals, API
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  // ✅ Legacy: /mobile/... -> URL pulito
  if (pathname === "/mobile" || pathname.startsWith("/mobile/")) {
    const stripped = pathname.replace(/^\/mobile/, "") || "/";
    const url = req.nextUrl.clone();
    url.pathname = LEGACY_MAP[stripped] ?? stripped;
    url.search = search;
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
