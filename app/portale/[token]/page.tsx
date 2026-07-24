"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type PendingItem = { token: string; title?: string | null; scale_type?: string | null };

type PackageItem = {
  id: string; title: string | null; total: number | null;
  used: number; remaining: number | null; expires_at: string | null;
};

type PainEntry = { day: string; level: number };

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
  // Lo storico può essere lungo: chiuso di default, si apre con un tocco
  const [historyOpen, setHistoryOpen] = useState(false);
  // Diario del dolore: valore scelto oggi e stato di salvataggio
  const [painLevel, setPainLevel] = useState<number | null>(null);
  const [painSaving, setPainSaving] = useState(false);
  const [painSaved, setPainSaved] = useState(false);

  async function savePain(level: number) {
    setPainLevel(level);
    setPainSaving(true);
    setPainSaved(false);
    try {
      const r = await fetch("/api/portal/pain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, level }),
      });
      if (r.ok) setPainSaved(true);
    } catch {
      // silenzioso: riprova al prossimo tocco
    } finally {
      setPainSaving(false);
    }
  }

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
  // Interruttori impostati dallo studio (mig. 091). In assenza, tutto visibile.
  const feat = (data.features ?? {}) as Partial<Record<
    "appointments"|"history"|"booking"|"exercises"|"scales"|"consents"|"packages"|"pain_diary", boolean>>;
  // Tutti i blocchi sono visibili salvo diversa indicazione, tranne il
  // diario del dolore che va acceso esplicitamente dal terapista.
  const on = (k: keyof typeof feat) =>
    k === "pain_diary" ? feat[k] === true : feat[k] !== false;
  const pendingScales: PendingItem[] = data.pending_scales ?? [];
  const pendingConsents: PendingItem[] = data.pending_consents ?? [];
  const packages: PackageItem[] = data.packages ?? [];
  const painLog: PainEntry[] = data.pain_log ?? [];
  const adherenceDays: number = data.adherence_days ?? 0;
  const paidCount = history.filter(h => h.payment_state !== "unpaid").length;

  return <Wrap headerTitle={headerTitle} logoBase64={studio?.logo_base64}>
    <div style={{padding:"24px 20px"}}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:12,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Area riservata</div>
        <h1 style={{margin:0,fontSize:24,fontWeight:800,color:"#0f172a"}}>Ciao {patientName.split(" ")[0]}</h1>
        <p style={{color:"#64748b",fontSize:13,marginTop:4}}>Benvenuto/a nella tua area personale</p>
      </div>

      {/* Prossimi appuntamenti */}
      {on("appointments") && (
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
      )}

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
      {on("history") && (
      <section style={{marginBottom:24}}>
        {/* Banner riassuntivo: è anche il comando per aprire l'elenco */}
        <button
          onClick={() => setHistoryOpen(o => !o)}
          aria-expanded={historyOpen}
          style={{
            width:"100%", textAlign:"left", cursor:"pointer",
            background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:10,
            padding:"14px 16px", display:"flex", alignItems:"center", gap:12,
          }}
        >
          <span style={{fontSize:18,flexShrink:0}}>📋</span>
          <span style={{flex:1,minWidth:0}}>
            <span style={{display:"block",fontSize:14,fontWeight:800,color:"#0f172a"}}>
              Le tue sedute
            </span>
            <span style={{display:"block",fontSize:12,color:"#64748b",marginTop:3}}>
              {history.length === 0
                ? "Nessuna seduta registrata"
                : `${history.length} ${history.length === 1 ? "seduta" : "sedute"}`}
              {paidCount > 0 && ` · ${paidCount} in regola`}
              {unpaid.length > 0 && (
                <span style={{color:"#b45309",fontWeight:700}}>
                  {` · ${unpaid.length} da saldare`}
                  {showAmounts && (() => {
                    const tot = unpaid.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
                    return tot > 0 ? ` (€${tot.toFixed(2).replace(".00","")})` : "";
                  })()}
                </span>
              )}
            </span>
          </span>
          <span style={{
            flexShrink:0, color:"#64748b", fontSize:12, fontWeight:800,
            transform: historyOpen ? "rotate(180deg)" : "none", transition:"transform 0.2s",
          }}>▾</span>
        </button>

        {historyOpen && (history.length === 0 ? (
          <div style={{marginTop:10,padding:20,background:"#f8fafc",borderRadius:10,textAlign:"center",color:"#64748b",fontSize:13}}>
            Nessuna seduta registrata.
          </div>
        ) : (
          <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
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
        ))}

        {historyOpen && showAmounts && history.length > 0 && (
          <div style={{fontSize:10.5,color:"#94a3b8",marginTop:8,lineHeight:1.5}}>
            Per qualsiasi dubbio sugli importi puoi contattare lo studio.
          </div>
        )}
      </section>
      )}

      {/* Consensi da firmare — in cima alle cose "da fare" (mig. 091) */}
      {on("consents") && pendingConsents.length > 0 && (
        <section style={{marginBottom:24}}>
          <h2 style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
            ✍️ Da firmare
          </h2>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {pendingConsents.map(c => (
              <a key={c.token} href={`/consensi/${c.token}`} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"14px 16px",background:"#fff",border:"1.5px solid #fde68a",borderRadius:10,textDecoration:"none"}}>
                <span style={{minWidth:0}}>
                  <span style={{display:"block",fontSize:13.5,fontWeight:700,color:"#0f172a"}}>
                    {c.title || "Consenso informato"}
                  </span>
                  <span style={{display:"block",fontSize:11.5,color:"#b45309",marginTop:2}}>
                    In attesa della tua firma
                  </span>
                </span>
                <span style={{flexShrink:0,color:"#0d9488",fontWeight:800,fontSize:13}}>Firma →</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Questionari di valutazione da compilare (mig. 091) */}
      {on("scales") && pendingScales.length > 0 && (
        <section style={{marginBottom:24}}>
          <h2 style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
            📝 Da compilare
          </h2>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {pendingScales.map(sc => (
              <a key={sc.token} href={`/scale/${sc.token}`} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"14px 16px",background:"#fff",border:"1.5px solid #e2e8f0",borderRadius:10,textDecoration:"none"}}>
                <span style={{minWidth:0}}>
                  <span style={{display:"block",fontSize:13.5,fontWeight:700,color:"#0f172a"}}>
                    {sc.scale_type || "Questionario di valutazione"}
                  </span>
                  <span style={{display:"block",fontSize:11.5,color:"#64748b",marginTop:2}}>
                    Bastano un paio di minuti
                  </span>
                </span>
                <span style={{flexShrink:0,color:"#0d9488",fontWeight:800,fontSize:13}}>Compila →</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Sedute residue del pacchetto (mig. 092) */}
      {on("packages") && packages.length > 0 && (
        <section style={{marginBottom:24}}>
          <h2 style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
            🎟️ Il tuo pacchetto
          </h2>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {packages.map(pk => (
              <div key={pk.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"14px 16px"}}>
                <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:10}}>
                  <span style={{fontSize:13.5,fontWeight:700,color:"#0f172a"}}>{pk.title || "Pacchetto sedute"}</span>
                  {pk.remaining !== null && (
                    <span style={{fontSize:15,fontWeight:800,color:pk.remaining === 0 ? "#b45309" : "#0d9488"}}>
                      {pk.remaining}
                    </span>
                  )}
                </div>
                <div style={{fontSize:11.5,color:"#64748b",marginTop:3}}>
                  {pk.remaining === null
                    ? `${pk.used} sedute utilizzate`
                    : pk.remaining === 0
                      ? "Pacchetto terminato"
                      : `${pk.remaining === 1 ? "seduta rimasta" : "sedute rimaste"} su ${pk.total} · ${pk.used} già svolte`}
                  {pk.expires_at && ` · valido fino al ${new Date(pk.expires_at).toLocaleDateString("it-IT")}`}
                </div>
                {pk.remaining !== null && pk.total ? (
                  <div style={{marginTop:8,height:6,borderRadius:3,background:"#e2e8f0",overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${Math.min(100,(pk.used/pk.total)*100)}%`,background:"#0d9488"}} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Diario del dolore (mig. 092) */}
      {on("pain_diary") && (
        <section style={{marginBottom:24}}>
          <h2 style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
            🩹 Come stai oggi?
          </h2>
          <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"16px"}}>
            <div style={{fontSize:12,color:"#64748b",marginBottom:12,lineHeight:1.5}}>
              Segna il livello di dolore di oggi: 0 nessun dolore, 10 il massimo.
              Serve al tuo terapista per vedere l&apos;andamento reale tra una seduta e l&apos;altra.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(11,1fr)",gap:4}}>
              {Array.from({length:11},(_,i)=>i).map(n => {
                const active = painLevel === n;
                return (
                  <button key={n} onClick={()=>void savePain(n)} disabled={painSaving}
                    style={{padding:"8px 0",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:800,
                      border:`1px solid ${active?"#0d9488":"#e2e8f0"}`,
                      background:active?"#0d9488":"#fff",
                      color:active?"#fff":"#475569"}}>
                    {n}
                  </button>
                );
              })}
            </div>
            {painSaved && (
              <div style={{fontSize:11.5,color:"#15803d",marginTop:10,fontWeight:700}}>
                Registrato ✓ — puoi cambiarlo quando vuoi
              </div>
            )}
            {painLog.length > 0 && (
              <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid #e2e8f0"}}>
                <div style={{fontSize:10.5,fontWeight:700,color:"#64748b",letterSpacing:0.4,textTransform:"uppercase",marginBottom:8}}>
                  Ultimi giorni
                </div>
                <div style={{display:"flex",alignItems:"flex-end",gap:3,height:44}}>
                  {painLog.slice(0,14).reverse().map(e => (
                    <div key={e.day} title={`${new Date(e.day).toLocaleDateString("it-IT")} — ${e.level}/10`}
                      style={{flex:1,height:`${Math.max(8,(e.level/10)*100)}%`,borderRadius:2,
                        background:e.level>=7?"#dc2626":e.level>=4?"#f59e0b":"#0d9488"}} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Scheda esercizi */}
      {on("exercises") && data.exercise_token && (
        <section style={{marginBottom:24}}>
          <h2 style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
            🏋️ La tua scheda esercizi
          </h2>
          <a href={`/esercizi/${data.exercise_token}`} style={{display:"block",padding:"16px 18px",background:"linear-gradient(135deg,#16a34a,#0d9488)",borderRadius:10,color:"#fff",textDecoration:"none"}}>
            <div style={{fontSize:15,fontWeight:800,marginBottom:4}}>📋 Apri scheda esercizi domiciliari →</div>
            <div style={{fontSize:11,opacity:0.85}}>Esercizi, video e indicazioni da fare a casa</div>
          </a>
          {/* Aderenza: giorni con almeno un esercizio spuntato (mig. 054) */}
          <div style={{marginTop:8,padding:"10px 14px",borderRadius:8,background:"#f8fafc",border:"1px solid #e2e8f0",fontSize:12,color:"#475569"}}>
            {adherenceDays === 0
              ? "Questa settimana non hai ancora spuntato nessun esercizio."
              : `Questa settimana ti sei allenato ${adherenceDays} ${adherenceDays === 1 ? "giorno" : "giorni"} su 7.`}
          </div>
        </section>
      )}

      {/* Info contatti — dinamico dallo studio */}
      {/* Invito a installare: il manifest c'è (tappa 2), ma su iOS il
          browser non propone nulla da solo e va spiegato al paziente. */}
      <section style={{marginBottom:20}}>
        <div style={{padding:"12px 14px",borderRadius:10,background:"#f8fafc",border:"1px dashed #cbd5e1",fontSize:11.5,color:"#64748b",lineHeight:1.55}}>
          <strong style={{color:"#475569"}}>Tienila a portata di mano.</strong> Puoi
          aggiungere questa pagina alla schermata Home del telefono e aprirla come
          un&apos;app: su iPhone tocca <em>Condividi</em> e poi <em>Aggiungi a Home</em>,
          su Android il menu <em>⋮</em> e poi <em>Installa app</em>.
        </div>
      </section>

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
