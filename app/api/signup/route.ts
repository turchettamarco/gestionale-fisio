// app/api/signup/route.ts
// Endpoint che gestisce la registrazione di un nuovo utente + creazione studio.
//
// Flusso:
// 1. Valida input (formato email, lunghezza password, campi obbligatori)
// 2. Valida il codice d'invito (esiste, non scaduto, usi disponibili)
// 3. Crea l'utente Supabase Auth (email già confermata per la beta)
// 4. Crea lo studio
// 5. Associa l'utente come "owner"
// 6. Copia template di default (messaggi WA, prezzi, impostazioni)
// 7. Marca il codice come usato
//
// Risposta in caso di errore:
//   { error: string, code: string }
// dove `code` è un identificativo macchina usato dal frontend per scegliere
// il messaggio da mostrare (vedi app/signup/page.tsx).

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

// Helper per risposte di errore strutturate
function errorResponse(code: string, message: string, status: number = 400) {
  return NextResponse.json({ error: message, code }, { status });
}

// Validazione email base (RFC 5322 semplificata)
function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Validazione password forte: almeno 8 caratteri, 1 lettera, 1 numero
function validatePassword(password: string): { valid: boolean; reason?: string } {
  if (password.length < 8) {
    return { valid: false, reason: "almeno 8 caratteri" };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, reason: "almeno una lettera" };
  }
  if (!/\d/.test(password)) {
    return { valid: false, reason: "almeno un numero" };
  }
  return { valid: true };
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

    // ─── 1. Validazione input ─────────────────────────────────────────────
    if (!email || !password || !studio_name || !operator_name || !invite_code) {
      return errorResponse("MISSING_FIELDS", "Compila tutti i campi obbligatori.");
    }

    const emailNorm = String(email).trim().toLowerCase();
    const studioName = String(studio_name).trim();
    const operatorName = String(operator_name).trim();
    const code = String(invite_code).trim().toUpperCase();

    if (!isValidEmail(emailNorm)) {
      return errorResponse("INVALID_EMAIL", "L'email non è in un formato valido. Verifica di averla scritta correttamente.");
    }

    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) {
      return errorResponse(
        "WEAK_PASSWORD",
        `La password deve contenere ${pwdCheck.reason}.`
      );
    }

    if (studioName.length < 2) {
      return errorResponse("INVALID_STUDIO_NAME", "Il nome dello studio è troppo corto.");
    }
    if (operatorName.length < 2) {
      return errorResponse("INVALID_OPERATOR_NAME", "Il nome dell'operatore è troppo corto.");
    }

    const db = getAdmin();

    // ─── 2. Valida invite code ─────────────────────────────────────────────
    const { data: invite, error: invErr } = await db
      .from("invite_codes")
      .select("code, max_uses, uses_count, used_at, expires_at, revoked_at, recipient_name, plan_id")
      .eq("code", code)
      .maybeSingle();

    if (invErr) {
      console.error("[signup] invite lookup error:", invErr.message);
      return errorResponse("DB_ERROR", "Errore di sistema. Riprova tra qualche minuto.", 500);
    }

    if (!invite) {
      return errorResponse(
        "INVITE_NOT_FOUND",
        "Questo codice invito non esiste. Verifica di averlo scritto correttamente o contatta chi te l'ha fornito."
      );
    }

    // Codice revocato?
    if ((invite as any).revoked_at) {
      return errorResponse(
        "INVITE_REVOKED",
        "Questo codice invito è stato revocato e non può più essere usato. Richiedi un nuovo codice."
      );
    }

    // Codice scaduto?
    if ((invite as any).expires_at) {
      const expDate = new Date((invite as any).expires_at);
      if (expDate < new Date()) {
        return errorResponse(
          "INVITE_EXPIRED",
          `Questo codice invito è scaduto il ${expDate.toLocaleDateString("it-IT")}. Richiedi un nuovo codice.`
        );
      }
    }

    // Codice già usato al massimo?
    if (invite.uses_count >= invite.max_uses) {
      return errorResponse(
        "INVITE_EXHAUSTED",
        "Questo codice invito è già stato utilizzato e non è più disponibile."
      );
    }

    // ─── 3. Verifica se l'email è già registrata ──────────────────────────
    // (Lo verifichiamo prima di creare l'utente così diamo un errore chiaro)
    const { data: existing } = await db.auth.admin.listUsers({ page: 1, perPage: 100 });
    const alreadyExists = existing?.users?.some(
      (u) => u.email?.toLowerCase() === emailNorm
    );
    if (alreadyExists) {
      return errorResponse(
        "EMAIL_ALREADY_REGISTERED",
        "Questa email è già registrata. Prova ad accedere o usa la funzione 'Password dimenticata' se non ricordi la password."
      );
    }

    // ─── 4. Crea utente Supabase Auth ──────────────────────────────────────
    const { data: userData, error: userErr } = await db.auth.admin.createUser({
      email: emailNorm,
      password,
      email_confirm: true,
    });

    if (userErr || !userData.user) {
      // Potrebbe essere una collisione email sfuggita al check precedente
      const msg = userErr?.message || "";
      if (/already registered|already exists|duplicate/i.test(msg)) {
        return errorResponse(
          "EMAIL_ALREADY_REGISTERED",
          "Questa email è già registrata. Prova ad accedere."
        );
      }
      console.error("[signup] createUser error:", msg);
      return errorResponse(
        "AUTH_ERROR",
        "Errore durante la creazione dell'account. Riprova o contatta il supporto.",
        500
      );
    }

    const userId = userData.user.id;

    // ─── 5. Crea lo studio ─────────────────────────────────────────────────
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
      await db.auth.admin.deleteUser(userId);
      console.error("[signup] studio create error:", studioErr?.message);
      return errorResponse(
        "STUDIO_CREATE_ERROR",
        "Errore durante la creazione del tuo studio. Riprova tra qualche minuto.",
        500
      );
    }

    const studioId = studioData.id;

    // ─── 5b. Assegna il piano dal codice invito (se specificato) ──────────
    // Se il codice ha un plan_id preassegnato, usa quello.
    // Altrimenti usa il piano di default della piattaforma (is_default = true).
    const invitePlanId: string | null = (invite as { plan_id?: string | null }).plan_id ?? null;

    if (invitePlanId) {
      // Piano preassegnato dal codice
      await db.from("studios").update({ plan_id: invitePlanId }).eq("id", studioId);
    } else {
      // Nessun piano preassegnato → usa default
      const { data: defaultPlan } = await db
        .from("plans")
        .select("id")
        .eq("is_default", true)
        .maybeSingle();
      if (defaultPlan) {
        await db.from("studios").update({ plan_id: defaultPlan.id }).eq("id", studioId);
      }
    }

    // ─── 6. Associa utente allo studio come owner ──────────────────────────
    const { error: memberErr } = await db.from("studio_members").insert({
      studio_id: studioId,
      user_id: userId,
      role: "owner",
      display_name: operatorName,
    });

    if (memberErr) {
      await db.from("studios").delete().eq("id", studioId);
      await db.auth.admin.deleteUser(userId);
      console.error("[signup] studio_members error:", memberErr.message);
      return errorResponse(
        "MEMBER_CREATE_ERROR",
        "Errore durante la configurazione del tuo profilo. Riprova.",
        500
      );
    }

    // ─── 7. Copia template di default ──────────────────────────────────────
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
          "{saluto} {nome},\n\nLe ricordiamo il suo appuntamento di {data_relativa} alle ore {ora}.\n\n📍 {luogo}\n\nCordiali saluti,\n" +
          operatorName +
          "\nFisioterapia e Osteopatia",
      },
    ]);

    await db.from("treatment_prices").insert([
      { studio_id: studioId, treatment_type: "seduta", price_invoiced: 40, price_cash: 40 },
      { studio_id: studioId, treatment_type: "macchinario", price_invoiced: 25, price_cash: 25 },
    ]);

    await db.from("practice_settings").insert({
      studio_id: studioId,
      owner_id: userId,
      standard_invoice: 40,
      standard_cash: 40,
      machine_invoice: 25,
      machine_cash: 25,
      auto_apply_prices: true,
      default_appointment_status: "confirmed",
      overlap_mode: "warn",
    });

    // ─── 8. Marca il codice come usato ─────────────────────────────────────
    await db
      .from("invite_codes")
      .update({
        uses_count: invite.uses_count + 1,
        used_at: invite.uses_count + 1 >= invite.max_uses ? new Date().toISOString() : null,
        used_by: userId,
      })
      .eq("code", code);

    // ─── 9. Email di benvenuto (best-effort, non blocca il signup) ──────────
    // Importiamo dinamicamente per non fare crash se la utility non è caricata
    try {
      const { sendEmail } = await import("@/src/lib/email");
      const appUrl = process.env.APP_URL || "https://gestionale-fisio.vercel.app";
      await sendEmail({
        template: "welcome",
        to: emailNorm,
        studioId: studioId,
        data: {
          studioName,
          ownerName: operatorName,
          appUrl,
        },
      });
    } catch (emailErr) {
      // Logga ma NON blocca il signup
      console.warn("[signup] email benvenuto fallita:", emailErr);
    }

    return NextResponse.json({
      ok: true,
      user_id: userId,
      studio_id: studioId,
    });
  } catch (e: any) {
    console.error("[signup POST] exception:", e?.message);
    return errorResponse(
      "SERVER_ERROR",
      "Errore imprevisto. Riprova tra qualche minuto o contatta il supporto.",
      500
    );
  }
}
