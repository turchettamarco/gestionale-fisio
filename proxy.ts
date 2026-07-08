// middleware.ts
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_FILE = /\.(.*)$/;

function isPhoneUserAgent(ua: string) {
  const u = ua.toLowerCase();

  // Tablet: NON deve andare su mobile (desktop view)
  const isTablet =
    u.includes("ipad") ||
    (u.includes("android") && !u.includes("mobile")) ||
    u.includes("tablet") ||
    u.includes("kindle") ||
    u.includes("silk") ||
    u.includes("playbook");

  if (isTablet) return false;

  // Phone: redirect a /mobile
  const isPhone =
    u.includes("iphone") ||
    u.includes("ipod") ||
    (u.includes("android") && u.includes("mobile")) ||
    u.includes("windows phone") ||
    u.includes("opera mini");

  return isPhone;
}

// ═══════════════════════════════════════════════════════════════════════
// ROUTE UNIFICATE
// ═══════════════════════════════════════════════════════════════════════
// Pagine che sono state unificate: UNA sola pagina responsive serve sia
// telefono che desktop, quindi il telefono NON viene più reindirizzato
// su /mobile per questi path. Chi arriva su /mobile/<route unificata>
// (vecchi link, segnalibri, tab bar) viene riportato alla versione unica.
//
// Match ESATTO sul path: "/patients" è unificata, ma "/patients/[id]" e
// "/patients/new" NO (ancora due versioni) e continuano a seguire le
// regole telefono→/mobile qui sotto.
//
// Aggiungere qui i path man mano che le tappe di unificazione procedono.
// ═══════════════════════════════════════════════════════════════════════
const UNIFIED_ROUTES = new Set<string>([
  "/patients",     // Tappa 1 — lista pazienti
  "/patients/new", // Tappa 3 — nuovo paziente
]);

// Prefissi unificati: come sopra, ma per route DINAMICHE ([token], [id], …)
// dove il match esatto non basta. "/esercizi" copre "/esercizi/abc123" ecc.
// Tappa 2 — le 6 pagine pubbliche con token erano già identiche su mobile
// (puri re-export): ora esiste solo la versione unica.
const UNIFIED_PREFIXES: string[] = [
  "/conferma",
  "/consensi",
  "/esercizi",
  "/portale",
  "/scale",
  "/survey",
];

function isUnifiedPath(pathname: string): boolean {
  if (UNIFIED_ROUTES.has(pathname)) return true;
  return UNIFIED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/"));
}

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

  const ua = req.headers.get("user-agent") || "";
  const isPhone = isPhoneUserAgent(ua);

  const isAlreadyMobile = pathname.startsWith("/mobile");

  // ✅ Route unificata: il telefono resta dov'è, nessun redirect a /mobile
  if (isPhone && !isAlreadyMobile && isUnifiedPath(pathname)) {
    return NextResponse.next();
  }

  // ✅ /mobile/<route unificata> -> versione unica (per chiunque)
  if (isAlreadyMobile) {
    const stripped = pathname.replace(/^\/mobile/, "") || "/";
    if (isUnifiedPath(stripped)) {
      const url = req.nextUrl.clone();
      url.pathname = stripped;
      url.search = search;
      return NextResponse.redirect(url);
    }
  }

  // ✅ Telefono su desktop -> vai su /mobile
  if (isPhone && !isAlreadyMobile) {
    const url = req.nextUrl.clone();
    url.pathname = `/mobile${pathname}`;
    url.search = search;
    return NextResponse.redirect(url);
  }

  // (Opzionale) Desktop/tablet su mobile -> torna a desktop
  // Se NON lo vuoi, elimina questo blocco.
  if (!isPhone && isAlreadyMobile) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.replace(/^\/mobile/, "") || "/";
    url.search = search;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
