"use client";

// ════════════════════════════════════════════════════════════════════════
// app/(protected)/ospiti/OspitiIndexClient.tsx
// ════════════════════════════════════════════════════════════════════════
//
// Pagina indice degli ospiti dello studio (mig. 031, Step 5e).
// Stile identico alla pagina /ospiti/[id]: brand FisioHub, gradient header,
// cards a pillola con bordo sinistro colorato.
//
// Per ogni ospite carica statistiche del mese corrente:
//   - Count appuntamenti totali
//   - Prossimo appuntamento (data + ora)
//   - Numero giorni di lavoro previsti
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { ArrowLeft, ChevronRight, Stethoscope } from "lucide-react";

// ── Palette brand FisioHub (allineata alla pagina /ospiti/[id]) ──────────
const T = {
  appBg:       "#f1f5f9",
  panelBg:     "#ffffff",
  panelSoft:   "#f8fafc",
  text:        "#0f172a",
  muted:       "#475569",
  mutedSoft:   "#64748b",
  mutedXSoft:  "#94a3b8",
  border:      "#cbd5e1",
  borderSoft:  "#e2e8f0",
  blue:        "#2563eb",
  teal:        "#0d9488",
  white:       "#ffffff",
};

const GRADIENT = "linear-gradient(135deg, #0d9488, #2563eb)";

// ── Tipi ─────────────────────────────────────────────────────────────────
type GuestStat = {
  id: string;
  first_name: string;
  last_name: string;
  specialty: string;
  display_color: string | null;
  notes: string | null;
  monthAppts: number;
  monthDays: number;
  nextAppt: Date | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────
function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" })
    .replace(/^./, c => c.toUpperCase());
}
function fmtNextAppt(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    .replace(/^./, c => c.toUpperCase()).replace(/\./g, "");
}

