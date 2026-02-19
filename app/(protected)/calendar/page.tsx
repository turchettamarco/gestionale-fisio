"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

import { useSearchParams } from "next/navigation";

import CalendarGrid from "./CalendarGrid";
import CreateAppointmentModal from "./CreateAppointmentModal";
import EventDrawer from "./EventDrawer";


// --- Local helpers (markup-split support; keep behavior identical) ---

function pickNumber(obj: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

// Pricing: tries several key shapes to stay compatible with older/newer schemas.
function getDefaultAmountFromSettings(
  tType: "seduta" | "macchinario",
  pType: "invoiced" | "cash",
  practiceSettings: any
): number {
  const s: any = practiceSettings || {};
  // Common patterns we try (first match wins)
  const candidates: string[] = [
    // flat columns
    `${tType}_${pType}_price`,
    `${tType}_${pType}`,
    `price_${tType}_${pType}`,
    `default_${tType}_${pType}`,
    // with invoice/cash naming variations
    `${tType}_${pType === "invoiced" ? "invoice" : "cash"}`,
    `price_${tType}_${pType === "invoiced" ? "invoice" : "cash"}`,
    // nested maps
  ];

  const flat = pickNumber(s, candidates);
  if (flat !== null) return flat;

  // nested objects support (e.g., prices.seduta.invoiced)
  const nested =
    pickNumber(s?.prices?.[tType] ?? null, [pType]) ??
    pickNumber(s?.pricing?.[tType] ?? null, [pType]) ??
    pickNumber(s?.default_prices?.[tType] ?? null, [pType]);

  return nested ?? 0;
}

// --- End local helpers ---
type Status = "booked" | "confirmed" | "done" | "cancelled" | "not_paid";

type LocationType = "studio" | "domicile";

type AppointmentRow = {
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

type PatientLite = { 
  id: string; 
  first_name: string; 
  last_name: string; 
  phone?: string | null;
  treatment?: string | null;
  diagnosis?: string | null;
};

type PracticeSettings = {
  standard_invoice: number | null;
  standard_cash: number | null;
  machine_invoice: number | null;
  machine_cash: number | null;
  auto_apply_prices: boolean | null;
};

// Auto-fit font size for patient full name inside event blocks without breaking layout
const autoNameFontSize = (fullName?: string | null) => {
  const len = (fullName ?? "").trim().length;
  if (len <= 14) return 13;
  if (len <= 20) return 12;
  if (len <= 28) return 11;
  if (len <= 36) return 10;
  return 9;
};


const THEME = {
  appBg: "#f1f5f9",
  panelBg: "#ffffff",
  panelSoft: "#f7f9fd",
  cardBg: "#ffffff",

  text: "#0f172a",
  textSoft: "#1e293b",
  muted: "#334155",

  border: "#cbd5e1",
  borderSoft: "#94a3b8",

  blue: "#2563eb",
  blueDark: "#1e40af",
  green: "#16a34a",
  greenDark: "#15803d",
  patientsAccent: "#0d9488",

  red: "#dc2626",
  amber: "#f97316",
  gray: "#94a3b8",
};

const DEFAULT_CLINIC_SITE = "Studio Pontecorvo";

function statusColor(status: Status) {
  switch (status) {
    case "done":
      return THEME.green;
    case "confirmed":
      return THEME.blue;
    case "not_paid":
      return THEME.amber; // oppure THEME.red se vuoi più “urgente”
    case "cancelled":
      return THEME.gray;
    case "booked":
    default:
      return THEME.red;
  }
}


function statusLabel(status: Status | string) {
  // Nota: in alcuni flussi (es. export) lo status può arrivare tipizzato come string.
  // Manteniamo lo stesso comportamento: se non riconosciuto → "Prenotato".
  switch (status) {
    case "confirmed":
      return "Confermato";
    case "done":
      return "Eseguito";
    case "not_paid":
      return "Non pagata";
    case "cancelled":
      return "Annullato";
    case "booked":
    default:
      return "Prenotato";
  }
}

function normalizeStatus(s: any): Status {
  const v = String(s || "");
  if (v === "booked" || v === "confirmed" || v === "done" || v === "cancelled" || v === "not_paid") return v as Status;
  // default safe
  return "booked";
}

function normalizeTreatmentType(v: any): "seduta" | "macchinario" {
  return v === "macchinario" ? "macchinario" : "seduta";
}

function normalizePriceType(v: any): "invoiced" | "cash" {
  return v === "cash" ? "cash" : "invoiced";
}



function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function startOfISOWeekMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function formatDMY(d: Date) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function addWeeks(d: Date, w: number) {
  return addDays(d, w * 7);
}

function toDateInputValue(d: Date) {
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  const out = new Date();
  out.setFullYear(y, m - 1, d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function generateRecurringStarts(params: {
  firstStart: Date;
  untilDate: Date;
  weekDays: number[];
}) {
  const { firstStart, untilDate, weekDays } = params;
  const hh = firstStart.getHours();
  const mm = firstStart.getMinutes();
  const ss = firstStart.getSeconds();
  const ms = firstStart.getMilliseconds();

  const startDay = new Date(firstStart);
  const endDay = new Date(untilDate);
  endDay.setHours(23, 59, 59, 999);

  const results: Date[] = [];

  for (let d = new Date(startDay); d <= endDay; d = addDays(d, 1)) {
    const dow = d.getDay();
    if (dow === 0) continue;
    if (!weekDays.includes(dow)) continue;

    const occ = new Date(d);
    occ.setHours(hh, mm, ss, ms);
    if (occ < firstStart) continue;

    results.push(occ);
  }

  return results;
}

function formatDateRelative(date: Date): string {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  
  const domani = new Date(oggi);
  domani.setDate(oggi.getDate() + 1);
  
  const dataAppuntamento = new Date(date);
  dataAppuntamento.setHours(0, 0, 0, 0);
  
  if (dataAppuntamento.getTime() === oggi.getTime()) {
    return "Oggi";
  } else if (dataAppuntamento.getTime() === domani.getTime()) {
    return "Domani";
  } else {
    const giorni = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
    const mesi = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", 
                  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    
    const giornoSettimana = giorni[dataAppuntamento.getDay()];
    const giorno = dataAppuntamento.getDate();
    const mese = mesi[dataAppuntamento.getMonth()];
    
    return `${giornoSettimana} ${giorno} ${mese}`;
  }
}

const CLINIC_ADDRESSES: Record<string, string> = {
  "Studio Pontecorvo": "Pontecorvo, Via Galileo Galilei 5, dietro il Bar Principe",
};

export default function CalendarPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Caricamento calendario…</div>}>
      <CalendarPageInner />
    </Suspense>
  );
}


function CalendarPageInner() {

  const params = useSearchParams();

  // Appointments (logic stays here; CalendarGrid is markup-only)
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadAppointments = useCallback(async (start: Date, end: Date) => {
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, patient_id, start_at, end_at, status, location, clinic_site, domicile_address, plan, expected_price, amount, price_type, treatment_type, calendar_note, is_paid, reminder_sent_at, reminder_status, whatsapp_sent, whatsapp_sent_at, patients(first_name,last_name,phone,diagnosis,treatment)"
        )
        .gte("start_at", start.toISOString())
        .lt("start_at", end.toISOString())
        .order("start_at", { ascending: true });

      if (error) throw error;

      const rows: any[] = data ?? [];
      const mapped = rows.map((r) => {
        const p = Array.isArray(r.patients) ? r.patients[0] : r.patients;
        const first = p?.first_name ?? "";
        const last = p?.last_name ?? "";
        const patient_name = `${last} ${first}`.trim() || "Paziente";
        return {
          id: r.id,
          patient_id: r.patient_id,
          patient_first_name: first,
          patient_name,
          patient_phone: p?.phone ?? null,
          diagnosis: p?.diagnosis ?? null,
          treatment: p?.treatment ?? null,
          location: r.location,
          clinic_site: r.clinic_site ?? null,
          domicile_address: r.domicile_address ?? null,
          status: r.status,
          amount: r.amount ?? null,
          expected_price: r.expected_price ?? null,
          price_type: r.price_type ?? null,
          treatment_type: r.treatment_type ?? null,
          calendar_note: r.calendar_note ?? null,
          is_paid: !!r.is_paid,
          whatsapp_sent: !!r.whatsapp_sent,
          whatsapp_sent_at: r.whatsapp_sent_at ? new Date(r.whatsapp_sent_at) : null,
          start: new Date(r.start_at),
          end: new Date(r.end_at),
        };
      });

      setEvents(mapped);
    } catch (e: any) {
      setError(e?.message ?? "Errore caricamento appuntamenti");
    } finally {
      setLoading(false);
    }
  }, []);
