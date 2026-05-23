// ═══════════════════════════════════════════════════════════════════════
// src/lib/certificateLoader.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Helper di alto livello per generare attestati di presenza:
// si occupa di tutte le query (studio, practice_settings, paziente,
// appuntamenti) e poi delega la generazione del PDF a
// attendanceCertificate.ts.
//
// Espone:
//   • generateSingleCertificate({ patientId, appointmentDate })
//     → usato dal modale appuntamento
//   • generateMultiCertificate({ patientId, dates })
//     → usato dalla scheda paziente
//
// Cache in-memory per la durata della sessione browser dei dati studio
// (non cambiano spesso, evita di ricaricarli a ogni clic).
//
// ═══════════════════════════════════════════════════════════════════════

import { supabase } from "./supabaseClient";
import {
  downloadCertificateSingle,
  downloadCertificateMulti,
  type CertificateStudioData,
  type CertificatePatientData,
} from "./attendanceCertificate";

// ── Cache studio (per-sessione) ──────────────────────────────────────────

let studioDataCache: CertificateStudioData | null = null;
let studioDataCacheStudioId: string | null = null;

/** Permette ai chiamanti di forzare il refresh (es. dopo update settings) */
export function invalidateCertificateStudioCache(): void {
  studioDataCache = null;
  studioDataCacheStudioId = null;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Carica i dati dello studio (branding + numero albo) + practice_settings
 * (P.IVA) e li compone in CertificateStudioData.
 */
async function loadStudioData(studioId: string): Promise<CertificateStudioData> {
  // Cache hit
  if (studioDataCache && studioDataCacheStudioId === studioId) {
    return studioDataCache;
  }

  // Query parallele: studios (branding + albo) + practice_settings (P.IVA)
  const [studioRes, practiceRes] = await Promise.all([
    supabase
      .from("studios")
      .select(
        "name, address, phone, email, signature_name, signature_title, " +
          "logo_base64, professional_register_number, professional_register_name"
      )
      .eq("id", studioId)
      .single(),
    supabase
      .from("practice_settings")
      .select("vat_number")
      .eq("studio_id", studioId)
      .maybeSingle(),
  ]);

  if (studioRes.error || !studioRes.data) {
    throw new Error(
      `Errore caricamento studio: ${studioRes.error?.message ?? "dati mancanti"}`
    );
  }

  // Cast esplicito: i campi mig. 034 (professional_register_*) potrebbero
  // non essere nei tipi Database generati di Supabase, e la select su una
  // riga rilanciata da TS può venire tipata come GenericStringError se il
  // generatore di tipi non è aggiornato. Bypassiamo con cast unknown→shape.
  const s = studioRes.data as unknown as {
    name: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    signature_name: string | null;
    signature_title: string | null;
    logo_base64: string | null;
    professional_register_number: string | null;
    professional_register_name: string | null;
  };
  const ps = practiceRes.data as unknown as { vat_number: string | null } | null;

  const data: CertificateStudioData = {
    name: s.name ?? null,
    address: s.address ?? null,
    phone: s.phone ?? null,
    email: s.email ?? null,
    signature_name: s.signature_name ?? null,
    signature_title: s.signature_title ?? null,
    logo_base64: s.logo_base64 ?? null,
    professional_register_number: s.professional_register_number ?? null,
    professional_register_name: s.professional_register_name ?? null,
    vat_number: ps?.vat_number ?? null,
  };

  // Cache
  studioDataCache = data;
  studioDataCacheStudioId = studioId;

  return data;
}

/**
 * Carica dati paziente per l'attestato (nome, data nascita, sesso).
 * Converte sex (M/F dal DB) in gender (m/f richiesto dalla utility).
 */
async function loadPatientData(patientId: string): Promise<CertificatePatientData> {
  const { data, error } = await supabase
    .from("patients")
    .select("first_name, last_name, birth_date, sex")
    .eq("id", patientId)
    .single();

  if (error || !data) {
    throw new Error(
      `Errore caricamento paziente: ${error?.message ?? "dati mancanti"}`
    );
  }

  // Cast esplicito per evitare problemi di narrowing di TS Supabase
  const p = data as unknown as {
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
    sex: string | null;
  };

  // Conversione M/F → m/f (utility usa minuscolo, DB usa maiuscolo)
  let gender: "m" | "f" | null = null;
  const sexRaw = (p.sex || "").toString().trim().toUpperCase();
  if (sexRaw === "M") gender = "m";
  else if (sexRaw === "F") gender = "f";

  return {
    first_name: p.first_name || "",
    last_name: p.last_name || "",
    birth_date: p.birth_date ?? null,
    gender,
  };
}

/** Determina lo studio_id dell'utente loggato leggendo il primo studio_member */
async function getCurrentStudioId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Utente non autenticato");

  const { data, error } = await supabase
    .from("studio_members")
    .select("studio_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error("Studio non trovato per l'utente corrente");
  }
  const row = data as unknown as { studio_id: string };
  return row.studio_id;
}

// ── API pubblica ─────────────────────────────────────────────────────────

export type GenerateSingleArgs = {
  patientId: string;
  /** Data dell'appuntamento (Date oppure ISO string) */
  appointmentDate: Date | string;
  /** Override del label trattamento (default: "Seduta di fisioterapia") */
  treatmentLabel?: string;
};

/**
 * Genera e scarica un attestato di presenza per UN solo giorno.
 * Usato dal modale appuntamento.
 */
export async function generateSingleCertificate(args: GenerateSingleArgs): Promise<void> {
  const studioId = await getCurrentStudioId();
  const [studio, patient] = await Promise.all([
    loadStudioData(studioId),
    loadPatientData(args.patientId),
  ]);

  await downloadCertificateSingle({
    studio,
    patient,
    date: args.appointmentDate,
    treatmentLabel: args.treatmentLabel,
  });
}

export type GenerateMultiArgs = {
  patientId: string;
  /** Lista date (ISO o Date) da includere nell'attestato */
  dates: Array<{ date: Date | string; treatmentLabel?: string }>;
};

/**
 * Genera e scarica un attestato cumulativo con più date.
 * Usato dalla scheda paziente.
 */
export async function generateMultiCertificate(args: GenerateMultiArgs): Promise<void> {
  if (!args.dates || args.dates.length === 0) {
    throw new Error("Seleziona almeno una data per l'attestato");
  }
  const studioId = await getCurrentStudioId();
  const [studio, patient] = await Promise.all([
    loadStudioData(studioId),
    loadPatientData(args.patientId),
  ]);

  await downloadCertificateMulti({
    studio,
    patient,
    dates: args.dates,
  });
}