// ── Component ────────────────────────────────────────────────────────────
export default function OspitiIndexClient() {
  const router = useRouter();
  const { studio } = useCurrentStudio();
  const [guests, setGuests] = useState<GuestStat[]>([]);
  const [loading, setLoading] = useState(true);

  // Mese corrente per le statistiche
  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0), [now]);
  const monthEnd = useMemo(() => new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59), [now]);

  // ── Carico ospiti + statistiche ───────────────────────────────────────
  useEffect(() => {
    if (!studio?.id) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      // 1) Carico tutti gli ospiti attivi
      const { data: guestsData, error: guestErr } = await supabase
        .from("guest_practitioners")
        .select("id, first_name, last_name, specialty, display_color, notes")
        .eq("studio_id", studio.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (cancelled) return;
      if (guestErr) { console.error(guestErr); setLoading(false); return; }
      if (!guestsData || guestsData.length === 0) {
        setGuests([]);
        setLoading(false);
        return;
      }

      // 2) Per ogni ospite, conto gli appuntamenti del mese corrente
      const stats: GuestStat[] = [];
      for (const g of guestsData) {
        const { data: appts, error: aErr } = await supabase
          .from("appointments")
          .select("start_at")
          .eq("guest_practitioner_id", g.id)
          .eq("studio_id", studio.id)
          .gte("start_at", monthStart.toISOString())
          .lte("start_at", monthEnd.toISOString())
          .neq("status", "cancelled")
          .order("start_at", { ascending: true });
        if (aErr) console.error(aErr);

        const monthAppts = appts?.length ?? 0;
        // Conto giorni distinti
        const days = new Set<string>();
        for (const a of (appts ?? [])) {
          const d = new Date(a.start_at);
          days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
        }

        // Prossimo appuntamento futuro (anche oltre il mese)
        const { data: future } = await supabase
          .from("appointments")
          .select("start_at")
          .eq("guest_practitioner_id", g.id)
          .eq("studio_id", studio.id)
          .gte("start_at", new Date().toISOString())
          .neq("status", "cancelled")
          .order("start_at", { ascending: true })
          .limit(1);

        stats.push({
          ...g,
          monthAppts,
          monthDays: days.size,
          nextAppt: future && future.length > 0 ? new Date(future[0].start_at) : null,
        });
      }

      if (cancelled) return;
      setGuests(stats);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [studio?.id, monthStart, monthEnd]);

  return (
    <>
      <style>{`
        .oi-wrap { min-height: 100vh; background: ${T.appBg}; }
        .oi-container { max-width: 1320px; margin: 0 auto; padding: 16px 24px 60px; }
        .oi-grid {
          display: grid; gap: 14px;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        }
        .oi-card {
          background: ${T.panelBg}; border: 1px solid ${T.border};
          border-radius: 14px; overflow: hidden;
          box-shadow: 0 2px 10px rgba(15,23,42,0.05);
          cursor: pointer; transition: all 0.15s;
        }
        .oi-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 18px rgba(15,23,42,0.10);
        }
        @media (max-width: 768px) {
          .oi-container { padding: 12px; }
          .oi-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="oi-wrap">
        <div className="oi-container">

          {/* Back */}
          <button
            onClick={() => router.push("/calendar")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 12, color: T.muted, background: "transparent",
              border: "none", cursor: "pointer", padding: 0,
              marginBottom: 14, fontWeight: 700,
            }}
          >
            <ArrowLeft size={14} /> Calendario
          </button>

          {/* Header card */}
          <div style={{
            background: T.panelBg,
            borderRadius: 14, overflow: "hidden",
            boxShadow: "0 2px 14px rgba(15,23,42,0.06)",
            border: `1px solid ${T.border}`,
            marginBottom: 20,
          }}>
            <div style={{
              background: GRADIENT, padding: "18px 24px",
              display: "flex", alignItems: "center", gap: 14,
              flexWrap: "wrap",
            }}>
              <div style={{
                width: 50, height: 50, borderRadius: 12,
                background: "rgba(255,255,255,0.18)",
                border: "2px solid rgba(255,255,255,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Stethoscope size={22} color={T.white} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11, color: "rgba(255,255,255,0.85)",
                  fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
                  marginBottom: 2,
                }}>
                  Agenda Ospiti
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 800, color: T.white,
                  letterSpacing: -0.3, lineHeight: 1.1,
                }}>
                  Professionisti esterni
                </div>
                <div style={{
                  fontSize: 13, color: "rgba(255,255,255,0.92)",
                  marginTop: 4, fontWeight: 500,
                }}>
                  Statistiche di {fmtMonthYear(now)} · {guests.length} ospit{guests.length === 1 ? "e" : "i"} attivo{guests.length === 1 ? "" : "/i"}
                </div>
              </div>
            </div>
          </div>

          {/* Lista card ospiti */}
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 13, fontWeight: 600 }}>
              Caricamento…
            </div>
          ) : guests.length === 0 ? (
            <div style={{
              padding: "60px 20px", textAlign: "center",
              background: T.panelBg, border: `1px solid ${T.border}`,
              borderRadius: 12, color: T.muted,
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6, color: T.text }}>
                Nessun professionista ospite registrato
              </div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                Vai in Impostazioni → Team per aggiungere il primo ospite.
              </div>
            </div>
          ) : (
            <div className="oi-grid">
              {guests.map(g => {
                const guestColor = g.display_color || "#DB2777";
                return (
                  <div
                    key={g.id}
                    className="oi-card"
                    onClick={() => router.push(`/ospiti/${g.id}`)}
                    style={{ borderLeft: `4px solid ${guestColor}` }}
                  >
                    {/* Header card */}
                    <div style={{
                      padding: "16px 18px",
                      borderBottom: `1px solid ${T.borderSoft}`,
                      display: "flex", alignItems: "center", gap: 12,
                    }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: "50%",
                        background: guestColor, color: T.white,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 15, fontWeight: 800,
                        flexShrink: 0,
                      }}>
                        {g.first_name[0]}{g.last_name[0]}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 15, fontWeight: 800, color: T.text,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {g.first_name} {g.last_name}
                        </div>
                        <div style={{
                          fontSize: 12, color: T.mutedSoft, fontWeight: 600,
                          marginTop: 1,
                        }}>
                          {g.specialty}
                        </div>
                      </div>
                      <ChevronRight size={18} color={T.mutedXSoft} style={{ flexShrink: 0 }} />
                    </div>

                    {/* Statistiche */}
                    <div style={{
                      padding: "14px 18px",
                      display: "grid", gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}>
                      <div>
                        <div style={{ fontSize: 10, color: T.mutedSoft, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>
                          Questo mese
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: T.blue, lineHeight: 1 }}>
                          {g.monthAppts}
                        </div>
                        <div style={{ fontSize: 11, color: T.mutedSoft, fontWeight: 600, marginTop: 2 }}>
                          {g.monthDays} giorn{g.monthDays === 1 ? "o" : "i"}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: T.mutedSoft, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>
                          Prossimo
                        </div>
                        <div style={{
                          fontSize: 13, fontWeight: 800, color: T.text, lineHeight: 1.2,
                          marginTop: 1,
                        }}>
                          {fmtNextAppt(g.nextAppt)}
                        </div>
                      </div>
                    </div>

                    {/* Note (se presenti) */}
                    {g.notes && (
                      <div style={{
                        padding: "10px 18px 14px",
                        fontSize: 11, color: T.mutedSoft, fontWeight: 500,
                        borderTop: `1px solid ${T.borderSoft}`,
                        fontStyle: "italic", lineHeight: 1.4,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}>
                        {g.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
