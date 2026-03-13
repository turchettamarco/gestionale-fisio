"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

/* ─── Types ───────────────────────────────────────────────────────────── */
type Status = "booked" | "confirmed" | "done" | "cancelled" | "not_paid";
type LocationType = "studio" | "domicile";

type PatientLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone?: string | null;
};

type CalendarEvent = {
  id: string;
  patient_id: string | null;
  patient_name: string;
  patient_first_name: string | null;
  patient_phone: string | null;
  start: Date;
  end: Date;
  status: Status;
  calendar_note: string | null;
  location: LocationType | null;
  clinic_site: string | null;
  domicile_address: string | null;
  amount: number | null;
  treatment_type: string | null;
  price_type: string | null;
  whatsapp_sent_at: string | null;
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
  createAmount: string; setCreateAmount: (v: string) => void;
  createNote: string; setCreateNote: (v: string) => void;
  createAppointment: () => Promise<void>;
};

type TouchDragState = {
  eventId: string; startClientY: number; startEventTopPx: number;
  activated: boolean; activationTimer: ReturnType<typeof setTimeout> | null;
};

/* ─── Theme (identico home + desktop) ────────────────────────────────── */
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
  gradient:  "linear-gradient(135deg, #0d9488, #2563eb)",
};

const PX_PER_HOUR    = 80;
const BOTTOM_TAB_H   = 62;
const DEFAULT_START  = 7;
const DEFAULT_END    = 22;
const DEFAULT_CLINIC = "Studio Pontecorvo";

/* ─── Costanti WhatsApp (identiche desktop) ──────────────────────────── */
const CLINIC_ADDRESSES: Record<string, string> = {
  "Studio Pontecorvo": "Pontecorvo, Via Galileo Galilei 5, dietro il Bar Principe",
};

