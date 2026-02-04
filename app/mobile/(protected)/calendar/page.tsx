"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import { Menu, X, Home, Calendar, BarChart3, Users } from "lucide-react";

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
};

type MessageTemplate = {
  id: string;
  name: string;
  template: string;
  is_default: boolean;
  created_at: string;
};

const THEME = {
  appBg: "#f1f5f9",
  panelBg: "#ffffff",
  panelSoft: "#f7f9fd",

  text: "#0f172a",
  muted: "#334155",

  border: "#cbd5e1",
  borderSoft: "#94a3b8",

  blue: "#2563eb",
  blueDark: "#1e40af",
  green: "#16a34a",
  red: "#dc2626",
  amber: "#f97316",
  gray: "#64748b",
};

const COLORS = {
  primary: "#1e3a8a",
  secondary: "#2563eb",
  accent: "#0d9488",
  success: "#16a34a",
  warning: "#f97316",
  danger: "#dc2626",
  muted: "#64748b",
  background: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
};

const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 22;
const DEFAULT_CLINIC_SITE = "Studio Pontecorvo";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function formatDMY(d: Date) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function formatFullDate(d: Date) {
  const days = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const dayName = days[d.getDay()];
  return `${dayName} ${formatDMY(d)}`;
}

function formatRelativeDateLabel(d: Date, now: Date = new Date()) {
  // "Oggi 04/02/2026", "Domani 05/02/2026", altrimenti "04/02/2026"
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  const base = formatDMY(d);
  if (diffDays === 0) return `Oggi ${base}`;
  if (diffDays === 1) return `Domani ${base}`;
  return base;
}

function isSameDay(a: Date, b: Date) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
function toISODateLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseTimeHHMM(t: string) {
  const [hh, mm] = t.split(":").map((x) => Number(x));
  return { hh: Number.isFinite(hh) ? hh : 0, mm: Number.isFinite(mm) ? mm : 0 };
}
function buildDateTime(dateISO: string, timeHHMM: string) {
  const base = new Date(`${dateISO}T00:00:00`);
  const { hh, mm } = parseTimeHHMM(timeHHMM);
  base.setHours(hh, mm, 0, 0);
  return base;
}
function normalizePhone(raw?: string | null) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9) return null;
  return digits;
}
function isValidISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isValidHHMM(s: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function statusLabel(status: Status) {
  switch (status) {
    case "confirmed":
      return "Confermato";
    case "done":
      return "Eseguito";
    case "not_paid":
      return "Non pagata";
    case "cancelled":
      return "Annullato";
    default:
      return "Prenotato";
  }
}
function statusColor(status: Status) {
  switch (status) {
    case "done":
      return THEME.green;
    case "confirmed":
      return THEME.blue;
    case "not_paid":
      return THEME.amber;
    case "cancelled":
      return THEME.gray;
    case "booked":
    default:
      return THEME.red;
  }
}
function statusBg(status: Status) {
  switch (status) {
    case "done":
      return "#ecfdf5";
    case "confirmed":
      return "#eff6ff";
    case "not_paid":
      return "#fff7ed";
    case "cancelled":
      return "#f1f5f9";
    case "booked":
    default:
      return "#fff1f2";
  }
}

// --- BARRA LATERALE MOBILE (MENU) ---
function MobileMenu({ showMenu, setShowMenu }: { showMenu: boolean; setShowMenu: (show: boolean) => void }) {
  return (
    <>
      <button
        onClick={() => setShowMenu(!showMenu)}
        style={{
          background: "none",
          border: "none",
          padding: 8,
          cursor: "pointer",
          color: COLORS.primary,
        }}
      >
        <Menu size={24} />
      </button>

      {showMenu && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            bottom: 0,
            width: "80%",
            maxWidth: 320,
            background: COLORS.card,
            borderRight: `1px solid ${COLORS.border}`,
            padding: 16,
            zIndex: 2000,
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: COLORS.text }}>Fisio Hub</div>
            <button
              onClick={() => setShowMenu(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.primary, padding: 8 }}
              aria-label="Chiudi menu"
            >
              <X size={24} />
            </button>
          </div>

          <Link
            href="/mobile"
            onClick={() => setShowMenu(false)}
            style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 12, textDecoration: "none", color: COLORS.text, border: `1px solid ${COLORS.border}` }}
          >
            <Home size={18} /> Home
          </Link>

          <Link
            href="/calendar"
            onClick={() => setShowMenu(false)}
            style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 12, textDecoration: "none", color: COLORS.text, border: `1px solid ${COLORS.border}` }}
          >
            <Calendar size={18} /> Calendario
          </Link>

          <Link
            href="/reports"
            onClick={() => setShowMenu(false)}
            style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 12, textDecoration: "none", color: COLORS.text, border: `1px solid ${COLORS.border}` }}
          >
            <BarChart3 size={18} /> Report
          </Link>

          <Link
            href="/patients"
            onClick={() => setShowMenu(false)}
            style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 12, textDecoration: "none", color: COLORS.text, border: `1px solid ${COLORS.border}` }}
          >
            <Users size={18} /> Pazienti
          </Link>
        </div>
      )}

      {showMenu && (
        <div
          onClick={() => setShowMenu(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1999 }}
        />
      )}
    </>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Caricamento calendario…</div>}>
      <CalendarPageInner />
    </Suspense>
  );
}

function CalendarPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showMenu, setShowMenu] = useState(false);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Drag & Drop per spostare appuntamenti
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverY, setDragOverY] = useState<number | null>(null);

  // Template WhatsApp
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Modal edit
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editStatus, setEditStatus] = useState<Status>("booked");
  const [editNote, setEditNote] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState<string>(toISODateLocal(new Date()));
  const [editTime, setEditTime] = useState<string>("09:00");
  const [editDuration, setEditDuration] = useState<number>(60);

  // Modal create
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState<string>(toISODateLocal(new Date()));
  const [createTime, setCreateTime] = useState<string>("09:00");
  const [createDuration, setCreateDuration] = useState<number>(60);
  const [createStatus, setCreateStatus] = useState<Status>("confirmed");
  const [createLocation, setCreateLocation] = useState<LocationType>("studio");
  const [createClinicSite, setCreateClinicSite] = useState<string>(DEFAULT_CLINIC_SITE);
  const [createDomicileAddress, setCreateDomicileAddress] = useState<string>("");
  const [createAmount, setCreateAmount] = useState<string>("");
  const [createNote, setCreateNote] = useState<string>("");

  // Patient search + quick create
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<PatientLite[]>([]);
  const [patientLoading, setPatientLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientLite | null>(null);

  const [quickFirstName, setQuickFirstName] = useState("");
  const [quickLastName, setQuickLastName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");

  useEffect(() => {
    loadMessageTemplates();
  }, []);

  const loadMessageTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Errore caricamento template:", error);
        return;
      }

      setMessageTemplates(data || []);

      const defaultTemplate = data?.find((t) => t.is_default);
      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id);
      } else if (data && data.length > 0) {
        setSelectedTemplateId(data[0].id);
      }
    } catch (err) {
      console.error("Errore:", err);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadAppointments = useCallback(async (date: Date) => {
    setLoading(true);
    setError("");

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from("appointments")
      .select(
        `
        id, patient_id, start_at, end_at, status, calendar_note,
        location, clinic_site, domicile_address,
        amount, treatment_type, price_type,
        patients:patient_id ( first_name, last_name, phone )
      `
      )
      .gte("start_at", startOfDay.toISOString())
      .lt("start_at", endOfDay.toISOString())
      .order("start_at", { ascending: true });

    if (error) {
      setError(`Errore caricamento: ${error.message}`);
      setLoading(false);
      return;
    }

    const mapped: CalendarEvent[] = (data ?? []).map((a: any) => {
      const p = Array.isArray(a.patients) ? a.patients[0] : a.patients;
      const name = p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "Paziente";
      return {
        id: a.id,
        patient_id: a.patient_id ?? null,
        patient_name: name || "Paziente",
        patient_phone: p?.phone ?? null,
        start: new Date(a.start_at),
        end: new Date(a.end_at),
        status: (a.status ?? "booked") as Status,
        calendar_note: a.calendar_note ?? null,
        location: (a.location ?? null) as LocationType | null,
        clinic_site: a.clinic_site ?? null,
        domicile_address: a.domicile_address ?? null,
        amount: a.amount ?? null,
        treatment_type: a.treatment_type ?? null,
        price_type: a.price_type ?? null,
      };
    });

    setEvents(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAppointments(currentDate);
  }, [currentDate, loadAppointments]);

  const handledNewRef = useRef(false);
  useEffect(() => {
    const qDate = searchParams.get("date");
    if (qDate && isValidISODate(qDate)) {
      const d = new Date(`${qDate}T00:00:00`);
      if (!Number.isNaN(d.getTime()) && !isSameDay(d, currentDate)) {
        setCurrentDate(d);
      }
    }

    const isNew = searchParams.get("new") === "1";
    if (!isNew) {
      handledNewRef.current = false;
      return;
    }
    if (handledNewRef.current) return;

    handledNewRef.current = true;

    const baseDate = qDate && isValidISODate(qDate) ? qDate : toISODateLocal(currentDate);
    const qTime = searchParams.get("time");
    const prefillTime = qTime && isValidHHMM(qTime) ? qTime : undefined;

    openCreate(prefillTime, baseDate);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    params.delete("time");
    const next = params.toString();
    router.replace(`/calendar${next ? `?${next}` : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  const dayEvents = useMemo(() => events.filter((e) => isSameDay(e.start, currentDate)), [events, currentDate]);

  const dayStats = useMemo(() => {
    const total = dayEvents.length;
    const done = dayEvents.filter((e) => e.status === "done").length;
    const revenue = dayEvents.reduce((sum, e) => (e.status === "done" ? sum + (e.amount ?? 0) : sum), 0);
    return { total, done, revenue };
  }, [dayEvents]);

  const { dayStartHour, dayEndHour } = useMemo(() => {
    if (dayEvents.length === 0) return { dayStartHour: DEFAULT_START_HOUR, dayEndHour: DEFAULT_END_HOUR };

    const starts = dayEvents.map((e) => e.start.getHours());
    const ends = dayEvents.map((e) => e.end.getHours() + (e.end.getMinutes() > 0 ? 1 : 0));

    let start = Math.min(DEFAULT_START_HOUR, ...starts);
    let end = Math.max(DEFAULT_END_HOUR, ...ends);

    start = Math.max(0, Math.min(23, start));
    end = Math.max(start + 1, Math.min(24, end));

    return { dayStartHour: start, dayEndHour: end };
  }, [dayEvents]);

  const timeSlots = useMemo(() => {
    const slots: { label: string; hour: number; half: 0 | 30 }[] = [];
    for (let h = dayStartHour; h < dayEndHour; h++) {
      slots.push({ label: `${pad2(h)}:00`, hour: h, half: 0 });
    }
    return slots;
  }, [dayStartHour, dayEndHour]);

  const getEventPosition = useCallback(
    (start: Date, end: Date) => {
      const top = (start.getHours() - dayStartHour) * 60 + start.getMinutes();
      const height = (end.getHours() - start.getHours()) * 60 + (end.getMinutes() - start.getMinutes());
      return { top: Math.max(0, top), height: Math.max(44, height) };
    },
    [dayStartHour]
  );

  const buildWhatsAppMessage = useCallback(
    (ev: CalendarEvent) => {
      if (!selectedTemplateId || messageTemplates.length === 0) {
        // Fallback al vecchio template se non ci sono template configurati
        const day = formatRelativeDateLabel(ev.start);
        const when = `${fmtTime(ev.start)}`;
        const where = ev.location === "domicile" ? "a domicilio" : "in studio";
        return `Ciao ${ev.patient_name}, promemoria appuntamento ${where} ${day} alle ${when}. Confermi?`;
      }

      const template =
        messageTemplates.find((t) => t.id === selectedTemplateId) ||
        messageTemplates.find((t) => t.is_default) ||
        messageTemplates[0];

      if (!template) {
        return "Messaggio di promemoria appuntamento";
      }

      return template.template
        .replace(/{nome}/g, ev.patient_name)
        .replace(/{data_relativa}/g, formatRelativeDateLabel(ev.start))
        .replace(/{ora}/g, fmtTime(ev.start))
        .replace(
          /{luogo}/g,
          ev.location === "domicile"
            ? ev.domicile_address || "a domicilio"
            : ev.clinic_site || DEFAULT_CLINIC_SITE
        );
    },
    [selectedTemplateId, messageTemplates]
  );

  const goPrev = useCallback(() => setCurrentDate((p) => addDays(p, -1)), []);
  const goNext = useCallback(() => setCurrentDate((p) => addDays(p, 1)), []);
  const goToday = useCallback(() => setCurrentDate(new Date()), []);

  const openEvent = useCallback((ev: CalendarEvent) => {
    setSelectedEvent(ev);
    setEditStatus(ev.status);
    setEditNote(ev.calendar_note ?? "");
    setEditAmount(ev.amount === null || ev.amount === undefined ? "" : String(ev.amount));

    // orario/modifica
    setEditDate(toISODateLocal(ev.start));
    setEditTime(`${pad2(ev.start.getHours())}:${pad2(ev.start.getMinutes())}`);
    const durMin = Math.max(15, Math.round((ev.end.getTime() - ev.start.getTime()) / 60000));
    setEditDuration(durMin);
  }, []);

  const sendWhatsApp = useCallback(
    (ev: CalendarEvent) => {
      const phone = normalizePhone(ev.patient_phone);
      if (!phone) return;

      const msg = buildWhatsAppMessage(ev);
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
      window.open(url, "_blank");
    },
    [buildWhatsAppMessage]
  );

  const saveEvent = useCallback(async () => {
    if (!selectedEvent) return;

    setBusy(true);
    setError("");

    const amount =
      editAmount.trim() === ""
        ? null
        : (() => {
            const n = Number(editAmount.replace(",", "."));
            return Number.isFinite(n) ? n : null;
          })();

    const updateData: any = {
      status: editStatus,
      calendar_note: editNote.trim() === "" ? null : editNote.trim(),
      amount,
    };

    // cambio orario/data (se modificato)
    if (isValidISODate(editDate) && isValidHHMM(editTime)) {
      const newStart = buildDateTime(editDate, editTime);
      const dur = Number(editDuration);
      const durOk =
        Number.isFinite(dur) && dur > 0
          ? dur
          : Math.round((selectedEvent.end.getTime() - selectedEvent.start.getTime()) / 60000);

      const newEnd = new Date(newStart);
      newEnd.setMinutes(newEnd.getMinutes() + durOk);

      const sameStart = newStart.getTime() === selectedEvent.start.getTime();
      const sameEnd = newEnd.getTime() === selectedEvent.end.getTime();

      if (!sameStart || !sameEnd) {
        updateData.start_at = newStart.toISOString();
        updateData.end_at = newEnd.toISOString();
      }
    }

    const { error } = await supabase.from("appointments").update(updateData).eq("id", selectedEvent.id);

    if (error) {
      setError(`Errore salvataggio: ${error.message}`);
      setBusy(false);
      return;
    }

    setSelectedEvent(null);
    setBusy(false);
    await loadAppointments(currentDate);
  }, [selectedEvent, editStatus, editNote, editAmount, editDate, editTime, editDuration, currentDate, loadAppointments]);

  const deleteEvent = useCallback(async () => {
    if (!selectedEvent) return;
    const ok = window.confirm("Vuoi eliminare definitivamente questo appuntamento?");
    if (!ok) return;

    setBusy(true);
    setError("");

    const { error } = await supabase.from("appointments").delete().eq("id", selectedEvent.id);
    if (error) {
      setError(`Errore eliminazione: ${error.message}`);
      setBusy(false);
      return;
    }

    setSelectedEvent(null);
    setBusy(false);
    await loadAppointments(currentDate);
  }, [selectedEvent, currentDate, loadAppointments]);

  const openCreate = useCallback(
    (prefillTime?: string, prefillDateISO?: string) => {
      setCreateOpen(true);
      setError("");
      setSelectedPatient(null);
      setPatientQuery("");
      setPatientResults([]);
      setQuickFirstName("");
      setQuickLastName("");
      setQuickPhone("");

      const dateISO = prefillDateISO && isValidISODate(prefillDateISO) ? prefillDateISO : toISODateLocal(currentDate);

      setCreateDate(dateISO);
      setCreateTime(prefillTime && isValidHHMM(prefillTime) ? prefillTime : "09:00");
      setCreateDuration(60);
      setCreateStatus("confirmed");
      setCreateLocation("studio");
      setCreateClinicSite(DEFAULT_CLINIC_SITE);
      setCreateDomicileAddress("");
      setCreateAmount("");
      setCreateNote("");
    },
    [currentDate]
  );

  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!createOpen) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      const q = patientQuery.trim();
      if (q.length < 2) {
        setPatientResults([]);
        return;
      }

      setPatientLoading(true);
      const { data, error } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone")
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
        .limit(8);

      setPatientLoading(false);
      if (error) {
        setPatientResults([]);
        return;
      }

      setPatientResults((data ?? []) as PatientLite[]);
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [patientQuery, createOpen]);

  const createQuickPatient = useCallback(async () => {
    const fn = quickFirstName.trim();
    const ln = quickLastName.trim();
    const ph = quickPhone.trim();

    if (!fn || !ln) {
      setError("Inserisci Nome e Cognome per creare un paziente rapido.");
      return;
    }

    setBusy(true);
    setError("");

    const insertData: any = {
      first_name: fn,
      last_name: ln,
      phone: ph === "" ? null : ph,
    };

    const { data, error } = await supabase.from("patients").insert(insertData).select("id, first_name, last_name, phone").single();

    if (error) {
      setError(`Errore creazione paziente rapido: ${error.message}`);
      setBusy(false);
      return;
    }

    const p = data as PatientLite;
    setSelectedPatient(p);
    setPatientQuery(`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim());
    setPatientResults([]);
    setBusy(false);
  }, [quickFirstName, quickLastName, quickPhone]);

  const createAppointment = useCallback(async () => {
    if (!selectedPatient) {
      setError("Seleziona un paziente (o creane uno rapido).");
      return;
    }

    const dur = Number(createDuration);
    if (!Number.isFinite(dur) || dur <= 0) {
      setError("Durata non valida.");
      return;
    }

    setBusy(true);
    setError("");

    const start = buildDateTime(createDate, createTime);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + dur);

    const amount =
      createAmount.trim() === ""
        ? null
        : (() => {
            const n = Number(createAmount.replace(",", "."));
            return Number.isFinite(n) ? n : null;
          })();

    const insertData: any = {
      patient_id: selectedPatient.id,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: createStatus,
      calendar_note: createNote.trim() === "" ? null : createNote.trim(),
      location: createLocation,
      clinic_site: createLocation === "studio" ? (createClinicSite.trim() || DEFAULT_CLINIC_SITE) : null,
      domicile_address: createLocation === "domicile" ? (createDomicileAddress.trim() || null) : null,
      amount,
    };

    const { error } = await supabase.from("appointments").insert(insertData);

    if (error) {
      setError(`Errore creazione appuntamento: ${error.message}`);
      setBusy(false);
      return;
    }

    setBusy(false);
    setCreateOpen(false);
    await loadAppointments(currentDate);
  }, [
    selectedPatient,
    createDuration,
    createDate,
    createTime,
    createStatus,
    createNote,
    createLocation,
    createClinicSite,
    createDomicileAddress,
    createAmount,
    currentDate,
    loadAppointments,
  ]);

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const roundTo = (n: number, step: number) => Math.round(n / step) * step;

  const moveAppointment = useCallback(
    async (appointmentId: string, newStart: Date) => {
      const ev = events.find((x) => x.id === appointmentId);
      if (!ev) return;

      const durMin = Math.max(15, Math.round((ev.end.getTime() - ev.start.getTime()) / 60000));
      const newEnd = new Date(newStart);
      newEnd.setMinutes(newEnd.getMinutes() + durMin);

      setBusy(true);
      setError("");

      setEvents((prev) =>
        prev.map((x) => (x.id === appointmentId ? { ...x, start: newStart, end: newEnd } : x))
      );

      const { error } = await supabase
        .from("appointments")
        .update({ start_at: newStart.toISOString(), end_at: newEnd.toISOString() })
        .eq("id", appointmentId);

      if (error) {
        setError(`Errore spostamento: ${error.message}`);
        await loadAppointments(currentDate);
        setBusy(false);
        return;
      }

      await loadAppointments(currentDate);
      setBusy(false);
    },
    [events, currentDate, loadAppointments]
  );

  const handleTimelineDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!draggingId) return;
      e.preventDefault();
      const el = timelineRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const y = e.clientY - rect.top;
      setDragOverY(y);
    },
    [draggingId]
  );

  const handleTimelineDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/appointment-id") || draggingId;
      setDragOverY(null);
      setDraggingId(null);

      const el = timelineRef.current;
      if (!el || !id) return;

      const rect = el.getBoundingClientRect();
      const y = e.clientY - rect.top;

      const totalMinutes = clamp(roundTo(y, 5), 0, (dayEndHour - dayStartHour) * 60 - 5);
      const base = new Date(currentDate);
      base.setHours(dayStartHour, 0, 0, 0);
      const newStart = new Date(base);
      newStart.setMinutes(newStart.getMinutes() + totalMinutes);

      await moveAppointment(id, newStart);
    },
    [draggingId, currentDate, dayStartHour, dayEndHour, moveAppointment]
  );

  const handleTimelineDragLeave = useCallback(() => {
    setDragOverY(null);
  }, []);

  // --- COMPACT EVENT CARD RENDER ---
  const renderEventCard = (ev: CalendarEvent) => {
    const { top, height } = getEventPosition(ev.start, ev.end);
    const bg = statusBg(ev.status);
    const col = statusColor(ev.status);
    const phoneOk = !!normalizePhone(ev.patient_phone);

    return (
      <div
        key={ev.id}
        draggable
        onDragStart={(e) => {
          setDraggingId(ev.id);
          try {
            e.dataTransfer.setData("text/appointment-id", ev.id);
          } catch {}
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          setDraggingId(null);
          setDragOverY(null);
        }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest(".event-action")) return;
          openEvent(ev);
        }}
        style={{
          position: "absolute",
          left: 60,
          right: 8,
          top,
          height,
          background: bg,
          border: `1px solid ${THEME.border}`,
          borderLeft: `6px solid ${col}`,
          borderRadius: 10,
          padding: "6px 8px",
          boxSizing: "border-box",
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          cursor: "pointer",
          zIndex: 3,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div
            style={{
              fontWeight: 900,
              fontSize: 13,
              color: THEME.text,
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {ev.patient_name}
          </div>

          <div style={{ fontSize: 11, fontWeight: 900, color: THEME.muted, flexShrink: 0 }}>
            {fmtTime(ev.start)}-{fmtTime(ev.end)}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: 99, background: col }} />
            <div style={{ fontSize: 11, fontWeight: 900, color: col, whiteSpace: "nowrap" }}>{statusLabel(ev.status)}</div>
            {ev.location === "domicile" && (
              <div style={{ fontSize: 12, fontWeight: 900, color: THEME.amber, whiteSpace: "nowrap" }}>🏠</div>
            )}
          </div>

          <button
            className="event-action"
            onClick={(e) => {
              e.stopPropagation();
              if (!phoneOk) return;
              sendWhatsApp(ev);
            }}
            disabled={!phoneOk}
            style={{
              padding: "4px 8px",
              borderRadius: 999,
              border: `1px solid ${THEME.green}`,
              background: "#f0fdf4",
              color: THEME.green,
              fontSize: 11,
              fontWeight: 900,
              cursor: phoneOk ? "pointer" : "not-allowed",
              opacity: phoneOk ? 1 : 0.5,
              whiteSpace: "nowrap",
            }}
            title={phoneOk ? "Invia promemoria WhatsApp" : "Numero non disponibile"}
          >
            💬
          </button>
        </div>
      </div>
    );
  };

  // --- UI ---
  return (
    <div style={{ minHeight: "100vh", background: THEME.appBg, padding: 16, fontSize: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <MobileMenu showMenu={showMenu} setShowMenu={setShowMenu} />
        <div style={{ fontSize: 16, fontWeight: 900, color: THEME.text }}>{formatFullDate(currentDate)}</div>
        <Link href="/" style={{ color: THEME.blueDark, fontWeight: 900, textDecoration: "none", fontSize: 14 }}>
          ← Agenda
        </Link>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: THEME.panelBg,
            padding: 12,
            borderRadius: 12,
            border: `1px solid ${THEME.border}`,
          }}
        >
          <button onClick={goPrev} style={navBtnStyle()}>
            ◀
          </button>
          <button onClick={goToday} style={todayBtnStyle()}>
            Oggi
          </button>
          <button onClick={goNext} style={navBtnStyle()}>
            ▶
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <StatCard label="Totali" value={String(dayStats.total)} color={THEME.blueDark} />
          <StatCard label="Eseguiti" value={String(dayStats.done)} color={THEME.green} />
          <StatCard label="Incasso" value={`€${dayStats.revenue}`} color={THEME.blue} />
        </div>

        {(loading || busy) && (
          <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 900 }}>
            {busy ? "Operazione in corso…" : "Caricamento…"}
          </div>
        )}
        {error && (
          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              color: "#9f1239",
              padding: "10px 12px",
              borderRadius: 10,
              fontWeight: 900,
            }}
          >
            {error}
          </div>
        )}
      </div>

      <div
        style={{
          position: "relative",
          background: THEME.panelBg,
          border: `1px solid ${THEME.border}`,
          borderRadius: 12,
          overflow: "hidden",
          minHeight: 520,
        }}
      >
        <div
          ref={timelineRef}
          onDragOver={handleTimelineDragOver}
          onDrop={handleTimelineDrop}
          onDragLeave={handleTimelineDragLeave}
          style={{ position: "relative", height: `${(dayEndHour - dayStartHour) * 60}px` }}
        >
          {timeSlots.map((t, idx) => {
            const hour = t.hour;

            return (
              <div key={idx} style={{ height: 60, borderBottom: `1px solid ${THEME.border}`, position: "relative" }}>
                <div
                  style={{
                    position: "absolute",
                    left: 8,
                    top: 0,
                    padding: "4px 8px",
                    fontSize: 12,
                    fontWeight: 900,
                    color: THEME.muted,
                    background: THEME.panelBg,
                    zIndex: 2,
                  }}
                >
                  {t.label}
                </div>

                <div
                  onClick={() => openCreate(`${pad2(hour)}:00`, toISODateLocal(currentDate))}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 60,
                    right: 8,
                    height: 30,
                    borderBottom: `1px solid ${THEME.borderSoft}`,
                    cursor: "pointer",
                  }}
                  title="Nuovo appuntamento"
                />
                <div
                  onClick={() => openCreate(`${pad2(hour)}:30`, toISODateLocal(currentDate))}
                  style={{ position: "absolute", top: 30, left: 60, right: 8, height: 30, cursor: "pointer" }}
                  title="Nuovo appuntamento"
                />
              </div>
            );
          })}

          {dragOverY !== null && draggingId && (
            <div
              style={{
                position: "absolute",
                left: 60,
                right: 8,
                top: Math.max(0, Math.min(dragOverY, (dayEndHour - dayStartHour) * 60)),
                height: 2,
                background: THEME.blue,
                zIndex: 5,
                pointerEvents: "none",
                opacity: 0.9,
              }}
            />
          )}

          {dayEvents.map(renderEventCard)}

          {(() => {
            const now = currentTime;
            if (!isSameDay(now, currentDate)) return null;

            const top = (now.getHours() - dayStartHour) * 60 + now.getMinutes();
            const max = (dayEndHour - dayStartHour) * 60;
            if (top < 0 || top > max) return null;

            return (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top,
                  height: 2,
                  background: THEME.red,
                  zIndex: 4,
                  pointerEvents: "none",
                }}
              >
                <div style={{ position: "absolute", left: 4, top: -4, width: 8, height: 8, borderRadius: 99, background: THEME.red }} />
              </div>
            );
          })()}
        </div>
      </div>

      <button
        onClick={() => openCreate(undefined, toISODateLocal(currentDate))}
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          width: 56,
          height: 56,
          borderRadius: 999,
          border: `2px solid ${THEME.blueDark}`,
          background: THEME.blue,
          color: "#fff",
          fontSize: 26,
          fontWeight: 900,
          boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
          cursor: "pointer",
          zIndex: 900,
        }}
        aria-label="Nuovo appuntamento"
        title="Nuovo appuntamento"
      >
        +
      </button>

      {/* EDIT MODAL */}
      {selectedEvent && (
        <Modal onClose={() => setSelectedEvent(null)}>
          <HeaderRow title={selectedEvent.patient_name} subtitle={`${fmtTime(selectedEvent.start)} - ${fmtTime(selectedEvent.end)}`} onClose={() => setSelectedEvent(null)} />

          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={labelStyle()}>Orario</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} style={inputStyle()} />
                <input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} style={inputStyle()} />
                <input
                  type="number"
                  min={15}
                  step={5}
                  value={editDuration}
                  onChange={(e) => setEditDuration(Number(e.target.value))}
                  style={inputStyle()}
                  placeholder="Durata (min)"
                />
              </div>
              <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 800, marginTop: 6 }}>
                Puoi anche trascinare l'appuntamento sul calendario per spostarlo rapidamente.
              </div>
            </div>

            <div>
              <div style={labelStyle()}>Stato</div>
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as Status)} style={inputStyle()}>
                <option value="booked">Prenotato</option>
                <option value="confirmed">Confermato</option>
                <option value="done">Eseguito</option>
                <option value="not_paid">Non pagata</option>
                <option value="cancelled">Annullato</option>
              </select>
            </div>

            {messageTemplates.length > 0 && (
              <div>
                <div style={labelStyle()}>Template WhatsApp</div>
                <select value={selectedTemplateId || ""} onChange={(e) => setSelectedTemplateId(e.target.value)} style={inputStyle()} disabled={loadingTemplates}>
                  {loadingTemplates ? (
                    <option value="">Caricamento template...</option>
                  ) : (
                    messageTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.is_default ? "⭐ " : ""}
                        {t.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}

            <div>
              <div style={labelStyle()}>Note</div>
              <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} style={{ ...inputStyle(), minHeight: 90, resize: "vertical" }} />
            </div>

            <div>
              <div style={labelStyle()}>Importo</div>
              <input value={editAmount} onChange={(e) => setEditAmount(e.target.value)} style={inputStyle()} placeholder="Es. 40" inputMode="decimal" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
              <button onClick={saveEvent} style={primaryBtnStyle()} disabled={busy}>
                💾 Salva
              </button>

              <button
                onClick={() => selectedEvent && sendWhatsApp(selectedEvent)}
                style={secondaryBtnStyle()}
                disabled={!normalizePhone(selectedEvent.patient_phone)}
                title={normalizePhone(selectedEvent.patient_phone) ? "Invia promemoria WhatsApp" : "Numero non disponibile"}
              >
                💬 WhatsApp
              </button>

              <button onClick={deleteEvent} style={dangerBtnStyle()} disabled={busy}>
                🗑 Elimina
              </button>

              <button onClick={() => setSelectedEvent(null)} style={ghostBtnStyle()}>
                Chiudi
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* CREATE MODAL */}
      {createOpen && (
        <CreateModal
          busy={busy}
          error={error}
          onClose={() => setCreateOpen(false)}
          patientQuery={patientQuery}
          setPatientQuery={setPatientQuery}
          patientResults={patientResults}
          patientLoading={patientLoading}
          selectedPatient={selectedPatient}
          setSelectedPatient={setSelectedPatient}
          quickFirstName={quickFirstName}
          setQuickFirstName={setQuickFirstName}
          quickLastName={quickLastName}
          setQuickLastName={setQuickLastName}
          quickPhone={quickPhone}
          setQuickPhone={setQuickPhone}
          createQuickPatient={createQuickPatient}
          createDate={createDate}
          setCreateDate={setCreateDate}
          createTime={createTime}
          setCreateTime={setCreateTime}
          createDuration={createDuration}
          setCreateDuration={setCreateDuration}
          createStatus={createStatus}
          setCreateStatus={setCreateStatus}
          createLocation={createLocation}
          setCreateLocation={setCreateLocation}
          createClinicSite={createClinicSite}
          setCreateClinicSite={setCreateClinicSite}
          createDomicileAddress={createDomicileAddress}
          setCreateDomicileAddress={setCreateDomicileAddress}
          createAmount={createAmount}
          setCreateAmount={setCreateAmount}
          createNote={createNote}
          setCreateNote={setCreateNote}
          createAppointment={createAppointment}
        />
      )}
    </div>
  );
}

