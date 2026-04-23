// ═══════════════════════════════════════════════════════════════════════
// GET /api/plans
// Lista tutti i piani attivi con le loro feature.
// Usata da /piano per mostrare il confronto Free/Pro/Studio al cliente
// che non ha ancora un piano assegnato.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "config" }, { status: 500 });
  }

  const db = createClient(url, anon);

  // Legge piani attivi
  const { data: plans, error: plansErr } = await db
    .from("plans")
    .select("id, slug, name, description, price_monthly_cents, currency, is_default, max_patients, max_appointments_per_month, max_operators, max_rooms, patients_limit_mode, appointments_limit_mode, operators_limit_mode, rooms_limit_mode, display_order")
    .eq("is_active", true)
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("price_monthly_cents", { ascending: true });

  if (plansErr) {
    return NextResponse.json({ error: plansErr.message }, { status: 500 });
  }

  // Legge feature abilitate per ciascun piano
  const { data: planFeatures } = await db
    .from("plan_features")
    .select("plan_id, enabled, plan_feature_catalog(key, label, category, description)");

  // Costruisce la mappa piano -> feature[]
  const plansWithFeatures = (plans ?? []).map((p) => {
    const features: { key: string; label: string; category: string | null; enabled: boolean }[] = [];
    for (const pf of planFeatures ?? []) {
      if (pf.plan_id !== p.id) continue;
      const catalog = (pf as { plan_feature_catalog?: { key?: string; label?: string; category?: string } | { key?: string; label?: string; category?: string }[] | null }).plan_feature_catalog;
      const catalogObj = Array.isArray(catalog) ? catalog[0] : catalog;
      if (catalogObj?.key) {
        features.push({
          key: catalogObj.key,
          label: catalogObj.label ?? catalogObj.key,
          category: catalogObj.category ?? null,
          enabled: pf.enabled,
        });
      }
    }
    return { ...p, features };
  });

  return NextResponse.json({ plans: plansWithFeatures });
}
