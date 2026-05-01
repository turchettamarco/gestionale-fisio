// app/(protected)/components/dashboard/shared/types.ts
// ═══════════════════════════════════════════════════════════════════════
// Tipi TypeScript condivisi tra le sezioni della dashboard.
// ═══════════════════════════════════════════════════════════════════════

export type Status       = "booked" | "confirmed" | "done" | "cancelled" | "not_paid";
export type LocationType = "studio" | "domicile";

export type AppointmentRow = {
  id: string;
  patient_id: string;
  start_at: string;
  end_at: string;
  status: Status;
  location: LocationType;
  clinic_site: string | null;
  domicile_address: string | null;
  amount: number | string | null;
  whatsapp_sent_at?: string | null;
  whatsapp_sent?: boolean | null;
  is_paid?: boolean | null;
  paid_at?: string | null;
  payment_method?: "cash" | "pos" | "bank_transfer" | null;
  price_type?: string | null;
  treatment_type?: string | null;
  calendar_note?: string | null;
  patients?: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    status?: string | null;
  }[] | null;
};

export type InactivePatientRow = {
  patient_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  last_done_at: string;
  days_since_last: number;
};

export type OpenBalanceRow = {
  id: string;
  patient_id: string;
  patient_name: string;
  amount: number;
  start_at: string;
  days_ago: number;
  phone: string | null;
};

export type OpenBalanceGroup = {
  patient_id: string;
  patient_name: string;
  phone: string | null;
  sessions: number;
  total: number;
  last_at: string;
};

export type BirthdayRow = {
  patient_id: string;
  name: string;
  first_name: string;
  birth_date: string;
  age: number;
  weekday: string;
  phone: string | null;
  isToday: boolean;
};

export type FreeSlot = {
  day: "oggi" | "domani";
  time: string;
  dateYMD: string;
};

export type WebBooking = {
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

export type NoleggioExpiring = {
  id: string;
  patient_name: string;
  end_date: string;
  device_name: string;
  days_remaining: number;
  patient_phone: string | null;
};

export type PatientRef = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  status?: string | null;
} | null;

export type Bucket = {
  dayKey: string;
  date: Date;
  items: AppointmentRow[];
};

export type WeekStats = {
  this: { done: number; notPaid: number; expected: number };
  last: { done: number; notPaid: number; expected: number };
};

export type ForecastRevenue = {
  total: number;
  sessCount: number;
  days: number;
};
