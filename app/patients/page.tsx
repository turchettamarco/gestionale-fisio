"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabaseClient";

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

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  // Stati Form e UI
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);

  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [showFullList, setShowFullList] = useState(false); // Chiusa di default
  const [showIncompleteList, setShowIncompleteList] = useState(true); // Aperta di default
  const [searchTerm, setSearchTerm] = useState("");

  async function loadPatients() {
    setLoading(true);
    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .order("last_name", { ascending: true });
    if (error) setError(error.message);
    else setPatients((data ?? []) as Patient[]);
    setLoading(false);
  }

  useEffect(() => {
    loadPatients();
  }, []);

  // Lista Filtrata (Ricerca)
  const filteredPatients = useMemo(() => {
    if (!searchTerm.trim()) return patients;
    const term = searchTerm.toLowerCase().trim();
    return patients.filter(p => `${p.first_name} ${p.last_name}`.toLowerCase().includes(term));
  }, [patients, searchTerm]);

  // LOGICA: PAZIENTI DA COMPLETARE (Ordinati con "Manca Telefono" in alto)
  const patientsToComplete = useMemo(() => {
    // 1. Filtriamo chi ha almeno un dato mancante
    const incomplete = patients.filter(p => !p.tax_code || !p.phone || !p.birth_date);
    
    // 2. Ordiniamo: chi NON ha il telefono va per primo
    return [...incomplete].sort((a, b) => {
      const aMissingPhone = !a.phone ? 1 : 0;
      const bMissingPhone = !b.phone ? 1 : 0;
      return bMissingPhone - aMissingPhone; // Se b non ha telefono e a sì, b sale
    });
  }, [patients]);

  async function createPatient(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("patients").insert({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
    });
    setSaving(false);
    if (!error) {
      setFirstName(""); setLastName("");
      setShowNewPatientForm(false);
      await loadPatients();
    }
  }

  // --- STILI ---
  const tableHeaderStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "12px 16px",
    fontSize: 12,
    color: THEME.muted,
    fontWeight: 1000,
    borderBottom: `1px solid ${THEME.borderSoft}`,
    background: "rgba(241,245,249,0.85)",
    textTransform: "uppercase",
  };

  const cardStyle = {
    background: THEME.panelBg,
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
    border: `1px solid ${THEME.border}`,
    marginBottom: 24,
  };

  const patientLinkStyle = {
    textDecoration: "none",
    color: THEME.text,
    fontWeight: 1000,
    cursor: "pointer",
    display: "block"
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: THEME.appBg, color: THEME.text }}>
      {/* SIDEBAR */}
      <aside style={{ width: 260, background: THEME.panelBg, borderRight: `1px solid ${THEME.border}`, padding: 20, flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 1000, color: THEME.blueDark, marginBottom: 30 }}>FisioHub</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Link href="/" style={{ color: THEME.textSoft, fontWeight: 800, textDecoration: "none" }}>🏠 Home</Link>
          <Link href="/calendar" style={{ color: THEME.textSoft, fontWeight: 800, textDecoration: "none" }}>📅 Calendario</Link>
          <Link href="/patients" style={{ color: THEME.blue, fontWeight: 1000, textDecoration: "none" }}>👤 Pazienti</Link>
        </nav>
      </aside>

      <main style={{ flex: 1, padding: "32px 40px", overflowY: "auto" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          
          <header style={{ marginBottom: 32 }}>
            <h1 style={{ margin: 0, fontWeight: 1000, fontSize: 32, letterSpacing: "-0.02em" }}>Anagrafica Pazienti</h1>
          </header>

          {/* 1. NUOVO PAZIENTE */}
          <section style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setShowNewPatientForm(!showNewPatientForm)}>
              <h2 style={{ margin: 0, fontWeight: 1000, fontSize: 18, color: THEME.blueDark }}>➕ Aggiungi Nuovo Paziente</h2>
              <span>{showNewPatientForm ? "−" : "+"}</span>
            </div>
            {showNewPatientForm && (
              <form onSubmit={createPatient} style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <input placeholder="Nome" value={firstName} onChange={e => setFirstName(e.target.value)} style={{ padding: "12px", borderRadius: 10, border: `1px solid ${THEME.border}`, fontWeight: 800 }} required />
                <input placeholder="Cognome" value={lastName} onChange={e => setLastName(e.target.value)} style={{ padding: "12px", borderRadius: 10, border: `1px solid ${THEME.border}`, fontWeight: 800 }} required />
                <button type="submit" style={{ gridColumn: "1 / span 2", padding: "14px", borderRadius: 10, background: THEME.blue, color: "#fff", fontWeight: 1000, border: "none", cursor: "pointer" }}>REGISTRA</button>
              </form>
            )}
          </section>

          {/* 2. LISTA COMPLETA (Bordo Verde) */}
          <section style={{ ...cardStyle, borderLeft: `6px solid ${THEME.green}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setShowFullList(!showFullList)}>
              <h2 style={{ margin: 0, fontWeight: 1000, fontSize: 18, color: THEME.greenDark }}>📋 Lista Pazienti Completa</h2>
              <span>{showFullList ? "−" : "+"}</span>
            </div>
            {showFullList && (
              <div style={{ marginTop: 20 }}>
                <input placeholder="Filtra pazienti..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: 10, border: `1px solid ${THEME.border}`, marginBottom: 20, fontWeight: 800 }} />
                <div style={{ overflow: "hidden", borderRadius: 12, border: `1px solid ${THEME.borderSoft}` }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={tableHeaderStyle}>Paziente</th>
                        <th style={tableHeaderStyle}>Telefono</th>
                        <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Scheda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPatients.map((p, idx) => (
                        <tr key={p.id} style={{ background: idx % 2 === 0 ? "#fff" : THEME.panelSoft, borderBottom: `1px solid ${THEME.borderSoft}` }}>
                          <td style={{ padding: "16px" }}>
                            <Link href={`/patients/${p.id}`} style={patientLinkStyle}>
                              <span style={{ transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = THEME.blue} onMouseOut={(e) => e.currentTarget.style.color = THEME.text}>
                                {p.last_name} {p.first_name}
                              </span>
                            </Link>
                          </td>
                          <td style={{ padding: "16px", fontWeight: 800 }}>{p.phone || "—"}</td>
                          <td style={{ padding: "16px", textAlign: "right" }}>
                            <Link href={`/patients/${p.id}`} style={{ color: THEME.blue, fontWeight: 1000, textDecoration: "none" }}>Dettagli →</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* 3. PAZIENTI DA COMPLETARE (Bordo Arancione - Telefono in alto) */}
          <section style={{ ...cardStyle, borderLeft: `6px solid ${THEME.amber}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setShowIncompleteList(!showIncompleteList)}>
              <div>
                <h2 style={{ margin: 0, fontWeight: 1000, fontSize: 18, color: THEME.amber }}>⚠️ Pazienti da Completare</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: THEME.muted, fontWeight: 700 }}>Priorità: {patientsToComplete.filter(p => !p.phone).length} mancano di telefono</p>
              </div>
              <span>{showIncompleteList ? "−" : "+"}</span>
            </div>
            {showIncompleteList && (
              <div style={{ marginTop: 24, overflow: "hidden", borderRadius: 12, border: `1px solid ${THEME.borderSoft}` }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={tableHeaderStyle}>Paziente</th>
                      <th style={tableHeaderStyle}>Mancanze</th>
                      <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Azione</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientsToComplete.length === 0 ? (
                      <tr><td colSpan={3} style={{ padding: 24, textAlign: "center", color: THEME.green, fontWeight: 800 }}>Nessuna scheda da completare ✅</td></tr>
                    ) : (
                      patientsToComplete.map((p, idx) => (
                        <tr key={p.id} style={{ 
                          background: idx % 2 === 0 ? "#fff" : "rgba(249,115,22,0.02)", 
                          borderBottom: `1px solid ${THEME.borderSoft}`,
                          borderLeft: !p.phone ? `4px solid ${THEME.red}` : "none" // Evidenzia ulteriormente chi non ha telefono
                        }}>
                          <td style={{ padding: "16px" }}>
                            <Link href={`/patients/${p.id}`} style={patientLinkStyle}>
                              <span style={{ transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = THEME.amber} onMouseOut={(e) => e.currentTarget.style.color = THEME.text}>
                                {p.last_name} {p.first_name}
                              </span>
                            </Link>
                          </td>
                          <td style={{ padding: "16px" }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              {!p.phone && <span style={{ fontSize: 10, background: "rgba(220,38,38,0.15)", color: THEME.red, padding: "4px 8px", borderRadius: 6, fontWeight: 1000 }}>⚠️ MANCA TELEFONO</span>}
                              {!p.tax_code && <span style={{ fontSize: 10, background: "rgba(51,65,85,0.1)", color: THEME.muted, padding: "4px 8px", borderRadius: 6, fontWeight: 1000 }}>NO CF</span>}
                              {!p.birth_date && <span style={{ fontSize: 10, background: "rgba(37,99,235,0.1)", color: THEME.blue, padding: "4px 8px", borderRadius: 6, fontWeight: 1000 }}>NO NASCITA</span>}
                            </div>
                          </td>
                          <td style={{ padding: "16px", textAlign: "right" }}>
                            <Link href={`/patients/${p.id}`} style={{ color: THEME.blue, fontWeight: 1000, textDecoration: "none", fontSize: 13, border: `1px solid ${THEME.blue}`, padding: "6px 12px", borderRadius: 8 }}>COMPLETA</Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>
      </main>
    </div>
  );
}