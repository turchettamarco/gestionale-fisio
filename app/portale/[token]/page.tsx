"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type HistoryItem = {
  id: string;
  start_at: string;
  treatment_type: string | null;
  amount: number | null;
  payment_method: string | null;
  /** "paid" = saldata · "unpaid" = da saldare · "package" = inclusa in un pacchetto */
  payment_state: "paid" | "unpaid" | "package";
};

export default function PortalPage() {
  const params = useParams();
  const token = params?.token as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(()=>{
    if(!token) return;
    fetch(`/api/portal?token=${token}`).then(r=>r.json()).then(d=>{
      if(d.error) setError(d.error); else setData(d);
    }).finally(()=>setLoading(false));
  },[token]);

  const studio = data?.studio;
  const headerTitle = studio
    ? [studio.name, studio.signature_name].filter(Boolean).join(" · ")
    : "Area Paziente";

  if (loading) return <Wrap headerTitle="Area Paziente"><div style={{textAlign:"center",padding:40,color:"#64748b"}}>Caricamento…</div></Wrap>;
  if (error || !data) return <Wrap headerTitle="Area Paziente"><div style={{textAlign:"center",padding:40}}>
    <div style={{fontSize:48,marginBottom:12}}>⚠️</div>
    <h2 style={{margin:"0 0 8px",fontSize:20,color:"#dc2626"}}>Accesso non disponibile</h2>
    <p style={{color:"#64748b",fontSize:13}}>{error}</p>
  </div></Wrap>;

  const patientName = data.patient ? `${data.patient.first_name} ${data.patient.last_name}`.trim() : "Paziente";
  const upcoming = data.upcoming || [];
  const history: HistoryItem[] = data.history || [];
  const booking = data.booking;
  const unpaid = history.filter(h => h.payment_state === "unpaid");
  const showAmounts = data.show_amounts !== false;

  return <Wrap headerTitle={headerTitle} logoBase64={studio?.logo_base64}>
    <div style={{padding:"24px 20px"}}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:12,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Area riservata</div>
        <h1 style={{margin:0,fontSize:24,fontWeight:800,color:"#0f172a"}}>Ciao {patientName.split(" ")[0]}</h1>
        <p style={{color:"#64748b",fontSize:13,marginTop:4}}>Benvenuto/a nella tua area personale</p>
      </div>

      {/* Prossimi appuntamenti */}
      <section style={{marginBottom:24}}>
        <h2 style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
          📅 Prossimi appuntamenti
        </h2>
        {upcoming.length === 0 ? (
          <div style={{padding:20,background:"#f8fafc",borderRadius:10,textAlign:"center",color:"#64748b",fontSize:13}}>
            Nessun appuntamento programmato.
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {upcoming.map((a:any)=>{
              const d = new Date(a.start_at);
              const dStr = d.toLocaleDateString("it-IT",{weekday:"long",day:"2-digit",month:"long"});
              const tStr = d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
              const luogo = a.location==="studio" ? (a.clinic_site||"Studio") : `Domicilio (${a.domicile_address||"—"})`;
              const statusColor = a.status==="confirmed"?"#2563eb":a.status==="booked"?"#0d9488":"#64748b";
              const statusLabel = a.status==="confirmed"?"Confermato":a.status==="booked"?"Prenotato":a.status;
              return (
                <div key={a.id} style={{background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"14px 16px",borderLeft:`4px solid ${statusColor}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <div style={{fontSize:14,fontWeight:700,color:"#0f172a",textTransform:"capitalize"}}>{dStr}</div>
                    <div style={{fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:5,background:`${statusColor}15`,color:statusColor,textTransform:"uppercase"}}>{statusLabel}</div>
                  </div>
                  <div style={{fontSize:20,fontWeight:800,color:statusColor,marginBottom:4}}>🕐 {tStr}</div>
                  <div style={{fontSize:12,color:"#64748b"}}>📍 {luogo}</div>
                  {a.treatment_type && <div style={{fontSize:11,color:"#64748b",marginTop:3}}>Tipo: {a.treatment_type}</div>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Prenota una seduta — solo se lo studio ha attivato la pagina pubblica */}
      {booking && (
        <section style={{marginBottom:24}}>
          <h2 style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
            🗓️ Prenota una seduta
          </h2>
          <a href={`/prenota/${booking.slug}`} style={{display:"block",padding:"16px 18px",background:"linear-gradient(135deg,#0d9488,#2563eb)",borderRadius:10,color:"#fff",textDecoration:"none"}}>
            <div style={{fontSize:15,fontWeight:800,marginBottom:4}}>Richiedi un appuntamento →</div>
            <div style={{fontSize:11,opacity:0.85}}>Scegli il servizio e l&apos;orario che preferisci</div>
          </a>
        </section>
      )}

      {/* Storico sedute */}
      <section style={{marginBottom:24}}>
        <h2 style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
          📋 Le tue sedute
        </h2>

        {unpaid.length > 0 && (
          <div style={{marginBottom:10,padding:"10px 14px",borderRadius:8,background:"#fffbeb",border:"1px solid #fde68a",fontSize:12.5,color:"#92400e"}}>
            {unpaid.length === 1 ? "1 seduta risulta da saldare" : `${unpaid.length} sedute risultano da saldare`}
            {showAmounts && (() => {
              const tot = unpaid.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
              return tot > 0 ? ` · totale €${tot.toFixed(2).replace(".00","")}` : "";
            })()}
          </div>
        )}

        {history.length === 0 ? (
          <div style={{padding:20,background:"#f8fafc",borderRadius:10,textAlign:"center",color:"#64748b",fontSize:13}}>
            Nessuna seduta registrata.
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {history.map((h) => {
              const d = new Date(h.start_at);
              const dStr = d.toLocaleDateString("it-IT",{day:"2-digit",month:"long",year:"numeric"});
              const tStr = d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
              const badge =
                h.payment_state === "paid"    ? {label:"Pagata",       color:"#15803d", bg:"#f0fdf4", line:"#bbf7d0"} :
                h.payment_state === "package" ? {label:"Da pacchetto", color:"#1d4ed8", bg:"#eff6ff", line:"#bfdbfe"} :
                                                {label:"Da saldare",   color:"#b45309", bg:"#fffbeb", line:"#fde68a"};
              const showAmount = showAmounts && Number(h.amount) > 0 && h.payment_state !== "package";
              return (
                <div key={h.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:13.5,fontWeight:700,color:"#0f172a"}}>{dStr}</div>
                    <div style={{fontSize:11.5,color:"#64748b",marginTop:2}}>
                      {tStr}{h.treatment_type ? ` · ${h.treatment_type}` : ""}
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                    {showAmount && (
                      <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>€{h.amount}</span>
                    )}
                    <span style={{fontSize:10,fontWeight:800,padding:"3px 8px",borderRadius:5,background:badge.bg,border:`1px solid ${badge.line}`,color:badge.color,textTransform:"uppercase",whiteSpace:"nowrap"}}>
                      {badge.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{fontSize:10.5,color:"#94a3b8",marginTop:8,lineHeight:1.5}}>
          Per qualsiasi dubbio sugli importi puoi contattare lo studio.
        </div>
      </section>

      {/* Scheda esercizi */}
      {data.exercise_token && (
        <section style={{marginBottom:24}}>
          <h2 style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
            🏋️ La tua scheda esercizi
          </h2>
          <a href={`/esercizi/${data.exercise_token}`} style={{display:"block",padding:"16px 18px",background:"linear-gradient(135deg,#16a34a,#0d9488)",borderRadius:10,color:"#fff",textDecoration:"none"}}>
            <div style={{fontSize:15,fontWeight:800,marginBottom:4}}>📋 Apri scheda esercizi domiciliari →</div>
            <div style={{fontSize:11,opacity:0.85}}>Esercizi, video e indicazioni da fare a casa</div>
          </a>
        </section>
      )}

      {/* Info contatti — dinamico dallo studio */}
      <section style={{marginBottom:20}}>
        <h2 style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:10}}>📞 Contatti studio</h2>
        <div style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"14px 16px",fontSize:13,color:"#0f172a",lineHeight:1.6}}>
          {studio?.signature_name && <div><strong>{studio.signature_name}</strong></div>}
          {studio?.signature_title && <div>{studio.signature_title}</div>}
          {studio?.address && <div style={{color:"#64748b",fontSize:12,marginTop:4}}>📍 {studio.address}</div>}
          {studio?.phone && <div style={{color:"#64748b",fontSize:12,marginTop:2}}>📞 {studio.phone}</div>}
          {studio?.website && <div style={{marginTop:6}}>
            <a href={studio.website} target="_blank" rel="noopener noreferrer" style={{color:"#2563eb",fontSize:12,textDecoration:"none"}}>🌐 Visita il sito</a>
          </div>}
          {!studio && <div style={{color:"#64748b",fontSize:12}}>Contatta il tuo studio per informazioni.</div>}
        </div>
      </section>

      <div style={{textAlign:"center",fontSize:10,color:"#94a3b8"}}>
        Questa pagina è personale. Non condividere il link.
      </div>
    </div>
  </Wrap>;
}

function Wrap({children, headerTitle, logoBase64}:{children:React.ReactNode; headerTitle:string; logoBase64?:string|null}) {
  return (
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <div style={{background:"linear-gradient(135deg,#0d9488,#2563eb)",padding:"16px 20px",textAlign:"center"}}>
        {logoBase64 && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoBase64}
            alt="Logo studio"
            style={{display:"block",margin:"0 auto 10px",maxHeight:72,maxWidth:220,objectFit:"contain",filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.15))"}}
          />
        )}
        <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>{headerTitle}</div>
      </div>
      <div style={{maxWidth:560,margin:"0 auto"}}>{children}</div>
    </div>
  );
}
