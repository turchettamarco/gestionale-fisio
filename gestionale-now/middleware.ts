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

export function middleware(req: NextRequest) {
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
