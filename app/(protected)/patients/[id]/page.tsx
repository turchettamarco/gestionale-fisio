"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────
type Plan   = "invoice" | "no_invoice";
type Status = "booked" | "confirmed" | "done";

type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  birth_date: string | null;
  birth_place: string | null;
  tax_code: string | null;
  residence_city: string | null;
  preferred_plan: Plan | null;
  anamnesis: string | null;
  diagnosis: string | null;
  treatment: string | null;
  patient_status: string | null;
  acquisition_channel: string | null;
  first_visit_date: string | null;
  main_complaint: string | null;
  body_region: string | null;
  side: string | null;
  pathology_type: string | null;
  medical_diagnosis: string | null;
  expected_frequency: number | null;
  package_size: number | null;
};

type AppointmentRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: Status;
  is_paid: boolean;
  calendar_note: string | null;
};

type DocType = "gdpr_informativa_privacy" | "consenso_trattamento" | "altro";
type PatientDoc = {
  id: string;
  patient_id: string;
  doc_type: DocType;
  file_name: string;
  storage_path: string;
  uploaded_at: string;
};

type ClinicalDocType = "prescrizione" | "rx" | "rm" | "tac" | "elettromiografia" | "ecografia";
type ClinicalDocument = {
  id: string;
  patient_id: string;
  doc_type: ClinicalDocType;
  report_text: string | null;
  file_name: string | null;
  storage_path: string | null;
  uploaded_at: string;
};

