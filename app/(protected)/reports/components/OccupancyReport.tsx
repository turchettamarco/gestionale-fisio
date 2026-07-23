"use client";

// ═══════════════════════════════════════════════════════════════════════
// OccupancyReport — Occupazione agenda
// ═══════════════════════════════════════════════════════════════════════
//
// Quanto è pieno lo studio nel periodo selezionato: % di riempimento
// rispetto agli orari di apertura reali, ore libere rimaste, media per
// giorno della settimana e per fascia (mattina / pomeriggio / sera).
// È IL dato per decidere orari e prezzi: se il martedì mattina è al 20%
// e il giovedì sera al 95%, sai dove spingere.
//
// Metodo di calcolo (dichiarato, niente magia):
//   • ore di apertura = working_hours dei giorni del periodo, esclusi i
//     giorni chiusi e le festività nazionali;
//   • ore occupate = sovrapposizione degli appuntamenti non cancellati
//     con la finestra di apertura del loro giorno;
//   • se il periodo include giorni futuri, contano anche le prenotazioni
//     già in agenda: è il riempimento del periodo, non solo lo storico.
// ═══════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { italianHoliday } from "@/src/lib/holidays";

const T = {
  teal: "#0d9488", text: "#0f172a", muted: "#64748b", soft: "#f8fafc",
  border: "#e2e8f0", borderSoft: "#eef2f7", green: "#16a34a",
  amber: "#f59e0b", red: "#dc2626",
};

const DOW_LABEL = ["DOM", "LUN", "MAR", "MER", "GIO", "VEN", "SAB"];

type WH = { day_of_week: number; is_open: boolean; open_time: string; close_time: string };