/* ─── Status helpers (identici desktop) ──────────────────────────────── */
function statusLabel(s: Status) {
  const map: Record<Status, string> = {
    booked: "Prenotato", confirmed: "Confermato", done: "Eseguito",
    not_paid: "Non pagata", cancelled: "Annullato",
  };
  return map[s] ?? "Prenotato";
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

/* ─── WhatsApp helpers (identici desktop) ────────────────────────────── */
function formatPhoneForWhatsAppWeb(phone: string): string {
  if (!phone) return phone;
  let clean = phone.replace(/[\s\(\)\-\.]/g, "");
  if (clean.startsWith("0")) clean = "39" + clean.substring(1);
  if (!clean.startsWith("+")) clean = "+" + clean;
  return clean;
}

function formatDateRelative(date: Date): string {
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  const domani = new Date(oggi); domani.setDate(oggi.getDate() + 1);
  const dataAppt = new Date(date); dataAppt.setHours(0, 0, 0, 0);
  if (dataAppt.getTime() === oggi.getTime()) return "Oggi";
  if (dataAppt.getTime() === domani.getTime()) return "Domani";
  const giorni = ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
  const mesi   = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                  "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  return `${giorni[dataAppt.getDay()]} ${dataAppt.getDate()} ${mesi[dataAppt.getMonth()]}`;
}

/* ─── Generic helpers ────────────────────────────────────────────────── */
function pad2(n: number) { return String(n).padStart(2, "0"); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function formatDMY(d: Date) { return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`; }
function formatWeekday(d: Date) {
  return ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"][d.getDay()];
}
function isSameDay(a: Date, b: Date) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}
function fmtTime(d: Date) { return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }); }
function toISODateLocal(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function parseTimeHHMM(t: string) {
  const [hh, mm] = t.split(":").map(Number);
  return { hh: Number.isFinite(hh) ? hh : 0, mm: Number.isFinite(mm) ? mm : 0 };
}
function buildDateTime(dateISO: string, timeHHMM: string) {
  const b = new Date(`${dateISO}T00:00:00`);
  const { hh, mm } = parseTimeHHMM(timeHHMM);
  b.setHours(hh, mm, 0, 0); return b;
}
function normalizePhone(raw?: string | null) {
  if (!raw) return null;
  const d = raw.replace(/\D/g, ""); return d.length < 9 ? null : d;
}
function isValidISODate(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }
function isValidHHMM(s: string) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
function roundTo(n: number, step: number) { return Math.round(n / step) * step; }

/* ─── Page shell ─────────────────────────────────────────────────────── */
export default function CalendarPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: THEME.appBg, display: "flex",
        alignItems: "center", justifyContent: "center", color: THEME.muted,
        fontFamily: "Inter,-apple-system,sans-serif", fontSize: 14 }}>
        Caricamento…
      </div>
    }>
      <CalendarPageInner />
    </Suspense>
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */
function CalendarPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [events,   setEvents]   = useState<CalendarEvent[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState("");

  /* user */
  const [userEmail,    setUserEmail]    = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  /* timeline refs */
  const timelineRef       = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  /* drag mouse */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverY,  setDragOverY]  = useState<number | null>(null);

  /* drag touch */
  const touchDragRef          = useRef<TouchDragState | null>(null);
  const touchDragYRef         = useRef<number | null>(null);
  const [touchDragY, _setTDY] = useState<number | null>(null);
  const [touchDraggingId, setTouchDraggingId] = useState<string | null>(null);
  const setTouchDragY = (y: number | null) => { touchDragYRef.current = y; _setTDY(y); };

  /* swipe */
  const swipeXRef = useRef<number | null>(null);
  const swipeYRef = useRef<number | null>(null);

  /* edit modal */
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editStatus,    setEditStatus]    = useState<Status>("booked");
  const [editNote,      setEditNote]      = useState("");
  const [editAmount,    setEditAmount]    = useState("");
  const [editDate,      setEditDate]      = useState(toISODateLocal(new Date()));
  const [editTime,      setEditTime]      = useState("09:00");
  const [editDuration,  setEditDuration]  = useState(60);

  /* create modal */
  const [createOpen,            setCreateOpen]            = useState(false);
  const [createDate,            setCreateDate]            = useState(toISODateLocal(new Date()));
  const [createTime,            setCreateTime]            = useState("09:00");
  const [createDuration,        setCreateDuration]        = useState(60);
  const [createStatus,          setCreateStatus]          = useState<Status>("confirmed");
  const [createLocation,        setCreateLocation]        = useState<LocationType>("studio");
  const [createClinicSite,      setCreateClinicSite]      = useState(DEFAULT_CLINIC);
  const [createDomicileAddress, setCreateDomicileAddress] = useState("");
  const [createAmount,          setCreateAmount]          = useState("");
  const [createNote,            setCreateNote]            = useState("");

  /* patient search */
  const [patientQuery,    setPatientQuery]    = useState("");
  const [patientResults,  setPatientResults]  = useState<PatientLite[]>([]);
  const [patientLoading,  setPatientLoading]  = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientLite | null>(null);
  const [quickFirstName,  setQuickFirstName]  = useState("");
  const [quickLastName,   setQuickLastName]   = useState("");
  const [quickPhone,      setQuickPhone]      = useState("");

  /* ── Clock ────────────────────────────────── */
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  /* ── User ─────────────────────────────────── */
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

  /* ── Load ─────────────────────────────────── */
  const loadAppointments = useCallback(async (date: Date) => {
    setLoading(true); setError("");
    const s0 = new Date(date); s0.setHours(0, 0, 0, 0);
    const e0 = new Date(date); e0.setHours(23, 59, 59, 999);
    const { data, error: err } = await supabase.from("appointments").select(`
      id, patient_id, start_at, end_at, status, calendar_note,
      location, clinic_site, domicile_address,
      amount, treatment_type, price_type, whatsapp_sent_at,
      patients:patient_id(first_name, last_name, phone)
    `).gte("start_at", s0.toISOString()).lt("start_at", e0.toISOString())
      .order("start_at", { ascending: true });

    if (err) { setError(`Errore: ${err.message}`); setLoading(false); return; }

    const mapped: CalendarEvent[] = (data ?? []).map((a: any) => {
      const p = Array.isArray(a.patients) ? a.patients[0] : a.patients;
      const name = p ? `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim() : "Paziente";
      return {
        id: a.id, patient_id: a.patient_id ?? null,
        patient_name: name || "Paziente",
        patient_first_name: p?.first_name ?? null,
        patient_phone: p?.phone ?? null,
        start: new Date(a.start_at), end: new Date(a.end_at),
        status: (a.status ?? "booked") as Status,
        calendar_note: a.calendar_note ?? null,
        location: (a.location ?? null) as LocationType | null,
        clinic_site: a.clinic_site ?? null,
        domicile_address: a.domicile_address ?? null,
        amount: a.amount ?? null,
        treatment_type: a.treatment_type ?? null,
        price_type: a.price_type ?? null,
        whatsapp_sent_at: a.whatsapp_sent_at ?? null,
      };
    });
    setEvents(mapped); setLoading(false);
  }, []);

  useEffect(() => { loadAppointments(currentDate); }, [currentDate, loadAppointments]);

  /* ── URL params ───────────────────────────── */
  const handledNewRef = useRef(false);
  useEffect(() => {
    const qDate = searchParams.get("date");
    if (qDate && isValidISODate(qDate)) {
      const d = new Date(`${qDate}T00:00:00`);
      if (!isNaN(d.getTime()) && !isSameDay(d, currentDate)) setCurrentDate(d);
    }
    const isNew = searchParams.get("new") === "1" || searchParams.get("action") === "new";
    if (!isNew) { handledNewRef.current = false; return; }
    if (handledNewRef.current) return;
    handledNewRef.current = true;
    const base = qDate && isValidISODate(qDate) ? qDate : toISODateLocal(currentDate);
    const qt = searchParams.get("time");
    openCreate(qt && isValidHHMM(qt) ? qt : undefined, base);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new"); params.delete("time"); params.delete("action");
    router.replace(`/mobile/calendar${params.toString() ? `?${params}` : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  /* ── Derived ──────────────────────────────── */
  const dayEvents = useMemo(() =>
    events.filter(e => isSameDay(e.start, currentDate)), [events, currentDate]);

  const dayStats = useMemo(() => ({
    total:   dayEvents.filter(e => e.status !== "cancelled").length,
    done:    dayEvents.filter(e => e.status === "done").length,
    revenue: dayEvents.reduce((s, e) => e.status === "done" ? s + (e.amount ?? 0) : s, 0),
  }), [dayEvents]);

  const { dayStartHour, dayEndHour } = useMemo(() => {
    if (!dayEvents.length) return { dayStartHour: DEFAULT_START, dayEndHour: DEFAULT_END };
    const starts = dayEvents.map(e => e.start.getHours());
    const ends   = dayEvents.map(e => e.end.getHours() + (e.end.getMinutes() > 0 ? 1 : 0));
    return {
      dayStartHour: clamp(Math.min(DEFAULT_START, ...starts), 0, 23),
      dayEndHour:   clamp(Math.max(DEFAULT_END, ...ends), 1, 24),
    };
  }, [dayEvents]);

  const timeSlots = useMemo(() => {
    const s: { label: string; hour: number }[] = [];
    for (let h = dayStartHour; h < dayEndHour; h++) s.push({ label: `${pad2(h)}:00`, hour: h });
    return s;
  }, [dayStartHour, dayEndHour]);

  const getEventPosition = useCallback((start: Date, end: Date) => {
    const ppm = PX_PER_HOUR / 60;
    const top    = ((start.getHours() - dayStartHour) * 60 + start.getMinutes()) * ppm;
    const height = ((end.getHours() - start.getHours()) * 60 + (end.getMinutes() - start.getMinutes())) * ppm;
    return { top: Math.max(0, top), height: Math.max(Math.round(PX_PER_HOUR * 0.55), height) };
  }, [dayStartHour]);

  const userInitials = useMemo(() => {
    if (!userEmail) return "U";
    const parts = (userEmail.split("@")[0] ?? "U")
      .replace(/[^a-zA-Z0-9]/g, " ").split(" ").filter(Boolean);
    return ((parts[0]?.[0] ?? "U") + (parts[1]?.[0] ?? "")).toUpperCase().slice(0, 2);
  }, [userEmail]);

  /* ── Auto-scroll ──────────────────────────── */
  useEffect(() => {
    if (loading) return;
    const el = timelineScrollRef.current; if (!el) return;
    if (isSameDay(currentDate, new Date())) {
      const now = new Date();
      const top = ((now.getHours() - dayStartHour) * 60 + now.getMinutes()) * (PX_PER_HOUR / 60);
      el.scrollTo({ top: Math.max(0, top - 120), behavior: "smooth" });
    } else { el.scrollTo({ top: 0, behavior: "smooth" }); }
  }, [loading, currentDate, dayStartHour]);

  /* ── Navigation ───────────────────────────── */
  const goPrev  = useCallback(() => setCurrentDate(p => addDays(p, -1)), []);
  const goNext  = useCallback(() => setCurrentDate(p => addDays(p,  1)), []);
  const goToday = useCallback(() => setCurrentDate(new Date()), []);

  /* ── Swipe ────────────────────────────────── */
  const handleSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    if (touchDragRef.current?.activated) return;
    swipeXRef.current = e.touches[0].clientX;
    swipeYRef.current = e.touches[0].clientY;
  }, []);
  const handleSwipeTouchEnd = useCallback((e: React.TouchEvent) => {
    if (swipeXRef.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeXRef.current;
    const dy = e.changedTouches[0].clientY - (swipeYRef.current ?? 0);
    swipeXRef.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goNext(); else goPrev();
    }
  }, [goPrev, goNext]);

  /* ── WhatsApp — IDENTICO AL DESKTOP ──────────────────────────────────
   * Firma: sendReminder(appointmentId, patientPhone, patientFirstName, isConfirmation?)
   * Template lookup: cerca "Promemoria" o "Appuntamento" in message_templates
   * Fallback hardcoded identico al desktop
   * URL: web.whatsapp.com/send?phone=...&text=...
   * Dopo OK: aggiorna DB whatsapp_sent_at + whatsapp_sent
   * Se popup bloccato: secondo confirm con redirect o copia link
   * ─────────────────────────────────────────────────────────────────── */
  const sendReminder = useCallback(async (
    appointmentId: string,
    patientPhone?: string,
    patientFirstName?: string,
    isConfirmation?: boolean,
  ) => {
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
      templateText = `Grazie per averci scelto.\nRicordiamo il prossimo appuntamento fissato per {data_relativa} alle {ora}.\n\nA presto,\nDr. Marco Turchetta\nFisioterapia e Osteopatia`;
    } else {
      templateText = `Buongiorno {nome},\n\nLe ricordiamo il suo appuntamento di {data_relativa} alle ore ⏰ {ora}.\n\n📍 {luogo}\n\nCordiali saluti,\nDr. Marco Turchetta\nFisioterapia e Osteopatia`;
    }
    if (templateData?.template) templateText = templateData.template;

    const cleanPhone   = formatPhoneForWhatsAppWeb(patientPhone);
    const dataRelativa = formatDateRelative(appointment.start);
    const ora          = fmtTime(appointment.start);

    let luogo = "";
    if (appointment.location === "studio") {
      luogo = CLINIC_ADDRESSES[appointment.clinic_site ?? ""]
           || appointment.clinic_site
           || "Pontecorvo, Via Galileo Galilei 5, dietro il Bar Principe";
    } else {
      luogo = `Presso il suo domicilio (${appointment.domicile_address ?? ""})`;
    }

    const nomePaziente = (patientFirstName && patientFirstName.trim())
      ? patientFirstName.trim() : "Cliente";

    const message = templateText
      .replace(/{nome}/g,          nomePaziente)
      .replace(/{data_relativa}/g, dataRelativa)
      .replace(/{ora}/g,           ora)
      .replace(/{luogo}/g,         luogo);

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;

    const confirmText = isConfirmation
      ? `📱 CONFERMA NUOVO APPUNTAMENTO WHATSAPP\n\nDestinatario: ${patientPhone}\n\nMessaggio:\n${message}\n\nClicca OK per aprire WhatsApp e inviare.`
      : `📱 INVIO PROMEMORIA WHATSAPP\n\nDestinatario: ${patientPhone}\n\nMessaggio:\n${message}\n\nClicca OK per aprire WhatsApp e inviare.`;

    const confirmed = window.confirm(confirmText);
    if (!confirmed) return;

    const newWindow = window.open(whatsappUrl, "_blank");

    /* Marca come inviato (timestamp = verità) */
    const nowIso = new Date().toISOString();
    await supabase.from("appointments")
      .update({ whatsapp_sent_at: nowIso, whatsapp_sent: true }).eq("id", appointmentId);
    setEvents(prev => prev.map(ev =>
      ev.id === appointmentId ? { ...ev, whatsapp_sent_at: nowIso } : ev
    ));
    setSelectedEvent(prev =>
      prev?.id === appointmentId ? { ...prev, whatsapp_sent_at: nowIso } : prev
    );

    if (!newWindow || newWindow.closed || typeof newWindow.closed === "undefined") {
      const manualOpen = window.confirm(
        `Il browser ha bloccato l'apertura automatica di WhatsApp.\n\nURL: ${whatsappUrl}\n\nClicca OK per provare ad aprire, oppure Annulla per copiare il link.`
      );
      if (manualOpen) window.location.href = whatsappUrl;
      else alert(`Copia questo link e aprilo manualmente:\n\n${whatsappUrl}`);
    }
  }, [events]);

  /* ── Open / Save / Delete ─────────────────── */
  const openEvent = useCallback((ev: CalendarEvent) => {
    setSelectedEvent(ev); setEditStatus(ev.status);
    setEditNote(ev.calendar_note ?? "");
    setEditAmount(ev.amount == null ? "" : String(ev.amount));
    setEditDate(toISODateLocal(ev.start));
    setEditTime(`${pad2(ev.start.getHours())}:${pad2(ev.start.getMinutes())}`);
    setEditDuration(Math.max(15, Math.round((ev.end.getTime() - ev.start.getTime()) / 60_000)));
  }, []);

  const saveEvent = useCallback(async () => {
    if (!selectedEvent) return;
    setBusy(true); setError("");
    const amount = editAmount.trim() === "" ? null
      : (() => { const n = Number(editAmount.replace(",", ".")); return isFinite(n) ? n : null; })();
    const upd: Record<string, unknown> = {
      status: editStatus, calendar_note: editNote.trim() || null, amount,
    };
    if (isValidISODate(editDate) && isValidHHMM(editTime)) {
      const ns = buildDateTime(editDate, editTime);
      const d = Number(editDuration);
      const dur = isFinite(d) && d > 0 ? d
        : Math.round((selectedEvent.end.getTime() - selectedEvent.start.getTime()) / 60_000);
      const ne = new Date(ns); ne.setMinutes(ne.getMinutes() + dur);
      if (ns.getTime() !== selectedEvent.start.getTime() || ne.getTime() !== selectedEvent.end.getTime()) {
        upd.start_at = ns.toISOString(); upd.end_at = ne.toISOString();
      }
    }
    const { error: e } = await supabase.from("appointments").update(upd).eq("id", selectedEvent.id);
    if (e) { setError(`Errore: ${e.message}`); setBusy(false); return; }
    setSelectedEvent(null); setBusy(false);
    await loadAppointments(currentDate);
  }, [selectedEvent, editStatus, editNote, editAmount, editDate, editTime, editDuration, currentDate, loadAppointments]);

  const deleteEvent = useCallback(async () => {
    if (!selectedEvent || !window.confirm("Eliminare definitivamente questo appuntamento?")) return;
    setBusy(true); setError("");
    const { error: e } = await supabase.from("appointments").delete().eq("id", selectedEvent.id);
    if (e) { setError(`Errore: ${e.message}`); setBusy(false); return; }
    setSelectedEvent(null); setBusy(false);
    await loadAppointments(currentDate);
  }, [selectedEvent, currentDate, loadAppointments]);

  const openCreate = useCallback((prefillTime?: string, prefillDateISO?: string) => {
    setCreateOpen(true); setError("");
    setSelectedPatient(null); setPatientQuery(""); setPatientResults([]);
    setQuickFirstName(""); setQuickLastName(""); setQuickPhone("");
    const dateISO = prefillDateISO && isValidISODate(prefillDateISO)
      ? prefillDateISO : toISODateLocal(currentDate);
    setCreateDate(dateISO);
    setCreateTime(prefillTime && isValidHHMM(prefillTime) ? prefillTime : "09:00");
    setCreateDuration(60); setCreateStatus("confirmed"); setCreateLocation("studio");
    setCreateClinicSite(DEFAULT_CLINIC); setCreateDomicileAddress(""); setCreateAmount(""); setCreateNote("");
  }, [currentDate]);

  /* ── Patient search ───────────────────────── */
  const debRef = useRef<number | null>(null);
  useEffect(() => {
    if (!createOpen) return;
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = window.setTimeout(async () => {
      const q = patientQuery.trim(); if (q.length < 2) { setPatientResults([]); return; }
      setPatientLoading(true);
      const { data, error: e } = await supabase.from("patients")
        .select("id,first_name,last_name,phone")
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`).limit(8);
      setPatientLoading(false);
      setPatientResults(e ? [] : (data ?? []) as PatientLite[]);
    }, 250);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [patientQuery, createOpen]);

  const createQuickPatient = useCallback(async () => {
    const fn = quickFirstName.trim(); const ln = quickLastName.trim(); const ph = quickPhone.trim();
    if (!fn || !ln) { setError("Inserisci Nome e Cognome."); return; }
    setBusy(true); setError("");
    const { data, error: e } = await supabase.from("patients")
      .insert({ first_name: fn, last_name: ln, phone: ph || null })
      .select("id,first_name,last_name,phone").single();
    if (e) { setError(e.message); setBusy(false); return; }
    const p = data as PatientLite;
    setSelectedPatient(p);
    setPatientQuery(`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim());
    setPatientResults([]); setBusy(false);
  }, [quickFirstName, quickLastName, quickPhone]);

  const createAppointment = useCallback(async () => {
    if (!selectedPatient) { setError("Seleziona un paziente."); return; }
    const dur = Number(createDuration);
    if (!isFinite(dur) || dur <= 0) { setError("Durata non valida."); return; }
    setBusy(true); setError("");
    const start = buildDateTime(createDate, createTime);
    const end   = new Date(start); end.setMinutes(end.getMinutes() + dur);
    const amount = createAmount.trim() === "" ? null
      : (() => { const n = Number(createAmount.replace(",", ".")); return isFinite(n) ? n : null; })();
    const { error: e } = await supabase.from("appointments").insert({
      patient_id: selectedPatient.id,
      start_at: start.toISOString(), end_at: end.toISOString(),
      status: createStatus, calendar_note: createNote.trim() || null,
      location: createLocation,
      clinic_site: createLocation === "studio" ? (createClinicSite.trim() || DEFAULT_CLINIC) : null,
      domicile_address: createLocation === "domicile" ? (createDomicileAddress.trim() || null) : null,
      amount,
    });
    if (e) { setError(e.message); setBusy(false); return; }
    setBusy(false); setCreateOpen(false);
    await loadAppointments(currentDate);
  }, [selectedPatient, createDuration, createDate, createTime, createStatus, createNote,
      createLocation, createClinicSite, createDomicileAddress, createAmount, currentDate, loadAppointments]);

  /* ── Move appointment (drag) ──────────────── */
  const moveAppointment = useCallback(async (id: string, newStart: Date) => {
    const ev = events.find(x => x.id === id); if (!ev) return;
    const durMin = Math.max(15, Math.round((ev.end.getTime() - ev.start.getTime()) / 60_000));
    const newEnd = new Date(newStart); newEnd.setMinutes(newEnd.getMinutes() + durMin);
    setBusy(true); setError("");
    setEvents(prev => prev.map(x => x.id === id ? { ...x, start: newStart, end: newEnd } : x));
    const { error: e } = await supabase.from("appointments")
      .update({ start_at: newStart.toISOString(), end_at: newEnd.toISOString() }).eq("id", id);
    if (e) { setError(e.message); await loadAppointments(currentDate); }
    else await loadAppointments(currentDate);
    setBusy(false);
  }, [events, currentDate, loadAppointments]);

  /* ── Mouse drag ───────────────────────────── */
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!draggingId) return; e.preventDefault();
    const el = timelineRef.current; if (!el) return;
    setDragOverY(e.clientY - el.getBoundingClientRect().top);
  }, [draggingId]);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/appointment-id") || draggingId;
    setDragOverY(null); setDraggingId(null);
    const el = timelineRef.current; if (!el || !id) return;
    const y = e.clientY - el.getBoundingClientRect().top;
    const totalMin = clamp(roundTo(y / (PX_PER_HOUR / 60), 5), 0, (dayEndHour - dayStartHour) * 60 - 5);
    const base = new Date(currentDate); base.setHours(dayStartHour, 0, 0, 0);
    const ns = new Date(base); ns.setMinutes(ns.getMinutes() + totalMin);
    await moveAppointment(id, ns);
  }, [draggingId, currentDate, dayStartHour, dayEndHour, moveAppointment]);

  /* ── Touch drag ───────────────────────────── */
  const handleEventTouchStart = useCallback((e: React.TouchEvent, ev: CalendarEvent) => {
    const { top } = getEventPosition(ev.start, ev.end);
    const state: TouchDragState = {
      eventId: ev.id, startClientY: e.touches[0].clientY, startEventTopPx: top, activated: false,
      activationTimer: setTimeout(() => {
        if (touchDragRef.current?.eventId === ev.id) {
          touchDragRef.current.activated = true;
          setTouchDraggingId(ev.id); setTouchDragY(top);
        }
      }, 200),
    };
    touchDragRef.current = state;
  }, [getEventPosition]);

  const handleTimelineTouchMove = useCallback((e: React.TouchEvent) => {
    const state = touchDragRef.current; if (!state) return;
    const dy = e.touches[0].clientY - state.startClientY;
    if (!state.activated) {
      if (Math.abs(dy) > 8) {
        if (state.activationTimer) clearTimeout(state.activationTimer);
        touchDragRef.current = null;
      }
      return;
    }
    e.preventDefault();
    setTouchDragY(clamp(state.startEventTopPx + dy, 0, (dayEndHour - dayStartHour) * PX_PER_HOUR));
  }, [dayStartHour, dayEndHour]);

  const handleTimelineTouchEnd = useCallback(async () => {
    const state = touchDragRef.current; touchDragRef.current = null;
    if (state?.activationTimer) clearTimeout(state.activationTimer);
    const finalY = touchDragYRef.current;
    setTouchDraggingId(null); setTouchDragY(null);
    if (!state?.activated || finalY === null) return;
    const totalMin = clamp(roundTo(finalY / (PX_PER_HOUR / 60), 5), 0, (dayEndHour - dayStartHour) * 60 - 5);
    const base = new Date(currentDate); base.setHours(dayStartHour, 0, 0, 0);
    const ns = new Date(base); ns.setMinutes(ns.getMinutes() + totalMin);
    await moveAppointment(state.eventId, ns);
  }, [currentDate, dayStartHour, dayEndHour, moveAppointment]);

  /* ── Logout ───────────────────────────────── */
  async function handleLogout() {
    try { await supabase.auth.signOut(); } finally {
      setUserMenuOpen(false); window.location.href = "/login";
    }
  }

  /* ── Event card ───────────────────────────── */
  const renderEventCard = useCallback((ev: CalendarEvent) => {
    const { top, height } = getEventPosition(ev.start, ev.end);
    const col        = statusColor(ev.status);
    const bg         = statusBg(ev.status);
    const phoneOk    = !!normalizePhone(ev.patient_phone);
    const isDragging = touchDraggingId === ev.id;
    const displayTop = isDragging && touchDragY !== null ? touchDragY : top;
    const short      = height < 52;
    const waSent     = !!ev.whatsapp_sent_at;

    return (
      <div
        key={ev.id} draggable
        onDragStart={e => {
          setDraggingId(ev.id);
          try { e.dataTransfer.setData("text/appointment-id", ev.id); } catch {}
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => { setDraggingId(null); setDragOverY(null); }}
        onTouchStart={e => handleEventTouchStart(e, ev)}
        onClick={e => {
          if ((e.target as HTMLElement).closest(".ev-act")) return;
          if (isDragging) return;
          openEvent(ev);
        }}
        style={{
          position: "absolute", left: 52, right: 8, top: displayTop, height,
          background: bg,
          /* nessun borderLeft — bordo uniforme sottile con tint del colore */
          border: `1.5px solid ${col}30`,
          borderRadius: 8,
          padding: short ? "4px 10px" : "8px 10px",
          boxSizing: "border-box", overflow: "hidden",
          boxShadow: isDragging
            ? `0 8px 24px rgba(15,23,42,0.18), 0 0 0 2px ${col}50`
            : "0 1px 4px rgba(15,23,42,0.06)",
          display: "flex", flexDirection: short ? "row" : "column",
          alignItems: short ? "center" : "flex-start", gap: short ? 8 : 4,
          cursor: "pointer", zIndex: isDragging ? 10 : 3,
          opacity: draggingId === ev.id ? 0.2 : 1,
          transition: isDragging ? "none" : "box-shadow 0.15s, opacity 0.15s",
          touchAction: "none",
        }}
      >
        {/* Nome */}
        <div style={{
          fontWeight: 700, fontSize: 13, color: THEME.text,
          flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {ev.patient_name}
        </div>

        {!short && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, overflow: "hidden" }}>
              <span style={{ fontSize: 11, color: THEME.muted, whiteSpace: "nowrap" }}>
                {fmtTime(ev.start)}–{fmtTime(ev.end)}
              </span>
              <span style={{ fontSize: 10, color: col, background: `${col}18`,
                             padding: "1px 6px", borderRadius: 99, whiteSpace: "nowrap" }}>
                {statusLabel(ev.status)}
              </span>
              {ev.location === "domicile" && <span style={{ fontSize: 11 }}>🏠</span>}
            </div>
            {/* Bottone WA — stessa logica del desktop */}
            <button className="ev-act"
              disabled={!phoneOk}
              title={waSent
                ? `WA inviato il ${new Date(ev.whatsapp_sent_at!).toLocaleDateString("it-IT")}`
                : "Invia promemoria WhatsApp"}
              onClick={e => {
                e.stopPropagation();
                if (phoneOk) sendReminder(ev.id, ev.patient_phone ?? undefined, ev.patient_first_name ?? undefined);
              }}
              style={{
                padding: "3px 8px", borderRadius: 99, flexShrink: 0,
                border: waSent ? `1px solid rgba(22,163,74,0.4)` : `1px solid ${THEME.border}`,
                background: waSent ? "rgba(22,163,74,0.10)" : THEME.panelBg,
                color: waSent ? THEME.green : THEME.muted,
                fontSize: 11, cursor: phoneOk ? "pointer" : "not-allowed",
                opacity: phoneOk ? 1 : 0.35,
              }}>
              {waSent ? "✓ 💬" : "💬"}
            </button>
          </div>
        )}

        {short && (
          <span style={{ fontSize: 10, color: THEME.muted, flexShrink: 0 }}>
            {fmtTime(ev.start)}
          </span>
        )}
      </div>
    );
  }, [getEventPosition, touchDraggingId, touchDragY, draggingId,
      handleEventTouchStart, openEvent, sendReminder]);

  const isToday = isSameDay(currentDate, new Date());

  /* ─── RENDER ─────────────────────────────── */
  return (
    <div style={{ minHeight: "100vh", background: THEME.appBg,
                  paddingBottom: BOTTOM_TAB_H + 16,
                  fontFamily: "Inter,-apple-system,sans-serif" }}>

      {/* ━━━ NAVBAR ━━━ */}
      <header style={{
        position: "sticky", top: 0, zIndex: 30,
        background: THEME.gradient, padding: "0 14px", height: 54,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 2px 12px rgba(13,148,136,0.18)", gap: 10,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: "rgba(255,255,255,0.2)", border: "1.5px solid rgba(255,255,255,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 800, fontSize: 13,
          }}>F</div>
          <span style={{ fontWeight: 800, fontSize: 15, color: "#fff",
                         letterSpacing: 0.3, textTransform: "uppercase" }}>
            Fisio<span style={{ fontWeight: 700 }}>Hub</span>
          </span>
        </div>

        {/* KPI chips */}
        {!loading && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff",
                           background: "rgba(255,255,255,0.2)", padding: "4px 9px",
                           borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", whiteSpace: "nowrap" }}>
              ✓ {dayStats.done}/{dayStats.total}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff",
                           background: "rgba(255,255,255,0.2)", padding: "4px 9px",
                           borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", whiteSpace: "nowrap" }}>
              € {dayStats.revenue.toFixed(0)}
            </span>
          </div>
        )}

        {/* Refresh + Avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          <button onClick={() => loadAppointments(currentDate)} aria-label="Aggiorna" style={{
            width: 30, height: 30, borderRadius: 7,
            border: "1.5px solid rgba(255,255,255,0.3)",
            background: "rgba(255,255,255,0.15)",
            color: "#fff", cursor: "pointer", fontSize: 15,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>↺</button>
          <div ref={userMenuRef} style={{ position: "relative" }}>
            <button onClick={() => setUserMenuOpen(v => !v)} style={{
              width: 30, height: 30, borderRadius: 7,
              border: "1.5px solid rgba(255,255,255,0.35)",
              background: "rgba(255,255,255,0.2)",
              color: "#fff", fontWeight: 800, fontSize: 11,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>{userInitials}</button>
            {userMenuOpen && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 8px)", width: 190,
                background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
                borderRadius: 12, boxShadow: "0 12px 32px rgba(30,64,175,0.15)",
                overflow: "hidden", zIndex: 60,
              }}>
                <Link href="/settings" onClick={() => setUserMenuOpen(false)} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
                  color: THEME.text, textDecoration: "none", fontSize: 13, fontWeight: 600,
                  borderBottom: `1.5px solid ${THEME.border}`,
                }}>⚙️ Impostazioni</Link>
                <button onClick={handleLogout} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "12px 16px", background: "transparent", border: "none",
                  cursor: "pointer", color: THEME.red, fontWeight: 600, fontSize: 13,
                }}>⏻ Logout</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ━━━ TAB BAR BOTTOM ━━━ */}
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30,
        background: THEME.panelBg, borderTop: `1.5px solid ${THEME.border}`,
        display: "flex", boxShadow: "0 -4px 16px rgba(15,23,42,0.08)",
        paddingBottom: "env(safe-area-inset-bottom,0px)",
      }}>
        {[
          { href: "/mobile",          label: "Home",       icon: "⌂" },
          { href: "/mobile/calendar", label: "Calendario", icon: "▦", active: true },
          { href: "/mobile/patients", label: "Pazienti",   icon: "◉" },
          { href: "/mobile/reports",  label: "Report",     icon: "◈" },
        ].map(item => (
          <Link key={item.href} href={item.href} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "10px 4px 9px", textDecoration: "none", gap: 3, position: "relative",
          }}>
            <span style={{
              fontSize: 18, lineHeight: 1,
              ...(item.active
                ? { background: THEME.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }
                : { color: THEME.muted }),
            }}>{item.icon}</span>
            <span style={{ fontSize: 10, fontWeight: item.active ? 700 : 600,
                           color: item.active ? THEME.blue : THEME.muted }}>
              {item.label}
            </span>
            {item.active && (
              <div style={{
                position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                width: 28, height: 2.5, borderRadius: 999, background: THEME.gradient,
              }} />
            )}
          </Link>
        ))}
      </nav>

      {/* ━━━ CONTENUTO ━━━ */}
      <div style={{ padding: "12px 14px 0" }}>

        {/* Navigazione data */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <button onClick={goPrev} aria-label="Precedente" style={{
            padding: "9px 14px", borderRadius: 10, fontSize: 18, flexShrink: 0,
            border: `1.5px solid ${THEME.border}`, background: THEME.panelBg,
            color: THEME.text, cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>‹</button>

          <button onClick={goToday} style={{
            flex: 1, padding: "9px 12px", borderRadius: 10, fontSize: 13,
            fontWeight: 700, cursor: "pointer", textAlign: "center",
            border: isToday ? `2px solid ${THEME.blue}` : `1.5px solid ${THEME.border}`,
            background: isToday ? "rgba(37,99,235,0.08)" : THEME.panelBg,
            color: isToday ? THEME.blue : THEME.text,
          }}>
            <span style={{ fontWeight: 800 }}>{formatWeekday(currentDate)}</span>
            <span style={{ fontWeight: 500, opacity: 0.7, marginLeft: 6 }}>{formatDMY(currentDate)}</span>
          </button>

          <button onClick={goNext} aria-label="Successivo" style={{
            padding: "9px 14px", borderRadius: 10, fontSize: 18, flexShrink: 0,
            border: `1.5px solid ${THEME.border}`, background: THEME.panelBg,
            color: THEME.text, cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>›</button>
        </div>

        {/* Errore / loading */}
        {(loading || busy || error) && (
          <div style={{ marginBottom: 10 }}>
            {(loading || busy) && !error && (
              <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                {busy ? "Operazione in corso…" : "Caricamento…"}
              </div>
            )}
            {error && (
              <div style={{ padding: "10px 12px", borderRadius: 10,
                            background: "rgba(220,38,38,0.06)",
                            border: "1.5px solid rgba(220,38,38,0.25)",
                            color: "#7f1d1d", fontWeight: 600, fontSize: 13 }}>
                ⚠️ {error}
              </div>
            )}
          </div>
        )}

        {/* Timeline */}
        <div style={{
          background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
          borderRadius: 14, boxShadow: "0 2px 8px rgba(15,23,42,0.06)", overflow: "hidden",
        }}>
          <div ref={timelineScrollRef}
            onTouchStart={handleSwipeTouchStart} onTouchEnd={handleSwipeTouchEnd}
            style={{ overflowY: "auto", maxHeight: "calc(100vh - 210px)" }}>
            <div ref={timelineRef}
              onDragOver={handleDragOver} onDrop={handleDrop} onDragLeave={() => setDragOverY(null)}
              onTouchMove={handleTimelineTouchMove} onTouchEnd={handleTimelineTouchEnd}
              style={{ position: "relative", height: `${(dayEndHour - dayStartHour) * PX_PER_HOUR}px` }}>

              {/* Righe orarie */}
              {timeSlots.map((t, i) => (
                <div key={i} style={{
                  height: PX_PER_HOUR, borderBottom: `1px solid ${THEME.border}`, position: "relative",
                }}>
                  <div style={{
                    position: "absolute", left: 10, top: 5,
                    fontSize: 10, fontWeight: 600, color: THEME.muted,
                    letterSpacing: "0.04em", zIndex: 2, lineHeight: 1,
                  }}>{t.label}</div>
                  <div style={{ position: "absolute", left: 52, right: 0, top: PX_PER_HOUR / 2,
                                height: 1, background: THEME.border, opacity: 0.5, pointerEvents: "none" }} />
                  <div onClick={() => openCreate(`${pad2(t.hour)}:00`, toISODateLocal(currentDate))}
                    style={{ position: "absolute", top: 0, left: 52, right: 8,
                             height: PX_PER_HOUR / 2, cursor: "pointer", zIndex: 1 }} />
                  <div onClick={() => openCreate(`${pad2(t.hour)}:30`, toISODateLocal(currentDate))}
                    style={{ position: "absolute", top: PX_PER_HOUR / 2, left: 52, right: 8,
                             height: PX_PER_HOUR / 2, cursor: "pointer", zIndex: 1 }} />
                </div>
              ))}

              {/* Indicatore drag mouse */}
              {dragOverY !== null && draggingId && (
                <div style={{
                  position: "absolute", left: 52, right: 8,
                  top: clamp(dragOverY, 0, (dayEndHour - dayStartHour) * PX_PER_HOUR),
                  height: 2, background: THEME.blue, zIndex: 5, pointerEvents: "none",
                  boxShadow: `0 0 8px ${THEME.blue}80`,
                }} />
              )}
              {/* Indicatore drag touch */}
              {touchDragY !== null && touchDraggingId && (
                <div style={{
                  position: "absolute", left: 52, right: 8, top: Math.max(0, touchDragY),
                  height: 2, background: THEME.blue, zIndex: 5, pointerEvents: "none",
                  boxShadow: `0 0 8px ${THEME.blue}80`,
                }} />
              )}

              {/* Card appuntamenti */}
              {dayEvents.map(renderEventCard)}

              {/* Linea "adesso" */}
              {(() => {
                if (!isSameDay(currentTime, currentDate)) return null;
                const top = ((currentTime.getHours() - dayStartHour) * 60 + currentTime.getMinutes()) * (PX_PER_HOUR / 60);
                const max = (dayEndHour - dayStartHour) * PX_PER_HOUR;
                if (top < 0 || top > max) return null;
                return (
                  <div style={{ position: "absolute", left: 0, right: 0, top, height: 2,
                                background: THEME.red, zIndex: 4, pointerEvents: "none",
                                boxShadow: `0 0 8px ${THEME.red}60` }}>
                    <div style={{ position: "absolute", left: 8, top: -4, width: 9, height: 9,
                                  borderRadius: 99, background: THEME.red }} />
                  </div>
                );
              })()}

              {/* Empty state */}
              {!loading && dayEvents.length === 0 && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                              alignItems: "center", justifyContent: "center", gap: 10, pointerEvents: "none" }}>
                  <div style={{ fontSize: 36, opacity: 0.25 }}>📅</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: THEME.muted }}>Nessun appuntamento</div>
                  <div style={{ fontSize: 12, color: THEME.muted, opacity: 0.6 }}>Tocca + per aggiungerne uno</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ━━━ FAB ━━━ */}
      <button
        onClick={() => openCreate(undefined, toISODateLocal(currentDate))}
        aria-label="Nuovo appuntamento"
        style={{
          position: "fixed", right: 18,
          bottom: `calc(env(safe-area-inset-bottom,0px) + ${BOTTOM_TAB_H + 16}px)`,
          width: 52, height: 52, borderRadius: "50%",
          background: THEME.gradient, color: "#fff",
          border: "none", cursor: "pointer", fontSize: 26, fontWeight: 300, zIndex: 40,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 20px rgba(13,148,136,0.40)",
        }}>+</button>

      {/* ━━━ MODAL MODIFICA ━━━ */}
      {selectedEvent && (
        <LightModal onClose={() => setSelectedEvent(null)}>
          <ModalHeader
            title={selectedEvent.patient_name}
            subtitle={`${fmtTime(selectedEvent.start)} – ${fmtTime(selectedEvent.end)}`}
            onClose={() => setSelectedEvent(null)}
          />
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            {error && <ErrorBox>{error}</ErrorBox>}

            <FG label="Orario">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={inputS()} />
                <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} style={inputS()} />
                <input type="number" min={15} step={5} value={editDuration}
                  onChange={e => setEditDuration(Number(e.target.value))} style={inputS()} placeholder="Min" />
              </div>
            </FG>

            <FG label="Stato">
              <select value={editStatus} onChange={e => setEditStatus(e.target.value as Status)} style={inputS()}>
                <option value="booked">Prenotato</option>
                <option value="confirmed">Confermato</option>
                <option value="done">Eseguito</option>
                <option value="not_paid">Non pagata</option>
                <option value="cancelled">Annullato</option>
              </select>
            </FG>

            <FG label="Note">
              <textarea value={editNote} onChange={e => setEditNote(e.target.value)}
                style={{ ...inputS(), minHeight: 80, resize: "vertical" }} />
            </FG>

            <FG label="Importo">
              <input value={editAmount} onChange={e => setEditAmount(e.target.value)}
                style={inputS()} placeholder="Es. 40" inputMode="decimal" />
            </FG>

            {/* Stato WA */}
            {selectedEvent.whatsapp_sent_at && (
              <div style={{
                fontSize: 12, fontWeight: 600, color: THEME.green,
                padding: "6px 10px", borderRadius: 8,
                background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.2)",
              }}>
                ✓ Promemoria WA inviato il {new Date(selectedEvent.whatsapp_sent_at).toLocaleDateString("it-IT")}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
              <LightBtn v="primary" onClick={saveEvent} disabled={busy}>💾 Salva</LightBtn>
              <LightBtn v="wa"
                onClick={() => sendReminder(
                  selectedEvent.id,
                  selectedEvent.patient_phone ?? undefined,
                  selectedEvent.patient_first_name ?? undefined,
                )}
                disabled={!normalizePhone(selectedEvent.patient_phone)}>
                💬 WhatsApp
              </LightBtn>
              <LightBtn v="danger" onClick={deleteEvent} disabled={busy}>🗑 Elimina</LightBtn>
              <LightBtn v="ghost" onClick={() => setSelectedEvent(null)}>Chiudi</LightBtn>
            </div>
          </div>
        </LightModal>
      )}

      {/* ━━━ MODAL CREAZIONE ━━━ */}
      {createOpen && (
        <CreateModal
          busy={busy} error={error} onClose={() => setCreateOpen(false)}
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
          createAmount={createAmount}     setCreateAmount={setCreateAmount}
          createNote={createNote}         setCreateNote={setCreateNote}
          createAppointment={createAppointment}
        />
      )}
    </div>
  );
}

