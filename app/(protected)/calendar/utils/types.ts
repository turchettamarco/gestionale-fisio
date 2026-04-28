// Tipi condivisi del calendario

export type Status = "booked" | "confirmed" | "done" | "cancelled" | "not_paid";

export type LocationType = "studio" | "domicile";

export type TreatmentType = "seduta" | "macchinario" | "laser" | "tecar" | "onde_urto" | "tens";

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
  /** Template del promemoria settimanale aggregato (può essere null = usa default) */
  weekly_reminder_message: string | null;
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
  domicile_address: string | null;
  treatment_type: string | null;
  price_type: string | null;
  /** Metodo pagamento per le sedute fatturate. Solo se price_type === "invoiced". */
  payment_method: "cash" | "pos" | "bank_transfer" | null;
  amount: number | null;
  expected_price: number | null;
  is_paid: boolean;
  reminder_sent_at: Date | null;
  reminder_status: string | null;
  whatsapp_sent_at: Date | null;
  patient_name: string;
  patient_first_name: string | null;
  patient_last_name: string | null;
  patient_phone: string | null;
  treatment: string | null;
  diagnosis: string | null;
};
