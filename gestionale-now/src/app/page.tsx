"use client";

import Link from "next/link";
import React, { useMemo } from "react";

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

function kpiCardStyle() {
  return {
    background: THEME.panelBg,
    borderRadius: 18,
    padding: 16,
    border: `1px solid ${THEME.borderSoft}`,
    boxShadow: "0 14px 45px rgba(2,6,23,0.08)",
  } as React.CSSProperties;
}

function buttonStyle(kind: "primary" | "secondary" | "ghost" | "accent") {
  const base: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 1000,
    height: 42,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    textDecoration: "none",
    cursor: "pointer",
    border: `1px solid ${THEME.border}`,
    background: "#ffffff",
    color: THEME.text,
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  if (kind === "primary") {
    return {
      ...base,
      border: `1px solid ${THEME.primary}`,
      background: THEME.primary,
      color: "#fff",
    };
  }

  if (kind === "secondary") {
    return {
      ...base,
      border: `1px solid ${THEME.secondary}`,
      background: THEME.secondary,
      color: "#fff",
    };
  }

  if (kind === "accent") {
    return {
      ...base,
      border: `1px solid ${THEME.accent}`,
      background: THEME.accent,
      color: "#fff",
    };
  }

  return base;
}

export default function HomePage() {
  const cardStyle = useMemo(() => kpiCardStyle(), []);

  return (
    <div style={{ minHeight: "100vh", background: THEME.appBg }}>
      <main style={{ padding: 16, maxWidth: 1180, margin: "0 auto" }}>
        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
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
                }}
              >
                Dashboard
              </h1>
            </div>

            <div style={{ marginTop: 8, fontSize: 12, color: THEME.textMuted, fontWeight: 900 }}>
              Gestionale fisioterapico · accesso rapido a pazienti, calendario e documenti.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/calendar" style={buttonStyle("secondary")}>
              📅 Calendario
            </Link>
            <Link href="/patients" style={buttonStyle("accent")}>
              👥 Pazienti
            </Link>
          </div>
        </div>

        {/* QUICK ACTIONS */}
        <section style={{ marginTop: 14, ...cardStyle }}>
          <h2 style={{ margin: 0, color: THEME.primary, fontWeight: 1000, fontSize: 18 }}>Azioni rapide</h2>
          <div style={{ marginTop: 10, color: THEME.textMuted, fontSize: 12, fontWeight: 900 }}>
            Vai subito dove lavori davvero.
          </div>

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <Link href="/calendar" style={{ ...cardStyle, textDecoration: "none", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
                <div>
                  <div style={{ color: THEME.textSoft, fontWeight: 1000 }}>Calendario</div>
                  <div style={{ marginTop: 6, color: THEME.textMuted, fontSize: 12, fontWeight: 900 }}>
                    Giorno/Settimana · drag & drop · gestione sedute.
                  </div>
                </div>
                <div style={{ color: THEME.secondary, fontWeight: 1000 }}>→</div>
              </div>
            </Link>

            <Link href="/patients" style={{ ...cardStyle, textDecoration: "none", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
                <div>
                  <div style={{ color: THEME.textSoft, fontWeight: 1000 }}>Pazienti</div>
                  <div style={{ marginTop: 6, color: THEME.textMuted, fontSize: 12, fontWeight: 900 }}>
                    Anagrafica · clinica · terapie · documenti.
                  </div>
                </div>
                <div style={{ color: THEME.accent, fontWeight: 1000 }}>→</div>
              </div>
            </Link>

            <div style={{ ...cardStyle }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
                <div>
                  <div style={{ color: THEME.textSoft, fontWeight: 1000 }}>Note operative</div>
                  <div style={{ marginTop: 6, color: THEME.textMuted, fontSize: 12, fontWeight: 900 }}>
                    Qui puoi mettere in futuro KPI reali (sedute oggi, incassi, arretrati).
                  </div>
                </div>
                <div style={{ color: THEME.textMuted, fontWeight: 1000 }}>•</div>
              </div>
            </div>
          </div>
        </section>

        {/* INFO / ROADMAP */}
        <section style={{ marginTop: 14, ...cardStyle }}>
          <h2 style={{ margin: 0, color: THEME.primary, fontWeight: 1000, fontSize: 18 }}>Stato sistema</h2>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {[
              { title: "Operatore", value: "Singolo", tone: THEME.accent },
              { title: "Tema", value: "Chiaro blu/verde", tone: THEME.secondary },
              { title: "Focus", value: "Uso clinico reale", tone: THEME.primary },
            ].map((x) => (
              <div key={x.title} style={{ border: `1px solid ${THEME.borderSoft}`, borderRadius: 16, padding: 14, background: "rgba(255,255,255,0.7)" }}>
                <div style={{ fontSize: 12, color: THEME.textMuted, fontWeight: 900 }}>{x.title}</div>
                <div style={{ marginTop: 6, fontSize: 14, color: x.tone, fontWeight: 1000 }}>{x.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: THEME.textMuted, fontWeight: 900 }}>
            Prossimo step sensato: KPI reali qui sopra (sedute di oggi, pazienti nuovi mese, non pagate). Ma solo quando mi dai lo schema/nomi esatti delle tabelle interessate.
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/calendar" style={buttonStyle("primary")}>
              Apri Calendario
            </Link>
            <Link href="/patients" style={buttonStyle("ghost")}>
              Apri Pazienti
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
