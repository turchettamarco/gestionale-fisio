// ═══════════════════════════════════════════════════════════════════════
// RoomOccupancyReport.tsx — Occupazione per stanza e per sede (Tappa M)
// ═══════════════════════════════════════════════════════════════════════
// OccupancyReport risponde a "quanto è pieno lo studio". Questo risponde
// a due domande diverse, che nascono quando hai più box o più sedi:
//   • quale stanza rende e quale resta vuota
//   • quale sede è satura e quale ha margine
//
// METODO (dichiarato, niente magia):
//   ore occupate = somma delle durate delle sedute non annullate
//   ore disponibili = ore di apertura dello studio nel periodo × 1 stanza
//   riempimento = occupate / disponibili
// Le ore di apertura sono quelle dello studio (working_hours): finché non
// esistono orari per sede, la percentuale della singola sede va letta come
// "rispetto all'apertura complessiva".
//
// Le sedute senza stanza (domicili, o studi che non usano le stanze)
// vengono mostrate a parte invece di essere spalmate: gonfiare i numeri
// delle stanze reali renderebbe il report inutile.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { translateError } from "@/src/lib/translateError";

const THEME = {
  border: "#e2e8f0",
  text: "#334155",
  muted: "#64748b",
  soft: "#f8fafc",
  accent: "#0f766e",
};

type Props = {
  studioId: string;
  from: Date;
  to: Date;
};

type Bucket = {
  id: string;
  name: string;
  color: string;
  sessions: number;
  minutes: number;
};

