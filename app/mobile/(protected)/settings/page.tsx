"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";

const THEME = {
  appBg:"#f1f5f9", panelBg:"#ffffff", text:"#0f172a", muted:"#334155",
  border:"#cbd5e1", blue:"#2563eb", teal:"#0d9488", green:"#16a34a",
  red:"#dc2626", amber:"#f97316", gray:"#94a3b8",
  gradient:"linear-gradient(135deg,#0d9488,#2563eb)",
};

const ALL_TREATMENTS = [
  {value:"seduta",label:"Seduta",color:"#0d9488"},
  {value:"macchinario",label:"Macchinario",color:"#2563eb"},
  {value:"laser",label:"Laser",color:"#d97706"},
  {value:"tecar",label:"Tecar",color:"#ea580c"},
  {value:"onde_urto",label:"Onde d'urto",color:"#7c3aed"},
  {value:"tens",label:"TENS",color:"#059669"},
];
const DAY_LABELS = ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
const DAY_ORDER = [1,2,3,4,5,6,0];

function toMoneyString(n:any, fallback:string){ if(typeof n!=="number"||Number.isNaN(n))return fallback; return n.toFixed(2); }
function toNum(s:string,fb:number){ const n=Number(String(s).replace(",",".")); return Number.isFinite(n)?n:fb; }
function validatePrice(v:string){ const c=v.replace(/[^\d.,]/g,"").replace(",","."); const p=c.split("."); if(p.length>1)return `${p[0]}.${p[1].slice(0,2)}`; return c||"0.00"; }

