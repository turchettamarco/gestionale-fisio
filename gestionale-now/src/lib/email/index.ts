// ═══════════════════════════════════════════════════════════════════════
// src/lib/email/index.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Utility centrale per l'invio di email transazionali tramite Resend.
//
// CONFIGURAZIONE:
// - Variabile env: RESEND_API_KEY (chiave segreta server-side)
// - Variabile env: EMAIL_FROM (es. "FisioHub <noreply@turchettamarco.com>")
// - Variabile env: APP_URL (es. "https://gestionale-fisio.vercel.app")
//
// USO (da API route server-side):
//   import { sendEmail } from "@/src/lib/email";
//   await sendEmail({ template: "welcome", to: "marco@gmail.com", data: {...} });
//
// Il sistema:
//  1. Genera l'HTML dal template
//  2. Spedisce via Resend
//  3. Logga il risultato in email_log
//  4. Ritorna { ok, id?, error? }
//
// Tutti i template sono in src/lib/email/templates/
// ═══════════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";
import { renderTemplate, type TemplateName, type TemplateData } from "./templates";

type SendEmailParams<T extends TemplateName> = {
  template: T;
  to: string;
  data: TemplateData<T>;
  studioId?: string;          // per logging
  metadata?: Record<string, unknown>;
};

type SendEmailResult = {
  ok: boolean;
  id?: string;       // ID di tracking Resend (per status check futuri)
  error?: string;
};

const RESEND_API = "https://api.resend.com/emails";

export async function sendEmail<T extends TemplateName>(
  params: SendEmailParams<T>
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "FisioHub <onboarding@resend.dev>";

  if (!apiKey) {
    console.error("[email] RESEND_API_KEY mancante in env");
    return { ok: false, error: "Configurazione email mancante" };
  }

  // 1. Genera contenuto dal template
  const { subject, html, text } = renderTemplate(params.template, params.data);

  // 2. Spedisce via API Resend
  let providerId: string | undefined;
  let sendError: string | undefined;
  try {
    const r = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject,
        html,
        text,
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      sendError = j.message || `HTTP ${r.status}`;
    } else {
      providerId = j.id;
    }
  } catch (e) {
    sendError = e instanceof Error ? e.message : "errore di rete";
  }

  // 3. Log in DB (anche se fallito, per debug)
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceKey) {
      const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      await db.from("email_log").insert({
        studio_id: params.studioId ?? null,
        recipient_email: params.to,
        template: params.template,
        subject,
        status: sendError ? "failed" : "sent",
        provider_id: providerId ?? null,
        error_message: sendError ?? null,
        metadata: params.metadata ?? {},
      });
    }
  } catch (e) {
    // Logging fallito ma non blocchiamo il return — l'email è stata spedita lo stesso
    console.warn("[email] impossibile loggare in email_log:", e);
  }

  return sendError
    ? { ok: false, error: sendError }
    : { ok: true, id: providerId };
}

// Esporto anche tipi per uso esterno
export type { TemplateName, TemplateData } from "./templates";
