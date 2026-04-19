"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function SurveyPage() {
  const params = useParams();
  const token = params?.token as string;
  const [step, setStep]   = useState(0); // 0=form, 1=done
  const [q1,  setQ1]      = useState(0); // soddisfazione 1-5
  const [q2,  setQ2]      = useState(0); // risultati 1-5
  const [q3,  setQ3]      = useState(""); // testo libero
  const [name, setName]   = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(()=>{
    if(!token) return;
    fetch(`/api/survey?token=${token}`).then(r=>r.json()).then(d=>{
      if(d.patient_name) setName(d.patient_name);
    }).catch(()=>{});
  },[token]);

  async function submit() {
    if(!q1||!q2){ alert("Rispondi alle prime due domande."); return; }
    setSaving(true);
    try {
      await fetch("/api/survey",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,q1,q2,q3})});
      setStep(1);
    } catch(e) { console.error(e); }
    finally { setSaving(false); }
  }

  const stars = (val:number, set:(v:number)=>void, color="#f59e0b") => (
    <div style={{display:"flex",gap:6,marginTop:8}}>
      {[1,2,3,4,5].map(n=>(
        <button key={n} onClick={()=>set(n)}
          style={{fontSize:28,background:"none",border:"none",cursor:"pointer",opacity:n<=val?1:0.3,filter:n<=val?"none":"grayscale(1)"}}>⭐</button>
      ))}
    </div>
  );

  if(step===1) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f0fdf4",fontFamily:"system-ui,sans-serif"}}>
      <div style={{textAlign:"center",padding:32}}>
        <div style={{fontSize:64,marginBottom:16}}>🙏</div>
        <h2 style={{margin:"0 0 8px",fontSize:22,fontWeight:800,color:"#15803d"}}>Grazie per il feedback!</h2>
        <p style={{color:"#64748b",fontSize:14}}>La sua opinione ci aiuta a migliorare. A presto!</p>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <div style={{background:"linear-gradient(135deg,#0d9488,#2563eb)",padding:"24px 20px",textAlign:"center"}}>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.7)",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>FisioHub — Dr. Marco Turchetta</div>
        <h1 style={{margin:0,fontSize:20,fontWeight:800,color:"#fff"}}>Questionario di soddisfazione</h1>
        {name&&<div style={{fontSize:14,color:"rgba(255,255,255,0.85)",marginTop:6}}>Caro/a {name}</div>}
      </div>
      <div style={{maxWidth:560,margin:"0 auto",padding:"24px 16px"}}>
        <div style={{background:"#fff",borderRadius:12,padding:"20px",boxShadow:"0 2px 8px rgba(15,23,42,0.06)",border:"1.5px solid #e2e8f0",marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:15,color:"#0f172a",marginBottom:4}}>1. Quanto è soddisfatto/a del trattamento ricevuto?</div>
          <div style={{fontSize:12,color:"#64748b"}}>1 = per niente · 5 = moltissimo</div>
          {stars(q1,setQ1)}
        </div>
        <div style={{background:"#fff",borderRadius:12,padding:"20px",boxShadow:"0 2px 8px rgba(15,23,42,0.06)",border:"1.5px solid #e2e8f0",marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:15,color:"#0f172a",marginBottom:4}}>2. Ha raggiunto i risultati che si aspettava?</div>
          <div style={{fontSize:12,color:"#64748b"}}>1 = per niente · 5 = completamente</div>
          {stars(q2,setQ2,"#10b981")}
        </div>
        <div style={{background:"#fff",borderRadius:12,padding:"20px",boxShadow:"0 2px 8px rgba(15,23,42,0.06)",border:"1.5px solid #e2e8f0",marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:15,color:"#0f172a",marginBottom:8}}>3. Vuole lasciarci un commento? (facoltativo)</div>
          <textarea value={q3} onChange={e=>setQ3(e.target.value)} rows={3} placeholder="Cosa ha apprezzato di più? Cosa possiamo migliorare?"
            style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1.5px solid #cbd5e1",fontSize:13,outline:"none",resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/>
        </div>
        <button onClick={submit} disabled={saving||!q1||!q2}
          style={{width:"100%",padding:"14px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#0d9488,#2563eb)",color:"#fff",fontWeight:800,fontSize:16,cursor:(!q1||!q2)?"not-allowed":"pointer",opacity:(!q1||!q2)?0.6:1,fontFamily:"inherit"}}>
          {saving?"Invio…":"Invia il questionario →"}
        </button>
        <div style={{textAlign:"center",marginTop:12,fontSize:11,color:"#94a3b8"}}>Dr. Marco Turchetta — Via Galileo Galilei 5, Pontecorvo (FR)</div>
      </div>
    </div>
  );
}
