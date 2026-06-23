"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/src/lib/supabaseClient";

// ── Tipi ────────────────────────────────────────────────────────────────
type View = "front" | "back" | "right" | "left";
type Intensity = 1 | 2 | 3;
type PainPoint = { id: string; x: number; y: number; view: View; intensity: Intensity };
// Catena di irradiazione: sequenza di tappe (x,y normalizzati) su una vista
type RadChain = { id: string; view: View; nodes: { x: number; y: number }[] };

type SavedMap = {
  id: string;
  data: { points: PainPoint[]; chains?: RadChain[]; zone?: string; view?: View };
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

export default function PainMap({
  patientId, studioId, ownerId, patientName, onClose, embedded = false,
}: {
  patientId: string; studioId: string; ownerId: string;
  patientName: string; onClose?: () => void; embedded?: boolean;
}) {
  const [view, setView] = useState<View>("front");
  const [intensity, setIntensity] = useState<Intensity>(2);
  const [erase, setErase] = useState(false);
  const [radMode, setRadMode] = useState(false);          // modalità irradiazione (catena di tap)
  const [points, setPoints] = useState<PainPoint[]>([]);
  const [chains, setChains] = useState<RadChain[]>([]);   // catene completate
  const [activeChain, setActiveChain] = useState<RadChain | null>(null); // catena in costruzione
  const [vas, setVas] = useState(5);
  const [notes, setNotes] = useState("");
  const [zone, setZone] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"edit" | "history">("edit");
  const [history, setHistory] = useState<SavedMap[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [viewing, setViewing] = useState<SavedMap | null>(null);   // mappa aperta a schermo intero
  const [viewerView, setViewerView] = useState<View>("front");
  const [saveSheet, setSaveSheet] = useState(false);               // pannello "Salva" (VAS/zona/note)
  const [pair, setPair] = useState<"ap" | "lat">("ap");            // desktop: antero-posteriore | laterali

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

  // ── Tap su una tela: aggiunge/rimuove un punto sulla vista di quella tela ──
  const handleTapOn = (tv: View, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;

    if (radMode) {
      setActiveChain(c => {
        if (c && c.view === tv) return { ...c, nodes: [...c.nodes, { x, y }] };
        if (c && c.nodes.length >= 2) setChains(cs => [...cs, c]);
        return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, view: tv, nodes: [{ x, y }] };
      });
      return;
    }

    const HIT = 0.045;
    const near = points.find(p => p.view === tv && Math.abs(p.x - x) < HIT && Math.abs(p.y - y) < HIT);
    if (near || erase) {
      if (near) setPoints(ps => ps.filter(p => p.id !== near.id));
      return;
    }
    setPoints(ps => [...ps, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, x, y, view: tv, intensity }]);
  };

  // Chiude la catena di irradiazione in costruzione
  const endChain = () => {
    setActiveChain(c => {
      if (c && c.nodes.length >= 2) setChains(cs => [...cs, c]);
      return null;
    });
  };

  const clearAll = () => { setPoints([]); setChains([]); setActiveChain(null); };

  // ── Salva la mappa nello storico ──
  const save = async () => {
    // chiudo eventuale catena in costruzione
    const allChains = activeChain && activeChain.nodes.length >= 2 ? [...chains, activeChain] : chains;
    if (points.length === 0 && allChains.length === 0) return;
    setSaving(true);
    const { error } = await supabase.from("pain_maps").insert({
      patient_id: patientId,
      studio_id: studioId,
      owner_id: ownerId,
      data: { points, chains: allChains, zone: zone.trim() || null, view: embedded ? (pair === "ap" ? "front" : "right") : view },
      vas,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) { alert("Errore nel salvataggio: " + error.message); return; }
    // reset e passa allo storico
    setPoints([]); setChains([]); setActiveChain(null); setNotes(""); setZone(""); setVas(5);
    setSaveSheet(false);
    setTab("history");
  };

  const deleteMap = async (id: string) => {
    if (!confirm("Eliminare questa mappa del dolore?")) return;
    await supabase.from("pain_maps").delete().eq("id", id);
    setHistory(h => h.filter(m => m.id !== id));
  };

  const VIEW_LABEL: Record<View, string> = { front: "Fronte", back: "Retro", right: "Lat. Dx", left: "Lat. Sx" };

  // Stile sfondo per ciascuna vista. Fronte/Retro = metà dell'immagine affiancata;
  // Laterale dx = immagine di profilo; Laterale sx = stessa immagine specchiata.
  const bodyBg = (v: View): React.CSSProperties => {
    if (v === "front") return { backgroundImage: `url(${BODY_IMG})`, backgroundSize: "200% 100%", backgroundPosition: "left center", backgroundRepeat: "no-repeat" };
    if (v === "back") return { backgroundImage: `url(${BODY_IMG})`, backgroundSize: "200% 100%", backgroundPosition: "right center", backgroundRepeat: "no-repeat" };
    // right / left: stessa immagine di profilo, la sinistra specchiata
    return { backgroundImage: `url(${SIDE_IMG})`, backgroundSize: "100% 100%", backgroundPosition: "center", backgroundRepeat: "no-repeat", transform: v === "left" ? "scaleX(-1)" : "none" };
  };
  const aspectFor = (v: View) => (v === "front" || v === "back") ? FB_ASPECT : SIDE_ASPECT;

  // Tela tappabile per UNA vista. `size` controlla come si dimensiona (per cella o a tutta altezza).
  const renderCanvas = (cv: View, size: React.CSSProperties) => {
    const pts = points.filter(p => p.view === cv);
    const chs = [...chains, ...(activeChain ? [activeChain] : [])].filter(c => c.view === cv);
    return (
      <div key={cv} onClick={(e) => handleTapOn(cv, e)} style={{
        position: "relative", ...size, aspectRatio: aspectFor(cv),
        cursor: radMode ? "copy" : erase ? "not-allowed" : "crosshair",
        userSelect: "none", touchAction: "manipulation",
        borderRadius: 12, overflow: "hidden", background: "#fff", border: `1px solid ${LINE}`,
      }}>
        <div style={{ position: "absolute", inset: 0, ...bodyBg(cv) }} />
        {chs.length > 0 && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            <defs>
              <marker id={`radArrow-${cv}`} markerWidth="5" markerHeight="5" refX="3.5" refY="2.5" orient="auto">
                <path d="M0,0 L5,2.5 L0,5 Z" fill="#7c3aed" />
              </marker>
            </defs>
            {chs.map(c => (
              <polyline key={c.id} points={c.nodes.map(n => `${n.x * 100},${n.y * 100}`).join(" ")}
                fill="none" stroke="#7c3aed" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="2.5 1.5" markerEnd={`url(#radArrow-${cv})`} vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
        )}
        {chs.flatMap(c => c.nodes.map((n, i) => (
          <div key={`${c.id}-${i}`} style={{ position: "absolute", left: `${n.x * 100}%`, top: `${n.y * 100}%`,
            width: 11, height: 11, borderRadius: "50%", transform: "translate(-50%,-50%)",
            background: "#7c3aed", border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)", pointerEvents: "none" }} />
        )))}
        {pts.map(p => (
          <div key={p.id} style={{ position: "absolute", left: `${p.x * 100}%`, top: `${p.y * 100}%`,
            width: 22, height: 22, borderRadius: "50%", transform: "translate(-50%,-50%)",
            background: INTENSITY_COLOR[p.intensity], border: "2px solid #fff",
            boxShadow: "0 1px 5px rgba(0,0,0,.35)", pointerEvents: "none" }} />
        ))}
        <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(15,23,42,.72)",
          color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 99 }}>
          {VIEW_LABEL[cv]}{pts.length > 0 ? ` · ${pts.length}` : ""}
        </div>
      </div>
    );
  };

  return (
    <div style={embedded ? {
      position: "relative", background: "transparent",
      display: "flex", flexDirection: "column",
      height: "min(80vh, 780px)",
    } : {
      position: "fixed", inset: 0, background: BG, zIndex: 300,
      display: "flex", flexDirection: "column",
      paddingBottom: "env(safe-area-inset-bottom,0px)",
    }}>
      {/* Header (solo a schermo intero; in embedded il titolo lo dà già la sezione pagina) */}
      {!embedded && (
        <div style={{ background: `linear-gradient(100deg,${TEAL},${BLUE})`, padding: "16px 18px 14px", color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>🗺 Mappa del dolore</div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,.18)", border: "none", color: "#fff",
              width: 34, height: 34, borderRadius: 10, fontSize: 18, cursor: "pointer" }}>✕</button>
          </div>
          <div style={{ fontSize: 12, opacity: .9, marginTop: 3 }}>{patientName}</div>
        </div>
      )}

      {/* Tab edit / storico */}
      <div style={{ display: "flex", borderBottom: `1px solid ${LINE}`, background: PANEL,
        borderRadius: embedded ? "10px 10px 0 0" : undefined }}>
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
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>

          {/* Toggle vista */}
          <div style={{ display: "flex", gap: 6, padding: "12px 14px 6px" }}>
            {embedded
              ? ([["ap", "Antero-posteriore"], ["lat", "Laterali"]] as [typeof pair, string][]).map(([p, label]) => (
                  <button key={p} onClick={() => setPair(p)} style={{
                    flex: 1, padding: "9px 0", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    border: pair === p ? "none" : `1px solid ${LINE}`,
                    background: pair === p ? `linear-gradient(100deg,${TEAL},${BLUE})` : PANEL,
                    color: pair === p ? "#fff" : FAINT,
                  }}>{label}</button>
                ))
              : (["front", "back", "right", "left"] as View[]).map(v => (
                  <button key={v} onClick={() => setView(v)} style={{
                    flex: 1, padding: "9px 0", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    border: view === v ? "none" : `1px solid ${LINE}`,
                    background: view === v ? `linear-gradient(100deg,${TEAL},${BLUE})` : PANEL,
                    color: view === v ? "#fff" : FAINT,
                  }}>{VIEW_LABEL[v]}</button>
                ))}
          </div>

          {/* Figure — riempiono lo spazio. Desktop: 2 viste affiancate grandi; mobile: 1. */}
          <div style={{
            flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center",
            gap: embedded ? 24 : 0, padding: embedded ? "12px 20px 12px" : "2px 8px 8px", overflow: "hidden",
          }}>
            {embedded
              ? (pair === "ap" ? (["front", "back"] as View[]) : (["right", "left"] as View[]))
                  .map(cv => renderCanvas(cv, { height: "100%" }))
              : renderCanvas(view, { height: "100%", maxWidth: "100%" })}
          </div>

          {/* ===== Comandi: un'unica riga sotto la mappa ===== */}
          <div style={{ flexShrink: 0, background: PANEL, borderTop: `1px solid ${LINE}`,
            padding: "10px 16px calc(10px + env(safe-area-inset-bottom,0px))",
            display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>

            {/* Intensità + gomma */}
            <div style={{ display: "flex", gap: 6 }}>
              {([1, 2, 3] as Intensity[]).map(lv => (
                <button key={lv} onClick={() => { setIntensity(lv); setErase(false); setRadMode(false); }} style={{
                  padding: "9px 16px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  border: intensity === lv && !erase && !radMode ? "none" : `1.5px solid ${LINE}`,
                  background: intensity === lv && !erase && !radMode ? INTENSITY_COLOR[lv] : "#fff",
                  color: intensity === lv && !erase && !radMode ? "#fff" : BODY,
                }}>{INTENSITY_LABEL[lv]}</button>
              ))}
              <button onClick={() => { setErase(e => !e); setRadMode(false); }} style={{
                padding: "9px 16px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer",
                border: erase ? "none" : `1.5px solid ${LINE}`,
                background: erase ? "#64748b" : "#fff", color: erase ? "#fff" : BODY,
              }}>Gomma</button>
            </div>

            {/* Separatore */}
            <div style={{ width: 1, alignSelf: "stretch", background: LINE }} />

            {/* Irradiazione + fine */}
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { setRadMode(m => !m); setErase(false); }} style={{
                padding: "9px 16px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer",
                border: radMode ? "none" : `1.5px solid ${LINE}`,
                background: radMode ? "#7c3aed" : "#fff", color: radMode ? "#fff" : BODY,
              }}>{radMode ? "Tocca le tappe…" : "Irradiazione"}</button>
              <button onClick={endChain} disabled={!activeChain || activeChain.nodes.length < 2} style={{
                padding: "9px 16px", borderRadius: 9, fontSize: 13, fontWeight: 700,
                border: `1.5px solid ${LINE}`, background: "#fff", color: BODY,
                cursor: (!activeChain || activeChain.nodes.length < 2) ? "not-allowed" : "pointer",
                opacity: (!activeChain || activeChain.nodes.length < 2) ? 0.5 : 1,
              }}>Fine</button>
            </div>

            {/* Azioni (spinte a destra) */}
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              <button onClick={clearAll} style={{ padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 800,
                border: `1.5px solid ${LINE}`, background: "#fff", color: BODY, cursor: "pointer" }}>Pulisci</button>
              {(() => {
                const hasContent = points.length > 0 || chains.length > 0 || (activeChain?.nodes.length ?? 0) >= 2;
                return (
                  <button onClick={() => setSaveSheet(true)} disabled={!hasContent} style={{
                    padding: "9px 22px", borderRadius: 10, fontSize: 13, fontWeight: 800, border: "none",
                    background: !hasContent ? "#cbd5e1" : `linear-gradient(100deg,${TEAL},${BLUE})`,
                    color: "#fff", cursor: !hasContent ? "not-allowed" : "pointer",
                  }}>💾 Salva</button>
                );
              })()}
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
              {/* miniatura → tocca per aprire a schermo intero */}
              <div onClick={() => { setViewerView((m.data?.view as View) ?? "front"); setViewing(m); }}
                title="Apri a schermo intero"
                style={{ position: "relative", height: 96, aspectRatio: aspectFor((m.data?.view as View) ?? "front"), borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "#fff", cursor: "pointer", border: `1px solid ${LINE}` }}>
                <div style={{ position: "absolute", inset: 0, ...bodyBg((m.data?.view as View) ?? "front") }} />
                {(m.data?.chains ?? []).filter(c => c.view === (m.data?.view ?? "front")).length > 0 && (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                    {(m.data?.chains ?? []).filter(c => c.view === (m.data?.view ?? "front")).map(c => (
                      <polyline key={c.id} points={c.nodes.map(n => `${n.x * 100},${n.y * 100}`).join(" ")}
                        fill="none" stroke="#7c3aed" strokeWidth="1.4" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
                    ))}
                  </svg>
                )}
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
                <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                  <button onClick={() => { setViewerView((m.data?.view as View) ?? "front"); setViewing(m); }}
                    style={{ background: "none", border: "none", color: BLUE, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>Apri grande</button>
                  <button onClick={() => deleteMap(m.id)} style={{ background: "none", border: "none",
                    color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>Elimina</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Visualizzatore mappa a schermo intero ── */}
      {viewing && (() => {
        const vPoints = (viewing.data?.points ?? []).filter(p => p.view === viewerView);
        const vChains = (viewing.data?.chains ?? []).filter(c => c.view === viewerView);
        const countFor = (v: View) =>
          (viewing.data?.points ?? []).filter(p => p.view === v).length +
          (viewing.data?.chains ?? []).filter(c => c.view === v).length;
        return (
          <div style={{ position: "fixed", inset: 0, background: BG, zIndex: 400,
            display: "flex", flexDirection: "column", paddingBottom: "env(safe-area-inset-bottom,0px)" }}>
            {/* Header */}
            <div style={{ background: `linear-gradient(100deg,${TEAL},${BLUE})`, padding: "16px 18px 14px", color: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>
                  {viewing.data?.zone || "Mappa del dolore"}{viewing.vas != null ? ` · VAS ${viewing.vas}` : ""}
                </div>
                <button onClick={() => setViewing(null)} style={{ background: "rgba(255,255,255,.18)", border: "none", color: "#fff",
                  width: 34, height: 34, borderRadius: 10, fontSize: 18, cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ fontSize: 12, opacity: .9, marginTop: 3 }}>
                {patientName} · {new Date(viewing.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}
              </div>
            </div>

            {/* Toggle vista (solo viste con contenuto evidenziate) */}
            <div style={{ display: "flex", gap: 6, padding: "12px 16px 4px", background: PANEL, borderBottom: `1px solid ${LINE}` }}>
              {([["front", "Fronte"], ["back", "Retro"], ["right", "Lat. Dx"], ["left", "Lat. Sx"]] as [View, string][]).map(([v, label]) => {
                const n = countFor(v);
                return (
                  <button key={v} onClick={() => setViewerView(v)} style={{
                    flex: 1, padding: "9px 0", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    border: viewerView === v ? "none" : `1px solid ${LINE}`,
                    background: viewerView === v ? `linear-gradient(100deg,${TEAL},${BLUE})` : PANEL,
                    color: viewerView === v ? "#fff" : (n > 0 ? BODY : FAINT),
                  }}>{label}{n > 0 ? ` · ${n}` : ""}</button>
                );
              })}
            </div>

            {/* Corpo grande in sola lettura */}
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflow: "auto" }}>
              <div style={{ position: "relative", height: "min(78vh, 820px)", aspectRatio: aspectFor(viewerView),
                borderRadius: 12, overflow: "hidden", background: "#fff", border: `1px solid ${LINE}` }}>
                <div style={{ position: "absolute", inset: 0, ...bodyBg(viewerView) }} />
                {vChains.length > 0 && (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                    <defs>
                      <marker id="radArrowBig" markerWidth="5" markerHeight="5" refX="3.5" refY="2.5" orient="auto">
                        <path d="M0,0 L5,2.5 L0,5 Z" fill="#7c3aed" />
                      </marker>
                    </defs>
                    {vChains.map(c => (
                      <polyline key={c.id} points={c.nodes.map(n => `${n.x * 100},${n.y * 100}`).join(" ")}
                        fill="none" stroke="#7c3aed" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round"
                        strokeDasharray="2.5 1.5" markerEnd="url(#radArrowBig)" vectorEffect="non-scaling-stroke" />
                    ))}
                  </svg>
                )}
                {vChains.flatMap(c => c.nodes.map((n, i) => (
                  <div key={`${c.id}-${i}`} style={{ position: "absolute", left: `${n.x * 100}%`, top: `${n.y * 100}%`,
                    width: 11, height: 11, borderRadius: "50%", transform: "translate(-50%,-50%)",
                    background: "#7c3aed", border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }} />
                )))}
                {vPoints.map(p => (
                  <div key={p.id} style={{ position: "absolute", left: `${p.x * 100}%`, top: `${p.y * 100}%`,
                    width: 22, height: 22, borderRadius: "50%", transform: "translate(-50%,-50%)",
                    background: INTENSITY_COLOR[p.intensity], border: "2px solid #fff", boxShadow: "0 1px 5px rgba(0,0,0,.35)" }} />
                ))}
              </div>
            </div>

            {/* Note */}
            {viewing.notes && (
              <div style={{ background: PANEL, borderTop: `1px solid ${LINE}`, padding: "14px 18px", fontSize: 13, color: BODY }}>
                {viewing.notes}
              </div>
            )}
          </div>
        );
      })()}

      {/* ===== Pannello Salva (VAS / zona / note) ===== */}
      {saveSheet && (
        <div onClick={() => setSaveSheet(false)} style={{ position: embedded ? "absolute" : "fixed", inset: 0, zIndex: 360,
          background: "rgba(15,23,42,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: PANEL, width: "100%", maxWidth: 460,
            borderRadius: "18px 18px 0 0", padding: "18px 18px calc(18px + env(safe-area-inset-bottom,0px))",
            boxShadow: "0 -8px 30px rgba(0,0,0,.18)" }}>
            <div style={{ width: 40, height: 4, borderRadius: 99, background: LINE, margin: "0 auto 14px" }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: INK, marginBottom: 14 }}>Salva mappa del dolore</div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: .4, width: 36 }}>VAS</span>
              <input type="range" min={0} max={10} value={vas} onChange={e => setVas(Number(e.target.value))}
                style={{ flex: 1, accentColor: BLUE }} />
              <span style={{ fontSize: 16, fontWeight: 800, color: INK, width: 26, textAlign: "right" }}>{vas}</span>
            </div>

            <input value={zone} onChange={e => setZone(e.target.value)} placeholder="Zona principale (es. spalla destra)"
              style={{ width: "100%", padding: "11px 12px", borderRadius: 9, border: `1px solid ${LINE}`,
                fontSize: 13, fontFamily: "inherit", marginBottom: 8, boxSizing: "border-box" }} />
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Note (caratteristiche, fattori…)"
              style={{ width: "100%", padding: "11px 12px", borderRadius: 9, border: `1px solid ${LINE}`,
                fontSize: 13, fontFamily: "inherit", resize: "vertical", marginBottom: 14, boxSizing: "border-box" }} />

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setSaveSheet(false)} style={{ flex: 1, padding: "13px 0", borderRadius: 11, fontSize: 14, fontWeight: 800,
                border: `1.5px solid ${LINE}`, background: "#fff", color: BODY, cursor: "pointer" }}>Annulla</button>
              <button onClick={save} disabled={saving} style={{ flex: 2, padding: "13px 0", borderRadius: 11, fontSize: 14, fontWeight: 800,
                border: "none", background: `linear-gradient(100deg,${TEAL},${BLUE})`, color: "#fff",
                cursor: "pointer", opacity: saving ? .6 : 1 }}>{saving ? "Salvo…" : "Conferma e salva"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
