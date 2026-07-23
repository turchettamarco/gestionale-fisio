"use client";

import Link from "next/link";
import { EMPTY_CONVENZIONE, type ConvenzioneValue } from "@/src/components/convenzioni/ConvenzioneFields";
import { getStudioBranding } from "@/src/lib/studioBranding";
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
import { useCurrentStudio, useCurrentStudioId, type StudioMember } from "@/src/contexts/StudioContext";

// ─── Hook custom della pagina calendar (refactor B3.1 → B3.7) ────────────────
import {
  useCalendarBootstrap,
  useSearchAndFilters,
  useCalendarEvents,
  useReminderFlow,
  useGroupOperations,
  useDragAndDrop,
  useEventResize,
  useRealtimeCalendar,
  useAppointmentMutations,
} from "@/src/hooks/calendar";

// ─── Popover (B2.1, B2.2) ────────────────────────────────────────────────────
import EventHoverTooltip from "./components/popovers/EventHoverTooltip";
import MonthDayPopover from "./components/popovers/MonthDayPopover";
import DailySummaryDialog from "./components/popovers/DailySummaryDialog";
import QuickActionsMenu from "./components/popovers/QuickActionsMenu";

// ─── Panels (B2.3, B2.4, B2.5) ───────────────────────────────────────────────
import BookingRequestsPanel from "./components/panels/BookingRequestsPanel";
import RightSidebar from "./components/panels/RightSidebar";
import AppNavbar from "@/src/components/AppNavbar";
import FiltersPopover from "./components/panels/FiltersPopover";
import CalendarToolbar from "./components/panels/CalendarToolbar";
import OperatorLegend from "./components/OperatorLegend";
import RoomLegend from "./components/RoomLegend";

// ─── Views (B2.6, B2.7) ──────────────────────────────────────────────────────
import MonthView from "./components/views/MonthView";
import DayView from "./components/views/DayView";
import type { OperatorUnavailabilitySlot } from "./components/views/DayTimelineMulti";
import type { OperatorScheduleSlot } from "@/src/hooks/calendar/moveValidation";
import { resolvePermissions } from "@/src/lib/permissions";
import WeekView from "./components/views/WeekView";
import WeekViewTimeline from "./components/views/WeekViewTimeline";
import WeekViewPile from "./components/views/WeekViewPile";
import WeekViewGrid from "./components/views/WeekViewGrid";
import WeekViewRoster from "./components/views/WeekViewRoster";

// ─── Modals (B2.8) ───────────────────────────────────────────────────────────
import WhatsAppConfirmDialog from "./components/modals/WhatsAppConfirmDialog";
import CreateAppointmentModal from "./components/modals/CreateAppointmentModal";
import SelectedEventModal from "./components/modals/SelectedEventModal";
import { WaitlistPanel, fetchActiveWaitlistCount } from "@/src/components/waitlist/WaitlistPanel";
import { WaitlistMatchModal } from "@/src/components/waitlist/WaitlistMatchModal";
import { SlotFinderModal } from "@/src/components/waitlist/SlotFinderModal";
import { entryMatchesSlot, type WaitlistEntry } from "@/src/lib/waitlist";
import GroupEventModal from "./components/modals/GroupEventModal";
import { generateSingleCertificate } from "@/src/lib/certificateLoader";

export default function CalendarDesktopClient() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#7b8fa3", fontFamily: "Inter, -apple-system, sans-serif", fontSize: 15 }}>Caricamento calendario…</div>}>
      <CalendarPageInner />
    </Suspense>
  );
}


