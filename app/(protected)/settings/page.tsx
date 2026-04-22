"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";
import TemplateEditor, { DEFAULT_PLACEHOLDERS } from "./components/TemplateEditor";
import { useCurrentStudio } from "@/src/contexts/StudioContext";

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
  blueDark:  "#1e40af",
  green:     "#16a34a",
  teal:      "#0d9488",
  red:       "#dc2626",
  amber:     "#f97316",
  gray:      "#94a3b8",
};

// ─── Types ────────────────────────────────────────────────────────────────────
type MessageTemplate = {
  id: string;
  name: string;
  template: string;
  is_default: boolean;
  created_at: string;
};

type PracticeSettingsRow = {
  owner_id: string;
  practice_name: string | null;
  owner_full_name: string | null;
  vat_number: string | null;
  address: string | null;
  pec_email: string | null;
  phone: string | null;
  google_review_link: string | null;
  standard_invoice: number | null;
  standard_cash: number | null;
  machine_invoice: number | null;
  machine_cash: number | null;
  laser_invoice: number | null;
  laser_cash: number | null;
  tecar_invoice: number | null;
  tecar_cash: number | null;
  onde_urto_invoice: number | null;
  onde_urto_cash: number | null;
  tens_invoice: number | null;
  tens_cash: number | null;
  auto_apply_prices: boolean | null;
  // Durate per tipo trattamento (minuti)
  duration_seduta: number | null;
  duration_macchinario: number | null;
  duration_laser: number | null;
  duration_tecar: number | null;
  duration_onde_urto: number | null;
  duration_tens: number | null;
  // Messaggi automatici
  welcome_message: string | null;
  booking_confirm_message: string | null;
  reminder_message: string | null;
  payment_message: string | null;
  birthday_message: string | null;
  satisfaction_message: string | null;
  // Logo
  logo_base64: string | null;
  // Stato default appuntamenti
  default_appointment_status: string | null;
  overlap_mode: string | null;
  // Gestione
  monthly_revenue_goal: number | null;
  inactive_threshold_days: number | null;
  reminder_hours_before: number | null;
  created_at?: string;
  updated_at?: string;
};

type WorkingHourRow = {
  day_of_week: number;  // 0=Dom, 1=Lun, ..., 6=Sab
  open_time: string;    // "HH:MM"
  close_time: string;
  is_open: boolean;
};

const DAY_LABELS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
// Ordine di visualizzazione: Lun → Dom (ISO)
const DAY_ORDER_ISO = [1, 2, 3, 4, 5, 6, 0];