export default function MobileSettingsPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeSection, setActiveSection] = useState<string|null>(null);

  // ── Practice ──
  const [practiceName, setPracticeName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [googleReviewLink, setGoogleReviewLink] = useState("");

  // ── Prices ──
  const [prices, setPrices] = useState<Record<string,{iv:string,cv:string}>>({
    standard:{iv:"40.00",cv:"35.00"}, macchinario:{iv:"25.00",cv:"20.00"},
    laser:{iv:"30.00",cv:"25.00"}, tecar:{iv:"30.00",cv:"25.00"},
    onde_urto:{iv:"40.00",cv:"35.00"}, tens:{iv:"20.00",cv:"15.00"},
  });

  // ── Durations ──
  const [durations, setDurations] = useState<Record<string,string>>({
    seduta:"60",macchinario:"30",laser:"20",tecar:"30",onde_urto:"15",tens:"20",
  });

  // ── Working hours ──
  const [hours, setHours] = useState<{day_of_week:number;open_time:string;close_time:string;is_open:boolean}[]>([]);

  // ── Goals ──
  const [monthlyGoal, setMonthlyGoal] = useState("2000");
  const [inactiveThresh, setInactiveThresh] = useState("45");

  // ── Password ──
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  // ── Load ──
  useEffect(()=>{
    (async()=>{
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from("practice_settings").select("*").eq("owner_id",user.id).maybeSingle();
        if (data) {
          setPracticeName(data.practice_name||"");
          setOwnerName(data.owner_full_name||"");
          setPhone(data.phone||"");
          setAddress(data.address||"");
          setGoogleReviewLink(data.google_review_link||"");
          setPrices({
            standard:{iv:toMoneyString(data.standard_invoice,"40.00"),cv:toMoneyString(data.standard_cash,"35.00")},
            macchinario:{iv:toMoneyString(data.machine_invoice,"25.00"),cv:toMoneyString(data.machine_cash,"20.00")},
            laser:{iv:toMoneyString((data as any).laser_invoice,"30.00"),cv:toMoneyString((data as any).laser_cash,"25.00")},
            tecar:{iv:toMoneyString((data as any).tecar_invoice,"30.00"),cv:toMoneyString((data as any).tecar_cash,"25.00")},
            onde_urto:{iv:toMoneyString((data as any).onde_urto_invoice,"40.00"),cv:toMoneyString((data as any).onde_urto_cash,"35.00")},
            tens:{iv:toMoneyString((data as any).tens_invoice,"20.00"),cv:toMoneyString((data as any).tens_cash,"15.00")},
          });
          setDurations({
            seduta:String((data as any).duration_seduta||60),
            macchinario:String((data as any).duration_macchinario||30),
            laser:String((data as any).duration_laser||20),
            tecar:String((data as any).duration_tecar||30),
            onde_urto:String((data as any).duration_onde_urto||15),
            tens:String((data as any).duration_tens||20),
          });
          setMonthlyGoal(String((data as any).monthly_revenue_goal||2000));
          setInactiveThresh(String((data as any).inactive_threshold_days||45));
        }
        const { data: wh } = await supabase.from("working_hours").select("*").order("day_of_week");
        if (wh && wh.length) {
          setHours(wh.map((r:any)=>({day_of_week:r.day_of_week,open_time:(r.open_time||"09:00").slice(0,5),close_time:(r.close_time||"19:00").slice(0,5),is_open:r.is_open??true})));
        } else {
          setHours(Array.from({length:7},(_,d)=>({day_of_week:d,open_time:"09:00",close_time:"19:00",is_open:d!==0})));
        }
      } catch(e:any){ setError(e?.message||"Errore caricamento"); }
    })();
  },[]);

  async function save() {
    setSaving(true); setError(""); setSuccess("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");
      await supabase.from("practice_settings").upsert({
        owner_id:user.id, practice_name:practiceName, owner_full_name:ownerName,
        phone, address, google_review_link:googleReviewLink,
        standard_invoice:toNum(prices.standard.iv,40), standard_cash:toNum(prices.standard.cv,35),
        machine_invoice:toNum(prices.macchinario.iv,25), machine_cash:toNum(prices.macchinario.cv,20),
        laser_invoice:toNum(prices.laser.iv,30), laser_cash:toNum(prices.laser.cv,25),
        tecar_invoice:toNum(prices.tecar.iv,30), tecar_cash:toNum(prices.tecar.cv,25),
        onde_urto_invoice:toNum(prices.onde_urto.iv,40), onde_urto_cash:toNum(prices.onde_urto.cv,35),
        tens_invoice:toNum(prices.tens.iv,20), tens_cash:toNum(prices.tens.cv,15),
        duration_seduta:parseInt(durations.seduta)||60,
        duration_macchinario:parseInt(durations.macchinario)||30,
        duration_laser:parseInt(durations.laser)||20,
        duration_tecar:parseInt(durations.tecar)||30,
        duration_onde_urto:parseInt(durations.onde_urto)||15,
        duration_tens:parseInt(durations.tens)||20,
        monthly_revenue_goal:parseFloat(monthlyGoal)||2000,
        inactive_threshold_days:parseInt(inactiveThresh)||45,
      },{ onConflict:"owner_id" });
      // Save working hours
      if (hours.length) {
        await supabase.from("working_hours").upsert(
          hours.map(h=>({day_of_week:h.day_of_week,open_time:h.open_time,close_time:h.close_time,is_open:h.is_open})),
          { onConflict:"day_of_week" }
        );
      }
      setSuccess("Impostazioni salvate.");
      setTimeout(()=>setSuccess(""),3000);
    } catch(e:any){ setError(e?.message||"Errore salvataggio"); }
    finally { setSaving(false); }
  }

  async function changePassword() {
    setPwError(""); setPwSuccess("");
    if (pwNew.length < 8) { setPwError("Minimo 8 caratteri."); return; }
    if (pwNew !== pwConfirm) { setPwError("Le password non coincidono."); return; }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwNew });
      if (error) throw error;
      setPwSuccess("Password aggiornata."); setPwNew(""); setPwConfirm("");
    } catch(e:any){ setPwError(e?.message||"Errore"); }
    finally { setPwSaving(false); }
  }

  const inp: React.CSSProperties = { width:"100%", padding:"11px 14px", borderRadius:10, border:`1.5px solid ${THEME.border}`, fontSize:15, fontWeight:500, background:"#fff", color:THEME.text, outline:"none", boxSizing:"border-box" };
  const lbl: React.CSSProperties = { display:"block", fontSize:11, fontWeight:700, color:THEME.muted, marginBottom:5, textTransform:"uppercase", letterSpacing:0.4 };

  const Section = ({id,title,sub,children}:{id:string,title:string,sub:string,children:React.ReactNode}) => (
    <div style={{ background:THEME.panelBg, borderRadius:14, border:`1px solid ${THEME.border}`, overflow:"hidden", marginBottom:12 }}>
      <div onClick={()=>setActiveSection(activeSection===id?null:id)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 18px", cursor:"pointer" }}>
        <div><div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>{title}</div><div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>{sub}</div></div>
        <span style={{ color:THEME.muted, fontSize:14, transform:activeSection===id?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
      </div>
      {activeSection===id && <div style={{ padding:"0 18px 18px", borderTop:`1px solid ${THEME.border}` }}>{children}</div>}
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:THEME.appBg, fontFamily:"'Outfit','Segoe UI',system-ui,sans-serif", paddingBottom:80 }}>
      <style jsx global>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}body{margin:0;background:${THEME.appBg};}a{text-decoration:none;}input:focus{border-color:${THEME.teal}!important;outline:none!important;}`}</style>

      {/* Header */}
      <header style={{ background:THEME.gradient, padding:"14px 18px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:20 }}>
        <button onClick={()=>router.back()} style={{ background:"rgba(255,255,255,0.2)", border:"1.5px solid rgba(255,255,255,0.3)", borderRadius:8, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", padding:"6px 12px" }}>←</button>
        <div style={{ fontWeight:800, fontSize:17, color:"#fff" }}>Impostazioni</div>
      </header>

      <div style={{ padding:"16px" }}>
        {error && <div style={{ marginBottom:12, padding:"10px 14px", borderRadius:10, background:"rgba(220,38,38,0.06)", border:"1px solid rgba(220,38,38,0.2)", color:THEME.red, fontWeight:600, fontSize:13 }}>{error}</div>}
        {success && <div style={{ marginBottom:12, padding:"10px 14px", borderRadius:10, background:"rgba(22,163,74,0.06)", border:"1px solid rgba(22,163,74,0.2)", color:THEME.green, fontWeight:600, fontSize:13 }}>{success}</div>}

        <Section id="studio" title="Dati Studio" sub={practiceName||"Nome studio, contatti"}>
          <div style={{ display:"flex", flexDirection:"column", gap:12, paddingTop:14 }}>
            {[{l:"Nome studio",v:practiceName,s:setPracticeName},{l:"Titolare",v:ownerName,s:setOwnerName},{l:"Telefono",v:phone,s:setPhone},{l:"Indirizzo",v:address,s:setAddress}].map(f=>(
              <div key={f.l}><label style={lbl}>{f.l}</label><input value={f.v} onChange={e=>f.s(e.target.value)} style={inp}/></div>
            ))}
            <div><label style={lbl}>Link Google Review</label><input value={googleReviewLink} onChange={e=>setGoogleReviewLink(e.target.value)} placeholder="https://g.page/r/..." style={inp}/></div>
          </div>
        </Section>

        <Section id="tariffe" title="Tariffe" sub="Prezzi per tipo trattamento">
          <div style={{ display:"flex", flexDirection:"column", gap:10, paddingTop:14 }}>
            {ALL_TREATMENTS.map(t=>{
              const key = t.value==="seduta"?"standard":t.value;
              const p = prices[key]||{iv:"0.00",cv:"0.00"};
              return (
                <div key={t.value} style={{ padding:"12px", borderRadius:10, border:`2px solid ${t.color}22`, background:`${t.color}08` }}>
                  <div style={{ fontWeight:700, fontSize:13, color:t.color, marginBottom:8 }}>{t.label}</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    <div><label style={lbl}>Con ricevuta</label><input type="number" value={p.iv} onChange={e=>setPrices(prev=>({...prev,[key]:{...prev[key],iv:validatePrice(e.target.value)}}))} style={{ ...inp, textAlign:"right", fontWeight:700 }}/></div>
                    <div><label style={lbl}>Contanti</label><input type="number" value={p.cv} onChange={e=>setPrices(prev=>({...prev,[key]:{...prev[key],cv:validatePrice(e.target.value)}}))} style={{ ...inp, textAlign:"right", fontWeight:700 }}/></div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section id="durate" title="Durate Appuntamento" sub="Minuti predefiniti per tipo">
          <div style={{ display:"flex", flexDirection:"column", gap:10, paddingTop:14 }}>
            {ALL_TREATMENTS.map(t=>(
              <div key={t.value} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:10, border:`2px solid ${t.color}22`, background:`${t.color}06` }}>
                <span style={{ fontWeight:700, fontSize:14, color:t.color }}>{t.label}</span>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <input type="number" value={durations[t.value]||"30"} onChange={e=>setDurations(prev=>({...prev,[t.value]:e.target.value}))} min={5} max={240} step={5} style={{ ...inp, width:70, textAlign:"right", fontWeight:700, padding:"8px 10px" }}/>
                  <span style={{ fontSize:12, color:THEME.muted }}>min</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section id="orari" title="Orari di Lavoro" sub={`${hours.filter(h=>h.is_open).length} giorni aperti`}>
          <div style={{ display:"flex", flexDirection:"column", gap:8, paddingTop:14 }}>
            {DAY_ORDER.map(d=>{
              const h = hours.find(x=>x.day_of_week===d);
              if(!h) return null;
              return (
                <div key={d} style={{ padding:"12px 14px", borderRadius:10, border:`1px solid ${THEME.border}`, background:h.is_open?"#fff":THEME.appBg, opacity:h.is_open?1:0.6 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:h.is_open?10:0 }}>
                    <span style={{ fontWeight:700, fontSize:14, color:THEME.text }}>{DAY_LABELS[d]}</span>
                    <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
                      <input type="checkbox" checked={h.is_open} onChange={e=>setHours(prev=>prev.map(r=>r.day_of_week===d?{...r,is_open:e.target.checked}:r))} style={{ width:18, height:18, accentColor:THEME.teal, cursor:"pointer" }}/>
                      <span style={{ fontSize:13, fontWeight:700, color:h.is_open?THEME.teal:THEME.muted }}>{h.is_open?"Aperto":"Chiuso"}</span>
                    </label>
                  </div>
                  {h.is_open && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                      <div><label style={lbl}>Apertura</label><input type="time" value={h.open_time} onChange={e=>setHours(prev=>prev.map(r=>r.day_of_week===d?{...r,open_time:e.target.value}:r))} style={{ ...inp, padding:"9px 12px" }}/></div>
                      <div><label style={lbl}>Chiusura</label><input type="time" value={h.close_time} onChange={e=>setHours(prev=>prev.map(r=>r.day_of_week===d?{...r,close_time:e.target.value}:r))} style={{ ...inp, padding:"9px 12px" }}/></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <Section id="gestione" title="Gestione" sub="Obiettivi e soglie">
          <div style={{ display:"flex", flexDirection:"column", gap:12, paddingTop:14 }}>
            <div><label style={lbl}>Obiettivo fatturato mensile (€)</label><input type="number" value={monthlyGoal} onChange={e=>setMonthlyGoal(e.target.value)} style={{ ...inp, textAlign:"right", fontWeight:700 }}/></div>
            <div><label style={lbl}>Soglia paziente inattivo (giorni)</label><input type="number" value={inactiveThresh} onChange={e=>setInactiveThresh(e.target.value)} style={{ ...inp, textAlign:"right", fontWeight:700 }}/></div>
          </div>
        </Section>

        <Section id="password" title="Cambio Password" sub="Aggiorna le credenziali di accesso">
          <div style={{ display:"flex", flexDirection:"column", gap:12, paddingTop:14 }}>
            {pwError && <div style={{ padding:"9px 14px", borderRadius:8, background:"rgba(220,38,38,0.05)", border:"1px solid rgba(220,38,38,0.2)", color:THEME.red, fontWeight:600, fontSize:13 }}>{pwError}</div>}
            {pwSuccess && <div style={{ padding:"9px 14px", borderRadius:8, background:"rgba(22,163,74,0.06)", border:"1px solid rgba(22,163,74,0.2)", color:THEME.green, fontWeight:600, fontSize:13 }}>{pwSuccess}</div>}
            <div><label style={lbl}>Nuova password</label><input type="password" value={pwNew} onChange={e=>setPwNew(e.target.value)} placeholder="Minimo 8 caratteri" style={inp}/></div>
            <div><label style={lbl}>Conferma password</label><input type="password" value={pwConfirm} onChange={e=>setPwConfirm(e.target.value)} placeholder="Ripeti la nuova password" style={inp}/></div>
            <button onClick={changePassword} disabled={pwSaving||!pwNew||!pwConfirm} style={{ padding:"13px", borderRadius:10, border:"none", background:THEME.blue, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", opacity:pwSaving?0.6:1 }}>
              {pwSaving?"Aggiornamento…":"Aggiorna password"}
            </button>
          </div>
        </Section>

        {/* Salva tutto */}
        <button onClick={save} disabled={saving} style={{ width:"100%", padding:"16px", borderRadius:14, border:"none", background:THEME.gradient, color:"#fff", fontWeight:800, fontSize:15, cursor:saving?"wait":"pointer", opacity:saving?0.7:1, marginBottom:12 }}>
          {saving?"Salvataggio in corso…":"💾 Salva tutte le impostazioni"}
        </button>

        <div style={{ textAlign:"center", fontSize:11, color:THEME.gray, paddingBottom:8 }}>FisioHub · {new Date().getFullYear()}</div>
      </div>

      {/* Bottom nav */}
      <nav style={{ position:"fixed", bottom:0, left:0, right:0, height:58, background:"#fff", borderTop:`1px solid ${THEME.border}`, display:"flex", zIndex:30 }}>
        {[{href:"/mobile",label:"Home",icon:"⌂"},{href:"/mobile/calendar",label:"Calendario",icon:"▦"},{href:"/mobile/patients",label:"Pazienti",icon:"◉"},{href:"/mobile/reports",label:"Report",icon:"◈"},{href:"/mobile/settings",label:"Impost.",icon:"⚙",active:true}].map(item=>(
          <Link key={item.href} href={item.href} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, textDecoration:"none" }}>
            <span style={{ fontSize:18, lineHeight:1, ...(item as any).active?{background:THEME.gradient,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}:{color:THEME.gray} }}>{item.icon}</span>
            <span style={{ fontSize:10, fontWeight:(item as any).active?700:500, color:(item as any).active?THEME.blue:THEME.gray }}>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
