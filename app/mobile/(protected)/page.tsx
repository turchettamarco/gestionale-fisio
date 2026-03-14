"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "booked" | "confirmed" | "done" | "cancelled" | "not_paid";
type LocationType = "studio" | "domicile";

type Appointment = {
  id: string;
  patient_id: string | null;
  start_at: string;
  status: Status;
  amount: number | null;
  is_paid: boolean;
  treatment_type: string | null;
  location: LocationType | null;
  clinic_site: string | null;
  domicile_address: string | null;
  whatsapp_sent_at: string | null;
  patients: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  } | null;
};

type MonthStats = { sessions: number; revenue: number; unpaid: number; };
type SuggestedPatient = { id: string; name: string; phone: string | null; lastVisit: string | null; };

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
    case "done":      return "rgba(22,163,74,0.09)";
    case "confirmed": return "rgba(37,99,235,0.07)";
    case "not_paid":  return "rgba(249,115,22,0.09)";
    case "cancelled": return "rgba(148,163,184,0.07)";
    default:          return "rgba(220,38,38,0.07)";
  }
}
function statusLabel(s: Status): string {
  switch (s) {
    case "confirmed": return "Confermato";
    case "done":      return "Eseguito";
    case "not_paid":  return "Non pagata";
    case "cancelled": return "Annullato";
    default:          return "Prenotato";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CLINIC_ADDRESSES: Record<string, string> = {
  "Studio Pontecorvo": "Pontecorvo, Via Galileo Galilei 5, dietro il Bar Principe",
};

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
  let c = phone.replace(/[\s\(\)\-\.]/g, "");
  if (c.startsWith("+")) c = c.substring(1);
  if (c.startsWith("0")) c = "39" + c.substring(1);
  if (!c.startsWith("39") && c.length <= 10) c = "39" + c;
  return c;
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
function sumPaid(appts: Appointment[]) {
  return appts.reduce((s, a) => s + (a.is_paid && typeof a.amount === "number" ? a.amount : 0), 0);
}
function sumDaIncassare(appts: Appointment[]) {
  return appts.filter(a => !a.is_paid && a.status !== "cancelled")
    .reduce((s, a) => s + (typeof a.amount === "number" ? a.amount : 0), 0);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MobileHomePage() {
  const router = useRouter();

  const nowRef   = useRef<Date>(new Date());
  const todayYMD = useMemo(() => toYMD(new Date()), []);
  const [dateYMD, setDateYMD] = useState(todayYMD);

  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  const [todayAppts,      setTodayAppts]      = useState<Appointment[]>([]);
  const [nextAppts,       setNextAppts]       = useState<Appointment[]>([]);
  const [patientCount,    setPatientCount]    = useState<number | null>(null);
  const [monthStats,      setMonthStats]      = useState<MonthStats | null>(null);
  const [suggestedPats,   setSuggestedPats]   = useState<SuggestedPatient[]>([]);

  // Azioni in corso
  const [markingDone, setMarkingDone] = useState<string | null>(null);
  const [incassando,  setIncassando]  = useState<string | null>(null);
  const [sendingWA,   setSendingWA]   = useState<string | null>(null);

  // Modal modifica appuntamento
  const [editAppt,    setEditAppt]    = useState<Appointment | null>(null);
  const [editStatus,  setEditStatus]  = useState<Status>("booked");
  const [editAmount,  setEditAmount]  = useState("");
  const [editDate,    setEditDate]    = useState("");
  const [editTime,    setEditTime]    = useState("");
  const [editSaving,  setEditSaving]  = useState(false);

  const [userEmail,    setUserEmail]    = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Pull-to-refresh — FIX: nessun setState nel touchMove
  const touchStartY  = useRef(0);
  const pullY        = useRef(0);
  const isScrolling  = useRef(false);
  const [pulling,    setPulling]  = useState(false);
  const [showPull,   setShowPull] = useState(false);
  const PULL_THRESHOLD = 72;

  // Swipe giorno
  const swipeX = useRef<number | null>(null);
  const swipeY = useRef<number | null>(null);

  // Clock
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

  // ─── Touch handlers ───────────────────────────────────────────────────────

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

    // Determina al primo movimento significativo se è scroll o gesto orizzontale
    if (!isScrolling.current && (Math.abs(dy) > 6 || Math.abs(dx) > 6)) {
      isScrolling.current = Math.abs(dy) > Math.abs(dx);
    }

    // Pull-to-refresh: solo se in cima alla pagina, gesto verso il basso, non scroll orizzontale
    const scrollTop = window.scrollY ?? document.documentElement.scrollTop ?? 0;
    if (scrollTop === 0 && dy > 0 && isScrolling.current) {
      pullY.current = dy;
      // Aggiorniamo lo state solo quando si attraversa la soglia, non ad ogni pixel
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

    // Swipe orizzontale — solo se NON era uno scroll verticale
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
      const SEL = `id,patient_id,start_at,status,amount,is_paid,
                   treatment_type,location,clinic_site,domicile_address,
                   whatsapp_sent_at,
                   patients:patient_id(first_name,last_name,phone)`;

      const [dayRes, weekRes, pcRes] = await Promise.all([
        supabase.from("appointments").select(SEL)
          .gte("start_at", `${dateYMD}T00:00:00`)
          .lt("start_at",  `${dateYMD}T23:59:59`)
          .order("start_at", { ascending: true }),
        supabase.from("appointments").select(SEL)
          .gt("start_at", new Date().toISOString())
          .lt("start_at", addDays(new Date(), 8).toISOString())
          .order("start_at", { ascending: true }),
        supabase.from("patients").select("*", { count: "exact", head: true }),
      ]);

      if (dayRes.error)  throw dayRes.error;
      if (weekRes.error) throw weekRes.error;

      const map = (a: any): Appointment => {
        const p = Array.isArray(a.patients) ? a.patients[0] : a.patients;
        return {
          id: a.id, patient_id: a.patient_id ?? null, start_at: a.start_at,
          status: a.status as Status, amount: a.amount ?? null, is_paid: a.is_paid ?? false,
          treatment_type: a.treatment_type ?? null, location: a.location ?? null,
          clinic_site: a.clinic_site ?? null, domicile_address: a.domicile_address ?? null,
          whatsapp_sent_at: a.whatsapp_sent_at ?? null, patients: p ?? null,
        };
      };

      setTodayAppts((dayRes.data  ?? []).map(map));
      setNextAppts( (weekRes.data ?? []).map(map));
      if (!pcRes.error) setPatientCount(pcRes.count ?? null);

      // ── Statistiche mese corrente ──
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd   = new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59).toISOString();
      const mRes = await supabase.from("appointments")
        .select("status,amount,is_paid")
        .gte("start_at", monthStart).lte("start_at", monthEnd).neq("status","cancelled");
      if (!mRes.error && mRes.data) {
        const md = mRes.data as { status: string; amount: number|null; is_paid: boolean }[];
        setMonthStats({
          sessions: md.length,
          revenue:  md.filter(r => r.is_paid).reduce((s,r) => s+(r.amount??0), 0),
          // FIX: "da incassare" = sedute eseguite non pagate + sedute marcate not_paid
          unpaid:   md.filter(r => (r.status === "done" || r.status === "not_paid") && !r.is_paid).reduce((s,r) => s+(r.amount??0), 0),
        });
      }

      // ── Pazienti senza appuntamenti futuri (candidati per richiamare) ──
      // Prendo i 20 pazienti con ultima seduta più recente, escludo chi ha già un prossimo appt
      const futurePatientIds = new Set(
        (weekRes.data ?? []).map((a: any) => a.patient_id).filter(Boolean)
      );
      const pastRes = await supabase.from("appointments")
        .select("patient_id,start_at,patients:patient_id(first_name,last_name,phone)")
        .eq("status","done")
        .order("start_at", { ascending: false })
        .limit(60);
      if (!pastRes.error && pastRes.data) {
        const seen = new Set<string>();
        const suggestions: SuggestedPatient[] = [];
        for (const a of pastRes.data as any[]) {
          if (!a.patient_id || seen.has(a.patient_id)) continue;
          if (futurePatientIds.has(a.patient_id)) continue;
          seen.add(a.patient_id);
          const p = Array.isArray(a.patients) ? a.patients[0] : a.patients;
          const name = p ? `${p.last_name??""} ${p.first_name??""}`.trim() : "Paziente";
          suggestions.push({ id: a.patient_id, name: name||"Paziente",
            phone: p?.phone ?? null, lastVisit: a.start_at });
          if (suggestions.length >= 4) break;
        }
        setSuggestedPats(suggestions);
      }
    } catch (e: any) {
      setError(e?.message ?? "Errore imprevisto");
      setTodayAppts([]); setNextAppts([]);
    } finally { setLoading(false); }
  }

  // ─── Azioni rapide ────────────────────────────────────────────────────────

  async function handleMarkDone(appt: Appointment) {
    if (markingDone) return;
    setMarkingDone(appt.id);
    const { error } = await supabase.from("appointments")
      .update({ status: "done" }).eq("id", appt.id);
    if (!error)
      setTodayAppts(prev => prev.map(a =>
        a.id === appt.id ? { ...a, status: "done" as Status } : a
      ));
    setMarkingDone(null);
  }

  async function handleIncassa(appt: Appointment) {
    if (incassando) return;
    setIncassando(appt.id);
    const { error } = await supabase.from("appointments")
      .update({ is_paid: true, status: "done" }).eq("id", appt.id);
    if (!error)
      setTodayAppts(prev => prev.map(a =>
        a.id === appt.id ? { ...a, is_paid: true, status: "done" as Status } : a
      ));
    setIncassando(null);
  }

  const sendReminder = useCallback((appt: Appointment) => {
    const phone = appt.patients?.phone;
    if (!phone) { alert("Nessun numero registrato."); return; }

    // Costruisce il messaggio SINCRONO — nessun await prima di aprire
    const luogo = appt.location === "studio"
      ? (CLINIC_ADDRESSES[appt.clinic_site ?? ""] || appt.clinic_site || "Studio")
      : `Presso il suo domicilio (${appt.domicile_address ?? ""})`;

    const message =
      `Buongiorno ${(appt.patients?.first_name ?? "").trim() || "gentile paziente"},\n\n` +
      `Le ricordiamo il suo appuntamento di ${formatDateRelative(new Date(appt.start_at))} ` +
      `alle ore ⏰ ${fmtTime(appt.start_at)}.\n\n` +
      `📍 ${luogo}\n\n` +
      `Cordiali saluti,\nDr. Marco Turchetta\nFisioterapia e Osteopatia`;

    // Apre WA Web immediatamente — dentro il gestore click sincrono
    const clean = formatPhoneForWA(phone);
    const url   = `https://web.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");

    // Aggiorna DB in background (non blocca l'apertura)
    const nowIso = new Date().toISOString();
    setSendingWA(appt.id);
    supabase.from("appointments")
      .update({ whatsapp_sent_at: nowIso, whatsapp_sent: true }).eq("id", appt.id)
      .then(() => {
        setTodayAppts(prev => prev.map(a =>
          a.id === appt.id ? { ...a, whatsapp_sent_at: nowIso } : a
        ));
        setSendingWA(null);
      });
  }, []);

  async function handleLogout() {
    try { await supabase.auth.signOut(); } finally { window.location.href = "/login"; }
  }

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
      const origDuration = new Date(editAppt.start_at);
      // mantieni la durata originale (1h default se non calcolabile)
      const durMs = 60 * 60 * 1000;
      const newEnd = new Date(newStart.getTime() + durMs);

      const updates: Record<string, unknown> = {
        status:   editStatus,
        start_at: newStart.toISOString(),
        end_at:   newEnd.toISOString(),
      };
      if (editAmount !== "") updates.amount = parseFloat(editAmount) || 0;

      const { error } = await supabase.from("appointments")
        .update(updates).eq("id", editAppt.id);
      if (error) throw error;

      // Aggiorna lista locale
      const updated: Appointment = {
        ...editAppt,
        status:   editStatus,
        start_at: newStart.toISOString(),
        amount:   editAmount !== "" ? parseFloat(editAmount) || 0 : editAppt.amount,
      };
      setTodayAppts(prev => prev.map(a => a.id === editAppt.id ? updated : a));
      setNextAppts( prev => prev.map(a => a.id === editAppt.id ? updated : a));
      setEditAppt(null);
    } catch (e: any) {
      alert(e?.message ?? "Errore nel salvataggio");
    } finally {
      setEditSaving(false);
    }
  }

  // ─── Derived ──────────────────────────────────────────────────────────────

  const nowISO  = nowRef.current.toISOString();
  const isToday = dateYMD === todayYMD;
  const isPast  = dateYMD < todayYMD;

  const totalActive = useMemo(
    () => todayAppts.filter(a => a.status !== "cancelled").length,
    [todayAppts]
  );
  const completate = useMemo(() => {
    if (isToday) return todayAppts.filter(a => a.start_at < nowISO && a.status !== "cancelled").length;
    if (isPast)  return todayAppts.filter(a => a.status !== "cancelled").length;
    return 0;
  }, [todayAppts, nowISO, isToday, isPast, tick]); // eslint-disable-line

  const incasso     = useMemo(() => sumPaid(todayAppts),        [todayAppts]);
  const daIncassare = useMemo(() => sumDaIncassare(todayAppts), [todayAppts]);

  const nextFive = useMemo(() =>
    nextAppts.filter(a => a.start_at >= nowISO && a.status !== "cancelled").slice(0, 5),
  [nextAppts, nowISO, tick]); // eslint-disable-line

  const kpiNext = nextFive[0] ?? null;

  // Slot liberi nella giornata (ore 8-20, slot da 1h, esclusi quelli occupati)
  const freeSlots = useMemo(() => {
    const WORK_START = 8; const WORK_END = 20;
    const slots: string[] = [];
    for (let h = WORK_START; h < WORK_END; h++) {
      const slotISO = `${dateYMD}T${pad2(h)}:00:00`;
      const slotEnd  = `${dateYMD}T${pad2(h+1)}:00:00`;
      const occupied = todayAppts.some(a =>
        a.status !== "cancelled" && a.start_at < slotEnd && a.start_at >= slotISO
      );
      if (!occupied) slots.push(`${pad2(h)}:00`);
    }
    return slots;
  }, [todayAppts, dateYMD]);

  const monthLabel = useMemo(() => {
    const mm = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
    return mm[new Date().getMonth()];
  }, []);

  // Striscia settimanale
  const weekStrip = useMemo(() => {
    const days = [];
    const base = new Date(todayYMD + "T00:00:00");
    for (let i = 0; i < 7; i++) {
      const d = addDays(base, i);
      const ymd = toYMD(d);
      const cnt = nextAppts.filter(a =>
        a.start_at.startsWith(ymd) && a.status !== "cancelled"
      ).length + (i === 0 ? todayAppts.filter(a => a.status !== "cancelled").length : 0);
      days.push({ ymd, label: ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"][d.getDay()], day: d.getDate(), cnt });
    }
    return days;
  }, [nextAppts, todayAppts, todayYMD]);

  const headerDateLabel = useMemo(() => {
    const d = new Date(`${dateYMD}T00:00:00`);
    const gg = ["Dom","Lun","Mar","Mer","Gio","Ven","Sab"];
    const mm = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
    return `${gg[d.getDay()]} ${d.getDate()} ${mm[d.getMonth()]}`;
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

  // ─── Style atoms ──────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
    borderRadius: 14, boxShadow: "0 2px 8px rgba(15,23,42,0.06)",
  };

  function btnGradient(extra?: React.CSSProperties): React.CSSProperties {
    return {
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      padding: "9px 16px", borderRadius: 10, border: "none",
      background: THEME.gradient, color: "#fff",
      fontWeight: 700, fontSize: 13, cursor: "pointer",
      boxShadow: "0 2px 8px rgba(13,148,136,0.25)", ...extra,
    };
  }
  function btnOutline(extra?: React.CSSProperties): React.CSSProperties {
    return {
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      padding: "8px 14px", borderRadius: 10,
      border: `1.5px solid ${THEME.border}`,
      background: THEME.panelBg, color: THEME.text,
      fontWeight: 600, fontSize: 13, cursor: "pointer",
      textDecoration: "none", ...extra,
    };
  }
  function btnSoft(extra?: React.CSSProperties): React.CSSProperties {
    return {
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      padding: "8px 14px", borderRadius: 10, border: "none",
      background: "rgba(37,99,235,0.09)", color: THEME.blue,
      fontWeight: 700, fontSize: 13, cursor: "pointer", ...extra,
    };
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100dvh", background: THEME.appBg, fontFamily: "-apple-system,'SF Pro Text',Inter,sans-serif" }}>
      <style>{`
        html, body {
          overscroll-behavior-y: none;
          -webkit-overflow-scrolling: touch;
        }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>

      {/* ━━━ NAVBAR ━━━ */}
      <header style={{
        position: "sticky", top: 0, zIndex: 30,
        background: THEME.gradient,
        paddingLeft: 14, paddingRight: 14,
        paddingTop: "env(safe-area-inset-top, 0px)",
        height: "calc(54px + env(safe-area-inset-top, 0px))",
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        paddingBottom: 8,
        boxShadow: "0 2px 12px rgba(13,148,136,0.18)", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: "rgba(255,255,255,0.2)", border: "1.5px solid rgba(255,255,255,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 800, fontSize: 13,
          }}>F</div>
          <span style={{ fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: 0.3, textTransform: "uppercase" }}>
            Fisio<span style={{ fontWeight: 700 }}>Hub</span>
          </span>
        </div>

        {/* KPI chips */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {!loading && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff",
              background: "rgba(255,255,255,0.2)", padding: "4px 9px",
              borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", whiteSpace: "nowrap" }}>
              ✓ {completate}/{totalActive}
            </span>
          )}
          {!loading && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff",
              background: "rgba(255,255,255,0.2)", padding: "4px 9px",
              borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", whiteSpace: "nowrap" }}>
              € {incasso.toFixed(0)}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          <button onClick={loadAll} aria-label="Aggiorna" style={{
            width: 30, height: 30, borderRadius: 7,
            border: "1.5px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.15)",
            color: "#fff", cursor: "pointer", fontSize: 15,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>↺</button>
          <div ref={userMenuRef} style={{ position: "relative" }}>
            <button onClick={() => setUserMenuOpen(v => !v)} style={{
              width: 30, height: 30, borderRadius: 7,
              border: "1.5px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.2)",
              color: "#fff", fontWeight: 800, fontSize: 11, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
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
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}>
        {[
          { href: "/mobile",          label: "Home",       icon: "⌂",  active: true },
          { href: "/mobile/calendar", label: "Calendario", icon: "▦" },
          { href: "/mobile/patients", label: "Pazienti",   icon: "◉" },
          { href: "/mobile/reports",  label: "Report",     icon: "◈" },
        ].map(item => (
          <Link key={item.href} href={item.href} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", padding: "10px 4px 9px", textDecoration: "none",
            gap: 3, position: "relative",
          }}>
            <span style={{ fontSize: 18, lineHeight: 1,
              ...((item as any).active
                ? { background: THEME.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }
                : { color: THEME.muted }) }}>
              {item.icon}
            </span>
            <span style={{ fontSize: 10, fontWeight: (item as any).active ? 700 : 600,
              color: (item as any).active ? THEME.blue : THEME.muted }}>
              {item.label}
            </span>
            {(item as any).active && (
              <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                width: 28, height: 2.5, borderRadius: 999, background: THEME.gradient }} />
            )}
          </Link>
        ))}
      </nav>

      {/* ━━━ FAB ━━━ */}
      <button
        onClick={() => router.push(`/mobile/calendar?date=${dateYMD}&new=1`)}
        aria-label="Nuovo appuntamento"
        style={{
          position: "fixed", bottom: "calc(max(env(safe-area-inset-bottom, 0px), 8px) + 60px)", right: 18,
          zIndex: 40, width: 52, height: 52, borderRadius: "50%",
          background: THEME.gradient, color: "#fff", border: "none", cursor: "pointer",
          fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 20px rgba(13,148,136,0.40)",
        }}
      >+</button>

      {/* ━━━ CONTENUTO ━━━ */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ padding: 14, paddingBottom: "calc(max(env(safe-area-inset-bottom, 0px), 8px) + 80px)" }}
      >
        {/* Pull-to-refresh */}
        {(showPull || pulling) && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: 36, color: THEME.blue, fontWeight: 700, fontSize: 12,
          }}>
            {pulling ? "↺ Aggiornamento…" : "↓ Rilascia per aggiornare"}
          </div>
        )}

        {/* ── Navigazione data ── */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <button onClick={() => shiftDay(-1)}
            style={btnOutline({ padding: "9px 14px", fontSize: 18, flexShrink: 0 })}>‹</button>

          <button onClick={() => setDateYMD(todayYMD)} style={{
            flex: 1, padding: "9px 8px", borderRadius: 10, fontSize: 13,
            fontWeight: 700, cursor: "pointer", textAlign: "center",
            border: isToday ? `2px solid ${THEME.blue}` : `1.5px solid ${THEME.border}`,
            background: isToday ? "rgba(37,99,235,0.08)" : THEME.panelBg,
            color: isToday ? THEME.blue : THEME.text,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {isToday ? "Oggi" : headerDateLabel}
          </button>

          <button onClick={() => shiftDay(1)}
            style={btnOutline({ padding: "9px 14px", fontSize: 18, flexShrink: 0 })}>›</button>

          <button onClick={() => router.push(`/mobile/calendar?date=${dateYMD}`)}
            style={btnGradient({ flexShrink: 0, padding: "9px 14px" })}>📅</button>
        </div>

        {/* ── Striscia settimanale ── */}
        <div style={{ ...card, padding: "8px 10px", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 2 }}>
            {weekStrip.map(d => {
              const sel = d.ymd === dateYMD;
              const tod = d.ymd === todayYMD;
              return (
                <button key={d.ymd} onClick={() => setDateYMD(d.ymd)} style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                  gap: 3, padding: "5px 2px", borderRadius: 8, border: "none",
                  background: sel ? THEME.gradient : "transparent", cursor: "pointer",
                }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: sel ? "rgba(255,255,255,0.75)" : THEME.muted }}>
                    {d.label}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1,
                    color: sel ? "#fff" : tod ? THEME.blue : THEME.text }}>
                    {d.day}
                  </span>
                  <div style={{ width: 5, height: 5, borderRadius: 99,
                    background: d.cnt > 0
                      ? (sel ? "rgba(255,255,255,0.8)" : THEME.blue)
                      : "transparent" }} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Errore */}
        {error && (
          <div style={{ marginBottom: 10, padding: 12, borderRadius: 10,
            border: "1.5px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.06)",
            color: "#7f1d1d", fontWeight: 600, fontSize: 13 }}>⚠️ {error}</div>
        )}

        {/* ── KPI card ── */}
        <div style={{ ...card, padding: 16, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textSoft }}>Riepilogo</div>
              <div style={{ marginTop: 3, fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                {loading ? "—" : `${totalActive} sedute`}
                {patientCount !== null ? ` · ${patientCount} pazienti` : ""}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: THEME.muted, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: 0.4 }}>Incassato</div>
              <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1,
                color: loading ? THEME.muted : THEME.green }}>
                {loading ? "—" : `€${incasso.toFixed(0)}`}
              </div>
              {!loading && daIncassare > 0 && (
                <div style={{ fontSize: 11, fontWeight: 700, color: THEME.amber, marginTop: 2 }}>
                  €{daIncassare.toFixed(0)} da incassare
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {!loading && totalActive > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>Sedute completate</span>
                <span style={{ fontSize: 12, fontWeight: 800,
                  color: completate === totalActive ? THEME.green : THEME.blue }}>
                  {completate}/{totalActive}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: THEME.border, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 999,
                  width: `${Math.round((completate / totalActive) * 100)}%`,
                  background: completate === totalActive ? THEME.green : THEME.gradient,
                  transition: "width 0.5s ease",
                }} />
              </div>
            </div>
          )}

          {/* Prossima seduta */}
          {!loading && kpiNext && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 10,
              border: `1.5px solid rgba(37,99,235,0.2)`, background: "rgba(37,99,235,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: THEME.blue, marginBottom: 3,
                    textTransform: "uppercase", letterSpacing: 0.4 }}>Prossima seduta</div>
                  <div style={{ fontWeight: 700, color: THEME.text, fontSize: 14,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {fmtTime(kpiNext.start_at)} · {fullName(kpiNext.patients)}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                    {kpiNext.treatment_type ?? "Seduta"}
                    {typeof kpiNext.amount === "number" && kpiNext.amount > 0 ? ` · €${kpiNext.amount}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => kpiNext.patient_id && router.push(`/mobile/patients/${kpiNext.patient_id}`)}
                  style={btnGradient({ flexShrink: 0, fontSize: 12, padding: "8px 14px" })}
                >Apri →</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Agenda del giorno ── */}
        <div style={{ ...card, padding: 16, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "baseline", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textSoft }}>
                Agenda del giorno
              </div>
              <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 600, marginTop: 2 }}>
                {headerDateLabel} · {todayAppts.length} appuntamenti
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: "14px 0", color: THEME.muted, fontWeight: 600, fontSize: 13 }}>
              Caricamento…
            </div>
          ) : todayAppts.length === 0 ? (
            <div style={{ padding: 20, borderRadius: 10, border: `1.5px dashed ${THEME.border}`,
              textAlign: "center" }}>
              <div style={{ color: THEME.muted, fontWeight: 600, fontSize: 13, marginBottom: 12 }}>
                Nessun appuntamento in questa data.
              </div>
              <button
                onClick={() => router.push(`/mobile/calendar?date=${dateYMD}&new=1`)}
                style={btnGradient({ fontSize: 12, padding: "8px 16px" })}
              >+ Nuovo appuntamento</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {todayAppts.map(a => {
                const phone      = a.patients?.phone;
                const waSent     = !!a.whatsapp_sent_at;
                const isPastAppt = isToday && a.start_at < nowISO;
                const isDone     = a.status === "done";
                const isCancelled= a.status === "cancelled";
                const col        = statusColor(a.status);

                return (
                  <div key={a.id} style={{
                    borderRadius: 10,
                    border: `1.5px solid ${isPastAppt ? "transparent" : THEME.border}`,
                    background: isPastAppt ? THEME.panelSoft : statusBg(a.status),
                    padding: "11px 13px",
                    opacity: isPastAppt ? 0.65 : 1,
                    transition: "opacity 0.3s",
                    cursor: "pointer",
                  }}
                  onClick={() => openEdit(a)}
                  >

                    {/* Riga info: orario + nome + status */}
                    <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "flex-start", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: isPastAppt ? THEME.muted : THEME.text,
                          fontSize: 14, whiteSpace: "nowrap", overflow: "hidden",
                          textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 6 }}>
                          {fmtTime(a.start_at)} · {fullName(a.patients)}
                          {a.is_paid  && <span style={{ fontSize: 13, flexShrink: 0 }}>💰</span>}
                          {a.location === "domicile" && <span style={{ fontSize: 13, flexShrink: 0 }}>🏠</span>}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 12, color: THEME.muted, fontWeight: 600,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {a.treatment_type ?? "Seduta"}
                          {typeof a.amount === "number" && a.amount > 0 ? ` · €${a.amount}` : ""}
                          {isPastAppt && (
                            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700,
                              color: THEME.gray, textTransform: "uppercase" }}>· passato</span>
                          )}
                        </div>
                      </div>
                      <span style={{ padding: "4px 9px", borderRadius: 999,
                        fontWeight: 700, fontSize: 11, color: col,
                        background: THEME.panelBg, border: `1.5px solid ${col}`,
                        flexShrink: 0, whiteSpace: "nowrap",
                        opacity: isPastAppt ? 0.6 : 1 }}>
                        {statusLabel(a.status)}
                      </span>
                    </div>

                    {/* ── 3 AZIONI PRINCIPALI ── compatte, in linea */}
                    {!isCancelled && (
                      <div onClick={e => e.stopPropagation()} style={{ marginTop: 9, display: "flex", gap: 6, flexWrap: "wrap" }}>

                        {/* ✓ Eseguito */}
                        <button
                          onClick={() => !isDone && handleMarkDone(a)}
                          disabled={isDone || markingDone === a.id}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "6px 11px", borderRadius: 8, border: "none",
                            background: isDone
                              ? "rgba(22,163,74,0.13)"
                              : "rgba(22,163,74,0.08)",
                            color: THEME.green,
                            fontWeight: 700, fontSize: 12,
                            cursor: isDone ? "default" : "pointer",
                            opacity: markingDone === a.id ? 0.5 : 1,
                          }}
                        >
                          {isDone ? "✅" : "☑️"}
                          {markingDone === a.id ? "…" : isDone ? "Eseguito" : "Eseguito"}
                        </button>

                        {/* 💰 Incassa */}
                        <button
                          onClick={() => !a.is_paid && handleIncassa(a)}
                          disabled={a.is_paid || incassando === a.id}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "6px 11px", borderRadius: 8, border: "none",
                            background: a.is_paid
                              ? "rgba(22,163,74,0.13)"
                              : "rgba(249,115,22,0.09)",
                            color: a.is_paid ? THEME.green : THEME.amber,
                            fontWeight: 700, fontSize: 12,
                            cursor: a.is_paid ? "default" : "pointer",
                            opacity: incassando === a.id ? 0.5 : 1,
                          }}
                        >
                          💰 {incassando === a.id ? "…" : a.is_paid ? "Pagato" : "Incassa"}
                        </button>

                        {/* 💬 WA / Reinvia */}
                        {phone && (
                          <button
                            onClick={() => sendReminder(a)}
                            disabled={sendingWA === a.id}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              padding: "6px 11px", borderRadius: 8, border: "none",
                              background: waSent
                                ? "rgba(22,163,74,0.08)"
                                : "rgba(37,99,235,0.08)",
                              color: waSent ? THEME.green : THEME.blue,
                              fontWeight: 700, fontSize: 12, cursor: "pointer",
                              opacity: sendingWA === a.id ? 0.5 : 1,
                            }}
                            title={waSent
                              ? `Inviato il ${new Date(a.whatsapp_sent_at!).toLocaleDateString("it-IT")} — clicca per reinviare`
                              : "Invia promemoria WhatsApp"}
                          >
                            💬 {sendingWA === a.id ? "…" : waSent ? "Rinvia" : "WA"}
                          </button>
                        )}

                        {/* Scheda — solo icona, non compete */}
                        {a.patient_id && (
                          <button
                            onClick={() => router.push(`/mobile/patients/${a.patient_id}`)}
                            style={btnOutline({ fontSize: 12, padding: "6px 11px" })}
                          >📄 Scheda</button>
                        )}
                      </div>
                    )}

                    {/* Azioni annullato */}
                    {isCancelled && a.patient_id && (
                      <div onClick={e => e.stopPropagation()} style={{ marginTop: 8 }}>
                        <button
                          onClick={() => router.push(`/mobile/patients/${a.patient_id}`)}
                          style={btnOutline({ fontSize: 12, padding: "6px 11px" })}
                        >📄 Scheda</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Prossimi 7 giorni ── */}
        <div style={{ ...card, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "baseline", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textSoft }}>
                Prossimi appuntamenti
              </div>
              <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 600, marginTop: 2 }}>
                Prossimi 7 giorni · {nextFive.length} appuntamenti
              </div>
            </div>
            <button onClick={() => router.push(`/mobile/calendar?date=${dateYMD}`)}
              style={btnSoft({ fontSize: 12, padding: "7px 12px" })}>
              Vedi tutto →
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {nextFive.length === 0 ? (
              <div style={{ padding: 14, borderRadius: 10,
                border: `1.5px dashed ${THEME.border}`, color: THEME.muted,
                fontWeight: 600, fontSize: 13 }}>
                Nessun appuntamento imminente.
              </div>
            ) : nextFive.map(a => (
              <button key={a.id}
                onClick={() => a.patient_id
                  ? router.push(`/mobile/patients/${a.patient_id}`)
                  : router.push(`/mobile/calendar?date=${dateYMD}`)}
                style={{
                  width: "100%", textAlign: "left", cursor: "pointer",
                  borderRadius: 10, border: `1.5px solid ${THEME.border}`,
                  background: statusBg(a.status), padding: "10px 13px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 700, color: THEME.text, fontSize: 13,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    display: "flex", alignItems: "center", gap: 5 }}>
                    {formatDateRelative(new Date(a.start_at))} · {fmtTime(a.start_at)} · {fullName(a.patients)}
                    {a.is_paid && <span style={{ fontSize: 12, flexShrink: 0 }}>💰</span>}
                    {a.location === "domicile" && <span style={{ fontSize: 12, flexShrink: 0 }}>🏠</span>}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px",
                    borderRadius: 99, flexShrink: 0, whiteSpace: "nowrap",
                    color: statusColor(a.status),
                    background: THEME.panelBg, border: `1px solid ${statusColor(a.status)}30` }}>
                    {statusLabel(a.status)}
                  </span>
                </div>
                <div style={{ marginTop: 2, fontSize: 12, color: THEME.muted, fontWeight: 600,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.treatment_type ?? "Seduta"}
                  {typeof a.amount === "number" && a.amount > 0 ? ` · €${a.amount}` : ""}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ━━━ SLOT LIBERI + SUGGERIMENTI ━━━ */}
        {isToday && !loading && freeSlots.length > 0 && (
          <div style={{ ...card, padding: 16, marginTop: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textSoft, marginBottom: 4 }}>
              🕐 Slot liberi oggi
            </div>
            <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 600, marginBottom: 12 }}>
              {freeSlots.length} ore disponibili — considera di chiamare qualche paziente
            </div>

            {/* Slot liberi come pillole */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: suggestedPats.length > 0 ? 14 : 0 }}>
              {freeSlots.map(slot => (
                <button
                  key={slot}
                  onClick={() => router.push(`/mobile/calendar?date=${dateYMD}&new=1&time=${slot.replace(":","")}`)}
                  style={{
                    padding: "5px 12px", borderRadius: 99, fontSize: 12, fontWeight: 700,
                    border: `1.5px solid ${THEME.border}`, background: THEME.panelSoft,
                    color: THEME.muted, cursor: "pointer",
                  }}
                >
                  {slot}
                </button>
              ))}
            </div>

            {/* Pazienti suggeriti */}
            {suggestedPats.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted,
                  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                  Pazienti da richiamare
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {suggestedPats.map(p => {
                    const waPhone = p.phone ? formatPhoneForWA(p.phone) : null;
                    const daysSince = p.lastVisit
                      ? Math.round((Date.now() - new Date(p.lastVisit).getTime()) / 86400000)
                      : null;
                    return (
                      <div key={p.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        gap: 10, padding: "10px 12px", borderRadius: 10,
                        background: THEME.panelSoft, border: `1px solid ${THEME.border}`,
                      }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.name}
                          </div>
                          {daysSince !== null && (
                            <div style={{ fontSize: 11, color: THEME.muted, marginTop: 2 }}>
                              Ultima seduta {daysSince === 0 ? "oggi" : daysSince === 1 ? "ieri" : `${daysSince} giorni fa`}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          {p.phone && (
                            <a href={`tel:${p.phone}`} style={{
                              width: 32, height: 32, borderRadius: 8, fontSize: 15,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              background: "rgba(37,99,235,0.08)",
                              border: `1.5px solid rgba(37,99,235,0.2)`,
                              textDecoration: "none",
                            }}>📞</a>
                          )}
                          {waPhone && (
                            <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer"
                              style={{
                                width: 32, height: 32, borderRadius: 8, fontSize: 15,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                background: "rgba(22,163,74,0.08)",
                                border: `1.5px solid rgba(22,163,74,0.2)`,
                                textDecoration: "none",
                              }}>💬</a>
                          )}
                          <button
                            onClick={() => router.push(`/mobile/patients/${p.id}`)}
                            style={{
                              width: 32, height: 32, borderRadius: 8, fontSize: 13,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
                              cursor: "pointer",
                            }}>📄</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ━━━ ANDAMENTO MESE ━━━ */}
        {monthStats && !loading && (
          <div style={{ ...card, padding: 16, marginTop: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textSoft, marginBottom: 2 }}>
              📊 {monthLabel} — andamento mese
            </div>
            <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 12 }}>
              Tutte le sedute non annullate del mese
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Sedute",          value: String(monthStats.sessions),           color: THEME.blue  },
                { label: "Incassato",        value: `€${monthStats.revenue.toFixed(0)}`,  color: THEME.green },
                { label: "Eseguite non pagate", value: `€${monthStats.unpaid.toFixed(0)}`,color: monthStats.unpaid > 0 ? THEME.amber : THEME.muted },
              ].map(s => (
                <div key={s.label} style={{
                  textAlign: "center", padding: "12px 6px",
                  background: THEME.panelSoft, borderRadius: 10,
                  border: `1.5px solid ${THEME.border}`,
                }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1 }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: THEME.muted, marginTop: 4,
                    textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ━━━ MODAL MODIFICA APPUNTAMENTO ━━━ */}
      {editAppt && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setEditAppt(null)}
            style={{
              position: "fixed", inset: 0, zIndex: 50,
              background: "rgba(15,23,42,0.45)",
              backdropFilter: "blur(2px)",
            }}
          />
          {/* Sheet */}
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 51,
            background: THEME.panelBg,
            borderRadius: "18px 18px 0 0",
            padding: "20px 20px",
            paddingBottom: "max(24px, env(safe-area-inset-bottom, 24px))",
            boxShadow: "0 -8px 40px rgba(15,23,42,0.18)",
            maxHeight: "85vh",
            overflowY: "auto",
          }}>
            {/* Handle */}
            <div style={{ width: 36, height: 4, borderRadius: 99, background: THEME.border, margin: "0 auto 18px" }}/>

            <div style={{ fontSize: 15, fontWeight: 800, color: THEME.text, marginBottom: 4 }}>
              Modifica appuntamento
            </div>
            <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 20 }}>
              {fullName(editAppt.patients)} · {fmtTime(editAppt.start_at)}
            </div>

            {/* Status */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Stato</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["booked","confirmed","done","not_paid","cancelled"] as Status[]).map(s => (
                  <button key={s} onClick={() => setEditStatus(s)} style={{
                    padding: "7px 13px", borderRadius: 8, border: "none", cursor: "pointer",
                    fontWeight: 700, fontSize: 12,
                    background: editStatus === s ? statusColor(s) : "rgba(148,163,184,0.12)",
                    color: editStatus === s ? "#fff" : THEME.muted,
                  }}>
                    {statusLabel(s)}
                  </button>
                ))}
              </div>
            </div>

            {/* Data e ora */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Data</div>
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={{
                  width: "100%", padding: "10px 12px", borderRadius: 10,
                  border: `1.5px solid ${THEME.border}`, background: THEME.panelSoft,
                  fontSize: 14, fontWeight: 600, color: THEME.text, boxSizing: "border-box" as const,
                }}/>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Orario</div>
                <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} style={{
                  width: "100%", padding: "10px 12px", borderRadius: 10,
                  border: `1.5px solid ${THEME.border}`, background: THEME.panelSoft,
                  fontSize: 14, fontWeight: 600, color: THEME.text, boxSizing: "border-box" as const,
                }}/>
              </div>
            </div>

            {/* Importo */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Importo (€)</div>
              <input
                type="number" inputMode="decimal" value={editAmount}
                onChange={e => setEditAmount(e.target.value)}
                placeholder="es. 40"
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 10,
                  border: `1.5px solid ${THEME.border}`, background: THEME.panelSoft,
                  fontSize: 14, fontWeight: 600, color: THEME.text, boxSizing: "border-box" as const,
                }}
              />
            </div>

            {/* Bottoni */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setEditAppt(null)} style={{
                flex: 1, padding: "13px 0", borderRadius: 12,
                border: `1.5px solid ${THEME.border}`, background: THEME.panelSoft,
                color: THEME.muted, fontWeight: 700, fontSize: 14, cursor: "pointer",
              }}>Annulla</button>
              <button onClick={saveEdit} disabled={editSaving} style={{
                flex: 2, padding: "13px 0", borderRadius: 12, border: "none",
                background: THEME.gradient, color: "#fff",
                fontWeight: 700, fontSize: 14, cursor: "pointer",
                opacity: editSaving ? 0.6 : 1,
                boxShadow: "0 2px 8px rgba(13,148,136,0.25)",
              }}>
                {editSaving ? "Salvataggio…" : "Salva modifiche"}
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
