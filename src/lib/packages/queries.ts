// ═══════════════════════════════════════════════════════════════════════
// Query helper pacchetti pazienti
// ═══════════════════════════════════════════════════════════════════════
// Funzioni server-side per leggere pacchetti con metriche calcolate.
// Le API in app/api/packages/* useranno questi helper per evitare
// di duplicare la logica di aggregazione (sedute usate, importo pagato).
// ═══════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PatientPackageRow,
  PackagePaymentRow,
  PatientPackageEnriched,
} from "./types";

// ─── Carica un singolo pacchetto arricchito ────────────────────────────
export async function getPackageEnriched(
  db: SupabaseClient,
  packageId: string
): Promise<PatientPackageEnriched | null> {
  const { data: pkg, error } = await db
    .from("patient_packages")
    .select(
      "id, studio_id, owner_id, patient_id, title, notes, total_sessions, " +
      "total_amount_cents, default_payment_method, status, starts_at, " +
      "expires_at, payer_type, created_at, updated_at, " +
      "patients ( first_name, last_name )"
    )
    .eq("id", packageId)
    .maybeSingle();

  if (error || !pkg) return null;

  // Conta sedute consumate
  // Conta sedute consumate (escluse quelle cancellate)
  const { count: usedCount } = await db
    .from("appointments")
    .select("*", { count: "exact", head: true })
    .eq("package_id", packageId)
    .neq("status", "cancelled");

  // Somma versamenti
  const { data: paymentsRaw } = await db
    .from("package_payments")
    .select("amount_cents")
    .eq("package_id", packageId);

  const sessions_used = usedCount ?? 0;
  const payments = (paymentsRaw ?? []) as Array<{ amount_cents: number }>;
  const paid_cents = payments.reduce(
    (sum, p) => sum + (p.amount_cents ?? 0),
    0
  );

  return enrichPackage(
    pkg as unknown as PatientPackageRow & {
      patients?: { first_name?: string; last_name?: string } | null;
    },
    sessions_used,
    paid_cents
  );
}

// ─── Lista pacchetti di uno studio (con filtri) ────────────────────────
export interface ListPackagesFilters {
  studioId: string;
  patientId?: string;
  status?: "active" | "all";       // default: 'active' (nasconde completed/cancelled)
  limit?: number;
}

export async function listPackagesEnriched(
  db: SupabaseClient,
  filters: ListPackagesFilters
): Promise<PatientPackageEnriched[]> {
  let query = db
    .from("patient_packages")
    .select(
      "id, studio_id, owner_id, patient_id, title, notes, total_sessions, " +
      "total_amount_cents, default_payment_method, status, starts_at, " +
      "expires_at, payer_type, created_at, updated_at, " +
      "patients ( first_name, last_name )"
    )
    .eq("studio_id", filters.studioId)
    .order("created_at", { ascending: false });

  if (filters.patientId) {
    query = query.eq("patient_id", filters.patientId);
  }

  if (!filters.status || filters.status === "active") {
    // 'active' UI = active + expired (ancora visibili come "in arretrato/scaduti")
    query = query.in("status", ["active", "expired"]);
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data: rawPackages, error } = await query;
  if (error || !rawPackages || rawPackages.length === 0) return [];

  // Cast esplicito: la join annidata patients() confonde il type inference
  // di supabase-js, che a volte tipizza data come error union.
  const packages = rawPackages as unknown as Array<
    PatientPackageRow & {
      patients?: { first_name?: string; last_name?: string } | null;
    }
  >;

  const ids = packages.map((p) => p.id);

  // Aggrega sedute usate per pacchetto in una sola query (escluse cancelled)
  const { data: apptsRaw } = await db
    .from("appointments")
    .select("package_id")
    .in("package_id", ids)
    .neq("status", "cancelled");

  const appts = (apptsRaw ?? []) as Array<{ package_id: string | null }>;
  const usedByPackage = new Map<string, number>();
  for (const a of appts) {
    if (!a.package_id) continue;
    usedByPackage.set(a.package_id, (usedByPackage.get(a.package_id) ?? 0) + 1);
  }

  // Aggrega versamenti per pacchetto in una sola query
  const { data: paymentsRaw } = await db
    .from("package_payments")
    .select("package_id, amount_cents")
    .in("package_id", ids);

  const payments = (paymentsRaw ?? []) as Array<{
    package_id: string;
    amount_cents: number;
  }>;
  const paidByPackage = new Map<string, number>();
  for (const p of payments) {
    paidByPackage.set(
      p.package_id,
      (paidByPackage.get(p.package_id) ?? 0) + (p.amount_cents ?? 0)
    );
  }

  return packages.map((pkg) =>
    enrichPackage(
      pkg,
      usedByPackage.get(pkg.id) ?? 0,
      paidByPackage.get(pkg.id) ?? 0
    )
  );
}

// ─── Storico versamenti di un pacchetto ────────────────────────────────
export async function listPackagePayments(
  db: SupabaseClient,
  packageId: string
): Promise<PackagePaymentRow[]> {
  const { data, error } = await db
    .from("package_payments")
    .select("*")
    .eq("package_id", packageId)
    .order("paid_at", { ascending: false });

  if (error || !data) return [];
  return data as PackagePaymentRow[];
}

// ─── Helper: applica metriche calcolate ────────────────────────────────
function enrichPackage(
  raw: PatientPackageRow & {
    patients?: { first_name?: string; last_name?: string } | null;
  },
  sessions_used: number,
  paid_cents: number
): PatientPackageEnriched {
  const sessions_remaining =
    raw.total_sessions === null
      ? null
      : Math.max(0, raw.total_sessions - sessions_used);

  const remaining_cents = Math.max(0, raw.total_amount_cents - paid_cents);
  const is_fully_paid = paid_cents >= raw.total_amount_cents;
  const is_session_exhausted =
    raw.total_sessions !== null && sessions_used >= raw.total_sessions;

  return {
    ...raw,
    sessions_used,
    sessions_remaining,
    paid_cents,
    remaining_cents,
    is_fully_paid,
    is_session_exhausted,
    patient_first_name: raw.patients?.first_name,
    patient_last_name: raw.patients?.last_name,
  };
}

// ─── Helper: aggiorna automaticamente lo status quando serve ───────────
// Da chiamare dopo INSERT di package_payment o UPDATE di appointment.
// Logica: se sedute esaurite E completamente pagato → 'completed'.
export async function autoUpdatePackageStatus(
  db: SupabaseClient,
  packageId: string
): Promise<void> {
  const enriched = await getPackageEnriched(db, packageId);
  if (!enriched) return;

  // Solo se attualmente 'active': non sovrascriviamo expired/cancelled/refunded
  if (enriched.status !== "active") return;

  if (enriched.is_session_exhausted && enriched.is_fully_paid) {
    await db
      .from("patient_packages")
      .update({ status: "completed" })
      .eq("id", packageId);
  }
}
