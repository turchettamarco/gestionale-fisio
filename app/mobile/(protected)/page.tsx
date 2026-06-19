"use client";

function openWA(phone: string, message: string = ""): void {
  // Su mobile usa schema URI nativo whatsapp:// (apre app DIRETTA, no Safari).
  // Su desktop usa web.whatsapp.com (no pagina intermedia "Apri o Continua online").
  // Se l'app non è installata su mobile, fallback automatico a wa.me dopo 1.5s.
  const p = phone.replace(/[\s\(\)\-\.]/g, "").replace(/^\+/, "");
  const n = p.startsWith("00") ? p.slice(2) : p.startsWith("0") ? "39" + p : !p.startsWith("39") && p.length <= 10 ? "39" + p : p;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "");
  const enc = message ? encodeURIComponent(message) : "";
  if (isMobile) {
    const nativeUrl = `whatsapp://send?phone=${n}${enc ? `&text=${enc}` : ""}`;
    const fallbackUrl = `https://wa.me/${n}${enc ? `?text=${enc}` : ""}`;
    window.location.href = nativeUrl;
    setTimeout(() => {
      if (document.visibilityState === "visible") {
        window.location.href = fallbackUrl;
      }
    }, 1500);
  } else {
    const url = `https://web.whatsapp.com/send?phone=${n}${enc ? `&text=${enc}` : ""}`;
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click();
    setTimeout(() => document.body.removeChild(a), 200);
  }
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStudioBranding } from "@/src/lib/studioBranding";
import { showToast } from "@/src/components/mobile/ToastProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { buildReminderMessage } from "@/app/(protected)/calendar/utils/reminderMessage";
import { resolveAppointmentLocation, locationInitials } from "@/app/(protected)/calendar/utils/locationHelpers";
import { normalizePhoneForWA } from "@/src/lib/whatsapp";
import PaidPill from "@/src/components/PaidPill";
import type { PaymentMethod } from "@/src/components/PaidPopover";
import PackageBadge from "@/src/components/packages/PackageBadge";
import NotificationsBell from "@/src/components/NotificationsBell";
import GroupEventModalMobile, { type GroupEvent, type Participant } from "./components/GroupEventModalMobile";
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
} from "./components/groupHandlers";

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "booked" | "confirmed" | "done" | "cancelled" | "not_paid";
type LocationType = "studio" | "domicile";

type Appointment = {
  id: string;
  patient_id: string | null;
  start_at: string;
  end_at?: string | null;
  status: Status;
  amount: number | null;
  is_paid: boolean;
  paid_at: string | null;
  payment_method: "cash" | "pos" | "bank_transfer" | null;
  price_type: string | null;
  treatment_type: string | null;
  location: LocationType | null;
  clinic_site: string | null;
  domicile_address: string | null;
  studio_id?: string | null;
  whatsapp_sent_at: string | null;
  patients: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  } | null;
  // ─── Gruppo (mig. 014) ────────────────────────────────────────────────
  is_group?: boolean | null;
  group_title?: string | null;
  group_max_participants?: number | null;
  group_price_per_person?: number | null;
  /** Numero di partecipanti caricati (riempito dal SELECT) */
  participant_count?: number;
  /** Numero di partecipanti pagati (riempito dal SELECT) */
  participant_paid_count?: number;
  /** Totale dei partecipanti pagati (per KPI incassi del giorno) */
  group_paid_total?: number;
  /** Totale calcolato dai prezzi individuali dei partecipanti */
  group_total?: number;
  // ─── Pacchetto sedute (mig. 014_packages) ─────────────────────────────
  /** Se valorizzato, l'appuntamento scala una seduta dal pacchetto. */
  package_id?: string | null;
};

type PatientOption = { id: string; label: string; phone: string | null; firstName: string };

// ─── Theme ────────────────────────────────────────────────────────────────────