// ─── Theme (identico al calendario) ──────────────────────────────────────────
const THEME = {
  appBg:          "#f1f5f9",
  panelBg:        "#ffffff",
  panelSoft:      "#f7f9fd",
  cardBg:         "#ffffff",
  text:           "#0f172a",
  textSoft:       "#1e293b",
  muted:          "#334155",
  border:         "#cbd5e1",
  borderSoft:     "#94a3b8",
  blue:           "#2563eb",
  blueDark:       "#1e40af",
  green:          "#16a34a",
  greenDark:      "#15803d",
  teal:           "#0d9488",
  red:            "#dc2626",
  amber:          "#f97316",
  gray:           "#94a3b8",
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function normalizeTaxCode(v: string) {
  return v.replace(/\s+/g, "").toUpperCase();
}

function ddmmyyyy(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function capitalizeFirst(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formatDateTimeIT(iso: string) {
  const d = new Date(iso);
  const weekday = capitalizeFirst(d.toLocaleString("it-IT", { weekday: "short" }));
  const datePart = d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timePart = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${weekday} ${datePart} • ${timePart}`;
}

function statusLabel(s: Status) {
  if (s === "booked")    return "Prenotata";
  if (s === "confirmed") return "Confermata";
  return "Eseguita";
}

function statusColors(s: Status) {
  if (s === "done")      return { fg: THEME.green, bg: "rgba(22,163,74,0.10)",   bd: "rgba(22,163,74,0.30)" };
  if (s === "confirmed") return { fg: THEME.blue,  bg: "rgba(37,99,235,0.10)",   bd: "rgba(37,99,235,0.30)" };
  return                        { fg: THEME.red,   bg: "rgba(220,38,38,0.10)",   bd: "rgba(220,38,38,0.30)" };
}

function docTypeLabel(t: DocType) {
  if (t === "gdpr_informativa_privacy") return "GDPR – Informativa Privacy";
  if (t === "consenso_trattamento")     return "Consenso al trattamento";
  return "Altro";
}

function clinicalDocTypeLabel(t: ClinicalDocType) {
  const labels: Record<ClinicalDocType, string> = {
    prescrizione:   "Prescrizione",
    rx:             "Rx (Radiografia)",
    rm:             "RM (Risonanza Magnetica)",
    tac:            "TAC (Tomografia Assiale Computerizzata)",
    elettromiografia: "Elettromiografia",
    ecografia:      "Ecografia",
  };
  return labels[t];
}

function same(v1: any, v2: any) {
  return (v1 ?? "") === (v2 ?? "");
}

function safeNumToStr(n: number | null | undefined) {
  return typeof n === "number" && !Number.isNaN(n) ? String(n) : "";
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const resolvedParams = React.use(params as any) as { id: string };
  const patientId = resolvedParams.id;

  // ── Auth / user menu ──────────────────────────────────────────────────────
  const [userEmail, setUserEmail]     = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data?.user?.email ?? null);
    })();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!userMenuOpen) return;
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [userMenuOpen]);

  const handleLogout = useCallback(async () => {
    try { await supabase.auth.signOut(); } finally {
      setUserMenuOpen(false);
      window.location.href = "/login";
    }
  }, []);

  const userInitials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "?";

  // ── Core state ────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);

  // ── Anagrafica form ───────────────────────────────────────────────────────
  const [demoEditMode,    setDemoEditMode]    = useState(false);
  const [savingDemo,      setSavingDemo]      = useState(false);
  const [deletingPatient, setDeletingPatient] = useState(false);

  const [firstName,   setFirstName]   = useState("");
  const [lastName,    setLastName]    = useState("");
  const [phone,       setPhone]       = useState("");
  const [resCity,     setResCity]     = useState("");
  const [preferredPlan, setPreferredPlan] = useState<Plan>("invoice");
  const [birthDate,   setBirthDate]   = useState("");
  const [birthPlace,  setBirthPlace]  = useState("");
  const [taxCode,     setTaxCode]     = useState("");

  // V2 fields
  const [showV2Clinical,    setShowV2Clinical]    = useState(true);
  const [showV2Business,    setShowV2Business]    = useState(true);
  const [patientStatus,     setPatientStatus]     = useState("active");
  const [acquisitionChannel, setAcquisitionChannel] = useState("");
  const [firstVisitDate,    setFirstVisitDate]    = useState("");
  const [mainComplaint,     setMainComplaint]     = useState("");
  const [bodyRegion,        setBodyRegion]        = useState("");
  const [side,              setSide]              = useState("");
  const [pathologyType,     setPathologyType]     = useState("");
  const [medicalDiagnosis,  setMedicalDiagnosis]  = useState("");
  const [expectedFrequency, setExpectedFrequency] = useState("");
  const [packageSize,       setPackageSize]       = useState("");

  // ── Clinica ───────────────────────────────────────────────────────────────
  const [anamnesis,       setAnamnesis]       = useState("");
  const [diagnosis,       setDiagnosis]       = useState("");
  const [treatment,       setTreatment]       = useState("");
  const [savingClinical,  setSavingClinical]  = useState(false);
  const [showTreatmentDiary, setShowTreatmentDiary] = useState(true);

  // ── Documenti clinici ─────────────────────────────────────────────────────
  const [clinicalDocs,       setClinicalDocs]       = useState<ClinicalDocument[]>([]);
  const [loadingClinicalDocs, setLoadingClinicalDocs] = useState(false);
  const [savingClinicalDoc,  setSavingClinicalDoc]  = useState<string | null>(null);
  const [clinicalUploadType, setClinicalUploadType] = useState<ClinicalDocType>("prescrizione");
  const [clinicalUploadTitle, setClinicalUploadTitle] = useState("");
  const [clinicalUploadFile, setClinicalUploadFile] = useState<File | null>(null);

  // ── Appuntamenti ──────────────────────────────────────────────────────────
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(false);
  const [rowBusy,      setRowBusy]      = useState<Record<string, boolean>>({});
  const [notesByApptId,    setNotesByApptId]    = useState<Record<string, string>>({});
  const [noteBusyByApptId, setNoteBusyByApptId] = useState<Record<string, boolean>>({});

  // ── Documenti GDPR ────────────────────────────────────────────────────────
  const [docs,        setDocs]        = useState<PatientDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [docType,     setDocType]     = useState<DocType>("gdpr_informativa_privacy");
  const [file,        setFile]        = useState<File | null>(null);

  // ─── Hydrate from patient ─────────────────────────────────────────────────
  function hydrateFromPatient(p: Patient) {
    setFirstName(p.first_name ?? "");
    setLastName(p.last_name ?? "");
    setPhone(p.phone ?? "");
    setResCity(p.residence_city ?? "");
    setPreferredPlan((p.preferred_plan ?? "invoice") as Plan);
    setBirthDate(p.birth_date ?? "");
    setBirthPlace(p.birth_place ?? "");
    setTaxCode(p.tax_code ?? "");
    setAnamnesis(p.anamnesis ?? "");
    setDiagnosis(p.diagnosis ?? "");
    setTreatment(p.treatment ?? "");
    setPatientStatus((p.patient_status ?? "active") as any);
    setAcquisitionChannel(p.acquisition_channel ?? "");
    setFirstVisitDate(p.first_visit_date ?? "");
    setMainComplaint(p.main_complaint ?? "");
    setBodyRegion(p.body_region ?? "");
    setSide(p.side ?? "");
    setPathologyType(p.pathology_type ?? "");
    setMedicalDiagnosis(p.medical_diagnosis ?? "");
    setExpectedFrequency(safeNumToStr(p.expected_frequency));
    setPackageSize(safeNumToStr(p.package_size));
  }

  // ─── Dirty checks ─────────────────────────────────────────────────────────
  const demoDirty = useMemo(() => {
    if (!patient) return false;
    return (
      !same(firstName.trim(),  patient.first_name)  ||
      !same(lastName.trim(),   patient.last_name)   ||
      !same(phone.trim(),      patient.phone)        ||
      !same(resCity.trim(),    patient.residence_city) ||
      preferredPlan !== (patient.preferred_plan ?? "invoice") ||
      !same(birthDate.trim(),  patient.birth_date)  ||
      !same(birthPlace.trim(), patient.birth_place) ||
      !same(normalizeTaxCode(taxCode).trim(), patient.tax_code) ||
      !same((patientStatus ?? "").trim(),      (patient.patient_status ?? "active")) ||
      !same((acquisitionChannel ?? "").trim(), (patient.acquisition_channel ?? "")) ||
      !same((firstVisitDate ?? "").trim(),     (patient.first_visit_date ?? "")) ||
      !same((mainComplaint ?? "").trim(),      (patient.main_complaint ?? "")) ||
      !same((bodyRegion ?? "").trim(),         (patient.body_region ?? "")) ||
      !same((side ?? "").trim(),               (patient.side ?? "")) ||
      !same((pathologyType ?? "").trim(),      (patient.pathology_type ?? "")) ||
      !same((medicalDiagnosis ?? "").trim(),   (patient.medical_diagnosis ?? "")) ||
      !same((expectedFrequency ?? "").trim(),  safeNumToStr(patient.expected_frequency)) ||
      !same((packageSize ?? "").trim(),        safeNumToStr(patient.package_size))
    );
  }, [patient, firstName, lastName, phone, resCity, preferredPlan, birthDate, birthPlace, taxCode,
      patientStatus, acquisitionChannel, firstVisitDate, mainComplaint, bodyRegion, side,
      pathologyType, medicalDiagnosis, expectedFrequency, packageSize]);

  const clinicalDirty = useMemo(() => {
    if (!patient) return false;
    return (
      !same(anamnesis.trim(), patient.anamnesis) ||
      !same(diagnosis.trim(), patient.diagnosis) ||
      !same(treatment.trim(), patient.treatment)
    );
  }, [patient, anamnesis, diagnosis, treatment]);

  // ─── Loaders ──────────────────────────────────────────────────────────────
  async function loadPatient() {
    setLoading(true);
    setError("");
    const res = await supabase
      .from("patients")
      .select("id, first_name, last_name, phone, birth_date, birth_place, tax_code, residence_city, preferred_plan, anamnesis, diagnosis, treatment, patient_status, acquisition_channel, first_visit_date, main_complaint, body_region, side, pathology_type, medical_diagnosis, expected_frequency, package_size")
      .eq("id", patientId)
      .single();
    if (res.error) { setError(res.error.message); setPatient(null); setLoading(false); return; }
    const p = res.data as Patient;
    setPatient(p);
    hydrateFromPatient(p);
    setDemoEditMode(false);
    setLoading(false);
  }

  async function loadClinicalDocs() {
    setLoadingClinicalDocs(true);
    setError("");
    const res = await supabase
      .from("clinical_documents")
      .select("id, patient_id, doc_type, report_text, file_name, storage_path, uploaded_at")
      .eq("patient_id", patientId)
      .order("uploaded_at", { ascending: false });
    if (res.error) { setError(res.error.message); setClinicalDocs([]); }
    else setClinicalDocs((res.data ?? []) as ClinicalDocument[]);
    setLoadingClinicalDocs(false);
  }

  async function loadAppointments() {
    setLoadingAppts(true);
    setError("");
    const res = await supabase
      .from("appointments")
      .select("id, start_at, end_at, status, is_paid, calendar_note")
      .eq("patient_id", patientId)
      .order("start_at", { ascending: false });
    if (res.error) { setError(res.error.message); setAppointments([]); setLoadingAppts(false); return; }
    setAppointments((res.data ?? []) as AppointmentRow[]);
    const map: Record<string, string> = {};
    (res.data ?? []).forEach((r: any) => { map[r.id] = (r.calendar_note ?? "") as string; });
    setNotesByApptId(map);
    setLoadingAppts(false);
  }

  async function loadDocs() {
    setLoadingDocs(true);
    setError("");
    const res = await supabase
      .from("patient_documents")
      .select("id, patient_id, doc_type, file_name, storage_path, uploaded_at")
      .eq("patient_id", patientId)
      .order("uploaded_at", { ascending: false });
    if (res.error) { setError(res.error.message); setDocs([]); }
    else setDocs((res.data ?? []) as PatientDoc[]);
    setLoadingDocs(false);
  }

  useEffect(() => {
    loadPatient();
    loadAppointments();
    loadDocs();
    loadClinicalDocs();
  }, [patientId]);

  // ─── Save / update ────────────────────────────────────────────────────────
  async function saveDemographics() {
    if (!patient) return;
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn || !ln) { setError("Nome e cognome non possono essere vuoti."); return; }
    setSavingDemo(true);
    setError("");
    const res = await supabase.from("patients").update({
      first_name:          fn,
      last_name:           ln,
      phone:               phone.trim() || null,
      residence_city:      resCity.trim() || null,
      preferred_plan:      preferredPlan,
      birth_date:          birthDate || null,
      birth_place:         birthPlace.trim() || null,
      tax_code:            normalizeTaxCode(taxCode).trim() || null,
      patient_status:      patientStatus || null,
      acquisition_channel: acquisitionChannel || null,
      first_visit_date:    firstVisitDate || null,
      main_complaint:      mainComplaint.trim() || null,
      body_region:         bodyRegion || null,
      side:                side || null,
      pathology_type:      pathologyType || null,
      medical_diagnosis:   medicalDiagnosis.trim() || null,
      expected_frequency:  expectedFrequency.trim() ? Number(expectedFrequency) : null,
      package_size:        packageSize.trim() ? Number(packageSize) : null,
    }).eq("id", patientId);
    setSavingDemo(false);
    if (res.error) {
      const msg = res.error.message || "Errore";
      setError(msg.toLowerCase().includes("column") && msg.toLowerCase().includes("does not exist")
        ? msg + " → Manca la migration SQL dei campi V2."
        : msg);
      return;
    }
    await loadPatient();
  }

  function resetDemographics() {
    if (!patient) return;
    setFirstName(patient.first_name ?? "");
    setLastName(patient.last_name ?? "");
    setPhone(patient.phone ?? "");
    setResCity(patient.residence_city ?? "");
    setPreferredPlan((patient.preferred_plan ?? "invoice") as Plan);
    setBirthDate(patient.birth_date ?? "");
    setBirthPlace(patient.birth_place ?? "");
    setTaxCode(patient.tax_code ?? "");
    setPatientStatus((patient.patient_status ?? "active") as any);
    setAcquisitionChannel(patient.acquisition_channel ?? "");
    setFirstVisitDate(patient.first_visit_date ?? "");
    setMainComplaint(patient.main_complaint ?? "");
    setBodyRegion(patient.body_region ?? "");
    setSide(patient.side ?? "");
    setPathologyType(patient.pathology_type ?? "");
    setMedicalDiagnosis(patient.medical_diagnosis ?? "");
    setExpectedFrequency(safeNumToStr(patient.expected_frequency));
    setPackageSize(safeNumToStr(patient.package_size));
  }

  async function saveClinical() {
    if (!patient) return;
    setSavingClinical(true);
    setError("");
    const res = await supabase.from("patients").update({
      anamnesis:  anamnesis.trim() || null,
      diagnosis:  diagnosis.trim() || null,
      treatment:  treatment.trim() || null,
    }).eq("id", patientId);
    setSavingClinical(false);
    if (res.error) { setError(res.error.message); return; }
    await loadPatient();
  }

  function resetClinical() {
    if (!patient) return;
    setAnamnesis(patient.anamnesis ?? "");
    setDiagnosis(patient.diagnosis ?? "");
    setTreatment(patient.treatment ?? "");
  }

  async function uploadClinicalDocument() {
    if (!clinicalUploadFile) { setError("Seleziona un file (immagine o PDF)."); return; }
    setSavingClinicalDoc("upload");
    setError("");
    const f = clinicalUploadFile;
    const safeOriginal = f.name.replace(/[^\w.\-() ]+/g, "_");
    const path = `clinical_docs/${patientId}/${Date.now()}_${safeOriginal}`;
    const uploadRes = await supabase.storage.from("patient_docs").upload(path, f, { upsert: false });
    if (uploadRes.error) { setError(`Upload fallito: ${uploadRes.error.message}`); setSavingClinicalDoc(null); return; }
    const displayName = clinicalUploadTitle.trim() || f.name;
    const ins = await supabase.from("clinical_documents").insert({
      patient_id:  patientId,
      doc_type:    clinicalUploadType,
      report_text: null,
      file_name:   displayName,
      storage_path: path,
      uploaded_at: new Date().toISOString(),
    });
    if (ins.error) { setError(`Errore DB: ${ins.error.message}`); setSavingClinicalDoc(null); return; }
    setClinicalUploadTitle("");
    setClinicalUploadFile(null);
    await loadClinicalDocs();
    setSavingClinicalDoc(null);
  }

  async function openClinicalDocument(doc: ClinicalDocument) {
    if (!doc.storage_path) { setError("Nessun file associato."); return; }
    setError("");
    const res = await supabase.storage.from("patient_docs").createSignedUrl(doc.storage_path, 60);
    if (res.error || !res.data?.signedUrl) { setError(`Impossibile aprire: ${res.error?.message ?? "signed url missing"}`); return; }
    window.open(res.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteClinicalDocument(doc: ClinicalDocument) {
    if (!window.confirm(`Eliminare il documento "${clinicalDocTypeLabel(doc.doc_type)}"?`)) return;
    setError("");
    const delRow = await supabase.from("clinical_documents").delete().eq("id", doc.id);
    if (delRow.error) { setError(delRow.error.message); return; }
    if (doc.storage_path) {
      const delObj = await supabase.storage.from("patient_docs").remove([doc.storage_path]);
      if (delObj.error) setError(`Record eliminato, ma file non rimosso: ${delObj.error.message}`);
    }
    await loadClinicalDocs();
  }

  async function saveAppointmentNote(apptId: string) {
    setError("");
    setNoteBusyByApptId(m => ({ ...m, [apptId]: true }));
    const note = (notesByApptId[apptId] ?? "").trim();
    const res = await supabase.from("appointments").update({ calendar_note: note || null }).eq("id", apptId);
    setNoteBusyByApptId(m => ({ ...m, [apptId]: false }));
    if (res.error) setError(res.error.message);
  }

  function applyNoteTemplate(apptId: string) {
    const tpl = "🎯 Obiettivo: \n👐 Tecniche/Trattamento: \n🏋️ Esercizi: \n📌 Note / risposta del paziente: \n";
    setNotesByApptId(m => ({ ...m, [apptId]: (m[apptId] ?? "") || tpl }));
  }

  async function updateTherapyStatus(apptId: string, status: Status) {
    setError("");
    setRowBusy(m => ({ ...m, [apptId]: true }));
    const payload: any = { status };
    if (status !== "done") payload.is_paid = false;
    const res = await supabase.from("appointments").update(payload).eq("id", apptId);
    setRowBusy(m => ({ ...m, [apptId]: false }));
    if (res.error) { setError(res.error.message); return; }
    await loadAppointments();
  }

  async function togglePaid(apptId: string, newValue: boolean) {
    setError("");
    setRowBusy(m => ({ ...m, [apptId]: true }));
    const res = await supabase.from("appointments").update({ is_paid: newValue }).eq("id", apptId);
    setRowBusy(m => ({ ...m, [apptId]: false }));
    if (res.error) { setError(res.error.message); return; }
    await loadAppointments();
  }

  async function uploadDocument() {
    if (!file) { setError("Seleziona un file."); return; }
    setError("");
    setUploading(true);
    const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
    const path = `${patientId}/${Date.now()}_${safeName}`;
    const up = await supabase.storage.from("patient_docs").upload(path, file, { upsert: false });
    if (up.error) { setError(`Upload fallito: ${up.error.message}`); setUploading(false); return; }
    const ins = await supabase.from("patient_documents").insert({ patient_id: patientId, doc_type: docType, file_name: file.name, storage_path: path });
    if (ins.error) { setError(`Errore DB: ${ins.error.message}`); setUploading(false); return; }
    setFile(null);
    setUploading(false);
    await loadDocs();
  }

  async function openDocument(doc: PatientDoc) {
    setError("");
    const res = await supabase.storage.from("patient_docs").createSignedUrl(doc.storage_path, 60);
    if (res.error || !res.data?.signedUrl) { setError(`Impossibile aprire: ${res.error?.message ?? "signed url missing"}`); return; }
    window.open(res.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteDocument(doc: PatientDoc) {
    if (!window.confirm("Eliminare questo documento? (DB + Storage)")) return;
    setError("");
    const delRow = await supabase.from("patient_documents").delete().eq("id", doc.id);
    if (delRow.error) { setError(delRow.error.message); return; }
    const delObj = await supabase.storage.from("patient_docs").remove([doc.storage_path]);
    if (delObj.error) setError(`Record eliminato, ma file non rimosso: ${delObj.error.message}`);
    await loadDocs();
  }

  async function deletePatient() {
    if (!patient) return;
    if (!window.confirm(`Vuoi ELIMINARE definitivamente il paziente:\n${patient.last_name.toUpperCase()} ${patient.first_name.toUpperCase()} ?\n\nQuesta operazione è irreversibile.`)) return;
    setDeletingPatient(true);
    setError("");
    const res = await supabase.from("patients").delete().eq("id", patientId);
    setDeletingPatient(false);
    if (res.error) { setError(`Impossibile eliminare: ${res.error.message}. Elimina prima le sedute collegate o imposta ON DELETE CASCADE.`); return; }
    window.location.href = "/patients";
  }

  // ─── Derived ──────────────────────────────────────────────────────────────
  const therapiesCount = appointments.length;
  const doneCount      = appointments.filter(a => a.status === "done").length;
  const paidCount      = appointments.filter(a => a.status === "done" && a.is_paid).length;
  const lastTherapy    = appointments[0]?.start_at;

  // ─── Shared style helpers ─────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: "100%", marginTop: 6, padding: "10px 12px",
    borderRadius: 8, border: `1.5px solid ${THEME.border}`,
    background: THEME.panelBg, color: THEME.text,
    outline: "none", fontSize: 13, fontWeight: 600,
    boxSizing: "border-box",
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    resize: "vertical" as const,
  };

  const cardStyle: React.CSSProperties = {
    background: THEME.panelBg, borderRadius: 12,
    padding: 24, marginBottom: 16,
    border: `1.5px solid ${THEME.border}`,
    boxShadow: "0 2px 12px rgba(15,23,42,0.06)",
  };

  const sectionHeaderStyle: React.CSSProperties = {
    display: "flex", justifyContent: "space-between",
    alignItems: "flex-start", gap: 12, marginBottom: 20,
  };

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 700,
    color: THEME.muted, marginBottom: 5,
    textTransform: "uppercase", letterSpacing: 0.5,
  };

  const tableHeaderStyle: React.CSSProperties = {
    textAlign: "left", padding: "11px 14px",
    fontSize: 11, color: THEME.muted, fontWeight: 700,
    borderBottom: `1.5px solid ${THEME.border}`,
    background: "rgba(241,245,249,0.9)",
    textTransform: "uppercase", letterSpacing: 0.5,
  };

  function btnPrimary(label: string, onClick: () => void, disabled = false): React.ReactNode {
    return (
      <button onClick={onClick} disabled={disabled} style={{
        padding: "9px 18px", borderRadius: 8, border: "none",
        background: disabled ? THEME.gray : "linear-gradient(135deg, #0d9488, #2563eb)",
        color: "#fff", fontWeight: 700, fontSize: 13, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1, boxShadow: disabled ? "none" : "0 2px 8px rgba(13,148,136,0.2)",
      }}>{label}</button>
    );
  }

  function btnOutline(label: string, onClick: () => void, color = THEME.blue, disabled = false): React.ReactNode {
    return (
      <button onClick={onClick} disabled={disabled} style={{
        padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${color}`,
        background: THEME.panelBg, color, fontWeight: 700, fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      }}>{label}</button>
    );
  }

  // ─── Loading / error states ───────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: THEME.appBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: THEME.muted, fontWeight: 600, fontSize: 15 }}>Caricamento scheda paziente…</div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div style={{ minHeight: "100vh", background: THEME.appBg, padding: 40 }}>
        <div style={{ color: THEME.red, fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Scheda paziente non trovata</div>
        <div style={{ fontSize: 13, color: THEME.muted, marginBottom: 16 }}>ID: <code>{patientId}</code></div>
        {error && <div style={{ ...cardStyle, borderColor: "rgba(220,38,38,0.3)", color: THEME.red, fontSize: 13 }}>{error}</div>}
        <Link href="/patients" style={{ color: THEME.blue, fontWeight: 700, textDecoration: "none" }}>← Torna ai pazienti</Link>
      </div>
    );
  }

  const headerName = `${patient.last_name} ${patient.first_name}`.toUpperCase();

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: THEME.appBg, fontFamily: "'Outfit', 'Segoe UI', system-ui, sans-serif" }}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        * { -webkit-font-smoothing: antialiased; box-sizing: border-box; }
        body { font-family: 'Outfit','Segoe UI',system-ui,sans-serif; margin:0; background:${THEME.appBg}; }
        select, input, textarea, button { font-family: inherit; }
        input:focus, select:focus, textarea:focus {
          border-color: ${THEME.blue} !important;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.12) !important;
          outline: none !important;
        }
        @media (min-width: 768px) and (max-width: 1024px) {
          .tab-hide    { display: none !important; }
          .tab-compact { font-size: 11px !important; padding: 3px 8px !important; }
          .tab-grid-2  { grid-template-columns: 1fr 1fr !important; }
          .tab-p       { padding: 20px 18px !important; }
        }
      `}</style>

      {/* ━━━ NAVBAR ━━━ */}
      <header style={{
        position: "sticky", top: 0, zIndex: 30,
        background: "linear-gradient(135deg, #0d9488, #2563eb)",
        padding: "0 20px", height: 58,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 2px 12px rgba(13,148,136,0.18)", gap: 8,
      }}>
        {/* Left: Logo + Nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 800, fontSize: 14,
              border: "1.5px solid rgba(255,255,255,0.3)",
            }}>F</div>
            <span style={{ fontWeight: 700, fontSize: 15, color: "#fff", letterSpacing: 0.5, textTransform: "uppercase" }}>
              Fisio<span style={{ fontWeight: 800 }}>Hub</span>
            </span>
          </div>
          <nav style={{ display: "flex", gap: 2 }}>
            {([
              { href: "/",         label: "Home",       icon: "⌂",  active: false },
              { href: "/calendar", label: "Calendario", icon: "▦",  active: false },
              { href: "/reports",  label: "Report",     icon: "◈",  active: false },
              { href: "/patients", label: "Pazienti",   icon: "◉",  active: true  },
            ] as const).map(item => (
              <Link key={item.href} href={item.href} style={{
                padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                textDecoration: "none", transition: "all 0.2s",
                background: item.active ? "rgba(255,255,255,0.2)" : "transparent",
                color: item.active ? "#fff" : "rgba(255,255,255,0.8)",
                letterSpacing: 0.3,
              }}>
                <span className="tab-compact">{item.icon} {item.label}</span>
              </Link>
            ))}
          </nav>
        </div>

        {/* Right: avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div ref={userMenuRef} style={{ position: "relative" }}>
            <button onClick={() => setUserMenuOpen(v => !v)} style={{
              width: 32, height: 32, borderRadius: 8,
              border: "1.5px solid rgba(255,255,255,0.35)",
              background: "rgba(255,255,255,0.2)",
              color: "#fff", fontWeight: 800, fontSize: 12,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>{userInitials}</button>

            {userMenuOpen && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 8px)", width: 210,
                background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
                borderRadius: 12, boxShadow: "0 12px 32px rgba(30,64,175,0.15)",
                overflow: "hidden", zIndex: 60,
              }}>
                <div style={{ padding: "12px 16px", borderBottom: `1.5px solid ${THEME.border}`, fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                  {userEmail}
                </div>
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

      {/* ━━━ MAIN ━━━ */}
      <main style={{ padding: "28px 32px", maxWidth: 1280, margin: "0 auto" }} className="tab-p">

        {/* Page header */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: THEME.teal, boxShadow: `0 0 0 4px rgba(13,148,136,0.15)` }} />
              <h1 style={{ margin: 0, fontWeight: 800, fontSize: 26, color: THEME.text, letterSpacing: -0.5 }}>
                {headerName}
              </h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              {patient.phone && (
                <span style={{ fontSize: 14, fontWeight: 700, color: THEME.textSoft }}>
                  📞 {patient.phone}
                </span>
              )}
              <span style={{ fontSize: 13, color: THEME.muted, fontWeight: 600 }}>
                🎂 {ddmmyyyy(patient.birth_date)}
              </span>
              <span style={{ fontSize: 13, color: THEME.muted, fontWeight: 600 }}>
                🧾 {patient.preferred_plan === "invoice" ? "Fattura" : patient.preferred_plan === "no_invoice" ? "Non fattura" : "—"}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/patients" style={{
              padding: "9px 16px", borderRadius: 8, border: `1.5px solid ${THEME.border}`,
              background: THEME.panelBg, color: THEME.textSoft, fontWeight: 700,
              textDecoration: "none", fontSize: 13, display: "inline-flex", alignItems: "center",
            }}>← Lista</Link>
            <Link href="/calendar" style={{
              padding: "9px 16px", borderRadius: 8, border: `1.5px solid ${THEME.border}`,
              background: THEME.panelBg, color: THEME.blue, fontWeight: 700,
              textDecoration: "none", fontSize: 13, display: "inline-flex", alignItems: "center",
            }}>📅 Calendario</Link>
            <button onClick={deletePatient} disabled={deletingPatient} style={{
              padding: "9px 16px", borderRadius: 8, border: `1.5px solid ${THEME.red}`,
              background: "rgba(220,38,38,0.06)", color: THEME.red, fontWeight: 700,
              fontSize: 13, cursor: deletingPatient ? "not-allowed" : "pointer",
              opacity: deletingPatient ? 0.6 : 1,
            }}>
              {deletingPatient ? "Elimino…" : "Elimina paziente"}
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            marginBottom: 16, padding: "12px 16px", borderRadius: 8,
            background: "rgba(249,115,22,0.08)", border: `1px solid rgba(249,115,22,0.3)`,
            color: "#92400e", fontWeight: 600, fontSize: 13,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── KPI ─────────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }} className="tab-grid-2">
          {[
            { label: "Sedute totali",    value: String(therapiesCount),                          color: THEME.blue },
            { label: "Eseguite",         value: String(doneCount),                               color: THEME.green },
            { label: "Eseguite e pagate",value: String(paidCount),                               color: THEME.teal },
            { label: "Ultima seduta",    value: lastTherapy ? formatDateTimeIT(lastTherapy) : "—", color: THEME.muted },
          ].map(k => (
            <div key={k.label} style={{
              ...cardStyle, marginBottom: 0, padding: 18,
              borderLeft: `4px solid ${k.color}`,
            }}>
              <div style={{ fontSize: 11, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: THEME.text }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* ── ANAGRAFICA ───────────────────────────────────────────────────── */}
        <section style={{ ...cardStyle, borderLeft: `4px solid ${THEME.teal}` }}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={{ margin: 0, fontWeight: 800, fontSize: 17, color: THEME.blueDark }}>Anagrafica</h2>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                {demoEditMode ? "Modalità modifica attiva." : "Bloccata. Premi Modifica per cambiare i dati."}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!demoEditMode ? (
                btnOutline("Modifica", () => setDemoEditMode(true), THEME.teal)
              ) : (
                <>
                  {btnOutline("Annulla", () => { resetDemographics(); setDemoEditMode(false); })}
                  {btnPrimary(savingDemo ? "Salvataggio…" : "Salva anagrafica", saveDemographics, savingDemo || !demoDirty)}
                </>
              )}
            </div>
          </div>

          {/* Campi base */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }} className="tab-grid-2">
            <div>
              <label style={labelStyle}>Nome</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
            </div>
            <div>
              <label style={labelStyle}>Cognome</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
            </div>
            <div>
              <label style={labelStyle}>Telefono</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
            </div>
            <div>
              <label style={labelStyle}>Città</label>
              <input value={resCity} onChange={e => setResCity(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }} className="tab-grid-2">
            <div>
              <label style={labelStyle}>Data di nascita</label>
              <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
              <div style={{ marginTop: 5, fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
                {ddmmyyyy(birthDate || patient.birth_date)}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Luogo di nascita</label>
              <input value={birthPlace} onChange={e => setBirthPlace(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
            </div>
            <div>
              <label style={labelStyle}>Codice Fiscale</label>
              <input value={taxCode} onChange={e => setTaxCode(e.target.value)} style={inputStyle} disabled={!demoEditMode} placeholder="RSSMRC..." />
              <div style={{ marginTop: 5, fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
                {normalizeTaxCode(taxCode || patient.tax_code || "") || "—"}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Preferenza documento</label>
              <select value={preferredPlan} onChange={e => setPreferredPlan(e.target.value as Plan)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                <option value="invoice">Fattura</option>
                <option value="no_invoice">Non fattura</option>
              </select>
            </div>
          </div>

          {/* V2 — Dati clinici */}
          <div style={{ borderTop: `1.5px solid ${THEME.border}`, paddingTop: 16, marginTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: THEME.blueDark }}>Campi avanzati</div>
                <div style={{ fontSize: 11, color: THEME.muted, fontWeight: 600, marginTop: 2 }}>Segmentazione, follow-up, previsioni.</div>
              </div>
            </div>

            {/* Clinica iniziale */}
            <button type="button" onClick={() => setShowV2Clinical(s => !s)} style={{
              width: "100%", textAlign: "left",
              background: "rgba(37,99,235,0.03)", border: `1.5px solid ${THEME.border}`,
              padding: "10px 14px", borderRadius: 8, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontWeight: 700, fontSize: 13, color: THEME.blueDark, marginBottom: showV2Clinical ? 12 : 0,
            }}>
              <span>🧠 Dati clinici iniziali</span>
              <span>{showV2Clinical ? "−" : "+"}</span>
            </button>

            {showV2Clinical && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }} className="tab-grid-2">
                <div style={{ gridColumn: "1 / span 2" }}>
                  <label style={labelStyle}>Motivo principale</label>
                  <textarea value={mainComplaint} onChange={e => setMainComplaint(e.target.value)} rows={3} style={textareaStyle} placeholder="Es. dolore lombare da 3 settimane…" disabled={!demoEditMode} />
                </div>
                <div>
                  <label style={labelStyle}>Distretto</label>
                  <select value={bodyRegion} onChange={e => setBodyRegion(e.target.value)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                    <option value="">Seleziona</option>
                    <option value="cervicale">Cervicale</option><option value="dorsale">Dorsale</option>
                    <option value="lombare">Lombare</option><option value="spalla">Spalla</option>
                    <option value="gomito">Gomito</option><option value="polso_mano">Polso/Mano</option>
                    <option value="anca">Anca</option><option value="ginocchio">Ginocchio</option>
                    <option value="caviglia_piede">Caviglia/Piede</option><option value="atm">ATM</option>
                    <option value="neurologico">Neurologico</option><option value="altro">Altro</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Lato</label>
                  <select value={side} onChange={e => setSide(e.target.value)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                    <option value="">Seleziona</option>
                    <option value="dx">DX</option><option value="sx">SX</option><option value="bilaterale">Bilaterale</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Tipo problema</label>
                  <select value={pathologyType} onChange={e => setPathologyType(e.target.value)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                    <option value="">Seleziona</option>
                    <option value="traumatico">Traumatico</option><option value="degenerativo">Degenerativo</option>
                    <option value="post_chirurgico">Post-chirurgico</option><option value="neurologico">Neurologico</option>
                    <option value="cronico">Cronico</option><option value="funzionale">Funzionale</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Diagnosi medica</label>
                  <input value={medicalDiagnosis} onChange={e => setMedicalDiagnosis(e.target.value)} style={inputStyle} disabled={!demoEditMode} placeholder="Es. discopatia L4-L5" />
                </div>
              </div>
            )}

            {/* Business */}
            <button type="button" onClick={() => setShowV2Business(s => !s)} style={{
              width: "100%", textAlign: "left",
              background: "rgba(22,163,74,0.03)", border: `1.5px solid ${THEME.border}`,
              padding: "10px 14px", borderRadius: 8, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontWeight: 700, fontSize: 13, color: THEME.greenDark, marginBottom: showV2Business ? 12 : 0,
            }}>
              <span>💼 Stato & dati economici</span>
              <span>{showV2Business ? "−" : "+"}</span>
            </button>

            {showV2Business && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }} className="tab-grid-2">
                <div>
                  <label style={labelStyle}>Stato paziente</label>
                  <select value={patientStatus} onChange={e => setPatientStatus(e.target.value)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                    <option value="active">Attivo</option><option value="lead">Lead</option>
                    <option value="paused">In pausa</option><option value="follow_up">Follow-up</option>
                    <option value="discharged">Dimesso</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Canale acquisizione</label>
                  <select value={acquisitionChannel} onChange={e => setAcquisitionChannel(e.target.value)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                    <option value="">Seleziona</option>
                    <option value="passaparola">Passaparola</option><option value="medico">Medico</option>
                    <option value="instagram">Instagram</option><option value="google">Google</option>
                    <option value="evento">Evento</option><option value="altro">Altro</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Data primo contatto</label>
                  <input type="date" value={firstVisitDate} onChange={e => setFirstVisitDate(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
                </div>
                <div>
                  <label style={labelStyle}>Frequenza prevista (sett.)</label>
                  <input value={expectedFrequency} onChange={e => setExpectedFrequency(e.target.value)} style={inputStyle} disabled={!demoEditMode} placeholder="Es. 2" />
                </div>
                <div>
                  <label style={labelStyle}>Pacchetto sedute</label>
                  <input value={packageSize} onChange={e => setPackageSize(e.target.value)} style={inputStyle} disabled={!demoEditMode} placeholder="Es. 10" />
                </div>
              </div>
            )}

            <p style={{ margin: "12px 0 0", fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
              Questi campi si salvano con il bottone "Salva anagrafica".
            </p>
          </div>
        </section>

        {/* ── CLINICA ──────────────────────────────────────────────────────── */}
        <section style={{ ...cardStyle, borderLeft: `4px solid ${THEME.blue}` }}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={{ margin: 0, fontWeight: 800, fontSize: 17, color: THEME.blueDark }}>Clinica</h2>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: THEME.muted, fontWeight: 600 }}>Anamnesi · Diagnosi · Trattamento</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {btnOutline("Ripristina", resetClinical, THEME.muted, !clinicalDirty)}
              {btnPrimary(savingClinical ? "Salvataggio…" : "Salva clinica", saveClinical, savingClinical || !clinicalDirty)}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ background: THEME.panelSoft, border: `1.5px solid ${THEME.border}`, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>🧩 Anamnesi</div>
              <textarea value={anamnesis} onChange={e => setAnamnesis(e.target.value)} rows={8} style={{ ...textareaStyle, marginTop: 0 }} placeholder="Storia del problema, red flags, farmaci, obiettivi…" />
            </div>
            <div style={{ background: THEME.panelSoft, border: `1.5px solid ${THEME.border}`, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>🧠 Diagnosi / ipotesi clinica</div>
              <textarea value={diagnosis} onChange={e => setDiagnosis(e.target.value)} rows={8} style={{ ...textareaStyle, marginTop: 0 }} placeholder="Diagnosi medica, ragionamento clinico, test positivi/negativi…" />
            </div>
          </div>

          {/* Diario sedute */}
          <button type="button" onClick={() => setShowTreatmentDiary(s => !s)} style={{
            width: "100%", textAlign: "left",
            background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
            padding: "12px 16px", borderRadius: 8, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontWeight: 700, fontSize: 13, color: THEME.text, marginBottom: 12,
          }}>
            <span>🗂️ Trattamento & Diario sedute</span>
            <span style={{ color: THEME.blue }}>{showTreatmentDiary ? "−" : "+"}</span>
          </button>

          {showTreatmentDiary && (
            <div style={{ border: `1.5px solid ${THEME.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
              <div style={{ padding: "10px 16px", background: THEME.panelSoft, borderBottom: `1.5px solid ${THEME.border}` }}>
                <p style={{ margin: 0, fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                  Note per singola seduta. Salvate in <code>appointments.calendar_note</code>.
                </p>
              </div>
              {appointments.length === 0 ? (
                <div style={{ padding: 20, color: THEME.muted, fontWeight: 600, fontSize: 13 }}>
                  Nessuna seduta trovata. Le note appariranno non appena inizi a registrare appuntamenti.
                </div>
              ) : (
                <div style={{ padding: 14, display: "grid", gap: 12 }}>
                  {appointments.map(a => {
                    const busy = !!noteBusyByApptId[a.id];
                    const c   = statusColors(a.status);
                    const val = notesByApptId[a.id] ?? "";
                    return (
                      <div key={a.id} style={{ border: `1.5px solid ${THEME.border}`, borderRadius: 8, padding: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 700, color: THEME.text, fontSize: 13 }}>{formatDateTimeIT(a.start_at)}</span>
                            <span style={{
                              display: "inline-flex", alignItems: "center",
                              padding: "4px 10px", borderRadius: 6,
                              background: c.bg, border: `1px solid ${c.bd}`,
                              color: c.fg, fontWeight: 700, fontSize: 11,
                            }}>{statusLabel(a.status)}</span>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button type="button" onClick={() => applyNoteTemplate(a.id)} style={{
                              padding: "7px 12px", borderRadius: 6, border: `1.5px solid ${THEME.border}`,
                              background: THEME.panelBg, color: THEME.blue, fontWeight: 700, cursor: "pointer", fontSize: 12,
                            }}>Usa template</button>
                            <button type="button" onClick={() => saveAppointmentNote(a.id)} disabled={busy} style={{
                              padding: "7px 12px", borderRadius: 6, border: "none",
                              background: busy ? THEME.gray : THEME.teal,
                              color: "#fff", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontSize: 12,
                              opacity: busy ? 0.65 : 1,
                            }}>{busy ? "Salvo…" : "Salva nota"}</button>
                          </div>
                        </div>
                        <textarea value={val} onChange={e => setNotesByApptId(m => ({ ...m, [a.id]: e.target.value }))} rows={4} style={{ ...textareaStyle, marginTop: 0 }} placeholder="Cosa hai fatto oggi? Tecniche, esercizi, progressioni, risposta del paziente…" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Piano trattamento */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              📌 Piano trattamento (generale)
            </div>
            <textarea value={treatment} onChange={e => setTreatment(e.target.value)} rows={5} style={textareaStyle} placeholder="Il piano generale: frequenza, progressione, obiettivi a 2-4-6 settimane…" />
          </div>
        </section>

        {/* ── DOCUMENTI CLINICI ─────────────────────────────────────────────── */}
        <section style={{ ...cardStyle, borderLeft: `4px solid ${THEME.teal}` }}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={{ margin: 0, fontWeight: 800, fontSize: 17, color: THEME.blueDark }}>Documenti Clinici</h2>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                Solo file (immagini/PDF). Il referto scritto si carica come scansione.
              </p>
            </div>
            {btnOutline(loadingClinicalDocs ? "Aggiorno…" : "Aggiorna", loadClinicalDocs, THEME.blue, loadingClinicalDocs)}
          </div>

          {/* Uploader */}
          <div style={{ border: `1.5px solid ${THEME.border}`, borderRadius: 10, padding: 16, background: THEME.panelSoft, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Tipo documento</label>
                <select value={clinicalUploadType} onChange={e => setClinicalUploadType(e.target.value as ClinicalDocType)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }}>
                  <option value="prescrizione">Prescrizione</option>
                  <option value="rx">Rx (Radiografia)</option>
                  <option value="rm">RM (Risonanza Magnetica)</option>
                  <option value="tac">TAC</option>
                  <option value="elettromiografia">Elettromiografia</option>
                  <option value="ecografia">Ecografia</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Nome (opzionale)</label>
                <input value={clinicalUploadTitle} onChange={e => setClinicalUploadTitle(e.target.value)} style={inputStyle} placeholder="Es. RM Lombare 12-02-2026" />
              </div>
              <div style={{ gridColumn: "1 / span 2" }}>
                <label style={labelStyle}>File (immagini o PDF)</label>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.webp" onChange={e => setClinicalUploadFile(e.target.files?.[0] || null)} style={inputStyle} />
                {clinicalUploadFile && (
                  <div style={{ marginTop: 6, fontSize: 12, color: THEME.green, fontWeight: 700 }}>
                    ✓ {clinicalUploadFile.name}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {btnPrimary(savingClinicalDoc === "upload" ? "Carico…" : "Carica documento", uploadClinicalDocument, savingClinicalDoc === "upload")}
            </div>
          </div>

          {/* Lista documenti clinici */}
          {clinicalDocs.length === 0 ? (
            <div style={{ fontSize: 13, color: THEME.muted, fontWeight: 600 }}>Nessun documento clinico caricato.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {clinicalDocs.map(doc => (
                <div key={doc.id} style={{
                  border: `1.5px solid ${THEME.border}`, borderRadius: 8, padding: "12px 16px",
                  background: THEME.panelBg, display: "flex", alignItems: "center",
                  justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                }}>
                  <div>
                    <div style={{ fontWeight: 700, color: THEME.text, fontSize: 13 }}>
                      {clinicalDocTypeLabel(doc.doc_type)} · {doc.file_name || "Documento"}
                    </div>
                    <div style={{ marginTop: 3, fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
                      {new Date(doc.uploaded_at).toLocaleString("it-IT")}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {btnOutline("Apri", () => openClinicalDocument(doc))}
                    <button type="button" onClick={() => deleteClinicalDocument(doc)} style={{
                      padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${THEME.red}`,
                      background: "rgba(220,38,38,0.06)", color: THEME.red, fontWeight: 700, fontSize: 13, cursor: "pointer",
                    }}>Elimina</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── TERAPIE + PAGAMENTO ───────────────────────────────────────────── */}
        <section style={{ ...cardStyle, borderLeft: `4px solid ${THEME.green}` }}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={{ margin: 0, fontWeight: 800, fontSize: 17, color: THEME.blueDark }}>Terapie fatte</h2>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                Stato e pagamento per ogni seduta.
              </p>
            </div>
            {btnOutline(loadingAppts ? "Aggiorno…" : "Aggiorna", loadAppointments, THEME.blue, loadingAppts)}
          </div>

          {appointments.length === 0 && !loadingAppts ? (
            <div style={{ fontSize: 13, color: THEME.muted, fontWeight: 600 }}>Nessuna seduta trovata.</div>
          ) : (
            <div style={{ overflow: "hidden", borderRadius: 10, border: `1.5px solid ${THEME.border}` }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Data", "Stato", "Pagata"].map(h => (
                      <th key={h} style={tableHeaderStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((a, idx) => {
                    const busy = !!rowBusy[a.id];
                    const c    = statusColors(a.status);
                    const selectStyle: React.CSSProperties = {
                      padding: "5px 10px", borderRadius: 6,
                      border: `1.5px solid ${c.bd}`, background: c.bg,
                      color: c.fg, fontWeight: 700, fontSize: 12,
                      cursor: busy ? "not-allowed" : "pointer", outline: "none",
                    };
                    return (
                      <tr key={a.id} style={{ background: idx % 2 === 0 ? "#fff" : THEME.panelSoft, borderBottom: `1px solid ${THEME.border}` }}>
                        <td style={{ padding: "12px 14px", color: THEME.text, fontWeight: 700, fontSize: 13 }}>
                          {formatDateTimeIT(a.start_at)}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center",
                              padding: "5px 10px", borderRadius: 6,
                              background: c.bg, border: `1.5px solid ${c.bd}`,
                              color: c.fg, fontWeight: 700, fontSize: 12,
                            }}>{statusLabel(a.status)}</span>
                            <select
                              value={a.status}
                              disabled={busy}
                              onChange={e => updateTherapyStatus(a.id, e.target.value as Status)}
                              style={selectStyle}
                            >
                              <option value="booked">Prenotata</option>
                              <option value="confirmed">Confermata</option>
                              <option value="done">Eseguita</option>
                            </select>
                            {busy && <span style={{ fontSize: 12, color: THEME.muted }}>Salvo…</span>}
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 13 }}>
                            <input
                              type="checkbox"
                              checked={a.is_paid}
                              disabled={busy || a.status !== "done"}
                              onChange={e => togglePaid(a.id, e.target.checked)}
                              style={{ width: 16, height: 16 }}
                            />
                            <span style={{ color: a.status === "done" ? THEME.textSoft : THEME.muted }}>
                              {a.status === "done" ? (a.is_paid ? "Pagata" : "Non pagata") : "—"}
                            </span>
                          </label>
                          {a.status !== "done" && (
                            <div style={{ marginTop: 4, fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
                              Pagamento attivo solo se eseguita.
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ margin: "10px 0 0", fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
            Nota: "Annullato" mantiene lo storico · se una seduta torna da "Eseguita" a un altro stato, il pagamento viene azzerato.
          </p>
        </section>

        {/* ── GDPR ──────────────────────────────────────────────────────────── */}
        <section style={{ ...cardStyle, borderLeft: `4px solid ${THEME.amber}` }}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={{ margin: 0, fontWeight: 800, fontSize: 17, color: THEME.blueDark }}>Documenti GDPR</h2>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: THEME.muted, fontWeight: 600 }}>Upload + archivio consensi.</p>
            </div>
            {btnOutline(loadingDocs ? "Aggiorno…" : "Aggiorna", loadDocs, THEME.blue, loadingDocs)}
          </div>

          {/* Upload form */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 16 }} className="tab-grid-2">
            <div>
              <label style={labelStyle}>Tipo documento</label>
              <select value={docType} onChange={e => setDocType(e.target.value as DocType)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }}>
                <option value="gdpr_informativa_privacy">GDPR – Informativa Privacy</option>
                <option value="consenso_trattamento">Consenso al trattamento</option>
                <option value="altro">Altro</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>File</label>
              <input type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1 / span 2", display: "flex", justifyContent: "flex-end" }}>
              {btnPrimary(uploading ? "Caricamento…" : "Carica documento", uploadDocument, uploading)}
            </div>
          </div>

          {docs.length === 0 && !loadingDocs ? (
            <div style={{ fontSize: 13, color: THEME.muted, fontWeight: 600 }}>Nessun documento caricato.</div>
          ) : (
            <div style={{ overflow: "hidden", borderRadius: 10, border: `1.5px solid ${THEME.border}` }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Tipo", "File", "Caricato", "Azioni"].map(h => (
                      <th key={h} style={tableHeaderStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d, idx) => (
                    <tr key={d.id} style={{ background: idx % 2 === 0 ? "#fff" : THEME.panelSoft, borderBottom: `1px solid ${THEME.border}` }}>
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: THEME.text, fontSize: 13 }}>{docTypeLabel(d.doc_type)}</td>
                      <td style={{ padding: "12px 14px", color: THEME.textSoft, fontSize: 13 }}>{d.file_name}</td>
                      <td style={{ padding: "12px 14px", color: THEME.muted, fontSize: 12 }}>{new Date(d.uploaded_at).toLocaleString("it-IT")}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          {btnOutline("Apri", () => openDocument(d))}
                          <button onClick={() => deleteDocument(d)} style={{
                            padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${THEME.red}`,
                            background: "rgba(220,38,38,0.06)", color: THEME.red, fontWeight: 700, fontSize: 13, cursor: "pointer",
                          }}>Elimina</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
