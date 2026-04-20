"use client";

function openWA(phone: string, message: string = ""): void {
  const p = phone.replace(/[\s\(\)\-\.]/g, "").replace(/^\+/, "");
  const n = p.startsWith("00") ? p.slice(2) : p.startsWith("0") ? "39" + p : !p.startsWith("39") && p.length <= 10 ? "39" + p : p;
  const text = message ? "&text=" + encodeURIComponent(message) : "";
  const isMobile = /iPhone|iPad|iPod|Android/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "");
  const url = isMobile
    ? "https://api.whatsapp.com/send?phone=" + n + text
    : "https://web.whatsapp.com/send?phone=" + n + text;
  const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
  document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 200);
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";
import { ClinicalScalesSection } from "@/app/(protected)/patients/[id]/ClinicalScales";
import { PhotoGallerySection } from "@/app/(protected)/patients/[id]/PhotoGallery";

/* ─── Types ───────────────────────────────────────────────────────────── */
type Plan   = "invoice" | "no_invoice";
// FIX: aggiunto cancelled e not_paid mancanti
type Status = "booked" | "confirmed" | "done" | "cancelled" | "not_paid";
type DocType =
  | "rx" | "rm" | "tac" | "ecografia" | "elettromiografia"
  | "prescrizione" | "gdpr_informativa_privacy" | "consenso_trattamento" | "altro";

type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  tax_code: string | null;
  address: string | null;
  preferred_plan: Plan | null;
  anamnesis: string | null;
  diagnosis: string | null;
  treatment: string | null;
  prescribed_sessions: number | null;
};

type AppointmentRow = {
  id: string;
  start_at: string;
  status: Status;
  is_paid: boolean;
  amount: number | null;
};

type PatientDoc = {
  id: string;
  patient_id: string;
  doc_type: DocType | string;
  file_name: string;
  storage_path: string;
  uploaded_at: string;
};

/* ─── Theme ───────────────────────────────────────────────────────────── */
const T = {
  appBg:     "#f1f5f9",
  panelBg:   "#ffffff",
  panelSoft: "#f7f9fd",
  text:      "#0f172a",
  muted:     "#334155",
  border:    "#cbd5e1",
  blue:      "#2563eb",
  green:     "#16a34a",
  red:       "#dc2626",
  amber:     "#f97316",
  gray:      "#94a3b8",
  teal:      "#0d9488",
  gradient:  "linear-gradient(135deg,#0d9488,#2563eb)",
};
const BOTTOM_TAB_H = 62;

/* ─── Helpers ─────────────────────────────────────────────────────────── */
function ddmmyyyy(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return !y || !m || !d ? iso : `${d}/${m}/${y}`;
}
function calcAge(iso: string | null): number | null {
  if (!iso) return null;
  const b = new Date(iso);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const mo = now.getMonth() - b.getMonth();
  if (mo < 0 || (mo === 0 && now.getDate() < b.getDate())) age--;
  return age;
}
function formatDateTimeIT(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function formatDateIT(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function statusLabel(s: Status) {
  const map: Record<Status, string> = {
    booked: "Prenotata", confirmed: "Confermata", done: "Eseguita",
    cancelled: "Annullata", not_paid: "Non pagata",
  };
  return map[s] ?? s;
}
function statusColor(s: Status) {
  const map: Record<Status, string> = {
    done: T.green, confirmed: T.blue, booked: T.amber,
    cancelled: T.gray, not_paid: T.red,
  };
  return map[s] ?? T.gray;
}
function docTypeLabel(t: string) {
  return ({
    rx: "Rx", rm: "RMN", tac: "TAC", ecografia: "Ecografia",
    elettromiografia: "Elettromiografia", prescrizione: "Prescrizione",
    gdpr_informativa_privacy: "GDPR Privacy", consenso_trattamento: "Consenso trattamento",
    altro: "Altro",
  } as Record<string, string>)[t] ?? t;
}
function docTypeHint(t: string) {
  return ({
    rx: "Radiografie / lastre", rm: "Risonanza magnetica", tac: "Tomografia computerizzata",
    ecografia: "Referti ecografici", elettromiografia: "EMG / ENG",
    prescrizione: "Prescrizioni mediche / impegnative",
  } as Record<string, string>)[t] ?? "";
}
function safeFileName(name: string) { return name.replace(/[^\w.\-() ]+/g, "_"); }
function formatPhoneForWA(phone: string): string {
  let c = phone.replace(/[\s\(\)\-\.]/g, "");
  if (c.startsWith("+")) c = c.substring(1);
  if (c.startsWith("0")) c = "39" + c.substring(1);
  if (!c.startsWith("39") && c.length <= 10) c = "39" + c;
  return c;
}
function initials(p: Patient) {
  return ((p.last_name?.[0] ?? "") + (p.first_name?.[0] ?? "")).toUpperCase() || "?";
}
function isImageFile(name: string) { return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name); }

/* ─── UI primitives ───────────────────────────────────────────────────── */
function inputS(disabled?: boolean): React.CSSProperties {
  return {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    border: `1.5px solid ${T.border}`, outline: "none",
    background: disabled ? T.appBg : T.panelBg,
    color: disabled ? T.muted : T.text,
    fontWeight: 500, fontSize: 14, fontFamily: "Inter,-apple-system,sans-serif",
    boxSizing: "border-box" as const, opacity: disabled ? 0.75 : 1,
  };
}

type BtnV = "primary" | "ghost" | "danger" | "success" | "warning";
function Btn({ v = "primary", onClick, disabled, children, full = true }: {
  v?: BtnV; onClick?: () => void; disabled?: boolean; children: React.ReactNode; full?: boolean;
}) {
  const base: React.CSSProperties = {
    padding: "11px 16px", borderRadius: 10, fontWeight: 700, fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "Inter,-apple-system,sans-serif",
    opacity: disabled ? 0.45 : 1, transition: "opacity 0.15s",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    width: full ? "100%" : undefined, border: "none",
  };
  const vars: Record<BtnV, React.CSSProperties> = {
    primary: { background: T.gradient, color: "#fff", boxShadow: "0 2px 8px rgba(13,148,136,0.25)" },
    ghost:   { background: T.panelSoft, color: T.muted, border: `1.5px solid ${T.border}` },
    danger:  { background: "rgba(220,38,38,0.08)", color: T.red, border: `1.5px solid rgba(220,38,38,0.2)` },
    success: { background: "rgba(22,163,74,0.10)", color: T.green, border: `1.5px solid rgba(22,163,74,0.3)` },
    warning: { background: "rgba(249,115,22,0.08)", color: T.amber, border: `1.5px solid rgba(249,115,22,0.3)` },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...vars[v] }}>{children}</button>;
}

function FG({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, marginBottom: 6,
        textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, marginBottom: 10,
      background: "rgba(220,38,38,0.06)", border: "1.5px solid rgba(220,38,38,0.25)",
      color: "#7f1d1d", fontWeight: 600, fontSize: 13, whiteSpace: "pre-wrap" }}>
      ⚠️ {msg}
    </div>
  );
}

function SavedBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: T.green,
      background: "rgba(22,163,74,0.1)", padding: "4px 10px",
      borderRadius: 99, border: `1px solid rgba(22,163,74,0.3)` }}>
      ✓ Salvato
    </span>
  );
}

/* ─── DocThumbnail ────────────────────────────────────────────────────── */
function DocThumbnail({ doc }: { doc: PatientDoc }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isImageFile(doc.file_name)) return;
    supabase.storage.from("patient_docs").createSignedUrl(doc.storage_path, 300)
      .then(r => { if (r.data?.signedUrl) setUrl(r.data.signedUrl); });
  }, [doc.storage_path, doc.file_name]);
  if (!url) return null;
  return (
    <img src={url} alt={doc.file_name} style={{
      width: 64, height: 64, borderRadius: 8, objectFit: "cover",
      border: `1.5px solid ${T.border}`, flexShrink: 0,
    }} />
  );
}