// ─── Utils ────────────────────────────────────────────────────────────────────
function toMoneyString(n: number | null | undefined, fallback: string) {
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return n.toFixed(2);
}
function toNumberSafe(s: string, fallback: number) {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}
function validatePrice(value: string): string {
  const clean = value.replace(/[^\d.,]/g, "");
  const normalized = clean.replace(",", ".");
  const parts = normalized.split(".");
  if (parts.length > 1) return `${parts[0]}.${parts[1].slice(0, 2)}`;
  return normalized || "0.00";
}
function formatPreview(template: string): string {
  return template
    .replace(/{nome}/g, "Marco")
    .replace(/{data_relativa}/g, "Oggi")
    .replace(/{ora}/g, "10:30")
    .replace(/{luogo}/g, "Studio Pontecorvo, Via Galileo Galilei 5");
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SettingsPage() {

  // ── Auth / user menu ──────────────────────────────────────────────────────
  const [userEmail, setUserEmail]       = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => { const { data } = await supabase.auth.getUser(); setUserEmail(data?.user?.email ?? null); })();
  }, []);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!userMenuOpen) return;
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [userMenuOpen]);
  const handleLogout = useCallback(async () => {
    try { await supabase.auth.signOut(); } finally { setUserMenuOpen(false); window.location.href = "/login"; }
  }, []);
  const userInitials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "?";

  // ── State ─────────────────────────────────────────────────────────────────
  const [templates, setTemplates]               = useState<MessageTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingPractice, setLoadingPractice]   = useState(true);
  const [savingPractice, setSavingPractice]     = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");

  // Template edit
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editName, setEditName]         = useState("");
  const [editTemplate, setEditTemplate] = useState("");
  const [newName, setNewName]           = useState("");
  const [newTemplate, setNewTemplate]   = useState("");
  const [addingNew, setAddingNew]       = useState(false);

  // Section open/close
  const [showPractice,  setShowPractice]  = useState(true);
  const [showStudio,    setShowStudio]    = useState(true);
  const [showPrices,    setShowPrices]    = useState(true);
  const [showHours,     setShowHours]     = useState(true);
  const [showTemplates, setShowTemplates] = useState(true);

  // ─── Studio branding (tabella studios, multi-tenancy) ──────────────────────
  const { studio, refresh: refreshStudio } = useCurrentStudio();
  const [studioName, setStudioName] = useState("");
  const [studioAddress, setStudioAddress] = useState("");
  const [studioPhone, setStudioPhone] = useState("");
  const [studioEmail, setStudioEmail] = useState("");
  const [studioGoogleReview, setStudioGoogleReview] = useState("");
  const [studioSignatureName, setStudioSignatureName] = useState("");
  const [studioSignatureTitle, setStudioSignatureTitle] = useState("");
  const [studioWebsite, setStudioWebsite] = useState("");
  const [savingStudio, setSavingStudio] = useState(false);

  // Firma dinamica per TemplateEditor
  const dynamicSignature = useMemo(() => {
    return [studioSignatureName, studioSignatureTitle].filter(s => s.trim()).join("\n");
  }, [studioSignatureName, studioSignatureTitle]);

  // Popola i campi studio quando arriva il contesto
  useEffect(() => {
    if (!studio) return;
    setStudioName(studio.name || "");
    setStudioAddress(studio.address || "");
    setStudioPhone(studio.phone || "");
    setStudioEmail(studio.email || "");
    setStudioGoogleReview(studio.google_review_link || "");
    setStudioSignatureName(studio.signature_name || "");
    setStudioSignatureTitle(studio.signature_title || "");
    setStudioWebsite(studio.website || "");
  }, [studio]);

  const saveStudio = useCallback(async () => {
    if (!studio?.id) { alert("Studio non disponibile"); return; }
    if (!studioName.trim()) { alert("Il nome dello studio è obbligatorio"); return; }
    setSavingStudio(true);
    try {
      const { error } = await supabase.from("studios").update({
        name:               studioName.trim(),
        address:            studioAddress.trim() || null,
        phone:              studioPhone.trim() || null,
        email:              studioEmail.trim() || null,
        google_review_link: studioGoogleReview.trim() || null,
        signature_name:     studioSignatureName.trim() || null,
        signature_title:    studioSignatureTitle.trim() || null,
        website:            studioWebsite.trim() || null,
      }).eq("id", studio.id);
      if (error) { alert("Errore: " + error.message); return; }
      await refreshStudio();
      flashSuccess("Studio salvato.");
    } finally {
      setSavingStudio(false);
    }
  }, [studio, studioName, studioAddress, studioPhone, studioEmail,
      studioGoogleReview, studioSignatureName, studioSignatureTitle, studioWebsite,
      refreshStudio]);

  // Working hours state — 7 righe (1 per giorno della settimana, 0-6)
  const [workingHours, setWorkingHours] = useState<WorkingHourRow[]>([]);
  const [loadingHours, setLoadingHours] = useState(true);
  const [savingHours, setSavingHours]   = useState(false);

  // Practice fields
  const [practiceName,   setPracticeName]   = useState("");
  const [logoBase64,     setLogoBase64]     = useState("");  // base64 logo studio
  const [defaultApptStatus, setDefaultApptStatus] = useState<"confirmed"|"booked">("confirmed");
  const [overlapMode, setOverlapMode] = useState<"block"|"warn"|"visual">("warn");
  const [ownerFullName,  setOwnerFullName]  = useState("");
  const [vatNumber,      setVatNumber]      = useState("");
  const [address,        setAddress]        = useState("");
  const [pecEmail,       setPecEmail]       = useState("");
  const [phone,          setPhone]          = useState("");

  // Google Review
  const [googleReviewLink, setGoogleReviewLink] = useState("");

  // Price fields
  const [standardInvoice, setStandardInvoice] = useState("40.00");
  const [standardCash,    setStandardCash]    = useState("35.00");
  const [machineInvoice,  setMachineInvoice]  = useState("25.00");
  const [machineCash,     setMachineCash]     = useState("20.00");
  const [laserInvoice,    setLaserInvoice]    = useState("30.00");
  const [laserCash,       setLaserCash]       = useState("25.00");
  const [tecarInvoice,    setTecarInvoice]    = useState("30.00");
  const [tecarCash,       setTecarCash]       = useState("25.00");
  const [ondeUrtoInvoice, setOndeUrtoInvoice] = useState("40.00");
  const [ondeUrtoCash,    setOndeUrtoCash]    = useState("35.00");
  const [tensInvoice,     setTensInvoice]     = useState("20.00");
  const [tensCash,        setTensCash]        = useState("15.00");
  const [autoApplyPrices, setAutoApplyPrices] = useState(true);

  // Durate per tipo trattamento (minuti)
  const [durSeduta,    setDurSeduta]    = useState("60");
  const [durMacchina,  setDurMacchina]  = useState("30");
  const [durLaser,     setDurLaser]     = useState("20");
  const [durTecar,     setDurTecar]     = useState("30");
  const [durOndeUrto,  setDurOndeUrto]  = useState("15");
  const [durTens,      setDurTens]      = useState("20");

  // Messaggi automatici
  const [welcomeMsg,        setWelcomeMsg]        = useState("");
  const [bookingConfirmMsg,  setBookingConfirmMsg]  = useState("");
  const [reminderMsg,        setReminderMsg]        = useState("");
  const [paymentMsg,         setPaymentMsg]         = useState("");
  const [birthdayMsg,        setBirthdayMsg]        = useState("");
  const [satisfactionMsg,    setSatisfactionMsg]    = useState("");

  // Gestione
  const [monthlyGoal,      setMonthlyGoal]      = useState("2000");
  const [inactiveThresh,   setInactiveThresh]   = useState("45");
  const [reminderHours,    setReminderHours]    = useState("24");

  // Sezioni accordion
  const [showDurations,  setShowDurations]  = useState(false);
  const [showGestione,   setShowGestione]   = useState(false);
  const [showPassword,   setShowPassword]   = useState(false);
  const [showBackup,     setShowBackup]     = useState(false);

  // Cambio password
  const [pwCurrent,  setPwCurrent]  = useState("");
  const [pwNew,      setPwNew]      = useState("");
  const [pwConfirm,  setPwConfirm]  = useState("");
  const [pwSaving,   setPwSaving]   = useState(false);
  const [pwError,    setPwError]    = useState("");
  const [pwSuccess,  setPwSuccess]  = useState("");

  // Servizi prenotabili
  const [showServices,   setShowServices]   = useState(false);
  const [services,       setServices]       = useState<{id:string;name:string;duration:number;price:number}[]>([]);
  const [loadingServices,setLoadingServices] = useState(false);
  const [newSvcName,     setNewSvcName]     = useState("");
  const [newSvcDuration, setNewSvcDuration] = useState("60");
  const [newSvcPrice,    setNewSvcPrice]    = useState("40");
  const [savingSvc,      setSavingSvc]      = useState(false);

  // Giorni di blocco
  const [showBlockDays,  setShowBlockDays]  = useState(false);
  const [blockDays,      setBlockDays]      = useState<{id:string;date:string;label:string}[]>([]);
  const [loadingBlock,   setLoadingBlock]   = useState(false);
  const [newBlockDate,   setNewBlockDate]   = useState("");
  const [newBlockLabel,  setNewBlockLabel]  = useState("");
  const [savingBlock,    setSavingBlock]    = useState(false);

  useEffect(() => {
    void (async () => {
      setError("");
      await Promise.all([loadPracticeSettings(), loadTemplates(), loadWorkingHours(), loadServices(), loadBlockDays()]);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Working hours: load / save ────────────────────────────────────────────
  async function loadWorkingHours() {
    setLoadingHours(true);
    try {
      const { data, error } = await supabase
        .from("working_hours")
        .select("day_of_week, open_time, close_time, is_open")
        .order("day_of_week", { ascending: true });
      if (error) throw new Error(error.message);

      // Costruisce sempre 7 righe (0-6), riempiendo con default se mancano
      const byDay = new Map<number, WorkingHourRow>();
      (data || []).forEach((r: any) => {
        byDay.set(r.day_of_week, {
          day_of_week: r.day_of_week,
          open_time: (r.open_time || "09:00").slice(0, 5),
          close_time: (r.close_time || "19:00").slice(0, 5),
          is_open: r.is_open ?? true,
        });
      });

      const complete: WorkingHourRow[] = [];
      for (let d = 0; d < 7; d++) {
        complete.push(byDay.get(d) ?? {
          day_of_week: d,
          open_time: "09:00",
          close_time: "19:00",
          is_open: d !== 0, // di default Domenica chiusa
        });
      }
      setWorkingHours(complete);
    } catch (e: any) {
      console.warn("Errore caricamento orari:", e?.message);
      // Fallback a valori di default
      const fallback: WorkingHourRow[] = [];
      for (let d = 0; d < 7; d++) {
        fallback.push({ day_of_week: d, open_time: "09:00", close_time: "19:00", is_open: d !== 0 });
      }
      setWorkingHours(fallback);
    } finally {
      setLoadingHours(false);
    }
  }

  async function saveWorkingHours() {
    setSavingHours(true);
    setError("");
    try {
      // Valida: se is_open, open_time deve essere < close_time
      for (const r of workingHours) {
        if (r.is_open && r.open_time >= r.close_time) {
          throw new Error(`${DAY_LABELS[r.day_of_week]}: l'ora di apertura deve essere precedente alla chiusura.`);
        }
      }
      const payload = workingHours.map(r => ({
        day_of_week: r.day_of_week,
        open_time: r.open_time,
        close_time: r.close_time,
        is_open: r.is_open,
      }));
      const { error } = await supabase
        .from("working_hours")
        .upsert(payload, { onConflict: "day_of_week" });
      if (error) throw new Error(error.message);
      flashSuccess("Orari salvati.");
    } catch (e: any) {
      setError(e?.message ?? "Errore nel salvataggio degli orari.");
    } finally {
      setSavingHours(false);
    }
  }

  function updateHour(day: number, patch: Partial<WorkingHourRow>) {
    setWorkingHours(prev => prev.map(r => r.day_of_week === day ? { ...r, ...patch } : r));
  }

  // ── Servizi prenotabili ──────────────────────────────────────────────────
  async function loadServices() {
    setLoadingServices(true);
    try {
      const { data } = await supabase.from("booking_services").select("*").order("name");
      setServices((data || []) as any[]);
    } catch(e) { console.warn(e); }
    finally { setLoadingServices(false); }
  }
  async function addService() {
    if (!newSvcName.trim()) return;
    setSavingSvc(true);
    try {
      await supabase.from("booking_services").insert({ name: newSvcName.trim(), duration: parseInt(newSvcDuration)||60, price: parseFloat(newSvcPrice)||40 });
      setNewSvcName(""); setNewSvcDuration("60"); setNewSvcPrice("40");
      await loadServices();
    } catch(e:any) { setError(e?.message||"Errore"); }
    finally { setSavingSvc(false); }
  }
  async function deleteService(id: string) {
    if (!confirm("Eliminare questo servizio?")) return;
    await supabase.from("booking_services").delete().eq("id", id);
    await loadServices();
  }

  // ── Giorni di blocco ─────────────────────────────────────────────────────
  async function loadBlockDays() {
    setLoadingBlock(true);
    try {
      const { data } = await supabase.from("blocked_days").select("*").order("date");
      setBlockDays((data || []) as any[]);
    } catch(e) { console.warn(e); }
    finally { setLoadingBlock(false); }
  }
  async function addBlockDay() {
    if (!newBlockDate) return;
    setSavingBlock(true);
    try {
      await supabase.from("blocked_days").insert({ date: newBlockDate, label: newBlockLabel.trim() || "Chiuso" });
      setNewBlockDate(""); setNewBlockLabel("");
      await loadBlockDays();
    } catch(e:any) { setError(e?.message||"Errore"); }
    finally { setSavingBlock(false); }
  }
  async function deleteBlockDay(id: string) {
    await supabase.from("blocked_days").delete().eq("id", id);
    await loadBlockDays();
  }

  // ── Cambio password ───────────────────────────────────────────────────────
  async function changePassword() {
    setPwError(""); setPwSuccess("");
    if (!pwNew.trim()) { setPwError("Inserisci la nuova password."); return; }
    if (pwNew.length < 8) { setPwError("La password deve essere di almeno 8 caratteri."); return; }
    if (pwNew !== pwConfirm) { setPwError("Le password non coincidono."); return; }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwNew });
      if (error) throw new Error(error.message);
      setPwSuccess("Password aggiornata con successo.");
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
    } catch(e:any) { setPwError(e?.message||"Errore aggiornamento password."); }
    finally { setPwSaving(false); }
  }

  // ── Backup dati ───────────────────────────────────────────────────────────
  const [exportingBackup, setExportingBackup] = useState(false);
  async function exportBackup() {
    setExportingBackup(true);
    try {
      const [{ data: pts }, { data: appts }, { data: nols }] = await Promise.all([
        supabase.from("patients").select("*").order("last_name"),
        supabase.from("appointments").select("*,patients:patient_id(first_name,last_name)").order("start_at", { ascending: false }),
        supabase.from("noleggios").select("*").order("created_at", { ascending: false }),
      ]);
      const esc = (v: any) => { const s = String(v ?? ""); if (s.indexOf(";") >= 0 || s.indexOf('"'  ) >= 0 || s.indexOf("\n") >= 0 || s.indexOf("\r") >= 0) return `"${s.replace(/"/g, '""'  )}"`;  return s; };

      const bom = "﻿";

      // Pazienti
      const ptHeaders = ["ID","Cognome","Nome","Telefono","Data nascita","Codice fiscale","Indirizzo","Piano fatturazione","Creato il"];
      const ptRows = (pts||[]).map((p:any) => [p.id,p.last_name,p.first_name,p.phone,p.birth_date,p.tax_code,p.res_city,p.preferred_plan,p.created_at?.slice(0,10)].map(esc).join(";"));
      const ptCsv = bom + [ptHeaders.map(esc).join(";"), ...ptRows].join("\r\n");

      // Appuntamenti
      const apHeaders = ["Data","Ora","Cognome","Nome","Stato","Tipo","Importo","Pagato","Sede","Fatturazione"];
      const apRows = (appts||[]).map((a:any) => {
        const p = Array.isArray(a.patients) ? a.patients[0] : a.patients;
        return [a.start_at?.slice(0,10),a.start_at?.slice(11,16),p?.last_name,p?.first_name,a.status,a.treatment_type,a.amount,a.is_paid?"Si":"No",a.clinic_site||a.location,a.price_type].map(esc).join(";");
      });
      const apCsv = bom + [apHeaders.map(esc).join(";"), ...apRows].join("\r\n");

      // Noleggii
      const nlHeaders = ["Paziente","Dispositivo","Data inizio","Data fine","Prezzo/gg","Totale","Pagato","Reso"];
      const nlRows = (nols||[]).map((n:any) => [n.patient_name,n.device_name,n.start_date,n.end_date,n.price_per_day,n.total_amount,n.is_paid?"Si":"No",n.is_returned?"Si":"No"].map(esc).join(";"));
      const nlCsv = bom + [nlHeaders.map(esc).join(";"), ...nlRows].join("\r\n");

      const timestamp = new Date().toISOString().slice(0,10);
      [
        { data: ptCsv, name: `fisiohub_pazienti_${timestamp}.csv` },
        { data: apCsv, name: `fisiohub_appuntamenti_${timestamp}.csv` },
        { data: nlCsv, name: `fisiohub_noleggii_${timestamp}.csv` },
      ].forEach(({ data, name }) => {
        const blob = new Blob([data], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
      flashSuccess("Backup scaricato: 3 file CSV (pazienti, appuntamenti, noleggii).");
    } catch(e:any) { setError(e?.message||"Errore durante il backup."); }
    finally { setExportingBackup(false); }
  }

  function flashSuccess(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  }

  async function requireUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(error.message);
    const uid = data?.user?.id;
    if (!uid) throw new Error("Utente non autenticato.");
    return uid;
  }

  async function loadPracticeSettings() {
    setLoadingPractice(true);
    setError("");
    try {
      const uid = await requireUserId();
      const { data, error } = await supabase
        .from("practice_settings")
        .select("owner_id, practice_name, owner_full_name, vat_number, address, pec_email, phone, google_review_link, logo_base64, standard_invoice, standard_cash, machine_invoice, machine_cash, laser_invoice, laser_cash, tecar_invoice, tecar_cash, onde_urto_invoice, onde_urto_cash, tens_invoice, tens_cash, auto_apply_prices, reminder_message, payment_message, birthday_message, satisfaction_message, default_appointment_status, overlap_mode")
        .eq("owner_id", uid)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        const { data: uData, error: uErr } = await supabase.auth.getUser();
        if (uErr) throw new Error(uErr.message);
        const u = uData?.user;
        const fullName = ((u?.user_metadata?.full_name || u?.user_metadata?.name || [u?.user_metadata?.first_name, u?.user_metadata?.last_name].filter(Boolean).join(" ") || u?.email || "Titolare") + "").trim() || "Titolare";
        const seed: PracticeSettingsRow = { owner_id: uid, practice_name: "FisioHub", owner_full_name: fullName, vat_number: "", address: "", pec_email: "", phone: "", google_review_link: "", logo_base64: null, standard_invoice: 40, standard_cash: 35, machine_invoice: 25, machine_cash: 20, laser_invoice: 30, laser_cash: 25, tecar_invoice: 30, tecar_cash: 25, onde_urto_invoice: 40, onde_urto_cash: 35, tens_invoice: 20, tens_cash: 15, duration_seduta: 60, duration_macchinario: 30, duration_laser: 20, duration_tecar: 30, duration_onde_urto: 15, duration_tens: 20, welcome_message: null, booking_confirm_message: null, reminder_message: null, payment_message: null, birthday_message: null, satisfaction_message: null, default_appointment_status: "confirmed", overlap_mode: "warn", monthly_revenue_goal: 2000, inactive_threshold_days: 45, reminder_hours_before: 24, auto_apply_prices: true };
        const { error: upsertErr } = await supabase.from("practice_settings").upsert(seed, { onConflict: "owner_id" });
        if (upsertErr) throw new Error(upsertErr.message);
        return await loadPracticeSettings();
      }
      setPracticeName(data.practice_name ?? "");
      setLogoBase64((data as any).logo_base64 ?? "");
      setOwnerFullName(data.owner_full_name ?? "");
      setVatNumber(data.vat_number ?? "");
      setAddress(data.address ?? "");
      setPecEmail(data.pec_email ?? "");
      setPhone(data.phone ?? "");
      setGoogleReviewLink(data.google_review_link ?? "");
      setStandardInvoice(toMoneyString(data.standard_invoice, "40.00"));
      setStandardCash(toMoneyString(data.standard_cash, "35.00"));
      setMachineInvoice(toMoneyString(data.machine_invoice, "25.00"));
      setMachineCash(toMoneyString(data.machine_cash, "20.00"));
      setLaserInvoice(toMoneyString((data as any).laser_invoice, "30.00"));
      setLaserCash(toMoneyString((data as any).laser_cash, "25.00"));
      setTecarInvoice(toMoneyString((data as any).tecar_invoice, "30.00"));
      setTecarCash(toMoneyString((data as any).tecar_cash, "25.00"));
      setOndeUrtoInvoice(toMoneyString((data as any).onde_urto_invoice, "40.00"));
      setOndeUrtoCash(toMoneyString((data as any).onde_urto_cash, "35.00"));
      setTensInvoice(toMoneyString((data as any).tens_invoice, "20.00"));
      setTensCash(toMoneyString((data as any).tens_cash, "15.00"));
      setAutoApplyPrices(data.auto_apply_prices ?? true);
      setDurSeduta(String((data as any).duration_seduta ?? 60));
      setDurMacchina(String((data as any).duration_macchinario ?? 30));
      setDurLaser(String((data as any).duration_laser ?? 20));
      setDurTecar(String((data as any).duration_tecar ?? 30));
      setDurOndeUrto(String((data as any).duration_onde_urto ?? 15));
      setDurTens(String((data as any).duration_tens ?? 20));
      setWelcomeMsg((data as any).welcome_message ?? "");
      setBookingConfirmMsg((data as any).booking_confirm_message ?? "");
      setReminderMsg((data as any).reminder_message ?? "");
      setPaymentMsg((data as any).payment_message ?? "");
      setBirthdayMsg((data as any).birthday_message ?? "");
      setSatisfactionMsg((data as any).satisfaction_message ?? "");
      setDefaultApptStatus(((data as any).default_appointment_status ?? "confirmed") as "confirmed"|"booked");
      setOverlapMode(((data as any).overlap_mode ?? "warn") as "block"|"warn"|"visual");
      setMonthlyGoal(String((data as any).monthly_revenue_goal ?? 2000));
      setInactiveThresh(String((data as any).inactive_threshold_days ?? 45));
      setReminderHours(String((data as any).reminder_hours_before ?? 24));
    } catch (e: any) {
      setError(e?.message ?? "Errore nel caricamento impostazioni.");
    } finally {
      setLoadingPractice(false);
    }
  }

  async function savePracticeSettings() {
    setSavingPractice(true);
    setError("");
    try {
      const uid = await requireUserId();
      const payload: PracticeSettingsRow = {
        owner_id:        uid,
        practice_name:   practiceName.trim() || "FisioHub",
        logo_base64:     logoBase64 || null,
        owner_full_name: ownerFullName.trim() || "Titolare",
        vat_number:      vatNumber.trim() || "",
        address:         address.trim() || "",
        pec_email:       pecEmail.trim() || "",
        phone:           phone.trim() || "",
        google_review_link: googleReviewLink.trim() || "",
        standard_invoice: toNumberSafe(standardInvoice, 40),
        standard_cash:    toNumberSafe(standardCash, 35),
        machine_invoice:  toNumberSafe(machineInvoice, 25),
        machine_cash:     toNumberSafe(machineCash, 20),
        laser_invoice:    toNumberSafe(laserInvoice, 30),
        laser_cash:       toNumberSafe(laserCash, 25),
        tecar_invoice:    toNumberSafe(tecarInvoice, 30),
        tecar_cash:       toNumberSafe(tecarCash, 25),
        onde_urto_invoice:toNumberSafe(ondeUrtoInvoice, 40),
        onde_urto_cash:   toNumberSafe(ondeUrtoCash, 35),
        tens_invoice:     toNumberSafe(tensInvoice, 20),
        tens_cash:        toNumberSafe(tensCash, 15),
        auto_apply_prices: autoApplyPrices,
        duration_seduta:       parseInt(durSeduta) || 60,
        duration_macchinario:  parseInt(durMacchina) || 30,
        duration_laser:        parseInt(durLaser) || 20,
        duration_tecar:        parseInt(durTecar) || 30,
        duration_onde_urto:    parseInt(durOndeUrto) || 15,
        duration_tens:         parseInt(durTens) || 20,
        welcome_message:          welcomeMsg.trim() || null,
        booking_confirm_message:  bookingConfirmMsg.trim() || null,
        reminder_message:         reminderMsg.trim() || null,
        payment_message:          paymentMsg.trim() || null,
        birthday_message:         birthdayMsg.trim() || null,
        satisfaction_message:     satisfactionMsg.trim() || null,
        default_appointment_status: defaultApptStatus,
        overlap_mode: overlapMode,
        monthly_revenue_goal:  parseFloat(monthlyGoal) || 2000,
        inactive_threshold_days: parseInt(inactiveThresh) || 45,
        reminder_hours_before: parseInt(reminderHours) || 24,
      };
      const { error } = await supabase.from("practice_settings").upsert(payload, { onConflict: "owner_id" });
      if (error) throw new Error(error.message);
      flashSuccess("Impostazioni salvate.");
    } catch (e: any) {
      setError(e?.message ?? "Errore nel salvataggio.");
    } finally {
      setSavingPractice(false);
    }
  }

  async function loadTemplates() {
    setLoadingTemplates(true);
    setError("");
    try {
      const { data, error } = await supabase.from("message_templates").select("*").order("is_default", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      setTemplates((data as MessageTemplate[]) || []);
    } catch (e: any) {
      setError(e?.message ?? "Errore nel caricamento dei template");
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function saveTemplate(id: string) {
    if (!editName.trim() || !editTemplate.trim()) { setError("Nome e template sono obbligatori"); return; }
    setError("");
    try {
      const { error } = await supabase.from("message_templates").update({ name: editName.trim(), template: editTemplate.trim(), updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
      flashSuccess("Template salvato.");
      setEditingId(null);
      await loadTemplates();
    } catch (e: any) { setError(e?.message ?? "Errore nel salvataggio del template"); }
  }

  async function deleteTemplate(id: string) {
    if (templates.length <= 1) { setError("Non puoi eliminare l'unico template disponibile"); return; }
    const t = templates.find(t => t.id === id);
    if (!t) return;
    if (!confirm("Eliminare questo template? L'operazione non può essere annullata.")) return;
    setError("");
    try {
      if (t.is_default) {
        const other = templates.find(x => x.id !== id);
        if (other) { const { error: e1 } = await supabase.from("message_templates").update({ is_default: true }).eq("id", other.id); if (e1) throw new Error(e1.message); }
      }
      const { error } = await supabase.from("message_templates").delete().eq("id", id);
      if (error) throw new Error(error.message);
      flashSuccess("Template eliminato.");
      await loadTemplates();
    } catch (e: any) { setError(e?.message ?? "Errore nell'eliminazione"); }
  }

  async function setAsDefault(id: string) {
    setError("");
    try {
      const { error: e1 } = await supabase.from("message_templates").update({ is_default: false }).neq("id", id);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await supabase.from("message_templates").update({ is_default: true }).eq("id", id);
      if (e2) throw new Error(e2.message);
      flashSuccess("Template impostato come predefinito.");
      await loadTemplates();
    } catch (e: any) { setError(e?.message ?? "Errore"); }
  }

  async function createNewTemplate() {
    if (!newName.trim() || !newTemplate.trim()) { setError("Nome e template sono obbligatori"); return; }
    setError("");
    try {
      const { error } = await supabase.from("message_templates").insert({ name: newName.trim(), template: newTemplate.trim(), is_default: templates.length === 0 });
      if (error) throw new Error(error.message);
      flashSuccess("Nuovo template creato.");
      setNewName(""); setNewTemplate(""); setAddingNew(false);
      await loadTemplates();
    } catch (e: any) { setError(e?.message ?? "Errore nella creazione"); }
  }

  // ─── Shared styles ────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 7,
    border: `1.5px solid ${THEME.border}`, fontSize: 13, fontWeight: 500,
    outline: "none", background: "#fff", color: THEME.text, boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 700,
    color: THEME.muted, marginBottom: 4,
    textTransform: "uppercase", letterSpacing: 0.4,
  };
  const cardStyle: React.CSSProperties = {
    background: THEME.panelBg, borderRadius: 12,
    border: `1px solid ${THEME.border}`,
    boxShadow: "0 1px 4px rgba(15,23,42,0.05)",
    overflow: "hidden", marginBottom: 16,
  };
  const sectionHead: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 20px", cursor: "pointer",
    borderBottom: `1px solid ${THEME.border}`,
  };

  const btnPrimary = (label: string, onClick: () => void, disabled = false): React.ReactNode => (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "9px 20px", borderRadius: 7, border: "none",
      background: disabled ? THEME.gray : "linear-gradient(135deg, #0d9488, #2563eb)",
      color: "#fff", fontWeight: 700, fontSize: 13,
      cursor: disabled ? "not-allowed" : "pointer",
      boxShadow: disabled ? "none" : "0 2px 8px rgba(13,148,136,0.2)",
    }}>{label}</button>
  );
  const btnOutline = (label: string, onClick: () => void, color = THEME.muted, disabled = false): React.ReactNode => (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "9px 16px", borderRadius: 7, border: `1px solid ${THEME.border}`,
      background: "#fff", color, fontWeight: 700, fontSize: 13,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
    }}>{label}</button>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: THEME.appBg, fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif" }}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        *{-webkit-font-smoothing:antialiased;box-sizing:border-box;}
        body{font-family:'Outfit','Segoe UI',system-ui,sans-serif;margin:0;background:${THEME.appBg};}
        a{text-decoration:none;}
        select,input,textarea,button{font-family:inherit;}
        input:focus,select:focus,textarea:focus{border-color:${THEME.blue}!important;box-shadow:0 0 0 3px rgba(37,99,235,0.10)!important;outline:none!important;}
        @media(min-width:768px)and(max-width:1024px){.th{display:none!important}}
      `}</style>

      {/* ━━━ NAVBAR ━━━ */}
      <header style={{ position:"sticky", top:0, zIndex:30, background:"linear-gradient(135deg,#0d9488,#2563eb)", padding:"0 20px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:"0 2px 12px rgba(13,148,136,0.18)", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:20, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:30, height:30, borderRadius:8, background:"rgba(255,255,255,0.2)", border:"1.5px solid rgba(255,255,255,0.3)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:14 }}>F</div>
            <span style={{ fontWeight:700, fontSize:15, color:"#fff", letterSpacing:0.5, textTransform:"uppercase" }}>Fisio<span style={{ fontWeight:800 }}>Hub</span></span>
          </div>
          <nav style={{ display:"flex", gap:2 }}>
            {([
              { href:"/",         label:"Home",          active:false },
              { href:"/calendar", label:"Calendario",    active:false },
              { href:"/reports",  label:"Report",        active:false },
              { href:"/patients", label:"Pazienti",      active:false },
              { href:"/noleggio",  label:"Noleggio",      active:false },
              { href:"/settings", label:"Impostazioni",  active:true  },
            ] as const).map(item => (
              <Link key={item.href} href={item.href} style={{ padding:"6px 12px", borderRadius:8, fontSize:12, fontWeight:700, background:item.active?"rgba(255,255,255,0.2)":"transparent", color:item.active?"#fff":"rgba(255,255,255,0.8)", letterSpacing:0.3 }}>
                <span className="th">{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          <div ref={userMenuRef} style={{ position:"relative" }}>
            <button onClick={() => setUserMenuOpen(v => !v)} style={{ width:32, height:32, borderRadius:8, border:"1.5px solid rgba(255,255,255,0.35)", background:"rgba(255,255,255,0.2)", color:"#fff", fontWeight:800, fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>{userInitials}</button>
            {userMenuOpen && (
              <div style={{ position:"absolute", right:0, top:"calc(100% + 8px)", width:200, background:"#fff", border:`1px solid ${THEME.border}`, borderRadius:10, boxShadow:"0 8px 24px rgba(15,23,42,0.10)", overflow:"hidden", zIndex:60 }}>
                <div style={{ padding:"11px 16px", borderBottom:`1px solid ${THEME.border}`, fontSize:12, color:THEME.muted }}>{userEmail}</div>
                <button onClick={handleLogout} style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"11px 16px", background:"transparent", border:"none", cursor:"pointer", color:THEME.red, fontWeight:600, fontSize:13 }}>Logout</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ━━━ MAIN ━━━ */}
      <main style={{ padding:"28px 32px", maxWidth:900, margin:"0 auto" }}>

        {/* Page title */}
        <div style={{ marginBottom:24 }}>
          <h1 style={{ margin:0, fontWeight:800, fontSize:24, color:THEME.text, letterSpacing:-0.4 }}>Impostazioni</h1>
          <p style={{ margin:"4px 0 0", fontSize:13, color:THEME.muted }}>Dati studio · Tariffe trattamenti · Template WhatsApp</p>
        </div>

        {/* Feedback banners */}
        {error && (
          <div style={{ marginBottom:16, padding:"11px 16px", borderRadius:8, background:"rgba(220,38,38,0.05)", border:"1px solid rgba(220,38,38,0.2)", color:THEME.red, fontWeight:600, fontSize:13 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ marginBottom:16, padding:"11px 16px", borderRadius:8, background:"rgba(22,163,74,0.06)", border:"1px solid rgba(22,163,74,0.2)", color:THEME.green, fontWeight:600, fontSize:13 }}>
            {success}
          </div>
        )}

        {/* ── SEZIONE STUDIO (branding multi-tenancy) ──────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionHead} onClick={() => setShowStudio(!showStudio)}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>
                🏥 Il tuo Studio
              </div>
              <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
                Nome, indirizzo, firma messaggi · Usato in WhatsApp, PDF, link pubblici
              </div>
            </div>
            <span style={{ color: THEME.muted, fontSize: 12, transform: showStudio ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
          </div>

          {showStudio && (
            <div style={{ padding: "20px" }}>
              <div style={{ padding: "12px 16px", borderRadius: 8, background: "rgba(13,148,136,0.05)", border: `1px solid rgba(13,148,136,0.2)`, marginBottom: 20, fontSize: 12, color: THEME.muted }}>
                <strong style={{ color: THEME.teal }}>💡 Suggerimento:</strong> questi dati vengono usati automaticamente nei messaggi WhatsApp, nei PDF e nelle pagine pubbliche (portale paziente, conferma appuntamenti). Compila soprattutto la firma — sarà il nome mostrato ai tuoi pazienti.
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Nome studio *</label>
                  <input
                    value={studioName}
                    onChange={e => setStudioName(e.target.value)}
                    placeholder="Es. FisioHub"
                    style={inputStyle}
                  />
                  <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
                    Nome che identifica il tuo studio nel sistema
                  </div>
                </div>

                <div style={{ gridColumn: "1 / -1", marginTop: 8, paddingTop: 16, borderTop: `1px solid ${THEME.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: THEME.text, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Firma nei messaggi WhatsApp
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Nome operatore *</label>
                  <input
                    value={studioSignatureName}
                    onChange={e => setStudioSignatureName(e.target.value)}
                    placeholder="Es. Dr. Mario Rossi"
                    style={inputStyle}
                  />
                  <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
                    Firma dell'operatore nei messaggi
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Qualifica professionale</label>
                  <input
                    value={studioSignatureTitle}
                    onChange={e => setStudioSignatureTitle(e.target.value)}
                    placeholder="Es. Fisioterapia e Osteopatia"
                    style={inputStyle}
                  />
                  <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
                    Specialità/disciplina sotto la firma
                  </div>
                </div>

                <div style={{ gridColumn: "1 / -1", marginTop: 8, paddingTop: 16, borderTop: `1px solid ${THEME.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: THEME.text, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Contatti e indirizzo
                  </div>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Indirizzo studio</label>
                  <input
                    value={studioAddress}
                    onChange={e => setStudioAddress(e.target.value)}
                    placeholder="Es. Via Roma 10, 20100 Milano (MI)"
                    style={inputStyle}
                  />
                  <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
                    Indirizzo mostrato nei messaggi di promemoria
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Telefono</label>
                  <input
                    value={studioPhone}
                    onChange={e => setStudioPhone(e.target.value)}
                    placeholder="Es. +39 333 1234567"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    value={studioEmail}
                    onChange={e => setStudioEmail(e.target.value)}
                    placeholder="info@fisiohub.it"
                    style={inputStyle}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Sito web (opzionale)</label>
                  <input
                    value={studioWebsite}
                    onChange={e => setStudioWebsite(e.target.value)}
                    placeholder="https://www.miostudio.it"
                    style={inputStyle}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Link recensioni Google</label>
                  <input
                    value={studioGoogleReview}
                    onChange={e => setStudioGoogleReview(e.target.value)}
                    placeholder="https://g.page/r/..."
                    style={inputStyle}
                  />
                  {studioGoogleReview && (
                    <div style={{ marginTop: 6, fontSize: 11, color: THEME.teal, fontWeight: 600 }}>
                      ✓ Configurato — sarà usato nel messaggio di richiesta recensione
                    </div>
                  )}
                  {!studioGoogleReview && (
                    <div style={{ marginTop: 6, fontSize: 11, color: THEME.muted }}>
                      Copialo dalla tua pagina Google Business. Serve per chiedere recensioni ai pazienti via WhatsApp.
                    </div>
                  )}
                </div>
              </div>

              {/* Anteprima firma */}
              {(studioSignatureName || studioSignatureTitle) && (
                <div style={{
                  marginTop: 20, padding: 14, borderRadius: 8,
                  background: "#f8fafc", border: `1px solid ${THEME.border}`,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Anteprima firma nei messaggi
                  </div>
                  <div style={{ fontSize: 13, color: THEME.textSoft, lineHeight: 1.6, whiteSpace: "pre-line" }}>
                    Cordiali saluti,{"\n"}
                    <strong>{studioSignatureName || "[Nome operatore]"}</strong>{"\n"}
                    {studioSignatureTitle || "[Qualifica]"}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                {btnPrimary(savingStudio ? "Salvataggio…" : "Salva dati studio", () => void saveStudio(), savingStudio)}
              </div>
            </div>
          )}
        </div>

        {/* ── SEZIONE STUDIO ─────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionHead} onClick={() => setShowPractice(!showPractice)}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>Dati Studio</div>
              <div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>
                {loadingPractice ? "Caricamento…" : "Anagrafica e contatti dello studio"}
              </div>
            </div>
            <span style={{ color:THEME.muted, fontSize:12, transform:showPractice?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
          </div>

          {showPractice && (
            <div style={{ padding:"20px", opacity:loadingPractice ? 0.7 : 1 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }}>
                {[
                  { label:"Nome studio",            value:practiceName,  set:setPracticeName  },
                  { label:"Titolare (nome cognome)", value:ownerFullName, set:setOwnerFullName },
                  { label:"Partita IVA",             value:vatNumber,     set:setVatNumber     },
                  { label:"Telefono studio",         value:phone,         set:setPhone         },
                  { label:"PEC",                     value:pecEmail,      set:setPecEmail      },
                ].map(f => (
                  <div key={f.label}>
                    <label style={labelStyle}>{f.label}</label>
                    <input value={f.value} onChange={e => f.set(e.target.value)} style={inputStyle} />
                  </div>
                ))}
                <div style={{ gridColumn:"1 / -1" }}>
                  <label style={labelStyle}>Indirizzo</label>
                  <input value={address} onChange={e => setAddress(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={labelStyle}>Logo studio (appare su PDF, ricevute, schede esercizi)</label>
                  <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
                    {logoBase64 && <img src={logoBase64} alt="Logo" style={{ height:48, objectFit:"contain", borderRadius:6, border:`1px solid ${THEME.border}` }}/>}
                    <label style={{ padding:"8px 16px", borderRadius:7, border:`1.5px solid ${THEME.teal}`, background:"rgba(13,148,136,0.06)", color:THEME.teal, fontWeight:700, fontSize:12, cursor:"pointer", display:"inline-block" }}>
                      {logoBase64?"📷 Cambia logo":"📷 Carica logo"}
                      <input type="file" accept="image/*" style={{ display:"none" }} onChange={e=>{
                        const file=e.target.files?.[0]; if(!file)return;
                        if(file.size>200000){alert("Logo max 200KB");return;}
                        const r=new FileReader(); r.onload=ev=>setLogoBase64(ev.target!.result as string); r.readAsDataURL(file);
                      }}/>
                    </label>
                    {logoBase64&&<button onClick={()=>setLogoBase64("")} style={{ padding:"8px 12px", borderRadius:7, border:`1px solid ${THEME.border}`, background:"transparent", color:THEME.muted, fontWeight:600, fontSize:12, cursor:"pointer" }}>✕ Rimuovi</button>}
                    <span style={{ fontSize:11, color:THEME.muted }}>Max 200KB · PNG/JPG · appare su tutti i documenti generati</span>
                  </div>
                </div>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={labelStyle}>Link Google Review (per richiesta recensioni WA)</label>
                  <input
                    value={googleReviewLink}
                    onChange={e => setGoogleReviewLink(e.target.value)}
                    placeholder="https://g.page/r/..."
                    style={inputStyle}
                  />
                  {googleReviewLink && (
                    <div style={{ marginTop:6, fontSize:11, color:THEME.teal, fontWeight:600 }}>
                      ✓ Link configurato — verrà usato nei messaggi WhatsApp di richiesta recensione
                    </div>
                  )}
                  {!googleReviewLink && (
                    <div style={{ marginTop:6, fontSize:11, color:THEME.amber, fontWeight:600 }}>
                      ⚠ Link non configurato — il bottone recensione nel calendario non funzionerà correttamente
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                {btnOutline("Ricarica", () => void loadPracticeSettings(), THEME.muted, loadingPractice || savingPractice)}
                {btnPrimary(savingPractice ? "Salvataggio…" : "Salva dati studio", () => void savePracticeSettings(), loadingPractice || savingPractice)}
              </div>
            </div>
          )}
        </div>

        {/* ── SEZIONE TARIFFE ─────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionHead} onClick={() => setShowPrices(!showPrices)}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>Tariffe Trattamenti</div>
              <div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>
                {autoApplyPrices ? "Auto-applica attivo" : "Auto-applica disattivo"}
              </div>
            </div>
            <span style={{ color:THEME.muted, fontSize:12, transform:showPrices?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
          </div>

          {showPrices && (
            <div style={{ padding:"20px", opacity:loadingPractice ? 0.7 : 1 }}>
              <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
                {[
                  { title:"Seduta",       subtitle:"Trattamento manuale completo",  iv:standardInvoice, setIv:setStandardInvoice, cv:standardCash,    setCv:setStandardCash,    color:"#0d9488" },
                  { title:"Macchinario",  subtitle:"Terapia strumentale generica",  iv:machineInvoice,  setIv:setMachineInvoice,  cv:machineCash,     setCv:setMachineCash,     color:"#2563eb" },
                  { title:"Laser",        subtitle:"Terapia laser",                 iv:laserInvoice,    setIv:setLaserInvoice,    cv:laserCash,       setCv:setLaserCash,       color:"#d97706" },
                  { title:"Tecar",        subtitle:"Tecarterapia",                  iv:tecarInvoice,    setIv:setTecarInvoice,    cv:tecarCash,       setCv:setTecarCash,       color:"#ea580c" },
                  { title:"Onde d'urto",  subtitle:"Terapia onde d'urto",           iv:ondeUrtoInvoice, setIv:setOndeUrtoInvoice, cv:ondeUrtoCash,    setCv:setOndeUrtoCash,    color:"#7c3aed" },
                  { title:"TENS",         subtitle:"Elettrostimolazione TENS",      iv:tensInvoice,     setIv:setTensInvoice,     cv:tensCash,        setCv:setTensCash,        color:"#059669" },
                ].map(pc => (
                  <div key={pc.title} style={{ padding:14, borderRadius:10, border:`2px solid ${pc.color}22`, background:`${pc.color}08`, display:"flex", alignItems:"center", gap:16 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:140 }}>
                      <div style={{ width:10, height:10, borderRadius:"50%", background:pc.color, flexShrink:0 }}/>
                      <div>
                        <div style={{ fontWeight:700, fontSize:14, color:pc.color }}>{pc.title}</div>
                        <div style={{ fontSize:11, color:THEME.muted }}>{pc.subtitle}</div>
                      </div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, flex:1 }}>
                      <div>
                        <label style={labelStyle}>Con ricevuta</label>
                        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                          <span style={{ fontSize:13, fontWeight:700, color:THEME.muted }}>€</span>
                          <input value={pc.iv} onChange={e => pc.setIv(validatePrice(e.target.value))} style={{ ...inputStyle, textAlign:"right", fontWeight:700, fontSize:14, padding:"7px 10px" }} />
                        </div>
                      </div>
                      <div>
                        <label style={labelStyle}>In contanti</label>
                        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                          <span style={{ fontSize:13, fontWeight:700, color:THEME.muted }}>€</span>
                          <input value={pc.cv} onChange={e => pc.setCv(validatePrice(e.target.value))} style={{ ...inputStyle, textAlign:"right", fontWeight:700, fontSize:14, padding:"7px 10px" }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

              </div>

              <div style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"14px 16px", borderRadius:8, border:`1px solid ${THEME.border}`, background:"#fff", marginBottom:20 }}>
                <input type="checkbox" id="auto-apply" checked={autoApplyPrices} onChange={e => setAutoApplyPrices(e.target.checked)} style={{ width:16, height:16, marginTop:2, cursor:"pointer", color:"#2563eb" }} />
                <label htmlFor="auto-apply" style={{ cursor:"pointer" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:THEME.text }}>Applica automaticamente nei nuovi appuntamenti</div>
                  <div style={{ fontSize:12, color:THEME.muted, marginTop:3 }}>Se disattivato, selezioni il prezzo manualmente per ogni appuntamento.</div>
                </label>
              </div>

              <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                {btnOutline("Ricarica", () => void loadPracticeSettings(), THEME.muted, loadingPractice || savingPractice)}
                {btnPrimary(savingPractice ? "Salvataggio…" : "Salva tariffe", () => void savePracticeSettings(), loadingPractice || savingPractice)}
              </div>
            </div>
          )}
        </div>

        {/* ── SEZIONE ORARI DI LAVORO ────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionHead} onClick={() => setShowHours(!showHours)}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>Orari di Lavoro</div>
              <div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>
                {loadingHours ? "Caricamento…" : `Usati dal sistema di prenotazione online — ${workingHours.filter(h=>h.is_open).length} giorni aperti`}
              </div>
            </div>
            <span style={{ color:THEME.muted, fontSize:12, transform:showHours?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
          </div>

          {showHours && (
            <div style={{ padding:"20px", opacity: loadingHours ? 0.6 : 1 }}>

              <div style={{ fontSize:12, color:THEME.muted, marginBottom:14, lineHeight:1.5 }}>
                Questi orari determinano gli slot disponibili per la <strong>prenotazione online</strong> dal sito pubblico.
                Disattiva un giorno per non accettare prenotazioni automatiche in quella giornata.
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {DAY_ORDER_ISO.map(dayNum => {
                  const h = workingHours.find(w => w.day_of_week === dayNum);
                  if (!h) return null;
                  return (
                    <div key={dayNum} style={{
                      display:"grid",
                      gridTemplateColumns:"110px 80px 1fr 1fr",
                      gap:12,
                      alignItems:"center",
                      padding:"10px 14px",
                      borderRadius:8,
                      border:`1px solid ${THEME.border}`,
                      background: h.is_open ? "#fff" : THEME.panelSoft,
                      opacity: h.is_open ? 1 : 0.6,
                    }}>
                      <div style={{ fontWeight:700, fontSize:13, color:THEME.text }}>{DAY_LABELS[dayNum]}</div>
                      <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:12, fontWeight:600, color: h.is_open ? THEME.teal : THEME.muted }}>
                        <input
                          type="checkbox"
                          checked={h.is_open}
                          onChange={e => updateHour(dayNum, { is_open: e.target.checked })}
                          style={{ width:15, height:15, cursor:"pointer", color:"#2563eb" }}
                        />
                        {h.is_open ? "Aperto" : "Chiuso"}
                      </label>
                      <div>
                        <label style={{ ...labelStyle, marginBottom:3 }}>Apertura</label>
                        <input
                          type="time"
                          value={h.open_time}
                          onChange={e => updateHour(dayNum, { open_time: e.target.value })}
                          disabled={!h.is_open}
                          style={{ ...inputStyle, padding:"6px 10px", fontSize:13, opacity: h.is_open ? 1 : 0.5 }}
                        />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, marginBottom:3 }}>Chiusura</label>
                        <input
                          type="time"
                          value={h.close_time}
                          onChange={e => updateHour(dayNum, { close_time: e.target.value })}
                          disabled={!h.is_open}
                          style={{ ...inputStyle, padding:"6px 10px", fontSize:13, opacity: h.is_open ? 1 : 0.5 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:18 }}>
                {btnOutline("Ricarica", () => void loadWorkingHours(), THEME.muted, loadingHours || savingHours)}
                {btnPrimary(savingHours ? "Salvataggio…" : "Salva orari", () => void saveWorkingHours(), loadingHours || savingHours)}
              </div>
            </div>
          )}
        </div>

        {/* ── SEZIONE MESSAGGI WHATSAPP ────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionHead} onClick={() => setShowTemplates(!showTemplates)}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>💬 Messaggi WhatsApp</div>
              <div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>Template promemoria · Messaggi automatici · Benvenuto</div>
            </div>
            <span style={{ color:THEME.muted, fontSize:12, transform:showTemplates?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
          </div>

          {showTemplates && (
            <div style={{ padding:"20px", display:"flex", flexDirection:"column", gap:28 }}>

              {/* ─── Template promemoria calendario ────────────────────────────── */}
              <div>
                <div style={{ fontSize:13, fontWeight:800, color:THEME.text, marginBottom:14, paddingBottom:8, borderBottom:`1.5px solid ${THEME.border}` }}>
                  📋 Template promemoria calendario
                  <div style={{ fontSize:11, fontWeight:500, color:THEME.muted, marginTop:3 }}>Usati dai bottoni WhatsApp nel calendario</div>
                </div>
            <div style={{ padding:"20px" }}>

              {/* Aggiungi nuovo */}
              <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:addingNew ? 12 : 16 }}>
                <button onClick={() => setAddingNew(!addingNew)} style={{ padding:"9px 16px", borderRadius:7, border:`1.5px solid ${THEME.teal}`, background:addingNew ? "#fff" : THEME.teal, color:addingNew ? THEME.teal : "#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                  {addingNew ? "✕ Annulla" : "+ Nuovo template"}
                </button>
              </div>

              {addingNew && (
                <div style={{ padding:18, borderRadius:10, border:`1.5px solid ${THEME.teal}`, background:"rgba(13,148,136,0.03)", marginBottom:16 }}>
                  <div style={{ marginBottom:12 }}>
                    <label style={labelStyle}>Nome template *</label>
                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Es. Promemoria standard" style={inputStyle} autoFocus />
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <TemplateEditor
                      label="Messaggio *"
                      value={newTemplate}
                      onChange={setNewTemplate}
                      rows={6}
                      helperText="Clicca i bottoni sopra per inserire i dati del paziente nel messaggio."
                      signature={dynamicSignature}
                      galleryKey="reminder"
                      messageKind="promemoria appuntamento"
                    />
                  </div>
                  <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                    {btnOutline("Annulla", () => { setNewName(""); setNewTemplate(""); setAddingNew(false); })}
                    {btnPrimary("Crea template", () => void createNewTemplate())}
                  </div>
                </div>
              )}

              {/* Lista template */}
              {loadingTemplates ? (
                <div style={{ padding:"24px 0", textAlign:"center", color:THEME.muted, fontSize:13 }}>Caricamento template…</div>
              ) : templates.length === 0 ? (
                <div style={{ padding:"24px 0", textAlign:"center", color:THEME.muted, fontSize:13 }}>Nessun template configurato.</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {templates.map(template => (
                    <div key={template.id} style={{ padding:16, borderRadius:10, border:`1.5px solid ${template.is_default ? THEME.teal : THEME.border}`, background:template.is_default ? "rgba(13,148,136,0.03)" : "#fff", position:"relative" }}>

                      {template.is_default && (
                        <div style={{ position:"absolute", top:-1, right:12, background:THEME.teal, color:"#fff", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:"0 0 6px 6px", letterSpacing:0.5 }}>
                          PREDEFINITO
                        </div>
                      )}

                      {editingId === template.id ? (
                        <div>
                          <div style={{ marginBottom:10 }}>
                            <label style={labelStyle}>Nome</label>
                            <input value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} />
                          </div>
                          <div style={{ marginBottom:10 }}>
                            <TemplateEditor
                              label="Messaggio"
                              value={editTemplate}
                              onChange={setEditTemplate}
                              rows={6}
                              signature={dynamicSignature}
                              galleryKey="reminder"
                              messageKind="promemoria appuntamento"
                            />
                          </div>
                          <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                            {btnOutline("Annulla", () => setEditingId(null))}
                            {btnPrimary("Salva modifiche", () => void saveTemplate(template.id))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:10 }}>
                            <div>
                              <div style={{ fontWeight:700, fontSize:14, color:THEME.text }}>{template.name}</div>
                              <div style={{ fontSize:11, color:THEME.muted, marginTop:2 }}>Creato: {new Date(template.created_at).toLocaleDateString("it-IT")}</div>
                            </div>
                            <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                              <button onClick={() => { setEditingId(template.id); setEditName(template.name); setEditTemplate(template.template); }} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${THEME.blue}`, background:THEME.blue, color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer" }}>Modifica</button>
                              <button onClick={() => void setAsDefault(template.id)} disabled={template.is_default} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${THEME.border}`, background:"#fff", color:template.is_default?THEME.gray:THEME.teal, fontWeight:700, fontSize:12, cursor:template.is_default?"not-allowed":"pointer", opacity:template.is_default?0.5:1 }}>Predefinito</button>
                              <button onClick={() => void deleteTemplate(template.id)} disabled={templates.length <= 1} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${THEME.border}`, background:"#fff", color:templates.length<=1?THEME.gray:THEME.red, fontWeight:700, fontSize:12, cursor:templates.length<=1?"not-allowed":"pointer", opacity:templates.length<=1?0.5:1 }}>Elimina</button>
                            </div>
                          </div>
                          <div style={{ fontSize:13, whiteSpace:"pre-wrap", color:THEME.muted, background:THEME.panelSoft, padding:"10px 14px", borderRadius:8, border:`1px solid ${THEME.border}`, lineHeight:1.5 }}>
                            {template.template}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
              </div>

              {/* ─── Messaggi automatici ─────────────────────────────────────────── */}
              <div>
                <div style={{ fontSize:13, fontWeight:800, color:THEME.text, marginBottom:14, paddingBottom:8, borderBottom:`1.5px solid ${THEME.border}` }}>
                  🤖 Messaggi automatici
                  <div style={{ fontSize:11, fontWeight:500, color:THEME.muted, marginTop:3 }}>Benvenuto nuovo paziente · Conferma prenotazione online</div>
                </div>
            <div style={{ padding:"20px", display:"flex", flexDirection:"column", gap:20 }}>
              <TemplateEditor
                label="Messaggio benvenuto nuovo paziente"
                value={welcomeMsg}
                onChange={setWelcomeMsg}
                rows={4}
                helperText="Inviato automaticamente al primo appuntamento."
                placeholders={DEFAULT_PLACEHOLDERS.filter(p => ["saluto","nome"].includes(p.key))}
                signature={dynamicSignature}
                galleryKey="welcome"
                messageKind="benvenuto nuovo paziente"
              />
              <TemplateEditor
                label="Messaggio conferma prenotazione online"
                value={bookingConfirmMsg}
                onChange={setBookingConfirmMsg}
                rows={4}
                helperText="Inviato quando confermi una prenotazione arrivata dal sito."
                placeholders={DEFAULT_PLACEHOLDERS.filter(p => ["saluto","nome","data","ora"].includes(p.key))}
                signature={dynamicSignature}
                galleryKey="booking"
                messageKind="conferma prenotazione"
              />
              <TemplateEditor
                label="Promemoria appuntamento"
                value={reminderMsg}
                onChange={setReminderMsg}
                rows={4}
                helperText="Inviato come promemoria prima dell'appuntamento."
                placeholders={DEFAULT_PLACEHOLDERS.filter(p => ["saluto","nome","data","ora","luogo"].includes(p.key))}
                signature={dynamicSignature}
                galleryKey="reminder"
                messageKind="promemoria appuntamento"
              />
              <TemplateEditor
                label="Sollecito pagamento"
                value={paymentMsg}
                onChange={setPaymentMsg}
                rows={4}
                helperText="Per pazienti con saldo aperto."
                placeholders={[
                  ...DEFAULT_PLACEHOLDERS.filter(p => p.key === "nome"),
                  { key: "importo", label: "Importo €", icon: "💶", example: "120" },
                ]}
                signature={dynamicSignature}
                galleryKey="payment"
                messageKind="sollecito pagamento cortese"
              />
              <TemplateEditor
                label="Auguri compleanno"
                value={birthdayMsg}
                onChange={setBirthdayMsg}
                rows={3}
                helperText="Inviato dal widget compleanni in dashboard."
                placeholders={DEFAULT_PLACEHOLDERS.filter(p => p.key === "nome")}
                signature={dynamicSignature}
                galleryKey="birthday"
                messageKind="auguri compleanno"
              />
              <TemplateEditor
                label="Questionario soddisfazione"
                value={satisfactionMsg}
                onChange={setSatisfactionMsg}
                rows={3}
                helperText="Inviato al termine del ciclo di trattamento."
                placeholders={[
                  ...DEFAULT_PLACEHOLDERS.filter(p => p.key === "nome"),
                  { key: "link", label: "Link questionario", icon: "🔗", example: "https://gestionale.app/survey/abc123" },
                ]}
                signature={dynamicSignature}
                galleryKey="satisfaction"
                messageKind="questionario soddisfazione"
              />
              <div style={{ display:"flex", justifyContent:"flex-end" }}>
                {btnPrimary(savingPractice?"Salvataggio…":"Salva messaggi", ()=>void savePracticeSettings(), savingPractice)}
              </div>
            </div>
              </div>

            </div>
          )}
        </div>

        {/* ── SEZIONE DURATE ─────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionHead} onClick={() => setShowDurations(!showDurations)}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>Durate Appuntamento</div>
              <div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>Durata predefinita per tipo trattamento (minuti)</div>
            </div>
            <span style={{ color:THEME.muted, fontSize:12, transform:showDurations?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
          </div>
          {showDurations && (
            <div style={{ padding:"20px" }}>
              <div className="settings-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
                {[
                  {label:"Seduta",v:durSeduta,set:setDurSeduta,color:"#0d9488"},
                  {label:"Macchinario",v:durMacchina,set:setDurMacchina,color:"#2563eb"},
                  {label:"Laser",v:durLaser,set:setDurLaser,color:"#d97706"},
                  {label:"Tecar",v:durTecar,set:setDurTecar,color:"#ea580c"},
                  {label:"Onde d'urto",v:durOndeUrto,set:setDurOndeUrto,color:"#7c3aed"},
                  {label:"TENS",v:durTens,set:setDurTens,color:"#059669"},
                ].map(d => (
                  <div key={d.label} style={{ padding:"12px", borderRadius:9, border:`2px solid ${d.color}22`, background:`${d.color}08` }}>
                    <div style={{ fontSize:12, fontWeight:700, color:d.color, marginBottom:8 }}>{d.label}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <input type="number" value={d.v} onChange={e=>d.set(e.target.value)} min={5} max={240} step={5}
                        style={{ ...inputStyle, textAlign:"right", fontWeight:700, fontSize:15, padding:"7px 8px", width:"70px" }}/>
                      <span style={{ fontSize:12, color:THEME.muted }}>min</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                {btnPrimary(savingPractice?"Salvataggio…":"Salva durate", ()=>void savePracticeSettings(), savingPractice)}
              </div>
            </div>
          )}
        </div>

        {/* ── SEZIONE PREFERENZE CALENDARIO ───────────────────────────────── */}
        <div style={cardStyle}>
          <div style={{...sectionHead, cursor:"default"}}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>Preferenze Calendario</div>
              <div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>Stato predefinito dei nuovi appuntamenti</div>
            </div>
          </div>
          <div style={{ padding:"18px 20px" }}>
            <label style={labelStyle}>Quando creo un nuovo appuntamento, impostalo come:</label>
            <div style={{ display:"flex", gap:10, marginTop:6 }}>
              {([
                { k:"confirmed", label:"✓ Confermato", desc:"Il paziente è già d'accordo sull'orario", color:THEME.blue, bg:"rgba(37,99,235,0.08)" },
                { k:"booked",    label:"📅 Prenotato", desc:"Attende conferma del paziente",        color:THEME.teal, bg:"rgba(13,148,136,0.08)" },
              ] as const).map(opt=>(
                <button key={opt.k} onClick={()=>setDefaultApptStatus(opt.k as "confirmed"|"booked")}
                  style={{
                    flex:1, padding:"14px 16px", borderRadius:10, cursor:"pointer",
                    border:defaultApptStatus===opt.k?`2px solid ${opt.color}`:`1.5px solid ${THEME.border}`,
                    background:defaultApptStatus===opt.k?opt.bg:"#fff",
                    textAlign:"left", fontFamily:"inherit",
                  }}>
                  <div style={{ fontWeight:800, fontSize:14, color:defaultApptStatus===opt.k?opt.color:THEME.text, marginBottom:4 }}>{opt.label}</div>
                  <div style={{ fontSize:11, color:THEME.muted }}>{opt.desc}</div>
                </button>
              ))}
            </div>
            <div style={{ marginTop:14, padding:"10px 14px", borderRadius:8, background:"rgba(13,148,136,0.04)", border:`1px solid rgba(13,148,136,0.15)`, fontSize:11, color:THEME.muted }}>
              Vale sia per desktop che per mobile. Puoi sempre modificare lo stato di un singolo appuntamento dopo averlo creato.
            </div>

            {/* ── Gestione sovrapposizione ── */}
            <div style={{ marginTop:20 }}>
              <label style={labelStyle}>Gestione sovrapposizione appuntamenti</label>
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:8 }}>
                {([
                  { k:"block",  icon:"⛔", label:"Blocco duro",       desc:"Impedisce la creazione se c'è già un appuntamento in quell'orario", color:"#dc2626", bg:"rgba(220,38,38,0.07)" },
                  { k:"warn",   icon:"⚠️", label:"Avviso + conferma", desc:"Avvisa della sovrapposizione ma lascia procedere",                  color:"#f59e0b", bg:"rgba(245,158,11,0.07)" },
                  { k:"visual", icon:"👁️", label:"Solo visuale",      desc:"Nessun blocco, gli appuntamenti sovrapposti appaiono affiancati",   color:THEME.teal, bg:"rgba(13,148,136,0.07)" },
                ] as const).map(opt => (
                  <button key={opt.k} onClick={() => setOverlapMode(opt.k)}
                    style={{
                      width:"100%", padding:"12px 16px", borderRadius:10, cursor:"pointer",
                      border: overlapMode===opt.k ? `2px solid ${opt.color}` : `1.5px solid ${THEME.border}`,
                      background: overlapMode===opt.k ? opt.bg : "#fff",
                      textAlign:"left", fontFamily:"inherit", display:"flex", alignItems:"center", gap:12,
                    }}>
                    <span style={{ fontSize:20, flexShrink:0 }}>{opt.icon}</span>
                    <div>
                      <div style={{ fontWeight:800, fontSize:13, color:overlapMode===opt.k?opt.color:THEME.text }}>{opt.label}</div>
                      <div style={{ fontSize:11, color:THEME.muted, marginTop:2 }}>{opt.desc}</div>
                    </div>
                    {overlapMode===opt.k && <span style={{ marginLeft:"auto", color:opt.color, fontWeight:800, fontSize:12 }}>✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display:"flex", justifyContent:"flex-end", marginTop:14 }}>
              {btnPrimary(savingPractice?"Salvataggio…":"Salva preferenze", ()=>void savePracticeSettings(), savingPractice)}
            </div>
          </div>
        </div>

        {/* ── SEZIONE SERVIZI PRENOTABILI ──────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionHead} onClick={() => setShowServices(!showServices)}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>Servizi Prenotabili Online</div>
              <div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>{services.length} servizi configurati · Visibili nel booking pubblico</div>
            </div>
            <span style={{ color:THEME.muted, fontSize:12, transform:showServices?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
          </div>
          {showServices && (
            <div style={{ padding:"20px" }}>
              {/* Aggiungi nuovo */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 80px auto", gap:10, marginBottom:16, alignItems:"end" }}>
                <div><label style={labelStyle}>Nome servizio</label><input value={newSvcName} onChange={e=>setNewSvcName(e.target.value)} placeholder="Es. Visita osteopatica" style={inputStyle}/></div>
                <div><label style={labelStyle}>Durata (min)</label><input type="number" value={newSvcDuration} onChange={e=>setNewSvcDuration(e.target.value)} min={5} step={5} style={{ ...inputStyle, textAlign:"right" }}/></div>
                <div><label style={labelStyle}>Prezzo (€)</label><input type="number" value={newSvcPrice} onChange={e=>setNewSvcPrice(e.target.value)} min={0} step={1} style={{ ...inputStyle, textAlign:"right" }}/></div>
                <button onClick={()=>void addService()} disabled={savingSvc||!newSvcName.trim()} style={{ padding:"9px 16px", borderRadius:7, border:"none", background:THEME.teal, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", alignSelf:"end", opacity:savingSvc?0.6:1 }}>
                  + Aggiungi
                </button>
              </div>
              {/* Lista */}
              {loadingServices ? <div style={{ color:THEME.muted, fontSize:12 }}>Caricamento…</div>
              : services.length === 0 ? <div style={{ color:THEME.muted, fontSize:12, fontStyle:"italic" }}>Nessun servizio configurato.</div>
              : <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {services.map((svc:any) => (
                  <div key={svc.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:8, border:`1px solid ${THEME.border}`, background:THEME.panelSoft }}>
                    <div style={{ flex:1, fontWeight:700, fontSize:13, color:THEME.text }}>{svc.name}</div>
                    <div style={{ fontSize:12, color:THEME.muted }}>{svc.duration} min</div>
                    <div style={{ fontSize:13, fontWeight:700, color:THEME.teal }}>€{svc.price}</div>
                    <button onClick={()=>void deleteService(svc.id)} style={{ padding:"4px 10px", borderRadius:6, border:`1px solid rgba(220,38,38,0.3)`, background:"rgba(220,38,38,0.05)", color:THEME.red, cursor:"pointer", fontWeight:700, fontSize:11 }}>✕</button>
                  </div>
                ))}
              </div>}
            </div>
          )}
        </div>

        {/* ── SEZIONE GIORNI DI BLOCCO ─────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionHead} onClick={() => setShowBlockDays(!showBlockDays)}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>Giorni di Blocco / Ferie</div>
              <div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>{blockDays.length} giorni bloccati · Non prenotabili dal sito</div>
            </div>
            <span style={{ color:THEME.muted, fontSize:12, transform:showBlockDays?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
          </div>
          {showBlockDays && (
            <div style={{ padding:"20px" }}>
              <div style={{ display:"grid", gridTemplateColumns:"160px 1fr auto", gap:10, marginBottom:16, alignItems:"end" }}>
                <div><label style={labelStyle}>Data</label><input type="date" value={newBlockDate} onChange={e=>setNewBlockDate(e.target.value)} style={inputStyle}/></div>
                <div><label style={labelStyle}>Motivo (opzionale)</label><input value={newBlockLabel} onChange={e=>setNewBlockLabel(e.target.value)} placeholder="Es. Ferie, Congresso…" style={inputStyle}/></div>
                <button onClick={()=>void addBlockDay()} disabled={savingBlock||!newBlockDate} style={{ padding:"9px 16px", borderRadius:7, border:"none", background:THEME.amber, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", alignSelf:"end", opacity:savingBlock?0.6:1 }}>
                  + Blocca
                </button>
              </div>
              {blockDays.length === 0 ? <div style={{ color:THEME.muted, fontSize:12, fontStyle:"italic" }}>Nessun giorno bloccato.</div>
              : <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {blockDays.map((bd:any) => (
                  <div key={bd.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 14px", borderRadius:8, border:`1px solid rgba(249,115,22,0.3)`, background:"rgba(249,115,22,0.04)" }}>
                    <div style={{ fontWeight:800, fontSize:13, color:THEME.amber, minWidth:90 }}>{new Date(bd.date+"T12:00:00").toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"short",year:"numeric"})}</div>
                    <div style={{ flex:1, fontSize:12, color:THEME.muted }}>{bd.label}</div>
                    <button onClick={()=>void deleteBlockDay(bd.id)} style={{ padding:"4px 10px", borderRadius:6, border:`1px solid rgba(220,38,38,0.3)`, background:"rgba(220,38,38,0.05)", color:THEME.red, cursor:"pointer", fontWeight:700, fontSize:11 }}>✕</button>
                  </div>
                ))}
              </div>}
            </div>
          )}
        </div>

        {/* ── SEZIONE GESTIONE ─────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionHead} onClick={() => setShowGestione(!showGestione)}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>Parametri Gestione</div>
              <div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>Obiettivo fatturato · Soglia inattività · Promemoria</div>
            </div>
            <span style={{ color:THEME.muted, fontSize:12, transform:showGestione?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
          </div>
          {showGestione && (
            <div style={{ padding:"20px" }}>
              <div className="settings-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:16 }}>
                <div>
                  <label style={labelStyle}>Obiettivo fatturato mensile (€)</label>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:THEME.muted }}>€</span>
                    <input type="number" value={monthlyGoal} onChange={e=>setMonthlyGoal(e.target.value)} min={0} step={100} style={{ ...inputStyle, textAlign:"right", fontWeight:700 }}/>
                  </div>
                  <div style={{ fontSize:11, color:THEME.muted, marginTop:4 }}>Usato nella barra di progressione nei Report</div>
                </div>
                <div>
                  <label style={labelStyle}>Soglia paziente inattivo (giorni)</label>
                  <input type="number" value={inactiveThresh} onChange={e=>setInactiveThresh(e.target.value)} min={7} max={365} style={{ ...inputStyle, textAlign:"right", fontWeight:700 }}/>
                  <div style={{ fontSize:11, color:THEME.muted, marginTop:4 }}>Pazienti non visti da più di X giorni → avviso dashboard</div>
                </div>
                <div>
                  <label style={labelStyle}>Promemoria WA (ore prima)</label>
                  <input type="number" value={reminderHours} onChange={e=>setReminderHours(e.target.value)} min={1} max={72} style={{ ...inputStyle, textAlign:"right", fontWeight:700 }}/>
                  <div style={{ fontSize:11, color:THEME.muted, marginTop:4 }}>Riferimento per quando inviare i promemoria</div>
                </div>
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end" }}>
                {btnPrimary(savingPractice?"Salvataggio…":"Salva parametri", ()=>void savePracticeSettings(), savingPractice)}
              </div>
            </div>
          )}
        </div>

        {/* ── SEZIONE CAMBIO PASSWORD ──────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionHead} onClick={() => setShowPassword(!showPassword)}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>Cambio Password</div>
              <div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>Aggiorna la password di accesso</div>
            </div>
            <span style={{ color:THEME.muted, fontSize:12, transform:showPassword?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
          </div>
          {showPassword && (
            <div style={{ padding:"20px" }}>
              {pwError && <div style={{ marginBottom:12, padding:"9px 14px", borderRadius:7, background:"rgba(220,38,38,0.05)", border:"1px solid rgba(220,38,38,0.2)", color:THEME.red, fontWeight:600, fontSize:13 }}>{pwError}</div>}
              {pwSuccess && <div style={{ marginBottom:12, padding:"9px 14px", borderRadius:7, background:"rgba(22,163,74,0.06)", border:"1px solid rgba(22,163,74,0.2)", color:THEME.green, fontWeight:600, fontSize:13 }}>{pwSuccess}</div>}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }}>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={labelStyle}>Nuova password</label>
                  <input type="password" value={pwNew} onChange={e=>setPwNew(e.target.value)} placeholder="Minimo 8 caratteri" style={inputStyle}/>
                </div>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={labelStyle}>Conferma nuova password</label>
                  <input type="password" value={pwConfirm} onChange={e=>setPwConfirm(e.target.value)} placeholder="Ripeti la nuova password" style={inputStyle}/>
                </div>
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end" }}>
                {btnPrimary(pwSaving?"Aggiornamento…":"Aggiorna password", ()=>void changePassword(), pwSaving||!pwNew||!pwConfirm)}
              </div>
            </div>
          )}
        </div>

        {/* ── SEZIONE BACKUP & INTEGRAZIONI ───────────────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionHead} onClick={() => setShowBackup(!showBackup)}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>Backup & Integrazioni</div>
              <div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>Esporta dati · Google Calendar</div>
            </div>
            <span style={{ color:THEME.muted, fontSize:12, transform:showBackup?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
          </div>
          {showBackup && (
            <div style={{ padding:"20px", display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderRadius:10, border:`1px solid ${THEME.border}`, background:THEME.panelSoft }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:THEME.text }}>Backup completo dati</div>
                  <div style={{ fontSize:12, color:THEME.muted, marginTop:3 }}>Scarica 3 file CSV: pazienti, appuntamenti, noleggii. Apribili in Excel.</div>
                </div>
                <button onClick={()=>void exportBackup()} disabled={exportingBackup} style={{ padding:"9px 18px", borderRadius:7, border:"none", background:`linear-gradient(135deg,#0d9488,#2563eb)`, color:"#fff", fontWeight:700, fontSize:13, cursor:exportingBackup?"wait":"pointer", opacity:exportingBackup?0.6:1, flexShrink:0 }}>
                  {exportingBackup?"Preparazione…":"↓ Scarica backup"}
                </button>
              </div>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", padding:"14px 16px", borderRadius:10, border:`1px solid ${THEME.border}`, background:THEME.panelSoft, gap:16 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:THEME.text }}>Google Calendar — Feed automatico</div>
                  <div style={{ fontSize:12, color:THEME.muted, marginTop:3, marginBottom:10 }}>
                    Copia questo link e aggiungilo a Google Calendar come <strong>Calendario da URL</strong>. Si aggiorna automaticamente ogni 1-2 ore.
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                    <code style={{ fontSize:11, background:THEME.text, color:"#fff", padding:"5px 10px", borderRadius:6, userSelect:"all", wordBreak:"break-all" }}>
                      {typeof window !== "undefined" ? `${window.location.origin}/api/calendar.ics` : "https://tuo-dominio.vercel.app/api/calendar.ics"}
                    </code>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/api/calendar.ics`;
                        navigator.clipboard.writeText(url).then(() => {
                          flashSuccess("Link copiato!");
                        });
                      }}
                      style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${THEME.blue}`, background:"rgba(37,99,235,0.06)", color:THEME.blue, fontWeight:700, fontSize:11, cursor:"pointer", flexShrink:0 }}
                    >
                      📋 Copia link
                    </button>
                    <a
                      href={typeof window !== "undefined" ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(typeof window !== "undefined" ? `${window.location.origin}/api/calendar.ics` : "")}` : "#"}
                      target="_blank" rel="noopener noreferrer"
                      style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${THEME.teal}`, background:"rgba(13,148,136,0.06)", color:THEME.teal, fontWeight:700, fontSize:11, textDecoration:"none", flexShrink:0 }}
                    >
                      Apri Google Calendar →
                    </a>
                  </div>
                  <div style={{ marginTop:10, fontSize:11, color:THEME.muted, lineHeight:1.6 }}>
                    <strong>Come aggiungere:</strong> Apri Google Calendar → <em>+</em> accanto a "Altri calendari" → <em>Da URL</em> → incolla il link → <em>Aggiungi calendario</em>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ textAlign:"center", fontSize:12, color:THEME.muted, padding:"8px 0 16px" }}>
          FisioHub · {new Date().getFullYear()}
        </div>
      </main>
    </div>
  );
}