/* ─── UI helpers ─────────────────────────────────────────────────────── */

function inputS(): React.CSSProperties {
  return {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    border: `1.5px solid ${THEME.border}`, outline: "none",
    background: THEME.panelSoft, color: THEME.text,
    fontWeight: 500, fontSize: 14, fontFamily: "Inter,-apple-system,sans-serif",
    boxSizing: "border-box",
  };
}

type BtnV = "primary" | "wa" | "danger" | "ghost";
function LightBtn({
  v, onClick, disabled, children,
}: {
  v: BtnV; onClick?: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  const styles: Record<BtnV, React.CSSProperties> = {
    primary: { background: THEME.gradient, color: "#fff", border: "none",
               boxShadow: "0 2px 8px rgba(13,148,136,0.25)" },
    wa:      { background: "rgba(22,163,74,0.10)", color: THEME.green,
               border: `1.5px solid rgba(22,163,74,0.3)` },
    danger:  { background: "rgba(220,38,38,0.08)", color: THEME.red,
               border: `1.5px solid rgba(220,38,38,0.2)` },
    ghost:   { background: THEME.panelSoft, color: THEME.muted,
               border: `1.5px solid ${THEME.border}` },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "11px 14px", borderRadius: 10, fontWeight: 700,
      cursor: disabled ? "not-allowed" : "pointer", fontSize: 13,
      fontFamily: "Inter,-apple-system,sans-serif",
      opacity: disabled ? 0.4 : 1, transition: "opacity 0.15s",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      ...styles[v],
    }}>{children}</button>
  );
}