/* ─── QuickActionBar ──────────────────────────────────────────────────── */
function QuickActionBar({ phone, waPhone, patientId, unpaidAmount, birthDate, firstName }: {
  phone: string | null; waPhone: string | null; patientId: string;
  unpaidAmount: number; birthDate: string | null; firstName: string | null;
}) {
  const actions = [
    phone    ? { label: "Chiama",    icon: "📞", href: `tel:${phone}`,                          color: T.blue  } : null,
    waPhone  ? { label: "WhatsApp",  icon: "💬", href: `#`, color: T.green } : null,
    { label: "Prenota",   icon: "📅", href: `/mobile/calendar?new=1&patient_id=${patientId}`, color: T.teal  },
    (birthDate && phone) ? { label: "Auguri",   icon: "🎂", href: `#birthday`, color: "#f59e0b" } : null,
    (unpaidAmount > 0 && phone) ? { label: `€${unpaidAmount % 1 === 0 ? unpaidAmount.toFixed(0) : unpaidAmount.toFixed(2)}`, icon: "💶", href: `#payment`, color: "#dc2626" } : null,
  ].filter(Boolean) as { label: string; icon: string; href: string; color: string }[];

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${actions.length},1fr)`, gap: 8, marginTop: 12 }}>
      {actions.map(a => (
        <a key={a.label} href={a.href}
          onClick={e => {
            if (a.href === "#birthday" && phone) {
              e.preventDefault();
              const nome = firstName?.trim() || "Paziente";
              const msg = `Buon compleanno ${nome}! 🎂\n\nTutto lo staff di FisioHub le augura una splendida giornata.\nSe ha bisogno di noi siamo a sua disposizione.\n\nDr. Marco Turchetta`;
              openWA(phone, msg);
            } else if (a.href === "#payment" && phone) {
              e.preventDefault();
              const nome = firstName?.trim() || "Paziente";
              const importo = unpaidAmount.toLocaleString("it-IT", { minimumFractionDigits: 2 });
              const msg = `Gentile ${nome},\n\nle ricordiamo un saldo aperto di €${importo} per le sedute effettuate.\n\nCordiali saluti,\nDr. Marco Turchetta`;
              openWA(phone, msg);
            }
          }}
          target={a.href.startsWith("http") ? "_blank" : undefined}
          rel="noreferrer"
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            padding: "10px 6px", borderRadius: 12, textDecoration: "none",
            background: `${a.color}10`, border: `1.5px solid ${a.color}30`,
          }}>
          <span style={{ fontSize: 20 }}>{a.icon}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: a.color }}>{a.label}</span>
        </a>
      ))}
    </div>
  );
}

/* ─── Main ────────────────────────────────────────────────────────────── */
export default function PatientDetailClient({ patientId }: { patientId: string }) {
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [patient,   setPatient]   = useState<Patient | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "clinical" | "therapies" | "docs" | "esercizi" | "scales" | "photos" | "portal">("info");

  /* user */
  const [userEmail,    setUserEmail]    = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  /* info edit */
  const [editMode,           setEditMode]           = useState(false);
  const [saving,             setSaving]             = useState(false);
  const [savedInfo,          setSavedInfo]          = useState(false);
  const [firstName,          setFirstName]          = useState("");
  const [lastName,           setLastName]           = useState("");
  const [phone,              setPhone]              = useState("");
  const [email,              setEmail]              = useState("");
  const [birthDate,          setBirthDate]          = useState("");
  const [taxCode,            setTaxCode]            = useState("");
  const [address,            setAddress]            = useState("");
  const [preferredPlan,      setPreferredPlan]      = useState<Plan>("invoice");
  const [prescribedSessions, setPrescribedSessions] = useState<string>("");

  /* clinical edit */
  const [clinicalEdit, setClinicalEdit] = useState(false);
  const [anamnesis,    setAnamnesis]    = useState("");
  const [diagnosis,    setDiagnosis]    = useState("");
  const [treatment,    setTreatment]    = useState("");
  const [savingClin,   setSavingClin]   = useState(false);
  const [savedClin,    setSavedClin]    = useState(false);

  /* docs */
  const [docs,           setDocs]           = useState<PatientDoc[]>([]);
  const [uploading,      setUploading]      = useState(false);
  const [docType,        setDocType]        = useState<DocType>("rx");
  const [docFilter,      setDocFilter]      = useState<string>("tutti");
  const [files,          setFiles]          = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0, current: "" });

  /* therapies */
  const [appointments,   setAppointments]  = useState<AppointmentRow[]>([]);
  const [apptFilter,     setApptFilter]    = useState<"future" | "past">("future");
  const [yearFilter,     setYearFilter]    = useState<string>("tutti");
  const [editingApptId,  setEditingApptId] = useState<string | null>(null);
  const [editingAmount,  setEditingAmount] = useState<string>("");

  /* new appointment inline */
  const [newApptOpen,   setNewApptOpen]   = useState(false);
  const [newApptDate,   setNewApptDate]   = useState("");
  const [newApptTime,   setNewApptTime]   = useState("09:00");
  const [newApptDur,    setNewApptDur]    = useState(60);
  const [newApptStatus, setNewApptStatus] = useState<Status>("confirmed");
  const [newApptAmt,    setNewApptAmt]    = useState("");
  const [savingAppt,    setSavingAppt]    = useState(false);

  /* ── User ──────────────────────────────────────────────────────── */
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
  const userInitials = useMemo(() => {
    if (!userEmail) return "U";
    const parts = (userEmail.split("@")[0] ?? "U").replace(/[^a-zA-Z0-9]/g, " ").split(" ").filter(Boolean);
    return ((parts[0]?.[0] ?? "U") + (parts[1]?.[0] ?? "")).toUpperCase().slice(0, 2);
  }, [userEmail]);

  /* ── Load ───────────────────────────────────────────────────────── */
  async function loadPatient() {
    setLoading(true); setError("");
    const res = await supabase.from("patients")
      .select("id,first_name,last_name,phone,email,birth_date,tax_code,address,preferred_plan,anamnesis,diagnosis,treatment,prescribed_sessions")
      .eq("id", patientId).single();
    if (res.error) { setError(res.error.message); setPatient(null); }
    else {
      const p = res.data as Patient;
      setPatient(p);
      setFirstName(p.first_name ?? "");
      setLastName(p.last_name ?? "");
      setPhone(p.phone ?? "");
      setEmail(p.email ?? "");
      setBirthDate(p.birth_date ?? "");
      setTaxCode(p.tax_code ?? "");
      setAddress(p.address ?? "");
      setPreferredPlan((p.preferred_plan ?? "invoice") as Plan);
      setPrescribedSessions(p.prescribed_sessions != null ? String(p.prescribed_sessions) : "");
      setAnamnesis(p.anamnesis ?? "");
      setDiagnosis(p.diagnosis ?? "");
      setTreatment(p.treatment ?? "");
    }
    setLoading(false);
  }
  async function loadDocs() {
    // Legge da entrambe le tabelle e le unisce
    const [resGdpr, resClinical] = await Promise.all([
      supabase.from("patient_documents").select("*").eq("patient_id", patientId).order("uploaded_at", { ascending: false }),
      supabase.from("clinical_documents").select("*").eq("patient_id", patientId).order("uploaded_at", { ascending: false }),
    ]);
    if (resGdpr.error) setError(resGdpr.error.message);
    if (resClinical.error) setError(resClinical.error.message);
    const gdprDocs = (resGdpr.data ?? []) as PatientDoc[];
    const clinicalDocs = (resClinical.data ?? []) as PatientDoc[];
    setDocs([...clinicalDocs, ...gdprDocs]);
  }
  async function loadAppointments() {
    const res = await supabase.from("appointments")
      .select("id,start_at,status,is_paid,amount")
      .eq("patient_id", patientId).order("start_at", { ascending: false });
    if (res.error) setError(res.error.message);
    else setAppointments((res.data ?? []) as AppointmentRow[]);
  }

  useEffect(() => {
    if (!patientId) return;
    void loadPatient();
    void loadDocs();
    void loadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  /* ── Save info ──────────────────────────────────────────────────── */
  async function savePatient() {
    if (!patient) return;
    if (!firstName.trim() || !lastName.trim()) { setError("Nome e cognome obbligatori"); return; }
    setSaving(true); setError("");
    const ps = prescribedSessions.trim() === "" ? null : Number(prescribedSessions);
    const res = await supabase.from("patients").update({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      birth_date: birthDate || null,
      tax_code: taxCode.trim() || null,
      address: address.trim() || null,
      preferred_plan: preferredPlan,
      prescribed_sessions: ps && isFinite(ps) ? ps : null,
    }).eq("id", patientId);
    setSaving(false);
    if (res.error) { setError(res.error.message); return; }
    await loadPatient();
    setEditMode(false);
    setSavedInfo(true);
    setTimeout(() => setSavedInfo(false), 2500);
  }

  /* ── Save clinical ──────────────────────────────────────────────── */
  async function saveClinical() {
    if (!patient) return;
    setSavingClin(true); setError("");
    const res = await supabase.from("patients").update({
      anamnesis: anamnesis.trim() || null,
      diagnosis: diagnosis.trim() || null,
      treatment: treatment.trim() || null,
    }).eq("id", patientId);
    setSavingClin(false);
    if (res.error) { setError(res.error.message); return; }
    await loadPatient();
    setClinicalEdit(false);
    setSavedClin(true);
    setTimeout(() => setSavedClin(false), 2500);
  }

  /* ── New appointment (inline) ───────────────────────────────────── */
  async function createAppointment() {
    if (!newApptDate || !newApptTime) { setError("Inserisci data e ora."); return; }
    const dur = Number(newApptDur);
    setSavingAppt(true); setError("");
    const start = new Date(`${newApptDate}T${newApptTime}:00`);
    const end   = new Date(start); end.setMinutes(end.getMinutes() + dur);
    const amount = newApptAmt.trim() === "" ? null : (() => {
      const n = Number(newApptAmt.replace(",", ".")); return isFinite(n) ? n : null;
    })();
    const res = await supabase.from("appointments").insert({
      patient_id: patientId,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: newApptStatus,
      amount,
    });
    setSavingAppt(false);
    if (res.error) { setError(res.error.message); return; }
    setNewApptOpen(false);
    setNewApptDate(""); setNewApptTime("09:00"); setNewApptDur(60);
    setNewApptStatus("confirmed"); setNewApptAmt("");
    await loadAppointments();
  }

  /* ── Appointment actions ────────────────────────────────────────── */
  async function updateAppointmentStatus(id: string, status: Status) {
    const payload: Record<string, unknown> = { status };
    if (status !== "done") payload.is_paid = false;
    await supabase.from("appointments").update(payload).eq("id", id);
    await loadAppointments();
  }
  async function togglePaid(id: string, isPaid: boolean) {
    await supabase.from("appointments").update({ is_paid: isPaid }).eq("id", id);
    await loadAppointments();
  }
  async function saveApptAmount(id: string) {
    const n = Number(editingAmount.replace(",", "."));
    const amount = editingAmount.trim() === "" ? null : isFinite(n) ? n : null;
    await supabase.from("appointments").update({ amount }).eq("id", id);
    setEditingApptId(null); setEditingAmount("");
    await loadAppointments();
  }

  /* ── Docs ───────────────────────────────────────────────────────── */
  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []));
  }
  const CLINICAL_TYPES = ["rx", "rm", "tac", "ecografia", "elettromiografia", "prescrizione"];

  async function uploadDocuments() {
    if (!files.length) { setError("Seleziona almeno un file"); return; }
    setUploading(true); setError(""); setUploadProgress({ done: 0, total: files.length, current: "" });
    const isClinical = CLINICAL_TYPES.includes(docType);
    const table = isClinical ? "clinical_documents" : "patient_documents";
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setUploadProgress({ done: i, total: files.length, current: f.name });
      const safeName = safeFileName(f.name);
      const path = `${patientId}/${docType}/${Date.now()}_${safeName}`;
      const upRes = await supabase.storage.from("patient_docs").upload(path, f, { upsert: false });
      if (upRes.error) { setError(`Upload fallito (${f.name}): ${upRes.error.message}`); setUploading(false); return; }
      const insRes = await supabase.from(table).insert({
        patient_id: patientId,
        doc_type: docType,
        file_name: f.name,
        storage_path: path,
        ...(isClinical ? { report_text: null, uploaded_at: new Date().toISOString() } : {}),
      });
      if (insRes.error) {
        console.error(`Insert in ${table} fallito:`, insRes.error);
        await supabase.storage.from("patient_docs").remove([path]);
        setError(`Errore DB (${f.name}): ${insRes.error.message}`);
        setUploading(false); return;
      }
    }
    setUploadProgress({ done: files.length, total: files.length, current: "" });
    setFiles([]); await loadDocs(); setUploading(false);
  }
  async function openDocument(doc: PatientDoc) {
    const res = await supabase.storage.from("patient_docs").createSignedUrl(doc.storage_path, 300);
    if (res.data?.signedUrl) window.open(res.data.signedUrl, "_blank", "noopener,noreferrer");
    else setError("Impossibile aprire il documento");
  }
  async function deleteDocument(doc: PatientDoc) {
    if (!window.confirm("Eliminare questo documento?")) return;
    const isClinical = CLINICAL_TYPES.includes(doc.doc_type as string);
    const table = isClinical ? "clinical_documents" : "patient_documents";
    const dbRes = await supabase.from(table).delete().eq("id", doc.id);
    if (dbRes.error) { setError(`Errore DB: ${dbRes.error.message}`); return; }
    await supabase.storage.from("patient_docs").remove([doc.storage_path]);
    await loadDocs();
  }

  /* ── Delete patient ─────────────────────────────────────────────── */
  async function deletePatient() {
    if (!patient || !window.confirm(`Eliminare ${patient.first_name} ${patient.last_name}?`)) return;
    await supabase.from("patients").delete().eq("id", patientId);
    window.location.href = "/mobile/patients";
  }
  async function handleLogout() {
    try { await supabase.auth.signOut(); } finally { window.location.href = "/login"; }
  }

  /* ── Derived ────────────────────────────────────────────────────── */
  const now = new Date();

  const apptStats = useMemo(() => {
    const done   = appointments.filter(a => a.status === "done");
    const paid   = done.filter(a => a.is_paid);
    const unpaid = done.filter(a => !a.is_paid);
    return {
      total:        appointments.length,
      done:         done.length,
      unpaid:       unpaid.length,
      totalRevenue: done.reduce((s, a) => s + (a.amount ?? 0), 0),
      paidRevenue:  paid.reduce((s, a) => s + (a.amount ?? 0), 0),
      unpaidRevenue:unpaid.reduce((s, a) => s + (a.amount ?? 0), 0),
    };
  }, [appointments]);

  // anni disponibili per il filtro
  const availableYears = useMemo(() => {
    const years = new Set(appointments.map(a => new Date(a.start_at).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [appointments]);

  const filteredAppts = useMemo(() => {
    let list = appointments;
    // filtro futuro/passato
    if (apptFilter === "future") list = list.filter(a => new Date(a.start_at) >= now).reverse();
    else list = list.filter(a => new Date(a.start_at) < now);
    // filtro anno
    if (yearFilter !== "tutti") list = list.filter(a => String(new Date(a.start_at).getFullYear()) === yearFilter);
    return list;
  }, [appointments, apptFilter, yearFilter]);

  const docsByType = useMemo(() => {
    const groups: Record<string, PatientDoc[]> = {};
    for (const d of docs) {
      const k = (d.doc_type as string) ?? "altro";
      if (!groups[k]) groups[k] = [];
      groups[k].push(d);
    }
    return groups;
  }, [docs]);

  const orderedDocTypes: string[] = [
    "rx", "rm", "tac", "ecografia", "elettromiografia", "prescrizione",
    "gdpr_informativa_privacy", "consenso_trattamento", "altro",
  ];

  const filteredDocs = useMemo(() => {
    if (docFilter === "tutti") return docs;
    return docs.filter(d => (d.doc_type as string) === docFilter);
  }, [docs, docFilter]);

  const docTypesPresent = useMemo(() => {
    return orderedDocTypes.filter(t => (docsByType[t]?.length ?? 0) > 0)
      .concat(Object.keys(docsByType).filter(t => !orderedDocTypes.includes(t)));
  }, [docsByType]);

  /* ── Loading / not found ────────────────────────────────────────── */
  if (loading) return (
    <div style={{ minHeight: "100vh", background: T.appBg, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "Inter,-apple-system,sans-serif", color: T.muted, fontSize: 14 }}>
      Caricamento…
    </div>
  );

  if (!patient) return (
    <div style={{ minHeight: "100vh", background: T.appBg, padding: 20,
      fontFamily: "Inter,-apple-system,sans-serif" }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: T.red, marginBottom: 8 }}>
        Paziente non trovato
      </div>
      {error && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, fontSize: 13,
          background: "rgba(220,38,38,0.06)", border: "1.5px solid rgba(220,38,38,0.25)",
          color: "#7f1d1d", fontWeight: 500, wordBreak: "break-word" }}>
          {error}
        </div>
      )}
      <Link href="/mobile/patients" style={{ color: T.blue, fontWeight: 600, fontSize: 14 }}>
        ← Torna ai pazienti
      </Link>
    </div>
  );

  const waPhone    = patient.phone ? formatPhoneForWA(patient.phone) : null;
  const age        = calcAge(patient.birth_date);
  const prescribed = patient.prescribed_sessions ?? 0;
  const progressPct = prescribed > 0 ? Math.min(100, Math.round(apptStats.done / prescribed * 100)) : 0;

  /* ─────────────────── RENDER ─────────────────────────────────────── */
  return (
    <div style={{ minHeight: "100vh", background: T.appBg,
      paddingBottom: BOTTOM_TAB_H + 16, fontFamily: "Inter,-apple-system,sans-serif" }}>

      {/* ━━━ NAVBAR ━━━ */}
      <header style={{
        position: "sticky", top: 0, zIndex: 30,
        background: T.gradient, padding: "0 14px", height: 54,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 2px 12px rgba(13,148,136,0.18)", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <Link href="/mobile/patients" style={{
            width: 30, height: 30, borderRadius: 7, display: "flex", alignItems: "center",
            justifyContent: "center", background: "rgba(255,255,255,0.2)",
            border: "1.5px solid rgba(255,255,255,0.3)", color: "#fff",
            textDecoration: "none", fontSize: 16, fontWeight: 700,
          }}>‹</Link>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#fff", lineHeight: 1 }}>
              {patient.last_name} {patient.first_name}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>
              {patient.phone || "Nessun telefono"}
            </div>
          </div>
        </div>
        <div ref={userMenuRef} style={{ position: "relative" }}>
          <button onClick={() => setUserMenuOpen(v => !v)} style={{
            width: 30, height: 30, borderRadius: 7, border: "1.5px solid rgba(255,255,255,0.35)",
            background: "rgba(255,255,255,0.2)", color: "#fff", fontWeight: 800, fontSize: 11,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>{userInitials}</button>
          {userMenuOpen && (
            <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 190,
              background: T.panelBg, border: `1.5px solid ${T.border}`,
              borderRadius: 12, boxShadow: "0 12px 32px rgba(30,64,175,0.15)", overflow: "hidden", zIndex: 60 }}>
              <Link href="/settings" onClick={() => setUserMenuOpen(false)} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
                color: T.text, textDecoration: "none", fontSize: 13, fontWeight: 600,
                borderBottom: `1.5px solid ${T.border}`,
              }}>⚙️ Impostazioni</Link>
              <button onClick={handleLogout} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "12px 16px", background: "transparent", border: "none",
                cursor: "pointer", color: T.red, fontWeight: 600, fontSize: 13,
              }}>⏻ Logout</button>
            </div>
          )}
        </div>
      </header>

      {/* ━━━ TAB BAR BOTTOM ━━━ */}
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30,
        background: T.panelBg, borderTop: `1.5px solid ${T.border}`,
        display: "flex", boxShadow: "0 -4px 16px rgba(15,23,42,0.08)",
        paddingBottom: "env(safe-area-inset-bottom,0px)",
      }}>
        {[
          { href: "/mobile",          label: "Home",       icon: "⌂" },
          { href: "/mobile/calendar", label: "Calendario", icon: "▦" },
          { href: "/mobile/patients", label: "Pazienti",   icon: "◉", active: true },
          { href: "/mobile/reports",  label: "Report",     icon: "◈" },
        ].map(item => (
          <Link key={item.href} href={item.href} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", padding: "10px 4px 9px", textDecoration: "none",
            gap: 3, position: "relative",
          }}>
            <span style={{ fontSize: 18, lineHeight: 1,
              ...((item as any).active
                ? { background: T.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }
                : { color: T.muted }) }}>
              {item.icon}
            </span>
            <span style={{ fontSize: 10, fontWeight: (item as any).active ? 700 : 600,
              color: (item as any).active ? T.blue : T.muted }}>
              {item.label}
            </span>
            {(item as any).active && (
              <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                width: 28, height: 2.5, borderRadius: 999, background: T.gradient }} />
            )}
          </Link>
        ))}
      </nav>

      {/* ━━━ HERO ━━━ */}
      <div style={{ background: T.panelBg, borderBottom: `1.5px solid ${T.border}`, padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
          {/* Avatar */}
          <div style={{
            width: 56, height: 56, borderRadius: 16, flexShrink: 0,
            background: T.gradient, display: "flex", alignItems: "center",
            justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 20,
          }}>
            {initials(patient)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: T.text }}>
              {patient.last_name} {patient.first_name}
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {patient.birth_date && <span>🎂 {ddmmyyyy(patient.birth_date)}{age !== null ? ` · ${age} anni` : ""}</span>}
              {patient.tax_code   && <span>🪪 {patient.tax_code}</span>}
            </div>
          </div>
        </div>

        {/* Chips sedute + incasso */}
        {apptStats.total > 0 ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
              background: "rgba(37,99,235,0.08)", color: T.blue, border: `1px solid rgba(37,99,235,0.2)` }}>
              {apptStats.done}{prescribed > 0 ? `/${prescribed}` : ""} sedute
            </span>
            {apptStats.paidRevenue > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                background: "rgba(22,163,74,0.08)", color: T.green, border: `1px solid rgba(22,163,74,0.2)` }}>
                💰 €{apptStats.paidRevenue.toFixed(0)} incassati
              </span>
            )}
            {apptStats.unpaid > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                background: "rgba(249,115,22,0.08)", color: T.amber, border: `1px solid rgba(249,115,22,0.2)` }}>
                💸 €{apptStats.unpaidRevenue.toFixed(0)} da incassare
              </span>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>
            Nessuna seduta ancora — pianifica la prima!
          </div>
        )}

        {/* Barra progresso */}
        {prescribed > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between",
              fontSize: 11, fontWeight: 600, color: T.muted, marginBottom: 5 }}>
              <span>Progresso ciclo</span>
              <span>{apptStats.done}/{prescribed} ({progressPct}%)</span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: T.appBg,
              border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 99, width: `${progressPct}%`,
                background: progressPct >= 100 ? T.green : T.gradient, transition: "width 0.4s ease" }} />
            </div>
          </div>
        )}

        {/* Quick actions */}
        {(() => {
          const _unpaid = appointments
            .filter((a: any) => (a.status === "done" || a.status === "not_paid") && !a.is_paid && a.amount)
            .reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0);
          return (
            <QuickActionBar
              phone={patient.phone}
              waPhone={waPhone}
              patientId={patient.id}
              unpaidAmount={_unpaid}
              birthDate={patient.birth_date ?? null}
              firstName={patient.first_name ?? null}
            />
          );
        })()}
      </div>

      {/* ━━━ TABS ━━━ */}
      <div style={{
        display: "flex", overflowX: "auto",
        background: T.panelBg, borderBottom: `1.5px solid ${T.border}`,
        padding: "0 12px", position: "sticky", top: 54, zIndex: 20,
      }}>
        {([
          { id: "info",      label: "Info",    icon: "👤" },
          { id: "clinical",  label: "Clinica", icon: "🩺" },
          { id: "therapies", label: "Sedute",  icon: "📋" },
          { id: "docs",      label: "Referti", icon: "📁" },
          { id: "esercizi",  label: "Esercizi", icon: "🏋️" },
          { id: "scales",    label: "Scale",   icon: "📊" },
          { id: "photos",    label: "Foto",    icon: "📷" },
          { id: "portal",    label: "Portale", icon: "🔑" },
        ] as { id: "info" | "clinical" | "therapies" | "docs" | "esercizi" | "scales" | "photos" | "portal"; label: string; icon: string }[]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: "11px 14px", background: "none", border: "none",
            borderBottom: `2.5px solid ${activeTab === tab.id ? T.blue : "transparent"}`,
            color: activeTab === tab.id ? T.blue : T.muted,
            fontWeight: activeTab === tab.id ? 700 : 600, fontSize: 13,
            whiteSpace: "nowrap", cursor: "pointer",
            fontFamily: "Inter,-apple-system,sans-serif",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{ fontSize: 14 }}>{tab.icon}</span>{tab.label}
          </button>
        ))}
      </div>

      {/* ━━━ CONTENUTO ━━━ */}
      <div style={{ padding: "14px 14px 0" }}>
        {error && <ErrBox msg={error} />}

        {/* ─── TAB INFO ─── */}
        {activeTab === "info" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: T.panelBg, border: `1.5px solid ${T.border}`,
              borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Anagrafica</span>
                  <SavedBadge show={savedInfo} />
                </div>
                <button onClick={editMode ? savePatient : () => setEditMode(true)}
                  disabled={saving} style={{
                    padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                    border: "none", cursor: saving ? "not-allowed" : "pointer",
                    background: editMode ? T.green : T.blue,
                    color: "#fff", opacity: saving ? 0.6 : 1,
                  }}>
                  {saving ? "Salvo…" : editMode ? "✓ Salva" : "Modifica"}
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <FG label="Nome">
                    <input value={firstName} onChange={e => setFirstName(e.target.value)}
                      disabled={!editMode} style={inputS(!editMode)} />
                  </FG>
                  <FG label="Cognome">
                    <input value={lastName} onChange={e => setLastName(e.target.value)}
                      disabled={!editMode} style={inputS(!editMode)} />
                  </FG>
                </div>
                <FG label="Telefono">
                  <input value={phone} onChange={e => setPhone(e.target.value)}
                    disabled={!editMode} style={inputS(!editMode)} placeholder="+39 …" />
                </FG>
                <FG label="Email">
                  <input value={email} onChange={e => setEmail(e.target.value)}
                    disabled={!editMode} style={inputS(!editMode)} placeholder="nome@email.it"
                    type="email" inputMode="email" />
                </FG>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <FG label={`Data di nascita${age !== null ? ` · ${age} anni` : ""}`}>
                    <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)}
                      disabled={!editMode} style={inputS(!editMode)} />
                  </FG>
                  <FG label="Codice fiscale">
                    <input value={taxCode} onChange={e => setTaxCode(e.target.value.toUpperCase())}
                      disabled={!editMode} style={inputS(!editMode)} placeholder="RSSMRA…"
                      maxLength={16} />
                  </FG>
                </div>
                <FG label="Indirizzo">
                  <input value={address} onChange={e => setAddress(e.target.value)}
                    disabled={!editMode} style={inputS(!editMode)} placeholder="Via, città…" />
                </FG>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <FG label="Sedute prescritte">
                    <input value={prescribedSessions} onChange={e => setPrescribedSessions(e.target.value)}
                      disabled={!editMode} style={inputS(!editMode)} placeholder="Es. 12" inputMode="numeric" />
                  </FG>
                  <FG label="Fatturazione">
                    <select value={preferredPlan} onChange={e => setPreferredPlan(e.target.value as Plan)}
                      disabled={!editMode} style={inputS(!editMode)}>
                      <option value="invoice">Fattura</option>
                      <option value="no_invoice">Non fattura</option>
                    </select>
                  </FG>
                </div>
              </div>

              {editMode && (
                <div style={{ marginTop: 14 }}>
                  <Btn v="ghost" onClick={() => setEditMode(false)}>Annulla</Btn>
                </div>
              )}
            </div>

            <Btn v="danger" onClick={deletePatient}>🗑 Elimina paziente</Btn>
          </div>
        )}

        {/* ─── TAB CLINICA ─── */}
        {activeTab === "clinical" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: T.panelBg, border: `1.5px solid ${T.border}`,
              borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Dati clinici</span>
                  <SavedBadge show={savedClin} />
                </div>
                <button onClick={clinicalEdit ? saveClinical : () => setClinicalEdit(true)}
                  disabled={savingClin} style={{
                    padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                    border: "none", cursor: savingClin ? "not-allowed" : "pointer",
                    background: clinicalEdit ? T.green : T.blue,
                    color: "#fff", opacity: savingClin ? 0.6 : 1,
                  }}>
                  {savingClin ? "Salvo…" : clinicalEdit ? "✓ Salva" : "Modifica"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <FG label="Anamnesi">
                  <textarea value={anamnesis} onChange={e => setAnamnesis(e.target.value)}
                    disabled={!clinicalEdit} rows={4} placeholder="Inserisci anamnesi…"
                    style={{ ...inputS(!clinicalEdit), resize: "vertical", minHeight: 90 }} />
                </FG>
                <FG label="Diagnosi">
                  <textarea value={diagnosis} onChange={e => setDiagnosis(e.target.value)}
                    disabled={!clinicalEdit} rows={4} placeholder="Inserisci diagnosi…"
                    style={{ ...inputS(!clinicalEdit), resize: "vertical", minHeight: 90 }} />
                </FG>
                <FG label="Trattamento">
                  <textarea value={treatment} onChange={e => setTreatment(e.target.value)}
                    disabled={!clinicalEdit} rows={4} placeholder="Inserisci trattamento…"
                    style={{ ...inputS(!clinicalEdit), resize: "vertical", minHeight: 90 }} />
                </FG>
              </div>
              {clinicalEdit && (
                <div style={{ marginTop: 14 }}>
                  <Btn v="ghost" onClick={() => setClinicalEdit(false)}>Annulla</Btn>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB SEDUTE ─── */}
        {activeTab === "therapies" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Riepilogo economico */}
            <div style={{ background: T.panelBg, border: `1.5px solid ${T.border}`,
              borderRadius: 14, padding: "14px 16px",
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8,
              boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
              {[
                { label: "Totale sedute", value: String(apptStats.total),                          color: T.blue  },
                { label: "Incassato",     value: `€${apptStats.paidRevenue.toFixed(0)}`,           color: T.green },
                { label: "Da incassare",  value: `€${apptStats.unpaidRevenue.toFixed(0)}`,         color: apptStats.unpaid > 0 ? T.amber : T.muted },
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: T.muted, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Barra progresso ciclo */}
            {prescribed > 0 && (
              <div style={{ background: T.panelBg, border: `1.5px solid ${T.border}`,
                borderRadius: 14, padding: "14px 16px", boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>
                  <span>Ciclo di trattamento</span>
                  <span style={{ color: progressPct >= 100 ? T.green : T.blue }}>
                    {apptStats.done}/{prescribed} sedute
                  </span>
                </div>
                <div style={{ height: 10, borderRadius: 99, background: T.appBg,
                  border: `1px solid ${T.border}`, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 99, width: `${progressPct}%`,
                    background: progressPct >= 100 ? T.green : T.gradient, transition: "width 0.4s ease" }} />
                </div>
                {progressPct >= 100 && (
                  <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: T.green, textAlign: "center" }}>
                    ✅ Ciclo completato!
                  </div>
                )}
              </div>
            )}

            {/* Nuovo appuntamento inline */}
            <div style={{ background: T.panelBg, border: `1.5px solid ${T.border}`,
              borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
              <button onClick={() => setNewApptOpen(v => !v)} style={{
                width: "100%", padding: "13px 16px", background: "none", border: "none",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                cursor: "pointer", fontFamily: "Inter,-apple-system,sans-serif",
              }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: T.text }}>
                  ➕ Nuova seduta
                </span>
                <span style={{ color: T.muted, fontSize: 16 }}>{newApptOpen ? "▲" : "▼"}</span>
              </button>

              {newApptOpen && (
                <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12,
                  borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <FG label="Data">
                      <input type="date" value={newApptDate} onChange={e => setNewApptDate(e.target.value)}
                        style={inputS()} />
                    </FG>
                    <FG label="Ora">
                      <input type="time" value={newApptTime} onChange={e => setNewApptTime(e.target.value)}
                        style={inputS()} />
                    </FG>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <FG label="Durata (min)">
                      <input type="number" min={15} step={5} value={newApptDur}
                        onChange={e => setNewApptDur(Number(e.target.value))} style={inputS()} />
                    </FG>
                    <FG label="Importo (€)">
                      <input value={newApptAmt} onChange={e => setNewApptAmt(e.target.value)}
                        style={inputS()} placeholder="Es. 40" inputMode="decimal" />
                    </FG>
                  </div>
                  <FG label="Stato">
                    <select value={newApptStatus} onChange={e => setNewApptStatus(e.target.value as Status)}
                      style={inputS()}>
                      <option value="confirmed">Confermata</option>
                      <option value="booked">Prenotata</option>
                      <option value="done">Eseguita</option>
                    </select>
                  </FG>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <Btn v="primary" onClick={createAppointment} disabled={savingAppt}>
                      {savingAppt ? "Salvo…" : "✓ Crea"}
                    </Btn>
                    <Btn v="ghost" onClick={() => setNewApptOpen(false)}>Annulla</Btn>
                  </div>
                </div>
              )}
            </div>

            {/* Lista sedute */}
            <div style={{ background: T.panelBg, border: `1.5px solid ${T.border}`,
              borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>

              {/* Header con filtri */}
              <div style={{ padding: "12px 16px", borderBottom: `1.5px solid ${T.border}`,
                display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  {/* Toggle futuro/passato */}
                  <div style={{ display: "flex", borderRadius: 9, overflow: "hidden",
                    border: `1.5px solid ${T.border}`, flexShrink: 0 }}>
                    {(["future", "past"] as const).map(f => (
                      <button key={f} onClick={() => { setApptFilter(f); setYearFilter("tutti"); }} style={{
                        padding: "5px 12px", fontSize: 11, fontWeight: 700, border: "none",
                        cursor: "pointer", fontFamily: "Inter,-apple-system,sans-serif",
                        background: apptFilter === f ? T.blue : T.panelSoft,
                        color: apptFilter === f ? "#fff" : T.muted,
                      }}>
                        {f === "future" ? "Prossime" : "Storico"}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>
                    {filteredAppts.length} sedute
                  </span>
                </div>

                {/* Filtro anno — solo nello storico */}
                {apptFilter === "past" && availableYears.length > 1 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["tutti", ...availableYears.map(String)].map(y => (
                      <button key={y} onClick={() => setYearFilter(y)} style={{
                        padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
                        border: `1.5px solid ${yearFilter === y ? T.blue : T.border}`,
                        background: yearFilter === y ? "rgba(37,99,235,0.08)" : T.panelSoft,
                        color: yearFilter === y ? T.blue : T.muted,
                        cursor: "pointer",
                      }}>
                        {y === "tutti" ? "Tutti" : y}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {filteredAppts.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: T.muted, fontSize: 13 }}>
                  {apptFilter === "future" ? "Nessuna seduta futura" : "Nessuna seduta nello storico"}
                </div>
              ) : (
                <div>
                  {filteredAppts.map((appt, i) => {
                    const col = statusColor(appt.status);
                    const isEditingAmt = editingApptId === appt.id;
                    return (
                      <div key={appt.id} style={{
                        padding: "12px 16px",
                        borderBottom: i < filteredAppts.length - 1 ? `1px solid ${T.border}` : "none",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between",
                          alignItems: "center", marginBottom: 8 }}>
                          <div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                              {formatDateIT(appt.start_at)}
                            </span>
                            <span style={{ fontSize: 11, color: T.muted, marginLeft: 6 }}>
                              {fmtTime(appt.start_at)}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {/* Importo — cliccabile per modificare */}
                            {isEditingAmt ? (
                              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                <input value={editingAmount} onChange={e => setEditingAmount(e.target.value)}
                                  style={{ ...inputS(), width: 72, padding: "4px 8px", fontSize: 12 }}
                                  placeholder="€" inputMode="decimal" autoFocus />
                                <button onClick={() => saveApptAmount(appt.id)} style={{
                                  padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                  background: T.green, color: "#fff", border: "none", cursor: "pointer",
                                }}>✓</button>
                                <button onClick={() => setEditingApptId(null)} style={{
                                  padding: "4px 6px", borderRadius: 6, fontSize: 11,
                                  background: T.panelSoft, border: `1px solid ${T.border}`,
                                  cursor: "pointer", color: T.muted,
                                }}>✕</button>
                              </div>
                            ) : (
                              <button onClick={() => { setEditingApptId(appt.id); setEditingAmount(appt.amount != null ? String(appt.amount) : ""); }}
                                style={{ fontSize: 11, fontWeight: 700, color: T.muted,
                                  background: "none", border: `1px solid ${T.border}`,
                                  borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}>
                                {appt.amount != null ? `€${appt.amount}` : "€ —"}
                              </button>
                            )}
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                              background: `${col}18`, color: col, border: `1px solid ${col}30` }}>
                              {statusLabel(appt.status)}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <select value={appt.status}
                            onChange={e => updateAppointmentStatus(appt.id, e.target.value as Status)}
                            style={{ ...inputS(), padding: "7px 10px", fontSize: 12, flex: 1 }}>
                            <option value="booked">Prenotata</option>
                            <option value="confirmed">Confermata</option>
                            <option value="done">Eseguita</option>
                            <option value="cancelled">Annullata</option>
                            <option value="not_paid">Non pagata</option>
                          </select>
                          {appt.status === "done" && (
                            <button onClick={() => togglePaid(appt.id, !appt.is_paid)} style={{
                              padding: "7px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                              cursor: "pointer", flexShrink: 0, border: "none",
                              background: appt.is_paid ? "rgba(22,163,74,0.10)" : T.panelSoft,
                              color: appt.is_paid ? T.green : T.muted,
                              outline: `1.5px solid ${appt.is_paid ? "rgba(22,163,74,0.4)" : T.border}`,
                            }}>
                              {appt.is_paid ? "💰 Pagata" : "○ Non pagata"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB REFERTI ─── */}
        {activeTab === "esercizi" && (
          <MobileEserciziTab patientId={patient.id} patientName={`${patient.last_name ?? ""} ${patient.first_name ?? ""}`.trim()} />
        )}

        {/* ─── SCALE ─── */}
        {activeTab === "scales" && (
          <div style={{ padding:"14px 12px" }}>
            <div style={{ fontSize:15, fontWeight:800, color:T.text, marginBottom:14 }}>📊 Scale di valutazione</div>
            <ClinicalScalesSection patientId={patient.id} />
          </div>
        )}

        {/* ─── FOTO ─── */}
        {activeTab === "photos" && (
          <div style={{ padding:"14px 12px" }}>
            <div style={{ fontSize:15, fontWeight:800, color:T.text, marginBottom:14 }}>📷 Foto cliniche</div>
            <PhotoGallerySection patientId={patient.id} />
          </div>
        )}

        {/* ─── PORTALE ─── */}
        {activeTab === "portal" && (
          <MobilePortalTab patient={patient} />
        )}

        {activeTab === "docs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Upload */}
            <div style={{ background: T.panelBg, border: `1.5px solid ${T.border}`,
              borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: T.text, marginBottom: 4 }}>
                Carica referti
              </div>
              {docTypeHint(docType) && (
                <div style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>{docTypeHint(docType)}</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <FG label="Tipo documento">
                  <select value={docType} onChange={e => setDocType(e.target.value as DocType)} style={inputS()}>
                    <option value="rx">Rx</option>
                    <option value="rm">RMN</option>
                    <option value="tac">TAC</option>
                    <option value="ecografia">Ecografia</option>
                    <option value="elettromiografia">Elettromiografia</option>
                    <option value="prescrizione">Prescrizione</option>
                    <option value="altro">Altro</option>
                    <option value="gdpr_informativa_privacy">GDPR Privacy (legacy)</option>
                    <option value="consenso_trattamento">Consenso trattamento (legacy)</option>
                  </select>
                </FG>
                <input type="file" accept=".pdf,image/*" multiple onChange={onPickFiles} style={inputS()} />
                {files.length > 0 && (
                  <div style={{ padding: "10px 12px", borderRadius: 10, fontSize: 12,
                    background: T.panelSoft, border: `1.5px solid ${T.border}`, color: T.muted }}>
                    <span style={{ fontWeight: 700, color: T.text }}>{files.length} file selezionati</span>
                    <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                      {files.slice(0, 5).map(f => <span key={f.name}>• {f.name}</span>)}
                      {files.length > 5 && <span>…e altri {files.length - 5}</span>}
                    </div>
                  </div>
                )}
                <Btn v="primary" onClick={uploadDocuments} disabled={uploading || files.length === 0}>
                  {uploading
                    ? `Caricamento ${uploadProgress.done}/${uploadProgress.total}${uploadProgress.current ? ` • ${uploadProgress.current}` : ""}`
                    : "⬆ Carica"}
                </Btn>
              </div>
            </div>

            {/* Lista documenti con filtro per tipo */}
            <div style={{ background: T.panelBg, border: `1.5px solid ${T.border}`,
              borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>

              <div style={{ padding: "12px 16px", borderBottom: `1.5px solid ${T.border}`,
                display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: T.text }}>
                    Documenti ({filteredDocs.length})
                  </span>
                </div>
                {/* Filtro tipo documento */}
                {docTypesPresent.length > 1 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["tutti", ...docTypesPresent].map(t => (
                      <button key={t} onClick={() => setDocFilter(t)} style={{
                        padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
                        border: `1.5px solid ${docFilter === t ? T.blue : T.border}`,
                        background: docFilter === t ? "rgba(37,99,235,0.08)" : T.panelSoft,
                        color: docFilter === t ? T.blue : T.muted, cursor: "pointer",
                      }}>
                        {t === "tutti" ? "Tutti" : docTypeLabel(t)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {filteredDocs.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: T.muted, fontSize: 13 }}>
                  Nessun documento caricato
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {filteredDocs.map((doc, i) => (
                    <div key={doc.id} style={{
                      padding: "12px 16px",
                      borderBottom: i < filteredDocs.length - 1 ? `1px solid ${T.border}` : "none",
                      display: "flex", alignItems: "flex-start", gap: 12,
                    }}>
                      <DocThumbnail doc={doc} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.blue, marginBottom: 2,
                          textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {docTypeLabel(doc.doc_type as string)}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 3,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {isImageFile(doc.file_name) ? "🖼" : "📄"} {doc.file_name}
                        </div>
                        <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
                          {doc.uploaded_at ? formatDateTimeIT(doc.uploaded_at) : "—"}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Btn v="ghost" full={false} onClick={() => openDocument(doc)}>🔗 Apri</Btn>
                          <Btn v="danger" full={false} onClick={() => deleteDocument(doc)}>🗑</Btn>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Scheda Esercizi Mobile ─────────────────────────────────────────────────
function MobileEserciziTab({ patientId, patientName }: { patientId: string; patientName: string }) {
  const [esercizi, setEsercizi] = React.useState<any[]>([]);
  const [schedaId, setSchedaId] = React.useState<string|null>(null);
  const [pubLink,  setPubLink]  = React.useState("");
  const [loading,  setLoading]  = React.useState(true);
  const [genLoading, setGenLoading] = React.useState(false);
  const [error,    setError]    = React.useState("");
  const [storico,  setStorico]  = React.useState<any[]>([]);

  React.useEffect(() => { loadScheda(); }, [patientId]);

  async function loadScheda() {
    setLoading(true);
    try {
      const { data } = await supabase.from("schede_esercizi_pubbliche")
        .select("id,token,esercizi,note,created_at").eq("patient_id", patientId)
        .order("created_at", { ascending: false }).limit(5);
      if (data && data.length > 0) {
        setSchedaId(data[0].id);
        setEsercizi(JSON.parse(data[0].esercizi ?? "[]"));
        setPubLink(`${window.location.origin}/esercizi/${data[0].token}`);
        setStorico(data);
      }
    } catch(e) { console.warn(e); }
    finally { setLoading(false); }
  }

  async function generaAI() {
    setGenLoading(true); setError("");
    try {
      const res = await fetch("/api/ai-esercizi", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: `Sei un fisioterapista. Genera esattamente 5 esercizi domiciliari per il paziente: ${patientName}.\nRispondi SOLO con array JSON: [{"id":"1","nome":"","descrizione":"","serie":"3","ripetizioni":"10","frequenza":"1 volta al giorno","note":"","avvertenze":"","youtube_id":"","categoria":"rinforzo"}]` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const match = data.text.replace(/```json|```/g,"").trim().match(/\[[\s\S]*\]/);
      if (!match) throw new Error("JSON non trovato");
      const parsed = JSON.parse(match[0]);
      // Cerca video YouTube
      const withVideos = await Promise.all(parsed.map(async (e: any) => {
        try {
          const r = await fetch(`/api/youtube-search?q=${encodeURIComponent(e.nome)}`);
          const d = await r.json();
          if (d.videoId) return { ...e, youtube_id: d.videoId };
        } catch {}
        return e;
      }));
      setEsercizi(withVideos);
      // Salva
      const token = Math.random().toString(36).slice(2,14);
      const payload = { patient_id:patientId, patient_name:patientName, esercizi:JSON.stringify(withVideos), token, expires_at:new Date(Date.now()+90*24*60*60*1000).toISOString() };
      if (schedaId) {
        await supabase.from("schede_esercizi_pubbliche").update(payload).eq("id", schedaId);
      } else {
        const { data:d } = await supabase.from("schede_esercizi_pubbliche").insert(payload).select("id,token").single();
        if (d) { setSchedaId(d.id); setPubLink(`${window.location.origin}/esercizi/${d.token}`); }
      }
      await loadScheda();
    } catch(e:any) { setError(e?.message ?? "Errore"); }
    finally { setGenLoading(false); }
  }

  function sendWA() {
    if (!pubLink) return;
    const msg = `Gentile ${patientName},\nEcco la sua scheda esercizi domiciliari:\n${pubLink}\n\nDr. Marco Turchetta`;
    const a = document.createElement("a");
    a.href = (typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'https://api.whatsapp.com' : 'https://web.whatsapp.com') + '/send?text=' + encodeURIComponent(msg);
    a.target = "_blank"; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  const inp = { width:"100%", padding:"10px 12px", borderRadius:8, border:"1.5px solid #cbd5e1", fontSize:14, outline:"none", background:"#fff", color:"#0f172a", boxSizing:"border-box" as const };

  if (loading) return <div style={{padding:32,textAlign:"center",color:"#64748b"}}>Caricamento…</div>;

  return (
    <div style={{padding:"16px 0"}}>
      {error && <div style={{marginBottom:12,padding:"10px 14px",borderRadius:8,background:"rgba(220,38,38,0.05)",border:"1px solid rgba(220,38,38,0.2)",color:"#dc2626",fontSize:13}}>{error}</div>}

      {/* Bottoni azione */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <button onClick={generaAI} disabled={genLoading}
          style={{flex:1,padding:"12px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#0d9488,#2563eb)",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",opacity:genLoading?0.7:1}}>
          {genLoading?"⏳ Generando…":"✨ Genera con AI"}
        </button>
        {pubLink && (
          <button onClick={sendWA} style={{padding:"12px 16px",borderRadius:10,border:"1.5px solid #16a34a",background:"rgba(22,163,74,0.06)",color:"#16a34a",fontWeight:700,fontSize:14,cursor:"pointer"}}>
            💬 WA
          </button>
        )}
        {pubLink && (
          <button onClick={()=>navigator.clipboard.writeText(pubLink)} style={{padding:"12px 16px",borderRadius:10,border:"1.5px solid #2563eb",background:"rgba(37,99,235,0.06)",color:"#2563eb",fontWeight:700,fontSize:14,cursor:"pointer"}}>
            🔗
          </button>
        )}
      </div>

      {/* Link pubblico */}
      {pubLink && (
        <div style={{marginBottom:14,padding:"12px 14px",borderRadius:10,background:"rgba(22,163,74,0.05)",border:"1.5px solid rgba(22,163,74,0.25)"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#15803d",marginBottom:6}}>✅ Link attivo — tocca per copiare:</div>
          <div onClick={()=>navigator.clipboard.writeText(pubLink)} style={{fontSize:11,color:"#0f172a",background:"#f1f5f9",padding:"6px 10px",borderRadius:6,wordBreak:"break-all",cursor:"pointer"}}>
            {pubLink}
          </div>
          <a href={pubLink} target="_blank" rel="noopener noreferrer" style={{display:"inline-block",marginTop:8,fontSize:12,color:"#2563eb",fontWeight:700,textDecoration:"none"}}>👁️ Anteprima →</a>
        </div>
      )}

      {/* Lista esercizi */}
      {genLoading ? (
        <div style={{textAlign:"center",padding:24,color:"#0d9488"}}><div style={{fontSize:28,marginBottom:8}}>✨</div><div style={{fontSize:14,fontWeight:700}}>Generando esercizi e cercando video…</div></div>
      ) : esercizi.length === 0 ? (
        <div style={{textAlign:"center",padding:24,color:"#94a3b8"}}><div style={{fontSize:36,marginBottom:8}}>🏋️</div><div style={{fontSize:14,fontWeight:600}}>Nessun esercizio ancora</div><div style={{fontSize:12,marginTop:4}}>Clicca "Genera con AI" per creare un programma personalizzato</div></div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {esercizi.map((e:any,idx:number) => (
            <div key={e.id ?? idx} style={{background:"#fff",borderRadius:10,border:"1.5px solid #e2e8f0",padding:"12px 14px"}}>
              <div style={{fontWeight:800,fontSize:14,color:"#0f172a",marginBottom:4}}>{idx+1}. {e.nome}</div>
              <div style={{fontSize:12,color:"#64748b",marginBottom:6}}>{e.serie} serie × {e.ripetizioni} · {e.frequenza}</div>
              {e.descrizione && <div style={{fontSize:12,color:"#334155",lineHeight:1.6,marginBottom:6}}>{e.descrizione}</div>}
              {e.avvertenze && <div style={{fontSize:11,color:"#dc2626",background:"rgba(220,38,38,0.05)",padding:"5px 8px",borderRadius:6,marginBottom:6}}>⚠️ {e.avvertenze}</div>}
              {e.youtube_id && (
                <a href={`https://www.youtube.com/watch?v=${e.youtube_id}`} target="_blank" rel="noopener noreferrer"
                  style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"#dc2626",borderRadius:8,textDecoration:"none",color:"#fff",fontWeight:700,fontSize:13}}>
                  <span style={{fontSize:16}}>▶</span> Guarda il video
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Storico */}
      {storico.length > 1 && (
        <div style={{marginTop:16,padding:"12px 14px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f8fafc"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#334155",marginBottom:8}}>🕐 Schede precedenti</div>
          {storico.slice(1).map((s:any) => (
            <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <div style={{flex:1,fontSize:12,color:"#64748b"}}>{new Date(s.created_at).toLocaleDateString("it-IT")}</div>
              <button onClick={async()=>{ const{data}=await supabase.from("schede_esercizi_pubbliche").select("*").eq("id",s.id).single(); if(data){setSchedaId(data.id);setEsercizi(JSON.parse(data.esercizi??"[]"));setPubLink(`${window.location.origin}/esercizi/${data.token}`);} }}
                style={{padding:"4px 10px",borderRadius:6,border:"1px solid #0d9488",background:"rgba(13,148,136,0.06)",color:"#0d9488",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                Carica
              </button>
              <button onClick={async()=>{
                if(!confirm("Eliminare questa scheda?")) return;
                await supabase.from("schede_esercizi_pubbliche").delete().eq("id",s.id);
                const{data:newStorico}=await supabase.from("schede_esercizi_pubbliche").select("id,token,esercizi,note,created_at").eq("patient_id",patientId).order("created_at",{ascending:false});
                setStorico(newStorico||[]);
              }} style={{padding:"4px 8px",borderRadius:6,border:"1px solid rgba(220,38,38,0.3)",background:"rgba(220,38,38,0.05)",color:"#dc2626",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Portal Tab (mobile) ─────────────────────────────────────────────── */
function MobilePortalTab({ patient }: { patient: any }) {
  const T2 = { teal:"#0d9488", blue:"#2563eb", text:"#0f172a", muted:"#64748b", border:"#e2e8f0", green:"#16a34a", panelBg:"#fff", panelSoft:"#f8fafc" };
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  function cleanPhone(phone: string): string {
    let p = phone.replace(/[\s\(\)\-\.]/g,"").replace(/^\+/,"");
    if(p.startsWith("00")) p=p.slice(2);
    if(p.startsWith("0")) p="39"+p;
    if(!p.startsWith("39")&&p.length<=10) p="39"+p;
    return p;
  }

  async function generate() {
    setLoading(true);
    try {
      const r = await fetch("/api/portal",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({patient_id:patient.id})});
      const d = await r.json();
      if(d.error){alert("Errore: "+d.error);return;}
      const url = `${window.location.origin}/portale/${d.token}`;
      setLink(url);
      return url;
    } finally { setLoading(false); }
  }

  async function sendWA() {
    const url = link || await generate();
    if(!url||!patient.phone) return;
    const nome = patient.first_name?.trim()||"Paziente";
    const msg = "Gentile "+nome+",\n\nle ho attivato la sua area personale FisioHub dove puo vedere:\n- i suoi prossimi appuntamenti\n- la scheda esercizi da casa\n- i contatti dello studio\n\nIl suo link personale (valido 6 mesi):\n"+url+"\n\nCordiali saluti,\nDr. Marco Turchetta";
    const clean = cleanPhone(patient.phone);
    openWA(clean, msg);
  }

  async function copy() {
    const url = link || await generate();
    if(!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(()=>setCopied(false),2000); }
    catch { alert("Link: "+url); }
  }

  return (
    <div style={{padding:"16px 14px",display:"flex",flexDirection:"column",gap:14}}>
      <div style={{fontSize:15,fontWeight:800,color:T2.text}}>🔑 Area riservata paziente</div>
      <div style={{background:"rgba(124,58,237,0.06)",border:"1.5px solid rgba(124,58,237,0.25)",borderRadius:12,padding:"16px"}}>
        <div style={{fontSize:13,fontWeight:700,color:"#7c3aed",marginBottom:8}}>Cosa vede il paziente</div>
        <div style={{fontSize:12,color:T2.muted,lineHeight:1.7}}>
          • I suoi prossimi appuntamenti<br/>
          • La scheda esercizi domiciliari<br/>
          • I contatti dello studio<br/>
          • Link valido 6 mesi
        </div>
      </div>
      {link&&(
        <div style={{background:"rgba(22,163,74,0.06)",border:"1.5px solid rgba(22,163,74,0.3)",borderRadius:10,padding:"12px 14px"}}>
          <div style={{fontSize:11,fontWeight:700,color:T2.green,marginBottom:6}}>✅ Link generato</div>
          <div style={{fontSize:11,color:T2.text,wordBreak:"break-all",background:"#f8fafc",borderRadius:6,padding:"6px 8px",marginBottom:8,fontFamily:"monospace"}}>{link}</div>
        </div>
      )}
      <button onClick={sendWA} disabled={loading||!patient.phone}
        style={{width:"100%",padding:"14px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#25D366,#128C7E)",color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit",opacity:(!patient.phone||loading)?0.6:1}}>
        {loading?"⏳ Generando…":"💬 Invia link su WhatsApp"}
      </button>
      {!patient.phone&&<div style={{fontSize:11,color:"#dc2626",textAlign:"center"}}>Nessun numero di telefono salvato</div>}
      <button onClick={copy} disabled={loading}
        style={{width:"100%",padding:"12px",borderRadius:10,border:`1.5px solid ${T2.border}`,background:T2.panelSoft,color:copied?T2.green:T2.muted,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
        {copied?"✓ Link copiato!":"📋 Copia link (senza inviare)"}
      </button>
    </div>
  );
}
