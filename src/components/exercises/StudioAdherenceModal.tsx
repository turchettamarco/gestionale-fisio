"use client";
// ═══════════════════════════════════════════════════════════════════════
// src/components/exercises/StudioAdherenceModal.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Panoramica aderenza esercizi dello STUDIO (ultimi 7 giorni), l'"alert"
// sui pazienti poco aderenti: i meno attivi compaiono in cima.
//
//   - dati da /api/aderenza-studio (autenticata, membership verificata)
//   - nomi mascherati quando la Modalità Privacy è attiva
//   - link diretto alla scheda paziente
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { usePrivacyDisplay } from "@/src/contexts/PrivacyModeContext";

const T = {
  teal: "#0d9488", blue: "#2563eb", text: "#0f172a", muted: "#64748b",
  border: "#e2e8f0", green: "#16a34a", red: "#dc2626", amber: "#d97706",
  panelSoft: "#f8fafc",
};

type AdherenceItem = {
  patient_id: string;
  first_name: string | null;
  last_name: string | null;
  scheda_id: string;
  total_exercises: number;
  expired: boolean;
  active_days: number;
  done_count: number;
  last_done: string | null;
  day_counts: { date: string; count: number }[];
};

export function StudioAdherenceModal({
  open, onClose, studioId,
}: {
  open: boolean;
  onClose: () => void;
  studioId: string | null;
}) {
  const { maskName } = usePrivacyDisplay();
  const [items, setItems] = useState<AdherenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !studioId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const res = await fetch(`/api/aderenza-studio?studio_id=${studioId}`);
        const d = await res.json();
        if (!res.ok) throw new Error(d?.error || "Errore caricamento");
        if (!cancelled) setItems(d.items ?? []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Errore");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, studioId]);

  if (!open) return null;

  const badge = (n: number) => {
    const color = n >= 5 ? T.green : n >= 2 ? T.amber : T.red;
    const bg = n >= 5 ? "rgba(22,163,74,0.1)" : n >= 2 ? "rgba(217,119,6,0.1)" : "rgba(220,38,38,0.08)";
    return (
      <span style={{
        fontSize: 11, fontWeight: 800, color, background: bg,
        borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap",
      }}>{n}/7 giorni</span>
    );
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 250, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 560, maxHeight: "85vh",
          background: "#fff", borderRadius: 14, overflow: "hidden",
          display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(15,23,42,0.3)",
        }}
      >
        <div style={{
          padding: "16px 18px", borderBottom: `1px solid ${T.border}`,
          background: "linear-gradient(135deg, rgba(13,148,136,0.06), rgba(37,99,235,0.06))",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>📊 Aderenza esercizi — studio</div>
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>
              Ultimi 7 giorni · i pazienti meno attivi sono in cima
            </div>
          </div>
          <button onClick={onClose} aria-label="Chiudi" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: T.muted, fontWeight: 700, padding: 4 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {err && (
            <div style={{ padding: "7px 11px", background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 8, fontSize: 12, color: T.red, fontWeight: 600 }}>⚠ {err}</div>
          )}
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: T.muted, fontSize: 12.5 }}>Caricamento…</div>
          ) : items.length === 0 && !err ? (
            <div style={{ padding: "26px 14px", textAlign: "center", color: T.muted, fontSize: 12.5, lineHeight: 1.6 }}>
              Nessun programma esercizi attivo nello studio.
              Crea un programma dalla scheda paziente e condividilo:
              le spunte del paziente compariranno qui. 💪
            </div>
          ) : (
            items.map((it) => {
              const name = maskName({ first_name: it.first_name, last_name: it.last_name });
              return (
                <div key={it.scheda_id} style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", background: it.active_days === 0 ? "rgba(220,38,38,0.025)" : "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: T.text, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                        {name}
                        {it.expired && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: T.muted, background: "#f1f5f9", borderRadius: 999, padding: "2px 7px", textTransform: "uppercase" }}>scheda scaduta</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                        {it.total_exercises} esercizi · {it.done_count} spunte
                        {it.last_done
                          ? ` · ultima: ${new Date(it.last_done + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}`
                          : " · mai negli ultimi 7 giorni"}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {badge(it.active_days)}
                      <a
                        href={`/patients/${it.patient_id}`}
                        style={{ fontSize: 11.5, fontWeight: 700, color: T.blue, textDecoration: "none", whiteSpace: "nowrap" }}
                      >Apri →</a>
                    </div>
                  </div>
                  {/* Mini-strip 7 giorni */}
                  <div style={{ display: "flex", gap: 4, marginTop: 9 }}>
                    {it.day_counts.map((d) => {
                      const ratio = it.total_exercises ? d.count / it.total_exercises : 0;
                      const bg = d.count === 0 ? "#fff" : ratio >= 1 ? T.green : ratio >= 0.5 ? "#4ade80" : "#bbf7d0";
                      return (
                        <div
                          key={d.date}
                          title={`${new Date(d.date + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric" })}: ${d.count}/${it.total_exercises}`}
                          style={{
                            flex: 1, height: 18, borderRadius: 5,
                            background: bg,
                            border: d.count === 0 ? `1.5px solid ${T.border}` : "none",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 9.5, fontWeight: 800,
                            color: d.count === 0 ? "#e2e8f0" : ratio >= 0.5 ? "#fff" : "#166534",
                          }}
                        >{d.count > 0 ? d.count : ""}</div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ padding: "10px 16px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${T.teal}, ${T.blue})`, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
          >Chiudi</button>
        </div>
      </div>
    </div>
  );
}
