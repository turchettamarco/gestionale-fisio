"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../src/lib/supabaseClient";

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

type PreferredPlan = "invoice" | "no_invoice";

type PatientInsert = {
  owner_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  birth_place: string | null;
  gender: string | null;
  tax_code: string | null;
  residence_address: string | null;
  residence_city: string | null;
  residence_province: string | null;
  residence_cap: string | null;
  preferred_plan: PreferredPlan | null;
  status: string | null;
};

function normalizePhone(v: string) {
  return v.replace(/[^\d+]/g, "");
}

function normalizeCap(v: string) {
  return v.replace(/\D/g, "").slice(0, 5);
}

export default function NewPatientPage() {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // ===== ANAGRAFICA =====
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [gender, setGender] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [resAddress, setResAddress] = useState("");
  const [resCity, setResCity] = useState("");
  const [resProv, setResProv] = useState("");
  const [resCap, setResCap] = useState("");
  const [preferredPlan, setPreferredPlan] = useState<PreferredPlan>("invoice");

  const pageStyle = useMemo<React.CSSProperties>(
    () => ({
      minHeight: "100vh",
      background: THEME.appBg,
      color: THEME.text,
      padding: "18px 14px 28px",
    }),
    []
  );

  const wrapStyle = useMemo<React.CSSProperties>(
    () => ({
      maxWidth: 980,
      margin: "0 auto",
    }),
    []
  );

  const headerStyle = useMemo<React.CSSProperties>(
    () => ({
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 14,
      flexWrap: "wrap",
    }),
    []
  );

  const titleStyle = useMemo<React.CSSProperties>(
    () => ({
      fontSize: 20,
      fontWeight: 1000,
      letterSpacing: -0.2,
      margin: 0,
    }),
    []
  );

  const subStyle = useMemo<React.CSSProperties>(
    () => ({
      marginTop: 4,
      fontSize: 12,
      color: THEME.textMuted,
    }),
    []
  );

  const cardStyle = useMemo<React.CSSProperties>(
    () => ({
      background: THEME.panelBg,
      borderRadius: 18,
      padding: 16,
      border: `1px solid ${THEME.borderSoft}`,
      boxShadow: "0 14px 45px rgba(2,6,23,0.08)",
    }),
    []
  );

  const sectionTitleStyle = useMemo<React.CSSProperties>(
    () => ({
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 12,
      flexWrap: "wrap",
    }),
    []
  );

  const badgeStyle = useMemo<React.CSSProperties>(
    () => ({
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      borderRadius: 999,
      border: `1px solid ${THEME.borderSoft}`,
      background: "#fff",
      fontSize: 12,
      color: THEME.textSoft,
      whiteSpace: "nowrap",
    }),
    []
  );

  const gridStyle = useMemo<React.CSSProperties>(
    () => ({
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12,
    }),
    []
  );

  const labelStyle = useMemo<React.CSSProperties>(
    () => ({
      fontSize: 12,
      color: THEME.textMuted,
      fontWeight: 800,
    }),
    []
  );

  const inputStyle = useMemo<React.CSSProperties>(
    () => ({
      width: "100%",
      marginTop: 6,
      padding: 10,
      borderRadius: 12,
      border: `1px solid ${THEME.borderSoft}`,
      background: "#fff",
      outline: "none",
      color: THEME.text,
      boxShadow: "inset 0 1px 0 rgba(2,6,23,0.04)",
    }),
    []
  );

  const selectStyle = useMemo<React.CSSProperties>(
    () => ({
      ...inputStyle,
      padding: "10px 10px",
    }),
    [inputStyle]
  );

  const btnBase = useMemo(
    () => ({
      padding: "10px 12px",
      borderRadius: 12,
      fontWeight: 1000,
      border: `1px solid ${THEME.borderSoft}`,
      background: "#fff",
      color: THEME.text,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
    }),
    []
  );

  const btnPrimary = useMemo(
    () => ({
      ...btnBase,
      background: THEME.primary,
      border: `1px solid ${THEME.primary}`,
      color: "#fff",
    }),
    [btnBase]
  );

  const btnSuccess = useMemo(
    () => ({
      ...btnBase,
      background: THEME.success,
      border: `1px solid ${THEME.success}`,
      color: "#fff",
    }),
    [btnBase]
  );

  const btnGhost = useMemo(
    () => ({
      ...btnBase,
      background: "transparent",
    }),
    [btnBase]
  );

  function exitToHome() {
    router.push("/");
  }

  function goToPatient() {
    if (!savedId) return;
    router.push(`/patients/${savedId}`);
  }

  async function onSave() {
    setError("");

    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn && !ln) {
      setError("Inserisci almeno Nome o Cognome.");
      return;
    }

    setSaving(true);
    try {
      // owner_id: se la tua tabella/RLS lo richiede, lo impostiamo con l'utente loggato
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const ownerId = authData?.user?.id;
      if (!ownerId) throw new Error("Utente non autenticato: impossibile impostare owner_id.");

      const payload: PatientInsert = {
        owner_id: ownerId,
        first_name: fn,
        last_name: ln,
        phone: phone.trim() ? normalizePhone(phone.trim()) : null,
        email: email.trim() ? email.trim() : null,
        birth_date: birthDate ? birthDate : null,
        birth_place: birthPlace.trim() ? birthPlace.trim() : null,
        gender: gender ? gender : null,
        tax_code: taxCode.trim() ? taxCode.trim().toUpperCase() : null,
        residence_address: resAddress.trim() ? resAddress.trim() : null,
        residence_city: resCity.trim() ? resCity.trim() : null,
        residence_province: resProv.trim() ? resProv.trim().toUpperCase() : null,
        residence_cap: resCap.trim() ? normalizeCap(resCap.trim()) : null,
        preferred_plan: preferredPlan ?? null,
        status: "active",
      };

      const { data, error: insErr } = await supabase
        .from("patients")
        .insert(payload)
        .select("id")
        .single();

      if (insErr) throw insErr;
      if (!data?.id) throw new Error("Salvataggio riuscito ma ID non ritornato.");

      setSavedId(data.id);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Errore durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={pageStyle}>
      <div style={wrapStyle}>
        <div style={headerStyle}>
          <div>
            <h1 style={titleStyle}>Nuovo paziente</h1>
            <div style={subStyle}>
              I campi sono allineati al tuo schema <b>patients</b>. Uscendo torni sempre in <b>Home</b>.
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={exitToHome} style={btnGhost}>
              🏠 Esci (Home)
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              style={{
                ...btnPrimary,
                opacity: saving ? 0.75 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Salvo..." : "💾 Salva"}
            </button>

            <button
              type="button"
              onClick={goToPatient}
              disabled={!savedId}
              style={{
                ...btnSuccess,
                opacity: savedId ? 1 : 0.55,
                cursor: savedId ? "pointer" : "not-allowed",
              }}
              title={!savedId ? "Salva prima il paziente" : "Apri la scheda paziente"}
            >
              👤 Scheda paziente
            </button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitleStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 1000, color: THEME.text }}>Anagrafica</div>

              {savedId ? (
                <span style={{ ...badgeStyle, borderColor: THEME.success }}>
                  ✅ Salvato •{" "}
                  <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas" }}>{savedId}</span>
                </span>
              ) : (
                <span style={{ ...badgeStyle, borderColor: THEME.warning }}>⚠️ Non salvato</span>
              )}
            </div>

            <Link href="/" style={{ textDecoration: "none", color: THEME.secondary, fontWeight: 900 }}>
              Torna in Home →
            </Link>
          </div>

          <div style={gridStyle}>
            <div>
              <div style={labelStyle}>Nome</div>
              <input style={inputStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>

            <div>
              <div style={labelStyle}>Cognome</div>
              <input style={inputStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>

            <div>
              <div style={labelStyle}>Telefono</div>
              <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39..." inputMode="tel" />
            </div>

            <div>
              <div style={labelStyle}>Email</div>
              <input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@dominio.it" inputMode="email" />
            </div>

            <div>
              <div style={labelStyle}>Data di nascita</div>
              <input style={inputStyle} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} type="date" />
            </div>

            <div>
              <div style={labelStyle}>Luogo di nascita</div>
              <input style={inputStyle} value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} placeholder="Es. Cassino" />
            </div>

            <div>
              <div style={labelStyle}>Sesso</div>
              <select style={selectStyle} value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">—</option>
                <option value="M">M</option>
                <option value="F">F</option>
                <option value="X">X</option>
              </select>
            </div>

            <div>
              <div style={labelStyle}>Codice fiscale</div>
              <input style={inputStyle} value={taxCode} onChange={(e) => setTaxCode(e.target.value)} placeholder="RSS..." />
            </div>

            <div>
              <div style={labelStyle}>Indirizzo residenza</div>
              <input style={inputStyle} value={resAddress} onChange={(e) => setResAddress(e.target.value)} placeholder="Via..." />
            </div>

            <div>
              <div style={labelStyle}>Città</div>
              <input style={inputStyle} value={resCity} onChange={(e) => setResCity(e.target.value)} />
            </div>

            <div>
              <div style={labelStyle}>Provincia</div>
              <input style={inputStyle} value={resProv} onChange={(e) => setResProv(e.target.value)} placeholder="FR" />
            </div>

            <div>
              <div style={labelStyle}>CAP</div>
              <input style={inputStyle} value={resCap} onChange={(e) => setResCap(e.target.value)} placeholder="00000" inputMode="numeric" />
            </div>

            <div>
              <div style={labelStyle}>Piano preferito</div>
              <select style={selectStyle} value={preferredPlan} onChange={(e) => setPreferredPlan(e.target.value as PreferredPlan)}>
                <option value="invoice">Con fattura</option>
                <option value="no_invoice">Senza fattura</option>
              </select>
            </div>
          </div>

          {error ? (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 14,
                background: "rgba(220,38,38,0.08)",
                border: "1px solid rgba(220,38,38,0.35)",
                color: THEME.danger,
                fontWeight: 900,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          ) : null}

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={exitToHome} style={btnGhost}>
              🏠 Esci (Home)
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              style={{
                ...btnPrimary,
                opacity: saving ? 0.75 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Salvo..." : "💾 Salva"}
            </button>

            <button
              type="button"
              onClick={goToPatient}
              disabled={!savedId}
              style={{
                ...btnSuccess,
                opacity: savedId ? 1 : 0.55,
                cursor: savedId ? "pointer" : "not-allowed",
              }}
            >
              👤 Scheda paziente
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: THEME.textMuted }}>
            Se al salvataggio vedi un errore RLS, è quasi sempre perché <b>owner_id</b> non è impostato o la policy non consente insert.
          </div>
        </div>
      </div>
    </div>
  );
}
