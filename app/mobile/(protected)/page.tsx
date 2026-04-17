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

// ─── Work hours for quick-add ─────────────────────────────────────────────────

const WORK_HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = 8 + Math.floor(i / 2);
  const m = (i % 2) * 30;
  if (h > 19) return null;
  return `${pad2(h)}:${pad2(m)}`;
}).filter(Boolean) as string[];

// ─── Component ────────────────────────────────────────────────────────────────

export default function MobileHomePage() {
  const router = useRouter();

  const nowRef   = useRef<Date>(new Date());
  const todayYMD = useMemo(() => toYMD(new Date()), []);
  const [dateYMD, setDateYMD] = useState(todayYMD);

  const [loading, setLoading]  = useState(true);
  const [error,   setError]    = useState("");

  const [dayAppts,  setDayAppts]  = useState<Appointment[]>([]);
  const [weekAppts, setWeekAppts] = useState<Appointment[]>([]);

  // Actions in progress
  const [markingDone, setMarkingDone] = useState<string | null>(null);
  const [incassando,  setIncassando]  = useState<string | null>(null);
  const [notPaying,   setNotPaying]   = useState<string | null>(null);
  const [sendingWA,   setSendingWA]   = useState<string | null>(null);

  // Expanded appointment card (tap to reveal actions)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Edit modal
  const [editAppt,   setEditAppt]   = useState<Appointment | null>(null);
  const [editStatus, setEditStatus] = useState<Status>("booked");
  const [editAmount, setEditAmount] = useState("");
  const [editDate,   setEditDate]   = useState("");
  const [editTime,   setEditTime]   = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Quick-add
  const [quickAddOpen,    setQuickAddOpen]    = useState(false);
  const [qaTime,          setQaTime]          = useState("");
  const [qaPatientSearch, setQaPatientSearch] = useState("");
  const [qaPatientId,     setQaPatientId]     = useState<string | null>(null);
  const [qaPatientLabel,  setQaPatientLabel]  = useState("");
  const [qaPatientPhone,  setQaPatientPhone]  = useState<string | null>(null);
  const [qaPatientFirst,  setQaPatientFirst]  = useState("");
  const [qaResults,       setQaResults]       = useState<PatientOption[]>([]);
  const [qaSearching,     setQaSearching]     = useState(false);
  const [qaSaving,        setQaSaving]        = useState(false);
  const qaSearchTimer     = useRef<ReturnType<typeof setTimeout>>(undefined);
  // New patient inline
  const [qaNewMode,   setQaNewMode]   = useState(false);
  const [qaNewFirst,  setQaNewFirst]  = useState("");
  const [qaNewLast,   setQaNewLast]   = useState("");
  const [qaNewPhone,  setQaNewPhone]  = useState("");

  // User
  const [userEmail,    setUserEmail]    = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

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
      const SEL = `id,patient_id,start_at,status,amount,is_paid,
                   treatment_type,location,clinic_site,domicile_address,
                   whatsapp_sent_at,
                   patients:patient_id(first_name,last_name,phone)`;

      const [dayRes, weekRes] = await Promise.all([
        supabase.from("appointments").select(SEL)
          .gte("start_at", `${dateYMD}T00:00:00`)
          .lt("start_at",  `${dateYMD}T23:59:59`)
          .order("start_at", { ascending: true }),
        supabase.from("appointments").select(SEL)
          .gte("start_at", `${todayYMD}T00:00:00`)
          .lt("start_at", addDays(new Date(), 8).toISOString())
          .order("start_at", { ascending: true }),
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

      setDayAppts((dayRes.data ?? []).map(map));
      setWeekAppts((weekRes.data ?? []).map(map));
    } catch (e: any) {
      setError(e?.message ?? "Errore imprevisto");
      setDayAppts([]); setWeekAppts([]);
    } finally { setLoading(false); }
  }

  // ─── Quick actions ────────────────────────────────────────────────────────

  async function handleMarkDone(appt: Appointment) {
    if (markingDone) return;
    setMarkingDone(appt.id);
    const { error } = await supabase.from("appointments")
      .update({ status: "done", is_paid: true }).eq("id", appt.id);
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
    const { error } = await supabase.from("appointments")
      .update({ is_paid: true, status: "done" }).eq("id", appt.id);
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
    const { error } = await supabase.from("appointments")
      .update({ status: "not_paid", is_paid: false }).eq("id", appt.id);
    if (!error) {
      const updater = (prev: Appointment[]) => prev.map(a =>
        a.id === appt.id ? { ...a, status: "not_paid" as Status, is_paid: false } : a
      );
      setDayAppts(updater);
      setWeekAppts(updater);
    }
    setNotPaying(null);
  }

  const sendReminder = useCallback((appt: Appointment) => {
    const phone = appt.patients?.phone;
    if (!phone) { alert("Nessun numero registrato."); return; }

    const luogo = appt.location === "studio"
      ? (CLINIC_ADDRESSES[appt.clinic_site ?? ""] || appt.clinic_site || "Studio")
      : `Presso il suo domicilio (${appt.domicile_address ?? ""})`;

    const message =
      `Buongiorno ${(appt.patients?.first_name ?? "").trim() || "gentile paziente"},\n\n` +
      `Le ricordiamo il suo appuntamento di ${formatDateRelative(new Date(appt.start_at))} ` +
      `alle ore ⏰ ${fmtTime(appt.start_at)}.\n\n` +
      `📍 ${luogo}\n\n` +
      `Cordiali saluti,\nDr. Marco Turchetta\nFisioterapia e Osteopatia`;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const clean = formatPhoneForWA(phone);
    const url = isMobile
      ? `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
      : `https://web.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");

    const nowIso = new Date().toISOString();
    setSendingWA(appt.id);
    supabase.from("appointments")
      .update({ whatsapp_sent_at: nowIso, whatsapp_sent: true }).eq("id", appt.id)
      .then(() => {
        const updater = (prev: Appointment[]) => prev.map(a =>
          a.id === appt.id ? { ...a, whatsapp_sent_at: nowIso } : a
        );
        setDayAppts(updater);
        setWeekAppts(updater);
        setSendingWA(null);
      });
  }, []);

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
      alert(e?.message ?? "Errore nel salvataggio");
    } finally {
      setEditSaving(false);
    }
  }

  // ─── Quick-add ────────────────────────────────────────────────────────────

  function openQuickAdd() {
    // Default to next available half-hour
    const now = new Date();
    const nextH = now.getHours();
    const nextM = now.getMinutes() < 30 ? 30 : 0;
    const h = nextM === 0 ? nextH + 1 : nextH;
    setQaTime(h >= 8 && h < 20 ? `${pad2(h)}:${pad2(nextM)}` : "09:00");
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
    setQaSaving(true);
    try {
      let patientId = qaPatientId;
      let patientPhone = qaPatientPhone;
      let patientFirst = qaPatientFirst;

      // Create new patient if in new mode
      if (qaNewMode) {
        if (!qaNewFirst.trim() || !qaNewLast.trim()) {
          alert("Inserisci nome e cognome del paziente.");
          setQaSaving(false);
          return;
        }
        const { data: newPat, error: patErr } = await supabase.from("patients")
          .insert({
            first_name: qaNewFirst.trim(),
            last_name: qaNewLast.trim(),
            phone: qaNewPhone.trim() || null,
          })
          .select("id")
          .single();
        if (patErr) throw patErr;
        patientId = newPat.id;
        patientPhone = qaNewPhone.trim() || null;
        patientFirst = qaNewFirst.trim();
      }

      if (!patientId) {
        alert("Seleziona o crea un paziente.");
        setQaSaving(false);
        return;
      }

      const startDate = new Date(`${dateYMD}T${qaTime}:00`);
      const startISO = startDate.toISOString();
      const endISO   = new Date(startDate.getTime() + 3600000).toISOString();

      const { error } = await supabase.from("appointments").insert({
        patient_id: patientId,
        start_at: startISO,
        end_at: endISO,
        status: "confirmed",
        location: "studio",
        clinic_site: "Studio Pontecorvo",
      });
      if (error) throw error;

      // Auto-send WhatsApp confirmation
      if (patientPhone) {
        const patientName = patientFirst || "gentile paziente";
        const luogo = CLINIC_ADDRESSES["Studio Pontecorvo"] || "Studio Pontecorvo";
        const confMsg =
          `Buongiorno ${patientName},\n\n` +
          `Le confermiamo il suo appuntamento di ${formatDateRelative(startDate)} ` +
          `alle ore ⏰ ${qaTime}.\n\n` +
          `📍 ${luogo}\n\n` +
          `Per qualsiasi necessità non esiti a contattarci.\n\n` +
          `Cordiali saluti,\nDr. Marco Turchetta\nFisioterapia e Osteopatia`;

        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const clean = formatPhoneForWA(patientPhone);
        const url = isMobile
          ? `https://wa.me/${clean}?text=${encodeURIComponent(confMsg)}`
          : `https://web.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(confMsg)}`;
        window.open(url, "_blank", "noopener,noreferrer");
      }

      setQuickAddOpen(false);
      await loadAll();
    } catch (e: any) {
      alert(e?.message ?? "Errore nella creazione");
    } finally { setQaSaving(false); }
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
    () => activeAppts.reduce((s, a) => s + (a.is_paid && typeof a.amount === "number" ? a.amount : 0), 0),
    [activeAppts]
  );

  const daIncassare = useMemo(
    () => activeAppts.filter(a => !a.is_paid).reduce((s, a) => s + (typeof a.amount === "number" ? a.amount : 0), 0),
    [activeAppts]
  );

  const incassoAtteso = useMemo(
    () => activeAppts.reduce((s, a) => s + (typeof a.amount === "number" ? a.amount : 0), 0),
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
    }}>
      <style>{`
        html, body { overscroll-behavior-y: none; -webkit-overflow-scrolling: touch; }
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
      }}>
        {/* Top row: logo + user */}
        <div style={{
          height: 48, display: "flex", alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7,
              background: "rgba(255,255,255,0.18)",
              border: "1.5px solid rgba(255,255,255,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 800, fontSize: 12,
            }}>F</div>
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
                  position: "absolute", right: 0, top: "calc(100% + 6px)", width: 180,
                  background: THEME.panelBg, border: `1px solid ${THEME.border}`,
                  borderRadius: 12, boxShadow: "0 8px 24px rgba(15,23,42,0.15)",
                  overflow: "hidden", zIndex: 60,
                }}>
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

      {/* ━━━ BOTTOM TAB BAR ━━━ */}
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30,
        background: THEME.panelBg, borderTop: `1px solid ${THEME.border}`,
        display: "flex", boxShadow: "0 -2px 12px rgba(15,23,42,0.06)",
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 6px)",
      }}>
        {[
          { href: "/mobile",          label: "Home",       icon: "⌂",  active: true },
          { href: "/mobile/calendar", label: "Calendario", icon: "▦" },
          { href: "/mobile/patients", label: "Pazienti",   icon: "◉" },
          { href: "/mobile/reports",  label: "Report",     icon: "◈" },
          { href: "/noleggio",        label: "Noleggio",   icon: "🔌" },
          { href: "/mobile/settings", label: "Impost.",    icon: "⚙" },
        ].map(item => (
          <Link key={item.href} href={item.href} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", padding: "8px 4px 6px", textDecoration: "none", gap: 2,
          }}>
            <span style={{
              fontSize: 18, lineHeight: 1,
              ...((item as any).active
                ? { background: THEME.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }
                : { color: THEME.gray }),
            }}>{item.icon}</span>
            <span style={{
              fontSize: 10, fontWeight: (item as any).active ? 700 : 500,
              color: (item as any).active ? THEME.blue : THEME.gray,
            }}>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* ━━━ FAB ━━━ */}
      <button
        onClick={openQuickAdd}
        aria-label="Nuovo appuntamento"
        style={{
          position: "fixed",
          bottom: "calc(max(env(safe-area-inset-bottom, 0px), 6px) + 56px)",
          right: 16, zIndex: 40,
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
              <a href="/noleggio" style={{ fontSize: 11, color: THEME.blue, fontWeight: 700, textDecoration: "none" }}>Gestisci →</a>
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
                    onClick={() => setExpandedId(isExpanded ? null : a.id)}
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
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {/* Incassa */}
                            <button
                              onClick={() => !a.is_paid && handleIncassa(a)}
                              disabled={a.is_paid || incassando === a.id}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 3,
                                padding: "5px 9px", borderRadius: 6, border: "none",
                                background: a.is_paid ? "rgba(22,163,74,0.12)" : "rgba(22,163,74,0.06)",
                                color: THEME.green, fontWeight: 700, fontSize: 11,
                                cursor: a.is_paid ? "default" : "pointer",
                                opacity: incassando === a.id ? 0.5 : 1,
                              }}
                            >{a.is_paid ? "✓ Pagato" : incassando === a.id ? "…" : "€ Incassa"}</button>

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
                          return (
                            <div
                              key={a.id}
                              style={{
                                width: "100%", textAlign: "left",
                                borderRadius: 8, border: `1px solid ${THEME.border}`,
                                background: THEME.panelSoft, padding: "8px 10px",
                              }}
                            >
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
                                      }}>{fullName(a.patients)}</a>
                                  ) : (
                                    <span style={{
                                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                    }}>{fullName(a.patients)}</span>
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
            paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))",
            boxShadow: "0 -6px 32px rgba(15,23,42,0.15)",
            animation: "slideUp 0.25s ease",
            maxHeight: "88vh", overflowY: "auto",
          }}>
            {/* Handle */}
            <div style={{ width: 32, height: 3.5, borderRadius: 99, background: THEME.border, margin: "0 auto 14px" }}/>

            <div style={{ fontSize: 15, fontWeight: 800, color: THEME.text, marginBottom: 2 }}>
              Nuovo appuntamento
            </div>
            <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 16 }}>
              {isToday ? "Oggi" : headerDateLabel}
            </div>

            {/* Time picker */}
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: THEME.muted,
                textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
              }}>Orario</div>
              <div style={{
                display: "flex", gap: 5, flexWrap: "wrap",
              }}>
                {WORK_HOURS.map(h => (
                  <button key={h} onClick={() => setQaTime(h)} style={{
                    padding: "6px 11px", borderRadius: 7, fontSize: 13, fontWeight: 700,
                    border: qaTime === h ? `2px solid ${THEME.blue}` : `1px solid ${THEME.border}`,
                    background: qaTime === h ? "rgba(37,99,235,0.08)" : THEME.panelSoft,
                    color: qaTime === h ? THEME.blue : THEME.text,
                    cursor: "pointer",
                  }}>{h}</button>
                ))}
              </div>
            </div>

            {/* Patient search / new patient */}
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
                    <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: THEME.green, fontWeight: 700 }}>✓ {qaPatientLabel}</span>
                      <button onClick={() => { setQaPatientId(null); setQaPatientLabel(""); setQaPatientSearch(""); }}
                        style={{ fontSize: 11, color: THEME.muted, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
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

            {/* Actions */}
            {(() => {
              const canSave = qaTime && (qaPatientId || (qaNewMode && qaNewFirst.trim() && qaNewLast.trim()));
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
                    {qaSaving ? "Salvataggio…" : "Crea appuntamento"}
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
                  width: "100%", padding: "9px 10px", borderRadius: 10,
                  border: `1.5px solid ${THEME.border}`, background: THEME.panelSoft,
                  fontSize: 14, fontWeight: 600, color: THEME.text,
                }}/>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Orario</div>
                <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} style={{
                  width: "100%", padding: "9px 10px", borderRadius: 10,
                  border: `1.5px solid ${THEME.border}`, background: THEME.panelSoft,
                  fontSize: 14, fontWeight: 600, color: THEME.text,
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
    </div>
  );
}
