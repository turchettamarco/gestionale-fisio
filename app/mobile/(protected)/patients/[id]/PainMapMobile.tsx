"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/src/lib/supabaseClient";

// ── Tipi ────────────────────────────────────────────────────────────────
type View = "front" | "back" | "right" | "left";
type Intensity = 1 | 2 | 3;
type PainPoint = { id: string; x: number; y: number; view: View; intensity: Intensity };

type SavedMap = {
  id: string;
  data: { points: PainPoint[]; zone?: string; view?: View };
  vas: number | null;
  notes: string | null;
  created_at: string;
};

// L'immagine pubblico dominio (rawpixel) contiene fronte + retro affiancati.
// La mostriamo "ritagliata" via background-position per vista.
const BODY_IMG = "/anatomy/muscular-front-back.jpg";
const SIDE_IMG = "/anatomy/muscular-side.jpg";
// aspect ratio (larghezza/altezza) di ogni vista per non deformare il corpo
const FB_ASPECT = "1 / 3";    // fronte/retro: 400x1200
const SIDE_ASPECT = "0.283 / 1"; // laterale: 340x1200

const INTENSITY_COLOR: Record<Intensity, string> = { 1: "#f59e0b", 2: "#fb923c", 3: "#ef4444" };
const INTENSITY_LABEL: Record<Intensity, string> = { 1: "Lieve", 2: "Medio", 3: "Forte" };

const TEAL = "#0d9488", BLUE = "#2563eb", INK = "#0f172a", BODY = "#475569",
  FAINT = "#94a3b8", LINE = "#e8ecf2", PANEL = "#ffffff", BG = "#f4f7fb";

