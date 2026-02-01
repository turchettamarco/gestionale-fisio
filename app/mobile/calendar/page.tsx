"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

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

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Template WhatsApp
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Modal edit
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editStatus, setEditStatus] = useState<Status>("booked");
  const [editNote, setEditNote] = useState("");
  const [editAmount, setEditAmount] = useState("");

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

  // Carica template WhatsApp
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
      
      // Imposta il template predefinito come selezionato
      const defaultTemplate = data?.find(t => t.is_default);
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

  // timer current time line
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

  // ✅ PARAM ROUTING: date + new + time
  const handledNewRef = useRef(false);
  useEffect(() => {
    // 1) date=YYYY-MM-DD
    const qDate = searchParams.get("date");
    if (qDate && isValidISODate(qDate)) {
      const d = new Date(`${qDate}T00:00:00`);
      if (!Number.isNaN(d.getTime()) && !isSameDay(d, currentDate)) {
        setCurrentDate(d);
      }
    }

    // 2) new=1 → apri create UNA VOLTA e poi pulisci URL
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

    // Apri create
    openCreate(prefillTime, baseDate);

    // pulisci URL
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

  // dynamic hours range
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

  // Funzione per creare messaggio WhatsApp con template
  const buildWhatsAppMessage = useCallback((ev: CalendarEvent) => {
    if (!selectedTemplateId || messageTemplates.length === 0) {
      // Fallback al vecchio template se non ci sono template configurati
      const when = `${fmtTime(ev.start)}`;
      const where = ev.location === "domicile" ? "a domicilio" : "in studio";
      return `Ciao ${ev.patient_name}, promemoria appuntamento ${where} alle ${when}. Confermi?`;
    }

    const template = messageTemplates.find(t => t.id === selectedTemplateId) || 
                     messageTemplates.find(t => t.is_default) || 
                     messageTemplates[0];
    
    if (!template) {
      return "Messaggio di promemoria appuntamento";
    }

    // Sostituisci i placeholder con i dati reali
    return template.template
      .replace(/{nome}/g, ev.patient_name)
      .replace(/{data_relativa}/g, formatDMY(ev.start))
      .replace(/{ora}/g, fmtTime(ev.start))
      .replace(/{luogo}/g, ev.location === "domicile" 
        ? (ev.domicile_address || "a domicilio") 
        : (ev.clinic_site || DEFAULT_CLINIC_SITE));
  }, [selectedTemplateId, messageTemplates]);

  // navigation
  const goPrev = useCallback(() => setCurrentDate((p) => addDays(p, -1)), []);
  const goNext = useCallback(() => setCurrentDate((p) => addDays(p, 1)), []);
  const goToday = useCallback(() => setCurrentDate(new Date()), []);

  // open edit modal
  const openEvent = useCallback((ev: CalendarEvent) => {
    setSelectedEvent(ev);
    setEditStatus(ev.status);
    setEditNote(ev.calendar_note ?? "");
    setEditAmount(ev.amount === null || ev.amount === undefined ? "" : String(ev.amount));
  }, []);

  // WhatsApp action
  const sendWhatsApp = useCallback((ev: CalendarEvent) => {
    const phone = normalizePhone(ev.patient_phone);
    if (!phone) return;

    const msg = buildWhatsAppMessage(ev);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }, [buildWhatsAppMessage]);

  // save edit
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

    const { error } = await supabase.from("appointments").update(updateData).eq("id", selectedEvent.id);

    if (error) {
      setError(`Errore salvataggio: ${error.message}`);
      setBusy(false);
      return;
    }

    setSelectedEvent(null);
    setBusy(false);
    await loadAppointments(currentDate);
  }, [selectedEvent, editStatus, editNote, editAmount, currentDate, loadAppointments]);

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

  // --- CREATE APPOINTMENT FLOW ---
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

  // patient search debounce
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

  // --- COMPACT EVENT CARD RENDER ---
  const renderEventCard = (ev: CalendarEvent) => {
    const { top, height } = getEventPosition(ev.start, ev.end);
    const bg = statusBg(ev.status);
    const col = statusColor(ev.status);
    const phoneOk = !!normalizePhone(ev.patient_phone);

    return (
      <div
        key={ev.id}
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
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ color: THEME.blueDark, fontWeight: 900, textDecoration: "none", fontSize: 18 }}>
            ← Agenda
          </Link>
          <div style={{ fontSize: 14, fontWeight: 900, color: THEME.muted }}>{formatDMY(currentDate)}</div>
        </div>

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

        {(loading || busy) && <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 900 }}>{busy ? "Operazione in corso…" : "Caricamento…"}</div>}
        {error && (
          <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#9f1239", padding: "10px 12px", borderRadius: 10, fontWeight: 900 }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ position: "relative", background: THEME.panelBg, border: `1px solid ${THEME.border}`, borderRadius: 12, overflow: "hidden", minHeight: 520 }}>
        <div style={{ position: "relative", height: `${(dayEndHour - dayStartHour) * 60}px` }}>
          {timeSlots.map((t, idx) => {
            const hour = t.hour;

            return (
              <div key={idx} style={{ height: 60, borderBottom: `1px solid ${THEME.border}`, position: "relative" }}>
                <div style={{ position: "absolute", left: 8, top: 0, padding: "4px 8px", fontSize: 12, fontWeight: 900, color: THEME.muted, background: THEME.panelBg, zIndex: 2 }}>
                  {t.label}
                </div>

                <div
                  onClick={() => openCreate(`${pad2(hour)}:00`, toISODateLocal(currentDate))}
                  style={{ position: "absolute", top: 0, left: 60, right: 8, height: 30, borderBottom: `1px solid ${THEME.borderSoft}`, cursor: "pointer" }}
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

          {dayEvents.map(renderEventCard)}

          {(() => {
            const now = currentTime;
            if (!isSameDay(now, currentDate)) return null;

            const top = (now.getHours() - dayStartHour) * 60 + now.getMinutes();
            const max = (dayEndHour - dayStartHour) * 60;
            if (top < 0 || top > max) return null;

            return (
              <div style={{ position: "absolute", left: 0, right: 0, top, height: 2, background: THEME.red, zIndex: 4, pointerEvents: "none" }}>
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
          bottom: 18,
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
              <div style={labelStyle()}>Stato</div>
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as Status)} style={inputStyle()}>
                <option value="booked">Prenotato</option>
                <option value="confirmed">Confermato</option>
                <option value="done">Eseguito</option>
                <option value="not_paid">Non pagata</option>
                <option value="cancelled">Annullato</option>
              </select>
            </div>

            {/* SELEZIONE TEMPLATE WHATSAPP */}
            {messageTemplates.length > 0 && (
              <div>
                <div style={labelStyle()}>Template WhatsApp</div>
                <select 
                  value={selectedTemplateId || ""}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  style={inputStyle()}
                  disabled={loadingTemplates}
                >
                  {loadingTemplates ? (
                    <option value="">Caricamento template...</option>
                  ) : (
                    messageTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} {template.is_default && "(Predefinito)"}
                      </option>
                    ))
                  )}
                </select>
                
                {selectedTemplateId && !loadingTemplates && (
                  <div style={{
                    marginTop: 8,
                    padding: 10,
                    background: THEME.panelSoft,
                    borderRadius: 8,
                    fontSize: 12,
                    border: `1px solid ${THEME.border}`,
                    maxHeight: 100,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap'
                  }}>
                    <div style={{ fontWeight: 900, marginBottom: 4, color: THEME.text }}>Anteprima:</div>
                    <div style={{ color: THEME.muted }}>
                      {(() => {
                        const template = messageTemplates.find(t => t.id === selectedTemplateId);
                        if (!template) return "Nessun template selezionato";
                        
                        return template.template
                          .replace(/{nome}/g, selectedEvent.patient_name)
                          .replace(/{data_relativa}/g, formatDMY(selectedEvent.start))
                          .replace(/{ora}/g, fmtTime(selectedEvent.start))
                          .replace(/{luogo}/g, selectedEvent.location === "domicile" 
                            ? (selectedEvent.domicile_address || "a domicilio") 
                            : (selectedEvent.clinic_site || DEFAULT_CLINIC_SITE));
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <div style={labelStyle()}>Importo</div>
              <input value={editAmount} onChange={(e) => setEditAmount(e.target.value)} inputMode="decimal" placeholder="es. 35" style={inputStyle()} />
            </div>

            <div>
              <div style={labelStyle()}>Note</div>
              <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={3} style={{ ...inputStyle(), resize: "vertical" }} />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => sendWhatsApp(selectedEvent)}
                disabled={!normalizePhone(selectedEvent.patient_phone)}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 12,
                  border: `2px solid ${THEME.green}`,
                  background: "#f0fdf4",
                  color: THEME.green,
                  fontWeight: 900,
                  cursor: normalizePhone(selectedEvent.patient_phone) ? "pointer" : "not-allowed",
                  opacity: normalizePhone(selectedEvent.patient_phone) ? 1 : 0.5,
                }}
              >
                💬 WhatsApp
              </button>

              <button
                onClick={saveEvent}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 12,
                  border: `2px solid ${THEME.blueDark}`,
                  background: THEME.blue,
                  color: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Salva
              </button>
            </div>

            <button
              onClick={deleteEvent}
              style={{
                padding: 14,
                borderRadius: 12,
                border: `2px solid ${THEME.red}`,
                background: "#fff",
                color: THEME.red,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Elimina appuntamento
            </button>

            <Link
              href={selectedEvent.patient_id ? `/patients/${selectedEvent.patient_id}` : "#"}
              style={{
                padding: 14,
                borderRadius: 12,
                border: `1px solid ${THEME.border}`,
                background: THEME.panelSoft,
                color: THEME.text,
                fontWeight: 900,
                textDecoration: "none",
                textAlign: "center",
                opacity: selectedEvent.patient_id ? 1 : 0.5,
                pointerEvents: selectedEvent.patient_id ? "auto" : "none",
              }}
            >
              Scheda paziente
            </Link>
          </div>
        </Modal>
      )}

      {/* CREATE MODAL */}
      {createOpen && (
        <Modal onClose={() => setCreateOpen(false)}>
          <HeaderRow title="Nuovo appuntamento" subtitle={formatDMY(new Date(`${createDate}T00:00:00`))} onClose={() => setCreateOpen(false)} />

          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={labelStyle()}>Paziente (cerca)</div>
              <input
                value={patientQuery}
                onChange={(e) => {
                  setPatientQuery(e.target.value);
                  setSelectedPatient(null);
                }}
                placeholder="Scrivi nome/cognome…"
                style={inputStyle()}
              />

              {selectedPatient && (
                <div style={{ marginTop: 8, padding: 10, borderRadius: 12, border: `1px solid ${THEME.border}`, background: THEME.panelSoft, fontWeight: 900 }}>
                  ✅ {`${selectedPatient.first_name ?? ""} ${selectedPatient.last_name ?? ""}`.trim()}{" "}
                  <span style={{ color: THEME.muted, fontWeight: 900, marginLeft: 8 }}>{selectedPatient.phone ?? ""}</span>
                </div>
              )}

              {!selectedPatient && (patientLoading || patientResults.length > 0) && (
                <div style={{ marginTop: 8, border: `1px solid ${THEME.border}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                  {patientLoading && <div style={{ padding: 10, fontWeight: 900, color: THEME.muted }}>Ricerca…</div>}
                  {!patientLoading &&
                    patientResults.map((p) => {
                      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Paziente";
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSelectedPatient(p);
                            setPatientQuery(name);
                            setPatientResults([]);
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: 10,
                            border: "none",
                            borderBottom: `1px solid ${THEME.border}`,
                            background: "#fff",
                            cursor: "pointer",
                            fontWeight: 900,
                          }}
                        >
                          {name} <span style={{ color: THEME.muted, fontWeight: 900 }}>— {p.phone ?? "no tel"}</span>
                        </button>
                      );
                    })}
                </div>
              )}

              <div style={{ marginTop: 6, fontSize: 12, color: THEME.muted, fontWeight: 900 }}>Minimo 2 caratteri per la ricerca</div>
            </div>

            <div style={{ padding: 12, borderRadius: 12, border: `1px dashed ${THEME.borderSoft}`, background: "#fff" }}>
              <div style={{ fontWeight: 900, color: THEME.text, marginBottom: 8 }}>Paziente rapido</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={labelStyle()}>Nome</div>
                  <input value={quickFirstName} onChange={(e) => setQuickFirstName(e.target.value)} style={inputStyle()} />
                </div>
                <div>
                  <div style={labelStyle()}>Cognome</div>
                  <input value={quickLastName} onChange={(e) => setQuickLastName(e.target.value)} style={inputStyle()} />
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={labelStyle()}>Telefono (opz.)</div>
                <input value={quickPhone} onChange={(e) => setQuickPhone(e.target.value)} style={inputStyle()} />
              </div>

              <button
                onClick={createQuickPatient}
                style={{
                  marginTop: 10,
                  width: "100%",
                  padding: 12,
                  borderRadius: 12,
                  border: `2px solid ${THEME.blueDark}`,
                  background: THEME.blue,
                  color: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Crea e seleziona paziente
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={labelStyle()}>Data</div>
                <input type="date" value={createDate} onChange={(e) => setCreateDate(e.target.value)} style={inputStyle()} />
              </div>
              <div>
                <div style={labelStyle()}>Ora</div>
                <input type="time" value={createTime} onChange={(e) => setCreateTime(e.target.value)} style={inputStyle()} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={labelStyle()}>Durata (min)</div>
                <input type="number" min={5} step={5} value={createDuration} onChange={(e) => setCreateDuration(Number(e.target.value))} style={inputStyle()} />
              </div>
              <div>
                <div style={labelStyle()}>Stato</div>
                <select value={createStatus} onChange={(e) => setCreateStatus(e.target.value as Status)} style={inputStyle()}>
                  <option value="booked">Prenotato</option>
                  <option value="confirmed">Confermato</option>
                  <option value="done">Eseguito</option>
                  <option value="not_paid">Non pagata</option>
                  <option value="cancelled">Annullato</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={labelStyle()}>Luogo</div>
                <select value={createLocation} onChange={(e) => setCreateLocation(e.target.value as LocationType)} style={inputStyle()}>
                  <option value="studio">Studio</option>
                  <option value="domicile">Domicilio</option>
                </select>
              </div>
              <div>
                <div style={labelStyle()}>Importo</div>
                <input value={createAmount} onChange={(e) => setCreateAmount(e.target.value)} inputMode="decimal" placeholder="es. 35" style={inputStyle()} />
              </div>
            </div>

            {createLocation === "studio" && (
              <div>
                <div style={labelStyle()}>Sede studio</div>
                <input value={createClinicSite} onChange={(e) => setCreateClinicSite(e.target.value)} style={inputStyle()} />
              </div>
            )}

            {createLocation === "domicile" && (
              <div>
                <div style={labelStyle()}>Indirizzo domicilio</div>
                <input value={createDomicileAddress} onChange={(e) => setCreateDomicileAddress(e.target.value)} style={inputStyle()} />
              </div>
            )}

            <div>
              <div style={labelStyle()}>Note</div>
              <textarea value={createNote} onChange={(e) => setCreateNote(e.target.value)} rows={3} style={{ ...inputStyle(), resize: "vertical" }} />
            </div>

            <button
              onClick={createAppointment}
              style={{
                width: "100%",
                padding: 14,
                borderRadius: 12,
                border: `2px solid ${THEME.blueDark}`,
                background: THEME.blue,
                color: "#fff",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Crea appuntamento
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- UI helpers ---------- */

function navBtnStyle() {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: `1px solid ${THEME.border}`,
    background: THEME.panelSoft,
    color: THEME.text,
    fontWeight: 900,
    cursor: "pointer",
  } as const;
}

function todayBtnStyle() {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: `2px solid ${THEME.blueDark}`,
    background: THEME.blue,
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  } as const;
}

function labelStyle() {
  return { fontSize: 12, color: THEME.muted, fontWeight: 900, marginBottom: 6 } as const;
}

function inputStyle() {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: `1px solid ${THEME.border}`,
    background: "#fff",
    fontWeight: 900,
    color: THEME.text,
    outline: "none",
    boxSizing: "border-box",
  } as const;
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: THEME.panelBg, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 900 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 16, fontWeight: 1000, color }}>{value}</div>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,6,23,0.45)",
        zIndex: 999,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: 14,
      }}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          background: THEME.panelBg,
          borderRadius: 14,
          border: `1px solid ${THEME.border}`,
          padding: 14,
          boxShadow: "0 18px 50px rgba(0,0,0,0.25)",
          margin: "14px 0",
          maxHeight: "calc(100vh - 28px)",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function HeaderRow({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 1000, color: THEME.text, lineHeight: 1.1 }}>{title}</div>
        {subtitle && <div style={{ marginTop: 4, fontSize: 12, color: THEME.muted, fontWeight: 900 }}>{subtitle}</div>}
      </div>
      <button
        onClick={onClose}
        style={{
          border: `1px solid ${THEME.border}`,
          background: THEME.panelSoft,
          color: THEME.text,
          borderRadius: 12,
          padding: "8px 10px",
          fontWeight: 1000,
          cursor: "pointer",
        }}
        aria-label="Chiudi"
        title="Chiudi"
      >
        ✕
      </button>
    </div>
  );
}