const toMin = (t: string | null | undefined): number | null => {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
};
const fmtH = (min: number) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h}h ${m}′` : `${h}h`;
};

export default function OccupancyReport({
  studioId, from, to, compact = false,
}: {
  studioId: string;
  from: Date;
  to: Date;
  /** Layout stretto per i report mobile. */
  compact?: boolean;
}) {
  const [wh, setWh] = useState<WH[] | null>(null);
  const [appts, setAppts] = useState<{ s: Date; e: Date }[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!studioId) return;
    let dead = false;
    setLoading(true);
    (async () => {
      const [whRes, apRes] = await Promise.all([
        supabase.from("working_hours")
          .select("day_of_week, is_open, open_time, close_time")
          .is("location_id", null)
          .eq("studio_id", studioId),
        supabase.from("appointments")
          .select("start_at, end_at")
          .eq("studio_id", studioId)
          .gte("start_at", from.toISOString())
          .lte("start_at", to.toISOString())
          .neq("status", "cancelled"),
      ]);
      if (dead) return;
      setWh((whRes.data as WH[]) || []);
      setAppts(((apRes.data as { start_at: string; end_at: string }[]) || [])
        .map(a => ({ s: new Date(a.start_at), e: new Date(a.end_at) })));
      setLoading(false);
    })();
    return () => { dead = true; };
  }, [studioId, from, to]);

  const stats = useMemo(() => {
    if (!wh || !appts) return null;
    if (!wh.some(w => w.is_open)) return { noHours: true } as const;

    // Appuntamenti indicizzati per giorno
    const byDay = new Map<string, { s: Date; e: Date }[]>();
    appts.forEach(a => {
      const k = `${a.s.getFullYear()}-${a.s.getMonth()}-${a.s.getDate()}`;
      const arr = byDay.get(k) || [];
      arr.push(a); byDay.set(k, arr);
    });

    let totOpen = 0, totBusy = 0;
    const perDow = new Map<number, { open: number; busy: number }>();
    // Fasce: mattina fino alle 13, pomeriggio 13–17, sera dalle 17
    const fasce = { am: { open: 0, busy: 0 }, pm: { open: 0, busy: 0 }, eve: { open: 0, busy: 0 } };
    const F_AM_END = 13 * 60, F_PM_END = 17 * 60;

    const overlap = (a1: number, a2: number, b1: number, b2: number) =>
      Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

    const cur = new Date(from);
    cur.setHours(12, 0, 0, 0);
    const end = new Date(to);
    while (cur <= end) {
      const w = wh.find(x => x.day_of_week === cur.getDay());
      const festa = italianHoliday(cur);
      if (w?.is_open && !festa) {
        const o = toMin(w.open_time), c = toMin(w.close_time);
        if (o != null && c != null && c > o) {
          const openLen = c - o;
          totOpen += openLen;
          const slot = perDow.get(cur.getDay()) || { open: 0, busy: 0 };
          slot.open += openLen;

          fasce.am.open += overlap(o, c, 0, F_AM_END);
          fasce.pm.open += overlap(o, c, F_AM_END, F_PM_END);
          fasce.eve.open += overlap(o, c, F_PM_END, 24 * 60);

          const k = `${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`;
          for (const a of byDay.get(k) || []) {
            const s = a.s.getHours() * 60 + a.s.getMinutes();
            const e = a.e.getHours() * 60 + a.e.getMinutes();
            const busy = overlap(s, e, o, c);
            if (busy <= 0) continue;
            totBusy += busy;
            slot.busy += busy;
            fasce.am.busy += overlap(s, e, Math.max(o, 0), Math.min(c, F_AM_END));
            fasce.pm.busy += overlap(s, e, Math.max(o, F_AM_END), Math.min(c, F_PM_END));
            fasce.eve.busy += overlap(s, e, Math.max(o, F_PM_END), c);
          }
          perDow.set(cur.getDay(), slot);
        }
      }
      cur.setDate(cur.getDate() + 1);
    }

    if (totOpen === 0) return { noHours: true } as const;

    const pct = Math.round((totBusy / totOpen) * 100);
    const dows = [1, 2, 3, 4, 5, 6, 0]
      .filter(d => perDow.has(d))
      .map(d => {
        const v = perDow.get(d)!;
        return { dow: d, pct: v.open ? Math.round((v.busy / v.open) * 100) : 0 };
      });
    const fascePct = {
      am: fasce.am.open ? Math.round((fasce.am.busy / fasce.am.open) * 100) : null,
      pm: fasce.pm.open ? Math.round((fasce.pm.busy / fasce.pm.open) * 100) : null,
      eve: fasce.eve.open ? Math.round((fasce.eve.busy / fasce.eve.open) * 100) : null,
    };
    return { noHours: false, pct, totOpen, totBusy, free: totOpen - totBusy, dows, fascePct } as const;
  }, [wh, appts, from, to]);

  const pctColor = (p: number) => (p >= 75 ? T.green : p >= 45 ? T.amber : T.red);

  return (
    <div style={{
      background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 14,
      padding: compact ? "13px 14px" : "16px 18px",
    }}>
      <div style={{ fontSize: compact ? 13 : 14, fontWeight: 800, color: T.text }}>
        Occupazione agenda
      </div>
      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
        Riempimento rispetto agli orari di apertura (festivi esclusi)
      </div>

      {loading && !stats && (
        <div style={{ padding: 18, textAlign: "center", color: T.muted, fontSize: 12 }}>Calcolo…</div>
      )}

      {stats?.noHours && (
        <div style={{ padding: "16px 4px 6px", color: T.muted, fontSize: 12.5, lineHeight: 1.5 }}>
          Imposta gli orari di apertura nelle Impostazioni per vedere l&apos;occupazione.
        </div>
      )}

      {stats && !stats.noHours && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: compact ? 30 : 36, fontWeight: 800, color: pctColor(stats.pct), lineHeight: 1 }}>
              {stats.pct}%
            </span>
            <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>
              {fmtH(stats.totBusy)} occupate su {fmtH(stats.totOpen)} · <strong style={{ color: T.text }}>{fmtH(stats.free)} libere</strong>
            </span>
          </div>

          {/* Barre per giorno della settimana */}
          <div style={{ display: "flex", gap: compact ? 6 : 10, alignItems: "flex-end", marginTop: 14 }}>
            {stats.dows.map(({ dow, pct }) => (
              <div key={dow} style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: T.text, lineHeight: 1.4 }}>{pct}%</div>
                <div style={{ height: compact ? 44 : 56, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  <div style={{
                    width: compact ? 14 : 20,
                    height: `${Math.max(pct ? 6 : 2, Math.round((pct / 100) * (compact ? 44 : 56)))}px`,
                    background: pct ? T.teal : T.borderSoft,
                    borderRadius: 4, opacity: .9,
                  }} />
                </div>
                <div style={{ fontSize: 8.5, fontWeight: 800, color: T.muted }}>{DOW_LABEL[dow]}</div>
              </div>
            ))}
          </div>

          {/* Fasce orarie */}
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {([["Mattina", stats.fascePct.am], ["Pomeriggio", stats.fascePct.pm], ["Sera", stats.fascePct.eve]] as const)
              .filter(([, v]) => v !== null)
              .map(([label, v]) => (
                <span key={label} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  border: `1px solid ${T.border}`, borderRadius: 999,
                  padding: "5px 11px", fontSize: 11, fontWeight: 700, color: "#475569",
                  background: "#fff",
                }}>
                  {label}
                  <strong style={{ color: pctColor(v as number) }}>{v}%</strong>
                </span>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
