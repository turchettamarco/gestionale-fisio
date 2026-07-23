// ═══════════════════════════════════════════════════════════════════════
// app/api/team/activate/route.ts
// ═══════════════════════════════════════════════════════════════════════
// Attivazione immediata di un collaboratore invitato.
//
// PROBLEMA RISOLTO:
// Un membro invitato ma non ancora registrato non ha un account, e gli
// appuntamenti si legano all'account: finché non completa l'iscrizione non
// compare nei selettori e non gli si può prenotare nulla. Se il collega è
// in ferie, o entra in studio il mese prossimo, l'agenda resta bloccata.
//
// Qui il titolare crea direttamente l'account con una password provvisoria:
// il collaboratore diventa operativo subito e cambierà la password al primo
// accesso (o con il recupero password).
//
// SICUREZZA:
//   • Solo titolare o co-titolare, e solo sul proprio studio.
//   • La service role sta esclusivamente lato server, mai esposta.
//   • Non si tocca un membro già registrato: la route serve solo per i
//     placeholder in attesa (user_id NULL).
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Configurazione mancante: SUPABASE_SERVICE_ROLE_KEY richiesta");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function fail(code: string, message: string, status = 400) {
  return NextResponse.json({ error: code, message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const memberId = String(body?.member_id ?? "").trim();
    const password = String(body?.password ?? "");

    if (!memberId || !password) {
      return fail("MISSING_FIELDS", "Dati mancanti.");
    }
    if (password.length < 8) {
      return fail("WEAK_PASSWORD", "La password provvisoria deve avere almeno 8 caratteri.");
    }

    // ── 1. Chi sta chiamando ────────────────────────────────────────────
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("UNAUTHENTICATED", "Sessione scaduta. Rientra e riprova.", 401);

    const db = adminClient();

    // ── 2. Il membro da attivare ────────────────────────────────────────
    const { data: member, error: memberErr } = await db
      .from("studio_members")
      .select("id, studio_id, user_id, email, display_name")
      .eq("id", memberId)
      .maybeSingle();

    if (memberErr || !member) {
      return fail("MEMBER_NOT_FOUND", "Collaboratore non trovato.", 404);
    }
    if (member.user_id) {
      return fail("ALREADY_ACTIVE", "Questo collaboratore ha già un account attivo.");
    }
    if (!member.email) {
      return fail("MISSING_EMAIL", "Il collaboratore non ha un'email: modificala nella scheda e riprova.");
    }

    // ── 3. Il chiamante deve essere titolare di QUELLO studio ───────────
    const { data: caller } = await db
      .from("studio_members")
      .select("role, is_active")
      .eq("studio_id", member.studio_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!caller || caller.is_active === false
        || (caller.role !== "owner" && caller.role !== "co_owner")) {
      return fail("FORBIDDEN", "Solo il titolare dello studio può attivare un collaboratore.", 403);
    }

    // ── 4. Crea l'account ───────────────────────────────────────────────
    const email = String(member.email).trim().toLowerCase();
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr || !created?.user) {
      const msg = (createErr?.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered")) {
        return fail(
          "EMAIL_ALREADY_REGISTERED",
          "Esiste già un account con questa email. Fai accedere il collaboratore con le sue credenziali: al primo accesso verrà collegato allo studio."
        );
      }
      console.error("[team/activate] createUser:", createErr?.message);
      return fail("AUTH_CREATE_ERROR", "Errore nella creazione dell'account. Riprova.", 500);
    }

    // ── 5. Aggancia il placeholder ──────────────────────────────────────
    const { error: linkErr } = await db
      .from("studio_members")
      .update({ user_id: created.user.id, invite_token: null })
      .eq("id", memberId);

    if (linkErr) {
      // L'account è stato creato ma non collegato: lo rimuoviamo per non
      // lasciare un utente orfano che bloccherebbe un secondo tentativo.
      await db.auth.admin.deleteUser(created.user.id);
      console.error("[team/activate] link:", linkErr.message);
      return fail("LINK_ERROR", "Account creato ma non collegato allo studio. Riprova.", 500);
    }

    return NextResponse.json({
      ok: true,
      email,
      display_name: member.display_name,
    });
  } catch (e) {
    console.error("[team/activate]", e instanceof Error ? e.message : e);
    return fail("UNEXPECTED", "Errore imprevisto. Riprova.", 500);
  }
}
