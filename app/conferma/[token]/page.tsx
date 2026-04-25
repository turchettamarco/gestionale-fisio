"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function ConfirmPage() {
  const params = useParams();
  const token = params?.token as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);
  const [done, setDone] = useState<"confirmed"|"cancelled"|null>(null);

  useEffect(()=>{
    if(!token) return;
    fetch(`/api/confirm?token=${token}`).then(r=>r.json()).then(d=>{
      if(d.error) setError(d.error); else setData(d);
    }).catch(e=>setError(e?.message||"Errore")).finally(()=>setLoading(false));
  },[token]);

  async function act(action:"confirm"|"cancel") {
    if(!confirm(action==="confirm"?"Confermi l'appuntamento?":"Sei sicuro di voler annullare?")) return;
    setActing(true);
    try {
      const r = await fetch("/api/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,action})});
      const d = await r.json();
      if(d.error) { alert(d.error); return; }
      setDone(d.status);
    } finally { setActing(false); }
  }

  const studioHeader = data?.studio
    ? [data.studio.name, data.studio.signature_name].filter(Boolean).join(" · ")
    : "Conferma Appuntamento";

  if (loading) return <Wrapper studioHeader={studioHeader} logoBase64={data?.studio?.logo_base64}><div style={{textAlign:"center",padding:40,color:"#64748b"}}>Caricamento…</div></Wrapper>;
  if (error) return <Wrapper studioHeader={studioHeader} logoBase64={data?.studio?.logo_base64}><div style={{textAlign:"center",padding:40}}>
    <div style={{fontSize:48,marginBottom:12}}>❌</div>
    <h2 style={{margin:"0 0 8px",fontSize:20,color:"#dc2626"}}>Appuntamento non trovato</h2>
    <p style={{color:"#64748b",fontSize:13}}>{error}</p>
  </div></Wrapper>;

  const date = data?.start_at ? new Date(data.start_at) : new Date();
  const dateStr = date.toLocaleDateString("it-IT",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});
  const timeStr = date.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
  const luogo = data?.location === "studio" ? (data?.clinic_site || "Studio") : `Domicilio (${data?.domicile_address || "indirizzo comunicato"})`;
  const patientName = `${data?.patient?.first_name || ""} ${data?.patient?.last_name || ""}`.trim();

  if (done === "confirmed") return <Wrapper studioHeader={studioHeader} logoBase64={data?.studio?.logo_base64}><div style={{textAlign:"center",padding:"40px 24px"}}>
    <div style={{fontSize:56,marginBottom:12}}>✅</div>
    <h2 style={{margin:"0 0 8px",fontSize:22,color:"#15803d",fontWeight:800}}>Appuntamento confermato!</h2>
    <p style={{color:"#64748b",fontSize:14,marginBottom:24}}>Grazie {patientName.split(" ")[0]}, la aspettiamo.</p>
    <div style={{background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:10,padding:"16px 20px",textAlign:"left",marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:700,color:"#166534",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>Riepilogo</div>
      <div style={{fontSize:14,color:"#0f172a",fontWeight:600,marginBottom:3}}>📅 {dateStr}</div>
      <div style={{fontSize:14,color:"#0f172a",fontWeight:600,marginBottom:3}}>🕐 Ore {timeStr}</div>
      <div style={{fontSize:13,color:"#0f172a"}}>📍 {luogo}</div>
    </div>
  </div></Wrapper>;

  if (done === "cancelled") return <Wrapper studioHeader={studioHeader} logoBase64={data?.studio?.logo_base64}><div style={{textAlign:"center",padding:"40px 24px"}}>
    <div style={{fontSize:56,marginBottom:12}}>📵</div>
    <h2 style={{margin:"0 0 8px",fontSize:22,color:"#dc2626",fontWeight:800}}>Appuntamento annullato</h2>
    <p style={{color:"#64748b",fontSize:14}}>Per riprenotare contatti lo studio.</p>
  </div></Wrapper>;

  const alreadyConfirmed = data?.status === "confirmed";
  const alreadyCancelled = data?.status === "cancelled";

  return <Wrapper studioHeader={studioHeader} logoBase64={data?.studio?.logo_base64}>
    <div style={{padding:"32px 24px"}}>
      <h1 style={{margin:"0 0 6px",fontSize:22,fontWeight:800,color:"#0f172a",textAlign:"center"}}>
        {alreadyConfirmed ? "✓ Già confermato" : alreadyCancelled ? "Appuntamento annullato" : "Conferma il tuo appuntamento"}
      </h1>
      <p style={{textAlign:"center",color:"#64748b",fontSize:13,marginBottom:24}}>
        {patientName}
      </p>

      <div style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:12,padding:"20px",marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <div style={{fontSize:32}}>📅</div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5}}>Data</div>
            <div style={{fontSize:15,fontWeight:700,color:"#0f172a"}}>{dateStr}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <div style={{fontSize:32}}>🕐</div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5}}>Ora</div>
            <div style={{fontSize:15,fontWeight:700,color:"#0f172a"}}>{timeStr}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:32}}>📍</div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5}}>Luogo</div>
            <div style={{fontSize:15,fontWeight:700,color:"#0f172a"}}>{luogo}</div>
          </div>
        </div>
      </div>

      {!alreadyConfirmed && !alreadyCancelled && (
        <>
          <button onClick={()=>act("confirm")} disabled={acting}
            style={{width:"100%",padding:"16px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#16a34a,#0d9488)",color:"#fff",fontWeight:800,fontSize:16,cursor:"pointer",marginBottom:10,fontFamily:"inherit",opacity:acting?0.6:1}}>
            {acting?"Attendere…":"✅ Confermo, ci sarò"}
          </button>
          <button onClick={()=>act("cancel")} disabled={acting}
            style={{width:"100%",padding:"14px",borderRadius:10,border:"1.5px solid #fca5a5",background:"#fff",color:"#dc2626",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",opacity:acting?0.6:1}}>
            ✕ Non posso, annulla
          </button>
        </>
      )}

      <div style={{textAlign:"center",marginTop:20,fontSize:11,color:"#94a3b8"}}>
        {data?.studio?.signature_name ? `${data.studio.signature_name}${data.studio.address ? ` — ${data.studio.address}` : ""}` : ""}
      </div>
    </div>
  </Wrapper>;
}

function Wrapper({children, studioHeader, logoBase64}:{children:React.ReactNode; studioHeader?:string; logoBase64?:string|null}) {
  return (
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"'Segoe UI',system-ui,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{maxWidth:480,width:"100%",background:"#fff",borderRadius:16,boxShadow:"0 4px 24px rgba(15,23,42,0.08)",overflow:"hidden"}}>
        <div style={{background:"linear-gradient(135deg,#0d9488,#2563eb)",padding:"20px 16px",textAlign:"center"}}>
          {logoBase64 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoBase64}
              alt="Logo studio"
              style={{display:"block",margin:"0 auto 10px",maxHeight:72,maxWidth:220,objectFit:"contain",filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.15))"}}
            />
          )}
          <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>{studioHeader || "Conferma Appuntamento"}</div>
        </div>
        {children}
      </div>
    </div>
  );
}
