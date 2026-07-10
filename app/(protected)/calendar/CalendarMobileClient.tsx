"use client";

import Link from "next/link";
import { getStudioBranding } from "@/src/lib/studioBranding";
import { showToast } from "@/src/components/mobile/ToastProvider";
import MobileTabBar from "@/src/components/MobileTabBar";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { usePrivacyMode, composeInitials } from "@/src/contexts/PrivacyModeContext";
import { buildReminderMessage } from "./utils/reminderMessage";
import { assignLanes } from "./utils/laneAssignment";
import { getLocationCardStyle } from "./utils/locationHelpers";
import { normalizePhoneForWA } from "@/src/lib/whatsapp";
import { generateSingleCertificate } from "@/src/lib/certificateLoader";
import { SOAPNotesEditor } from "./components/SOAPNotes";
import { WaitlistPanel, fetchActiveWaitlistCount } from "@/src/components/waitlist/WaitlistPanel";
import { WaitlistMatchModal } from "@/src/components/waitlist/WaitlistMatchModal";
import { entryMatchesSlot, type WaitlistEntry } from "@/src/lib/waitlist";
import WeeklyReminderDialog from "@/src/components/WeeklyReminderDialog";
import PackagePickerSection from "@/src/components/packages/PackagePickerSection";
import PackageBadge from "@/src/components/packages/PackageBadge";
import PaidIconButton from "@/src/components/PaidIconButton";
import NotificationsBell from "@/src/components/NotificationsBell";
import type { PaymentMethod } from "@/src/components/PaidPopover";
import StatusSheet, { type StatusSheetAction } from "@/src/components/mobile/StatusSheet";
import { Icon, PulseDivider } from "@/src/components/icons";
import GroupEventModalMobile, { type GroupEvent } from "@/src/components/mobile/GroupEventModalMobile";
import {
  groupSearchPatientsApi,
  fetchGroupParticipants,
  addParticipantApi,
  updateParticipantApi,
  removeParticipantApi,
  markAllPaidApi,
  updateGroupApi,
  deleteGroupApi,
  duplicateGroupApi,
  sendReminderToAllApi,
} from "@/src/components/mobile/groupHandlers";

/**
 * Apre WhatsApp con un numero pre-popolato e un messaggio.
 *
 * Implementazione: delega a `normalizePhoneForWA` (già usato altrove)
 * che ha la pulizia più robusta — strip di TUTTI i caratteri non-numerici
 * (incluse lettere o simboli inattesi). Poi costruisce l'URL nello stesso
 * modo della vecchia openWA per non cambiare comportamento sugli schemi
 * `whatsapp://` vs `wa.me` vs `web.whatsapp.com`.
 *
 * Se il numero risulta vuoto/invalido dopo la normalizzazione, mostra un
 * alert invece di aprire WhatsApp con phone vuoto (che farebbe aprire il
 * selettore contatti — comportamento confondente).
 */
function openWA(phone: string, message: string = ""): void {
  const n = normalizePhoneForWA(phone);
  if (!n) {
    showToast.error("Il numero di telefono del paziente non è valido. Verifica e riprova.");
    return;
  }
  const isMobile = /iPhone|iPad|iPod|Android/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (isMobile) {
    // Schema URI nativo: apre l'app WhatsApp DIRETTAMENTE (no api.whatsapp.com)
    const queryText = message ? "&text=" + encodeURIComponent(message) : "";
    const nativeUrl = "whatsapp://send?phone=" + n + queryText;
    const fallbackUrl = "https://wa.me/" + n + (message ? "?text=" + encodeURIComponent(message) : "");
    window.location.href = nativeUrl;
    setTimeout(() => {
      if (document.visibilityState === "visible") {
        window.location.href = fallbackUrl;
      }
    }, 1500);
  } else {
    // Desktop: WhatsApp Web diretto
    const text = message ? "&text=" + encodeURIComponent(message) : "";
    const url = "https://web.whatsapp.com/send?phone=" + n + text;
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 200);
  }
}

/* ─── Types ───────────────────────────────────────────────────────────── */
type Status = "booked" | "confirmed" | "done" | "cancelled" | "not_paid";
type LocationType = "studio" | "domicile";

type PatientLite = {
  id: string; first_name: string | null; last_name: string | null; phone?: string | null;
};

type CalendarEvent = {
  id: string; patient_id: string | null;
  patient_name: string; patient_first_name: string | null; patient_phone: string | null;
  start: Date; end: Date; status: Status;
  calendar_note: string | null; location: LocationType | null;
  clinic_site: string | null; domicile_address: string | null;
  studio_id?: string | null;
  amount: number | null; is_paid: boolean; paid_at: Date | null;
  treatment_type: string | null; price_type: string | null; payment_method: string | null;
  whatsapp_sent_at: string | null;
  // ─── Gruppo (mig. 014) ───────────────────────────────────────────────
  is_group?: boolean | null;
  group_title?: string | null;
  group_max_participants?: number | null;
  group_price_per_person?: number | null;
  participant_count?: number;
  participant_paid_count?: number;
  group_total?: number;
  // ─── Pacchetto sedute (mig. 014_packages) ──────────────────────────
  package_id?: string | null;
};

type CreateModalProps = {
  busy: boolean; error: string; onClose: () => void;
  patientQuery: string; setPatientQuery: (v: string) => void;
  patientResults: PatientLite[]; patientLoading: boolean;
  selectedPatient: PatientLite | null; setSelectedPatient: (p: PatientLite | null) => void;
  quickFirstName: string; setQuickFirstName: (v: string) => void;
  quickLastName: string; setQuickLastName: (v: string) => void;
  quickPhone: string; setQuickPhone: (v: string) => void;
  createQuickPatient: () => Promise<void>;
  createDate: string; setCreateDate: (v: string) => void;
  createTime: string; setCreateTime: (v: string) => void;
  createDuration: number; setCreateDuration: (v: number) => void;
  createStatus: Status; setCreateStatus: (v: Status) => void;
  createLocation: LocationType; setCreateLocation: (v: LocationType) => void;
  createClinicSite: string; setCreateClinicSite: (v: string) => void;
  createDomicileAddress: string; setCreateDomicileAddress: (v: string) => void;
  // Multi-sede (mig. 014, fase 2)
  studioLocations?: Array<{ id: string; name: string; address: string | null; is_primary: boolean; border_color: string | null }>;
  createLocationId?: string | null;
  setCreateLocationId?: (id: string | null) => void;
  multiLocationEnabled?: boolean;
  createAmount: string; setCreateAmount: (v: string) => void;
  createNote: string; setCreateNote: (v: string) => void;
  createPriceType: "invoiced" | "cash"; setCreatePriceType: (v: "invoiced" | "cash") => void;
  createPaymentMethod: "cash" | "pos" | "bank_transfer" | null; setCreatePaymentMethod: (v: "cash" | "pos" | "bank_transfer" | null) => void;
  createTreatmentType: string; setCreateTreatmentType: (v: string) => void;
  treatmentCatalog: { key: string; label: string; color: string; price_invoice: number; price_cash: number; duration_min: number }[];
  createAppointment: () => Promise<void>;
  createRecurring: boolean; setCreateRecurring: (v: boolean) => void;
  createRecurringCount: number; setCreateRecurringCount: (v: number) => void;
  createRecurringInterval: number; setCreateRecurringInterval: (v: number) => void;
  // Placeholder per il campo "Sede" — nome dello studio corrente (multi-tenancy)
  studioNamePlaceholder: string;
  // ─── Gruppo (mig. 014) ────────────────────────────────────────────────
  createIsGroup: boolean; setCreateIsGroup: (v: boolean) => void;
  createGroupTitle: string; setCreateGroupTitle: (v: string) => void;
  createGroupMax: string; setCreateGroupMax: (v: string) => void;
  createGroupPrice: string; setCreateGroupPrice: (v: string) => void;
  // ─── Step 6.1: partecipanti iniziali ──────────────────────────────────
  createInitialParticipants: Array<{ id: string; first_name: string | null; last_name: string | null; phone?: string | null }>;
  addInitialParticipantCal: (p: { id: string; first_name: string | null; last_name: string | null; phone?: string | null }) => void;
  removeInitialParticipantCal: (patientId: string) => void;
  searchPatientsForGroupCal: (q: string) => Promise<Array<{ id: string; first_name: string | null; last_name: string | null; phone?: string | null }>>;
  /** Quick patient per gruppo (mig. 015) — restituisce paziente creato o null */
  createQuickPatientForGroup?: (payload: { first_name: string; last_name: string; phone: string | null }) => Promise<PatientLite | null>;
  // ─── Pacchetto sedute (mig. 014_packages) ────────────────────────────
  selectedPackageId: string | null;
  setSelectedPackageId: (id: string | null) => void;
};

type TouchDragState = {
  eventId: string; startClientY: number; startEventTopPx: number;
  activated: boolean; activationTimer: ReturnType<typeof setTimeout> | null;
};

/* ─── Theme ───────────────────────────────────────────────────────────── */
// THEME: token centrali Direzione A (R4 restyling)
import { MOBILE_THEME as THEME } from "@/src/theme/tokens";

const PX_PER_HOUR    = 80;
const BOTTOM_TAB_H = 60;
const DEFAULT_START  = 7;
const DEFAULT_END    = 22;
// Default neutro per il campo "Sede" nel form di creazione.
// Il valore reale al salvataggio è currentStudio?.name (multi-tenancy).
const DEFAULT_CLINIC = "Studio";

// Mappa indirizzi clinici legacy. Mantenuta vuota: ogni studio ha il
// proprio currentStudio.address che ha priorità nei messaggi WhatsApp.
const CLINIC_ADDRESSES: Record<string, string> = {};

/* ─── Status helpers ──────────────────────────────────────────────────── */
function statusLabel(s: Status) {
  return ({ booked:"Prenotato", confirmed:"Confermato", done:"Eseguito",
            not_paid:"Non pagata", cancelled:"Annullato" } as Record<Status,string>)[s] ?? "Prenotato";
}
function statusColor(s: Status): string {
  switch (s) {
    case "done":      return THEME.green;
    case "confirmed": return THEME.blue;
    case "not_paid":  return THEME.amber;
    case "cancelled": return THEME.gray;
    default:          return THEME.red;
  }
}
function statusBg(s: Status): string {
  switch (s) {
    case "done":      return "rgba(22,163,74,0.10)";
    case "confirmed": return "rgba(37,99,235,0.08)";
    case "not_paid":  return "rgba(249,115,22,0.10)";
    case "cancelled": return "rgba(148,163,184,0.08)";
    default:          return "rgba(220,38,38,0.08)";
  }
}

/* ─── WhatsApp helpers ────────────────────────────────────────────────── */
function formatPhoneForWA(phone: string): string {
  // Delegato alla utility centrale in src/lib/whatsapp.ts per consistenza
  return normalizePhoneForWA(phone);
}

function formatDateRelative(date: Date): string {
  const oggi = new Date(); oggi.setHours(0,0,0,0);
  const domani = new Date(oggi); domani.setDate(oggi.getDate()+1);
  const d = new Date(date); d.setHours(0,0,0,0);
  if (d.getTime() === oggi.getTime()) return "Oggi";
  if (d.getTime() === domani.getTime()) return "Domani";
  const gg = ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
  const mm = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
              "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  return `${gg[d.getDay()]} ${d.getDate()} ${mm[d.getMonth()]}`;
}

