"use client";

import { useEffect, useMemo, useState } from "react";
import { getStudioBranding } from "@/src/lib/studioBranding";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { normalizePhoneForWA, openWhatsApp } from "@/src/lib/whatsapp";
import { studioPdfHeader, studioHeaderCss, studioPdfFooter } from "@/src/lib/pdfHeader";
import AppNavbar from "@/src/components/AppNavbar";

// ─── Theme ────────────────────────────────────────────────────────────────────
const THEME = {
  appBg:"#f1f5f9", panelBg:"#ffffff", panelSoft:"#f7f9fd",
  text:"#0f172a", textSoft:"#1e293b", muted:"#334155", border:"#cbd5e1",
  blue:"#2563eb", blueDark:"#1e40af", green:"#16a34a", teal:"#0d9488",
  red:"#dc2626", amber:"#f97316", gray:"#94a3b8", purple:"#7c3aed",
};

// ─── Types ────────────────────────────────────────────────────────────────────
type NoleggioRow = {
  id: string;
  patient_id: string | null;
  patient_name: string;
  patient_phone: string | null;
  device_name: string;
  start_date: string;   // YYYY-MM-DD
  end_date: string;     // YYYY-MM-DD
  price_per_day: number;
  total_amount: number;
  is_paid: boolean;
  is_returned: boolean;
  notes: string | null;
  created_at: string;
};

type PatientSuggestion = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, "0");
const toYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const fromYMD = (s: string) => { const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); };
const diffDays = (a: string, b: string) => Math.ceil((fromYMD(b).getTime()-fromYMD(a).getTime())/86400000)+1;
const fmtDate = (s: string) => fromYMD(s).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"});

function getDaysRemaining(endDate: string): number {
  const today = new Date(); today.setHours(0,0,0,0);
  const end = fromYMD(endDate);
  return Math.ceil((end.getTime()-today.getTime())/86400000);
}

