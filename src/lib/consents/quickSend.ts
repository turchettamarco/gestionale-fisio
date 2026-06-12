// ═══════════════════════════════════════════════════════════════════════
// src/lib/consents/quickSend.ts
// ═══════════════════════════════════════════════════════════════════════
// Scorciatoia "un click" per i consensi a distanza, usata dall'header
// desktop e dalla QuickActionBar mobile.
//
// Logica smart:
//   1. Se esistono consensi PENDING per il paziente → riusa il link
//      esistente (niente duplicati)
//   2. Se entrambi i tipi risultano già FIRMATI → non fa nulla e avvisa
//   3. Altrimenti → crea il bundle (privacy + consenso) con firma unica
//   Poi: telefono presente → apre WhatsApp; assente → copia negli appunti.
// ═══════════════════════════════════════════════════════════════════════

import { supabase } from "@/src/lib/supabaseClient";
import { getStudioBranding } from "@/src/lib/studioBranding";
import { openWhatsApp } from "@/src/lib/whatsapp";
import {
  buildConsentTitle, buildConsentBody, consentTypeLabel, type ConsentType,
} from "@/src/lib/consents/texts";

const BOTH_TYPES: ConsentType[] = ["gdpr_informativa_privacy", "consenso_trattamento"];

type MinimalConsentRow = {
  id: string;
  consent_type: ConsentType;
  access_token: string;
  bundle_token: string | null;
  status: "pending" | "signed" | "revoked";
};

export type QuickSendResult = {
  kind: "wa" | "copied" | "already_signed" | "error";
  message: string;
};

type QuickSendOpts = {
  patientId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  studio: {
    id?: string;
    name?: string | null;
    address?: string | null;
    signature_name?: string | null;
    signature_title?: string | null;
    multi_operator_enabled?: boolean | null;
  } | null;
};

function linkFor(rows: MinimalConsentRow[]): string {
  const token = rows[0].bundle_token ?? rows[0].access_token;
  return `${window.location.origin}/consensi/${token}`;
}

function waMessage(opts: QuickSendOpts, rows: MinimalConsentRow[]): string {
  const branding = getStudioBranding(opts.studio);
  const firma = branding.signatureName ? `\n\n${branding.signatureName}` : "";
  const labels = rows.map(c => `• ${consentTypeLabel(c.consent_type)}`).join("\n");
  return (
    `Gentile ${opts.firstName},\n` +
    `prima della prossima seduta ti chiedo di leggere e firmare ` +
    `${rows.length === 1 ? "questo documento" : "questi documenti"} ` +
    `(bastano 2 minuti, si firma direttamente dal telefono):\n\n${labels}\n\n` +
    `${linkFor(rows)}${firma}`
  );
}

async function deliver(
  opts: QuickSendOpts,
  rows: MinimalConsentRow[],
  reused: boolean
): Promise<QuickSendResult> {
  const prefix = reused ? "Link esistente" : "Consensi creati";
  if (opts.phone) {
    openWhatsApp(opts.phone, waMessage(opts, rows));
    return { kind: "wa", message: `${prefix} → WhatsApp aperto` };
  }
  try {
    await navigator.clipboard.writeText(linkFor(rows));
    return { kind: "copied", message: `${prefix} → link copiato negli appunti` };
  } catch {
    return { kind: "error", message: "Creato, ma copia non riuscita: apri la sezione consensi" };
  }
}

export async function quickSendRemoteConsents(opts: QuickSendOpts): Promise<QuickSendResult> {
  const studioId = opts.studio?.id ?? null;
  if (!studioId) {
    return { kind: "error", message: "Studio non disponibile, ricarica la pagina" };
  }

  // 1. Stato attuale dei consensi del paziente
  const res = await supabase
    .from("patient_consents")
    .select("id, consent_type, access_token, bundle_token, status")
    .eq("patient_id", opts.patientId)
    .order("sent_at", { ascending: false });

  if (res.error) {
    return { kind: "error", message: `Errore: ${res.error.message}` };
  }
  const rows = (res.data ?? []) as MinimalConsentRow[];

  // 2. Pending esistenti → riusa il link (priorità al bundle più recente)
  const pending = rows.filter(r => r.status === "pending");
  if (pending.length > 0) {
    const bundleTok = pending.find(r => r.bundle_token)?.bundle_token ?? null;
    const reuse = bundleTok
      ? pending.filter(r => r.bundle_token === bundleTok)
      : [pending[0]];
    return deliver(opts, reuse, true);
  }

  // 3. Entrambi i tipi già firmati → niente da fare
  const signedTypes = new Set(rows.filter(r => r.status === "signed").map(r => r.consent_type));
  const missing = BOTH_TYPES.filter(t => !signedTypes.has(t));
  if (missing.length === 0) {
    return { kind: "already_signed", message: "Consensi già firmati dal paziente ✓" };
  }

  // 4. Crea solo i tipi mancanti (bundle se più di uno)
  const branding = getStudioBranding(opts.studio);
  const studioInfo = {
    signatureName: branding.signatureName,
    signatureTitle: branding.signatureTitle,
    address: opts.studio?.address ?? null,
    name: opts.studio?.name ?? null,
  };
  const patientInfo = { firstName: opts.firstName, lastName: opts.lastName };

  let bundleToken: string | null = null;
  if (missing.length > 1) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    bundleToken = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  const newRows = missing.map(t => ({
    studio_id: studioId,
    patient_id: opts.patientId,
    consent_type: t,
    title: buildConsentTitle(t),
    body_text: buildConsentBody(t, studioInfo, patientInfo),
    bundle_token: bundleToken,
  }));

  const ins = await supabase
    .from("patient_consents")
    .insert(newRows)
    .select("id, consent_type, access_token, bundle_token, status");

  if (ins.error) {
    return { kind: "error", message: `Errore: ${ins.error.message}` };
  }
  return deliver(opts, (ins.data ?? []) as MinimalConsentRow[], false);
}