function FG({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: THEME.muted, fontWeight: 700, marginBottom: 6,
                    textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(220,38,38,0.06)", border: "1.5px solid rgba(220,38,38,0.25)",
                  color: "#7f1d1d", padding: "10px 13px", borderRadius: 10,
                  fontSize: 13, fontWeight: 600 }}>
      ⚠️ {children}
    </div>
  );
}

function LightModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)",
        zIndex: 4000, backdropFilter: "blur(4px)",
      }} />
      <div style={{
        position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
        width: "min(520px,calc(100vw - 24px))",
        background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
        borderRadius: 18, padding: 20, zIndex: 4001,
        boxShadow: "0 24px 64px rgba(15,23,42,0.18)",
        maxHeight: "85vh", overflowY: "auto",
        fontFamily: "Inter,-apple-system,sans-serif",
      }}>
        {children}
      </div>
    </>
  );
}

function ModalHeader({
  title, subtitle, onClose,
}: {
  title: string; subtitle?: string; onClose: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: THEME.text,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ marginTop: 3, fontSize: 12, color: THEME.muted, fontWeight: 600 }}>{subtitle}</div>
        )}
      </div>
      <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22,
                                         cursor: "pointer", color: THEME.muted, lineHeight: 1, padding: "0 4px" }}>
        ×
      </button>
    </div>
  );
}