// User menu (Logout + Settings)
const [userEmail, setUserEmail] = useState<string | null>(null);
const [userId, setUserId] = useState<string | null>(null);  // Prezzi standard letti dai Settings (practice_settings)
  const [practiceSettings, setPracticeSettings] = useState<PracticeSettings | null>(null);
  const [practiceSettingsLoaded, setPracticeSettingsLoaded] = useState(false);

  const loadPracticeSettings = useCallback(async () => {
    if (!userId) {
      setPracticeSettings(null);
      setPracticeSettingsLoaded(true);
      return;
    }
    setPracticeSettingsLoaded(false);
    const { data, error } = await supabase
      .from("practice_settings")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();

    if (error) {
      // non-fatal: il calendario può funzionare comunque (importi manuali)
      setPracticeSettings(null);
      setPracticeSettingsLoaded(true);
      return;
    }

    setPracticeSettings((data as any) ?? null);
    setPracticeSettingsLoaded(true);
  }, [userId]);

  useEffect(() => {
    void loadPracticeSettings();
  }, [loadPracticeSettings]);

  const reloadPracticeSettings = useCallback(async () => {
    await loadPracticeSettings();
  }, [loadPracticeSettings]);
const [userMenuOpen, setUserMenuOpen] = useState(false);
const userMenuRef = useRef<HTMLDivElement | null>(null);


useEffect(() => {
  let mounted = true;
  (async () => {
    try {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setUserEmail(data?.user?.email ?? null);
      setUserId(data?.user?.id ?? null);
    } catch {
      // ignore
    }
  })();
  return () => {
    mounted = false;
  };
}, []);

useEffect(() => {
  const onDown = (e: MouseEvent) => {
    if (!userMenuOpen) return;
    const el = userMenuRef.current;
    if (el && !el.contains(e.target as Node)) setUserMenuOpen(false);
  };
  document.addEventListener("mousedown", onDown);
  return () => document.removeEventListener("mousedown", onDown);
}, [userMenuOpen]);

const handleLogout = useCallback(async () => {
  try {
    await supabase.auth.signOut();
  } finally {
    setUserMenuOpen(false);
    window.location.href = "/login";
  }
}, []);
  const getDefaultAmount = useCallback((tType: "seduta" | "macchinario", pType: "invoiced" | "cash") => {
    return getDefaultAmountFromSettings(tType, pType, practiceSettings as any);
  }, [practiceSettings]);

const userLabel = useMemo(() => {
  if (!userEmail) return "Account";
  const left = userEmail.split("@")[0] || userEmail;
  return left.length > 18 ? left.slice(0, 18) + "…" : left;
}, [userEmail]);

const userInitials = useMemo(() => {
  if (!userEmail) return "U";
  const left = userEmail.split("@")[0] || "U";
  const parts = left.replace(/[^a-zA-Z0-9]/g, " ").split(" ").filter(Boolean);
  const a = (parts[0]?.[0] || "U").toUpperCase();
  const b = (parts[1]?.[0] || "").toUpperCase();
  return (a + b).slice(0, 2);
}, [userEmail]);



  const [selectedEvent, setSelectedEvent] = useState<{
    id: string;
    title: string;
    patient_id?: string;
    location?: LocationType;
    clinic_site?: string | null;
    domicile_address?: string | null;
    treatment?: string | null;
    diagnosis?: string | null;
    amount?: number | null;
    treatment_type?: string;
    price_type?: string;
    start?: Date;
    end?: Date;
  } | null>(null);

  const [editStatus, setEditStatus] = useState<Status>("booked");
  const [editNote, setEditNote] = useState("");
  const [editAmount, setEditAmount] = useState<string>("");
  const [editTreatmentType, setEditTreatmentType] = useState<"seduta" | "macchinario">("seduta");
  const [editPriceType, setEditPriceType] = useState<"invoiced" | "cash">("invoiced");
  
  // Stati per modifica orario e giorno
  const [editDate, setEditDate] = useState<string>("");
  const [editStartTime, setEditStartTime] = useState<string>("09:00");
  const [editDuration, setEditDuration] = useState<"1" | "1.5" | "2">("1");

  const [createOpen, setCreateOpen] = useState(false);
  const [createStartISO, setCreateStartISO] = useState<string>("");
  const [createEndISO, setCreateEndISO] = useState<string>("");

  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [patientResults, setPatientResults] = useState<PatientLite[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientLite | null>(null);
  const [creating, setCreating] = useState(false);
  const searchTimer = useRef<any>(null);

  const [createLocation, setCreateLocation] = useState<LocationType>("studio");
  const [createClinicSite, setCreateClinicSite] = useState(DEFAULT_CLINIC_SITE);
  const [createDomicileAddress, setCreateDomicileAddress] = useState("");

  const [treatmentType, setTreatmentType] = useState<"seduta" | "macchinario">("seduta");
  const [priceType, setPriceType] = useState<"invoiced" | "cash">("invoiced");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [useCustomPrice, setUseCustomPrice] = useState(false);

  const computedDefaultAmount = useMemo(() => {
    return getDefaultAmount(treatmentType, priceType);
  }, [getDefaultAmount, treatmentType, priceType]);

  const [selectedStartTime, setSelectedStartTime] = useState<string>("09:00");
  const [selectedDuration, setSelectedDuration] = useState<"1" | "1.5" | "2">("1");

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [recurringUntil, setRecurringUntil] = useState<string>(() => toDateInputValue(addWeeks(new Date(), 4)));

  const [quickPatientOpen, setQuickPatientOpen] = useState(false);
  const [quickPatientFirstName, setQuickPatientFirstName] = useState("");
  const [quickPatientLastName, setQuickPatientLastName] = useState("");
  const [quickPatientPhone, setQuickPatientPhone] = useState("");
  const [creatingQuickPatient, setCreatingQuickPatient] = useState(false);

  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  const [weeklyExpectedRevenue, setWeeklyExpectedRevenue] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    const loadWeeklyStats = async () => {
      try {
        const today = new Date(currentDate);
        const day = today.getDay(); // 0 domenica
        const diffToMonday = (day === 0 ? -6 : 1) - day;

        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() + diffToMonday);
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);
        weekEnd.setHours(0, 0, 0, 0);
const { data, error } = await supabase
          .from("appointments")
          .select("amount, expected_price, status, start_at")
          .gte("start_at", weekStart.toISOString())
          .lt("start_at", weekEnd.toISOString());

        if (error) throw error;

        const rows = data ?? [];
        const validRows = rows.filter((r: any) => r.status !== "cancelled");

        const revenue = validRows.reduce((sum: number, r: any) => {
          const v = r.amount ?? r.expected_price ?? 0;
          return sum + Number(v);
        }, 0);

        if (!cancelled) setWeeklyExpectedRevenue(revenue);
      } catch {
        if (!cancelled) setWeeklyExpectedRevenue(0);
      }
    };

    loadWeeklyStats();
    return () => {
      cancelled = true;
    };
  }, [currentDate]);

  const [viewType, setViewType] = useState<"day" | "week">("week");

  const [draggingEvent, setDraggingEvent] = useState<{
    id: string;
    originalStart: Date;
    originalEnd: Date;
  } | null>(null);
  const [draggingOver, setDraggingOver] = useState<{dayIndex: number, hour: number, minute: number} | null>(null);

  const [printMenuOpen, setPrintMenuOpen] = useState(false);