function CalendarPageInner() {

  // ─── Multi-operatore (mig. 019, Fase 4a/4b) ─────────────────────────────
  // Carichiamo TUTTO direttamente con query locali invece di usare il context:
  // sia il flag multi_operator_enabled che la lista membri. Il context aveva
  // race condition (i dati arrivavano dopo il primo render), e visto che qui
  // il render delle viste calendario dipende criticamente da questi dati,
  // li carichiamo "alla mano".
  const [multiOperatorEnabled, setMultiOperatorEnabled] = useState<boolean>(false);

  // Multi-stanza (mig. 019, Fase Stanze): toggle del flag e elenco stanze attive.
  const [multiRoomEnabled, setMultiRoomEnabled] = useState<boolean>(false);
  const [studioRooms, setStudioRooms] = useState<Array<{ id: string; name: string; color: string | null; treatment_types?: string[] | null }>>([]);
  const [allMembers, setAllMembers] = useState<StudioMember[]>([]);

  // Professionisti ospiti (mig. 029): toggle del flag + elenco ospiti attivi.
  // Niente login, niente RLS complessa: sono solo etichette per gli appuntamenti.
  // Nella vista giornaliera, se un ospite ha appuntamenti nel giorno corrente,
  // la timeline si splitta in due corsie (titolare + ospite).
  const [guestPractitionersEnabled, setGuestPractitionersEnabled] = useState<boolean>(false);
  const [studioGuests, setStudioGuests] = useState<Array<{
    id: string; first_name: string; last_name: string; specialty: string;
    display_color: string | null; default_room_id: string | null;
  }>>([]);
  // Layout della vista settimana scelto in Settings → Team (mig. 022).
  // Default 'classic' = WeekView con sub-colonne MGA (l'attuale 4b).
  // Senza effetto se single-op (multi off OR <2 operatori).
  const [weeklyViewLayout, setWeeklyViewLayout] = useState<"classic" | "timeline" | "pile" | "grid" | "roster">("classic");

  // Filtro operatore attivo (Fase 4b.2c). null = mostra tutti, altrimenti
  // contiene la chiave operatore (user_id o "pending:<token>" o "_unassigned_").
  // Pilotato dai chip della legenda OperatorLegend: click = attiva/disattiva.
  // Funziona in TUTTE le viste calendario (Day/Week/Month) perché filtra
  // direttamente filteredEvents.
  // Filtro operatore a selezione MULTIPLA (array vuoto = tutti). Prima era
  // singolo: o un operatore o tutti, senza vie di mezzo. Con tre o più
  // colleghi serve poter guardare due agende insieme.
  const [operatorFilter, setOperatorFilter] = useState<string[]>([]);
  const toggleOperatorFilter = useCallback((key: string | null) => {
    // null = azzera la selezione (mostra tutti)
    if (key === null) { setOperatorFilter([]); return; }
    setOperatorFilter(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }, []);


  // Filtro stanza interattivo (Fase Stanze, parallelo a operatorFilter).
  // Combinabile in AND con il filtro operatori. Valori speciali:
  //   - null: nessun filtro stanza
  //   - "_no_room_": solo eventi senza stanza assegnata
  //   - <uuid>: solo eventi con quella stanza
  const [roomFilter, setRoomFilter] = useState<string | null>(null);

  // Filtra solo i membri attivi. Includiamo anche gli inviti PENDENTI
  // (user_id NULL): li mostriamo come colonne nel calendario perché
  // l'owner potrebbe voler pianificare appuntamenti per loro PRIMA che
  // il collega si registri. Nel rendering distingueremo poi i pending
  // con un badge nell'header (vedi DayTimelineMulti).
  // Membri con agenda propria (mig. 081): colonne, legenda e selettori si
  // costruiscono solo su chi svolge sedute. La segreteria resta fuori dal
  // calendario pur potendo prenotare per gli altri.
  const activeMembers = useMemo(
    () => allMembers.filter(m => m.is_active !== false && m.shows_in_agenda !== false),
    [allMembers]
  );

  // Derivate per le viste multi-op (settimana, mese): l'ordine delle sub-colonne
  // e la mappa colore per il bordo card. Calcolate una volta sola e passate ai
  // componenti, così i componenti non devono importare gli hook context.
  //
  // PENDING INCLUSI: i membri invitati ma non ancora registrati (user_id NULL)
  // hanno una "lane key fittizia" basata su invite_token. Servono come colonne
  // visuali per ricordarsi che esistono e per pre-pianificare appuntamenti
  // (anche se in pratica gli appuntamenti possono essere assegnati solo a
  // utenti registrati con user_id valorizzato).
  const operatorOrder = useMemo<string[]>(() => {
    return activeMembers
      .map(m => m.user_id ?? (m.invite_token ? `pending:${m.invite_token}` : null))
      .filter((id): id is string => id != null);
  }, [activeMembers]);

  const operatorColorMap = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const member of activeMembers) {
      const key = member.user_id ?? (member.invite_token ? `pending:${member.invite_token}` : null);
      if (key && member.display_color) {
        m.set(key, member.display_color);
      }
    }
    return m;
  }, [activeMembers]);

  // Tappa A: mappa operator_id → sigla (signature_short) per la label
  // delle fasce di assenza nella WeekView. Solo membri registrati:
  // le assenze appartengono a user_id reali, mai ai pending.
  const operatorLabelMap = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const member of activeMembers) {
      if (!member.user_id) continue;
      m.set(
        member.user_id,
        (member.signature_short || member.display_name || "?").substring(0, 3).toUpperCase()
      );
    }
    return m;
  }, [activeMembers]);




  // Mappa room_id → color per la vista Roster (e future viste).
  // Le stanze sono caricate dallo studio corrente via useEffect più sotto.
  const roomColorMap = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const r of studioRooms) {
      if (r.color) m.set(r.id, r.color);
    }
    return m;
  }, [studioRooms]);

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
    // (slot_minutes viene letto sotto, con fallback 30)
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

  // Auto-filtro "Io" (mig. 071): chi non ha il permesso di vedere l'agenda
  // di tutti parte filtrato sulle proprie sedute — è l'unica vista che gli
  // serve, e gliela apriamo già pronta. Una volta sola, non a ogni render,
  // così resta libero di togliere il filtro.
  const autoFilterDone = useRef(false);
  useEffect(() => {
    if (autoFilterDone.current) return;
    if (!multiOperatorEnabled || !userId || activeMembers.length < 2) return;
    const me = activeMembers.find(m => m.user_id === userId);
    if (!me) return;
    autoFilterDone.current = true;
    const role = me.role as string;
    if (role === "owner" || role === "co_owner") return;
    const perms = resolvePermissions(me as never);
    if (!perms.has("agenda.view_all")) setOperatorFilter([userId]);
  }, [multiOperatorEnabled, userId, activeMembers]);


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

  // ─── Reminder flow: WhatsApp, dialog conferma, settimanale (refactor B3.4) ───
  const reminderFlow = useReminderFlow({
    events,
    setEvents,
    currentStudio,
    studioLocations,
    practiceSettings,
    setError,
  });

  const {
    showWhatsAppConfirm,
    setShowWhatsAppConfirm,
    lastCreatedAppointment,
    setLastCreatedAppointment,
    weeklyReminderTarget,
    setWeeklyReminderTarget,
    weeklyReminderTemplate,
    openWeeklyReminder,
    sendReminder,
    onSendReminderToAll,
    sendGoogleReview,
  } = reminderFlow;

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
    /** Pacchetto sedute collegato (mig. 014_packages) */
    package_id?: string | null;
  } | null>(null);

  // Deep-link da Contabilità: ?appt=<id> → apre la scheda dell'appuntamento
  // come un click normale, una volta caricati gli eventi del periodo.
  const [pendingApptId, setPendingApptId] = useState<string | null>(null);

  // ─── Group operations: partecipanti, modifica/duplica/elimina (refactor B3.5) ───
  const groupOps = useGroupOperations({
    events,
    setEvents,
    currentStudio,
    currentStudioId,
    practiceSettings,
    currentDate,
    loadAppointments,
    setSelectedEvent,
  });

  const {
    initialParticipants,
    setInitialParticipants,
    addInitialParticipant,
    removeInitialParticipant,
    reloadGroupEvent,
    onAddParticipant,
    onUpdateParticipant,
    onRemoveParticipant,
    onMarkAllPaid,
    onUpdateGroup,
    onDeleteGroup,
    onDuplicateGroup,
  } = groupOps;

  const [editStatus, setEditStatus] = useState<Status>("booked");
  const [editNote, setEditNote] = useState("");
  const [editAmount, setEditAmount] = useState<string>("");
  const [editTreatmentType, setEditTreatmentType] = useState<TreatmentType>("seduta");
  const [editPriceType, setEditPriceType] = useState<"invoiced" | "cash">("invoiced");
  
  // Stati per modifica orario e giorno
  const [editDate, setEditDate] = useState<string>("");
  const [editStartTime, setEditStartTime] = useState<string>("09:00");
  const [editDuration, setEditDuration] = useState<"0.5" | "0.75" | "1" | "1.5" | "2">("1");

  // Multi-operatore (mig. 019/022, Fase 4d.1): operator_id per il modale di
  // modifica. Null = non assegnato. Idratato da liveEvent quando il modale apre.
  const [editOperatorId, setEditOperatorId] = useState<string | null>(null);
  // Convenzioni (mig. 065): ente + autorizzazione, vuoti se il modulo è spento.
  const [editConv, setEditConv] = useState<ConvenzioneValue>(EMPTY_CONVENZIONE);
  const [createConv, setCreateConv] = useState<ConvenzioneValue>(EMPTY_CONVENZIONE);

  // Multi-stanza (mig. 019, Fase Stanze): room_id per il modale di modifica.
  // Null = nessuna stanza. Idratato da liveEvent quando il modale apre.
  const [editRoomId, setEditRoomId] = useState<string | null>(null);

  // Professionisti ospiti (mig. 029): guest_practitioner_id per il modale di
  // modifica. Idratato da liveEvent quando il modale apre. Se valorizzato,
  // l'appuntamento in modifica è di un ospite e la validazione del metodo
  // di pagamento viene saltata.
  const [editGuestPractitionerId, setEditGuestPractitionerId] = useState<string | null>(null);

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

  // Multi-operatore (mig. 019/022, Fase 4d): id dell'operatore selezionato.
  // null = non assegnato. Default null al mount; quando si apre il modale di
  // creazione lo settiamo all'utente loggato come default ragionevole (vedi
  // openCreateModal sotto).
  const [createOperatorId, setCreateOperatorId] = useState<string | null>(null);

  // Multi-stanza (mig. 019, Fase Stanze): id della stanza selezionata in
  // creazione. null = nessuna. Default null = nessuna stanza pre-selezionata.
  const [createRoomId, setCreateRoomId] = useState<string | null>(null);

  // Professionisti ospiti (mig. 029): id dell'ospite selezionato in
  // creazione. null = appuntamento del titolare (default). Quando valoriz-
  // zato, l'appuntamento viene salvato con guest_practitioner_id, operator_id
  // forzato a null, e tutti i campi prezzo/pagamento azzerati.
  const [createGuestPractitionerId, setCreateGuestPractitionerId] = useState<string | null>(null);

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

  // ─── Pacchetto sedute selezionato (mig. 014_packages) ────────────────────
  // Se valorizzato, l'appuntamento da creare scalerà una seduta dal pacchetto.
  // Resettato quando si cambia paziente o si chiude il modal.
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  // initialParticipants e i suoi helper (addInitialParticipant, removeInitialParticipant)
  // sono ora in useGroupOperations.

  const [quickPatientOpen, setQuickPatientOpen] = useState(false);
  const [quickPatientFirstName, setQuickPatientFirstName] = useState("");
  const [quickPatientLastName, setQuickPatientLastName] = useState("");
  const [quickPatientPhone, setQuickPatientPhone] = useState("");
  const [creatingQuickPatient, setCreatingQuickPatient] = useState(false);

  // currentDate, setCurrentDate e l'effect di mount sono ora in useCalendarEvents.

  // ── Multi-operatore: caricamento membri + flag (mig. 019, Fase 4a/4b) ──
  // Query diretta su studio_members + studios per avere i dati immediatamente
  // disponibili al primo render. Bypassa il context per evitare race
  // condition. Si ricarica quando cambia studio_id.
  useEffect(() => {
    if (!currentStudioId) {
      setAllMembers([]);
      setMultiOperatorEnabled(false);
      setMultiRoomEnabled(false);
      setStudioRooms([]);
      setGuestPractitionersEnabled(false);
      setStudioGuests([]);
      return;
    }
    let cancelled = false;
    (async () => {
      // Query parallele: membri + flag studio + stanze + ospiti
      const [membersResult, studioResult, roomsResult, guestsResult] = await Promise.all([
        supabase
          .from("studio_members")
          .select("studio_id, user_id, role, display_name, display_color, signature_short, is_active, sort_order, email, invited_at, invite_token")
          .eq("studio_id", currentStudioId)
          .order("sort_order", { ascending: true })
          .order("display_name", { ascending: true }),
        supabase
          .from("studios")
          .select("multi_operator_enabled, multi_room_enabled, weekly_view_layout, guest_practitioners_enabled")
          .eq("id", currentStudioId)
          .maybeSingle(),
        supabase
          .from("studio_rooms")
          .select("id, name, color, is_active, sort_order, treatment_types")
          .eq("studio_id", currentStudioId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("guest_practitioners")
          .select("id, first_name, last_name, specialty, display_color, default_room_id, is_active, sort_order")
          .eq("studio_id", currentStudioId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("last_name", { ascending: true }),
      ]);

      if (cancelled) return;

      const data = membersResult.data;
      const error = membersResult.error;
      if (error || !data) {
        setAllMembers([]);
      } else {
        setAllMembers(data as StudioMember[]);
      }

      const studioData = studioResult.data;
      setMultiOperatorEnabled(Boolean(studioData?.multi_operator_enabled));
      setMultiRoomEnabled(Boolean(studioData?.multi_room_enabled));
      setGuestPractitionersEnabled(Boolean(studioData?.guest_practitioners_enabled));
      // mig. 022 + 024 — layout vista settimana (include 'roster')
      const layout = studioData?.weekly_view_layout;
      if (layout === "classic" || layout === "timeline" || layout === "pile" || layout === "grid" || layout === "roster") {
        setWeeklyViewLayout(layout);
      } else {
        setWeeklyViewLayout("classic");
      }

      // Multi-stanza (Fase Stanze): carica le stanze attive
      if (roomsResult.error || !roomsResult.data) {
        setStudioRooms([]);
      } else {
        setStudioRooms(roomsResult.data as Array<{ id: string; name: string; color: string | null }>);
      }

      // Professionisti ospiti (mig. 029): carica solo gli attivi
      if (guestsResult.error || !guestsResult.data) {
        setStudioGuests([]);
      } else {
        setStudioGuests(guestsResult.data as Array<{
          id: string; first_name: string; last_name: string; specialty: string;
          display_color: string | null; default_room_id: string | null;
        }>);
      }
    })();
    return () => { cancelled = true; };
  }, [currentStudioId]);

  // ── Multi-operatore: caricamento indisponibilità (mig. 019, Fase 5) ──
  // Range adattivo:
  //   • Vista day: 1 giorno (00:00 → 23:59 del giorno corrente)
  //   • Vista week: 7 giorni della settimana corrente
  //   • Vista month: 42 giorni della griglia mensile (mese + adiacenti)
  // Le assenze sono usate da:
  //   - DayTimelineMulti: striature grigie sulla colonna operatore
  //   - MonthView: indicatore visivo nelle celle giorno (Fase 5)
  const [unavailabilities, setUnavailabilities] = useState<OperatorUnavailabilitySlot[]>([]);
  // Tappa C: bump da realtime per rifetchare le assenze senza ricaricare la pagina.
  const [unavRefreshTick, setUnavRefreshTick] = useState(0);
  // ─── Tappa E: turni settimanali operatori (operator_schedules, mig. 022) ──
  // Erano configurabili in Impostazioni → Team ma NESSUNO li leggeva: il
  // calendario lasciava prenotare un collega part-time in un giorno in cui
  // non lavora. Qui li carichiamo e li usiamo come avviso (mai blocco).
  const [operatorSchedules, setOperatorSchedules] = useState<OperatorScheduleSlot[]>([]);
  useEffect(() => {
    if (!multiOperatorEnabled || !currentStudioId || activeMembers.length < 2) {
      setOperatorSchedules([]);
      return;
    }
    let cancelled = false;
    (async () => {
      // operator_schedules.member_id = studio_members.id, mentre
      // appointments.operator_id = user_id: serve la mappa di conversione.
      const [{ data }, { data: mem }] = await Promise.all([
        supabase
          .from("operator_schedules")
          .select("member_id, day_of_week, start_time, end_time")
          .eq("studio_id", currentStudioId),
        supabase
          .from("studio_members")
          .select("id, user_id")
          .eq("studio_id", currentStudioId),
      ]);
      if (cancelled || !data) return;
      const byMember = new Map<string, string>();
      for (const m of (mem ?? []) as Array<{ id: string; user_id: string | null }>) {
        if (m.user_id) byMember.set(m.id, m.user_id);
      }
      setOperatorSchedules(
        (data as Array<{ member_id: string; day_of_week: number; start_time: string; end_time: string }>)
          .flatMap(r => {
            const uid = byMember.get(r.member_id);
            return uid ? [{ operator_id: uid, day_of_week: r.day_of_week, start_time: r.start_time, end_time: r.end_time }] : [];
          })
      );
    })();
    return () => { cancelled = true; };
  }, [multiOperatorEnabled, currentStudioId, activeMembers]);

  useEffect(() => {
    if (!multiOperatorEnabled || activeMembers.length < 2) {
      setUnavailabilities([]);
      return;
    }
    if (!currentStudioId) return;

    let cancelled = false;
    (async () => {
      // Calcola range in base alla vista corrente
      let rangeStart: Date, rangeEnd: Date;
      if (viewType === "week") {
        rangeStart = startOfISOWeekMonday(currentDate);
        rangeEnd = addDays(rangeStart, 7);
      } else if (viewType === "month") {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        rangeStart = addDays(firstDay, -startOffset);
        rangeEnd = addDays(rangeStart, 42);
      } else {
        // day view
        rangeStart = new Date(currentDate);
        rangeStart.setHours(0, 0, 0, 0);
        rangeEnd = new Date(currentDate);
        rangeEnd.setHours(23, 59, 59, 999);
      }

      const { data, error } = await supabase
        .from("operator_unavailability")
        .select("id, operator_id, start_at, end_at, reason, all_day")
        .eq("studio_id", currentStudioId)
        .lt("start_at", rangeEnd.toISOString())
        .gt("end_at", rangeStart.toISOString());

      if (cancelled) return;
      if (error) {
        setUnavailabilities([]);
        return;
      }
      setUnavailabilities((data ?? []).map(r => ({
        id: r.id as string,
        operator_id: r.operator_id as string,
        start_at: new Date(r.start_at as string),
        end_at: new Date(r.end_at as string),
        reason: (r.reason as string | null) ?? null,
        all_day: Boolean(r.all_day),
      })));
    })();
    return () => { cancelled = true; };
  }, [multiOperatorEnabled, activeMembers.length, currentStudioId, currentDate, viewType, unavRefreshTick]);

  // ── Gestione parametri URL da GlobalSearch (?date=YYYY-MM-DD&view=day) ─────
  useEffect(() => {
    if (!clientReady) return;
    const dateStr = params.get("date");
    const view    = params.get("view");
    const appt    = params.get("appt");
    if (!dateStr && !view && !appt) return;

    if (appt) setPendingApptId(appt);

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
      url.searchParams.delete("appt");
      window.history.replaceState({}, "", url.toString());
    }
  }, [clientReady]);

  // weeklyExpectedRevenue, viewType e l'effect loadPeriodStats sono ora in useCalendarEvents.

  // draggingEvent, draggingOver, dragGhostPos: ora in useDragAndDrop.

  // Overlap warning
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);

  // Recurring frequency (every N weeks)
  const [recurringFrequency, setRecurringFrequency] = useState<1 | 2 | 3 | 4>(1);

  // Treatment type colors
  const TREATMENT_COLORS: Record<string, string> = {
    seduta: "#2563eb",       // blu ardesia smorzato
    macchinario: "#7c3aed",  // viola smorzato
  };

  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  // filtersExpanded, filtersPopoverOpen, calendarSearch, calendarSearchOpen,
  // isSearchActive, searchMatchIds: ora in useSearchAndFilters.

  // dailySummary è ora in useCalendarEvents.

  // Feature: Hover tooltip per mini-scheda paziente
  const [hoverTooltip, setHoverTooltip] = useState<{
    event: CalendarEvent;
    x: number;
    y: number;
  } | null>(null);
  const hoverTimer = useRef<any>(null);

  // ─── Drag and drop appuntamenti tra slot (refactor B3.6) ─────────────────
  const dnd = useDragAndDrop({
    currentDate,
    loadAppointments,
    setError,
    setHoverTooltip,
    hoverTimer,
    // Tappa A: conflict check al drop (operatore/stanza/assenze),
    // rispettando practice_settings.overlap_mode.
    events,
    overlapMode: ((practiceSettings?.overlap_mode as "warn" | "block" | "visual" | undefined) ?? "warn"),
    multiOperatorEnabled,
    multiRoomEnabled,
    unavailabilities,
    schedules: operatorSchedules,
  });

  // ─── Tappa B: resize durata (handle sul bordo inferiore delle card) ─────
  const eventResize = useEventResize({
    currentDate,
    loadAppointments,
    setError,
    events,
    // slotMin (state) è dichiarato più sotto: qui leggiamo direttamente
    // la preferenza dello studio per evitare TDZ.
    slotMinutes: ((currentStudio as { slot_minutes?: number } | null)?.slot_minutes === 15 ? 15 : 30),
    overlapMode: ((practiceSettings?.overlap_mode as "warn" | "block" | "visual" | undefined) ?? "warn"),
    multiOperatorEnabled,
    multiRoomEnabled,
    unavailabilities,
    schedules: operatorSchedules,
  });

  // ─── Tappa C: realtime agenda ───────────────────────────────────────────
  // Ricarica la finestra ATTUALMENTE visibile (stessa logica dell'auto-fetch
  // per vista) in modalità silent = niente spinner.
  const reloadVisibleWindow = useCallback(() => {
    let rangeStart: Date, rangeEnd: Date;
    if (viewType === "week") {
      rangeStart = startOfISOWeekMonday(currentDate);
      rangeEnd = addDays(rangeStart, 7);
    } else if (viewType === "month") {
      const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
      rangeStart = addDays(firstDay, -startOffset);
      rangeEnd = addDays(rangeStart, 42);
    } else {
      rangeStart = new Date(currentDate); rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = new Date(currentDate); rangeEnd.setHours(23, 59, 59, 999);
    }
    setUnavRefreshTick(t => t + 1); // rifetch assenze operatore
    return loadAppointments(rangeStart, rangeEnd, 0, true);
  }, [viewType, currentDate, loadAppointments]);

  const realtime = useRealtimeCalendar({
    studioId: currentStudioId ?? null,
    reload: reloadVisibleWindow,
  });

  // ─── Tappa B: modalità colonne della vista giorno multi (Operatori/Stanze) ─
  const [dayColumnsMode, setDayColumnsMode] = useState<"operators" | "rooms">(() => {
    if (typeof window === "undefined") return "operators";
    return window.localStorage.getItem("fisiohub_day_columns_mode") === "rooms" ? "rooms" : "operators";
  });
  const handleDayColumnsModeChange = useCallback((m: "operators" | "rooms") => {
    setDayColumnsMode(m);
    try { window.localStorage.setItem("fisiohub_day_columns_mode", m); } catch { /* noop */ }
  }, []);

  const {
    draggingEvent,
    setDraggingEvent,
    draggingOver,
    setDraggingOver,
    dragGhostPos,
    setDragGhostPos,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDropAssign,
    handleDragEnd,
  } = dnd;

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

  // showWhatsAppConfirm, lastCreatedAppointment, weeklyReminderTarget,
  // openWeeklyReminder: ora in useReminderFlow.


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
  // Granularità agenda (30/15): impostazione di studio, persistita su DB.
  const [slotMin, setSlotMin] = useState(30);
  useEffect(() => {
    setSlotMin(((currentStudio as { slot_minutes?: number } | null)?.slot_minutes) ?? 30);
  }, [currentStudio]);
  const saveSlotMin = useCallback(async (v: 15 | 30) => {
    setSlotMin(v);
    if (currentStudioId) {
      await supabase.from("studios").update({ slot_minutes: v }).eq("id", currentStudioId);
    }
  }, [currentStudioId]);

  const timeSelectSlots = useMemo(() => {
    const slots = [];
    const mins = slotMin === 15 ? [0, 15, 30, 45] : [0, 30];
    for (let hour = gridHourRange.start; hour < gridHourRange.end; hour++) {
      for (const minute of mins) {
        slots.push(`${pad2(hour)}:${pad2(minute)}`);
      }
    }
    // Aggiungi anche l'ora finale esatta (es. "22:00") per permettere di
    // selezionare l'ultimo slot del giorno
    slots.push(`${pad2(gridHourRange.end)}:00`);
    return slots;
  }, [gridHourRange, slotMin]);

  // Funzioni di navigazione, weekOptions, getAvailabilityForecast, getFreeWindows
  // sono ora in useCalendarEvents.

  const openCreateModal = useCallback((date: Date, hour: number = 9, minute: number = 0, duplicateEvent?: CalendarEvent) => {
    setCreateConv(EMPTY_CONVENZIONE); // ogni creazione riparte da privato
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
      // Multi-op: copia operator_id dall'evento da duplicare (se presente)
      setCreateOperatorId(duplicateEvent.operator_id ?? null);
      // Multi-stanza: copia room_id dall'evento
      setCreateRoomId(duplicateEvent.room_id ?? null);
      // Ospiti (mig. 029): copia guest_practitioner_id dall'evento duplicato
      setCreateGuestPractitionerId(duplicateEvent.guest_practitioner_id ?? null);
    } else {
      setDuplicateMode(false);
      setEventToDuplicate(null);
      setSelectedPatient(null);
      setCreateLocation("studio");
      setCreateClinicSite(currentStudio?.name || "Studio");
      setCreateDomicileAddress("");
      // Multi-op: di default assegna all'utente loggato (Marco). L'utente
      // può poi cambiare in modal. Funziona anche in single-op (campo nascosto).
      setCreateOperatorId(userId ?? null);
      // Multi-stanza: default nessuna stanza pre-selezionata
      setCreateRoomId(null);
      // Ospiti (mig. 029): default è il titolare (Studio). L'utente sceglie
      // l'ospite dal selettore "Per chi?" in cima al modale.
      setCreateGuestPractitionerId(null);
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

    // Reset pacchetto selezionato (mig. 014_packages)
    setSelectedPackageId(null);

    setQuickPatientFirstName("");
    setQuickPatientLastName("");
    setQuickPatientPhone("");

    setShowWhatsAppConfirm(false);
    setLastCreatedAppointment(null);

    setError("");
    setCreateOpen(true);
  }, [selectedStartTime, selectedDuration, timeSelectSlots, patientResults, practiceSettings, currentStudio?.name, treatmentCatalog, userId]);

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

    // Step 3bis: filtro sede specifica (Tappa A, multi-sede).
    // Gli appuntamenti a domicilio o legacy hanno location_id NULL e
    // vengono esclusi quando si filtra per una sede precisa.
    if (filters.locationId !== "all") {
      result = result.filter(e => e.location_id === filters.locationId);
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

    // Step 7: filtro operatore (Fase 4b.2c)
    // Quando operatorFilter è valorizzato, mostra solo gli appuntamenti di
    // quell'operatore. Il valore "_unassigned_" filtra gli eventi orfani
    // (operator_id NULL). Funziona trasversalmente a tutte le viste.
    if (operatorFilter.length > 0) {
      result = result.filter(e =>
        operatorFilter.includes(e.operator_id ?? "_unassigned_")
      );
    }

    // Step 8: filtro stanza (Fase Stanze)
    // Additivo (AND) col filtro operatore. Valore speciale "_no_room_"
    // filtra solo eventi senza stanza.
    if (roomFilter !== null) {
      if (roomFilter === "_no_room_") {
        result = result.filter(e => !e.room_id);
      } else {
        result = result.filter(e => e.room_id === roomFilter);
      }
    }

    // Step 9: ESCLUDI appuntamenti dei professionisti ospiti (mig. 029)
    // Gli appt ospite NON entrano in filteredEvents. Quindi non figurano
    // nella vista settimana, mese, sidebar destra, conteggi €/non pagati,
    // banner statistiche. Vengono trattati a parte SOLO nella vista giorno
    // (vedi dayGuestEvents qui sotto) e mostrati nella colonna split destra.
    result = result.filter(e => !e.guest_practitioner_id);

    return result;
  }, [events, viewType, currentDate, statusFilter, filters, operatorFilter, roomFilter]);

  // dayGuestEvents (mig. 029): SOLO gli appt ospite del giorno corrente.
  // Usati esclusivamente per popolare la colonna destra dello split in vista
  // giorno. Non sono soggetti ai filtri (statusFilter, location, treatment,
  // ecc.) perché sono "appt di Gerardi" e i filtri sono pensati per i tuoi.
  const dayGuestEvents = useMemo(() => {
    if (viewType !== "day") return [];
    return events.filter(e =>
      !!e.guest_practitioner_id &&
      e.start.getDate() === currentDate.getDate() &&
      e.start.getMonth() === currentDate.getMonth() &&
      e.start.getFullYear() === currentDate.getFullYear()
    );
  }, [events, viewType, currentDate]);

  // weeklyReminderTemplate: ora in useReminderFlow.

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

  // sendReminder: ora in useReminderFlow.


  // ═══════════════════════════════════════════════════════════════════
  // ── HANDLERS APPUNTAMENTI DI GRUPPO (mig. 014) ──────────────────────
  // ═══════════════════════════════════════════════════════════════════

  /** Ricerca pazienti per il GroupEventModal (search inline) */
  // groupSearchPatients: ora in useSearchAndFilters.

  // reloadGroupEvent, onAddParticipant, onUpdateParticipant, onRemoveParticipant,
  // onMarkAllPaid, onUpdateGroup, onDeleteGroup, onDuplicateGroup:
  // ora in useGroupOperations.


  /** Invia promemoria WhatsApp a tutti i partecipanti (1 messaggio per paziente) */
  // onSendReminderToAll: ora in useReminderFlow.


  // ── Chiedi Recensione Google via WhatsApp ──────────────────────────
  // sendGoogleReview: ora in useReminderFlow.

  // toggleBulkSelect: ora in useSearchAndFilters.


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

  // ─── Tappa B: click su slot della vista multi con preselezione ─────────
  // Cliccando uno slot nella colonna di un collega (o di una stanza in
  // modalità colonne=Stanze), il modale di creazione parte già con
  // operatore/stanza preselezionati.
  // NB: prima questa callback non veniva passata a DayView → il fallback
  // ignorava l'operatorId (gap sistemato in Tappa B).
  // ─── Terapista di riferimento (mig. 078) ──────────────────────────────
  // Scegliendo un paziente che ha un terapista di riferimento, l'operatore
  // dell'appuntamento si imposta da solo. Resta modificabile a mano: è un
  // valore predefinito, non un vincolo.
  const selectPatientForCreate = useCallback((p: PatientLite | null) => {
    setSelectedPatient(p);
    if (!multiOperatorEnabled) return;
    const ref = p?.referent_operator_id ?? null;
    if (ref && activeMembers.some(m => m.user_id === ref)) {
      setCreateOperatorId(ref);
    }
  }, [multiOperatorEnabled, activeMembers, setSelectedPatient]);

  const handleSlotClickMulti = useCallback(
    (date: Date, hour: number, minute: number, operatorId: string | null, roomId?: string | null) => {
      openCreateModal(date, hour, minute);
      setCreateOperatorId(operatorId && !operatorId.startsWith("pending:") ? operatorId : null);
      if (roomId !== undefined) setCreateRoomId(roomId);
    },
    [openCreateModal]
  );

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

  // Handler riusabile per "click su evento → apri modale dettaglio".
  // Estratto come useCallback per essere passato a viste diverse (WeekView,
  // WeekViewTimeline, ecc.) senza duplicazione.
  const handleSelectEventForModal = useCallback((event: CalendarEvent) => {
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
      package_id: event.package_id ?? null,
    });
    setEditStatus(event.status);
    setEditNote(event.calendar_note || "");
    setEditAmount(event.amount !== undefined && event.amount !== null ? event.amount.toString() : "");
    setEditTreatmentType((event.treatment_type as "seduta" | "macchinario") || "seduta");
        setEditConv({
          enteId: event.convenzione_ente_id ?? "",
          authCode: event.convenzione_auth_code ?? "",
          authExpires: event.convenzione_auth_expires ?? "",
        });
    setEditPriceType((event.price_type as "invoiced" | "cash") || "invoiced");
    setEditPaymentMethod((event.payment_method as "cash" | "pos" | "bank_transfer" | null) || null);
    // Multi-op (Fase 4d.1): idrata operator_id dall'evento
    setEditOperatorId(event.operator_id ?? null);
    // Multi-stanza (Fase Stanze): idrata room_id dall'evento
    setEditRoomId(event.room_id ?? null);
    // Ospiti (mig. 029): idrata guest_practitioner_id dall'evento
    setEditGuestPractitionerId(event.guest_practitioner_id ?? null);
    if (event.patient_id) loadPatientFromEvent(event.patient_id);
  }, [setSelectedEvent, setEditStatus, setEditNote, setEditAmount, setEditTreatmentType, setEditPriceType, setEditPaymentMethod, loadPatientFromEvent]);

  // ── Tasto rapido stato/pagamento (Fase 4b.2b) ─────────────────────────
  // Usato nelle viste multi-op (Pile, prossimamente Grid). Implementa il
  // ciclo:
  //   confirmed → done+paid → done+not_paid → confirmed → ...
  //   booked → confirmed (primo click sblocca il ciclo)
  //   cancelled → confirmed (riapre)
  // Quando si segna pagato, il payment_method viene scelto in base a price_type:
  //   - cash → 'cash'
  //   - invoiced → 'pos' (default standard del modale)
  // Eseguito (done+paid) include paid_at = NOW().
  const cycleEventStatus = useCallback(async (event: CalendarEvent) => {
    const isPaid = event.is_paid === true;
    const status = event.status;

    let payload: Record<string, unknown>;

    if (status === "booked") {
      // Sblocca: passa a confirmed
      payload = { status: "confirmed" };
    } else if (status === "cancelled") {
      // Riapre cancellato
      payload = { status: "confirmed", is_paid: false, paid_at: null, payment_method: null };
    } else if (status === "confirmed") {
      // Confirmed → done + paid
      const method = event.price_type === "cash" ? "cash" : "pos";
      payload = {
        status: "done",
        is_paid: true,
        paid_at: new Date().toISOString(),
        payment_method: method,
      };
    } else if (status === "done" && isPaid) {
      // Done+paid → done+non pagato (lo "annulla pagamento")
      payload = {
        status: "done",
        is_paid: false,
        paid_at: null,
        payment_method: null,
      };
    } else if (status === "done" && !isPaid) {
      // Done+non pagato → confirmed (chiude il ciclo, riapre per modifiche)
      payload = {
        status: "confirmed",
        is_paid: false,
        paid_at: null,
        payment_method: null,
      };
    } else if (status === "not_paid") {
      // Stato legacy "da pagare": lo trattiamo come done+not_paid per il ciclo
      payload = {
        status: "confirmed",
        is_paid: false,
        paid_at: null,
        payment_method: null,
      };
    } else {
      return;
    }

    const { error } = await supabase
      .from("appointments")
      .update(payload)
      .eq("id", event.id);
    if (error) {
      console.error("cycleEventStatus error:", error);
      alert("Errore aggiornamento: " + error.message);
      return;
    }
    // Ricarica la settimana corrente per riflettere il nuovo stato
    const startOfWeek = startOfISOWeekMonday(currentDate);
    const endOfWeek = addDays(startOfWeek, 7);
    await loadAppointments(startOfWeek, endOfWeek);
  }, [currentDate, loadAppointments]);

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

  // ─── Mutazioni appuntamenti: create/save/delete + toggle + bulk + quick patient ───
  // (refactor B3.7, ultimo hook). Composito: legge i form state via closure
  // raggruppata in createForm/editForm/quickPatientForm.
  const mutations = useAppointmentMutations({
    createForm: {
      createStartISO,
      createEndISO,
      createLocation,
      createClinicSite,
      createDomicileAddress,
      createLocationId,
      treatmentType,
      priceType,
      paymentMethod,
      customAmount,
      useCustomPrice,
      isRecurring,
      recurringDays,
      recurringUntil,
      recurringFrequency,
      isGroupAppointment,
      groupTitle,
      groupMaxParticipants,
      groupPricePerPerson,
      groupRecurringMode,
      selectedPackageId,
      createOperatorId,
      createRoomId,
      createGuestPractitionerId,
      createConvenzioneEnteId: createConv.enteId || null,
      createConvenzioneAuthCode: createConv.authCode || null,
      createConvenzioneAuthExpires: createConv.authExpires || null,
    },
    editForm: {
      editStatus,
      editNote,
      editAmount,
      editTreatmentType,
      editPriceType,
      editPaymentMethod,
      editDate,
      editStartTime,
      editDuration,
      editOperatorId,
      editRoomId,
      editGuestPractitionerId,
      editConvenzioneEnteId: editConv.enteId || null,
      editConvenzioneAuthCode: editConv.authCode || null,
      editConvenzioneAuthExpires: editConv.authExpires || null,
    },
    quickPatientForm: {
      quickPatientFirstName,
      quickPatientLastName,
      quickPatientPhone,
    },
    setCreateOpen,
    setCreating,
    setQuickPatientOpen,
    setQuickPatientFirstName,
    setQuickPatientLastName,
    setQuickPatientPhone,
    setCreatingQuickPatient,
    selectedPatient,
    setSelectedPatient,
    setPatientResults,
    selectedEvent,
    setSelectedEvent,
    bulkSelected,
    setBulkSelected,
    setBulkMode,
    initialParticipants,
    setInitialParticipants,
    setSelectedPackageId,
    currentStudio,
    currentStudioId,
    studioLocations,
    practiceSettings,
    getDefaultAmount,
    treatmentCatalog,
    setError,
    currentDate,
    loadAppointments,
    checkOverlap,
  });

  const {
    createAppointment,
    saveAppointment,
    deleteAppointment,
    toggleDoneQuick,
    togglePaidQuick,
    handleUpdatePayment,
    bulkMarkPaid,
    createQuickPatient,
    createQuickPatientCore,
  } = mutations;

  // ── Lista d'attesa ──────────────────────────────────────────────────
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistCount, setWaitlistCount] = useState(0);
  const [matchSlot, setMatchSlot] = useState<Date | null>(null);
  const [matchDuration, setMatchDuration] = useState<number | null>(null);
  const [finderOpen, setFinderOpen] = useState(false);
  const [finderEntry, setFinderEntry] = useState<WaitlistEntry | null>(null);
  // Prenotazione da lista d'attesa: la voce va chiusa SOLO se l'appuntamento
  // viene davvero creato → dopo la create verifichiamo su DB che esista.
  const pendingBookRef = useRef<{ entryId: string; patientId: string; startISO: string } | null>(null);
  const [matchEntries, setMatchEntries] = useState<WaitlistEntry[]>([]);

  const refreshWaitlistCount = useCallback(async () => {
    if (!currentStudioId) return;
    try { setWaitlistCount(await fetchActiveWaitlistCount(currentStudioId)); }
    catch { /* silenzioso */ }
  }, [currentStudioId]);

  useEffect(() => { void refreshWaitlistCount(); }, [refreshWaitlistCount]);

  // Cerca in lista d'attesa i pazienti compatibili con lo slot liberato
  // e, se ce ne sono, apre il modale di proposta.
  const openWaitlistMatchesForSlot = useCallback(async (slotStart: Date, durationMin?: number | null) => {
    if (!currentStudioId) return;
    const { data: rows } = await supabase
      .from("waitlist_entries")
      .select("*, patients(first_name, last_name, phone)")
      .eq("studio_id", currentStudioId)
      .in("status", ["active", "notified"]);

    const entries = (rows as unknown as WaitlistEntry[]) || [];
    const matches = entries.filter((e) => entryMatchesSlot(e, slotStart, durationMin ?? null));
    if (matches.length > 0) {
      setMatchSlot(slotStart);
      setMatchDuration(durationMin ?? null);
      setMatchEntries(matches);
    }
  }, [currentStudioId]);

  // Elimina l'appuntamento e, se lo slot combacia con voci in lista
  // d'attesa, propone i pazienti compatibili.
  const handleDeleteWithWaitlist = useCallback(async () => {
    // Snapshot PRIMA della delete (deleteAppointment azzera selectedEvent)
    const snap = selectedEvent
      ? {
          id: selectedEvent.id,
          start: selectedEvent.start as Date,
          durationMin: selectedEvent.end
            ? Math.round(((selectedEvent.end as Date).getTime() - (selectedEvent.start as Date).getTime()) / 60000)
            : null,
        }
      : null;

    await deleteAppointment();

    if (!snap || !currentStudioId) return;
    // Verifica che sia stata davvero eliminata (deleteAppointment ha conferma interna)
    const { data: still } = await supabase
      .from("appointments")
      .select("id")
      .eq("id", snap.id)
      .maybeSingle();
    if (still) return; // annullata dall'utente o non eliminata

    await openWaitlistMatchesForSlot(snap.start, snap.durationMin);
  }, [selectedEvent, deleteAppointment, currentStudioId, openWaitlistMatchesForSlot]);

  // Salva l'appuntamento e, se lo stato è appena passato ad "Annullato",
  // propone lo slot liberato ai pazienti in lista d'attesa.
  const handleSaveWithWaitlist = useCallback(async () => {
    const prev = selectedEvent
      ? {
          id: selectedEvent.id,
          start: selectedEvent.start as Date,
          status: (selectedEvent as { status?: string }).status,
          durationMin: selectedEvent.end
            ? Math.round(((selectedEvent.end as Date).getTime() - (selectedEvent.start as Date).getTime()) / 60000)
            : null,
        }
      : null;

    await saveAppointment();

    if (!prev || !currentStudioId || prev.status === "cancelled") return;
    const { data: row } = await supabase
      .from("appointments")
      .select("status")
      .eq("id", prev.id)
      .maybeSingle();
    if ((row as { status?: string } | null)?.status !== "cancelled") return;

    await openWaitlistMatchesForSlot(prev.start, prev.durationMin);
  }, [selectedEvent, saveAppointment, currentStudioId, openWaitlistMatchesForSlot]);

  // ── Prenota da lista d'attesa: apre la creazione precompilata ──────────
  // (paziente, data, ora, durata). La voce diventa "booked" solo dopo che
  // l'appuntamento risulta creato su DB (verifica in settleWaitlistBooking).
  const DUR_TO_SELECT: Record<number, "0.5" | "0.75" | "1" | "1.5" | "2"> = { 15: "0.5", 30: "0.5", 45: "0.75", 60: "1", 90: "1.5", 120: "2" };
  const bookEntryInSlot = useCallback((entry: WaitlistEntry, slotStart: Date) => {
    setMatchSlot(null); setMatchEntries([]);
    setFinderOpen(false); setFinderEntry(null);
    setWaitlistOpen(false);
    const dur = entry.duration_min ?? 60;
    openCreateModal(slotStart, slotStart.getHours(), slotStart.getMinutes());
    setSelectedDuration(DUR_TO_SELECT[dur] ?? "1");
    const p = entry.patients;
    setSelectedPatient({
      id: entry.patient_id,
      first_name: p?.first_name ?? null,
      last_name: p?.last_name ?? null,
      phone: p?.phone ?? null,
    } as never);
    pendingBookRef.current = {
      entryId: entry.id,
      patientId: entry.patient_id,
      startISO: new Date(slotStart).toISOString(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCreateModal, setSelectedDuration, setSelectedPatient]);

  const settleWaitlistBooking = useCallback(async () => {
    const pend = pendingBookRef.current;
    if (!pend || !currentStudioId) return;
    pendingBookRef.current = null;
    const { data } = await supabase
      .from("appointments")
      .select("id")
      .eq("studio_id", currentStudioId)
      .eq("patient_id", pend.patientId)
      .eq("start_at", pend.startISO)
      .limit(1);
    if (data && data.length > 0) {
      await supabase.from("waitlist_entries")
        .update({ status: "booked", updated_at: new Date().toISOString() })
        .eq("id", pend.entryId);
      void refreshWaitlistCount();
    }
  }, [currentStudioId, refreshWaitlistCount]);

  // Slot scelto dal "Trova buco" generico → creazione precompilata
  const pickFreeSlot = useCallback((start: Date, durationMin: number) => {
    setFinderOpen(false); setFinderEntry(null);
    openCreateModal(start, start.getHours(), start.getMinutes());
    setSelectedDuration(DUR_TO_SELECT[durationMin] ?? "1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCreateModal, setSelectedDuration]);

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



  // Handler completo per il PaidIconButton/PaidPill: scrive is_paid + paid_at +
  // payment_method tutti insieme, in modo coerente con il CHECK constraint
  // (mig. 010) e con l'invariante "non fatturato = sempre contante" (mig. 011,
  // garantita anche dal trigger DB).


  // ─── Quick patient per gruppo (nuovo, mig. 015) ───────────────────
  // Usato sia in fase di creazione gruppo (CreateAppointmentModal con
  // isGroupAppointment=true) sia in aggiunta partecipanti a gruppo
  // esistente (GroupEventModal). Crea il paziente con tenancy e lo
  // restituisce; il chiamante decide cosa farne (aggiungerlo a
  // initialParticipants oppure invocare onAddParticipant).




  const printCalendar = useCallback(() => {
    exportToPDF();
  }, [exportToPDF]);

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

  // handleDragStart, handleDragOver, handleDragLeave, handleDrop, handleDragEnd:
  // ora in useDragAndDrop.


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
        setEditConv({
          enteId: event.convenzione_ente_id ?? "",
          authCode: event.convenzione_auth_code ?? "",
          authExpires: event.convenzione_auth_expires ?? "",
        });
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

  // Deep-link ?appt=<id>: appena gli eventi del periodo sono caricati e
  // contengono l'appuntamento, lo apriamo come un click normale.
  useEffect(() => {
    if (!pendingApptId) return;
    const ev = events.find(e => e.id === pendingApptId);
    if (!ev) return; // eventi del periodo non ancora caricati: riprova al prossimo cambio
    setCurrentDate(new Date(ev.start));
    setViewType("day");
    handleSelectEventForModal(ev);
    setPendingApptId(null);
  }, [pendingApptId, events, handleSelectEventForModal]);

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
      <AppNavbar
        active="calendar"
        onNotificationAppointmentClick={(apptId) => {
          // Salta alla data dell'appuntamento dentro il calendario.
          const ev = events.find(e => e.id === apptId);
          if (ev?.start) {
            setCurrentDate(new Date(ev.start));
            setViewType("day");
          }
        }}
        bookingSection={{
          enabled: currentStudio?.show_booking_bell_calendar === true,
          pendingCount: bookingRequests.filter(r => r.status === "pending").length,
          onOpenPanel: () => setBookingPanel(v => !v),
        }}
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
            package_id: appointment.package_id ?? null,
          });
          setEditStatus(appointment.status);
          setEditNote(appointment.calendar_note || "");
          setEditAmount(appointment.amount !== undefined && appointment.amount !== null ? appointment.amount.toString() : "");
          setEditTreatmentType((appointment.treatment_type as "seduta" | "macchinario") || "seduta");
          setEditConv({
            enteId: (appointment as { convenzione_ente_id?: string | null }).convenzione_ente_id ?? "",
            authCode: (appointment as { convenzione_auth_code?: string | null }).convenzione_auth_code ?? "",
            authExpires: (appointment as { convenzione_auth_expires?: string | null }).convenzione_auth_expires ?? "",
          });
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

          {/* ── Tappa C: indicatore realtime ──────────────────────────
              Discreto, in linea con la regola UI: nessun bordo colorato,
              solo un dot + testo secondario. */}
          {realtime.status !== "off" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              margin: "0 0 8px", fontSize: 11, fontWeight: 600,
              color: realtime.status === "error" ? "#b45309" : "#94a3b8",
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: realtime.status === "live"
                  ? (realtime.syncing ? "#0ea5e9" : "#10b981")
                  : realtime.status === "error" ? "#f59e0b" : "#cbd5e1",
                transition: "background 0.2s",
              }} />
              {realtime.status === "live" && (realtime.syncing
                ? "Aggiornamento in corso…"
                : realtime.lastSyncAt
                  ? `Agenda sincronizzata alle ${realtime.lastSyncAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
                  : "Agenda in tempo reale")}
              {realtime.status === "connecting" && "Connessione in corso…"}
              {realtime.status === "error" && "Sincronizzazione non attiva — ricarica la pagina"}
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
              studioLocations={studioLocations}
              multiLocationEnabled={!!currentStudio?.multi_location_enabled}
            />
          )}

          {/* ── TOOLBAR settimana / mese / giorno ── */}
          <CalendarToolbar
            slotMinutes={slotMin}
            onSlotMinutes={saveSlotMin}
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
            onPrintCalendar={printCalendar}
            onExportToPDF={exportToPDF}
            onExportToGoogleCalendar={exportToGoogleCalendar}
            bulkMode={bulkMode}
            setBulkMode={setBulkMode}
            bulkSelected={bulkSelected}
            setBulkSelected={setBulkSelected}
            onBulkMarkPaid={bulkMarkPaid}
            showAllUpcoming={showAllUpcoming}
            onCreateNew={() => openCreateModal(new Date())}
          />

          {/* ── Legenda operatori (Fase 4b.2b/c) ──────────────────────
              Visibile in tutte le viste quando lo studio è multi-op.
              Da 4b.2c agisce anche da FILTRO interattivo: click su un
              chip filtra il calendario per quell'operatore. */}
          {multiOperatorEnabled && activeMembers.length >= 2 && (
            <OperatorLegend
              members={activeMembers}
              operatorColorMap={operatorColorMap}
              showUnassigned={events.some(ev => !ev.operator_id)}
              selectedKeys={operatorFilter}
              onToggleKey={toggleOperatorFilter}
              currentUserId={userId}
            />
          )}

          {/* Legenda stanze (Fase Stanze) — visibile se multi-stanza attivo
              e ci sono stanze configurate. Indipendente dal multi-operatore.
              Click su un chip filtra il calendario per quella stanza. */}
          {multiRoomEnabled && studioRooms.length > 0 && (
            <RoomLegend
              rooms={studioRooms}
              selectedRoomId={roomFilter}
              onSelectRoomId={setRoomFilter}
              showUnassigned={events.some(ev => !ev.room_id)}
            />
          )}

          {viewType === "week" ? (
            // ━━━ WEEK VIEW — branching multi-op layout (mig. 022) ━━━
            // Single-op (multi off OR <2 operatori) → sempre WeekView classica.
            // Multi-op + layout 'timeline' → WeekViewTimeline (Approccio A).
            // Multi-op + layout 'pile' → WeekViewPile (Approccio C).
            // Multi-op + layout 'grid' → WeekViewGrid (Approccio D).
            (multiOperatorEnabled && activeMembers.length >= 2 && weeklyViewLayout === "timeline") ? (
              <WeekViewTimeline
                weekDays={weekDays}
                filteredEvents={filteredEvents}
                currentTime={currentTime}
                members={activeMembers}
                operatorColorMap={operatorColorMap}
                onCreateForOperatorAndDay={(date) => {
                  handleSlotClick(date, date.getHours(), date.getMinutes());
                }}
                onSelectEvent={handleSelectEventForModal}
                onSendReminder={sendReminder}
              />
            ) : (multiOperatorEnabled && activeMembers.length >= 2 && weeklyViewLayout === "pile") ? (
              <WeekViewPile
                weekDays={weekDays}
                filteredEvents={filteredEvents}
                currentTime={currentTime}
                members={activeMembers}
                operatorColorMap={operatorColorMap}
                onCreateForDay={(date) => {
                  handleSlotClick(date, 9, 0);
                }}
                onSelectEvent={handleSelectEventForModal}
                onCycleStatus={cycleEventStatus}
                onSendReminder={sendReminder}
              />
            ) : (multiOperatorEnabled && activeMembers.length >= 2 && weeklyViewLayout === "grid") ? (
              <WeekViewGrid
                weekDays={weekDays}
                filteredEvents={filteredEvents}
                currentTime={currentTime}
                gridStartHour={gridHourRange.start}
                gridEndHour={gridHourRange.end}
                members={activeMembers}
                operatorColorMap={operatorColorMap}
                onSlotClick={handleSlotClick}
                onSelectEvent={handleSelectEventForModal}
              />
            ) : (multiOperatorEnabled && activeMembers.length >= 2 && weeklyViewLayout === "roster") ? (
              <WeekViewRoster
                weekDays={weekDays}
                filteredEvents={filteredEvents}
                currentTime={currentTime}
                members={activeMembers}
                operatorColorMap={operatorColorMap}
                gridStartHour={gridHourRange.start}
                gridEndHour={gridHourRange.end}
                onCreateForOperatorAndSlot={(date, hour, opId) => {
                  // Pre-set createOperatorId, poi delega a handleSlotClick
                  setCreateOperatorId(opId);
                  handleSlotClick(date, hour, 0);
                }}
                onSelectEvent={handleSelectEventForModal}
                onCycleStatus={cycleEventStatus}
                onSendReminder={sendReminder}
                roomColorMap={roomColorMap}
              />
            ) : (
            <WeekView
              slotMinutes={slotMin}
              weekDays={weekDays}
              filteredEvents={filteredEvents}
              currentTime={currentTime}
              timeSlots={timeSlots}
              dayLabels={dayLabels}
              TIME_COL={TIME_COL}
              gridStartHour={gridHourRange.start}
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
              onSelectEvent={handleSelectEventForModal}
              onToggleBulkSelect={toggleBulkSelect}
              onToggleDone={toggleDoneQuick}
              onTogglePaid={togglePaidQuick}
              onUpdatePayment={handleUpdatePayment}
              onSendReminder={sendReminder}
              multiOperatorMode={multiOperatorEnabled && activeMembers.length >= 2}
              operatorOrder={operatorOrder}
              operatorColorMap={operatorColorMap}
              unavailabilities={unavailabilities}
              operatorLabelMap={operatorLabelMap}
              onResizeStart={eventResize.startResize}
              resizePreview={eventResize.resizePreview}
            />
            )
          ) : viewType === "month" ? (
            /* ━━━ MONTH VIEW — COMPACT (multi-op variante A: micro-bar, Fase 4c) ━━━ */
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
              multiOperatorMode={multiOperatorEnabled && activeMembers.length >= 2}
              members={activeMembers}
              operatorColorMap={operatorColorMap}
              unavailabilities={unavailabilities}
              onSendReminder={sendReminder}
            />
          ) : (
            /* ━━━ DAY VIEW — timeline + sidebar ━━━ */
            <DayView
              slotMinutes={slotMin}
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
              dayGuestEvents={
                dayGuestEvents
                  .filter(ev => ev.status !== "cancelled")
                  .sort((a, b) => a.start.getTime() - b.start.getTime())
              }
              currentTime={currentTime}
              multiOperatorMode={multiOperatorEnabled && activeMembers.length >= 2}
              members={activeMembers}
              roomColorMap={roomColorMap}
              unavailabilities={unavailabilities}
              guestPractitioners={guestPractitionersEnabled ? studioGuests : undefined}
              timeSlots={timeSlots}
              dayLabels={dayLabels}
              TIME_COL={TIME_COL}
              gridStartHour={gridHourRange.start}
              studioLocations={studioLocations}
              draggingOver={draggingOver}
              showAvailableOnly={showAvailableOnly}
              bulkMode={bulkMode}
              bulkSelected={bulkSelected}
              searchMatchIds={searchMatchIds}
              onSlotClick={handleSlotClick}
              onSlotClickMulti={handleSlotClickMulti}
              columnMode={multiRoomEnabled && studioRooms.length > 0 ? dayColumnsMode : "operators"}
              onColumnModeChange={multiRoomEnabled && studioRooms.length > 0 ? handleDayColumnsModeChange : undefined}
              rooms={studioRooms}
              onDropAssign={handleDropAssign}
              onResizeStart={eventResize.startResize}
              resizePreview={eventResize.resizePreview}
              operatorSchedules={operatorSchedules}
              visibleOperatorKeys={operatorFilter}
              onSlotClickGuest={(date, hour, minute, guestId) => {
                // Click sulla colonna ospite (mig. 029): apro prima il modale
                // (che resetta gli state al loro default), poi sovrascrivo
                // createGuestPractitionerId. setState in React è async ma
                // batched: entrambi i setState eseguiti nello stesso event
                // handler vengono applicati prima del prossimo render.
                handleSlotClick(date, hour, minute);
                setCreateGuestPractitionerId(guestId);
              }}
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
                  package_id: event.package_id ?? null,
                });
                setEditStatus(event.status);
                setEditNote(event.calendar_note || "");
                setEditAmount(event.amount !== undefined && event.amount !== null ? event.amount.toString() : "");
                setEditTreatmentType((event.treatment_type as "seduta" | "macchinario") || "seduta");
        setEditConv({
          enteId: event.convenzione_ente_id ?? "",
          authCode: event.convenzione_auth_code ?? "",
          authExpires: event.convenzione_auth_expires ?? "",
        });
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

      {/* Rivoluzione UX (mig. 029): il calendario titolare non crea più
          appuntamenti per gli ospiti. Quelli si creano dalla loro sezione
          /ospiti/[id]. Quindi passiamo guestPractitionersEnabled=false per
          nascondere il selettore "Per chi è l'appuntamento?". */}
      {createOpen && (
        <CreateAppointmentModal
          duplicateMode={duplicateMode}
          onClose={() => { setCreateOpen(false); setInitialParticipants([]); setSelectedPackageId(null); }}
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
          createConv={createConv}
          setCreateConv={setCreateConv}
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
          setSelectedPatient={selectPatientForCreate}
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
          selectedPackageId={selectedPackageId}
          setSelectedPackageId={setSelectedPackageId}
          multiOperatorEnabled={multiOperatorEnabled && activeMembers.length >= 2}
          members={activeMembers}
          createOperatorId={createOperatorId}
          setCreateOperatorId={setCreateOperatorId}
          existingEvents={events}
          unavailabilities={unavailabilities}
          operatorSchedules={operatorSchedules}
          multiRoomEnabled={multiRoomEnabled && studioRooms.length > 0}
          rooms={studioRooms}
          createRoomId={createRoomId}
          setCreateRoomId={setCreateRoomId}
          guestPractitionersEnabled={false}
          guestPractitioners={undefined}
          createGuestPractitionerId={null}
          setCreateGuestPractitionerId={() => {}}
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
            await settleWaitlistBooking();
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
          editConv={editConv}
          setEditConv={setEditConv}
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
          onSave={handleSaveWithWaitlist}
          onDelete={handleDeleteWithWaitlist}
          onGenerateCertificate={async () => {
            if (!selectedEvent.patient_id || !selectedEvent.start) {
              setError("Impossibile generare attestato: paziente o data mancanti.");
              return;
            }
            try {
              await generateSingleCertificate({
                patientId: selectedEvent.patient_id,
                appointmentDate: selectedEvent.start,
                treatmentLabel:
                  selectedEvent.treatment_type === "macchinario"
                    ? "Seduta strumentale"
                    : "Seduta di fisioterapia",
              });
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Errore generazione attestato";
              setError(msg);
            }
          }}
          onSendReminder={sendReminder}
          onSendGoogleReview={sendGoogleReview}
          onSendWeeklyReminder={(patientId, firstName, phone) => {
            setSelectedEvent(null);
            openWeeklyReminder(patientId, firstName, phone);
          }}
          multiOperatorEnabled={multiOperatorEnabled && activeMembers.length >= 2}
          members={activeMembers}
          editOperatorId={editOperatorId}
          setEditOperatorId={setEditOperatorId}
          multiRoomEnabled={multiRoomEnabled && studioRooms.length > 0}
          rooms={studioRooms}
          editRoomId={editRoomId}
          setEditRoomId={setEditRoomId}
          unavailabilities={unavailabilities}
          operatorSchedules={operatorSchedules}
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
        signatureName={getStudioBranding(currentStudio).signatureName}
        signatureTitle={getStudioBranding(currentStudio).signatureTitle}
      />

      {/* Feature: Lista d'attesa */}
      <button
        onClick={() => { setFinderEntry(null); setFinderOpen(true); }}
        title="Cerca i migliori slot liberi nei prossimi giorni"
        style={{
          position: "fixed", right: 22, bottom: 74, zIndex: 180,
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "11px 17px", borderRadius: 999, border: "1.5px solid #cbd5e1",
          background: "#fff", color: "#0f172a", fontWeight: 800, fontSize: 13,
          cursor: "pointer", fontFamily: "inherit",
          boxShadow: "0 8px 24px rgba(15,23,42,0.14)",
        }}
      >
        🔍 Trova buco
      </button>

      <button
        onClick={() => setWaitlistOpen(true)}
        title="Lista d'attesa"
        style={{
          position: "fixed", right: 22, bottom: 22, zIndex: 180,
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "12px 18px", borderRadius: 999, border: "none",
          background: "linear-gradient(135deg, #0d9488, #2563eb)",
          color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer",
          fontFamily: "inherit", boxShadow: "0 8px 24px rgba(37,99,235,0.35)",
        }}
      >
        ⏰ Lista d&apos;attesa
        {waitlistCount > 0 && (
          <span style={{
            background: "#fff", color: "#0d9488", borderRadius: 999,
            fontSize: 11, fontWeight: 900, padding: "1px 8px", minWidth: 20, textAlign: "center",
          }}>{waitlistCount}</span>
        )}
      </button>

      <WaitlistPanel
        members={activeMembers.map(m => ({ user_id: m.user_id, display_name: m.display_name }))}
        multiOperatorEnabled={multiOperatorEnabled}
        open={waitlistOpen}
        onClose={() => setWaitlistOpen(false)}
        onFindSlot={(e) => { setWaitlistOpen(false); setFinderEntry(e); setFinderOpen(true); }}
        studioId={currentStudioId ?? ""}
        onChanged={setWaitlistCount}
      />

      {matchSlot && (
        <WaitlistMatchModal
          slotStart={matchSlot}
          slotDurationMin={matchDuration}
          matches={matchEntries}
          studioName={currentStudio?.name ?? null}
          onClose={() => { setMatchSlot(null); setMatchDuration(null); setMatchEntries([]); }}
          onOpenPanel={() => setWaitlistOpen(true)}
          onChanged={refreshWaitlistCount}
          onBook={bookEntryInSlot}
        />
      )}

      <SlotFinderModal
        open={finderOpen}
        onClose={() => { setFinderOpen(false); setFinderEntry(null); }}
        studioId={currentStudioId || ""}
        slotMinutes={slotMin}
        entry={finderEntry}
        onPickSlot={pickFreeSlot}
        onPickForEntry={(entry, start) => bookEntryInSlot(entry, start)}
      />
    </div>
  );
}