"use client";

import Link from "next/link";
import { BuildInfo } from "@/src/components/BuildInfo";
import WeeklyReminderDialog from "@/src/components/WeeklyReminderDialog";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { translateError } from "@/src/lib/translateError";
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
  AppointmentParticipant,
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

// ─── Hook custom della pagina calendar (refactor B3.1, B3.2, B3.3) ───────────
import {
  useCalendarBootstrap,
  useSearchAndFilters,
  useCalendarEvents,
} from "@/src/hooks/calendar";

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
import SelectedEventModal from "./components/modals/SelectedEventModal";
import GroupEventModal from "./components/modals/GroupEventModal";

export default function CalendarPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#7b8fa3", fontFamily: "Inter, -apple-system, sans-serif", fontSize: 15 }}>Caricamento calendario…</div>}>
      <CalendarPageInner />
    </Suspense>
  );
}


function CalendarPageInner() {

  // ─── Bootstrap: utente, studio, settings, catalogo, orari, viewport ──────
  // Tutta la logica di setup è estratta in useCalendarBootstrap (refactor B3.1).
  // La callback onTabletDetected viene definita più sotto, dopo la
  // dichiarazione di setViewType (lo state vive ancora qui in pagina).
  const bootstrap = useCalendarBootstrap({
    onTabletDetected: () => {
      // setViewType è dichiarato più avanti nel componente.
      // Il reference è stabile (è un dispatcher React) quindi possiamo
      // usarlo dentro questa closure: alla prima invocazione del listener
      // la pagina è già montata con setViewType inizializzato.
      setViewType((prev) => (prev === "week" ? "day" : prev));
    },
  });

  const {
    // Studio
    currentStudio,
    currentStudioId,
    studioLocations,
    // User
    userEmail,
    userId,
    userLabel,
    userInitials,
    userMenuOpen,
    setUserMenuOpen,
    userMenuRef,
    handleLogout,
    // Practice settings
    practiceSettings,
    setPracticeSettings,
    practiceSettingsLoaded,
    loadPracticeSettings,
    // Treatment catalog
    treatmentCatalog,
    setTreatmentCatalogState,
    // Working hours + grid
    workingHours,
    setWorkingHours,
    gridHourRange,
    // Pricing helper
    getDefaultAmount,
    // Tempo + idratazione + viewport
    currentTime,
    setCurrentTime,
    clientReady,
    setClientReady,
    isDesktop,
    isTablet,
    TIME_COL,
  } = bootstrap;

  const params = useSearchParams();

  // ─── Stati di base necessari a useSearchAndFilters ──────────────────────
  // Questi state sono dichiarati qui (più in alto rispetto al codice
  // originale) per essere disponibili come dipendenze dell'hook
  // useSearchAndFilters. Erano sparsi a riga ~200/520.
  const [createOpen, setCreateOpen] = useState(false);
  const [createStartISO, setCreateStartISO] = useState<string>("");
  const [createEndISO, setCreateEndISO] = useState<string>("");

  const [duplicateMode, setDuplicateMode] = useState(false);
  const [eventToDuplicate, setEventToDuplicate] =
    useState<CalendarEvent | null>(null);
  const [duplicateDate, setDuplicateDate] = useState<string>("");
  const [duplicateTime, setDuplicateTime] = useState<string>("09:00");

  // ─── Calendar events: fetch, navigazione, booking (refactor B3.3) ───────
  const eventsApi = useCalendarEvents({
    clientReady,
    workingHours,
    currentStudio,
    currentStudioId,
  });

  const {
    events,
    setEvents,
    loading,
    setLoading,
    error,
    setError,
    currentDate,
    setCurrentDate,
    viewType,
    setViewType,
    loadAppointments,
    weeklyExpectedRevenue,
    goToPreviousWeek,
    goToNextWeek,
    goToToday,
    gotoWeekStart,
    goToPreviousMonth,
    goToNextMonth,
    weekOptions,
    weekDays,
    monthDays,
    getAvailabilityForecast,
    getFreeWindows,
    dailySummary,
    bookingRequests,
    setBookingRequests,
    bookingPanel,
    setBookingPanel,
    bookingLoading,
    setBookingLoading,
    bookingActionId,
    setBookingActionId,
    loadBookingRequests,
    confirmBooking,
    rejectBooking,
    reopenBooking,
  } = eventsApi;

  // ─── Search & filters (refactor B3.2) ───────────────────────────────────
  const searchAndFilters = useSearchAndFilters({
    events,
    createOpen,
    duplicateMode,
    setError,
  });

  const {
    // Ricerca paziente create
    q,
    setQ,
    searching,
    setSearching,
    patientResults,
    setPatientResults,
    selectedPatient,
    setSelectedPatient,
    searchPatients,
    // Ricerca gruppo
    groupSearchPatients,
    // Ricerca calendario
    calendarSearch,
    setCalendarSearch,
    calendarSearchOpen,
    setCalendarSearchOpen,
    isSearchActive,
    searchMatchIds,
    // Filtri UI
    filtersExpanded,
    setFiltersExpanded,
    filtersPopoverOpen,
    setFiltersPopoverOpen,
    // Filtri valori
    filters,
    setFilters,
    statusFilter,
    setStatusFilter,
    showAvailableOnly,
    setShowAvailableOnly,
    // Bulk
    bulkMode,
    setBulkMode,
    bulkSelected,
    setBulkSelected,
    toggleBulkSelect,
  } = searchAndFilters;

  // Chiudi sidebar con ESC (sidebarOpen vive in pagina, non nel bootstrap).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);



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
  const [editDuration, setEditDuration] = useState<"0.5" | "0.75" | "1" | "1.5" | "2">("1");

  // createOpen, createStartISO, createEndISO: dichiarati più in alto.
  // q, searching, patientResults, selectedPatient: ora in useSearchAndFilters.
  const [creating, setCreating] = useState(false);

  const [createLocation, setCreateLocation] = useState<LocationType>("studio");
  // Default = nome dello studio corrente (multi-tenancy). Aggiornato dall'effect sotto.
  const [createClinicSite, setCreateClinicSite] = useState("");
  const [createDomicileAddress, setCreateDomicileAddress] = useState("");
  // Multi-sede (mig. 014, fase 2): id della sede selezionata. null = sede principale
  // o multi-sede non attivo (in quel caso il salvataggio non scrive location_id).
  const [createLocationId, setCreateLocationId] = useState<string | null>(null);

  // Sincronizza il default del campo "sede" con il nome dello studio corrente
  // (l'utente può comunque sovrascriverlo manualmente nel form di creazione).
  useEffect(() => {
    if (currentStudio?.name && !createClinicSite) {
      setCreateClinicSite(currentStudio.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStudio?.name]);

  // Quando arrivano le sedi (o cambia la sede principale), aggiorna il default
  // del dropdown "Sede" nel modale Crea: parte sempre dalla principale.
  useEffect(() => {
    if (!studioLocations || studioLocations.length === 0) return;
    if (createLocationId) return;  // L'utente ha già scelto qualcosa
    const primary = studioLocations.find(l => l.is_primary) ?? studioLocations[0];
    if (primary) {
      setCreateLocationId(primary.id);
      // Allinea anche il campo legacy clinic_site col nome della principale
      setCreateClinicSite(primary.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioLocations]);


  const [treatmentType, setTreatmentType] = useState<TreatmentType>("seduta");
  const [priceType, setPriceType] = useState<"invoiced" | "cash">("cash"); // default: non fatturato
  // Metodo pagamento — usato solo quando priceType === "invoiced".
  // Default null (l'utente DEVE scegliere prima di salvare se fatturato).
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "pos" | "bank_transfer" | null>(null);
  const [editPaymentMethod, setEditPaymentMethod] = useState<"cash" | "pos" | "bank_transfer" | null>(null);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [useCustomPrice, setUseCustomPrice] = useState(false);

  const computedDefaultAmount = useMemo(() => {
    return getDefaultAmount(treatmentType, priceType);
  }, [getDefaultAmount, treatmentType, priceType]);

  const [selectedStartTime, setSelectedStartTime] = useState<string>("09:00");
  const [selectedDuration, setSelectedDuration] = useState<"0.5" | "0.75" | "1" | "1.5" | "2">("1");

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [recurringUntil, setRecurringUntil] = useState<string>("");

  // ─── Appuntamento di gruppo (mig. 014) ────────────────────────────────────
  const [isGroupAppointment, setIsGroupAppointment]               = useState(false);
  const [groupTitle, setGroupTitle]                               = useState("");
  const [groupMaxParticipants, setGroupMaxParticipants]           = useState<string>("6");
  const [groupPricePerPerson, setGroupPricePerPerson]             = useState<string>("15.00");
  /** Modalità gruppo ricorrente: closed=replica i pazienti su tutte le occorrenze, open=lascia vuoto */
  const [groupRecurringMode, setGroupRecurringMode]               = useState<"closed" | "open">("closed");

  // ─── Partecipanti iniziali per nuovo gruppo (mig. 014, step 6.1) ───
  // Lista dei pazienti selezionati DURANTE la creazione del gruppo.
  // Vengono inseriti tutti insieme dopo l'INSERT del padre.
  const [initialParticipants, setInitialParticipants] = useState<
    Array<{ id: string; first_name: string | null; last_name: string | null; phone?: string | null }>
  >([]);
  const addInitialParticipant = useCallback(
    (p: { id: string; first_name: string | null; last_name: string | null; phone?: string | null }) => {
      setInitialParticipants(prev => prev.find(x => x.id === p.id) ? prev : [...prev, p]);
    },
    []
  );
  const removeInitialParticipant = useCallback((patientId: string) => {
    setInitialParticipants(prev => prev.filter(p => p.id !== patientId));
  }, []);

  const [quickPatientOpen, setQuickPatientOpen] = useState(false);
  const [quickPatientFirstName, setQuickPatientFirstName] = useState("");
  const [quickPatientLastName, setQuickPatientLastName] = useState("");
  const [quickPatientPhone, setQuickPatientPhone] = useState("");
  const [creatingQuickPatient, setCreatingQuickPatient] = useState(false);

  // currentDate, setCurrentDate e l'effect di mount sono ora in useCalendarEvents.

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

  // weeklyExpectedRevenue, viewType e l'effect loadPeriodStats sono ora in useCalendarEvents.

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
  // filtersExpanded, filtersPopoverOpen, calendarSearch, calendarSearchOpen,
  // isSearchActive, searchMatchIds: ora in useSearchAndFilters.
  const printMenuRef = useRef<HTMLDivElement>(null);

  // dailySummary è ora in useCalendarEvents.

  // Feature: Hover tooltip per mini-scheda paziente
  const [hoverTooltip, setHoverTooltip] = useState<{
    event: CalendarEvent;
    x: number;
    y: number;
  } | null>(null);
  const hoverTimer = useRef<any>(null);

  // Feature: Riepilogo giornaliero
  const [dailySummaryOpen, setDailySummaryOpen] = useState(false);

  // bulkMode, bulkSelected: ora in useSearchAndFilters.

  // Feature: Popover vista mese
  const [monthPopover, setMonthPopover] = useState<{
    day: Date;
    events: CalendarEvent[];
    x: number;
    y: number;
  } | null>(null);

  // currentTime è ora gestito da useCalendarBootstrap.
  // statusFilter, showAvailableOnly: ora in useSearchAndFilters.

  const [showWhatsAppConfirm, setShowWhatsAppConfirm] = useState(false);
  const [lastCreatedAppointment, setLastCreatedAppointment] = useState<{
    id: string;
    patientPhone?: string | null;
    patientName?: string;
    startTime?: Date;
  } | null>(null);

  // Promemoria settimanale aggregato (1 messaggio = N appuntamenti).
  // Gli `appointments` sono PRE-CARICATI da Supabase quando si apre il dialog,
  // perché lo stato `events` del calendar contiene solo la settimana visibile.
  const [weeklyReminderTarget, setWeeklyReminderTarget] = useState<{
    patientId: string;
    patientFirstName: string;
    patientPhone: string | null;
    appointments: Array<{
      patient_id: string;
      start: Date;
      end: Date;
      status: string | null;
    }>;
  } | null>(null);

  /**
   * Carica TUTTI gli appuntamenti futuri del paziente (max 30 giorni) e
   * apre il dialog Promemoria. Usato dai 3 punti del calendar.
   */
  const openWeeklyReminder = useCallback(async (
    patientId: string,
    firstName: string,
    phone: string | null,
  ) => {
    try {
      // Da oggi 00:00 a +30 giorni (margine extra rispetto ai 15gg del dialog)
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const horizon = new Date(startOfToday);
      horizon.setDate(horizon.getDate() + 30);

      const { data, error } = await supabase
        .from("appointments")
        .select("id, start_at, end_at, status, patient_id")
        .eq("patient_id", patientId)
        .gte("start_at", startOfToday.toISOString())
        .lte("start_at", horizon.toISOString())
        .order("start_at", { ascending: true });

      if (error) {
        setError(`Errore caricamento appuntamenti: ${translateError(error)}`);
        return;
      }

      const mapped = (data ?? []).map(a => ({
        patient_id: a.patient_id as string,
        start: new Date(a.start_at as string),
        end: new Date(a.end_at as string),
        status: (a.status ?? null) as string | null,
      }));

      setWeeklyReminderTarget({
        patientId,
        patientFirstName: firstName,
        patientPhone: phone,
        appointments: mapped,
      });
    } catch (e) {
      setError(`Errore: ${translateError(e)}`);
    }
  }, []);

  // duplicateMode, eventToDuplicate, duplicateDate, duplicateTime:
  // dichiarati più in alto per essere disponibili a useSearchAndFilters.

  // Stati per le nuove funzionalità
  // filters: ora in useSearchAndFilters.

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
  // Stati booking (bookingRequests, bookingPanel, bookingLoading, bookingActionId)
  // sono ora in useCalendarEvents.

  
  // Sidebar behavior: overlay on mobile, "push content" on desktop
  const SIDEBAR_W = 300;
  // isDesktop, isTablet, TIME_COL e currentTime tick sono ora in useCalendarBootstrap.

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
    for (let hour = gridHourRange.start; hour < gridHourRange.end; hour++) {
      for (let minute of [0, 30]) {
        slots.push(`${pad2(hour)}:${pad2(minute)}`);
      }
    }
    // Aggiungi anche l'ora finale esatta (es. "22:00") per permettere di
    // selezionare l'ultimo slot del giorno
    slots.push(`${pad2(gridHourRange.end)}:00`);
    return slots;
  }, [gridHourRange]);

  // Funzioni di navigazione, weekOptions, getAvailabilityForecast, getFreeWindows
  // sono ora in useCalendarEvents.

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
      setCreateClinicSite(duplicateEvent.clinic_site || currentStudio?.name || "Studio");
      setCreateDomicileAddress(duplicateEvent.domicile_address || "");
      setTreatmentType((duplicateEvent.treatment_type as "seduta" | "macchinario") || "seduta");
      setPriceType((duplicateEvent.price_type as "invoiced" | "cash") || "invoiced");
      setPaymentMethod((duplicateEvent.payment_method as "cash" | "pos" | "bank_transfer" | null) || null);
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
      setCreateClinicSite(currentStudio?.name || "Studio");
      setCreateDomicileAddress("");
      setTreatmentType(treatmentCatalog[0]?.key ?? "seduta");
      // Default: Contanti (allineato allo state di partenza). L'utente può
      // sempre cliccare "Fatturato" se vuole. Evita l'alert spurio del metodo.
      setPriceType("cash");
      // Pagamenti (mig. 015): se non bloccante, precarica il default così
      // l'utente non deve cliccare nulla. Se bloccante, lascia null per
      // forzare la scelta consapevole.
      setPaymentMethod(
        practiceSettings?.payment_method_required === false
          ? ((practiceSettings?.default_payment_method ?? "pos") as "cash" | "pos" | "bank_transfer")
          : null
      );
      setCustomAmount("");
      setUseCustomPrice(false);
    }

    setIsRecurring(false);
    const dow = date.getDay();
    const defaultDays = dow === 0 ? [1] : [dow];
    setRecurringDays(defaultDays);
    setRecurringUntil(toDateInputValue(addWeeks(date, 4)));

    // Reset stato gruppo (mig. 014)
    setIsGroupAppointment(false);
    setGroupTitle("");
    setGroupMaxParticipants(String(practiceSettings?.default_group_max_participants ?? 6));
    setGroupPricePerPerson(
      practiceSettings?.default_group_price != null
        ? practiceSettings.default_group_price.toFixed(2)
        : "15.00"
    );
    setGroupRecurringMode("closed");

    setQuickPatientFirstName("");
    setQuickPatientLastName("");
    setQuickPatientPhone("");

    setShowWhatsAppConfirm(false);
    setLastCreatedAppointment(null);

    setError("");
    setCreateOpen(true);
  }, [selectedStartTime, selectedDuration, timeSelectSlots, patientResults, practiceSettings, currentStudio?.name, treatmentCatalog]);

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

  // weekDays è ora in useCalendarEvents.

  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = gridHourRange.start; hour < gridHourRange.end; hour++) {
      slots.push(`${pad2(hour)}:00`);
    }
    return slots;
  }, [gridHourRange]);

  const getEventPosition = useCallback((start: Date, end: Date) => {
    return getEventYPosition(start, end, 1, gridHourRange.start);
  }, [gridHourRange.start]);

  // Vista giorno: 2px per minuto → 1 ora = 120px, molto più leggibile
  const DAY_PX_PER_MIN = 1;
  const getDayEventPosition = useCallback((start: Date, end: Date) => {
    return getEventYPosition(start, end, DAY_PX_PER_MIN, gridHourRange.start);
  }, [gridHourRange.start]);

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
    // Non mostrare il tooltip durante un drag in corso (rende difficile lo spostamento)
    if (draggingEvent) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      setHoverTooltip({ event, x: e.clientX, y: e.clientY });
    }, 600);
  }, [draggingEvent]);

  const handleEventHoverEnd = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHoverTooltip(null);
  }, []);

  // Restituisce slot liberi per un giorno (usato nel modal creazione per suggerire orario).
  // Usa gli orari di lavoro del giorno_della_settimana corrispondente; fallback 8-20 se chiuso/non configurato.
  const getAvailableSlots = useCallback((day: Date) => {
    const d0 = new Date(day); d0.setHours(0,0,0,0);
    const d1 = new Date(day); d1.setHours(23,59,59,999);
    const dayEvts = events.filter(ev => ev.start >= d0 && ev.start <= d1);
    const wh = workingHours.find(w => w.day_of_week === day.getDay());
    const startH = (wh && wh.is_open) ? Number(wh.open_time.split(":")[0]) : 8;
    let endH = 20;
    if (wh && wh.is_open) {
      const [ch, cm] = wh.close_time.split(":").map(Number);
      endH = (cm && cm > 0) ? ch + 1 : ch;
    }
    return getAvailableSlotsInDay(day, dayEvts, startH, endH);
  }, [events, workingHours]);

  // loadAppointments, loadRequestId e l'effect di refetch su currentDate/viewType
  // sono ora in useCalendarEvents.


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

  // Template del promemoria settimanale: viene da practice_settings, con
  // fallback al testo di default se l'utente lo ha svuotato per errore.
  const weeklyReminderTemplate = useMemo(() => {
    const fromDb = practiceSettings?.weekly_reminder_message?.trim();
    if (fromDb) return fromDb;
    return `Ciao {nome},

ti ricordo i prossimi appuntamenti:

{lista_appuntamenti}

A presto,
{firma}`;
  }, [practiceSettings]);

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
  // loadBookingRequests, confirmBooking, rejectBooking, reopenBooking sono
  // ora in useCalendarEvents (insieme agli stati booking).


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
        // Multi-sede (mig. 014, fase 2): passa l'elenco sedi così il reminder
        // può lookup l'indirizzo della sede dell'appuntamento.
        studioLocations,
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

  // ═══════════════════════════════════════════════════════════════════
  // ── HANDLERS APPUNTAMENTI DI GRUPPO (mig. 014) ──────────────────────
  // ═══════════════════════════════════════════════════════════════════

  /** Ricerca pazienti per il GroupEventModal (search inline) */
  // groupSearchPatients: ora in useSearchAndFilters.

  /** Ricarica un singolo evento gruppo (con partecipanti aggiornati) e aggiorna events[] */
  const reloadGroupEvent = useCallback(async (appointmentId: string) => {
    const { data, error } = await supabase
      .from("appointments")
      .select(`
        appointment_participants (
          id, appointment_id, patient_id, price, payment_status, payment_method, paid_at,
          attendance_status, checked_in_at, participant_notes, created_at,
          patients:patient_id ( first_name, last_name, phone )
        ),
        is_group, group_title, group_max_participants, group_price_per_person
      `)
      .eq("id", appointmentId)
      .single();
    if (error || !data) return;

    setEvents(prev => prev.map(ev => {
      if (ev.id !== appointmentId) return ev;
      const newParticipants: AppointmentParticipant[] = (data.appointment_participants ?? []).map((p: {
        id: string; appointment_id: string; patient_id: string;
        price: number | null; payment_status?: string | null;
        payment_method?: string | null; paid_at?: string | null;
        attendance_status?: string | null; checked_in_at?: string | null;
        participant_notes?: string | null; created_at?: string;
        patients?: Array<{ first_name?: string; last_name?: string; phone?: string }> | { first_name?: string; last_name?: string; phone?: string } | null;
      }) => {
        const pp = Array.isArray(p.patients) ? p.patients[0] : p.patients;
        return {
          id: p.id,
          appointment_id: p.appointment_id,
          patient_id: p.patient_id,
          price: Number(p.price ?? 0),
          payment_status: (p.payment_status === "paid" ? "paid" : "unpaid") as "paid" | "unpaid",
          payment_method: (p.payment_method ?? null) as "cash" | "pos" | "bank_transfer" | null,
          paid_at: p.paid_at ?? null,
          attendance_status: (p.attendance_status === "present" || p.attendance_status === "absent"
            ? p.attendance_status : "pending") as "pending" | "present" | "absent",
          checked_in_at: p.checked_in_at ?? null,
          participant_notes: p.participant_notes ?? null,
          created_at: p.created_at ?? new Date().toISOString(),
          patient_first_name: pp?.first_name ?? null,
          patient_last_name: pp?.last_name ?? null,
          patient_phone: pp?.phone ?? null,
        };
      });
      return {
        ...ev,
        is_group: data.is_group ?? ev.is_group,
        group_title: data.group_title ?? ev.group_title,
        group_max_participants: data.group_max_participants ?? ev.group_max_participants,
        group_price_per_person: data.group_price_per_person ?? ev.group_price_per_person,
        participants: newParticipants,
      };
    }));
  }, []);

  /** Aggiungi un paziente al gruppo (creando una riga in appointment_participants) */
  const onAddParticipant = useCallback(async (
    appointmentId: string, patientId: string, price: number,
  ) => {
    const { error } = await supabase
      .from("appointment_participants")
      .insert({
        appointment_id: appointmentId,
        patient_id: patientId,
        price,
        payment_status: "unpaid",
        attendance_status: "pending",
      });
    if (error) {
      alert("Errore aggiunta partecipante: " + error.message);
      return;
    }
    await reloadGroupEvent(appointmentId);
  }, [reloadGroupEvent]);

  /** Aggiorna campi del partecipante */
  const onUpdateParticipant = useCallback(async (
    participantId: string,
    patch: Partial<Pick<AppointmentParticipant,
      "payment_status" | "payment_method" | "attendance_status" | "price" | "participant_notes"
    >>,
  ) => {
    // Coerenza paid_at <-> payment_status (vincolo DB)
    const dbPatch: Record<string, unknown> = { ...patch };
    if (patch.payment_status === "paid") {
      dbPatch.paid_at = new Date().toISOString();
    } else if (patch.payment_status === "unpaid") {
      dbPatch.paid_at = null;
      dbPatch.payment_method = null;
    }
    if (patch.attendance_status === "present") {
      dbPatch.checked_in_at = new Date().toISOString();
    } else if (patch.attendance_status === "pending" || patch.attendance_status === "absent") {
      dbPatch.checked_in_at = null;
    }

    // Recupero appointment_id (serve per ricaricare l'evento dopo update)
    const { data: pRow } = await supabase
      .from("appointment_participants")
      .select("appointment_id")
      .eq("id", participantId)
      .single();
    const apptId = pRow?.appointment_id;

    const { error } = await supabase
      .from("appointment_participants")
      .update(dbPatch)
      .eq("id", participantId);
    if (error) {
      alert("Errore aggiornamento partecipante: " + error.message);
      return;
    }
    if (apptId) await reloadGroupEvent(apptId);
  }, [reloadGroupEvent]);

  /** Rimuovi un paziente dal gruppo */
  const onRemoveParticipant = useCallback(async (participantId: string) => {
    const { data: pRow } = await supabase
      .from("appointment_participants")
      .select("appointment_id")
      .eq("id", participantId)
      .single();
    const apptId = pRow?.appointment_id;

    const { error } = await supabase
      .from("appointment_participants")
      .delete()
      .eq("id", participantId);
    if (error) {
      alert("Errore rimozione partecipante: " + error.message);
      return;
    }
    if (apptId) await reloadGroupEvent(apptId);
  }, [reloadGroupEvent]);

  /** Segna tutti i partecipanti come pagati (bulk) */
  const onMarkAllPaid = useCallback(async (appointmentId: string) => {
    const nowISO = new Date().toISOString();
    const { error } = await supabase
      .from("appointment_participants")
      .update({
        payment_status: "paid",
        paid_at: nowISO,
        payment_method: "cash",
      })
      .eq("appointment_id", appointmentId)
      .eq("payment_status", "unpaid");
    if (error) {
      alert("Errore aggiornamento pagamenti: " + error.message);
      return;
    }
    await reloadGroupEvent(appointmentId);
  }, [reloadGroupEvent]);

  /** Modifica titolo/max/prezzo del gruppo */
  const onUpdateGroup = useCallback(async (
    appointmentId: string,
    patch: Partial<Pick<CalendarEvent,
      "group_title" | "group_max_participants" | "group_price_per_person"
    >>,
  ) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.group_title !== undefined) dbPatch.group_title = patch.group_title;
    if (patch.group_max_participants !== undefined) dbPatch.group_max_participants = patch.group_max_participants;
    if (patch.group_price_per_person !== undefined) dbPatch.group_price_per_person = patch.group_price_per_person;

    const { error } = await supabase
      .from("appointments")
      .update(dbPatch)
      .eq("id", appointmentId);
    if (error) {
      alert("Errore aggiornamento gruppo: " + error.message);
      return;
    }
    await reloadGroupEvent(appointmentId);
  }, [reloadGroupEvent]);

  /** Elimina un appuntamento di gruppo (CASCADE rimuove anche i partecipanti) */
  const onDeleteGroup = useCallback(async (appointmentId: string) => {
    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", appointmentId);
    if (error) {
      alert("Errore eliminazione gruppo: " + error.message);
      return;
    }
    setEvents(prev => prev.filter(e => e.id !== appointmentId));
    setSelectedEvent(null);
  }, []);

  /**
   * Step 6.2: duplica un gruppo esistente alla nuova data, opzionalmente
   * con i partecipanti. I partecipanti duplicati hanno:
   * - stesso patient_id e stesso price (sono dati "stampino")
   * - payment_status='unpaid', attendance_status='pending', participant_notes=null
   *   (sono stato della seduta, ricominciano da zero)
   */
  const onDuplicateGroup = useCallback(async (
    sourceAppointmentId: string,
    newStart: Date,
    withParticipants: boolean,
  ) => {
    // 1) Trova il gruppo sorgente nello state events
    const source = events.find(e => e.id === sourceAppointmentId);
    if (!source) {
      alert("Gruppo sorgente non trovato. Ricarica la pagina e riprova.");
      return;
    }
    if (!source.is_group) {
      alert("L'appuntamento sorgente non è un gruppo.");
      return;
    }

    // 2) Calcola end_at usando la stessa durata dell'originale
    const srcStart = new Date(source.start);
    const srcEnd = new Date(source.end);
    const durationMs = srcEnd.getTime() - srcStart.getTime();
    const newEnd = new Date(newStart.getTime() + durationMs);

    // 3) Recupera userId per owner_id (se non già nel session)
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      alert("Sessione scaduta. Effettua di nuovo il login.");
      return;
    }
    const studioId = currentStudioId;
    if (!studioId) {
      alert("Studio non disponibile. Ricarica la pagina.");
      return;
    }

    // 4) INSERT del nuovo gruppo (mantiene titolo/max/prezzo dell'originale)
    const { data: created, error: createErr } = await supabase
      .from("appointments")
      .insert({
        patient_id: null,
        start_at: newStart.toISOString(),
        end_at: newEnd.toISOString(),
        status: (practiceSettings?.default_appointment_status ?? "confirmed"),
        location: source.location ?? "studio",
        clinic_site: source.clinic_site ?? (currentStudio?.name || "Studio"),
        domicile_address: source.domicile_address ?? null,
        treatment_type: null,
        price_type: null,
        payment_method: null,
        amount: null,
        owner_id: userId,
        studio_id: studioId,
        is_group: true,
        group_title: source.group_title,
        group_max_participants: source.group_max_participants,
        group_price_per_person: source.group_price_per_person,
      })
      .select()
      .single();
    if (createErr || !created) {
      alert("Errore duplicazione gruppo: " + (createErr?.message || "errore sconosciuto"));
      return;
    }

    // 5) Se richiesto, INSERT batch dei partecipanti (azzerati per stato seduta)
    if (withParticipants && source.participants && source.participants.length > 0) {
      const partRows = source.participants.map(p => ({
        appointment_id: created.id,
        patient_id: p.patient_id,
        price: p.price,
        payment_status: "unpaid",
        attendance_status: "pending",
        participant_notes: null,
      }));
      const { error: partErr } = await supabase
        .from("appointment_participants")
        .insert(partRows);
      if (partErr) {
        console.error("[duplicate-group] errore partecipanti:", partErr);
        alert(
          `Gruppo duplicato, ma errore nell'aggiungere i partecipanti: ${partErr.message}\n` +
          `Puoi aggiungerli manualmente dalla scheda del nuovo gruppo.`,
        );
      }
    }

    // 6) Ricarica appuntamenti per vedere il nuovo gruppo nel calendar
    const startOfWeek = startOfISOWeekMonday(currentDate);
    const endOfWeek = addDays(startOfWeek, 7);
    await loadAppointments(startOfWeek, endOfWeek);

    // 7) Chiudi il modal corrente (sorgente) e mostra messaggio
    setSelectedEvent(null);
    const niceDate = newStart.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
    const niceTime = newStart.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    alert(`✓ Gruppo duplicato per ${niceDate} alle ${niceTime}.`);
  }, [events, currentStudioId, currentStudio, practiceSettings, currentDate, loadAppointments]);

  /** Invia promemoria WhatsApp a tutti i partecipanti (1 messaggio per paziente) */
  const onSendReminderToAll = useCallback(async (event: CalendarEvent) => {
    const participants = event.participants ?? [];
    if (participants.length === 0) {
      alert("Nessun partecipante a cui inviare il promemoria.");
      return;
    }
    const withPhone = participants.filter(p => (p.patient_phone ?? "").trim());
    if (withPhone.length === 0) {
      alert("Nessun partecipante ha un numero di telefono registrato.");
      return;
    }
    const skipped = participants.length - withPhone.length;
    const confirmMsg = `Invio promemoria WhatsApp a ${withPhone.length} partecipanti?` +
      (skipped > 0 ? `\n\n(${skipped} senza telefono verranno saltati)` : "");
    if (!window.confirm(confirmMsg)) return;

    // Apriamo le finestre WhatsApp una alla volta con piccolo delay
    // (Safari iOS può bloccare popup multipli istantanei)
    for (const p of withPhone) {
      // sendReminder vuole l'appointment_id, ma per i gruppi usiamo l'event.id
      // come riferimento: il messaggio è personalizzato per il singolo paziente.
      try {
        await sendReminder(event.id, p.patient_phone ?? undefined, p.patient_first_name ?? undefined);
        // piccola pausa tra un invio e l'altro
        await new Promise(resolve => setTimeout(resolve, 350));
      } catch (e) {
        console.error("Errore invio promemoria a " + p.patient_first_name, e);
      }
    }
  }, [sendReminder]);

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
  // toggleBulkSelect: ora in useSearchAndFilters.

  const bulkMarkPaid = useCallback(async () => {
    if (bulkSelected.size === 0) return;
    setError("");
    const ids = Array.from(bulkSelected);
    // Mantiene coerenza col CHECK constraint appointments_paid_consistency:
    // is_paid=true ↔ paid_at NOT NULL (mig. 010).
    const nowIso = new Date().toISOString();

    for (const id of ids) {
      const { error } = await supabase.from("appointments").update({ is_paid: true, paid_at: nowIso }).eq("id", id);
      if (error) {
        setError(`Errore aggiornamento: ${translateError(error)}`);
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
  // monthDays è ora in useCalendarEvents.

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

  // goToPreviousMonth e goToNextMonth sono ora in useCalendarEvents.

  // searchPatients e l'effect di debounce: ora in useSearchAndFilters.

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

    // Mantiene coerenza col CHECK constraint appointments_paid_consistency:
    // is_paid=true ↔ paid_at NOT NULL (mig. 010).
    const willBePaid = next === "done";
    const payload = willBePaid
      ? { status: next, is_paid: true,  paid_at: new Date().toISOString() }
      : { status: next, is_paid: false, paid_at: null };
    const { error } = await supabase.from("appointments").update(payload).eq("id", apptId);

    if (error) {
      setError(`Errore aggiornamento stato: ${translateError(error)}`);
      return;
    }

    const startOfWeek = startOfISOWeekMonday(currentDate);
    const endOfWeek = addDays(startOfWeek, 7);
    await loadAppointments(startOfWeek, endOfWeek);
  }, [currentDate, loadAppointments]);

  const togglePaidQuick = useCallback(async (apptId: string, currentlyPaid: boolean) => {
    setError("");
    // Mantiene coerenza col CHECK constraint appointments_paid_consistency:
    // is_paid=true ↔ paid_at NOT NULL (mig. 010).
    const willBePaid = !currentlyPaid;
    const payload = willBePaid
      ? { is_paid: true,  paid_at: new Date().toISOString() }
      : { is_paid: false, paid_at: null };
    const { error } = await supabase.from("appointments").update(payload).eq("id", apptId);
    if (error) {
      setError(`Errore aggiornamento pagamento: ${translateError(error)}`);
      return;
    }
    const startOfWeek = startOfISOWeekMonday(currentDate);
    const endOfWeek = addDays(startOfWeek, 7);
    await loadAppointments(startOfWeek, endOfWeek);
  }, [currentDate, loadAppointments]);

  // Handler completo per il PaidIconButton/PaidPill: scrive is_paid + paid_at +
  // payment_method tutti insieme, in modo coerente con il CHECK constraint
  // (mig. 010) e con l'invariante "non fatturato = sempre contante" (mig. 011,
  // garantita anche dal trigger DB).
  const handleUpdatePayment = useCallback(
    async (
      apptId: string,
      next: {
        is_paid: boolean;
        paid_at: string | null;
        payment_method: "cash" | "pos" | "bank_transfer" | null;
      }
    ) => {
      setError("");
      const payload: Record<string, unknown> = {
        is_paid: next.is_paid,
        paid_at: next.paid_at,
      };
      // payment_method va settato esplicitamente solo quando l'utente lo
      // sceglie nel popover. Se non pagato, lo azzeriamo.
      if (!next.is_paid) {
        payload.payment_method = null;
      } else if (next.payment_method) {
        payload.payment_method = next.payment_method;
      }
      const { error } = await supabase.from("appointments").update(payload).eq("id", apptId);
      if (error) {
        setError(`Errore aggiornamento pagamento: ${translateError(error)}`);
        return;
      }
      const startOfWeek = startOfISOWeekMonday(currentDate);
      const endOfWeek = addDays(startOfWeek, 7);
      await loadAppointments(startOfWeek, endOfWeek);
    },
    [currentDate, loadAppointments]
  );

  const createQuickPatient = useCallback(async () => {
    if (!quickPatientFirstName.trim() || !quickPatientLastName.trim()) {
      setError("Inserisci nome e cognome per il nuovo paziente.");
      return;
    }
    if (!currentStudioId) {
      setError("Studio non disponibile. Riprova tra un momento.");
      return;
    }

    setCreatingQuickPatient(true);
    setError("");

    try {
      // Recupera owner_id (auth user) per la multi-tenancy
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData?.user?.id;
      if (!ownerId) {
        setError("Sessione scaduta. Effettua di nuovo il login.");
        setCreatingQuickPatient(false);
        return;
      }

      const { data, error } = await supabase
        .from("patients")
        .insert({
          first_name: quickPatientFirstName.trim(),
          last_name: quickPatientLastName.trim(),
          phone: quickPatientPhone.trim() || null,
          status: "da_completare",
          owner_id: ownerId,                // multi-tenancy
          studio_id: currentStudioId,        // multi-tenancy
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
      setError(`Errore creazione paziente: ${translateError(err)}`);
    } finally {
      setCreatingQuickPatient(false);
    }
  }, [quickPatientFirstName, quickPatientLastName, quickPatientPhone, currentStudioId]);

  // ─── Quick patient per gruppo (nuovo, mig. 015) ───────────────────
  // Usato sia in fase di creazione gruppo (CreateAppointmentModal con
  // isGroupAppointment=true) sia in aggiunta partecipanti a gruppo
  // esistente (GroupEventModal). Crea il paziente con tenancy e lo
  // restituisce; il chiamante decide cosa farne (aggiungerlo a
  // initialParticipants oppure invocare onAddParticipant).
  const createQuickPatientCore = useCallback(async (
    payload: { first_name: string; last_name: string; phone: string | null }
  ): Promise<PatientLite | null> => {
    if (!currentStudioId) {
      setError("Studio non disponibile. Riprova tra un momento.");
      return null;
    }
    const { data: userData } = await supabase.auth.getUser();
    const ownerId = userData?.user?.id;
    if (!ownerId) {
      setError("Sessione scaduta. Effettua di nuovo il login.");
      return null;
    }
    try {
      const { data, error } = await supabase
        .from("patients")
        .insert({
          first_name: payload.first_name,
          last_name: payload.last_name,
          phone: payload.phone,
          status: "da_completare",
          owner_id: ownerId,
          studio_id: currentStudioId,
          created_at: new Date().toISOString(),
        })
        .select("id, first_name, last_name, phone")
        .single();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone,
      };
    } catch (err: unknown) {
      setError(`Errore creazione paziente: ${translateError(err)}`);
      return null;
    }
  }, [currentStudioId]);

  const createAppointment = useCallback(async (sendWhatsApp: boolean = false) => {
  setError("");

  // Per gli appuntamenti di gruppo, NON serve un paziente selezionato
  // (i partecipanti verranno aggiunti dopo dal SelectedEventModal).
  // Servono però titolo, max partecipanti e prezzo per persona.
  if (isGroupAppointment) {
    if (!groupTitle.trim()) {
      setError("Inserisci un titolo per il gruppo (es. \"Posturale di gruppo\").");
      return;
    }
    const maxN = parseInt(groupMaxParticipants, 10);
    if (isNaN(maxN) || maxN < 2) {
      setError("Numero massimo partecipanti non valido (minimo 2).");
      return;
    }
    const pricePP = parseFloat(groupPricePerPerson.replace(",", "."));
    if (isNaN(pricePP) || pricePP < 0) {
      setError("Prezzo per persona non valido.");
      return;
    }
  } else if (!selectedPatient) {
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
  if (isGroupAppointment) {
    // Per i gruppi, "amount" sull'appointment padre resta NULL.
    // Il totale si calcola come somma dei prezzi dei partecipanti.
    amount = null;
  } else if (useCustomPrice && customAmount !== "") {
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

  // Validazione: se fatturato, payment_method è obbligatorio SOLO se l'utente
  // ha attivato il check bloccante nelle impostazioni (default true per retro-compat).
  // Se non bloccante e l'utente non ha scelto, applichiamo automaticamente il
  // default configurato (default "pos") senza interrompere il flusso.
  // (skip per i gruppi: i pagamenti sono per singolo partecipante)
  let effectivePaymentMethod = paymentMethod;
  if (!isGroupAppointment && priceType === "invoiced" && !paymentMethod) {
    const required = practiceSettings?.payment_method_required ?? true;
    if (required) {
      alert("Seleziona il metodo di pagamento (Contanti, POS o Bonifico).");
      return;
    }
    // Non bloccante → applica il default
    effectivePaymentMethod = (practiceSettings?.default_payment_method ?? "pos") as "cash" | "pos" | "bank_transfer";
  }

  setCreating(true);

  // Per i gruppi, patient_id=null e is_group=true.
  // Il vincolo CHECK del DB richiede patient_id NULL quando is_group=TRUE.
  const basePayload = isGroupAppointment
    ? {
        patient_id: null,
        status: (practiceSettings?.default_appointment_status ?? "confirmed") as Status,
        calendar_note: null as string | null,
        location: createLocation,
        clinic_site: createLocation === "studio" ? createClinicSite.trim() : null,
        // Multi-sede (mig. 014, fase 2): scrivi location_id solo se la sede
        // è "studio" e il toggle multi-sede è ON e c'è una sede selezionata.
        // Altrimenti null → fallback alla sede principale lato lettura.
        location_id: (createLocation === "studio" && currentStudio?.multi_location_enabled && createLocationId)
          ? createLocationId : null,
        domicile_address: createLocation === "domicile" ? createDomicileAddress.trim() : null,
        treatment_type: null,
        price_type: null,
        payment_method: null,
        amount: null,
        studio_id: currentStudioId,
        // Campi gruppo (mig. 014)
        is_group: true,
        group_title: groupTitle.trim(),
        group_max_participants: parseInt(groupMaxParticipants, 10),
        group_price_per_person: parseFloat(groupPricePerPerson.replace(",", ".")),
      }
    : {
        patient_id: selectedPatient!.id,
        status: (practiceSettings?.default_appointment_status ?? "confirmed") as Status,
        calendar_note: null as string | null,
        location: createLocation,
        clinic_site: createLocation === "studio" ? createClinicSite.trim() : null,
        location_id: (createLocation === "studio" && currentStudio?.multi_location_enabled && createLocationId)
          ? createLocationId : null,
        domicile_address: createLocation === "domicile" ? createDomicileAddress.trim() : null,
        treatment_type: treatmentType,
        price_type: priceType,
        payment_method: priceType === "invoiced" ? effectivePaymentMethod : null,
        amount: amount,
        studio_id: currentStudioId,  // multi-tenancy
        is_group: false,
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

        // ─── Step 6.1: inserisci i partecipanti iniziali (se ci sono) ──
        if (isGroupAppointment && initialParticipants.length > 0 && createdAppointmentId) {
          const pricePP = parseFloat(groupPricePerPerson.replace(",", "."));
          const partRows = initialParticipants.map(p => ({
            appointment_id: createdAppointmentId,
            patient_id: p.id,
            price: isFinite(pricePP) ? pricePP : 0,
            payment_status: "unpaid",
            attendance_status: "pending",
          }));
          const { error: partErr } = await supabase
            .from("appointment_participants")
            .insert(partRows);
          if (partErr) {
            // Non blocchiamo: il gruppo è creato. Mostriamo un warning.
            console.error("[create-group] errore inserimento partecipanti:", partErr);
            alert(
              `Gruppo creato, ma c'è stato un errore nell'aggiungere i partecipanti: ${partErr.message}\n` +
              `Puoi aggiungerli manualmente dalla scheda del gruppo.`
            );
          }
        }
        
        // Per i gruppi non c'è un singolo paziente a cui inviare il WA.
        // I promemoria a tutti i partecipanti verranno inviati dopo, dal SelectedEventModal.
        if (sendWhatsApp && !isGroupAppointment && selectedPatient) {
          if (!(selectedPatient.phone || "").trim()) {
            alert("Nessun telefono registrato per questo paziente");
          } else {
            const dataRelativa = formatDateRelative(firstStart);
            const ora = fmtTime(firstStart.toISOString());
            
            let luogo = "";
            if (createLocation === 'studio') {
              luogo = currentStudio?.address ||
                      CLINIC_ADDRESSES[createClinicSite] || 
                      createClinicSite || 
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

      const { data: insertedRows, error: insErr } = await supabase
        .from("appointments")
        .insert(rows)
        .select("id, start_at");
      if (insErr) throw new Error(insErr.message);

      // ─── Step 6.1: partecipanti iniziali per gruppi ricorrenti ─────
      // Modalità "closed": replica i pazienti su TUTTE le occorrenze
      // Modalità "open": solo la prima occorrenza riceve i partecipanti
      if (isGroupAppointment && initialParticipants.length > 0 && insertedRows && insertedRows.length > 0) {
        const pricePP = parseFloat(groupPricePerPerson.replace(",", "."));
        // Ordina cronologicamente per identificare la "prima" occorrenza
        const sortedAppts = [...insertedRows].sort((a, b) =>
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
        );
        const targetAppts = groupRecurringMode === "closed"
          ? sortedAppts                          // tutti
          : sortedAppts.slice(0, 1);             // solo il primo
        const allPartRows: Array<Record<string, unknown>> = [];
        for (const a of targetAppts) {
          for (const p of initialParticipants) {
            allPartRows.push({
              appointment_id: a.id,
              patient_id: p.id,
              price: isFinite(pricePP) ? pricePP : 0,
              payment_status: "unpaid",
              attendance_status: "pending",
            });
          }
        }
        const { error: partErr } = await supabase
          .from("appointment_participants")
          .insert(allPartRows);
        if (partErr) {
          console.error("[create-group-recurring] errore inserimento partecipanti:", partErr);
          alert(
            `Gruppi creati, ma c'è stato un errore nell'aggiungere i partecipanti: ${partErr.message}\n` +
            `Puoi aggiungerli manualmente dalle schede dei gruppi.`
          );
        }
      }
      
      if (sendWhatsApp) {
        alert("Per appuntamenti ricorrenti, WhatsApp non viene inviato automaticamente per evitare troppi messaggi.");
      }
    }

    setCreateOpen(false);
    // Reset partecipanti iniziali per il prossimo gruppo (step 6.1)
    setInitialParticipants([]);
    const startOfWeek = startOfISOWeekMonday(currentDate);
    const endOfWeek = addDays(startOfWeek, 7);
    await loadAppointments(startOfWeek, endOfWeek);
    
  } catch (e: unknown) {
    setError(`Errore creazione appuntamento: ${translateError(e)}`);
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
  paymentMethod,
  useCustomPrice,
  customAmount,
  practiceSettings,
  getDefaultAmount,
  currentDate,
  loadAppointments,
  checkOverlap,
  // Gruppo (mig. 014)
  isGroupAppointment,
  groupTitle,
  groupMaxParticipants,
  groupPricePerPerson,
  groupRecurringMode,
  initialParticipants,
  currentStudio,
  currentStudioId,
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

  // Validazione: se fatturato, payment_method è obbligatorio SOLO se bloccante.
  let effectiveEditPaymentMethod = editPaymentMethod;
  if (editPriceType === "invoiced" && !editPaymentMethod) {
    const required = practiceSettings?.payment_method_required ?? true;
    if (required) {
      alert("Seleziona il metodo di pagamento (Contanti, POS o Bonifico).");
      return;
    }
    effectiveEditPaymentMethod = (practiceSettings?.default_payment_method ?? "pos") as "cash" | "pos" | "bank_transfer";
  }

  // Creiamo l'oggetto di aggiornamento.
  // is_paid segue lo stato: done => pagato, altrimenti non pagato.
  // paid_at deve essere coerente con is_paid (CHECK appointments_paid_consistency, mig. 010).
  const willBePaid = normalizedStatus === "done";
  const updateData = {
    status: normalizedStatus,
    is_paid: willBePaid,
    paid_at: willBePaid ? new Date().toISOString() : null,
    calendar_note: editNote,
    amount: amount,
    treatment_type: editTreatmentType,
    price_type: editPriceType,
    payment_method: editPriceType === "invoiced" ? effectiveEditPaymentMethod : null,
    start_at: newStartDate.toISOString(),
    end_at: newEndDate.toISOString(),
  };

  // Rimuoviamo le proprietà undefined/null
  // ECCEZIONE: payment_method e paid_at devono poter essere settati a null
  // (quando passi da "fatturato" a "contanti", devi cancellare il metodo;
  //  quando l'appuntamento non è più done, paid_at va azzerato per il CHECK)
  const cleanedData = Object.fromEntries(
    Object.entries(updateData).filter(([k, v]) => {
      if (k === "payment_method" || k === "paid_at") return v !== undefined; // null è valido
      return v !== null && v !== undefined;
    })
  );

  try {
    const { error } = await supabase
      .from("appointments")
      .update(cleanedData)
      .eq("id", selectedEvent.id);

    if (error) {
      setError(`Errore salvataggio: ${translateError(error)}`);
      return;
    }

    setSelectedEvent(null);
    const startOfWeek = startOfISOWeekMonday(currentDate);
    const endOfWeek = addDays(startOfWeek, 7);
    await loadAppointments(startOfWeek, endOfWeek);
  } catch (err: unknown) {
    setError(`Errore salvataggio: ${translateError(err)}`);
  }
}, [selectedEvent, editStatus, editNote, editAmount, editTreatmentType, editPriceType, editDate, editStartTime, editDuration, currentDate, loadAppointments]);

  const deleteAppointment = useCallback(async () => {
    if (!selectedEvent) return;

    const ok = window.confirm("Vuoi eliminare definitivamente questo appuntamento?");
    if (!ok) return;

    setError("");

    const { error } = await supabase.from("appointments").delete().eq("id", selectedEvent.id);

    if (error) {
      setError(`Errore eliminazione: ${translateError(error)}`);
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
    // Nascondi subito il tooltip — non deve interferire con il drag
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHoverTooltip(null);
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
      setError(`Errore spostamento: ${translateError(error)}`);
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
        setEditPaymentMethod((event.payment_method as "cash" | "pos" | "bank_transfer" | null) || null);
        
        // Imposta i valori per la modifica di orario e giorno
        setEditDate(toDateInputValue(event.start));
        setEditStartTime(`${pad2(event.start.getHours())}:${pad2(event.start.getMinutes())}`);
        
        const durationHours = (event.end.getTime() - event.start.getTime()) / (60 * 60000);
        if (durationHours === 0.5) setEditDuration("0.5");
        else if (durationHours === 0.75) setEditDuration("0.75");
        else if (durationHours === 1) setEditDuration("1");
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
          /* Header iPad: comprimi gap e padding nav per evitare sovrapposizioni */
          .cal-header { padding: 0 10px !important; gap: 4px !important; }
          .cal-center-row { gap: 4px !important; }
          .nav-tab-compact { gap: 0 !important; }
          .nav-tab-compact a { padding: 5px 8px !important; font-size: 11px !important; }
          .cal-print-btn { padding: 6px 8px !important; gap: 3px !important; }
          /* Card appuntamento: su iPad riduci padding/font per far stare tutto */
          .cal-event-card { padding: 6px 7px !important; }
          .cal-event-card .ev-header { font-size: 10px !important; margin-bottom: 2px !important; }
          .cal-event-card .ev-name { font-size: 12px !important; margin-bottom: 2px !important; }
          .cal-event-card .ev-meta { font-size: 10px !important; margin-bottom: 4px !important; }
          .cal-event-card .ev-actions button { font-size: 10px !important; padding: 3px 0 !important; }
          /* Vista settimana iPad: nascondi i micro-bottoni azione (resta orario+nome+status).
             I bottoni si possono usare aprendo la card o passando in vista Giorno. */
          .cal-evt-actions { display: none !important; }
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
        showBookingBell={currentStudio?.show_booking_bell_calendar === true}
        notificationsBellEnabled={currentStudio?.notify_bell_enabled !== false}
        onNotificationAppointmentClick={(apptId) => {
          // Naviga il calendario alla data dell'appuntamento.
          // Se l'appuntamento è visibile l'utente lo trova subito.
          const ev = events.find(e => e.id === apptId);
          if (ev?.start) {
            setCurrentDate(new Date(ev.start));
            // Switch a vista giorno per focus immediato
            setViewType("day");
          }
        }}
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
          setEditPaymentMethod((appointment.payment_method as "cash" | "pos" | "bank_transfer" | null) || null);
        }}
        onToggleDone={(eventId, currentStatus) => toggleDoneQuick(eventId, currentStatus)}
        onSendWeeklyReminder={(patientId, firstName, phone) => {
          openWeeklyReminder(patientId, firstName, phone);
        }}
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
              studioLocations={studioLocations}
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
        setEditPaymentMethod((event.payment_method as "cash" | "pos" | "bank_transfer" | null) || null);
                if (event.patient_id) loadPatientFromEvent(event.patient_id);
              }}
              onToggleBulkSelect={toggleBulkSelect}
              onToggleDone={toggleDoneQuick}
              onTogglePaid={togglePaidQuick}
              onUpdatePayment={handleUpdatePayment}
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
              studioLocations={studioLocations}
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
              studioLocations={studioLocations}
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
              draggingEventId={draggingEvent?.id ?? null}
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
        setEditPaymentMethod((event.payment_method as "cash" | "pos" | "bank_transfer" | null) || null);
                if (event.patient_id) loadPatientFromEvent(event.patient_id);
              }}
              onToggleBulkSelect={toggleBulkSelect}
              onToggleDone={toggleDoneQuick}
              onTogglePaid={togglePaidQuick}
              onUpdatePayment={handleUpdatePayment}
              onSendReminder={sendReminder}
              onCreateNew={() => openCreateModal(currentDate, 9, 0)}
            />
          )}
        </div>
      </main>

      {createOpen && (
        <CreateAppointmentModal
          duplicateMode={duplicateMode}
          onClose={() => { setCreateOpen(false); setInitialParticipants([]); }}
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
          studioLocations={studioLocations}
          createLocationId={createLocationId}
          setCreateLocationId={setCreateLocationId}
          multiLocationEnabled={!!currentStudio?.multi_location_enabled}
          treatmentType={treatmentType}
          setTreatmentType={setTreatmentType}
          priceType={priceType}
          setPriceType={setPriceType}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
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
          isGroupAppointment={isGroupAppointment}
          setIsGroupAppointment={setIsGroupAppointment}
          groupTitle={groupTitle}
          setGroupTitle={setGroupTitle}
          groupMaxParticipants={groupMaxParticipants}
          setGroupMaxParticipants={setGroupMaxParticipants}
          groupPricePerPerson={groupPricePerPerson}
          setGroupPricePerPerson={setGroupPricePerPerson}
          groupRecurringMode={groupRecurringMode}
          setGroupRecurringMode={setGroupRecurringMode}
          initialParticipants={initialParticipants}
          addInitialParticipant={addInitialParticipant}
          removeInitialParticipant={removeInitialParticipant}
          searchPatientsForGroup={groupSearchPatients}
          createQuickPatientForGroup={createQuickPatientCore}
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

      {selectedEvent && (() => {
        // Per i gruppi, mostriamo il GroupEventModal dedicato (mig. 014).
        // Cerchiamo l'evento "live" da events[] perché contiene i participants aggiornati.
        const liveEv = events.find(e => e.id === selectedEvent.id);
        if (liveEv?.is_group) {
          return (
            <GroupEventModal
              event={liveEv}
              searchPatients={groupSearchPatients}
              createQuickPatient={createQuickPatientCore}
              onClose={() => setSelectedEvent(null)}
              onAddParticipant={onAddParticipant}
              onUpdateParticipant={onUpdateParticipant}
              onRemoveParticipant={onRemoveParticipant}
              onMarkAllPaid={onMarkAllPaid}
              onSendReminderToAll={onSendReminderToAll}
              onDeleteGroup={onDeleteGroup}
              onUpdateGroup={onUpdateGroup}
              onDuplicateGroup={onDuplicateGroup}
            />
          );
        }
        return (
        <SelectedEventModal
          selectedEvent={selectedEvent}
          events={events}
          showAllUpcoming={showAllUpcoming}
          editStatus={editStatus}
          setEditStatus={setEditStatus}
          editNote={editNote}
          setEditNote={setEditNote}
          editAmount={editAmount}
          setEditAmount={setEditAmount}
          editTreatmentType={editTreatmentType}
          setEditTreatmentType={setEditTreatmentType}
          editPriceType={editPriceType}
          setEditPriceType={setEditPriceType}
          editPaymentMethod={editPaymentMethod}
          setEditPaymentMethod={setEditPaymentMethod}
          editDate={editDate}
          setEditDate={setEditDate}
          editStartTime={editStartTime}
          setEditStartTime={setEditStartTime}
          editDuration={editDuration}
          setEditDuration={setEditDuration}
          timeSelectSlots={timeSelectSlots}
          eventColors={eventColors}
          setEventColors={setEventColors}
          getEventColor={getEventColor}
          getDefaultAmount={getDefaultAmount}
          onClose={() => setSelectedEvent(null)}
          onDuplicate={(event) => openCreateModal(event.start, event.start.getHours(), event.start.getMinutes(), event)}
          onSave={saveAppointment}
          onDelete={deleteAppointment}
          onSendReminder={sendReminder}
          onSendGoogleReview={sendGoogleReview}
          onSendWeeklyReminder={(patientId, firstName, phone) => {
            setSelectedEvent(null);
            openWeeklyReminder(patientId, firstName, phone);
          }}
        />
        );
      })()}

      {quickActionsMenu && (
        <QuickActionsMenu
          state={quickActionsMenu}
          events={events}
          onClose={() => setQuickActionsMenu(null)}
          onToggleDone={(eventId, currentStatus) => toggleDoneQuick(eventId, currentStatus)}
          onSendReminder={(eventId, phone, firstName) => sendReminder(eventId, phone, firstName)}
          onDuplicate={(event) => openCreateModal(event.start, event.start.getHours(), event.start.getMinutes(), event)}
          onSendWeeklyReminder={(patientId, firstName, phone) => {
            openWeeklyReminder(patientId, firstName, phone);
          }}
          onCreateNew={() => openCreateModal(new Date())}
        />
      )}

      {/* Feature: Mini-scheda paziente al hover */}
      {hoverTooltip && (
        <EventHoverTooltip
          state={hoverTooltip}
          onMouseLeave={handleEventHoverEnd}
          getDefaultAmount={getDefaultAmount}
          studioLocations={studioLocations}
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

      {/* Feature: Promemoria settimanale aggregato (1 messaggio = N appt) */}
      <WeeklyReminderDialog
        open={!!weeklyReminderTarget}
        onClose={() => setWeeklyReminderTarget(null)}
        patientId={weeklyReminderTarget?.patientId ?? ""}
        patientFirstName={weeklyReminderTarget?.patientFirstName ?? ""}
        patientPhone={weeklyReminderTarget?.patientPhone ?? null}
        appointments={weeklyReminderTarget?.appointments ?? []}
        template={weeklyReminderTemplate}
        signatureName={currentStudio?.signature_name}
        signatureTitle={currentStudio?.signature_title}
      />
    </div>
  );
}