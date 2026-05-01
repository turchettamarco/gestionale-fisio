// src/lib/supabaseServer.ts
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function parseCookieHeader(cookieHeader: string) {
  if (!cookieHeader) return [];
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((kv) => {
      const idx = kv.indexOf("=");
      const name = idx >= 0 ? kv.slice(0, idx) : kv;
      const value = idx >= 0 ? kv.slice(idx + 1) : "";
      return { name, value };
    });
}

/**
 * Supabase server client (per layout / server components):
 * legge i cookie dalla request (header "cookie") e quindi getUser() funziona.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const cookieHeader = headerStore.get("cookie") ?? "";
  const allCookies = parseCookieHeader(cookieHeader);

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return allCookies;
      },
      setAll(cookiesToSet) {
        // Tentiamo di scriverli: in alcuni contesti RSC non è permesso, ma non deve crashare
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            (cookieStore as any).set?.(name, value, options);
          });
        } catch {
          // ok
        }
      },
    },
  });
}

/**
 * Admin (service role) SOLO server (route handlers).
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
