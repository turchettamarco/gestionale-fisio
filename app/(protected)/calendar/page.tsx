"use client";

import Link from "next/link";
import { BuildInfo } from "@/src/components/BuildInfo";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { SOAPNotesEditor } from "./components/SOAPNotes";

import { useSearchParams } from "next/navigation";

// ─── Tipi e utility del calendario (barrel ./utils) ──────────────────────────
import type {
  Status,
  LocationType,
  TreatmentType,
  BookingRequest,
  PatientLite,
  PracticeSettings,
  CalendarEvent,
} from "./utils";

import {
  // Theme & costanti
  THEME,
  DEFAULT_CLINIC_SITE,
  GOOGLE_REVIEW_LINK_FALLBACK,
  CLINIC_ADDRESSES,
  ALL_TREATMENTS,
  // Status / treatment helpers
  statusColor,
  statusBg,
  statusLabel,
  getTreatmentColor,
  getTreatmentLabel,
  asTreatmentType,
  asPriceType,
  // Date helpers
  fmtTime,
  pad2,
  startOfISOWeekMonday,
  addDays,
  addWeeks,
  formatDMY,
  toDateInputValue,
  parseDateInput,
  autoNameFontSize,
  generateRecurringStarts,
  formatDateRelative,
  getMonthGridDays,
  getAvailableSlotsInDay,
  getEventYPosition,
  // WhatsApp
  cleanPhoneForWA,
  openWhatsApp,
  // Export PDF
  exportWeekToPDF,
  // Reminder message
  buildReminderMessage,
} from "./utils";

// ─── Studio context (multi-tenancy) ──────────────────────────────────────────
import { useCurrentStudio, useCurrentStudioId } from "@/src/contexts/StudioContext";

// ─── Popover (B2.1, B2.2) ────────────────────────────────────────────────────
import EventHoverTooltip from "./components/popovers/EventHoverTooltip";
import MonthDayPopover from "./components/popovers/MonthDayPopover";
import DailySummaryDialog from "./components/popovers/DailySummaryDialog";
import QuickActionsMenu from "./components/popovers/QuickActionsMenu";

// ─── Panels (B2.3, B2.4, B2.5) ───────────────────────────────────────────────
import BookingRequestsPanel from "./components/panels/BookingRequestsPanel";
import RightSidebar from "./components/panels/RightSidebar";
import CalendarTopBar from "./components/panels/CalendarTopBar";
import FiltersPopover from "./components/panels/FiltersPopover";
import CalendarToolbar from "./components/panels/CalendarToolbar";

// ─── Views (B2.6, B2.7) ──────────────────────────────────────────────────────
import MonthView from "./components/views/MonthView";
import DayView from "./components/views/DayView";
import WeekView from "./components/views/WeekView";

// ─── Modals (B2.8) ───────────────────────────────────────────────────────────
import WhatsAppConfirmDialog from "./components/modals/WhatsAppConfirmDialog";
import CreateAppointmentModal from "./components/modals/CreateAppointmentModal";

export default function CalendarPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#7b8fa3", fontFamily: "Inter, -apple-system, sans-serif", fontSize: 15 }}>Caricamento calendario…</div>}>
      <CalendarPageInner />
    </Suspense>
  );
}


