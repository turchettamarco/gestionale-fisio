"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { usePlanLimits } from "@/src/hooks/usePlanLimits";
import UpgradeBanner from "@/src/components/UpgradeBanner";

// --- TIPI ---
type Plan = "invoice" | "no_invoice";

type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  birth_date: string | null;
  tax_code: string | null;
  residence_city: string | null;
  preferred_plan: Plan | null;
  created_at?: string;
};

// --- TEMA ---
const THEME = {
  appBg: "#f1f5f9",
  panelBg: "#ffffff",
  panelSoft: "#f7f9fd",
  text: "#0f172a",
  textSoft: "#1e293b",
  muted: "#334155",
  border: "#cbd5e1",
  borderSoft: "#e2e8f0",
  blue: "#2563eb",
  blueDark: "#1e40af",
  green: "#16a34a",
  greenDark: "#15803d",
  amber: "#f97316",
  red: "#dc2626",
};


const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${THEME.borderSoft}`,
  outline: "none",
  fontSize: 15,
  background: "#fff",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 900,
  color: THEME.muted,
  marginBottom: 6,
  letterSpacing: 0.2,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: THEME.text,
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const pillStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  padding: "4px 10px",
  borderRadius: 999,
  background: "rgba(37,99,235,0.08)",
  color: THEME.blueDark,
  border: "1px solid rgba(37,99,235,0.18)",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 10,
  border: "none",
  background: THEME.blue,
  color: "#fff",
  fontWeight: 950,
  fontSize: 15,
  cursor: "pointer",
};

export default function NewPatientPage() {
  const router = useRouter();

  // Studio corrente (multi-tenancy)
  const { studio: currentStudio } = useCurrentStudio();
  const currentStudioId = currentStudio?.id ?? null;

  // Plan limits (Fase B — sistema piani)
  const planLimits = usePlanLimits();
  const patientCheck = planLimits.canCreatePatient();
  const isBlockedHard = !patientCheck.allowed;

  // Template welcome message
  const [welcomeTpl, setWelcomeTpl] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData?.user?.id;
      if (!ownerId) return;

      const { data } = await supabase
        .from("practice_settings")
        .select("welcome_message")
        .eq("owner_id", ownerId)
        .maybeSingle();
      setWelcomeTpl((data as any)?.welcome_message ?? null);
    })();
  }, []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [savedPhone, setSavedPhone] = useState("");
  const [savedName,  setSavedName]  = useState("");
  const [showWelcomeWA, setShowWelcomeWA] = useState(false);

  // Base
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [residenceCity, setResidenceCity] = useState("");

  // V2 (richiede migration SQL)
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

  const [showClinical, setShowClinical] = useState(true);
  const [showBusiness, setShowBusiness] = useState(true);

  useEffect(() => {
    // placeholder: se hai un check auth qui, puoi metterlo
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOkMsg("");

    // Blocco piano: hard limit raggiunto
    if (isBlockedHard) {
      setError(patientCheck.reason ?? "Hai raggiunto il limite di pazienti del tuo piano.");
      return;
    }

    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !birthDate.trim()) {
      setError("Compila almeno Nome, Cognome, Telefono e Data di nascita.");
      return;
    }

    setSaving(true);
    const { error: insErr } = await supabase.from("patients").insert({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim(),
      birth_date: birthDate.trim() || null,
      tax_code: taxCode.trim() || null,
      residence_city: residenceCity.trim() || null,

      // V2 (richiede migration SQL)
      patient_status: patientStatus,
      acquisition_channel: acquisitionChannel || null,
      first_visit_date: firstVisitDate.trim() || null,
      main_complaint: mainComplaint.trim() || null,
      body_region: bodyRegion || null,
      side: side || null,
      pathology_type: pathologyType || null,
      medical_diagnosis: medicalDiagnosis.trim() || null,
      expected_frequency: expectedFrequency.trim() ? Number(expectedFrequency) : null,
      package_size: packageSize.trim() ? Number(packageSize) : null,

      studio_id: currentStudioId,  // multi-tenancy
    });
    setSaving(false);

    if (insErr) {
      setError(insErr.message);
      return;
    }

    setOkMsg("Paziente creato ✅");
    setSavedPhone(phone.trim());
    setSavedName(firstName.trim() || lastName.trim());
    setShowWelcomeWA(!!phone.trim());

    // reset
    setFirstName("");
    setLastName("");
    setPhone("");
    setBirthDate("");
    setTaxCode("");
    setResidenceCity("");
    setPatientStatus("active");
    setAcquisitionChannel("");
    setFirstVisitDate("");
    setMainComplaint("");
    setBodyRegion("");
    setSide("");
    setPathologyType("");
    setMedicalDiagnosis("");
    setExpectedFrequency("");
    setPackageSize("");

    setTimeout(() => router.push("/patients"), 350);
  }

  return (
    <div style={{ background: THEME.appBg, minHeight: "100vh" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/patients" style={{ textDecoration: "none", color: THEME.blue, fontWeight: 900 }}>
              ← Pazienti
            </Link>
            <div style={{ fontSize: 26, fontWeight: 950, color: THEME.text }}>Nuovo paziente</div>
            <span style={pillStyle}>V2</span>
          </div>
        </div>

        <div style={{ background: THEME.panelBg, border: `1px solid ${THEME.borderSoft}`, borderRadius: 16, padding: 18 }}>
          {error ? (
            <div
              style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 12,
                background: "rgba(220,38,38,0.08)",
                border: "1px solid rgba(220,38,38,0.25)",
                color: THEME.red,
                fontWeight: 900,
              }}
            >
              {error}
            </div>
          ) : null}

          {okMsg ? (
            <div style={{ marginBottom: 12, padding: 16, borderRadius: 12, background: "rgba(22,163,74,0.10)", border: "1px solid rgba(22,163,74,0.25)" }}>
              <div style={{ color: THEME.greenDark, fontWeight: 900, fontSize: 15, marginBottom: showWelcomeWA ? 12 : 0 }}>{okMsg}</div>
              {showWelcomeWA && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => {
                    const nome = savedName || "Paziente";
                    const firma = [currentStudio?.signature_name, currentStudio?.signature_title].filter(Boolean).join("\n");

                    let msg: string;
                    if (welcomeTpl?.trim()) {
                      // Usa il template dalle Impostazioni
                      msg = welcomeTpl
                        .replace(/{nome}/g, nome)
                        .replace(/{firma}/g, firma);
                    } else {
                      // Fallback: messaggio di default
                      const nomeOpEntry = currentStudio?.signature_name || "nostro studio";
                      const firmaLine = firma ? `\n\n${firma}` : "";
                      msg = `Buongiorno ${nome},\n\nbenvenuto/a nello studio di ${nomeOpEntry}!\n\nSiamo lieti di averla come nuovo paziente. A presto!${firmaLine}`;
                    }

                    const p = savedPhone.replace(/[\s\(\)\-\.]/g,"").replace(/^\+/,"");
                    const n = p.startsWith("00")?p.slice(2):p.startsWith("0")?"39"+p:!p.startsWith("39")&&p.length<=10?"39"+p:p;
                    const isMobile = /iPhone|iPad|iPod|Android/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "");
                    const url = isMobile
                      ? `https://wa.me/${n}?text=${encodeURIComponent(msg)}`
                      : `https://web.whatsapp.com/send?phone=${n}&text=${encodeURIComponent(msg)}`;
                    window.open(url, "_blank", "noopener,noreferrer");
                    setShowWelcomeWA(false);
                  }} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#25D366", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                    💬 Invia benvenuto WA
                  </button>
                  <button type="button" onClick={() => { setShowWelcomeWA(false); router.push("/patients"); }}
                    style={{ padding: "10px 18px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    Vai alla lista pazienti →
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {/* Banner di warning se stai per raggiungere o hai raggiunto il limite */}
          {(planLimits.checks.patients.status === "over" ||
            planLimits.checks.patients.status === "near") && (
            <div style={{ marginBottom: 16 }}>
              <UpgradeBanner />
            </div>
          )}

          <form onSubmit={onSubmit}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Nome *</label>
                <input style={inputStyle} placeholder="Nome" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Cognome *</label>
                <input style={inputStyle} placeholder="Cognome" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>

              <div>
                <label style={labelStyle}>Telefono *</label>
                <input style={inputStyle} placeholder="Es. 320..." value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>

              <div>
                <label style={labelStyle}>Data di nascita *</label>
                <input style={inputStyle} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              </div>

              <div>
                <label style={labelStyle}>Codice fiscale</label>
                <input style={inputStyle} placeholder="CF" value={taxCode} onChange={(e) => setTaxCode(e.target.value)} />
              </div>

              <div>
                <label style={labelStyle}>Città</label>
                <input style={inputStyle} placeholder="Città" value={residenceCity} onChange={(e) => setResidenceCity(e.target.value)} />
              </div>
            </div>

            {/* CLINICA */}
            <div style={{ marginTop: 16, borderTop: `1px solid ${THEME.borderSoft}`, paddingTop: 14 }}>
              <button
                type="button"
                onClick={() => setShowClinical((s) => !s)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  padding: "10px 0",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={sectionTitleStyle}>🧠 Dati clinici iniziali</div>
                <div style={{ fontWeight: 950, color: THEME.blue }}>{showClinical ? "–" : "+"}</div>
              </button>

              {showClinical ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Motivo principale</label>
                    <textarea
                      style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                      placeholder="Es. dolore lombare da 3 settimane..."
                      value={mainComplaint}
                      onChange={(e) => setMainComplaint(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Distretto</label>
                    <select style={inputStyle} value={bodyRegion} onChange={(e) => setBodyRegion(e.target.value)}>
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
                  </div>

                  <div>
                    <label style={labelStyle}>Lato</label>
                    <select style={inputStyle} value={side} onChange={(e) => setSide(e.target.value)}>
                      <option value="">Seleziona</option>
                      <option value="dx">DX</option>
                      <option value="sx">SX</option>
                      <option value="bilaterale">Bilaterale</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Tipo problema</label>
                    <select style={inputStyle} value={pathologyType} onChange={(e) => setPathologyType(e.target.value)}>
                      <option value="">Seleziona</option>
                      <option value="traumatico">Traumatico</option>
                      <option value="degenerativo">Degenerativo</option>
                      <option value="post_chirurgico">Post-chirurgico</option>
                      <option value="neurologico">Neurologico</option>
                      <option value="cronico">Cronico</option>
                      <option value="funzionale">Funzionale</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Diagnosi medica</label>
                    <input style={inputStyle} placeholder="Es. discopatia L4-L5" value={medicalDiagnosis} onChange={(e) => setMedicalDiagnosis(e.target.value)} />
                  </div>
                </div>
              ) : null}
            </div>

            {/* BUSINESS */}
            <div style={{ marginTop: 12, borderTop: `1px solid ${THEME.borderSoft}`, paddingTop: 14 }}>
              <button
                type="button"
                onClick={() => setShowBusiness((s) => !s)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  padding: "10px 0",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={sectionTitleStyle}>💼 Stato & dati economici</div>
                <div style={{ fontWeight: 950, color: THEME.blue }}>{showBusiness ? "–" : "+"}</div>
              </button>

              {showBusiness ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Stato paziente</label>
                    <select style={inputStyle} value={patientStatus} onChange={(e) => setPatientStatus(e.target.value)}>
                      <option value="active">Attivo</option>
                      <option value="lead">Lead</option>
                      <option value="paused">In pausa</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="discharged">Dimesso</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Canale acquisizione</label>
                    <select style={inputStyle} value={acquisitionChannel} onChange={(e) => setAcquisitionChannel(e.target.value)}>
                      <option value="">Seleziona</option>
                      <option value="passaparola">Passaparola</option>
                      <option value="medico">Medico</option>
                      <option value="instagram">Instagram</option>
                      <option value="google">Google</option>
                      <option value="evento">Evento</option>
                      <option value="altro">Altro</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Data primo contatto</label>
                    <input style={inputStyle} type="date" value={firstVisitDate} onChange={(e) => setFirstVisitDate(e.target.value)} />
                  </div>

                  <div>
                    <label style={labelStyle}>Frequenza prevista (sett.)</label>
                    <input style={inputStyle} placeholder="Es. 2" value={expectedFrequency} onChange={(e) => setExpectedFrequency(e.target.value)} />
                  </div>

                  <div>
                    <label style={labelStyle}>Pacchetto sedute</label>
                    <input style={inputStyle} placeholder="Es. 10" value={packageSize} onChange={(e) => setPackageSize(e.target.value)} />
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
              <button
                type="submit"
                disabled={saving || isBlockedHard}
                style={{
                  ...buttonStyle,
                  opacity: saving || isBlockedHard ? 0.5 : 1,
                  cursor: saving || isBlockedHard ? "not-allowed" : "pointer",
                  background: isBlockedHard ? "#94a3b8" : buttonStyle.background,
                }}
                title={isBlockedHard ? patientCheck.reason : undefined}
              >
                {saving ? "Salvataggio..." : isBlockedHard ? "🔒 LIMITE RAGGIUNTO" : "REGISTRA"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/patients")}
                style={{
                  width: 160,
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: "#fff",
                  color: THEME.text,
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                Annulla
              </button>
            </div>
          </form>

          <div style={{ marginTop: 10, fontSize: 12, color: THEME.muted }}>
            Nota: i campi V2 richiedono migration SQL (enum + colonne). Se non l'hai fatta, la creazione fallirà.
          </div>
        </div>
      </div>
    </div>
  );
}
