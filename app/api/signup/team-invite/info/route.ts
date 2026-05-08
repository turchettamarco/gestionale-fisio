// app/api/signup/team-invite/info/route.ts
// ═══════════════════════════════════════════════════════════════════════
// Endpoint READ-ONLY: dato un token di invito, restituisce le info
// per pre-popolare il form (nome studio, email suggerita, ruolo, nome
// suggerito dall'owner).
//
// SCOPO: prima ancora che il collega si registri, vogliamo mostrargli:
// - "Stai entrando nel team di {studio.name}"
// - email pre-compilata
// - nome pre-compilato
//
// SICUREZZA:
// - Usa service_role per bypassare RLS (siamo in pre-auth)
// - Non rivela nulla di sensibile (solo nome studio + ruolo + email
//   già nota a chi possiede il token, che gli è stato passato)
// - Un attaccante che genera UUID a caso ottiene 404 (token non trovato),
//   senza sapere quanti inviti pendenti ci sono
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Configurazione mancante: SUPABASE_SERVICE_ROLE_KEY richiesta");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function isValidUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";

  if (!token || !isValidUuid(token)) {
    return NextResponse.json(
      { error: "Token mancante o non valido.", code: "INVALID_TOKEN" },
      { status: 400 }
    );
  }

  try {
    const db = getAdmin();

    // Cerco l'invito + lo studio in un'unica query con join
    const { data: invite, error } = await db
      .from("studio_members")
      .select("studio_id, user_id, email, display_name, role, is_active")
      .eq("invite_token", token)
      .maybeSingle();

    if (error) {
      console.error("[team-invite/info] lookup error:", error.message);
      return NextResponse.json(
        { error: "Errore di verifica.", code: "LOOKUP_ERROR" },
        { status: 500 }
      );
    }

    if (!invite) {
      return NextResponse.json(
        { error: "Invito non trovato. Il link potrebbe essere scaduto o annullato.", code: "INVITE_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (invite.user_id != null) {
      return NextResponse.json(
        { error: "Questo invito è già stato accettato.", code: "INVITE_ALREADY_CLAIMED" },
        { status: 410 }
      );
    }

    if (!invite.is_active) {
      return NextResponse.json(
        { error: "Questo invito è stato annullato.", code: "INVITE_DEACTIVATED" },
        { status: 410 }
      );
    }

    // Recupera il nome dello studio
    const { data: studio } = await db
      .from("studios")
      .select("name")
      .eq("id", invite.studio_id)
      .maybeSingle();

    return NextResponse.json({
      studio_id: invite.studio_id,
      studio_name: studio?.name || "Studio",
      suggested_name: invite.display_name,
      suggested_email: invite.email,
      role: invite.role,
    });
  } catch (e: any) {
    console.error("[team-invite/info] uncaught:", e?.message || e);
    return NextResponse.json(
      { error: "Errore interno.", code: "INTERNAL" },
      { status: 500 }
    );
  }
}