/* ----------------- UI helpers + components ----------------- */

function navBtnStyle() {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: `1px solid ${THEME.border}`,
    background: THEME.panelSoft,
    fontWeight: 900,
    cursor: "pointer",
  } as const;
}
function todayBtnStyle() {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: `1px solid ${THEME.blueDark}`,
    background: THEME.blue,
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  } as const;
}
function inputStyle() {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: `1px solid ${THEME.border}`,
    outline: "none",
    background: "#fff",
    color: THEME.text,
    fontWeight: 800,
    fontSize: 14,
    boxSizing: "border-box",
  } as const;
}
function labelStyle() {
  return { fontSize: 12, color: THEME.muted, fontWeight: 900, marginBottom: 6 } as const;
}

function primaryBtnStyle() {
  return {
    padding: "12px 12px",
    borderRadius: 12,
    border: `1px solid ${THEME.blueDark}`,
    background: THEME.blue,
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  } as const;
}
function secondaryBtnStyle() {
  return {
    padding: "12px 12px",
    borderRadius: 12,
    border: `1px solid ${THEME.green}`,
    background: "#f0fdf4",
    color: THEME.green,
    fontWeight: 900,
    cursor: "pointer",
  } as const;
}
function dangerBtnStyle() {
  return {
    padding: "12px 12px",
    borderRadius: 12,
    border: `1px solid ${THEME.red}`,
    background: "#fff1f2",
    color: THEME.red,
    fontWeight: 900,
    cursor: "pointer",
  } as const;
}
function ghostBtnStyle() {
  return {
    padding: "12px 12px",
    borderRadius: 12,
    border: `1px solid ${THEME.border}`,
    background: "#fff",
    color: THEME.text,
    fontWeight: 900,
    cursor: "pointer",
  } as const;
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: THEME.panelBg, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 900 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900, color }}>{value}</div>
    </div>
  );
}

