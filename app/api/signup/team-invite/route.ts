// app/api/signup/team-invite/route.ts
// ═══════════════════════════════════════════════════════════════════════
// Endpoint signup per chi accede tramite invito team (mig. 020).
//
// FLUSSO:
// 1. Valida input (email, password, nome, token UUID)
// 2. Verifica che il token corrisponda a un placeholder studio_members
//    (user_id IS NULL, invite_token = token, is_active = true)
// 3. Verifica che l'email corrisponda a quella dell'invito (sicurezza:
//    il link dell'invito è personale, non puoi usarlo con un'altra email)
// 4. Crea l'utente Supabase
// 5. Aggancia il placeholder al nuovo utente (UPDATE studio_members
//    SET user_id = ..., invite_token = NULL, display_name = COALESCE(...))
// 6. Restituisce successo
//
// IMPORTANTE: NON crea un nuovo studio. Il collega entra in uno esistente.
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

function errorResponse(code: string, message: string, status: number = 400) {
  return NextResponse.json({ error: message, code }, { status });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string): { valid: boolean; reason?: string } {
  if (password.length < 8) return { valid: false, reason: "almeno 8 caratteri" };
  if (!/[a-zA-Z]/.test(password)) return { valid: false, reason: "almeno una lettera" };
  if (!/\d/.test(password)) return { valid: false, reason: "almeno un numero" };
  return { valid: true };
}

// Validazione formato UUID v4 (rifiuta input non-UUID prima di andare al DB)
function isValidUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, operator_name, invite_token } = body;

    // ─── 1. Validazione input ─────────────────────────────────────────────
    if (!email || !password || !operator_name || !invite_token) {
      return errorResponse("MISSING_FIELDS", "Compila tutti i campi obbligatori.");
    }

    const emailNorm = String(email).trim().toLowerCase();
    const operatorName = String(operator_name).trim();
    const token = String(invite_token).trim();

    if (!isValidEmail(emailNorm)) {
      return errorResponse("INVALID_EMAIL", "L'email non è in un formato valido.");
    }

    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) {
      return errorResponse(
        "WEAK_PASSWORD",
        `La password deve contenere ${pwdCheck.reason}.`
      );
    }

    if (!isValidUuid(token)) {
      return errorResponse(
        "INVALID_INVITE_TOKEN",
        "Il link di invito non è valido. Controlla di aver copiato il link completo."
      );
    }

    if (operatorName.length < 2) {
      return errorResponse("INVALID_NAME", "Il nome deve contenere almeno 2 caratteri.");
    }

    const db = getAdmin();

    // ─── 2. Verifica il token ─────────────────────────────────────────────
    const { data: invite, error: inviteErr } = await db
      .from("studio_members")
      .select("studio_id, user_id, email, display_name, invite_token, role, is_active, invited_at")
      .eq("invite_token", token)
      .maybeSingle();

    if (inviteErr) {
      console.error("[team-invite] lookup error:", inviteErr.message);
      return errorResponse(
        "INVITE_LOOKUP_ERROR",
        "Errore di verifica invito. Riprova tra qualche minuto.",
        500
      );
    }

    if (!invite) {
      return errorResponse(
        "INVITE_NOT_FOUND",
        "Link di invito non valido o scaduto. Chiedi al tuo collega di generare un nuovo invito."
      );
    }

    if (invite.user_id != null) {
      return errorResponse(
        "INVITE_ALREADY_CLAIMED",
        "Questo invito è già stato accettato. Se l'account è tuo, accedi direttamente dalla pagina di login."
      );
    }

    if (!invite.is_active) {
      return errorResponse(
        "INVITE_DEACTIVATED",
        "Questo invito è stato annullato dall'amministratore dello studio."
      );
    }

    // ─── 3. Verifica email coincida ───────────────────────────────────────
    // L'email dell'invito è personale: non puoi usare un link generato per
    // collega@studio.it per registrarti come altraEmail@gmail.com
    if (invite.email && invite.email.toLowerCase() !== emailNorm) {
      return errorResponse(
        "INVITE_EMAIL_MISMATCH",
        `Questo invito è stato emesso per ${invite.email}. Usa quella email per registrarti, oppure chiedi al tuo collega un nuovo invito alla email che preferisci.`
      );
    }

    // ─── 4. Verifica email non già registrata su Supabase Auth ────────────
    // (Nota: per limitazioni dell'API admin di Supabase, controlliamo provando
    // a creare l'utente. Se l'email è già usata, getUser tramite createUser
    // ritorna errore esplicito.)

    // ─── 5. Crea l'utente Supabase ────────────────────────────────────────
    const { data: userData, error: userErr } = await db.auth.admin.createUser({
      email: emailNorm,
      password,
      email_confirm: true, // beta: niente verifica email obbligatoria
    });

    if (userErr || !userData?.user) {
      // Errore specifico: utente già esiste
      const msg = userErr?.message || "";
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("registered")) {
        return errorResponse(
          "EMAIL_ALREADY_REGISTERED",
          "Esiste già un account con questa email. Vai alla pagina di login. Se hai dimenticato la password, usa il recupero password."
        );
      }
      console.error("[team-invite] auth create error:", msg);
      return errorResponse(
        "AUTH_CREATE_ERROR",
        "Errore durante la creazione dell'account. Riprova tra qualche minuto.",
        500
      );
    }

    const userId = userData.user.id;

    // ─── 6. Aggancia il placeholder al nuovo utente ───────────────────────
    // UPDATE invece di INSERT: il record studio_members esiste già (è il
    // placeholder creato dall'owner). Aggiorniamo user_id, invalidiamo
    // il token, aggiorniamo display_name (l'utente potrebbe aver scelto
    // un nome diverso da quello suggerito dall'owner).
    const { error: claimErr } = await db
      .from("studio_members")
      .update({
        user_id: userId,
        invite_token: null,
        display_name: operatorName, // aggiorna col nome scelto dal collega
        invited_at: invite.invited_at ?? new Date().toISOString(),
      })
      .eq("invite_token", token)
      .is("user_id", null); // safety: solo se ancora non claimato (race condition)

    if (claimErr) {
      // Rollback: cancello l'utente Supabase appena creato
      await db.auth.admin.deleteUser(userId);
      console.error("[team-invite] claim error:", claimErr.message);
      return errorResponse(
        "CLAIM_ERROR",
        "Errore nell'agganciamento al team. Riprova.",
        500
      );
    }

    // ─── 7. Successo ──────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      studio_id: invite.studio_id,
      user_id: userId,
      message: "Account creato e agganciato al team.",
    });

  } catch (e: any) {
    console.error("[team-invite] uncaught:", e?.message || e);
    return errorResponse(
      "UNKNOWN_ERROR",
      "Si è verificato un errore imprevisto. Riprova o contatta l'assistenza.",
      500
    );
  }
}
