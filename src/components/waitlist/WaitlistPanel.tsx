"use client";
// ═══════════════════════════════════════════════════════════════════════
// src/components/waitlist/WaitlistPanel.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Drawer della Lista d'attesa (mig. 054). Autonomo e responsive:
// montato sia nel calendario desktop sia in quello mobile.
//
//   - Elenco voci attive/avvisate con preferenze giorno+fascia
//   - Aggiunta rapida: ricerca paziente → giorni → fascia → nota
//   - Azioni per voce: 📲 WhatsApp · ✓ Prenotato · ✕ Rimuovi
//   - onChanged(activeCount) → i chiamanti aggiornano il badge
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { openWhatsApp } from "@/src/lib/whatsapp";
import {
  type WaitlistEntry, type WaitlistPriority,
  entryPatientName, entryPreferencesLabel, WEEKDAY_LABELS,
  entryWaitingDays, entryIsExpired, rankWaitlistCandidates,
} from "@/src/lib/waitlist";

const T = {
  teal: "#0d9488", blue: "#2563eb", text: "#0f172a", muted: "#64748b",
  border: "#e2e8f0", green: "#16a34a", red: "#dc2626", amber: "#f59e0b",
  panelSoft: "#f8fafc",
};

type PatientLite = { id: string; first_name: string | null; last_name: string | null; phone: string | null };

/** Conta le voci attive (per il badge del bottone flottante). */
export async function fetchActiveWaitlistCount(studioId: string): Promise<number> {
  const { count } = await supabase
    .from("waitlist_entries")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studioId)
    .in("status", ["active", "notified"]);
  return count ?? 0;
}