export default function RoomOccupancyReport({ studioId, from, to }: Props) {
  const [rooms, setRooms] = useState<Bucket[]>([]);
  const [locations, setLocations] = useState<Bucket[]>([]);
  const [openHours, setOpenHours] = useState(0);
  /** Ore di apertura per sede (mig. 077): denominatore esatto se configurato. */
  const [locationHours, setLocationHours] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"rooms" | "locations">("rooms");

  const load = useCallback(async () => {
    if (!studioId) return;
    setLoading(true); setError("");

    const startISO = from.toISOString();
    const endISO = to.toISOString();

    const [appts, roomRows, locRows, wh, whLoc] = await Promise.all([
      supabase
        .from("appointments")
        .select("room_id, location_id, start_at, end_at")
        .eq("studio_id", studioId)
        .neq("status", "cancelled")
        .gte("start_at", startISO)
        .lte("start_at", endISO),
      supabase
        .from("studio_rooms")
        .select("id, name, color, is_active")
        .eq("studio_id", studioId),
      supabase
        .from("studio_locations")
        .select("id, name, is_primary")
        .eq("studio_id", studioId),
      supabase
        .from("working_hours")
        .select("day_of_week, open_time, close_time, is_open")
        .is("location_id", null)
        .eq("studio_id", studioId),
      // Orari per sede (mig. 077): quando esistono, la percentuale della
      // singola sede si confronta col SUO orario, non con quello di studio.
      supabase
        .from("working_hours")
        .select("location_id, day_of_week, open_time, close_time, is_open")
        .not("location_id", "is", null)
        .eq("studio_id", studioId),
    ]);

    if (appts.error) { setLoading(false); setError(translateError(appts.error)); return; }

    // ── Ore di apertura nel periodo ────────────────────────────────────
    const byDow = new Map<number, { o: string; c: string; on: boolean }>();
    for (const r of (wh.data ?? []) as Array<{ day_of_week: number; open_time: string; close_time: string; is_open: boolean }>) {
      byDow.set(r.day_of_week, { o: r.open_time, c: r.close_time, on: r.is_open });
    }
    const toMin = (t: string) => {
      const [h, m] = (t || "0:0").split(":").map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    let totalOpenMin = 0;
    const cur = new Date(from);
    cur.setHours(0, 0, 0, 0);
    const last = new Date(to);
    while (cur <= last) {
      const d = byDow.get(cur.getDay());
      if (d?.on) totalOpenMin += Math.max(toMin(d.c) - toMin(d.o), 0);
      cur.setDate(cur.getDate() + 1);
    }
    setOpenHours(totalOpenMin / 60);

    // Ore di apertura per singola sede, se configurate.
    const perLoc = new Map<string, Map<number, { o: string; c: string; on: boolean }>>();
    for (const r of (whLoc.data ?? []) as Array<{ location_id: string; day_of_week: number; open_time: string; close_time: string; is_open: boolean }>) {
      let m = perLoc.get(r.location_id);
      if (!m) { m = new Map(); perLoc.set(r.location_id, m); }
      m.set(r.day_of_week, { o: r.open_time, c: r.close_time, on: r.is_open });
    }
    const locHours = new Map<string, number>();
    for (const [locId, days] of perLoc) {
      let mins = 0;
      const c2 = new Date(from); c2.setHours(0, 0, 0, 0);
      while (c2 <= last) {
        const d = days.get(c2.getDay());
        if (d?.on) mins += Math.max(toMin(d.c) - toMin(d.o), 0);
        c2.setDate(c2.getDate() + 1);
      }
      locHours.set(locId, mins / 60);
    }
    setLocationHours(locHours);

    // ── Aggregazione ───────────────────────────────────────────────────
    const roomMeta = new Map<string, { name: string; color: string }>();
    for (const r of (roomRows.data ?? []) as Array<{ id: string; name: string; color: string | null }>) {
      roomMeta.set(r.id, { name: r.name, color: r.color || "#64748b" });
    }
    const locMeta = new Map<string, { name: string; primary: boolean }>();
    for (const l of (locRows.data ?? []) as Array<{ id: string; name: string; is_primary: boolean }>) {
      locMeta.set(l.id, { name: l.name, primary: l.is_primary });
    }

    const rAcc = new Map<string, Bucket>();
    const lAcc = new Map<string, Bucket>();

    for (const a of (appts.data ?? []) as Array<{ room_id: string | null; location_id: string | null; start_at: string; end_at: string }>) {
      const mins = Math.max(
        Math.round((new Date(a.end_at).getTime() - new Date(a.start_at).getTime()) / 60000),
        0
      );

      const rid = a.room_id ?? "__none__";
      const rm = a.room_id ? roomMeta.get(a.room_id) : null;
      let rb = rAcc.get(rid);
      if (!rb) {
        rb = {
          id: rid,
          name: rm?.name ?? "Senza stanza",
          color: rm?.color ?? "#cbd5e1",
          sessions: 0, minutes: 0,
        };
        rAcc.set(rid, rb);
      }
      rb.sessions += 1; rb.minutes += mins;

      const lid = a.location_id ?? "__none__";
      const lm = a.location_id ? locMeta.get(a.location_id) : null;
      let lb = lAcc.get(lid);
      if (!lb) {
        lb = {
          id: lid,
          name: lm ? `${lm.name}${lm.primary ? " (principale)" : ""}` : "Senza sede / domicilio",
          color: "#0f766e",
          sessions: 0, minutes: 0,
        };
        lAcc.set(lid, lb);
      }
      lb.sessions += 1; lb.minutes += mins;
    }

    // Stanze attive mai usate: vanno mostrate a zero, è il dato interessante.
    for (const [id, meta] of roomMeta) {
      if (!rAcc.has(id)) rAcc.set(id, { id, name: meta.name, color: meta.color, sessions: 0, minutes: 0 });
    }

    setRooms(Array.from(rAcc.values()).sort((a, b) => b.minutes - a.minutes));
    setLocations(Array.from(lAcc.values()).sort((a, b) => b.minutes - a.minutes));
    setLoading(false);
  }, [studioId, from, to]);

  useEffect(() => { void load(); }, [load]);

  const list = tab === "rooms" ? rooms : locations;
  const maxMin = useMemo(() => Math.max(...list.map(b => b.minutes), 1), [list]);

  const fmtH = (min: number) => {
    const h = Math.floor(min / 60), m = min % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  };

  return (
    <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, background: "#fff", padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: THEME.text }}>Occupazione per stanza e sede</div>
          <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 2 }}>
            Quale spazio rende e quale resta vuoto, nel periodo selezionato.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["rooms", "locations"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "5px 12px", borderRadius: 7,
                border: `1.5px solid ${tab === t ? "#334155" : THEME.border}`,
                background: tab === t ? "#334155" : "#fff",
                color: tab === t ? "#fff" : THEME.text,
                fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {t === "rooms" ? "Stanze" : "Sedi"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{
          padding: "9px 11px", borderRadius: 8, marginBottom: 10,
          background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)",
          color: "#7f1d1d", fontSize: 12, fontWeight: 600,
        }}>{error}</div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: THEME.muted, padding: 10 }}>Calcolo…</div>
      ) : list.length === 0 ? (
        <div style={{ fontSize: 12, color: THEME.muted, padding: 10 }}>
          Nessuna seduta nel periodo selezionato.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {list.map(b => {
              const pctOfMax = Math.round((b.minutes / maxMin) * 100);
              // Denominatore: orario della sede se configurato, altrimenti
              // orario complessivo dello studio.
              const denom = tab === "locations" ? (locationHours.get(b.id) ?? openHours) : openHours;
              const fill = denom > 0 ? (b.minutes / 60 / denom) * 100 : null;
              return (
                <div key={b.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: b.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: THEME.text, flex: 1, minWidth: 0 }}>
                      {b.name}
                    </span>
                    <span style={{ fontSize: 11, color: THEME.muted, whiteSpace: "nowrap" }}>
                      {b.sessions} sedute · {fmtH(b.minutes)}
                    </span>
                    {fill != null && (
                      <span style={{ fontSize: 12, fontWeight: 800, color: THEME.accent, minWidth: 46, textAlign: "right" }}>
                        {Math.round(fill)}%
                      </span>
                    )}
                  </div>
                  <div style={{ height: 7, borderRadius: 99, background: THEME.soft, overflow: "hidden" }}>
                    <div style={{ width: `${pctOfMax}%`, height: "100%", background: b.color, borderRadius: 99, transition: "width 0.25s" }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 11, color: THEME.muted, marginTop: 12, lineHeight: 1.5, paddingTop: 10, borderTop: `1px solid ${THEME.border}` }}>
            La percentuale confronta le ore occupate con l&apos;apertura del periodo
            ({Math.round(openHours)}h di studio{tab === "locations" && locationHours.size > 0 ? ", o l'orario della singola sede dove impostato" : ""}).
            {tab === "rooms"
              ? " Una stanza sopra il 70% è satura; sotto il 30% vale la pena chiedersi se serve."
              : " Le sedute a domicilio non hanno sede e sono contate a parte."}
          </div>
        </>
      )}
    </div>
  );
}
