"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import Link from "next/link";

// ─── THEME (identico al calendario) ──────────────────────────────────────────
const T = {
  appBg:      "#f1f5f9",
  panelBg:    "#ffffff",
  panelSoft:  "#f7f9fd",
  text:       "#0f172a",
  textSoft:   "#1e293b",
  muted:      "#334155",
  border:     "#cbd5e1",
  borderSoft: "#94a3b8",
  blue:       "#2563eb",
  blueDark:   "#1e40af",
  green:      "#16a34a",
  greenDark:  "#15803d",
  accent:     "#0d9488",
  red:        "#dc2626",
  amber:      "#f97316",
  gray:       "#94a3b8",
};

type Period = "day" | "week" | "month";

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function startOfDay(d: Date)   { const x=new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date)     { const x=new Date(d); x.setHours(23,59,59,999); return x; }
function startOfWeek(d: Date)  { const x=new Date(d); x.setDate(x.getDate()-((x.getDay()+6)%7)); x.setHours(0,0,0,0); return x; }
function endOfWeek(d: Date)    { const s=startOfWeek(d); const x=new Date(s); x.setDate(s.getDate()+6); x.setHours(23,59,59,999); return x; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(),d.getMonth(),1,0,0,0,0); }
function endOfMonth(d: Date)   { return new Date(d.getFullYear(),d.getMonth()+1,0,23,59,59,999); }

function getRange(period: Period, base: Date) {
  if (period==="day")  return { from: startOfDay(base),   to: endOfDay(base)   };
  if (period==="week") return { from: startOfWeek(base),  to: endOfWeek(base)  };
  return                      { from: startOfMonth(base), to: endOfMonth(base) };
}
function makeLabels(period: Period, base: Date) {
  if (period==="day")  return Array.from({length:24},(_,h)=>`${String(h).padStart(2,"0")}:00`);
  if (period==="week") return ["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato","Domenica"];
  const days = new Date(base.getFullYear(), base.getMonth()+1, 0).getDate();
  return Array.from({length:days},(_,i)=>String(i+1));
}

const fmt = new Intl.NumberFormat("it-IT", { style:"currency", currency:"EUR", minimumFractionDigits:2, maximumFractionDigits:2 });

// ─── TIPI ─────────────────────────────────────────────────────────────────────
type FinancialItem = {
  amount:number; date:string; source:"invoice"|"appointment";
  description?:string; patient_name?:string; patient_id?:string; status?:string;
};
type UnpaidTherapy = {
  id:string; patient_id:string; patient_name:string;
  amount:number; date:string; treatment_type:string; days_since:number; status:string;
};
type AppointmentTherapy = {
  id:string; patient_id:string; patient_name:string;
  amount:number; date:string; treatment_type:string;
  status:"done"|"not_paid"; price_type?:string|null;
};
type Statistic = {
  total:number; invoiceCount:number; appointmentCount:number;
  averageAmount:number; maxAmount:number; minAmount:number;
  unpaidTotal:number; unpaidCount:number; unpaidAppointmentCount:number; unpaidInvoiceCount:number;
};