function getAlertLevel(daysRemaining: number, warningDays: number): "expired"|"urgent"|"warning"|"ok" {
  if (daysRemaining < 0) return "expired";
  if (daysRemaining === 0) return "urgent";
  if (daysRemaining <= warningDays) return "warning";
  return "ok";
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function NoleggioPage() {

  // Studio corrente (multi-tenancy)
  const { studio: currentStudio } = useCurrentStudio();
  const currentStudioId = currentStudio?.id ?? null;

  // ── State ──────────────────────────────────────────────────────────────────
  const [noleggios, setNoleggios] = useState<NoleggioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Warning days setting
  const [warningDays, setWarningDays] = useState(3);
  const [editingWarning, setEditingWarning] = useState(false);
  const [warningInput, setWarningInput] = useState("3");
  const [totalUnits, setTotalUnits] = useState(1);
  const [editingUnits, setEditingUnits] = useState(false);
  const [tempUnits, setTempUnits] = useState("1");

  // Default price per day
  const [defaultPrice, setDefaultPrice] = useState(5);
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState("5");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formPatientQuery, setFormPatientQuery] = useState("");
  const [formPatientId, setFormPatientId] = useState<string|null>(null);
  const [formPatientName, setFormPatientName] = useState("");
  const [formPatientPhone, setFormPatientPhone] = useState("");
  const [formDevice, setFormDevice] = useState("Magnetoterapia");
  const [formStart, setFormStart] = useState(toYMD(new Date()));
  const [formEnd, setFormEnd] = useState(toYMD(new Date(Date.now()+14*86400000)));
  const [formPricePerDay, setFormPricePerDay] = useState("5");
  const [formNotes, setFormNotes] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [patientSuggestions, setPatientSuggestions] = useState<PatientSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Filter
  const [filter, setFilter] = useState<"all"|"active"|"expiring"|"expired"|"returned">("active");
  const [editingId,    setEditingId]    = useState<string|null>(null);
  const [editName,     setEditName]     = useState("");
  const [editPhone,    setEditPhone]    = useState("");
  const [editStart,    setEditStart]    = useState("");  // YYYY-MM-DD
  const [editEnd,      setEditEnd]      = useState("");  // YYYY-MM-DD
  const [editPricePerDay, setEditPricePerDay] = useState("");
  const [editSaving,   setEditSaving]   = useState(false);
  const [creatingPatient, setCreatingPatient] = useState<string|null>(null);

  // ── Load ───────────────────────────────────────────────────────────────────
  async function loadNoleggios() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("noleggios")
        .select("*")
        .order("end_date", { ascending: true });
      if (error) throw error;
      setNoleggios((data||[]) as NoleggioRow[]);
      // Load settings
      const { data: cfg } = await supabase.from("noleggio_settings").select("*").maybeSingle();
      if (cfg) { setWarningDays(cfg.warning_days??3); setWarningInput(String(cfg.warning_days??3)); setDefaultPrice(cfg.price_per_day??5); setPriceInput(String(cfg.price_per_day??5)); setFormPricePerDay(String(cfg.price_per_day??5)); }
    } catch(e:any) { setError(e?.message||"Errore caricamento"); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ loadNoleggios(); },[]);

  // ── Patient search ─────────────────────────────────────────────────────────
  useEffect(()=>{
    const q = formPatientQuery.trim();
    if (q.length < 2) { setPatientSuggestions([]); return; }
    const t = setTimeout(async()=>{
      const { data } = await supabase.from("patients")
        .select("id,first_name,last_name,phone")
        .or(`last_name.ilike.%${q}%,first_name.ilike.%${q}%`)
        .limit(6);
      setPatientSuggestions((data||[]) as PatientSuggestion[]);
      setShowSuggestions(true);
    }, 220);
    return ()=>clearTimeout(t);
  },[formPatientQuery]);

  function selectPatient(p: PatientSuggestion) {
    setFormPatientId(p.id);
    setFormPatientName(`${p.last_name||""} ${p.first_name||""}`.trim());
    setFormPatientPhone(p.phone||"");
    setFormPatientQuery(`${p.last_name||""} ${p.first_name||""}`.trim());
    setShowSuggestions(false);
  }

  // ── Save noleggio ──────────────────────────────────────────────────────────
  async function saveNoleggio() {
    const name = formPatientName.trim()||formPatientQuery.trim();
    if (!name) { setError("Inserisci il nome del paziente."); return; }
    if (!formStart||!formEnd) { setError("Inserisci date valide."); return; }
    if (fromYMD(formEnd) < fromYMD(formStart)) { setError("La data fine deve essere dopo la data inizio."); return; }
    setFormSaving(true); setError("");
    try {
      const days = diffDays(formStart, formEnd);
      const pday = parseFloat(formPricePerDay)||defaultPrice;
      const total = Math.round(days * pday * 100)/100;
      const { error } = await supabase.from("noleggios").insert({
        patient_id: formPatientId||null,
        patient_name: name,
        patient_phone: formPatientPhone.trim()||null,
        device_name: formDevice.trim()||"Magnetoterapia",
        start_date: formStart,
        end_date: formEnd,
        price_per_day: pday,
        total_amount: total,
        is_paid: false,
        is_returned: false,
        notes: formNotes.trim()||null,
        studio_id: currentStudioId,  // multi-tenancy
      });
      if (error) throw error;
      setSuccess("Noleggio salvato.");
      setTimeout(()=>setSuccess(""),3000);
      setShowForm(false);
      resetForm();
      await loadNoleggios();
    } catch(e:any) { setError(e?.message||"Errore salvataggio"); }
    finally { setFormSaving(false); }
  }

  function resetForm() {
    setFormPatientQuery(""); setFormPatientId(null); setFormPatientName(""); setFormPatientPhone("");
    setFormDevice("Magnetoterapia"); setFormStart(toYMD(new Date()));
    setFormEnd(toYMD(new Date(Date.now()+14*86400000)));
    setFormPricePerDay(String(defaultPrice)); setFormNotes("");
  }

  async function togglePaid(id: string, current: boolean) {
    await supabase.from("noleggios").update({ is_paid: !current }).eq("id", id);
    setNoleggios(p=>p.map(n=>n.id===id?{...n,is_paid:!current}:n));
  }
  async function toggleReturned(id: string, current: boolean) {
    await supabase.from("noleggios").update({ is_returned: !current }).eq("id", id);
    setNoleggios(p=>p.map(n=>n.id===id?{...n,is_returned:!current}:n));
  }
  async function deleteNoleggio(id: string) {
    if (!confirm("Eliminare questo noleggio?")) return;
    await supabase.from("noleggios").delete().eq("id", id);
    setNoleggios(p=>p.filter(n=>n.id!==id));
  }

  // ── Modifica completa noleggio (nome/telefono/date/prezzo) ───────────────
  async function saveEditNoleggio(id: string) {
    if (!editName.trim()) { alert("Il nome non può essere vuoto."); return; }
    if (!editStart || !editEnd) { alert("Date di inizio e fine obbligatorie."); return; }
    if (new Date(editEnd) < new Date(editStart)) { alert("La data di fine non può essere prima della data di inizio."); return; }

    const pday = parseFloat(editPricePerDay) || 0;
    if (pday <= 0) { alert("Prezzo al giorno non valido."); return; }

    // Ricalcola durata e totale
    const days = Math.max(1, Math.round(
      (new Date(editEnd + "T12:00:00").getTime() - new Date(editStart + "T12:00:00").getTime()) / 86400000
    ));
    const total = Math.round(days * pday * 100) / 100;

    setEditSaving(true);
    const { error } = await supabase.from("noleggios").update({
      patient_name: editName.trim(),
      patient_phone: editPhone.trim() || null,
      start_date: editStart,
      end_date: editEnd,
      price_per_day: pday,
      total_amount: total,
    }).eq("id", id);
    setEditSaving(false);
    if (error) { alert("Errore: " + error.message); return; }
    setEditingId(null);
    await loadNoleggios();
  }

  // ── Crea paziente da noleggio ──────────────────────────────────────────────
  async function createPatientFromNoleggio(n: NoleggioRow) {
    if (!confirm(`Creare paziente "${n.patient_name}" in anagrafica?`)) return;
    setCreatingPatient(n.id);
    try {
      const parts = n.patient_name.trim().split(/\s+/);
      const last_name = parts[0] || n.patient_name;
      const first_name = parts.slice(1).join(" ") || "";
      const { data, error } = await supabase.from("patients").insert({
        first_name, last_name,
        phone: n.patient_phone || "",
        studio_id: currentStudioId,  // multi-tenancy
      }).select("id").single();
      if (error) { alert("Errore: " + error.message); return; }
      // Link patient_id to noleggio
      await supabase.from("noleggios").update({ patient_id: data.id }).eq("id", n.id);
      await loadNoleggios();
      alert(`✅ Paziente creato e collegato al noleggio!`);
    } finally { setCreatingPatient(null); }
  }


  function cleanPhoneWA(phone: string): string {
    // Delegata alla utility centrale per consistenza cross-file
    return normalizePhoneForWA(phone);
  }
  function openWADirect(phone: string, message: string): void {
    openWhatsApp(phone, message);
  }

  function sendWAScadenza(n: NoleggioRow) {
    if (!n.patient_phone) { alert("Nessun numero di telefono per questo paziente."); return; }
    const dr = getDaysRemaining(n.end_date);
    const scad = new Date(n.end_date+"T12:00:00").toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"});
    const __branding = getStudioBranding(currentStudio);
    const firma = [__branding.signatureName, __branding.signatureTitle].filter(Boolean).join("\n");
    const firmaLine = firma ? `\nGrazie,\n${firma}` : "\nGrazie";
    let msg = "";
    if (dr < 0) {
      msg = `Gentile ${n.patient_name},\nLe ricordiamo che il noleggio del dispositivo *${n.device_name}* è scaduto il ${scad}.\nLa preghiamo di contattarci per la restituzione.${firmaLine}`;
    } else if (dr === 0) {
      msg = `Gentile ${n.patient_name},\nLe ricordiamo che il noleggio del dispositivo *${n.device_name}* scade *oggi*.\nPer informazioni o proroga contatti lo studio.${firmaLine}`;
    } else {
      msg = `Gentile ${n.patient_name},\nLe ricordiamo che il noleggio del dispositivo *${n.device_name}* scadrà il *${scad}* (tra ${dr} giorni).\nPer informazioni o proroga contatti lo studio.${firmaLine}`;
    }
    openWADirect(n.patient_phone, msg);
  }

  function printRicevuta(n: NoleggioRow) {
    const scadStr = new Date(n.end_date+"T12:00:00").toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"});
    const startStr = new Date(n.start_date+"T12:00:00").toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"});
    const oggi = new Date().toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"});
    const days = diffDays(n.start_date, n.end_date);
    const html = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>Ricevuta Noleggio</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:40px;color:#0f172a;background:#fff;}
  h2{font-size:16px;font-weight:700;color:#0f172a;margin:0 0 16px;padding-bottom:8px;border-bottom:1px solid #e2e8f0;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px;}
  .field label{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:3px;}
  .field span{font-size:14px;font-weight:600;color:#0f172a;}
  .total-box{background:#f0fdf4;border:2px solid #16a34a;border-radius:10px;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;margin:24px 0;}
  .total-box .label{font-size:13px;font-weight:700;color:#15803d;}
  .total-box .amount{font-size:28px;font-weight:800;color:#15803d;}
  .detail{font-size:11px;color:#64748b;margin-top:4px;}
  .footer{margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;text-align:center;line-height:1.8;}
  .paid-badge{display:inline-block;background:#dcfce7;color:#15803d;font-weight:800;font-size:11px;padding:3px 10px;border-radius:99px;border:1px solid #86efac;margin-top:6px;}
  .unpaid-badge{display:inline-block;background:#fef3c7;color:#92400e;font-weight:800;font-size:11px;padding:3px 10px;border-radius:99px;border:1px solid #fde68a;margin-top:6px;}
  @media print{body{padding:20px;}button{display:none!important;}}
  ${studioHeaderCss}
</style></head><body>
${studioPdfHeader(currentStudio,{docTitle:"Ricevuta Noleggio",docSubtitle:n.patient_name,docDate:`Data emissione: ${oggi}`})}
<div style="text-align:right;margin-top:-12px;margin-bottom:18px;">${n.is_paid?'<span class="paid-badge">✓ PAGATO</span>':'<span class="unpaid-badge">⏳ DA PAGARE</span>'}</div>
<h2>Dati paziente</h2>
<div class="grid">
  <div class="field"><label>Cognome e Nome</label><span>${n.patient_name}</span></div>
  ${n.patient_phone?`<div class="field"><label>Telefono</label><span>${n.patient_phone}</span></div>`:"<div></div>"}
</div>
<h2>Dettaglio noleggio</h2>
<div class="grid">
  <div class="field"><label>Dispositivo</label><span>${n.device_name}</span></div>
  <div class="field"><label>Prezzo al giorno</label><span>€ ${n.price_per_day.toFixed(2)}</span></div>
  <div class="field"><label>Data inizio</label><span>${startStr}</span></div>
  <div class="field"><label>Data fine / scadenza</label><span>${scadStr}</span></div>
  <div class="field"><label>Durata totale</label><span>${days} giorni</span></div>
</div>
<div class="total-box">
  <div><div class="label">Totale da pagare</div><div class="detail">${days} giorni × €${n.price_per_day.toFixed(2)}/giorno</div></div>
  <div class="amount">€ ${n.total_amount.toFixed(2)}</div>
</div>
${n.notes?`<div style="padding:12px 16px;background:#f8fafc;border-radius:8px;border-left:3px solid #0d9488;font-size:12px;color:#334155;margin-bottom:16px;"><strong>Note:</strong> ${n.notes}</div>`:""}
<div style="text-align:center;margin:24px 0;">
  <button onclick="window.print()" style="padding:10px 28px;background:#0d9488;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">🖨️ Stampa / Salva PDF</button>
</div>
<div class="footer">
  ${(() => { const b = getStudioBranding(currentStudio); return [b.signatureName, b.signatureTitle].filter(Boolean).join(" — ") || ""; })()}<br>
  ${currentStudio?.address || ""}${currentStudio?.phone ? ` — Tel: ${currentStudio.phone}` : ""}<br>
  Documento generato il ${oggi}
</div>
</body></html>`;
    const w = window.open("","_blank","width=800,height=900");
    if(w){ w.document.write(html); w.document.close(); }
  }

  function printContratto(n: NoleggioRow) {
    const oggi = new Date().toLocaleDateString("it-IT",{day:"2-digit",month:"long",year:"numeric"});
    const startStr = new Date(n.start_date+"T12:00:00").toLocaleDateString("it-IT",{day:"2-digit",month:"long",year:"numeric"});
    const scadStr  = new Date(n.end_date+"T12:00:00").toLocaleDateString("it-IT",{day:"2-digit",month:"long",year:"numeric"});
    const days = Math.max(1,Math.round((new Date(n.end_date+"T12:00:00").getTime()-new Date(n.start_date+"T12:00:00").getTime())/86400000));
    const html = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>Contratto Noleggio</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;padding:48px;color:#0f172a;max-width:700px;margin:0 auto;font-size:13px;}
  h1{font-size:20px;font-weight:800;margin:0 0 4px;}
  .sub{color:#64748b;font-size:12px;margin-bottom:32px;}
  .section h2{font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin:20px 0 10px;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .field label{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;display:block;margin-bottom:2px;}
  .field span{font-size:14px;font-weight:600;}
  .box{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:14px 18px;}
  .total{display:flex;justify-content:space-between;align-items:center;background:#f0fdf4;border:2px solid #16a34a;border-radius:10px;padding:14px 20px;margin:20px 0;}
  .total .lbl{font-weight:700;color:#15803d;}
  .total .amt{font-size:24px;font-weight:800;color:#15803d;}
  .art{margin-bottom:10px;font-size:12px;line-height:1.7;}
  .art strong{display:block;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.3px;}
  .firma{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px;}
  .firma-box{border-top:1.5px solid #0f172a;padding-top:8px;font-size:11px;color:#64748b;}
  @media print{button{display:none!important;}}
  ${studioHeaderCss}
</style></head><body>
${studioPdfHeader(currentStudio,{docTitle:"Contratto di Noleggio",docSubtitle:"Magnetoterapia",docDate:`Emesso il ${oggi}`})}
<div class="section"><h2>Dati del locatario</h2>
<div class="box grid">
  <div class="field"><label>Cognome e Nome</label><span>${n.patient_name}</span></div>
  ${n.patient_phone?`<div class="field"><label>Telefono</label><span>${n.patient_phone}</span></div>`:"<div></div>"}
</div></div>
<div class="section"><h2>Dispositivo noleggiato</h2>
<div class="box grid">
  <div class="field"><label>Dispositivo</label><span>${n.device_name}</span></div>
  <div class="field"><label>Prezzo/giorno</label><span>€ ${n.price_per_day.toFixed(2)}</span></div>
  <div class="field"><label>Data inizio</label><span>${startStr}</span></div>
  <div class="field"><label>Data fine</label><span>${scadStr}</span></div>
  <div class="field"><label>Durata</label><span>${days} giorni</span></div>
</div></div>
<div class="total"><div><div class="lbl">Importo totale</div><div style="font-size:11px;color:#64748b">${days} giorni × €${n.price_per_day.toFixed(2)}/giorno</div></div><div class="amt">€ ${n.total_amount.toFixed(2)}</div></div>
<div class="section"><h2>Condizioni di noleggio</h2>
<div class="art"><strong>Art. 1 – Oggetto</strong>Il locatore concede in uso temporaneo il dispositivo sopra indicato per uso terapeutico domiciliare esclusivo.</div>
<div class="art"><strong>Art. 2 – Durata e restituzione</strong>Il noleggio ha durata fino alla data indicata. Il locatario si impegna alla restituzione in buono stato entro tale data. Ogni giorno di ritardo comporta l'addebito del prezzo giornaliero.</div>
<div class="art"><strong>Art. 3 – Utilizzo e responsabilità</strong>Il dispositivo deve essere usato secondo le istruzioni fornite. È vietata la cessione a terzi. Il locatario risponde di eventuali danni.</div>
<div class="art"><strong>Art. 4 – Pagamento</strong>L'importo è dovuto secondo le modalità concordate al momento della consegna.</div>
</div>
<div class="firma">
  <div class="firma-box"><div style="font-weight:700;margin-bottom:36px">Il locatore</div>${(() => { const b = getStudioBranding(currentStudio); return `${b.signatureName || ""}${b.signatureTitle ? `<br>${b.signatureTitle}` : ""}`; })()}</div>
  <div class="firma-box"><div style="font-weight:700;margin-bottom:36px">Il locatario — firma per accettazione</div>${n.patient_name}</div>
</div>
<div style="text-align:center;margin-top:32px;"><button onclick="window.print()" style="padding:10px 28px;background:#0d9488;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">🖨️ Stampa / Salva PDF</button></div>
</body></html>`;
    const w=window.open("","_blank","width=820,height:950"); if(w){w.document.write(html);w.document.close();}
  }

  async function saveSettings() {
    if (!currentStudioId) { alert("Studio non identificato. Ricarica la pagina."); return; }
    const wd = parseInt(warningInput)||3;
    const pd = parseFloat(priceInput)||5;
    setWarningDays(wd); setDefaultPrice(pd); setFormPricePerDay(String(pd));

    // Cerca se esiste già un record per questo studio
    const { data: existing } = await supabase
      .from("noleggio_settings")
      .select("id")
      .eq("studio_id", currentStudioId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from("noleggio_settings")
        .update({ warning_days: wd, price_per_day: pd })
        .eq("id", existing.id);
      if (error) { alert("Errore salvataggio: " + error.message); return; }
    } else {
      const { error } = await supabase.from("noleggio_settings")
        .insert({ warning_days: wd, price_per_day: pd, studio_id: currentStudioId });
      if (error) { alert("Errore salvataggio: " + error.message); return; }
    }
    setEditingWarning(false); setEditingPrice(false);
    setSuccess("Impostazioni salvate."); setTimeout(()=>setSuccess(""),2000);
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  const formDays = useMemo(()=>{
    if(!formStart||!formEnd) return 0;
    try { return Math.max(diffDays(formStart,formEnd),0); } catch { return 0; }
  },[formStart,formEnd]);

  const formTotal = useMemo(()=>{
    const p = parseFloat(formPricePerDay)||0;
    return Math.round(formDays*p*100)/100;
  },[formDays,formPricePerDay]);

  const filtered = useMemo(()=>{
    return noleggios.filter(n=>{
      if (n.is_returned && filter !== "returned" && filter !== "all") return false;
      if (filter==="returned") return n.is_returned;
      if (filter==="all") return true;
      const dr = getDaysRemaining(n.end_date);
      if (filter==="active") return !n.is_returned && dr >= 0;
      if (filter==="expiring") return !n.is_returned && dr >= 0 && dr <= warningDays;
      if (filter==="expired") return !n.is_returned && dr < 0;
      return true;
    });
  },[noleggios,filter,warningDays]);

  const stats = useMemo(()=>({
    total: noleggios.filter(n=>!n.is_returned).length,
    expiring: noleggios.filter(n=>!n.is_returned && getDaysRemaining(n.end_date)>=0 && getDaysRemaining(n.end_date)<=warningDays).length,
    expired: noleggios.filter(n=>!n.is_returned && getDaysRemaining(n.end_date)<0).length,
    revenue: noleggios.filter(n=>n.is_paid).reduce((s,n)=>s+n.total_amount,0),
  }),[noleggios,warningDays]);

  // ── Styles ─────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = { width:"100%", padding:"9px 12px", borderRadius:7, border:`1.5px solid ${THEME.border}`, fontSize:13, fontWeight:500, outline:"none", background:"#fff", color:THEME.text, boxSizing:"border-box" };
  const labelStyle: React.CSSProperties = { display:"block", fontSize:11, fontWeight:700, color:THEME.muted, marginBottom:4, textTransform:"uppercase", letterSpacing:0.4 };
  const cardStyle: React.CSSProperties = { background:THEME.panelBg, borderRadius:12, border:`1px solid ${THEME.border}`, boxShadow:"0 1px 4px rgba(15,23,42,0.05)", overflow:"hidden", marginBottom:14 };

  return (
    <div style={{ minHeight:"100vh", background:THEME.appBg, fontFamily:"'Outfit','Segoe UI',system-ui,sans-serif" }}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        *{-webkit-font-smoothing:antialiased;box-sizing:border-box;}
        body{margin:0;background:${THEME.appBg};}
        a{text-decoration:none;}
        select,input,textarea,button{font-family:inherit;}
        input:focus,select:focus,textarea:focus{border-color:${THEME.teal}!important;box-shadow:0 0 0 3px rgba(13,148,136,0.10)!important;outline:none!important;}
      `}</style>

      {/* NAVBAR */}
      <AppNavbar active="noleggio" onRefresh={loadNoleggios} />

      <main style={{ padding:"28px 32px", maxWidth:1000, margin:"0 auto" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24, flexWrap:"wrap", gap:12 }}>
          <div>
            <h1 style={{ margin:0, fontWeight:800, fontSize:24, color:THEME.text, letterSpacing:-0.4 }}>Noleggio Magnetoterapia</h1>
            <p style={{ margin:"4px 0 0", fontSize:13, color:THEME.muted }}>Gestione noleggi dispositivi terapeutici</p>
          </div>
          <button onClick={()=>{setShowForm(true);resetForm();}} style={{ padding:"10px 20px", borderRadius:8, border:"none", background:`linear-gradient(135deg,#0d9488,#2563eb)`, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", boxShadow:"0 2px 8px rgba(13,148,136,0.2)" }}>
            + Nuovo noleggio
          </button>
        </div>

        {/* Feedback */}
        {error&&<div style={{ marginBottom:14, padding:"10px 16px", borderRadius:8, background:"rgba(220,38,38,0.05)", border:"1px solid rgba(220,38,38,0.2)", color:THEME.red, fontWeight:600, fontSize:13 }}>{error}</div>}
        {success&&<div style={{ marginBottom:14, padding:"10px 16px", borderRadius:8, background:"rgba(22,163,74,0.06)", border:"1px solid rgba(22,163,74,0.2)", color:THEME.green, fontWeight:600, fontSize:13 }}>{success}</div>}

        {/* KPI + Impostazioni */}
        <div className="noleggio-kpi" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:20 }}>
          {[
            { label:"Disponibili", val:`${Math.max(0,totalUnits-stats.total)}/${totalUnits}`, color:stats.total>=totalUnits?THEME.red:THEME.teal, bg:stats.total>=totalUnits?"rgba(220,38,38,0.08)":"rgba(13,148,136,0.08)" },
            { label:"In noleggio", val:stats.total, color:THEME.blue, bg:"rgba(37,99,235,0.08)" },
            { label:`In scadenza (≤${warningDays}gg)`, val:stats.expiring, color:THEME.amber, bg:"rgba(249,115,22,0.08)" },
            { label:"Scaduti", val:stats.expired, color:THEME.red, bg:"rgba(220,38,38,0.08)" },
            { label:"Incassato", val:`€${Math.round(stats.revenue)}`, color:THEME.green, bg:"rgba(22,163,74,0.08)" },
          ].map((k,i)=>(
            <div key={i} style={{ background:k.bg, borderRadius:10, padding:"14px 16px", border:`1px solid ${k.color}22` }}>
              <div style={{ fontSize:11, color:k.color, fontWeight:700, textTransform:"uppercase", letterSpacing:0.4, marginBottom:4 }}>{k.label}</div>
              <div style={{ fontSize:24, fontWeight:800, color:k.color }}>{k.val}</div>
            </div>
          ))}
        </div>

        {/* Impostazioni noleggio */}
        <div style={{ ...cardStyle, marginBottom:20 }}>
          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${THEME.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
            <div style={{ fontWeight:700, fontSize:14, color:THEME.text }}>Impostazioni noleggio</div>
            <div style={{ display:"flex", gap:20, alignItems:"center", flexWrap:"wrap" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:12, color:THEME.muted, fontWeight:600 }}>Unità dispositivi:</span>
                {editingUnits ? (
                  <>
                    <input value={tempUnits} onChange={e=>setTempUnits(e.target.value)} type="number" min="1" max="20" style={{ width:60, padding:"4px 8px", borderRadius:6, border:`1.5px solid ${THEME.teal}`, fontSize:13, fontWeight:700, outline:"none" }}/>
                    <button onClick={()=>{setTotalUnits(parseInt(tempUnits)||1);setEditingUnits(false);}} style={{ padding:"4px 12px", borderRadius:6, border:"none", background:THEME.teal, color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer" }}>OK</button>
                    <button onClick={()=>setEditingUnits(false)} style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${THEME.border}`, background:"transparent", color:THEME.muted, fontWeight:600, fontSize:12, cursor:"pointer" }}>✕</button>
                  </>
                ) : (
                  <button onClick={()=>{setTempUnits(String(totalUnits));setEditingUnits(true);}} style={{ padding:"4px 12px", borderRadius:6, border:`1px solid ${THEME.border}`, background:THEME.panelSoft, color:THEME.text, fontWeight:700, fontSize:13, cursor:"pointer" }}>{totalUnits} ✏️</button>
                )}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:12, color:THEME.muted, fontWeight:600 }}>Alert scadenza (giorni):</span>
                {editingWarning||editingPrice ? (
                  <>
                    <input type="number" value={warningInput} onChange={e=>setWarningInput(e.target.value)} style={{ ...inputStyle, width:60, padding:"5px 8px" }} min={1} max={30}/>
                  </>
                ) : (
                  <span style={{ fontSize:14, fontWeight:800, color:THEME.amber }}>{warningDays}gg</span>
                )}
                <button onClick={()=>editingWarning||editingPrice?saveSettings():(setEditingWarning(true),setEditingPrice(true))} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${THEME.teal}`, background:editingWarning||editingPrice?THEME.teal:"transparent", color:editingWarning||editingPrice?"#fff":THEME.teal, cursor:"pointer", fontWeight:700, fontSize:11 }}>
                  {editingWarning||editingPrice?"Salva":"Modifica"}
                </button>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:12, color:THEME.muted, fontWeight:600 }}>Prezzo/giorno default:</span>
                {editingPrice ? (
                  <input type="number" value={priceInput} onChange={e=>setPriceInput(e.target.value)} style={{ ...inputStyle, width:70, padding:"5px 8px" }} min={0} step={0.5}/>
                ) : (
                  <span style={{ fontSize:14, fontWeight:800, color:THEME.teal }}>€{defaultPrice}/gg</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Form nuovo noleggio */}
        {showForm&&(
          <div style={{ ...cardStyle, border:`2px solid ${THEME.teal}`, marginBottom:20 }}>
            <div style={{ padding:"16px 20px", borderBottom:`1px solid ${THEME.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>Nuovo noleggio</div>
              <button onClick={()=>setShowForm(false)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:THEME.muted }}>✕</button>
            </div>
            <div style={{ padding:"20px" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                {/* Paziente */}
                <div style={{ gridColumn:"1/-1", position:"relative" }}>
                  <label style={labelStyle}>Paziente *</label>
                  <input value={formPatientQuery} onChange={e=>{setFormPatientQuery(e.target.value);setFormPatientId(null);setFormPatientName(e.target.value);}} placeholder="Cerca per cognome o scrivi nome..." style={inputStyle} onFocus={()=>formPatientQuery.length>=2&&setShowSuggestions(true)} onBlur={()=>setTimeout(()=>setShowSuggestions(false),200)}/>
                  {showSuggestions&&patientSuggestions.length>0&&(
                    <div style={{ position:"absolute", top:"100%", left:0, right:0, background:"#fff", border:`1px solid ${THEME.border}`, borderRadius:8, boxShadow:"0 8px 24px rgba(15,23,42,0.12)", zIndex:50, overflow:"hidden" }}>
                      {patientSuggestions.map(p=>(
                        <div key={p.id} onMouseDown={()=>selectPatient(p)} style={{ padding:"10px 14px", cursor:"pointer", borderBottom:`1px solid ${THEME.border}`, fontSize:13 }}
                          onMouseEnter={e=>(e.currentTarget.style.background=THEME.panelSoft)} onMouseLeave={e=>(e.currentTarget.style.background="#fff")}>
                          <strong>{p.last_name} {p.first_name}</strong> {p.phone&&<span style={{ color:THEME.muted }}> · {p.phone}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {formPatientId&&<div style={{ fontSize:11, color:THEME.green, marginTop:4, fontWeight:600 }}>✓ Collegato alla scheda paziente</div>}
                </div>
                <div>
                  <label style={labelStyle}>Telefono</label>
                  <input value={formPatientPhone} onChange={e=>setFormPatientPhone(e.target.value)} placeholder="Opzionale" style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>Dispositivo</label>
                  <input value={formDevice} onChange={e=>setFormDevice(e.target.value)} placeholder="Magnetoterapia" style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>Data inizio</label>
                  <input type="date" value={formStart} onChange={e=>setFormStart(e.target.value)} style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>Data fine</label>
                  <input type="date" value={formEnd} onChange={e=>setFormEnd(e.target.value)} style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>Prezzo al giorno (€)</label>
                  <input type="number" value={formPricePerDay} onChange={e=>setFormPricePerDay(e.target.value)} step={0.5} min={0} style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>Totale calcolato</label>
                  <div style={{ padding:"9px 12px", borderRadius:7, border:`1.5px solid ${THEME.teal}`, background:"rgba(13,148,136,0.04)", fontSize:16, fontWeight:800, color:THEME.teal }}>
                    €{formTotal.toFixed(2)} <span style={{ fontSize:11, fontWeight:500, color:THEME.muted }}>({formDays} giorni × €{formPricePerDay}/gg)</span>
                  </div>
                </div>
                <div style={{ gridColumn:"1/-1" }}>
                  <label style={labelStyle}>Note</label>
                  <textarea value={formNotes} onChange={e=>setFormNotes(e.target.value)} rows={2} placeholder="Note opzionali..." style={{ ...inputStyle, resize:"vertical" }}/>
                </div>
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                <button onClick={()=>setShowForm(false)} style={{ padding:"9px 18px", borderRadius:7, border:`1px solid ${THEME.border}`, background:"#fff", color:THEME.muted, cursor:"pointer", fontWeight:700, fontSize:13 }}>Annulla</button>
                <button onClick={saveNoleggio} disabled={formSaving} style={{ padding:"9px 20px", borderRadius:7, border:"none", background:`linear-gradient(135deg,#0d9488,#2563eb)`, color:"#fff", fontWeight:700, fontSize:13, cursor:formSaving?"wait":"pointer", opacity:formSaving?0.7:1 }}>
                  {formSaving?"Salvataggio…":"Salva noleggio"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filtri */}
        <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
          {([
            {v:"active",l:"Attivi"},
            {v:"expiring",l:`In scadenza (${stats.expiring})`},
            {v:"expired",l:`Scaduti (${stats.expired})`},
            {v:"returned",l:"Riconsegnati"},
            {v:"all",l:"Tutti"},
          ] as const).map(f=>(
            <button key={f.v} onClick={()=>setFilter(f.v)} style={{ padding:"6px 14px", borderRadius:20, border:`1.5px solid ${filter===f.v?THEME.teal:THEME.border}`, background:filter===f.v?THEME.teal:"#fff", color:filter===f.v?"#fff":THEME.muted, cursor:"pointer", fontWeight:700, fontSize:12 }}>
              {f.l}
            </button>
          ))}
        </div>

        {/* Lista noleggios */}
        {loading ? (
          <div style={{ textAlign:"center", padding:"40px 0", color:THEME.muted }}>Caricamento…</div>
        ) : filtered.length===0 ? (
          <div style={{ textAlign:"center", padding:"40px 0", color:THEME.muted }}>
            {filter==="active"?"Nessun noleggio attivo":"Nessun noleggio in questa categoria"}
          </div>
        ) : filtered.map(n=>{
          const dr = getDaysRemaining(n.end_date);
          const alert = getAlertLevel(dr, warningDays);
          const alertColors = { expired:{bg:"rgba(220,38,38,0.05)",border:"rgba(220,38,38,0.25)",badge:THEME.red,badgeBg:"rgba(220,38,38,0.1)",text:"Scaduto"}, urgent:{bg:"rgba(220,38,38,0.05)",border:"rgba(220,38,38,0.35)",badge:THEME.red,badgeBg:"rgba(220,38,38,0.12)",text:"Scade oggi!"}, warning:{bg:"rgba(249,115,22,0.04)",border:"rgba(249,115,22,0.3)",badge:THEME.amber,badgeBg:"rgba(249,115,22,0.1)",text:`${dr} giorni`}, ok:{bg:"#fff",border:THEME.border,badge:THEME.green,badgeBg:"rgba(22,163,74,0.1)",text:`${dr} giorni`} };
          const ac = alertColors[alert];
          return (
            <div key={n.id} style={{ background:n.is_returned?"#f8fafc":ac.bg, borderRadius:12, border:`1.5px solid ${n.is_returned?THEME.border:ac.border}`, padding:"16px 20px", marginBottom:10, display:"flex", alignItems:"flex-start", gap:16, flexWrap:"wrap", opacity:n.is_returned?0.65:1 }}>
              {/* Alert badge */}
              {!n.is_returned&&(
                <div style={{ minWidth:80, textAlign:"center" }}>
                  <div style={{ background:ac.badgeBg, color:ac.badge, borderRadius:8, padding:"6px 10px", fontWeight:800, fontSize:12, whiteSpace:"nowrap" }}>
                    {alert==="ok"||alert==="warning" ? `⏳ ${ac.text}` : alert==="expired"?"⛔ "+ac.text:"🚨 "+ac.text}
                  </div>
                  {alert!=="ok"&&<div style={{ fontSize:10, color:THEME.muted, marginTop:3 }}>alla scadenza</div>}
                </div>
              )}
              {n.is_returned&&<div style={{ minWidth:80, textAlign:"center" }}><div style={{ background:"rgba(148,163,184,0.15)", color:THEME.gray, borderRadius:8, padding:"6px 10px", fontWeight:800, fontSize:12 }}>✓ Reso</div></div>}

              {/* Info */}
              <div style={{ flex:1, minWidth:200 }}>
                {editingId === n.id ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    <input value={editName} onChange={e=>setEditName(e.target.value)}
                      placeholder="Cognome Nome" autoFocus
                      style={{ padding:"7px 10px", borderRadius:7, border:`1.5px solid ${THEME.teal}`, fontSize:14, fontWeight:700, outline:"none", width:"100%", boxSizing:"border-box", color:"#0f172a", background:"#fff" }}/>
                    <input value={editPhone} onChange={e=>setEditPhone(e.target.value)}
                      placeholder="Telefono (es. 320...)" type="tel"
                      style={{ padding:"7px 10px", borderRadius:7, border:`1.5px solid ${THEME.border}`, fontSize:13, outline:"none", width:"100%", boxSizing:"border-box", color:"#0f172a", background:"#fff" }}/>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                      <div>
                        <label style={{ fontSize:10, fontWeight:700, color:THEME.muted, textTransform:"uppercase", letterSpacing:0.3 }}>Inizio</label>
                        <input type="date" value={editStart} onChange={e=>setEditStart(e.target.value)}
                          style={{ padding:"7px 10px", borderRadius:7, border:`1.5px solid ${THEME.border}`, fontSize:13, outline:"none", width:"100%", boxSizing:"border-box", color:"#0f172a", background:"#fff" }}/>
                      </div>
                      <div>
                        <label style={{ fontSize:10, fontWeight:700, color:THEME.muted, textTransform:"uppercase", letterSpacing:0.3 }}>Fine</label>
                        <input type="date" value={editEnd} onChange={e=>setEditEnd(e.target.value)}
                          style={{ padding:"7px 10px", borderRadius:7, border:`1.5px solid ${THEME.border}`, fontSize:13, outline:"none", width:"100%", boxSizing:"border-box", color:"#0f172a", background:"#fff" }}/>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize:10, fontWeight:700, color:THEME.muted, textTransform:"uppercase", letterSpacing:0.3 }}>Prezzo al giorno €</label>
                      <input type="number" step="0.01" value={editPricePerDay} onChange={e=>setEditPricePerDay(e.target.value)}
                        style={{ padding:"7px 10px", borderRadius:7, border:`1.5px solid ${THEME.border}`, fontSize:13, outline:"none", width:"100%", boxSizing:"border-box", color:"#0f172a", background:"#fff" }}/>
                    </div>
                    {editStart && editEnd && editPricePerDay && (() => {
                      const d1 = new Date(editStart + "T12:00:00");
                      const d2 = new Date(editEnd + "T12:00:00");
                      if (d2 < d1) return <div style={{ fontSize:11, color:THEME.red, fontWeight:600 }}>⚠ Fine prima dell'inizio</div>;
                      const days = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000));
                      const pday = parseFloat(editPricePerDay) || 0;
                      const total = Math.round(days * pday * 100) / 100;
                      return <div style={{ fontSize:11, color:THEME.teal, fontWeight:600 }}>→ {days} giorni · Totale €{total.toFixed(2)}</div>;
                    })()}
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={()=>saveEditNoleggio(n.id)} disabled={editSaving}
                        style={{ flex:1, padding:"6px 10px", borderRadius:6, border:"none", background:THEME.teal, color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer", opacity:editSaving?0.6:1 }}>
                        {editSaving?"Salvo…":"✓ Salva"}
                      </button>
                      <button onClick={()=>setEditingId(null)}
                        style={{ padding:"6px 10px", borderRadius:6, border:`1px solid ${THEME.border}`, background:"#fff", color:THEME.muted, fontWeight:700, fontSize:12, cursor:"pointer" }}>
                        Annulla
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
                      <div style={{ fontWeight:800, fontSize:15, color:THEME.text }}>{n.patient_name}</div>
                      <button onClick={()=>{
                        setEditingId(n.id);
                        setEditName(n.patient_name);
                        setEditPhone(n.patient_phone||"");
                        setEditStart(n.start_date);
                        setEditEnd(n.end_date);
                        setEditPricePerDay(String(n.price_per_day));
                      }}
                        style={{ background:"none", border:"none", cursor:"pointer", color:THEME.muted, fontSize:13, padding:2, lineHeight:1 }} title="Modifica noleggio">✏️</button>
                    </div>
                    {n.patient_phone
                      ? <div style={{ fontSize:12, color:THEME.muted }}>{n.patient_phone}</div>
                      : <div style={{ fontSize:11, color:THEME.amber, fontWeight:600 }}>⚠️ Nessun telefono</div>
                    }
                    {!n.patient_id && (
                      <button onClick={()=>createPatientFromNoleggio(n)} disabled={creatingPatient===n.id}
                        style={{ marginTop:6, padding:"4px 10px", borderRadius:6, border:`1.5px solid ${THEME.blue}`, background:"rgba(37,99,235,0.06)", color:THEME.blue, fontWeight:700, fontSize:11, cursor:"pointer", opacity:creatingPatient===n.id?0.6:1 }}>
                        {creatingPatient===n.id?"Creando…":"👤 Crea in anagrafica"}
                      </button>
                    )}
                  </>
                )}
                <div style={{ fontSize:12, color:THEME.muted, marginTop:4 }}>
                  <strong style={{ color:THEME.purple }}>{n.device_name}</strong>
                  {" · "}{fmtDate(n.start_date)} → {fmtDate(n.end_date)}
                  {" · "}{diffDays(n.start_date,n.end_date)} giorni
                </div>
                {n.notes&&<div style={{ fontSize:11, color:THEME.muted, marginTop:4, fontStyle:"italic" }}>{n.notes}</div>}
              </div>

              {/* Importo */}
              <div style={{ textAlign:"right", minWidth:100 }}>
                <div style={{ fontSize:20, fontWeight:800, color:THEME.text }}>€{n.total_amount.toFixed(2)}</div>
                <div style={{ fontSize:11, color:THEME.muted }}>€{n.price_per_day}/gg</div>
              </div>

              {/* Azioni */}
              <div style={{ display:"flex", flexDirection:"column", gap:6, minWidth:120 }}>
                <button onClick={()=>togglePaid(n.id,n.is_paid)} style={{ padding:"6px 10px", borderRadius:6, border:`1px solid ${n.is_paid?THEME.green:THEME.border}`, background:n.is_paid?"rgba(22,163,74,0.1)":"#fff", color:n.is_paid?THEME.green:THEME.muted, cursor:"pointer", fontWeight:700, fontSize:11 }}>
                  {n.is_paid?"€ Pagato":"Segna pagato"}
                </button>
                <button onClick={()=>toggleReturned(n.id,n.is_returned)} style={{ padding:"6px 10px", borderRadius:6, border:`1px solid ${n.is_returned?THEME.teal:THEME.border}`, background:n.is_returned?"rgba(13,148,136,0.1)":"#fff", color:n.is_returned?THEME.teal:THEME.muted, cursor:"pointer", fontWeight:700, fontSize:11 }}>
                  {n.is_returned?"✓ Reso":"Segna reso"}
                </button>
                {n.patient_phone && (
                  <button onClick={()=>sendWAScadenza(n)} style={{ padding:"6px 10px", borderRadius:6, border:`1px solid rgba(37,211,102,0.4)`, background:"rgba(37,211,102,0.06)", color:"#16a34a", cursor:"pointer", fontWeight:700, fontSize:11 }}>
                    💬 WA scadenza
                  </button>
                )}
                <button onClick={()=>printRicevuta(n)} style={{ padding:"6px 10px", borderRadius:6, border:`1px solid ${THEME.blue}22`, background:"rgba(37,99,235,0.05)", color:THEME.blue, cursor:"pointer", fontWeight:700, fontSize:11 }}>
                  🖨️ Ricevuta
                </button>
                <button onClick={()=>printContratto(n)} style={{ padding:"6px 10px", borderRadius:6, border:"1px solid rgba(124,58,237,0.3)", background:"rgba(124,58,237,0.05)", color:"#7c3aed", cursor:"pointer", fontWeight:700, fontSize:11 }}>
                  📄 Contratto
                </button>
                <button onClick={()=>deleteNoleggio(n.id)} style={{ padding:"6px 10px", borderRadius:6, border:`1px solid rgba(220,38,38,0.25)`, background:"rgba(220,38,38,0.04)", color:THEME.red, cursor:"pointer", fontWeight:700, fontSize:11 }}>
                  Elimina
                </button>
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
