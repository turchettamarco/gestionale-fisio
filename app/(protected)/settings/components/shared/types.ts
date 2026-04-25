// app/(protected)/settings/components/shared/types.ts
// ═══════════════════════════════════════════════════════════════════════
// Tipi TypeScript condivisi tra le sezioni di Impostazioni.
// ═══════════════════════════════════════════════════════════════════════

export type MessageTemplate = {
  id: string;
  name: string;
  template: string;
  is_default: boolean;
  created_at: string;
};

export type PracticeSettingsRow = {
  owner_id: string;
  studio_id?: string | null;
  practice_name: string | null;
  owner_full_name: string | null;
  vat_number: string | null;
  address: string | null;
  pec_email: string | null;
  phone: string | null;
  google_review_link: string | null;
  standard_invoice: number | null;
  standard_cash: number | null;
  machine_invoice: number | null;
  machine_cash: number | null;
  laser_invoice: number | null;
  laser_cash: number | null;
  tecar_invoice: number | null;
  tecar_cash: number | null;
  onde_urto_invoice: number | null;
  onde_urto_cash: number | null;
  tens_invoice: number | null;
  tens_cash: number | null;
  auto_apply_prices: boolean | null;
  // Durate per tipo trattamento (minuti)
  duration_seduta: number | null;
  duration_macchinario: number | null;
  duration_laser: number | null;
  duration_tecar: number | null;
  duration_onde_urto: number | null;
  duration_tens: number | null;
  // Messaggi automatici
  welcome_message: string | null;
  booking_confirm_message: string | null;
  reminder_message: string | null;
  payment_message: string | null;
  birthday_message: string | null;
  satisfaction_message: string | null;
  // Logo
  logo_base64: string | null;
  // Stato default appuntamenti
  default_appointment_status: string | null;
  overlap_mode: string | null;
  // Gestione
  monthly_revenue_goal: number | null;
  inactive_threshold_days: number | null;
  reminder_hours_before: number | null;
  created_at?: string;
  updated_at?: string;
};

export type WorkingHourRow = {
  day_of_week: number;  // 0=Dom, 1=Lun, ..., 6=Sab
  open_time: string;    // "HH:MM"
  close_time: string;
  is_open: boolean;
};

export type BookableService = {
  id: string;
  name: string;
  duration: number;
  price: number;
};

export type BlockedDay = {
  id: string;
  date: string;
  label: string;
};

export const DAY_LABELS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
// Ordine di visualizzazione: Lun → Dom (ISO)
export const DAY_ORDER_ISO = [1, 2, 3, 4, 5, 6, 0];
