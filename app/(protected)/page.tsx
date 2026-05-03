"use client";

// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/page.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Dashboard principale (home gestionale) — orchestratore.
// La UI è suddivisa in 8 componenti (in components/dashboard/) che ricevono
// stato e handler via props. Questo file mantiene:
//   • Lo stato (useState) di tutti i campi
//   • Le funzioni di caricamento/salvataggio verso Supabase
//   • Gli useMemo derivati (filtraggi, raggruppamenti, statistiche)
//
// Per modificare l'aspetto di una sezione, edita il file in
// components/dashboard/<NomeSezione>.tsx.
//
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";

// Theme & utils condivisi
import { THEME } from "./components/dashboard/shared/theme";
import {
  startOfDay, addDays, maxDate, isSameDay, mondayStart,
  toYMD, sumAmount, patientName, pickPatient,
  fmtPhone, openWA, buildWAMsg, computeFreeSlots, groupByDay,
  todayNoteKey,
} from "./components/dashboard/shared/utils";
import { useCountdown } from "./components/dashboard/shared/StatusPill";
import type {
  AppointmentRow, BirthdayRow, ForecastRevenue, InactivePatientRow,
  NoleggioExpiring, OpenBalanceGroup, OpenBalanceRow, Status, WebBooking,
  WeekStats,
} from "./components/dashboard/shared/types";

// Sezioni
import DashboardNavBar from "./components/dashboard/DashboardNavBar";
import HeroSection from "./components/dashboard/HeroSection";
import WebBookingPopup from "./components/dashboard/WebBookingPopup";
import LeftColumnSection from "./components/dashboard/LeftColumnSection";
import AgendaSection from "./components/dashboard/AgendaSection";
import RightInsightSection from "./components/dashboard/RightInsightSection";
import ForecastAndRentalSection from "./components/dashboard/ForecastAndRentalSection";
import BottomRowSection from "./components/dashboard/BottomRowSection";
import type { WorkingHourRow } from "./components/dashboard/shared/utils";


