// ═══════════════════════════════════════════════════════════════════════
// src/lib/clinical/buildPatientContext.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Costruisce il "contesto paziente completo" da Supabase per l'AI clinico.
// Usato dalle feature AI della scheda paziente (Tappa 10).
//
// PARAMETRI:
//   - patientId: ID del paziente
//   - includeSections: quali sezioni includere nel contesto
//
// RITORNA: oggetto serializzabile pronto per /api/ai-clinical
// ═══════════════════════════════════════════════════════════════════════

import { supabase } from "@/src/lib/supabaseClient";

export type ContextSection =
  | "patient"          // anagrafica
  | "anamnesis"        // anamnesi strutturata
  | "redflags"         // red flags
  | "diagnosis"        // diagnosi + differenziali
  | "tests"            // test ortopedici
  | "plan"             // piano + tecniche
  | "goals"            // obiettivi
  | "sessions";        // diario clinico (ultime sedute)

export interface BuildContextOptions {
  patientId: string;
  sections: ContextSection[];
  /** Numero massimo di sedute recenti da includere (default 8). */
  maxSessions?: number;
}

/** Calcola età da data di nascita. */
function ageFromBirth(birth: string | null | undefined): number | null {
  if (!birth) return null;
  try {
    const b = new Date(birth);
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age;
  } catch {
    return null;
  }
}

export async function buildPatientContext(opts: BuildContextOptions): Promise<any> {
  const { patientId, sections, maxSessions = 8 } = opts;
  const ctx: any = {};

  // ── Patient anagrafica ──
  if (sections.includes("patient")) {
    const { data: p } = await supabase
      .from("patients")
      .select("birth_date, sex, occupation, sport")
      .eq("id", patientId)
      .maybeSingle();
    if (p) {
      ctx.age = ageFromBirth(p.birth_date);
      ctx.sex = p.sex;
      ctx.occupation = p.occupation;
      ctx.sport = p.sport;
    }
  }

  // ── Clinical assessment (anamnesi, diagnosi, piano) ──
  const needsAssessment = sections.some(s =>
    ["anamnesis", "diagnosis", "plan"].includes(s)
  );
  if (needsAssessment) {
    const { data: a } = await supabase
      .from("clinical_assessments")
      .select("*")
      .eq("patient_id", patientId)
      .maybeSingle();

    if (a) {
      if (sections.includes("anamnesis")) {
        ctx.pain_locations = a.pain_locations || [];
        ctx.duration_value = a.duration_value;
        ctx.duration_unit = a.duration_unit;
        ctx.onset_type = a.onset_type;
        ctx.pain_frequency = a.pain_frequency;
        ctx.pain_characteristics = a.pain_characteristics || [];
        ctx.aggravating_factors = a.aggravating_factors || [];
        ctx.relieving_factors = a.relieving_factors || [];
      }
      if (sections.includes("diagnosis")) {
        ctx.primary_diagnosis = a.primary_diagnosis;
        ctx.differential_diagnoses = a.differential_diagnoses || [];
      }
      if (sections.includes("plan")) {
        ctx.planned_frequency_per_week = a.planned_frequency_per_week;
        ctx.planned_duration_weeks = a.planned_duration_weeks;
        ctx.planned_techniques = a.planned_techniques || [];
      }
    }
  }

  // ── Red flags ──
  if (sections.includes("redflags")) {
    const { data: flags } = await supabase
      .from("clinical_red_flags")
      .select("is_present, notes, red_flag_types(label, description)")
      .eq("patient_id", patientId);
    if (flags) {
      ctx.red_flags_present = flags
        .filter((f: any) => f.is_present === true)
        .map((f: any) => ({
          label: f.red_flag_types?.label || "?",
          description: f.red_flag_types?.description,
        }));
      ctx.red_flags_excluded = flags.filter((f: any) => f.is_present === false).length;
    }
  }

  // ── Test ortopedici ──
  if (sections.includes("tests")) {
    const { data: tests } = await supabase
      .from("clinical_tests")
      .select("test_name, result, side, notes, performed_at")
      .eq("patient_id", patientId)
      .order("performed_at", { ascending: false });
    if (tests) {
      ctx.tests = tests.map((t: any) => ({
        name: t.test_name,
        result: t.result,
        side: t.side,
        notes: t.notes,
      }));
    }
  }

  // ── Obiettivi ──
  if (sections.includes("goals")) {
    const { data: goals } = await supabase
      .from("clinical_goals")
      .select("description, status")
      .eq("patient_id", patientId)
      .order("sort_order", { ascending: true });
    if (goals) {
      ctx.goals = goals;
    }
  }

  // ── Sedute (diario clinico) ──
  if (sections.includes("sessions")) {
    const { data: notes } = await supabase
      .from("session_notes")
      .select("*, appointments(start_at,status)")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(maxSessions);
    if (notes) {
      ctx.recent_sessions = notes.map((n: any) => ({
        date: n.appointments?.start_at || n.created_at,
        vas_before: n.vas_before,
        vas_after: n.vas_after,
        quick_note: n.quick_note,
        soap_s: n.soap_s,
        soap_o: n.soap_o,
        soap_a: n.soap_a,
        soap_p: n.soap_p,
      }));
    }
  }

  return ctx;
}

// ─── Helper: chiama l'endpoint AI clinico ───────────────────

export async function callClinicalAI(action: string, context: any): Promise<any> {
  const res = await fetch("/api/ai-clinical", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, context }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || "Errore chiamata AI");
  }
  return data.result;
}