/* ─── Generic helpers ─────────────────────────────────────────────────── */
function pad2(n: number) { return String(n).padStart(2,"0"); }
function addDays(d: Date, n: number) { const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function formatDMY(d: Date) { return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`; }
function formatWeekdayShort(d: Date) {
  return ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"][d.getDay()];
}
function formatWeekday(d: Date) {
  return ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"][d.getDay()];
}
function isSameDay(a: Date, b: Date) {
  return a.getDate()===b.getDate() && a.getMonth()===b.getMonth() && a.getFullYear()===b.getFullYear();
}
function fmtTime(d: Date) { return d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}); }
function toISODateLocal(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function buildDateTime(dateISO: string, hhmm: string) {
  const b = new Date(`${dateISO}T00:00:00`);
  const [hh,mm] = hhmm.split(":").map(Number);
  b.setHours(hh||0, mm||0, 0, 0); return b;
}
function normalizePhone(raw?: string|null) {
  if (!raw) return null; const d=raw.replace(/\D/g,""); return d.length<9?null:d;
}
function isValidISODate(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }
function isValidHHMM(s: string) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }
function clamp(n: number, lo: number, hi: number) { return Math.max(lo,Math.min(hi,n)); }
function roundTo(n: number, step: number) { return Math.round(n/step)*step; }

/* ─── Page shell ──────────────────────────────────────────────────────── */
export default function CalendarMobileClient() {
  return (
    <Suspense fallback={
      <div style={{minHeight:"100vh",background:THEME.appBg,display:"flex",
        alignItems:"center",justifyContent:"center",color:THEME.muted,
        fontFamily:"Inter,-apple-system,sans-serif",fontSize:14}}>
        Caricamento…
      </div>
    }>
      <CalendarPageInner />
    </Suspense>
  );
}

/* ─── Main ────────────────────────────────────────────────────────────── */
function CalendarPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // Studio corrente (multi-tenancy)
  const { studio: currentStudio, locations: studioLocations } = useCurrentStudio();
  const { privacyMode, privacyStyle } = usePrivacyMode();
  const currentStudioId = currentStudio?.id ?? null;

  // Lista d'attesa (mobile: pannello + badge + match su elimina/annulla)
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistCount, setWaitlistCount] = useState(0);
  const [matchSlot, setMatchSlot] = useState<Date | null>(null);
  const [matchEntries, setMatchEntries] = useState<WaitlistEntry[]>([]);
  useEffect(() => {
    if (!currentStudioId) return;
    fetchActiveWaitlistCount(currentStudioId).then(setWaitlistCount).catch(() => {});
  }, [currentStudioId]);

  const openWaitlistMatchesForSlot = useCallback(async (slotStart: Date) => {
    if (!currentStudioId) return;
    const { data: rows } = await supabase
      .from("waitlist_entries")
      .select("*, patients(first_name, last_name, phone)")
      .eq("studio_id", currentStudioId)
      .in("status", ["active", "notified"]);
    const entries = (rows as unknown as WaitlistEntry[]) || [];
    const matches = entries.filter((e) => entryMatchesSlot(e, slotStart));
    if (matches.length > 0) {
      setMatchSlot(slotStart);
      setMatchEntries(matches);
    }
  }, [currentStudioId]);

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [events,  setEvents]  = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState("");

  /* user */
  const [userEmail,    setUserEmail]    = useState<string|null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // mig. 029 — Agenda Ospiti nel menu utente del calendar mobile
  const guestEnabledStudio = (currentStudio as { guest_practitioners_enabled?: boolean })?.guest_practitioners_enabled === true;
  const useGuestIndex = (currentStudio as { use_guest_index_page?: boolean })?.use_guest_index_page === true;
  const [guestList, setGuestList] = useState<Array<{
    id: string; first_name: string; last_name: string;
    specialty: string; display_color: string | null;
  }>>([]);
  const [guestSubmenuOpen, setGuestSubmenuOpen] = useState(false);

  useEffect(() => {
    if (!guestEnabledStudio || !currentStudioId) { setGuestList([]); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("guest_practitioners")
        .select("id, first_name, last_name, specialty, display_color")
        .eq("studio_id", currentStudioId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (cancelled || error) return;
      setGuestList((data ?? []) as Array<{
        id: string; first_name: string; last_name: string;
        specialty: string; display_color: string | null;
      }>);
    })();
    return () => { cancelled = true; };
  }, [guestEnabledStudio, currentStudioId]);

  const hasGuests = guestList.length > 0;
  const singleGuest = guestList.length === 1 ? guestList[0] : null;
  const multipleGuests = guestList.length > 1 ? guestList : null;
  const showIndexLink = useGuestIndex && guestList.length >= 2;

  /* timeline refs */
  const timelineRef       = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  /* view mode */
  const [viewMode,       setViewMode]       = useState<"day"|"week"|"month">("week");

  // Sabato on/off: condiviso tra Settimana e Mese, ricordato tra le sessioni
  const [showSaturday, setShowSaturday] = useState(true);
  useEffect(() => {
    try { const v = localStorage.getItem("fisiohub_show_saturday"); if (v !== null) setShowSaturday(v === "1"); } catch {}
  }, []);
  const toggleSaturday = useCallback(() => {
    setShowSaturday(prev => {
      const next = !prev;
      try { localStorage.setItem("fisiohub_show_saturday", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  // Settimana: all'apertura scrolla sull'ora attuale
  const weekScrollRef = useRef<HTMLDivElement|null>(null);
  const [monthEvents,    setMonthEvents]    = useState<CalendarEvent[]>([]);
  const [monthLoading,   setMonthLoading]   = useState(false);
  const [monthDrawerDay, setMonthDrawerDay] = useState<Date|null>(null);

  /* drag mouse */
  const [draggingId, setDraggingId] = useState<string|null>(null);
  const [dragOverY,  setDragOverY]  = useState<number|null>(null);

  /* drag touch */
  const touchDragRef          = useRef<TouchDragState|null>(null);
  const touchDragYRef         = useRef<number|null>(null);
  const [touchDragY, _setTDY] = useState<number|null>(null);
  const [touchDraggingId, setTouchDraggingId] = useState<string|null>(null);
  const setTouchDragY = (y: number|null) => { touchDragYRef.current=y; _setTDY(y); };

  /* swipe */
  const swipeXRef = useRef<number|null>(null);
  const swipeYRef = useRef<number|null>(null);

  /* ─── NEW: pull-to-refresh ────────────────── */
  const [pullY,        setPullY]        = useState(0);
  const [isPulling,    setIsPulling]    = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartY = useRef<number|null>(null);
  const PULL_THRESHOLD = 64;

  /* ─── NEW: swipe actions ──────────────────── */
  const [swipeState, setSwipeState] = useState<{id:string; x:number}|null>(null);
  const cardSwipeStartRef = useRef<{id:string; startX:number; startY:number}|null>(null);

  /* ─── NEW: quick note ─────────────────────── */
  const [quickNoteId,   setQuickNoteId]   = useState<string|null>(null);
  const [quickNoteText, setQuickNoteText] = useState("");

  /* ─── NEW: search patient ─────────────────── */
  const [searchOpen,    setSearchOpen]    = useState(false);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState<PatientLite[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  /* ─── NEW: go to date ─────────────────────── */
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  /* edit modal */
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent|null>(null);

  // ─── Modal gruppo (mig. 014) ──────────────────────────────────────────────
  const [openGroup, setOpenGroup] = useState<GroupEvent | null>(null);

  /** Apre il modal gruppo per un evento */
  const openGroupModalCal = useCallback(async (ev: CalendarEvent) => {
    if (!ev.is_group) return;
    const participants = await fetchGroupParticipants(ev.id);
    setOpenGroup({
      id: ev.id,
      start: ev.start,
      end: ev.end,
      group_title: ev.group_title ?? null,
      group_max_participants: ev.group_max_participants ?? null,
      group_price_per_person: ev.group_price_per_person ?? null,
      participants,
      // Step 6.2: campi per duplicazione
      start_at: ev.start.toISOString(),
      end_at: ev.end.toISOString(),
      location: ev.location ?? null,
      clinic_site: ev.clinic_site ?? null,
      domicile_address: ev.domicile_address ?? null,
      studio_id: ev.studio_id ?? "",
    });
  }, []);

  /** Ricarica i partecipanti del gruppo aperto + aggiorna events/monthEvents */
  const refreshOpenGroupCal = useCallback(async () => {
    if (!openGroup) return;
    const newParts = await fetchGroupParticipants(openGroup.id);
    setOpenGroup(prev => prev ? { ...prev, participants: newParts } : null);
    const updateEv = (e: CalendarEvent): CalendarEvent => {
      if (e.id !== openGroup.id) return e;
      return {
        ...e,
        participant_count: newParts.length,
        participant_paid_count: newParts.filter(p => p.payment_status === "paid").length,
        group_total: newParts.reduce((s, p) => s + (Number(p.price) || 0), 0),
      };
    };
    setEvents((prev: CalendarEvent[]) => prev.map(updateEv));
    setMonthEvents((prev: CalendarEvent[]) => prev.map(updateEv));
  }, [openGroup]);

  const [editStatus,    setEditStatus]    = useState<Status>("booked");
  const [editNote,      setEditNote]      = useState("");
  const [editAmount,    setEditAmount]    = useState("");
  // Fatturazione e metodo pagamento (allineati al desktop)
  const [editPriceType, setEditPriceType] = useState<"invoiced" | "cash">("invoiced");
  const [editPaymentMethod, setEditPaymentMethod] = useState<"cash" | "pos" | "bank_transfer" | null>(null);
  const [editDate,      setEditDate]      = useState(toISODateLocal(new Date()));
  const [editTime,      setEditTime]      = useState("09:00");
  const [editDuration,  setEditDuration]  = useState(60);
  const [editTreatmentType, setEditTreatmentType] = useState<string>("seduta");

  // Catalogo trattamenti dinamico (treatment_types) caricato dal DB
  const [treatmentCatalog, setTreatmentCatalog] = useState<{
    key: string; label: string; color: string;
    price_invoice: number; price_cash: number; duration_min: number;
  }[]>([]);

  /* Promemoria settimanale aggregato (1 messaggio = N appuntamenti). */
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
  const [weeklyReminderTemplate, setWeeklyReminderTemplate] = useState<string>(
    `Ciao {nome},\n\nti ricordo i prossimi appuntamenti:\n\n{lista_appuntamenti}\n\nA presto,\n{firma}`
  );

  // Cache link conferma e template (per apertura sincrona WA su iOS)
  const [confirmLinks, setConfirmLinks] = useState<Record<string, string>>({});
  const [reminderTplCache, setReminderTplCache] = useState<string | null>(null);
  const [confirmTplCache, setConfirmTplCache] = useState<string | null>(null);

  /* create modal */
  const [createOpen,            setCreateOpen]            = useState(false);
  const [createDate,            setCreateDate]            = useState(toISODateLocal(new Date()));
  const [createTime,            setCreateTime]            = useState("09:00");
  const [createDuration,        setCreateDuration]        = useState(60);
  const [createStatus,          setCreateStatus]          = useState<Status>("confirmed");
  const [defaultStatus,         setDefaultStatus]         = useState<"confirmed"|"booked">("confirmed");
  const [overlapMode,            setOverlapMode]            = useState<"block"|"warn"|"visual">("warn");
  // Pagamenti (mig. 015)
  const [paymentMethodRequired, setPaymentMethodRequired] = useState<boolean>(true);
  const [defaultPaymentMethod,  setDefaultPaymentMethod]  = useState<"cash"|"pos"|"bank_transfer">("pos");
  const [createLocation,        setCreateLocation]        = useState<LocationType>("studio");
  const [createClinicSite,      setCreateClinicSite]      = useState("");
  const [createDomicileAddress, setCreateDomicileAddress] = useState("");
  // Multi-sede (mig. 014, fase 2)
  const [createLocationId,      setCreateLocationId]      = useState<string | null>(null);
  const [createAmount,          setCreateAmount]          = useState("");
  const [createNote,            setCreateNote]            = useState("");

  // Sincronizza il default di "Sede" con il nome dello studio corrente
  // (multi-tenancy). L'utente può sovrascrivere manualmente.
  useEffect(() => {
    if (currentStudio?.name && !createClinicSite) {
      setCreateClinicSite(currentStudio.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStudio?.name]);

  // Quando arrivano le sedi, default al dropdown sulla principale
  useEffect(() => {
    if (!studioLocations || studioLocations.length === 0) return;
    if (createLocationId) return;
    const primary = studioLocations.find(l => l.is_primary) ?? studioLocations[0];
    if (primary) {
      setCreateLocationId(primary.id);
      setCreateClinicSite(primary.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioLocations]);
  // Fatturazione + metodo pagamento allineati al desktop
  const [createPriceType,       setCreatePriceType]       = useState<"invoiced" | "cash">("cash");
  const [createPaymentMethod,   setCreatePaymentMethod]   = useState<"cash" | "pos" | "bank_transfer" | null>(null);

  // Pagamenti (mig. 015): se "non bloccante", precarica il default così
  // l'utente non è costretto a cliccare. Se "bloccante", lascia null per
  // forzare la scelta consapevole.
  useEffect(() => {
    if (!paymentMethodRequired && createPaymentMethod == null) {
      setCreatePaymentMethod(defaultPaymentMethod);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethodRequired, defaultPaymentMethod]);
  const [createTreatmentType,   setCreateTreatmentType]   = useState<string>("seduta");

  /* patient search (create) */
  const [patientQuery,    setPatientQuery]    = useState("");
  const [patientResults,  setPatientResults]  = useState<PatientLite[]>([]);
  const [patientLoading,  setPatientLoading]  = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientLite|null>(null);
  const [quickFirstName,  setQuickFirstName]  = useState("");
  const [quickLastName,   setQuickLastName]   = useState("");
  const [quickPhone,      setQuickPhone]      = useState("");

  /* ── WhatsApp confirm modal (mostrato dopo creazione appuntamento) ── */
  const [showWhatsAppConfirm, setShowWhatsAppConfirm] = useState(false);
  // Contesto appuntamento appena creato per generare il messaggio
  const [justCreatedAppt, setJustCreatedAppt] = useState<{
    id: string;
    start: Date;
    patientPhone: string | null;
    patientFirstName: string;
    patientLastName: string;
  } | null>(null);

  /* ── Clock ───────────────────────────────── */
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  /* ── User ────────────────────────────────── */
  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      setUserEmail(userData?.user?.email ?? null);
      const ownerId = userData?.user?.id;
      if (!ownerId) return;
      // Load default appointment status filtrato per owner
      const { data } = await supabase
        .from("practice_settings")
        .select("default_appointment_status, overlap_mode, weekly_reminder_message, payment_method_required, default_payment_method")
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (data?.default_appointment_status) setDefaultStatus(data.default_appointment_status as "confirmed"|"booked");
      if (data?.overlap_mode) setOverlapMode(data.overlap_mode as "block"|"warn"|"visual");
      const tpl = ((data as { weekly_reminder_message?: string | null } | null)?.weekly_reminder_message ?? "").trim();
      if (tpl) setWeeklyReminderTemplate(tpl);
      // Pagamenti (mig. 015)
      const dataAny = data as { payment_method_required?: boolean | null; default_payment_method?: string | null } | null;
      if (dataAny?.payment_method_required != null) setPaymentMethodRequired(dataAny.payment_method_required);
      if (dataAny?.default_payment_method) setDefaultPaymentMethod(dataAny.default_payment_method as "cash"|"pos"|"bank_transfer");
    })().catch(() => {});
  }, []);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [userMenuOpen]);

  /* ── Load ────────────────────────────────── */
  const loadAppointments = useCallback(async (date: Date, rangeEnd?: Date) => {
    setLoading(true); setError("");
    const s0=new Date(date); s0.setHours(0,0,0,0);
    const e0 = rangeEnd ? new Date(rangeEnd) : (() => { const x=new Date(date); x.setHours(23,59,59,999); return x; })();
    const {data,error:err} = await supabase.from("appointments").select(`
      id,patient_id,start_at,end_at,status,calendar_note,is_paid,paid_at,
      location,clinic_site,location_id,domicile_address,studio_id,
      amount,treatment_type,price_type,payment_method,whatsapp_sent_at,
      is_group,group_title,group_max_participants,group_price_per_person,
      package_id,
      patients:patient_id(first_name,last_name,phone),
      appointment_participants(id,price,payment_status)
    `).gte("start_at",s0.toISOString()).lt("start_at",e0.toISOString())
      .is("guest_practitioner_id",null)
      .order("start_at",{ascending:true});
    if (err) { setError(`Errore: ${err.message}`); setLoading(false); return; }
    const mapped: CalendarEvent[] = (data??[]).map((a:any) => {
      const p = Array.isArray(a.patients)?a.patients[0]:a.patients;
      const isGroup = a.is_group === true;
      const parts = (a.appointment_participants ?? []) as Array<{ id: string; price: number | null; payment_status?: string | null }>;
      const participantCount = parts.length;
      const paidCount = parts.filter(pp => pp.payment_status === "paid").length;
      const groupTotal = parts.reduce((s, pp) => s + (Number(pp.price) || 0), 0);
      const name = isGroup
        ? (a.group_title || "Gruppo")
        : (p?`${p.last_name??""} ${p.first_name??""}`.trim():"Paziente");
      return {
        id:a.id, patient_id:a.patient_id??null,
        patient_name: privacyMode && !isGroup ? (privacyStyle==="initials"?composeInitials(p):"Paziente") : (name||"Paziente"), patient_first_name:p?.first_name??null,
        patient_phone:p?.phone??null, start:new Date(a.start_at), end:new Date(a.end_at),
        status:(a.status??"booked") as Status, calendar_note:a.calendar_note??null,
        is_paid:a.is_paid??false,
        paid_at:a.paid_at?new Date(a.paid_at):null,
        location:(a.location??null) as LocationType|null, clinic_site:a.clinic_site??null, location_id:(a as any).location_id??null,
        domicile_address:a.domicile_address??null,
        studio_id: a.studio_id ?? null,
        amount:a.amount??null,
        treatment_type:a.treatment_type??null, price_type:a.price_type??null, payment_method:a.payment_method??null,
        whatsapp_sent_at:a.whatsapp_sent_at??null,
        // Gruppo (mig. 014)
        is_group: isGroup,
        group_title: a.group_title??null,
        group_max_participants: a.group_max_participants??null,
        group_price_per_person: a.group_price_per_person??null,
        participant_count: participantCount,
        participant_paid_count: paidCount,
        group_total: groupTotal,
        // Pacchetto sedute (mig. 014_packages)
        package_id: a.package_id ?? null,
      };
    });
    setEvents(mapped); setLoading(false);

    // Pre-cache template + link conferma per apertura WA sincrona su iOS.
    // In background, non blocca nulla. Se l'utente clicca WA prima che finisca,
    // il messaggio parte senza link conferma (fallback); al prossimo refresh avrà il link.
    (async () => {
      // Carica entrambi i template
      const [promRes, confRes] = await Promise.all([
        supabase.from("message_templates").select("template").eq("name", "Promemoria").maybeSingle(),
        supabase.from("message_templates").select("template").eq("name", "Appuntamento").maybeSingle(),
      ]);
      if (promRes.data?.template) setReminderTplCache(promRes.data.template);
      if (confRes.data?.template) setConfirmTplCache(confRes.data.template);

      // Pre-genera token conferma per tutti gli eventi (update progressivo).
      // Ogni link diventa disponibile appena fetchato — non aspetta che TUTTI siano finiti.
      await Promise.all(mapped.map(async (ev) => {
        try {
          const r = await fetch("/api/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appointment_id: ev.id }),
          });
          const j = await r.json();
          if (r.ok && j.token) {
            setConfirmLinks(prev => ({
              ...prev,
              [ev.id]: `${window.location.origin}/conferma/${j.token}`,
            }));
          }
        } catch {}
      }));
    })();
  }, [privacyMode, privacyStyle]);

  useEffect(() => { if (viewMode !== "week") loadAppointments(currentDate); }, [currentDate, loadAppointments, viewMode]);

  // Vista settimana: carica Lun→Sab in una query sola
  const weekRange = useCallback((d: Date) => {
    const mon = new Date(d); mon.setDate(mon.getDate() - ((mon.getDay()+6)%7)); mon.setHours(0,0,0,0);
    const end = new Date(mon); end.setDate(end.getDate()+6); // domenica 00:00 (esclusa, come la vista mese)
    return { mon, end };
  }, []);
  useEffect(() => {
    if (viewMode === "week") { const { mon, end } = weekRange(currentDate); loadAppointments(mon, end); }
  }, [viewMode, currentDate, loadAppointments, weekRange]);

  useEffect(() => {
    if (viewMode !== "week" || loading) return;
    const el = weekScrollRef.current; if (!el) return;
    const now = new Date();
    const nh = now.getHours() + now.getMinutes()/60;
    const rect = el.getBoundingClientRect();
    const target = rect.top + window.scrollY + Math.max(0, (nh - 7 - 1.5) * 44) - 130;
    window.scrollTo({ top: Math.max(0, target) });
  }, [viewMode, loading]);

  // Ricarica coerente con la vista corrente (usata dopo salvataggi/refresh)
  const reloadCurrent = useCallback(async () => {
    if (viewMode === "week") { const { mon, end } = weekRange(currentDate); await loadAppointments(mon, end); }
    else await reloadCurrent();
  }, [viewMode, currentDate, loadAppointments, weekRange]);

  // Carica il catalogo trattamenti dinamico (treatment_types) per lo studio corrente.
  // Riempie il dropdown del modal di creazione e modifica appuntamenti.
  useEffect(() => {
    if (!currentStudioId) return;
    let mounted = true;
    (async () => {
      try {
        const { data, error: catErr } = await supabase
          .from("treatment_types")
          .select("key, label, color, price_invoice, price_cash, duration_min")
          .eq("studio_id", currentStudioId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
        if (catErr) throw catErr;
        if (!mounted) return;
        const rows = (data ?? []).map((r: { key: string; label: string; color: string; price_invoice: number | null; price_cash: number | null; duration_min: number | null }) => ({
          key: r.key,
          label: r.label,
          color: r.color,
          price_invoice: Number(r.price_invoice ?? 0),
          price_cash: Number(r.price_cash ?? 0),
          duration_min: Number(r.duration_min ?? 30),
        }));
        setTreatmentCatalog(rows);
      } catch (e) {
        console.warn("[mobile-calendar] errore carica treatment_types:", e instanceof Error ? e.message : e);
      }
    })();
    return () => { mounted = false; };
  }, [currentStudioId]);

  const loadMonthAppointments = useCallback(async (date: Date) => {
    setMonthLoading(true);
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDay  = new Date(date.getFullYear(), date.getMonth()+1, 0, 23, 59, 59, 999);
    const {data, error:err} = await supabase.from("appointments").select(`
      id,patient_id,start_at,end_at,status,calendar_note,is_paid,paid_at,
      location,clinic_site,location_id,domicile_address,studio_id,
      amount,treatment_type,price_type,payment_method,whatsapp_sent_at,
      is_group,group_title,group_max_participants,group_price_per_person,
      package_id,
      patients:patient_id(first_name,last_name,phone),
      appointment_participants(id,price,payment_status)
    `).gte("start_at", firstDay.toISOString()).lte("start_at", lastDay.toISOString())
      .is("guest_practitioner_id",null)
      .order("start_at", {ascending:true});
    if (!err && data) {
      const mapped: CalendarEvent[] = data.map((a:any) => {
        const p = Array.isArray(a.patients)?a.patients[0]:a.patients;
        const isGroup = a.is_group === true;
        const parts = (a.appointment_participants ?? []) as Array<{ id: string; price: number | null; payment_status?: string | null }>;
        const participantCount = parts.length;
        const paidCount = parts.filter((pp: { payment_status?: string | null }) => pp.payment_status === "paid").length;
        const groupTotal = parts.reduce((s: number, pp: { price: number | null }) => s + (Number(pp.price) || 0), 0);
        const name = isGroup
          ? (a.group_title || "Gruppo")
          : (p?`${p.last_name??""} ${p.first_name??""}`.trim():"Paziente");
        return {
          id:a.id, patient_id:a.patient_id??null,
          patient_name: privacyMode && !isGroup ? (privacyStyle==="initials"?composeInitials(p):"Paziente") : (name||"Paziente"), patient_first_name:p?.first_name??null,
          patient_phone:p?.phone??null, start:new Date(a.start_at), end:new Date(a.end_at),
          status:(a.status??"booked") as Status, calendar_note:a.calendar_note??null,
          is_paid:a.is_paid??false,
          paid_at:a.paid_at?new Date(a.paid_at):null,
          location:(a.location??null) as LocationType|null, clinic_site:a.clinic_site??null, location_id:(a as any).location_id??null,
          domicile_address:a.domicile_address??null,
          studio_id: a.studio_id ?? null,
          amount:a.amount??null,
          treatment_type:a.treatment_type??null, price_type:a.price_type??null, payment_method:a.payment_method??null,
          whatsapp_sent_at:a.whatsapp_sent_at??null,
          // Gruppo (mig. 014)
          is_group: isGroup,
          group_title: a.group_title??null,
          group_max_participants: a.group_max_participants??null,
          group_price_per_person: a.group_price_per_person??null,
          participant_count: participantCount,
          participant_paid_count: paidCount,
          group_total: groupTotal,
          // Pacchetto (mig. 014_packages)
          package_id: a.package_id ?? null,
        };
      });
      setMonthEvents(mapped);
    }
    setMonthLoading(false);
  }, [privacyMode, privacyStyle]);

  useEffect(() => {
    if (viewMode === "month") loadMonthAppointments(currentDate);
  }, [viewMode, currentDate, loadMonthAppointments]);

  /* ── URL params ──────────────────────────── */
  const handledNewRef = useRef(false);
  useEffect(() => {
    const qDate = searchParams.get("date");
    if (qDate && isValidISODate(qDate)) {
      const d = new Date(`${qDate}T00:00:00`);
      if (!isNaN(d.getTime()) && !isSameDay(d,currentDate)) setCurrentDate(d);
    }
    const isNew = searchParams.get("new")==="1"||searchParams.get("action")==="new";
    if (!isNew) { handledNewRef.current=false; return; }
    if (handledNewRef.current) return;
    handledNewRef.current=true;
    const base = qDate&&isValidISODate(qDate)?qDate:toISODateLocal(currentDate);
    const qt = searchParams.get("time");
    openCreate(qt&&isValidHHMM(qt)?qt:undefined,base);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new"); params.delete("time"); params.delete("action");
    router.replace(`/calendar${params.toString()?`?${params}`:""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams,router]);

  /* ── Derived ─────────────────────────────── */
  const dayEvents = useMemo(() =>
    events.filter(e=>isSameDay(e.start,currentDate)), [events,currentDate]);

  const dayStats = useMemo(() => ({
    total:   dayEvents.filter(e=>e.status!=="cancelled").length,
    done:    dayEvents.filter(e=>e.status==="done").length,
    revenue: dayEvents.reduce((s,e)=>e.status==="done"?s+(e.amount??0):s,0),
    unpaidDone: dayEvents.filter(e=>e.status==="done"&&!e.is_paid).length,
  }), [dayEvents]);

  /* ─── Slot liberi tra appuntamenti ──────── */
  const freeSlots = useMemo(() => {
    const active = dayEvents
      .filter(e => e.status !== "cancelled")
      .sort((a,b) => a.start.getTime() - b.start.getTime());
    const slots: {start: Date; end: Date; minutes: number}[] = [];
    for (let i = 0; i < active.length - 1; i++) {
      const gapStart = active[i].end;
      const gapEnd   = active[i+1].start;
      const minutes  = Math.round((gapEnd.getTime() - gapStart.getTime()) / 60_000);
      if (minutes >= 60) slots.push({ start: gapStart, end: gapEnd, minutes });
    }
    return slots;
  }, [dayEvents]);
  const fabBadge = useMemo(() => {
    const now = new Date();
    return dayEvents.filter(e=>
      e.end < now && e.status!=="done" && e.status!=="cancelled"
    ).length;
  }, [dayEvents]);

  const {dayStartHour,dayEndHour} = useMemo(() => {
    if (!dayEvents.length) return {dayStartHour:DEFAULT_START,dayEndHour:DEFAULT_END};
    const starts = dayEvents.map(e=>e.start.getHours());
    const ends   = dayEvents.map(e=>e.end.getHours()+(e.end.getMinutes()>0?1:0));
    return {
      dayStartHour: clamp(Math.min(DEFAULT_START,...starts),0,23),
      dayEndHour:   clamp(Math.max(DEFAULT_END,...ends),1,24),
    };
  }, [dayEvents]);

  const timeSlots = useMemo(() => {
    const s:{label:string;hour:number}[]=[];
    for (let h=dayStartHour;h<dayEndHour;h++) s.push({label:`${pad2(h)}:00`,hour:h});
    return s;
  }, [dayStartHour,dayEndHour]);

  const getEventPosition = useCallback((start:Date,end:Date) => {
    const ppm = PX_PER_HOUR/60;
    const top    = ((start.getHours()-dayStartHour)*60+start.getMinutes())*ppm;
    const height = ((end.getHours()-start.getHours())*60+(end.getMinutes()-start.getMinutes()))*ppm;
    return {top:Math.max(0,top),height:Math.max(Math.round(PX_PER_HOUR*0.55),height)};
  }, [dayStartHour]);

  /* ─── NEW: week strip — 7 giorni centrati sul corrente ─── */
  const weekDays = useMemo(() => {
    return Array.from({length:7},(_,i)=>addDays(currentDate,i-3));
  }, [currentDate]);

  const userInitials = useMemo(() => {
    if (!userEmail) return "U";
    const parts=(userEmail.split("@")[0]??"U").replace(/[^a-zA-Z0-9]/g," ").split(" ").filter(Boolean);
    return ((parts[0]?.[0]??"U")+(parts[1]?.[0]??"")).toUpperCase().slice(0,2);
  }, [userEmail]);

  /* ── Navigation ──────────────────────────── */
  const goPrev  = useCallback(() => {
    if (viewMode==="month") {
      setCurrentDate(p=>{ const d=new Date(p); d.setDate(1); d.setMonth(d.getMonth()-1); return d; });
    } else if (viewMode==="week") {
      setCurrentDate(p=>addDays(p,-7));
    } else {
      setCurrentDate(p=>addDays(p,-1));
    }
  }, [viewMode]);
  const goNext  = useCallback(() => {
    if (viewMode==="month") {
      setCurrentDate(p=>{ const d=new Date(p); d.setDate(1); d.setMonth(d.getMonth()+1); return d; });
    } else if (viewMode==="week") {
      setCurrentDate(p=>addDays(p, 7));
    } else {
      setCurrentDate(p=>addDays(p, 1));
    }
  }, [viewMode]);
  const goToday = useCallback(() => setCurrentDate(new Date()), []);

  /* ── Swipe page ──────────────────────────── */
  const handleSwipeTouchStart = useCallback((e:React.TouchEvent) => {
    if (touchDragRef.current?.activated||cardSwipeStartRef.current) return;
    swipeXRef.current=e.touches[0].clientX;
    swipeYRef.current=e.touches[0].clientY;
  }, []);
  const handleSwipeTouchEnd = useCallback((e:React.TouchEvent) => {
    if (swipeXRef.current===null) return;
    const dx=e.changedTouches[0].clientX-swipeXRef.current;
    const dy=e.changedTouches[0].clientY-(swipeYRef.current??0);
    swipeXRef.current=null;
    if (Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5) { if(dx<0) goNext(); else goPrev(); }
  }, [goPrev,goNext]);

  /* ─── NEW: pull-to-refresh handlers ─────── */
  const handlePullStart = useCallback((e:React.TouchEvent) => {
    const el = timelineScrollRef.current;
    if (el && el.scrollTop===0) pullStartY.current=e.touches[0].clientY;
  }, []);
  const handlePullMove = useCallback((e:React.TouchEvent) => {
    if (pullStartY.current===null||isRefreshing) return;
    const dy=e.touches[0].clientY-pullStartY.current;
    if (dy>0) { setIsPulling(true); setPullY(Math.min(dy,PULL_THRESHOLD*1.5)); }
  }, [isRefreshing]);
  const handlePullEnd = useCallback(async () => {
    if (!isPulling) { pullStartY.current=null; return; }
    if (pullY>=PULL_THRESHOLD) {
      setIsRefreshing(true); setPullY(PULL_THRESHOLD);
      await reloadCurrent();
      setIsRefreshing(false);
    }
    setPullY(0); setIsPulling(false); pullStartY.current=null;
  }, [isPulling,pullY,currentDate,loadAppointments]);

  /* ─── NEW: segna pagato rapido ───────────── */
  const togglePaid = useCallback(async (id:string, isPaid:boolean) => {
    // Se sto MARCANDO come pagato (false → true), lo status passa anche a "done".
    // Se sto TOGLIENDO il pagato (true → false), lascio lo status invariato.
    // Mantiene coerenza col CHECK constraint appointments_paid_consistency:
    // is_paid=true ↔ paid_at NOT NULL (mig. 010).
    const willBePaid = !isPaid;
    if (willBePaid) {
      const nowIso = new Date().toISOString();
      setEvents(prev => prev.map(e =>
        e.id === id ? { ...e, is_paid: true, status: "done" as Status } : e
      ));
      await supabase.from("appointments")
        .update({ is_paid: true, status: "done", paid_at: nowIso })
        .eq("id", id);
    } else {
      setEvents(prev => prev.map(e =>
        e.id === id ? { ...e, is_paid: false } : e
      ));
      await supabase.from("appointments")
        .update({ is_paid: false, paid_at: null })
        .eq("id", id);
    }
  }, []);

  // Handler completo per il PaidIconButton mobile calendar
  // R4 — Sheet stato seduta (riuso del componente della home)
  const [statusSheetFor, setStatusSheetFor] = useState<CalendarEvent | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  async function handleSheetAction(ev: CalendarEvent, action: StatusSheetAction) {
    if (statusSaving) return;
    setStatusSaving(true);
    const nowIso = new Date().toISOString();
    // Coerenza col CHECK constraint appointments_paid_consistency (mig. 010)
    const payload =
      action.kind === "paid"
        ? { status: "done", is_paid: true, paid_at: nowIso, payment_method: action.method }
        : action.kind === "settle"
        ? { status: "done", is_paid: false, paid_at: null, payment_method: null }
        : action.kind === "not_paid"
        ? { status: "not_paid", is_paid: false, paid_at: null, payment_method: null }
        : { status: "confirmed", is_paid: false, paid_at: null, payment_method: null };
    const { error } = await supabase.from("appointments").update(payload).eq("id", ev.id);
    if (!error) {
      setEvents(prev => prev.map(e =>
        e.id === ev.id
          ? { ...e, status: payload.status as Status, is_paid: payload.is_paid,
              paid_at: payload.paid_at ? new Date(payload.paid_at) : null,
              payment_method: payload.payment_method ?? null }
          : e
      ));
      setStatusSheetFor(null);
    }
    setStatusSaving(false);
  }

  const handleUpdatePayment = useCallback(
    async (
      id: string,
      next: {
        is_paid: boolean;
        paid_at: string | null;
        payment_method: PaymentMethod | null;
      }
    ) => {
      const payload: Record<string, unknown> = {
        is_paid: next.is_paid,
        paid_at: next.paid_at,
      };
      // Quando segniamo pagato, alziamo anche lo status a "done" (pattern coerente
      // col togglePaid storico mobile).
      if (next.is_paid) {
        payload.status = "done";
      }
      if (!next.is_paid) {
        payload.payment_method = null;
      } else if (next.payment_method) {
        payload.payment_method = next.payment_method;
      }
      // Optimistic update
      setEvents(prev => prev.map(e =>
        e.id === id
          ? {
              ...e,
              is_paid: next.is_paid,
              paid_at: next.paid_at ? new Date(next.paid_at) : null,
              payment_method: next.payment_method,
              status: next.is_paid ? ("done" as Status) : e.status,
            }
          : e
      ));
      await supabase.from("appointments").update(payload).eq("id", id);
    },
    []
  );

  /* ─── NEW: swipe card actions ────────────── */
  const handleCardSwipeStart = useCallback((e:React.TouchEvent, ev:CalendarEvent) => {
    cardSwipeStartRef.current={id:ev.id,startX:e.touches[0].clientX,startY:e.touches[0].clientY};
  }, []);
  const handleCardSwipeMove = useCallback((e:React.TouchEvent, ev:CalendarEvent) => {
    const s=cardSwipeStartRef.current; if (!s||s.id!==ev.id) return;
    const dx=e.touches[0].clientX-s.startX;
    const dy=e.touches[0].clientY-s.startY;
    if (Math.abs(dx)<8&&Math.abs(dy)<8) return;
    if (Math.abs(dy)>Math.abs(dx)*1.2) { cardSwipeStartRef.current=null; return; }
    e.stopPropagation();
    setSwipeState({id:ev.id,x:clamp(dx,-140,140)});
  }, []);
  const handleCardSwipeEnd = useCallback(async (ev:CalendarEvent) => {
    const s=swipeState;
    cardSwipeStartRef.current=null;
    if (!s||s.id!==ev.id) return;
    if (s.x>80) {
      // swipe destra → eseguito
      setEvents(prev=>prev.map(e=>e.id===ev.id?{...e,status:"done"}:e));
      await supabase.from("appointments").update({status:"done"}).eq("id",ev.id);
    } else if (s.x<-80) {
      // swipe sinistra → apri modal
      openEvent(ev);
    }
    setSwipeState(null);
  }, [swipeState]);

  /* ─── NEW: quick note save ───────────────── */
  const saveQuickNote = useCallback(async () => {
    if (!quickNoteId) return;
    setEvents(prev=>prev.map(e=>e.id===quickNoteId?{...e,calendar_note:quickNoteText||null}:e));
    await supabase.from("appointments").update({calendar_note:quickNoteText||null}).eq("id",quickNoteId);
    setQuickNoteId(null); setQuickNoteText("");
  }, [quickNoteId,quickNoteText]);


  /* ─── NEW: patient global search ─────────── */
  const globalSearchDebRef = useRef<number|null>(null);
  useEffect(() => {
    if (!searchOpen) return;
    if (globalSearchDebRef.current) clearTimeout(globalSearchDebRef.current);
    globalSearchDebRef.current = window.setTimeout(async () => {
      const q=searchQuery.trim(); if (q.length<2) { setSearchResults([]); return; }
      setSearchLoading(true);
      const {data} = await supabase.from("patients")
        .select("id,first_name,last_name,phone")
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`).limit(10);
      setSearchLoading(false); setSearchResults((data??[]) as PatientLite[]);
    }, 250);
    return () => { if (globalSearchDebRef.current) clearTimeout(globalSearchDebRef.current); };
  }, [searchQuery,searchOpen]);

  /* ── WhatsApp ────────────────────────────── */
  // SENDREMINDER — versione sincrona con token conferma client-side.
  // Se il link non è in cache, generiamo un UUID in locale e lo salviamo sul server
  // in background. Così il messaggio contiene SEMPRE un link conferma funzionante.
  const sendReminder = useCallback((
    appointmentId:string, patientPhone?:string, patientFirstName?:string, isConfirmation?:boolean,
  ) => {
    if (!patientPhone) { showToast.warning("Nessun telefono registrato per questo paziente"); return; }
    const appointment = events.find(e=>e.id===appointmentId);
    if (!appointment) return;

    // Genera/recupera link conferma SEMPRE (per conferme e per promemoria).
    // Il link permette al paziente di confermare/annullare con un click.
    let linkConferma = confirmLinks[appointmentId] || "";
    if (!linkConferma) {
      const clientToken = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      linkConferma = `${window.location.origin}/conferma/${clientToken}`;
      fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_id: appointmentId, client_token: clientToken }),
      }).catch(() => {});
      setConfirmLinks(prev => ({ ...prev, [appointmentId]: linkConferma }));
    }

    const template = isConfirmation ? confirmTplCache : reminderTplCache;

    const message = buildReminderMessage({
      appointment: appointment as any,
      patientFirstName,
      template: template ?? undefined,
      isConfirmation: !!isConfirmation,
      linkConferma,
      studioAddress: currentStudio?.address,
      signatureName: getStudioBranding(currentStudio).signatureName,
      signatureTitle: getStudioBranding(currentStudio).signatureTitle,
      studioLocations,
    });

    // Apri WhatsApp via wrapper openWA che usa schema URI nativo whatsapp://
    // su iOS/Android per aprire DIRETTAMENTE l'app (no api.whatsapp.com).
    openWA(patientPhone, message);

    // Aggiorna DB in background
    const nowIso = new Date().toISOString();
    supabase.from("appointments").update({whatsapp_sent_at:nowIso,whatsapp_sent:true}).eq("id",appointmentId).then(()=>{});
    setEvents(prev=>prev.map(ev=>ev.id===appointmentId?{...ev,whatsapp_sent_at:nowIso}:ev));
    setSelectedEvent(prev=>prev?.id===appointmentId?{...prev,whatsapp_sent_at:nowIso}:prev);
  }, [events, confirmLinks, reminderTplCache, confirmTplCache, currentStudio]);

  /**
   * Apre il dialog "Promemoria settimana": carica TUTTI gli appuntamenti
   * futuri del paziente (max 30 giorni) — non si limita a quelli della
   * settimana visibile in `events`.
   */
  const openWeeklyReminder = useCallback(async (
    patientId: string,
    firstName: string,
    phone: string | null,
  ) => {
    try {
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
        showToast.error(`Errore caricamento appuntamenti: ${error.message}`);
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
      showToast.error(`Errore: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  /* ── Open / Save / Delete ────────────────── */
  const openEvent = useCallback((ev:CalendarEvent) => {
    // Per i gruppi (mig. 014) apriamo il bottom-sheet dedicato
    if (ev.is_group) {
      void openGroupModalCal(ev);
      return;
    }
    setSelectedEvent(ev); setEditStatus(ev.status);
    setEditNote(ev.calendar_note??""); setEditAmount(ev.amount==null?"":String(ev.amount));
    setEditPriceType((ev.price_type as "invoiced" | "cash") || "invoiced");
    setEditPaymentMethod((ev.payment_method as "cash" | "pos" | "bank_transfer" | null) || null);
    setEditDate(toISODateLocal(ev.start));
    setEditTime(`${pad2(ev.start.getHours())}:${pad2(ev.start.getMinutes())}`);
    setEditDuration(Math.max(15,Math.round((ev.end.getTime()-ev.start.getTime())/60_000)));
    setEditTreatmentType(ev.treatment_type ?? "seduta");

    // Pre-fetch link conferma AL MOMENTO dell'apertura del modal.
    // Marco apre il modal, guarda i dettagli (1-2 secondi), poi clicca WA → il link è pronto.
    // Se già in cache, non rifacciamo la chiamata.
    if (!confirmLinks[ev.id]) {
      (async () => {
        try {
          const r = await fetch("/api/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appointment_id: ev.id }),
          });
          const j = await r.json();
          if (r.ok && j.token) {
            setConfirmLinks(prev => ({
              ...prev,
              [ev.id]: `${window.location.origin}/conferma/${j.token}`,
            }));
          }
        } catch {}
      })();
    }
    // Carica anche i template se non ancora in cache
    if (!reminderTplCache) {
      (async () => {
        const { data } = await supabase.from("message_templates")
          .select("template").eq("name", "Promemoria").maybeSingle();
        if (data?.template) setReminderTplCache(data.template);
      })();
    }
  }, [confirmLinks, reminderTplCache, openGroupModalCal]);

  const saveEvent = useCallback(async () => {
    if (!selectedEvent) return;
    // Validazione: se fatturato, payment_method è obbligatorio SOLO se bloccante.
    let effectiveEditPM = editPaymentMethod;
    if (editPriceType === "invoiced" && !editPaymentMethod) {
      if (paymentMethodRequired) {
        showToast.warning("Seleziona il metodo di pagamento (Contanti, POS o Bonifico).");
        return;
      }
      effectiveEditPM = defaultPaymentMethod;
    }
    setBusy(true); setError("");
    const amount = editAmount.trim()===""?null
      :(()=>{const n=Number(editAmount.replace(",",".")); return isFinite(n)?n:null;})();
    const upd:Record<string,unknown>={
      status:editStatus,
      calendar_note:editNote.trim()||null,
      amount,
      price_type: editPriceType,
      payment_method: editPriceType === "invoiced" ? effectiveEditPM : null,
      treatment_type: editTreatmentType || null,
    };
    if (isValidISODate(editDate)&&isValidHHMM(editTime)) {
      const ns=buildDateTime(editDate,editTime);
      const d=Number(editDuration);
      const dur=isFinite(d)&&d>0?d:Math.round((selectedEvent.end.getTime()-selectedEvent.start.getTime())/60_000);
      const ne=new Date(ns); ne.setMinutes(ne.getMinutes()+dur);
      if (ns.getTime()!==selectedEvent.start.getTime()||ne.getTime()!==selectedEvent.end.getTime()) {
        upd.start_at=ns.toISOString(); upd.end_at=ne.toISOString();
      }
    }
    const {error:e}=await supabase.from("appointments").update(upd).eq("id",selectedEvent.id);
    if (e){setError(`Errore: ${e.message}`);setBusy(false);return;}
    const becameCancelled = editStatus === "cancelled" && selectedEvent.status !== "cancelled";
    const freedSlot = selectedEvent.start;
    setSelectedEvent(null); setBusy(false); await reloadCurrent();
    if (becameCancelled) await openWaitlistMatchesForSlot(freedSlot);
  }, [selectedEvent,editStatus,editNote,editAmount,editPriceType,editPaymentMethod,editDate,editTime,editDuration,editTreatmentType,currentDate,loadAppointments,paymentMethodRequired,defaultPaymentMethod,openWaitlistMatchesForSlot]);

  const deleteEvent = useCallback(async () => {
    if (!selectedEvent||!window.confirm("Eliminare definitivamente questo appuntamento?")) return;
    const freedSlot = selectedEvent.start; // snapshot prima dell'azzeramento
    setBusy(true); setError("");
    const {error:e}=await supabase.from("appointments").delete().eq("id",selectedEvent.id);
    if (e){setError(`Errore: ${e.message}`);setBusy(false);return;}
    setSelectedEvent(null); setBusy(false); await loadAppointments(currentDate);
    await openWaitlistMatchesForSlot(freedSlot);
  }, [selectedEvent,currentDate,loadAppointments,openWaitlistMatchesForSlot]);

  const openCreate = useCallback((prefillTime?:string, prefillDateISO?:string) => {
    setCreateOpen(true); setError("");
    setSelectedPatient(null); setPatientQuery(""); setPatientResults([]);
    setQuickFirstName(""); setQuickLastName(""); setQuickPhone("");
    const dateISO=prefillDateISO&&isValidISODate(prefillDateISO)?prefillDateISO:toISODateLocal(currentDate);
    setCreateDate(dateISO);
    setCreateTime(prefillTime&&isValidHHMM(prefillTime)?prefillTime:"09:00");
    setCreateDuration(60); setCreateStatus(defaultStatus); setCreateLocation("studio");
    setCreateClinicSite(currentStudio?.name || ""); setCreateDomicileAddress(""); setCreateAmount(""); setCreateNote("");
    setCreateTreatmentType(treatmentCatalog[0]?.key ?? "seduta");
    setSelectedPackageId(null); // mig. 014_packages
  }, [currentDate, defaultStatus, treatmentCatalog]);

  /* ── Patient search (create) ─────────────── */
  const debRef = useRef<number|null>(null);
  useEffect(() => {
    if (!createOpen) return;
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current=window.setTimeout(async () => {
      const q=patientQuery.trim(); if (q.length<2){setPatientResults([]);return;}
      setPatientLoading(true);
      const {data,error:e}=await supabase.from("patients")
        .select("id,first_name,last_name,phone")
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`).limit(8);
      setPatientLoading(false); setPatientResults(e?[]:(data??[]) as PatientLite[]);
    }, 250);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [patientQuery,createOpen]);

  const createQuickPatient = useCallback(async () => {
    const fn=quickFirstName.trim();const ln=quickLastName.trim();const ph=quickPhone.trim();
    if (!fn||!ln){setError("Inserisci Nome e Cognome.");return;}
    setBusy(true);setError("");
    // Recupero utente e studio (richiesti dalle RLS multi-tenancy)
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;
    if (!userId || !currentStudioId) {
      setError("Sessione o studio non disponibili. Ricarica la pagina.");
      setBusy(false);
      return;
    }
    const {data,error:e}=await supabase.from("patients")
      .insert({
        first_name:fn,
        last_name:ln,
        phone:ph||null,
        owner_id: userId,
        studio_id: currentStudioId,
      })
      .select("id,first_name,last_name,phone").single();
    if (e){setError(e.message);setBusy(false);return;}
    const p=data as PatientLite;
    setSelectedPatient(p);setPatientQuery(`${p.first_name??""} ${p.last_name??""}`.trim());
    setPatientResults([]);setBusy(false);
  }, [quickFirstName,quickLastName,quickPhone,currentStudioId]);

  // ─── Quick patient core per gruppo (mig. 015) ─────────────────────
  // Usato sia in fase di creazione gruppo (CreateAppointmentMobileModal)
  // sia in aggiunta partecipanti a gruppo esistente (GroupEventModalMobile).
  // Crea il paziente con tenancy e lo restituisce; il chiamante decide
  // come usarlo. NON tocca selectedPatient (che è per il flusso singolo).
  const createQuickPatientCoreMobile = useCallback(async (
    payload: { first_name: string; last_name: string; phone: string | null }
  ): Promise<PatientLite | null> => {
    if (!currentStudioId) {
      setError("Studio non disponibile. Riprova tra un momento.");
      return null;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;
    if (!userId) {
      setError("Sessione scaduta. Effettua di nuovo il login.");
      return null;
    }
    const { data, error: e } = await supabase
      .from("patients")
      .insert({
        first_name: payload.first_name,
        last_name: payload.last_name,
        phone: payload.phone,
        owner_id: userId,
        studio_id: currentStudioId,
      })
      .select("id,first_name,last_name,phone")
      .single();
    if (e) {
      setError("Errore creazione paziente: " + e.message);
      return null;
    }
    return data as PatientLite;
  }, [currentStudioId]);

  const [createRecurring, setCreateRecurring] = useState(false);
  const [createRecurringCount, setCreateRecurringCount] = useState(6);
  const [createRecurringInterval, setCreateRecurringInterval] = useState(2); // giorni tra sedute

  // ─── Stato gruppo (mig. 014) ─────────────────────────────────────────────
  const [createIsGroup, setCreateIsGroup] = useState(false);
  const [createGroupTitle, setCreateGroupTitle] = useState("");
  const [createGroupMax, setCreateGroupMax] = useState("6");
  const [createGroupPrice, setCreateGroupPrice] = useState("15.00");

  // ─── Step 6.1: partecipanti iniziali ──────────────────────────────────────
  const [createInitialParticipants, setCreateInitialParticipants] = useState<
    Array<{ id: string; first_name: string | null; last_name: string | null; phone?: string | null }>
  >([]);

  // ─── Pacchetto sedute selezionato (mig. 014_packages) ─────────────────────
  // Se valorizzato, l'appuntamento da creare scalerà una seduta dal pacchetto.
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  // Carica i default da practice_settings (per pre-popolare prezzo/max gruppo)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("practice_settings")
        .select("default_group_price, default_group_max_participants")
        .eq("owner_id", uid)
        .maybeSingle();
      if (cancelled) return;
      if (data?.default_group_price != null) {
        setCreateGroupPrice(Number(data.default_group_price).toFixed(2));
      }
      if (data?.default_group_max_participants != null) {
        setCreateGroupMax(String(data.default_group_max_participants));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const createAppointment = useCallback(async () => {
    // Validazione: caso GRUPPO o caso SINGOLO (mig. 014)
    if (createIsGroup) {
      if (!createGroupTitle.trim()) {
        setError("Inserisci un titolo per il gruppo (es. \"Posturale\").");
        return;
      }
      const maxN = parseInt(createGroupMax, 10);
      if (isNaN(maxN) || maxN < 2) {
        setError("Numero massimo partecipanti non valido (minimo 2).");
        return;
      }
      const pricePP = parseFloat(createGroupPrice.replace(",", "."));
      if (isNaN(pricePP) || pricePP < 0) {
        setError("Prezzo per persona non valido.");
        return;
      }
      // Step 6.1: validazione partecipanti iniziali
      if (createInitialParticipants.length > maxN) {
        setError(`Hai selezionato ${createInitialParticipants.length} partecipanti, ma il massimo è ${maxN}.`);
        return;
      }
    } else {
      if (!selectedPatient){setError("Seleziona un paziente.");return;}
    }
    const dur=Number(createDuration);
    if (!isFinite(dur)||dur<=0){setError("Durata non valida.");return;}
    // Validazione: se fatturato, payment_method è obbligatorio SOLO se bloccante (skip per gruppi)
    let effectiveCreatePM = createPaymentMethod;
    if (!createIsGroup && createPriceType === "invoiced" && !createPaymentMethod) {
      if (paymentMethodRequired) {
        setError("Seleziona il metodo di pagamento (Contanti, POS o Bonifico).");
        return;
      }
      effectiveCreatePM = defaultPaymentMethod;
    }
    setBusy(true);setError("");
    // Recupero userId per owner_id (coerenza multi-tenancy + RLS)
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;
    if (!userId || !currentStudioId) {
      setError("Sessione o studio non disponibili. Ricarica la pagina.");
      setBusy(false);
      return;
    }
    const amount=createAmount.trim()===""?null
      :(()=>{const n=Number(createAmount.replace(",",".")); return isFinite(n)?n:null;})();

    // Build list of appointments (1 o più se ricorrente)
    const toInsert:any[] = [];
    const totalCount = createRecurring ? Math.max(1, Math.min(30, createRecurringCount)) : 1;
    for (let i=0; i<totalCount; i++) {
      const baseDate = new Date(buildDateTime(createDate,createTime));
      baseDate.setDate(baseDate.getDate() + i*createRecurringInterval);
      const end = new Date(baseDate); end.setMinutes(end.getMinutes()+dur);
      if (createIsGroup) {
        // ─── GRUPPO: patient_id=null + is_group=true (mig. 014) ──────────
        toInsert.push({
          patient_id: null,
          start_at: baseDate.toISOString(),
          end_at: end.toISOString(),
          status: createStatus,
          calendar_note: createNote.trim() || null,
          location: createLocation,
          clinic_site: createLocation==="studio"?(createClinicSite.trim()||currentStudio?.name||"Studio"):null,
          location_id: (createLocation==="studio" && currentStudio?.multi_location_enabled && createLocationId) ? createLocationId : null,
          domicile_address: createLocation==="domicile"?(createDomicileAddress.trim()||null):null,
          amount: null,
          price_type: null,
          payment_method: null,
          treatment_type: null,
          owner_id: userId,
          studio_id: currentStudioId,
          // Campi gruppo
          is_group: true,
          group_title: createGroupTitle.trim(),
          group_max_participants: parseInt(createGroupMax, 10),
          group_price_per_person: parseFloat(createGroupPrice.replace(",", ".")),
        });
      } else {
        toInsert.push({
          patient_id:selectedPatient!.id,
          start_at:baseDate.toISOString(),
          end_at:end.toISOString(),
          status:createStatus,
          calendar_note:createNote.trim()||null,
          location:createLocation,
          clinic_site:createLocation==="studio"?(createClinicSite.trim()||currentStudio?.name||"Studio"):null,
          location_id: (createLocation==="studio" && currentStudio?.multi_location_enabled && createLocationId) ? createLocationId : null,
          domicile_address:createLocation==="domicile"?(createDomicileAddress.trim()||null):null,
          // Se la seduta scala da un pacchetto, niente importo o metodo (vive sui package_payments)
          amount: selectedPackageId ? null : amount,
          price_type: createPriceType,
          payment_method: selectedPackageId ? null : (createPriceType === "invoiced" ? effectiveCreatePM : null),
          treatment_type: createTreatmentType || null,
          package_id: selectedPackageId,           // mig. 014_packages
          owner_id: userId,                // multi-tenancy
          studio_id: currentStudioId,      // multi-tenancy
        });
      }
    }
    // Overlap check
    if (overlapMode !== "visual" && !createRecurring) {
      const startDt = new Date(buildDateTime(createDate, createTime));
      const endDt = new Date(startDt); endDt.setMinutes(endDt.getMinutes() + Number(createDuration));
      const conflict = events.find(ev =>
        ev.status !== "cancelled" &&
        ev.start < endDt && ev.end > startDt
      );
      if (conflict) {
        const t = (d: Date) => d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
        const msg = `Sovrapposizione con ${conflict.patient_name} (${t(conflict.start)}-${t(conflict.end)})`;
        if (overlapMode === "block") {
          setError("⛔ " + msg + " — modifica l'orario.");
          setBusy(false); return;
        }
        if (overlapMode === "warn") {
          const ok = window.confirm("⚠️ " + msg + "\n\nVuoi procedere comunque?");
          if (!ok) { setBusy(false); return; }
        }
      }
    }

    const {data:inserted, error:e} = await supabase
      .from("appointments")
      .insert(toInsert)
      .select("id, start_at");
    if (e){setError(e.message);setBusy(false);return;}

    // ─── Step 6.1: insert partecipanti iniziali per i gruppi ──
    // Per i ricorrenti, replica i partecipanti su tutte le occorrenze
    // (modalità "closed" implicita su mobile, niente toggle qui).
    if (createIsGroup && createInitialParticipants.length > 0 && inserted && inserted.length > 0) {
      const pricePP = parseFloat(createGroupPrice.replace(",", "."));
      const allPartRows: Array<Record<string, unknown>> = [];
      for (const a of inserted) {
        for (const p of createInitialParticipants) {
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
        console.error("[calendar-mobile-create-group] errore partecipanti:", partErr);
        showToast.warning(
          `Gruppo creato, ma errore nell'aggiungere i partecipanti: ${partErr.message}. ` +
          `Puoi aggiungerli dalla scheda del gruppo.`
        );
      }
    }

    setBusy(false);
    setCreateOpen(false);
    setCreateRecurring(false); // reset for next
    setCreateInitialParticipants([]); // step 6.1: reset participants
    await loadAppointments(currentDate);

    // ── Modal conferma WhatsApp (solo se: 1 solo appuntamento + paziente ha telefono) ──
    // Stesso comportamento del calendar desktop: appare la modale che chiede
    // se inviare il messaggio di conferma con i link conferma/annulla.
    // Per i gruppi (mig. 014) NON mostriamo questa modale: i promemoria a tutti
    // i partecipanti vengono inviati dopo dal GroupEventModalMobile.
    if (
      !createIsGroup &&
      !createRecurring &&
      inserted && inserted.length === 1 &&
      selectedPatient &&
      selectedPatient.phone &&
      selectedPatient.phone.trim().length > 0
    ) {
      setJustCreatedAppt({
        id: inserted[0].id as string,
        start: new Date(inserted[0].start_at as string),
        patientPhone: selectedPatient.phone,
        patientFirstName: selectedPatient.first_name || "",
        patientLastName: selectedPatient.last_name || "",
      });
      setShowWhatsAppConfirm(true);
    }
  }, [selectedPatient,createDuration,createDate,createTime,createStatus,createNote,
      createLocation,createClinicSite,createDomicileAddress,createAmount,
      createPriceType,createPaymentMethod,createTreatmentType,currentStudioId,currentDate,loadAppointments,
      createRecurring,createRecurringCount,createRecurringInterval,overlapMode,events,
      paymentMethodRequired,defaultPaymentMethod,
      createLocationId,
      // Gruppo (mig. 014)
      createIsGroup,createGroupTitle,createGroupMax,createGroupPrice,currentStudio]);

  /* ── Move appointment (drag) ─────────────── */
  const moveAppointment = useCallback(async (id:string,newStart:Date) => {
    const ev=events.find(x=>x.id===id);if (!ev) return;
    const durMin=Math.max(15,Math.round((ev.end.getTime()-ev.start.getTime())/60_000));
    const newEnd=new Date(newStart);newEnd.setMinutes(newEnd.getMinutes()+durMin);
    setBusy(true);setError("");
    setEvents(prev=>prev.map(x=>x.id===id?{...x,start:newStart,end:newEnd}:x));
    const {error:e}=await supabase.from("appointments")
      .update({start_at:newStart.toISOString(),end_at:newEnd.toISOString()}).eq("id",id);
    if (e){setError(e.message);await loadAppointments(currentDate);}
    else await loadAppointments(currentDate);
    setBusy(false);
  }, [events,currentDate,loadAppointments]);

  /* ── Mouse drag ──────────────────────────── */
  const handleDragOver = useCallback((e:React.DragEvent<HTMLDivElement>) => {
    if (!draggingId) return;e.preventDefault();
    const el=timelineRef.current;if (!el) return;
    setDragOverY(e.clientY-el.getBoundingClientRect().top);
  }, [draggingId]);
  const handleDrop = useCallback(async (e:React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const id=e.dataTransfer.getData("text/appointment-id")||draggingId;
    setDragOverY(null);setDraggingId(null);
    const el=timelineRef.current;if (!el||!id) return;
    const y=e.clientY-el.getBoundingClientRect().top;
    const totalMin=clamp(roundTo(y/(PX_PER_HOUR/60),5),0,(dayEndHour-dayStartHour)*60-5);
    const base=new Date(currentDate);base.setHours(dayStartHour,0,0,0);
    const ns=new Date(base);ns.setMinutes(ns.getMinutes()+totalMin);
    await moveAppointment(id,ns);
  }, [draggingId,currentDate,dayStartHour,dayEndHour,moveAppointment]);

  /* ── Touch drag ──────────────────────────── */
  const handleEventTouchStart = useCallback((e:React.TouchEvent,ev:CalendarEvent) => {
    const {top}=getEventPosition(ev.start,ev.end);
    const state:TouchDragState={
      eventId:ev.id,startClientY:e.touches[0].clientY,startEventTopPx:top,activated:false,
      activationTimer:setTimeout(()=>{
        if (touchDragRef.current?.eventId===ev.id){
          touchDragRef.current.activated=true;setTouchDraggingId(ev.id);setTouchDragY(top);
        }
      },300),
    };
    touchDragRef.current=state;
  }, [getEventPosition]);
  const handleTimelineTouchMove = useCallback((e:React.TouchEvent) => {
    const state=touchDragRef.current;if (!state) return;
    const dy=e.touches[0].clientY-state.startClientY;
    if (!state.activated){
      if (Math.abs(dy)>8){if (state.activationTimer) clearTimeout(state.activationTimer);touchDragRef.current=null;}
      return;
    }
    e.preventDefault();
    setTouchDragY(clamp(state.startEventTopPx+dy,0,(dayEndHour-dayStartHour)*PX_PER_HOUR));
  }, [dayStartHour,dayEndHour]);
  const handleTimelineTouchEnd = useCallback(async () => {
    const state=touchDragRef.current;touchDragRef.current=null;
    if (state?.activationTimer) clearTimeout(state.activationTimer);
    const finalY=touchDragYRef.current;
    setTouchDraggingId(null);setTouchDragY(null);
    if (!state?.activated||finalY===null) return;
    const totalMin=clamp(roundTo(finalY/(PX_PER_HOUR/60),5),0,(dayEndHour-dayStartHour)*60-5);
    const base=new Date(currentDate);base.setHours(dayStartHour,0,0,0);
    const ns=new Date(base);ns.setMinutes(ns.getMinutes()+totalMin);
    await moveAppointment(state.eventId,ns);
  }, [currentDate,dayStartHour,dayEndHour,moveAppointment]);

  /* ── Logout ──────────────────────────────── */
  async function handleLogout() {
    try{await supabase.auth.signOut();}finally{setUserMenuOpen(false);window.location.href="/login";}
  }

  /* ─── NEW: event card con swipe actions ──── */
  const renderEventCard = useCallback((ev:CalendarEvent, lanePos?: { lane: number; totalLanes: number; hidden?: number; hiddenIds?: string[] }) => {
    const {top,height}=getEventPosition(ev.start,ev.end);
    const col        = statusColor(ev.status);
    const bg         = ev.is_group
      ? "linear-gradient(135deg, #0d9488 0%, #06b6d4 100%)"
      : ev.location==="domicile" ? "rgba(13,148,136,0.06)" : statusBg(ev.status);
    const phoneOk    = !!normalizePhone(ev.patient_phone);
    const isDragging = touchDraggingId===ev.id;
    const displayTop = isDragging&&touchDragY!==null?touchDragY:top;
    const short      = height<52;
    const waSent     = !!ev.whatsapp_sent_at;
    const isPast     = ev.end<currentTime && ev.status!=="done" && ev.status!=="cancelled";
    const swipeX     = swipeState?.id===ev.id?swipeState.x:0;
    const lane       = lanePos?.lane ?? 0;
    const totalLanes = lanePos?.totalLanes ?? 1;
    const hidden     = lanePos?.hidden ?? 0;
    const hiddenIds  = lanePos?.hiddenIds ?? [];

    // Multi-sede (mig. 014, fase 3)
    const locStyle = getLocationCardStyle(ev as any, studioLocations as any);

    return (
      <div
        key={ev.id}
        style={{
          position:"absolute",
          // 52px sidebar a sx, 8px gap a dx; lo spazio rimanente è diviso per totalLanes
          left: totalLanes > 1
            ? `calc(52px + ${lane} * ((100% - 60px) / ${totalLanes}))`
            : 52,
          width: totalLanes > 1
            ? `calc((100% - 60px) / ${totalLanes} - 2px)`
            : undefined,
          right: totalLanes > 1 ? undefined : 8,
          top:displayTop,height,
          zIndex:isDragging?10:3,touchAction:"none",
        }}
      >
        {/* Sfondo azioni swipe */}
        <div style={{
          position:"absolute",inset:0,borderRadius:8,
          display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"0 14px",pointerEvents:"none",
        }}>
          <span style={{opacity:swipeX>20?Math.min((swipeX-20)/60,1):0,display:"flex"}}><Icon name="check" size={18} color={THEME.green} strokeWidth={2.4} /></span>
          <span style={{opacity:swipeX<-20?Math.min((-swipeX-20)/60,1):0,display:"flex"}}><Icon name="edit" size={17} color={THEME.amber} /></span>
        </div>

        {/* Card */}
        <div
          draggable
          onDragStart={e=>{setDraggingId(ev.id);try{e.dataTransfer.setData("text/appointment-id",ev.id);}catch{}e.dataTransfer.effectAllowed="move";}}
          onDragEnd={()=>{setDraggingId(null);setDragOverY(null);}}
          onTouchStart={e=>{handleEventTouchStart(e,ev);handleCardSwipeStart(e,ev);}}
          onTouchMove={e=>handleCardSwipeMove(e,ev)}
          onTouchEnd={e=>{handleTimelineTouchEnd();handleCardSwipeEnd(ev);}}
          onClick={e=>{if((e.target as HTMLElement).closest(".ev-act")) return;if(isDragging||Math.abs(swipeX)>5) return;openEvent(ev);}}
          style={{
            position:"absolute",inset:0,
            background:bg,
            border: locStyle.borderColor
              ? `2px solid ${locStyle.borderColor}`
              : `1.5px solid ${ev.location==="domicile"?"rgba(13,148,136,0.2)":col+"30"}`,
            borderRadius:8,padding:short?"4px 10px":"8px 10px",
            boxSizing:"border-box",overflow:"hidden",
            boxShadow:isDragging?"0 8px 24px rgba(15,23,42,0.18)":"0 1px 4px rgba(15,23,42,0.06)",
            display:"flex",flexDirection:short?"row":"column",
            alignItems:short?"center":"flex-start",gap:short?8:4,
            cursor:"pointer",
            opacity:isDragging?0.2:isPast?0.65:1,
            transform:`translateX(${swipeX}px)`,
            transition:isDragging||Math.abs(swipeX)>0?"none":"transform 0.2s,box-shadow 0.15s",
          }}
        >
          {/* Badge sede multi-sede (mig. 014, fase 3) */}
          {locStyle.initials && (
            <span
              title={locStyle.locationName ?? undefined}
              style={{
                position:"absolute",
                top:3, right:3,
                background: locStyle.borderColor ?? undefined,
                color:"#fff",
                fontSize:9, fontWeight:800,
                padding:"1px 5px",
                borderRadius:3,
                letterSpacing:0.3,
                lineHeight:1.1,
                pointerEvents:"none",
                zIndex:1,
              }}
            >
              {locStyle.initials}
            </span>
          )}
          {/* Nome + 🏠 badge / GRUPPO badge */}
          <div style={{display:"flex",alignItems:"center",gap:5,flex:1,minWidth:0,overflow:"hidden"}}>
            {ev.is_group && (
              <span style={{
                fontSize: 9, fontWeight: 800, color: "#fff",
                background: "rgba(255,255,255,0.25)",
                padding: "1px 6px", borderRadius: 99,
                letterSpacing: 0.4, flexShrink: 0,
              }}>
                <Icon name="users" size={10} color="currentColor" style={{display:"inline-block",verticalAlign:-1,marginRight:3}} />{ev.participant_count ?? 0}/{ev.group_max_participants ?? 0}
              </span>
            )}
            {ev.location==="domicile"&&!ev.is_group&&<Icon name="home" size={11} color={THEME.warm400} style={{flexShrink:0}} />}
            <span style={{
              fontWeight:700, fontSize:13,
              color: ev.is_group ? "#fff" : THEME.text,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
            }}>
              {ev.is_group ? (ev.group_title || "Gruppo") : ev.patient_name}
            </span>
            {ev.package_id && !ev.is_group && <PackageBadge packageId={ev.package_id} variant="compact" />}
            {isPast&&<span style={{fontSize:9,color:THEME.muted,flexShrink:0,background:THEME.panelSoft,padding:"1px 5px",borderRadius:99,border:`1px solid ${THEME.border}`}}>scaduto</span>}
          </div>

          {!short&&(
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",gap:6}}>
              <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",minWidth:0}}>
                <span style={{fontSize:11,color:THEME.muted,whiteSpace:"nowrap"}}>
                  {fmtTime(ev.start)}–{fmtTime(ev.end)}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); setStatusSheetFor(ev); }}
                  style={{fontSize:10,fontWeight:700,border:"none",cursor:"pointer",lineHeight:1.5,
                    color: ev.is_paid ? THEME.tealDeep : ev.status === "done" ? "#854F0B" : col,
                    background: ev.is_paid ? THEME.tealTint : ev.status === "done" ? THEME.amberTint : `${col}18`,
                    padding:"2px 8px",borderRadius:99,whiteSpace:"nowrap"}}>
                  {ev.is_paid ? "Pagato" : ev.status === "done" ? "Da saldare" : statusLabel(ev.status)}
                </button>
              </div>
              {/* Azioni rapide */}
              <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
                {/* Pagamento — micro icon button con popover */}
                <div onClick={e => e.stopPropagation()}>
                  <PaidIconButton
                    data={{
                      is_paid: ev.is_paid,
                      paid_at: ev.paid_at,
                      payment_method: ev.payment_method as PaymentMethod | null,
                      price_type: ev.price_type,
                    }}
                    onUpdate={async (next) => handleUpdatePayment(ev.id, next)}
                    tone="dark"
                    size={26}
                  />
                </div>
                {/* Nota rapida */}
                <button className="ev-act"
                  title="Nota rapida"
                  onClick={e=>{e.stopPropagation();setQuickNoteId(ev.id);setQuickNoteText(ev.calendar_note??"");}}
                  style={{
                    width:26,height:26,borderRadius:99,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                    border:`1px solid ${ev.calendar_note?THEME.amber:THEME.border}`,
                    background:ev.calendar_note?"rgba(249,115,22,0.08)":THEME.panelBg,
                    cursor:"pointer",fontSize:12,
                  }}>
                  <Icon name="edit" size={12} color={ev.calendar_note?THEME.amber:THEME.warm500} />
                </button>
                {/* WA */}
                <button className="ev-act"
                  disabled={!phoneOk}
                  title={waSent?`WA inviato il ${new Date(ev.whatsapp_sent_at!).toLocaleDateString("it-IT")}`:"Invia promemoria WhatsApp"}
                  onClick={e=>{e.stopPropagation();if(phoneOk)sendReminder(ev.id,ev.patient_phone??undefined,ev.patient_first_name??undefined);}}
                  style={{
                    width:28,height:28,borderRadius:10,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                    border:"1px solid #CBE8D5",
                    background:THEME.greenTint,position:"relative",
                    cursor:phoneOk?"pointer":"not-allowed",opacity:phoneOk?1:0.35,padding:0,
                  }}>
                  <Icon name="whatsapp" size={15} color={THEME.green} />
                  {waSent && (
                    <span style={{position:"absolute",top:-4,right:-4,width:13,height:13,borderRadius:"50%",
                      background:THEME.green,display:"flex",alignItems:"center",justifyContent:"center",
                      border:"1.5px solid #fff"}}>
                      <Icon name="check" size={8} color="#fff" strokeWidth={3.2} />
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

          {short&&(
            <span style={{fontSize:10,color:THEME.muted,flexShrink:0}}>{fmtTime(ev.start)}</span>
          )}
        </div>
        {/* Badge "+N altri" — quando questa card "ingloba" altri eventi
            nascosti per via del limite max 3 lane visibili */}
        {hidden > 0 && (
          <div
            onClick={e => {
              e.stopPropagation();
              const allOverlapping = [ev.id, ...hiddenIds];
              const names = allOverlapping
                .map(id => events.find(x => x.id === id))
                .filter(Boolean)
                .map(x => `• ${fmtTime(x!.start)} — ${x!.patient_name}`)
                .join("\n");
              showToast.info(`${1 + hidden} appuntamenti sovrapposti: ${names.replace(/\n/g, " · ")}`);
            }}
            style={{
              position: "absolute",
              top: 4, right: 4,
              background: "rgba(255,255,255,0.95)",
              color: statusBg(ev.status),
              padding: "2px 8px",
              borderRadius: 99,
              fontSize: 10,
              fontWeight: 800,
              cursor: "pointer",
              zIndex: 5,
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            }}
            title={`+${hidden} altri appuntamenti sovrapposti`}
          >
            +{hidden}
          </div>
        )}
      </div>
    );
  }, [getEventPosition,touchDraggingId,touchDragY,draggingId,currentTime,swipeState,
      events, studioLocations,
      handleEventTouchStart,handleCardSwipeStart,handleCardSwipeMove,handleCardSwipeEnd,
      handleTimelineTouchEnd,openEvent,togglePaid,sendReminder]);

  const isToday = isSameDay(currentDate,new Date());

  /* ─── RENDER ─────────────────────────────── */
  return (
    <div
      style={{minHeight:"100vh",background:THEME.appBg,paddingBottom:BOTTOM_TAB_H+16,
              fontFamily:"'Inter',-apple-system,system-ui,sans-serif",
              overflowX:"hidden",maxWidth:"100vw"}}
      onTouchStart={handlePullStart}
      onTouchMove={handlePullMove}
      onTouchEnd={handlePullEnd}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      {/* ━━━ Pull-to-refresh indicator ━━━ */}
      {(isPulling||isRefreshing)&&(
        <div style={{
          position:"fixed",top:54,left:"50%",transform:"translateX(-50%)",zIndex:50,
          background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
          borderRadius:99,padding:"6px 16px",fontSize:12,fontWeight:700,
          color:THEME.blue,boxShadow:"0 4px 12px rgba(15,23,42,0.12)",
          display:"flex",alignItems:"center",gap:6,
          transition:"opacity 0.2s",
        }}>
          <span style={{display:"inline-block",animation:isRefreshing?"spin 0.7s linear infinite":undefined}}>
            {isRefreshing?"↻":"↓"}
          </span>
          {isRefreshing?"Aggiornamento…":`Trascina ancora (${Math.round(Math.min(pullY/PULL_THRESHOLD*100,100))}%)`}
        </div>
      )}

      {/* ━━━ NAVBAR ━━━ */}
      <header style={{
        position:"sticky",top:0,zIndex:30,
        background:THEME.gradient,padding:"0 14px",height:54,
        display:"flex",alignItems:"center",justifyContent:"space-between",
        boxShadow:"0 2px 12px rgba(13,148,136,0.18)",gap:10,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <div style={{width:30,height:30,borderRadius:"50%",background:"rgba(255,255,255,0.18)",
            border:"1.5px solid rgba(255,255,255,0.5)",display:"flex",alignItems:"center",
            justifyContent:"center",flexShrink:0}}>
            <Icon name="pulse" size={16} color="#fff" strokeWidth={2.2} />
          </div>
          <span style={{fontWeight:700,fontSize:15,color:"#fff",letterSpacing:"-0.02em"}}>
            FisioHub
          </span>
        </div>

        {/* KPI chips */}
        {!loading&&(
          <div style={{display:"flex",gap:5,alignItems:"center"}}>
            <span style={{fontSize:11,fontWeight:700,color:"#fff",background:"rgba(255,255,255,0.2)",
              padding:"4px 8px",borderRadius:6,border:"1px solid rgba(255,255,255,0.15)",whiteSpace:"nowrap"}}>
              <Icon name="check" size={11} color="#fff" style={{ display: "inline-block", verticalAlign: -1, marginRight: 3 }} />{dayStats.done}/{dayStats.total}
            </span>
            <span style={{fontSize:11,fontWeight:700,color:"#fff",background:"rgba(255,255,255,0.2)",
              padding:"4px 8px",borderRadius:6,border:"1px solid rgba(255,255,255,0.15)",whiteSpace:"nowrap"}}>
              € {dayStats.revenue.toFixed(0)}
            </span>
          </div>
        )}

        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {/* Ricerca paziente */}
          <button onClick={()=>{setSearchOpen(true);setSearchQuery("");setSearchResults([]);}} aria-label="Cerca paziente" style={{
            width:34,height:34,borderRadius:10,border:"none",
            background:"transparent",cursor:"pointer",padding:0,
            display:"flex",alignItems:"center",justifyContent:"center",
          }}><Icon name="search" size={18} color="rgba(255,255,255,0.92)" /></button>

          {/* Bell notifiche conferme/annullamenti pazienti (Fase N2) */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <NotificationsBell
              enabled={currentStudio?.notify_bell_enabled !== false}
              dropdownAlign="right"
              onAppointmentClick={(apptId) => {
                const ev = events.find(e => e.id === apptId);
                if (ev?.start) {
                  setCurrentDate(new Date(ev.start));
                }
              }}
            />
          </div>

          <div ref={userMenuRef} style={{position:"relative"}}>
            <button onClick={()=>setUserMenuOpen(v=>!v)} style={{
              width:30,height:30,borderRadius:"50%",border:"1.5px solid rgba(255,255,255,0.35)",
              background:"rgba(255,255,255,0.2)",color:"#fff",fontWeight:800,fontSize:11,
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
            }}>{userInitials}</button>
            {userMenuOpen&&(
              <div style={{position:"absolute",right:0,top:"calc(100% + 8px)",width:210,
                background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
                borderRadius:12,boxShadow:"0 12px 32px rgba(30,64,175,0.15)",overflow:"hidden",zIndex:60}}>
                {/* Voce Agenda Ospiti smart (mig. 029) */}
                {hasGuests && showIndexLink && (
                  <Link href="/ospiti" onClick={()=>setUserMenuOpen(false)} style={{
                    display:"flex",alignItems:"center",gap:8,padding:"12px 16px",
                    color:THEME.text,textDecoration:"none",fontSize:13,fontWeight:600,
                    borderBottom:`1.5px solid ${THEME.border}`,
                  }}>📋 Agenda Ospiti</Link>
                )}
                {hasGuests && !showIndexLink && singleGuest && (
                  <Link href={`/ospiti/${singleGuest.id}`} onClick={()=>setUserMenuOpen(false)} style={{
                    display:"flex",alignItems:"center",gap:8,padding:"12px 16px",
                    color:THEME.text,textDecoration:"none",fontSize:13,fontWeight:600,
                    borderBottom:`1.5px solid ${THEME.border}`,
                  }}>📋 Agenda {singleGuest.first_name}</Link>
                )}
                {hasGuests && !showIndexLink && multipleGuests && (
                  <>
                    <button
                      type="button"
                      onClick={() => setGuestSubmenuOpen(o => !o)}
                      style={{
                        width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
                        padding:"12px 16px", background:"transparent", border:"none",
                        cursor:"pointer", color:THEME.text, fontSize:13, fontWeight:600,
                        borderBottom:`1.5px solid ${THEME.border}`, textAlign:"left",
                      }}
                    >
                      <span>📋 Agenda Ospiti</span>
                      <span style={{ fontSize: 10, color: THEME.muted }}>
                        {guestSubmenuOpen ? "▾" : "▸"}
                      </span>
                    </button>
                    {guestSubmenuOpen && (
                      <div style={{ borderBottom: `1.5px solid ${THEME.border}` }}>
                        {multipleGuests.map(g => (
                          <Link
                            key={g.id}
                            href={`/ospiti/${g.id}`}
                            onClick={() => setUserMenuOpen(false)}
                            style={{
                              display:"flex", alignItems:"center", gap:8,
                              padding:"10px 16px 10px 32px",
                              color:THEME.text, fontSize:12, fontWeight:600,
                              background:"#FFFDF9", textDecoration:"none",
                            }}
                          >
                            <span style={{
                              width:8, height:8, borderRadius:"50%",
                              background: g.display_color || "#DB2777", flexShrink:0,
                            }} />
                            <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {g.first_name} {g.last_name}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <Link href="/settings" onClick={()=>setUserMenuOpen(false)} style={{
                  display:"flex",alignItems:"center",gap:8,padding:"12px 16px",
                  color:THEME.text,textDecoration:"none",fontSize:13,fontWeight:600,
                  borderBottom:`1.5px solid ${THEME.border}`,
                }}>Impostazioni</Link>
                  <Link href="/contabilita" onClick={()=>setUserMenuOpen(false)} style={{
                    display:"block",padding:"10px 14px",fontSize:14,fontWeight:600,
                    color:THEME.text,textDecoration:"none",borderTop:`1px solid ${THEME.line}`,
                  }}>Contabilità</Link>
                <button onClick={handleLogout} style={{
                  width:"100%",display:"flex",alignItems:"center",gap:8,
                  padding:"12px 16px",background:"transparent",border:"none",
                  cursor:"pointer",color:THEME.red,fontWeight:600,fontSize:13,
                }}>⏻ Logout</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Tab bar — prima la forniva il layout /mobile, ora la pagina */}
      {statusSheetFor && (
        <StatusSheet
          open
          patientName={statusSheetFor.is_group ? (statusSheetFor.group_title || "Gruppo") : statusSheetFor.patient_name}
          time={fmtTime(statusSheetFor.start)}
          treatment={statusSheetFor.treatment_type}
          amount={typeof statusSheetFor.amount === "number" ? statusSheetFor.amount : null}
          currentMethod={(statusSheetFor.payment_method as PaymentMethod | null) ?? null}
          isPaid={!!statusSheetFor.is_paid}
          busy={statusSaving}
          onAction={(action) => handleSheetAction(statusSheetFor, action)}
          onClose={() => setStatusSheetFor(null)}
        />
      )}

      <MobileTabBar />

      {/* ━━━ CONTENUTO ━━━ */}
      <div style={{padding:"10px 14px 0"}}>

        {/* ─── Toggle Giorno / Mese ─── */}
        <div style={{display:"flex",gap:0,marginBottom:8,background:THEME.panelBg,
          border:`1.5px solid ${THEME.border}`,borderRadius:10,overflow:"hidden"}}>
          <button onClick={()=>setViewMode("day")} style={{
            flex:1,padding:"9px 0",border:"none",cursor:"pointer",fontWeight:700,fontSize:13,
            background:viewMode==="day"?"linear-gradient(135deg,#0d9488,#2563eb)":THEME.panelBg,
            color:viewMode==="day"?"#fff":THEME.muted,
          }}>Giorno</button>
          <button onClick={()=>setViewMode("week")} style={{
            flex:1,padding:"9px 0",border:"none",cursor:"pointer",fontWeight:700,fontSize:13,
            background:viewMode==="week"?"linear-gradient(135deg,#0d9488,#2563eb)":THEME.panelBg,
            color:viewMode==="week"?"#fff":THEME.muted,
          }}>Settimana</button>
          <button onClick={()=>setViewMode("month")} style={{
            flex:1,padding:"9px 0",border:"none",cursor:"pointer",fontWeight:700,fontSize:13,
            background:viewMode==="month"?"linear-gradient(135deg,#0d9488,#2563eb)":THEME.panelBg,
            color:viewMode==="month"?"#fff":THEME.muted,
          }}>Mese</button>
        </div>

        {/* ─── Barra navigazione data ─── */}
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
          <button onClick={goPrev} aria-label="Precedente" style={{
            padding:"9px 12px",borderRadius:10,flexShrink:0,
            border:`1px solid ${THEME.line}`,background:THEME.panelBg,
            cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center",
          }}><Icon name="chevronLeft" size={16} color={THEME.warm500} /></button>

          {/* Bottone data centrale con date picker nascosto */}
          <div style={{flex:1,position:"relative"}}>
            <button onClick={()=>{setDatePickerOpen(true);setTimeout(()=>dateInputRef.current?.showPicker?.(),50);}}
              style={{
                width:"100%",padding:"9px 12px",borderRadius:10,fontSize:13,
                fontWeight:700,cursor:"pointer",textAlign:"center",
                border:isToday?`1.5px solid ${THEME.teal}`:`1px solid ${THEME.line}`,
                background:isToday?THEME.tealTint:THEME.panelBg,
                color:isToday?THEME.tealDeep:THEME.text,
              }}>
              {viewMode==="month"?(
                <>
                  <span style={{fontWeight:800}}>
                    {["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                      "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"][currentDate.getMonth()]}
                  </span>
                  <span style={{fontWeight:500,opacity:0.7,marginLeft:6}}>{currentDate.getFullYear()}</span>
                </>
              ): viewMode==="week" ? (
                <span style={{fontWeight:800}}>
                  {(() => {
                    const mon=new Date(currentDate); mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
                    const sab=new Date(mon); sab.setDate(sab.getDate()+5);
                    const M=["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
                    return mon.getMonth()===sab.getMonth()
                      ? `${mon.getDate()} – ${sab.getDate()} ${M[mon.getMonth()]}`
                      : `${mon.getDate()} ${M[mon.getMonth()]} – ${sab.getDate()} ${M[sab.getMonth()]}`;
                  })()}
                </span>
              ):(
                <>
                  {isToday&&<span style={{fontSize:10,fontWeight:800,background:THEME.gradient,color:"#fff",
                    padding:"1px 7px",borderRadius:99,marginRight:6}}>Oggi</span>}
                  <span style={{fontWeight:800}}>{formatWeekday(currentDate)}</span>
                  <span style={{fontWeight:500,opacity:0.7,marginLeft:6}}>{formatDMY(currentDate)}</span>
                  <Icon name="calendar" size={12} color={THEME.warm400} style={{ display: "inline-block", verticalAlign: -1, marginLeft: 6 }} />
                </>
              )}
            </button>
            <input
              ref={dateInputRef}
              type="date"
              value={toISODateLocal(currentDate)}
              onChange={e=>{
                if (e.target.value&&isValidISODate(e.target.value)) {
                  setCurrentDate(new Date(`${e.target.value}T00:00:00`));
                }
                setDatePickerOpen(false);
              }}
              style={{position:"absolute",opacity:0,top:0,left:0,width:"100%",height:"100%",cursor:"pointer",zIndex:-1}}
            />
          </div>

          <button onClick={goNext} aria-label="Successivo" style={{
            padding:"9px 12px",borderRadius:10,flexShrink:0,
            border:`1px solid ${THEME.line}`,background:THEME.panelBg,
            cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center",
          }}><Icon name="chevronRight" size={16} color={THEME.warm500} /></button>
        </div>

        {/* ─── Vista mese OPPURE striscia settimanale ─── */}
        {viewMode==="month" ? (
          <div style={{background:THEME.panelBg,overflow:"hidden",
            marginBottom:10,marginLeft:-14,marginRight:-14,
            borderTop:`1.5px solid ${THEME.border}`,borderBottom:`1.5px solid ${THEME.border}`}}>
            {/* Intestazioni giorni — Lun–Sab, no Domenica */}
            <div style={{display:"grid",gridTemplateColumns:`repeat(${showSaturday?6:5},1fr)`,
              borderBottom:`1px solid ${THEME.border}`,background:THEME.panelSoft}}>
              {(showSaturday?["Lun","Mar","Mer","Gio","Ven","Sab"]:["Lun","Mar","Mer","Gio","Ven"]).map((g,i)=>(
                <div key={i} style={{textAlign:"center",padding:"7px 0",fontSize:9,fontWeight:700,
                  color:i===5?THEME.amber:THEME.muted}}>
                  {g}
                </div>
              ))}
            </div>
            {/* Celle giorni */}
            {(()=>{
              const year  = currentDate.getFullYear();
              const month = currentDate.getMonth();
              const firstDow = (new Date(year,month,1).getDay()+6)%7; // 0=Lun, 6=Dom
              const daysInMonth = new Date(year,month+1,0).getDate();
              const today = new Date(); today.setHours(0,0,0,0);

              // Costruisci celle solo Lun–Sab (dow 0–5), salta domeniche
              const cols = showSaturday ? 6 : 5;
              const skipDow = (dw:number) => dw===6 || (!showSaturday && dw===5);
              const cells: (number|null)[] = [];
              // Offset: posizione del primo giorno visibile nella riga
              let firstVisDow = 0;
              for (let d=1; d<=daysInMonth; d++) {
                const dw = (new Date(year,month,d).getDay()+6)%7;
                if (skipDow(dw)) continue;
                firstVisDow = dw; break;
              }
              for (let i=0; i<firstVisDow; i++) cells.push(null);
              for (let d=1; d<=daysInMonth; d++) {
                const dw = (new Date(year,month,d).getDay()+6)%7;
                if (skipDow(dw)) continue;
                cells.push(d);
              }
              while(cells.length%cols!==0) cells.push(null);

              return (
                <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`}}>
                  {cells.map((day,idx)=>{
                    if (day===null) return <div key={`e-${idx}`} style={{minHeight:56,
                      borderRight:idx%cols<cols-1?`1px solid ${THEME.border}`:"none",
                      borderBottom:`1px solid ${THEME.border}`}}/>;

                    const cellDate = new Date(year,month,day);
                    const isT  = cellDate.getTime()===today.getTime();
                    const isSel= isSameDay(cellDate,currentDate);
                    const dow  = (new Date(year,month,day).getDay()+6)%7;
                    const isSat= dow===5;
                    const dayEvs = monthEvents
                      .filter(e=>isSameDay(e.start,cellDate)&&e.status!=="cancelled")
                      .sort((a,b)=>a.start.getTime()-b.start.getTime());
                    const hasDom = dayEvs.some(e=>e.location==="domicile");

                    return (
                      <div key={`d-${day}`}
                        onClick={()=>{const c=new Date(cellDate);c.setHours(0,0,0,0);setCurrentDate(c);setMonthDrawerDay(c);}}
                        style={{
                          minHeight:56,padding:"4px 3px",
                          borderRight:idx%cols<cols-1?`1px solid ${THEME.border}`:"none",
                          borderBottom:`1px solid ${THEME.border}`,
                          cursor:"pointer",
                          background:isSel?"rgba(37,99,235,0.07)":isT?"rgba(37,99,235,0.03)":"transparent",
                        }}>
                        {/* Numero giorno — centrato */}
                        <div style={{display:"flex",justifyContent:"center",alignItems:"center",marginBottom:3}}>
                          <span style={{
                            fontSize:11,fontWeight:isT||isSel?800:500,
                            color:isT?"#fff":isSel?THEME.blue:isSat?THEME.amber:THEME.text,
                            ...(isT?{background:THEME.blue,borderRadius:"50%",width:18,height:18,
                              display:"inline-flex",alignItems:"center",justifyContent:"center"}:{}),
                          }}>{day}</span>
                          {hasDom&&<Icon name="home" size={8} color={THEME.warm500} style={{display:"inline-block",marginLeft:2,verticalAlign:-1}} />}
                        </div>
                        {/* Appuntamenti: orario + cognome (cognome = tutto tranne il nome) */}
                        {dayEvs.length>0&&(
                          <div style={{display:"flex",flexDirection:"column",gap:1}}>
                            {dayEvs.slice(0,3).map((ev,i)=>{
                              // patient_name = "Cognome Nome" → rimuovi first_name per ottenere cognome
                              const fn = ev.patient_first_name?.trim() ?? "";
                              const surname = fn
                                ? ev.patient_name.replace(new RegExp(`\\s*${fn}\\s*$`),"").trim()
                                : ev.patient_name.split(" ")[0];
                              const col = statusColor(ev.status);
                              return (
                                <div key={i} style={{
                                  fontSize:8,fontWeight:700,lineHeight:1.3,
                                  color:col,background:`${col}15`,
                                  borderRadius:3,padding:"1px 3px",
                                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                                }}>
                                  {fmtTime(ev.start).slice(0,5)} {surname||ev.patient_name}
                                </div>
                              );
                            })}
                            {dayEvs.length>3&&(
                              <div style={{fontSize:8,fontWeight:700,color:THEME.muted,paddingLeft:2}}>
                                +{dayEvs.length-3}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <div style={{display:"flex",justifyContent:"flex-start",padding:"6px 10px",borderTop:`1px solid ${THEME.border}`}}>
              <button onClick={toggleSaturday} style={{
                border:`1px solid ${showSaturday?"#BFE0D3":THEME.line}`,
                background:showSaturday?THEME.tealTint:THEME.panelBg,
                color:showSaturday?THEME.tealDeep:THEME.warm500,
                fontSize:10,fontWeight:800,padding:"3px 9px",borderRadius:99,cursor:"pointer",
              }}>{showSaturday?"Sab ✓":"Sab"}</button>
            </div>
            {monthLoading&&(
              <div style={{padding:12,textAlign:"center",fontSize:12,color:THEME.muted}}>Caricamento…</div>
            )}
          </div>
        ) : viewMode==="week" ? (
          (() => {
            const HOUR_PX = 44, H_START = 7, H_END = 20;
            const { mon } = weekRange(currentDate);
            const days = Array.from({length: showSaturday ? 6 : 5},(_,i)=>{ const d=new Date(mon); d.setDate(d.getDate()+i); return d; });
            const now = new Date();
            const weekEvs = events.filter(e => e.status !== "cancelled");
            const totCount = weekEvs.length;
            const totRev = weekEvs.reduce((s,e)=> s + (e.is_group ? (e.group_total ?? 0) : (typeof e.amount==="number"?e.amount:0)), 0);
            const labelFor = (ev: CalendarEvent) => {
              if (ev.is_group) return `${ev.group_title||"Gruppo"}${typeof ev.participant_count==="number"&&ev.group_max_participants?` ${ev.participant_count}/${ev.group_max_participants}`:""}`;
              const fn = ev.patient_first_name || "";
              let s = ev.patient_name || "";
              if (fn && s.toLowerCase().endsWith((" "+fn).toLowerCase())) s = s.slice(0, s.length-fn.length-1);
              return s || ev.patient_name;
            };

            return (
              <div style={{background:THEME.panelBg,border:`1px solid ${THEME.line}`,borderRadius:12,overflow:"hidden",marginBottom:10}}>
                {/* Intestazioni giorno: tap → apre il Giorno */}
                <div style={{display:"grid",gridTemplateColumns:`24px repeat(${showSaturday?6:5},1fr)`,borderBottom:`1px solid ${THEME.line}`}}>
                  <div />
                  {days.map(d=>{ const t=isSameDay(d,now); return (
                    <button key={toISODateLocal(d)} onClick={()=>{setCurrentDate(d);setViewMode("day");}} style={{
                      border:"none",cursor:"pointer",textAlign:"center",padding:"5px 0 6px",
                      background:t?THEME.gradient:"transparent"}}>
                      <p style={{margin:0,fontSize:8,fontWeight:800,letterSpacing:"0.04em",color:t?"rgba(255,255,255,0.85)":THEME.warm400,textTransform:"uppercase"}}>{formatWeekdayShort(d)}</p>
                      <p style={{margin:0,fontSize:13,fontWeight:800,color:t?"#fff":THEME.text}}>{d.getDate()}</p>
                    </button>
                  );})}
                </div>
                {/* Corpo: 7→20, scorre in verticale */}
                <div ref={weekScrollRef}>
                  <div style={{display:"grid",gridTemplateColumns:`24px repeat(${showSaturday?6:5},1fr)`,height:(H_END-H_START)*HOUR_PX}}>
                    <div style={{position:"relative"}}>
                      {Array.from({length:H_END-H_START},(_,i)=>(
                        i===0?null:<span key={i} style={{position:"absolute",top:i*HOUR_PX,right:3,transform:"translateY(-50%)",fontSize:7.5,fontWeight:700,color:THEME.warm400}}>{H_START+i}</span>
                      ))}
                    </div>
                    {days.map(d=>{ const t=isSameDay(d,now);
                      const evs = weekEvs.filter(e=>isSameDay(e.start,d));
                      return (
                        <div key={toISODateLocal(d)}
                          onClick={(e)=>{
                            const r=(e.currentTarget as HTMLElement).getBoundingClientRect();
                            const y=e.clientY-r.top;
                            const h=H_START+Math.floor(y/HOUR_PX);
                            const mm=(y%HOUR_PX)>=HOUR_PX/2?"30":"00";
                            openCreate(`${String(h).padStart(2,"0")}:${mm}`, toISODateLocal(d));
                          }}
                          style={{position:"relative",cursor:"pointer",borderLeft:`1px solid ${THEME.lineFaint}`,
                          background:`repeating-linear-gradient(to bottom,${t?"rgba(13,148,136,0.045)":"transparent"} 0,${t?"rgba(13,148,136,0.045)":"transparent"} ${HOUR_PX-1}px,${THEME.lineFaint} ${HOUR_PX-1}px,${THEME.lineFaint} ${HOUR_PX}px)`}}>
                          {(() => {
                            // Sovrapposizioni: corsie affiancate dentro il cluster
                            const sorted=[...evs].sort((a,b)=>a.start.getTime()-b.start.getTime());
                            const clusters: CalendarEvent[][]=[]; let cl: CalendarEvent[]=[]; let clEnd=-1;
                            for (const ev of sorted){
                              const s=ev.start.getTime();
                              if(cl.length&&s>=clEnd){clusters.push(cl);cl=[];clEnd=-1;}
                              cl.push(ev); clEnd=Math.max(clEnd,ev.end.getTime());
                            }
                            if(cl.length) clusters.push(cl);
                            const laid: {ev:CalendarEvent;lane:number;of:number}[]=[];
                            for (const grp of clusters){
                              const ends:number[]=[]; const asg=new Map<string,number>();
                              for(const ev of grp){
                                let l=ends.findIndex(e2=>ev.start.getTime()>=e2);
                                if(l===-1){l=ends.length;ends.push(0);}
                                ends[l]=ev.end.getTime(); asg.set(ev.id,l);
                              }
                              for(const ev of grp) laid.push({ev,lane:asg.get(ev.id)!,of:ends.length});
                            }
                            return laid.map(({ev,lane,of})=>{
                            const sh=ev.start.getHours()+ev.start.getMinutes()/60;
                            const eh=ev.end.getHours()+ev.end.getMinutes()/60;
                            if (eh<=H_START||sh>=H_END) return null;
                            const top=Math.max(0,(sh-H_START)*HOUR_PX);
                            const height=Math.max(18,(Math.min(eh,H_END)-Math.max(sh,H_START))*HOUR_PX-2);
                            const c=statusColor(ev.status);
                            const small=height<30;
                            return (
                              <button key={ev.id} onClick={(e)=>{e.stopPropagation();openEvent(ev);}} style={{position:"absolute",top,height,
                                left:`calc(${(lane*100/of).toFixed(3)}% + 1.5px)`,width:`calc(${(100/of).toFixed(3)}% - 3px)`,
                                border:`1.5px solid ${c}`,borderRadius:6,background:`${c}12`,
                                padding:"2px 3px",overflow:"hidden",textAlign:"left",cursor:"pointer",display:"block"}}>
                                <p style={{margin:0,fontSize:7,fontWeight:800,lineHeight:1.2,color:THEME.text,opacity:0.75,whiteSpace:"nowrap",overflow:"hidden"}}>
                                  {fmtTime(ev.start)}{small?` ${labelFor(ev)}`:""}
                                </p>
                                {!small&&(
                                  <p style={{margin:0,fontSize:8.5,fontWeight:700,lineHeight:1.15,color:THEME.text,wordBreak:"break-word"}}>{labelFor(ev)}</p>
                                )}
                              </button>
                            );
                            });
                          })()}
                          {t&&(()=>{ const nh=now.getHours()+now.getMinutes()/60; if(nh<H_START||nh>H_END) return null; return (
                            <div style={{position:"absolute",left:0,right:0,top:(nh-H_START)*HOUR_PX,height:2,background:"#C0392B",zIndex:2}} />
                          );})()}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Totali + guida */}
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",borderTop:`1px solid ${THEME.lineFaint}`}}>
                  <button onClick={toggleSaturday} style={{
                    border:`1px solid ${showSaturday?"#BFE0D3":THEME.line}`,
                    background:showSaturday?THEME.tealTint:THEME.panelBg,
                    color:showSaturday?THEME.tealDeep:THEME.warm500,
                    fontSize:10,fontWeight:800,padding:"3px 9px",borderRadius:99,cursor:"pointer",flexShrink:0,
                  }}>{showSaturday?"Sab ✓":"Sab"}</button>
                  <span style={{fontSize:10,fontWeight:800,color:THEME.text}}>{totCount} sedute · €{Math.round(totRev)}</span>
                  <span style={{marginLeft:"auto",fontSize:9,color:THEME.warm400,paddingRight:2}}>spazio vuoto → nuova</span>
                </div>
              </div>
            );
          })()
        ) : (
          <div style={{
          display:"flex",gap:4,marginBottom:10,
          background:THEME.panelSoft,borderRadius:12,padding:"8px 8px",
          border:`1px solid ${THEME.line}`,
          overflowX:"auto",
        }}>
          {weekDays.map(day=>{
            const isSelected = isSameDay(day,currentDate);
            const isDayToday = isSameDay(day,new Date());
            const evCount = events.filter(e=>isSameDay(e.start,day)&&e.status!=="cancelled").length;
            const doneCount = events.filter(e=>isSameDay(e.start,day)&&e.status==="done").length;
            const fullness = evCount===0?"free":doneCount===evCount?"done":evCount>=4?"full":"partial";
            const dotColor = fullness==="free"?THEME.gray:fullness==="done"?THEME.green:fullness==="full"?THEME.red:THEME.amber;
            return (
              <button key={toISODateLocal(day)} onClick={()=>setCurrentDate(day)} style={{
                flex:"0 0 auto",minWidth:38,padding:"6px 4px",borderRadius:10,cursor:"pointer",
                border:isSelected?"none":isDayToday?`1.5px solid ${THEME.teal}`:`1px solid ${THEME.line}`,
                background:isSelected?THEME.gradient:THEME.panelBg,
                display:"flex",flexDirection:"column",alignItems:"center",gap:3,
              }}>
                <span style={{fontSize:9,fontWeight:700,color:isSelected?"rgba(255,255,255,0.85)":THEME.warm500,textTransform:"uppercase"}}>
                  {formatWeekdayShort(day)}
                </span>
                <span style={{fontSize:15,fontWeight:800,color:isSelected?"#fff":isDayToday?THEME.teal:THEME.text}}>
                  {day.getDate()}
                </span>
                {/* indicatore occupazione */}
                <div style={{width:6,height:6,borderRadius:99,background:isSelected?"rgba(255,255,255,0.9)":(evCount>0?dotColor:THEME.border)}} />
              </button>
            );
          })}
        </div>
        )}

        {/* ─── Barra azioni giorno (solo in vista giorno) ─── */}
        {viewMode==="day"&&(
        <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center"}}>
          {/* Oggi */}
          {!isToday&&(
            <button onClick={goToday} style={{
              padding:"6px 12px",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",
              border:`1.5px solid ${THEME.blue}`,background:"rgba(37,99,235,0.08)",color:THEME.blue,
            }}>Vai a oggi</button>
          )}

          {/* Non pagati reminder */}
          {dayStats.unpaidDone>0&&(
            <div style={{padding:"5px 10px",borderRadius:8,fontSize:11,fontWeight:700,
              background:"rgba(249,115,22,0.08)",color:THEME.amber,
              border:`1.5px solid rgba(249,115,22,0.3)`,whiteSpace:"nowrap"}}>
              💸 {dayStats.unpaidDone} da incassare
            </div>
          )}
        </div>
        )}

        {/* ─── Errore / loading ─── */}
        {(loading||busy||error)&&(
          <div style={{marginBottom:10}}>
            {(loading||busy)&&!error&&(
              <div style={{fontSize:12,color:THEME.muted,fontWeight:600}}>
                {busy?"Operazione in corso…":"Caricamento…"}
              </div>
            )}
            {error&&(
              <div style={{padding:"10px 12px",borderRadius:10,
                background:"rgba(220,38,38,0.06)",border:"1.5px solid rgba(220,38,38,0.25)",
                color:"#7f1d1d",fontWeight:600,fontSize:13}}>
                ⚠️ {error}
              </div>
            )}
          </div>
        )}

        {viewMode==="day"&&(<>
        {/* ─── Legenda swipe ─── */}
        <div style={{display:"flex",gap:10,marginBottom:8,fontSize:10,color:THEME.muted,fontWeight:600}}>
          <span>← scorri card per aprire</span>
          <span>→ scorri per eseguito</span>
        </div>

        {/* ─── Timeline ─── */}
        <div style={{
          background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
          borderRadius:14,boxShadow:"0 2px 8px rgba(15,23,42,0.06)",overflow:"hidden",
        }}>
          <div ref={timelineScrollRef}
            onTouchStart={handleSwipeTouchStart} onTouchEnd={handleSwipeTouchEnd}>
            <div ref={timelineRef}
              onDragOver={handleDragOver} onDrop={handleDrop} onDragLeave={()=>setDragOverY(null)}
              onTouchMove={handleTimelineTouchMove}
              style={{position:"relative",height:`${(dayEndHour-dayStartHour)*PX_PER_HOUR}px`}}>

              {timeSlots.map((t,i)=>(
                <div key={i} style={{height:PX_PER_HOUR,borderBottom:`1px solid ${THEME.border}`,position:"relative"}}>
                  <div style={{position:"absolute",left:10,top:5,fontSize:10,fontWeight:600,
                    color:THEME.muted,letterSpacing:"0.04em",zIndex:2,lineHeight:1}}>{t.label}</div>
                  <div style={{position:"absolute",left:52,right:0,top:PX_PER_HOUR/2,
                    height:1,background:THEME.border,opacity:0.5,pointerEvents:"none"}} />
                  <div onClick={()=>openCreate(`${pad2(t.hour)}:00`,toISODateLocal(currentDate))}
                    style={{position:"absolute",top:0,left:52,right:8,height:PX_PER_HOUR/2,cursor:"pointer",zIndex:1}} />
                  <div onClick={()=>openCreate(`${pad2(t.hour)}:30`,toISODateLocal(currentDate))}
                    style={{position:"absolute",top:PX_PER_HOUR/2,left:52,right:8,height:PX_PER_HOUR/2,cursor:"pointer",zIndex:1}} />
                </div>
              ))}

              {dragOverY!==null&&draggingId&&(
                <div style={{position:"absolute",left:52,right:8,
                  top:clamp(dragOverY,0,(dayEndHour-dayStartHour)*PX_PER_HOUR),
                  height:2,background:THEME.blue,zIndex:5,pointerEvents:"none",
                  boxShadow:`0 0 8px ${THEME.blue}80`}} />
              )}
              {touchDragY!==null&&touchDraggingId&&(
                <div style={{position:"absolute",left:52,right:8,top:Math.max(0,touchDragY),
                  height:2,background:THEME.blue,zIndex:5,pointerEvents:"none",
                  boxShadow:`0 0 8px ${THEME.blue}80`}} />
              )}

              {(() => {
                // DURANTE DRAG (mouse o touch): salto il calcolo lane → tutte le card
                // tornano a piena larghezza per facilitare lo spostamento.
                const dragId = draggingId || touchDraggingId;
                if (dragId) {
                  return dayEvents.map(ev => renderEventCard(ev, { lane: 0, totalLanes: 1 }));
                }
                const lanePositions = assignLanes(dayEvents, 3);
                return dayEvents
                  .filter(ev => ev.status === "cancelled" || lanePositions.has(ev.id))
                  .map(ev => renderEventCard(ev, lanePositions.get(ev.id)));
              })()}

              {/* ─── Slot liberi ─── */}
              {freeSlots.map((slot,i) => {
                const ppm = PX_PER_HOUR / 60;
                const top    = ((slot.start.getHours() - dayStartHour) * 60 + slot.start.getMinutes()) * ppm;
                const height = slot.minutes * ppm;
                if (height < 18) return null;
                const label = slot.minutes >= 60
                  ? `${Math.floor(slot.minutes/60)}h${slot.minutes%60>0?` ${slot.minutes%60}min`:""} liberi`
                  : `${slot.minutes} min liberi`;
                return (
                  <div
                    key={i}
                    onClick={() => openCreate(
                      `${pad2(slot.start.getHours())}:${pad2(slot.start.getMinutes())}`,
                      toISODateLocal(currentDate)
                    )}
                    title={`Slot libero — ${label}. Tocca per creare appuntamento`}
                    style={{
                      position:"absolute", left:52, right:8, top, height,
                      borderRadius:6, zIndex:2, cursor:"pointer",
                      border:`1.5px dashed ${THEME.green}50`,
                      background:`rgba(22,163,74,0.04)`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      pointerEvents:"auto",
                    }}
                  >
                    {height >= 24 && (
                      <span style={{
                        fontSize:10, fontWeight:700, color:THEME.green,
                        letterSpacing:"0.03em", opacity:0.8,
                      }}>
                        🟢 {label}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Linea "ora" */}
              {(()=>{
                if (!isSameDay(currentTime,currentDate)) return null;
                const top=((currentTime.getHours()-dayStartHour)*60+currentTime.getMinutes())*(PX_PER_HOUR/60);
                const max=(dayEndHour-dayStartHour)*PX_PER_HOUR;
                if (top<0||top>max) return null;
                return (
                  <div style={{position:"absolute",left:0,right:0,top,height:2,
                    background:THEME.red,zIndex:4,pointerEvents:"none",
                    boxShadow:`0 0 8px ${THEME.red}60`}}>
                    <div style={{position:"absolute",left:8,top:-4,width:9,height:9,
                      borderRadius:99,background:THEME.red}} />
                  </div>
                );
              })()}

              {!loading&&dayEvents.length===0&&(
                <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
                  alignItems:"center",justifyContent:"center",gap:10,pointerEvents:"none"}}>
                  <div style={{display:"flex",justifyContent:"center",opacity:0.6}}><PulseDivider width={64} color={THEME.border} /></div>
                  <div style={{fontSize:14,fontWeight:700,color:THEME.muted}}>Nessun appuntamento</div>
                  <div style={{fontSize:12,color:THEME.muted,opacity:0.6}}>Tocca + per aggiungerne uno</div>
                </div>
              )}
            </div>
          </div>
        </div>
        </>)}
      </div>

      {/* ━━━ DRAWER MESE ━━━ */}
      {monthDrawerDay&&(
        <>
          <div onClick={()=>setMonthDrawerDay(null)} style={{
            position:"fixed",inset:0,zIndex:50,
            background:"rgba(15,23,42,0.4)",backdropFilter:"blur(2px)",
          }}/>
          <div style={{
            position:"fixed",bottom:0,left:0,right:0,zIndex:51,
            background:THEME.panelBg,
            borderRadius:"18px 18px 0 0",
            padding:"16px 20px",
            paddingBottom:`max(20px, env(safe-area-inset-bottom, 20px))`,
            boxShadow:"0 -8px 40px rgba(15,23,42,0.18)",
            maxHeight:"70vh",display:"flex",flexDirection:"column",
          }}>
            {/* Handle */}
            <div style={{width:36,height:4,borderRadius:99,background:THEME.border,margin:"0 auto 14px"}}/>

            {/* Header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div>
                <div style={{fontSize:15,fontWeight:800,color:THEME.text}}>
                  {formatWeekday(monthDrawerDay)} {monthDrawerDay.getDate()}
                </div>
                <div style={{fontSize:12,color:THEME.muted,marginTop:2}}>
                  {monthEvents.filter(e=>isSameDay(e.start,monthDrawerDay)&&e.status!=="cancelled").length} appuntamenti
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button
                  onClick={()=>{setViewMode("day");setMonthDrawerDay(null);}}
                  style={{padding:"7px 14px",borderRadius:9,border:"none",
                    background:THEME.gradient,color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                  Vista giorno →
                </button>
                <button
                  onClick={()=>{openCreate(undefined,toISODateLocal(monthDrawerDay));setMonthDrawerDay(null);}}
                  style={{width:34,height:34,borderRadius:99,border:"none",
                    background:"rgba(37,99,235,0.1)",color:THEME.blue,fontWeight:700,fontSize:20,cursor:"pointer",
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                  +
                </button>
              </div>
            </div>

            {/* Lista appuntamenti del giorno */}
            <div style={{overflowY:"auto",flex:1}}>
              {(()=>{
                const dayEvs = monthEvents
                  .filter(e=>isSameDay(e.start,monthDrawerDay))
                  .sort((a,b)=>a.start.getTime()-b.start.getTime());
                if (dayEvs.length===0) return (
                  <div style={{padding:"24px 0",textAlign:"center",color:THEME.muted,fontSize:13,fontWeight:600}}>
                    Nessun appuntamento — tocca + per aggiungerne uno
                  </div>
                );
                return dayEvs.map(ev=>{
                  const col = ev.is_group ? "#0d9488" : statusColor(ev.status);
                  const isGroup = ev.is_group === true;
                  return (
                    <div key={ev.id}
                      onClick={()=>{openEvent(ev);setMonthDrawerDay(null);}}
                      style={{
                        display:"flex",alignItems:"center",gap:12,
                        padding:"11px 0",borderBottom:`1px solid ${THEME.border}`,
                        cursor:"pointer",
                      }}>
                      <div style={{width:3,height:40,borderRadius:99,background:col,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:700,color:THEME.text,
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                          display:"flex",alignItems:"center",gap:6}}>
                          {isGroup && (
                            <span style={{
                              fontSize: 9, fontWeight: 800, color: "#fff",
                              background: "#0d9488",
                              padding: "1px 6px", borderRadius: 99, flexShrink: 0,
                            }}><Icon name="users" size={10} color="currentColor" style={{display:"inline-block",verticalAlign:-1,marginRight:3}} />{ev.participant_count ?? 0}/{ev.group_max_participants ?? 0}</span>
                          )}
                          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {isGroup ? (ev.group_title || "Gruppo") : ev.patient_name}
                          </span>
                          {ev.package_id && !isGroup && <PackageBadge packageId={ev.package_id} variant="compact" />}
                        </div>
                        <div style={{fontSize:11,color:THEME.muted,marginTop:2,display:"flex",gap:6}}>
                          <span>{fmtTime(ev.start)}–{fmtTime(ev.end)}</span>
                          <span style={{color:col}}>{statusLabel(ev.status)}</span>
                          {ev.location==="domicile"&&<Icon name="home" size={10} color="currentColor" style={{display:"inline-block",verticalAlign:-1}} />}
                        </div>
                      </div>
                      {typeof ev.amount==="number"&&ev.amount>0&&(
                        <div style={{fontSize:13,fontWeight:700,
                          color:ev.is_paid?THEME.green:THEME.amber,flexShrink:0}}>
                          €{ev.amount}
                        </div>
                      )}
                      <span style={{fontSize:14,color:THEME.muted,flexShrink:0}}>›</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </>
      )}

      {/* ━━━ FAB ━━━ */}
      <button
        onClick={()=>openCreate(undefined,toISODateLocal(currentDate))}
        aria-label="Nuovo appuntamento"
        style={{
          position:"fixed",right:18,
          bottom:`calc(env(safe-area-inset-bottom,0px) + ${BOTTOM_TAB_H+16}px)`,
          width:52,height:52,borderRadius:"50%",
          background:THEME.gradient,color:"#fff",
          border:"none",cursor:"pointer",fontSize:26,fontWeight:300,zIndex:40,
          display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:"0 4px 20px rgba(13,148,136,0.40)",
        }}>
        +
        {/* Badge FAB */}
        {fabBadge>0&&(
          <div style={{position:"absolute",top:-2,right:-2,width:18,height:18,
            borderRadius:99,background:THEME.red,color:"#fff",
            fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",
            border:"2px solid #fff"}}>
            {fabBadge}
          </div>
        )}
      </button>

      {/* ━━━ MODAL NOTA RAPIDA ━━━ */}
      {quickNoteId&&(
        <LightModal onClose={()=>{setQuickNoteId(null);setQuickNoteText("");}}>
          <ModalHeader title="Nota rapida" onClose={()=>{setQuickNoteId(null);setQuickNoteText("");}} />
          <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:12}}>
            <textarea
              autoFocus
              value={quickNoteText}
              onChange={e=>setQuickNoteText(e.target.value)}
              placeholder="Annotazione sull'appuntamento…"
              style={{...inputS(),minHeight:100,resize:"vertical"}}
            />
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <LightBtn v="primary" onClick={saveQuickNote}>💾 Salva</LightBtn>
              <LightBtn v="ghost" onClick={()=>{setQuickNoteId(null);setQuickNoteText("");}}>Annulla</LightBtn>
            </div>
          </div>
        </LightModal>
      )}

      {/* ━━━ MODAL RICERCA PAZIENTE ━━━ */}
      {searchOpen&&(
        <LightModal onClose={()=>setSearchOpen(false)}>
          <ModalHeader title="Cerca paziente" onClose={()=>setSearchOpen(false)} />
          <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:10}}>
            <input
              autoFocus
              value={searchQuery}
              onChange={e=>setSearchQuery(e.target.value)}
              placeholder="Nome o cognome…"
              style={inputS()}
            />
            {searchLoading&&<div style={{fontSize:12,color:THEME.muted,fontWeight:600}}>Ricerca…</div>}
            {searchResults.length>0&&(
              <div style={{border:`1.5px solid ${THEME.border}`,borderRadius:10,overflow:"hidden"}}>
                {searchResults.map(p=>{
                  const name=`${p.last_name??""} ${p.first_name??""}`.trim();
                  return (
                    <Link key={p.id} href={`/patients/${p.id}`} onClick={()=>setSearchOpen(false)} style={{
                      display:"flex",alignItems:"center",justifyContent:"space-between",
                      padding:"12px 14px",borderBottom:`1px solid ${THEME.border}`,
                      textDecoration:"none",color:THEME.text,background:THEME.panelSoft,
                    }}>
                      <div>
                        <div style={{fontWeight:700,fontSize:13}}>{name||"Paziente"}</div>
                        {p.phone&&<div style={{fontSize:11,color:THEME.muted,marginTop:2}}>{p.phone}</div>}
                      </div>
                      <span style={{color:THEME.blue,fontSize:16}}>›</span>
                    </Link>
                  );
                })}
              </div>
            )}
            {searchQuery.length>=2&&!searchLoading&&searchResults.length===0&&(
              <div style={{fontSize:13,color:THEME.muted,textAlign:"center",padding:"12px 0"}}>
                Nessun paziente trovato
              </div>
            )}
          </div>
        </LightModal>
      )}

      {/* ━━━ MODAL MODIFICA ━━━ */}
      {selectedEvent&&(
        <LightModal onClose={()=>setSelectedEvent(null)}>
          <ModalHeader
            title={selectedEvent.patient_name}
            subtitle={`${fmtTime(selectedEvent.start)} – ${fmtTime(selectedEvent.end)}`}
            onClose={()=>setSelectedEvent(null)}
          />
          <div style={{marginTop:18,display:"flex",flexDirection:"column",gap:14}}>
            {error&&<ErrorBox>{error}</ErrorBox>}
            <FG label="Orario">
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                <input type="date" value={editDate} onChange={e=>setEditDate(e.target.value)} style={inputS()} />
                <input type="time" value={editTime} onChange={e=>setEditTime(e.target.value)} style={inputS()} />
                <input type="number" min={15} step={5} value={editDuration}
                  onChange={e=>setEditDuration(Number(e.target.value))} style={inputS()} placeholder="Min" />
              </div>
            </FG>
            <FG label="Stato">
              <select value={editStatus} onChange={e=>setEditStatus(e.target.value as Status)} style={inputS()}>
                <option value="booked">Prenotato</option>
                <option value="confirmed">Confermato</option>
                <option value="done">Eseguito</option>
                <option value="not_paid">Non pagata</option>
                <option value="cancelled">Annullato</option>
              </select>
            </FG>
            <FG label="Trattamento">
              <div style={{ position: "relative" }}>
                <div style={{
                  position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                  width: 12, height: 12, borderRadius: "50%",
                  background: treatmentCatalog.find(t => t.key === editTreatmentType)?.color ?? "#94a3b8",
                  pointerEvents: "none", zIndex: 1,
                  border: "1px solid rgba(0,0,0,0.06)",
                }} />
                <select
                  value={editTreatmentType}
                  onChange={e=>setEditTreatmentType(e.target.value)}
                  style={{ ...inputS(), paddingLeft: 32, fontWeight: 700 }}
                >
                  {/* se il trattamento corrente non è più nel catalogo (disattivato/cancellato), lo aggiungo come "fantasma" */}
                  {editTreatmentType && !treatmentCatalog.find(t => t.key === editTreatmentType) && (
                    <option value={editTreatmentType}>
                      {editTreatmentType.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} (non più attivo)
                    </option>
                  )}
                  {treatmentCatalog.map(t => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </div>
            </FG>
            <FG label="Note">
              <textarea value={editNote} onChange={e=>setEditNote(e.target.value)}
                style={{...inputS(),minHeight:80,resize:"vertical"}} />
            </FG>

            {/* SOAP + VAS — collapsabile (Tappa 11) */}
            {selectedEvent.patient_id && (
              <MobileSoapCollapse
                appointmentId={selectedEvent.id}
                patientId={selectedEvent.patient_id}
              />
            )}

            <FG label="Importo">
              <input value={editAmount} onChange={e=>setEditAmount(e.target.value)}
                style={inputS()} placeholder="Es. 40" inputMode="decimal" />
            </FG>

            {/* Fatturazione */}
            <FG label="Fatturazione">
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => setEditPriceType("invoiced")}
                  style={{
                    flex: 1, padding: "9px 10px", borderRadius: 8,
                    border: `1px solid ${editPriceType === "invoiced" ? THEME.green : THEME.border}`,
                    background: editPriceType === "invoiced" ? THEME.green : THEME.panelBg,
                    color: editPriceType === "invoiced" ? "#fff" : THEME.text,
                    fontWeight: 700, fontSize: 13, cursor: "pointer",
                  }}
                >Fatturato</button>
                <button
                  onClick={() => setEditPriceType("cash")}
                  style={{
                    flex: 1, padding: "9px 10px", borderRadius: 8,
                    border: `1px solid ${editPriceType === "cash" ? "#f59e0b" : THEME.border}`,
                    background: editPriceType === "cash" ? "rgba(245,158,11,0.1)" : THEME.panelBg,
                    color: editPriceType === "cash" ? "#b45309" : THEME.text,
                    fontWeight: 700, fontSize: 13, cursor: "pointer",
                  }}
                >Contanti</button>
              </div>
            </FG>

            {/* Metodo Pagamento — solo se Fatturato */}
            {editPriceType === "invoiced" && (
              <FG label="Metodo pagamento *">
                <div style={{ display: "flex", gap: 6 }}>
                  {([
                    { v: "cash",          label: "Contanti" },
                    { v: "pos",           label: "POS" },
                    { v: "bank_transfer", label: "Bonifico" },
                  ] as const).map(opt => {
                    const active = editPaymentMethod === opt.v;
                    return (
                      <button
                        key={opt.v}
                        onClick={() => setEditPaymentMethod(opt.v)}
                        style={{
                          flex: 1, padding: "9px 6px", borderRadius: 8,
                          border: `1px solid ${active ? THEME.blue : THEME.border}`,
                          background: active ? "rgba(37,99,235,0.10)" : THEME.panelBg,
                          color: active ? THEME.blue : THEME.text,
                          fontWeight: 700, fontSize: 12, cursor: "pointer",
                        }}
                      >{opt.label}</button>
                    );
                  })}
                </div>
              </FG>
            )}
            {selectedEvent.whatsapp_sent_at&&(
              <div style={{fontSize:12,fontWeight:600,color:THEME.green,padding:"6px 10px",borderRadius:8,
                background:"rgba(22,163,74,0.08)",border:"1px solid rgba(22,163,74,0.2)"}}>
                ✓ WA inviato il {new Date(selectedEvent.whatsapp_sent_at).toLocaleDateString("it-IT")}
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:4}}>
              <LightBtn v="primary" onClick={saveEvent} disabled={busy}>💾 Salva</LightBtn>
              <LightBtn v="wa"
                onClick={()=>sendReminder(selectedEvent.id,selectedEvent.patient_phone??undefined,selectedEvent.patient_first_name??undefined)}
                disabled={!normalizePhone(selectedEvent.patient_phone)}>
                WhatsApp
              </LightBtn>
              {selectedEvent.patient_id && (
                <LightBtn v="wa"
                  onClick={()=>{
                    if (!selectedEvent.patient_id) return;
                    setSelectedEvent(null);
                    openWeeklyReminder(
                      selectedEvent.patient_id,
                      selectedEvent.patient_first_name ?? "",
                      selectedEvent.patient_phone ?? null,
                    );
                  }}
                  disabled={!normalizePhone(selectedEvent.patient_phone)}>
                  📲 Settimana
                </LightBtn>
              )}
              {selectedEvent.patient_id && (
                <LightBtn v="ghost"
                  onClick={()=>router.push(`/patients/${selectedEvent.patient_id}`)}>
                  👤 Scheda paziente
                </LightBtn>
              )}
              {selectedEvent.patient_id && (
                <LightBtn v="ghost"
                  onClick={async () => {
                    if (!selectedEvent.patient_id || !selectedEvent.start) return;
                    try {
                      setBusy(true);
                      await generateSingleCertificate({
                        patientId: selectedEvent.patient_id,
                        appointmentDate: selectedEvent.start,
                        treatmentLabel:
                          selectedEvent.treatment_type === "macchinario"
                            ? "Seduta strumentale"
                            : "Seduta di fisioterapia",
                      });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Errore generazione attestato");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy}>
                  Attestato
                </LightBtn>
              )}
              <LightBtn v="danger" onClick={deleteEvent} disabled={busy}>🗑 Elimina</LightBtn>
              <LightBtn v="ghost" onClick={()=>setSelectedEvent(null)}>Chiudi</LightBtn>
            </div>
          </div>
        </LightModal>
      )}

      {/* ━━━ MODAL CREAZIONE ━━━ */}
      {createOpen&&(
        <CreateModal
          busy={busy} error={error} onClose={()=>{setCreateOpen(false); setCreateInitialParticipants([]);}}
          patientQuery={patientQuery} setPatientQuery={setPatientQuery}
          patientResults={patientResults} patientLoading={patientLoading}
          selectedPatient={selectedPatient} setSelectedPatient={setSelectedPatient}
          quickFirstName={quickFirstName} setQuickFirstName={setQuickFirstName}
          quickLastName={quickLastName}   setQuickLastName={setQuickLastName}
          quickPhone={quickPhone}         setQuickPhone={setQuickPhone}
          createQuickPatient={createQuickPatient}
          createDate={createDate}         setCreateDate={setCreateDate}
          createTime={createTime}         setCreateTime={setCreateTime}
          createDuration={createDuration} setCreateDuration={setCreateDuration}
          createStatus={createStatus}     setCreateStatus={setCreateStatus}
          createLocation={createLocation} setCreateLocation={setCreateLocation}
          createClinicSite={createClinicSite}           setCreateClinicSite={setCreateClinicSite}
          createDomicileAddress={createDomicileAddress} setCreateDomicileAddress={setCreateDomicileAddress}
          studioLocations={studioLocations as any}
          createLocationId={createLocationId}
          setCreateLocationId={setCreateLocationId}
          multiLocationEnabled={!!currentStudio?.multi_location_enabled}
          createAmount={createAmount}     setCreateAmount={setCreateAmount}
          createNote={createNote}         setCreateNote={setCreateNote}
          createPriceType={createPriceType}     setCreatePriceType={setCreatePriceType}
          createPaymentMethod={createPaymentMethod} setCreatePaymentMethod={setCreatePaymentMethod}
          createTreatmentType={createTreatmentType} setCreateTreatmentType={setCreateTreatmentType}
          treatmentCatalog={treatmentCatalog}
          createAppointment={createAppointment}
          createRecurring={createRecurring} setCreateRecurring={setCreateRecurring}
          createRecurringCount={createRecurringCount} setCreateRecurringCount={setCreateRecurringCount}
          createRecurringInterval={createRecurringInterval} setCreateRecurringInterval={setCreateRecurringInterval}
          studioNamePlaceholder={currentStudio?.name || "Studio"}
          createIsGroup={createIsGroup} setCreateIsGroup={setCreateIsGroup}
          createGroupTitle={createGroupTitle} setCreateGroupTitle={setCreateGroupTitle}
          createGroupMax={createGroupMax} setCreateGroupMax={setCreateGroupMax}
          createGroupPrice={createGroupPrice} setCreateGroupPrice={setCreateGroupPrice}
          createInitialParticipants={createInitialParticipants}
          addInitialParticipantCal={(p) => setCreateInitialParticipants(prev =>
            prev.find(x => x.id === p.id) ? prev : [...prev, p]
          )}
          removeInitialParticipantCal={(patientId) => setCreateInitialParticipants(prev =>
            prev.filter(x => x.id !== patientId)
          )}
          searchPatientsForGroupCal={groupSearchPatientsApi}
          createQuickPatientForGroup={createQuickPatientCoreMobile}
          selectedPackageId={selectedPackageId}
          setSelectedPackageId={setSelectedPackageId}
        />
      )}

      {/* ━━━ MODAL CONFERMA WHATSAPP (dopo creazione appuntamento) ━━━ */}
      {/* Identica al desktop: messaggio template + check + pulsante Invia.        */}
      {/* Per Fase B: include anche link conferma/annulla (gestiti in sendReminder). */}
      {showWhatsAppConfirm && justCreatedAppt && (
        <>
          <div
            onClick={() => { setShowWhatsAppConfirm(false); setJustCreatedAppt(null); }}
            style={{
              position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
              zIndex: 10000,
            }}
          />
          <div
            style={{
              position: "fixed",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "92vw",
              maxWidth: 460,
              maxHeight: "90vh",
              overflow: "auto",
              background: THEME.panelBg,
              color: THEME.text,
              borderRadius: 14,
              border: `1.5px solid ${THEME.border}`,
              boxShadow: "0 20px 50px rgba(15,23,42,0.30)",
              padding: "24px 22px",
              zIndex: 10001,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: "linear-gradient(135deg,#0d9488,#2563eb)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, color: "#fff", flexShrink: 0,
              }}>◈</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: THEME.teal }}>
                  Invia conferma WhatsApp?
                </div>
                <div style={{ marginTop: 2, fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                  Vuoi inviare il messaggio di conferma al paziente?
                </div>
              </div>
            </div>

            {/* Anteprima messaggio (template di default) */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: THEME.text, marginBottom: 6 }}>
                Messaggio che verrà inviato:
              </div>
              <div style={{
                background: "#FFFDF9",
                padding: 12,
                borderRadius: 8,
                border: `1px solid ${THEME.border}`,
                fontSize: 12,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                maxHeight: 140,
                overflowY: "auto",
                color: THEME.text,
              }}>
                {`Grazie per averci scelto.\nRicordiamo il prossimo appuntamento fissato per ${formatDateRelative(justCreatedAppt.start)} alle ${fmtTime(justCreatedAppt.start)}.\n\n👉 Conferma o annulla con un click:\n[link conferma incluso automaticamente]\n\nA presto`}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
                Destinatario: {justCreatedAppt.patientPhone}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                onClick={() => { setShowWhatsAppConfirm(false); setJustCreatedAppt(null); }}
                style={{
                  padding: "13px 16px",
                  borderRadius: 10,
                  border: `1.5px solid ${THEME.border}`,
                  background: "#FFFDF9",
                  color: THEME.text,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Salta
              </button>
              <button
                onClick={async () => {
                  // Salva i riferimenti localmente prima del cleanup
                  const appt = justCreatedAppt;
                  setShowWhatsAppConfirm(false);
                  setJustCreatedAppt(null);
                  if (!appt) return;
                  // Chiama il sendReminder esistente con isConfirmation=true
                  // Questo include automaticamente il link di conferma/annulla
                  // (logica già implementata in src/calendar/utils/reminderMessage.ts)
                  await sendReminder(
                    appt.id,
                    appt.patientPhone ?? undefined,
                    appt.patientFirstName,
                    true, // isConfirmation
                  );
                }}
                style={{
                  padding: "13px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: "#25d366",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <span>📱</span> Invia WA
              </button>
            </div>
          </div>
        </>
      )}

      <style dangerouslySetInnerHTML={{__html:`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}} />

      {/* Promemoria settimanale aggregato (1 messaggio = N appuntamenti) */}
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

      {/* ═══════ Modal gestione gruppo (mig. 014) ═══════════════════ */}
      {openGroup && (
        <GroupEventModalMobile
          event={openGroup}
          searchPatients={groupSearchPatientsApi}
          createQuickPatient={async (payload) => {
            // Normalizza phone (PatientLite ha phone?: undefined,
            // PatientSearchResult richiede string | null)
            const p = await createQuickPatientCoreMobile(payload);
            return p ? {
              id: p.id,
              first_name: p.first_name,
              last_name: p.last_name,
              phone: p.phone ?? null,
            } : null;
          }}
          onClose={() => setOpenGroup(null)}
          onAddParticipant={async (apptId, patientId, price) => {
            const ok = await addParticipantApi(apptId, patientId, price);
            if (ok) await refreshOpenGroupCal();
          }}
          onUpdateParticipant={async (participantId, patch) => {
            const ok = await updateParticipantApi(participantId, patch);
            if (ok) await refreshOpenGroupCal();
          }}
          onRemoveParticipant={async (participantId) => {
            const ok = await removeParticipantApi(participantId);
            if (ok) await refreshOpenGroupCal();
          }}
          onMarkAllPaid={async (apptId) => {
            const ok = await markAllPaidApi(apptId);
            if (ok) await refreshOpenGroupCal();
          }}
          onSendReminderToAll={async (event) => {
            await sendReminderToAllApi(
              event,
              getStudioBranding(currentStudio),
              {
                template: reminderTplCache,
                studioAddress: currentStudio?.address ?? null,
              }
            );
          }}
          onDeleteGroup={async (apptId) => {
            const ok = await deleteGroupApi(apptId);
            if (ok) {
              setOpenGroup(null);
              setEvents((prev: CalendarEvent[]) => prev.filter(x => x.id !== apptId));
              setMonthEvents((prev: CalendarEvent[]) => prev.filter(x => x.id !== apptId));
            }
          }}
          onUpdateGroup={async (apptId, patch) => {
            const ok = await updateGroupApi(apptId, patch);
            if (ok) {
              await refreshOpenGroupCal();
              const updateEv = (e: CalendarEvent): CalendarEvent => {
                if (e.id !== apptId) return e;
                return {
                  ...e,
                  group_title: patch.group_title ?? e.group_title,
                  group_max_participants: patch.group_max_participants ?? e.group_max_participants,
                  group_price_per_person: patch.group_price_per_person ?? e.group_price_per_person,
                  patient_name: patch.group_title ?? e.patient_name,
                };
              };
              setEvents((prev: CalendarEvent[]) => prev.map(updateEv));
              setMonthEvents((prev: CalendarEvent[]) => prev.map(updateEv));
            }
          }}
          onDuplicateGroup={async (sourceId, newStart, withParts) => {
            if (!openGroup) return;
            const newId = await duplicateGroupApi(openGroup, newStart, withParts);
            if (newId) {
              setOpenGroup(null);
              await loadAppointments(currentDate);
              const niceDate = newStart.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
              const niceTime = newStart.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
              showToast.success(`Gruppo duplicato per ${niceDate} alle ${niceTime}.`);
            }
          }}
        />
      )}

      {/* Lista d'attesa */}
      <button
        onClick={() => setWaitlistOpen(true)}
        aria-label="Lista d'attesa"
        style={{
          position: "fixed", right: 16, zIndex: 3500,
          bottom: `calc(env(safe-area-inset-bottom,0px) + ${BOTTOM_TAB_H + 16 + 64}px)`,
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "11px 16px", borderRadius: 999, border: "none",
          background: "linear-gradient(135deg, #0d9488, #2563eb)",
          color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer",
          fontFamily: "inherit", boxShadow: "0 8px 22px rgba(37,99,235,0.4)",
        }}
      >
        <Icon name="clock" size={16} color="#fff" strokeWidth={2.4} />
        {waitlistCount > 0 && (
          <span style={{ background: "#fff", color: "#0d9488", borderRadius: 999, fontSize: 11, fontWeight: 900, padding: "1px 7px", minWidth: 18, textAlign: "center" }}>{waitlistCount}</span>
        )}
      </button>

      <WaitlistPanel
        open={waitlistOpen}
        onClose={() => setWaitlistOpen(false)}
        studioId={currentStudioId ?? ""}
        onChanged={setWaitlistCount}
      />

      {matchSlot && (
        <WaitlistMatchModal
          slotStart={matchSlot}
          matches={matchEntries}
          studioName={currentStudio?.name ?? null}
          onClose={() => { setMatchSlot(null); setMatchEntries([]); }}
          onOpenPanel={() => setWaitlistOpen(true)}
          onChanged={() => {
            if (currentStudioId) fetchActiveWaitlistCount(currentStudioId).then(setWaitlistCount).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

/* ─── UI components ───────────────────────────────────────────────────── */
function inputS(): React.CSSProperties {
  return {
    width:"100%",padding:"10px 12px",borderRadius:10,
    border:`1.5px solid ${THEME.border}`,outline:"none",
    background:THEME.panelSoft,color:THEME.text,
    fontWeight:500,fontSize:14,fontFamily:"Inter,-apple-system,sans-serif",
    boxSizing:"border-box",
  };
}

type BtnV = "primary"|"wa"|"danger"|"ghost";
function LightBtn({v,onClick,disabled,children}:{v:BtnV;onClick?:()=>void;disabled?:boolean;children:React.ReactNode}) {
  const styles:Record<BtnV,React.CSSProperties>={
    primary:{background:THEME.gradient,color:"#fff",border:"none",boxShadow:"0 2px 8px rgba(13,148,136,0.25)"},
    wa:     {background:"rgba(22,163,74,0.10)",color:THEME.green,border:`1.5px solid rgba(22,163,74,0.3)`},
    danger: {background:"rgba(220,38,38,0.08)",color:THEME.red,border:`1.5px solid rgba(220,38,38,0.2)`},
    ghost:  {background:THEME.panelSoft,color:THEME.muted,border:`1.5px solid ${THEME.border}`},
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding:"11px 14px",borderRadius:10,fontWeight:700,
      cursor:disabled?"not-allowed":"pointer",fontSize:13,
      fontFamily:"Inter,-apple-system,sans-serif",
      opacity:disabled?0.4:1,transition:"opacity 0.15s",
      display:"flex",alignItems:"center",justifyContent:"center",gap:6,...styles[v],
    }}>{children}</button>
  );
}

function FG({label,children}:{label:string;children:React.ReactNode}) {
  return (
    <div>
      <div style={{fontSize:10,color:THEME.muted,fontWeight:700,marginBottom:6,
        textTransform:"uppercase",letterSpacing:"0.08em"}}>
        {label}
      </div>
      {children}
    </div>
  );
}

function ErrorBox({children}:{children:React.ReactNode}) {
  return (
    <div style={{background:"rgba(220,38,38,0.06)",border:"1.5px solid rgba(220,38,38,0.25)",
      color:"#7f1d1d",padding:"10px 13px",borderRadius:10,fontSize:13,fontWeight:600}}>
      {children}
    </div>
  );
}

function LightModal({children,onClose}:{children:React.ReactNode;onClose:()=>void}) {
  return (
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.4)",
        zIndex:4000,backdropFilter:"blur(4px)"}} />
      <div style={{
        position:"fixed",left:"50%",top:"50%",transform:"translate(-50%,-50%)",
        width:"min(520px,calc(100vw - 24px))",
        background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
        borderRadius:18,padding:20,zIndex:4001,
        boxShadow:"0 24px 64px rgba(15,23,42,0.18)",
        maxHeight:"85vh",overflowY:"auto",
        fontFamily:"Inter,-apple-system,sans-serif",
      }}>
        {children}
      </div>
    </>
  );
}

function ModalHeader({title,subtitle,onClose}:{title:string;subtitle?:string;onClose:()=>void}) {
  return (
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
      <div style={{minWidth:0}}>
        <div style={{fontSize:17,fontWeight:800,color:THEME.text,
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
        {subtitle&&<div style={{marginTop:3,fontSize:12,color:THEME.muted,fontWeight:600}}>{subtitle}</div>}
      </div>
      <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,
        cursor:"pointer",color:THEME.muted,lineHeight:1,padding:"0 4px"}}>×</button>
    </div>
  );
}

/* ─── CreateModal ─────────────────────────────────────────────────────── */
function CreateModal(props:CreateModalProps) {
  const {
    busy,error,onClose,
    patientQuery,setPatientQuery,patientResults,patientLoading,selectedPatient,setSelectedPatient,
    quickFirstName,setQuickFirstName,quickLastName,setQuickLastName,quickPhone,setQuickPhone,createQuickPatient,
    createDate,setCreateDate,createTime,setCreateTime,createDuration,setCreateDuration,
    createStatus,setCreateStatus,createLocation,setCreateLocation,
    createClinicSite,setCreateClinicSite,createDomicileAddress,setCreateDomicileAddress,
    createAmount,setCreateAmount,createNote,setCreateNote,createAppointment,
    createPriceType,setCreatePriceType,createPaymentMethod,setCreatePaymentMethod,
    createTreatmentType,setCreateTreatmentType,treatmentCatalog,
    createRecurring,setCreateRecurring,createRecurringCount,setCreateRecurringCount,
    createRecurringInterval,setCreateRecurringInterval,
    createIsGroup,setCreateIsGroup,
    createGroupTitle,setCreateGroupTitle,
    createGroupMax,setCreateGroupMax,
    createGroupPrice,setCreateGroupPrice,
    createInitialParticipants,
    addInitialParticipantCal,
    removeInitialParticipantCal,
    searchPatientsForGroupCal,
    createQuickPatientForGroup,
    selectedPackageId,setSelectedPackageId,
  }=props;

  // Step 6.1: search partecipanti iniziali (locale al modal)
  const [partSearchQ, setPartSearchQ] = useState("");
  // Quick patient per gruppo (mig. 015)
  const [quickGroupOpen, setQuickGroupOpen] = useState(false);
  const [quickGroupBusy, setQuickGroupBusy] = useState(false);
  const [quickGroupFn, setQuickGroupFn] = useState("");
  const [quickGroupLn, setQuickGroupLn] = useState("");
  const [quickGroupPh, setQuickGroupPh] = useState("");
  const [partSearchResults, setPartSearchResults] = useState<
    Array<{ id: string; first_name: string | null; last_name: string | null; phone?: string | null }>
  >([]);
  useEffect(() => {
    if (!createIsGroup) { setPartSearchResults([]); return; }
    const q = partSearchQ.trim();
    if (!q) { setPartSearchResults([]); return; }
    const alreadyIds = new Set(createInitialParticipants.map(p => p.id));
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await searchPatientsForGroupCal(q);
      if (!cancelled) {
        setPartSearchResults(res.filter(p => !alreadyIds.has(p.id)).slice(0, 6));
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [partSearchQ, createIsGroup, createInitialParticipants, searchPatientsForGroupCal]);

  return (
    <LightModal onClose={onClose}>
      <ModalHeader
        title={createIsGroup ? "Nuovo gruppo" : "Nuovo appuntamento"}
        subtitle={`${createDate} · ${createTime}`}
        onClose={onClose}
      />
      <div style={{marginTop:18,display:"flex",flexDirection:"column",gap:14}}>
        {error&&<ErrorBox>{error}</ErrorBox>}

        {/* ─── Toggle gruppo (mig. 014) ───────────────────────────────── */}
        <div
          onClick={() => setCreateIsGroup(!createIsGroup)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 12px",
            borderRadius: 10,
            border: `1.5px solid ${createIsGroup ? "#0d9488" : THEME.border}`,
            background: createIsGroup ? "rgba(13,148,136,0.08)" : THEME.panelSoft,
            cursor: "pointer", minHeight: 50,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0 }}>
            <Icon name="users" size={18} color={THEME.muted} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 700,
                color: createIsGroup ? "#0d9488" : THEME.text,
              }}>
                Appuntamento di gruppo
              </div>
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 1 }}>
                Più pazienti, prezzo per persona
              </div>
            </div>
          </div>
          <div style={{
            width: 40, height: 22, borderRadius: 11,
            background: createIsGroup ? "#0d9488" : THEME.border,
            position: "relative",
            transition: "background 0.2s",
            flexShrink: 0,
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: "50%",
              background: "#fff",
              position: "absolute",
              top: 2,
              left: createIsGroup ? 20 : 2,
              transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </div>
        </div>

        {/* ─── Sezione GRUPPO (visibile solo se createIsGroup) ────────── */}
        {createIsGroup && (
          <div style={{
            padding: 14, borderRadius: 10,
            border: "1.5px solid rgba(13,148,136,0.3)",
            background: "rgba(13,148,136,0.06)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#0d9488", marginBottom: 4, letterSpacing: 0.4 }}>
              DATI GRUPPO
            </div>
            <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 12, lineHeight: 1.4 }}>
              ⚡ Aggiungerai i pazienti dopo aver creato il gruppo.
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: THEME.muted,
                textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5,
              }}>Titolo</div>
              <input
                type="text"
                value={createGroupTitle}
                onChange={(e) => setCreateGroupTitle(e.target.value)}
                placeholder="Es. Posturale, Pilates…"
                style={{...inputS(), minHeight: 42, fontSize: 14, fontWeight: 600}}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: THEME.muted,
                  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5,
                }}>Max partecipanti</div>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min={2}
                  max={50}
                  value={createGroupMax}
                  onChange={(e) => setCreateGroupMax(e.target.value.replace(/[^0-9]/g, ""))}
                  style={{...inputS(), minHeight: 42, fontSize: 14, fontWeight: 700, textAlign: "center"}}
                />
              </div>
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: THEME.muted,
                  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5,
                }}>€/persona</div>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={createGroupPrice}
                    onChange={(e) => setCreateGroupPrice(e.target.value.replace(/[^0-9.,]/g, ""))}
                    style={{...inputS(), minHeight: 42, fontSize: 14, fontWeight: 700, textAlign: "right", paddingRight: 28}}
                  />
                  <span style={{
                    position: "absolute", right: 12, top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: 13, color: THEME.muted, fontWeight: 700,
                    pointerEvents: "none",
                  }}>€</span>
                </div>
              </div>
            </div>

            <div style={{
              marginTop: 10,
              padding: "8px 12px",
              background: "#fff",
              border: "1px solid rgba(13,148,136,0.2)",
              borderRadius: 6,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 11, color: THEME.muted }}>
                Totale potenziale
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#0d9488" }}>
                €{(() => {
                  const n = parseInt(createGroupMax, 10) || 0;
                  const p = parseFloat((createGroupPrice || "0").replace(",", ".")) || 0;
                  return (n * p).toFixed(2);
                })()}
              </span>
            </div>

            {/* ─── Step 6.1: partecipanti iniziali ───────────── */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed rgba(13,148,136,0.25)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, letterSpacing: 0.3 }}>
                  PARTECIPANTI (opzionale)
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 700,
                  color: createInitialParticipants.length > (parseInt(createGroupMax, 10) || 0)
                    ? "#dc2626"
                    : "#0d9488",
                }}>
                  {createInitialParticipants.length}/{parseInt(createGroupMax, 10) || 0}
                </div>
              </div>

              {/* Quick patient (mig. 015) */}
              {createQuickPatientForGroup && !quickGroupOpen && (
                <button
                  type="button"
                  onClick={() => setQuickGroupOpen(true)}
                  style={{
                    width: "100%", padding: "9px 12px", marginBottom: 8,
                    borderRadius: 8,
                    border: `1px dashed #0d9488`,
                    background: "rgba(13,148,136,0.05)",
                    color: "#0d9488",
                    fontWeight: 700, fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  + Nuovo paziente rapido
                </button>
              )}

              {createQuickPatientForGroup && quickGroupOpen && (
                <div style={{
                  border: `1px solid #2563eb`,
                  background: "rgba(37,99,235,0.04)",
                  padding: 10, borderRadius: 8, marginBottom: 8,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1e40af", marginBottom: 8 }}>
                    Nuovo paziente rapido
                  </div>
                  <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
                    <input
                      autoFocus
                      value={quickGroupFn}
                      onChange={e => setQuickGroupFn(e.target.value)}
                      placeholder="Nome *"
                      style={{ ...inputS(), fontSize: 13 }}
                    />
                    <input
                      value={quickGroupLn}
                      onChange={e => setQuickGroupLn(e.target.value)}
                      placeholder="Cognome *"
                      style={{ ...inputS(), fontSize: 13 }}
                    />
                    <input
                      value={quickGroupPh}
                      onChange={e => setQuickGroupPh(e.target.value)}
                      placeholder="Telefono (opzionale)"
                      style={{ ...inputS(), fontSize: 13 }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => {
                        setQuickGroupOpen(false);
                        setQuickGroupFn(""); setQuickGroupLn(""); setQuickGroupPh("");
                      }}
                      disabled={quickGroupBusy}
                      style={{
                        flex: 1, padding: "9px", borderRadius: 7,
                        border: `1px solid ${THEME.border}`,
                        background: "#fff", color: THEME.muted,
                        fontWeight: 700, fontSize: 12, cursor: "pointer",
                      }}
                    >Annulla</button>
                    <button
                      onClick={async () => {
                        const fn = quickGroupFn.trim(), ln = quickGroupLn.trim();
                        if (!fn || !ln) return;
                        setQuickGroupBusy(true);
                        try {
                          const created = await createQuickPatientForGroup({
                            first_name: fn, last_name: ln,
                            phone: quickGroupPh.trim() || null,
                          });
                          if (created) {
                            addInitialParticipantCal(created);
                            setQuickGroupOpen(false);
                            setQuickGroupFn(""); setQuickGroupLn(""); setQuickGroupPh("");
                          }
                        } finally {
                          setQuickGroupBusy(false);
                        }
                      }}
                      disabled={quickGroupBusy || !quickGroupFn.trim() || !quickGroupLn.trim()}
                      style={{
                        flex: 1, padding: "9px", borderRadius: 7,
                        border: "none",
                        background: "#16a34a", color: "#fff",
                        fontWeight: 700, fontSize: 12, cursor: "pointer",
                        opacity: quickGroupBusy || !quickGroupFn.trim() || !quickGroupLn.trim() ? 0.6 : 1,
                      }}
                    >{quickGroupBusy ? "Creo…" : "Crea e aggiungi"}</button>
                  </div>
                </div>
              )}

              <div style={{ position: "relative", marginBottom: 6 }}>
                <input
                  type="text"
                  value={partSearchQ}
                  onChange={(e) => setPartSearchQ(e.target.value)}
                  placeholder="🔍 Cerca paziente…"
                  style={{
                    ...inputS(),
                    minHeight: 40,
                    fontSize: 13,
                  }}
                />
                {partSearchResults.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0,
                    marginTop: 2, zIndex: 100,
                    background: "#fff",
                    border: `1.5px solid ${THEME.border}`,
                    borderRadius: 8,
                    maxHeight: 200, overflowY: "auto",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}>
                    {partSearchResults.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          addInitialParticipantCal(p);
                          setPartSearchQ("");
                          setPartSearchResults([]);
                        }}
                        style={{
                          padding: "10px 12px",
                          cursor: "pointer",
                          borderBottom: `1px solid ${THEME.border}`,
                          fontSize: 13,
                          color: THEME.text,
                          minHeight: 44,
                          display: "flex", alignItems: "center",
                        }}
                      >
                        <span style={{ fontWeight: 600, flex: 1 }}>
                          {(p.last_name || "").trim()} {(p.first_name || "").trim()}
                        </span>
                        {p.phone && (
                          <span style={{ fontSize: 10, color: THEME.muted, marginLeft: 8 }}>{p.phone}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {partSearchQ.trim() && partSearchResults.length === 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0,
                    marginTop: 2, zIndex: 100,
                    background: "#fff",
                    border: `1.5px solid ${THEME.border}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                    fontSize: 12, color: THEME.muted, fontStyle: "italic",
                  }}>
                    Nessun paziente trovato
                  </div>
                )}
              </div>

              {createInitialParticipants.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {createInitialParticipants.map((p) => {
                    const initials =
                      ((p.last_name || "").trim()[0] || "") +
                      ((p.first_name || "").trim()[0] || "");
                    return (
                      <div
                        key={p.id}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "5px 5px 5px 8px",
                          background: "#fff",
                          border: "1.5px solid rgba(13,148,136,0.4)",
                          borderRadius: 99,
                          fontSize: 11,
                        }}
                      >
                        <span style={{
                          width: 18, height: 18, borderRadius: "50%",
                          background: "#0d9488", color: "#fff",
                          fontSize: 9, fontWeight: 700,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          {initials.toUpperCase() || "?"}
                        </span>
                        <span style={{ color: THEME.text, fontWeight: 600 }}>
                          {(p.last_name || "").trim()}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeInitialParticipantCal(p.id)}
                          style={{
                            width: 22, height: 22, borderRadius: "50%",
                            background: "transparent", border: "none",
                            cursor: "pointer", color: THEME.muted,
                            fontSize: 14, fontWeight: 700,
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            padding: 0, lineHeight: 1,
                          }}
                          aria-label="Rimuovi"
                        >×</button>
                      </div>
                    );
                  })}
                </div>
              )}

              {createInitialParticipants.length > (parseInt(createGroupMax, 10) || 0) && (
                <div style={{
                  marginTop: 6, padding: "5px 10px",
                  background: "rgba(220,38,38,0.08)",
                  border: "1px solid rgba(220,38,38,0.25)",
                  borderRadius: 6,
                  fontSize: 10, color: "#7f1d1d",
                }}>
                  ⚠️ Troppi pazienti. Aumenta il max o rimuovi qualcuno.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Sezione Paziente (NASCOSTA se gruppo) ─────────────────── */}
        {!createIsGroup && (<>
        <FG label="Paziente">
          <input value={patientQuery} onChange={e=>setPatientQuery(e.target.value)}
            style={inputS()} placeholder="Cerca per nome/cognome…" />

          {patientLoading&&<div style={{marginTop:6,fontSize:12,color:THEME.muted,fontWeight:600}}>Ricerca…</div>}
          {patientResults.length>0&&(
            <div style={{marginTop:6,border:`1.5px solid ${THEME.border}`,borderRadius:10,overflow:"hidden"}}>
              {patientResults.map(p=>{
                const name=`${p.first_name??""} ${p.last_name??""}`.trim();
                return (
                  <button key={p.id} onClick={()=>setSelectedPatient(p)} style={{
                    width:"100%",textAlign:"left",padding:"10px 14px",border:"none",
                    borderBottom:`1px solid ${THEME.border}`,
                    background:selectedPatient?.id===p.id?"rgba(37,99,235,0.08)":THEME.panelSoft,
                    cursor:"pointer",color:selectedPatient?.id===p.id?THEME.blue:THEME.text,
                    fontWeight:600,fontSize:13,fontFamily:"Inter,-apple-system,sans-serif",
                  }}>
                    {name||"Paziente"}{p.phone?` · ${p.phone}`:""}
                  </button>
                );
              })}
            </div>
          )}
          {selectedPatient&&(
            <div style={{marginTop:6,padding:"6px 12px",background:"rgba(37,99,235,0.08)",
              borderRadius:8,fontSize:13,color:THEME.blue,fontWeight:700}}>
              ✓ {`${selectedPatient.first_name??""} ${selectedPatient.last_name??""}`.trim()}
            </div>
          )}
          {/* Picker pacchetto sedute (mig. 014_packages): mostra solo se non gruppo + paziente */}
          {!createIsGroup && selectedPatient && (
            <PackagePickerSection
              patientId={selectedPatient.id}
              value={selectedPackageId}
              onChange={setSelectedPackageId}
              compact
            />
          )}
        </FG>
        <div style={{borderTop:`1.5px solid ${THEME.border}`,paddingTop:14}}>
          <div style={{fontSize:10,color:THEME.muted,fontWeight:700,marginBottom:10,
            textTransform:"uppercase",letterSpacing:"0.08em"}}>Oppure crea paziente rapido</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <input value={quickFirstName} onChange={e=>setQuickFirstName(e.target.value)} style={inputS()} placeholder="Nome" />
            <input value={quickLastName}  onChange={e=>setQuickLastName(e.target.value)}  style={inputS()} placeholder="Cognome" />
          </div>
          <input value={quickPhone} onChange={e=>setQuickPhone(e.target.value)}
            style={{...inputS(),marginTop:8}} placeholder="Telefono (opzionale)" />
          <div style={{marginTop:10}}>
            <LightBtn v="primary" onClick={createQuickPatient} disabled={busy}>➕ Crea e seleziona</LightBtn>
          </div>
        </div>
        </>)}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <FG label="Data"><input type="date" value={createDate} onChange={e=>setCreateDate(e.target.value)} style={inputS()} /></FG>
          <FG label="Ora"><input type="time" value={createTime} onChange={e=>setCreateTime(e.target.value)} style={inputS()} /></FG>
          <FG label="Min"><input type="number" min={15} step={5} value={createDuration} onChange={e=>setCreateDuration(Number(e.target.value))} style={inputS()} /></FG>
        </div>
        <FG label="Stato">
          <select value={createStatus} onChange={e=>setCreateStatus(e.target.value as Status)} style={inputS()}>
            <option value="confirmed">Confermato</option><option value="booked">Prenotato</option>
            <option value="done">Eseguito</option><option value="not_paid">Non pagata</option>
            <option value="cancelled">Annullato</option>
          </select>
        </FG>
        {!createIsGroup && (
        <FG label="Trattamento">
          <div style={{ position: "relative" }}>
            <div style={{
              position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
              width: 12, height: 12, borderRadius: "50%",
              background: treatmentCatalog.find(t => t.key === createTreatmentType)?.color ?? "#94a3b8",
              pointerEvents: "none", zIndex: 1,
              border: "1px solid rgba(0,0,0,0.06)",
            }} />
            <select
              value={createTreatmentType}
              onChange={e=>setCreateTreatmentType(e.target.value)}
              style={{ ...inputS(), paddingLeft: 32, fontWeight: 700 }}
            >
              {treatmentCatalog.length === 0 && (
                <option value="seduta">Seduta</option>
              )}
              {treatmentCatalog.map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>
        </FG>
        )}
        <FG label="Luogo">
          <select value={createLocation} onChange={e=>setCreateLocation(e.target.value as LocationType)} style={inputS()}>
            <option value="studio">Studio</option><option value="domicile">Domicilio</option>
          </select>
        </FG>
        {createLocation==="studio"
          ?(props.multiLocationEnabled && props.studioLocations && props.studioLocations.length > 0
              ? (() => {
                  const locs = props.studioLocations!;
                  const sel = locs.find(l => l.id === props.createLocationId)
                          ?? locs.find(l => l.is_primary)
                          ?? locs[0];
                  const bc = sel && !sel.is_primary && sel.border_color ? sel.border_color : null;
                  return (
                    <FG label="Sede">
                      <select
                        value={props.createLocationId ?? sel?.id ?? ""}
                        onChange={e => {
                          const id = e.target.value || null;
                          props.setCreateLocationId?.(id);
                          if (id) {
                            const l = locs.find(x => x.id === id);
                            if (l) setCreateClinicSite(l.name);
                          }
                        }}
                        style={{ ...inputS(), border: bc ? `2px solid ${bc}` : inputS().border }}
                      >
                        {locs.map(l => (
                          <option key={l.id} value={l.id}>
                            {l.name}{l.is_primary ? " (principale)" : ""}
                          </option>
                        ))}
                      </select>
                      {sel?.address && (
                        <div style={{ marginTop:4, fontSize:11, color: bc || "#64748b", fontWeight:500 }}>
                          📍 {sel.address}
                        </div>
                      )}
                    </FG>
                  );
                })()
              : <FG label="Sede"><input value={createClinicSite} onChange={e=>setCreateClinicSite(e.target.value)} style={inputS()} placeholder={props.studioNamePlaceholder || "Studio"} /></FG>
            )
          :<FG label="Indirizzo"><input value={createDomicileAddress} onChange={e=>setCreateDomicileAddress(e.target.value)} style={inputS()} placeholder="Indirizzo…" /></FG>
        }
        {!createIsGroup && (<>
        <FG label="Importo">
          <input value={createAmount} onChange={e=>setCreateAmount(e.target.value)} style={inputS()} placeholder="Es. 40" inputMode="decimal" />
        </FG>

        {/* Fatturazione */}
        <FG label="Fatturazione">
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setCreatePriceType("invoiced")}
              style={{
                flex: 1, padding: "9px 10px", borderRadius: 8,
                border: `1px solid ${createPriceType === "invoiced" ? THEME.green : THEME.border}`,
                background: createPriceType === "invoiced" ? THEME.green : THEME.panelBg,
                color: createPriceType === "invoiced" ? "#fff" : THEME.text,
                fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}
            >Fatturato</button>
            <button
              onClick={() => setCreatePriceType("cash")}
              style={{
                flex: 1, padding: "9px 10px", borderRadius: 8,
                border: `1px solid ${createPriceType === "cash" ? "#f59e0b" : THEME.border}`,
                background: createPriceType === "cash" ? "rgba(245,158,11,0.1)" : THEME.panelBg,
                color: createPriceType === "cash" ? "#b45309" : THEME.text,
                fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}
            >Contanti</button>
          </div>
        </FG>

        {/* Metodo Pagamento — solo se Fatturato */}
        {createPriceType === "invoiced" && (
          <FG label="Metodo pagamento *">
            <div style={{ display: "flex", gap: 6 }}>
              {([
                { v: "cash",          label: "Contanti" },
                { v: "pos",           label: "POS" },
                { v: "bank_transfer", label: "Bonifico" },
              ] as const).map(opt => {
                const active = createPaymentMethod === opt.v;
                return (
                  <button
                    key={opt.v}
                    onClick={() => setCreatePaymentMethod(opt.v)}
                    style={{
                      flex: 1, padding: "9px 6px", borderRadius: 8,
                      border: `1px solid ${active ? THEME.blue : THEME.border}`,
                      background: active ? "rgba(37,99,235,0.10)" : THEME.panelBg,
                      color: active ? THEME.blue : THEME.text,
                      fontWeight: 700, fontSize: 12, cursor: "pointer",
                    }}
                  >{opt.label}</button>
                );
              })}
            </div>
          </FG>
        )}
        </>)}

        <FG label="Note">
          <textarea value={createNote} onChange={e=>setCreateNote(e.target.value)} style={{...inputS(),minHeight:80,resize:"vertical"}} />
        </FG>

        {/* Ricorrente */}
        <div style={{background:"rgba(13,148,136,0.06)",border:"1.5px solid rgba(13,148,136,0.2)",borderRadius:10,padding:"12px 14px",marginBottom:10}}>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:14,fontWeight:700,color:THEME.teal}}>
            <input type="checkbox" checked={createRecurring} onChange={e=>setCreateRecurring(e.target.checked)} style={{width:18,height:18,accentColor:THEME.teal}}/>
            🔁 Crea ciclo di sedute
          </label>
          {createRecurring && (
            <div style={{marginTop:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:THEME.muted,marginBottom:4,textTransform:"uppercase"}}>N° sedute</div>
                <input type="number" min={2} max={30} value={createRecurringCount} onChange={e=>setCreateRecurringCount(Math.max(2,Math.min(30,parseInt(e.target.value)||6)))} style={inputS()}/>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:THEME.muted,marginBottom:4,textTransform:"uppercase"}}>Ogni (giorni)</div>
                <select value={createRecurringInterval} onChange={e=>setCreateRecurringInterval(parseInt(e.target.value))} style={inputS()}>
                  <option value={1}>Ogni giorno</option>
                  <option value={2}>Ogni 2 giorni</option>
                  <option value={3}>Ogni 3 giorni</option>
                  <option value={7}>Settimanale</option>
                  <option value={14}>Bisettimanale</option>
                </select>
              </div>
              <div style={{gridColumn:"1/-1",fontSize:11,color:THEME.teal,fontWeight:600,marginTop:2}}>
                Verranno create {createRecurringCount} sedute, una ogni {createRecurringInterval===1?"giorno":`${createRecurringInterval} giorni`}
              </div>
            </div>
          )}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <LightBtn v="primary" onClick={createAppointment} disabled={busy}>{
            createIsGroup
              ? (createRecurring ? `✅ Crea ${createRecurringCount} gruppi` : "✅ Crea gruppo")
              : (createRecurring ? `✅ Crea ${createRecurringCount} sedute` : "✅ Crea")
          }</LightBtn>
          <LightBtn v="ghost" onClick={onClose}>Annulla</LightBtn>
        </div>
      </div>
    </LightModal>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MobileSoapCollapse — wrapper collapsabile per il SOAPNotesEditor (Tappa 11)
// ═══════════════════════════════════════════════════════════════════════

function MobileSoapCollapse({
  appointmentId, patientId,
}: { appointmentId: string; patientId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      marginBottom: 14,
      border: `1px solid ${THEME.border}`,
      borderRadius: 8,
      overflow: "hidden",
      background: THEME.panelBg,
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%",
          padding: "10px 12px",
          background: open ? THEME.panelSoft : THEME.panelBg,
          border: "none",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 8, fontFamily: "inherit", textAlign: "left",
          borderBottom: open ? `1px solid ${THEME.border}` : "none",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 800, color: THEME.text }}>
          📋 SOAP & VAS
        </span>
        <span style={{
          color: THEME.muted, fontSize: 14,
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 0.15s",
        }}>›</span>
      </button>

      {open && (
        <div style={{ padding: "8px 8px 10px" }}>
          <SOAPNotesEditor
            appointmentId={appointmentId}
            patientId={patientId}
          />
        </div>
      )}
    </div>
  );
}
