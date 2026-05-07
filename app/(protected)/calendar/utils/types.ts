// Tipi condivisi del calendario

export type Status = "booked" | "confirmed" | "done" | "cancelled" | "not_paid";

export type LocationType = "studio" | "domicile";

/**
 * Tipo trattamento — chiave stabile da treatment_types.key.
 * Era un union ristretto a 6 valori, ora è `string` per supportare
 * il catalogo dinamico (es. "linfodrenaggio_vodder").
 * Le 6 chiavi originali ("seduta", "macchinario", "laser", "tecar",
 * "onde_urto", "tens") restano valide come built-in.
 */
export type TreatmentType = string;

export type BookingRequest = {
  id: string;
  service_name: string;
  service_duration: number;
  requested_date: string;
  requested_time: string;
  patient_name: string;
  patient_phone: string;
  patient_email: string | null;
  notes: string | null;
  status: "pending" | "confirmed" | "cancelled";
  created_at: string;
};

export type AppointmentRow = {
  id: string;
  patient_id: string;
  start_at: string;
  end_at: string;
  status: Status;
  calendar_note: string | null;
  location: LocationType;
  clinic_site: string | null;
  location_id: string | null;
  domicile_address: string | null;
  patients: { first_name: string; last_name: string } | null;
};

export type PatientLite = {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  treatment?: string | null;
  diagnosis?: string | null;
};

export type PracticeSettings = {
  standard_invoice: number | null;
  standard_cash: number | null;
  machine_invoice: number | null;
  machine_cash: number | null;
  auto_apply_prices: boolean | null;
  google_review_link: string | null;
  default_appointment_status: "confirmed" | "booked" | null;
  overlap_mode: "block" | "warn" | "visual" | null;
  // Pagamenti (mig. 015)
  /** Se true, payment_method è obbligatorio quando price_type=invoiced. Default true (retro-compat). */
  payment_method_required?: boolean | null;
  /** Default per il payment_method quando required=false. "cash" | "pos" | "bank_transfer". Default "pos". */
  default_payment_method?: "cash" | "pos" | "bank_transfer" | null;
  /** Template del promemoria settimanale aggregato (può essere null = usa default) */
  weekly_reminder_message: string | null;
  /** Default prezzo per persona nei gruppi (mig. 014) */
  default_group_price: number | null;
  /** Default max partecipanti nei gruppi (mig. 014) */
  default_group_max_participants: number | null;
};

/**
 * Partecipante di un appuntamento di gruppo (mig. 014).
 * 1 riga = 1 paziente in 1 gruppo.
 */
export type AppointmentParticipant = {
  id: string;
  appointment_id: string;
  patient_id: string;
  price: number;
  payment_status: "paid" | "unpaid";
  payment_method: "cash" | "pos" | "bank_transfer" | null;
  paid_at: string | null;
  attendance_status: "pending" | "present" | "absent";
  checked_in_at: string | null;
  participant_notes: string | null;
  created_at: string;
  /** Dati paziente (join lookup) */
  patient_first_name?: string | null;
  patient_last_name?: string | null;
  patient_phone?: string | null;
};

export type CalendarEvent = {
  id: string;
  patient_id: string;
  title: string;
  start: Date;
  end: Date;
  status: Status;
  calendar_note: string | null;
  location: LocationType | null;
  clinic_site: string | null;
  /** Multi-sede (mig. 014, fase 2): id della sede dello studio scelta. */
  location_id: string | null;
  domicile_address: string | null;
  treatment_type: string | null;
  price_type: string | null;
  /** Metodo pagamento per le sedute fatturate. Solo se price_type === "invoiced". */
  payment_method: "cash" | "pos" | "bank_transfer" | null;
  amount: number | null;
  expected_price: number | null;
  is_paid: boolean;
  /** Data e ora del pagamento. NULL se non pagato. Coerente con is_paid (mig. 010). */
  paid_at: Date | null;
  reminder_sent_at: Date | null;
  reminder_status: string | null;
  whatsapp_sent_at: Date | null;
  patient_name: string;
  patient_first_name: string | null;
  patient_last_name: string | null;
  patient_phone: string | null;
  treatment: string | null;
  diagnosis: string | null;
  /** Appuntamento di gruppo (mig. 014). Quando true, patient_id è vuoto/dummy. */
  is_group: boolean;
  /** Titolo del gruppo (es. "Posturale di gruppo") */
  group_title: string | null;
  /** Max partecipanti consentiti */
  group_max_participants: number | null;
  /** Prezzo di default per persona (sovrascrivibile per partecipante) */
  group_price_per_person: number | null;
  /** Partecipanti caricati (lazy: vuoto se non ancora caricati). */
  participants?: AppointmentParticipant[];
  /** Pacchetto sedute collegato (mig. 014_packages). Se valorizzato la seduta
   *  scala dal pacchetto e l'incasso non è gestito sulla singola. */
  package_id?: string | null;
};
