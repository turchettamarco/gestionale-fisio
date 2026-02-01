"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { Menu, X, Home, Calendar, BarChart3, Users } from "lucide-react";

type Plan = "invoice" | "no_invoice";
type Status = "booked" | "confirmed" | "done";

type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  birth_date: string | null;
  preferred_plan: Plan | null;
  anamnesis: string | null;
  diagnosis: string | null;
  treatment: string | null;
};

type AppointmentRow = {
  id: string;
  start_at: string;
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

const THEME = {
  appBg: "#f8fafc",
  panelBg: "#ffffff",
  text: "#1e293b",
  textSoft: "#475569",
  textMuted: "#64748b",
  primary: "#2563eb",
  secondary: "#4f46e5",
  accent: "#0891b2",
  border: "#e2e8f0",
  borderSoft: "#f1f5f9",
  success: "#16a34a",
  danger: "#dc2626",
  warning: "#f97316",
};

// --- BARRA LATERALE MOBILE (MENU) ---
function MobileMenu({ showMenu, setShowMenu }: { showMenu: boolean, setShowMenu: (show: boolean) => void }) {
  return (
    <>
      {/* Pulsante per aprire il menu */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        style={{
          background: "none",
          border: "none",
          padding: 8,
          cursor: "pointer",
          color: THEME.primary,
        }}
      >
        <Menu size={24} />
      </button>

      {/* Menu laterale mobile */}
      {showMenu && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 1000,
        }} onClick={() => setShowMenu(false)}>
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: "80%",
            maxWidth: 300,
            background: THEME.panelBg,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20 
            }}>
              <h2 style={{ margin: 0, color: THEME.primary }}>FisioHub</h2>
              <button 
                onClick={() => setShowMenu(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: THEME.text,
                }}
              >
                <X size={24} />
              </button>
            </div>
            
            <Link 
              href="/" 
              style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 12,
                color: THEME.text,
                textDecoration: "none",
                padding: "12px 0",
              }}
              onClick={() => setShowMenu(false)}
            >
              <Home size={20} />
              Home
            </Link>
            
            <Link 
              href="/calendar" 
              style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 12,
                color: THEME.text,
                textDecoration: "none",
                padding: "12px 0",
              }}
              onClick={() => setShowMenu(false)}
            >
              <Calendar size={20} />
              Calendario
            </Link>
            
            <Link 
              href="/reports" 
              style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 12,
                color: THEME.primary,
                textDecoration: "none",
                padding: "12px 0",
                fontWeight: 600,
              }}
              onClick={() => setShowMenu(false)}
            >
              <BarChart3 size={20} />
              Report
            </Link>
            
            <Link 
              href="/patients" 
              style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 12,
                color: THEME.text,
                textDecoration: "none",
                padding: "12px 0",
              }}
              onClick={() => setShowMenu(false)}
            >
              <Users size={20} />
              Pazienti
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

// --- BARRA INFERIORE MOBILE (TAB BAR) ---
function MobileTabBar() {
  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      background: THEME.panelBg,
      borderTop: `1px solid ${THEME.border}`,
      display: "flex",
      justifyContent: "space-around",
      padding: "12px 0",
      zIndex: 50,
    }}>
      <Link href="/" style={{ textDecoration: "none", color: THEME.textMuted, textAlign: "center" }}>
        <div style={{ fontSize: 24 }}>🏠</div>
        <div style={{ fontSize: 10 }}>Home</div>
      </Link>
      
      <Link href="/calendar" style={{ textDecoration: "none", color: THEME.textMuted, textAlign: "center" }}>
        <div style={{ fontSize: 24 }}>📅</div>
        <div style={{ fontSize: 10 }}>Calendario</div>
      </Link>
      
      <div style={{ textDecoration: "none", color: THEME.primary, textAlign: "center" }}>
        <div style={{ fontSize: 24 }}>📊</div>
        <div style={{ fontSize: 10, fontWeight: 600 }}>Report</div>
      </div>
      
      <Link href="/patients" style={{ textDecoration: "none", color: THEME.textMuted, textAlign: "center" }}>
        <div style={{ fontSize: 24 }}>👥</div>
        <div style={{ fontSize: 10 }}>Pazienti</div>
      </Link>
    </div>
  );
}

