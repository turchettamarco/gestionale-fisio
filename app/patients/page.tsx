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

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);

  return isMobile;
}

export default function PatientsPage() {
  const isMobile = useIsMobile(768);

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

  // Mobile drawer
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  async function loadPatients() {
    setLoading(true);
    setError("");
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
    return patients.filter((p) =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(term)
    );
  }, [patients, searchTerm]);

  // LOGICA: PAZIENTI DA COMPLETARE (Ordinati con "Manca Telefono" in alto)
  const patientsToComplete = useMemo(() => {
    const incomplete = patients.filter((p) => !p.tax_code || !p.phone || !p.birth_date);

    return [...incomplete].sort((a, b) => {
      const aMissingPhone = !a.phone ? 1 : 0;
      const bMissingPhone = !b.phone ? 1 : 0;
      return bMissingPhone - aMissingPhone;
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
      setFirstName("");
      setLastName("");
      setShowNewPatientForm(false);
      await loadPatients();
    } else {
      setError(error.message);
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

  const cardStyle: React.CSSProperties = {
    background: THEME.panelBg,
    borderRadius: 16,
    padding: isMobile ? 16 : 24,
    boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
    border: `1px solid ${THEME.border}`,
    marginBottom: 16,
  };

  const patientLinkStyle: React.CSSProperties = {
    textDecoration: "none",
    color: THEME.text,
    fontWeight: 1000,
    cursor: "pointer",
    display: "block",
  };

  const chipStyle = (bg: string, color: string): React.CSSProperties => ({
    fontSize: 11,
    background: bg,
    color,
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 1000,
    display: "inline-block",
    lineHeight: 1,
  });

  const subtleButton: React.CSSProperties = {
    border: `1px solid ${THEME.border}`,
    background: THEME.panelBg,
    color: THEME.textSoft,
    fontWeight: 900,
    borderRadius: 12,
    padding: "10px 12px",
    cursor: "pointer",
  };

  const primaryButton: React.CSSProperties = {
    border: "none",
    background: THEME.blue,
    color: "#fff",
    fontWeight: 1000,
    borderRadius: 12,
    padding: "12px 14px",
    cursor: "pointer",
  };

  function MobileDrawer() {
    if (!isMobile) return null;

    return (
      <>
        {/* Overlay */}
        {mobileNavOpen && (
          <div
            onClick={() => setMobileNavOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.35)",
              zIndex: 49,
            }}
          />
        )}

        {/* Drawer */}
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            height: "100vh",
            width: "78vw",
            maxWidth: 320,
            background: THEME.panelBg,
            borderRight: `1px solid ${THEME.border}`,
            transform: mobileNavOpen ? "translateX(0)" : "translateX(-110%)",
            transition: "transform 220ms ease",
            zIndex: 50,
            padding: 16,
            boxShadow: "8px 0 30px rgba(0,0,0,0.10)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 18, fontWeight: 1000, color: THEME.blueDark }}>FisioHub</div>
            <button
              onClick={() => setMobileNavOpen(false)}
              style={{ ...subtleButton, padding: "8px 10px", borderRadius: 10 }}
              aria-label="Chiudi menu"
            >
              ✕
            </button>
          </div>

          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <Link
              href="/"
              onClick={() => setMobileNavOpen(false)}
              style={{ color: THEME.textSoft, fontWeight: 900, textDecoration: "none" }}
            >
              🏠 Home
            </Link>
            <Link
              href="/calendar"
              onClick={() => setMobileNavOpen(false)}
              style={{ color: THEME.textSoft, fontWeight: 900, textDecoration: "none" }}
            >
              📅 Calendario
            </Link>
            <Link
              href="/patients"
              onClick={() => setMobileNavOpen(false)}
              style={{ color: THEME.blue, fontWeight: 1000, textDecoration: "none" }}
            >
              👤 Pazienti
            </Link>
          </div>

          <div style={{ marginTop: 18, borderTop: `1px solid ${THEME.borderSoft}`, paddingTop: 14 }}>
            <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 800 }}>Tip</div>
            <div style={{ fontSize: 13, color: THEME.textSoft, fontWeight: 800, marginTop: 6 }}>
              Su mobile usi le schede (card), non le tabelle. È così che si lavora.
            </div>
          </div>
        </div>
      </>
    );
  }

  function MobileTopBar() {
    if (!isMobile) return null;

    return (
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: THEME.panelBg,
          borderBottom: `1px solid ${THEME.border}`,
          padding: "12px 12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={() => setMobileNavOpen(true)} style={subtleButton} aria-label="Apri menu">
            ☰
          </button>
          <div style={{ fontWeight: 1000, color: THEME.blueDark, fontSize: 16 }}>Pazienti</div>
          <button onClick={() => loadPatients()} style={subtleButton} aria-label="Aggiorna">
            ↻
          </button>
        </div>
      </div>
    );
  }

  function PatientCard({ p }: { p: Patient }) {
    return (
      <div
        style={{
          border: `1px solid ${THEME.borderSoft}`,
          background: "#fff",
          borderRadius: 14,
          padding: 14,
          marginBottom: 12,
          boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
        }}
      >
        <Link href={`/patients/${p.id}`} style={{ textDecoration: "none" }}>
          <div style={{ fontWeight: 1000, color: THEME.text, fontSize: 16 }}>
            {p.last_name} {p.first_name}
          </div>
        </Link>

        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ color: THEME.muted, fontWeight: 800, fontSize: 12 }}>Telefono</div>
            <div style={{ color: THEME.textSoft, fontWeight: 900, fontSize: 13 }}>
              {p.phone || "—"}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ color: THEME.muted, fontWeight: 800, fontSize: 12 }}>Scheda</div>
            <Link
              href={`/patients/${p.id}`}
              style={{ color: THEME.blue, fontWeight: 1000, textDecoration: "none", fontSize: 13 }}
            >
              Dettagli →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  function IncompleteCard({ p }: { p: Patient }) {
    const missingPhone = !p.phone;
    const missingCF = !p.tax_code;
    const missingBirth = !p.birth_date;

    return (
      <div
        style={{
          border: `1px solid ${THEME.borderSoft}`,
          background: "#fff",
          borderRadius: 14,
          padding: 14,
          marginBottom: 12,
          boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
          borderLeft: missingPhone ? `4px solid ${THEME.red}` : `4px solid ${THEME.amber}`,
        }}
      >
        <Link href={`/patients/${p.id}`} style={{ textDecoration: "none" }}>
          <div style={{ fontWeight: 1000, color: THEME.text, fontSize: 16 }}>
            {p.last_name} {p.first_name}
          </div>
        </Link>

        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {missingPhone && chipStyle("rgba(220,38,38,0.15)", THEME.red) && (
            <span style={chipStyle("rgba(220,38,38,0.15)", THEME.red)}>⚠️ MANCA TELEFONO</span>
          )}
          {missingCF && <span style={chipStyle("rgba(51,65,85,0.10)", THEME.muted)}>NO CF</span>}
          {missingBirth && (
            <span style={chipStyle("rgba(37,99,235,0.10)", THEME.blue)}>NO NASCITA</span>
          )}
        </div>

        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <Link
            href={`/patients/${p.id}`}
            style={{
              color: THEME.blue,
              fontWeight: 1000,
              textDecoration: "none",
              fontSize: 13,
              border: `1px solid ${THEME.blue}`,
              padding: "8px 12px",
              borderRadius: 12,
            }}
          >
            COMPLETA
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: THEME.appBg, color: THEME.text }}>
      <MobileDrawer />

      {/* SIDEBAR DESKTOP */}
      {!isMobile && (
        <aside
          style={{
            width: 260,
            background: THEME.panelBg,
            borderRight: `1px solid ${THEME.border}`,
            padding: 20,
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 1000, color: THEME.blueDark, marginBottom: 30 }}>
            FisioHub
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Link href="/" style={{ color: THEME.textSoft, fontWeight: 800, textDecoration: "none" }}>
              🏠 Home
            </Link>
            <Link
              href="/calendar"
              style={{ color: THEME.textSoft, fontWeight: 800, textDecoration: "none" }}
            >
              📅 Calendario
            </Link>
            <Link href="/patients" style={{ color: THEME.blue, fontWeight: 1000, textDecoration: "none" }}>
              👤 Pazienti
            </Link>
          </nav>
        </aside>
      )}

      <main
        style={{
          flex: 1,
          padding: isMobile ? 0 : "32px 40px",
          overflowY: "auto",
        }}
      >
        <MobileTopBar />

        <div style={{ padding: isMobile ? "14px" : 0 }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            {!isMobile && (
              <header style={{ marginBottom: 22 }}>
                <h1 style={{ margin: 0, fontWeight: 1000, fontSize: 32, letterSpacing: "-0.02em" }}>
                  Anagrafica Pazienti
                </h1>
              </header>
            )}

            {/* ERROR / LOADING */}
            {(loading || error) && (
              <section style={cardStyle}>
                {loading && <div style={{ fontWeight: 900, color: THEME.muted }}>Caricamento...</div>}
                {error && (
                  <div style={{ fontWeight: 900, color: THEME.red }}>
                    Errore: {error}
                  </div>
                )}
              </section>
            )}

            {/* 1. NUOVO PAZIENTE */}
            <section style={cardStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                }}
                onClick={() => setShowNewPatientForm(!showNewPatientForm)}
              >
                <h2 style={{ margin: 0, fontWeight: 1000, fontSize: 18, color: THEME.blueDark }}>
                  ➕ Aggiungi Nuovo Paziente
                </h2>
                <span style={{ fontWeight: 1000 }}>{showNewPatientForm ? "−" : "+"}</span>
              </div>

              {showNewPatientForm && (
                <form
                  onSubmit={createPatient}
                  style={{
                    marginTop: 16,
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <input
                    placeholder="Nome"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    style={{
                      padding: "12px",
                      borderRadius: 12,
                      border: `1px solid ${THEME.border}`,
                      fontWeight: 800,
                      outline: "none",
                    }}
                    required
                  />
                  <input
                    placeholder="Cognome"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    style={{
                      padding: "12px",
                      borderRadius: 12,
                      border: `1px solid ${THEME.border}`,
                      fontWeight: 800,
                      outline: "none",
                    }}
                    required
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      gridColumn: isMobile ? "auto" : "1 / span 2",
                      padding: "12px",
                      borderRadius: 12,
                      background: saving ? THEME.border : THEME.blue,
                      color: "#fff",
                      fontWeight: 1000,
                      border: "none",
                      cursor: saving ? "not-allowed" : "pointer",
                    }}
                  >
                    {saving ? "SALVATAGGIO..." : "REGISTRA"}
                  </button>
                </form>
              )}
            </section>

            {/* 2. LISTA COMPLETA */}
            <section style={{ ...cardStyle, borderLeft: `6px solid ${THEME.green}` }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  gap: 12,
                }}
                onClick={() => setShowFullList(!showFullList)}
              >
                <h2 style={{ margin: 0, fontWeight: 1000, fontSize: 18, color: THEME.greenDark }}>
                  📋 Lista Pazienti Completa
                </h2>
                <span style={{ fontWeight: 1000 }}>{showFullList ? "−" : "+"}</span>
              </div>

              {showFullList && (
                <div style={{ marginTop: 14 }}>
                  <input
                    placeholder="Filtra pazienti..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: 12,
                      border: `1px solid ${THEME.border}`,
                      marginBottom: 14,
                      fontWeight: 800,
                      outline: "none",
                    }}
                  />

                  {/* MOBILE: CARD */}
                  {isMobile ? (
                    <div>
                      {filteredPatients.length === 0 ? (
                        <div style={{ padding: 10, color: THEME.muted, fontWeight: 900 }}>
                          Nessun paziente trovato.
                        </div>
                      ) : (
                        filteredPatients.map((p) => <PatientCard key={p.id} p={p} />)
                      )}
                    </div>
                  ) : (
                    // DESKTOP: TABELLA
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
                            <tr
                              key={p.id}
                              style={{
                                background: idx % 2 === 0 ? "#fff" : THEME.panelSoft,
                                borderBottom: `1px solid ${THEME.borderSoft}`,
                              }}
                            >
                              <td style={{ padding: "16px" }}>
                                <Link href={`/patients/${p.id}`} style={patientLinkStyle}>
                                  {p.last_name} {p.first_name}
                                </Link>
                              </td>
                              <td style={{ padding: "16px", fontWeight: 800 }}>{p.phone || "—"}</td>
                              <td style={{ padding: "16px", textAlign: "right" }}>
                                <Link
                                  href={`/patients/${p.id}`}
                                  style={{ color: THEME.blue, fontWeight: 1000, textDecoration: "none" }}
                                >
                                  Dettagli →
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* 3. PAZIENTI DA COMPLETARE */}
            <section style={{ ...cardStyle, borderLeft: `6px solid ${THEME.amber}` }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  gap: 12,
                }}
                onClick={() => setShowIncompleteList(!showIncompleteList)}
              >
                <div>
                  <h2 style={{ margin: 0, fontWeight: 1000, fontSize: 18, color: THEME.amber }}>
                    ⚠️ Pazienti da Completare
                  </h2>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: THEME.muted, fontWeight: 800 }}>
                    Priorità: {patientsToComplete.filter((p) => !p.phone).length} mancano num. di telefono
                  </p>
                </div>
                <span style={{ fontWeight: 1000 }}>{showIncompleteList ? "−" : "+"}</span>
              </div>

              {showIncompleteList && (
                <div style={{ marginTop: 14 }}>
                  {/* MOBILE: CARD */}
                  {isMobile ? (
                    <div>
                      {patientsToComplete.length === 0 ? (
                        <div style={{ padding: 10, color: THEME.green, fontWeight: 1000 }}>
                          Nessuna scheda da completare ✅
                        </div>
                      ) : (
                        patientsToComplete.map((p) => <IncompleteCard key={p.id} p={p} />)
                      )}
                    </div>
                  ) : (
                    // DESKTOP: TABELLA
                    <div style={{ overflow: "hidden", borderRadius: 12, border: `1px solid ${THEME.borderSoft}` }}>
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
                            <tr>
                              <td
                                colSpan={3}
                                style={{ padding: 24, textAlign: "center", color: THEME.green, fontWeight: 800 }}
                              >
                                Nessuna scheda da completare ✅
                              </td>
                            </tr>
                          ) : (
                            patientsToComplete.map((p, idx) => (
                              <tr
                                key={p.id}
                                style={{
                                  background: idx % 2 === 0 ? "#fff" : "rgba(249,115,22,0.02)",
                                  borderBottom: `1px solid ${THEME.borderSoft}`,
                                  borderLeft: !p.phone ? `4px solid ${THEME.red}` : "none",
                                }}
                              >
                                <td style={{ padding: "16px" }}>
                                  <Link href={`/patients/${p.id}`} style={patientLinkStyle}>
                                    {p.last_name} {p.first_name}
                                  </Link>
                                </td>
                                <td style={{ padding: "16px" }}>
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    {!p.phone && (
                                      <span
                                        style={{
                                          fontSize: 10,
                                          background: "rgba(220,38,38,0.15)",
                                          color: THEME.red,
                                          padding: "4px 8px",
                                          borderRadius: 6,
                                          fontWeight: 1000,
                                        }}
                                      >
                                        ⚠️ MANCA TELEFONO
                                      </span>
                                    )}
                                    {!p.tax_code && (
                                      <span
                                        style={{
                                          fontSize: 10,
                                          background: "rgba(51,65,85,0.1)",
                                          color: THEME.muted,
                                          padding: "4px 8px",
                                          borderRadius: 6,
                                          fontWeight: 1000,
                                        }}
                                      >
                                        NO CF
                                      </span>
                                    )}
                                    {!p.birth_date && (
                                      <span
                                        style={{
                                          fontSize: 10,
                                          background: "rgba(37,99,235,0.1)",
                                          color: THEME.blue,
                                          padding: "4px 8px",
                                          borderRadius: 6,
                                          fontWeight: 1000,
                                        }}
                                      >
                                        NO NASCITA
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding: "16px", textAlign: "right" }}>
                                  <Link
                                    href={`/patients/${p.id}`}
                                    style={{
                                      color: THEME.blue,
                                      fontWeight: 1000,
                                      textDecoration: "none",
                                      fontSize: 13,
                                      border: `1px solid ${THEME.blue}`,
                                      padding: "6px 12px",
                                      borderRadius: 8,
                                    }}
                                  >
                                    COMPLETA
                                  </Link>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Footer micro (mobile) */}
            {isMobile && (
              <div style={{ padding: "10px 2px 24px", color: THEME.muted, fontWeight: 800, fontSize: 12 }}>
                {patients.length} pazienti totali • {patientsToComplete.length} da completare
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
