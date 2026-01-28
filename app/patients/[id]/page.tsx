"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../src/lib/supabaseClient";

type Plan = "invoice" | "no_invoice";
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
};

type AppointmentRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: Status;
  is_paid: boolean;
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

const THEME = {
  appBg: "#f1f5f9",
  panelBg: "#ffffff",
  text: "#1f2937",
  textSoft: "#334155",
  textMuted: "#64748b",
  primary: "#1e3a8a",
  secondary: "#2563eb",
  accent: "#0d9488",
  border: "#cbd5e1",
  borderSoft: "#e2e8f0",
  success: "#16a34a",
  danger: "#dc2626",
  warning: "#f97316",
};

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
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDateTimeIT(iso: string) {
  const d = new Date(iso);
  const weekday = capitalizeFirst(
    d.toLocaleString("it-IT", { weekday: "short" })
  );
  const datePart = d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timePart = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${weekday} ${datePart} • ${timePart}`;
}

function statusLabel(s: Status) {
  if (s === "booked") return "Prenotata";
  if (s === "confirmed") return "Confermata";
  return "Eseguita";
}

function statusColors(s: Status) {
  if (s === "done") return { fg: THEME.success, bg: "rgba(22,163,74,0.12)", bd: "rgba(22,163,74,0.35)" };
  if (s === "confirmed") return { fg: THEME.secondary, bg: "rgba(37,99,235,0.10)", bd: "rgba(37,99,235,0.30)" };
  return { fg: THEME.danger, bg: "rgba(220,38,38,0.10)", bd: "rgba(220,38,38,0.30)" };
}

function docTypeLabel(t: DocType) {
  if (t === "gdpr_informativa_privacy") return "GDPR – Informativa Privacy";
  if (t === "consenso_trattamento") return "Consenso al trattamento";
  return "Altro";
}

function clinicalDocTypeLabel(t: ClinicalDocType) {
  const labels: Record<ClinicalDocType, string> = {
    prescrizione: "Prescrizione",
    rx: "Rx (Radiografia)",
    rm: "RM (Risonanza Magnetica)",
    tac: "TAC (Tomografia Assiale Computerizzata)",
    elettromiografia: "Elettromiografia",
    ecografia: "Ecografia",
  };
  return labels[t];
}

function same(v1: any, v2: any) {
  return (v1 ?? "") === (v2 ?? "");
}

export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const resolvedParams = React.use(params as any) as { id: string };
  const patientId = resolvedParams.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [patient, setPatient] = useState<Patient | null>(null);

  // ===== ANAGRAFICA =====
  const [demoEditMode, setDemoEditMode] = useState(false);
  const [savingDemo, setSavingDemo] = useState(false);
  const [deletingPatient, setDeletingPatient] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [resCity, setResCity] = useState("");
  const [preferredPlan, setPreferredPlan] = useState<Plan>("invoice");

  const [birthDate, setBirthDate] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [taxCode, setTaxCode] = useState("");

  // ===== CLINICA =====
  const [anamnesis, setAnamnesis] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [treatment, setTreatment] = useState("");
  const [savingClinical, setSavingClinical] = useState(false);

  // ===== DOCUMENTI CLINICI =====
  const [clinicalDocs, setClinicalDocs] = useState<ClinicalDocument[]>([]);
  const [loadingClinicalDocs, setLoadingClinicalDocs] = useState(false);
  const [savingClinicalDoc, setSavingClinicalDoc] = useState<string | null>(null);

  const [clinicalFormData, setClinicalFormData] = useState<Record<ClinicalDocType, {
    report_text: string;
    file: File | null;
    tempFileUrl?: string;
  }>>({
    prescrizione: { report_text: "", file: null },
    rx: { report_text: "", file: null },
    rm: { report_text: "", file: null },
    tac: { report_text: "", file: null },
    elettromiografia: { report_text: "", file: null },
    ecografia: { report_text: "", file: null },
  });

  // ===== TERAPIE + PAGAMENTO =====
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(false);
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});

  // ===== DOCS =====
  const [docs, setDocs] = useState<PatientDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState<DocType>("gdpr_informativa_privacy");
  const [file, setFile] = useState<File | null>(null);

  const cardStyle: React.CSSProperties = useMemo(
    () => ({
      background: THEME.panelBg,
      borderRadius: 18,
      padding: 16,
      border: `1px solid ${THEME.borderSoft}`,
      boxShadow: "0 14px 45px rgba(2,6,23,0.08)",
    }),
    []
  );

  const inputStyle = useMemo(
    () => ({
      width: "100%",
      marginTop: 6,
      padding: 10,
      borderRadius: 12,
      border: `1px solid ${THEME.border}`,
      background: "#ffffff",
      color: THEME.text,
      outline: "none" as const,
    }),
    []
  );

  const textareaStyle = useMemo(
    () => ({
      width: "100%",
      marginTop: 6,
      padding: 10,
      borderRadius: 12,
      border: `1px solid ${THEME.border}`,
      background: "#ffffff",
      color: THEME.text,
      outline: "none" as const,
      resize: "vertical" as const,
    }),
    []
  );

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
  }

  const demoDirty = useMemo(() => {
    if (!patient) return false;
    return (
      !same(firstName.trim(), patient.first_name) ||
      !same(lastName.trim(), patient.last_name) ||
      !same(phone.trim(), patient.phone) ||
      !same(resCity.trim(), patient.residence_city) ||
      preferredPlan !== (patient.preferred_plan ?? "invoice") ||
      !same(birthDate.trim(), patient.birth_date) ||
      !same(birthPlace.trim(), patient.birth_place) ||
      !same(normalizeTaxCode(taxCode).trim(), patient.tax_code)
    );
  }, [patient, firstName, lastName, phone, resCity, preferredPlan, birthDate, birthPlace, taxCode]);

  const clinicalDirty = useMemo(() => {
    if (!patient) return false;
    return (
      !same(anamnesis.trim(), patient.anamnesis) ||
      !same(diagnosis.trim(), patient.diagnosis) ||
      !same(treatment.trim(), patient.treatment)
    );
  }, [patient, anamnesis, diagnosis, treatment]);

  async function loadPatient() {
    setLoading(true);
    setError("");

    const res = await supabase
      .from("patients")
      .select(
        "id, first_name, last_name, phone, birth_date, birth_place, tax_code, residence_city, preferred_plan, anamnesis, diagnosis, treatment"
      )
      .eq("id", patientId)
      .single();

    if (res.error) {
      setError(res.error.message);
      setPatient(null);
      setLoading(false);
      return;
    }

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

    if (res.error) {
      setError(res.error.message);
      setClinicalDocs([]);
      setLoadingClinicalDocs(false);
      return;
    }

    setClinicalDocs((res.data ?? []) as ClinicalDocument[]);
    setLoadingClinicalDocs(false);
  }

  async function loadAppointments() {
    setLoadingAppts(true);
    setError("");

    const res = await supabase
      .from("appointments")
      .select("id, start_at, end_at, status, is_paid")
      .eq("patient_id", patientId)
      .order("start_at", { ascending: false });

    if (res.error) {
      setError(res.error.message);
      setAppointments([]);
      setLoadingAppts(false);
      return;
    }

    setAppointments((res.data ?? []) as AppointmentRow[]);
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

    if (res.error) {
      setError(res.error.message);
      setDocs([]);
      setLoadingDocs(false);
      return;
    }

    setDocs((res.data ?? []) as PatientDoc[]);
    setLoadingDocs(false);
  }

  useEffect(() => {
    loadPatient();
    loadAppointments();
    loadDocs();
    loadClinicalDocs();
  }, [patientId]);

  async function saveDemographics() {
    if (!patient) return;

    const fn = firstName.trim();
    const ln = lastName.trim();
    const ph = phone.trim();
    const city = resCity.trim();

    if (!fn || !ln) {
      setError("Nome e cognome non possono essere vuoti.");
      return;
    }

    setSavingDemo(true);
    setError("");

    const res = await supabase
      .from("patients")
      .update({
        first_name: fn,
        last_name: ln,
        phone: ph ? ph : null,
        residence_city: city ? city : null,
        preferred_plan: preferredPlan,
        birth_date: birthDate ? birthDate : null,
        birth_place: birthPlace.trim() ? birthPlace.trim() : null,
        tax_code: normalizeTaxCode(taxCode).trim() ? normalizeTaxCode(taxCode).trim() : null,
      })
      .eq("id", patientId);

    setSavingDemo(false);

    if (res.error) {
      setError(res.error.message);
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
  }

  async function saveClinical() {
    if (!patient) return;

    setSavingClinical(true);
    setError("");

    const res = await supabase
      .from("patients")
      .update({
        anamnesis: anamnesis.trim() || null,
        diagnosis: diagnosis.trim() || null,
        treatment: treatment.trim() || null,
      })
      .eq("id", patientId);

    setSavingClinical(false);

    if (res.error) {
      setError(res.error.message);
      return;
    }

    await loadPatient();
  }

  function resetClinical() {
    if (!patient) return;
    setAnamnesis(patient.anamnesis ?? "");
    setDiagnosis(patient.diagnosis ?? "");
    setTreatment(patient.treatment ?? "");
  }

  async function saveClinicalDocument(docType: ClinicalDocType) {
    if (!patient) return;
    setSavingClinicalDoc(docType);
    setError("");

    const formData = clinicalFormData[docType];
    const reportText = formData.report_text.trim();
    const file = formData.file;

    let file_name: string | null = null;
    let storage_path: string | null = null;

    try {
      if (file) {
        const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
        const path = `clinical_docs/${patientId}/${Date.now()}_${safeName}`;

        const uploadRes = await supabase.storage.from("patient_docs").upload(path, file, { upsert: false });

        if (uploadRes.error) {
          setError(`Upload fallito: ${uploadRes.error.message}`);
          setSavingClinicalDoc(null);
          return;
        }

        file_name = file.name;
        storage_path = path;
      }

      const existingRes = await supabase
        .from("clinical_documents")
        .select("id")
        .eq("patient_id", patientId)
        .eq("doc_type", docType)
        .maybeSingle();

      let dbRes;
      if (existingRes.data) {
        dbRes = await supabase
          .from("clinical_documents")
          .update({
            report_text: reportText || null,
            file_name: file_name || null,
            storage_path: storage_path || null,
            uploaded_at: new Date().toISOString(),
          })
          .eq("id", existingRes.data.id);
      } else {
        dbRes = await supabase.from("clinical_documents").insert({
          patient_id: patientId,
          doc_type: docType,
          report_text: reportText || null,
          file_name: file_name || null,
          storage_path: storage_path || null,
          uploaded_at: new Date().toISOString(),
        });
      }

      if (dbRes.error) {
        setError(`Errore DB: ${dbRes.error.message}`);
        setSavingClinicalDoc(null);
        return;
      }

      setClinicalFormData(prev => ({
        ...prev,
        [docType]: { report_text: "", file: null }
      }));

      await loadClinicalDocs();

    } catch (err: any) {
      setError(`Errore: ${err.message}`);
    } finally {
      setSavingClinicalDoc(null);
    }
  }

  async function openClinicalDocument(doc: ClinicalDocument) {
    if (!doc.storage_path) {
      setError("Nessun file associato a questo documento");
      return;
    }

    setError("");

    const res = await supabase.storage.from("patient_docs").createSignedUrl(doc.storage_path, 60);

    if (res.error || !res.data?.signedUrl) {
      setError(`Impossibile aprire: ${res.error?.message ?? "signed url missing"}`);
      return;
    }

    window.open(res.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteClinicalDocument(doc: ClinicalDocument) {
    const ok = window.confirm(`Eliminare il documento "${clinicalDocTypeLabel(doc.doc_type)}"?`);
    if (!ok) return;

    setError("");

    const delRow = await supabase.from("clinical_documents").delete().eq("id", doc.id);
    if (delRow.error) {
      setError(delRow.error.message);
      return;
    }

    if (doc.storage_path) {
      const delObj = await supabase.storage.from("patient_docs").remove([doc.storage_path]);
      if (delObj.error) {
        setError(`Record eliminato, ma file non rimosso: ${delObj.error.message}`);
      }
    }

    await loadClinicalDocs();
  }

  function handleClinicalReportChange(docType: ClinicalDocType, value: string) {
    setClinicalFormData(prev => ({
      ...prev,
      [docType]: { ...prev[docType], report_text: value }
    }));
  }

  function handleClinicalFileChange(docType: ClinicalDocType, file: File | null) {
    setClinicalFormData(prev => ({
      ...prev,
      [docType]: { 
        ...prev[docType], 
        file,
        tempFileUrl: file ? URL.createObjectURL(file) : undefined
      }
    }));
  }

  async function updateTherapyStatus(apptId: string, status: Status) {
    setError("");
    setRowBusy((m) => ({ ...m, [apptId]: true }));

    const payload: any = { status };
    if (status !== "done") payload.is_paid = false;

    const res = await supabase.from("appointments").update(payload).eq("id", apptId);

    setRowBusy((m) => ({ ...m, [apptId]: false }));

    if (res.error) {
      setError(res.error.message);
      return;
    }

    await loadAppointments();
  }

  async function togglePaid(apptId: string, newValue: boolean) {
    setError("");
    setRowBusy((m) => ({ ...m, [apptId]: true }));

    const res = await supabase.from("appointments").update({ is_paid: newValue }).eq("id", apptId);

    setRowBusy((m) => ({ ...m, [apptId]: false }));

    if (res.error) {
      setError(res.error.message);
      return;
    }

    await loadAppointments();
  }

  async function uploadDocument() {
    if (!file) {
      setError("Seleziona un file.");
      return;
    }

    setError("");
    setUploading(true);

    const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
    const path = `${patientId}/${Date.now()}_${safeName}`;

    const up = await supabase.storage.from("patient_docs").upload(path, file, { upsert: false });

    if (up.error) {
      setError(`Upload fallito: ${up.error.message}`);
      setUploading(false);
      return;
    }

    const ins = await supabase.from("patient_documents").insert({
      patient_id: patientId,
      doc_type: docType,
      file_name: file.name,
      storage_path: path,
    });

    if (ins.error) {
      setError(`Errore DB: ${ins.error.message}`);
      setUploading(false);
      return;
    }

    setFile(null);
    setUploading(false);
    await loadDocs();
  }

  async function openDocument(doc: PatientDoc) {
    setError("");

    const res = await supabase.storage.from("patient_docs").createSignedUrl(doc.storage_path, 60);

    if (res.error || !res.data?.signedUrl) {
      setError(`Impossibile aprire: ${res.error?.message ?? "signed url missing"}`);
      return;
    }

    window.open(res.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteDocument(doc: PatientDoc) {
    const ok = window.confirm("Eliminare questo documento? (DB + Storage)");
    if (!ok) return;

    setError("");

    const delRow = await supabase.from("patient_documents").delete().eq("id", doc.id);
    if (delRow.error) {
      setError(delRow.error.message);
      return;
    }

    const delObj = await supabase.storage.from("patient_docs").remove([doc.storage_path]);
    if (delObj.error) {
      setError(`Record eliminato, ma file non rimosso: ${delObj.error.message}`);
    }

    await loadDocs();
  }

  async function deletePatient() {
    if (!patient) return;

    const ok = window.confirm(
      `Vuoi ELIMINARE definitivamente il paziente:\n${patient.last_name.toUpperCase()} ${patient.first_name.toUpperCase()} ?\n\nQuesta operazione è irreversibile.`
    );
    if (!ok) return;

    setDeletingPatient(true);
    setError("");

    const res = await supabase.from("patients").delete().eq("id", patientId);

    setDeletingPatient(false);

    if (res.error) {
      setError(
        `Impossibile eliminare: ${res.error.message}. ` +
          `Se vuoi davvero eliminarlo, devi prima eliminare/gestire le sedute collegate oppure impostare ON DELETE CASCADE sul FK appointments.patient_id.`
      );
      return;
    }

    window.location.href = "/patients";
  }

  const therapiesCount = appointments.length;
  const doneCount = appointments.filter((a) => a.status === "done").length;
  const paidCount = appointments.filter((a) => a.status === "done" && a.is_paid).length;
  const lastTherapy = appointments[0]?.start_at;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: THEME.appBg, padding: 16 }}>
        <div style={{ color: THEME.textMuted, fontWeight: 900 }}>Caricamento…</div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div style={{ minHeight: "100vh", background: THEME.appBg, padding: 16 }}>
        <div style={{ color: THEME.danger, fontWeight: 900 }}>Scheda paziente non caricata</div>
        <div style={{ marginTop: 8, color: THEME.text, fontWeight: 800 }}>
          ID richiesto: <code>{patientId}</code>
        </div>

        {error && (
          <div style={{ marginTop: 12, ...cardStyle, border: "1px solid rgba(220,38,38,0.25)" }}>
            <div style={{ fontWeight: 900, color: THEME.danger }}>Errore reale</div>
            <div style={{ marginTop: 6, color: THEME.text }}>{error}</div>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <Link href="/patients" style={{ color: THEME.secondary, fontWeight: 900, textDecoration: "none" }}>
            ← Torna ai pazienti
          </Link>
        </div>
      </div>
    );
  }

  const headerName = `${patient.last_name} ${patient.first_name}`.toUpperCase();

  const getExistingClinicalDoc = (docType: ClinicalDocType) => {
    return clinicalDocs.find(doc => doc.doc_type === docType);
  };

  // =========== INIZIO RENDER CON SIDEBAR ===========
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: THEME.appBg }}>
      {/* SIDEBAR - UGUALE A CALENDARIO */}
      <div style={{
        width: 250,
        background: THEME.panelBg,
        borderRight: `1px solid ${THEME.border}`,
        padding: 16,
      }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: THEME.primary }}>FisioHub</div>

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <Link 
            href="/" 
            style={{ 
              color: THEME.primary,
              fontWeight: 800, 
              textDecoration: "none", 
              display: "flex", 
              alignItems: "center", 
              gap: 8,
            }}
          >
            🏠 Home
          </Link>
          <Link href="/calendar" style={{ color: THEME.primary, fontWeight: 800, textDecoration: "none" }}>
            📅 Calendario
          </Link>
          <Link href="/patients" style={{ color: THEME.secondary, fontWeight: 800, textDecoration: "none" }}>
            👤 Pazienti
          </Link>
        </div>

        <div style={{ marginTop: 26, fontSize: 12, color: THEME.textMuted
 }}>
          Scheda paziente
        </div>
      </div>

      {/* CONTENUTO PRINCIPALE */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          {/* HEADER */}
          <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 999,
                    background: THEME.accent,
                    boxShadow: "0 0 0 6px rgba(13,148,136,0.14)",
                  }}
                />
                <h1
                  style={{
                    margin: 0,
                    color: THEME.primary,
                    fontWeight: 1000,
                    letterSpacing: -0.6,
                    fontSize: 30,
                    textTransform: "uppercase",
                  }}
                >
                  {headerName}
                </h1>
              </div>

              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 16 }}>📞</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: THEME.text }}>
                    {patient.phone ?? "—"}
                  </span>
                </div>
                
                <div style={{ height: 16, width: 1, background: THEME.border }} />
                
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 16 }}>🎂</span>
                  <span style={{ fontSize: 14, color: THEME.textSoft }}>
                    {ddmmyyyy(patient.birth_date)}
                  </span>
                </div>
                
                <div style={{ height: 16, width: 1, background: THEME.border }} />
                
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 16 }}>🧾</span>
                  <span style={{ fontSize: 14, color: THEME.textSoft }}>
                    {patient.preferred_plan === "invoice"
                      ? "Fattura"
                      : patient.preferred_plan === "no_invoice"
                      ? "Non fattura"
                      : "—"}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button
                onClick={deletePatient}
                disabled={deletingPatient}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: `1px solid ${THEME.danger}`,
                  background: THEME.danger,
                  color: "#fff",
                  cursor: deletingPatient ? "not-allowed" : "pointer",
                  fontWeight: 1000,
                  height: 42,
                  opacity: deletingPatient ? 0.6 : 1,
                }}
              >
                {deletingPatient ? "Elimino…" : "Elimina paziente"}
              </button>

              <Link
                href="/patients"
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: `1px solid ${THEME.border}`,
                  background: "#ffffff",
                  color: THEME.secondary,
                  fontWeight: 900,
                  textDecoration: "none",
                  height: 42,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                ← Lista
              </Link>

              <Link
                href="/calendar"
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: `1px solid ${THEME.border}`,
                  background: "#ffffff",
                  color: THEME.primary,
                  fontWeight: 900,
                  textDecoration: "none",
                  height: 42,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                📅 Calendario
              </Link>
            </div>
          </div>

          {error && (
            <div
              style={{
                marginTop: 12,
                background: "rgba(249,115,22,0.12)",
                border: "1px solid rgba(249,115,22,0.25)",
                color: "#7c2d12",
                padding: 12,
                borderRadius: 14,
                fontWeight: 900,
              }}
            >
              Attenzione: {error}
            </div>
          )}

          {/* KPI */}
          <section style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            {[
              { label: "Sedute totali", value: String(therapiesCount) },
              { label: "Sedute eseguite", value: String(doneCount) },
              { label: "Eseguite pagate", value: String(paidCount) },
              { label: "Ultima seduta", value: lastTherapy ? formatDateTimeIT(lastTherapy) : "—" },
            ].map((k) => (
              <div key={k.label} style={cardStyle}>
                <div style={{ fontSize: 12, color: THEME.textMuted, fontWeight: 900 }}>{k.label}</div>
                <div style={{ marginTop: 6, fontSize: 16, fontWeight: 1000, color: THEME.text }}>{k.value}</div>
              </div>
            ))}
          </section>

          {/* ANAGRAFICA */}
          <section style={{ marginTop: 14, ...cardStyle }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, color: THEME.primary, fontWeight: 1000 }}>Anagrafica</h2>
                <div style={{ marginTop: 6, fontSize: 12, color: THEME.textMuted }}>
                  {demoEditMode ? "Modalità modifica attiva." : "Bloccata. Premi Modifica per cambiare i dati."}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {!demoEditMode ? (
                  <button
                    onClick={() => setDemoEditMode(true)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: `1px solid rgba(13,148,136,0.35)`,
                      background: "rgba(13,148,136,0.10)",
                      color: THEME.accent,
                      cursor: "pointer",
                      fontWeight: 1000,
                      height: 42,
                      minWidth: 120,
                    }}
                  >
                    Modifica
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        resetDemographics();
                        setDemoEditMode(false);
                      }}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        border: `1px solid ${THEME.border}`,
                        background: "#ffffff",
                        color: THEME.secondary,
                        cursor: "pointer",
                        fontWeight: 1000,
                        height: 42,
                        minWidth: 120,
                      }}
                    >
                      Annulla
                    </button>

                    <button
                      onClick={saveDemographics}
                      disabled={savingDemo || !demoDirty}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        border: `1px solid ${THEME.accent}`,
                        background: THEME.accent,
                        color: "#ffffff",
                        cursor: savingDemo || !demoDirty ? "not-allowed" : "pointer",
                        fontWeight: 1000,
                        height: 42,
                        minWidth: 160,
                        opacity: savingDemo || !demoDirty ? 0.6 : 1,
                      }}
                    >
                      {savingDemo ? "Salvataggio…" : "Salva anagrafica"}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                Nome
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
              </label>

              <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                Cognome
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
              </label>

              <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                Telefono
                <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
              </label>

              <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                Città
                <input value={resCity} onChange={(e) => setResCity(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
              </label>

              <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                Data di nascita (GG/MM/AAAA)
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  style={inputStyle}
                  disabled={!demoEditMode}
                />
                <div style={{ marginTop: 6, fontSize: 12, color: THEME.textMuted }}>
                  Valore: <strong style={{ color: THEME.text }}>{ddmmyyyy(birthDate || patient.birth_date)}</strong>
                </div>
              </label>

              <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                Luogo di nascita
                <input value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
              </label>

              <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                Codice fiscale
                <input
                  value={taxCode}
                  onChange={(e) => setTaxCode(e.target.value)}
                  style={inputStyle}
                  disabled={!demoEditMode}
                  placeholder="RSSMRC..."
                />
                <div style={{ marginTop: 6, fontSize: 12, color: THEME.textMuted }}>
                  Normalizzato: <strong style={{ color: THEME.text }}>{normalizeTaxCode(taxCode || patient.tax_code || "") || "—"}</strong>
                </div>
              </label>

              <label style={{ gridColumn: "1 / span 2", fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                Preferenza documento
                <select value={preferredPlan} onChange={(e) => setPreferredPlan(e.target.value as Plan)} style={inputStyle} disabled={!demoEditMode}>
                  <option value="invoice">Fattura</option>
                  <option value="no_invoice">Non fattura</option>
                </select>
              </label>
            </div>
          </section>

          {/* CLINICA */}
          <section style={{ marginTop: 14, ...cardStyle }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, color: THEME.primary, fontWeight: 1000 }}>Clinica</h2>
                <div style={{ marginTop: 6, fontSize: 12, color: THEME.textMuted }}>
                  Anamnesi · Diagnosi · Trattamento
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button
                  onClick={resetClinical}
                  disabled={!clinicalDirty}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: `1px solid ${THEME.border}`,
                    background: "#ffffff",
                    color: THEME.secondary,
                    cursor: clinicalDirty ? "pointer" : "not-allowed",
                    fontWeight: 1000,
                    height: 42,
                    opacity: clinicalDirty ? 1 : 0.5,
                  }}
                >
                  Ripristina
                </button>

                <button
                  onClick={saveClinical}
                  disabled={savingClinical || !clinicalDirty}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: `1px solid ${THEME.success}`,
                    background: THEME.success,
                    color: "#ffffff",
                    cursor: savingClinical || !clinicalDirty ? "not-allowed" : "pointer",
                    fontWeight: 1000,
                    height: 42,
                    minWidth: 150,
                    opacity: savingClinical || !clinicalDirty ? 0.6 : 1,
                  }}
                >
                  {savingClinical ? "Salvataggio…" : "Salva clinica"}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 1000, color: THEME.textSoft }}>
                <span style={{ fontWeight: 1000 }}>Anamnesi</span>
                <textarea value={anamnesis} onChange={(e) => setAnamnesis(e.target.value)} rows={8} style={textareaStyle} />
              </label>

              <label style={{ fontSize: 13, fontWeight: 1000, color: THEME.textSoft }}>
                <span style={{ fontWeight: 1000 }}>Diagnosi</span>
                <textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={8} style={textareaStyle} />
              </label>

              <label style={{ gridColumn: "1 / span 2", fontSize: 13, fontWeight: 1000, color: THEME.textSoft }}>
                <span style={{ fontWeight: 1000 }}>Trattamento</span>
                <textarea value={treatment} onChange={(e) => setTreatment(e.target.value)} rows={8} style={textareaStyle} />
              </label>
            </div>
          </section>

          {/* DOCUMENTI CLINICI */}
          <section style={{ marginTop: 14, ...cardStyle }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, color: THEME.primary, fontWeight: 1000 }}>Documenti Clinici</h2>
                <div style={{ marginTop: 6, fontSize: 12, color: THEME.textMuted }}>
                  Prescrizioni, esami diagnostici, referti e file correlati
                </div>
              </div>

              <button
                onClick={loadClinicalDocs}
                disabled={loadingClinicalDocs}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: `1px solid ${THEME.border}`,
                  background: "#ffffff",
                  color: THEME.secondary,
                  cursor: loadingClinicalDocs ? "not-allowed" : "pointer",
                  fontWeight: 1000,
                  height: 42,
                }}
              >
                {loadingClinicalDocs ? "Aggiorno…" : "Aggiorna"}
              </button>
            </div>

            {/* PRESCRIZIONE */}
            <div style={{ marginTop: 16, border: `1px solid ${THEME.borderSoft}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0, color: THEME.text, fontWeight: 1000 }}>Prescrizione</h3>
                <button
                  onClick={() => saveClinicalDocument("prescrizione")}
                  disabled={savingClinicalDoc === "prescrizione"}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 10,
                    border: `1px solid ${THEME.accent}`,
                    background: THEME.accent,
                    color: "#fff",
                    cursor: savingClinicalDoc === "prescrizione" ? "not-allowed" : "pointer",
                    fontWeight: 900,
                    fontSize: 13,
                    opacity: savingClinicalDoc === "prescrizione" ? 0.6 : 1,
                  }}
                >
                  {savingClinicalDoc === "prescrizione" ? "Salvataggio…" : "Salva"}
                </button>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    File (PDF/immagini)
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.heic"
                      onChange={(e) => handleClinicalFileChange("prescrizione", e.target.files?.[0] || null)}
                      style={inputStyle}
                    />
                  </label>
                  {clinicalFormData.prescrizione.tempFileUrl && (
                    <div style={{ marginTop: 8, fontSize: 12, color: THEME.success }}>
                      File selezionato: {clinicalFormData.prescrizione.file?.name}
                    </div>
                  )}
                </div>
                
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft, marginBottom: 8 }}>
                    Documento esistente
                  </div>
                  {getExistingClinicalDoc("prescrizione") ? (
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ color: THEME.text }}>{getExistingClinicalDoc("prescrizione")?.file_name || "Documento"}</span>
                      <button
                        onClick={() => openClinicalDocument(getExistingClinicalDoc("prescrizione")!)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: `1px solid ${THEME.border}`,
                          background: "#fff",
                          color: THEME.secondary,
                          fontWeight: 900,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        Apri
                      </button>
                      <button
                        onClick={() => deleteClinicalDocument(getExistingClinicalDoc("prescrizione")!)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: `1px solid ${THEME.danger}`,
                          background: THEME.danger,
                          color: "#fff",
                          fontWeight: 900,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        Elimina
                      </button>
                    </div>
                  ) : (
                    <div style={{ color: THEME.textMuted, fontSize: 13 }}>Nessun documento caricato</div>
                  )}
                </div>
              </div>
            </div>

            {/* RX */}
            <div style={{ marginTop: 16, border: `1px solid ${THEME.borderSoft}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0, color: THEME.text, fontWeight: 1000 }}>Rx (Radiografia)</h3>
                <button
                  onClick={() => saveClinicalDocument("rx")}
                  disabled={savingClinicalDoc === "rx"}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 10,
                    border: `1px solid ${THEME.accent}`,
                    background: THEME.accent,
                    color: "#fff",
                    cursor: savingClinicalDoc === "rx" ? "not-allowed" : "pointer",
                    fontWeight: 900,
                    fontSize: 13,
                    opacity: savingClinicalDoc === "rx" ? 0.6 : 1,
                  }}
                >
                  {savingClinicalDoc === "rx" ? "Salvataggio…" : "Salva"}
                </button>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    Referto (testo)
                    <textarea
                      value={clinicalFormData.rx.report_text}
                      onChange={(e) => handleClinicalReportChange("rx", e.target.value)}
                      rows={4}
                      style={textareaStyle}
                      placeholder="Inserisci il referto della radiografia..."
                    />
                  </label>
                </div>
                
                <div>
                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    File immagini
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.heic"
                      onChange={(e) => handleClinicalFileChange("rx", e.target.files?.[0] || null)}
                      style={inputStyle}
                    />
                  </label>
                  {clinicalFormData.rx.tempFileUrl && (
                    <div style={{ marginTop: 8, fontSize: 12, color: THEME.success }}>
                      File selezionato: {clinicalFormData.rx.file?.name}
                    </div>
                  )}
                  
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft, marginBottom: 8 }}>
                      Documento esistente
                    </div>
                    {getExistingClinicalDoc("rx") ? (
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: THEME.text, fontSize: 13 }}>
                            {getExistingClinicalDoc("rx")?.file_name || "Documento"}
                          </div>
                          {getExistingClinicalDoc("rx")?.report_text && (
                            <div style={{ marginTop: 4, color: THEME.textMuted, fontSize: 12 }}>
                              Referto: {getExistingClinicalDoc("rx")?.report_text?.substring(0, 60)}...
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => openClinicalDocument(getExistingClinicalDoc("rx")!)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              border: `1px solid ${THEME.border}`,
                              background: "#fff",
                              color: THEME.secondary,
                              fontWeight: 900,
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            Apri
                          </button>
                          <button
                            onClick={() => deleteClinicalDocument(getExistingClinicalDoc("rx")!)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              border: `1px solid ${THEME.danger}`,
                              background: THEME.danger,
                              color: "#fff",
                              fontWeight: 900,
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            Elimina
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: THEME.textMuted, fontSize: 13 }}>Nessun documento caricato</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* RM */}
            <div style={{ marginTop: 16, border: `1px solid ${THEME.borderSoft}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0, color: THEME.text, fontWeight: 1000 }}>RM (Risonanza Magnetica)</h3>
                <button
                  onClick={() => saveClinicalDocument("rm")}
                  disabled={savingClinicalDoc === "rm"}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 10,
                    border: `1px solid ${THEME.accent}`,
                    background: THEME.accent,
                    color: "#fff",
                    cursor: savingClinicalDoc === "rm" ? "not-allowed" : "pointer",
                    fontWeight: 900,
                    fontSize: 13,
                    opacity: savingClinicalDoc === "rm" ? 0.6 : 1,
                  }}
                >
                  {savingClinicalDoc === "rm" ? "Salvataggio…" : "Salva"}
                </button>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    Referto (testo)
                    <textarea
                      value={clinicalFormData.rm.report_text}
                      onChange={(e) => handleClinicalReportChange("rm", e.target.value)}
                      rows={4}
                      style={textareaStyle}
                      placeholder="Inserisci il referto della risonanza magnetica..."
                    />
                  </label>
                </div>
                
                <div>
                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    File immagini
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.heic"
                      onChange={(e) => handleClinicalFileChange("rm", e.target.files?.[0] || null)}
                      style={inputStyle}
                    />
                  </label>
                  {clinicalFormData.rm.tempFileUrl && (
                    <div style={{ marginTop: 8, fontSize: 12, color: THEME.success }}>
                      File selezionato: {clinicalFormData.rm.file?.name}
                    </div>
                  )}
                  
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft, marginBottom: 8 }}>
                      Documento esistente
                    </div>
                    {getExistingClinicalDoc("rm") ? (
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: THEME.text, fontSize: 13 }}>
                            {getExistingClinicalDoc("rm")?.file_name || "Documento"}
                          </div>
                          {getExistingClinicalDoc("rm")?.report_text && (
                            <div style={{ marginTop: 4, color: THEME.textMuted, fontSize: 12 }}>
                              Referto: {getExistingClinicalDoc("rm")?.report_text?.substring(0, 60)}...
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => openClinicalDocument(getExistingClinicalDoc("rm")!)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              border: `1px solid ${THEME.border}`,
                              background: "#fff",
                              color: THEME.secondary,
                              fontWeight: 900,
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            Apri
                          </button>
                          <button
                            onClick={() => deleteClinicalDocument(getExistingClinicalDoc("rm")!)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              border: `1px solid ${THEME.danger}`,
                              background: THEME.danger,
                              color: "#fff",
                              fontWeight: 900,
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            Elimina
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: THEME.textMuted, fontSize: 13 }}>Nessun documento caricato</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* TAC */}
            <div style={{ marginTop: 16, border: `1px solid ${THEME.borderSoft}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0, color: THEME.text, fontWeight: 1000 }}>TAC (Tomografia Assiale Computerizzata)</h3>
                <button
                  onClick={() => saveClinicalDocument("tac")}
                  disabled={savingClinicalDoc === "tac"}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 10,
                    border: `1px solid ${THEME.accent}`,
                    background: THEME.accent,
                    color: "#fff",
                    cursor: savingClinicalDoc === "tac" ? "not-allowed" : "pointer",
                    fontWeight: 900,
                    fontSize: 13,
                    opacity: savingClinicalDoc === "tac" ? 0.6 : 1,
                  }}
                >
                  {savingClinicalDoc === "tac" ? "Salvataggio…" : "Salva"}
                </button>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    Referto (testo)
                    <textarea
                      value={clinicalFormData.tac.report_text}
                      onChange={(e) => handleClinicalReportChange("tac", e.target.value)}
                      rows={4}
                      style={textareaStyle}
                      placeholder="Inserisci il referto della TAC..."
                    />
                  </label>
                </div>
                
                <div>
                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    File immagini
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.heic"
                      onChange={(e) => handleClinicalFileChange("tac", e.target.files?.[0] || null)}
                      style={inputStyle}
                    />
                  </label>
                  {clinicalFormData.tac.tempFileUrl && (
                    <div style={{ marginTop: 8, fontSize: 12, color: THEME.success }}>
                      File selezionato: {clinicalFormData.tac.file?.name}
                    </div>
                  )}
                  
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft, marginBottom: 8 }}>
                      Documento esistente
                    </div>
                    {getExistingClinicalDoc("tac") ? (
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: THEME.text, fontSize: 13 }}>
                            {getExistingClinicalDoc("tac")?.file_name || "Documento"}
                          </div>
                          {getExistingClinicalDoc("tac")?.report_text && (
                            <div style={{ marginTop: 4, color: THEME.textMuted, fontSize: 12 }}>
                              Referto: {getExistingClinicalDoc("tac")?.report_text?.substring(0, 60)}...
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => openClinicalDocument(getExistingClinicalDoc("tac")!)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              border: `1px solid ${THEME.border}`,
                              background: "#fff",
                              color: THEME.secondary,
                              fontWeight: 900,
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            Apri
                          </button>
                          <button
                            onClick={() => deleteClinicalDocument(getExistingClinicalDoc("tac")!)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              border: `1px solid ${THEME.danger}`,
                              background: THEME.danger,
                              color: "#fff",
                              fontWeight: 900,
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            Elimina
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: THEME.textMuted, fontSize: 13 }}>Nessun documento caricato</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ELETTROMIOGRAFIA */}
            <div style={{ marginTop: 16, border: `1px solid ${THEME.borderSoft}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0, color: THEME.text, fontWeight: 1000 }}>Elettromiografia</h3>
                <button
                  onClick={() => saveClinicalDocument("elettromiografia")}
                  disabled={savingClinicalDoc === "elettromiografia"}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 10,
                    border: `1px solid ${THEME.accent}`,
                    background: THEME.accent,
                    color: "#fff",
                    cursor: savingClinicalDoc === "elettromiografia" ? "not-allowed" : "pointer",
                    fontWeight: 900,
                    fontSize: 13,
                    opacity: savingClinicalDoc === "elettromiografia" ? 0.6 : 1,
                  }}
                >
                  {savingClinicalDoc === "elettromiografia" ? "Salvataggio…" : "Salva"}
                </button>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    File (PDF/immagini)
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => handleClinicalFileChange("elettromiografia", e.target.files?.[0] || null)}
                      style={inputStyle}
                    />
                  </label>
                  {clinicalFormData.elettromiografia.tempFileUrl && (
                    <div style={{ marginTop: 8, fontSize: 12, color: THEME.success }}>
                      File selezionato: {clinicalFormData.elettromiografia.file?.name}
                    </div>
                  )}
                </div>
                
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft, marginBottom: 8 }}>
                    Documento esistente
                  </div>
                  {getExistingClinicalDoc("elettromiografia") ? (
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ color: THEME.text }}>{getExistingClinicalDoc("elettromiografia")?.file_name || "Documento"}</span>
                      <button
                        onClick={() => openClinicalDocument(getExistingClinicalDoc("elettromiografia")!)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: `1px solid ${THEME.border}`,
                          background: "#fff",
                          color: THEME.secondary,
                          fontWeight: 900,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        Apri
                      </button>
                      <button
                        onClick={() => deleteClinicalDocument(getExistingClinicalDoc("elettromiografia")!)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: `1px solid ${THEME.danger}`,
                          background: THEME.danger,
                          color: "#fff",
                          fontWeight: 900,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        Elimina
                      </button>
                    </div>
                  ) : (
                    <div style={{ color: THEME.textMuted, fontSize: 13 }}>Nessun documento caricato</div>
                  )}
                </div>
              </div>
            </div>

            {/* ECOGRAFIA */}
            <div style={{ marginTop: 16, border: `1px solid ${THEME.borderSoft}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0, color: THEME.text, fontWeight: 1000 }}>Ecografia</h3>
                <button
                  onClick={() => saveClinicalDocument("ecografia")}
                  disabled={savingClinicalDoc === "ecografia"}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 10,
                    border: `1px solid ${THEME.accent}`,
                    background: THEME.accent,
                    color: "#fff",
                    cursor: savingClinicalDoc === "ecografia" ? "not-allowed" : "pointer",
                    fontWeight: 900,
                    fontSize: 13,
                    opacity: savingClinicalDoc === "ecografia" ? 0.6 : 1,
                  }}
                >
                  {savingClinicalDoc === "ecografia" ? "Salvataggio…" : "Salva"}
                </button>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    File (immagini/video)
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.mp4,.mov,.avi"
                      onChange={(e) => handleClinicalFileChange("ecografia", e.target.files?.[0] || null)}
                      style={inputStyle}
                    />
                  </label>
                  {clinicalFormData.ecografia.tempFileUrl && (
                    <div style={{ marginTop: 8, fontSize: 12, color: THEME.success }}>
                      File selezionato: {clinicalFormData.ecografia.file?.name}
                    </div>
                  )}
                </div>
                
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft, marginBottom: 8 }}>
                    Documento esistente
                  </div>
                  {getExistingClinicalDoc("ecografia") ? (
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ color: THEME.text }}>{getExistingClinicalDoc("ecografia")?.file_name || "Documento"}</span>
                      <button
                        onClick={() => openClinicalDocument(getExistingClinicalDoc("ecografia")!)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: `1px solid ${THEME.border}`,
                          background: "#fff",
                          color: THEME.secondary,
                          fontWeight: 900,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        Apri
                      </button>
                      <button
                        onClick={() => deleteClinicalDocument(getExistingClinicalDoc("ecografia")!)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: `1px solid ${THEME.danger}`,
                          background: THEME.danger,
                          color: "#fff",
                          fontWeight: 900,
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        Elimina
                      </button>
                    </div>
                  ) : (
                    <div style={{ color: THEME.textMuted, fontSize: 13 }}>Nessun documento caricato</div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* TERAPIE + PAGAMENTO */}
          <section style={{ marginTop: 14, ...cardStyle }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, color: THEME.primary, fontWeight: 1000 }}>Terapie fatte</h2>
                <div style={{ marginTop: 6, fontSize: 12, color: THEME.textMuted }}>
                  Dropdown stato compatto e colorato. Pagamento attivo solo se "Eseguita".
                </div>
              </div>

              <button
                onClick={loadAppointments}
                disabled={loadingAppts}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: `1px solid ${THEME.border}`,
                  background: "#ffffff",
                  color: THEME.secondary,
                  cursor: loadingAppts ? "not-allowed" : "pointer",
                  fontWeight: 1000,
                  height: 42,
                }}
              >
                {loadingAppts ? "Aggiorno…" : "Aggiorna"}
              </button>
            </div>

            {appointments.length === 0 && !loadingAppts && (
              <div style={{ marginTop: 10, fontSize: 13, color: THEME.textMuted }}>Nessuna seduta trovata.</div>
            )}

            {appointments.length > 0 && (
              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      {["Data", "Stato", "Pagata"].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: "10px 12px",
                            fontSize: 12,
                            color: THEME.textMuted,
                            borderBottom: `1px solid ${THEME.borderSoft}`,
                            background: "rgba(241,245,249,0.85)",
                            fontWeight: 1000,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {appointments.map((a, idx) => {
                      const busy = !!rowBusy[a.id];
                      const c = statusColors(a.status);

                      const compactSelectStyle: React.CSSProperties = {
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: `1px solid ${c.bd}`,
                        background: c.bg,
                        color: c.fg,
                        fontWeight: 1000,
                        fontSize: 12,
                        cursor: busy ? "not-allowed" : "pointer",
                        outline: "none",
                        height: 32,
                      };

                      return (
                        <tr key={a.id} style={{ background: idx % 2 === 0 ? "#fff" : "rgba(241,245,249,0.55)" }}>
                          <td style={{ padding: 12, color: THEME.text, fontWeight: 900 }}>
                            {formatDateTimeIT(a.start_at)}
                          </td>

                          <td style={{ padding: 12 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  padding: "6px 10px",
                                  borderRadius: 999,
                                  background: c.bg,
                                  border: `1px solid ${c.bd}`,
                                  color: c.fg,
                                  fontWeight: 1000,
                                  fontSize: 12,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {statusLabel(a.status)}
                              </span>

                              <select
                                value={a.status}
                                disabled={busy}
                                onChange={(e) => updateTherapyStatus(a.id, e.target.value as Status)}
                                style={compactSelectStyle}
                              >
                                <option value="booked">Prenotata</option>
                                <option value="confirmed">Confermata</option>
                                <option value="done">Eseguita</option>
                              </select>

                              {busy && <span style={{ fontSize: 12, color: THEME.textMuted }}>Salvo…</span>}
                            </div>
                          </td>

                          <td style={{ padding: 12 }}>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
                              <input
                                type="checkbox"
                                checked={a.is_paid}
                                disabled={busy || a.status !== "done"}
                                onChange={(e) => togglePaid(a.id, e.target.checked)}
                                style={{ width: 18, height: 18 }}
                              />
                              <span style={{ color: a.status === "done" ? THEME.textSoft : THEME.textMuted }}>
                                {a.status === "done" ? (a.is_paid ? "Pagata" : "Non pagata") : "—"}
                              </span>
                            </label>

                            {a.status !== "done" && (
                              <div style={{ marginTop: 6, fontSize: 12, color: THEME.textMuted }}>
                                Pagamento attivo solo se eseguita.
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div style={{ marginTop: 10, fontSize: 12, color: THEME.textMuted }}>
                  Regola: se una seduta passa da "Eseguita" a "Prenotata/Confermata", il pagamento viene azzerato.
                </div>
              </div>
            )}
          </section>

          {/* GDPR */}
          <section style={{ marginTop: 14, ...cardStyle }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, color: THEME.primary, fontWeight: 1000 }}>Documenti (GDPR)</h2>
                <div style={{ marginTop: 6, fontSize: 12, color: THEME.textMuted }}>Upload + archivio.</div>
              </div>

              <button
                onClick={loadDocs}
                disabled={loadingDocs}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: `1px solid ${THEME.border}`,
                  background: "#ffffff",
                  color: THEME.secondary,
                  cursor: loadingDocs ? "not-allowed" : "pointer",
                  fontWeight: 1000,
                  height: 42,
                }}
              >
                {loadingDocs ? "Aggiorno…" : "Aggiorna"}
              </button>
            </div>

            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                Tipo documento
                <select value={docType} onChange={(e) => setDocType(e.target.value as DocType)} style={inputStyle}>
                  <option value="gdpr_informativa_privacy">GDPR – Informativa Privacy</option>
                  <option value="consenso_trattamento">Consenso al trattamento</option>
                  <option value="altro">Altro</option>
                </select>
              </label>

              <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                File
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  style={inputStyle}
                />
              </label>

              <div style={{ gridColumn: "1 / span 2", display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={uploadDocument}
                  disabled={uploading}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: `1px solid ${THEME.accent}`,
                    background: THEME.accent,
                    color: "#fff",
                    cursor: uploading ? "not-allowed" : "pointer",
                    fontWeight: 1000,
                    minWidth: 170,
                    opacity: uploading ? 0.6 : 1,
                  }}
                >
                  {uploading ? "Caricamento…" : "Carica documento"}
                </button>
              </div>
            </div>

            {docs.length === 0 && !loadingDocs && (
              <div style={{ marginTop: 12, fontSize: 13, color: THEME.textMuted }}>Nessun documento caricato.</div>
            )}

            {docs.length > 0 && (
              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      {["Tipo", "File", "Caricato", "Azioni"].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: "10px 12px",
                            fontSize: 12,
                            color: THEME.textMuted,
                            borderBottom: `1px solid ${THEME.borderSoft}`,
                            background: "rgba(241,245,249,0.85)",
                            fontWeight: 1000,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {docs.map((d, idx) => (
                      <tr key={d.id} style={{ background: idx % 2 === 0 ? "#fff" : "rgba(241,245,249,0.55)" }}>
                        <td style={{ padding: 12, fontWeight: 1000, color: THEME.text }}>{docTypeLabel(d.doc_type)}</td>
                        <td style={{ padding: 12, color: THEME.text }}>{d.file_name}</td>
                        <td style={{ padding: 12, color: THEME.text }}>
                          {new Date(d.uploaded_at).toLocaleString("it-IT")}
                        </td>
                        <td style={{ padding: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            onClick={() => openDocument(d)}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 12,
                              border: `1px solid ${THEME.border}`,
                              background: "#fff",
                              color: THEME.secondary,
                              fontWeight: 1000,
                              cursor: "pointer",
                            }}
                          >
                            Apri
                          </button>
                          <button
                            onClick={() => deleteDocument(d)}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 12,
                              border: `1px solid ${THEME.danger}`,
                              background: THEME.danger,
                              color: "#fff",
                              fontWeight: 1000,
                              cursor: "pointer",
                            }}
                          >
                            Elimina
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}