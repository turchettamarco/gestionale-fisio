// app/api/signup/route.ts
// Endpoint che gestisce la registrazione di un nuovo utente + creazione studio.
//
// Flusso:
// 1. Valida il codice d'invito (deve esistere, non essere scaduto, avere usi disponibili)
// 2. Crea l'utente Supabase Auth (email/password confermata immediatamente per la beta)
// 3. Crea lo studio
// 4. Associa l'utente allo studio come "owner"
// 5. Copia i template di default (message_templates, treatment_prices) per il nuovo studio
// 6. Marca il codice come usato
//
// Body richiesto:
//   { email, password, studio_name, operator_name, invite_code }

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      email,
      password,
      studio_name,
      operator_name,
      invite_code,
    } = body;

    // ─── Validazione input ─────────────────────────────────────────────────
    if (!email || !password || !studio_name || !operator_name || !invite_code) {
      return NextResponse.json(
        { error: "Campi obbligatori mancanti" },
        { status: 400 }
      );
    }

    const emailNorm = String(email).trim().toLowerCase();
    const studioName = String(studio_name).trim();
    const operatorName = String(operator_name).trim();
    const code = String(invite_code).trim().toUpperCase();

    if (password.length < 6) {
      return NextResponse.json(
        { error: "La password deve contenere almeno 6 caratteri" },
        { status: 400 }
      );
    }
    if (!emailNorm.includes("@")) {
      return NextResponse.json({ error: "Email non valida" }, { status: 400 });
    }

    const db = getAdmin();

    // ─── 1. Valida invite code ─────────────────────────────────────────────
    const { data: invite, error: invErr } = await db
      .from("invite_codes")
      .select("code, max_uses, uses_count, used_at")
      .eq("code", code)
      .maybeSingle();

    if (invErr || !invite) {
      return NextResponse.json(
        { error: "Codice invito non valido" },
        { status: 400 }
      );
    }

    if (invite.uses_count >= invite.max_uses) {
      return NextResponse.json(
        { error: "Codice invito esaurito" },
        { status: 400 }
      );
    }

    // ─── 2. Crea utente Supabase Auth ──────────────────────────────────────
    const { data: userData, error: userErr } = await db.auth.admin.createUser({
      email: emailNorm,
      password,
      email_confirm: true, // salta l'email di conferma per la beta
    });

    if (userErr || !userData.user) {
      return NextResponse.json(
        { error: userErr?.message || "Errore creazione utente" },
        { status: 500 }
      );
    }

    const userId = userData.user.id;

    // ─── 3. Crea lo studio ─────────────────────────────────────────────────
    const { data: studioData, error: studioErr } = await db
      .from("studios")
      .insert({
        name: studioName,
        signature_name: operatorName,
        signature_title: "Fisioterapia e Osteopatia",
        email: emailNorm,
      })
      .select("id")
      .single();

    if (studioErr || !studioData) {
      // Rollback: elimina l'utente appena creato
      await db.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: studioErr?.message || "Errore creazione studio" },
        { status: 500 }
      );
    }

    const studioId = studioData.id;

    // ─── 4. Associa utente allo studio come owner ──────────────────────────
    const { error: memberErr } = await db.from("studio_members").insert({
      studio_id: studioId,
      user_id: userId,
      role: "owner",
      display_name: operatorName,
    });

    if (memberErr) {
      // Rollback
      await db.from("studios").delete().eq("id", studioId);
      await db.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: memberErr.message || "Errore associazione studio" },
        { status: 500 }
      );
    }

    // ─── 5. Copia template di default per il nuovo studio ──────────────────
    // Template messaggi WhatsApp
    await db.from("message_templates").insert([
      {
        studio_id: studioId,
        name: "Appuntamento",
        template:
          "Grazie per averci scelto.\nRicordiamo il prossimo appuntamento fissato per {data_relativa} alle {ora}.\n\nA presto,\n" +
          operatorName +
          "\nFisioterapia e Osteopatia",
      },
      {
        studio_id: studioId,
        name: "Promemoria",
        template:
          "Buongiorno {nome},\n\nLe ricordiamo il suo appuntamento di {data_relativa} alle ore {ora}.\n\n📍 {luogo}\n\nCordiali saluti,\n" +
          operatorName +
          "\nFisioterapia e Osteopatia",
      },
    ]);

    // Prezzi di default
    await db.from("treatment_prices").insert([
      { studio_id: studioId, treatment_type: "seduta", price_invoiced: 40, price_cash: 40 },
      { studio_id: studioId, treatment_type: "macchinario", price_invoiced: 25, price_cash: 25 },
    ]);

    // Impostazioni pratica di default
    await db.from("practice_settings").insert({
      studio_id: studioId,
      standard_invoice: 40,
      standard_cash: 40,
      machine_invoice: 25,
      machine_cash: 25,
      auto_apply_prices: true,
      default_appointment_status: "confirmed",
      overlap_mode: "warn",
    });

    // ─── 6. Marca il codice come usato ─────────────────────────────────────
    await db
      .from("invite_codes")
      .update({
        uses_count: invite.uses_count + 1,
        used_at: invite.uses_count + 1 >= invite.max_uses ? new Date().toISOString() : null,
        used_by: userId,
      })
      .eq("code", code);

    return NextResponse.json({
      ok: true,
      user_id: userId,
      studio_id: studioId,
    });
  } catch (e: any) {
    console.error("[signup POST] exception:", e?.message);
    return NextResponse.json(
      { error: e?.message || "Errore server" },
      { status: 500 }
    );
  }
}
