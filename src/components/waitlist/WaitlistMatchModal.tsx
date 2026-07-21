"use client";
// ═══════════════════════════════════════════════════════════════════════
// src/components/waitlist/WaitlistMatchModal.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Modale "Posto liberato": compare dopo l'eliminazione di un appuntamento
// se in lista d'attesa ci sono pazienti compatibili con quello slot
// (giorno della settimana + fascia oraria).
//
// Per ogni candidato: 📲 propone lo slot su WhatsApp (e marca "avvisato").
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { openWhatsApp } from "@/src/lib/whatsapp";
import {
  type WaitlistEntry, entryPatientName, entryPreferencesLabel,
  formatSlotIT, buildSlotWhatsAppMessage,
  entryWaitingDays, entryIsExpired, rankWaitlistCandidates,
} from "@/src/lib/waitlist";

const T = {
  teal: "#0d9488", blue: "#2563eb", text: "#0f172a", muted: "#64748b",
  border: "#e2e8f0", red: "#dc2626", amber: "#f59e0b",
};

export function WaitlistMatchModal({
  slotStart, slotDurationMin, matches, studioName, onClose, onOpenPanel, onChanged, onBook,
}: {
  slotStart: Date;
  /** Durata del buco liberato in minuti (se nota). */
  slotDurationMin?: number | null;
  matches: WaitlistEntry[];
  studioName?: string | null;
  onClose: () => void;
  onOpenPanel?: () => void;
  onChanged?: () => void;
  /** Prenota questo paziente nello slot: apre la creazione precompilata. */
  onBook?: (entry: WaitlistEntry, slotStart: Date) => void;
}) {
  const ranked = rankWaitlistCandidates(matches);
  const [notified, setNotified] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  async function propose(entry: WaitlistEntry) {
    setErr(null);
    const msg = buildSlotWhatsAppMessage({
      patientFirstName: entry.patients?.first_name,
      slotStart,
      studioName,
    });
    const ok = openWhatsApp(entry.patients?.phone, msg);
    if (!ok) {
      setErr(`Numero mancante o non valido per ${entryPatientName(entry)}.`);
      return;
    }
    await supabase
      .from("waitlist_entries")
      .update({
        status: "notified",
        notified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        offered_count: (entry.offered_count ?? 0) + 1,
        last_offered_slot: slotStart.toISOString(),
      })
      .eq("id", entry.id);
    setNotified((s) => new Set(s).add(entry.id));
    onChanged?.();
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 230, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 460, background: "#fff", borderRadius: 14,
          boxShadow: "0 20px 60px rgba(15,23,42,0.3)", overflow: "hidden",
          maxHeight: "85vh", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          padding: "16px 18px",
          background: "linear-gradient(135deg, rgba(13,148,136,0.08), rgba(37,99,235,0.08))",
          borderBottom: `1px solid ${T.border}`,
        }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>⏰ Posto liberato!</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>
            Slot <strong style={{ color: T.text }}>{formatSlotIT(slotStart)}</strong>{slotDurationMin ? <strong style={{ color: T.text }}> ({slotDurationMin}′)</strong> : null}
            {" — "}{matches.length} pazient{matches.length === 1 ? "e" : "i"} in lista d&apos;attesa compatibil{matches.length === 1 ? "e" : "i"}.
          </div>
        </div>

        <div style={{ padding: "12px 16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {err && (
            <div style={{ padding: "6px 10px", background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 7, fontSize: 11.5, color: T.red, fontWeight: 600 }}>
              ⚠ {err}
            </div>
          )}
          {ranked.map((m) => {
            const done = notified.has(m.id) || m.status === "notified";
            return (
              <div key={m.id} style={{
                border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>
                    {entryPatientName(m)}
                    {(m.priority ?? "normale") === "urgente" && (
                      <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: T.red, background: "rgba(220,38,38,0.10)", borderRadius: 999, padding: "2px 6px", textTransform: "uppercase" }}>⚡ urgente</span>
                    )}
                    {entryIsExpired(m) && (
                      <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: "#fff", background: T.red, borderRadius: 999, padding: "2px 6px", textTransform: "uppercase" }}>scaduta</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                    {entryPreferencesLabel(m)} · {m.duration_min ?? 60}′ · attende da {entryWaitingDays(m)}g
                  </div>
                  {m.note && <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2, fontStyle: "italic" }}>“{m.note}”</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "stretch" }}>
                  {onBook && (
                    <button
                      onClick={() => onBook(m, slotStart)}
                      title="Crea subito l'appuntamento in questo slot"
                      style={{
                        padding: "7px 12px", borderRadius: 8, border: "none",
                        background: `linear-gradient(135deg, ${T.teal}, ${T.blue})`, color: "#fff",
                        fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                      }}
                    >📅 Prenota qui</button>
                  )}
                  {done ? (
                    <span style={{
                      fontSize: 10, fontWeight: 800, color: T.amber, whiteSpace: "nowrap", textAlign: "center",
                      background: "rgba(245,158,11,0.12)", borderRadius: 999, padding: "4px 9px",
                    }}>📲 Avvisato</span>
                  ) : (
                    <button
                      onClick={() => propose(m)}
                      style={{
                        padding: "7px 12px", borderRadius: 8, border: "none",
                        background: "#25D366", color: "#fff", fontWeight: 700,
                        fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                      }}
                    >📲 Proponi</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          {onOpenPanel ? (
            <button
              onClick={() => { onClose(); onOpenPanel(); }}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: T.blue, fontWeight: 700, fontSize: 12, fontFamily: "inherit", padding: 0 }}
            >Apri lista completa →</button>
          ) : <span />}
          <button
            onClick={onClose}
            style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${T.teal}, ${T.blue})`, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
          >Chiudi</button>
        </div>
      </div>
    </div>
  );
}
