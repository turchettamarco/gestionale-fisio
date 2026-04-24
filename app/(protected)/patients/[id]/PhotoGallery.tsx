"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";

const T = { teal:"#0d9488", blue:"#2563eb", text:"#0f172a", muted:"#64748b", border:"#e2e8f0",
  green:"#16a34a", red:"#dc2626", panelSoft:"#f8fafc" };

type Photo = {
  id: string; patient_id: string; appointment_id?: string|null;
  photo_base64: string; phase?: string|null; view_type?: string|null;
  note?: string|null; created_at: string;
};

const PHASES = [
  { k:"pre", label:"Pre-trattamento", color:"#f59e0b" },
  { k:"post", label:"Post-trattamento", color:T.green },
  { k:"followup", label:"Follow-up", color:T.blue },
];
const VIEWS = [
  { k:"front", label:"Frontale" },
  { k:"back", label:"Posteriore" },
  { k:"side_left", label:"Laterale sx" },
  { k:"side_right", label:"Laterale dx" },
];

export function PhotoGallerySection({ patientId }: { patientId: string }) {
  const { studio } = useCurrentStudio();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newPhotoPhase, setNewPhotoPhase] = useState("pre");
  const [newPhotoView, setNewPhotoView] = useState("front");
  const [newPhotoNote, setNewPhotoNote] = useState("");
  const [previewPhoto, setPreviewPhoto] = useState<Photo|null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState<string|null>(null);
  const [compareB, setCompareB] = useState<string|null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("patient_photos")
      .select("*").eq("patient_id", patientId).order("created_at", { ascending: false });
    setPhotos((data as Photo[]) || []);
    setLoading(false);
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(file: File) {
    if (file.size > 2 * 1024 * 1024) { alert("Foto troppo grande (max 2MB)"); return; }
    setUploading(true);
    try {
      // Ridimensiona lato client per evitare foto enormi
      const img = new Image();
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = e => resolve(e.target!.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      img.src = base64;
      await new Promise(res => { img.onload = res; });

      const MAX = 1200;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = (h * MAX) / w; w = MAX; } else { w = (w * MAX) / h; h = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const resized = canvas.toDataURL("image/jpeg", 0.82);

      const { error } = await supabase.from("patient_photos").insert({
        patient_id: patientId, photo_base64: resized,
        phase: newPhotoPhase, view_type: newPhotoView, note: newPhotoNote || null,
        studio_id: studio?.id,          // ← FIX: richiesto da RLS multi-tenant
      });
      if (error) { alert("Errore salvataggio: "+error.message); return; }
      setNewPhotoNote("");
      await load();
    } finally { setUploading(false); }
  }

  async function deletePhoto(id: string) {
    if (!confirm("Eliminare questa foto?")) return;
    await supabase.from("patient_photos").delete().eq("id", id);
    await load();
  }

  // Raggruppa per view_type per confronto facile
  const byView = photos.reduce<Record<string, Photo[]>>((acc, p) => {
    const v = p.view_type || "other";
    (acc[v] = acc[v] || []).push(p);
    return acc;
  }, {});

  return (
    <>
      {/* Upload */}
      <div style={{ background:"rgba(13,148,136,0.05)", border:`1.5px solid rgba(13,148,136,0.2)`, borderRadius:10, padding:"14px 16px", marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:800, color:T.teal, marginBottom:10 }}>📷 Scatta o carica nuova foto</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, marginBottom:4, textTransform:"uppercase" }}>Fase</div>
            <select value={newPhotoPhase} onChange={e=>setNewPhotoPhase(e.target.value)}
              style={{ width:"100%", padding:"8px 10px", borderRadius:7, border:`1.5px solid ${T.border}`, fontSize:13, background:"#fff", outline:"none" }}>
              {PHASES.map(p=><option key={p.k} value={p.k}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, marginBottom:4, textTransform:"uppercase" }}>Vista</div>
            <select value={newPhotoView} onChange={e=>setNewPhotoView(e.target.value)}
              style={{ width:"100%", padding:"8px 10px", borderRadius:7, border:`1.5px solid ${T.border}`, fontSize:13, background:"#fff", outline:"none" }}>
              {VIEWS.map(v=><option key={v.k} value={v.k}>{v.label}</option>)}
            </select>
          </div>
        </div>
        <input value={newPhotoNote} onChange={e=>setNewPhotoNote(e.target.value)} placeholder="Nota (es. VAS 7, postura antalgica…)"
          style={{ width:"100%", padding:"8px 10px", borderRadius:7, border:`1.5px solid ${T.border}`, fontSize:13, outline:"none", boxSizing:"border-box", marginBottom:10 }}/>
        <label style={{ display:"inline-block", padding:"10px 18px", borderRadius:8, background:`linear-gradient(135deg,${T.teal},${T.blue})`, color:"#fff", fontWeight:700, fontSize:13, cursor:uploading?"wait":"pointer", opacity:uploading?0.6:1 }}>
          {uploading ? "Caricamento…" : "📷 Seleziona / scatta foto"}
          <input type="file" accept="image/*" capture="environment" style={{ display:"none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value=""; }}/>
        </label>
        <span style={{ marginLeft:8, fontSize:11, color:T.muted }}>Max 2MB · JPG/PNG</span>
      </div>

      {/* Modalità confronto */}
      {photos.length >= 2 && (
        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
          <button onClick={()=>{ setCompareMode(m=>!m); setCompareA(null); setCompareB(null); }}
            style={{ padding:"6px 14px", borderRadius:7, border:`1.5px solid ${compareMode?T.blue:T.border}`, background:compareMode?"rgba(37,99,235,0.1)":"#fff", color:compareMode?T.blue:T.muted, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
            {compareMode ? "✕ Esci da confronto" : "↔ Modalità confronto"}
          </button>
          {compareMode && <span style={{ fontSize:11, color:T.muted, alignSelf:"center" }}>Seleziona 2 foto per confrontarle affiancate</span>}
        </div>
      )}

      {loading ? (
        <div style={{ padding:20, textAlign:"center", color:T.muted, fontSize:12 }}>Caricamento…</div>
      ) : photos.length === 0 ? (
        <div style={{ padding:24, textAlign:"center", color:T.muted, fontSize:13, background:T.panelSoft, borderRadius:10 }}>
          Nessuna foto caricata ancora.
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {Object.entries(byView).map(([view, items]) => {
            const viewDef = VIEWS.find(v=>v.k===view);
            return (
              <div key={view}>
                <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>
                  {viewDef?.label || view} · {items.length} foto
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:10 }}>
                  {items.map(p => {
                    const phaseDef = PHASES.find(ph=>ph.k===p.phase);
                    const isSelected = compareA === p.id || compareB === p.id;
                    return (
                      <div key={p.id} onClick={()=>{
                        if (compareMode) {
                          if (compareA === p.id) setCompareA(null);
                          else if (compareB === p.id) setCompareB(null);
                          else if (!compareA) setCompareA(p.id);
                          else if (!compareB) setCompareB(p.id);
                        } else {
                          setPreviewPhoto(p);
                        }
                      }}
                        style={{ position:"relative", cursor:"pointer", borderRadius:8, overflow:"hidden", border:isSelected?`3px solid ${T.blue}`:`1.5px solid ${T.border}`, aspectRatio:"1", background:T.panelSoft }}>
                        <img src={p.photo_base64} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                        {phaseDef && (
                          <div style={{ position:"absolute", top:4, left:4, padding:"2px 7px", borderRadius:4, background:phaseDef.color, color:"#fff", fontSize:9, fontWeight:800, textTransform:"uppercase", letterSpacing:0.3 }}>
                            {phaseDef.label.split("-")[0]}
                          </div>
                        )}
                        <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"4px 6px", background:"rgba(0,0,0,0.5)", color:"#fff", fontSize:9 }}>
                          {new Date(p.created_at).toLocaleDateString("it-IT",{day:"2-digit",month:"short"})}
                        </div>
                        {isSelected && (
                          <div style={{ position:"absolute", top:4, right:4, width:24, height:24, borderRadius:"50%", background:T.blue, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800 }}>
                            {compareA===p.id?"A":"B"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview modal */}
      {previewPhoto && (
        <div onClick={()=>setPreviewPhoto(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div onClick={e=>e.stopPropagation()} style={{ maxWidth:"90vw", maxHeight:"90vh", display:"flex", flexDirection:"column", gap:10 }}>
            <img src={previewPhoto.photo_base64} alt="" style={{ maxWidth:"90vw", maxHeight:"75vh", objectFit:"contain", borderRadius:8 }}/>
            <div style={{ background:"#fff", borderRadius:8, padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:T.text }}>{PHASES.find(p=>p.k===previewPhoto.phase)?.label} · {VIEWS.find(v=>v.k===previewPhoto.view_type)?.label}</div>
                <div style={{ fontSize:11, color:T.muted }}>{new Date(previewPhoto.created_at).toLocaleString("it-IT")}</div>
                {previewPhoto.note && <div style={{ fontSize:11, color:T.text, marginTop:3 }}>{previewPhoto.note}</div>}
              </div>
              <button onClick={()=>{ deletePhoto(previewPhoto.id); setPreviewPhoto(null); }} style={{ padding:"6px 12px", borderRadius:6, border:`1.5px solid ${T.red}`, background:"#fff", color:T.red, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>🗑 Elimina</button>
            </div>
          </div>
        </div>
      )}

      {/* Compare modal */}
      {compareMode && compareA && compareB && (()=>{
        const pA = photos.find(p=>p.id===compareA);
        const pB = photos.find(p=>p.id===compareB);
        if (!pA || !pB) return null;
        return (
          <div onClick={()=>{setCompareA(null);setCompareB(null);}} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.9)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
            <div onClick={e=>e.stopPropagation()} style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, maxWidth:"95vw", maxHeight:"95vh" }}>
              {[pA, pB].map((p, i) => (
                <div key={i} style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  <div style={{ padding:"6px 10px", background:T.blue, color:"#fff", borderRadius:6, fontSize:11, fontWeight:800, textAlign:"center" }}>
                    {i===0?"A":"B"} — {PHASES.find(ph=>ph.k===p.phase)?.label} · {new Date(p.created_at).toLocaleDateString("it-IT")}
                  </div>
                  <img src={p.photo_base64} alt="" style={{ maxWidth:"45vw", maxHeight:"80vh", objectFit:"contain", borderRadius:8 }}/>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </>
  );
}
