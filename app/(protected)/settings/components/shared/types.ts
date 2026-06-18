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
  weekly_reminder_message: string | null;
  payment_message: string | null;
  birthday_message: string | null;
  satisfaction_message: string | null;
  // Logo
  logo_base64: string | null;
  // Stato default appuntamenti
  default_appointment_status: string | null;
  overlap_mode: string | null;
  // Pagamenti (mig. 015)
  payment_method_required?: boolean | null;     // Se true, payment_method è obbligatorio per fatturati
  default_payment_method?: string | null;       // Default usato quando required=false: "cash" | "pos" | "bank_transfer"
  // Gestione
  monthly_revenue_goal: number | null;
  inactive_threshold_days: number | null;
  reminder_hours_before: number | null;
  // Appuntamenti di gruppo (default per nuovi gruppi)
  default_group_price?: number | null;
  default_group_max_participants?: number | null;
  // Sistema Tessera Sanitaria (mig. 042)
  ts_enabled?: boolean | null;
  ts_tipo_spesa_default?: string | null;
  ts_numbering_mode?: string | null;
  ts_cf_proprietario?: string | null;
  ts_regime_forfettario?: boolean | null;
  ts_dispositivo?: number | null;
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

// ── Sedi multiple di lavoro (mig. 014) ────────────────────────────────────
// Tabella studio_locations. La sede `is_primary=true` viene creata automaticamente
// dalla migration usando studios.name + studios.address esistenti, così nessuno
// studio attuale viene rotto dall'introduzione del multi-sede.
export type StudioLocation = {
  id: string;
  studio_id: string;
  name: string;
  address: string | null;
  is_primary: boolean;
  border_color: string | null;  // hex es. "#2563eb" o null per principale (no bordo)
  sort_order: number;
  created_at: string;
};

// ── Team membri (mig. 019 + 020) ──────────────────────────────────────────
// Tabella studio_members con campi estesi. Una riga può rappresentare:
// - un membro attivo: user_id valorizzato, fa parte del team
// - un invito pendente: user_id NULL, email + invite_token valorizzati
export type StudioMemberRow = {
  /** ID del record in studio_members (NB: distinto da user_id). Aggiunto
   *  per supportare le tabelle figlie come operator_treatment_rates. */
  id: string;
  studio_id: string;
  user_id: string | null;       // NULL = invito pendente
  role: "owner" | "therapist" | "assistant";
  display_name: string | null;
  display_color: string | null; // hex
  signature_short: string | null; // 1-3 caratteri
  is_active: boolean;
  sort_order: number;
  email: string | null;
  invite_token: string | null;  // UUID, NULL dopo claim
  invited_at: string | null;    // ISO
};

// ── Stanze (mig. 019 + 020) ───────────────────────────────────────────────
// Tabella studio_rooms. Lega una stanza a una sede (location_id) o trasversale.
// treatment_types: NULL o [] = nessuna restrizione (universale)
export type StudioRoomRow = {
  id: string;
  studio_id: string;
  location_id: string | null;
  name: string;
  color: string | null;
  is_active: boolean;
  sort_order: number;
  treatment_types: string[] | null; // mig. 020
  created_at: string;
  updated_at?: string;
};

// ── Professionisti ospiti (mig. 029) ──────────────────────────────────────
// Tabella guest_practitioners. Professionisti esterni (ortopedico, nutrizio-
// nista, podologo, psicologo, ecc.) che frequentano lo studio occasional-
// mente. NON sono membri del team, NON hanno login. Servono solo per
// categorizzare appuntamenti e dare loro una colonna nel calendario nei
// giorni in cui il professionista è in studio.
// I loro appuntamenti NON entrano nei conteggi incassi del titolare.
export type GuestPractitionerRow = {
  id: string;
  studio_id: string;
  first_name: string;
  last_name: string;
  specialty: string;
  display_color: string | null;
  default_room_id: string | null;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
  // mig. 030 — Campi configurabili per il PDF stampato dell'agenda
  // del professionista ospite. Defaults tutti true. I campi
  // data/ora/paziente sono sempre presenti e non configurabili.
  pdf_print_fields?: {
    telefono?: boolean;
    durata?: boolean;
    diagnosi?: boolean;
    note?: boolean;
  };
  // mig. 032 — Portale ospite pubblico (link senza login)
  access_token?: string | null;
  token_created_at?: string | null;
  last_access_at?: string | null;
  // mig. 033 — Contatti professionista
  phone?: string | null;
  email?: string | null;
  created_at: string;
  updated_at?: string;
};
