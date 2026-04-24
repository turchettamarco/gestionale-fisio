"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";

const T = { teal:"#0d9488", blue:"#2563eb", text:"#0f172a", muted:"#64748b", border:"#e2e8f0",
  green:"#16a34a", red:"#dc2626", amber:"#f59e0b", panelSoft:"#f8fafc" };

// ─── Definizione scale cliniche ────────────────────────────────────────────
type ScaleQuestion = { label: string; max: number };
type ScaleDef = {
  id: string; name: string; full: string; area: string;
  maxScore: number; interpretation: (score:number)=>{text:string;color:string};
  questions: ScaleQuestion[];
};

const SCALES: ScaleDef[] = [
  {
    id: "VAS", name: "VAS", full: "Visual Analogue Scale", area: "Dolore (generale)",
    maxScore: 10,
    questions: [{ label: "Indica l'intensità del dolore (0=nessun dolore, 10=massimo dolore)", max: 10 }],
    interpretation: (s) => s<=3 ? {text:"Lieve",color:T.green} : s<=6 ? {text:"Moderato",color:T.amber} : {text:"Severo",color:T.red},
  },
  {
    id: "NDI", name: "NDI", full: "Neck Disability Index", area: "Cervicale",
    maxScore: 50,
    questions: [
      { label: "Intensità del dolore cervicale", max: 5 },
      { label: "Cura personale (lavarsi, vestirsi)", max: 5 },
      { label: "Sollevare pesi", max: 5 },
      { label: "Lettura", max: 5 },
      { label: "Mal di testa", max: 5 },
      { label: "Concentrazione", max: 5 },
      { label: "Lavoro", max: 5 },
      { label: "Guida", max: 5 },
      { label: "Sonno", max: 5 },
      { label: "Attività ricreative", max: 5 },
    ],
    interpretation: (s) => { const pct = (s/50)*100; return pct<20 ? {text:"Nessuna disabilità",color:T.green} : pct<40 ? {text:"Lieve",color:T.teal} : pct<60 ? {text:"Moderata",color:T.amber} : {text:"Severa/completa",color:T.red}; },
  },
  {
    id: "OSW", name: "Oswestry", full: "Oswestry Disability Index", area: "Lombare",
    maxScore: 50,
    questions: [
      { label: "Intensità del dolore", max: 5 },
      { label: "Cura personale", max: 5 },
      { label: "Sollevare pesi", max: 5 },
      { label: "Camminare", max: 5 },
      { label: "Stare seduti", max: 5 },
      { label: "Stare in piedi", max: 5 },
      { label: "Sonno", max: 5 },
      { label: "Vita sessuale", max: 5 },
      { label: "Vita sociale", max: 5 },
      { label: "Viaggiare", max: 5 },
    ],
    interpretation: (s) => { const pct = (s/50)*100; return pct<20 ? {text:"Disabilità minima",color:T.green} : pct<40 ? {text:"Moderata",color:T.teal} : pct<60 ? {text:"Severa",color:T.amber} : {text:"Invalidante",color:T.red}; },
  },
  {
    id: "DASH", name: "DASH", full: "Disabilities of Arm, Shoulder, Hand", area: "Arto superiore",
    maxScore: 150, // 30 domande × 5
    questions: Array.from({length:30},(_,i)=>({label:`Domanda ${i+1}: difficoltà nelle attività dell'arto superiore`, max:5})),
    interpretation: (s) => { const pct = ((s-30)/120)*100; return pct<25 ? {text:"Funzione buona",color:T.green} : pct<50 ? {text:"Lieve limitazione",color:T.teal} : pct<75 ? {text:"Moderata",color:T.amber} : {text:"Severa",color:T.red}; },
  },
  {
    id: "LEFS", name: "LEFS", full: "Lower Extremity Functional Scale", area: "Arto inferiore",
    maxScore: 80, // 20 domande × 4
    questions: Array.from({length:20},(_,i)=>({label:`Attività ${i+1}: difficoltà (0=estrema, 4=nessuna)`, max:4})),
    interpretation: (s) => { const pct = (s/80)*100; return pct>75 ? {text:"Funzione ottima",color:T.green} : pct>50 ? {text:"Buona",color:T.teal} : pct>25 ? {text:"Moderata",color:T.amber} : {text:"Compromessa",color:T.red}; },
  },
];