function Modal({ children, onClose }: { children: any; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 4000 }} />
      <div
        style={{
          position: "fixed",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(520px, calc(100vw - 24px))",
          background: "#fff",
          borderRadius: 14,
          border: `1px solid ${THEME.border}`,
          padding: 16,
          zIndex: 4001,
          boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
          maxHeight: "85vh",
          overflow: "auto",
        }}
      >
        {children}
      </div>
    </>
  );
}

function HeaderRow({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: THEME.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        {subtitle && <div style={{ marginTop: 4, fontSize: 12, fontWeight: 900, color: THEME.muted }}>{subtitle}</div>}
      </div>
      <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", fontWeight: 900, color: THEME.muted }}>
        ×
      </button>
    </div>
  );
}

/* ----------------- Create Modal (estratto, stesso stile) ----------------- */

function CreateModal(props: any) {
  const {
    busy,
    error,
    onClose,

    patientQuery,
    setPatientQuery,
    patientResults,
    patientLoading,
    selectedPatient,
    setSelectedPatient,

    quickFirstName,
    setQuickFirstName,
    quickLastName,
    setQuickLastName,
    quickPhone,
    setQuickPhone,
    createQuickPatient,

    createDate,
    setCreateDate,
    createTime,
    setCreateTime,
    createDuration,
    setCreateDuration,
    createStatus,
    setCreateStatus,
    createLocation,
    setCreateLocation,
    createClinicSite,
    setCreateClinicSite,
    createDomicileAddress,
    setCreateDomicileAddress,
    createAmount,
    setCreateAmount,
    createNote,
    setCreateNote,
    createAppointment,
  } = props;

  return (
    <Modal onClose={onClose}>
      <HeaderRow title="Nuovo appuntamento" subtitle={`${createDate} • ${createTime}`} onClose={onClose} />

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        {error && (
          <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#9f1239", padding: "10px 12px", borderRadius: 10, fontWeight: 900 }}>
            {error}
          </div>
        )}

        <div>
          <div style={labelStyle()}>Paziente</div>
          <input value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} style={inputStyle()} placeholder="Cerca per nome/cognome..." />
          {patientLoading && <div style={{ marginTop: 6, fontSize: 12, color: THEME.muted, fontWeight: 800 }}>Ricerca…</div>}
          {patientResults?.length > 0 && (
            <div style={{ marginTop: 8, border: `1px solid ${THEME.border}`, borderRadius: 12, overflow: "hidden" }}>
              {patientResults.map((p: any) => {
                const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPatient(p)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "none",
                      borderBottom: `1px solid ${THEME.border}`,
                      background: selectedPatient?.id === p.id ? "#eff6ff" : "#fff",
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    {name || "Paziente"} {p.phone ? `• ${p.phone}` : ""}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${THEME.border}`, paddingTop: 12 }}>
          <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 900, marginBottom: 8 }}>Oppure crea paziente rapido</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input value={quickFirstName} onChange={(e) => setQuickFirstName(e.target.value)} style={inputStyle()} placeholder="Nome" />
            <input value={quickLastName} onChange={(e) => setQuickLastName(e.target.value)} style={inputStyle()} placeholder="Cognome" />
          </div>
          <div style={{ marginTop: 8 }}>
            <input value={quickPhone} onChange={(e) => setQuickPhone(e.target.value)} style={inputStyle()} placeholder="Telefono (opzionale)" />
          </div>
          <button onClick={createQuickPatient} style={{ ...primaryBtnStyle(), marginTop: 10 }} disabled={busy}>
            ➕ Crea e seleziona
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div>
            <div style={labelStyle()}>Data</div>
            <input type="date" value={createDate} onChange={(e) => setCreateDate(e.target.value)} style={inputStyle()} />
          </div>
          <div>
            <div style={labelStyle()}>Ora</div>
            <input type="time" value={createTime} onChange={(e) => setCreateTime(e.target.value)} style={inputStyle()} />
          </div>
          <div>
            <div style={labelStyle()}>Durata (min)</div>
            <input type="number" min={15} step={5} value={createDuration} onChange={(e) => setCreateDuration(Number(e.target.value))} style={inputStyle()} />
          </div>
        </div>

        <div>
          <div style={labelStyle()}>Stato</div>
          <select value={createStatus} onChange={(e) => setCreateStatus(e.target.value as Status)} style={inputStyle()}>
            <option value="confirmed">Confermato</option>
            <option value="booked">Prenotato</option>
            <option value="done">Eseguito</option>
            <option value="not_paid">Non pagata</option>
            <option value="cancelled">Annullato</option>
          </select>
        </div>

        <div>
          <div style={labelStyle()}>Luogo</div>
          <select value={createLocation} onChange={(e) => setCreateLocation(e.target.value as LocationType)} style={inputStyle()}>
            <option value="studio">Studio</option>
            <option value="domicile">Domicilio</option>
          </select>
        </div>

        {createLocation === "studio" ? (
          <div>
            <div style={labelStyle()}>Sede studio</div>
            <input value={createClinicSite} onChange={(e) => setCreateClinicSite(e.target.value)} style={inputStyle()} placeholder={DEFAULT_CLINIC_SITE} />
          </div>
        ) : (
          <div>
            <div style={labelStyle()}>Indirizzo domicilio</div>
            <input value={createDomicileAddress} onChange={(e) => setCreateDomicileAddress(e.target.value)} style={inputStyle()} placeholder="Indirizzo..." />
          </div>
        )}

        <div>
          <div style={labelStyle()}>Importo</div>
          <input value={createAmount} onChange={(e) => setCreateAmount(e.target.value)} style={inputStyle()} placeholder="Es. 40" inputMode="decimal" />
        </div>

        <div>
          <div style={labelStyle()}>Note</div>
          <textarea value={createNote} onChange={(e) => setCreateNote(e.target.value)} style={{ ...inputStyle(), minHeight: 90, resize: "vertical" }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
          <button onClick={createAppointment} style={primaryBtnStyle()} disabled={busy}>
            ✅ Crea appuntamento
          </button>
          <button onClick={onClose} style={ghostBtnStyle()}>
            Annulla
          </button>
        </div>
      </div>
    </Modal>
  );
}
