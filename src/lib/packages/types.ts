// ═══════════════════════════════════════════════════════════════════════
// Types pacchetti pazienti
// ═══════════════════════════════════════════════════════════════════════
// Modello dati per pacchetti sedute con pagamenti dilazionati.
// Vedi migration 014_patient_packages.sql per lo schema DB.
// ═══════════════════════════════════════════════════════════════════════

export type PackageStatus =
  | "active"      // in corso, sedute disponibili o pagamenti aperti
  | "completed"   // sedute esaurite E pagato del tutto
  | "expired"     // scaduto per data
  | "refunded"    // rimborsato al paziente
  | "cancelled";  // annullato

export type PayerType = "private";
// In futuro: 'insurance' | 'convention' | 'company'

export type PaymentMethod = "cash" | "pos" | "bank_transfer";

export type RevenueRecognition = "on_payment" | "on_session";

// ─── Riga DB grezza (come torna da Supabase) ───────────────────────────
export interface PatientPackageRow {
  id: string;
  studio_id: string;
  owner_id: string;
  patient_id: string;
  title: string;
  notes: string | null;
  total_sessions: number | null;
  total_amount_cents: number;
  default_payment_method: PaymentMethod | null;
  status: PackageStatus;
  starts_at: string;        // YYYY-MM-DD
  expires_at: string | null;
  payer_type: PayerType;
  created_at: string;
  updated_at: string;
}

export interface PackagePaymentRow {
  id: string;
  package_id: string;
  studio_id: string;
  owner_id: string;
  amount_cents: number;
  payment_method: PaymentMethod;
  paid_at: string;          // ISO timestamp
  label: string | null;
  notes: string | null;
  created_at: string;
}

// ─── Pacchetto "arricchito" con metriche calcolate ─────────────────────
// Questo è il tipo che useranno UI e API: include sedute usate/rimaste
// e importo pagato/residuo, calcolati a runtime.
export interface PatientPackageEnriched extends PatientPackageRow {
  // Sedute
  sessions_used: number;            // appuntamenti con package_id = id
  sessions_remaining: number | null; // null se total_sessions è null (acconto libero)

  // Soldi
  paid_cents: number;               // somma di package_payments.amount_cents
  remaining_cents: number;          // total_amount_cents - paid_cents

  // Stato calcolato (utile per UI)
  is_fully_paid: boolean;           // paid_cents >= total_amount_cents
  is_session_exhausted: boolean;    // total_sessions !== null && sessions_used >= total_sessions

  // Dati paziente per liste/UI
  patient_first_name?: string;
  patient_last_name?: string;
}

// ─── Input per creazione/modifica ──────────────────────────────────────
export interface CreatePackageInput {
  patient_id: string;
  title: string;
  notes?: string | null;
  total_sessions: number | null;     // null = acconto libero
  total_amount_cents: number;
  default_payment_method?: PaymentMethod | null;
  starts_at?: string;                // default: oggi
  expires_at?: string | null;
  // Versamento iniziale opzionale (se il paziente paga subito un acconto)
  initial_payment?: {
    amount_cents: number;
    payment_method: PaymentMethod;
    paid_at?: string;                // default: now()
    label?: string;                  // default: "Acconto"
  };
}

export interface UpdatePackageInput {
  title?: string;
  notes?: string | null;
  total_sessions?: number | null;
  total_amount_cents?: number;
  default_payment_method?: PaymentMethod | null;
  status?: PackageStatus;
  starts_at?: string;
  expires_at?: string | null;
}

export interface AddPackagePaymentInput {
  package_id: string;
  amount_cents: number;
  payment_method: PaymentMethod;
  paid_at?: string;
  label?: string;
  notes?: string | null;
}