export default function HomePage() {
  const router = useRouter();
  const { studio: currentStudio } = useCurrentStudio();
  const currentStudioId = currentStudio?.id ?? null;

  // ── Orari di lavoro dello studio (per slot liberi della home) ───────
  const [workingHours, setWorkingHours] = useState<WorkingHourRow[]>([]);
  useEffect(() => {
    if (!currentStudioId) { setWorkingHours([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("working_hours")
        .select("day_of_week, open_time, close_time, is_open")
        .eq("studio_id", currentStudioId)
        .order("day_of_week");
      if (!cancelled) setWorkingHours((data ?? []) as WorkingHourRow[]);
    })();
    return () => { cancelled = true; };
  }, [currentStudioId]);

  // ── Auth ────────────────────────────────────────────────────────────
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email ?? null);
    })();
  }, []);

  const handleLogout = useCallback(async () => {
    try { await supabase.auth.signOut(); } finally { router.push("/login"); }
  }, [router]);

  const userInitials = useMemo(() => {
    const l = (userEmail || "").split("@")[0].replace(/[^a-zA-Z]/g, "").toUpperCase();
    return (l.slice(0, 2) || "U").padEnd(2, "U");
  }, [userEmail]);

  // ── Date di riferimento ─────────────────────────────────────────────
  const today          = useMemo(() => startOfDay(new Date()), []);
  const tomorrow       = useMemo(() => addDays(today, 1), [today]);
  const thisWeekStart  = useMemo(() => mondayStart(new Date()), []);
  const thisWeekEnd    = useMemo(() => addDays(thisWeekStart, 7), [thisWeekStart]);
  const lastWeekStart  = useMemo(() => addDays(thisWeekStart, -7), [thisWeekStart]);
  const lastWeekEnd    = useMemo(() => thisWeekStart, [thisWeekStart]);

  // ── Caricamento appuntamenti ────────────────────────────────────────
  const [loading, setLoading]         = useState(true);
  const [err, setErr]                 = useState("");
  const [appointments, setAppts]      = useState<AppointmentRow[]>([]);

  const fetchAppts = useCallback(async () => {
    try {
      setLoading(true);
      const end = maxDate(thisWeekEnd, addDays(startOfDay(new Date()), 8));
      const { data, error } = await supabase
        .from("appointments")
        .select("id,patient_id,start_at,end_at,status,location,clinic_site,domicile_address,amount,price_type,payment_method,treatment_type,is_paid,paid_at,calendar_note,whatsapp_sent_at,whatsapp_sent,patients:patient_id(first_name,last_name,phone,status)")
        .gte("start_at", lastWeekStart.toISOString())
        .lt("start_at", end.toISOString())
        .order("start_at", { ascending: true });
      if (error) throw new Error(error.message);
      setAppts((data || []) as AppointmentRow[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }, [lastWeekStart, thisWeekEnd]);

  useEffect(() => { fetchAppts(); }, [fetchAppts]);

  // ── Saldi aperti ────────────────────────────────────────────────────
  const [openBalances, setOpenBalances]             = useState<OpenBalanceRow[]>([]);
  const [loadingBalances, setLoadingBalances]       = useState(false);
  const [openBalanceGroups, setOpenBalanceGroups]   = useState<OpenBalanceGroup[]>([]);

  const fetchOpenBalances = useCallback(async () => {
    setLoadingBalances(true);
    try {
      const { data, error } = await supabase.from("appointments")
        .select("id,patient_id,amount,start_at,patients:patient_id(first_name,last_name,phone)")
        .in("status", ["done", "not_paid"]).eq("is_paid", false).not("amount", "is", null).gt("amount", 0)
        .order("start_at", { ascending: false }).limit(200);
      if (error) throw error;

      const nowMs = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: OpenBalanceRow[] = (data || []).map((r: any) => {
        const pt = Array.isArray(r.patients) ? r.patients[0] : r.patients;
        return {
          id: r.id,
          patient_id: r.patient_id,
          patient_name: `${pt?.last_name || ""} ${pt?.first_name || ""}`.trim() || "Paziente",
          amount: Number(r.amount) || 0,
          start_at: r.start_at,
          days_ago: Math.floor((nowMs - new Date(r.start_at).getTime()) / 86400000),
          phone: pt?.phone ?? null,
        };
      });
      setOpenBalances(rows);

      // Raggruppa per paziente
      const map = new Map<string, OpenBalanceGroup>();
      rows.forEach((r) => {
        if (!map.has(r.patient_id)) {
          map.set(r.patient_id, {
            patient_id: r.patient_id, patient_name: r.patient_name,
            phone: r.phone, sessions: 0, total: 0, last_at: r.start_at,
          });
        }
        const g = map.get(r.patient_id)!;
        g.sessions++;
        g.total += r.amount;
        if (r.start_at > g.last_at) g.last_at = r.start_at;
      });
      setOpenBalanceGroups(Array.from(map.values()).sort((a, b) => b.total - a.total));
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
    } finally {
      setLoadingBalances(false);
    }
  }, []);
  useEffect(() => { fetchOpenBalances(); }, [fetchOpenBalances]);

  // ── Compleanni della settimana ──────────────────────────────────────
  const [birthdays, setBirthdays]               = useState<BirthdayRow[]>([]);
  const [loadingBirthdays, setLoadingBirthdays] = useState(false);

  const fetchBirthdays = useCallback(async () => {
    setLoadingBirthdays(true);
    try {
      const { data, error } = await supabase
        .from("patients")
        .select("id,first_name,last_name,birth_date,phone")
        .not("birth_date", "is", null);
      if (error) throw error;

      const now = new Date(); const thisYear = now.getFullYear();
      const todayMs = startOfDay(now).getTime();
      const weekEnd = addDays(startOfDay(now), 7).getTime();
      const gg = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
      const result: BirthdayRow[] = [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (data || []) as any[]) {
        if (!p.birth_date) continue;
        const [y, m, d] = p.birth_date.split("-").map(Number);
        if (!y || !m || !d) continue;
        const bd = new Date(thisYear, m - 1, d, 0, 0, 0, 0);
        if (bd.getTime() >= todayMs && bd.getTime() < weekEnd) {
          result.push({
            patient_id: p.id,
            name: `${p.last_name || ""} ${p.first_name || ""}`.trim() || "Paziente",
            first_name: (p.first_name || "").trim() || "Paziente",
            birth_date: p.birth_date,
            age: thisYear - y,
            weekday: isSameDay(bd, now) ? "Oggi" : gg[bd.getDay()],
            phone: p.phone ?? null,
            isToday: isSameDay(bd, now),
          });
        }
      }
      result.sort((a, b) => {
        const [, ma, da] = a.birth_date.split("-").map(Number);
        const [, mb, db] = b.birth_date.split("-").map(Number);
        return new Date(thisYear, ma - 1, da).getTime() - new Date(thisYear, mb - 1, db).getTime();
      });
      setBirthdays(result);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
    } finally {
      setLoadingBirthdays(false);
    }
  }, []);
  useEffect(() => { fetchBirthdays(); }, [fetchBirthdays]);

  // ── Prenotazioni web ────────────────────────────────────────────────
  const [webBookings, setWebBookings]               = useState<WebBooking[]>([]);
  const [webBookingActionId, setWebBookingActionId] = useState<string | null>(null);
  const [webPopup, setWebPopup]                     = useState<WebBooking | null>(null);

  const fetchWebBookings = useCallback(async () => {
    const { data } = await supabase
      .from("booking_requests")
      .select("*")
      .in("status", ["pending", "confirmed", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(30);
    setWebBookings((data ?? []) as WebBooking[]);
  }, []);
  useEffect(() => { void fetchWebBookings(); }, [fetchWebBookings]);

  async function confirmWebBooking(req: WebBooking) {
    setWebBookingActionId(req.id);
    const timeStr = req.requested_time.slice(0, 5);
    const [th, tm] = timeStr.split(":").map(Number);
    const [dy, dm, dd] = req.requested_date.split("-").map(Number);
    const startDt = new Date(dy, dm - 1, dd, th, tm, 0, 0);
    const endDt   = new Date(startDt.getTime() + Number(req.service_duration) * 60000);
    const isHome  = req.service_name.toLowerCase().includes("domicil");
    const note    = `[WEB|${req.patient_name}|${req.patient_phone}] ${req.service_name}`;

    await supabase.from("booking_requests").update({ status: "confirmed" }).eq("id", req.id);
    await supabase.from("appointments").insert({
      start_at:  startDt.toISOString(),
      end_at:    endDt.toISOString(),
      status:    "booked",
      is_paid:   false,
      location:  isHome ? "domicile" : "studio",
      clinic_site: isHome ? null : (currentStudio?.name || "Studio"),
      domicile_address: isHome ? (req.notes ?? "da definire") : null,
      calendar_note: note,
      studio_id: currentStudio?.id,       // FIX multi-tenancy
    });
    setWebBookingActionId(null);
    setWebPopup(null);
    await fetchWebBookings();
    await fetchAppts();
  }

  async function rejectWebBooking(id: string) {
    setWebBookingActionId(id);
    await supabase.from("booking_requests").update({ status: "cancelled" }).eq("id", id);
    setWebBookingActionId(null);
    setWebPopup(null);
    await fetchWebBookings();
  }

  async function deleteWebBooking(id: string) {
    if (!confirm("Eliminare definitivamente questa prenotazione?")) return;
    setWebBookingActionId(id);
    await supabase.from("booking_requests").delete().eq("id", id);
    setWebBookingActionId(null);
    setWebPopup(null);
    await fetchWebBookings();
  }

  // ── Push notifications ──────────────────────────────────────────────
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    if ("Notification" in window) setPushEnabled(Notification.permission === "granted");
  }, []);

  async function requestPushPermission() {
    setPushLoading(true);
    try {
      if (!("Notification" in window)) {
        alert("Il tuo browser non supporta le notifiche push.");
        return;
      }
      const perm = await Notification.requestPermission();
      setPushEnabled(perm === "granted");
      if (perm === "granted") {
        new Notification("FisioHub — Notifiche attivate! ✅", {
          body: "Riceverai avvisi per nuove prenotazioni e scadenze noleggio.",
          icon: "/favicon.ico",
        });
      } else {
        alert("Notifiche rifiutate. Puoi attivarle dalle impostazioni del browser.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPushLoading(false);
    }
  }

  // Trigger push notification per nuove prenotazioni
  useEffect(() => {
    if (!pushEnabled) return;
    const pending = webBookings.filter(r => r.status === "pending");
    if (pending.length > 0 && Notification.permission === "granted") {
      new Notification(`FisioHub — ${pending.length} nuova/e prenotazione/i online`, {
        body: pending.map(r => r.patient_name || "Paziente").join(", "),
        icon: "/favicon.ico",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webBookings.length]);

  // ── Noleggi in scadenza ─────────────────────────────────────────────
  const [noleggioExpiring, setNoleggioExpiring]       = useState<NoleggioExpiring[]>([]);
  const [noleggioWarningDays, setNoleggioWarningDays] = useState(3);

  useEffect(() => {
    (async () => {
      try {
        const { data: cfg } = await supabase.from("noleggio_settings").select("warning_days").maybeSingle();
        const wd = cfg?.warning_days ?? 3;
        setNoleggioWarningDays(wd);
        const { data } = await supabase
          .from("noleggios")
          .select("id,patient_name,end_date,device_name,patient_phone")
          .eq("is_returned", false)
          .order("end_date", { ascending: true });
        const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const expiring: NoleggioExpiring[] = (data || []).map((n: any) => {
          const end = new Date(n.end_date + "T00:00:00");
          const dr = Math.ceil((end.getTime() - todayD.getTime()) / 86400000);
          return { ...n, days_remaining: dr };
        }).filter((n: NoleggioExpiring) => n.days_remaining <= wd);
        setNoleggioExpiring(expiring);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // ── Pazienti inattivi (da ricontattare) ─────────────────────────────
  const [inactiveThreshold, setInactiveThreshold]   = useState<30 | 45 | 60>(45);
  const [inactivePatients, setInactivePatients]     = useState<InactivePatientRow[]>([]);
  const [inactiveLoading, setInactiveLoading]       = useState(false);
  const [contactedPatients, setContactedPatients]   = useState<Set<string>>(new Set());

  const fetchInactive = useCallback(async () => {
    try {
      setInactiveLoading(true);
      // Prende TUTTI gli appuntamenti done degli ultimi 2 anni
      // Filtra lato client: pazienti la cui ULTIMA seduta è > soglia giorni fa
      // (la vecchia logica filtrava col .lt() server-side e mostrava sedute vecchie
      //  anche per pazienti che ne avevano di più recenti non ancora nella query)
      const twoYearsAgo = new Date(Date.now() - 730 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("appointments")
        .select("patient_id,start_at,patients:patient_id!inner(first_name,last_name,phone,status)")
        .eq("status", "done")
        .gte("start_at", twoYearsAgo)
        .order("start_at", { ascending: false })
        .limit(1000);
      if (error) throw new Error(error.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data || []) as any[];

      // Tieni solo l'appuntamento PIÙ RECENTE per paziente
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byP = new Map<string, any>();
      for (const r of rows) { if (r.patient_id && !byP.has(r.patient_id)) byP.set(r.patient_id, r); }

      // Filtra: solo chi non ha sedute da > inactiveThreshold giorni
      const list: InactivePatientRow[] = [];
      for (const [pid, r] of byP.entries()) {
        const pt = pickPatient(r.patients);
        if ((pt?.status || "").toString().toLowerCase() === "inactive") continue;
        const days = Math.floor((Date.now() - new Date(r.start_at).getTime()) / 86400000);
        if (days > inactiveThreshold) {
          list.push({
            patient_id: pid,
            first_name: pt?.first_name || "",
            last_name:  pt?.last_name  || "",
            phone:      pt?.phone ?? null,
            last_done_at:    r.start_at,
            days_since_last: days,
          });
        }
      }
      list.sort((a, b) => b.days_since_last - a.days_since_last);
      setInactivePatients(list.slice(0, 12));
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
    } finally {
      setInactiveLoading(false);
    }
  }, [inactiveThreshold]);
  useEffect(() => { fetchInactive(); }, [fetchInactive]);

  // ── Day note (localStorage) ─────────────────────────────────────────
  const [dayNote, setDayNote] = useState("");
  useEffect(() => {
    try { setDayNote(localStorage.getItem(todayNoteKey()) || ""); } catch { /* noop */ }
  }, []);
  const saveDayNote = useCallback((val: string) => {
    setDayNote(val);
    try { localStorage.setItem(todayNoteKey(), val); } catch { /* noop */ }
  }, []);

  // ── Stato riga agenda ───────────────────────────────────────────────
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [rowNotes, setRowNotes]       = useState<Record<string, string>>({});
  const [savingNote, setSavingNote]   = useState<string | null>(null);
  const [busyRow, setBusyRow]         = useState<Record<string, boolean>>({});

  useEffect(() => {
    const map: Record<string, string> = {};
    appointments.forEach(a => { map[a.id] = a.calendar_note || ""; });
    setRowNotes(prev => ({ ...map, ...prev }));
  }, [appointments]);

  // ── Modifica orario "prossimo appuntamento" ────────────────────────
  const [editNextTime, setEditNextTime]   = useState(false);
  const [editDate, setEditDate]           = useState("");
  const [editStart, setEditStart]         = useState("");
  const [editDuration, setEditDuration]   = useState<"0.5" | "0.75" | "1" | "1.5" | "2">("1");
  const [savingTime, setSavingTime]       = useState(false);

  // ── Tab agenda ──────────────────────────────────────────────────────
  const [tab, setTab] = useState<"today" | "next7" | "thisWeek">("today");

  // ── Memo derivati ───────────────────────────────────────────────────
  const todayAppts     = useMemo(() => appointments.filter(a => isSameDay(new Date(a.start_at), today)), [appointments, today]);
  const domicilesToday = useMemo(() => todayAppts.filter(a => a.location === "domicile"), [todayAppts]);
  const next7Appts     = useMemo(() => {
    const s = startOfDay(new Date()); const e = addDays(s, 8);
    return appointments.filter(a => {
      const d = new Date(a.start_at);
      return d >= s && d < e && !isSameDay(d, today);
    });
  }, [appointments, today]);
  const thisWeekAppts  = useMemo(() => appointments.filter(a => {
    const d = new Date(a.start_at);
    return d >= thisWeekStart && d < thisWeekEnd;
  }), [appointments, thisWeekStart, thisWeekEnd]);

  const focusNext = useMemo(
    () => appointments
      .filter(a => a.status !== "cancelled" && new Date(a.start_at).getTime() >= Date.now())
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())[0] || null,
    [appointments]
  );
  const tomorrowAppts   = useMemo(() => appointments.filter(a => isSameDay(new Date(a.start_at), tomorrow) && a.status !== "cancelled"), [appointments, tomorrow]);
  const remindersToSend = useMemo(() => tomorrowAppts.filter(a => !a.whatsapp_sent_at).slice(0, 6), [tomorrowAppts]);
  const remainingToday  = useMemo(() => {
    if (!focusNext) return todayAppts;
    return todayAppts
      .filter(a => a.id !== focusNext.id && new Date(a.start_at).getTime() >= new Date(focusNext.start_at).getTime())
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
      .slice(0, 6);
  }, [todayAppts, focusNext]);

  const todayDone     = useMemo(() => todayAppts.filter(a => a.status === "done").length, [todayAppts]);
  const todayTotal    = todayAppts.filter(a => a.status !== "cancelled").length;
  const todayPct      = todayTotal > 0 ? Math.round((todayDone / todayTotal) * 100) : 0;
  const todayExpected = useMemo(() => sumAmount(todayAppts.filter(a => a.status !== "cancelled")), [todayAppts]);
  const todayIncassato = useMemo(() => sumAmount(todayAppts.filter(a => a.is_paid)), [todayAppts]);

  const alertAppts = useMemo(() => {
    const now = Date.now();
    const limit = now + 60 * 60 * 1000;
    return appointments.filter(a => {
      const t = new Date(a.start_at).getTime();
      return t >= now && t <= limit && a.status === "booked";
    });
  }, [appointments]);

  const weekStats: WeekStats = useMemo(() => {
    const tw = appointments.filter(a => { const d = new Date(a.start_at); return d >= thisWeekStart && d < thisWeekEnd; });
    const lw = appointments.filter(a => { const d = new Date(a.start_at); return d >= lastWeekStart && d < lastWeekEnd; });
    return {
      this: { done: tw.filter(a => a.status === "done").length, notPaid: tw.filter(a => a.status === "not_paid").length, expected: sumAmount(tw.filter(a => a.status !== "cancelled")) },
      last: { done: lw.filter(a => a.status === "done").length, notPaid: lw.filter(a => a.status === "not_paid").length, expected: sumAmount(lw.filter(a => a.status !== "cancelled")) },
    };
  }, [appointments, thisWeekStart, thisWeekEnd, lastWeekStart, lastWeekEnd]);

  const recentPatients = useMemo(() => {
    const u = new Map<string, AppointmentRow>();
    appointments.forEach(a => {
      if (!u.has(a.patient_id) || new Date(a.start_at) > new Date(u.get(a.patient_id)!.start_at)) {
        u.set(a.patient_id, a);
      }
    });
    return Array.from(u.values())
      .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())
      .slice(0, 5);
  }, [appointments]);

  // Slot liberi oggi e domani
  const freeSlots = useMemo(() => [
    ...computeFreeSlots(todayAppts,    toYMD(today),    "oggi",   workingHours),
    ...computeFreeSlots(tomorrowAppts, toYMD(tomorrow), "domani", workingHours),
  ], [todayAppts, tomorrowAppts, today, tomorrow, workingHours]);

  // Buckets per tab agenda
  const activeBuckets = useMemo(
    () => groupByDay(tab === "today" ? todayAppts : tab === "next7" ? next7Appts : thisWeekAppts),
    [tab, todayAppts, next7Appts, thisWeekAppts]
  );

  // Previsione incasso 7 giorni
  const forecastRevenue: ForecastRevenue = useMemo(() => {
    const t = startOfDay(new Date());
    const endWeek = addDays(t, 7);
    const future = appointments.filter(a =>
      a.status !== "cancelled" &&
      new Date(a.start_at) >= t &&
      new Date(a.start_at) < endWeek
    );
    const confirmed = future.filter(a => a.status === "confirmed" || a.status === "booked");
    const total = confirmed.reduce((s, a) => {
      const n = typeof a.amount === "string" ? Number(a.amount) : a.amount;
      return s + (Number.isFinite(n as number) ? (n as number) : 0);
    }, 0);
    return { total: Math.round(total), sessCount: confirmed.length, days: 7 };
  }, [appointments]);

  // ── Handler azioni appuntamento ─────────────────────────────────────
  const setStatus = useCallback(async (id: string, next: Status) => {
    setBusyRow(m => ({ ...m, [id]: true }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: any = { status: next };
    // Mantiene coerenza col CHECK constraint appointments_paid_consistency:
    // ogni volta che tocchiamo is_paid, dobbiamo coerentemente settare paid_at (mig. 010).
    if (next === "done")     { patch.is_paid = true;  patch.paid_at = new Date().toISOString(); }
    if (next === "not_paid") { patch.is_paid = false; patch.paid_at = null; }
    if (next === "confirmed" || next === "booked") { patch.is_paid = false; patch.paid_at = null; }
    const { error } = await supabase.from("appointments").update(patch).eq("id", id);
    setBusyRow(m => ({ ...m, [id]: false }));
    if (error) alert("Errore: " + error.message);
    else fetchAppts();
  }, [fetchAppts]);

  const togglePaid = useCallback(async (id: string, isPaid: boolean) => {
    setBusyRow(m => ({ ...m, [id]: true }));
    // Mantiene coerenza col CHECK constraint appointments_paid_consistency:
    // is_paid=true ↔ paid_at NOT NULL (mig. 010).
    const payload = isPaid
      ? { is_paid: true,  paid_at: new Date().toISOString() }
      : { is_paid: false, paid_at: null };
    const { error } = await supabase.from("appointments").update(payload).eq("id", id);
    setBusyRow(m => ({ ...m, [id]: false }));
    if (error) alert("Errore: " + error.message);
    else { fetchAppts(); fetchOpenBalances(); }
  }, [fetchAppts, fetchOpenBalances]);

  // Handler completo per il PaidPill dei dashboard widgets
  // (sezione "Prossimo", "Oggi prossimi", "Saldi aperti").
  const handleUpdatePayment = useCallback(
    async (
      id: string,
      next: {
        is_paid: boolean;
        paid_at: string | null;
        payment_method: "cash" | "pos" | "bank_transfer" | null;
      }
    ) => {
      setBusyRow(m => ({ ...m, [id]: true }));
      const payload: Record<string, unknown> = {
        is_paid: next.is_paid,
        paid_at: next.paid_at,
      };
      if (!next.is_paid) {
        payload.payment_method = null;
      } else if (next.payment_method) {
        payload.payment_method = next.payment_method;
      }
      const { error } = await supabase.from("appointments").update(payload).eq("id", id);
      setBusyRow(m => ({ ...m, [id]: false }));
      if (error) alert("Errore: " + error.message);
      else { fetchAppts(); fetchOpenBalances(); }
    },
    [fetchAppts, fetchOpenBalances]
  );

  const saveNote = useCallback(async (id: string) => {
    setSavingNote(id);
    const note = (rowNotes[id] || "").trim();
    await supabase.from("appointments").update({ calendar_note: note || null }).eq("id", id);
    setSavingNote(null);
  }, [rowNotes]);

  const saveNextTime = useCallback(async () => {
    if (!focusNext || !editDate || !editStart) return;
    setSavingTime(true);
    const [y, m, d] = editDate.split("-").map(Number);
    const [hh, mm]  = editStart.split(":").map(Number);
    const ns = new Date(y, m - 1, d, hh, mm, 0, 0);
    const ne = new Date(ns.getTime() + parseFloat(editDuration) * 3600000);
    const { error } = await supabase
      .from("appointments")
      .update({ start_at: ns.toISOString(), end_at: ne.toISOString() })
      .eq("id", focusNext.id);
    setSavingTime(false);
    if (error) alert("Errore: " + error.message);
    else { setEditNextTime(false); fetchAppts(); }
  }, [focusNext, editDate, editStart, editDuration, fetchAppts]);

  const sendWA = useCallback(async (appt: AppointmentRow) => {
    const phone = pickPatient(appt.patients)?.phone || "";
    if (!fmtPhone(phone)) { alert("Numero non valido."); return; }
    const msg = buildWAMsg(appt);
    await supabase.from("appointments")
      .update({ whatsapp_sent_at: new Date().toISOString(), whatsapp_sent: true })
      .eq("id", appt.id);
    openWA(phone, msg);
    fetchAppts();
  }, [fetchAppts]);

  // Countdown verso prossimo appuntamento
  const nextCountdown = useCountdown(focusNext?.start_at ?? null);

  // ═════════════════════════════════════════════════════════════════════
  // Render
  // ═════════════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: "100vh", background: THEME.appBg, fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif" }}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
        *{-webkit-font-smoothing:antialiased;box-sizing:border-box;}
        body{font-family:'Outfit','Segoe UI',system-ui,sans-serif;margin:0;background:#f1f5f9;}
        a{text-decoration:none;}
        select,input,textarea,button{font-family:inherit;}
        input:focus,select:focus,textarea:focus{border-color:#2563eb!important;box-shadow:0 0 0 3px rgba(37,99,235,0.10)!important;outline:none!important;}
        .rh:hover{background:rgba(37,99,235,0.03)!important;}
        .ar{transition:background 0.12s;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.55}}
        .pulse{animation:pulse 2s ease-in-out infinite;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .fade-in{animation:fadeIn 0.2s ease forwards;}
        @media(max-width:1100px){.col-right{display:none!important}.main-cols{grid-template-columns:340px 1fr!important}}
        @media(max-width:780px){.main-cols{grid-template-columns:1fr!important}}
        @media(min-width:768px)and(max-width:1199px){.th{display:none!important}.main-cols{grid-template-columns:1fr 1fr!important}.kpi-grid{grid-template-columns:1fr 1fr!important}}
      `}</style>

      <DashboardNavBar
        userEmail={userEmail}
        userInitials={userInitials}
        onRefresh={fetchAppts}
        pushEnabled={pushEnabled}
        pushLoading={pushLoading}
        onRequestPushPermission={() => void requestPushPermission()}
        onLogout={handleLogout}
      />

      <HeroSection
        loading={loading}
        todayDone={todayDone}
        todayTotal={todayTotal}
        todayPct={todayPct}
        todayIncassato={todayIncassato}
        todayExpected={todayExpected}
        focusNext={focusNext}
        nextCountdown={nextCountdown}
        remindersToSend={remindersToSend}
        tomorrowAppts={tomorrowAppts}
      />

      {/* ━━━ ALERT prossimi appuntamenti non confermati ━━━ */}
      {alertAppts.length > 0 && (
        <div style={{ background: "rgba(249,115,22,0.95)", padding: "10px 28px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="pulse" style={{ fontSize: 14 }}>⚠️</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#fff", flex: 1 }}>
            {alertAppts.length === 1
              ? `Seduta di ${patientName(alertAppts[0].patients)} alle ${new Date(alertAppts[0].start_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} non ancora confermata`
              : `${alertAppts.length} sedute entro 60 minuti non confermate`}
          </span>
          {alertAppts.map(a => (
            <button
              key={a.id}
              onClick={() => setStatus(a.id, "confirmed")}
              style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.2)", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              Conferma{alertAppts.length > 1 ? ` ${patientName(a.patients)}` : ""}
            </button>
          ))}
        </div>
      )}

      {err && (
        <div style={{ margin: "12px 28px 0", padding: "10px 14px", borderRadius: 8, background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.18)", color: THEME.red, fontWeight: 600, fontSize: 13 }}>
          {err}
        </div>
      )}

      {/* ━━━ ALERT PRENOTAZIONI WEB ━━━ */}
      {webBookings.filter(b => b.status === "pending").length > 0 && (
        <div style={{ background: "linear-gradient(135deg,#7c3aed,#2563eb)", padding: "10px 28px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16 }}>🌐</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#fff", flex: 1 }}>
            {webBookings.filter(b => b.status === "pending").length} nuova prenotazione dal sito in attesa di conferma
          </span>
          {webBookings.filter(b => b.status === "pending").slice(0, 2).map(b => (
            <button
              key={b.id}
              onClick={() => setWebPopup(b)}
              style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.2)", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              {b.patient_name} — {b.requested_date.slice(5).replace("-", "/")} {b.requested_time.slice(0, 5)}
            </button>
          ))}
        </div>
      )}

      {/* ━━━ POPUP DETTAGLIO PRENOTAZIONE WEB ━━━ */}
      {webPopup && (
        <WebBookingPopup
          booking={webPopup}
          webBookingActionId={webBookingActionId}
          onClose={() => setWebPopup(null)}
          onConfirm={confirmWebBooking}
          onReject={rejectWebBooking}
          onDelete={deleteWebBooking}
        />
      )}

      {/* ━━━ CONTENT ━━━ */}
      <div style={{ padding: "20px 24px 32px" }}>

        {/* COLONNE PRINCIPALI */}
        <div className="main-cols" style={{ display: "grid", gridTemplateColumns: "340px 1fr 280px", gap: 16, alignItems: "start", marginBottom: 16 }}>

          <LeftColumnSection
            focusNext={focusNext}
            nextCountdown={nextCountdown}
            editNextTime={editNextTime}
            setEditNextTime={setEditNextTime}
            editDate={editDate} setEditDate={setEditDate}
            editStart={editStart} setEditStart={setEditStart}
            editDuration={editDuration} setEditDuration={setEditDuration}
            savingTime={savingTime}
            onSaveNextTime={() => void saveNextTime()}
            onSetStatus={(id, s) => void setStatus(id, s)}
            onTogglePaid={(id, p) => void togglePaid(id, p)}
            onUpdatePayment={(id, next) => void handleUpdatePayment(id, next)}
            onSendWA={(a) => void sendWA(a)}
            remainingToday={remainingToday}
            domicilesToday={domicilesToday}
            tomorrowAppts={tomorrowAppts}
            remindersToSend={remindersToSend}
            dayNote={dayNote}
            onSaveDayNote={saveDayNote}
          />

          <AgendaSection
            loading={loading}
            tab={tab}
            setTab={setTab}
            activeBuckets={activeBuckets}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            rowNotes={rowNotes}
            setRowNotes={setRowNotes}
            busyRow={busyRow}
            savingNote={savingNote}
            onSetStatus={(id, s) => void setStatus(id, s)}
            onTogglePaid={(id, p) => void togglePaid(id, p)}
            onUpdatePayment={(id, next) => void handleUpdatePayment(id, next)}
            onSendWA={(a) => void sendWA(a)}
            onSaveNote={(id) => void saveNote(id)}
          />

          <RightInsightSection
            webBookings={webBookings}
            webBookingActionId={webBookingActionId}
            onRefreshWebBookings={() => void fetchWebBookings()}
            onOpenWebPopup={setWebPopup}
            onConfirmWebBooking={(b) => void confirmWebBooking(b)}
            weekStats={weekStats}
            inactiveThreshold={inactiveThreshold}
            setInactiveThreshold={setInactiveThreshold}
            inactiveLoading={inactiveLoading}
            inactivePatients={inactivePatients}
            contactedPatients={contactedPatients}
            setContactedPatients={setContactedPatients}
            recentPatients={recentPatients}
          />

        </div>

        <ForecastAndRentalSection
          forecastRevenue={forecastRevenue}
          noleggioExpiring={noleggioExpiring}
          noleggioWarningDays={noleggioWarningDays}
          signatureName={currentStudio?.signature_name}
          signatureTitle={currentStudio?.signature_title}
        />

        <BottomRowSection
          freeSlots={freeSlots}
          loadingBalances={loadingBalances}
          openBalances={openBalances}
          openBalanceGroups={openBalanceGroups}
          currentStudio={currentStudio}
          onTogglePaid={(id, p) => void togglePaid(id, p)}
          loadingBirthdays={loadingBirthdays}
          birthdays={birthdays}
        />

      </div>
    </div>
  );
}
