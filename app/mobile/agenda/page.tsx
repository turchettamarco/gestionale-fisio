"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

type Appointment = {
  id: string;
  start_at: string;
  status?: string | null;
  amount?: number | null;
  treatment_type?: string | null;
  patient_id?: string | null;
  patients?: { first_name?: string | null; last_name?: string | null; phone?: string | null } | null;
};

const UI = {
  bg: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  muted: "#64748b",
  primary: "#1e3a8a",
  secondary: "#2563eb",
};

function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function itTime(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
function fullName(p?: Appointment["patients"]) {
  const ln = p?.last_name ?? "";
  const fn = p?.first_name ?? "";
  return `${ln} ${fn}`.trim() || "Paziente";
}

export default function MobileAgendaPage() {
  const router = useRouter();

  const today = useMemo(() => new Date(), []);
  const [dateYMD, setDateYMD] = useState<string>(toYMD(today));
  const [loading, setLoading] = useState<boolean>(true);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateYMD]);

  async function load() {
    setLoading(true);
    setError("");

    const startISO = `${dateYMD}T00:00:00`;
    const endISO = `${dateYMD}T23:59:59`;

    const res = await supabase
      .from("appointments")
      .select("id, start_at, status, amount, treatment_type, patient_id, patients(first_name,last_name,phone)")
      .gte("start_at", startISO)
      .lt("start_at", endISO)
      .order("start_at", { ascending: true });

    if (res.error) {
      setError(res.error.message);
      setAppts([]);
      setLoading(false);
      return;
    }

    setAppts((res.data ?? []) as any);
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: UI.bg, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 1000, color: UI.text }}>📅 Agenda</div>
          <div style={{ fontSize: 12, color: UI.muted, fontWeight: 800 }}>Vista giorno (mobile)</div>
        </div>

        <Link href="/mobile" style={{ textDecoration: "none", color: UI.secondary, fontWeight: 1000 }}>
          ← Oggi
        </Link>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
        <input
          type="date"
          value={dateYMD}
          onChange={(e) => setDateYMD(e.target.value)}
          style={{
            border: `1px solid ${UI.border}`,
            borderRadius: 12,
            padding: "10px 12px",
            fontWeight: 900,
            background: "white",
            color: UI.text,
          }}
        />

        <button
          onClick={() => router.push(`/calendar?view=day&date=${dateYMD}`)}
          style={{
            border: "none",
            background: UI.primary,
            color: "white",
            fontWeight: 1000,
            padding: "10px 12px",
            borderRadius: 12,
            cursor: "pointer",
          }}
        >
          Apri calendario →
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid rgba(220,38,38,0.25)", background: "rgba(220,38,38,0.06)", color: "#7f1d1d", fontWeight: 900 }}>
          Errore: {error}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div style={{ color: UI.muted, fontWeight: 900, padding: 12 }}>Caricamento…</div>
        ) : appts.length === 0 ? (
          <div style={{ background: UI.card, border: `1px solid ${UI.border}`, borderRadius: 16, padding: 14, color: UI.muted, fontWeight: 900 }}>
            Nessun appuntamento in questa data.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {appts.map((a) => (
              <div key={a.id} style={{ background: UI.card, border: `1px solid ${UI.border}`, borderRadius: 16, padding: 12 }}>
                <div style={{ fontWeight: 1000, color: UI.text, fontSize: 15 }}>
                  {itTime(a.start_at)} · {fullName(a.patients)}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: UI.muted, fontWeight: 800 }}>
                  {a.treatment_type ?? "Seduta"}{typeof a.amount === "number" && a.amount > 0 ? ` · €${a.amount}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