const THEME = {
  appBg:     "#f1f5f9",
  panelBg:   "#ffffff",
  panelSoft: "#f7f9fd",
  text:      "#0f172a",
  textSoft:  "#1e293b",
  muted:     "#334155",
  border:    "#cbd5e1",
  blue:      "#2563eb",
  green:     "#16a34a",
  red:       "#dc2626",
  amber:     "#f97316",
  gray:      "#94a3b8",
  gradient:  "linear-gradient(135deg,#0d9488,#2563eb)",
};

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_MAP: Record<Status, { color: string; bg: string; label: string }> = {
  booked:    { color: THEME.red,   bg: "rgba(220,38,38,0.07)",   label: "Prenotato" },
  confirmed: { color: THEME.blue,  bg: "rgba(37,99,235,0.07)",   label: "Confermato" },
  done:      { color: THEME.green, bg: "rgba(22,163,74,0.09)",   label: "Eseguito" },
  not_paid:  { color: THEME.amber, bg: "rgba(249,115,22,0.09)",  label: "Non pagata" },
  cancelled: { color: THEME.gray,  bg: "rgba(148,163,184,0.07)", label: "Annullato" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Mappa indirizzi clinici legacy. Mantenuta vuota: l'indirizzo viene
// letto da currentStudio.address (multi-tenancy).
const CLINIC_ADDRESSES: Record<string, string> = {};

function pad2(n: number) { return String(n).padStart(2, "0"); }
function toYMD(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
function fullName(p?: Appointment["patients"]) {
  return `${(p?.last_name ?? "").trim()} ${(p?.first_name ?? "").trim()}`.trim() || "Paziente";
}
function formatPhoneForWA(phone: string): string {
  // Delegato alla utility centrale in src/lib/whatsapp.ts per consistenza
  return normalizePhoneForWA(phone);
}
function formatDateRelative(date: Date): string {
  const oggi = new Date(); oggi.setHours(0,0,0,0);
  const domani = new Date(oggi); domani.setDate(oggi.getDate()+1);
  const t = new Date(date); t.setHours(0,0,0,0);
  if (t.getTime() === oggi.getTime())   return "Oggi";
  if (t.getTime() === domani.getTime()) return "Domani";
  const gg = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
  const mm = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
  return `${gg[t.getDay()]} ${t.getDate()} ${mm[t.getMonth()]}`;
}

// ─── Work hours for quick-add ─────────────────────────────────────────────────
//
// Genera gli slot di prenotazione (es. "08:00", "08:30", ...) basandosi sugli
// orari di lavoro dello studio per il giorno specificato. Step di 30 minuti.
//
// Esempio: open=08:00, close=22:00 → ["08:00","08:30",...,"21:30","22:00"]
// Se open=close o is_open=false → array vuoto (giorno chiuso).

type WorkingHour = {
  day_of_week: number;  // 0=Dom, 1=Lun, ..., 6=Sab
  open_time: string;    // "HH:MM:SS" o "HH:MM"
  close_time: string;
  is_open: boolean;
};

function buildSlotsForDay(workingHours: WorkingHour[], date: string): string[] {
  if (!date) return [];
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay(); // 0=Dom..6=Sab
  const wh = workingHours.find(w => w.day_of_week === dayOfWeek);
  if (!wh || !wh.is_open) return [];

  const parseTime = (t: string): { h: number; m: number } => {
    const [h, m] = t.split(":").map(Number);
    return { h, m: m || 0 };
  };
  const { h: oh, m: om } = parseTime(wh.open_time);
  const { h: ch, m: cm } = parseTime(wh.close_time);
  const startMin = oh * 60 + om;
  const endMin   = ch * 60 + cm;
  if (endMin <= startMin) return [];

  const slots: string[] = [];
  for (let m = startMin; m <= endMin; m += 30) {
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    slots.push(`${pad2(hh)}:${pad2(mm)}`);
  }
  return slots;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MobileHomePage() {
  const router = useRouter();

  // Studio corrente (multi-tenancy)
  const { studio: currentStudio, locations: studioLocations } = useCurrentStudio();
  const currentStudioId = currentStudio?.id ?? null;

  // Orari di lavoro dello studio (per generare slot dinamici nel quick-add)
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([]);

  const nowRef   = useRef<Date>(new Date());
  const todayYMD = useMemo(() => toYMD(new Date()), []);
  const [dateYMD, setDateYMD] = useState(todayYMD);

  const [loading, setLoading]  = useState(true);
  const [error,   setError]    = useState("");

  const [dayAppts,  setDayAppts]  = useState<Appointment[]>([]);
  const [weekAppts, setWeekAppts] = useState<Appointment[]>([]);

  // Stats settimana lun-dom della settimana corrente (per badge in header)
  // Caricato in parallelo al loadAll per coerenza con il calcolo desktop
  // (vedi RightSidebar.tsx + useCalendarEvents.ts).
  const [weekStats, setWeekStats] = useState<{
    done: number;       // sedute con status=done già fatte
    total: number;      // sedute totali settimana (escluse cancellate)
    revenue: number;    // € atteso (amount ?? expected_price)
  }>({ done: 0, total: 0, revenue: 0 });

  // Cache link di conferma pre-generati per ogni appuntamento.
  // Li pre-generiamo quando gli appuntamenti vengono caricati, così al click
  // su "Invia WA" non serve alcuna chiamata async: il click può invocare direttamente
  // l'anchor → iOS apre DIRETTAMENTE l'app WhatsApp senza passare da api.whatsapp.com.
  const [confirmLinks, setConfirmLinks] = useState<Record<string, string>>({});
  const [reminderTpl, setReminderTpl] = useState<string | null>(null);

  // Actions in progress
  const [markingDone, setMarkingDone] = useState<string | null>(null);
  const [incassando,  setIncassando]  = useState<string | null>(null);
  const [notPaying,   setNotPaying]   = useState<string | null>(null);
  const [sendingWA,   setSendingWA]   = useState<string | null>(null);

  // Expanded appointment card (tap to reveal actions)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ─── Modal gestione gruppo (mig. 014) ──────────────────────────────────────
  const [openGroup, setOpenGroup] = useState<GroupEvent | null>(null);

  /** Apre il modal gruppo per un appuntamento. Carica i partecipanti dal DB. */
  const openGroupModal = useCallback(async (a: Appointment) => {
    if (!a.is_group) return;
    const participants = await fetchGroupParticipants(a.id);
    const startISO = a.start_at;
    // Se end_at non c'è, fallback a 60 minuti dopo
    const endISO = a.end_at ?? new Date(new Date(startISO).getTime() + 60 * 60 * 1000).toISOString();
    setOpenGroup({
      id: a.id,
      start: new Date(startISO),
      end: new Date(endISO),
      group_title: a.group_title ?? null,
      group_max_participants: a.group_max_participants ?? null,
      group_price_per_person: a.group_price_per_person ?? null,
      participants,
      // Step 6.2: campi per duplicazione
      start_at: startISO,
      end_at: endISO,
      location: a.location ?? null,
      clinic_site: a.clinic_site ?? null,
      domicile_address: a.domicile_address ?? null,
      studio_id: a.studio_id ?? "",
    });
  }, []);

  /** Ricarica partecipanti del gruppo aperto e aggiorna anche le liste appts */
  const refreshOpenGroup = useCallback(async () => {
    if (!openGroup) return;
    const newParts = await fetchGroupParticipants(openGroup.id);
    setOpenGroup(prev => prev ? { ...prev, participants: newParts } : null);
    // Aggiorna anche dayAppts/weekAppts per i counter visibili nelle card
    const updateAppt = (a: Appointment): Appointment => {
      if (a.id !== openGroup.id) return a;
      return {
        ...a,
        participant_count: newParts.length,
        participant_paid_count: newParts.filter(p => p.payment_status === "paid").length,
        group_total: newParts.reduce((s, p) => s + (Number(p.price) || 0), 0),
      };
    };
    setDayAppts(prev => prev.map(updateAppt));
    setWeekAppts(prev => prev.map(updateAppt));
  }, [openGroup]);


  // Edit modal
  const [editAppt,   setEditAppt]   = useState<Appointment | null>(null);
  const [editStatus, setEditStatus] = useState<Status>("booked");
  const [editAmount, setEditAmount] = useState("");
  const [editDate,   setEditDate]   = useState("");
  const [editTime,   setEditTime]   = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Quick-add
  const [quickAddOpen,    setQuickAddOpen]    = useState(false);
  const [qaDate,          setQaDate]          = useState("");  // YYYY-MM-DD del nuovo appuntamento (default: dateYMD corrente)
  const [qaTime,          setQaTime]          = useState("");
  const [qaPatientSearch, setQaPatientSearch] = useState("");
  const [qaPatientId,     setQaPatientId]     = useState<string | null>(null);
  const [qaPatientLabel,  setQaPatientLabel]  = useState("");
  const [qaPatientPhone,  setQaPatientPhone]  = useState<string | null>(null);
  const [qaPatientFirst,  setQaPatientFirst]  = useState("");
  const [qaResults,       setQaResults]       = useState<PatientOption[]>([]);
  const [qaSearching,     setQaSearching]     = useState(false);
  const [qaSaving,        setQaSaving]        = useState(false);
  const [qaAmount,        setQaAmount]        = useState("");  // prezzo seduta (precompilato)
  const qaSearchTimer     = useRef<ReturnType<typeof setTimeout>>(undefined);
  // New patient inline
  const [qaNewMode,   setQaNewMode]   = useState(false);
  const [qaNewFirst,  setQaNewFirst]  = useState("");
  const [qaNewLast,   setQaNewLast]   = useState("");
  const [qaNewPhone,  setQaNewPhone]  = useState("");

  // ─── Creazione gruppo (mig. 014) ──────────────────────────────────────────
  const [qaIsGroup,        setQaIsGroup]        = useState(false);
  const [qaGroupTitle,     setQaGroupTitle]     = useState("");
  const [qaGroupMax,       setQaGroupMax]       = useState("6");
  const [qaGroupPrice,     setQaGroupPrice]     = useState("15.00");
  /** Default da practice_settings (caricato dopo). Usato per pre-popolare il form. */
  const [defaultGroupPrice, setDefaultGroupPrice] = useState<number>(15);
  const [defaultSessionPrice, setDefaultSessionPrice] = useState<number | null>(null);
  const [defaultSessionMethod, setDefaultSessionMethod] = useState<"invoiced" | "cash">("cash");
  const [defaultGroupMax,   setDefaultGroupMax]   = useState<number>(6);

  // ─── Partecipanti iniziali per nuovo gruppo (mig. 014, step 6.1) ───
  const [qaInitialParticipants, setQaInitialParticipants] = useState<
    Array<{ id: string; first_name: string | null; last_name: string | null; phone?: string | null }>
  >([]);
  const [qaPartSearchQ, setQaPartSearchQ] = useState("");
  const [qaPartSearchResults, setQaPartSearchResults] = useState<
    Array<{ id: string; first_name: string | null; last_name: string | null; phone?: string | null }>
  >([]);

  // Debounced search per partecipanti iniziali
  useEffect(() => {
    if (!qaIsGroup || !quickAddOpen) {
      setQaPartSearchResults([]);
      return;
    }
    const q = qaPartSearchQ.trim();
    if (!q) {
      setQaPartSearchResults([]);
      return;
    }
    const alreadyIds = new Set(qaInitialParticipants.map(p => p.id));
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await groupSearchPatientsApi(q);
      if (!cancelled) {
        setQaPartSearchResults(res.filter(p => !alreadyIds.has(p.id)).slice(0, 6));
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [qaPartSearchQ, qaIsGroup, quickAddOpen, qaInitialParticipants]);

  // Dialog WA confirm dopo creazione appuntamento.
  // Mostrato dopo saveQuickAdd() quando il paziente ha un telefono.
  // L'utente può scegliere se inviare il messaggio o saltare.
  const [waConfirmOpen, setWaConfirmOpen] = useState(false);
  const [waConfirmData, setWaConfirmData] = useState<{
    patientPhone: string;
    patientFirstName: string;
    startDate: Date;
    time: string;
  } | null>(null);

  // Slot orari occupati per il giorno selezionato in qaDate.
  // Set di stringhe "HH:MM" che sono in conflitto con appuntamenti esistenti
  // (cioè rientrano in una finestra [start, end) di un appuntamento non cancellato).
  // Caricato/aggiornato dinamicamente quando cambia qaDate o si apre il modale.
  const [qaBusyTimes, setQaBusyTimes] = useState<Set<string>>(new Set());

  // User
  const [userEmail,    setUserEmail]    = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // mig. 029 — Agenda Ospiti nel menu utente mobile (rivoluzione UX):
  //  - 0 ospiti  → voce non visibile
  //  - 1 ospite  → link diretto /ospiti/{id}
  //  - 2+ ospiti + flag OFF → submenu collassabile
  //  - 2+ ospiti + flag ON  → link unico /ospiti
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

  // Swipe
  const swipeX = useRef<number | null>(null);
  const swipeY = useRef<number | null>(null);
  const touchStartY = useRef(0);
  const isScrolling = useRef(false);

  // Pull-to-refresh
  const pullY = useRef(0);
  const [pulling, setPulling]  = useState(false);
  const [showPull, setShowPull] = useState(false);
  const PULL_THRESHOLD = 72;

  // Clock (1 min tick)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => { nowRef.current = new Date(); setTick(x => x+1); }, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [userMenuOpen]);

  useEffect(() => { void loadAll(); }, [dateYMD]); // eslint-disable-line

  // ─── Carica default prezzi gruppo (mig. 014) da practice_settings ──────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("practice_settings")
        .select("default_group_price, default_group_max_participants, standard_cash, standard_invoice, default_payment_method")
        .eq("owner_id", uid)
        .maybeSingle();
      if (cancelled) return;
      if (data?.default_group_price != null) {
        setDefaultGroupPrice(Number(data.default_group_price));
      }
      if (data?.default_group_max_participants != null) {
        setDefaultGroupMax(Number(data.default_group_max_participants));
      }
      // Prezzo standard seduta (stessa fonte del desktop) per pre-popolare il quick-add.
      // Metodo preferito: se default_payment_method è "invoiced"/fattura usa quello, altrimenti contanti.
      const prefersInvoice = String(data?.default_payment_method || "").toLowerCase().includes("invoic")
        || String(data?.default_payment_method || "").toLowerCase().includes("fattur");
      const method: "invoiced" | "cash" = prefersInvoice ? "invoiced" : "cash";
      setDefaultSessionMethod(method);
      const stdPrice = method === "invoiced" ? data?.standard_invoice : data?.standard_cash;
      if (stdPrice != null && !Number.isNaN(Number(stdPrice))) {
        setDefaultSessionPrice(Number(stdPrice));
      } else {
        // fallback coerente col desktop (seduta: contanti 35 / fatturato 40)
        setDefaultSessionPrice(method === "invoiced" ? 40 : 35);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Carica orari di lavoro dello studio (per generare slot dinamici nel quick-add).
  // Si ricarica se cambia studio (multi-tenancy).
  useEffect(() => {
    if (!currentStudioId) {
      setWorkingHours([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("working_hours")
        .select("day_of_week, open_time, close_time, is_open")
        .eq("studio_id", currentStudioId)
        .order("day_of_week");
      if (cancelled) return;
      if (error || !data) {
        setWorkingHours([]);
        return;
      }
      setWorkingHours(data as WorkingHour[]);
    })();
    return () => { cancelled = true; };
  }, [currentStudioId]);

  // ── Noleggio in scadenza ────────────────────────────────────────────────
  const [noleggioExpiring, setNoleggioExpiring] = useState<{id:string;patient_name:string;end_date:string;device_name:string;days_remaining:number}[]>([]);
  const [noleggioWarningDays, setNoleggioWarningDays] = useState(3);
  useEffect(()=>{
    (async()=>{
      try{
        const{data:cfg}=await supabase.from("noleggio_settings").select("warning_days").maybeSingle();
        const wd=cfg?.warning_days??3; setNoleggioWarningDays(wd);
        const{data}=await supabase.from("noleggios").select("id,patient_name,end_date,device_name").eq("is_returned",false).order("end_date",{ascending:true});
        const today=new Date(); today.setHours(0,0,0,0);
        const exp=(data||[]).map((n:any)=>{
          const end=new Date(n.end_date+"T00:00:00");
          const dr=Math.ceil((end.getTime()-today.getTime())/86400000);
          return{...n,days_remaining:dr};
        }).filter((n:any)=>n.days_remaining<=wd);
        setNoleggioExpiring(exp);
      }catch(e){console.error(e);}
    })();
  },[]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
    swipeX.current = e.touches[0].clientX;
    swipeY.current = e.touches[0].clientY;
    pullY.current = 0;
    isScrolling.current = false;
  }

  function onTouchMove(e: React.TouchEvent) {
    const dy = e.touches[0].clientY - touchStartY.current;
    const dx = e.touches[0].clientX - (swipeX.current ?? 0);
    if (!isScrolling.current && (Math.abs(dy) > 6 || Math.abs(dx) > 6)) {
      isScrolling.current = Math.abs(dy) > Math.abs(dx);
    }
    const scrollTop = window.scrollY ?? document.documentElement.scrollTop ?? 0;
    if (scrollTop === 0 && dy > 0 && isScrolling.current) {
      pullY.current = dy;
      if (dy > 20 && !showPull) setShowPull(true);
      else if (dy <= 20 && showPull) setShowPull(false);
    }
  }

  async function onTouchEnd(e: React.TouchEvent) {
    if (pullY.current >= PULL_THRESHOLD) {
      setShowPull(false);
      setPulling(true);
      await loadAll();
      setPulling(false);
    } else {
      setShowPull(false);
    }
    pullY.current = 0;

    if (!isScrolling.current && swipeX.current !== null && swipeY.current !== null) {
      const dx = e.changedTouches[0].clientX - swipeX.current;
      const dy = e.changedTouches[0].clientY - swipeY.current;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.8) {
        if (dx < 0) shiftDay(1); else shiftDay(-1);
      }
    }
    swipeX.current = null;
    swipeY.current = null;
    isScrolling.current = false;
  }

  // ─── Data ─────────────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true); setError("");
    try {
      const SEL = `id,patient_id,start_at,end_at,status,amount,is_paid,paid_at,payment_method,price_type,
                   treatment_type,location,clinic_site,location_id,domicile_address,studio_id,
                   whatsapp_sent_at,
                   is_group,group_title,group_max_participants,group_price_per_person,
                   package_id,
                   patients:patient_id(first_name,last_name,phone),
                   appointment_participants(id,price,payment_status)`;

      // ─── Range settimana lun-dom della data visualizzata ───────────────
      // (allineato col calcolo del calendario desktop in useCalendarEvents.ts)
      const baseDate = new Date(`${dateYMD}T12:00:00`);
      const dow = baseDate.getDay(); // 0=dom, 1=lun, ..., 6=sab
      const diffToMonday = (dow === 0 ? -6 : 1) - dow;
      const weekStart = new Date(baseDate);
      weekStart.setDate(baseDate.getDate() + diffToMonday);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      weekEnd.setHours(0, 0, 0, 0);

      const [dayRes, weekRes, weekStatsRes] = await Promise.all([
        supabase.from("appointments").select(SEL)
          .gte("start_at", `${dateYMD}T00:00:00`)
          .lt("start_at",  `${dateYMD}T23:59:59`)
          // mig. 029 — escludi appuntamenti degli ospiti dal calendario titolare
          .is("guest_practitioner_id", null)
          .order("start_at", { ascending: true }),
        supabase.from("appointments").select(SEL)
          .gte("start_at", `${todayYMD}T00:00:00`)
          .lt("start_at", addDays(new Date(), 8).toISOString())
          // mig. 029 — escludi appuntamenti degli ospiti dal calendario titolare
          .is("guest_practitioner_id", null)
          .order("start_at", { ascending: true }),
        // Query light per le stats settimana lun-dom (solo campi necessari)
        supabase.from("appointments")
          .select("status, amount, expected_price")
          .gte("start_at", weekStart.toISOString())
          .lt("start_at", weekEnd.toISOString())
          .is("guest_practitioner_id", null),
      ]);

      if (dayRes.error)  throw dayRes.error;
      if (weekRes.error) throw weekRes.error;
      // Le stats sono non-blocking: se errore, le azzero ma non blocco il resto
      if (weekStatsRes.error) {
        setWeekStats({ done: 0, total: 0, revenue: 0 });
      } else {
        const rows = (weekStatsRes.data ?? []) as Array<{
          status: string;
          amount: number | null;
          expected_price: number | null;
        }>;
        const valid = rows.filter(r => r.status !== "cancelled");
        const done = valid.filter(r => r.status === "done").length;
        const total = valid.length;
        const revenue = valid.reduce(
          (sum, r) => sum + Number(r.amount ?? r.expected_price ?? 0),
          0
        );
        setWeekStats({ done, total, revenue });
      }

      const map = (a: any): Appointment => {
        const p = Array.isArray(a.patients) ? a.patients[0] : a.patients;
        const isGroup = a.is_group === true;
        // Aggregati partecipanti (per i gruppi)
        const parts = (a.appointment_participants ?? []) as Array<{ id: string; price: number | null; payment_status?: string | null }>;
        const participantCount = parts.length;
        const paidCount = parts.filter(pp => pp.payment_status === "paid").length;
        const groupTotal = parts.reduce((s, pp) => s + (Number(pp.price) || 0), 0);
        // Totale dei soli pagati (per KPI incassi del giorno)
        const groupPaidTotal = parts
          .filter(pp => pp.payment_status === "paid")
          .reduce((s, pp) => s + (Number(pp.price) || 0), 0);
        return {
          id: a.id, patient_id: a.patient_id ?? null, start_at: a.start_at,
          end_at: a.end_at ?? null,
          status: a.status as Status, amount: a.amount ?? null, is_paid: a.is_paid ?? false,
          paid_at: a.paid_at ?? null,
          payment_method: a.payment_method ?? null,
          price_type: a.price_type ?? null,
          treatment_type: a.treatment_type ?? null, location: a.location ?? null,
          clinic_site: a.clinic_site ?? null, domicile_address: a.domicile_address ?? null,
          studio_id: a.studio_id ?? null,
          whatsapp_sent_at: a.whatsapp_sent_at ?? null, patients: p ?? null,
          is_group: isGroup,
          group_title: a.group_title ?? null,
          group_max_participants: a.group_max_participants ?? null,
          group_price_per_person: a.group_price_per_person ?? null,
          participant_count: participantCount,
          participant_paid_count: paidCount,
          group_total: groupTotal,
          group_paid_total: groupPaidTotal,
          package_id: a.package_id ?? null,
        };
      };

      setDayAppts((dayRes.data ?? []).map(map));
      setWeekAppts((weekRes.data ?? []).map(map));

      // Pre-genera link conferma e carica template in background.
      // Questo permette al click WA di essere sincrono (direct-launch dell'app).
      const allAppts = [...(dayRes.data ?? []), ...(weekRes.data ?? [])];
      (async () => {
        // Carica template Promemoria
        const { data: tplData } = await supabase
          .from("message_templates")
          .select("template")
          .eq("name", "Promemoria")
          .maybeSingle();
        if (tplData?.template) setReminderTpl(tplData.template);

        // Pre-genera token conferma per ogni appuntamento (in parallelo).
        // Aggiorniamo confirmLinks DOPO OGNI singola risposta, così se Marco
        // clicca WA su un appt specifico, il link appare appena pronto (non deve
        // aspettare che TUTTI gli altri siano finiti).
        // Dà priorità agli appuntamenti di OGGI (li fetcha per primi).
        const today = allAppts.filter((a: any) => {
          const d = new Date(a.start_at);
          const now = new Date();
          return d.toDateString() === now.toDateString();
        });
        const others = allAppts.filter((a: any) => !today.includes(a));
        const ordered = [...today, ...others];

        await Promise.all(ordered.map(async (a: any) => {
          try {
            const r = await fetch("/api/confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ appointment_id: a.id }),
            });
            const j = await r.json();
            if (r.ok && j.token) {
              setConfirmLinks(prev => ({
                ...prev,
                [a.id]: `${window.location.origin}/conferma/${j.token}`,
              }));
            }
          } catch {}
        }));
      })();
    } catch (e: any) {
      setError(e?.message ?? "Errore imprevisto");
      setDayAppts([]); setWeekAppts([]);
    } finally { setLoading(false); }
  }

  // ─── Quick actions ────────────────────────────────────────────────────────

  async function handleMarkDone(appt: Appointment) {
    if (markingDone) return;
    setMarkingDone(appt.id);
    // Mantiene coerenza col CHECK constraint appointments_paid_consistency:
    // is_paid=true ↔ paid_at NOT NULL (mig. 010).
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("appointments")
      .update({ status: "done", is_paid: true, paid_at: nowIso }).eq("id", appt.id);
    if (!error) {
      const updater = (prev: Appointment[]) => prev.map(a =>
        a.id === appt.id ? { ...a, status: "done" as Status, is_paid: true } : a
      );
      setDayAppts(updater);
      setWeekAppts(updater);
    }
    setMarkingDone(null);
  }

  async function handleIncassa(appt: Appointment) {
    if (incassando) return;
    setIncassando(appt.id);
    // Mantiene coerenza col CHECK constraint appointments_paid_consistency:
    // is_paid=true ↔ paid_at NOT NULL (mig. 010).
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("appointments")
      .update({ is_paid: true, status: "done", paid_at: nowIso }).eq("id", appt.id);
    if (!error) {
      const updater = (prev: Appointment[]) => prev.map(a =>
        a.id === appt.id ? { ...a, is_paid: true, status: "done" as Status } : a
      );
      setDayAppts(updater);
      setWeekAppts(updater);
    }
    setIncassando(null);
  }

  async function handleNotPaid(appt: Appointment) {
    if (notPaying) return;
    setNotPaying(appt.id);
    // Mantiene coerenza col CHECK constraint appointments_paid_consistency:
    // is_paid=false ↔ paid_at NULL (mig. 010).
    const { error } = await supabase.from("appointments")
      .update({ status: "not_paid", is_paid: false, paid_at: null }).eq("id", appt.id);
    if (!error) {
      const updater = (prev: Appointment[]) => prev.map(a =>
        a.id === appt.id ? { ...a, status: "not_paid" as Status, is_paid: false } : a
      );
      setDayAppts(updater);
      setWeekAppts(updater);
    }
    setNotPaying(null);
  }

  // Handler completo per il PaidPill mobile: scrive is_paid + paid_at +
  // payment_method coerentemente, aggiorna lo stato locale ottimisticamente.
  const handleUpdatePayment = useCallback(
    async (
      apptId: string,
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
      if (!next.is_paid) {
        payload.payment_method = null;
      } else if (next.payment_method) {
        payload.payment_method = next.payment_method;
      }
      const { error } = await supabase.from("appointments").update(payload).eq("id", apptId);
      if (!error) {
        const updater = (prev: Appointment[]) => prev.map(a =>
          a.id === apptId
            ? {
                ...a,
                is_paid: next.is_paid,
                paid_at: next.paid_at,
                payment_method: next.payment_method,
              }
            : a
        );
        setDayAppts(updater);
        setWeekAppts(updater);
      }
    },
    []
  );

  // SENDREMINDER — versione sincrona con token conferma client-side.
  // Se il link conferma non è in cache, generiamo un UUID in locale e costruiamo
  // il link ISTANTANEAMENTE. Il token viene poi salvato sul server in background
  // (fire-and-forget). Così il messaggio ha SEMPRE il link conferma funzionante.
  const sendReminder = useCallback((appt: Appointment) => {
    const phone = appt.patients?.phone;
    if (!phone) { showToast.warning("Nessun numero registrato."); return; }

    // Usa link conferma dalla cache, o generalo al volo client-side
    let linkConferma = confirmLinks[appt.id];
    if (!linkConferma) {
      // Genera token UUID sincrono lato client
      const clientToken = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      linkConferma = `${window.location.origin}/conferma/${clientToken}`;

      // Salva il token sul server in background (fire-and-forget, non blocca il click)
      fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_id: appt.id, client_token: clientToken }),
      }).catch(() => {});

      // Metti in cache per i click successivi
      setConfirmLinks(prev => ({ ...prev, [appt.id]: linkConferma! }));
    }

    // Costruisci messaggio sincronamente usando template pre-caricato
    const fakeEvent = {
      start: new Date(appt.start_at),
      end: new Date(appt.start_at),
      location: appt.location,
      clinic_site: appt.clinic_site,
      location_id: (appt as any).location_id ?? null,
      domicile_address: appt.domicile_address,
    } as any;

    const message = buildReminderMessage({
      appointment: fakeEvent,
      patientFirstName: appt.patients?.first_name ?? undefined,
      template: reminderTpl ?? undefined,
      isConfirmation: false,
      linkConferma,
      studioAddress: currentStudio?.address,
      signatureName: getStudioBranding(currentStudio).signatureName,
      signatureTitle: getStudioBranding(currentStudio).signatureTitle,
      studioLocations,
    });

    // Apri WhatsApp usando schema URI nativo whatsapp:// (apre app diretta)
    // con fallback a wa.me se l'app non è installata
    const clean = formatPhoneForWA(phone);
    if (!clean) {
      showToast.error("Il numero di telefono del paziente non è valido. Verifica e riprova.");
      return;
    }
    const enc = encodeURIComponent(message);
    const nativeUrl = `whatsapp://send?phone=${clean}&text=${enc}`;
    const fallbackUrl = `https://wa.me/${clean}?text=${enc}`;
    window.location.href = nativeUrl;
    setTimeout(() => {
      if (document.visibilityState === "visible") {
        window.location.href = fallbackUrl;
      }
    }, 1500);

    // Aggiorna DB in background
    const nowIso = new Date().toISOString();
    setSendingWA(appt.id);
    supabase.from("appointments")
      .update({ whatsapp_sent_at: nowIso, whatsapp_sent: true })
      .eq("id", appt.id)
      .then(() => {
        const updater = (prev: Appointment[]) => prev.map(a =>
          a.id === appt.id ? { ...a, whatsapp_sent_at: nowIso } : a
        );
        setDayAppts(updater);
        setWeekAppts(updater);
        setSendingWA(null);
      });
  }, [confirmLinks, reminderTpl, currentStudio]);

  // ─── Edit modal ───────────────────────────────────────────────────────────

  function openEdit(appt: Appointment) {
    setEditAppt(appt);
    setEditStatus(appt.status);
    setEditAmount(appt.amount !== null ? String(appt.amount) : "");
    const d = new Date(appt.start_at);
    setEditDate(toYMD(d));
    setEditTime(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
  }

  async function saveEdit() {
    if (!editAppt) return;
    setEditSaving(true);
    try {
      const newStart = new Date(`${editDate}T${editTime}:00`);
      const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);

      const updates: Record<string, unknown> = {
        status:   editStatus,
        start_at: newStart.toISOString(),
        end_at:   newEnd.toISOString(),
      };
      if (editAmount !== "") updates.amount = parseFloat(editAmount) || 0;

      const { error } = await supabase.from("appointments")
        .update(updates).eq("id", editAppt.id);
      if (error) throw error;

      const updated: Appointment = {
        ...editAppt,
        status:   editStatus,
        start_at: newStart.toISOString(),
        amount:   editAmount !== "" ? parseFloat(editAmount) || 0 : editAppt.amount,
      };
      setDayAppts(prev => prev.map(a => a.id === editAppt.id ? updated : a));
      setWeekAppts(prev => prev.map(a => a.id === editAppt.id ? updated : a));
      setEditAppt(null);
    } catch (e: any) {
      showToast.error(e?.message ?? "Errore nel salvataggio");
    } finally {
      setEditSaving(false);
    }
  }

  // ─── Quick-add ────────────────────────────────────────────────────────────

  // Carica slot orari occupati per il giorno scelto in qaDate.
  // Si attiva all'apertura del modale e ogni volta che cambia qaDate.
  // Nota: se l'utente cambia "Giorno" mentre il modale è aperto, si ricarica.
  useEffect(() => {
    if (!quickAddOpen || !qaDate) {
      setQaBusyTimes(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      // Carica appuntamenti del giorno scelto (range YYYY-MM-DD 00:00 → 23:59:59)
      const startISO = `${qaDate}T00:00:00.000Z`;
      const endISO   = `${qaDate}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from("appointments")
        .select("start_at, end_at, status")
        .gte("start_at", startISO)
        .lte("start_at", endISO)
        // mig. 029 — slot del titolare, non degli ospiti
        .is("guest_practitioner_id", null);
      if (cancelled) return;
      if (error || !data) {
        setQaBusyTimes(new Set());
        return;
      }
      // Per ogni slot disponibile per il giorno (basato su working_hours dello studio)
      // verifica se è dentro la finestra [start, end) di un appuntamento non cancellato.
      const slotsForDay = buildSlotsForDay(workingHours, qaDate);
      const busy = new Set<string>();
      for (const slot of slotsForDay) {
        const [hh, mm] = slot.split(":").map(Number);
        const slotStart = new Date(`${qaDate}T${slot}:00`);
        for (const appt of data) {
          if (appt.status === "cancelled") continue;
          const aStart = new Date(appt.start_at);
          const aEnd = new Date(appt.end_at);
          // slot è occupato se cade nella finestra [aStart, aEnd)
          if (slotStart.getTime() >= aStart.getTime() && slotStart.getTime() < aEnd.getTime()) {
            busy.add(slot);
            break;
          }
        }
      }
      setQaBusyTimes(busy);
      // Se l'orario attualmente selezionato è ora occupato (es. ho cambiato
      // giorno e in quel nuovo giorno è già preso), lo deseleziono per non
      // far prenotare per errore.
      if (qaTime && busy.has(qaTime)) {
        setQaTime("");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickAddOpen, qaDate, workingHours]);

  function openQuickAdd() {
    // Default to next available half-hour
    const now = new Date();
    const nextH = now.getHours();
    const nextM = now.getMinutes() < 30 ? 30 : 0;
    const h = nextM === 0 ? nextH + 1 : nextH;
    setQaTime(h >= 8 && h < 20 ? `${pad2(h)}:${pad2(nextM)}` : "09:00");
    setQaDate(dateYMD); // default: stesso giorno della home (di solito "oggi")
    setQaPatientSearch("");
    setQaPatientId(null);
    setQaPatientLabel("");
    setQaPatientPhone(null);
    setQaPatientFirst("");
    setQaResults([]);
    setQaSaving(false);
    setQaNewMode(false);
    setQaNewFirst("");
    setQaNewLast("");
    setQaNewPhone("");
    // Reset gruppo (mig. 014)
    setQaIsGroup(false);
    setQaGroupTitle("");
    setQaGroupMax(String(defaultGroupMax));
    setQaGroupPrice(defaultGroupPrice.toFixed(2));
    setQaAmount(defaultSessionPrice != null ? String(defaultSessionPrice).replace(".", ",") : "");
    // Reset partecipanti iniziali (step 6.1)
    setQaInitialParticipants([]);
    setQaPartSearchQ("");
    setQaPartSearchResults([]);
    setQuickAddOpen(true);
  }

  function searchPatients(query: string) {
    setQaPatientSearch(query);
    setQaPatientId(null);
    setQaPatientLabel("");
    setQaPatientPhone(null);
    setQaPatientFirst("");
    setQaNewMode(false);
    if (qaSearchTimer.current) clearTimeout(qaSearchTimer.current);
    if (query.length < 2) { setQaResults([]); return; }

    setQaSearching(true);
    qaSearchTimer.current = setTimeout(async () => {
      try {
        const words = query.trim().split(/\s+/).filter(w => w.length >= 2);
        // Search broadly with first word, then filter client-side with all words
        const searchWord = words[0];
        const { data } = await supabase.from("patients")
          .select("id,first_name,last_name,phone")
          .or(`last_name.ilike.%${searchWord}%,first_name.ilike.%${searchWord}%`)
          .limit(20);
        if (data) {
          let results = data.map((p: any) => ({
            id: p.id,
            label: `${(p.last_name ?? "").trim()} ${(p.first_name ?? "").trim()}`.trim() || "Paziente",
            phone: p.phone,
            firstName: (p.first_name ?? "").trim(),
          }));
          // Filter with all words (matches name or surname in any order)
          if (words.length > 1) {
            results = results.filter(p => {
              const full = p.label.toLowerCase();
              return words.every(w => full.includes(w.toLowerCase()));
            });
          }
          setQaResults(results.slice(0, 6));
        }
      } catch {} finally { setQaSearching(false); }
    }, 280);
  }

  function selectPatient(p: PatientOption) {
    setQaPatientId(p.id);
    setQaPatientLabel(p.label);
    setQaPatientPhone(p.phone);
    setQaPatientFirst(p.firstName);
    setQaPatientSearch(p.label);
    setQaResults([]);
  }

  async function saveQuickAdd() {
    if (!qaTime) return;
    if (!qaDate) { showToast.warning("Seleziona la data."); return; }
    if (qaBusyTimes.has(qaTime)) {
      showToast.error("L'orario selezionato è già occupato. Scegline un altro.");
      return;
    }

    // ─── Validazione gruppo (mig. 014) ──────────────────────────────────────
    if (qaIsGroup) {
      if (!qaGroupTitle.trim()) {
        showToast.warning("Inserisci un titolo per il gruppo (es. \"Posturale\").");
        return;
      }
      const maxN = parseInt(qaGroupMax, 10);
      if (isNaN(maxN) || maxN < 2) {
        showToast.warning("Numero massimo partecipanti non valido (minimo 2).");
        return;
      }
      const pricePP = parseFloat(qaGroupPrice.replace(",", "."));
      if (isNaN(pricePP) || pricePP < 0) {
        showToast.warning("Prezzo per persona non valido.");
        return;
      }
      // Step 6.1: validazione partecipanti iniziali
      if (qaInitialParticipants.length > maxN) {
        showToast.warning(`Hai selezionato ${qaInitialParticipants.length} partecipanti, ma il massimo è ${maxN}.`);
        return;
      }
    }

    setQaSaving(true);
    try {
      // Recupero utente e studio (necessari per owner_id / studio_id su INSERT)
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw new Error(`Sessione non valida: ${userErr.message}`);
      const userId = userData.user?.id;
      if (!userId) throw new Error("Utente non autenticato. Effettua di nuovo il login.");
      const studioId = currentStudio?.id ?? null;
      if (!studioId) throw new Error("Studio non disponibile. Ricarica la pagina.");

      const startDate = new Date(`${qaDate}T${qaTime}:00`);
      const startISO = startDate.toISOString();
      const endISO   = new Date(startDate.getTime() + 3600000).toISOString();

      // ─── PERCORSO GRUPPO (mig. 014) ──────────────────────────────────────
      // Per i gruppi non c'è paziente singolo: si crea l'appointment "contenitore"
      // e l'utente aggiungerà i partecipanti dopo dal modal di gestione.
      if (qaIsGroup) {
        const { data: createdGroup, error } = await supabase.from("appointments").insert({
          patient_id: null,
          start_at: startISO,
          end_at: endISO,
          status: "confirmed",
          location: "studio",
          clinic_site: currentStudio?.name || "Studio",
          owner_id: userId,
          studio_id: studioId,
          // Campi gruppo
          is_group: true,
          group_title: qaGroupTitle.trim(),
          group_max_participants: parseInt(qaGroupMax, 10),
          group_price_per_person: parseFloat(qaGroupPrice.replace(",", ".")),
        }).select("id").single();
        if (error) throw new Error(`Creazione gruppo: ${error.message}`);

        // ─── Step 6.1: insert partecipanti iniziali ──────────────────
        if (qaInitialParticipants.length > 0 && createdGroup?.id) {
          const pricePP = parseFloat(qaGroupPrice.replace(",", "."));
          const partRows = qaInitialParticipants.map(p => ({
            appointment_id: createdGroup.id,
            patient_id: p.id,
            price: isFinite(pricePP) ? pricePP : 0,
            payment_status: "unpaid",
            attendance_status: "pending",
          }));
          const { error: partErr } = await supabase
            .from("appointment_participants")
            .insert(partRows);
          if (partErr) {
            console.error("[mobile-create-group] errore partecipanti:", partErr);
            showToast.warning(
              `Gruppo creato, ma errore nell'aggiungere i partecipanti: ${partErr.message}. ` +
              `Puoi aggiungerli dalla scheda del gruppo.`
            );
          }
        }

        setQuickAddOpen(false);
        await loadAll();
        return; // Niente WhatsApp confirm per i gruppi
      }

      // ─── PERCORSO SINGOLO (esistente) ───────────────────────────────────
      let patientId = qaPatientId;
      let patientPhone = qaPatientPhone;
      let patientFirst = qaPatientFirst;

      // Create new patient if in new mode
      if (qaNewMode) {
        if (!qaNewFirst.trim() || !qaNewLast.trim()) {
          showToast.warning("Inserisci nome e cognome del paziente.");
          setQaSaving(false);
          return;
        }
        const { data: newPat, error: patErr } = await supabase.from("patients")
          .insert({
            first_name: qaNewFirst.trim(),
            last_name: qaNewLast.trim(),
            phone: qaNewPhone.trim() || null,
            owner_id: userId,        // NOT NULL nel DB
            studio_id: studioId,     // richiesto dalle RLS
          })
          .select("id")
          .single();
        if (patErr) throw new Error(`Creazione paziente: ${patErr.message}`);
        patientId = newPat.id;
        patientPhone = qaNewPhone.trim() || null;
        patientFirst = qaNewFirst.trim();
      }

      if (!patientId) {
        showToast.warning("Seleziona o crea un paziente.");
        setQaSaving(false);
        return;
      }

      const { error } = await supabase.from("appointments").insert({
        patient_id: patientId,
        start_at: startISO,
        end_at: endISO,
        status: "confirmed",
        location: "studio",
        clinic_site: currentStudio?.name || "Studio",
        owner_id: userId,        // per coerenza multi-tenancy
        operator_id: userId,     // assegna all'operatore corrente
        studio_id: studioId,     // richiesto dalle RLS
        treatment_type: "seduta",
        price_type: defaultSessionMethod,
        amount: qaAmount.trim() === "" ? defaultSessionPrice
          : (isFinite(Number(qaAmount.replace(",", "."))) ? Number(qaAmount.replace(",", ".")) : defaultSessionPrice),
      });
      if (error) throw new Error(`Creazione appuntamento: ${error.message}`);

      // Chiudi modale e ricarica appuntamenti
      setQuickAddOpen(false);
      await loadAll();

      // Se il paziente ha un telefono, mostra dialog di conferma WA
      // (invece di aprire WhatsApp direttamente)
      if (patientPhone && patientPhone.trim().length > 0) {
        setWaConfirmData({
          patientPhone: patientPhone.trim(),
          patientFirstName: patientFirst || "gentile paziente",
          startDate,
          time: qaTime,
        });
        setWaConfirmOpen(true);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Errore nella creazione";
      console.error("[saveQuickAdd]", e);
      showToast.error(msg);
    } finally { setQaSaving(false); }
  }

  /**
   * Apre WhatsApp con il messaggio di conferma per il paziente.
   * Chiamato dal dialog waConfirm dopo che l'utente clicca "Invia".
   */
  function sendQuickAddWhatsApp() {
    if (!waConfirmData) return;
    const { patientPhone, patientFirstName, startDate, time } = waConfirmData;
    const luogo = currentStudio?.address || "Studio";
    const __b = getStudioBranding(currentStudio); const firma = [__b.signatureName, __b.signatureTitle].filter(Boolean).join("\n");
    const firmaLine = firma ? `Cordiali saluti,\n${firma}` : "Cordiali saluti";
    const confMsg =
      `Buongiorno ${patientFirstName},\n\n` +
      `Le confermiamo il suo appuntamento di ${formatDateRelative(startDate)} ` +
      `alle ore ⏰ ${time}.\n\n` +
      `📍 ${luogo}\n\n` +
      `Per qualsiasi necessità non esiti a contattarci.\n\n` +
      firmaLine;

    const clean = formatPhoneForWA(patientPhone);
    if (!clean) {
      showToast.error("Il numero di telefono del paziente non è valido. Verifica e riprova.");
      setWaConfirmOpen(false);
      setWaConfirmData(null);
      return;
    }
    const enc = encodeURIComponent(confMsg);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(typeof navigator!=="undefined"?navigator.userAgent:"");
    if (isMobile) {
      window.location.href = `whatsapp://send?phone=${clean}&text=${enc}`;
      setTimeout(() => {
        if (document.visibilityState === "visible") {
          window.location.href = `https://wa.me/${clean}?text=${enc}`;
        }
      }, 1500);
    } else {
      const url = `https://web.whatsapp.com/send?phone=${clean}&text=${enc}`;
      const a = document.createElement("a"); a.href=url; a.target="_blank"; a.rel="noopener noreferrer";
      document.body.appendChild(a); a.click(); setTimeout(()=>document.body.removeChild(a),200);
    }

    setWaConfirmOpen(false);
    setWaConfirmData(null);
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  async function handleLogout() {
    try { await supabase.auth.signOut(); } finally { window.location.href = "/login"; }
  }

  // ─── Derived ──────────────────────────────────────────────────────────────

  const nowISO  = nowRef.current.toISOString();
  const isToday = dateYMD === todayYMD;

  const activeAppts = useMemo(
    () => dayAppts.filter(a => a.status !== "cancelled"),
    [dayAppts]
  );

  const incasso = useMemo(
    () => activeAppts.reduce((s, a) => {
      // Gruppi: somma dei partecipanti pagati
      if (a.is_group) return s + (a.group_paid_total ?? 0);
      // Singoli: come prima
      return s + (a.is_paid && typeof a.amount === "number" ? a.amount : 0);
    }, 0),
    [activeAppts]
  );

  const daIncassare = useMemo(
    () => activeAppts.reduce((s, a) => {
      // Gruppi: differenza tra totale potenziale e già pagato
      if (a.is_group) {
        return s + Math.max(0, (a.group_total ?? 0) - (a.group_paid_total ?? 0));
      }
      // Singoli: come prima
      return s + (!a.is_paid && typeof a.amount === "number" ? a.amount : 0);
    }, 0),
    [activeAppts]
  );

  const incassoAtteso = useMemo(
    () => activeAppts.reduce((s, a) => {
      // Gruppi: totale potenziale (somma di tutti i partecipanti)
      if (a.is_group) return s + (a.group_total ?? 0);
      // Singoli: come prima
      return s + (typeof a.amount === "number" ? a.amount : 0);
    }, 0),
    [activeAppts]
  );

  // Week strip: 7 days from today
  const weekStrip = useMemo(() => {
    const days = [];
    const base = new Date(todayYMD + "T00:00:00");
    for (let i = 0; i < 7; i++) {
      const d = addDays(base, i);
      const ymd = toYMD(d);
      const cnt = weekAppts.filter(a =>
        a.start_at.startsWith(ymd) && a.status !== "cancelled"
      ).length;
      days.push({
        ymd,
        label: ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"][d.getDay()],
        day: d.getDate(),
        cnt,
      });
    }
    return days;
  }, [weekAppts, todayYMD]);

  const headerDateLabel = useMemo(() => {
    const d = new Date(`${dateYMD}T00:00:00`);
    const mm = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
    return `${d.getDate()} ${mm[d.getMonth()]}`;
  }, [dateYMD]);

  const userInitials = useMemo(() => {
    if (!userEmail) return "U";
    const parts = (userEmail.split("@")[0]||"U").replace(/[^a-zA-Z0-9]/g," ").split(" ").filter(Boolean);
    return ((parts[0]?.[0]||"U")+(parts[1]?.[0]||"")).toUpperCase().slice(0,2);
  }, [userEmail]);

  function shiftDay(delta: number) {
    const d = new Date(`${dateYMD}T00:00:00`); d.setDate(d.getDate()+delta);
    setDateYMD(toYMD(d));
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: THEME.panelBg,
    border: `1px solid ${THEME.border}`,
    borderRadius: 14,
    boxShadow: "0 1px 4px rgba(15,23,42,0.05)",
  };

  return (
    <div style={{
      minHeight: "100dvh", background: THEME.appBg,
      fontFamily: "-apple-system,'SF Pro Text',Inter,sans-serif",
      overflowX: "hidden",
      maxWidth: "100vw",
    }}>
      <style>{`
        html, body { overscroll-behavior-y: none; -webkit-overflow-scrolling: touch; overflow-x: hidden; max-width: 100vw; }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ━━━ HEADER ━━━ */}
      <header style={{
        position: "sticky", top: 0, zIndex: 30,
        background: THEME.gradient,
        padding: "0 16px",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "max(16px, env(safe-area-inset-left, 0px))",
        paddingRight: "max(16px, env(safe-area-inset-right, 0px))",
      }}>
        {/* Top row: logo + user */}
        <div style={{
          height: 48, display: "flex", alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Logo FisioHub mark (vettoriale, gradient teal→blu già nel SVG) */}
            <img
              src="/logo-mark.svg"
              alt="FisioHub"
              width={26}
              height={26}
              style={{ display: "block", flexShrink: 0 }}
            />
            <span style={{
              fontWeight: 800, fontSize: 14, color: "#fff",
              letterSpacing: 0.5, textTransform: "uppercase",
            }}>
              Fisio<span style={{ fontWeight: 600, opacity: 0.85 }}>Hub</span>
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Refresh */}
            <button onClick={loadAll} aria-label="Aggiorna" style={{
              width: 30, height: 30, borderRadius: 8,
              border: "1.5px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.12)",
              color: "#fff", cursor: "pointer", fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>↺</button>

            {/* Bell notifiche pazienti (Fase N2) */}
            <NotificationsBell
              enabled={currentStudio?.notify_bell_enabled !== false}
              onAppointmentClick={() => router.push("/mobile/calendar")}
            />

            {/* User menu */}
            <div ref={userMenuRef} style={{ position: "relative" }}>
              <button onClick={() => setUserMenuOpen(v => !v)} style={{
                width: 30, height: 30, borderRadius: 8,
                border: "1.5px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.18)",
                color: "#fff", fontWeight: 800, fontSize: 11, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{userInitials}</button>
              {userMenuOpen && (
                <div style={{
                  position: "absolute", right: 0, top: "calc(100% + 6px)", width: 200,
                  background: THEME.panelBg, border: `1px solid ${THEME.border}`,
                  borderRadius: 12, boxShadow: "0 8px 24px rgba(15,23,42,0.15)",
                  overflow: "hidden", zIndex: 60,
                }}>
                  {/* Voce Agenda Ospiti smart (mig. 029) */}
                  {hasGuests && showIndexLink && (
                    <Link href="/mobile/ospiti" onClick={() => setUserMenuOpen(false)} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "11px 14px",
                      color: THEME.text, textDecoration: "none", fontSize: 13, fontWeight: 600,
                      borderBottom: `1px solid ${THEME.border}`,
                    }}>📋 Agenda Ospiti</Link>
                  )}
                  {hasGuests && !showIndexLink && singleGuest && (
                    <Link href={`/mobile/ospiti/${singleGuest.id}`} onClick={() => setUserMenuOpen(false)} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "11px 14px",
                      color: THEME.text, textDecoration: "none", fontSize: 13, fontWeight: 600,
                      borderBottom: `1px solid ${THEME.border}`,
                    }}>📋 Agenda {singleGuest.first_name}</Link>
                  )}
                  {hasGuests && !showIndexLink && multipleGuests && (
                    <>
                      <button
                        type="button"
                        onClick={() => setGuestSubmenuOpen(o => !o)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "11px 14px", background: "transparent", border: "none",
                          cursor: "pointer", color: THEME.text, fontSize: 13, fontWeight: 600,
                          borderBottom: `1px solid ${THEME.border}`, textAlign: "left",
                        }}
                      >
                        <span>📋 Agenda Ospiti</span>
                        <span style={{ fontSize: 10, color: THEME.muted }}>
                          {guestSubmenuOpen ? "▾" : "▸"}
                        </span>
                      </button>
                      {guestSubmenuOpen && (
                        <div style={{ borderBottom: `1px solid ${THEME.border}` }}>
                          {multipleGuests.map(g => (
                            <Link
                              key={g.id}
                              href={`/mobile/ospiti/${g.id}`}
                              onClick={() => setUserMenuOpen(false)}
                              style={{
                                display: "flex", alignItems: "center", gap: 8,
                                padding: "9px 14px 9px 30px",
                                color: THEME.text, fontSize: 12, fontWeight: 600,
                                background: "#f8fafc", textDecoration: "none",
                              }}
                            >
                              <span style={{
                                width: 8, height: 8, borderRadius: "50%",
                                background: g.display_color || "#DB2777", flexShrink: 0,
                              }} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {g.first_name} {g.last_name}
                              </span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <Link href="/settings" onClick={() => setUserMenuOpen(false)} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "11px 14px",
                    color: THEME.text, textDecoration: "none", fontSize: 13, fontWeight: 600,
                    borderBottom: `1px solid ${THEME.border}`,
                  }}>Impostazioni</Link>
                  <button onClick={handleLogout} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "11px 14px", background: "transparent", border: "none",
                    cursor: "pointer", color: THEME.red, fontWeight: 600, fontSize: 13,
                  }}>Logout</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Week strip — inside header for compactness */}
        <div style={{
          display: "flex", gap: 2, paddingBottom: 10, paddingTop: 2,
        }}>
          {weekStrip.map(d => {
            const sel = d.ymd === dateYMD;
            const tod = d.ymd === todayYMD && !sel;
            return (
              <button key={d.ymd} onClick={() => setDateYMD(d.ymd)} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                gap: 2, padding: "5px 0", borderRadius: 10, border: "none",
                background: sel ? "rgba(255,255,255,0.22)" : "transparent",
                cursor: "pointer", transition: "background 0.15s",
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: sel ? "#fff" : "rgba(255,255,255,0.55)",
                }}>{d.label}</span>
                <span style={{
                  fontSize: 15, fontWeight: 800, lineHeight: 1,
                  color: sel ? "#fff" : tod ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.65)",
                }}>{d.day}</span>
                {d.cnt > 0 && (
                  <span style={{
                    fontSize: 8, fontWeight: 800, lineHeight: 1,
                    color: sel ? "#fff" : "rgba(255,255,255,0.5)",
                    marginTop: 1,
                  }}>{d.cnt}</span>
                )}
                {d.cnt === 0 && <span style={{ fontSize: 8, lineHeight: 1, marginTop: 1, opacity: 0 }}>0</span>}
              </button>
            );
          })}
        </div>
      </header>

      {/* Bottom nav: gestita da MobileTabBar nel layout */}

      {/* ━━━ FAB ━━━ */}
      <button
        onClick={openQuickAdd}
        aria-label="Nuovo appuntamento"
        style={{
          position: "fixed",
          bottom: "calc(max(env(safe-area-inset-bottom, 0px), 6px) + 56px)",
          right: "calc(16px + env(safe-area-inset-right, 0px))",
          zIndex: 40,
          width: 50, height: 50, borderRadius: "50%",
          background: THEME.gradient, color: "#fff", border: "none", cursor: "pointer",
          fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 16px rgba(13,148,136,0.35)",
        }}
      >+</button>

      {/* ━━━ MAIN CONTENT ━━━ */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          padding: "12px 14px",
          paddingLeft: "max(14px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(14px, env(safe-area-inset-right, 0px))",
          paddingBottom: "calc(max(env(safe-area-inset-bottom, 0px), 6px) + 80px)",
        }}
      >
        {/* Pull-to-refresh */}
        {(showPull || pulling) && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: 32, color: THEME.blue, fontWeight: 700, fontSize: 12,
          }}>
            {pulling ? "↺ Aggiornamento…" : "↓ Rilascia per aggiornare"}
          </div>
        )}

        {/* ── Date header + KPI ── */}
        <div style={{ marginBottom: 12 }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 10,
          }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: THEME.text, lineHeight: 1.1 }}>
                {isToday ? "Oggi" : headerDateLabel}
              </div>
              <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 600, marginTop: 2 }}>
                {loading ? "…" : `${activeAppts.length} sedute`}
                {!isToday && ` · ${headerDateLabel}`}
                {/* Stats settimana (lun-dom): fatte/totali · € atteso */}
                {!loading && weekStats.total > 0 && (
                  <>
                    {" · "}
                    <span style={{ fontWeight: 700 }}>
                      <span style={{ color: THEME.green }}>{weekStats.done}</span>
                      <span style={{ color: THEME.muted }}>/{weekStats.total}</span>
                    </span>
                    {" · "}
                    <span style={{ color: THEME.blue, fontWeight: 700 }}>
                      €{Math.round(weekStats.revenue).toLocaleString("it-IT")}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Prospetto incasso giorno */}
          {!loading && activeAppts.length > 0 && (
            <div style={{
              display: "flex", gap: 6,
            }}>
              <div style={{
                flex: 1, padding: "8px 10px", borderRadius: 10,
                background: THEME.panelBg, border: `1px solid ${THEME.border}`,
                textAlign: "center",
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: THEME.text, lineHeight: 1 }}>
                  €{incassoAtteso.toFixed(0)}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: THEME.muted, marginTop: 3,
                  textTransform: "uppercase", letterSpacing: "0.05em" }}>Atteso</div>
              </div>
              <div style={{
                flex: 1, padding: "8px 10px", borderRadius: 10,
                background: "rgba(22,163,74,0.06)", border: `1px solid rgba(22,163,74,0.15)`,
                textAlign: "center",
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: THEME.green, lineHeight: 1 }}>
                  €{incasso.toFixed(0)}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: THEME.green, marginTop: 3,
                  textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.7 }}>Incassato</div>
              </div>
              {daIncassare > 0 && (
                <div style={{
                  flex: 1, padding: "8px 10px", borderRadius: 10,
                  background: "rgba(249,115,22,0.06)", border: `1px solid rgba(249,115,22,0.15)`,
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: THEME.amber, lineHeight: 1 }}>
                    €{daIncassare.toFixed(0)}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: THEME.amber, marginTop: 3,
                    textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.7 }}>Da incassare</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: 10, padding: 10, borderRadius: 10,
            border: "1px solid rgba(220,38,38,0.25)", background: "rgba(220,38,38,0.05)",
            color: "#7f1d1d", fontWeight: 600, fontSize: 13,
          }}>{error}</div>
        )}

        {/* ━━━ NOLEGGIO IN SCADENZA (mobile) ━━━ */}
        {noleggioExpiring.length > 0 && (
          <div style={{ marginBottom: 12, background: "#fff", borderRadius: 12, border: `1px solid ${THEME.border}`, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${THEME.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: THEME.text }}>🔌 Noleggi in scadenza</span>
              <a href="/mobile/noleggio" style={{ fontSize: 11, color: THEME.blue, fontWeight: 700, textDecoration: "none" }}>Gestisci →</a>
            </div>
            <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
              {noleggioExpiring.map(n => {
                const expired = n.days_remaining < 0;
                const urgent = n.days_remaining === 0;
                const col = expired || urgent ? "#dc2626" : "#f97316";
                const bg = expired || urgent ? "rgba(220,38,38,0.05)" : "rgba(249,115,22,0.05)";
                return (
                  <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: bg, border: `1px solid ${col}22` }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{expired ? "⛔" : urgent ? "🚨" : "⏳"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: THEME.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.patient_name}</div>
                      <div style={{ fontSize: 11, color: THEME.muted }}>{n.device_name}</div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: col, flexShrink: 0 }}>
                      {expired ? `${Math.abs(n.days_remaining)}gg fa` : urgent ? "Oggi" : `${n.days_remaining}gg`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ━━━ AGENDA ━━━ */}
        <div style={{ ...card, padding: "12px 14px" }}>
          {loading ? (
            <div style={{
              padding: "24px 0", textAlign: "center",
              color: THEME.muted, fontWeight: 600, fontSize: 13,
            }}>
              <span style={{ display: "inline-block", animation: "spin 0.8s linear infinite" }}>↺</span>
              {" "}Caricamento…
            </div>
          ) : dayAppts.length === 0 ? (
            <div style={{
              padding: "28px 16px", textAlign: "center",
              border: `1.5px dashed ${THEME.border}`, borderRadius: 10,
            }}>
              <div style={{ color: THEME.muted, fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
                Nessun appuntamento
              </div>
              <button onClick={openQuickAdd} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "10px 20px", borderRadius: 10, border: "none",
                background: THEME.gradient, color: "#fff",
                fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}>+ Aggiungi</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {dayAppts.map((a, idx) => {
                // ─── Render speciale per appuntamenti di GRUPPO (mig. 014) ───
                if (a.is_group) {
                  const count = a.participant_count ?? 0;
                  const max = a.group_max_participants ?? 0;
                  const paid = a.participant_paid_count ?? 0;
                  const total = a.group_total ?? 0;
                  const groupTitle = a.group_title || "Gruppo";
                  return (
                    <div
                      key={a.id}
                      onClick={() => openGroupModal(a)}
                      style={{
                        borderRadius: 8,
                        padding: "9px 10px",
                        background: "linear-gradient(135deg, #0d9488 0%, #06b6d4 100%)",
                        cursor: "pointer",
                        animation: `fadeIn 0.15s ease ${idx * 0.02}s both`,
                        color: "#fff",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 800, color: "#fff",
                          background: "rgba(255,255,255,0.25)",
                          padding: "1px 6px", borderRadius: 99,
                          letterSpacing: 0.4, flexShrink: 0,
                        }}>
                          👥 GRUPPO · {count}/{max}
                        </span>
                        <span style={{
                          fontVariantNumeric: "tabular-nums", fontWeight: 800,
                          fontSize: 12, color: "rgba(255,255,255,0.95)", flexShrink: 0,
                        }}>{fmtTime(a.start_at)}</span>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                          €{total.toFixed(0)}
                        </span>
                      </div>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: "#fff",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        marginBottom: 3,
                      }}>
                        {groupTitle}
                      </div>
                      <div style={{
                        fontSize: 10, color: "rgba(255,255,255,0.85)",
                        fontWeight: 600,
                      }}>
                        {count === 0
                          ? "Nessun partecipante — tocca per aggiungere"
                          : `${paid}/${count} pagati · tocca per gestire`}
                      </div>
                    </div>
                  );
                }
                // ─── Render appuntamento singolo (originale) ────────────────
                const phone      = a.patients?.phone;
                const isPastAppt = isToday && a.start_at < nowISO;
                const isDone     = a.status === "done";
                const isCancelled = a.status === "cancelled";
                const isNotPaid  = a.status === "not_paid";
                const st         = STATUS_MAP[a.status];
                const isExpanded = expandedId === a.id;

                // Micro-button style helper
                const microBtn = (bg: string, color: string, active: boolean): React.CSSProperties => ({
                  width: 28, height: 28, borderRadius: 6, border: "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, cursor: active ? "default" : "pointer",
                  background: bg, color,
                  opacity: active ? 1 : 0.85, flexShrink: 0,
                });

                return (
                  <div
                    key={a.id}
                    style={{
                      borderRadius: 8, padding: "7px 8px 7px 8px",
                      background: THEME.panelBg,
                      border: `1px solid ${THEME.border}`,
                      opacity: isCancelled ? 0.45 : isPastAppt ? 0.6 : 1,
                      cursor: "pointer",
                      transition: "opacity 0.15s",
                      animation: `fadeIn 0.15s ease ${idx * 0.02}s both`,
                    }}
                    onClick={() => {
                      const willExpand = !isExpanded;
                      setExpandedId(willExpand ? a.id : null);
                      // Se espandiamo e il link conferma non è in cache, fetchalo ora in priorità
                      if (willExpand && !confirmLinks[a.id]) {
                        fetch("/api/confirm", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ appointment_id: a.id }),
                        }).then(r => r.json()).then(j => {
                          if (j.token) {
                            setConfirmLinks(prev => ({
                              ...prev,
                              [a.id]: `${window.location.origin}/conferma/${j.token}`,
                            }));
                          }
                        }).catch(() => {});
                      }
                    }}
                  >
                    {/* ── Main row: info + micro actions ── */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      {/* Time + Name + Treatment */}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 5,
                          fontSize: 13, fontWeight: 600, color: isPastAppt ? THEME.muted : THEME.text,
                          lineHeight: 1.3,
                        }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: 99,
                            background: st.color, flexShrink: 0,
                          }} />
                          <span style={{
                            fontVariantNumeric: "tabular-nums", fontWeight: 800,
                            fontSize: 12, color: isPastAppt ? THEME.gray : THEME.text, flexShrink: 0,
                          }}>{fmtTime(a.start_at)}</span>
                          {phone ? (
                            <a href={`tel:${phone}`}
                              onClick={e => e.stopPropagation()}
                              style={{
                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                textDecoration: "none", color: "inherit",
                                WebkitTapHighlightColor: "transparent",
                              }}>{fullName(a.patients)}</a>
                          ) : (
                            <span style={{
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            }}>{fullName(a.patients)}</span>
                          )}
                          {a.is_paid && <span style={{ fontSize: 10, flexShrink: 0, opacity: 0.7 }}>💰</span>}
                          {a.location === "domicile" && <span style={{ fontSize: 10, flexShrink: 0, opacity: 0.7 }}>🏠</span>}
                          {a.package_id && <PackageBadge packageId={a.package_id} variant="compact" />}
                          <span style={{
                            fontSize: 11, color: THEME.gray, fontWeight: 500, flexShrink: 0,
                          }}>
                            {typeof a.amount === "number" && a.amount > 0 ? `€${a.amount}` : ""}
                          </span>
                        </div>
                      </div>

                      {/* ── Micro action buttons ── */}
                      {!isCancelled && (
                        <div onClick={e => e.stopPropagation()} style={{
                          display: "flex", gap: 4, flexShrink: 0,
                        }}>
                          {/* ✓ Eseguito */}
                          <button
                            onClick={() => !isDone && handleMarkDone(a)}
                            disabled={isDone || markingDone === a.id}
                            title={isDone ? "Eseguito" : "Segna eseguito"}
                            style={microBtn(
                              isDone ? "rgba(22,163,74,0.15)" : "rgba(22,163,74,0.07)",
                              THEME.green, isDone,
                            )}
                          >{markingDone === a.id ? "…" : "✓"}</button>

                          {/* ! Non pagata */}
                          <button
                            onClick={() => !isNotPaid && handleNotPaid(a)}
                            disabled={isNotPaid || notPaying === a.id}
                            title={isNotPaid ? "Non pagata" : "Segna non pagata"}
                            style={microBtn(
                              isNotPaid ? "rgba(249,115,22,0.15)" : "rgba(249,115,22,0.07)",
                              THEME.amber, isNotPaid,
                            )}
                          >{notPaying === a.id ? "…" : "!"}</button>

                          {/* 💬 WA */}
                          {phone && (
                            <button
                              onClick={() => sendReminder(a)}
                              disabled={sendingWA === a.id}
                              title={a.whatsapp_sent_at ? "Rinvia WA" : "Invia WA"}
                              style={microBtn(
                                a.whatsapp_sent_at ? "rgba(22,163,74,0.1)" : "rgba(37,99,235,0.07)",
                                a.whatsapp_sent_at ? THEME.green : THEME.blue, false,
                              )}
                            >{sendingWA === a.id ? "…" : "💬"}</button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── Expanded details + secondary actions ── */}
                    {isExpanded && (
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{
                          marginTop: 6, paddingTop: 6,
                          borderTop: `1px solid ${THEME.border}`,
                          animation: "fadeIn 0.12s ease",
                        }}
                      >
                        {/* Detail line */}
                        <div style={{
                          fontSize: 11, color: THEME.muted, fontWeight: 500, marginBottom: 6,
                        }}>
                          {a.treatment_type ?? "Seduta"}
                          {typeof a.amount === "number" && a.amount > 0 ? ` · €${a.amount}` : ""}
                          {` · ${st.label}`}
                        </div>

                        {!isCancelled && (
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                            {/* Pillola pagamento (sostituisce Incassa) */}
                            <PaidPill
                              data={{
                                is_paid: a.is_paid,
                                paid_at: a.paid_at,
                                payment_method: a.payment_method,
                                price_type: a.price_type,
                              }}
                              onUpdate={async (next) => handleUpdatePayment(a.id, next)}
                              compact
                            />

                            {a.patient_id && (
                              <button
                                onClick={() => router.push(`/mobile/patients/${a.patient_id}`)}
                                style={{
                                  display: "inline-flex", alignItems: "center",
                                  padding: "5px 9px", borderRadius: 6,
                                  border: `1px solid ${THEME.border}`,
                                  background: THEME.panelBg, color: THEME.text,
                                  fontWeight: 600, fontSize: 11, cursor: "pointer",
                                }}
                              >Scheda</button>
                            )}

                            <button
                              onClick={() => openEdit(a)}
                              style={{
                                display: "inline-flex", alignItems: "center",
                                padding: "5px 9px", borderRadius: 6,
                                border: `1px solid ${THEME.border}`,
                                background: THEME.panelBg, color: THEME.muted,
                                fontWeight: 600, fontSize: 11, cursor: "pointer",
                              }}
                            >Modifica</button>
                          </div>
                        )}

                        {isCancelled && a.patient_id && (
                          <button
                            onClick={() => router.push(`/mobile/patients/${a.patient_id}`)}
                            style={{
                              display: "inline-flex", alignItems: "center",
                              padding: "5px 9px", borderRadius: 6,
                              border: `1px solid ${THEME.border}`,
                              background: THEME.panelBg, color: THEME.text,
                              fontWeight: 600, fontSize: 11, cursor: "pointer",
                            }}
                          >Scheda paziente</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ━━━ PROSSIMI GIORNI ━━━ */}
        {!loading && (() => {
          // Group upcoming appointments by day (exclude today, exclude cancelled)
          const upcoming = weekAppts.filter(a =>
            !a.start_at.startsWith(dateYMD) &&
            a.start_at > nowISO &&
            a.status !== "cancelled"
          );
          if (upcoming.length === 0) return null;

          const grouped: Record<string, Appointment[]> = {};
          for (const a of upcoming) {
            const key = a.start_at.slice(0, 10);
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(a);
          }
          const sortedDays = Object.keys(grouped).sort();

          return (
            <div style={{ ...card, padding: "12px 14px", marginTop: 10 }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 10,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: THEME.textSoft }}>
                  Prossimi giorni
                </span>
                <button
                  onClick={() => router.push(`/mobile/calendar?date=${dateYMD}`)}
                  style={{
                    padding: "5px 10px", borderRadius: 8, border: "none",
                    background: "rgba(37,99,235,0.08)", color: THEME.blue,
                    fontWeight: 700, fontSize: 12, cursor: "pointer",
                  }}
                >Calendario →</button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sortedDays.map(dayKey => {
                  const appts = grouped[dayKey];
                  const dayDate = new Date(`${dayKey}T00:00:00`);
                  return (
                    <div key={dayKey}>
                      <div style={{
                        fontSize: 11, fontWeight: 700, color: THEME.muted,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                        marginBottom: 6,
                      }}>
                        {formatDateRelative(dayDate)} · {appts.length} {appts.length === 1 ? "seduta" : "sedute"}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {appts.map(a => {
                          const st = STATUS_MAP[a.status];
                          const upPhone = a.patients?.phone;
                          const isGroup = a.is_group === true;

                          // ─── Render speciale GRUPPO (mig. 015) ─────────
                          // Stesso stile gradient della vista giorno, così
                          // i gruppi sono riconoscibili a colpo d'occhio
                          // anche in "Prossimi giorni".
                          if (isGroup) {
                            const count = a.participant_count ?? 0;
                            const max = a.group_max_participants ?? 0;
                            const total = a.group_total ?? 0;
                            const groupTitle = a.group_title || "Gruppo";
                            return (
                              <div
                                key={a.id}
                                onClick={() => openGroupModal(a)}
                                style={{
                                  width: "100%", textAlign: "left",
                                  borderRadius: 8,
                                  padding: "8px 10px",
                                  background: "linear-gradient(135deg, #0d9488 0%, #06b6d4 100%)",
                                  color: "#fff",
                                  cursor: "pointer",
                                  position: "relative",
                                }}
                              >
                                <div style={{
                                  display: "flex", alignItems: "center", gap: 6,
                                  fontWeight: 700, fontSize: 13,
                                  minWidth: 0,
                                }}>
                                  <span style={{
                                    fontWeight: 800, fontSize: 12,
                                    fontVariantNumeric: "tabular-nums", flexShrink: 0,
                                    color: "rgba(255,255,255,0.95)",
                                  }}>{fmtTime(a.start_at)}</span>
                                  <span style={{
                                    fontSize: 9, fontWeight: 800, color: "#fff",
                                    background: "rgba(255,255,255,0.25)",
                                    padding: "1px 6px", borderRadius: 99,
                                    letterSpacing: 0.4, flexShrink: 0,
                                  }}>
                                    👥 GRUPPO · {count}/{max}
                                  </span>
                                  <span style={{
                                    flex: 1, minWidth: 0,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                  }}>{groupTitle}</span>
                                  <span style={{
                                    fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0,
                                  }}>€{total.toFixed(0)}</span>
                                </div>
                              </div>
                            );
                          }

                          // ─── Render appuntamento singolo (originale) ────
                          // Etichetta: nome paziente
                          const displayName = fullName(a.patients);
                          // Multi-sede (mig. 014, fase 3)
                          const apptLoc = resolveAppointmentLocation(
                            { location_id: (a as any).location_id ?? null, location: a.location },
                            studioLocations as any
                          );
                          const apptLocBorder = apptLoc && !apptLoc.is_primary ? (apptLoc.border_color || "#2563eb") : null;
                          const apptLocInitials = apptLoc && !apptLoc.is_primary ? locationInitials(apptLoc.name) : null;
                          return (
                            <div
                              key={a.id}
                              style={{
                                width: "100%", textAlign: "left",
                                borderRadius: 8,
                                border: apptLocBorder ? `2px solid ${apptLocBorder}` : `1px solid ${THEME.border}`,
                                background: THEME.panelSoft, padding: "8px 10px",
                                position: "relative",
                              }}
                            >
                              {apptLocInitials && (
                                <span
                                  title={apptLoc?.name}
                                  style={{
                                    position: "absolute",
                                    top: 6, right: 6,
                                    background: apptLocBorder ?? undefined,
                                    color: "#fff",
                                    fontSize: 9, fontWeight: 800,
                                    padding: "1px 5px",
                                    borderRadius: 3,
                                    letterSpacing: 0.3,
                                    lineHeight: 1.1,
                                    pointerEvents: "none",
                                  }}
                                >
                                  {apptLocInitials}
                                </span>
                              )}
                              <div
                                onClick={() => setDateYMD(dayKey)}
                                style={{
                                  display: "flex", justifyContent: "space-between",
                                  alignItems: "center", gap: 8, cursor: "pointer",
                                }}
                              >
                                <div style={{
                                  display: "flex", alignItems: "center", gap: 6,
                                  fontWeight: 600, color: THEME.text, fontSize: 13,
                                  minWidth: 0,
                                }}>
                                  <span style={{
                                    fontWeight: 800, color: st.color, fontSize: 12,
                                    fontVariantNumeric: "tabular-nums", flexShrink: 0,
                                  }}>{fmtTime(a.start_at)}</span>
                                  {upPhone ? (
                                    <a href={`tel:${upPhone}`}
                                      onClick={e => e.stopPropagation()}
                                      style={{
                                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                        textDecoration: "none", color: "inherit",
                                      }}>{displayName}</a>
                                  ) : (
                                    <span style={{
                                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                    }}>{displayName}</span>
                                  )}
                                </div>
                                <span style={{
                                  fontSize: 9, fontWeight: 700, color: st.color,
                                  padding: "2px 6px", borderRadius: 4,
                                  background: `${st.color}12`,
                                  flexShrink: 0,
                                }}>{st.label}</span>
                              </div>
                              {/* WA remind */}
                              {upPhone && (
                                <div style={{ marginTop: 6, display: "flex", gap: 5 }}>
                                  <button
                                    onClick={() => sendReminder(a)}
                                    style={{
                                      display: "inline-flex", alignItems: "center", gap: 3,
                                      padding: "5px 9px", borderRadius: 6, border: "none",
                                      background: a.whatsapp_sent_at ? "rgba(22,163,74,0.07)" : "rgba(37,99,235,0.07)",
                                      color: a.whatsapp_sent_at ? THEME.green : THEME.blue,
                                      fontWeight: 700, fontSize: 11, cursor: "pointer",
                                    }}
                                  >
                                    💬 Invia promemoria
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ━━━ QUICK-ADD BOTTOM SHEET ━━━ */}
      {quickAddOpen && (
        <>
          <div
            onClick={() => setQuickAddOpen(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 50,
              background: "rgba(15,23,42,0.4)",
              backdropFilter: "blur(2px)",
            }}
          />
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 51,
            background: THEME.panelBg, borderRadius: "16px 16px 0 0",
            padding: "16px 18px",
            paddingLeft: "max(18px, env(safe-area-inset-left, 0px))",
            paddingRight: "max(18px, env(safe-area-inset-right, 0px))",
            paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))",
            boxShadow: "0 -6px 32px rgba(15,23,42,0.15)",
            animation: "slideUp 0.25s ease",
            maxHeight: "88vh", overflowY: "auto", overflowX: "hidden",
            boxSizing: "border-box",
          }}>
            {/* Handle */}
            <div style={{ width: 32, height: 3.5, borderRadius: 99, background: THEME.border, margin: "0 auto 14px" }}/>

            <div style={{ fontSize: 15, fontWeight: 800, color: THEME.text, marginBottom: 2 }}>
              {qaIsGroup ? "Nuovo gruppo" : "Nuovo appuntamento"}
            </div>
            <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 14 }}>
              {qaIsGroup ? "Scegli data, orario e dati gruppo" : "Scegli data, orario e paziente"}
            </div>

            {/* ─── Toggle gruppo (mig. 014) ────────────────────────────── */}
            <div
              onClick={() => setQaIsGroup(!qaIsGroup)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", marginBottom: 14,
                borderRadius: 10,
                border: `1.5px solid ${qaIsGroup ? "#0d9488" : THEME.border}`,
                background: qaIsGroup ? "rgba(13,148,136,0.08)" : THEME.panelSoft,
                cursor: "pointer",
                transition: "all 0.15s",
                minHeight: 50,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>👥</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700,
                    color: qaIsGroup ? "#0d9488" : THEME.text,
                  }}>
                    Appuntamento di gruppo
                  </div>
                  <div style={{ fontSize: 11, color: THEME.muted, marginTop: 1 }}>
                    Più pazienti, prezzo per persona
                  </div>
                </div>
              </div>
              {/* Toggle switch */}
              <div style={{
                width: 40, height: 22, borderRadius: 11,
                background: qaIsGroup ? "#0d9488" : THEME.border,
                position: "relative",
                transition: "background 0.2s",
                flexShrink: 0,
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: "#fff",
                  position: "absolute",
                  top: 2,
                  left: qaIsGroup ? 20 : 2,
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </div>
            </div>

            {/* Date picker — scelta rapida giorno + selettore esteso */}
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: THEME.muted,
                textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
              }}>Giorno</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                {(() => {
                  // Bottoni rapidi: Oggi / Domani / Dopodomani / +3gg
                  const today = new Date(); today.setHours(0,0,0,0);
                  const quickChoices = [
                    { label: "Oggi",       offset: 0 },
                    { label: "Domani",     offset: 1 },
                    { label: "Dopodomani", offset: 2 },
                    { label: "+3 giorni",  offset: 3 },
                  ];
                  return quickChoices.map(({ label, offset }) => {
                    const d = new Date(today);
                    d.setDate(d.getDate() + offset);
                    const ymd = toYMD(d);
                    const active = qaDate === ymd;
                    return (
                      <button
                        key={label}
                        onClick={() => setQaDate(ymd)}
                        style={{
                          padding: "6px 11px", borderRadius: 7, fontSize: 12, fontWeight: 700,
                          border: active ? `2px solid ${THEME.blue}` : `1px solid ${THEME.border}`,
                          background: active ? "rgba(37,99,235,0.08)" : THEME.panelSoft,
                          color: active ? THEME.blue : THEME.text,
                          cursor: "pointer",
                        }}
                      >{label}</button>
                    );
                  });
                })()}
              </div>
              {/* Selettore data nativo (per scegliere altri giorni) */}
              <input
                type="date"
                value={qaDate}
                onChange={e => setQaDate(e.target.value)}
                style={{
                  display: "block",
                  width: "100%",
                  maxWidth: "100%",
                  boxSizing: "border-box",
                  padding: "8px 12px", borderRadius: 7,
                  border: `1px solid ${THEME.border}`,
                  background: THEME.panelSoft,
                  fontSize: 13, fontWeight: 600, color: THEME.text,
                  fontFamily: "inherit",
                  // iOS Safari: senza queste l'input type=date può ignorare width:100%
                  WebkitAppearance: "none",
                  appearance: "none",
                  minHeight: 36,
                }}
              />
            </div>

            {/* Time picker */}
            <div style={{ marginBottom: 14 }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 6,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: THEME.muted,
                  textTransform: "uppercase", letterSpacing: 0.5,
                }}>Orario</div>
                {qaBusyTimes.size > 0 && (
                  <div style={{
                    fontSize: 10, fontWeight: 600, color: THEME.muted,
                    display: "flex", alignItems: "center", gap: 4,
                    flexShrink: 0,
                  }}>
                    <span style={{
                      display: "inline-block", width: 8, height: 8, borderRadius: 2,
                      background: "#fee2e2", border: "1px solid #fca5a5",
                      flexShrink: 0,
                    }} />
                    occupato
                  </div>
                )}
              </div>
              <div style={{
                display: "flex", gap: 5, flexWrap: "wrap",
              }}>
                {(() => {
                  const slotsForDay = buildSlotsForDay(workingHours, qaDate);
                  if (slotsForDay.length === 0) {
                    return (
                      <div style={{ fontSize: 12, color: THEME.muted, padding: "8px 4px" }}>
                        Studio chiuso in questo giorno. Cambia data o aggiorna gli orari di lavoro nelle Impostazioni.
                      </div>
                    );
                  }
                  return slotsForDay.map(h => {
                  const isBusy = qaBusyTimes.has(h);
                  const isSelected = qaTime === h;
                  return (
                    <button
                      key={h}
                      onClick={() => { if (!isBusy) setQaTime(h); }}
                      disabled={isBusy}
                      title={isBusy ? "Orario già occupato" : undefined}
                      style={{
                        padding: "6px 11px", borderRadius: 7, fontSize: 13, fontWeight: 700,
                        border: isSelected
                          ? `2px solid ${THEME.blue}`
                          : isBusy
                          ? `1px solid #fca5a5`
                          : `1px solid ${THEME.border}`,
                        background: isSelected
                          ? "rgba(37,99,235,0.08)"
                          : isBusy
                          ? "#fee2e2"
                          : THEME.panelSoft,
                        color: isSelected
                          ? THEME.blue
                          : isBusy
                          ? "#991b1b"
                          : THEME.text,
                        cursor: isBusy ? "not-allowed" : "pointer",
                        textDecoration: isBusy ? "line-through" : "none",
                        opacity: isBusy ? 0.7 : 1,
                      }}
                    >{h}</button>
                  );
                });
                })()}
              </div>
            </div>

            {/* Patient search / new patient (NASCOSTA se gruppo) */}
            {!qaIsGroup && (
            <div style={{ marginBottom: 18 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: THEME.muted,
                textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
              }}>Paziente</div>

              {!qaNewMode ? (
                <>
                  <input
                    type="text"
                    value={qaPatientSearch}
                    onChange={e => searchPatients(e.target.value)}
                    placeholder="Cerca per nome o cognome…"
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 10,
                      border: `1.5px solid ${qaPatientId ? THEME.green : THEME.border}`,
                      background: qaPatientId ? "rgba(22,163,74,0.04)" : THEME.panelSoft,
                      fontSize: 14, fontWeight: 600, color: THEME.text,
                    }}
                  />
                  {qaPatientId && (
                    <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontSize: 12, color: THEME.green, fontWeight: 700,
                        flex: 1, minWidth: 0,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>✓ {qaPatientLabel}</span>
                      <button onClick={() => { setQaPatientId(null); setQaPatientLabel(""); setQaPatientSearch(""); }}
                        style={{
                          fontSize: 11, color: THEME.muted, background: "none", border: "none",
                          cursor: "pointer", fontWeight: 600, flexShrink: 0,
                        }}>
                        Cambia
                      </button>
                    </div>
                  )}

                  {/* Results dropdown */}
                  {qaResults.length > 0 && !qaPatientId && (
                    <div style={{
                      marginTop: 4, borderRadius: 10, overflow: "hidden",
                      border: `1px solid ${THEME.border}`, background: THEME.panelBg,
                      boxShadow: "0 4px 12px rgba(15,23,42,0.1)",
                    }}>
                      {qaResults.map(p => (
                        <button key={p.id} onClick={() => selectPatient(p)} style={{
                          width: "100%", display: "flex", justifyContent: "space-between",
                          padding: "10px 12px", border: "none", borderBottom: `1px solid ${THEME.border}`,
                          background: "transparent", cursor: "pointer", textAlign: "left",
                        }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: THEME.text }}>{p.label}</span>
                          {p.phone && (
                            <span style={{ fontSize: 11, color: THEME.muted }}>{p.phone}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {qaSearching && (
                    <div style={{ marginTop: 4, fontSize: 12, color: THEME.muted }}>Ricerca…</div>
                  )}

                  {/* New patient link */}
                  {!qaPatientId && (
                    <button
                      onClick={() => setQaNewMode(true)}
                      style={{
                        marginTop: 6, padding: 0, border: "none", background: "none",
                        color: THEME.blue, fontWeight: 700, fontSize: 12,
                        cursor: "pointer",
                      }}
                    >+ Nuovo paziente</button>
                  )}
                </>
              ) : (
                /* ── New patient form ── */
                <div style={{
                  padding: "10px 12px", borderRadius: 10,
                  border: `1px solid ${THEME.blue}40`, background: "rgba(37,99,235,0.03)",
                }}>
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    marginBottom: 10,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: THEME.blue }}>Nuovo paziente</span>
                    <button onClick={() => setQaNewMode(false)} style={{
                      fontSize: 11, color: THEME.muted, background: "none", border: "none",
                      cursor: "pointer", fontWeight: 600,
                    }}>← Cerca esistente</button>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input
                      type="text" value={qaNewLast}
                      onChange={e => setQaNewLast(e.target.value)}
                      placeholder="Cognome *"
                      style={{
                        flex: 1, padding: "9px 10px", borderRadius: 8,
                        border: `1px solid ${THEME.border}`, background: THEME.panelBg,
                        fontSize: 13, fontWeight: 600, color: THEME.text,
                      }}
                    />
                    <input
                      type="text" value={qaNewFirst}
                      onChange={e => setQaNewFirst(e.target.value)}
                      placeholder="Nome *"
                      style={{
                        flex: 1, padding: "9px 10px", borderRadius: 8,
                        border: `1px solid ${THEME.border}`, background: THEME.panelBg,
                        fontSize: 13, fontWeight: 600, color: THEME.text,
                      }}
                    />
                  </div>
                  <input
                    type="tel" value={qaNewPhone}
                    onChange={e => setQaNewPhone(e.target.value)}
                    placeholder="Telefono (per WA conferma)"
                    style={{
                      width: "100%", padding: "9px 10px", borderRadius: 8,
                      border: `1px solid ${THEME.border}`, background: THEME.panelBg,
                      fontSize: 13, fontWeight: 600, color: THEME.text,
                    }}
                  />
                </div>
              )}
            </div>
            )}

            {/* ─── Sezione gruppo (visibile solo se qaIsGroup) ───────── */}
            {qaIsGroup && (
              <div style={{
                marginBottom: 18,
                padding: 14,
                borderRadius: 10,
                border: "1.5px solid rgba(13,148,136,0.3)",
                background: "rgba(13,148,136,0.06)",
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#0d9488", marginBottom: 4, letterSpacing: 0.4 }}>
                  DATI GRUPPO
                </div>
                <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 12, lineHeight: 1.4 }}>
                  ⚡ Aggiungerai i pazienti dopo aver creato il gruppo.
                </div>

                {/* Titolo */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: THEME.muted,
                    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5,
                  }}>Titolo</div>
                  <input
                    type="text"
                    value={qaGroupTitle}
                    onChange={e => setQaGroupTitle(e.target.value)}
                    placeholder="Es. Posturale, Pilates…"
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: `1.5px solid ${THEME.border}`,
                      background: "#fff",
                      fontSize: 14, fontWeight: 600, color: THEME.text,
                      outline: "none", boxSizing: "border-box",
                      minHeight: 42,
                      fontFamily: "inherit",
                    }}
                  />
                </div>

                {/* Max + Prezzo per persona — 2 colonne */}
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
                      value={qaGroupMax}
                      onChange={e => setQaGroupMax(e.target.value.replace(/[^0-9]/g, ""))}
                      style={{
                        width: "100%", padding: "10px 12px", borderRadius: 8,
                        border: `1.5px solid ${THEME.border}`,
                        background: "#fff",
                        fontSize: 14, fontWeight: 700, color: THEME.text,
                        outline: "none", boxSizing: "border-box",
                        minHeight: 42, textAlign: "center",
                        fontFamily: "inherit",
                      }}
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
                        value={qaGroupPrice}
                        onChange={e => setQaGroupPrice(e.target.value.replace(/[^0-9.,]/g, ""))}
                        style={{
                          width: "100%", padding: "10px 28px 10px 12px", borderRadius: 8,
                          border: `1.5px solid ${THEME.border}`,
                          background: "#fff",
                          fontSize: 14, fontWeight: 700, color: THEME.text,
                          outline: "none", boxSizing: "border-box",
                          minHeight: 42, textAlign: "right",
                          fontFamily: "inherit",
                        }}
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

                {/* Anteprima totale potenziale */}
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
                      const n = parseInt(qaGroupMax, 10) || 0;
                      const p = parseFloat((qaGroupPrice || "0").replace(",", ".")) || 0;
                      return (n * p).toFixed(2);
                    })()}
                  </span>
                </div>

                {/* ─── Partecipanti iniziali (step 6.1) ───────── */}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed rgba(13,148,136,0.25)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, letterSpacing: 0.3 }}>
                      PARTECIPANTI (opzionale)
                    </div>
                    <div style={{
                      fontSize: 10, fontWeight: 700,
                      color: qaInitialParticipants.length > (parseInt(qaGroupMax, 10) || 0)
                        ? "#dc2626"
                        : "#0d9488",
                    }}>
                      {qaInitialParticipants.length}/{parseInt(qaGroupMax, 10) || 0}
                    </div>
                  </div>

                  {/* Search */}
                  <div style={{ position: "relative", marginBottom: 6 }}>
                    <input
                      type="text"
                      value={qaPartSearchQ}
                      onChange={(e) => setQaPartSearchQ(e.target.value)}
                      placeholder="🔍 Cerca paziente…"
                      style={{
                        width: "100%", padding: "9px 12px", borderRadius: 8,
                        border: `1.5px solid ${THEME.border}`,
                        background: "#fff",
                        fontSize: 13, color: THEME.text,
                        outline: "none", boxSizing: "border-box",
                        fontFamily: "inherit",
                        minHeight: 40,
                      }}
                    />
                    {qaPartSearchResults.length > 0 && (
                      <div style={{
                        position: "absolute", top: "100%", left: 0, right: 0,
                        marginTop: 2, zIndex: 100,
                        background: "#fff",
                        border: `1.5px solid ${THEME.border}`,
                        borderRadius: 8,
                        maxHeight: 200, overflowY: "auto",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      }}>
                        {qaPartSearchResults.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => {
                              setQaInitialParticipants(prev =>
                                prev.find(x => x.id === p.id) ? prev : [...prev, p]
                              );
                              setQaPartSearchQ("");
                              setQaPartSearchResults([]);
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
                    {qaPartSearchQ.trim() && qaPartSearchResults.length === 0 && (
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

                  {/* Chip selezionati */}
                  {qaInitialParticipants.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {qaInitialParticipants.map((p) => {
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
                              onClick={() => setQaInitialParticipants(prev => prev.filter(x => x.id !== p.id))}
                              style={{
                                width: 22, height: 22, borderRadius: "50%",
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                color: THEME.muted,
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

                  {qaInitialParticipants.length > (parseInt(qaGroupMax, 10) || 0) && (
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

            {/* Prezzo seduta (solo singolo) — precompilato, modificabile */}
            {!qaIsGroup && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted,
                  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                  Prezzo seduta
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: THEME.text }}>€</span>
                    <input
                      type="text" inputMode="decimal" value={qaAmount}
                      onChange={e => setQaAmount(e.target.value)}
                      placeholder="0,00"
                      style={{
                        flex: 1, padding: "10px 12px", borderRadius: 8,
                        border: `1px solid ${THEME.border}`, background: THEME.panelSoft,
                        fontSize: 15, fontWeight: 700, color: THEME.text, fontFamily: "inherit",
                        WebkitAppearance: "none", appearance: "none",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {([["cash","Contanti"],["invoiced","Fattura"]] as const).map(([m,lbl]) => (
                      <button key={m} onClick={() => setDefaultSessionMethod(m)} style={{
                        padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                        border: `1px solid ${defaultSessionMethod===m ? THEME.blue : THEME.border}`,
                        background: defaultSessionMethod===m ? "rgba(37,99,235,0.08)" : THEME.panelSoft,
                        color: defaultSessionMethod===m ? THEME.blue : THEME.muted, cursor: "pointer",
                      }}>{lbl}</button>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 10.5, color: THEME.muted, marginTop: 5 }}>
                  Precompilato col prezzo standard. Modificalo se serve, o lascia 0 per seduta gratuita.
                </div>
              </div>
            )}

            {/* Actions */}
            {(() => {
              const canSave = qaTime && (
                qaIsGroup
                  ? (qaGroupTitle.trim()
                      && parseInt(qaGroupMax, 10) >= 2
                      && qaInitialParticipants.length <= (parseInt(qaGroupMax, 10) || 0))
                  : (qaPatientId || (qaNewMode && qaNewFirst.trim() && qaNewLast.trim()))
              );
              return (
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setQuickAddOpen(false)} style={{
                    flex: 1, padding: "12px 0", borderRadius: 12,
                    border: `1px solid ${THEME.border}`, background: THEME.panelSoft,
                    color: THEME.muted, fontWeight: 700, fontSize: 14, cursor: "pointer",
                  }}>Annulla</button>
                  <button
                    onClick={saveQuickAdd}
                    disabled={!canSave || qaSaving}
                    style={{
                      flex: 2, padding: "12px 0", borderRadius: 12, border: "none",
                      background: !canSave ? THEME.border : THEME.gradient,
                      color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
                      opacity: qaSaving ? 0.6 : 1,
                    }}
                  >
                    {qaSaving ? "Salvataggio…" : qaIsGroup ? "Crea gruppo" : "Crea appuntamento"}
                  </button>
                </div>
              );
            })()}

            {/* Link to full calendar for more options */}
            <button
              onClick={() => { setQuickAddOpen(false); router.push(`/mobile/calendar?date=${dateYMD}&new=1`); }}
              style={{
                width: "100%", marginTop: 10, padding: "8px 0",
                border: "none", background: "transparent",
                color: THEME.blue, fontWeight: 600, fontSize: 12,
                cursor: "pointer", textAlign: "center",
              }}
            >Opzioni avanzate → Calendario</button>
          </div>
        </>
      )}

      {/* ━━━ DIALOG: Vuoi inviare il messaggio di conferma su WhatsApp? ━━━ */}
      {waConfirmOpen && waConfirmData && (
        <>
          <div
            onClick={() => { setWaConfirmOpen(false); setWaConfirmData(null); }}
            style={{
              position: "fixed", inset: 0, zIndex: 60,
              background: "rgba(15,23,42,0.55)",
              backdropFilter: "blur(2px)",
            }}
          />
          <div style={{
            position: "fixed",
            left: "50%", top: "50%", transform: "translate(-50%, -50%)",
            zIndex: 61,
            width: "92vw", maxWidth: 420,
            background: THEME.panelBg, borderRadius: 16,
            padding: "22px 20px",
            boxShadow: "0 24px 64px rgba(15,23,42,0.22)",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: "#25d366",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, color: "#fff",
              }}>📱</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: THEME.text }}>
                  Inviare conferma su WhatsApp?
                </div>
                <div style={{ fontSize: 11, color: THEME.muted, fontWeight: 600, marginTop: 2 }}>
                  Appuntamento creato con successo
                </div>
              </div>
            </div>

            {/* Riepilogo destinatario + appuntamento */}
            <div style={{
              background: THEME.panelSoft,
              border: `1px solid ${THEME.border}`,
              borderRadius: 10,
              padding: "12px 14px",
              marginBottom: 16,
              fontSize: 13,
              lineHeight: 1.5,
            }}>
              <div style={{ marginBottom: 4 }}>
                <strong>{waConfirmData.patientFirstName}</strong>
              </div>
              <div style={{ color: THEME.muted, fontSize: 12, fontWeight: 600 }}>
                📞 {waConfirmData.patientPhone}
              </div>
              <div style={{ color: THEME.muted, fontSize: 12, fontWeight: 600, marginTop: 6 }}>
                📅 {formatDateRelative(waConfirmData.startDate)} alle {waConfirmData.time}
              </div>
            </div>

            {/* Bottoni Salta + Invia */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { setWaConfirmOpen(false); setWaConfirmData(null); }}
                style={{
                  flex: 1, padding: "12px", borderRadius: 10,
                  border: `1px solid ${THEME.border}`,
                  background: THEME.panelSoft, color: THEME.text,
                  fontWeight: 700, fontSize: 13,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Salta
              </button>
              <button
                onClick={sendQuickAddWhatsApp}
                style={{
                  flex: 1, padding: "12px", borderRadius: 10,
                  border: "none",
                  background: "#25d366", color: "#fff",
                  fontWeight: 800, fontSize: 13,
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <span>📱</span>
                Invia WhatsApp
              </button>
            </div>
          </div>
        </>
      )}

      {/* ━━━ EDIT MODAL ━━━ */}
      {editAppt && (
        <>
          <div
            onClick={() => setEditAppt(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 50,
              background: "rgba(15,23,42,0.4)",
              backdropFilter: "blur(2px)",
            }}
          />
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 51,
            background: THEME.panelBg, borderRadius: "16px 16px 0 0",
            padding: "16px 18px",
            paddingLeft: "max(18px, env(safe-area-inset-left, 0px))",
            paddingRight: "max(18px, env(safe-area-inset-right, 0px))",
            paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))",
            boxShadow: "0 -6px 32px rgba(15,23,42,0.15)",
            maxHeight: "85vh", overflowY: "auto",
            animation: "slideUp 0.25s ease",
          }}>
            <div style={{ width: 32, height: 3.5, borderRadius: 99, background: THEME.border, margin: "0 auto 14px" }}/>

            <div style={{ fontSize: 15, fontWeight: 800, color: THEME.text, marginBottom: 2 }}>
              Modifica appuntamento
            </div>
            <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 16 }}>
              {fullName(editAppt.patients)} · {fmtTime(editAppt.start_at)}
            </div>

            {/* Status */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Stato</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["booked","confirmed","done","not_paid","cancelled"] as Status[]).map(s => (
                  <button key={s} onClick={() => setEditStatus(s)} style={{
                    padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                    fontWeight: 700, fontSize: 12,
                    background: editStatus === s ? STATUS_MAP[s].color : "rgba(148,163,184,0.1)",
                    color: editStatus === s ? "#fff" : THEME.muted,
                  }}>
                    {STATUS_MAP[s].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date + Time */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Data</div>
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={{
                  display: "block", width: "100%", maxWidth: "100%", boxSizing: "border-box",
                  padding: "9px 10px", borderRadius: 10,
                  border: `1.5px solid ${THEME.border}`, background: THEME.panelSoft,
                  fontSize: 14, fontWeight: 600, color: THEME.text,
                  WebkitAppearance: "none", appearance: "none", minHeight: 38,
                }}/>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Orario</div>
                <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} style={{
                  display: "block", width: "100%", maxWidth: "100%", boxSizing: "border-box",
                  padding: "9px 10px", borderRadius: 10,
                  border: `1.5px solid ${THEME.border}`, background: THEME.panelSoft,
                  fontSize: 14, fontWeight: 600, color: THEME.text,
                  WebkitAppearance: "none", appearance: "none", minHeight: 38,
                }}/>
              </div>
            </div>

            {/* Amount */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Importo (€)</div>
              <input
                type="number" inputMode="decimal" value={editAmount}
                onChange={e => setEditAmount(e.target.value)}
                placeholder="es. 40"
                style={{
                  width: "100%", padding: "9px 10px", borderRadius: 10,
                  border: `1.5px solid ${THEME.border}`, background: THEME.panelSoft,
                  fontSize: 14, fontWeight: 600, color: THEME.text,
                }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setEditAppt(null)} style={{
                flex: 1, padding: "12px 0", borderRadius: 12,
                border: `1px solid ${THEME.border}`, background: THEME.panelSoft,
                color: THEME.muted, fontWeight: 700, fontSize: 14, cursor: "pointer",
              }}>Annulla</button>
              <button onClick={saveEdit} disabled={editSaving} style={{
                flex: 2, padding: "12px 0", borderRadius: 12, border: "none",
                background: THEME.gradient, color: "#fff",
                fontWeight: 700, fontSize: 14, cursor: "pointer",
                opacity: editSaving ? 0.6 : 1,
              }}>
                {editSaving ? "Salvataggio…" : "Salva modifiche"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══════ Modal gestione gruppo (mig. 014) ═══════════════════ */}
      {openGroup && (
        <GroupEventModalMobile
          event={openGroup}
          searchPatients={groupSearchPatientsApi}
          onClose={() => setOpenGroup(null)}
          onAddParticipant={async (apptId, patientId, price) => {
            const ok = await addParticipantApi(apptId, patientId, price);
            if (ok) await refreshOpenGroup();
          }}
          onUpdateParticipant={async (participantId, patch) => {
            const ok = await updateParticipantApi(participantId, patch);
            if (ok) await refreshOpenGroup();
          }}
          onRemoveParticipant={async (participantId) => {
            const ok = await removeParticipantApi(participantId);
            if (ok) await refreshOpenGroup();
          }}
          onMarkAllPaid={async (apptId) => {
            const ok = await markAllPaidApi(apptId);
            if (ok) await refreshOpenGroup();
          }}
          onSendReminderToAll={async (event) => {
            await sendReminderToAllApi(
              event,
              getStudioBranding(currentStudio),
              {
                template: reminderTpl,
                studioAddress: currentStudio?.address ?? null,
              }
            );
          }}
          onDeleteGroup={async (apptId) => {
            const ok = await deleteGroupApi(apptId);
            if (ok) {
              setOpenGroup(null);
              setDayAppts(prev => prev.filter(x => x.id !== apptId));
              setWeekAppts(prev => prev.filter(x => x.id !== apptId));
            }
          }}
          onUpdateGroup={async (apptId, patch) => {
            const ok = await updateGroupApi(apptId, patch);
            if (ok) {
              await refreshOpenGroup();
              // Aggiorna anche le card della lista
              const updateAppt = (a: Appointment): Appointment => {
                if (a.id !== apptId) return a;
                return {
                  ...a,
                  group_title: patch.group_title ?? a.group_title,
                  group_max_participants: patch.group_max_participants ?? a.group_max_participants,
                  group_price_per_person: patch.group_price_per_person ?? a.group_price_per_person,
                };
              };
              setDayAppts(prev => prev.map(updateAppt));
              setWeekAppts(prev => prev.map(updateAppt));
            }
          }}
          onDuplicateGroup={async (sourceId, newStart, withParts) => {
            // openGroup è il GroupEvent corrente (sourceId === openGroup.id)
            if (!openGroup) return;
            const newId = await duplicateGroupApi(openGroup, newStart, withParts);
            if (newId) {
              setOpenGroup(null);
              await loadAll();
              const niceDate = newStart.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
              const niceTime = newStart.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
              showToast.success(`Gruppo duplicato per ${niceDate} alle ${niceTime}.`);
            }
          }}
        />
      )}
    </div>
  );
}