const [filtersExpanded, setFiltersExpanded] = useState(false);
  const printMenuRef = useRef<HTMLDivElement>(null);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);

  const [showWhatsAppConfirm, setShowWhatsAppConfirm] = useState(false);
  const [lastCreatedAppointment, setLastCreatedAppointment] = useState<{
    id: string;
    patientPhone?: string | null;
    patientName?: string;
    startTime?: Date;
  } | null>(null);

  const [duplicateMode, setDuplicateMode] = useState(false);
  const [eventToDuplicate, setEventToDuplicate] = useState<any>(null);
  const [duplicateDate, setDuplicateDate] = useState<string>("");
  const [duplicateTime, setDuplicateTime] = useState<string>("09:00");

  // Stati per le nuove funzionalità
  const [filters, setFilters] = useState({
    location: "all" as "all" | "studio" | "domicile",
    treatmentType: "all" as "all" | "seduta" | "macchinario",
    priceType: "all" as "all" | "invoiced" | "cash",
    minAmount: "",
    maxAmount: "",
  });

  const [eventColors, setEventColors] = useState<Record<string, string>>({});
  const [quickActionsMenu, setQuickActionsMenu] = useState<{
    x: number;
    y: number;
    eventId?: string;
  } | null>(null);

  const [todaysAppointments, setTodaysAppointments] = useState<any[]>([]);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Timer per linea del tempo corrente
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Carica appuntamenti della giornata corrente per il menu laterale
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todaysEvents = events.filter(event => {
      const eventDate = new Date(event.start);
      eventDate.setHours(0, 0, 0, 0);
      return eventDate.getTime() === today.getTime() && event.status !== "cancelled";
    });

    // Ordina per orario
    const sortedEvents = [...todaysEvents].sort((a, b) => 
      a.start.getTime() - b.start.getTime()
    );

    setTodaysAppointments(sortedEvents);

    // reset espansione lista imminenti quando cambia il contenuto
    setShowAllUpcoming(false);
  }, [events]);

  // Dichiarazioni delle costanti useMemo devono essere PRIMA delle funzioni che le usano
  const timeSelectSlots = useMemo(() => {
    const slots = [];
    for (let hour = 7; hour < 22; hour++) {
      for (let minute of [0, 30]) {
        slots.push(`${pad2(hour)}:${pad2(minute)}`);
      }
    }
    return slots;
  }, []);

  // Funzioni di navigazione spostate PRIMA degli useEffect che le usano
  const goToPreviousWeek = useCallback(() => {
    setCurrentDate(prev => addWeeks(prev, -1));
  }, []);

  const goToNextWeek = useCallback(() => {
    setCurrentDate(prev => addWeeks(prev, 1));
  }, []);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const gotoWeekStart = useCallback((iso: string) => {
    setCurrentDate(new Date(iso));
  }, []);

  const openCreateModal = useCallback((date: Date, hour: number = 9, minute: number = 0, duplicateEvent?: any) => {
    const timeStr = `${pad2(hour)}:${pad2(minute)}`;
    
    const defaultTime = duplicateEvent ? 
      `${pad2(duplicateEvent.start.getHours())}:${pad2(duplicateEvent.start.getMinutes())}` : 
      timeSelectSlots.includes(timeStr) ? timeStr : "09:00";
    
    setSelectedStartTime(defaultTime);
    setDuplicateTime(defaultTime);
    
    const startTime = new Date(date);
    const [hours, minutes] = defaultTime.split(':').map(Number);
    startTime.setHours(hours, minutes, 0, 0);
    
    const durationHours = parseFloat(selectedDuration);
    const endTime = new Date(startTime.getTime() + durationHours * 60 * 60000);

    setCreateStartISO(startTime.toISOString());
    setCreateEndISO(endTime.toISOString());
    
    setDuplicateDate(toDateInputValue(date));

    setQ("");
    setPatientResults([]);
    setSelectedPatient(null);

    if (duplicateEvent) {
      setDuplicateMode(true);
      setEventToDuplicate(duplicateEvent);
      setCreateLocation(duplicateEvent.location);
      setCreateClinicSite(duplicateEvent.clinic_site || DEFAULT_CLINIC_SITE);
      setCreateDomicileAddress(duplicateEvent.domicile_address || "");
      setTreatmentType(duplicateEvent.treatment_type || "seduta");
      setPriceType(duplicateEvent.price_type || "invoiced");
      setCustomAmount(duplicateEvent.amount ? duplicateEvent.amount.toString() : "");
      setUseCustomPrice(!!duplicateEvent.amount);
      
      const eventDurationHours = (duplicateEvent.end.getTime() - duplicateEvent.start.getTime()) / (60 * 60000);
      if (eventDurationHours === 1) setSelectedDuration("1");
      else if (eventDurationHours === 1.5) setSelectedDuration("1.5");
      else if (eventDurationHours === 2) setSelectedDuration("2");
      
      const patientFromEvent = patientResults.find(p => 
        `${p.last_name} ${p.first_name}` === duplicateEvent.patient_name
      ) || {
        id: duplicateEvent.patient_id,
        first_name: duplicateEvent.patient_name.split(' ')[0],
        last_name: duplicateEvent.patient_name.split(' ')[1] || '',
      };
      
      setSelectedPatient(patientFromEvent);
    } else {
      setDuplicateMode(false);
      setEventToDuplicate(null);
      setCreateLocation("studio");
      setCreateClinicSite(DEFAULT_CLINIC_SITE);
      setCreateDomicileAddress("");
      setTreatmentType("seduta");
      setPriceType("invoiced");
      setCustomAmount("");
      setUseCustomPrice(false);
    }

    setIsRecurring(false);
    const dow = date.getDay();
    const defaultDays = dow === 0 ? [1] : [dow];
    setRecurringDays(defaultDays);
    setRecurringUntil(toDateInputValue(addWeeks(date, 4)));

    setQuickPatientFirstName("");
    setQuickPatientLastName("");
    setQuickPatientPhone("");

    setShowWhatsAppConfirm(false);
    setLastCreatedAppointment(null);

    setError("");
    setCreateOpen(true);
  }, [selectedStartTime, selectedDuration, timeSelectSlots, patientResults]);

  // Shortcut da tastiera - ORA le funzioni sono disponibili
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + N: Nuovo appuntamento
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        openCreateModal(new Date());
      }
      
      // Esc: Chiudi modal
      if (e.key === 'Escape') {
        if (createOpen) setCreateOpen(false);
        if (selectedEvent) setSelectedEvent(null);
        if (showWhatsAppConfirm) setShowWhatsAppConfirm(false);
        if (quickActionsMenu) setQuickActionsMenu(null);
      }
      
      // Freccia sinistra/destra: Naviga tra settimane/giorni
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (viewType === 'week') goToPreviousWeek();
        else setCurrentDate(prev => addDays(prev, -1));
      }
      
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (viewType === 'week') goToNextWeek();
        else setCurrentDate(prev => addDays(prev, 1));
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createOpen, selectedEvent, showWhatsAppConfirm, quickActionsMenu, viewType, goToPreviousWeek, goToNextWeek, goToToday, openCreateModal]);

  // Chiudi menu quick actions al click fuori
  useEffect(() => {
    const handleClick = () => setQuickActionsMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const weekDays = useMemo(() => {
    const days = [];
    const startOfWeek = startOfISOWeekMonday(currentDate);
    
    for (let i = 0; i < 6; i++) {
      const day = addDays(startOfWeek, i);
      days.push(day);
    }
    return days;
  }, [currentDate]);

  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 7; hour < 22; hour++) {
      slots.push(`${pad2(hour)}:00`);
    }
    return slots;
  }, []);

  const getEventPosition = useCallback((start: Date, end: Date) => {
    const startHour = start.getHours();
    const startMinute = start.getMinutes();
    const endHour = end.getHours();
    const endMinute = end.getMinutes();
    
    const top = ((startHour - 7) * 60 + startMinute);
    const height = ((endHour - startHour) * 60 + (endMinute - startMinute));
    
    return { top, height };
  }, []);

  const getEventColor = useCallback((event: any) => {
    if (eventColors[event.patient_id]) {
      return eventColors[event.patient_id];
    }
    return statusColor(event.status);
  }, [eventColors]);

  const getAvailableSlots = useCallback((date: Date) => {
    const slots = [];
    
    for (let hour = 7; hour < 22; hour++) {
      for (let minute of [0, 30]) {
        const slotStart = new Date(date);
        slotStart.setHours(hour, minute, 0, 0);
        
        const slotEnd = new Date(slotStart.getTime() + 60 * 60000);
        
        const isOccupied = events.some(event => {
          return (
            event.start.getDate() === date.getDate() &&
            event.start.getMonth() === date.getMonth() &&
            event.start.getFullYear() === date.getFullYear() &&
            (
              (event.start >= slotStart && event.start < slotEnd) ||
              (event.end > slotStart && event.end <= slotEnd) ||
              (event.start <= slotStart && event.end >= slotEnd)
            )
          );
        });
        
        if (!isOccupied) {
          slots.push({
            start: slotStart,
            end: slotEnd,
            time: `${pad2(hour)}:${pad2(minute)}`
          });
        }
      }
    }
    
    return slots;
  }, [events]);

  const weekOptions = useMemo(() => {
    const base = startOfISOWeekMonday(new Date());
    const opts: { value: string; label: string }[] = [];
    for (let w = -12; w <= 24; w++) {
      const start = addDays(base, w * 7);
      const end = addDays(start, 5);
      opts.push({
        value: start.toISOString(),
        label: `SETTIMANA ${formatDMY(start)} → ${formatDMY(end)}`,
      });
    }
    return opts;
  }, []);

  const getAvailabilityForecast = useCallback((date: Date) => {
    const dayStart = new Date(date);
    dayStart.setHours(7, 0, 0, 0);
    
    const dayEnd = new Date(date);
    dayEnd.setHours(22, 0, 0, 0);
    
    const dayEvents = events.filter(e => 
      e.start.getDate() === date.getDate() &&
      e.start.getMonth() === date.getMonth() &&
      e.start.getFullYear() === date.getFullYear()
    );
    
    const totalMinutes = 15 * 60;
    let occupiedMinutes = 0;
    
    dayEvents.forEach(event => {
      const duration = (event.end.getTime() - event.start.getTime()) / (60 * 1000);
      occupiedMinutes += duration;
    });
    
    const availableMinutes = totalMinutes - occupiedMinutes;
    const occupancyRate = (occupiedMinutes / totalMinutes) * 100;
    
    return {
      totalEvents: dayEvents.length,
      occupiedMinutes,
      availableMinutes,
      occupancyRate,
      availableSlots: Math.floor(availableMinutes / 60),
      recommendation: occupancyRate > 40 ? "ALTA OCCUPAZIONE" : 
                      occupancyRate > 20 ? "MEDIA OCCUPAZIONE" : 
                      "BASSA OCCUPAZIONE"
    };
  }, [events]);

  const filteredEvents = useMemo(() => {
    let result = events;
    
    if (statusFilter !== "all") {
      result = result.filter(event => event.status === statusFilter);
    }
    
    if (filters.location !== "all") {
      result = result.filter(event => event.location === filters.location);
    }
    
    if (filters.treatmentType !== "all") {
      result = result.filter(event => event.treatment_type === filters.treatmentType);
    }
    
    if (filters.priceType !== "all") {
      result = result.filter(event => event.price_type === filters.priceType);
    }
    
    if (filters.minAmount) {
      const min = parseFloat(filters.minAmount);
      if (!isNaN(min)) {
        result = result.filter(event => {
          const price = (event.amount ?? getDefaultAmount(event.treatment_type as any, event.price_type as any));
          return price >= min;
        });
      }
    }
    
    if (filters.maxAmount) {
      const max = parseFloat(filters.maxAmount);
      if (!isNaN(max)) {
        result = result.filter(event => {
          const price = (event.amount ?? getDefaultAmount(event.treatment_type as any, event.price_type as any));
          return price <= max;
        });
      }
    }
    
    return result;
  }, [events, statusFilter, filters]);

  useEffect(() => {
    if (viewType === "week") {
      const startOfWeek = startOfISOWeekMonday(currentDate);
      const endOfWeek = addDays(startOfWeek, 7);
      loadAppointments(startOfWeek, endOfWeek);
    } else {
      const startOfDay = new Date(currentDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(currentDate);
      endOfDay.setHours(23, 59, 59, 999);
      loadAppointments(startOfDay, endOfDay);
    }
  }, [currentDate, viewType, loadAppointments]);

  const stats = useMemo(() => {
    const filteredEvents = viewType === "week" 
      ? events 
      : events.filter(e => 
          e.start.getDate() === currentDate.getDate() &&
          e.start.getMonth() === currentDate.getMonth() &&
          e.start.getFullYear() === currentDate.getFullYear()
        );
    
    return {
      total: filteredEvents.length,
      done: filteredEvents.filter(e => e.status === "done").length,
      confirmed: filteredEvents.filter(e => e.status === "confirmed").length,
      booked: filteredEvents.filter(e => e.status === "booked").length,
      revenue: filteredEvents.reduce((sum, e) => {
        if (e.amount !== undefined && e.amount !== null) {
          return e.status === "done" ? sum + e.amount : sum;
        } else {
          const price = e.treatment_type === "seduta" 
            ? (e.price_type === "invoiced" ? 40 : 35)
            : (e.price_type === "invoiced" ? 25 : 20);
          return e.status === "done" ? sum + price : sum;
        }
      }, 0),
    };
  }, [events, viewType, currentDate]);

  const exportAppointments = useCallback(() => {
    const csvContent = [
      ["Data", "Ora Inizio", "Ora Fine", "Paziente", "Stato", "Trattamento", "Prezzo", "Sede", "Fatturato"],
      ...events.map(e => [
        formatDMY(e.start),
        fmtTime(e.start.toISOString()),
        fmtTime(e.end.toISOString()),
        e.patient_name,
        statusLabel(e.status),
        e.treatment_type === "seduta" ? "Seduta" : "Macchinario",
        e.amount !== undefined && e.amount !== null ? `€${e.amount}` : `€${getDefaultAmount(e.treatment_type as any, e.price_type as any)}`,
        e.location === "domicile" ? "DOMICILIO" : e.clinic_site,
        e.price_type === "invoiced" ? "Sì" : "No"
      ])
    ].map(row => row.join(",")).join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `appuntamenti_${formatDMY(new Date())}.csv`;
    a.click();
    
    window.URL.revokeObjectURL(url);
  }, [events]);

  const exportToPDF = useCallback(() => {
    alert("Funzionalità PDF in sviluppo");
  }, []);

  const exportToGoogleCalendar = useCallback(async () => {
    const eventsToExport = filteredEvents.map(event => ({
      summary: `${event.location === "domicile" ? `🏠 ${event.patient_name}` : event.patient_name} - ${statusLabel(event.status)}`,
      location: event.location === 'studio' ? event.clinic_site : event.domicile_address,
      description: `Trattamento: ${event.treatment_type === 'seduta' ? 'Seduta' : 'Macchinario'}\nPrezzo: €${event.amount !== undefined && event.amount !== null ? event.amount : (event.treatment_type === 'seduta' ? (event.price_type === 'invoiced' ? 40 : 35) : (event.price_type === 'invoiced' ? 25 : 20))}\nNote: ${event.calendar_note || 'Nessuna nota'}`,
      start: {
        dateTime: event.start.toISOString(),
        timeZone: 'Europe/Rome',
      },
      end: {
        dateTime: event.end.toISOString(),
        timeZone: 'Europe/Rome',
      },
    }));
    
    const calendarUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
    const firstEvent = eventsToExport[0];
    
    if (firstEvent) {
      const params = new URLSearchParams({
        text: firstEvent.summary,
        details: firstEvent.description,
        location: firstEvent.location || '',
        dates: `${firstEvent.start.dateTime.replace(/[-:]/g, '').split('.')[0]}Z/${firstEvent.end.dateTime.replace(/[-:]/g, '').split('.')[0]}Z`,
      });
      
      window.open(`${calendarUrl}&${params.toString()}`, '_blank');
    }
  }, [filteredEvents]);

function formatPhoneForWhatsAppWeb(phone: string): string {
  if (!phone) return phone;
  
  // Rimuovi spazi, parentesi, trattini, punti
  let clean = phone.replace(/[\s\(\)\-\.]/g, '');
  
  // Se inizia con 0, sostituisci con 39 (per Italia)
  if (clean.startsWith('0')) {
    clean = '39' + clean.substring(1);
  }
  
  // Se non inizia con +, aggiungilo
  if (!clean.startsWith('+')) {
    clean = '+' + clean;
  }
  
  return clean;
}

  const sendReminder = useCallback(async (appointmentId: string, patientPhone?: string, patientFirstName?: string, isConfirmation?: boolean) => {
    if (!patientPhone) {
      alert("Nessun telefono registrato per questo paziente");
      return;
    }
    
    const appointment = events.find(e => e.id === appointmentId);
    if (!appointment) return;
    
    const templateName = isConfirmation ? "Appuntamento" : "Promemoria";
    
    const { data: templateData } = await supabase
      .from("message_templates")
      .select("template")
      .eq("name", templateName)
      .maybeSingle();
    
    let templateText = "";
    if (isConfirmation) {
      templateText = `Grazie per averci scelto.
Ricordiamo il prossimo appuntamento fissato per {data_relativa} alle {ora}.

A presto,
Dr. Marco Turchetta
Fisioterapia e Osteopatia`;
    } else {
      templateText = `Buongiorno {nome},

Le ricordiamo il suo appuntamento di {data_relativa} alle ore ⏰ {ora}.

📍 {luogo}

Cordiali saluti,
Dr. Marco Turchetta
Fisioterapia e Osteopatia`;
    }
    
    if (templateData?.template) {
      templateText = templateData.template;
    }
    
    const cleanPhone = formatPhoneForWhatsAppWeb(patientPhone);
    
    const dataRelativa = formatDateRelative(appointment.start);
    const ora = fmtTime(appointment.start.toISOString());
    
    let luogo = "";
    if (appointment.location === 'studio') {
      luogo = CLINIC_ADDRESSES[appointment.clinic_site || ""] || 
              appointment.clinic_site || 
              "Pontecorvo, Via Galileo Galilei 5, dietro il Bar Principe";
    } else {
      luogo = `Presso il suo domicilio (${appointment.domicile_address})`;
    }
    
    const nomePaziente = (patientFirstName && patientFirstName.trim()) ? patientFirstName.trim() : "Cliente";
    
    let message = templateText
      .replace(/{nome}/g, nomePaziente)
      .replace(/{data_relativa}/g, dataRelativa)
      .replace(/{ora}/g, ora)
      .replace(/{luogo}/g, luogo);
    
    const encodedMessage = encodeURIComponent(message);
    
        const whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;
    
    const confirmText = isConfirmation 
      ? `📱 CONFERMA NUOVO APPOINTAMENTO WHATSAPP\n\nDestinatario: ${patientPhone}\n\nMessaggio:\n${message}\n\nClicca OK per aprire WhatsApp e inviare.`
      : `📱 INVIO PROMEMORIA WHATSAPP\n\nDestinatario: ${patientPhone}\n\nMessaggio:\n${message}\n\nClicca OK per aprire WhatsApp e inviare.`;
    
    const confirm = window.confirm(confirmText);
    
    if (!confirm) return;
    
    console.log("Tentativo di aprire WhatsApp:", whatsappUrl);
    
    const newWindow = window.open(whatsappUrl, '_blank');

    // Marca WhatsApp come "inviato" (timestamp = verità)
    const nowIso = new Date().toISOString();
    await supabase.from("appointments").update({ whatsapp_sent_at: nowIso, whatsapp_sent: true }).eq("id", appointmentId);
    setEvents((prev) => prev.map((ev) => ev.id === appointmentId ? { ...ev, whatsapp_sent_at: new Date(nowIso), whatsapp_sent: true } : ev));
    
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      console.log("window.open bloccato, provo con location.href");
      
      const manualOpen = window.confirm(
        `Il browser ha bloccato l'apertura automatica di WhatsApp.\n\n` +
        `URL: ${whatsappUrl}\n\n` +
        `Clicca OK per provare ad aprire, oppure Annulla per copiare il link.`
      );
      
      if (manualOpen) {
        window.location.href = whatsappUrl;
      } else {
        alert(`Copia questo link e aprilo manualmente:\n\n${whatsappUrl}`);
      }
    }
    
  }, [events]);

  const updateDuplicateDateTime = useCallback((newDate: string, newTime: string) => {
    if (!newDate || !newTime) return;
    
    const date = parseDateInput(newDate);
    const [hours, minutes] = newTime.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
    
    const durationHours = parseFloat(selectedDuration);
    const endDate = new Date(date.getTime() + durationHours * 60 * 60000);
    
    setCreateStartISO(date.toISOString());
    setCreateEndISO(endDate.toISOString());
  }, [selectedDuration]);

  const handleSlotClick = useCallback((date: Date, hour: number, minute: number = 0) => {
    openCreateModal(date, hour, minute);
  }, [openCreateModal]);

  const loadPatientFromEvent = useCallback(async (patientId: string) => {
    const { data, error } = await supabase
      .from("patients")
      .select("id, first_name, last_name, phone, treatment, diagnosis")
      .eq("id", patientId)
      .single();
      
    if (data && !error) {
      setSelectedPatient(data as PatientLite);
      setPatientResults(prev => {
        if (!prev.some(p => p.id === data.id)) {
          return [data as PatientLite, ...prev];
        }
        return prev;
      });
    }
  }, []);

  const searchPatients = useCallback(async (query: string) => {
    const cleaned = query.trim();
    if (cleaned.length < 2) {
      setPatientResults([]);
      setSelectedPatient(null);
      return;
    }

    setSearching(true);

    const { data, error } = await supabase
      .from("patients")
      .select("id, first_name, last_name, phone, treatment, diagnosis")
      .or(`first_name.ilike.%${cleaned}%,last_name.ilike.%${cleaned}%`)
      .order("last_name", { ascending: true })
      .limit(12);

    setSearching(false);

    if (error) {
      setError(`Errore ricerca paziente: ${error.message}`);
      setPatientResults([]);
      return;
    }

    setPatientResults((data ?? []) as PatientLite[]);
  }, []);

  useEffect(() => {
    if (!createOpen) return;

    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchPatients(q);
    }, 250);

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [q, createOpen, searchPatients]);

  useEffect(() => {
    if (!createStartISO || !selectedStartTime || !selectedDuration) return;
    
    if (duplicateMode && duplicateDate && duplicateTime) {
      updateDuplicateDateTime(duplicateDate, duplicateTime);
    } else {
      const baseDate = new Date(createStartISO);
      const [hours, minutes] = selectedStartTime.split(':').map(Number);
      const dateOnly = new Date(baseDate);
      dateOnly.setHours(hours, minutes, 0, 0);
      
      const durationHours = parseFloat(selectedDuration);
      const endDate = new Date(dateOnly.getTime() + durationHours * 60 * 60000);
      
      setCreateStartISO(dateOnly.toISOString());
      setCreateEndISO(endDate.toISOString());
    }
  }, [selectedStartTime, selectedDuration, createStartISO, duplicateMode, duplicateDate, duplicateTime, updateDuplicateDateTime]);

  useEffect(() => {
    if (createOpen && duplicateMode && eventToDuplicate) {
      const date = eventToDuplicate.start;
      setDuplicateDate(toDateInputValue(date));
      setDuplicateTime(`${pad2(date.getHours())}:${pad2(date.getMinutes())}`);
    }
  }, [createOpen, duplicateMode, eventToDuplicate]);

  const toggleDoneQuick = useCallback(async (apptId: string, current: Status) => {
    setError("");
    const next: Status = current === "done" ? "confirmed" : "done";

    const { error } = await supabase.from("appointments").update({ status: next, is_paid: next === "done" }).eq("id", apptId);

    if (error) {
      setError(`Errore aggiornamento stato: ${error.message}`);
      return;
    }

    const startOfWeek = startOfISOWeekMonday(currentDate);
    const endOfWeek = addDays(startOfWeek, 7);
    await loadAppointments(startOfWeek, endOfWeek);
  }, [currentDate, loadAppointments]);

  const createQuickPatient = useCallback(async () => {
    if (!quickPatientFirstName.trim() || !quickPatientLastName.trim()) {
      setError("Inserisci nome e cognome per il nuovo paziente.");
      return;
    }

    setCreatingQuickPatient(true);
    setError("");

    try {
      const { data, error } = await supabase
        .from("patients")
        .insert({
          first_name: quickPatientFirstName.trim(),
          last_name: quickPatientLastName.trim(),
          phone: quickPatientPhone.trim() || null,
          status: "da_completare",
          created_at: new Date().toISOString(),
        })
        .select("id, first_name, last_name, phone")
        .single();

      if (error) throw error;

      if (data) {
        const newPatient: PatientLite = {
          id: data.id,
          first_name: data.first_name,
          last_name: data.last_name,
          phone: data.phone,
        };

        setSelectedPatient(newPatient);
        setPatientResults(prev => [newPatient, ...prev]);
        setQuickPatientOpen(false);
        setQuickPatientFirstName("");
        setQuickPatientLastName("");
        setQuickPatientPhone("");
        
        setError("Paziente creato con successo! Ora puoi creare l'appuntamento.");
      }
    } catch (err: any) {
      setError(`Errore creazione paziente: ${err.message}`);
    } finally {
      setCreatingQuickPatient(false);
    }
  }, [quickPatientFirstName, quickPatientLastName, quickPatientPhone]);

  const createAppointment = useCallback(async (sendWhatsApp: boolean = false) => {
  setError("");

  if (!selectedPatient) {
    setError("Seleziona un paziente prima di creare l'appuntamento.");
    return;
  }
  if (!createStartISO || !createEndISO) {
    setError("Orari appuntamento non validi.");
    return;
  }

  if (createLocation === "studio") {
    if (!createClinicSite.trim()) {
      setError("Inserisci il nome della sede (clinic_site).");
      return;
    }
  } else {
    if (createDomicileAddress.trim().length < 5) {
      setError("Inserisci un indirizzo domicilio valido (min 5 caratteri).");
      return;
    }
  }

  const firstStart = new Date(createStartISO);
  const firstEnd = new Date(createEndISO);
  const durationMs = firstEnd.getTime() - firstStart.getTime();
  if (durationMs <= 0) {
    setError("Durata appuntamento non valida.");
    return;
  }

  if (isRecurring) {
    if (recurringDays.length === 0) {
      setError("Seleziona almeno un giorno per la ricorrenza.");
      return;
    }
    const until = parseDateInput(recurringUntil);
    if (until < firstStart) {
      setError("La data 'Ripeti fino a' non può essere precedente alla prima data.");
      return;
    }
  }

  let amount: number | null = null;
  if (useCustomPrice && customAmount !== "") {
    const parsed = parseFloat(customAmount.replace(',', '.'));
    if (!isNaN(parsed) && parsed >= 0) {
      amount = parsed;
    }
  } else {
    // Se nei Settings hai disattivato "applica automaticamente", lasciamo vuoto a meno che non sia custom
    const autoApply = practiceSettings?.auto_apply_prices ?? true;
    if (autoApply) {
      amount = getDefaultAmount(treatmentType, priceType);
    } else {
      amount = null;
    }
  }

  setCreating(true);

  const basePayload = {
    patient_id: selectedPatient.id,
    status: "booked" as Status,
    calendar_note: null as string | null,
    location: createLocation,
    clinic_site: createLocation === "studio" ? createClinicSite.trim() : null,
    domicile_address: createLocation === "domicile" ? createDomicileAddress.trim() : null,
    treatment_type: treatmentType,
    price_type: priceType,
    amount: amount,
  };

  try {
    let createdAppointmentId: string | null = null;

    if (!isRecurring) {
      const payload = {
        ...basePayload,
        start_at: firstStart.toISOString(),
        end_at: firstEnd.toISOString(),
      };

      const { data, error: insErr } = await supabase.from("appointments").insert(payload).select().single();
      if (insErr) throw new Error(insErr.message);

      if (data) {
        createdAppointmentId = data.id;
        
        if (sendWhatsApp) {
          const cleanPhone = formatPhoneForWhatsAppWeb(selectedPatient.phone || "");
          
          if (!cleanPhone) {
            alert("Nessun telefono registrato per questo paziente");
          } else {
            const dataRelativa = formatDateRelative(firstStart);
            const ora = fmtTime(firstStart.toISOString());
            
            let luogo = "";
            if (createLocation === 'studio') {
              luogo = CLINIC_ADDRESSES[createClinicSite] || 
                      createClinicSite || 
                      "Pontecorvo, Via Galileo Galilei 5, dietro il Bar Principe";
            } else {
              luogo = `Presso il suo domicilio (${createDomicileAddress})`;
            }
            
            const nomePaziente = selectedPatient.first_name || "Cliente";
            
            const message = `Grazie per averci scelto.
Ricordiamo il prossimo appuntamento fissato per ${dataRelativa} alle ${ora}.

📍 ${luogo}

A presto,
Dr. Marco Turchetta
Fisioterapia e Osteopatia`;
            
            const encodedMessage = encodeURIComponent(message);
const whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;

window.open(whatsappUrl, '_blank');

            // Segna WhatsApp inviato per questo appuntamento (timestamp = verità)
            if (createdAppointmentId) {
              const nowIso = new Date().toISOString();
              await supabase.from("appointments").update({ whatsapp_sent_at: nowIso, whatsapp_sent: true }).eq("id", createdAppointmentId);
            }
          }
        }
      }

    } else {
      const until = parseDateInput(recurringUntil);

      const starts = generateRecurringStarts({
        firstStart,
        untilDate: until,
        weekDays: recurringDays,
      });

      if (starts.length > 200) {
        throw new Error(
          `Ricorrenza troppo ampia: ${starts.length} appuntamenti. Riduci l'intervallo o i giorni selezionati.`
        );
      }

      const rows = starts.map((s) => ({
        ...basePayload,
        start_at: s.toISOString(),
        end_at: new Date(s.getTime() + durationMs).toISOString(),
      }));

      const { error: insErr } = await supabase.from("appointments").insert(rows);
      if (insErr) throw new Error(insErr.message);
      
      if (sendWhatsApp) {
        alert("Per appuntamenti ricorrenti, WhatsApp non viene inviato automaticamente per evitare troppi messaggi.");
      }
    }

    setCreateOpen(false);
    const startOfWeek = startOfISOWeekMonday(currentDate);
    const endOfWeek = addDays(startOfWeek, 7);
    await loadAppointments(startOfWeek, endOfWeek);
    
  } catch (e: any) {
    setError(`Errore creazione appuntamento: ${e?.message ?? "Errore sconosciuto"}`);
  } finally {
    setCreating(false);
  }
}, [
  selectedPatient,
  createStartISO,
  createEndISO,
  createLocation,
  createClinicSite,
  createDomicileAddress,
  isRecurring,
  recurringDays,
  recurringUntil,
  treatmentType,
  priceType,
  useCustomPrice,
  customAmount,
  practiceSettings,
  getDefaultAmount,
  currentDate,
  loadAppointments,
]);

  const saveAppointment = useCallback(async () => {
  if (!selectedEvent) return;

  setError("");

  let amount: number | null = null;
  if (editAmount !== "" && editAmount !== null && editAmount !== undefined) {
    const parsed = parseFloat(editAmount.replace(',', '.'));
    if (!isNaN(parsed) && parsed >= 0) {
      amount = parsed;
    }
  }

  // Calcola nuove date e orari se modificati
  let newStartDate = selectedEvent.start;
  let newEndDate = selectedEvent.end;
  
  if (editDate && editStartTime) {
    const [hours, minutes] = editStartTime.split(':').map(Number);
    newStartDate = parseDateInput(editDate);
    newStartDate.setHours(hours, minutes, 0, 0);
    
    const durationHours = parseFloat(editDuration);
    newEndDate = new Date(newStartDate.getTime() + durationHours * 60 * 60000);
  }

  if (!newStartDate || !newEndDate) {
    alert("Errore: data o ora non valida");
    return;
  }

  const ALLOWED = new Set(["booked","confirmed","done","cancelled","not_paid"]);

  const normalizedStatus =
    editStatus === ("no_show" as any) ? "not_paid" : editStatus;

  if (!ALLOWED.has(normalizedStatus)) {
    setError(`STATUS ILLEGALE: ${String(normalizedStatus)}`);
    return;
  }

  // Creiamo l'oggetto di aggiornamento
  const updateData = {
    status: normalizedStatus,
    // is_paid segue lo stato: done => pagato, altrimenti non pagato
    is_paid: normalizedStatus === "done",
    calendar_note: editNote,
    amount: amount,
    treatment_type: editTreatmentType,
    price_type: editPriceType,
    start_at: newStartDate.toISOString(),
    end_at: newEndDate.toISOString(),
  };

  // Rimuoviamo le proprietà undefined/null
  const cleanedData = Object.fromEntries(
    Object.entries(updateData).filter(([_, v]) => v !== null && v !== undefined)
  );

  try {
    const { error } = await supabase
      .from("appointments")
      .update(cleanedData)
      .eq("id", selectedEvent.id);

    if (error) {
      setError(`Errore salvataggio: ${error.message}`);
      return;
    }

    setSelectedEvent(null);
    const startOfWeek = startOfISOWeekMonday(currentDate);
    const endOfWeek = addDays(startOfWeek, 7);
    await loadAppointments(startOfWeek, endOfWeek);
  } catch (err: any) {
    setError(`Errore salvataggio: ${err.message}`);
  }
}, [selectedEvent, editStatus, editNote, editAmount, editTreatmentType, editPriceType, editDate, editStartTime, editDuration, currentDate, loadAppointments]);

  const deleteAppointment = useCallback(async () => {
    if (!selectedEvent) return;

    const ok = window.confirm("Vuoi eliminare definitivamente questo appuntamento?");
    if (!ok) return;

    setError("");

    const { error } = await supabase.from("appointments").delete().eq("id", selectedEvent.id);

    if (error) {
      setError(`Errore eliminazione: ${error.message}`);
      return;
    }

    setSelectedEvent(null);
    const startOfWeek = startOfISOWeekMonday(currentDate);
    const endOfWeek = addDays(startOfWeek, 7);
    await loadAppointments(startOfWeek, endOfWeek);
  }, [selectedEvent, currentDate, loadAppointments]);

  const printCalendar = useCallback(() => {
    window.print();
    setPrintMenuOpen(false);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (printMenuRef.current && !printMenuRef.current.contains(event.target as Node)) {
        setPrintMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const dayLabels = useMemo(
    () => [
      { dow: 1, label: "LUN" },
      { dow: 2, label: "MAR" },
      { dow: 3, label: "MER" },
      { dow: 4, label: "GIO" },
      { dow: 5, label: "VEN" },
      { dow: 6, label: "SAB" },
    ],
    []
  );

  const toggleRecurringDay = useCallback((dow: number) => {
    setRecurringDays((prev) => {
      if (prev.includes(dow)) return prev.filter((x) => x !== dow);
      return [...prev, dow].sort((a, b) => a - b);
    });
  }, []);

  const handleDragStart = useCallback((event: React.DragEvent, apptId: string, originalStart: Date, originalEnd: Date) => {
    setDraggingEvent({ id: apptId, originalStart, originalEnd });
    event.dataTransfer.setData("text/plain", apptId);
    event.dataTransfer.effectAllowed = "move";
    
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.opacity = "0.4";
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent, dayIndex?: number, hour?: number, minute: number = 0) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    
    if (dayIndex !== undefined && hour !== undefined) {
      setDraggingOver({ dayIndex, hour, minute });
    }
    
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.backgroundColor = "rgba(37, 99, 235, 0.05)";
    }
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    setDraggingOver(null);
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.backgroundColor = "transparent";
    }
  }, []);

  const handleDrop = useCallback(async (event: React.DragEvent, targetDate: Date, targetHour: number, targetMinute: number = 0) => {
    event.preventDefault();
    setDraggingOver(null);
    
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.backgroundColor = "transparent";
    }
    
    if (!draggingEvent) return;

    const apptId = event.dataTransfer.getData("text/plain");
    if (apptId !== draggingEvent.id) return;

    const newStart = new Date(targetDate);
    newStart.setHours(targetHour, targetMinute, 0, 0);
    
    const duration = draggingEvent.originalEnd.getTime() - draggingEvent.originalStart.getTime();
    const newEnd = new Date(newStart.getTime() + duration);

    setError("");

    const { error } = await supabase
      .from("appointments")
      .update({
        start_at: newStart.toISOString(),
        end_at: newEnd.toISOString(),
      })
      .eq("id", apptId);

    if (error) {
      setError(`Errore spostamento: ${error.message}`);
    } else {
      const startOfWeek = startOfISOWeekMonday(currentDate);
      const endOfWeek = addDays(startOfWeek, 7);
      await loadAppointments(startOfWeek, endOfWeek);
    }

    setDraggingEvent(null);
  }, [draggingEvent, currentDate, loadAppointments]);

  const handleDragEnd = useCallback((event: React.DragEvent) => {
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.opacity = "1";
    }
    setDraggingEvent(null);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, event?: any) => {
    e.preventDefault();
    setQuickActionsMenu({
      x: e.clientX,
      y: e.clientY,
      eventId: event?.id,
    });
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      const event = events.find(e => e.id === selectedEvent.id);
      if (event) {
        setEditAmount(event.amount !== undefined && event.amount !== null ? event.amount.toString() : "");

        const tt: "seduta" | "macchinario" =
          event.treatment_type === "macchinario" ? "macchinario" : "seduta";
        setEditTreatmentType(tt);

        const pt: "invoiced" | "cash" =
          event.price_type === "cash" ? "cash" : "invoiced";
        setEditPriceType(pt);

        
        // Imposta i valori per la modifica di orario e giorno
        setEditDate(toDateInputValue(event.start));
        setEditStartTime(`${pad2(event.start.getHours())}:${pad2(event.start.getMinutes())}`);
        
        const durationHours = (event.end.getTime() - event.start.getTime()) / (60 * 60000);
        if (durationHours === 1) setEditDuration("1");
        else if (durationHours === 1.5) setEditDuration("1.5");
        else if (durationHours === 2) setEditDuration("2");
      }
    }
  }, [selectedEvent, events]);

  // Nuova funzione per il drag and drop su slot di 30 minuti
  const renderTimeGrid = useCallback((day: Date, dayIndex: number) => {
    const slots = [];
    
    for (let hour = 7; hour < 22; hour++) {
      for (let minute of [0, 30]) {
        const slotStart = new Date(day);
        slotStart.setHours(hour, minute, 0, 0);
        
        const slotEnd = new Date(slotStart.getTime() + 30 * 60000);
        
        const isOccupied = events.some(event => 
          event.start.getDate() === day.getDate() &&
          event.start.getMonth() === day.getMonth() &&
          event.start.getFullYear() === day.getFullYear() &&
          (
            (event.start >= slotStart && event.start < slotEnd) ||
            (event.end > slotStart && event.end <= slotEnd) ||
            (event.start <= slotStart && event.end >= slotEnd)
          )
        );

        slots.push({
          hour,
          minute,
          start: slotStart,
          end: slotEnd,
          isOccupied
        });
      }
    }
    
    return slots.map((slot, slotIndex) => (
      <div
        key={`${dayIndex}-${slot.hour}-${slot.minute}`}
        style={{
          height: "30px",
          borderBottom: `1px solid ${THEME.border}`,
          cursor: "pointer",
          background: showAvailableOnly ? 
            (slot.isOccupied ? "transparent" : "rgba(34, 197, 94, 0.05)") 
            : "transparent",
          boxSizing: "border-box",
          position: "relative",
        }}
        onClick={() => {
          handleSlotClick(day, slot.hour, slot.minute);
        }}
        onContextMenu={(e) => handleContextMenu(e)}
        onDragOver={(e) => handleDragOver(e, dayIndex, slot.hour, slot.minute)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => {
          handleDrop(e, day, slot.hour, slot.minute);
        }}
        title={`Clicca per creare appuntamento alle ${pad2(slot.hour)}:${pad2(slot.minute)}`}
      >
        {draggingOver && draggingOver.dayIndex === dayIndex && 
         draggingOver.hour === slot.hour && draggingOver.minute === slot.minute && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              border: `2px dashed ${THEME.blue}`,
              background: "rgba(37, 99, 235, 0.1)",
              zIndex: 1,
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    ));
  }, [events, showAvailableOnly, handleSlotClick, handleContextMenu, handleDragOver, handleDragLeave, handleDrop]);

useEffect(() => {
  if (typeof window === "undefined") return;

  const isNew = params.get("new");
  if (isNew !== "1") return;

  // evita doppia apertura
  if (createOpen) return;

  const dateStr = params.get("date");
  const view = params.get("view");

  // forza vista giorno
  setViewType(view === "week" ? "week" : "day");

  // imposta data
  let d = new Date();
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, day] = dateStr.split("-").map(Number);
    d = new Date(y, m - 1, day);
  }
  // scegli uno slot libero “furbo”
const slots = getAvailableSlots(d);
const now = new Date();
const isToday =
  d.getFullYear() === now.getFullYear() &&
  d.getMonth() === now.getMonth() &&
  d.getDate() === now.getDate();

let chosen = slots[0]?.start ?? new Date(d);
if (isToday) {
  const candidate = slots.find(s => s.start.getTime() >= now.getTime() + 10 * 60 * 1000);
  if (candidate) chosen = candidate.start;
}

setCurrentDate(chosen);

// apre modale creazione
openCreateModal(chosen, chosen.getHours(), chosen.getMinutes());


  // pulizia URL
  const url = new URL(window.location.href);
  url.searchParams.delete("new");
  window.history.replaceState({}, "", url.toString());
}, []);
return (
    <div style={{ display: "flex", minHeight: "100vh", background: THEME.appBg }}>
      <style jsx global>{`
        .sidebar-scroll {
          overflow-y: auto;
          scrollbar-width: none; /* Firefox: hide */
          -ms-overflow-style: none; /* IE/Edge legacy */
        }
        .sidebar-scroll::-webkit-scrollbar { width: 0px; height: 0px; } /* Chrome/Safari: hide */

        .sidebar-scroll.show-scrollbar {
          scrollbar-width: auto; /* Firefox: show */
        }
        .sidebar-scroll.show-scrollbar::-webkit-scrollbar { width: 10px; height: 10px; }
        .sidebar-scroll.show-scrollbar::-webkit-scrollbar-thumb { background: rgba(15,23,42,0.25); border-radius: 10px; }
        .sidebar-scroll.show-scrollbar::-webkit-scrollbar-track { background: rgba(15,23,42,0.06); border-radius: 10px; }
      `}</style>

      <CalendarGrid {...{THEME, statusColor, statusLabel, normalizeStatus, normalizeTreatmentType, normalizePriceType, toggleDoneQuick, weeklyExpectedRevenue, startOfISOWeekMonday, addDays, formatDMY, getAvailabilityForecast, fmtTime, pad2, dayLabels, draggingOver, event, exportAppointments, exportToGoogleCalendar, exportToPDF, printCalendar, filteredEvents, getEventPosition, getAvailableSlots, getEventColor, autoNameFontSize, filters, filtersExpanded, error, loading, setFiltersExpanded, setFilters, goToNextWeek, gotoWeekStart, goToPreviousWeek, goToToday, handleDragEnd, handleDragStart, handleContextMenu, handleDragLeave, handleDragOver, handleDrop, handleLogout, sendReminder, handleSlotClick, loadPatientFromEvent, printMenuOpen, printMenuRef, currentDate, setCurrentDate, currentTime, setQuickActionsMenu, setSelectedEvent, setEditStatus, setEditNote, setEditAmount, setEditTreatmentType, setEditPriceType, setViewType, setShowAllUpcoming, setPrintMenuOpen, showAllUpcoming, showAvailableOnly, setShowAvailableOnly, sidebarRef, stats, statusFilter, setStatusFilter, timeSlots, todaysAppointments, top, userInitials, userMenuOpen, userMenuRef, setUserMenuOpen, viewType, weekDays, weekOptions}} />


      <CreateAppointmentModal {...{THEME, createClinicSite, createDomicileAddress, createLocation, createOpen, createQuickPatient, createStartISO, createEndISO, creating, creatingQuickPatient, customAmount,  dayLabels, duplicateMode, isRecurring, patientResults, priceType, q, quickPatientFirstName, quickPatientLastName, quickPatientOpen, quickPatientPhone, recurringUntil, recurringDays, searching, selectedDuration, selectedPatient, setCreateOpen, setCreateLocation, setCreateClinicSite, setCreateDomicileAddress, setCreateStartISO, setCreateEndISO, setQ, setPatientResults, setSelectedPatient, setSelectedDuration, setTreatmentType, setPriceType, setIsRecurring, setRecurringUntil, setQuickPatientOpen, setQuickPatientFirstName, setQuickPatientLastName, setQuickPatientPhone, setShowWhatsAppConfirm, setCustomAmount, setDuplicateDate, setDuplicateTime, duplicateDate, duplicateTime, selectedStartTime, setSelectedStartTime, setUseCustomPrice, showAllUpcoming, timeSelectSlots, fmtTime, toDateInputValue, parseDateInput, toggleRecurringDay, getDefaultAmount, computedDefaultAmount, treatmentType, updateDuplicateDateTime, useCustomPrice}} />

      <EventDrawer {...{THEME, statusColor, statusLabel, events, getEventColor, deleteAppointment, editAmount, editDate, editDuration, editNote, editPriceType, editStartTime, editStatus, editTreatmentType, setSelectedEvent, setEditDate, setEditStartTime, setEditDuration, setEditTreatmentType, setEditPriceType, setEditAmount, setEditStatus, setEditNote, eventColors, openCreateModal, saveAppointment, selectedEvent, sendReminder, setEventColors, showAllUpcoming, timeSelectSlots}} />
      {quickActionsMenu && (
        <div
          style={{
            position: "fixed",
            top: quickActionsMenu.y,
            left: quickActionsMenu.x,
            background: THEME.panelBg,
            border: `1px solid ${THEME.borderSoft}`,
            borderRadius: 8,
            boxShadow: "0 10px 30px rgba(15,23,42,0.15)",
            zIndex: 10000,
            minWidth: 180,
            overflow: "visible",
          }}
        >
          {quickActionsMenu.eventId ? (
            <>
              <button
                onClick={() => {
                  const event = events.find(e => e.id === quickActionsMenu?.eventId);
                  if (event) {
                    toggleDoneQuick(event.id, normalizeStatus(event.status));
                    setQuickActionsMenu(null);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "none",
                  background: "transparent",
                  color: THEME.text,
                  cursor: "pointer",
                  fontWeight: 900,
                  textAlign: "left",
                  borderBottom: `1px solid ${THEME.border}`,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                ✅ Segna come eseguito
              </button>
              <button
                onClick={() => {
                  const event = events.find(e => e.id === quickActionsMenu?.eventId);
                  if (event) {
                    sendReminder(event.id, event.patient_phone ?? undefined, event.patient_first_name ?? undefined);
                    setQuickActionsMenu(null);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "none",
                  background: "transparent",
                  color: THEME.text,
                  cursor: "pointer",
                  fontWeight: 900,
                  textAlign: "left",
                  borderBottom: `1px solid ${THEME.border}`,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                📱 Invia WhatsApp
              </button>
              <button
                onClick={() => {
                  const event = events.find(e => e.id === quickActionsMenu?.eventId);
                  if (event) {
                    openCreateModal(event.start, event.start.getHours(), event.start.getMinutes(), event);
                    setQuickActionsMenu(null);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "none",
                  background: "transparent",
                  color: THEME.text,
                  cursor: "pointer",
                  fontWeight: 900,
                  textAlign: "left",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                📋 Duplica
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                openCreateModal(new Date());
                setQuickActionsMenu(null);
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "none",
                background: "transparent",
                color: THEME.text,
                cursor: "pointer",
                fontWeight: 900,
                textAlign: "left",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              ➕ Nuovo appuntamento
            </button>
          )}
        </div>
      )}
    </div>
  );
}





























