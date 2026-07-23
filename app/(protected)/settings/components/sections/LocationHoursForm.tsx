// ═══════════════════════════════════════════════════════════════════════
// LocationHoursForm.tsx — Orari di apertura per sede (mig. 077)
// ═══════════════════════════════════════════════════════════════════════
// Una sede senza righe proprie segue l'orario dello studio. Salvando qui
// si imposta un orario dedicato: è il caso della sede secondaria aperta
// solo in alcuni giorni o pomeriggi.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

const DAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
// day_of_week in DB: 0 = domenica (convenzione JS Date.getDay())
const DOW = [1, 2, 3, 4, 5, 6, 0];

const THEME = {
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  text: "#334155",
  muted: "#64748b",
  soft: "#f8fafc",
  accent: "#0f766e",
};

type Props = {
  studioId: string;
  locationId: string;
  locationName: string;
  onClose: () => void;
};

type Row = { open: string; close: string; on: boolean };

export default function LocationHoursForm({ studioId, locationId, locationName, onClose }: Props) {
  const [rows, setRows] = useState<Record<number, Row>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inherits, setInherits] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Orario della sede, se già configurato…
      const { data } = await supabase
        .from("working_hours")
        .select("day_of_week, open_time, close_time, is_open")
        .eq("studio_id", studioId)
        .eq("location_id", locationId);

      const base: Record<number, Row> = {};
      for (const d of DOW) base[d] = { open: "09:00", close: "19:00", on: d !== 0 && d !== 6 };

      if (data && data.length > 0) {
        setInherits(false);
        for (const r of data as Array<{ day_of_week: number; open_time: string; close_time: string; is_open: boolean }>) {
          base[r.day_of_week] = {
            open: (r.open_time || "09:00").slice(0, 5),
            close: (r.close_time || "19:00").slice(0, 5),
            on: r.is_open,
          };
        }
      } else {
        setInherits(true);
        // …altrimenti si parte dall'orario dello studio, così l'utente
        // modifica quello che già conosce invece di un default generico.
        const { data: studioHours } = await supabase
          .from("working_hours")
          .select("day_of_week, open_time, close_time, is_open")
          .eq("studio_id", studioId)
          .is("location_id", null);
        for (const r of (studioHours ?? []) as Array<{ day_of_week: number; open_time: string; close_time: string; is_open: boolean }>) {
          base[r.day_of_week] = {
            open: (r.open_time || "09:00").slice(0, 5),
            close: (r.close_time || "19:00").slice(0, 5),
            on: r.is_open,
          };
        }
      }
      setRows(base);
      setLoading(false);
    })();
  }, [studioId, locationId]);

  const save = useCallback(async () => {
    setSaving(true); setMsg("");
    for (const d of DOW) {
      const r = rows[d];
      if (r?.on && r.open >= r.close) {
        setMsg(`${DAYS[d === 0 ? 6 : d - 1]}: la chiusura deve essere dopo l'apertura.`);
        setSaving(false);
        return;
      }
    }
    const payload = DOW.map(d => ({
      studio_id: studioId,
      location_id: locationId,
      day_of_week: d,
      open_time: rows[d].open,
      close_time: rows[d].close,
      is_open: rows[d].on,
    }));
    const { error } = await supabase
      .from("working_hours")
      .upsert(payload, { onConflict: "studio_id,location_id,day_of_week" });
    setSaving(false);
    if (error) setMsg("Errore: " + error.message);
    else { setInherits(false); setMsg("Orari della sede salvati."); }
  }, [rows, studioId, locationId]);

  const resetToStudio = useCallback(async () => {
    if (!confirm(`Rimuovere l'orario dedicato di ${locationName}? Tornerà a seguire l'orario dello studio.`)) return;
    setSaving(true); setMsg("");
    const { error } = await supabase
      .from("working_hours")
      .delete()
      .eq("studio_id", studioId)
      .eq("location_id", locationId);
    setSaving(false);
    if (error) setMsg("Errore: " + error.message);
    else { setInherits(true); setMsg("Ora segue l'orario dello studio."); }
  }, [studioId, locationId, locationName]);

  const inputS: React.CSSProperties = {
    padding: "5px 7px", borderRadius: 6, border: `1px solid ${THEME.borderStrong}`,
    fontSize: 12, fontFamily: "inherit", color: THEME.text,
  };

  return (
    <div style={{ marginTop: 10, padding: 14, borderRadius: 10, border: `1px solid ${THEME.border}`, background: THEME.soft }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong style={{ fontSize: 13, color: THEME.text }}>Orari di {locationName}</strong>
        <button onClick={onClose} style={{ ...inputS, cursor: "pointer", background: "#fff", fontWeight: 700 }}>Chiudi</button>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: THEME.muted }}>Caricamento…</div>
      ) : (
        <>
          {inherits && (
            <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 10, lineHeight: 1.5 }}>
              Questa sede segue l&apos;orario dello studio (mostrato qui sotto come punto di partenza).
              Salvando le imposti un orario dedicato.
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {DOW.map((d, i) => (
              <div key={d} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, width: 120, fontSize: 12, fontWeight: 600, color: THEME.text }}>
                  <input
                    type="checkbox"
                    checked={rows[d]?.on ?? false}
                    onChange={e => setRows(p => ({ ...p, [d]: { ...p[d], on: e.target.checked } }))}
                  />
                  {DAYS[i]}
                </label>
                <input type="time" value={rows[d]?.open ?? "09:00"} disabled={!rows[d]?.on}
                  onChange={e => setRows(p => ({ ...p, [d]: { ...p[d], open: e.target.value } }))}
                  style={{ ...inputS, opacity: rows[d]?.on ? 1 : 0.45 }} />
                <span style={{ color: THEME.muted, fontSize: 12 }}>–</span>
                <input type="time" value={rows[d]?.close ?? "19:00"} disabled={!rows[d]?.on}
                  onChange={e => setRows(p => ({ ...p, [d]: { ...p[d], close: e.target.value } }))}
                  style={{ ...inputS, opacity: rows[d]?.on ? 1 : 0.45 }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={save} disabled={saving} style={{
              padding: "7px 14px", borderRadius: 7, border: "none",
              background: THEME.accent, color: "#fff", fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}>
              {saving ? "Salvataggio…" : "Salva orari sede"}
            </button>
            {!inherits && (
              <button onClick={resetToStudio} disabled={saving} style={{ ...inputS, cursor: "pointer", background: "#fff", fontWeight: 700 }}>
                Torna all&apos;orario studio
              </button>
            )}
            {msg && (
              <span style={{ fontSize: 11, fontWeight: 600, color: msg.startsWith("Errore") ? "#b91c1c" : THEME.accent }}>{msg}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
