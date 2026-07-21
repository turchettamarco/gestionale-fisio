"use client";

// ═══════════════════════════════════════════════════════════════════════
// SlotFinderModal — "Trova buco"
// ═══════════════════════════════════════════════════════════════════════
//
// Cerca gli slot liberi nei prossimi giorni usando il motore slotFinder
// (orari di apertura reali + appuntamenti, con punteggio di qualità) e li
// propone raggruppati per giorno. Due modalità:
//
//   • generica: scegli durata / orizzonte / giorni / fascia → tap su uno
//     slot = onPickSlot(start, durationMin) → il chiamante apre la modale
//     di creazione precompilata.
//
//   • per paziente in lista d'attesa (prop `entry`): i filtri partono
//     dalle preferenze della voce → tap = onPickForEntry(entry, start):
//     il chiamante apre la creazione con il paziente già selezionato e,
//     a salvataggio riuscito, chiude la voce come "booked".
// ═══════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { findFreeSlots, type FoundSlot } from "@/src/lib/slotFinder";
import {
  type WaitlistEntry, entryPatientName, WEEKDAY_LABELS,
} from "@/src/lib/waitlist";

const T = {
  teal: "#0d9488", blue: "#2563eb", text: "#0f172a", muted: "#64748b",
  border: "#e2e8f0", soft: "#f8fafc", green: "#16a34a", amber: "#f59e0b",
};

const DUR_CHIPS = [15, 30, 45, 60, 90];
const HORIZON_CHIPS = [7, 14, 30];
const FASCE: { k: string; label: string; from: string | null; to: string | null }[] = [
  { k: "any", label: "Qualsiasi", from: null, to: null },
  { k: "am", label: "Mattina", from: "07:00", to: "12:45" },
  { k: "pm", label: "Pomeriggio", from: "13:00", to: "16:45" },
  { k: "eve", label: "Sera", from: "17:00", to: "21:45" },
];

const QUALITY_BADGE: Record<FoundSlot["quality"], { label: string; color: string; bg: string } | null> = {
  perfetto: { label: "🎯 incastro perfetto", color: "#166534", bg: "rgba(22,163,74,0.10)" },
  compatta: { label: "🧲 compatta l'agenda", color: "#1d4ed8", bg: "rgba(37,99,235,0.08)" },
  spezza: null,
};