export function WaitlistPanel({
  open, onClose, studioId, onChanged, onFindSlot, members, multiOperatorEnabled,
}: {
  open: boolean;
  onClose: () => void;
  studioId: string;
  /** Membri del team: abilitano la scelta del professionista atteso (mig. 079). */
  members?: Array<{ user_id: string | null; display_name: string | null }>;
  multiOperatorEnabled?: boolean;
  onChanged?: (activeCount: number) => void;
  /** Apre "Trova buco" precompilato con le preferenze della voce. */
  onFindSlot?: (entry: WaitlistEntry) => void;
}) {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ── Form aggiunta ──
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PatientLite | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [note, setNote] = useState("");
  // Professionista atteso (mig. 079). "" = va bene chiunque.
  const [waitOperator, setWaitOperator] = useState<string>("");
  const [durationMin, setDurationMin] = useState(60);
  const [priority, setPriority] = useState<WaitlistPriority>("normale");
  const [expiresOn, setExpiresOn] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!studioId) return;
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from("waitlist_entries")
      .select("*, patients(first_name, last_name, phone)")
      .eq("studio_id", studioId)
      .in("status", ["active", "notified"])
      .order("created_at", { ascending: true });
    if (error) setErr(error.message);
    const rows = rankWaitlistCandidates((data as unknown as WaitlistEntry[]) || []);
    setEntries(rows);
    onChanged?.(rows.length);
    setLoading(false);
  }, [studioId, onChanged]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // ── Ricerca pazienti (debounce leggero) ──
  useEffect(() => {
    if (!adding || selected) return;
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone")
        .eq("studio_id", studioId)
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
        .order("last_name", { ascending: true })
        .limit(8);
      if (!cancelled) {
        setResults((data as PatientLite[]) || []);
        setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, adding, selected, studioId]);

  function resetForm() {
    setQuery(""); setResults([]); setSelected(null);
    setDays([]); setTimeFrom(""); setTimeTo(""); setNote("");
    setDurationMin(60); setPriority("normale"); setExpiresOn(""); setWaitOperator("");
  }

  async function addEntry() {
    if (!selected) return;
    // Anti-duplicato: già in lista attiva?
    if (entries.some((e) => e.patient_id === selected.id)) {
      setErr(`${selected.first_name ?? ""} ${selected.last_name ?? ""} è già in lista d'attesa.`);
      return;
    }
    setSaving(true);
    setErr(null);
    const { error } = await supabase.from("waitlist_entries").insert({
      studio_id: studioId,
      patient_id: selected.id,
      preferred_days: days,
      time_from: timeFrom || null,
      time_to: timeTo || null,
      note: note.trim() || null,
      duration_min: durationMin,
      priority,
      expires_on: expiresOn || null,
      operator_id: waitOperator || null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    resetForm();
    setAdding(false);
    await load();
  }

  async function setStatus(entry: WaitlistEntry, status: "booked" | "cancelled" | "notified") {
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === "notified") patch.notified_at = new Date().toISOString();
    const { error } = await supabase.from("waitlist_entries").update(patch).eq("id", entry.id);
    if (error) { setErr(error.message); return; }
    await load();
  }

  function whatsappContact(entry: WaitlistEntry) {
    const name = entry.patients?.first_name || "";
    const msg =
      `Ciao ${name}! 👋 Ti scrivo per la lista d'attesa: si stanno liberando degli orari. ` +
      `Dimmi quando preferisci e ti blocco il posto. 🙂`;
    const ok = openWhatsApp(entry.patients?.phone, msg);
    if (!ok) setErr("Numero di telefono mancante o non valido per questo paziente.");
    else setStatus(entry, "notified");
  }

  function toggleDay(iso: number) {
    setDays((d) => (d.includes(iso) ? d.filter((x) => x !== iso) : [...d, iso]));
  }

  if (!open) return null;

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 7,
    border: `1.5px solid ${T.border}`, fontSize: 13, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box", background: "#fff", color: T.text,
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", zIndex: 220, display: "flex", justifyContent: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fh-waitlist-drawer"
        style={{
          width: 440, maxWidth: "100%", height: "100%", background: "#fff",
          display: "flex", flexDirection: "column",
          boxShadow: "-8px 0 30px rgba(15,23,42,0.18)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 18px", borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          background: "linear-gradient(135deg, rgba(13,148,136,0.06), rgba(37,99,235,0.06))",
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>⏰ Lista d&apos;attesa</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
              {entries.length === 0 ? "Nessun paziente in attesa" : `${entries.length} pazient${entries.length === 1 ? "e" : "i"} in attesa`}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Chiudi lista d'attesa"
            style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 20, color: T.muted, fontWeight: 700, padding: 4 }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

          {err && (
            <div style={{
              padding: "7px 10px", background: "rgba(220,38,38,0.05)",
              border: "1px solid rgba(220,38,38,0.2)", borderRadius: 7,
              fontSize: 11.5, color: T.red, fontWeight: 600,
              display: "flex", justifyContent: "space-between", gap: 8,
            }}>
              <span>⚠ {err}</span>
              <button onClick={() => setErr(null)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontWeight: 800 }}>✕</button>
            </div>
          )}

          {/* ── Aggiunta ── */}
          {!adding ? (
            <button
              onClick={() => { setAdding(true); setErr(null); }}
              style={{
                padding: "10px 12px", borderRadius: 9, border: `1.5px dashed ${T.teal}`,
                background: "rgba(13,148,136,0.04)", color: T.teal,
                fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
              }}
            >+ Aggiungi paziente alla lista</button>
          ) : (
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, background: T.panelSoft, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Nuova voce
              </div>

              {/* Paziente */}
              {!selected ? (
                <div>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Cerca paziente per nome o cognome…"
                    autoFocus
                    style={inputStyle}
                  />
                  {searching && <div style={{ fontSize: 11, color: T.muted, marginTop: 5 }}>Ricerca…</div>}
                  {!searching && results.length > 0 && (
                    <div style={{ marginTop: 6, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", background: "#fff" }}>
                      {results.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => { setSelected(p); setResults([]); }}
                          style={{
                            display: "block", width: "100%", textAlign: "left",
                            padding: "8px 10px", border: "none", borderBottom: `1px solid ${T.border}`,
                            background: "#fff", cursor: "pointer", fontSize: 12.5,
                            color: T.text, fontFamily: "inherit",
                          }}
                        >
                          <strong>{p.first_name} {p.last_name}</strong>
                          {p.phone && <span style={{ color: T.muted, marginLeft: 6, fontSize: 11 }}>{p.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {!searching && query.trim().length >= 2 && results.length === 0 && (
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 5 }}>Nessun paziente trovato.</div>
                  )}
                </div>
              ) : (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "7px 10px", background: "rgba(13,148,136,0.07)",
                  borderRadius: 7, fontSize: 12.5, fontWeight: 700, color: T.text,
                }}>
                  <span>👤 {selected.first_name} {selected.last_name}</span>
                  <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, fontWeight: 800 }}>✕</button>
                </div>
              )}

              {/* Giorni preferiti */}
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: T.muted, marginBottom: 5 }}>
                  Giorni preferiti <span style={{ fontWeight: 500 }}>(nessuno = qualsiasi)</span>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {WEEKDAY_LABELS.map((w) => {
                    const on = days.includes(w.iso);
                    return (
                      <button
                        key={w.iso}
                        onClick={() => toggleDay(w.iso)}
                        style={{
                          padding: "5px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                          border: `1.5px solid ${on ? T.teal : T.border}`,
                          background: on ? T.teal : "#fff",
                          color: on ? "#fff" : T.muted,
                          cursor: "pointer", fontFamily: "inherit",
                        }}
                      >{w.short}</button>
                    );
                  })}
                </div>
              </div>

              {/* Fascia oraria */}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Dalle</div>
                  <input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Alle</div>
                  <input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} style={inputStyle} />
                </div>
              </div>

              {/* Durata seduta attesa */}
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: T.muted, marginBottom: 5 }}>Durata seduta</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {[15, 30, 45, 60, 90].map(d => (
                    <button key={d} onClick={() => setDurationMin(d)} style={{
                      padding: "5px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                      border: `1.5px solid ${durationMin === d ? T.teal : T.border}`,
                      background: durationMin === d ? T.teal : "#fff",
                      color: durationMin === d ? "#fff" : T.muted,
                      cursor: "pointer", fontFamily: "inherit",
                    }}>{d}′</button>
                  ))}
                </div>
              </div>

              {/* Priorità + scadenza */}
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1.4 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: T.muted, marginBottom: 5 }}>Priorità</div>
                  <div style={{ display: "flex", gap: 5 }}>
                    {([["urgente", "⚡"], ["normale", ""], ["bassa", ""]] as const).map(([k, ico]) => (
                      <button key={k} onClick={() => setPriority(k)} style={{
                        flex: 1, padding: "6px 4px", borderRadius: 7, fontSize: 10.5, fontWeight: 700,
                        border: `1.5px solid ${priority === k ? (k === "urgente" ? T.red : T.teal) : T.border}`,
                        background: priority === k ? (k === "urgente" ? "rgba(220,38,38,0.07)" : "rgba(13,148,136,0.07)") : "#fff",
                        color: priority === k ? (k === "urgente" ? T.red : T.teal) : T.muted,
                        cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize",
                      }}>{ico}{k}</button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: T.muted, marginBottom: 5 }}>Serve entro <span style={{ fontWeight: 500 }}>(opz.)</span></div>
                  <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} style={inputStyle} />
                </div>
              </div>

              {/* Professionista atteso (mig. 079): la lista di studio non
                  bastava, il paziente di solito aspetta UNA persona. */}
              {multiOperatorEnabled && members && members.filter(m => m.user_id).length >= 2 && (
                <div style={{ marginBottom: 8 }}>
                  <select
                    value={waitOperator}
                    onChange={(e) => setWaitOperator(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Va bene qualsiasi professionista</option>
                    {members.filter(m => m.user_id).map(m => (
                      <option key={m.user_id!} value={m.user_id!}>Aspetta {m.display_name || "—"}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Nota */}
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota (es. «solo pomeriggio, preferisce tecar»)…"
                style={inputStyle}
              />

              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button
                  onClick={() => { resetForm(); setAdding(false); }}
                  style={{ padding: "7px 12px", borderRadius: 7, border: `1px solid ${T.border}`, background: "#fff", color: T.muted, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                >Annulla</button>
                <button
                  onClick={addEntry}
                  disabled={!selected || saving}
                  style={{
                    padding: "7px 16px", borderRadius: 7, border: "none",
                    background: !selected || saving ? "#cbd5e1" : `linear-gradient(135deg, ${T.teal}, ${T.blue})`,
                    color: "#fff", fontWeight: 700, fontSize: 12,
                    cursor: !selected || saving ? "default" : "pointer", fontFamily: "inherit",
                  }}
                >{saving ? "Aggiungo…" : "Aggiungi alla lista"}</button>
              </div>
            </div>
          )}

          {/* ── Elenco ── */}
          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: T.muted, fontSize: 12 }}>Caricamento…</div>
          ) : entries.length === 0 && !adding ? (
            <div style={{ padding: "26px 14px", textAlign: "center", color: T.muted, fontSize: 12.5, lineHeight: 1.6 }}>
              La lista è vuota. Aggiungi i pazienti che aspettano un posto:
              quando elimini un appuntamento dal calendario, FisioHub ti
              proporrà subito i compatibili. 📲
            </div>
          ) : (
            entries.map((e) => (
              <div key={e.id} style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>
                      {entryPatientName(e)}
                      {(e.priority ?? "normale") === "urgente" && (
                        <span style={{
                          marginLeft: 7, fontSize: 9.5, fontWeight: 800, color: T.red,
                          background: "rgba(220,38,38,0.10)", borderRadius: 999, padding: "2px 7px",
                          textTransform: "uppercase", letterSpacing: 0.4,
                        }}>⚡ Urgente</span>
                      )}
                      {entryIsExpired(e) && (
                        <span style={{
                          marginLeft: 7, fontSize: 9.5, fontWeight: 800, color: "#fff",
                          background: T.red, borderRadius: 999, padding: "2px 7px",
                          textTransform: "uppercase", letterSpacing: 0.4,
                        }}>Scaduta</span>
                      )}
                      {!entryIsExpired(e) && e.expires_on && (
                        <span style={{
                          marginLeft: 7, fontSize: 9.5, fontWeight: 800, color: T.amber,
                          background: "rgba(245,158,11,0.12)", borderRadius: 999, padding: "2px 7px",
                        }}>entro {new Date(e.expires_on + "T12:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}</span>
                      )}
                      {e.status === "notified" && (
                        <span style={{
                          marginLeft: 7, fontSize: 9.5, fontWeight: 800, color: T.amber,
                          background: "rgba(245,158,11,0.12)", borderRadius: 999, padding: "2px 7px",
                          textTransform: "uppercase", letterSpacing: 0.4,
                        }}>Avvisato</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{entryPreferencesLabel(e)}</div>
                    {e.note && <div style={{ fontSize: 11, color: T.muted, marginTop: 3, fontStyle: "italic" }}>“{e.note}”</div>}
                    {e.status === "notified" && e.notified_at && (
                      <div style={{ fontSize: 10, color: T.amber, marginTop: 3, fontWeight: 600 }}>
                        📲 {new Date(e.notified_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })} alle {new Date(e.notified_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: T.muted, whiteSpace: "nowrap", textAlign: "right" }}>
                    <div>attende da <strong>{entryWaitingDays(e)}g</strong></div>
                    <div style={{ marginTop: 2 }}>{e.duration_min ?? 60}′{(e.offered_count ?? 0) > 0 ? ` · ${e.offered_count} propost${(e.offered_count ?? 0) === 1 ? "a" : "e"}` : ""}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                  {onFindSlot && (
                    <button
                      onClick={() => onFindSlot(e)}
                      title="Cerca i migliori buchi liberi compatibili con le sue preferenze"
                      style={{ padding: "5px 11px", borderRadius: 7, border: "none", background: `linear-gradient(135deg, ${T.teal}, ${T.blue})`, color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                    >🔍 Trova posto</button>
                  )}
                  <button
                    onClick={() => whatsappContact(e)}
                    style={{ padding: "5px 11px", borderRadius: 7, border: "none", background: "#25D366", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                  >📲 WhatsApp</button>
                  <button
                    onClick={() => setStatus(e, "booked")}
                    title="Il paziente ha prenotato: esce dalla lista"
                    style={{ padding: "5px 11px", borderRadius: 7, border: `1.5px solid ${T.green}`, background: "#fff", color: T.green, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                  >✓ Prenotato</button>
                  <button
                    onClick={() => { if (window.confirm(`Rimuovere ${entryPatientName(e)} dalla lista d'attesa?`)) setStatus(e, "cancelled"); }}
                    style={{ padding: "5px 11px", borderRadius: 7, border: `1px solid ${T.border}`, background: "#fff", color: T.muted, fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                  >✕ Rimuovi</button>
                </div>
              </div>
            ))
          )}
        </div>

        <style>{`
          @media (max-width: 700px) {
            .fh-waitlist-drawer { width: 100% !important; }
          }
        `}</style>
      </div>
    </div>
  );
}
