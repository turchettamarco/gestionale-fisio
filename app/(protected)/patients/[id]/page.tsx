"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../src/lib/supabaseClient";



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
  // ===== V2 (visione futura) =====
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

function safeNumToStr(n: number | null | undefined) {
  return typeof n === "number" && !Number.isNaN(n) ? String(n) : "";
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
  // ===== V2 (visione futura) =====
  const [showV2Clinical, setShowV2Clinical] = useState(true);
  const [showV2Business, setShowV2Business] = useState(true);

  const [patientStatus, setPatientStatus] = useState("active");
  const [acquisitionChannel, setAcquisitionChannel] = useState("");
  const [firstVisitDate, setFirstVisitDate] = useState("");
  const [mainComplaint, setMainComplaint] = useState("");
  const [bodyRegion, setBodyRegion] = useState("");
  const [side, setSide] = useState("");
  const [pathologyType, setPathologyType] = useState("");
  const [medicalDiagnosis, setMedicalDiagnosis] = useState("");
  const [expectedFrequency, setExpectedFrequency] = useState("");
  const [packageSize, setPackageSize] = useState("");


  // ===== CLINICA =====
  const [anamnesis, setAnamnesis] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [treatment, setTreatment] = useState("");
  const [savingClinical, setSavingClinical] = useState(false);

  // ===== DOCUMENTI CLINICI =====
  const [clinicalDocs, setClinicalDocs] = useState<ClinicalDocument[]>([]);
  const [loadingClinicalDocs, setLoadingClinicalDocs] = useState(false);
  const [savingClinicalDoc, setSavingClinicalDoc] = useState<string | null>(null);

  // ===== UPLOAD DOCUMENTI CLINICI (solo immagini/PDF, niente testo) =====
  const [clinicalUploadType, setClinicalUploadType] = useState<ClinicalDocType>("prescrizione");
  const [clinicalUploadTitle, setClinicalUploadTitle] = useState("");
  const [clinicalUploadFile, setClinicalUploadFile] = useState<File | null>(null);



  // ===== TERAPIE + PAGAMENTO =====
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(false);
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});

  // ===== Diario sedute (note per singola seduta) =====
  const [showTreatmentDiary, setShowTreatmentDiary] = useState(true);
  const [notesByApptId, setNotesByApptId] = useState<Record<string, string>>({});
  const [noteBusyByApptId, setNoteBusyByApptId] = useState<Record<string, boolean>>({});

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
    // V2
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
      || !same((patientStatus ?? "").trim(), (patient.patient_status ?? "active"))
      || !same((acquisitionChannel ?? "").trim(), (patient.acquisition_channel ?? ""))
      || !same((firstVisitDate ?? "").trim(), (patient.first_visit_date ?? ""))
      || !same((mainComplaint ?? "").trim(), (patient.main_complaint ?? ""))
      || !same((bodyRegion ?? "").trim(), (patient.body_region ?? ""))
      || !same((side ?? "").trim(), (patient.side ?? ""))
      || !same((pathologyType ?? "").trim(), (patient.pathology_type ?? ""))
      || !same((medicalDiagnosis ?? "").trim(), (patient.medical_diagnosis ?? ""))
      || !same((expectedFrequency ?? "").trim(), safeNumToStr(patient.expected_frequency))
      || !same((packageSize ?? "").trim(), safeNumToStr(patient.package_size))

    );
  }, [patient, firstName, lastName, phone, resCity, preferredPlan, birthDate, birthPlace, taxCode, patientStatus, acquisitionChannel, firstVisitDate, mainComplaint, bodyRegion, side, pathologyType, medicalDiagnosis, expectedFrequency, packageSize]);

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
        "id, first_name, last_name, phone, birth_date, birth_place, tax_code, residence_city, preferred_plan, anamnesis, diagnosis, treatment, patient_status, acquisition_channel, first_visit_date, main_complaint, body_region, side, pathology_type, medical_diagnosis, expected_frequency, package_size"
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
      .select("id, start_at, end_at, status, is_paid, calendar_note")
      .eq("patient_id", patientId)
      .order("start_at", { ascending: false });

    if (res.error) {
      setError(res.error.message);
      setAppointments([]);
      setLoadingAppts(false);
      return;
    }

    setAppointments((res.data ?? []) as AppointmentRow[]);
    // Precarica le note (calendar_note) nel diario
    const map: Record<string, string> = {};
    (res.data ?? []).forEach((r: any) => {
      map[r.id] = (r.calendar_note ?? "") as string;
    });
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
        // V2
        patient_status: patientStatus || null,
        acquisition_channel: acquisitionChannel || null,
        first_visit_date: firstVisitDate ? firstVisitDate : null,
        main_complaint: mainComplaint.trim() ? mainComplaint.trim() : null,
        body_region: bodyRegion || null,
        side: side || null,
        pathology_type: pathologyType || null,
        medical_diagnosis: medicalDiagnosis.trim() ? medicalDiagnosis.trim() : null,
        expected_frequency: expectedFrequency.trim() ? Number(expectedFrequency) : null,
        package_size: packageSize.trim() ? Number(packageSize) : null,

      })
      .eq("id", patientId);

    setSavingDemo(false);

    if (res.error) {
      // Messaggio più utile quando mancano le colonne V2
      const msg = res.error.message || "Errore";
      if (msg.toLowerCase().includes("column") && msg.toLowerCase().includes("does not exist")) {
        setError(msg + " → Ti manca la migration SQL dei campi V2 (patient_status, acquisition_channel, ecc.).");
      } else {
        setError(msg);
      }
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
    // V2
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

  async function uploadClinicalDocument() {
    if (!patient) return;

    if (!clinicalUploadFile) {
      setError("Seleziona un file (immagine o PDF).");
      return;
    }

    setSavingClinicalDoc("upload");
    setError("");

    const file = clinicalUploadFile;
    const safeOriginal = file.name.replace(/[^\w.\-() ]+/g, "_");
    const path = `clinical_docs/${patientId}/${Date.now()}_${safeOriginal}`;

    // Upload su bucket patient_docs (stesso bucket già usato per i GDPR)
    const uploadRes = await supabase.storage.from("patient_docs").upload(path, file, { upsert: false });
    if (uploadRes.error) {
      setError(`Upload fallito: ${uploadRes.error.message}`);
      setSavingClinicalDoc(null);
      return;
    }

    const title = clinicalUploadTitle.trim();
    const displayName = title ? title : file.name;

    const ins = await supabase.from("clinical_documents").insert({
      patient_id: patientId,
      doc_type: clinicalUploadType,
      report_text: null,
      file_name: displayName,
      storage_path: path,
      uploaded_at: new Date().toISOString(),
    });

    if (ins.error) {
      setError(`Errore DB: ${ins.error.message}`);
      setSavingClinicalDoc(null);
      return;
    }

    // reset form
    setClinicalUploadTitle("");
    setClinicalUploadFile(null);

    await loadClinicalDocs();
    setSavingClinicalDoc(null);
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




  async function saveAppointmentNote(apptId: string) {
    setError("");
    setNoteBusyByApptId((m) => ({ ...m, [apptId]: true }));

    const note = (notesByApptId[apptId] ?? "").trim();

    const res = await supabase
      .from("appointments")
      .update({ calendar_note: note ? note : null })
      .eq("id", apptId);

    setNoteBusyByApptId((m) => ({ ...m, [apptId]: false }));

    if (res.error) {
      setError(res.error.message);
      return;
    }

    // Non ricarico tutto: aggiorno solo localmente + (opzionale) reload per sicurezza
    // await loadAppointments();
  }

  function applyNoteTemplate(apptId: string) {
    const tpl =
      "🎯 Obiettivo: \n" +
      "👐 Tecniche/Trattamento: \n" +
      "🏋️ Esercizi: \n" +
      "📌 Note / risposta del paziente: \n";
    setNotesByApptId((m) => ({ ...m, [apptId]: (m[apptId] ?? "") || tpl }));
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


            {/* ===== V2 (visione futura) ===== */}
            <div style={{ marginTop: 16, borderTop: `1px solid ${THEME.borderSoft}`, paddingTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 1000, color: THEME.primary }}>Visone futura (V2)</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: THEME.textMuted }}>
                    Campi aggiuntivi che ti servono per segmentare, fare follow-up e fare previsioni. Se non hai fatto la migration SQL, questi campi non verranno salvati.
                  </div>
                </div>
              </div>

              {/* Clinica iniziale */}
              <button
                type="button"
                onClick={() => setShowV2Clinical((s) => !s)}
                style={{
                  width: "100%",
                  marginTop: 12,
                  textAlign: "left",
                  background: "transparent",
                  border: `1px solid ${THEME.borderSoft}`,
                  padding: "10px 12px",
                  borderRadius: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontWeight: 1000,
                  color: THEME.text,
                }}
              >
                <span>🧠 Dati clinici iniziali</span>
                <span style={{ color: THEME.secondary }}>{showV2Clinical ? "–" : "+"}</span>
              </button>

              {showV2Clinical ? (
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ gridColumn: "1 / span 2", fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    Motivo principale
                    <textarea
                      value={mainComplaint}
                      onChange={(e) => setMainComplaint(e.target.value)}
                      rows={4}
                      style={textareaStyle}
                      placeholder="Es. dolore lombare da 3 settimane..."
                      disabled={!demoEditMode}
                    />
                  </label>

                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    Distretto
                    <select value={bodyRegion} onChange={(e) => setBodyRegion(e.target.value)} style={inputStyle} disabled={!demoEditMode}>
                      <option value="">Seleziona</option>
                      <option value="cervicale">Cervicale</option>
                      <option value="dorsale">Dorsale</option>
                      <option value="lombare">Lombare</option>
                      <option value="spalla">Spalla</option>
                      <option value="gomito">Gomito</option>
                      <option value="polso_mano">Polso/Mano</option>
                      <option value="anca">Anca</option>
                      <option value="ginocchio">Ginocchio</option>
                      <option value="caviglia_piede">Caviglia/Piede</option>
                      <option value="atm">ATM</option>
                      <option value="neurologico">Neurologico</option>
                      <option value="altro">Altro</option>
                    </select>
                  </label>

                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    Lato
                    <select value={side} onChange={(e) => setSide(e.target.value)} style={inputStyle} disabled={!demoEditMode}>
                      <option value="">Seleziona</option>
                      <option value="dx">DX</option>
                      <option value="sx">SX</option>
                      <option value="bilaterale">Bilaterale</option>
                    </select>
                  </label>

                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    Tipo problema
                    <select value={pathologyType} onChange={(e) => setPathologyType(e.target.value)} style={inputStyle} disabled={!demoEditMode}>
                      <option value="">Seleziona</option>
                      <option value="traumatico">Traumatico</option>
                      <option value="degenerativo">Degenerativo</option>
                      <option value="post_chirurgico">Post-chirurgico</option>
                      <option value="neurologico">Neurologico</option>
                      <option value="cronico">Cronico</option>
                      <option value="funzionale">Funzionale</option>
                    </select>
                  </label>

                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    Diagnosi medica
                    <input value={medicalDiagnosis} onChange={(e) => setMedicalDiagnosis(e.target.value)} style={inputStyle} disabled={!demoEditMode} placeholder="Es. discopatia L4-L5" />
                  </label>
                </div>
              ) : null}

              {/* Business */}
              <button
                type="button"
                onClick={() => setShowV2Business((s) => !s)}
                style={{
                  width: "100%",
                  marginTop: 12,
                  textAlign: "left",
                  background: "transparent",
                  border: `1px solid ${THEME.borderSoft}`,
                  padding: "10px 12px",
                  borderRadius: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontWeight: 1000,
                  color: THEME.text,
                }}
              >
                <span>💼 Stato & dati economici</span>
                <span style={{ color: THEME.secondary }}>{showV2Business ? "–" : "+"}</span>
              </button>

              {showV2Business ? (
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    Stato paziente
                    <select value={patientStatus} onChange={(e) => setPatientStatus(e.target.value)} style={inputStyle} disabled={!demoEditMode}>
                      <option value="active">Attivo</option>
                      <option value="lead">Lead</option>
                      <option value="paused">In pausa</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="discharged">Dimesso</option>
                    </select>
                  </label>

                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    Canale acquisizione
                    <select value={acquisitionChannel} onChange={(e) => setAcquisitionChannel(e.target.value)} style={inputStyle} disabled={!demoEditMode}>
                      <option value="">Seleziona</option>
                      <option value="passaparola">Passaparola</option>
                      <option value="medico">Medico</option>
                      <option value="instagram">Instagram</option>
                      <option value="google">Google</option>
                      <option value="evento">Evento</option>
                      <option value="altro">Altro</option>
                    </select>
                  </label>

                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    Data primo contatto
                    <input type="date" value={firstVisitDate} onChange={(e) => setFirstVisitDate(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
                  </label>

                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    Frequenza prevista (sett.)
                    <input value={expectedFrequency} onChange={(e) => setExpectedFrequency(e.target.value)} style={inputStyle} disabled={!demoEditMode} placeholder="Es. 2" />
                  </label>

                  <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                    Pacchetto sedute
                    <input value={packageSize} onChange={(e) => setPackageSize(e.target.value)} style={inputStyle} disabled={!demoEditMode} placeholder="Es. 10" />
                  </label>
                </div>
              ) : null}

              <div style={{ marginTop: 10, fontSize: 12, color: THEME.textMuted }}>
                Nota: questi campi si salvano con <b>Salva anagrafica</b>.
              </div>
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
              <div style={{ border: `1px solid ${THEME.borderSoft}`, borderRadius: 14, padding: 12, background: "rgba(241,245,249,0.55)" }}>
                <div style={{ fontSize: 12, fontWeight: 1000, color: THEME.textMuted }}>🧩 Anamnesi</div>
                <textarea
                  value={anamnesis}
                  onChange={(e) => setAnamnesis(e.target.value)}
                  rows={8}
                  style={{ ...textareaStyle, marginTop: 8, background: "#fff" }}
                  placeholder="Storia del problema, red flags, farmaci, obiettivi del paziente…"
                />
              </div>

              <div style={{ border: `1px solid ${THEME.borderSoft}`, borderRadius: 14, padding: 12, background: "rgba(241,245,249,0.55)" }}>
                <div style={{ fontSize: 12, fontWeight: 1000, color: THEME.textMuted }}>🧠 Diagnosi / ipotesi clinica</div>
                <textarea
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  rows={8}
                  style={{ ...textareaStyle, marginTop: 8, background: "#fff" }}
                  placeholder="Diagnosi medica e/o ragionamento clinico, test positivi/negativi…"
                />
              </div>

              <div style={{ gridColumn: "1 / span 2" }}>
                <button
                  type="button"
                  onClick={() => setShowTreatmentDiary((s) => !s)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: "#ffffff",
                    border: `1px solid ${THEME.borderSoft}`,
                    padding: "12px 14px",
                    borderRadius: 14,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontWeight: 1000,
                    color: THEME.text,
                  }}
                >
                  <span>🗂️ Trattamento & Diario sedute</span>
                  <span style={{ color: THEME.secondary }}>{showTreatmentDiary ? "–" : "+"}</span>
                </button>

                {showTreatmentDiary ? (
                  <div style={{ marginTop: 12, border: `1px solid ${THEME.borderSoft}`, borderRadius: 14, background: "#fff" }}>
                    <div style={{ padding: 12, borderBottom: `1px solid ${THEME.borderSoft}`, background: "rgba(241,245,249,0.55)" }}>
                      <div style={{ fontSize: 12, fontWeight: 1000, color: THEME.textMuted }}>
                        Qui scrivi cosa fai ad ogni seduta. Le note si salvano in <code>appointments.calendar_note</code>.
                      </div>
                    </div>

                    {appointments.length === 0 ? (
                      <div style={{ padding: 12, color: THEME.textMuted, fontWeight: 900 }}>
                        Nessuna seduta trovata: quando inizi a registrare appuntamenti, qui comparirà lo storico.
                      </div>
                    ) : (
                      <div style={{ padding: 12, display: "grid", gap: 12 }}>
                        {appointments.map((a) => {
                          const busy = !!noteBusyByApptId[a.id];
                          const c = statusColors(a.status);
                          const val = notesByApptId[a.id] ?? "";

                          return (
                            <div key={a.id} style={{ border: `1px solid ${THEME.borderSoft}`, borderRadius: 14, padding: 12 }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                  <div style={{ fontWeight: 1000, color: THEME.text }}>
                                    {formatDateTimeIT(a.start_at)}
                                  </div>
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
                                </div>

                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  <button
                                    type="button"
                                    onClick={() => applyNoteTemplate(a.id)}
                                    style={{
                                      padding: "8px 10px",
                                      borderRadius: 12,
                                      border: `1px solid ${THEME.border}`,
                                      background: "#fff",
                                      color: THEME.secondary,
                                      fontWeight: 1000,
                                      cursor: "pointer",
                                      fontSize: 12,
                                    }}
                                  >
                                    Usa template
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => saveAppointmentNote(a.id)}
                                    disabled={busy}
                                    style={{
                                      padding: "8px 12px",
                                      borderRadius: 12,
                                      border: `1px solid ${THEME.accent}`,
                                      background: THEME.accent,
                                      color: "#fff",
                                      fontWeight: 1000,
                                      cursor: busy ? "not-allowed" : "pointer",
                                      fontSize: 12,
                                      opacity: busy ? 0.65 : 1,
                                    }}
                                  >
                                    {busy ? "Salvo…" : "Salva nota"}
                                  </button>
                                </div>
                              </div>

                              <textarea
                                value={val}
                                onChange={(e) => setNotesByApptId((m) => ({ ...m, [a.id]: e.target.value }))}
                                rows={4}
                                style={{ ...textareaStyle, marginTop: 10 }}
                                placeholder="Cosa hai fatto oggi? Tecniche, esercizi, progressioni, risposta del paziente…"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 1000, color: THEME.textMuted }}>📌 Piano trattamento (generale)</div>
                  <textarea
                    value={treatment}
                    onChange={(e) => setTreatment(e.target.value)}
                    rows={6}
                    style={{ ...textareaStyle, marginTop: 8 }}
                    placeholder="Il piano generale: frequenza, progressione, obiettivi a 2-4-6 settimane…"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* DOCUMENTI CLINICI */}
          <section style={{ marginTop: 14, ...cardStyle }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, color: THEME.primary, fontWeight: 1000 }}>Documenti Clinici</h2>
                <div style={{ marginTop: 6, fontSize: 12, color: THEME.textMuted }}>
                  Solo file (immagini/PDF). Niente testo: il “referto scritto” lo carichi come scansione.
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

            {/* Uploader */}
            <div style={{ marginTop: 14, border: `1px solid ${THEME.borderSoft}`, borderRadius: 14, padding: 14, background: "rgba(241,245,249,0.55)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                  Tipo documento
                  <select value={clinicalUploadType} onChange={(e) => setClinicalUploadType(e.target.value as ClinicalDocType)} style={inputStyle}>
                    <option value="prescrizione">Prescrizione</option>
                    <option value="rx">Rx (Radiografia)</option>
                    <option value="rm">RM (Risonanza Magnetica)</option>
                    <option value="tac">TAC</option>
                    <option value="elettromiografia">Elettromiografia</option>
                    <option value="ecografia">Ecografia</option>
                  </select>
                </label>

                <label style={{ fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                  Nome (opzionale)
                  <input
                    value={clinicalUploadTitle}
                    onChange={(e) => setClinicalUploadTitle(e.target.value)}
                    style={inputStyle}
                    placeholder="Es. RM Lombare 12-02-2026"
                  />
                </label>

                <label style={{ gridColumn: "1 / span 2", fontSize: 13, fontWeight: 900, color: THEME.textSoft }}>
                  File (immagini o PDF)
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.heic,.webp"
                    onChange={(e) => setClinicalUploadFile(e.target.files?.[0] || null)}
                    style={inputStyle}
                  />
                  {clinicalUploadFile ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: THEME.success, fontWeight: 900 }}>
                      Selezionato: {clinicalUploadFile.name}
                    </div>
                  ) : null}
                </label>
              </div>

              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={uploadClinicalDocument}
                  disabled={savingClinicalDoc === "upload"}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: `1px solid ${THEME.accent}`,
                    background: THEME.accent,
                    color: "#fff",
                    cursor: savingClinicalDoc === "upload" ? "not-allowed" : "pointer",
                    fontWeight: 1000,
                    minWidth: 170,
                    opacity: savingClinicalDoc === "upload" ? 0.65 : 1,
                  }}
                >
                  {savingClinicalDoc === "upload" ? "Carico…" : "Carica documento"}
                </button>
              </div>
            </div>

            {/* Lista */}
            <div style={{ marginTop: 14 }}>
              {clinicalDocs.length === 0 ? (
                <div style={{ fontSize: 13, color: THEME.textMuted, fontWeight: 900 }}>Nessun documento clinico caricato.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {clinicalDocs.map((doc) => (
                    <div
                      key={doc.id}
                      style={{
                        border: `1px solid ${THEME.borderSoft}`,
                        borderRadius: 14,
                        padding: 12,
                        background: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ minWidth: 260 }}>
                        <div style={{ fontWeight: 1000, color: THEME.text }}>
                          {clinicalDocTypeLabel(doc.doc_type)} · {doc.file_name || "Documento"}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: THEME.textMuted }}>
                          Caricato: {new Date(doc.uploaded_at).toLocaleString("it-IT")}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => openClinicalDocument(doc)}
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
                          type="button"
                          onClick={() => deleteClinicalDocument(doc)}
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
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