export function SlotFinderModal({
  open, onClose, studioId, slotMinutes, entry,
  onPickSlot, onPickForEntry,
}: {
  open: boolean;
  onClose: () => void;
  studioId: string;
  slotMinutes: number;
  /** Se presente: ricerca per questo paziente in lista d'attesa. */
  entry?: WaitlistEntry | null;
  onPickSlot: (start: Date, durationMin: number) => void;
  onPickForEntry?: (entry: WaitlistEntry, start: Date, durationMin: number) => void;
}) {
  const [duration, setDuration] = useState(60);
  const [horizon, setHorizon] = useState(7);
  const [days, setDays] = useState<number[]>([]);
  const [fascia, setFascia] = useState("any");
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [results, setResults] = useState<FoundSlot[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Precompila dalle preferenze della voce in lista d'attesa
  useEffect(() => {
    if (!open) return;
    if (entry) {
      setDuration(entry.duration_min ?? 60);
      setDays(entry.preferred_days ?? []);
      if (entry.time_from || entry.time_to) {
        setFascia("custom");
        setCustomRange({
          from: (entry.time_from || "07:00").slice(0, 5),
          to: (entry.time_to || "21:45").slice(0, 5),
        });
      } else {
        setFascia("any");
        setCustomRange(null);
      }
    } else {
      setCustomRange(null);
    }
    setResults(null);
  }, [open, entry]);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const f = FASCE.find(x => x.k === fascia);
      const found = await findFreeSlots({
        studioId,
        from: new Date(),
        days: horizon,
        durationMin: duration,
        slotStep: slotMinutes,
        preferredDays: days,
        timeFrom: fascia === "custom" ? customRange?.from ?? null : f?.from ?? null,
        timeTo: fascia === "custom" ? customRange?.to ?? null : f?.to ?? null,
        limit: 40,
      });
      setResults(found);
    } finally {
      setLoading(false);
    }
  }, [studioId, horizon, duration, slotMinutes, days, fascia, customRange]);

  // Prima ricerca automatica all'apertura
  useEffect(() => {
    if (open) void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id]);

  const grouped = useMemo(() => {
    if (!results) return [];
    const m = new Map<string, FoundSlot[]>();
    // raggruppo per giorno mantenendo l'ordine di punteggio globale
    results.forEach(s => {
      const k = s.start.toDateString();
      const arr = m.get(k) || [];
      arr.push(s);
      m.set(k, arr);
    });
    return Array.from(m.entries())
      .map(([k, list]) => ({ day: new Date(k), list: list.sort((a, b) => a.start.getTime() - b.start.getTime()) }))
      .sort((a, b) => a.day.getTime() - b.day.getTime());
  }, [results]);

  if (!open) return null;

  const chip = (on: boolean): React.CSSProperties => ({
    padding: "6px 11px", borderRadius: 999, fontSize: 12, fontWeight: 700,
    border: `1.5px solid ${on ? T.teal : T.border}`,
    background: on ? T.teal : "#fff", color: on ? "#fff" : T.muted,
    cursor: "pointer", fontFamily: "inherit",
  });

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 240, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, background: "#fff", borderRadius: 14,
          boxShadow: "0 20px 60px rgba(15,23,42,0.3)", overflow: "hidden",
          maxHeight: "88vh", display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "14px 16px", borderBottom: `1px solid ${T.border}`,
          background: "linear-gradient(135deg, rgba(13,148,136,0.06), rgba(37,99,235,0.06))",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>🔍 Trova buco</div>
            {entry ? (
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>
                per <strong style={{ color: T.text }}>{entryPatientName(entry)}</strong> (lista d&apos;attesa) — preferenze già applicate
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>
                I migliori slot liberi, ordinati per incastro
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Chiudi" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 20, color: T.muted, fontWeight: 700 }}>✕</button>
        </div>

        {/* Filtri */}
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: T.muted, width: 58 }}>DURATA</span>
            {DUR_CHIPS.map(d => (
              <button key={d} onClick={() => setDuration(d)} style={chip(duration === d)}>{d}′</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: T.muted, width: 58 }}>ENTRO</span>
            {HORIZON_CHIPS.map(h => (
              <button key={h} onClick={() => setHorizon(h)} style={chip(horizon === h)}>{h} gg</button>
            ))}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, fontWeight: 800, color: T.muted }}>GIORNI</span>
            {WEEKDAY_LABELS.filter(w => w.iso <= 6).map(w => {
              const on = days.includes(w.iso);
              return (
                <button key={w.iso}
                  onClick={() => setDays(d => on ? d.filter(x => x !== w.iso) : [...d, w.iso])}
                  style={{ ...chip(on), padding: "6px 8px" }}>{w.short[0]}</button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: T.muted, width: 58 }}>FASCIA</span>
            {FASCE.map(f => (
              <button key={f.k} onClick={() => { setFascia(f.k); setCustomRange(null); }} style={chip(fascia === f.k)}>{f.label}</button>
            ))}
            {fascia === "custom" && customRange && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: T.teal }}>
                {customRange.from}–{customRange.to}
              </span>
            )}
            <span style={{ flex: 1 }} />
            <button onClick={() => void search()} disabled={loading} style={{
              padding: "7px 16px", borderRadius: 8, border: "none",
              background: loading ? "#cbd5e1" : `linear-gradient(135deg, ${T.teal}, ${T.blue})`,
              color: "#fff", fontWeight: 800, fontSize: 12, cursor: loading ? "default" : "pointer", fontFamily: "inherit",
            }}>{loading ? "Cerco…" : "Cerca"}</button>
          </div>
        </div>

        {/* Risultati */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px 14px" }}>
          {loading && <div style={{ padding: 22, textAlign: "center", color: T.muted, fontSize: 12.5 }}>Cerco i buchi migliori…</div>}
          {!loading && results && results.length === 0 && (
            <div style={{ padding: "22px 12px", textAlign: "center", color: T.muted, fontSize: 12.5, lineHeight: 1.6 }}>
              Nessuno slot libero da {duration}′ nei prossimi {horizon} giorni con questi filtri.
              Prova ad allargare l&apos;orizzonte o la fascia.
            </div>
          )}
          {!loading && grouped.map(({ day, list }) => (
            <div key={day.toISOString()} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
                {day.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {list.map(s => {
                  const badge = QUALITY_BADGE[s.quality];
                  const hhmm = s.start.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <button
                      key={s.start.getTime()}
                      onClick={() => {
                        if (entry && onPickForEntry) onPickForEntry(entry, s.start, duration);
                        else onPickSlot(s.start, duration);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, width: "100%",
                        border: `1px solid ${T.border}`, borderRadius: 10, background: "#fff",
                        padding: "9px 12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: 14.5, fontWeight: 800, color: T.text, width: 50 }}>{hhmm}</span>
                      <span style={{ fontSize: 11, color: T.muted }}>
                        {duration}′ · finestra di {s.windowMinutes}′
                      </span>
                      <span style={{ flex: 1 }} />
                      {badge && (
                        <span style={{
                          fontSize: 10, fontWeight: 800, color: badge.color, background: badge.bg,
                          borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap",
                        }}>{badge.label}</span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 800, color: T.teal }}>›</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
