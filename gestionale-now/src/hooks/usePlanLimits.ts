// ═══════════════════════════════════════════════════════════════════════
// src/hooks/usePlanLimits.ts
// ═══════════════════════════════════════════════════════════════════════
// Hook che legge il piano effettivo dello studio dalla view SQL
// v_studio_plan_effective e lo combina con l'uso reale (count da DB).
//
// USO:
//   const { plan, usage, checks, canCreatePatient, hasFeature, loading } = usePlanLimits();
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";

/* ─── tipi ─── */

export type LimitMode = "soft" | "hard";

export interface EffectivePlan {
  studio_id: string;
  studio_name: string;
  plan_id: string | null;
  plan_slug: string | null;
  plan_name: string | null;
  price_monthly_cents: number | null;
  currency: string | null;

  max_patients: number | null;
  max_appointments_per_month: number | null;
  max_operators: number | null;
  max_rooms: number | null;

  patients_limit_mode: LimitMode | null;
  appointments_limit_mode: LimitMode | null;
  operators_limit_mode: LimitMode | null;
  rooms_limit_mode: LimitMode | null;

  features: Record<string, boolean>;

  has_active_override: boolean;
  override_expires_at: string | null;
}

export interface UsageSnapshot {
  patients: number;
  appointments_this_month: number;
  operators: number;
}

export type LimitStatus = "ok" | "near" | "over";

export interface LimitCheck {
  status: LimitStatus;
  used: number;
  max: number | null;
  mode: LimitMode;
  percent: number;
}

export interface PlanLimits {
  plan: EffectivePlan | null;
  usage: UsageSnapshot;
  checks: {
    patients: LimitCheck;
    appointments: LimitCheck;
    operators: LimitCheck;
  };
  isOverAnyLimit: boolean;
  isBlockedByHardLimit: boolean;
  hasFeature: (key: string) => boolean;
  canCreatePatient: () => { allowed: boolean; reason?: string };
  canCreateAppointment: () => { allowed: boolean; reason?: string };
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/* ─── helper ─── */

function computeCheck(
  used: number,
  max: number | null,
  mode: LimitMode | null
): LimitCheck {
  const realMode: LimitMode = mode ?? "soft";
  if (max === null || max === undefined) {
    return { status: "ok", used, max: null, mode: realMode, percent: 0 };
  }
  const percent = max > 0 ? Math.round((used / max) * 100) : 0;
  const status: LimitStatus =
    percent >= 100 ? "over" : percent >= 80 ? "near" : "ok";
  return { status, used, max, mode: realMode, percent };
}

/* ─── hook ─── */

export function usePlanLimits(): PlanLimits {
  const { studio, loading: studioLoading } = useCurrentStudio();
  const studioId = studio?.id ?? null;

  const [plan, setPlan] = useState<EffectivePlan | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot>({
    patients: 0,
    appointments_this_month: 0,
    operators: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!studioId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // 1. Piano effettivo dalla view v_studio_plan_effective
      //    Protezione DIFENSIVA: se la view non esiste, non ha permessi RLS,
      //    o la query fallisce per qualsiasi motivo, NON propaghiamo l'errore.
      //    Ritorniamo plan=null e continuiamo. Questo previene che il crash
      //    dell'hook rompa il rendering di tutte le pagine che lo usano.
      try {
        const { data: planData, error: planErr } = await supabase
          .from("v_studio_plan_effective")
          .select("*")
          .eq("studio_id", studioId)
          .maybeSingle();

        if (planErr) {
          console.warn("[usePlanLimits] View non accessibile:", planErr.message);
          setPlan(null);
        } else {
          setPlan(planData as EffectivePlan | null);
        }
      } catch (viewErr) {
        console.warn("[usePlanLimits] Errore lettura view:", viewErr);
        setPlan(null);
      }

      // 2. Uso corrente (difensivo anche qui: ogni count fallito diventa 0)
      const firstOfMonth = new Date();
      firstOfMonth.setDate(1);
      firstOfMonth.setHours(0, 0, 0, 0);

      const safeCount = async (promise: PromiseLike<{ count: number | null }>): Promise<number> => {
        try {
          const r = await promise;
          return r.count ?? 0;
        } catch {
          return 0;
        }
      };

      const [patientsCount, apptCount, membersCount] = await Promise.all([
        safeCount(
          supabase
            .from("patients")
            .select("id", { count: "exact", head: true })
            .eq("studio_id", studioId)
        ),
        safeCount(
          supabase
            .from("appointments")
            .select("id", { count: "exact", head: true })
            .eq("studio_id", studioId)
            .gte("start_at", firstOfMonth.toISOString())
        ),
        safeCount(
          supabase
            .from("studio_members")
            .select("user_id", { count: "exact", head: true })
            .eq("studio_id", studioId)
        ),
      ]);

      setUsage({
        patients: patientsCount,
        appointments_this_month: apptCount,
        operators: membersCount,
      });
    } catch (e) {
      // Extra-safety: anche qualunque errore non previsto non rompe il caller
      console.warn("[usePlanLimits] Errore generico:", e);
      setError(e instanceof Error ? e.message : "Errore caricamento piano");
    } finally {
      setLoading(false);
    }
  }, [studioId]);

  useEffect(() => {
    if (!studioLoading) load();
  }, [load, studioLoading]);

  /* ─── checks derivati ─── */

  const checks = {
    patients: computeCheck(
      usage.patients,
      plan?.max_patients ?? null,
      plan?.patients_limit_mode ?? null
    ),
    appointments: computeCheck(
      usage.appointments_this_month,
      plan?.max_appointments_per_month ?? null,
      plan?.appointments_limit_mode ?? null
    ),
    operators: computeCheck(
      usage.operators,
      plan?.max_operators ?? null,
      plan?.operators_limit_mode ?? null
    ),
  };

  const overChecks = Object.values(checks).filter((c) => c.status === "over");
  const isOverAnyLimit = overChecks.length > 0;
  const isBlockedByHardLimit = overChecks.some((c) => c.mode === "hard");

  function hasFeature(key: string): boolean {
    if (!plan) return true; // Se non carichiamo il piano, non blocchiamo per sicurezza
    return plan.features?.[key] === true;
  }

  function canCreatePatient(): { allowed: boolean; reason?: string } {
    const c = checks.patients;
    if (c.status !== "over") return { allowed: true };
    if (c.mode === "soft") return { allowed: true };
    return {
      allowed: false,
      reason: `Hai raggiunto il limite di ${c.max} pazienti del piano ${plan?.plan_name ?? ""}. Passa a un piano superiore per continuare.`,
    };
  }

  function canCreateAppointment(): { allowed: boolean; reason?: string } {
    const c = checks.appointments;
    if (c.status !== "over") return { allowed: true };
    if (c.mode === "soft") return { allowed: true };
    return {
      allowed: false,
      reason: `Hai raggiunto il limite di ${c.max} appuntamenti di questo mese nel piano ${plan?.plan_name ?? ""}. Passa a un piano superiore per continuare.`,
    };
  }

  return {
    plan,
    usage,
    checks,
    isOverAnyLimit,
    isBlockedByHardLimit,
    hasFeature,
    canCreatePatient,
    canCreateAppointment,
    loading: loading || studioLoading,
    error,
    refresh: load,
  };
}