export function ClinicalScalesSection({ patientId }: { patientId: string }) {
  const { studio } = useCurrentStudio();
  const [scales, setScales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalScale, setModalScale] = useState<ScaleDef | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("clinical_scales")
      .select("*").eq("patient_id", patientId).order("created_at", { ascending: false });
    setScales(data || []);
    setLoading(false);
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  function openScale(s: ScaleDef) {
    setModalScale(s);
    setAnswers(new Array(s.questions.length).fill(0));
    setNote("");
  }

  async function saveScale() {
    if (!modalScale) return;
    if (!studio?.id) { alert("Studio non identificato. Ricarica la pagina."); return; }
    const score = answers.reduce((a,b)=>a+b, 0);
    setSaving(true);
    const { error } = await supabase.from("clinical_scales").insert({
      patient_id: patientId, scale_type: modalScale.id, score,
      details: { answers, questions: modalScale.questions.map(q=>q.label) },
      note: note || null,
      studio_id: studio.id,
    });
    setSaving(false);
    if (error) { alert("Errore: "+error.message); return; }
    setModalScale(null);
    await load();
  }

  async function deleteScale(id: string) {
    if (!confirm("Eliminare questa valutazione?")) return;
    await supabase.from("clinical_scales").delete().eq("id", id);
    await load();
  }

  // Raggruppa per scale_type
  const byType = scales.reduce<Record<string, any[]>>((acc, s) => {
    (acc[s.scale_type] = acc[s.scale_type] || []).push(s);
    return acc;
  }, {});

  return (
    <>
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 }}>
        {SCALES.map(s=>(
          <button key={s.id} onClick={()=>openScale(s)}
            style={{ padding:"8px 14px", borderRadius:8, border:`1.5px solid ${T.teal}`, background:"rgba(13,148,136,0.06)", color:T.teal, fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
            + {s.name}
            <span style={{ fontSize:10, fontWeight:600, color:T.muted, marginLeft:6 }}>{s.area}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding:20, color:T.muted, fontSize:12, textAlign:"center" }}>Caricamento…</div>
      ) : scales.length === 0 ? (
        <div style={{ padding:20, color:T.muted, fontSize:13, textAlign:"center", background:T.panelSoft, borderRadius:10 }}>
          Nessuna valutazione registrata. Clicca su una scala per iniziare.
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {Object.entries(byType).map(([type, items])=>{
            const def = SCALES.find(s=>s.id===type);
            if (!def) return null;
            const reversed = [...items].reverse(); // cronologico
            const first = reversed[0]?.score;
            const last = items[0]?.score;
            const diff = first!=null && last!=null ? last-first : 0;
            const isImprovement = def.id === "LEFS" ? diff > 0 : diff < 0; // LEFS più alto = meglio

            return (
              <div key={type} style={{ background:"#fff", border:`1px solid ${T.border}`, borderRadius:10, padding:"14px 18px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10, gap:8 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, color:T.text }}>{def.name} <span style={{ fontSize:11, fontWeight:600, color:T.muted }}>{def.full}</span></div>
                    <div style={{ fontSize:11, color:T.muted, marginTop:1 }}>{items.length} valutazioni · {def.area}</div>
                  </div>
                  {items.length >= 2 && (
                    <div style={{ padding:"4px 10px", borderRadius:7, background:isImprovement?"rgba(22,163,74,0.1)":diff===0?"rgba(100,116,139,0.1)":"rgba(220,38,38,0.1)", fontSize:11, fontWeight:700, color:isImprovement?T.green:diff===0?T.muted:T.red }}>
                      {isImprovement ? "↑ Migliorato" : diff === 0 ? "= Invariato" : "↓ Peggiorato"} ({diff>0?"+":""}{diff})
                    </div>
                  )}
                </div>

                {/* Grafico temporale */}
                {items.length >= 2 && (()=>{
                  const maxY = def.maxScore;
                  return (
                    <div style={{ display:"flex", alignItems:"flex-end", gap:5, height:60, padding:"0 4px 4px", borderBottom:`1px solid ${T.border}`, marginBottom:10 }}>
                      {reversed.map((it, i)=>{
                        const h = (it.score / maxY) * 100;
                        const interp = def.interpretation(it.score);
                        return (
                          <div key={it.id} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                            <div style={{ fontSize:9, fontWeight:700, color:interp.color }}>{it.score}</div>
                            <div title={new Date(it.created_at).toLocaleDateString("it-IT")} style={{ width:"100%", height:`${h}%`, background:interp.color, borderRadius:"3px 3px 0 0", minHeight:2 }}/>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Lista valutazioni */}
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {items.slice(0, 5).map((it)=>{
                    const interp = def.interpretation(it.score);
                    return (
                      <div key={it.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:T.panelSoft, borderRadius:7, borderLeft:`3px solid ${interp.color}` }}>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:T.text }}>
                            {new Date(it.created_at).toLocaleDateString("it-IT", { day:"2-digit", month:"short", year:"numeric" })}
                          </div>
                          {it.note && <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{it.note}</div>}
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ textAlign:"right" }}>
                            <div style={{ fontSize:18, fontWeight:800, color:interp.color }}>{it.score}<span style={{ fontSize:10, color:T.muted, fontWeight:600 }}>/{def.maxScore}</span></div>
                            <div style={{ fontSize:10, fontWeight:700, color:interp.color }}>{interp.text}</div>
                          </div>
                          <button onClick={()=>deleteScale(it.id)} style={{ background:"none", border:"none", color:T.muted, fontSize:14, cursor:"pointer", padding:4 }}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal compilazione scala */}
      {modalScale && (
        <div onClick={()=>setModalScale(null)} style={{ position:"fixed", inset:0, background:"rgba(30,64,175,0.35)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:"#fff", borderRadius:14, padding:"24px 28px", maxWidth:640, width:"100%", maxHeight:"85vh", overflowY:"auto" }}>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:700, color:T.teal, textTransform:"uppercase", letterSpacing:0.5 }}>{modalScale.area}</div>
              <div style={{ fontSize:22, fontWeight:800, color:T.text }}>{modalScale.name} — {modalScale.full}</div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {modalScale.questions.map((q, i) => (
                <div key={i}>
                  <div style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:6 }}>{i+1}. {q.label}</div>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                    {Array.from({length:q.max+1}).map((_, v) => (
                      <button key={v} onClick={()=>{const a=[...answers]; a[i]=v; setAnswers(a);}}
                        style={{
                          width:36, height:36, borderRadius:7, border:`1.5px solid ${answers[i]===v?T.teal:T.border}`,
                          background:answers[i]===v?T.teal:"#fff", color:answers[i]===v?"#fff":T.text, fontWeight:700, fontSize:13, cursor:"pointer",
                        }}>{v}</button>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:0.4, display:"block", marginBottom:4 }}>Note (opzionale)</label>
                <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2}
                  style={{ width:"100%", padding:"8px 10px", borderRadius:7, border:`1.5px solid ${T.border}`, fontSize:12, fontFamily:"inherit", resize:"vertical", outline:"none", boxSizing:"border-box" }}/>
              </div>
              <div style={{ padding:"12px 16px", background:T.panelSoft, borderRadius:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontSize:12, color:T.muted, fontWeight:600 }}>Punteggio totale</div>
                <div style={{ fontSize:22, fontWeight:800, color:T.teal }}>{answers.reduce((a,b)=>a+b,0)} / {modalScale.maxScore}</div>
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
                <button onClick={()=>setModalScale(null)} style={{ padding:"10px 20px", borderRadius:8, border:`1.5px solid ${T.border}`, background:"#fff", color:T.muted, fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Annulla</button>
                <button onClick={saveScale} disabled={saving} style={{ padding:"10px 20px", borderRadius:8, border:"none", background:`linear-gradient(135deg,${T.teal},${T.blue})`, color:"#fff", fontWeight:700, fontSize:13, cursor:saving?"wait":"pointer", opacity:saving?0.6:1, fontFamily:"inherit" }}>
                  {saving?"Salvo…":"Salva valutazione"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
