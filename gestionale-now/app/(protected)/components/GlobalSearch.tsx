"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────
type PatientResult = {
  kind: "patient";
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  birth_date: string | null;
};

type AppointmentResult = {
  kind: "appointment";
  id: string;
  start_at: string;
  status: string;
  patient_name: string;
  patient_id: string;
  treatment_type: string | null;
  amount: number | null;
};

type SearchResult = PatientResult | AppointmentResult;

// ─── Theme (same as rest of app) ──────────────────────────────────────────────
const T = {
  appBg:    "#f1f5f9",
  panelBg:  "#ffffff",
  panelSoft:"#f7f9fd",
  text:     "#0f172a",
  textSoft: "#1e293b",
  muted:    "#334155",
  border:   "#cbd5e1",
  blue:     "#2563eb",
  teal:     "#0d9488",
  green:    "#16a34a",
  red:      "#dc2626",
  amber:    "#f97316",
  gray:     "#94a3b8",
};

const STATUS_LABEL: Record<string, string> = {
  done:      "Eseguito",
  confirmed: "Confermato",
  booked:    "Prenotato",
  cancelled: "Annullato",
  not_paid:  "Non pagato",
};
const STATUS_COLOR: Record<string, string> = {
  done:      T.green,
  confirmed: T.blue,
  booked:    T.teal,
  cancelled: T.gray,
  not_paid:  T.amber,
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
function calcAge(birthDate: string | null) {
  if (!birthDate) return null;
  const diff = Date.now() - new Date(birthDate).getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Open / close ────────────────────────────────────────────────────────────
  const openSearch = useCallback(() => {
    setOpen(true);
    setQuery("");
    setResults([]);
    setSelected(0);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
  }, []);

  // ── Keyboard shortcut: Cmd+K / Ctrl+K ───────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) closeSearch(); else openSearch();
      }
      if (e.key === "Escape" && open) closeSearch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openSearch, closeSearch]);

  // ── Custom event: permette di aprire il search da bottoni esterni ────────────
  // (es. il bottone search nella navbar della home).
  // Uso: window.dispatchEvent(new CustomEvent("fisiohub:open-search"))
  useEffect(() => {
    const onOpen = () => openSearch();
    window.addEventListener("fisiohub:open-search", onOpen);
    return () => window.removeEventListener("fisiohub:open-search", onOpen);
  }, [openSearch]);

  // ── Focus input when opened ──────────────────────────────────────────────────
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  // ── Search ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const term = `%${q}%`;
        const [pRes, aRes] = await Promise.all([
          // Pazienti: cerca per cognome, nome, telefono
          supabase
            .from("patients")
            .select("id, first_name, last_name, phone, birth_date")
            .or(`last_name.ilike.${term},first_name.ilike.${term},phone.ilike.${term}`)
            .order("last_name", { ascending: true })
            .limit(8),

          // Appuntamenti: cerca tramite join paziente
          supabase
            .from("appointments")
            .select("id, start_at, status, treatment_type, amount, patient_id, patients:patient_id(first_name, last_name)")
            .gte("start_at", new Date(Date.now() - 90 * 86400000).toISOString())
            .order("start_at", { ascending: false })
            .limit(100),
        ]);

        const patients: PatientResult[] = (pRes.data || []).map((p: any) => ({
          kind: "patient" as const,
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          phone: p.phone,
          birth_date: p.birth_date,
        }));

        // Filtra appuntamenti per nome paziente
        const ql = q.toLowerCase();
        const appts: AppointmentResult[] = (aRes.data || [])
          .filter((a: any) => {
            const p = Array.isArray(a.patients) ? a.patients[0] : a.patients;
            const name = `${p?.last_name || ""} ${p?.first_name || ""}`.toLowerCase();
            return name.includes(ql);
          })
          .slice(0, 5)
          .map((a: any) => {
            const p = Array.isArray(a.patients) ? a.patients[0] : a.patients;
            return {
              kind: "appointment" as const,
              id: a.id,
              start_at: a.start_at,
              status: a.status,
              patient_name: `${p?.last_name || ""} ${p?.first_name || ""}`.trim() || "Paziente",
              patient_id: a.patient_id,
              treatment_type: a.treatment_type,
              amount: a.amount != null ? Number(a.amount) : null,
            };
          });

        // Pazienti prima, poi appuntamenti
        setResults([...patients, ...appts]);
        setSelected(0);
      } catch (e) {
        console.error("GlobalSearch error:", e);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // ── Keyboard navigation in results ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected(s => Math.min(s + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected(s => Math.max(s - 1, 0));
      } else if (e.key === "Enter" && results[selected]) {
        handleSelect(results[selected]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, selected]);

  // ── Navigate on select ───────────────────────────────────────────────────────
  const handleSelect = (r: SearchResult) => {
    closeSearch();
    if (r.kind === "patient") {
      router.push(`/patients/${r.id}`);
    } else {
      // Vai al calendario nel giorno dell'appuntamento
      const date = r.start_at.slice(0, 10);
      router.push(`/calendar?date=${date}&view=day`);
    }
  };

  if (!open) {
    return (
      // Trigger button visibile in tutti i layout (opzionale, il tasto principale è Cmd+K)
      <button
        onClick={openSearch}
        title="Ricerca globale (⌘K)"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 48,
          height: 48,
          borderRadius: 12,
          border: `1.5px solid ${T.border}`,
          background: "#fff",
          boxShadow: "0 4px 16px rgba(15,23,42,0.12)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          zIndex: 900,
          color: T.muted,
          transition: "all 0.15s",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = T.teal;
          (e.currentTarget as HTMLButtonElement).style.color = "#fff";
          (e.currentTarget as HTMLButtonElement).style.borderColor = T.teal;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = "#fff";
          (e.currentTarget as HTMLButtonElement).style.color = T.muted;
          (e.currentTarget as HTMLButtonElement).style.borderColor = T.border;
        }}
      >
        🔍
      </button>
    );
  }

  // ── Modal overlay ────────────────────────────────────────────────────────────
  const patients = results.filter(r => r.kind === "patient") as PatientResult[];
  const appts    = results.filter(r => r.kind === "appointment") as AppointmentResult[];

  return (
    <div
      onClick={closeSearch}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "10vh",
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 620,
          background: "#fff",
          borderRadius: 16,
          border: `1.5px solid ${T.border}`,
          boxShadow: "0 24px 64px rgba(15,23,42,0.22)",
          overflow: "hidden",
        }}
      >
        {/* ── Input ── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 20px",
          borderBottom: results.length > 0 || loading ? `1px solid ${T.border}` : "none",
        }}>
          <span style={{ fontSize: 18, color: T.muted, flexShrink: 0 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cerca paziente, cognome, telefono…"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: 16,
              fontWeight: 500,
              color: T.text,
              background: "transparent",
              fontFamily: "inherit",
            }}
          />
          {loading && (
            <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>ricerca…</span>
          )}
          {!loading && (
            <kbd style={{
              fontSize: 11, color: T.muted, background: T.panelSoft,
              border: `1px solid ${T.border}`, borderRadius: 5,
              padding: "2px 7px", flexShrink: 0,
            }}>esc</kbd>
          )}
        </div>

        {/* ── Results ── */}
        {results.length > 0 && (() => {
          let globalIdx = -1;
          return (
            <div style={{ maxHeight: "60vh", overflowY: "auto" }}>

              {/* Pazienti */}
              {patients.length > 0 && (
                <div>
                  <div style={{
                    padding: "8px 20px 4px",
                    fontSize: 10,
                    fontWeight: 700,
                    color: T.muted,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                    background: T.panelSoft,
                    borderBottom: `1px solid ${T.border}`,
                  }}>
                    Pazienti
                  </div>
                  {patients.map(p => {
                    globalIdx++;
                    const idx = globalIdx;
                    const isSelected = selected === idx;
                    const age = calcAge(p.birth_date);
                    const initials = `${(p.last_name || "?")[0]}${(p.first_name || "?")[0]}`.toUpperCase();
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelect(p)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "12px 20px",
                          cursor: "pointer",
                          background: isSelected ? `rgba(13,148,136,0.07)` : "#fff",
                          borderBottom: `1px solid ${T.border}`,
                          borderLeft: isSelected ? `3px solid ${T.teal}` : "3px solid transparent",
                          transition: "all 0.1s",
                        }}
                        onMouseEnter={() => setSelected(idx)}
                      >
                        <div style={{
                          width: 38, height: 38, borderRadius: 10,
                          background: `linear-gradient(135deg, #0d9488, #2563eb)`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#fff", fontWeight: 800, fontSize: 13, flexShrink: 0,
                        }}>
                          {initials}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: T.text }}>
                            {p.last_name} {p.first_name}
                          </div>
                          <div style={{ fontSize: 12, color: T.muted, marginTop: 1 }}>
                            {age ? `${age} anni` : ""}
                            {age && p.phone ? " · " : ""}
                            {p.phone || ""}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, color: T.gray, flexShrink: 0 }}>
                          Vai alla scheda →
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Appuntamenti */}
              {appts.length > 0 && (
                <div>
                  <div style={{
                    padding: "8px 20px 4px",
                    fontSize: 10,
                    fontWeight: 700,
                    color: T.muted,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                    background: T.panelSoft,
                    borderBottom: `1px solid ${T.border}`,
                  }}>
                    Appuntamenti recenti
                  </div>
                  {appts.map(a => {
                    globalIdx++;
                    const idx = globalIdx;
                    const isSelected = selected === idx;
                    const sc = STATUS_COLOR[a.status] || T.gray;
                    return (
                      <div
                        key={a.id}
                        onClick={() => handleSelect(a)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "12px 20px",
                          cursor: "pointer",
                          background: isSelected ? `rgba(37,99,235,0.06)` : "#fff",
                          borderBottom: `1px solid ${T.border}`,
                          borderLeft: isSelected ? `3px solid ${T.blue}` : "3px solid transparent",
                          transition: "all 0.1s",
                        }}
                        onMouseEnter={() => setSelected(idx)}
                      >
                        <div style={{
                          width: 38, height: 38, borderRadius: 10,
                          background: `${sc}18`,
                          border: `1.5px solid ${sc}40`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          <span style={{ fontSize: 16 }}>
                            {a.status === "done" ? "✓" : a.status === "cancelled" ? "✕" : "📅"}
                          </span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: T.text }}>
                            {a.patient_name}
                          </div>
                          <div style={{ fontSize: 12, color: T.muted, marginTop: 1 }}>
                            {fmtDate(a.start_at)} alle {fmtTime(a.start_at)}
                            {a.amount ? ` · €${a.amount}` : ""}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          color: sc,
                          background: `${sc}15`,
                          padding: "3px 8px",
                          borderRadius: 20,
                          flexShrink: 0,
                        }}>
                          {STATUS_LABEL[a.status] || a.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Stato vuoto ── */}
        {query.trim().length >= 2 && !loading && results.length === 0 && (
          <div style={{ padding: "32px 20px", textAlign: "center", color: T.muted, fontSize: 13 }}>
            Nessun risultato per "{query}"
          </div>
        )}

        {/* ── Footer con shortcuts ── */}
        <div style={{
          display: "flex",
          gap: 16,
          padding: "10px 20px",
          borderTop: results.length > 0 ? `1px solid ${T.border}` : "none",
          background: T.panelSoft,
        }}>
          {[
            { key: "↑↓", label: "naviga" },
            { key: "↵", label: "apri" },
            { key: "esc", label: "chiudi" },
          ].map(s => (
            <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <kbd style={{ fontSize: 10, color: T.muted, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 4, padding: "1px 5px" }}>{s.key}</kbd>
              <span style={{ fontSize: 11, color: T.muted }}>{s.label}</span>
            </span>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 11, color: T.gray }}>
            pazienti · appuntamenti
          </span>
        </div>
      </div>
    </div>
  );
}