function ddmmyyyy(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatDateTimeIT(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(s: Status) {
  const labels = { booked: "Prenotata", confirmed: "Confermata", done: "Eseguita" } as const;
  return labels[s];
}

function statusColor(s: Status) {
  const colors = {
    done: THEME.success,
    confirmed: THEME.primary,
    booked: THEME.warning,
  } as const;
  return colors[s];
}

function docTypeLabel(t: DocType) {
  const labels = {
    gdpr_informativa_privacy: "GDPR Privacy",
    consenso_trattamento: "Consenso trattamento",
    altro: "Altro",
  } as const;
  return labels[t];
}

export default function PatientDetailClient({ patientId }: { patientId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "clinical" | "docs" | "therapies">("info");
  const [showMenu, setShowMenu] = useState(false);

  // Anagrafica
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredPlan, setPreferredPlan] = useState<Plan>("invoice");

  // Clinica
  const [anamnesis, setAnamnesis] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [treatment, setTreatment] = useState("");

  // Documenti
  const [docs, setDocs] = useState<PatientDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState<DocType>("gdpr_informativa_privacy");
  const [file, setFile] = useState<File | null>(null);

  // Terapie
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);

  const inputStyle = {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: `1px solid ${THEME.border}`,
    background: "#ffffff",
    color: THEME.text,
    fontSize: 14,
    outline: "none" as const,
  };

  const buttonStyle = {
    primary: {
      padding: "12px 16px",
      borderRadius: 10,
      border: "none",
      background: THEME.primary,
      color: "#ffffff",
      fontWeight: 600,
      fontSize: 14,
      cursor: "pointer" as const,
      width: "100%",
    },
    secondary: {
      padding: "12px 16px",
      borderRadius: 10,
      border: `1px solid ${THEME.border}`,
      background: "#ffffff",
      color: THEME.text,
      fontWeight: 600,
      fontSize: 14,
      cursor: "pointer" as const,
      width: "100%",
    },
    danger: {
      padding: "12px 16px",
      borderRadius: 10,
      border: "none",
      background: THEME.danger,
      color: "#ffffff",
      fontWeight: 600,
      fontSize: 14,
      cursor: "pointer" as const,
      width: "100%",
    },
  };

  async function loadPatient() {
    setLoading(true);
    const res = await supabase
      .from("patients")
      .select("id, first_name, last_name, phone, birth_date, preferred_plan, anamnesis, diagnosis, treatment")
      .eq("id", patientId)
      .single();

    if (res.error) {
      setError(res.error.message);
      setPatient(null);
    } else {
      const p = res.data as Patient;
      setPatient(p);
      setFirstName(p.first_name ?? "");
      setLastName(p.last_name ?? "");
      setPhone(p.phone ?? "");
      setPreferredPlan((p.preferred_plan ?? "invoice") as Plan);
      setAnamnesis(p.anamnesis ?? "");
      setDiagnosis(p.diagnosis ?? "");
      setTreatment(p.treatment ?? "");
    }
    setLoading(false);
  }

  async function loadDocs() {
    const res = await supabase
      .from("patient_documents")
      .select("*")
      .eq("patient_id", patientId)
      .order("uploaded_at", { ascending: false });

    if (res.error) setError(res.error.message);
    else setDocs((res.data ?? []) as PatientDoc[]);
  }

  async function loadAppointments() {
    const res = await supabase
      .from("appointments")
      .select("id, start_at, status, is_paid")
      .eq("patient_id", patientId)
      .order("start_at", { ascending: false });

    if (res.error) setError(res.error.message);
    else setAppointments((res.data ?? []) as AppointmentRow[]);
  }

  useEffect(() => {
    if (!patientId) return;
    loadPatient();
    loadDocs();
    loadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  async function savePatient() {
    if (!patient) return;

    if (!firstName.trim() || !lastName.trim()) {
      setError("Nome e cognome sono obbligatori");
      return;
    }

    setSaving(true);
    setError("");

    const res = await supabase
      .from("patients")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || null,
        preferred_plan: preferredPlan,
        anamnesis: anamnesis.trim() || null,
        diagnosis: diagnosis.trim() || null,
        treatment: treatment.trim() || null,
      })
      .eq("id", patientId);

    setSaving(false);

    if (res.error) setError(res.error.message);
    else {
      await loadPatient();
      setEditMode(false);
    }
  }

  async function uploadDocument() {
    if (!file) {
      setError("Seleziona un file");
      return;
    }

    setUploading(true);
    setError("");

    const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
    const path = `${patientId}/${Date.now()}_${safeName}`;

    const uploadRes = await supabase.storage.from("patient_docs").upload(path, file, { upsert: false });

    if (uploadRes.error) {
      setError(`Upload fallito: ${uploadRes.error.message}`);
      setUploading(false);
      return;
    }

    const insertRes = await supabase.from("patient_documents").insert({
      patient_id: patientId,
      doc_type: docType,
      file_name: file.name,
      storage_path: path,
    });

    if (insertRes.error) setError(`Errore DB: ${insertRes.error.message}`);
    else {
      setFile(null);
      await loadDocs();
    }

    setUploading(false);
  }

  async function openDocument(doc: PatientDoc) {
    const res = await supabase.storage.from("patient_docs").createSignedUrl(doc.storage_path, 60);
    if (res.data?.signedUrl) window.open(res.data.signedUrl, "_blank");
    else setError("Impossibile aprire il documento");
  }

  async function deleteDocument(doc: PatientDoc) {
    if (!window.confirm("Eliminare questo documento?")) return;
    await supabase.from("patient_documents").delete().eq("id", doc.id);
    await supabase.storage.from("patient_docs").remove([doc.storage_path]);
    await loadDocs();
  }

  async function updateAppointmentStatus(apptId: string, status: Status) {
    const payload: any = { status };
    if (status !== "done") payload.is_paid = false;
    await supabase.from("appointments").update(payload).eq("id", apptId);
    await loadAppointments();
  }

  async function togglePaid(apptId: string, isPaid: boolean) {
    await supabase.from("appointments").update({ is_paid: isPaid }).eq("id", apptId);
    await loadAppointments();
  }

  async function deletePatient() {
    if (!patient || !window.confirm(`Eliminare ${patient.first_name} ${patient.last_name}?`)) return;
    await supabase.from("patients").delete().eq("id", patientId);
    window.location.href = "/patients";
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: THEME.appBg,
          padding: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ color: THEME.textMuted, fontWeight: 600 }}>Caricamento...</div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div style={{ minHeight: "100vh", background: THEME.appBg, padding: 16 }}>
        <div style={{ color: THEME.danger, fontWeight: 600, marginBottom: 16 }}>Paziente non trovato</div>
        <Link href="/patients" style={{ color: THEME.primary, fontWeight: 600 }}>
          ← Torna ai pazienti
        </Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: THEME.appBg, paddingBottom: 80 }}>
      {/* Header */}
      <div
        style={{
          background: THEME.panelBg,
          padding: 16,
          borderBottom: `1px solid ${THEME.border}`,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MobileMenu showMenu={showMenu} setShowMenu={setShowMenu} />
            <Link href="/patients" style={{ color: THEME.primary, fontWeight: 600, textDecoration: "none" }}>
              ←
            </Link>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: THEME.textMuted }}>Paziente</div>
          <button
            onClick={editMode ? savePatient : () => setEditMode(true)}
            disabled={saving}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: editMode ? THEME.success : THEME.primary,
              color: "#ffffff",
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {saving ? "Salva..." : editMode ? "Salva" : "Modifica"}
          </button>
        </div>

        <div style={{ fontSize: 20, fontWeight: 700, color: THEME.text }}>
          {patient.first_name} {patient.last_name}
        </div>
        <div style={{ fontSize: 14, color: THEME.textSoft, marginTop: 4 }}>{patient.phone || "Nessun telefono"}</div>
      </div>

      {/* Error Message */}
      {error && (
        <div
          style={{
            margin: 16,
            padding: 12,
            background: "rgba(249,115,22,0.1)",
            border: `1px solid rgba(249,115,22,0.3)`,
            borderRadius: 10,
            color: THEME.warning,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          overflowX: "auto",
          background: THEME.panelBg,
          borderBottom: `1px solid ${THEME.border}`,
          padding: "0 16px",
        }}
      >
        {[
          { id: "info", label: "Info" },
          { id: "clinical", label: "Clinica" },
          { id: "therapies", label: "Sedute" },
          { id: "docs", label: "Documenti" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: "12px 16px",
              background: "none",
              border: "none",
              borderBottom: `2px solid ${activeTab === tab.id ? THEME.primary : "transparent"}`,
              color: activeTab === tab.id ? THEME.primary : THEME.textMuted,
              fontWeight: 600,
              fontSize: 14,
              whiteSpace: "nowrap",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 16 }}>
        {activeTab === "info" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: THEME.panelBg, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: THEME.text, marginBottom: 16 }}>Informazioni</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 4 }}>Nome</div>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={!editMode} style={inputStyle} />
                </div>

                <div>
                  <div style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 4 }}>Cognome</div>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={!editMode} style={inputStyle} />
                </div>

                <div>
                  <div style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 4 }}>Telefono</div>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={!editMode}
                    style={inputStyle}
                    placeholder="+39 123 456 7890"
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 4 }}>Data di nascita</div>
                  <div style={{ fontSize: 14, color: THEME.text, padding: 12 }}>{ddmmyyyy(patient.birth_date)}</div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 4 }}>Tipo fatturazione</div>
                  <select value={preferredPlan} onChange={(e) => setPreferredPlan(e.target.value as Plan)} disabled={!editMode} style={inputStyle}>
                    <option value="invoice">Fattura</option>
                    <option value="no_invoice">Non fattura</option>
                  </select>
                </div>
              </div>
            </div>

            <button onClick={deletePatient} style={buttonStyle.danger}>
              Elimina paziente
            </button>
          </div>
        )}

        {activeTab === "clinical" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: THEME.panelBg, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: THEME.text, marginBottom: 16 }}>Dati clinici</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 4 }}>Anamnesi</div>
                  <textarea
                    value={anamnesis}
                    onChange={(e) => setAnamnesis(e.target.value)}
                    rows={4}
                    style={{ ...inputStyle, resize: "vertical" }}
                    placeholder="Inserisci anamnesi..."
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 4 }}>Diagnosi</div>
                  <textarea
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    rows={4}
                    style={{ ...inputStyle, resize: "vertical" }}
                    placeholder="Inserisci diagnosi..."
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 4 }}>Trattamento</div>
                  <textarea
                    value={treatment}
                    onChange={(e) => setTreatment(e.target.value)}
                    rows={4}
                    style={{ ...inputStyle, resize: "vertical" }}
                    placeholder="Inserisci trattamento..."
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "therapies" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: THEME.panelBg, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: THEME.text, marginBottom: 16 }}>
                Sedute ({appointments.length})
              </div>

              {appointments.length === 0 ? (
                <div style={{ color: THEME.textMuted, fontSize: 14, textAlign: "center", padding: 20 }}>Nessuna seduta trovata</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {appointments.map((appt) => (
                    <div
                      key={appt.id}
                      style={{
                        padding: 12,
                        border: `1px solid ${THEME.border}`,
                        borderRadius: 10,
                        background: THEME.appBg,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: THEME.text }}>{formatDateTimeIT(appt.start_at)}</div>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            background: `${statusColor(appt.status)}20`,
                            color: statusColor(appt.status),
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {statusLabel(appt.status)}
                        </span>
                      </div>

                      <div style={{ marginBottom: 8 }}>
                        <select
                          value={appt.status}
                          onChange={(e) => updateAppointmentStatus(appt.id, e.target.value as Status)}
                          style={{ ...inputStyle, padding: 8, fontSize: 13 }}
                        >
                          <option value="booked">Prenotata</option>
                          <option value="confirmed">Confermata</option>
                          <option value="done">Eseguita</option>
                        </select>
                      </div>

                      {appt.status === "done" && (
                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={appt.is_paid}
                            onChange={(e) => togglePaid(appt.id, e.target.checked)}
                            style={{ width: 18, height: 18 }}
                          />
                          <span style={{ fontSize: 13, color: THEME.text }}>{appt.is_paid ? "Pagata" : "Da pagare"}</span>
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "docs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: THEME.panelBg, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: THEME.text, marginBottom: 16 }}>Carica documento</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <select value={docType} onChange={(e) => setDocType(e.target.value as DocType)} style={inputStyle}>
                  <option value="gdpr_informativa_privacy">GDPR Privacy</option>
                  <option value="consenso_trattamento">Consenso trattamento</option>
                  <option value="altro">Altro</option>
                </select>

                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  style={inputStyle}
                />

                <button
                  onClick={uploadDocument}
                  disabled={uploading || !file}
                  style={{ ...buttonStyle.primary, opacity: uploading || !file ? 0.5 : 1 }}
                >
                  {uploading ? "Caricamento..." : "Carica documento"}
                </button>
              </div>
            </div>

            <div style={{ background: THEME.panelBg, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: THEME.text, marginBottom: 16 }}>Documenti ({docs.length})</div>

              {docs.length === 0 ? (
                <div style={{ color: THEME.textMuted, fontSize: 14, textAlign: "center", padding: 20 }}>Nessun documento caricato</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {docs.map((doc) => (
                    <div
                      key={doc.id}
                      style={{
                        padding: 12,
                        border: `1px solid ${THEME.border}`,
                        borderRadius: 10,
                        background: THEME.appBg,
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600, color: THEME.text, marginBottom: 4 }}>{docTypeLabel(doc.doc_type)}</div>
                      <div style={{ fontSize: 12, color: THEME.textSoft, marginBottom: 8 }}>{doc.file_name}</div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          onClick={() => openDocument(doc)}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 8,
                            border: `1px solid ${THEME.border}`,
                            background: "#ffffff",
                            color: THEME.primary,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            flex: 1,
                          }}
                        >
                          Apri
                        </button>
                        <button
                          onClick={() => deleteDocument(doc)}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 8,
                            border: `1px solid ${THEME.danger}`,
                            background: THEME.danger,
                            color: "#ffffff",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            flex: 1,
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
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <MobileTabBar />
    </div>
  );
}