function CalendarPageInner() {

  // Studio corrente dell'utente loggato (multi-tenancy).
  // Viene passato nelle INSERT degli appuntamenti e nei messaggi WA.
  const { studio: currentStudio } = useCurrentStudio();
  const currentStudioId = currentStudio?.id ?? null;

  const params = useSearchParams();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

// User menu (Logout + Settings)
const [userEmail, setUserEmail] = useState<string | null>(null);
const [userId, setUserId] = useState<string | null>(null);

  // Prezzi standard letti dai Settings (practice_settings)
  const [practiceSettings, setPracticeSettings] = useState<PracticeSettings | null>(null);
  const [practiceSettingsLoaded, setPracticeSettingsLoaded] = useState(false);
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


  // Chiudi sidebar con ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

const handleLogout = useCallback(async () => {
  try {
    await supabase.auth.signOut();
  } finally {
    setUserMenuOpen(false);
    window.location.href = "/login";
  }
}, []);


  const loadPracticeSettings = useCallback(async () => {
    if (!userId) return;
    try {
      setPracticeSettingsLoaded(false);
      const { data, error } = await supabase
        .from("practice_settings")
        .select("standard_invoice, standard_cash, machine_invoice, machine_cash, auto_apply_prices, google_review_link, default_appointment_status, overlap_mode")
        .eq("owner_id", userId)
        .maybeSingle();

      if (error) throw error;

      setPracticeSettings({
        standard_invoice: data?.standard_invoice ?? null,
        standard_cash: data?.standard_cash ?? null,
        machine_invoice: data?.machine_invoice ?? null,
        machine_cash: data?.machine_cash ?? null,
        auto_apply_prices: data?.auto_apply_prices ?? null,
        google_review_link: data?.google_review_link ?? null,
        default_appointment_status: (data?.default_appointment_status ?? "confirmed") as "confirmed"|"booked",
        overlap_mode: ((data as any)?.overlap_mode ?? "warn") as "block"|"warn"|"visual",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("Impossibile caricare practice_settings:", msg);
      setPracticeSettings(null);
    } finally {
      setPracticeSettingsLoaded(true);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadPracticeSettings();
  }, [userId, loadPracticeSettings]);

  const getDefaultAmount = useCallback((tType: TreatmentType, pType: "invoiced" | "cash") => {
    // fallback sicuri (i tuoi vecchi default)
    const fallback = tType === "seduta"
      ? (pType === "invoiced" ? 40 : 35)
      : (pType === "invoiced" ? 25 : 20);

    if (!practiceSettings) return fallback;

    if (tType === "seduta") {
      const v = pType === "invoiced" ? practiceSettings.standard_invoice : practiceSettings.standard_cash;
      return (typeof v === "number" && !Number.isNaN(v)) ? v : fallback;
    } else {
      const v = pType === "invoiced" ? practiceSettings.machine_invoice : practiceSettings.machine_cash;
      return (typeof v === "number" && !Number.isNaN(v)) ? v : fallback;
    }
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
    location?: LocationType | null;
    clinic_site?: string | null;
    domicile_address?: string | null;
    treatment?: string | null;
    diagnosis?: string | null;
    amount?: number | null;
    treatment_type?: string | null;
    price_type?: string | null;
    start?: Date;
    end?: Date;
  } | null>(null);

  const [editStatus, setEditStatus] = useState<Status>("booked");
  const [editNote, setEditNote] = useState("");
  const [editAmount, setEditAmount] = useState<string>("");
  const [editTreatmentType, setEditTreatmentType] = useState<TreatmentType>("seduta");
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

  const [treatmentType, setTreatmentType] = useState<TreatmentType>("seduta");
  const [priceType, setPriceType] = useState<"invoiced" | "cash">("cash"); // default: non fatturato
  const [customAmount, setCustomAmount] = useState<string>("");
  const [useCustomPrice, setUseCustomPrice] = useState(false);

  const computedDefaultAmount = useMemo(() => {
    return getDefaultAmount(treatmentType, priceType);
  }, [getDefaultAmount, treatmentType, priceType]);

  const [selectedStartTime, setSelectedStartTime] = useState<string>("09:00");
  const [selectedDuration, setSelectedDuration] = useState<"1" | "1.5" | "2">("1");

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [recurringUntil, setRecurringUntil] = useState<string>("");

  const [quickPatientOpen, setQuickPatientOpen] = useState(false);
  const [quickPatientFirstName, setQuickPatientFirstName] = useState("");
  const [quickPatientLastName, setQuickPatientLastName] = useState("");
  const [quickPatientPhone, setQuickPatientPhone] = useState("");
  const [creatingQuickPatient, setCreatingQuickPatient] = useState(false);

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [clientReady, setClientReady] = useState(false);

  // Hydration-safe: mark client ready
  useEffect(() => {
    setCurrentDate(new Date());
    setClientReady(true);
  }, []);

  // ── Gestione parametri URL da GlobalSearch (?date=YYYY-MM-DD&view=day) ─────
  useEffect(() => {
    if (!clientReady) return;
    const dateStr = params.get("date");
    const view    = params.get("view");
    if (!dateStr && !view) return;

    if (view && view !== "week") {
      setViewType(view === "month" ? "month" : "day");
    }
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split("-").map(Number);
      setCurrentDate(new Date(y, m - 1, d));
    }
    // Pulisci URL senza ricaricare la pagina
    const url = new URL(window.location.href);
    if (!params.get("new")) {
      url.searchParams.delete("date");
      url.searchParams.delete("view");
      window.history.replaceState({}, "", url.toString());
    }
  }, [clientReady]);

  const [weeklyExpectedRevenue, setWeeklyExpectedRevenue] = useState<number>(0);

  const [viewType, setViewType] = useState<"day" | "week" | "month">("week");

  useEffect(() => {
    if (!clientReady) return;
    let cancelled = false;

    const loadPeriodStats = async () => {
      try {
        let periodStart: Date;
        let periodEnd: Date;

        if (viewType === "month") {
          // Intero mese
          periodStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
          periodEnd.setHours(0, 0, 0, 0);
        } else {
          // Settimana corrente
          const today = new Date(currentDate);
          const day = today.getDay();
          const diffToMonday = (day === 0 ? -6 : 1) - day;
          periodStart = new Date(today);
          periodStart.setDate(today.getDate() + diffToMonday);
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(periodStart);
          periodEnd.setDate(periodStart.getDate() + 7);
          periodEnd.setHours(0, 0, 0, 0);
        }

const { data, error } = await supabase
          .from("appointments")
          .select("amount, expected_price, status, start_at")
          .gte("start_at", periodStart.toISOString())
          .lt("start_at", periodEnd.toISOString());

        if (error) throw error;

        const rows = data ?? [];
        const validRows = rows.filter((r) => r.status !== "cancelled");

        const revenue = validRows.reduce((sum: number, r) => {
          const v = r.amount ?? r.expected_price ?? 0;
          return sum + Number(v);
        }, 0);

        if (!cancelled) setWeeklyExpectedRevenue(revenue);
      } catch {
        if (!cancelled) setWeeklyExpectedRevenue(0);
      }
    };

    loadPeriodStats();
    return () => {
      cancelled = true;
    };
  }, [currentDate, viewType, clientReady]);

  const [draggingEvent, setDraggingEvent] = useState<{
    id: string;
    originalStart: Date;
    originalEnd: Date;
  } | null>(null);
  const [draggingOver, setDraggingOver] = useState<{dayIndex: number, hour: number, minute: number} | null>(null);
  const [dragGhostPos, setDragGhostPos] = useState<{x: number, y: number} | null>(null);

  // Overlap warning
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);

  // Recurring frequency (every N weeks)
  const [recurringFrequency, setRecurringFrequency] = useState<1 | 2 | 3 | 4>(1);

  // Treatment type colors
  const TREATMENT_COLORS: Record<string, string> = {
    seduta: "#2563eb",       // blu ardesia smorzato
    macchinario: "#7c3aed",  // viola smorzato
  };

  const [printMenuOpen, setPrintMenuOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filtersPopoverOpen, setFiltersPopoverOpen] = useState(false);
  const printMenuRef = useRef<HTMLDivElement>(null);

  // Feature: Ricerca rapida nel calendario
  const [calendarSearch, setCalendarSearch] = useState("");
  const [calendarSearchOpen, setCalendarSearchOpen] = useState(false);

  // Ricerca attiva quando >= 2 caratteri
  const isSearchActive = useMemo(() => calendarSearch.trim().length >= 2, [calendarSearch]);

  // IDs degli eventi che matchano la ricerca
  const searchMatchIds = useMemo(() => {
    const s = new Set<string>();
    if (!isSearchActive) return s;
    const q = calendarSearch.trim().toLowerCase();
    events.forEach(ev => {
      if (ev.patient_name.toLowerCase().includes(q)) s.add(ev.id);
    });
    return s;
  }, [isSearchActive, calendarSearch, events]);

  // Riepilogo giornaliero per il modal "Riepilogo di oggi"
  const dailySummary = useMemo(() => {
    const today = new Date();
    const todayEvts = events.filter(ev =>
      ev.start.getDate() === today.getDate() &&
      ev.start.getMonth() === today.getMonth() &&
      ev.start.getFullYear() === today.getFullYear() &&
      ev.status !== "cancelled"
    );
    const done = todayEvts.filter(ev => ev.status === "done").length;
    const notDone = todayEvts.filter(ev => ev.status !== "done").length;
    const unpaid = todayEvts.filter(ev => !ev.is_paid).length;
    const invoicedTotal = todayEvts.filter(ev => ev.price_type === "invoiced" && ev.is_paid).reduce((s, ev) => s + (ev.amount ?? 0), 0);
    const cashTotal = todayEvts.filter(ev => ev.price_type === "cash" && ev.is_paid).reduce((s, ev) => s + (ev.amount ?? 0), 0);
    const grandTotal = todayEvts.filter(ev => ev.is_paid).reduce((s, ev) => s + (ev.amount ?? 0), 0);
    return { total: todayEvts.length, done, notDone, unpaid, invoicedTotal, cashTotal, grandTotal, events: todayEvts };
  }, [events]);

  // Feature: Hover tooltip per mini-scheda paziente
  const [hoverTooltip, setHoverTooltip] = useState<{
    event: CalendarEvent;
    x: number;
    y: number;
  } | null>(null);
  const hoverTimer = useRef<any>(null);

  // Feature: Riepilogo giornaliero
  const [dailySummaryOpen, setDailySummaryOpen] = useState(false);

  // Feature: Segna pagato in blocco
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

  // Feature: Popover vista mese
  const [monthPopover, setMonthPopover] = useState<{
    day: Date;
    events: CalendarEvent[];
    x: number;
    y: number;
  } | null>(null);

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
  const [eventToDuplicate, setEventToDuplicate] = useState<CalendarEvent | null>(null);
  const [duplicateDate, setDuplicateDate] = useState<string>("");
  const [duplicateTime, setDuplicateTime] = useState<string>("09:00");

  // Stati per le nuove funzionalità
  const [filters, setFilters] = useState({
    location: "all" as "all" | "studio" | "domicile",
    treatmentType: "all" as "all" | TreatmentType,
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

  const [todaysAppointments, setTodaysAppointments] = useState<CalendarEvent[]>([]);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const monthClickTimer = useRef<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [bookingPanel, setBookingPanel] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingActionId, setBookingActionId] = useState<string | null>(null);

  
  // Sidebar behavior: overlay on mobile, "push content" on desktop
  const SIDEBAR_W = 300;
  const [isDesktop, setIsDesktop] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  // Responsive time column width
  const TIME_COL = isTablet && !isDesktop ? 50 : 80;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mqlDesktop = window.matchMedia("(min-width: 1024px)");
    const mqlTablet = window.matchMedia("(min-width: 768px) and (max-width: 1199px)");
    const update = () => {
      const desk = mqlDesktop.matches;
      const tab = mqlTablet.matches;
      setIsDesktop(desk);
      setIsTablet(tab);
      // Su tablet: default vista giorno (più comoda touch)
      if (tab && !desk) {
        setViewType(prev => prev === "week" ? "day" : prev);
      }
    };
    update();
    if (mqlDesktop.addEventListener) {
      mqlDesktop.addEventListener("change", update);
      mqlTablet.addEventListener("change", update);
    }
    return () => {
      if (mqlDesktop.removeEventListener) {
        mqlDesktop.removeEventListener("change", update);
        mqlTablet.removeEventListener("change", update);
      }
    };
  }, []);
// Timer per linea del tempo corrente
  useEffect(() => {
    setCurrentTime(new Date());
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

  // Opzioni settimane per il select nella navbar (±8 settimane dalla corrente)
  const weekOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = startOfISOWeekMonday(new Date());
    for (let i = -8; i <= 8; i++) {
      const weekStart = addWeeks(now, i);
      const weekEnd = addDays(weekStart, 6);
      const mesi = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
      const label = `${formatDMY(weekStart)} – ${weekEnd.getDate()} ${mesi[weekEnd.getMonth()]}`;
      options.push({ value: weekStart.toISOString(), label });
    }
    return options;
  }, []);

  // Ritorna statistiche occupazione per un giorno (usato nell'header settimana)
  const getAvailabilityForecast = useCallback((day: Date) => {
    const d0 = new Date(day); d0.setHours(0,0,0,0);
    const d1 = new Date(day); d1.setHours(23,59,59,999);
    const dayEvts = events.filter(ev =>
      ev.status !== "cancelled" && ev.start >= d0 && ev.start <= d1
    );
    const totalMinutes = 8 * 60; // 8-20 = 12h = 720min, ma usiamo 8h lavorative
    const usedMinutes = dayEvts.reduce((s, ev) => {
      return s + Math.max(0, (ev.end.getTime() - ev.start.getTime()) / 60000);
    }, 0);
    const occupancyRate = Math.round(Math.min((usedMinutes / totalMinutes) * 100, 100));
    return { totalEvents: dayEvts.length, occupancyRate };
  }, [events]);

  // Ritorna le finestre libere di un giorno (usato con showAvailableOnly)
  const getFreeWindows = useCallback((day: Date) => {
    const WORK_START = 8, WORK_END = 20;
    const d0 = new Date(day); d0.setHours(0,0,0,0);
    const d1 = new Date(day); d1.setHours(23,59,59,999);
    const dayEvts = events
      .filter(ev => ev.status !== "cancelled" && ev.start >= d0 && ev.start <= d1)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const windows: { start: Date; end: Date; minutes: number }[] = [];
    let cursor = new Date(day); cursor.setHours(WORK_START, 0, 0, 0);
    const workEnd = new Date(day); workEnd.setHours(WORK_END, 0, 0, 0);

    for (const ev of dayEvts) {
      if (ev.start > cursor) {
        const mins = Math.round((ev.start.getTime() - cursor.getTime()) / 60000);
        if (mins >= 30) windows.push({ start: new Date(cursor), end: new Date(ev.start), minutes: mins });
      }
      if (ev.end > cursor) cursor = new Date(ev.end);
    }
    if (cursor < workEnd) {
      const mins = Math.round((workEnd.getTime() - cursor.getTime()) / 60000);
      if (mins >= 30) windows.push({ start: new Date(cursor), end: new Date(workEnd), minutes: mins });
    }
    return windows;
  }, [events]);

  const openCreateModal = useCallback((date: Date, hour: number = 9, minute: number = 0, duplicateEvent?: CalendarEvent) => {
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
    // selectedPatient: reset solo nel ramo non-duplica (sotto). In modalità
    // duplica viene impostato direttamente con i dati dell'appuntamento.

    if (duplicateEvent) {
      setDuplicateMode(true);
      setEventToDuplicate(duplicateEvent);
      setCreateLocation(duplicateEvent.location ?? "studio");
      setCreateClinicSite(duplicateEvent.clinic_site || DEFAULT_CLINIC_SITE);
      setCreateDomicileAddress(duplicateEvent.domicile_address || "");
      setTreatmentType((duplicateEvent.treatment_type as "seduta" | "macchinario") || "seduta");
      setPriceType((duplicateEvent.price_type as "invoiced" | "cash") || "invoiced");
      setCustomAmount(duplicateEvent.amount ? duplicateEvent.amount.toString() : "");
      setUseCustomPrice(!!duplicateEvent.amount);
      
      const eventDurationHours = (duplicateEvent.end.getTime() - duplicateEvent.start.getTime()) / (60 * 60000);
      if (eventDurationHours === 1) setSelectedDuration("1");
      else if (eventDurationHours === 1.5) setSelectedDuration("1.5");
      else if (eventDurationHours === 2) setSelectedDuration("2");
      
      // Pre-seleziona il paziente direttamente — nessuna ricerca manuale
      // Usa i dati del paziente se presenti, altrimenti splitta patient_name come fallback
      let firstName = duplicateEvent.patient_first_name || '';
      let lastName = duplicateEvent.patient_last_name || '';
      if (!firstName && !lastName && duplicateEvent.patient_name) {
        // patient_name è tipicamente "Cognome Nome" → splitta
        const parts = duplicateEvent.patient_name.trim().split(/\s+/);
        if (parts.length >= 2) {
          lastName = parts[0];
          firstName = parts.slice(1).join(" ");
        } else {
          lastName = duplicateEvent.patient_name;
        }
      }
      const patientFromEvent = {
        id: duplicateEvent.patient_id,
        first_name: firstName,
        last_name: lastName,
        phone: duplicateEvent.patient_phone || null,
      };
      setSelectedPatient(patientFromEvent);
    } else {
      setDuplicateMode(false);
      setEventToDuplicate(null);
      setSelectedPatient(null);
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
      
      // Freccia sinistra/destra: Naviga tra settimane/giorni/mesi
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (viewType === 'week') goToPreviousWeek();
        else if (viewType === 'month') goToPreviousMonth();
        else setCurrentDate(prev => addDays(prev, -1));
      }
      
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (viewType === 'week') goToNextWeek();
        else if (viewType === 'month') goToNextMonth();
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
    return getEventYPosition(start, end, 1);
  }, []);

  // Vista giorno: 2px per minuto → 1 ora = 120px, molto più leggibile
  const DAY_PX_PER_MIN = 1;
  const getDayEventPosition = useCallback((start: Date, end: Date) => {
    return getEventYPosition(start, end, DAY_PX_PER_MIN);
  }, []);

  const getEventColor = useCallback((event: CalendarEvent | { status: Status; patient_id?: string; treatment_type?: string | null }) => {
    if (event.patient_id && eventColors[event.patient_id]) {
      return eventColors[event.patient_id];
    }
    if ("treatment_type" in event && event.treatment_type) {
      return getTreatmentColor(event.treatment_type);
    }
    return statusColor(event.status);
  }, [eventColors]);

  const handleEventHover = useCallback((e: React.MouseEvent, event: CalendarEvent) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      setHoverTooltip({ event, x: e.clientX, y: e.clientY });
    }, 600);
  }, []);

  const handleEventHoverEnd = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHoverTooltip(null);
  }, []);

  // Restituisce slot liberi per un giorno (usato nel modal creazione per suggerire orario)
  const getAvailableSlots = useCallback((day: Date) => {
    const d0 = new Date(day); d0.setHours(0,0,0,0);
    const d1 = new Date(day); d1.setHours(23,59,59,999);
    const dayEvts = events.filter(ev => ev.start >= d0 && ev.start <= d1);
    return getAvailableSlotsInDay(day, dayEvts);
  }, [events]);

  const loadRequestId = useRef(0);

  const loadAppointments = useCallback(async (startDate: Date, endDate: Date, retryCount = 0) => {
    const thisRequest = ++loadRequestId.current;
    setLoading(true);
    setError("");

    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    try {
      const { data, error } = await supabase
        .from("appointments")
          .select(`
          id, patient_id, start_at, end_at, status, calendar_note, location, clinic_site, domicile_address, treatment_type, price_type, amount,
          expected_price, is_paid,
          reminder_sent_at, reminder_status,
          whatsapp_sent_at,
          patients:patient_id ( first_name, last_name, treatment, diagnosis, phone )
        `)
        .gte("start_at", startISO)
        .lt("start_at", endISO)
        .order("start_at", { ascending: true });

      // Ignore stale responses
      if (thisRequest !== loadRequestId.current) return;

      if (error) {
        if (retryCount < 2) {
          // Retry after short delay
          setTimeout(() => loadAppointments(startDate, endDate, retryCount + 1), 1000);
          return;
        }
        setError(error.message);
        setLoading(false);
        return;
      }

const mapped = (data ?? []).map(
  (
    a: {
      id: string;
      patient_id: string;
      start_at: string;
      end_at: string;
      status: string;
      calendar_note?: string | null;
      location?: string | null;
      clinic_site?: string | null;
      domicile_address?: string | null;
      treatment_type?: string | null;
      price_type?: string | null;
      amount?: number | null;
      expected_price?: number | null;
      is_paid?: boolean | null;
      reminder_sent_at?: string | null;
      reminder_status?: string | null;
      whatsapp_sent_at?: string | null;
      patients?: Array<{
        first_name?: string;
        last_name?: string;
        treatment?: string;
        diagnosis?: string;
        phone?: string;
      }>;
    }
  ) => {
    const patient = Array.isArray(a.patients) ? a.patients[0] : a.patients;

    // Se non c'è paziente (prenotazione web), estrai nome dal calendar_note
    // Formato: "[WEB|Nome Cognome|Telefono] Servizio..."
    let name = patient
      ? `${patient.last_name ?? ""} ${patient.first_name ?? ""}`.trim()
      : "Paziente";

    if (!patient && a.calendar_note) {
      const match = (a.calendar_note as string).match(/^\[WEB\|([^|]+)\|/);
      if (match && match[1]) name = match[1].trim();
    }


    return {
      id: a.id,
      patient_id: a.patient_id,
      title: name,
      start: new Date(a.start_at),
      end: new Date(a.end_at),
      status: a.status as Status,
      calendar_note: a.calendar_note ?? null,
      location: (a.location as LocationType) ?? null,
      clinic_site: a.clinic_site ?? null,
      domicile_address: a.domicile_address ?? null,
      treatment_type: a.treatment_type ?? null,
      price_type: a.price_type ?? null,
      amount: a.amount ?? null,
      expected_price: a.expected_price ?? null,
      is_paid: a.is_paid ?? false,
      reminder_sent_at: a.reminder_sent_at ? new Date(a.reminder_sent_at) : null,
      reminder_status: a.reminder_status ?? null,
      whatsapp_sent_at: a.whatsapp_sent_at ? new Date(a.whatsapp_sent_at) : null,

      // dati paziente (prima riga della relazione)
      patient_name: name,
      patient_first_name: patient?.first_name ?? null,
      patient_last_name: patient?.last_name ?? null,
      patient_phone: patient?.phone ?? null,
treatment: patient?.treatment ?? null,
diagnosis: patient?.diagnosis ?? null,

    };
  }
);

    setEvents(mapped);
    setLoading(false);
    } catch (err) {
      if (thisRequest !== loadRequestId.current) return;
      if (retryCount < 2) {
        setTimeout(() => loadAppointments(startDate, endDate, retryCount + 1), 1000);
      } else {
        setError(`Errore caricamento: ${err instanceof Error ? err.message : "connessione fallita"}`);
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!clientReady) return;
    
    if (viewType === "week") {
      const startOfWeek = startOfISOWeekMonday(currentDate);
      const endOfWeek = addDays(startOfWeek, 7);
      loadAppointments(startOfWeek, endOfWeek);
    } else if (viewType === "month") {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const startOffset = (firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1);
      const calStart = addDays(firstDay, -startOffset);
      const calEnd = addDays(calStart, 42);
      loadAppointments(calStart, calEnd);
    } else {
      const startOfDay = new Date(currentDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(currentDate);
      endOfDay.setHours(23, 59, 59, 999);
      loadAppointments(startOfDay, endOfDay);
    }
  }, [currentDate, viewType, loadAppointments, clientReady]);

  // filteredEvents: applica TUTTI i filtri attivi (stato, luogo, trattamento,
  // priceType, range importo) + filtro per data nella vista giorno.
  // Disponibile a tutto il componente.
  const filteredEvents = useMemo(() => {
    // Step 1: filtro per data se vista giorno
    let result = (viewType === "week" || viewType === "month")
      ? events
      : events.filter(e =>
          e.start.getDate() === currentDate.getDate() &&
          e.start.getMonth() === currentDate.getMonth() &&
          e.start.getFullYear() === currentDate.getFullYear()
        );

    // Step 2: filtro stato
    if (statusFilter !== "all") {
      result = result.filter(e => e.status === statusFilter);
    }

    // Step 3: filtro luogo
    if (filters.location !== "all") {
      result = result.filter(e => e.location === filters.location);
    }

    // Step 4: filtro trattamento
    if (filters.treatmentType !== "all") {
      result = result.filter(e => e.treatment_type === filters.treatmentType);
    }

    // Step 5: filtro priceType
    if (filters.priceType !== "all") {
      result = result.filter(e => e.price_type === filters.priceType);
    }

    // Step 6: filtro range importo
    const min = filters.minAmount ? Number(filters.minAmount) : null;
    const max = filters.maxAmount ? Number(filters.maxAmount) : null;
    if (min !== null && !Number.isNaN(min)) {
      result = result.filter(e => (e.amount ?? 0) >= min);
    }
    if (max !== null && !Number.isNaN(max)) {
      result = result.filter(e => (e.amount ?? 0) <= max);
    }

    return result;
  }, [events, viewType, currentDate, statusFilter, filters]);

  const stats = useMemo(() => {
    return {
      total: filteredEvents.length,
      done: filteredEvents.filter(e => e.status === "done").length,
      confirmed: filteredEvents.filter(e => e.status === "confirmed").length,
      booked: filteredEvents.filter(e => e.status === "booked").length,
      revenue: filteredEvents.reduce((sum, e) => {
        if (e.status !== "done") return sum;
        if (e.amount !== undefined && e.amount !== null) {
          return sum + e.amount;
        }
        const tType = (e.treatment_type === "macchinario" ? "macchinario" : "seduta") as "seduta" | "macchinario";
        const pType = (e.price_type === "cash" ? "cash" : "invoiced") as "invoiced" | "cash";
        return sum + getDefaultAmount(tType, pType);
      }, 0),
    };
  }, [filteredEvents, getDefaultAmount]);

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
        e.amount !== undefined && e.amount !== null ? `€${e.amount}` : `€${getDefaultAmount(asTreatmentType(e.treatment_type), asPriceType(e.price_type))}`,
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
    exportWeekToPDF(events, currentDate, currentStudio);
  }, [events, currentDate]);

  // ─── Booking requests ────────────────────────────────────────────────────
  const loadBookingRequests = useCallback(async () => {
    setBookingLoading(true);
    const { data } = await supabase
      .from("booking_requests")
      .select("*")
      .in("status", ["pending", "confirmed", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(50);
    setBookingRequests(data ?? []);
    setBookingLoading(false);
  }, []);

  useEffect(() => { void loadBookingRequests(); }, [loadBookingRequests]);

  async function confirmBooking(req: BookingRequest) {
    setBookingActionId(req.id);
    try {
      // 1. Aggiorna stato in booking_requests
      const { error: updErr } = await supabase
        .from("booking_requests")
        .update({ status: "confirmed" })
        .eq("id", req.id);
      if (updErr) { alert("Errore aggiornamento: " + updErr.message); return; }

      // 2. Crea appuntamento — stesso metodo usato dal form del calendario
      const timeStr = req.requested_time.slice(0, 5); // "HH:MM"
      const [th, tm] = timeStr.split(":").map(Number);
      const [dy, dm, dd] = req.requested_date.split("-").map(Number);

      // Costruisce data locale (come fa il form normale del calendario)
      const startDt = new Date(dy, dm - 1, dd);
      startDt.setHours(th, tm, 0, 0);
      if (isNaN(startDt.getTime())) { alert("Data non valida"); return; }

      const durationMin = Number(req.service_duration);
      const endDt = new Date(startDt.getTime() + durationMin * 60 * 1000);

      // toISOString() converte in UTC — uguale a come funzionano tutti gli altri appuntamenti
      const startAt = startDt.toISOString();
      const endAt   = endDt.toISOString();

      console.log("[booking] start:", startAt, "end:", endAt, "durata:", durationMin, "min");

      const note = `[WEB|${req.patient_name}|${req.patient_phone}] ${req.service_name}${req.notes ? ` - ${req.notes}` : ""}`;

      // Determina location in base al servizio
      const isHome = req.service_name.toLowerCase().includes("domicil");
      const locationVal = isHome ? "domicile" : "studio";

      const { error: insErr } = await supabase.from("appointments").insert({
        start_at:         startAt,
        end_at:           endAt,
        status:           "booked",
        is_paid:          false,
        location:         locationVal,
        clinic_site:      isHome ? null : DEFAULT_CLINIC_SITE,
        domicile_address: isHome ? (req.notes ?? "da definire") : null,
        calendar_note:    note,
        studio_id:        currentStudioId,  // multi-tenancy
      });
      if (insErr) { alert("Errore creazione appuntamento: " + insErr.message); return; }

      await loadBookingRequests();
      // Ricarica il calendario sulla settimana corrente
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - ((currentDate.getDay() + 6) % 7));
      startOfWeek.setHours(0,0,0,0);
      const endOfWeek = addDays(startOfWeek, 6);
      endOfWeek.setHours(23,59,59,999);
      await loadAppointments(startOfWeek, endOfWeek);
    } finally {
      setBookingActionId(null);
    }
  }

  async function rejectBooking(id: string) {
    setBookingActionId(id);
    await supabase.from("booking_requests").update({ status: "cancelled" }).eq("id", id);
    await loadBookingRequests();
    setBookingActionId(null);
  }

  // Rimette in stato "pending" una prenotazione confermata o annullata
  async function reopenBooking(id: string) {
    setBookingActionId(id);
    await supabase.from("booking_requests").update({ status: "pending" }).eq("id", id);
    await loadBookingRequests();
    setBookingActionId(null);
  }

  const exportToGoogleCalendar = useCallback(async () => {
    const eventsToExport = events.filter(e => e.status !== "cancelled").map(event => ({
      summary: `${event.location === "domicile" ? `🏠 ${event.patient_name}` : event.patient_name} - ${statusLabel(event.status)}`,
      location: event.location === "studio" ? event.clinic_site : event.domicile_address,
      description: `Trattamento: ${getTreatmentLabel(event.treatment_type)}\nPrezzo: €${event.amount ?? ""}\nNote: ${event.calendar_note || "Nessuna nota"}`,
      start: { dateTime: event.start.toISOString(), timeZone: "Europe/Rome" },
      end:   { dateTime: event.end.toISOString(),   timeZone: "Europe/Rome" },
    }));
    const calendarUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE";
    const firstEvent = eventsToExport[0];
    if (firstEvent) {
      const params = new URLSearchParams({
        text: firstEvent.summary,
        details: firstEvent.description,
        location: firstEvent.location || "",
        dates: `${firstEvent.start.dateTime.replace(/[-:]/g, "").split(".")[0]}Z/${firstEvent.end.dateTime.replace(/[-:]/g, "").split(".")[0]}Z`,
      });
      window.open(`${calendarUrl}&${params.toString()}`, "_blank");
    }
  }, [events]);

// ── Utility WhatsApp → vedi ./utils/whatsapp.ts ──
// (cleanPhoneForWA e openWhatsApp sono importate dal file all'inizio)
// ─────────────────────────────────────────────────────────────────────────────

  const sendReminder = useCallback(async (appointmentId: string, patientPhone?: string, patientFirstName?: string, isConfirmation?: boolean) => {
    if (!patientPhone) { alert("Nessun telefono registrato per questo paziente"); return; }
    const appointment = events.find(e => e.id === appointmentId);
    if (!appointment) return;

    // ⚠️ SAFARI iOS FIX
    // Apriamo SUBITO una nuova finestra vuota in modo sincrono (direttamente dal click).
    // Poi possiamo fare fetch/await e aggiornare la URL della finestra aperta.
    // Se chiamassimo window.open DOPO un await, Safari lo bloccherebbe come popup.
    const waWindow = typeof window !== "undefined"
      ? window.open("about:blank", "_blank")
      : null;

    try {
      // 1. Genera token di conferma sicuro (UUID lato server)
      let linkConferma = "";
      try {
        const r = await fetch("/api/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appointment_id: appointmentId }),
        });
        const j = await r.json();
        if (r.ok && j.token) {
          const originBase = typeof window !== "undefined" ? window.location.origin : "";
          linkConferma = `${originBase}/conferma/${j.token}`;
        }
      } catch (e) {
        console.warn("Impossibile generare token conferma, proseguo senza link:", e);
      }

      // 2. Carica template
      const templateName = isConfirmation ? "Appuntamento" : "Promemoria";
      const { data: templateData } = await supabase.from("message_templates")
        .select("template").eq("name", templateName).maybeSingle();

      // 3. Costruisci messaggio usando l'helper puro
      const message = buildReminderMessage({
        appointment,
        patientFirstName,
        template: templateData?.template ?? undefined,
        isConfirmation: !!isConfirmation,
        linkConferma,
        studioAddress: currentStudio?.address,
        signatureName: currentStudio?.signature_name,
        signatureTitle: currentStudio?.signature_title,
      });

      // 4. Costruisci URL WhatsApp scegliendo il formato giusto per dispositivo:
      //    - Desktop → web.whatsapp.com/send (apre DIRETTAMENTE WhatsApp Web)
      //    - Mobile  → wa.me (apre app WhatsApp anche se contatto non in rubrica)
      const clean = cleanPhoneForWA(patientPhone);
      if (!clean) {
        if (waWindow) waWindow.close();
        alert("Numero di telefono non valido.");
        return;
      }
      const isMobile = /iPhone|iPad|iPod|Android/i.test(
        typeof navigator !== "undefined" ? navigator.userAgent : ""
      );
      const waUrl = isMobile
        ? `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
        : `https://web.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(message)}`;

      if (waWindow) {
        waWindow.location.href = waUrl;
      } else {
        // Fallback: popup bloccato → prova con anchor
        const a = document.createElement("a");
        a.href = waUrl; a.target = "_blank"; a.rel = "noopener noreferrer";
        document.body.appendChild(a); a.click();
        setTimeout(() => document.body.removeChild(a), 200);
      }

      // 5. Aggiorna stato "whatsapp_sent" (in background, non blocca nulla)
      const nowIso = new Date().toISOString();
      await supabase.from("appointments").update({ whatsapp_sent_at: nowIso, whatsapp_sent: true }).eq("id", appointmentId);
      setEvents(prev => prev.map(ev => ev.id === appointmentId ? { ...ev, whatsapp_sent_at: new Date(nowIso), whatsapp_sent: true } : ev));
    } catch (e) {
      console.error("Errore invio promemoria:", e);
      if (waWindow) waWindow.close();
      alert("Errore durante l'invio del promemoria.");
    }
  }, [events, currentStudio]);

  // ── Chiedi Recensione Google via WhatsApp ──────────────────────────
  const sendGoogleReview = useCallback(async (patientPhone?: string, patientFirstName?: string) => {
    if (!patientPhone) { alert("Nessun telefono registrato per questo paziente"); return; }
    const nomePaziente = (patientFirstName?.trim()) || "Cliente";
    // Preferisci il link studio (multi-tenancy); fallback a practice_settings; ultimo fallback locale
    const googleLink =
      currentStudio?.google_review_link ||
      practiceSettings?.google_review_link ||
      GOOGLE_REVIEW_LINK_FALLBACK;
    const firma = [currentStudio?.signature_name, currentStudio?.signature_title]
      .filter(Boolean).join("\n");
    const message = `Buongiorno ${nomePaziente},

Grazie per aver scelto il nostro studio! 🙏

Se è rimasto/a soddisfatto/a del trattamento, le saremmo molto grati se potesse lasciarci una breve recensione su Google:

${googleLink}

La sua opinione ci aiuta a migliorare e a farci conoscere.

Grazie di cuore${firma ? `,\n${firma}` : ""}`;

    openWhatsApp(patientPhone, message);
  }, [practiceSettings, currentStudio]);
  const toggleBulkSelect = useCallback((id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const bulkMarkPaid = useCallback(async () => {
    if (bulkSelected.size === 0) return;
    setError("");
    const ids = Array.from(bulkSelected);
    
    for (const id of ids) {
      const { error } = await supabase.from("appointments").update({ is_paid: true }).eq("id", id);
      if (error) {
        setError(`Errore aggiornamento: ${error.message}`);
        return;
      }
    }

    setBulkSelected(new Set());
    setBulkMode(false);
    const startOfWeek = startOfISOWeekMonday(currentDate);
    const endOfWeek = addDays(startOfWeek, 7);
    await loadAppointments(startOfWeek, endOfWeek);
  }, [bulkSelected, currentDate, loadAppointments]);

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

  // Feature: Copia ultimo setting del paziente
  const loadLastPatientSettings = useCallback(async (patientId: string) => {
    const { data } = await supabase
      .from("appointments")
      .select("treatment_type, price_type, location, clinic_site, domicile_address, amount")
      .eq("patient_id", patientId)
      .order("start_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      if (data.treatment_type) setTreatmentType(data.treatment_type as "seduta" | "macchinario");
      if (data.price_type) setPriceType(data.price_type as "invoiced" | "cash");
      if (data.location) setCreateLocation(data.location as LocationType);
      if (data.clinic_site) setCreateClinicSite(data.clinic_site);
      if (data.domicile_address) setCreateDomicileAddress(data.domicile_address);
      if (data.amount !== null && data.amount !== undefined) {
        setCustomAmount(data.amount.toString());
        setUseCustomPrice(true);
      }
    }
  }, []);

  // Feature: Avviso sovrapposizione orari
  const checkOverlap = useCallback((startISO: string, endISO: string, excludeId?: string): string | null => {
    const newStart = new Date(startISO);
    const newEnd = new Date(endISO);

    const overlapping = events.filter(e => {
      if (excludeId && e.id === excludeId) return false;
      if (e.status === "cancelled") return false;
      return (newStart < e.end && newEnd > e.start);
    });

    if (overlapping.length > 0) {
      const names = overlapping.map(e => `${e.patient_name} (${fmtTime(e.start.toISOString())}-${fmtTime(e.end.toISOString())})`).join(", ");
      return `⚠️ Sovrapposizione con: ${names}`;
    }
    return null;
  }, [events]);

  // Check overlap when create times change
  useEffect(() => {
    if (!createOpen || !createStartISO || !createEndISO) {
      setOverlapWarning(null);
      return;
    }
    setOverlapWarning(checkOverlap(createStartISO, createEndISO));
  }, [createStartISO, createEndISO, createOpen, checkOverlap]);

  // Feature: Month view helpers
  const monthDays = useMemo(() => {
    if (viewType !== "month") return [];
    return getMonthGridDays(currentDate);
  }, [viewType, currentDate]);

  const monthEvents = useMemo(() => {
    if (viewType !== "month" || monthDays.length === 0) return new Map<string, CalendarEvent[]>();
    const map = new Map<string, CalendarEvent[]>();
    filteredEvents.forEach(e => {
      const key = `${e.start.getFullYear()}-${e.start.getMonth()}-${e.start.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return map;
  }, [viewType, filteredEvents, monthDays]);

  const goToPreviousMonth = useCallback(() => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      return d;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      return d;
    });
  }, []);

  const searchPatients = useCallback(async (query: string) => {
    const cleaned = query.trim();
    if (cleaned.length < 2) {
      setPatientResults([]);
      // In modalità duplica il paziente è precaricato dall'appuntamento originale:
      // NON resettarlo solo perché la search è vuota.
      if (!duplicateMode) {
        setSelectedPatient(null);
      }
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
  }, [duplicateMode]);

  useEffect(() => {
    if (!createOpen) return;

    // In modalità duplica con q vuota: il paziente è già precaricato,
    // niente search automatica (eviteremmo solo di trovarlo di nuovo,
    // e l'effect side reset di selectedPatient sarebbe deleterio).
    if (duplicateMode && q.trim().length < 2) return;

    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchPatients(q);
    }, 250);

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [q, createOpen, searchPatients, duplicateMode]);

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

  const togglePaidQuick = useCallback(async (apptId: string, currentlyPaid: boolean) => {
    setError("");
    const { error } = await supabase.from("appointments").update({ is_paid: !currentlyPaid }).eq("id", apptId);
    if (error) {
      setError(`Errore aggiornamento pagamento: ${error.message}`);
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Errore creazione paziente: ${msg}`);
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

  // Feature: Check overlap before creating
  if (!isRecurring) {
    const overlap = checkOverlap(createStartISO, createEndISO);
    if (overlap) {
      const proceed = window.confirm(`${overlap}\n\nVuoi procedere comunque?`);
      if (!proceed) return;
    }
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
    status: (practiceSettings?.default_appointment_status ?? "confirmed") as Status,
    calendar_note: null as string | null,
    location: createLocation,
    clinic_site: createLocation === "studio" ? createClinicSite.trim() : null,
    domicile_address: createLocation === "domicile" ? createDomicileAddress.trim() : null,
    treatment_type: treatmentType,
    price_type: priceType,
    amount: amount,
    studio_id: currentStudioId,  // multi-tenancy
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
          if (!(selectedPatient.phone || "").trim()) {
            alert("Nessun telefono registrato per questo paziente");
          } else {
            const dataRelativa = formatDateRelative(firstStart);
            const ora = fmtTime(firstStart.toISOString());
            
            let luogo = "";
            if (createLocation === 'studio') {
              luogo = CLINIC_ADDRESSES[createClinicSite] || 
                      createClinicSite || 
                      currentStudio?.address ||
                      "";
            } else {
              luogo = `Presso il suo domicilio (${createDomicileAddress})`;
            }
            
            const nomePaziente = selectedPatient.first_name || "Cliente";
            const firma = [currentStudio?.signature_name, currentStudio?.signature_title]
              .filter(Boolean).join("\n");
            
            const message = `Grazie per averci scelto.
Ricordiamo il prossimo appuntamento fissato per ${dataRelativa} alle ${ora}.

📍 ${luogo}

A presto${firma ? `,\n${firma}` : ""}`;
            
            openWhatsApp(selectedPatient.phone || "", message);

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
        frequency: recurringFrequency,
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
    
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Errore sconosciuto";
    setError(`Errore creazione appuntamento: ${msg}`);
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
  recurringFrequency,
  treatmentType,
  priceType,
  useCustomPrice,
  customAmount,
  practiceSettings,
  getDefaultAmount,
  currentDate,
  loadAppointments,
  checkOverlap,
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
    (editStatus as string) === "no_show" ? "not_paid" as Status : editStatus;

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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    setError(`Errore salvataggio: ${msg}`);
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
    exportToPDF();
    setPrintMenuOpen(false);
  }, [exportToPDF]);

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
      event.currentTarget.style.opacity = "0.35";
      event.currentTarget.style.transform = "scale(0.96)";
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent, dayIndex?: number, hour?: number, minute: number = 0) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    
    if (dayIndex !== undefined && hour !== undefined) {
      setDraggingOver({ dayIndex, hour, minute });
    }
    
    // Track ghost position for visual feedback
    setDragGhostPos({ x: event.clientX, y: event.clientY });
    
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.backgroundColor = "rgba(37,99,235,0.08)";
      event.currentTarget.style.transition = "background-color 0.15s ease";
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
      event.currentTarget.style.transform = "scale(1)";
    }
    setDraggingEvent(null);
    setDragGhostPos(null);
    setDraggingOver(null);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, event?: CalendarEvent) => {
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
        setEditTreatmentType((event.treatment_type as "seduta" | "macchinario") || "seduta");
        setEditPriceType((event.price_type as "invoiced" | "cash") || "invoiced");
        
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
useEffect(() => {
  if (typeof window === "undefined") return;

  const isNew = params.get("new");
  if (isNew !== "1") return;

  // evita doppia apertura
  if (createOpen) return;

  const dateStr = params.get("date");
  const view = params.get("view");

  // forza vista giorno
  setViewType(view === "week" ? "week" : view === "month" ? "month" : "day");

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
    <div style={{ minHeight: "100vh", background: THEME.appBg, fontFamily: "'Outfit', 'Segoe UI', system-ui, sans-serif" }}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        * { -webkit-font-smoothing: antialiased; box-sizing: border-box; }
        html { overflow-x: hidden; }
        body { font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif; margin: 0; background: ${THEME.appBg}; overflow-x: hidden; }
        select, input, textarea, button { font-family: inherit; }
        input:focus, select:focus, textarea:focus {
          border-color: ${THEME.blue} !important;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.12) !important;
          outline: none !important;
        }
        @keyframes searchPulse {
          0%, 100% { box-shadow: 0 0 8px rgba(245,158,11,0.5); }
          50% { box-shadow: 0 0 20px rgba(245,158,11,0.8), 0 0 40px rgba(245,158,11,0.3); }
        }
        .search-highlight { animation: searchPulse 1.5s ease-in-out infinite; }
        .search-dimmed { opacity: 0.25 !important; filter: grayscale(0.6); transition: opacity 0.3s, filter 0.3s; }
        .sidebar-scroll { overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(37,99,235,0.12) transparent; }
        .sidebar-scroll::-webkit-scrollbar { width: 5px; }
        .sidebar-scroll::-webkit-scrollbar-thumb { background: rgba(37,99,235,0.12); border-radius: 99px; }
        .sidebar-scroll.show-scrollbar::-webkit-scrollbar { width: 6px; }
        .sidebar-scroll.show-scrollbar::-webkit-scrollbar-thumb { background: rgba(91,130,168,0.18); border-radius: 99px; }
        @media (max-width: 768px) { .mob-hide { display: none !important; } .mob-col { flex-direction: column !important; } }
        @media (min-width: 768px) and (max-width: 1199px) {
          .tab-compact { font-size: 11px !important; padding: 3px 6px !important; }
          .tab-hide { display: none !important; }
          .cal-period-btns { flex-wrap: wrap !important; gap: 3px !important; }
          .cal-period-btns button { font-size: 10px !important; padding: 5px 8px !important; min-height: 36px !important; }
          .cal-sidebar { width: 280px !important; min-width: 280px !important; }
          /* Card appuntamento: su iPad riduci padding/font per far stare tutto */
          .cal-event-card { padding: 6px 7px !important; }
          .cal-event-card .ev-header { font-size: 10px !important; margin-bottom: 2px !important; }
          .cal-event-card .ev-name { font-size: 12px !important; margin-bottom: 2px !important; }
          .cal-event-card .ev-meta { font-size: 10px !important; margin-bottom: 4px !important; }
          .cal-event-card .ev-actions button { font-size: 10px !important; padding: 3px 0 !important; }
        }
        @media print { .no-print { display: none !important; } .print-wrap { margin: 0 !important; padding: 4px !important; } }
      `}</style>

      {/* ━━━ TOP NAVIGATION BAR ━━━ */}
      <CalendarTopBar
        viewType={viewType}
        onSetViewType={setViewType}
        currentDate={currentDate}
        setCurrentDate={setCurrentDate}
        onGoToPreviousWeek={goToPreviousWeek}
        onGoToNextWeek={goToNextWeek}
        onGoToPreviousMonth={goToPreviousMonth}
        onGoToNextMonth={goToNextMonth}
        onGoToToday={goToToday}
        weekOptions={weekOptions}
        onGotoWeekStart={gotoWeekStart}
        printMenuOpen={printMenuOpen}
        setPrintMenuOpen={setPrintMenuOpen}
        printMenuRef={printMenuRef}
        onPrintCalendar={printCalendar}
        onExportToPDF={exportToPDF}
        onExportToGoogleCalendar={exportToGoogleCalendar}
        bookingPanelOpen={bookingPanel}
        pendingBookingsCount={bookingRequests.filter(r => r.status === "pending").length}
        onToggleBookingPanel={() => setBookingPanel(v => !v)}
        userMenuOpen={userMenuOpen}
        setUserMenuOpen={setUserMenuOpen}
        userMenuRef={userMenuRef}
        userInitials={userInitials}
        onLogout={handleLogout}
      />

      {/* ━━━ PANNELLO PRENOTAZIONI DAL SITO ━━━ */}
      {bookingPanel && (
        <BookingRequestsPanel
          requests={bookingRequests}
          loading={bookingLoading}
          actionId={bookingActionId}
          onClose={() => setBookingPanel(false)}
          onConfirm={confirmBooking}
          onReject={rejectBooking}
          onReopen={reopenBooking}
          onRefresh={loadBookingRequests}
        />
      )}

      {/* ━━━ RIGHT PANEL: Today's appointments (replaces left sidebar) ━━━ */}
      <RightSidebar
        width={SIDEBAR_W}
        open={sidebarOpen}
        isDesktop={isDesktop}
        sidebarRef={sidebarRef}
        onClose={() => setSidebarOpen(false)}
        currentDate={currentDate}
        setCurrentDate={setCurrentDate}
        viewType={viewType}
        events={events}
        todaysAppointments={todaysAppointments}
        currentTime={currentTime}
        showAllUpcoming={showAllUpcoming}
        setShowAllUpcoming={setShowAllUpcoming}
        weeklyExpectedRevenue={weeklyExpectedRevenue}
        onSelectEvent={(appointment) => {
          setQuickActionsMenu(null);
          setSelectedEvent({
            id: appointment.id,
            title: appointment.patient_name,
            patient_id: appointment.patient_id,
            location: appointment.location,
            clinic_site: appointment.clinic_site,
            domicile_address: appointment.domicile_address,
            treatment: appointment.treatment,
            diagnosis: appointment.diagnosis,
            amount: appointment.amount,
            treatment_type: appointment.treatment_type,
            price_type: appointment.price_type,
            start: appointment.start,
            end: appointment.end,
          });
          setEditStatus(appointment.status);
          setEditNote(appointment.calendar_note || "");
          setEditAmount(appointment.amount !== undefined && appointment.amount !== null ? appointment.amount.toString() : "");
          setEditTreatmentType((appointment.treatment_type as "seduta" | "macchinario") || "seduta");
          setEditPriceType((appointment.price_type as "invoiced" | "cash") || "invoiced");
        }}
        onToggleDone={(eventId, currentStatus) => toggleDoneQuick(eventId, currentStatus)}
      />

      <main className="print-wrap" style={{
        flex: 1, display: "flex", flexDirection: "column",
        padding: "12px 28px", minWidth: 0,
        marginRight: isDesktop && sidebarOpen ? SIDEBAR_W : 0,
        width: isDesktop && sidebarOpen ? `calc(100% - ${SIDEBAR_W}px)` : "100%",
        boxSizing: "border-box",
        transition: "margin-right 280ms cubic-bezier(.4,0,.2,1), width 280ms cubic-bezier(.4,0,.2,1)",
        overflowX: "hidden",
        maxWidth: 1440, marginTop: 0, marginBottom: 0, marginLeft: "auto",
}}>
        <div style={{ width: "100%" }}>

          {error && (
            <div
              className={`no-print sidebar-scroll ${showAllUpcoming ? "show-scrollbar" : ""}`}
              style={{
                marginTop: 8,
                marginBottom: 16,
                background: "rgba(220,38,38,0.06)",
                border: "1px solid rgba(220,38,38,0.15)",
                color: THEME.red,
                padding: "12px 16px",
                borderRadius: 10,
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {loading && (
            <div style={{ 
              padding: 40, 
              textAlign: "center", 
              color: THEME.muted, 
              fontWeight: 600, 
              fontSize: 14,
              background: THEME.panelBg,
              borderRadius: 10,
              border: `1.5px solid ${THEME.border}`,
              boxShadow: "0 2px 8px rgba(30,64,175,0.05)",
            }}>
              Caricamento appuntamenti...
            </div>
          )}

          {/* ── FILTRI AVANZATI — popover ── */}
          {filtersPopoverOpen && (
            <FiltersPopover
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              filters={filters}
              setFilters={setFilters}
              showAvailableOnly={showAvailableOnly}
              setShowAvailableOnly={setShowAvailableOnly}
              filteredEventsCount={filteredEvents.length}
              onClose={() => setFiltersPopoverOpen(false)}
            />
          )}

          {/* ── TOOLBAR settimana / mese / giorno ── */}
          <CalendarToolbar
            viewType={viewType}
            setViewType={setViewType}
            setCurrentDate={setCurrentDate}
            onGoToPreviousWeek={goToPreviousWeek}
            onGoToNextWeek={goToNextWeek}
            onGoToPreviousMonth={goToPreviousMonth}
            onGoToNextMonth={goToNextMonth}
            onGoToToday={goToToday}
            stats={stats}
            weeklyExpectedRevenue={weeklyExpectedRevenue}
            calendarSearch={calendarSearch}
            setCalendarSearch={setCalendarSearch}
            isSearchActive={isSearchActive}
            searchMatchCount={searchMatchIds.size}
            filters={filters}
            onToggleFiltersPopover={() => setFiltersPopoverOpen(v => !v)}
            actionsMenuOpen={actionsMenuOpen}
            setActionsMenuOpen={setActionsMenuOpen}
            onExportAppointments={exportAppointments}
            onOpenDailySummary={() => setDailySummaryOpen(true)}
            bulkMode={bulkMode}
            setBulkMode={setBulkMode}
            bulkSelected={bulkSelected}
            setBulkSelected={setBulkSelected}
            onBulkMarkPaid={bulkMarkPaid}
            showAllUpcoming={showAllUpcoming}
          />

          {viewType === "week" ? (
            <WeekView
              weekDays={weekDays}
              filteredEvents={filteredEvents}
              currentTime={currentTime}
              timeSlots={timeSlots}
              dayLabels={dayLabels}
              TIME_COL={TIME_COL}
              draggingEvent={draggingEvent}
              draggingOver={draggingOver}
              showAvailableOnly={showAvailableOnly}
              bulkMode={bulkMode}
              bulkSelected={bulkSelected}
              isSearchActive={isSearchActive}
              searchMatchIds={searchMatchIds}
              getEventPosition={getEventPosition}
              getFreeWindows={getFreeWindows}
              getEventColor={getEventColor}
              getAvailabilityForecast={getAvailabilityForecast}
              onSlotClick={handleSlotClick}
              onContextMenu={handleContextMenu}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onEventHover={handleEventHover}
              onEventHoverEnd={handleEventHoverEnd}
              onSelectEvent={(event) => {
                setSelectedEvent({
                  id: event.id,
                  title: event.patient_name,
                  patient_id: event.patient_id,
                  location: event.location,
                  clinic_site: event.clinic_site,
                  domicile_address: event.domicile_address,
                  treatment: event.treatment,
                  diagnosis: event.diagnosis,
                  amount: event.amount,
                  treatment_type: event.treatment_type,
                  price_type: event.price_type,
                  start: event.start,
                  end: event.end,
                });
                setEditStatus(event.status);
                setEditNote(event.calendar_note || "");
                setEditAmount(event.amount !== undefined && event.amount !== null ? event.amount.toString() : "");
                setEditTreatmentType((event.treatment_type as "seduta" | "macchinario") || "seduta");
                setEditPriceType((event.price_type as "invoiced" | "cash") || "invoiced");
                if (event.patient_id) loadPatientFromEvent(event.patient_id);
              }}
              onToggleBulkSelect={toggleBulkSelect}
              onToggleDone={toggleDoneQuick}
              onTogglePaid={togglePaidQuick}
              onSendReminder={sendReminder}
            />
          ) : viewType === "month" ? (
            /* ━━━ MONTH VIEW — COMPACT ━━━ */
            <MonthView
              monthDays={monthDays}
              monthEvents={monthEvents}
              currentDate={currentDate}
              monthClickTimer={monthClickTimer}
              onOpenCreateModal={(day) => openCreateModal(day)}
              onGoToDayView={(day) => { setCurrentDate(day); setViewType("day"); }}
              onOpenMonthPopover={setMonthPopover}
              isSearchActive={isSearchActive}
              searchMatchIds={searchMatchIds}
            />
          ) : (
            /* ━━━ DAY VIEW — timeline + sidebar ━━━ */
            <DayView
              currentDate={currentDate}
              dayEvents={
                filteredEvents
                  .filter(ev =>
                    ev.start.getDate() === currentDate.getDate() &&
                    ev.start.getMonth() === currentDate.getMonth() &&
                    ev.start.getFullYear() === currentDate.getFullYear()
                  )
                  .filter(ev => ev.status !== "cancelled")
                  .sort((a, b) => a.start.getTime() - b.start.getTime())
              }
              currentTime={currentTime}
              timeSlots={timeSlots}
              dayLabels={dayLabels}
              TIME_COL={TIME_COL}
              draggingOver={draggingOver}
              showAvailableOnly={showAvailableOnly}
              bulkMode={bulkMode}
              bulkSelected={bulkSelected}
              searchMatchIds={searchMatchIds}
              onSlotClick={handleSlotClick}
              onContextMenu={handleContextMenu}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              getDayEventPosition={getDayEventPosition}
              getFreeWindows={getFreeWindows}
              getEventColor={getEventColor}
              onSelectEvent={(event) => {
                setSelectedEvent({
                  id: event.id,
                  title: event.patient_name,
                  patient_id: event.patient_id,
                  location: event.location,
                  clinic_site: event.clinic_site,
                  domicile_address: event.domicile_address,
                  treatment: event.treatment,
                  diagnosis: event.diagnosis,
                  amount: event.amount,
                  treatment_type: event.treatment_type,
                  price_type: event.price_type,
                  start: event.start,
                  end: event.end,
                });
                setEditStatus(event.status);
                setEditNote(event.calendar_note || "");
                setEditAmount(event.amount !== undefined && event.amount !== null ? event.amount.toString() : "");
                setEditTreatmentType((event.treatment_type as "seduta" | "macchinario") || "seduta");
                setEditPriceType((event.price_type as "invoiced" | "cash") || "invoiced");
                if (event.patient_id) loadPatientFromEvent(event.patient_id);
              }}
              onToggleBulkSelect={toggleBulkSelect}
              onToggleDone={toggleDoneQuick}
              onTogglePaid={togglePaidQuick}
              onSendReminder={sendReminder}
              onCreateNew={() => openCreateModal(currentDate, 9, 0)}
            />
          )}
        </div>
      </main>

      {createOpen && (
        <CreateAppointmentModal
          duplicateMode={duplicateMode}
          onClose={() => setCreateOpen(false)}
          showAllUpcoming={showAllUpcoming}
          onRequestCreate={() => setShowWhatsAppConfirm(true)}
          createStartISO={createStartISO}
          createEndISO={createEndISO}
          selectedDuration={selectedDuration}
          setSelectedDuration={setSelectedDuration}
          selectedStartTime={selectedStartTime}
          setSelectedStartTime={setSelectedStartTime}
          setCreateStartISO={setCreateStartISO}
          setCreateEndISO={setCreateEndISO}
          timeSelectSlots={timeSelectSlots}
          duplicateDate={duplicateDate}
          duplicateTime={duplicateTime}
          setDuplicateDate={setDuplicateDate}
          setDuplicateTime={setDuplicateTime}
          updateDuplicateDateTime={updateDuplicateDateTime}
          overlapWarning={overlapWarning}
          practiceSettings={practiceSettings}
          createLocation={createLocation}
          setCreateLocation={setCreateLocation}
          createClinicSite={createClinicSite}
          setCreateClinicSite={setCreateClinicSite}
          createDomicileAddress={createDomicileAddress}
          setCreateDomicileAddress={setCreateDomicileAddress}
          treatmentType={treatmentType}
          setTreatmentType={setTreatmentType}
          priceType={priceType}
          setPriceType={setPriceType}
          useCustomPrice={useCustomPrice}
          setUseCustomPrice={setUseCustomPrice}
          customAmount={customAmount}
          setCustomAmount={setCustomAmount}
          computedDefaultAmount={computedDefaultAmount}
          getDefaultAmount={getDefaultAmount}
          isRecurring={isRecurring}
          setIsRecurring={setIsRecurring}
          recurringDays={recurringDays}
          toggleRecurringDay={toggleRecurringDay}
          recurringFrequency={recurringFrequency}
          setRecurringFrequency={setRecurringFrequency}
          recurringUntil={recurringUntil}
          setRecurringUntil={setRecurringUntil}
          dayLabels={dayLabels}
          q={q}
          setQ={setQ}
          searching={searching}
          patientResults={patientResults}
          selectedPatient={selectedPatient}
          setSelectedPatient={setSelectedPatient}
          loadLastPatientSettings={loadLastPatientSettings}
          quickPatientOpen={quickPatientOpen}
          setQuickPatientOpen={setQuickPatientOpen}
          quickPatientFirstName={quickPatientFirstName}
          setQuickPatientFirstName={setQuickPatientFirstName}
          quickPatientLastName={quickPatientLastName}
          setQuickPatientLastName={setQuickPatientLastName}
          quickPatientPhone={quickPatientPhone}
          setQuickPatientPhone={setQuickPatientPhone}
          creatingQuickPatient={creatingQuickPatient}
          createQuickPatient={createQuickPatient}
          creating={creating}
        />
      )}


      {showWhatsAppConfirm && (
        <WhatsAppConfirmDialog
          selectedPatient={selectedPatient}
          createStartISO={createStartISO}
          currentStudio={currentStudio}
          showAllUpcoming={showAllUpcoming}
          onClose={() => setShowWhatsAppConfirm(false)}
          onCreateAppointment={async (withWA) => {
            setShowWhatsAppConfirm(false);
            await createAppointment(withWA);
          }}
        />
      )}

      {selectedEvent && (
        <div
          className={`no-print sidebar-scroll ${showAllUpcoming ? "show-scrollbar" : ""}`}
          onClick={() => setSelectedEvent(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(30,64,175,0.35)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 680,
              maxWidth: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              background: THEME.panelBg,
              color: THEME.text,
              borderRadius: 16,
              border: `2px solid ${THEME.border}`,
              boxShadow: "0 24px 64px rgba(30,64,175,0.2)",
              padding: "32px 28px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: THEME.blue, letterSpacing: -0.3 }}>{selectedEvent.title}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: THEME.muted, fontWeight: 600, letterSpacing: 0.3 }}>
                  Stato: <strong style={{ color: statusColor(editStatus) }}>{statusLabel(editStatus)}</strong>
                  {selectedEvent.location === "domicile" && (
                    <span style={{ marginLeft: 12, color: THEME.amber, fontWeight: 700 }}>⌂ DOMICILIO</span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setSelectedEvent(null)}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  border: `2px solid ${THEME.border}`,
                  background: THEME.panelSoft,
                  color: THEME.blue,
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <button
                onClick={() => {
                  const event = events.find(e => e.id === selectedEvent.id);
                  if (event) {
                    openCreateModal(event.start, event.start.getHours(), event.start.getMinutes(), event);
                    setSelectedEvent(null);
                  }
                }}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: "linear-gradient(135deg, #0d9488, #2563eb)",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  boxShadow: "0 2px 8px rgba(91,130,168,0.25)",
                  letterSpacing: 0.3,
                }}
              >
                <span>◫</span>
                Duplica
              </button>
            </div>

            <div style={{ marginBottom: 20, border: `1.5px solid ${THEME.border}`, padding: 16, borderRadius: 8, background: THEME.panelSoft }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft, marginBottom: 12 }}>
                Modifica Data e Orario
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 8 }}>
                    Data
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelBg,
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 8 }}>
                    Orario Inizio
                  </label>
                  <select
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelBg,
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    {timeSelectSlots.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 8 }}>
                    Durata
                  </label>
                  <select
                    value={editDuration}
                    onChange={(e) => setEditDuration(e.target.value as "1" | "1.5" | "2")}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelBg,
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    <option value="1">1 ora</option>
                    <option value="1.5">1.5 ore</option>
                    <option value="2">2 ore</option>
                  </select>
                </div>
              </div>
              
              <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 600, marginTop: 8 }}>
                Nuovo orario: {editDate && editStartTime ? 
                  `${editDate.split('-').reverse().join('/')} alle ${editStartTime}` : 
                  "Seleziona data e orario"}
              </div>
            </div>

            <div style={{ marginBottom: 20, border: `1.5px solid ${THEME.border}`, padding: 16, borderRadius: 8, background: THEME.panelSoft }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft, marginBottom: 12 }}>
                Trattamento e Prezzo
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 8 }}>
                    Trattamento
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {ALL_TREATMENTS.map(t => (
                      <button key={t.value} onClick={() => setEditTreatmentType(t.value as TreatmentType)}
                        style={{
                          padding: "7px 12px", borderRadius: 7, cursor: "pointer", fontWeight: 700,
                          fontSize: 12, border: `2px solid ${editTreatmentType === t.value ? t.color : THEME.borderSoft}`,
                          background: editTreatmentType === t.value ? t.color : "#fff",
                          color: editTreatmentType === t.value ? "#fff" : THEME.text,
                          transition: "all 0.15s",
                        }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 8 }}>
                    Fatturazione
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setEditPriceType("invoiced")}
                      style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: `1px solid ${editPriceType === "invoiced" ? THEME.greenDark : THEME.borderSoft}`,
                        background: editPriceType === "invoiced" ? THEME.green : "#fff",
                        color: editPriceType === "invoiced" ? "#fff" : THEME.text,
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      Fatturato
                    </button>
                    <button
                      onClick={() => setEditPriceType("cash")}
                      style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: `1px solid ${editPriceType === "cash" ? THEME.amber : THEME.borderSoft}`,
                        background: editPriceType === "cash" ? "rgba(245,158,11,0.1)" : "#fff",
                        color: editPriceType === "cash" ? THEME.amber : THEME.text,
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      Contanti
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 8 }}>
                  Importo (€)
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={editAmount}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9.,]/g, '');
                      setEditAmount(value);
                    }}
                    placeholder="Importo personalizzato(lasciare vuoto per prezzo standard)"
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.blue}`,
                      background: THEME.panelBg,
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  />
                  <button
                    onClick={() => {
                      const tType = editTreatmentType as "seduta" | "macchinario";
                      const pType = editPriceType as "invoiced" | "cash";
                      setEditAmount(getDefaultAmount(tType, pType).toString());
                    }}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelSoft,
                      color: THEME.text,
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Usa standard
                  </button>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
                  {editAmount ? `Totale: € ${parseFloat(editAmount.replace(',', '.')).toFixed(2)}` : 
                   `Prezzo standard: € ${getDefaultAmount(editTreatmentType as "seduta" | "macchinario", editPriceType as "invoiced" | "cash").toFixed(2)}`}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted }}>Colore personalizzato:</div>
                <input
                  type="color"
                  value={eventColors[selectedEvent?.patient_id || ""] || getEventColor(events.find(e => e.id === selectedEvent?.id) || { status: "booked" })}
                  onChange={(e) => {
                    if (selectedEvent?.patient_id) {
                      setEventColors(prev => ({
                        ...prev,
                        [selectedEvent.patient_id!]: e.target.value
                      }));
                    }
                  }}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    border: `1.5px solid ${THEME.border}`,
                    cursor: "pointer",
                  }}
                />
                <button
                  onClick={() => {
                    if (selectedEvent?.patient_id) {
                      setEventColors(prev => {
                        const newColors = { ...prev };
                        delete newColors[selectedEvent.patient_id!];
                        return newColors;
                      });
                    }
                  }}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: `1px solid ${THEME.borderSoft}`,
                    background: THEME.panelSoft,
                    color: THEME.text,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Reset
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: THEME.textSoft, marginBottom: 8 }}>
                  Stato
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as Status)}
                    style={{
                      width: "100%",
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 8,
                      border: `1px solid ${THEME.borderSoft}`,
                      background: THEME.panelBg,
                      color: THEME.text,
                      outline: "none",
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    <option value="booked">Prenotato</option>
                    <option value="confirmed">Confermato</option>
                    <option value="done">Eseguito</option>
                    <option value="not_paid">Non pagata</option>
                    <option value="cancelled">Annullato</option>
                  </select>
                </label>
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft, marginBottom: 8 }}>
                  Promemoria
                </div>
                <button
                  onClick={() => {
                    const event = events.find(e => e.id === selectedEvent.id);
                    if (event) {
                      sendReminder(event.id, event.patient_phone ?? undefined, event.patient_first_name ?? undefined);
                    }
                  }}
                  disabled={!events.find(e => e.id === selectedEvent.id)?.patient_phone}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: 8,
                    border: `1px solid ${THEME.greenDark}`,
                    background: "#25d366",
                    color: "#fff",
                    cursor: events.find(e => e.id === selectedEvent.id)?.patient_phone ? "pointer" : "not-allowed",
                    fontWeight: 600,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    opacity: events.find(e => e.id === selectedEvent.id)?.patient_phone ? 1 : 0.6,
                  }}
                >
                  <span>📱</span>
                  Invia promemoria WhatsApp
                </button>
              </div>
            </div>

            {/* Chiedi Recensione Google – visibile solo se stato = Eseguito */}
            {editStatus === "done" && (() => {
              const ev = events.find(e => e.id === selectedEvent.id);
              const hasPhone = !!ev?.patient_phone;
              return (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft, marginBottom: 8 }}>
                    Recensione Google
                  </div>
                  <button
                    onClick={() => {
                      if (ev) sendGoogleReview(ev.patient_phone ?? undefined, ev.patient_first_name ?? undefined);
                    }}
                    disabled={!hasPhone}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: 8,
                      border: `1px solid ${THEME.patientsAccent}`,
                      background: THEME.patientsAccent,
                      color: "#fff",
                      cursor: hasPhone ? "pointer" : "not-allowed",
                      fontWeight: 600,
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      opacity: hasPhone ? 1 : 0.6,
                    }}
                  >
                    <span>⭐</span>
                    Chiedi recensione Google
                  </button>
                  {!hasPhone && (
                    <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4, fontWeight: 600 }}>
                      Nessun numero di telefono disponibile
                    </div>
                  )}
                </div>
              );
            })()}

            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: THEME.textSoft, marginBottom: 20 }}>
              Nota
              <textarea
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                rows={4}
                style={{
                  width: "100%",
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelBg,
                  color: THEME.text,
                  outline: "none",
                  resize: "vertical",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              />
            </label>

            {/* SOAP Notes — note di seduta strutturate */}
            {selectedEvent.patient_id && (
              <div style={{ marginTop: -8, marginBottom: 20 }}>
                <SOAPNotesEditor appointmentId={selectedEvent.id} patientId={selectedEvent.patient_id} />
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
              <button
                onClick={deleteAppointment}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: `1px solid rgba(220,38,38,0.25)`,
                  background: "rgba(220,38,38,0.06)",
                  color: THEME.red,
                  cursor: "pointer",
                  fontWeight: 600,
                  minWidth: 120,
                  fontSize: 13,
                }}
              >
                Elimina
              </button>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Link
                  href={selectedEvent.patient_id ? `/patients/${selectedEvent.patient_id}` : "#"}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 8,
                    border: `1px solid ${THEME.borderSoft}`,
                    background: THEME.panelSoft,
                    color: THEME.text,
                    fontWeight: 600,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    minWidth: 170,
                    justifyContent: "center",
                    opacity: selectedEvent.patient_id ? 1 : 0.5,
                    pointerEvents: selectedEvent.patient_id ? "auto" : "none",
                    fontSize: 13,
                  }}
                >
                  Scheda paziente
                </Link>

                <button
                  onClick={saveAppointment}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 8,
                    border: `1px solid ${THEME.greenDark}`,
                    background: THEME.green,
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 600,
                    minWidth: 140,
                    fontSize: 13,
                  }}
                >
                  Salva modifiche
                </button>
              </div>
            </div>

            <div style={{ marginTop: 16, fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
              Nota: "Annullato" mantiene lo storico · "Elimina" rimuove dal DB.
            </div>
          </div>
        </div>
      )}

      {quickActionsMenu && (
        <QuickActionsMenu
          state={quickActionsMenu}
          events={events}
          onClose={() => setQuickActionsMenu(null)}
          onToggleDone={(eventId, currentStatus) => toggleDoneQuick(eventId, currentStatus)}
          onSendReminder={(eventId, phone, firstName) => sendReminder(eventId, phone, firstName)}
          onDuplicate={(event) => openCreateModal(event.start, event.start.getHours(), event.start.getMinutes(), event)}
          onCreateNew={() => openCreateModal(new Date())}
        />
      )}

      {/* Feature: Mini-scheda paziente al hover */}
      {hoverTooltip && (
        <EventHoverTooltip
          state={hoverTooltip}
          onMouseLeave={handleEventHoverEnd}
          getDefaultAmount={getDefaultAmount}
        />
      )}

      {/* Feature: Popover vista mese */}
      {monthPopover && (
        <MonthDayPopover
          state={monthPopover}
          onClose={() => setMonthPopover(null)}
          onSelectEvent={(ev) => {
            setMonthPopover(null);
            setCurrentDate(ev.start);
            setViewType("day");
          }}
        />
      )}

      {/* Feature: Riepilogo giornaliero */}
      {dailySummaryOpen && (
        <DailySummaryDialog
          summary={dailySummary}
          onClose={() => setDailySummaryOpen(false)}
        />
      )}
    </div>
  );
}