export default function PainMapMobile({
  patientId, studioId, ownerId, patientName, onClose,
}: {
  patientId: string; studioId: string; ownerId: string;
  patientName: string; onClose: () => void;
}) {
  const [view, setView] = useState<View>("front");
  const [intensity, setIntensity] = useState<Intensity>(2);
  const [erase, setErase] = useState(false);
  const [points, setPoints] = useState<PainPoint[]>([]);
  const [vas, setVas] = useState(5);
  const [notes, setNotes] = useState("");
  const [zone, setZone] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"edit" | "history">("edit");
  const [history, setHistory] = useState<SavedMap[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const imgWrapRef = useRef<HTMLDivElement>(null);

  // ── Carica storico mappe ──
  const loadHistory = useCallback(async () => {
    setLoadingHist(true);
    const { data } = await supabase
      .from("pain_maps")
      .select("id, data, vas, notes, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });
    setHistory((data as SavedMap[]) ?? []);
    setLoadingHist(false);
  }, [patientId]);

  useEffect(() => { if (tab === "history") loadHistory(); }, [tab, loadHistory]);

  // ── Tap sull'immagine: aggiunge o rimuove un punto ──
  const handleTap = (e: React.MouseEvent | React.TouchEvent) => {
    const wrap = imgWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const clientX = "touches" in e ? e.changedTouches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.changedTouches[0].clientY : (e as React.MouseEvent).clientY;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;

    // Se c'è già un punto vicino (nella stessa vista) → rimuovilo
    const HIT = 0.045;
    const near = points.find(p => p.view === view && Math.abs(p.x - x) < HIT && Math.abs(p.y - y) < HIT);
    if (near || erase) {
      if (near) setPoints(ps => ps.filter(p => p.id !== near.id));
      return;
    }
    setPoints(ps => [...ps, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, x, y, view, intensity }]);
  };

  const clearAll = () => setPoints([]);

  // ── Salva la mappa nello storico ──
  const save = async () => {
    if (points.length === 0) return;
    setSaving(true);
    const { error } = await supabase.from("pain_maps").insert({
      patient_id: patientId,
      studio_id: studioId,
      owner_id: ownerId,
      data: { points, zone: zone.trim() || null, view },
      vas,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) { alert("Errore nel salvataggio: " + error.message); return; }
    // reset e passa allo storico
    setPoints([]); setNotes(""); setZone(""); setVas(5);
    setTab("history");
  };

  const deleteMap = async (id: string) => {
    if (!confirm("Eliminare questa mappa del dolore?")) return;
    await supabase.from("pain_maps").delete().eq("id", id);
    setHistory(h => h.filter(m => m.id !== id));
  };

  const visiblePoints = points.filter(p => p.view === view);

  // Stile sfondo per ciascuna vista. Fronte/Retro = metà dell'immagine affiancata;
  // Laterale dx = immagine di profilo; Laterale sx = stessa immagine specchiata.
  const bodyBg = (v: View): React.CSSProperties => {
    if (v === "front") return { backgroundImage: `url(${BODY_IMG})`, backgroundSize: "200% 100%", backgroundPosition: "left center", backgroundRepeat: "no-repeat" };
    if (v === "back") return { backgroundImage: `url(${BODY_IMG})`, backgroundSize: "200% 100%", backgroundPosition: "right center", backgroundRepeat: "no-repeat" };
    // right / left: stessa immagine di profilo, la sinistra specchiata
    return { backgroundImage: `url(${SIDE_IMG})`, backgroundSize: "100% 100%", backgroundPosition: "center", backgroundRepeat: "no-repeat", transform: v === "left" ? "scaleX(-1)" : "none" };
  };
  const aspectFor = (v: View) => (v === "front" || v === "back") ? FB_ASPECT : SIDE_ASPECT;

  return (
    <div style={{
      position: "fixed", inset: 0, background: BG, zIndex: 300,
      display: "flex", flexDirection: "column",
      paddingBottom: "env(safe-area-inset-bottom,0px)",
    }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(100deg,${TEAL},${BLUE})`, padding: "16px 18px 14px", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>🗺 Mappa del dolore</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.18)", border: "none", color: "#fff",
            width: 34, height: 34, borderRadius: 10, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ fontSize: 12, opacity: .9, marginTop: 3 }}>{patientName}</div>
      </div>

      {/* Tab edit / storico */}
      <div style={{ display: "flex", borderBottom: `1px solid ${LINE}`, background: PANEL }}>
        {(["edit", "history"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: "12px 0", border: "none", background: "transparent",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
            color: tab === t ? BLUE : FAINT,
            borderBottom: tab === t ? `2px solid ${BLUE}` : "2px solid transparent",
          }}>{t === "edit" ? "Nuova mappa" : "Storico"}</button>
        ))}
      </div>

      {tab === "edit" ? (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {/* Toggle vista */}
          <div style={{ display: "flex", gap: 6, padding: "12px 16px 4px" }}>
            {([["front", "Fronte"], ["back", "Retro"], ["right", "Lat. Dx"], ["left", "Lat. Sx"]] as [View, string][]).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)} style={{
                flex: 1, padding: "9px 0", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: view === v ? "none" : `1px solid ${LINE}`,
                background: view === v ? `linear-gradient(100deg,${TEAL},${BLUE})` : PANEL,
                color: view === v ? "#fff" : FAINT,
              }}>{label}</button>
            ))}
          </div>

          {/* Immagine corpo con punti */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 8, position: "relative" }}>
            <div
              ref={imgWrapRef}
              onClick={handleTap}
              style={{
                position: "relative", height: "min(52vh, 440px)", aspectRatio: aspectFor(view),
                cursor: "crosshair", userSelect: "none", touchAction: "manipulation",
                borderRadius: 12, overflow: "hidden", background: "#fff",
              }}
            >
              {/* sfondo (eventualmente specchiato per la vista sinistra) */}
              <div style={{ position: "absolute", inset: 0, ...bodyBg(view) }} />
              {/* punti */}
              {visiblePoints.map(p => (
                <div key={p.id} style={{
                  position: "absolute", left: `${p.x * 100}%`, top: `${p.y * 100}%`,
                  width: 22, height: 22, borderRadius: "50%", transform: "translate(-50%,-50%)",
                  background: INTENSITY_COLOR[p.intensity], border: "2px solid #fff",
                  boxShadow: "0 1px 5px rgba(0,0,0,.35)", pointerEvents: "none",
                }} />
              ))}
              {visiblePoints.length > 0 && (
                <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(15,23,42,.78)",
                  color: "#fff", fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 99 }}>
                  {visiblePoints.length} {visiblePoints.length === 1 ? "punto" : "punti"}
                </div>
              )}
            </div>
          </div>

          {/* Strumenti */}
          <div style={{ background: PANEL, borderTop: `1px solid ${LINE}`, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: .4, width: 62 }}>Intensità</span>
              <div style={{ display: "flex", gap: 7, flex: 1 }}>
                {([1, 2, 3] as Intensity[]).map(lv => (
                  <button key={lv} onClick={() => { setIntensity(lv); setErase(false); }} style={{
                    flex: 1, padding: "9px 0", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    border: intensity === lv && !erase ? "none" : `1.5px solid ${LINE}`,
                    background: intensity === lv && !erase ? INTENSITY_COLOR[lv] : "#fff",
                    color: intensity === lv && !erase ? "#fff" : BODY,
                  }}>{INTENSITY_LABEL[lv]}</button>
                ))}
                <button onClick={() => setErase(e => !e)} style={{
                  flex: 1, padding: "9px 0", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  border: erase ? "none" : `1.5px solid ${LINE}`,
                  background: erase ? "#64748b" : "#fff", color: erase ? "#fff" : BODY,
                }}>Cancella</button>
              </div>
            </div>

            {/* VAS */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: .4, width: 62 }}>VAS</span>
              <input type="range" min={0} max={10} value={vas} onChange={e => setVas(Number(e.target.value))}
                style={{ flex: 1, accentColor: BLUE }} />
              <span style={{ fontSize: 16, fontWeight: 800, color: INK, width: 26, textAlign: "right" }}>{vas}</span>
            </div>

            {/* Zona + note */}
            <input value={zone} onChange={e => setZone(e.target.value)} placeholder="Zona principale (es. spalla destra)"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: `1px solid ${LINE}`,
                fontSize: 13, fontFamily: "inherit", marginBottom: 8, boxSizing: "border-box" }} />
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Note (irradiazione, caratteristiche…)"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: `1px solid ${LINE}`,
                fontSize: 13, fontFamily: "inherit", resize: "vertical", marginBottom: 12, boxSizing: "border-box" }} />

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={clearAll} style={{ flex: 1, padding: "13px 0", borderRadius: 11, fontSize: 14, fontWeight: 800,
                border: `1.5px solid ${LINE}`, background: "#fff", color: BODY, cursor: "pointer" }}>Pulisci</button>
              <button onClick={save} disabled={saving || points.length === 0} style={{
                flex: 2, padding: "13px 0", borderRadius: 11, fontSize: 14, fontWeight: 800, border: "none",
                background: points.length === 0 ? "#cbd5e1" : `linear-gradient(100deg,${TEAL},${BLUE})`,
                color: "#fff", cursor: points.length === 0 ? "not-allowed" : "pointer", opacity: saving ? .6 : 1,
              }}>{saving ? "Salvo…" : "💾 Salva nella scheda"}</button>
            </div>
          </div>
        </div>
      ) : (
        /* ── Storico mappe ── */
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
          {loadingHist ? (
            <div style={{ textAlign: "center", color: FAINT, padding: 40, fontSize: 13 }}>Caricamento…</div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: "center", color: FAINT, padding: 40, fontSize: 13 }}>
              Nessuna mappa salvata. Creane una dalla scheda "Nuova mappa".
            </div>
          ) : history.map(m => (
            <div key={m.id} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14,
              padding: 14, marginBottom: 12, display: "flex", gap: 14, alignItems: "center" }}>
              {/* miniatura */}
              <div style={{ position: "relative", height: 96, aspectRatio: aspectFor((m.data?.view as View) ?? "front"), borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "#fff" }}>
                <div style={{ position: "absolute", inset: 0, ...bodyBg((m.data?.view as View) ?? "front") }} />
                {(m.data?.points ?? []).filter(p => p.view === (m.data?.view ?? "front")).map(p => (
                  <div key={p.id} style={{ position: "absolute", left: `${p.x * 100}%`, top: `${p.y * 100}%`,
                    width: 9, height: 9, borderRadius: "50%", transform: "translate(-50%,-50%)",
                    background: INTENSITY_COLOR[p.intensity], border: "1.5px solid #fff" }} />
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: INK }}>
                  {m.data?.zone || "Mappa del dolore"}{m.vas != null ? ` · VAS ${m.vas}` : ""}
                </div>
                <div style={{ fontSize: 12, color: FAINT, marginTop: 3 }}>
                  {new Date(m.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}
                </div>
                {m.notes && <div style={{ fontSize: 12, color: BODY, marginTop: 6 }}>{m.notes}</div>}
                <button onClick={() => deleteMap(m.id)} style={{ marginTop: 8, background: "none", border: "none",
                  color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>Elimina</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
