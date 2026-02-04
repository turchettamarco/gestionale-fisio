"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { Menu, X, Home, Calendar, BarChart3, Users } from "lucide-react";

type Patient = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  tax_code?: string | null;
};

const COLORS = {
  primary: "#1e3a8a",
  secondary: "#2563eb",
  accent: "#0d9488",
  success: "#16a34a",
  warning: "#f97316",
  danger: "#dc2626",
  muted: "#64748b",
  background: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
};

// --- BARRA LATERALE MOBILE (MENU) ---
function MobileMenu({ showMenu, setShowMenu }: { showMenu: boolean; setShowMenu: (show: boolean) => void }) {
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
          color: COLORS.primary,
        }}
      >
        <Menu size={24} />
      </button>

      {/* Menu laterale mobile */}
      {showMenu && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1000,
          }}
          onClick={() => setShowMenu(false)}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: "80%",
              maxWidth: 300,
              background: COLORS.card,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <h2 style={{ margin: 0, color: COLORS.primary }}>FisioHub</h2>
              <button onClick={() => setShowMenu(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={24} />
              </button>
            </div>

            <Link
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                color: COLORS.text,
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
                color: COLORS.text,
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
                color: COLORS.text,
                textDecoration: "none",
                padding: "12px 0",
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
                color: COLORS.primary,
                textDecoration: "none",
                padding: "12px 0",
                fontWeight: "bold",
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
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: COLORS.card,
        borderTop: `1px solid ${COLORS.border}`,
        display: "flex",
        justifyContent: "space-around",
        padding: "12px 0",
        zIndex: 50,
      }}
    >
      <Link href="/" style={{ textDecoration: "none", color: COLORS.muted, textAlign: "center" }}>
        <div style={{ fontSize: 24 }}>🏠</div>
        <div style={{ fontSize: 10 }}>Home</div>
      </Link>

      <Link href="/calendar" style={{ textDecoration: "none", color: COLORS.muted, textAlign: "center" }}>
        <div style={{ fontSize: 24 }}>📅</div>
        <div style={{ fontSize: 10 }}>Calendario</div>
      </Link>

      <Link href="/reports" style={{ textDecoration: "none", color: COLORS.muted, textAlign: "center" }}>
        <div style={{ fontSize: 24 }}>📊</div>
        <div style={{ fontSize: 10 }}>Report</div>
      </Link>

      <div style={{ textDecoration: "none", color: COLORS.primary, textAlign: "center" }}>
        <div style={{ fontSize: 24 }}>👥</div>
        <div style={{ fontSize: 10, fontWeight: "bold" }}>Pazienti</div>
      </div>
    </div>
  );
}

function nameOf(p: Patient) {
  return `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim() || "Paziente";
}

export default function MobilePatientsPage() {
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");

    const res = await supabase
      .from("patients")
      .select("id, first_name, last_name, phone, birth_date, tax_code")
      .order("last_name", { ascending: true });

    if (res.error) {
      setError(res.error.message);
      setPatients([]);
      setLoading(false);
      return;
    }

    setPatients((res.data ?? []) as any);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return patients.slice(0, 30); // mobile: non vuoi liste infinite
    return patients.filter((p) => nameOf(p).toLowerCase().includes(t)).slice(0, 50);
  }, [patients, q]);

  const incompleteCount = useMemo(() => {
    return patients.filter((p) => !p.phone || !p.birth_date || !p.tax_code).length;
  }, [patients]);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.background, padding: 14, paddingBottom: 80 }}>
      {/* Header con menu */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MobileMenu showMenu={showMenu} setShowMenu={setShowMenu} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 1000, color: COLORS.text }}>👤 Pazienti (mobile)</div>
            <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 800 }}>
              Rapido · Ricerca · Incompleti:{" "}
              <span style={{ color: COLORS.warning, fontWeight: 1000 }}>{incompleteCount}</span>
            </div>
          </div>
        </div>

        <Link href="/mobile" style={{ textDecoration: "none", color: COLORS.secondary, fontWeight: 1000 }}>
          ← Oggi
        </Link>
      </div>

      {/* Barra di ricerca */}
      <div style={{ marginTop: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca nome/cognome…"
          style={{
            width: "100%",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 12,
            padding: "12px 12px",
            fontWeight: 900,
            background: "white",
            color: COLORS.text,
          }}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: COLORS.muted, fontWeight: 800 }}>
          Suggerimento: per dettagli completi usa la pagina desktop.
        </div>
      </div>

      {/* Messaggio di errore */}
      {error && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(220,38,38,0.25)",
            background: "rgba(220,38,38,0.06)",
            color: "#7f1d1d",
            fontWeight: 900,
          }}
        >
          Errore: {error}
        </div>
      )}

      {/* Lista pazienti */}
      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div style={{ color: COLORS.muted, fontWeight: 900, padding: 12 }}>Caricamento…</div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 16,
              padding: 14,
              color: COLORS.muted,
              fontWeight: 900,
            }}
          >
            Nessun paziente trovato.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((p) => {
              const incomplete = !p.phone || !p.birth_date || !p.tax_code;
              return (
                <Link
                  key={p.id}
                  href={`/patients/${p.id}`}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                    background: COLORS.card,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 16,
                    padding: 12,
                    display: "block",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 1000, color: COLORS.text, fontSize: 15 }}>{nameOf(p)}</div>
                      <div style={{ marginTop: 4, fontSize: 12, color: COLORS.muted, fontWeight: 800 }}>
                        {p.phone ? `📞 ${p.phone}` : "📞 —"}
                      </div>
                    </div>
                    {incomplete && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 1000,
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: "rgba(249,115,22,0.12)",
                          color: COLORS.warning,
                          border: "1px solid rgba(249,115,22,0.30)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        ⚠️ Incompleto
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Barra inferiore mobile */}
      <MobileTabBar />
    </div>
  );
}