/* ─── CreateModal ────────────────────────────────────────────────────── */
function CreateModal(props: CreateModalProps) {
  const {
    busy, error, onClose,
    patientQuery, setPatientQuery, patientResults, patientLoading,
    selectedPatient, setSelectedPatient,
    quickFirstName, setQuickFirstName, quickLastName, setQuickLastName,
    quickPhone, setQuickPhone, createQuickPatient,
    createDate, setCreateDate, createTime, setCreateTime,
    createDuration, setCreateDuration, createStatus, setCreateStatus,
    createLocation, setCreateLocation,
    createClinicSite, setCreateClinicSite,
    createDomicileAddress, setCreateDomicileAddress,
    createAmount, setCreateAmount, createNote, setCreateNote, createAppointment,
  } = props;

  return (
    <LightModal onClose={onClose}>
      <ModalHeader title="Nuovo appuntamento" subtitle={`${createDate} · ${createTime}`} onClose={onClose} />
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <ErrorBox>{error}</ErrorBox>}

        <FG label="Paziente">
          <input value={patientQuery} onChange={e => setPatientQuery(e.target.value)}
            style={inputS()} placeholder="Cerca per nome/cognome…" />
          {patientLoading && (
            <div style={{ marginTop: 6, fontSize: 12, color: THEME.muted, fontWeight: 600 }}>Ricerca…</div>
          )}
          {patientResults.length > 0 && (
            <div style={{ marginTop: 6, border: `1.5px solid ${THEME.border}`, borderRadius: 10, overflow: "hidden" }}>
              {patientResults.map(p => {
                const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
                return (
                  <button key={p.id} onClick={() => setSelectedPatient(p)} style={{
                    width: "100%", textAlign: "left", padding: "10px 14px",
                    border: "none", borderBottom: `1px solid ${THEME.border}`,
                    background: selectedPatient?.id === p.id ? "rgba(37,99,235,0.08)" : THEME.panelSoft,
                    cursor: "pointer",
                    color: selectedPatient?.id === p.id ? THEME.blue : THEME.text,
                    fontWeight: 600, fontSize: 13, fontFamily: "Inter,-apple-system,sans-serif",
                  }}>
                    {name || "Paziente"}{p.phone ? ` · ${p.phone}` : ""}
                  </button>
                );
              })}
            </div>
          )}
          {selectedPatient && (
            <div style={{ marginTop: 6, padding: "6px 12px",
                          background: "rgba(37,99,235,0.08)", borderRadius: 8,
                          fontSize: 13, color: THEME.blue, fontWeight: 700 }}>
              ✓ {`${selectedPatient.first_name ?? ""} ${selectedPatient.last_name ?? ""}`.trim()}
            </div>
          )}
        </FG>

        <div style={{ borderTop: `1.5px solid ${THEME.border}`, paddingTop: 14 }}>
          <div style={{ fontSize: 10, color: THEME.muted, fontWeight: 700, marginBottom: 10,
                        textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Oppure crea paziente rapido
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input value={quickFirstName} onChange={e => setQuickFirstName(e.target.value)}
              style={inputS()} placeholder="Nome" />
            <input value={quickLastName} onChange={e => setQuickLastName(e.target.value)}
              style={inputS()} placeholder="Cognome" />
          </div>
          <input value={quickPhone} onChange={e => setQuickPhone(e.target.value)}
            style={{ ...inputS(), marginTop: 8 }} placeholder="Telefono (opzionale)" />
          <div style={{ marginTop: 10 }}>
            <LightBtn v="primary" onClick={createQuickPatient} disabled={busy}>➕ Crea e seleziona</LightBtn>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <FG label="Data">
            <input type="date" value={createDate} onChange={e => setCreateDate(e.target.value)} style={inputS()} />
          </FG>
          <FG label="Ora">
            <input type="time" value={createTime} onChange={e => setCreateTime(e.target.value)} style={inputS()} />
          </FG>
          <FG label="Durata (m)">
            <input type="number" min={15} step={5} value={createDuration}
              onChange={e => setCreateDuration(Number(e.target.value))} style={inputS()} />
          </FG>
        </div>

        <FG label="Stato">
          <select value={createStatus} onChange={e => setCreateStatus(e.target.value as Status)} style={inputS()}>
            <option value="confirmed">Confermato</option>
            <option value="booked">Prenotato</option>
            <option value="done">Eseguito</option>
            <option value="not_paid">Non pagata</option>
            <option value="cancelled">Annullato</option>
          </select>
        </FG>

        <FG label="Luogo">
          <select value={createLocation} onChange={e => setCreateLocation(e.target.value as LocationType)} style={inputS()}>
            <option value="studio">Studio</option>
            <option value="domicile">Domicilio</option>
          </select>
        </FG>

        {createLocation === "studio"
          ? <FG label="Sede studio">
              <input value={createClinicSite} onChange={e => setCreateClinicSite(e.target.value)}
                style={inputS()} placeholder={DEFAULT_CLINIC} />
            </FG>
          : <FG label="Indirizzo domicilio">
              <input value={createDomicileAddress} onChange={e => setCreateDomicileAddress(e.target.value)}
                style={inputS()} placeholder="Indirizzo…" />
            </FG>
        }

        <FG label="Importo">
          <input value={createAmount} onChange={e => setCreateAmount(e.target.value)}
            style={inputS()} placeholder="Es. 40" inputMode="decimal" />
        </FG>
        <FG label="Note">
          <textarea value={createNote} onChange={e => setCreateNote(e.target.value)}
            style={{ ...inputS(), minHeight: 80, resize: "vertical" }} />
        </FG>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <LightBtn v="primary" onClick={createAppointment} disabled={busy}>✅ Crea appuntamento</LightBtn>
          <LightBtn v="ghost" onClick={onClose}>Annulla</LightBtn>
        </div>
      </div>
    </LightModal>
  );
}
