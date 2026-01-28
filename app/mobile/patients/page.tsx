"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

type Patient = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  tax_code?: string | null;
};

const UI = {
  bg: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  muted: "#64748b",
  primary: "#1e3a8a",
  secondary: "#2563eb",
  warning: "#f97316",
};

function nameOf(p: Patient) {
  return `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim() || "Paziente";
}

export default function MobilePatientsPage() {
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

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
    <div style={{ minHeight: "100vh", background: UI.bg, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 1000, color: UI.text }}>👤 Pazienti (mobile)</div>
          <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800 }}>
            Rapido · Ricerca · Incompleti: <span style={{ color: UI.warning, fontWeight: 1000 }}>{incompleteCount}</span>
          </div>
        </div>

        <Link href="/mobile" style={{ textDecoration: "none", color: UI.secondary, fontWeight: 1000 }}>
          ← Oggi
        </Link>
      </div>

      <div style={{ marginTop: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca nome/cognome…"
          style={{
            width: "100%",
            border: `1px solid ${UI.border}`,
            borderRadius: 12,
            padding: "12px 12px",
            fontWeight: 900,
            background: "white",
            color: UI.text,
          }}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: UI.muted, fontWeight: 800 }}>
          Suggerimento: per dettagli completi usa la pagina desktop.
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid rgba(220,38,38,0.25)", background: "rgba(220,38,38,0.06)", color: "#7f1d1d", fontWeight: 900 }}>
          Errore: {error}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div style={{ color: UI.muted, fontWeight: 900, padding: 12 }}>Caricamento…</div>
        ) : filtered.length === 0 ? (
          <div style={{ background: UI.card, border: `1px solid ${UI.border}`, borderRadius: 16, padding: 14, color: UI.muted, fontWeight: 900 }}>
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
                    background: UI.card,
                    border: `1px solid ${UI.border}`,
                    borderRadius: 16,
                    padding: 12,
                    display: "block",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 1000, color: UI.text, fontSize: 15 }}>{nameOf(p)}</div>
                      <div style={{ marginTop: 4, fontSize: 12, color: UI.muted, fontWeight: 800 }}>
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
                          color: UI.warning,
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
    </div>
  );
}