// ─── BAR CHART (tooltip via React state — non manipola il DOM) ───────────────
function BarChart({ labels, values, unpaidValues, period, onBarClick, selectedDay }: {
  labels:string[]; values:number[]; unpaidValues:number[];
  period:Period; onBarClick:(i:number)=>void; selectedDay:number|null;
}) {
  const [hovered, setHovered] = useState<number|null>(null);
  const CHART_H = 220;
  const LABEL_H = 44;  // spazio per le etichette sotto
  const TOOLTIP_H = 80; // spazio sopra per il tooltip
  const total    = values.reduce((a,b)=>a+b,0);
  const totalUnp = unpaidValues.reduce((a,b)=>a+b,0);
  const max = Math.max(...values.map((v,i)=>v+(unpaidValues[i]??0)), 0.01);

  return (
    <div style={{ width:"100%", overflowX:"auto" }}>
      {/* Legenda */}
      <div style={{ display:"flex", gap:16, marginBottom:14, fontSize:11, color:T.muted, fontWeight:700, flexWrap:"wrap" }}>
        <span style={{ display:"flex", alignItems:"center", gap:5 }}>
          <span style={{ width:12, height:12, background:T.blue, borderRadius:3, display:"inline-block" }}/>
          Incassato
        </span>
        <span style={{ display:"flex", alignItems:"center", gap:5 }}>
          <span style={{ width:12, height:12, background:T.red, borderRadius:3, display:"inline-block" }}/>
          Non pagato
        </span>
        <span style={{ marginLeft:"auto", fontStyle:"italic", color:T.borderSoft }}>
          Clicca su una barra per i dettagli
        </span>
      </div>

      {/* Area grafico: padding-top per il tooltip, padding-bottom per le label */}
      <div style={{
        position:"relative",
        paddingTop: TOOLTIP_H,
        paddingBottom: LABEL_H,
      }}>
        {/* Linee guida orizzontali */}
        {[1, 0.75, 0.5, 0.25].map(f => (
          <div key={f} style={{
            position:"absolute",
            left:0, right:0,
            top: TOOLTIP_H + CHART_H*(1-f),
            height:1,
            background:"rgba(203,213,225,0.5)",
            zIndex:0,
            pointerEvents:"none",
          }}>
            <span style={{
              position:"absolute", right:4, top:-9,
              fontSize:9, color:T.gray, fontWeight:700,
            }}>
              {f===1 ? fmt.format(max) : `${(f*100).toFixed(0)}%`}
            </span>
          </div>
        ))}

        {/* Barre */}
        <div style={{
          display:"flex",
          alignItems:"flex-end",
          height: CHART_H,
          gap: period==="month" ? 2 : 8,
          position:"relative", zIndex:1,
          minWidth: period==="month" ? labels.length*22 : "auto",
        }}>
          {labels.map((label, i) => {
            const v       = values[i]??0;
            const unpaid  = unpaidValues[i]??0;
            const totalV  = v+unpaid;
            const active  = totalV>0;
            const sel     = selectedDay===i;
            const hov     = hovered===i;
            const paidH   = active ? Math.max((v/max)*CHART_H, v>0?3:0)   : 0;
            const unpaidH = active ? Math.max((unpaid/max)*CHART_H, unpaid>0?3:0) : 0;

            return (
              <div
                key={i}
                style={{
                  flex:1, minWidth: period==="month" ? 18 : 28,
                  display:"flex", flexDirection:"column", alignItems:"center",
                  cursor: active ? "pointer" : "default",
                  position:"relative",
                }}
                onClick={()=>active && onBarClick(i)}
                onMouseEnter={()=>active && setHovered(i)}
                onMouseLeave={()=>setHovered(null)}
              >
                {/* Tooltip */}
                {hov && active && (
                  <div style={{
                    position:"absolute",
                    bottom: CHART_H + 8,
                    left:"50%", transform:"translateX(-50%)",
                    background:T.text, color:"#fff",
                    padding:"8px 12px", borderRadius:8,
                    fontSize:11, fontWeight:700, whiteSpace:"nowrap",
                    zIndex:100, boxShadow:"0 4px 16px rgba(0,0,0,0.3)",
                    pointerEvents:"none",
                  }}>
                    <div style={{ fontWeight:900, marginBottom:3 }}>{label}</div>
                    <div style={{ color:"#86efac" }}>✓ {fmt.format(v)}</div>
                    {unpaid>0 && <div style={{ color:"#fca5a5" }}>✗ {fmt.format(unpaid)}</div>}
                    <div style={{ borderTop:"1px solid rgba(255,255,255,0.2)", marginTop:4, paddingTop:4 }}>
                      Totale: {fmt.format(totalV)}
                    </div>
                    {/* freccia */}
                    <div style={{
                      position:"absolute", bottom:-6, left:"50%", transform:"translateX(-50%)",
                      width:0, height:0,
                      borderLeft:"6px solid transparent", borderRight:"6px solid transparent",
                      borderTop:`6px solid ${T.text}`,
                    }}/>
                  </div>
                )}

                {/* Stack barre */}
                <div style={{
                  width: period==="month" ? "85%" : "70%",
                  display:"flex", flexDirection:"column", overflow:"visible",
                  borderRadius:4,
                  outline: sel ? `2px solid ${T.blue}` : "none",
                  outlineOffset:1,
                  transform: hov||sel ? "scaleX(1.08)" : "scaleX(1)",
                  transition:"transform 0.12s ease",
                }}>
                  {/* Barra non pagato */}
                  {unpaid>0 && (
                    <div style={{
                      height:unpaidH,
                      background:"linear-gradient(180deg, rgba(220,38,38,0.9), rgba(220,38,38,0.65))",
                      borderRadius: v>0 ? "4px 4px 0 0" : 4,
                      position:"relative",
                    }}>
                      {unpaidH>18 && (
                        <span style={{ position:"absolute", top:2, left:0, right:0, textAlign:"center",
                          fontSize:8, fontWeight:900, color:"rgba(255,255,255,0.9)", lineHeight:1 }}>
                          {unpaid>=1000?`${(unpaid/1000).toFixed(1)}k`:Math.round(unpaid).toString()}
                        </span>
                      )}
                    </div>
                  )}
                  {/* Barra pagato */}
                  {v>0 && (
                    <div style={{
                      height:paidH,
                      background: active
                        ? `linear-gradient(180deg, ${T.accent}, ${T.blue})`
                        : "rgba(203,213,225,0.4)",
                      borderRadius: unpaid>0 ? "0 0 4px 4px" : 4,
                      position:"relative",
                    }}>
                      {paidH>22 && (
                        <span style={{ position:"absolute", top:3, left:0, right:0, textAlign:"center",
                          fontSize:9, fontWeight:900, color:"rgba(255,255,255,0.95)", lineHeight:1,
                          textShadow:"0 1px 2px rgba(0,0,0,0.3)" }}>
                          {v>=1000?`${(v/1000).toFixed(1)}k`:Math.round(v).toString()}
                        </span>
                      )}
                    </div>
                  )}
                  {!active && (
                    <div style={{ height:2, background:"rgba(203,213,225,0.3)", borderRadius:2 }}/>
                  )}
                </div>

                {/* Label asse X */}
                <div style={{
                  marginTop:6, fontSize: period==="month" ? 9 : 10,
                  color: sel ? T.blue : active ? T.text : T.gray,
                  fontWeight: sel ? 900 : active ? 700 : 500,
                  textAlign:"center", lineHeight:1.2,
                  height:LABEL_H-6, display:"flex", alignItems:"flex-start",
                  justifyContent:"center", padding:"0 1px",
                  overflow:"visible", whiteSpace:"nowrap",
                }}>
                  {period==="week" ? label.substring(0,3) : label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer riepilogo */}
      <div style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        marginTop:8, padding:"10px 14px",
        background:"rgba(37,99,235,0.05)",
        borderRadius:8, border:"1px solid rgba(37,99,235,0.1)",
        flexWrap:"wrap", gap:8,
      }}>
        <div style={{ display:"flex", gap:16, fontSize:12, fontWeight:700, flexWrap:"wrap" }}>
          <span style={{ color:T.green }}>✓ Incassato: <b>{fmt.format(total)}</b></span>
          <span style={{ color:T.red }}>✗ Non pagato: <b>{fmt.format(totalUnp)}</b></span>
          <span style={{ color:T.blue }}>Totale: <b>{fmt.format(total+totalUnp)}</b></span>
        </div>
        <span style={{ fontSize:11, color:T.muted }}>
          {values.filter(v=>v>0).length} periodi con incassi
        </span>
      </div>
    </div>
  );
}

// ─── CALENDAR GRID ────────────────────────────────────────────────────────────
function CalendarGrid({ baseDate, series, unpaidSeries, onDayClick, selectedDay }: {
  baseDate:Date; series:number[]; unpaidSeries:number[];
  onDayClick:(i:number)=>void; selectedDay:number|null;
}) {
  const year  = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const daysInMonth  = new Date(year, month+1, 0).getDate();
  const firstDow     = (new Date(year, month, 1).getDay()+6)%7; // 0=Lun
  const today        = new Date();
  const isThisMonth  = today.getFullYear()===year && today.getMonth()===month;
  const maxVal       = Math.max(...series.map((v,i)=>v+(unpaidSeries[i]??0)), 0.01);
  const DAYS         = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];

  const cells:(number|null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({length:daysInMonth},(_,i)=>i+1),
  ];
  while(cells.length%7!==0) cells.push(null);

  return (
    <div>
      {/* Header giorni settimana — stile calendario */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3, marginBottom:4 }}>
        {DAYS.map(d=>(
          <div key={d} style={{
            textAlign:"center", fontSize:11, fontWeight:700,
            color: d==="Sab"||d==="Dom" ? T.borderSoft : T.muted,
            padding:"6px 0", borderBottom:`2px solid ${T.border}`,
            letterSpacing:0.5,
          }}>{d}</div>
        ))}
      </div>

      {/* Griglia */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
        {cells.map((day, idx)=>{
          if(day===null) return <div key={`e${idx}`} style={{ minHeight:78 }}/>;

          const di       = day-1;
          const paid     = series[di]??0;
          const unpaid   = unpaidSeries[di]??0;
          const total    = paid+unpaid;
          const hasData  = total>0;
          const isToday  = isThisMonth && today.getDate()===day;
          const isSel    = selectedDay===di;
          const dow      = (firstDow+di)%7;
          const isWeekend= dow>=5;
          const intensity= hasData ? Math.min((paid/maxVal)*0.9+0.1, 1) : 0;

          return (
            <div
              key={day}
              onClick={()=>hasData && onDayClick(di)}
              onMouseEnter={e=>{ if(hasData)(e.currentTarget as HTMLElement).style.transform="scale(1.04)"; }}
              onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.transform="scale(1)"; }}
              style={{
                minHeight:78, padding:"7px 8px", borderRadius:9,
                background: isSel
                  ? "rgba(37,99,235,0.1)"
                  : hasData
                    ? `rgba(13,148,136,${intensity*0.15})`
                    : "transparent",
                border: isSel
                  ? `2px solid ${T.blue}`
                  : isToday
                    ? `2px solid ${T.accent}`
                    : `1px solid ${hasData?"rgba(13,148,136,0.2)":T.border}`,
                cursor: hasData ? "pointer" : "default",
                transition:"transform 0.12s ease, background 0.12s ease",
                display:"flex", flexDirection:"column",
              }}
            >
              {/* Numero giorno */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                <span style={isToday ? {
                  background:T.accent, color:"#fff",
                  width:22, height:22, borderRadius:"50%",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:11, fontWeight:800,
                } : {
                  fontSize:12, fontWeight: hasData ? 800 : 600,
                  color: isWeekend ? T.gray : T.text,
                }}>
                  {day}
                </span>
                {unpaid>0 && (
                  <div style={{ width:7, height:7, borderRadius:"50%", background:T.red, flexShrink:0 }}/>
                )}
              </div>

              {/* Importi */}
              {hasData && (
                <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
                  {paid>0 && (
                    <div style={{ fontSize:10, fontWeight:800, color:T.green, lineHeight:1.4 }}>
                      +{paid>=1000?`${(paid/1000).toFixed(1)}k€`:fmt.format(paid).replace("€","").trim()}
                    </div>
                  )}
                  {unpaid>0 && (
                    <div style={{ fontSize:9, fontWeight:700, color:T.red, lineHeight:1.4 }}>
                      ✗{unpaid>=1000?`${(unpaid/1000).toFixed(1)}k€`:fmt.format(unpaid).replace("€","").trim()}
                    </div>
                  )}
                  {/* Barra intensità */}
                  <div style={{ marginTop:4, height:2, borderRadius:1, background:T.border }}>
                    <div style={{
                      height:"100%", borderRadius:1,
                      width:`${Math.max((paid/maxVal)*100, 0)}%`,
                      background:`linear-gradient(90deg,${T.accent},${T.blue})`,
                    }}/>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legenda intensità */}
      <div style={{ marginTop:10, display:"flex", justifyContent:"flex-end", alignItems:"center", gap:6, fontSize:10, color:T.muted }}>
        <span>Basso</span>
        {[0.05,0.1,0.17,0.24,0.34].map(op=>(
          <div key={op} style={{ width:13,height:13,borderRadius:3,background:`rgba(13,148,136,${op})`,border:`1px solid rgba(13,148,136,0.3)` }}/>
        ))}
        <span>Alto</span>
        <div style={{ width:10,height:10,borderRadius:"50%",background:T.red,marginLeft:10 }}/>
        <span>Non pagato</span>
      </div>
    </div>
  );
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, bg, icon }: {
  label:string; value:string; sub?:string; color:string; bg:string; icon:string;
}) {
  return (
    <div style={{ background:bg, borderRadius:12, padding:"14px 16px",
      border:"1px solid rgba(0,0,0,0.05)", flex:1, minWidth:150, display:"flex", alignItems:"center", gap:12 }}>
      <div style={{ width:42,height:42,borderRadius:10,background:color,
        display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,flexShrink:0 }}>
        {icon}
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:10,fontWeight:800,color:T.muted,textTransform:"uppercase",letterSpacing:0.5 }}>{label}</div>
        <div style={{ fontSize:19,fontWeight:900,color,marginTop:2,lineHeight:1 }}>{value}</div>
        {sub && <div style={{ fontSize:10,color:T.muted,marginTop:2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPALE
// ─────────────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const params        = useSearchParams();
  const initPeriod    = (params.get("period") as Period)||"month";
  const initDate      = params.get("date")||toISODate(new Date());

  const [period, setPeriod]         = useState<Period>(initPeriod);
  const [dateStr, setDateStr]       = useState<string>(initDate);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string|null>(null);
  const [statistics, setStatistics] = useState<Statistic>({
    total:0,invoiceCount:0,appointmentCount:0,averageAmount:0,
    maxAmount:0,minAmount:0,unpaidTotal:0,unpaidCount:0,
    unpaidAppointmentCount:0,unpaidInvoiceCount:0,
  });
  const [series, setSeries]             = useState<number[]>([]);
  const [unpaidSeries, setUnpaidSeries] = useState<number[]>([]);
  const [rawData, setRawData]           = useState<FinancialItem[]>([]);
  const [unpaidTherapies, setUnpaidTherapies]       = useState<UnpaidTherapy[]>([]);
  const [unpaidTherapiesAll, setUnpaidTherapiesAll] = useState<UnpaidTherapy[]>([]);
  const [arrearsMonths, setArrearsMonths] = useState<{month:string;count:number;total:number}[]>([]);
  const [reportTherapies, setReportTherapies] = useState<AppointmentTherapy[]>([]);
  const [selectedDay, setSelectedDay]   = useState<number|null>(null);
  const [dayDetails, setDayDetails]     = useState<FinancialItem[]>([]);
  const [showUnpaidDropdown, setShowUnpaidDropdown] = useState(false);
  const [calView, setCalView]           = useState<"calendar"|"chart">("calendar");

  const baseDate = useMemo(()=>{
    const [y,m,d] = dateStr.split("-").map(Number);
    return new Date(y,m-1,d);
  },[dateStr]);
  const labels = useMemo(()=>makeLabels(period,baseDate),[period,baseDate]);

  // ── Fetch data ──────────────────────────────────────────────────────────────
  async function loadData() {
    setLoading(true); setError(null); setSelectedDay(null); setDayDetails([]);
    try {
      const {from,to} = getRange(period,baseDate);
      const fromStr=from.toISOString(), toStr=to.toISOString();

      // helper: carica pazienti per una lista di patient_id
      async function loadPatients(ids:string[]) {
        if(!ids.length) return [];
        const {data} = await supabase.from("patients").select("id,first_name,last_name").in("id",ids);
        return data||[];
      }
      function patName(pats:any[], pid:string) {
        const p=pats.find(x=>x.id===pid); return p?`${p.last_name||""} ${p.first_name||""}`.trim():"Sconosciuto";
      }

      // 1. Fatture pagate
      const {data:pi} = await supabase.from("invoices")
        .select("id,amount,paid_at,status,patient_id")
        .eq("status","paid").gte("paid_at",fromStr).lte("paid_at",toStr)
        .order("paid_at",{ascending:true});
      const invoicesData = pi||[];
      const invPats = await loadPatients(invoicesData.map((i:any)=>i.patient_id).filter(Boolean));

      // 2. Fatture non pagate (periodo)
      const {data:ui} = await supabase.from("invoices")
        .select("id,amount,paid_at,created_at,status,patient_id")
        .eq("status","not_paid").gte("created_at",fromStr).lte("created_at",toStr)
        .order("created_at",{ascending:true});
      const unpaidInvData = ui||[];
      const unpaidInvPats = await loadPatients(unpaidInvData.map((i:any)=>i.patient_id).filter(Boolean));

      // 3. Appuntamenti pagati
      const {data:pa} = await supabase.from("appointments")
        .select("id,amount,start_at,status,treatment_type,price_type,patient_id")
        .eq("status","done").gte("amount",0.01).gte("start_at",fromStr).lte("start_at",toStr)
        .order("start_at",{ascending:true});
      const appsData = pa||[];
      const appPats = await loadPatients(appsData.map((a:any)=>a.patient_id).filter(Boolean));

      // 4. Appuntamenti non pagati (periodo)
      const {data:ua} = await supabase.from("appointments")
        .select("id,amount,start_at,status,treatment_type,price_type,patient_id")
        .eq("status","not_paid").gte("start_at",fromStr).lte("start_at",toStr)
        .order("start_at",{ascending:true});
      const unpaidAppsData = ua||[];
      const unpaidAppPats = await loadPatients(unpaidAppsData.map((a:any)=>a.patient_id).filter(Boolean));

      // 4b. Arretrati
      const {data:ar} = await supabase.from("appointments")
        .select("id,amount,start_at,status").eq("status","not_paid")
        .lt("start_at",fromStr).order("start_at",{ascending:false}).limit(5000);
      const monthMap=new Map<string,{count:number;total:number}>();
      (ar||[]).forEach((a:any)=>{
        const amt=parseFloat(String(a.amount))||0; if(amt<=0) return;
        const dt=new Date(a.start_at);
        const key=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
        const prev=monthMap.get(key)||{count:0,total:0};
        monthMap.set(key,{count:prev.count+1,total:prev.total+amt});
      });
      setArrearsMonths(Array.from(monthMap.entries()).map(([month,v])=>({month,...v})).sort((a,b)=>a.month<b.month?1:-1));

      // 5. Lista completa non pagati (tutti i mesi)
      const {data:uiAll} = await supabase.from("invoices")
        .select("id,amount,paid_at,created_at,status,patient_id").eq("status","not_paid")
        .order("created_at",{ascending:true}).limit(5000);
      const {data:uaAll} = await supabase.from("appointments")
        .select("id,amount,start_at,status,treatment_type,price_type,patient_id").eq("status","not_paid")
        .order("start_at",{ascending:true}).limit(5000);
      const allUnpaidPats = await loadPatients(Array.from(new Set([
        ...((uiAll||[]).map((i:any)=>i.patient_id).filter(Boolean)),
        ...((uaAll||[]).map((a:any)=>a.patient_id).filter(Boolean)),
      ])));

      const todayD=new Date();
      const unpaidAllList:UnpaidTherapy[]=[];
      (uiAll||[]).forEach((inv:any)=>{
        const amt=parseFloat(String(inv.amount))||0; if(amt<=0) return;
        const invDate=new Date(inv.paid_at||inv.created_at);
        unpaidAllList.push({ id:inv.id, patient_id:inv.patient_id, patient_name:patName(allUnpaidPats,inv.patient_id),
          amount:amt, date:inv.paid_at||inv.created_at, treatment_type:"Fattura",
          days_since:Math.floor((todayD.getTime()-invDate.getTime())/86400000), status:"not_paid" });
      });
      (uaAll||[]).forEach((app:any)=>{
        const amt=parseFloat(String(app.amount))||0; if(amt<=0) return;
        const appDate=new Date(app.start_at);
        unpaidAllList.push({ id:app.id, patient_id:app.patient_id, patient_name:patName(allUnpaidPats,app.patient_id),
          amount:amt, date:app.start_at, treatment_type:app.treatment_type||"Seduta",
          days_since:Math.floor((todayD.getTime()-appDate.getTime())/86400000), status:app.status });
      });
      unpaidAllList.sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime());
      setUnpaidTherapiesAll(unpaidAllList);

      // Terapie per stampa
      const therapiesForPrint:AppointmentTherapy[]=[
        ...(appsData||[]).map((a:any)=>({
          id:String(a.id), patient_id:String(a.patient_id||""),
          patient_name:patName(appPats,a.patient_id),
          amount:parseFloat(String(a.amount))||0, date:a.start_at,
          treatment_type:a.treatment_type||"Terapia", status:"done" as const, price_type:a.price_type??null,
        })),
        ...(unpaidAppsData||[]).map((a:any)=>({
          id:String(a.id), patient_id:String(a.patient_id||""),
          patient_name:patName(unpaidAppPats,a.patient_id),
          amount:parseFloat(String(a.amount))||0, date:a.start_at,
          treatment_type:a.treatment_type||"Terapia", status:"not_paid" as const, price_type:a.price_type??null,
        })),
      ].filter(t=>!!t.date).sort((x,y)=>{
        const pn=x.patient_name.localeCompare(y.patient_name,"it"); if(pn!==0) return pn;
        return new Date(x.date).getTime()-new Date(y.date).getTime();
      });
      setReportTherapies(therapiesForPrint);

      // FinancialItems pagati
      const invoices:FinancialItem[] = invoicesData.map((i:any)=>({
        amount:parseFloat(String(i.amount))||0, date:i.paid_at, source:"invoice" as const,
        description:`Fattura #${i.id}`, patient_name:patName(invPats,i.patient_id),
        patient_id:i.patient_id, status:"paid",
      })).filter((x:FinancialItem)=>x.amount>0);

      const appointments:FinancialItem[] = appsData.map((a:any)=>({
        amount:parseFloat(String(a.amount))||0, date:a.start_at, source:"appointment" as const,
        description:`${a.treatment_type||"Seduta"}`, patient_name:patName(appPats,a.patient_id),
        patient_id:a.patient_id, status:"paid",
      })).filter((x:FinancialItem)=>x.amount>0);

      const allData:FinancialItem[]=[...invoices,...appointments];
      setRawData(allData);

      // Unpaid periodo
      const unpaidList:UnpaidTherapy[]=[];
      unpaidInvData.forEach((inv:any)=>{
        const amt=parseFloat(String(inv.amount))||0; if(amt<=0) return;
        const invDate=new Date(inv.paid_at||inv.created_at);
        unpaidList.push({ id:inv.id, patient_id:inv.patient_id, patient_name:patName(unpaidInvPats,inv.patient_id),
          amount:amt, date:inv.paid_at||inv.created_at, treatment_type:"Fattura",
          days_since:Math.floor((todayD.getTime()-invDate.getTime())/86400000), status:"not_paid" });
      });
      unpaidAppsData.forEach((app:any)=>{
        const amt=parseFloat(String(app.amount))||0; if(amt<=0) return;
        const appDate=new Date(app.start_at);
        unpaidList.push({ id:app.id, patient_id:app.patient_id, patient_name:patName(unpaidAppPats,app.patient_id),
          amount:amt, date:app.start_at, treatment_type:app.treatment_type||"Seduta",
          days_since:Math.floor((todayD.getTime()-appDate.getTime())/86400000), status:app.status });
      });
      unpaidList.sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime());
      setUnpaidTherapies(unpaidList);

      // Statistiche
      const amounts=allData.map(i=>i.amount).filter(a=>a>0);
      const total=amounts.reduce((s,a)=>s+a,0);
      setStatistics({
        total, invoiceCount:invoices.length, appointmentCount:appointments.length,
        averageAmount:amounts.length>0?total/amounts.length:0,
        maxAmount:amounts.length>0?Math.max(...amounts):0,
        minAmount:amounts.length>0?Math.min(...amounts):0,
        unpaidTotal:unpaidList.reduce((s,i)=>s+i.amount,0),
        unpaidCount:unpaidList.length,
        unpaidInvoiceCount:unpaidInvData.length,
        unpaidAppointmentCount:unpaidAppsData.length,
      });

      // Series grafico
      function getBucket(dt:Date):number {
        if(period==="day")  return dt.getHours();
        if(period==="week") return (dt.getDay()+6)%7;
        return dt.getDate()-1;
      }
      const paidB=new Array(labels.length).fill(0);
      const unpaidB=new Array(labels.length).fill(0);
      for(const item of allData){
        if(!item.date) continue;
        const idx=getBucket(new Date(item.date));
        if(idx>=0&&idx<labels.length) paidB[idx]+=item.amount;
      }
      for(const item of unpaidList){
        const idx=getBucket(new Date(item.date));
        if(idx>=0&&idx<labels.length) unpaidB[idx]+=item.amount;
      }
      setSeries(paidB); setUnpaidSeries(unpaidB);

    } catch(e:any){
      console.error(e);
      setError(e.message||"Errore nel caricamento dei dati.");
    } finally { setLoading(false); }
  }

  function getDayDetails(dayIndex:number):FinancialItem[] {
    function getBucket(dt:Date):number {
      if(period==="day")  return dt.getHours();
      if(period==="week") return (dt.getDay()+6)%7;
      return dt.getDate()-1;
    }
    const items:FinancialItem[]=[];
    rawData.forEach(item=>{
      if(!item.date) return;
      if(getBucket(new Date(item.date))===dayIndex) items.push({...item,status:"paid"});
    });
    unpaidTherapies.forEach(item=>{
      if(getBucket(new Date(item.date))===dayIndex)
        items.push({ amount:item.amount, date:item.date, source:"appointment",
          description:`${item.treatment_type}`, patient_name:item.patient_name,
          patient_id:item.patient_id, status:"not_paid" });
    });
    return items;
  }

  function handleBarClick(i:number){
    setSelectedDay(i); setDayDetails(getDayDetails(i));
  }

  useEffect(()=>{
    setSeries([]); setUnpaidSeries([]); setSelectedDay(null); setDayDetails([]);
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[period,dateStr]);

  useEffect(()=>{
    setCalView(period==="month"?"calendar":"chart");
  },[period]);

  // ── Helpers UI ───────────────────────────────────────────────────────────────
  const uniquePatients = useMemo(()=>
    Array.from(new Set(unpaidTherapiesAll.map(t=>t.patient_name))).sort(),
    [unpaidTherapiesAll]);

  function fmtMonthKey(k:string):string {
    const [y,m]=k.split("-").map(Number);
    return new Date(y,(m||1)-1,1).toLocaleDateString("it-IT",{month:"short",year:"numeric"});
  }

  function periodLabel():string {
    const {from,to}=getRange(period,baseDate);
    if(period==="day")  return from.toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
    if(period==="week") return `${from.toLocaleDateString("it-IT")} → ${to.toLocaleDateString("it-IT")}`;
    const MESI=["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
    return `${MESI[from.getMonth()]} ${from.getFullYear()}`;
  }

  function navigate(dir:1|-1){
    const d=new Date(baseDate);
    if(period==="day")   d.setDate(d.getDate()+dir);
    if(period==="week")  d.setDate(d.getDate()+dir*7);
    if(period==="month") d.setMonth(d.getMonth()+dir);
    setDateStr(toISODate(d));
  }

  const riscossione = (statistics.total+statistics.unpaidTotal)>0
    ? Math.round((statistics.total/(statistics.total+statistics.unpaidTotal))*100) : 100;
  const activeDays = series.filter(v=>v>0).length;
  const avgPerActive = activeDays>0 ? statistics.total/activeDays : 0;

  // ── Stampa ──────────────────────────────────────────────────────────────────
  function printReport(therapies:UnpaidTherapy[], title:string) {
    const pw=window.open("","_blank"); if(!pw) return;
    const esc=(s:any)=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
    const byPat:{[k:string]:{items:UnpaidTherapy[];total:number}}={};
    therapies.forEach(t=>{ if(!byPat[t.patient_name]) byPat[t.patient_name]={items:[],total:0};
      byPat[t.patient_name].items.push(t); byPat[t.patient_name].total+=t.amount; });
    let rows=""; let grand=0;
    Object.keys(byPat).forEach(pn=>{
      const pd=byPat[pn]; grand+=pd.total;
      rows+=`<tr style="background:#f0f0f0"><td colspan="4"><strong>${esc(pn)}</strong></td><td><strong>${fmt.format(pd.total)}</strong></td></tr>`;
      pd.items.forEach(item=>{ rows+=`<tr><td></td><td>${esc(item.treatment_type)}</td><td>${new Date(item.date).toLocaleDateString("it-IT")}</td><td>${item.days_since}g</td><td>${fmt.format(item.amount)}</td></tr>`; });
    });
    rows+=`<tr style="background:#ddd"><td colspan="4"><strong>TOTALE</strong></td><td><strong>${fmt.format(grand)}</strong></td></tr>`;
    pw.document.write(`<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>${esc(title)}</title>
    <style>body{font-family:Arial,sans-serif;padding:2cm}table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #000;padding:6pt;font-size:10pt}th{background:#f0f0f0}</style></head><body>
    <button onclick="window.print()" style="padding:8px 16px;margin-bottom:20px;cursor:pointer">🖨️ Stampa</button>
    <h1 style="text-align:center">${esc(title)}</h1>
    <p style="text-align:center;color:#555">${new Date().toLocaleDateString("it-IT",{year:"numeric",month:"long",day:"numeric"})}</p>
    <table><thead><tr><th>Paziente</th><th>Tipo</th><th>Data</th><th>Giorni</th><th>Importo</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p style="margin-top:1cm;font-size:9pt;color:#555">Generato da FisioHub · ${therapies.length} terapie</p>
    <script>window.onload=()=>setTimeout(()=>window.print(),500);</script></body></html>`);
    pw.document.close();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:T.appBg, fontFamily:"'Outfit','Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        * { -webkit-font-smoothing:antialiased; box-sizing:border-box; }
        body { margin:0; background:${T.appBg}; }
        button,input,select { font-family:inherit; }
        input:focus,select:focus { border-color:${T.blue}!important; box-shadow:0 0 0 3px rgba(37,99,235,0.12)!important; outline:none!important; }
        .rep-scroll::-webkit-scrollbar { width:4px; }
        .rep-scroll::-webkit-scrollbar-thumb { background:rgba(37,99,235,0.15); border-radius:99px; }
        @media print { .no-print { display:none!important; } }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════════
          TOP BAR  — identica al calendario
      ══════════════════════════════════════════════════════════════════ */}
      <header className="no-print" style={{
        position:"sticky", top:0, zIndex:50,
        background:"linear-gradient(135deg, #0d9488, #2563eb)",
        padding:"0 20px", height:58,
        display:"flex", alignItems:"center", justifyContent:"space-between",
        boxShadow:"0 2px 12px rgba(13,148,136,0.2)", gap:8,
      }}>
        {/* Sinistra: logo + nav */}
        <div style={{ display:"flex", alignItems:"center", gap:20, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{
              width:30,height:30,borderRadius:8,
              background:"rgba(255,255,255,0.2)",
              display:"flex",alignItems:"center",justifyContent:"center",
              color:"#fff",fontWeight:800,fontSize:14,
              border:"1.5px solid rgba(255,255,255,0.3)",
            }}>F</div>
            <span style={{ fontWeight:700,fontSize:15,color:"#fff",letterSpacing:0.5,textTransform:"uppercase" as const }}>
              Fisio<span style={{ fontWeight:800 }}>Hub</span>
            </span>
          </div>
          <nav style={{ display:"flex", gap:2 }}>
            {[
              { href:"/",         label:"Home",       icon:"⌂" },
              { href:"/calendar", label:"Calendario",  icon:"▦" },
              { href:"/reports",  label:"Report",      icon:"◈", active:true },
              { href:"/patients", label:"Pazienti",    icon:"◉" },
            ].map(item=>(
              <Link key={item.href} href={item.href} style={{
                padding:"6px 12px", borderRadius:8, fontSize:12, fontWeight:700,
                textDecoration:"none",
                background:item.active?"rgba(255,255,255,0.22)":"transparent",
                color:item.active?"#fff":"rgba(255,255,255,0.8)",
                letterSpacing:0.3,
              }}>
                {item.icon} {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Centro: periodo + navigazione */}
        <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, justifyContent:"center" }}>
          {/* Date title */}
          <span style={{ fontWeight:800, fontSize:15, color:"#fff", whiteSpace:"nowrap",
            textShadow:"0 1px 3px rgba(0,0,0,0.15)", letterSpacing:-0.3 }}>
            {periodLabel()}
          </span>

          {/* ◀ Oggi ▶ */}
          <button onClick={()=>navigate(-1)} style={{
            padding:"5px 12px", borderRadius:8, border:"1.5px solid rgba(255,255,255,0.35)",
            background:"rgba(255,255,255,0.15)", color:"#fff",
            cursor:"pointer", fontWeight:700, fontSize:13,
          }}>◀</button>
          <button onClick={()=>setDateStr(toISODate(new Date()))} style={{
            padding:"5px 12px", borderRadius:8, border:"1.5px solid rgba(255,255,255,0.5)",
            background:"rgba(255,255,255,0.25)", color:"#fff",
            cursor:"pointer", fontWeight:700, fontSize:12,
          }}>Oggi</button>
          <button onClick={()=>navigate(1)} style={{
            padding:"5px 12px", borderRadius:8, border:"1.5px solid rgba(255,255,255,0.35)",
            background:"rgba(255,255,255,0.15)", color:"#fff",
            cursor:"pointer", fontWeight:700, fontSize:13,
          }}>▶</button>

          {/* Pill: Giorno / Settimana / Mese */}
          <div style={{ display:"flex", gap:0 }}>
            {([
              {k:"day",   label:"Giorno"},
              {k:"week",  label:"Settimana"},
              {k:"month", label:"Mese"},
            ] as {k:Period;label:string}[]).map((p,idx)=>(
              <button key={p.k} onClick={()=>setPeriod(p.k)} style={{
                padding:"6px 16px",
                borderRadius: idx===0?"8px 0 0 8px":idx===2?"0 8px 8px 0":"0",
                border:`2px solid ${period===p.k?T.blue:"rgba(255,255,255,0.3)"}`,
                background:period===p.k?"linear-gradient(135deg,#0d9488,#2563eb)":"rgba(255,255,255,0.12)",
                color:period===p.k?"#93c5fd":"rgba(255,255,255,0.85)",
                cursor:"pointer", fontWeight:700, fontSize:12, letterSpacing:0.3,
                transition:"all 0.15s",
              }}>{p.label}</button>
            ))}
          </div>
        </div>

        {/* Destra: stats rapide + azioni */}
        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          {/* Mini stats */}
          {!loading && (
            <>
              <span style={{ fontSize:11,fontWeight:700,color:"#fff",background:"rgba(255,255,255,0.2)",
                padding:"4px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.15)",whiteSpace:"nowrap" }}>
                ✓ {fmt.format(statistics.total)}
              </span>
              <span style={{ fontSize:11,fontWeight:700,color:"#fff",background:"rgba(220,38,38,0.35)",
                padding:"4px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.15)",whiteSpace:"nowrap" }}>
                ✗ {fmt.format(statistics.unpaidTotal)}
              </span>
            </>
          )}

          {/* Pulsante Report Totali */}
          <button onClick={()=>{
            const {from,to}=getRange(period,baseDate);
            const rangeLabel=period==="day"?from.toLocaleDateString("it-IT"):
              period==="week"?`${from.toLocaleDateString("it-IT")} → ${to.toLocaleDateString("it-IT")}`:
              from.toLocaleDateString("it-IT",{month:"long",year:"numeric"});
            const pw=window.open("","_blank"); if(!pw) return;
            const esc=(s:any)=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
            const byP=reportTherapies.reduce<Record<string,AppointmentTherapy[]>>((acc,t)=>{
              const k=(t.patient_name||"Senza nome").trim(); if(!acc[k]) acc[k]=[]; acc[k].push(t); return acc;
            },{});
            let rows=""; let grand=0;
            Object.keys(byP).forEach(pn=>{
              const items=byP[pn]; const tot=items.reduce((s,i)=>s+i.amount,0); grand+=tot;
              rows+=`<tr style="background:#f0f0f0"><td colspan="4"><strong>${esc(pn)}</strong></td><td><strong>${fmt.format(tot)}</strong></td></tr>`;
              items.forEach(i=>{rows+=`<tr><td></td><td>${esc(i.treatment_type)}</td><td>${new Date(i.date).toLocaleDateString("it-IT")}</td><td style="color:${i.status==="not_paid"?"#dc2626":"#16a34a"}">${i.status==="not_paid"?"NON PAGATO":"PAGATO"}</td><td>${fmt.format(i.amount)}</td></tr>`;});
            });
            rows+=`<tr style="background:#ddd"><td colspan="4"><strong>TOTALE</strong></td><td><strong>${fmt.format(grand)}</strong></td></tr>`;
            pw.document.write(`<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Report</title>
            <style>body{font-family:Arial,sans-serif;padding:2cm}table{width:100%;border-collapse:collapse}
            th,td{border:1px solid #000;padding:6pt;font-size:10pt}th{background:#f0f0f0}</style></head><body>
            <button onclick="window.print()" style="padding:8px 16px;margin-bottom:20px;cursor:pointer">🖨️ Stampa</button>
            <h1 style="text-align:center">Report Incassi — ${esc(rangeLabel)}</h1>
            <table><thead><tr><th>Paziente</th><th>Tipo</th><th>Data</th><th>Stato</th><th>Importo</th></tr></thead>
            <tbody>${rows}</tbody></table>
            <script>window.onload=()=>setTimeout(()=>window.print(),500);</script></body></html>`);
            pw.document.close();
          }} style={{
            padding:"5px 12px", borderRadius:8, border:"1.5px solid rgba(255,255,255,0.35)",
            background:"rgba(255,255,255,0.18)", color:"#fff",
            cursor:"pointer", fontWeight:700, fontSize:12, whiteSpace:"nowrap" as const,
          }}>📄 Report</button>

          {/* Dropdown non pagati */}
          <div style={{ position:"relative" }}>
            <button onClick={()=>setShowUnpaidDropdown(v=>!v)} style={{
              padding:"5px 12px", borderRadius:8, border:"1.5px solid rgba(220,38,38,0.5)",
              background:"rgba(220,38,38,0.3)", color:"#fff",
              cursor:"pointer", fontWeight:700, fontSize:12,
              display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap" as const,
            }}>
              ⚠️ Non Pagati {showUnpaidDropdown?"▲":"▼"}
            </button>
            {showUnpaidDropdown && (
              <div style={{
                position:"absolute", top:"calc(100% + 8px)", right:0,
                background:T.panelBg, border:`1.5px solid ${T.border}`,
                borderRadius:12, boxShadow:"0 12px 40px rgba(30,64,175,0.18)",
                zIndex:9999, minWidth:210, overflow:"hidden",
              }}>
                <button onClick={()=>{printReport(unpaidTherapiesAll,"Report Terapie Non Pagate");setShowUnpaidDropdown(false);}}
                  style={{ width:"100%",padding:"12px 16px",background:"none",border:"none",
                    textAlign:"left",fontSize:13,fontWeight:700,cursor:"pointer",color:T.text,
                    borderBottom:`1px solid ${T.border}` }}>
                  📋 Tutti i non pagati
                </button>
                {uniquePatients.length>0 && (
                  <div style={{ padding:"4px 12px",fontSize:10,color:T.muted,
                    background:T.panelSoft, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:0.5 }}>
                    Per paziente
                  </div>
                )}
                {uniquePatients.map(p=>(
                  <button key={p} onClick={()=>{printReport(unpaidTherapiesAll.filter(t=>t.patient_name===p),`Non pagati — ${p}`);setShowUnpaidDropdown(false);}}
                    style={{ width:"100%",padding:"9px 16px",background:"none",border:"none",
                      textAlign:"left",fontSize:12,cursor:"pointer",color:T.text,
                      borderBottom:`1px solid ${T.border}` }}>
                    👤 {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════
          BODY
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:18 }}>

        {error && (
          <div style={{ padding:14, background:"#fef2f2", borderRadius:10,
            border:`1px solid ${T.red}`, color:T.red, fontWeight:700 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <KpiCard label="Incassato" value={fmt.format(statistics.total)}
            sub={`${statistics.invoiceCount+statistics.appointmentCount} transazioni`}
            color={T.green} bg="linear-gradient(135deg,#f0fdf4,#dcfce7)" icon="💰"/>
          <KpiCard label="Non pagato" value={fmt.format(statistics.unpaidTotal)}
            sub={`${statistics.unpaidCount} in attesa`}
            color={T.red} bg="linear-gradient(135deg,#fef2f2,#fee2e2)" icon="⚠️"/>
          <KpiCard label="Tasso riscossione" value={`${riscossione}%`}
            sub={riscossione>=80?"🟢 Ottimo":riscossione>=60?"🟡 Attenzione":"🔴 Critico"}
            color={riscossione>=80?T.green:riscossione>=60?T.amber:T.red}
            bg="linear-gradient(135deg,#f0f9ff,#e0f2fe)" icon="📈"/>
          <KpiCard
            label={period==="day"?"Ore attive":period==="week"?"Giorni attivi":"Giorni attivi"}
            value={String(activeDays)}
            sub={`Media: ${activeDays>0?fmt.format(avgPerActive):"—"} / giorno`}
            color={T.blue} bg="linear-gradient(135deg,#eef2ff,#e0e7ff)" icon="📅"/>
        </div>

        {/* ── GRAFICO / CALENDARIO ──────────────────────────────────────── */}
        <div style={{
          background:T.panelBg, borderRadius:14, padding:"20px 24px",
          border:`1px solid ${T.border}`, boxShadow:"0 2px 10px rgba(0,0,0,0.04)",
        }}>
          {/* Header card */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
            marginBottom:18, flexWrap:"wrap", gap:10 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:800, color:T.text }}>
                {calView==="calendar" ? "📅 Calendario Incassi" : "📊 Distribuzione Incassi"}
              </div>
              <div style={{ fontSize:12, color:T.muted, marginTop:2 }}>
                {period==="day"?"Per ora del giorno":period==="week"?"Per giorno della settimana":"Per giorno del mese"}
              </div>
            </div>

            {/* Toggle solo per vista mese */}
            {period==="month" && (
              <div style={{ display:"flex", gap:4 }}>
                {(["calendar","chart"] as const).map((v,idx)=>(
                  <button key={v} onClick={()=>setCalView(v)} style={{
                    padding:"6px 14px",
                    borderRadius:idx===0?"8px 0 0 8px":"0 8px 8px 0",
                    border:`2px solid ${calView===v?T.blue:T.border}`,
                    background:calView===v?`linear-gradient(135deg,${T.accent},${T.blue})`:T.panelBg,
                    color:calView===v?"#93c5fd":T.muted,
                    cursor:"pointer", fontWeight:700, fontSize:11,
                  }}>
                    {v==="calendar"?"📅 Calendario":"📊 Grafico"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Spinner caricamento */}
          {loading ? (
            <div style={{ height:280, display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center", gap:12, color:T.muted }}>
              <div style={{ width:36,height:36,
                border:`3px solid ${T.border}`, borderTopColor:T.blue,
                borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
              <span style={{ fontSize:13, fontWeight:600 }}>Caricamento dati…</span>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : (calView==="calendar" && period==="month") ? (
            <CalendarGrid
              baseDate={baseDate} series={series} unpaidSeries={unpaidSeries}
              onDayClick={handleBarClick} selectedDay={selectedDay}
            />
          ) : (series.length>0 || unpaidSeries.length>0) ? (
            <BarChart
              labels={labels} values={series} unpaidValues={unpaidSeries}
              period={period} onBarClick={handleBarClick} selectedDay={selectedDay}
            />
          ) : (
            <div style={{ height:240, display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center", color:T.gray, gap:8 }}>
              <div style={{ fontSize:36 }}>📭</div>
              <div style={{ fontSize:14, fontWeight:700 }}>Nessun dato per il periodo selezionato</div>
              <div style={{ fontSize:12 }}>Prova a cambiare data o periodo</div>
            </div>
          )}
        </div>

        {/* ── FONTI COMPATTE ─────────────────────────────────────────────── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
          {[
            { label:"Fatture Pagate",    amount:rawData.filter(d=>d.source==="invoice").reduce((s,d)=>s+d.amount,0),   count:statistics.invoiceCount,            color:T.green, bg:"linear-gradient(135deg,#f0fdf4,#dcfce7)", icon:"📄" },
            { label:"Sedute Pagate",     amount:rawData.filter(d=>d.source==="appointment").reduce((s,d)=>s+d.amount,0), count:statistics.appointmentCount,         color:T.accent, bg:"linear-gradient(135deg,#f0f9ff,#e0f2fe)", icon:"🩺" },
            { label:"Fatture Non Pagate",amount:unpaidTherapies.filter(t=>t.treatment_type==="Fattura").reduce((s,t)=>s+t.amount,0), count:statistics.unpaidInvoiceCount, color:T.red,   bg:"linear-gradient(135deg,#fef2f2,#fee2e2)", icon:"📋" },
            { label:"Sedute Non Pagate", amount:unpaidTherapies.filter(t=>t.treatment_type!=="Fattura").reduce((s,t)=>s+t.amount,0), count:statistics.unpaidAppointmentCount, color:T.amber, bg:"linear-gradient(135deg,#fff7ed,#ffedd5)", icon:"⏰" },
          ].map(({label,amount,count,color,bg,icon})=>(
            <div key={label} style={{ background:bg, borderRadius:11, padding:"13px 15px",
              border:"1px solid rgba(0,0,0,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                <span style={{ fontSize:17 }}>{icon}</span>
                <span style={{ fontSize:10, fontWeight:800, color:T.muted, textTransform:"uppercase" as const, letterSpacing:0.4 }}>{label}</span>
              </div>
              <div style={{ fontSize:19, fontWeight:900, color }}>{fmt.format(amount)}</div>
              <div style={{ fontSize:10, color:T.muted, marginTop:2 }}>{count} elementi</div>
            </div>
          ))}
        </div>

        {/* ── ARRETRATI (se presenti) ────────────────────────────────────── */}
        {arrearsMonths.length>0 && (
          <div style={{ background:T.panelBg, borderRadius:12, padding:"16px 20px",
            border:`1px solid rgba(220,38,38,0.2)`,
            boxShadow:"0 2px 8px rgba(220,38,38,0.06)" }}>
            <div style={{ fontSize:13, fontWeight:800, color:T.red, marginBottom:10 }}>
              ⚠️ Arretrati — Periodi Precedenti
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {arrearsMonths.map(m=>(
                <div key={m.month} style={{
                  padding:"8px 14px", borderRadius:8,
                  background:"rgba(220,38,38,0.06)",
                  border:`1px solid rgba(220,38,38,0.2)`,
                }}>
                  <div style={{ fontSize:11, fontWeight:700, color:T.muted }}>{fmtMonthKey(m.month)}</div>
                  <div style={{ fontSize:14, fontWeight:900, color:T.red }}>{fmt.format(m.total)}</div>
                  <div style={{ fontSize:10, color:T.muted }}>{m.count} terapie</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SEZIONE INFERIORE: transazioni + non pagati + dettaglio ────── */}
        <div style={{
          display:"grid",
          gridTemplateColumns: selectedDay!==null ? "1fr 1fr 310px" : "1fr 1fr",
          gap:16, transition:"all 0.25s ease",
        }}>

          {/* Transazioni Pagate */}
          <div style={{ background:T.panelBg, borderRadius:13, padding:18,
            border:`1px solid ${T.border}`, display:"flex", flexDirection:"column",
            maxHeight:540 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
              marginBottom:13, borderBottom:`1px solid ${T.border}`, paddingBottom:11 }}>
              <span style={{ fontSize:14, fontWeight:800, color:T.text }}>💰 Transazioni Pagate</span>
              <span style={{ fontSize:11, color:T.muted }}>{rawData.length} elementi</span>
            </div>
            <div className="rep-scroll" style={{ flex:1, overflowY:"auto" }}>
              {loading ? <div style={{ padding:40, textAlign:"center", color:T.muted }}>Caricamento…</div>
              : rawData.length===0 ? <div style={{ padding:40, textAlign:"center", color:T.muted, fontSize:13 }}>Nessuna transazione pagata nel periodo</div>
              : (
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {rawData.map((item,i)=>(
                    <div key={i} style={{
                      padding:"9px 11px", borderRadius:8,
                      background:item.source==="invoice"?"rgba(37,99,235,0.04)":"rgba(13,148,136,0.04)",
                      borderLeft:`3px solid ${item.source==="invoice"?T.blue:T.accent}`,
                    }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize:13, fontWeight:900, color:T.text }}>{fmt.format(item.amount)}</span>
                        <span style={{ fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:4,
                          background:item.source==="invoice"?"rgba(37,99,235,0.1)":"rgba(13,148,136,0.1)",
                          color:item.source==="invoice"?T.blue:T.accent }}>
                          {item.source==="invoice"?"FATTURA":"SEDUTA"}
                        </span>
                      </div>
                      {item.patient_name && <div style={{ fontSize:11,color:T.text,marginTop:3,fontWeight:700 }}>👤 {item.patient_name}</div>}
                      <div style={{ fontSize:10,color:T.muted,marginTop:2 }}>
                        {new Date(item.date).toLocaleDateString("it-IT",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Terapie Non Pagate */}
          <div style={{ background:T.panelBg, borderRadius:13, padding:18,
            border:`1px solid ${T.border}`, display:"flex", flexDirection:"column",
            maxHeight:540 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
              marginBottom:13, borderBottom:`1px solid ${T.border}`, paddingBottom:11 }}>
              <span style={{ fontSize:14, fontWeight:800, color:T.text }}>⚠️ Terapie Non Pagate</span>
              <span style={{ fontSize:11, color:T.muted }}>{unpaidTherapiesAll.length} totali</span>
            </div>
            <div className="rep-scroll" style={{ flex:1, overflowY:"auto" }}>
              {loading ? <div style={{ padding:40, textAlign:"center", color:T.muted }}>Caricamento…</div>
              : unpaidTherapiesAll.length===0 ? <div style={{ padding:40, textAlign:"center", color:T.green, fontSize:13 }}>🎉 Nessuna terapia non pagata!</div>
              : (
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {unpaidTherapiesAll.map(t=>(
                    <div key={t.id} style={{
                      padding:"9px 11px", borderRadius:8,
                      background:t.days_since>30?"rgba(220,38,38,0.06)":"rgba(249,115,22,0.05)",
                      borderLeft:`3px solid ${t.days_since>30?T.red:T.amber}`,
                    }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize:13, fontWeight:900, color:T.text }}>{fmt.format(t.amount)}</span>
                        <span style={{ fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:4,
                          background:t.days_since>30?"rgba(220,38,38,0.12)":"rgba(249,115,22,0.12)",
                          color:t.days_since>30?T.red:T.amber }}>
                          {t.days_since}g fa
                        </span>
                      </div>
                      <div style={{ fontSize:11,color:T.text,marginTop:3,fontWeight:700 }}>👤 {t.patient_name}</div>
                      <div style={{ fontSize:10,color:T.muted,marginTop:2 }}>{new Date(t.date).toLocaleDateString("it-IT")} · {t.treatment_type}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Dettaglio giorno selezionato ──────────────────────────────── */}
          {selectedDay!==null && (
            <div style={{ background:T.panelBg, borderRadius:13, padding:18,
              border:`2px solid ${T.blue}`, display:"flex", flexDirection:"column",
              maxHeight:540, boxShadow:"0 4px 20px rgba(37,99,235,0.12)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                marginBottom:13, borderBottom:`1px solid ${T.border}`, paddingBottom:11 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:800, color:T.blue }}>
                    🔍 {period==="month"?`Giorno ${selectedDay+1}`:period==="week"?labels[selectedDay]:labels[selectedDay]}
                  </div>
                  <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>
                    {dayDetails.filter(d=>d.status==="paid").length} pagati · {dayDetails.filter(d=>d.status!=="paid").length} non pagati
                  </div>
                </div>
                <button onClick={()=>{setSelectedDay(null);setDayDetails([]);}} style={{
                  width:28,height:28,borderRadius:7,border:`1px solid ${T.border}`,
                  background:T.panelSoft,cursor:"pointer",fontWeight:900,color:T.muted,fontSize:13,
                }}>✕</button>
              </div>

              <div className="rep-scroll" style={{ flex:1, overflowY:"auto" }}>
                {dayDetails.length===0 ? (
                  <div style={{ padding:30, textAlign:"center", color:T.muted, fontSize:12 }}>
                    Nessuna transazione
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {dayDetails.map((item,i)=>(
                      <div key={i} style={{
                        padding:"9px 11px", borderRadius:8,
                        background:item.status==="paid"?"rgba(22,163,74,0.06)":"rgba(220,38,38,0.06)",
                        borderLeft:`3px solid ${item.status==="paid"?T.green:T.red}`,
                      }}>
                        <div style={{ display:"flex", justifyContent:"space-between" }}>
                          <span style={{ fontSize:13, fontWeight:900, color:item.status==="paid"?T.green:T.red }}>
                            {item.status==="paid"?"+":"–"}{fmt.format(item.amount)}
                          </span>
                          <span style={{ fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:4,
                            background:item.status==="paid"?"rgba(22,163,74,0.1)":"rgba(220,38,38,0.1)",
                            color:item.status==="paid"?T.green:T.red }}>
                            {item.status==="paid"?"PAGATO":"NON PAGATO"}
                          </span>
                        </div>
                        {item.patient_name && <div style={{ fontSize:11,color:T.text,marginTop:3,fontWeight:700 }}>👤 {item.patient_name}</div>}
                        {item.description && <div style={{ fontSize:10,color:T.muted,marginTop:2 }}>{item.description}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Totale giorno */}
                {dayDetails.length>0 && (
                  <div style={{ marginTop:12, padding:"10px 12px", borderRadius:8,
                    background:"rgba(37,99,235,0.05)", border:"1px solid rgba(37,99,235,0.1)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, fontWeight:900 }}>
                      <span style={{ color:T.green }}>
                        +{fmt.format(dayDetails.filter(d=>d.status==="paid").reduce((s,d)=>s+d.amount,0))}
                      </span>
                      <span style={{ color:T.red }}>
                        –{fmt.format(dayDetails.filter(d=>d.status!=="paid").reduce((s,d)=>s+d.amount,0))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>{/* fine body */}
    </div>
  );
}
