"use client";

import Link from "next/link";
import { AiBriefingModal, AiLetterModal } from "@/src/components/clinical/ClinicalAiModals";
import { getStudioBranding } from "@/src/lib/studioBranding";
import { BuildInfo } from "@/src/components/BuildInfo";
import AppNavbar from "@/src/components/AppNavbar";
import WeeklyReminderDialog from "@/src/components/WeeklyReminderDialog";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import { usePermissions } from "@/src/hooks/usePermissions";
import PatientSidebar, {
  type PatientSectionId,
  PATIENT_SECTION_IDS,
  DEFAULT_PATIENT_SECTION,
} from "@/src/components/patient/PatientSidebar";
import PatientSummaryPanel from "@/src/components/patient/PatientSummaryPanel";
import PainMap from "@/src/components/patient/PainMap";
import StructuredAnamnesis from "@/src/components/patient/clinical/StructuredAnamnesis";
import StructuredDiagnosis from "@/src/components/patient/clinical/StructuredDiagnosis";
import StructuredTreatmentPlan from "@/src/components/patient/clinical/StructuredTreatmentPlan";
import ClinicalDiarySection from "@/src/components/patient/clinical/ClinicalDiarySection";
import PatientPageTour from "@/src/components/patient/PatientPageTour";
import { translateError } from "@/src/lib/translateError";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { usePrivacyMode, useDisplayPatientPhone, usePrivacyDisplay } from "@/src/contexts/PrivacyModeContext";
import AttendanceCertificateDialog from "@/src/components/certificates/AttendanceCertificateDialog";
import { studioPdfHeader, studioHeaderCss, studioPdfFooter } from "@/src/lib/pdfHeader";
import ScalesSection from "@/src/components/patient/ScalesSection";
import { PhotoGallerySection } from "./PhotoGallery";
import { normalizePhoneForWA } from "@/src/lib/whatsapp";
import PaidPill from "@/src/components/PaidPill";
import type { PaymentMethod } from "@/src/components/PaidPopover";
import PatientPackagesSection from "@/src/components/packages/PatientPackagesSection";
import RemoteConsentsSection from "@/src/components/patient/RemoteConsentsSection";
import IntakeSection from "@/src/components/patient/IntakeSection";
import { quickSendRemoteConsents } from "@/src/lib/consents/quickSend";
import ExerciseProgramSection from "@/src/components/patient/ExerciseProgramSection";
import PatientOverview from "@/src/components/patient/PatientOverview";
import PackageBadge from "@/src/components/packages/PackageBadge";

function cleanPhoneWA(phone: string): string {
  // Delegato alla utility centrale in src/lib/whatsapp.ts per consistenza
  return normalizePhoneForWA(phone);
}

// ─── Pain Map ─────────────────────────────────────────────────────────────────

const PAIN_TYPES_PM = [
  { id:"burning",   label:"Bruciante",  emoji:"🔥", color:"#ef4444" },
  { id:"throbbing", label:"Pulsante",   emoji:"💗", color:"#f97316" },
  { id:"dull",      label:"Sordo",      emoji:"🔵", color:"#3b82f6" },
  { id:"sharp",     label:"Acuto",      emoji:"⚡", color:"#a855f7" },
  { id:"stiff",     label:"Rigidità",   emoji:"🔒", color:"#64748b" },
  { id:"numb",      label:"Formicolio", emoji:"〜", color:"#06b6d4" },
];

const PM_VIEWS = ["front","back","left","right"] as const;
type PMView = typeof PM_VIEWS[number];
const PM_VIEW_LABELS: Record<PMView,string> = { front:"Fronte", back:"Retro", left:"Lat. Sx", right:"Lat. Dx" };

const PM_GRID = 60;
const PM_ROWS = 150;

const PM_ANATOMY: Record<PMView, Array<{n:string;x:number;y:number}>> = {
  front:[
    {n:"Testa",x:50,y:9},{n:"Collo",x:50,y:17},{n:"Spalla sin.",x:16,y:24},{n:"Spalla des.",x:84,y:24},
    {n:"Petto",x:50,y:31},{n:"Addome",x:50,y:47},{n:"Braccio sin.",x:9,y:43},{n:"Braccio des.",x:91,y:43},
    {n:"Avamb. sin.",x:8,y:63},{n:"Avamb. des.",x:92,y:63},{n:"Coscia sin.",x:32,y:80},{n:"Coscia des.",x:68,y:80},
    {n:"Gamba sin.",x:33,y:93},{n:"Gamba des.",x:67,y:93},
  ],
  back:[
    {n:"Occipite",x:50,y:9},{n:"Cervicale",x:50,y:17},{n:"Trapezio sin.",x:20,y:24},{n:"Trapezio des.",x:80,y:24},
    {n:"Dorsale",x:50,y:35},{n:"Lombare",x:50,y:56},{n:"Gluteo sin.",x:34,y:70},{n:"Gluteo des.",x:66,y:70},
    {n:"Polp. sin.",x:33,y:93},{n:"Polp. des.",x:67,y:93},
  ],
  left:[
    {n:"Testa",x:50,y:9},{n:"Collo",x:50,y:17},{n:"Petto",x:65,y:30},{n:"Schiena",x:28,y:38},
    {n:"Addome",x:60,y:50},{n:"Anca",x:58,y:67},{n:"Coscia",x:50,y:80},{n:"Gamba",x:45,y:93},
  ],
  right:[
    {n:"Testa",x:50,y:9},{n:"Collo",x:50,y:17},{n:"Petto",x:35,y:30},{n:"Schiena",x:72,y:38},
    {n:"Addome",x:40,y:50},{n:"Anca",x:42,y:67},{n:"Coscia",x:50,y:80},{n:"Gamba",x:55,y:93},
  ],
};

// ── Foto anatomiche reali ────────────────────────────────────────────────────
const BODY_PHOTOS = {
  front: "/anatomy/muscular-front.jpg",
  back:  "/anatomy/muscular-back.jpg",
  side:  "/anatomy/muscular-side.jpg",
} as const;

const BodyPhoto = ({ view }: { view: PMView }) => {
  const src  = view === "front" ? BODY_PHOTOS.front : view === "back" ? BODY_PHOTOS.back : BODY_PHOTOS.side;
  const flip = view === "right";
  return (
    <img
      src={src}
      alt={view}
      style={{ width:"100%", height:"100%", display:"block", objectFit:"contain", objectPosition:"center top", background:"#fff",
               transform: flip ? "scaleX(-1)" : "none",
               userSelect:"none", pointerEvents:"none" }}
      draggable={false}
    />
  );
};

type PMZoneData = { painType: string; intensity: number };
type PMZones = Record<PMView, Record<string, PMZoneData>>;
type PMArrow = { id: number; view: PMView; x1: number; y1: number; x2: number; y2: number; label: string };

function PainMapCanvasSection({ canvasW, canvasH, zones, view, arrowStart, arrows, showLabels, onMouseDown, onMouseMove, onMouseUp, onMouseLeave }: any) {
  const paintRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = paintRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, canvasW, canvasH);
    const cw = canvasW / PM_GRID, ch = canvasH / PM_ROWS;
    Object.entries(zones[view] as Record<string, PMZoneData>).forEach(([key, { painType: pt, intensity: intv }]) => {
      const [cx, cy] = key.split(",").map(Number);
      const cfg = PAIN_TYPES_PM.find(p => p.id === pt) || PAIN_TYPES_PM[0];
      const alpha = intv === 1 ? 0.32 : intv === 2 ? 0.6 : 0.85;
      ctx.fillStyle = cfg.color + Math.round(alpha * 255).toString(16).padStart(2, "0");
      ctx.fillRect(cx * cw, cy * ch, cw + 0.8, ch + 0.8);
    });
  }, [zones, view, canvasW, canvasH]);

  const vArrows = arrows.filter((a: PMArrow) => a.view === view);
  const anats = showLabels ? (PM_ANATOMY[view as PMView] || []) : [];

  return (
    <div style={{ position:"relative", width:canvasW, height:canvasH, flexShrink:0 }}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}>
      <canvas ref={paintRef} width={canvasW} height={canvasH}
        style={{ position:"absolute", inset:0, zIndex:2, mixBlendMode:"multiply", cursor:"crosshair", userSelect:"none" }}/>
      {/* Etichette anatomiche */}
      {anats.map((a: {n:string;x:number;y:number}, i: number) => (
        <div key={i} style={{ position:"absolute", left:`${a.x}%`, top:`${a.y}%`, transform:"translate(-50%,-50%)",
          fontSize:9, fontWeight:700, color:"rgba(15,23,42,0.38)", whiteSpace:"nowrap", pointerEvents:"none", zIndex:3 }}>
          {a.n}
        </div>
      ))}
      {/* SVG frecce irradiazione */}
      <svg viewBox={`0 0 ${canvasW} ${canvasH}`} style={{ position:"absolute", inset:0, width:canvasW, height:canvasH, zIndex:4, pointerEvents:"none" }}>
        <defs>
          <marker id="pmah" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 Z" fill="#1e40af"/>
          </marker>
        </defs>
        {arrowStart && (
          <circle cx={arrowStart.x * canvasW} cy={arrowStart.y * canvasH} r="7" fill="#f97316" stroke="#fff" strokeWidth="2"/>
        )}
        {vArrows.map((a: PMArrow) => {
          const x1=a.x1*canvasW, y1=a.y1*canvasH, x2=a.x2*canvasW, y2=a.y2*canvasH;
          const mx=(x1+x2)/2, my=(y1+y2)/2;
          return (
            <g key={a.id}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1e40af" strokeWidth="2.2" strokeDasharray="7,4" markerEnd="url(#pmah)" opacity="0.9"/>
              {a.label && <>
                <rect x={mx - a.label.length*3.5 - 4} y={my-10} width={a.label.length*7+8} height={15} rx={4} fill="rgba(255,255,255,0.92)"/>
                <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="700" fill="#1e3a8a" fontFamily="system-ui">{a.label}</text>
              </>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function PMiniCanvas({ zones, view }: { zones: Record<string,PMZoneData>; view: PMView }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0,0,40,80);
    const cw=40/PM_GRID, ch=80/PM_ROWS;
    Object.entries(zones||{}).forEach(([key,{painType:pt,intensity:intv}]) => {
      const [cx,cy]=key.split(",").map(Number);
      const cfg=PAIN_TYPES_PM.find(p=>p.id===pt)||PAIN_TYPES_PM[0];
      const alpha=intv===1?.35:intv===2?.62:.88;
      ctx.fillStyle=cfg.color+Math.round(alpha*255).toString(16).padStart(2,"0");
      ctx.fillRect(cx*cw,cy*ch,cw+.5,ch+.5);
    });
  },[zones]);
  return <canvas ref={ref} width={40} height={80} style={{position:"absolute",inset:0,width:"100%",height:"100%",mixBlendMode:"multiply",borderRadius:4}}/>;
}

// ─── Pain Map: ora usa il componente condiviso src/components/patient/PainMap ───
function PainMapSection({ patientId, patientName, studio, ownerId }: { patientId: string; patientName: string; studio?: any; ownerId: string }) {
  if (!patientId || !studio?.id || !ownerId) {
    return <div style={{ padding: 24, color: "#94a3b8", fontSize: 13 }}>Caricamento mappa del dolore…</div>;
  }
  return (
    <PainMap
      patientId={patientId}
      studioId={studio.id}
      ownerId={ownerId}
      patientName={patientName}
      embedded
    />
  );
}


type Plan   = "invoice" | "no_invoice";
type Status = "booked" | "confirmed" | "done";

type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  birth_date: string | null;
  birth_place: string | null;
  tax_code: string | null;
  residence_city: string | null;
  /** Terapista di riferimento (mig. 078) */
  referent_operator_id?: string | null;
  preferred_plan: Plan | null;
  anamnesis: string | null;
  diagnosis: string | null;
  treatment: string | null;
  patient_status: string | null;
  acquisition_channel: string | null;
  first_visit_date: string | null;
  main_complaint: string | null;
  body_region: string | null;
  side: string | null;
  pathology_type: string | null;
  medical_diagnosis: string | null;
  expected_frequency: number | null;
  package_size: number | null;
};

type AppointmentRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: Status;
  is_paid: boolean;
  paid_at: string | null;
  payment_method: "cash" | "pos" | "bank_transfer" | null;
  price_type: string | null;
  amount: number | null;
  calendar_note: string | null;
  /** Pacchetto sedute collegato (mig. 014_packages) */
  package_id?: string | null;
};

type DocType = "gdpr_informativa_privacy" | "consenso_trattamento" | "altro";
type PatientDoc = {
  id: string;
  patient_id: string;
  doc_type: DocType;
  file_name: string;
  storage_path: string;
  uploaded_at: string;
};

type ClinicalDocType = "prescrizione" | "rx" | "rm" | "tac" | "elettromiografia" | "ecografia";
type ClinicalDocument = {
  id: string;
  patient_id: string;
  doc_type: ClinicalDocType;
  report_text: string | null;
  file_name: string | null;
  storage_path: string | null;
  uploaded_at: string;
};

// ─── Theme (identico al calendario) ──────────────────────────────────────────
const THEME = {
  appBg:          "#f1f5f9",
  panelBg:        "#ffffff",
  panelSoft:      "#f7f9fd",
  cardBg:         "#ffffff",
  text:           "#0f172a",
  textSoft:       "#1e293b",
  muted:          "#334155",
  border:         "#cbd5e1",
  borderSoft:     "#94a3b8",
  blue:           "#2563eb",
  blueDark:       "#1e40af",
  green:          "#16a34a",
  greenDark:      "#15803d",
  teal:           "#0d9488",
  red:            "#dc2626",
  amber:          "#f97316",
  gray:           "#94a3b8",
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function normalizeTaxCode(v: string) {
  return v.replace(/\s+/g, "").toUpperCase();
}

function ddmmyyyy(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function capitalizeFirst(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formatDateTimeIT(iso: string) {
  const d = new Date(iso);
  const weekday = capitalizeFirst(d.toLocaleString("it-IT", { weekday: "short" }));
  const datePart = d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timePart = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${weekday} ${datePart} • ${timePart}`;
}

function statusLabel(s: Status) {
  if (s === "booked")    return "Prenotata";
  if (s === "confirmed") return "Confermata";
  return "Eseguita";
}

function statusColors(s: Status) {
  if (s === "done")      return { fg: THEME.green, bg: "rgba(22,163,74,0.10)",   bd: "rgba(22,163,74,0.30)" };
  if (s === "confirmed") return { fg: THEME.blue,  bg: "rgba(37,99,235,0.10)",   bd: "rgba(37,99,235,0.30)" };
  return                        { fg: THEME.red,   bg: "rgba(220,38,38,0.10)",   bd: "rgba(220,38,38,0.30)" };
}

function docTypeLabel(t: DocType) {
  if (t === "gdpr_informativa_privacy") return "GDPR – Informativa Privacy";
  if (t === "consenso_trattamento")     return "Consenso al trattamento";
  return "Altro";
}

function clinicalDocTypeLabel(t: ClinicalDocType) {
  const labels: Record<ClinicalDocType, string> = {
    prescrizione:   "Prescrizione",
    rx:             "Rx (Radiografia)",
    rm:             "RM (Risonanza Magnetica)",
    tac:            "TAC (Tomografia Assiale Computerizzata)",
    elettromiografia: "Elettromiografia",
    ecografia:      "Ecografia",
  };
  return labels[t];
}

function same(v1: any, v2: any) {
  return (v1 ?? "") === (v2 ?? "");
}

function safeNumToStr(n: number | null | undefined) {
  return typeof n === "number" && !Number.isNaN(n) ? String(n) : "";
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PatientDetailDesktopClient({
  params,
}: {
  // page.tsx risolve già i params (React.use) e ci passa l'oggetto pronto:
  // qui basta leggerlo. Un secondo React.use() su un oggetto normale
  // scatena React #438 ("unsupported type passed to use()").
  params: { id: string };
}) {
  const patientId = params.id;

  // Studio corrente (multi-tenancy) — per firma e indirizzo nei messaggi
  const { studio: currentStudio, members: teamMembers } = useCurrentStudio();
  // Multi-operatore: governa la visibilità del terapista di riferimento.
  const multiOperatorEnabled = Boolean(
    (currentStudio as { multi_operator_enabled?: boolean } | null)?.multi_operator_enabled
  );
  const { privacyMode } = usePrivacyMode();
  const displayPhone = useDisplayPatientPhone();
  const { maskName, maskInitial } = usePrivacyDisplay();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setOwnerId(data?.user?.id ?? null)); }, []);

  // Helper: costruisce la firma per i messaggi WA
  const buildFirma = useCallback((withTitle: boolean = true): string => {
    const __branding = getStudioBranding(currentStudio);
    const name = __branding.signatureName;
    const title = __branding.signatureTitle;
    if (withTitle && name && title) return `${name}\n${title}`;
    if (name) return name;
    return "";
  }, [currentStudio]);

  // ── Auth / user menu ──────────────────────────────────────────────────────
  const [userEmail, setUserEmail]     = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data?.user?.email ?? null);
      setUserId(data?.user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!userMenuOpen) return;
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [userMenuOpen]);

  const handleLogout = useCallback(async () => {
    try { await supabase.auth.signOut(); } finally {
      setUserMenuOpen(false);
      window.location.href = "/login";
    }
  }, []);

  const userInitials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "?";

  // ── Core state ────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);
  // Permessi (mig. 071): un terapista con livello Base non vede i contatti.
  const { can: canPerm } = usePermissions();
  const [consentStatus, setConsentStatus] = useState<{ ok: boolean; pending: number } | null>(null);
  const [quickConsentMsg, setQuickConsentMsg] = useState<string | null>(null);

  // ── Template messaggi dalle impostazioni ─────────────────────────────────
  // Caricati dalla tabella practice_settings, usati per i bottoni WhatsApp
  // (compleanno, pagamento, soddisfazione, welcome, booking)
  const [templateMessages, setTemplateMessages] = useState<{
    welcome_message: string | null;
    booking_confirm_message: string | null;
    payment_message: string | null;
    birthday_message: string | null;
    satisfaction_message: string | null;
  } | null>(null);

  useEffect(() => {
    (async () => {
      // Recupera l'utente autenticato per filtrare solo le sue impostazioni
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData?.user?.id;
      if (!ownerId) return;

      const { data } = await supabase
        .from("practice_settings")
        .select("welcome_message, booking_confirm_message, payment_message, birthday_message, satisfaction_message")
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (data) setTemplateMessages(data as any);
    })();
  }, []);

  // Helper: apre WhatsApp. Usa wa.me (universal link) che su mobile
  // apre sempre direttamente la chat al numero (mai schermata "scegli contatto").
  const openWhatsAppSafe = useCallback((phone: string, message: string) => {
    const clean = cleanPhoneWA(phone);
    if (!clean) { alert("Numero non valido"); return; }
    const url = (/iPhone|iPad|iPod|Android/i.test(typeof navigator!=="undefined"?navigator.userAgent:"")
      ? `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
      : `https://web.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(message)}`);
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click();
    setTimeout(() => document.body.removeChild(a), 200);
  }, []);

  // Applica i placeholder al template (gestisce anche {firma} e {saluto})
  const applyTemplate = useCallback((tpl: string, vars: Record<string, string>): string => {
    let result = tpl;
    // Firma dinamica (usa branding multi-op se attivo)
    const __branding3 = getStudioBranding(currentStudio);
    const firma = [__branding3.signatureName, __branding3.signatureTitle]
      .filter(Boolean).join("\n");
    result = result.replace(/{firma}/g, firma);
    // Saluto dinamico (Buongiorno/Buonasera in base all'ora)
    const saluto = new Date().getHours() < 14 ? "Buongiorno" : "Buonasera";
    result = result.replace(/{saluto}/g, saluto);
    // Tutti gli altri placeholder
    Object.entries(vars).forEach(([k, v]) => {
      result = result.replace(new RegExp(`{${k}}`, "g"), v ?? "");
    });
    return result;
  }, [currentStudio]);

  // ── Anagrafica form ───────────────────────────────────────────────────────
  const [demoEditMode,    setDemoEditMode]    = useState(false);
  const [savingDemo,      setSavingDemo]      = useState(false);
  const [deletingPatient, setDeletingPatient] = useState(false);

  const [firstName,   setFirstName]   = useState("");
  const [lastName,    setLastName]    = useState("");
  const [phone,       setPhone]       = useState("");
  const [resCity,     setResCity]     = useState("");
  // Terapista di riferimento (mig. 078): preseleziona l'operatore nei
  // nuovi appuntamenti di questo paziente.
  const [referentId,  setReferentId]  = useState<string>("");
  const [preferredPlan, setPreferredPlan] = useState<Plan>("invoice");
  const [birthDate,   setBirthDate]   = useState("");
  const [birthPlace,  setBirthPlace]  = useState("");
  const [taxCode,     setTaxCode]     = useState("");

  // V2 fields
  const [showV2Clinical,    setShowV2Clinical]    = useState(true);
  const [showV2Business,    setShowV2Business]    = useState(true);

  // ── Sezione attiva (Tappa 1 refactor UX) ──────────────────────────
  // Memorizzata in query string ?section=xxx per back/forward browser e link condivisibili.
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  const initialSection: PatientSectionId = (() => {
    const raw = searchParams?.get("section");
    if (raw && (PATIENT_SECTION_IDS as string[]).includes(raw)) return raw as PatientSectionId;
    return DEFAULT_PATIENT_SECTION;
  })();
  const [activeSection, setActiveSectionState] = useState<PatientSectionId>(initialSection);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);

  // ── Menu kebab azioni paziente (Tappa 2) ──────────────────────────
  // Apre/chiude il dropdown con le azioni meno frequenti.
  const [kebabOpen, setKebabOpen] = useState(false);
  const kebabRef = useRef<HTMLDivElement | null>(null);

  // Chiusura kebab al click fuori e con tasto Escape
  useEffect(() => {
    if (!kebabOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) {
        setKebabOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setKebabOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [kebabOpen]);

  // Sincronizzo lo stato con la query string (aggiorna URL senza ricaricare la pagina)
  const setActiveSection = useCallback((s: PatientSectionId) => {
    setActiveSectionState(s);
    const sp = new URLSearchParams(searchParams?.toString() || "");
    sp.set("section", s);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  // Sezioni collassabili — nel nuovo layout sidebar la sezione attiva è
  // sempre l'unica renderizzata, quindi parte sempre aperta. Lo stato
  // secXxx resta per compatibilità con SecHeader.
  const [secClinica,      setSecClinica]      = useState(true);
  const [secBodyChart,    setSecBodyChart]    = useState(true);
  const [secDocClinici,   setSecDocClinici]   = useState(true);
  const [secPacchetti,    setSecPacchetti]    = useState(true);
  const [secTerapie,      setSecTerapie]      = useState(true);
  // Modale attestato di presenza cumulativo (Step 5)
  const [showCertDialog, setShowCertDialog] = useState(false);
  const [aiBriefingOpen, setAiBriefingOpen] = useState(false);
  const [aiLetterOpen, setAiLetterOpen] = useState(false);
  const [secDiarioSOAP,   setSecDiarioSOAP]   = useState(true);

  // ── Dati per PatientSummaryPanel (Tappa 4) ────────────────────────
  // Carichiamo SOAP notes (limitate) e clinical_goals attivi sempre,
  // a prescindere se la sezione "Diario" è aperta, perché servono per
  // mostrare gli indicatori del pannello riassunto in cima a "Clinica".
  const [summarySoapNotes, setSummarySoapNotes] = useState<any[]>([]);
  const [activeGoals,      setActiveGoals]      = useState<Array<{description:string; sort_order?:number}>>([]);
  const [secScales,       setSecScales]       = useState(true);
  const [secPhotos,       setSecPhotos]       = useState(true);
  const [secGDPR,         setSecGDPR]         = useState(true);
  const [secTimeline,     setSecTimeline]     = useState(true);
  const [secEsercizi,     setSecEsercizi]     = useState(true);
  const [showConsentModal, setShowConsentModal] = useState(false);
  // Tappa 9 — Tour onboarding scheda paziente (force re-open dal kebab)
  const [tourForceShow, setTourForceShow] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentSaved,  setConsentSaved]  = useState(false);
  const [consentError,  setConsentError]  = useState("");
  const sigPrivacyRef  = useRef<HTMLCanvasElement>(null);
  const sigConsensoRef = useRef<HTMLCanvasElement>(null);
  const [patientStatus,     setPatientStatus]     = useState("active");
  const [acquisitionChannel, setAcquisitionChannel] = useState("");
  const [firstVisitDate,    setFirstVisitDate]    = useState("");
  const [mainComplaint,     setMainComplaint]     = useState("");
  const [bodyRegion,        setBodyRegion]        = useState("");
  const [side,              setSide]              = useState("");
  const [pathologyType,     setPathologyType]     = useState("");
  const [medicalDiagnosis,  setMedicalDiagnosis]  = useState("");
  const [expectedFrequency, setExpectedFrequency] = useState("");
  const [packageSize,       setPackageSize]       = useState("");

  // ── Clinica ───────────────────────────────────────────────────────────────
  const [anamnesis,       setAnamnesis]       = useState("");
  const [diagnosis,       setDiagnosis]       = useState("");
  const [treatment,       setTreatment]       = useState("");

  // ── Scheda Esercizi ───────────────────────────────────────────────────────
  type Esercizio = {
    id: string;
    nome: string;
    descrizione: string;
    serie: string;
    ripetizioni: string;
    frequenza: string;
    note: string;
    avvertenze: string;
    youtube_id?: string;   // ID video YouTube (es. "dQw4w9WgXcQ")
    categoria?: string;    // stretching | rinforzo | mobilita | respirazione | equilibrio
    image_url?: string;    // URL foto dimostrativa dell'esercizio
    image_query?: string;  // termini di ricerca foto (in inglese, generati dall'AI)
  };
  const [esercizi,       setEsercizi]       = useState<Esercizio[]>([]);
  const [aiExName,       setAiExName]       = useState("");      // nome esercizio da aggiungere con AI
  const [aiAddLoading,   setAiAddLoading]   = useState(false);   // caricamento aggiunta singola con AI
  const [pubLink,        setPubLink]        = useState("");
  const [pubLinkLoading, setPubLinkLoading] = useState(false);
  const [genLoading,     setGenLoading]     = useState(false);
  const [genError,       setGenError]       = useState("");
  const [eserciziNote,   setEserciziNote]   = useState("");
  const [editingEx,      setEditingEx]      = useState<string|null>(null);
  const [schedaId,       setSchedaId]       = useState<string|null>(null); // ID scheda salvata nel DB
  const [schedeStorico,  setSchedeStorico]  = useState<{id:string;created_at:string;token:string;note:string|null}[]>([]);
  const [showStorico,    setShowStorico]    = useState(false);
  const [savingScheda,   setSavingScheda]   = useState(false);
  const [savingClinical,  setSavingClinical]  = useState(false);

  // ── Documenti clinici ─────────────────────────────────────────────────────
  const [clinicalDocs,       setClinicalDocs]       = useState<ClinicalDocument[]>([]);
  const [loadingClinicalDocs, setLoadingClinicalDocs] = useState(false);
  const [savingClinicalDoc,  setSavingClinicalDoc]  = useState<string | null>(null);
  const [clinicalUploadType, setClinicalUploadType] = useState<ClinicalDocType>("prescrizione");
  const [clinicalUploadTitle, setClinicalUploadTitle] = useState("");
  const [clinicalUploadFile, setClinicalUploadFile] = useState<File | null>(null);

  // ── Appuntamenti ──────────────────────────────────────────────────────────
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(false);
  const [rowBusy,      setRowBusy]      = useState<Record<string, boolean>>({});

  // ── Promemoria settimanale ────────────────────────────────────────────────
  const [weeklyReminderOpen, setWeeklyReminderOpen] = useState(false);
  const [weeklyReminderTemplate, setWeeklyReminderTemplate] = useState<string>("");

  // ── Documenti GDPR ────────────────────────────────────────────────────────
  const [docs,        setDocs]        = useState<PatientDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [docType,     setDocType]     = useState<DocType>("gdpr_informativa_privacy");
  const [file,        setFile]        = useState<File | null>(null);

  const [portalLink, setPortalLink] = useState("");
  const [portalLinkLoading, setPortalLinkLoading] = useState(false);
  const [portalLinkCopied, setPortalLinkCopied] = useState(false);

  // ─── Hydrate from patient ─────────────────────────────────────────────────
  function hydrateFromPatient(p: Patient) {
    setFirstName(p.first_name ?? "");
    setLastName(p.last_name ?? "");
    setPhone(p.phone ?? "");
    setResCity(p.residence_city ?? "");
    setReferentId(p.referent_operator_id ?? "");
    setPreferredPlan((p.preferred_plan ?? "invoice") as Plan);
    setBirthDate(p.birth_date ?? "");
    setBirthPlace(p.birth_place ?? "");
    setTaxCode(p.tax_code ?? "");
    setAnamnesis(p.anamnesis ?? "");
    setDiagnosis(p.diagnosis ?? "");
    setTreatment(p.treatment ?? "");
    setPatientStatus((p.patient_status ?? "active") as any);
    setAcquisitionChannel(p.acquisition_channel ?? "");
    setFirstVisitDate(p.first_visit_date ?? "");
    setMainComplaint(p.main_complaint ?? "");
    setBodyRegion(p.body_region ?? "");
    setSide(p.side ?? "");
    setPathologyType(p.pathology_type ?? "");
    setMedicalDiagnosis(p.medical_diagnosis ?? "");
    setExpectedFrequency(safeNumToStr(p.expected_frequency));
    setPackageSize(safeNumToStr(p.package_size));
  }

  // ─── Dirty checks ─────────────────────────────────────────────────────────
  const demoDirty = useMemo(() => {
    if (!patient) return false;
    return (
      !same(firstName.trim(),  patient.first_name)  ||
      !same(lastName.trim(),   patient.last_name)   ||
      !same(phone.trim(),      patient.phone)        ||
      !same(resCity.trim(),    patient.residence_city) ||
      preferredPlan !== (patient.preferred_plan ?? "invoice") ||
      !same(birthDate.trim(),  patient.birth_date)  ||
      !same(birthPlace.trim(), patient.birth_place) ||
      !same(normalizeTaxCode(taxCode).trim(), patient.tax_code) ||
      !same((patientStatus ?? "").trim(),      (patient.patient_status ?? "active")) ||
      !same((acquisitionChannel ?? "").trim(), (patient.acquisition_channel ?? "")) ||
      !same((firstVisitDate ?? "").trim(),     (patient.first_visit_date ?? "")) ||
      !same((mainComplaint ?? "").trim(),      (patient.main_complaint ?? "")) ||
      !same((bodyRegion ?? "").trim(),         (patient.body_region ?? "")) ||
      !same((side ?? "").trim(),               (patient.side ?? "")) ||
      !same((pathologyType ?? "").trim(),      (patient.pathology_type ?? "")) ||
      !same((medicalDiagnosis ?? "").trim(),   (patient.medical_diagnosis ?? "")) ||
      !same((expectedFrequency ?? "").trim(),  safeNumToStr(patient.expected_frequency)) ||
      !same((packageSize ?? "").trim(),        safeNumToStr(patient.package_size))
    );
  }, [patient, firstName, lastName, phone, resCity, preferredPlan, birthDate, birthPlace, taxCode,
      patientStatus, acquisitionChannel, firstVisitDate, mainComplaint, bodyRegion, side,
      pathologyType, medicalDiagnosis, expectedFrequency, packageSize]);

  const clinicalDirty = useMemo(() => {
    if (!patient) return false;
    return (
      !same(anamnesis.trim(), patient.anamnesis) ||
      !same(diagnosis.trim(), patient.diagnosis) ||
      !same(treatment.trim(), patient.treatment)
    );
  }, [patient, anamnesis, diagnosis, treatment]);

  // ─── Loaders ──────────────────────────────────────────────────────────────
  async function loadPatient() {
    setLoading(true);
    setError("");
    const res = await supabase
      .from("patients")
      .select("id, first_name, last_name, phone, birth_date, birth_place, tax_code, residence_city, referent_operator_id, preferred_plan, anamnesis, diagnosis, treatment, patient_status, acquisition_channel, first_visit_date, main_complaint, body_region, side, pathology_type, medical_diagnosis, expected_frequency, package_size")
      .eq("id", patientId)
      .single();
    if (res.error) { setError(translateError(res.error)); setPatient(null); setLoading(false); return; }
    const p = res.data as Patient;
    setPatient(p);

    // Audit delle consultazioni (mig. 075): registra che questo utente ha
    // aperto la cartella. La funzione deduplica entro 30 minuti e non
    // blocca mai la visualizzazione in caso di errore.
    if (currentStudio?.id && p?.id) {
      void supabase.rpc("log_patient_access", {
        p_studio_id: currentStudio.id,
        p_patient_id: p.id,
        p_context: "scheda paziente",
      });
    }
    hydrateFromPatient(p);
    setDemoEditMode(false);
    setLoading(false);
  }

  async function loadClinicalDocs() {
    setLoadingClinicalDocs(true);
    setError("");
    const res = await supabase
      .from("clinical_documents")
      .select("id, patient_id, doc_type, report_text, file_name, storage_path, uploaded_at")
      .eq("patient_id", patientId)
      .order("uploaded_at", { ascending: false });
    if (res.error) { setError(translateError(res.error)); setClinicalDocs([]); }
    else setClinicalDocs((res.data ?? []) as ClinicalDocument[]);
    setLoadingClinicalDocs(false);
  }

  async function loadAppointments() {
    setLoadingAppts(true);
    setError("");
    const res = await supabase
      .from("appointments")
      .select("id, start_at, end_at, status, is_paid, paid_at, payment_method, price_type, amount, calendar_note, package_id")
      .eq("patient_id", patientId)
      .order("start_at", { ascending: false });
    if (res.error) { setError(translateError(res.error)); setAppointments([]); setLoadingAppts(false); return; }
    setAppointments((res.data ?? []) as AppointmentRow[]);
    setLoadingAppts(false);
  }

  async function loadDocs() {
    setLoadingDocs(true);
    setError("");
    const res = await supabase
      .from("patient_documents")
      .select("id, patient_id, doc_type, file_name, storage_path, uploaded_at")
      .eq("patient_id", patientId)
      .order("uploaded_at", { ascending: false });
    if (res.error) { setError(translateError(res.error)); setDocs([]); }
    else setDocs((res.data ?? []) as PatientDoc[]);
    setLoadingDocs(false);
  }

  useEffect(() => {
    loadPatient();
    loadAppointments();
    loadDocs();
    loadClinicalDocs();
    loadSchedaEsercizi();
    void (async () => {
      const r = await supabase.from("patient_consents")
        .select("consent_type, status").eq("patient_id", patientId);
      if (!r.error) {
        const rows = r.data ?? [];
        const signed = new Set(rows.filter(x => x.status === "signed").map(x => x.consent_type));
        setConsentStatus({
          ok: signed.has("gdpr_informativa_privacy") && signed.has("consenso_trattamento"),
          pending: rows.filter(x => x.status === "pending").length,
        });
      }
    })();
  }, [patientId]);

  // ── Tappa 4: dati per PatientSummaryPanel ───────────────────────
  // Carichiamo SOAP notes (limit 50) e clinical_goals attivi del paziente.
  // Servono per il pannello "Riassunto clinico" mostrato in cima alla
  // sezione "Clinica". Indipendenti dal "Diario clinico" che ha il suo
  // load on-demand per non rallentare l'apertura della pagina.
  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;

    (async () => {
      // Note SOAP per il trend VAS e l'ultima nota
      const { data: notes } = await supabase
        .from("session_notes")
        .select("vas_before, vas_after, quick_note, soap_s, created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      setSummarySoapNotes(notes || []);

      // Obiettivi attivi
      const { data: goals } = await supabase
        .from("clinical_goals")
        .select("description, sort_order")
        .eq("patient_id", patientId)
        .eq("status", "active")
        .order("sort_order", { ascending: true })
        .limit(10);
      if (cancelled) return;
      setActiveGoals(goals || []);
    })();

    return () => { cancelled = true; };
  }, [patientId]);

  // Carica il template del promemoria settimanale dalle impostazioni studio.
  // Default fallback se l'utente l'ha svuotato per errore.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("practice_settings")
        .select("weekly_reminder_message")
        .maybeSingle();
      if (cancelled) return;
      const fromDb = (data?.weekly_reminder_message ?? "").trim();
      if (fromDb) {
        setWeeklyReminderTemplate(fromDb);
      } else {
        setWeeklyReminderTemplate(`Ciao {nome},

ti ricordo i prossimi appuntamenti:

{lista_appuntamenti}

A presto,
{firma}`);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Save / update ────────────────────────────────────────────────────────
  async function saveDemographics() {
    if (!patient) return;
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn || !ln) { setError("Nome e cognome non possono essere vuoti."); return; }
    setSavingDemo(true);
    setError("");
    const res = await supabase.from("patients").update({
      first_name:          fn,
      last_name:           ln,
      phone:               phone.trim() || null,
      residence_city:      resCity.trim() || null,
      referent_operator_id: referentId || null,
      preferred_plan:      preferredPlan,
      birth_date:          birthDate || null,
      birth_place:         birthPlace.trim() || null,
      tax_code:            normalizeTaxCode(taxCode).trim() || null,
      patient_status:      patientStatus || null,
      acquisition_channel: acquisitionChannel || null,
      first_visit_date:    firstVisitDate || null,
      main_complaint:      mainComplaint.trim() || null,
      body_region:         bodyRegion || null,
      side:                side || null,
      pathology_type:      pathologyType || null,
      medical_diagnosis:   medicalDiagnosis.trim() || null,
      expected_frequency:  expectedFrequency.trim() ? Number(expectedFrequency) : null,
      package_size:        packageSize.trim() ? Number(packageSize) : null,
    }).eq("id", patientId);
    setSavingDemo(false);
    if (res.error) {
      const msg = res.error.message || "Errore";
      setError(msg.toLowerCase().includes("column") && msg.toLowerCase().includes("does not exist")
        ? msg + " → Manca la migration SQL dei campi V2."
        : msg);
      return;
    }
    await loadPatient();
  }

  function resetDemographics() {
    if (!patient) return;
    setFirstName(patient.first_name ?? "");
    setLastName(patient.last_name ?? "");
    setPhone(patient.phone ?? "");
    setResCity(patient.residence_city ?? "");
    setReferentId(patient.referent_operator_id ?? "");
    setPreferredPlan((patient.preferred_plan ?? "invoice") as Plan);
    setBirthDate(patient.birth_date ?? "");
    setBirthPlace(patient.birth_place ?? "");
    setTaxCode(patient.tax_code ?? "");
    setPatientStatus((patient.patient_status ?? "active") as any);
    setAcquisitionChannel(patient.acquisition_channel ?? "");
    setFirstVisitDate(patient.first_visit_date ?? "");
    setMainComplaint(patient.main_complaint ?? "");
    setBodyRegion(patient.body_region ?? "");
    setSide(patient.side ?? "");
    setPathologyType(patient.pathology_type ?? "");
    setMedicalDiagnosis(patient.medical_diagnosis ?? "");
    setExpectedFrequency(safeNumToStr(patient.expected_frequency));
    setPackageSize(safeNumToStr(patient.package_size));
  }

  async function saveClinical() {
    if (!patient) return;
    setSavingClinical(true);
    setError("");
    const res = await supabase.from("patients").update({
      anamnesis:  anamnesis.trim() || null,
      diagnosis:  diagnosis.trim() || null,
      treatment:  treatment.trim() || null,
    }).eq("id", patientId);
    setSavingClinical(false);
    if (res.error) { setError(translateError(res.error)); return; }
    await loadPatient();
  }

  function resetClinical() {
    if (!patient) return;
    setAnamnesis(patient.anamnesis ?? "");
    setDiagnosis(patient.diagnosis ?? "");
    setTreatment(patient.treatment ?? "");
  }

  async function uploadClinicalDocument() {
    if (!clinicalUploadFile) { setError("Seleziona un file (immagine o PDF)."); return; }
    setSavingClinicalDoc("upload");
    setError("");
    const f = clinicalUploadFile;
    const safeOriginal = f.name.replace(/[^\w.\-() ]+/g, "_");
    const path = `clinical_docs/${patientId}/${Date.now()}_${safeOriginal}`;
    const uploadRes = await supabase.storage.from("patient_docs").upload(path, f, { upsert: false });
    if (uploadRes.error) { setError(`Upload fallito: ${translateError(uploadRes.error)}`); setSavingClinicalDoc(null); return; }
    const displayName = clinicalUploadTitle.trim() || f.name;
    const ins = await supabase.from("clinical_documents").insert({
      patient_id:  patientId,
      doc_type:    clinicalUploadType,
      report_text: null,
      file_name:   displayName,
      storage_path: path,
      uploaded_at: new Date().toISOString(),
      studio_id:   currentStudio?.id,          // ← FIX: richiesto da RLS multi-tenant
    });
    if (ins.error) { setError(`Errore DB: ${translateError(ins.error)}`); setSavingClinicalDoc(null); return; }
    setClinicalUploadTitle("");
    setClinicalUploadFile(null);
    await loadClinicalDocs();
    setSavingClinicalDoc(null);
  }

  async function openClinicalDocument(doc: ClinicalDocument) {
    if (!doc.storage_path) { setError("Nessun file associato."); return; }
    setError("");
    const res = await supabase.storage.from("patient_docs").createSignedUrl(doc.storage_path, 60);
    if (res.error || !res.data?.signedUrl) { setError(`Impossibile aprire: ${res.error ? translateError(res.error) : "URL firmato non disponibile"}`); return; }
    window.open(res.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteClinicalDocument(doc: ClinicalDocument) {
    if (!window.confirm(`Eliminare il documento "${clinicalDocTypeLabel(doc.doc_type)}"?`)) return;
    setError("");
    const delRow = await supabase.from("clinical_documents").delete().eq("id", doc.id);
    if (delRow.error) { setError(translateError(delRow.error)); return; }
    if (doc.storage_path) {
      const delObj = await supabase.storage.from("patient_docs").remove([doc.storage_path]);
      if (delObj.error) setError(`Record eliminato, ma file non rimosso: ${translateError(delObj.error)}`);
    }
    await loadClinicalDocs();
  }

  async function updateTherapyStatus(apptId: string, status: Status) {
    setError("");
    setRowBusy(m => ({ ...m, [apptId]: true }));
    const payload: any = { status };
    // Mantiene coerenza col CHECK constraint appointments_paid_consistency:
    // ogni volta che tocchiamo is_paid, dobbiamo coerentemente settare paid_at (mig. 010).
    if (status === "done")  { payload.is_paid = true;  payload.paid_at = new Date().toISOString(); }
    else                    { payload.is_paid = false; payload.paid_at = null; }
    const res = await supabase.from("appointments").update(payload).eq("id", apptId);
    setRowBusy(m => ({ ...m, [apptId]: false }));
    if (res.error) { setError(translateError(res.error)); return; }
    await loadAppointments();
  }

  async function togglePaid(apptId: string, newValue: boolean) {
    setError("");
    setRowBusy(m => ({ ...m, [apptId]: true }));
    // Mantiene coerenza col CHECK constraint appointments_paid_consistency:
    // is_paid=true ↔ paid_at NOT NULL (mig. 010).
    const payload = newValue
      ? { is_paid: true,  paid_at: new Date().toISOString() }
      : { is_paid: false, paid_at: null };
    const res = await supabase.from("appointments").update(payload).eq("id", apptId);
    setRowBusy(m => ({ ...m, [apptId]: false }));
    if (res.error) { setError(translateError(res.error)); return; }
    await loadAppointments();
  }

  async function handleUpdatePayment(
    apptId: string,
    next: {
      is_paid: boolean;
      paid_at: string | null;
      payment_method: PaymentMethod | null;
    }
  ) {
    setError("");
    setRowBusy(m => ({ ...m, [apptId]: true }));
    const payload: Record<string, unknown> = {
      is_paid: next.is_paid,
      paid_at: next.paid_at,
    };
    if (!next.is_paid) {
      payload.payment_method = null;
    } else if (next.payment_method) {
      payload.payment_method = next.payment_method;
    }
    const res = await supabase.from("appointments").update(payload).eq("id", apptId);
    setRowBusy(m => ({ ...m, [apptId]: false }));
    if (res.error) { setError(translateError(res.error)); return; }
    await loadAppointments();
  }

  async function handleUpdateAmount(apptId: string, raw: string) {
    setError("");
    const parsed = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    if (parsed !== null && !isFinite(parsed)) { setError("Importo non valido."); return; }
    setRowBusy(m => ({ ...m, [apptId]: true }));
    const res = await supabase.from("appointments")
      .update({ amount: parsed }).eq("id", apptId);
    setRowBusy(m => ({ ...m, [apptId]: false }));
    if (res.error) { setError(translateError(res.error)); return; }
    await loadAppointments();
  }

  async function uploadDocument() {
    if (!file) { setError("Seleziona un file."); return; }
    setError("");
    setUploading(true);
    const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
    const path = `${patientId}/${Date.now()}_${safeName}`;
    const up = await supabase.storage.from("patient_docs").upload(path, file, { upsert: false });
    if (up.error) { setError(`Upload fallito: ${translateError(up.error)}`); setUploading(false); return; }
    const ins = await supabase.from("patient_documents").insert({ patient_id: patientId, doc_type: docType, file_name: file.name, storage_path: path, studio_id: currentStudio?.id });
    if (ins.error) { setError(`Errore DB: ${translateError(ins.error)}`); setUploading(false); return; }
    setFile(null);
    setUploading(false);
    await loadDocs();
  }

  async function openDocument(doc: PatientDoc) {
    setError("");
    const res = await supabase.storage.from("patient_docs").createSignedUrl(doc.storage_path, 60);
    if (res.error || !res.data?.signedUrl) { setError(`Impossibile aprire: ${res.error ? translateError(res.error) : "URL firmato non disponibile"}`); return; }
    const isHtml = doc.file_name?.endsWith(".html") || doc.storage_path?.endsWith(".html");
    if (isHtml) {
      // Fetch content and open as proper HTML blob so the browser renders it
      const resp = await fetch(res.data.signedUrl);
      const html = await resp.text();
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url  = URL.createObjectURL(blob);
      const w    = window.open(url, "_blank", "noopener,noreferrer");
      if (w) setTimeout(() => URL.revokeObjectURL(url), 30000);
    } else {
      window.open(res.data.signedUrl, "_blank", "noopener,noreferrer");
    }
  }

  async function deleteDocument(doc: PatientDoc) {
    if (!window.confirm("Eliminare questo documento? (DB + Storage)")) return;
    setError("");
    const delRow = await supabase.from("patient_documents").delete().eq("id", doc.id);
    if (delRow.error) { setError(translateError(delRow.error)); return; }
    const delObj = await supabase.storage.from("patient_docs").remove([doc.storage_path]);
    if (delObj.error) setError(`Record eliminato, ma file non rimosso: ${translateError(delObj.error)}`);
    await loadDocs();
  }

  async function deletePatient() {
    if (!patient) return;
    if (!window.confirm(`Vuoi ELIMINARE definitivamente il paziente:\n${patient.last_name.toUpperCase()} ${patient.first_name.toUpperCase()} ?\n\nQuesta operazione è irreversibile.`)) return;
    setDeletingPatient(true);
    setError("");
    const res = await supabase.from("patients").delete().eq("id", patientId);
    setDeletingPatient(false);
    if (res.error) { setError(`Impossibile eliminare: ${translateError(res.error)}. Elimina prima le sedute collegate o imposta ON DELETE CASCADE.`); return; }
    window.location.href = "/patients";
  }

  // ─── Derived ──────────────────────────────────────────────────────────────
  const therapiesCount = appointments.length;
  const doneCount      = appointments.filter(a => a.status === "done").length;
  const paidCount      = appointments.filter(a => a.status === "done" && a.is_paid).length;
  const lastTherapy    = appointments[0]?.start_at;
  const unpaidAmount   = appointments
    .filter(a => (a.status === "done" || (a.status as string) === "not_paid") && !a.is_paid && a.amount)
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  // ─── Shared style helpers ─────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: "100%", marginTop: 6, padding: "10px 12px",
    borderRadius: 8, border: `1.5px solid ${THEME.border}`,
    background: THEME.panelBg, color: THEME.text,
    outline: "none", fontSize: 13, fontWeight: 600,
    boxSizing: "border-box",
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    resize: "vertical" as const,
  };

  const cardStyle: React.CSSProperties = {
    background: THEME.panelBg, borderRadius: 14,
    padding: 0, marginBottom: 12,
    border: `1px solid ${THEME.border}`,
    boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
    overflow: "hidden",
  };

  const cardBody = { padding: "20px 24px" };

  const sectionHeaderStyle: React.CSSProperties = {
    display: "flex", justifyContent: "space-between",
    alignItems: "flex-start", gap: 12, marginBottom: 20,
  };

  // ── Voce di menu kebab (Tappa 2) ─────────────────────────────────────
  // Usata nel menu "⋮ Altre azioni" dell'header paziente.
  const KebabItem = ({ icon, label, onClick, disabled, danger, keepOpen }: {
    icon: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
    /** Se true, il menu NON si chiude dopo il click (utile per "Copia link"). */
    keepOpen?: boolean;
  }) => (
    <button
      role="menuitem"
      onClick={() => { if (!disabled) { onClick(); if (!keepOpen) setKebabOpen(false); } }}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", padding: "10px 12px",
        border: "none", background: "transparent",
        color: danger ? THEME.red : THEME.textSoft,
        fontWeight: 700, fontSize: 13, fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        borderRadius: 7, textAlign: "left",
        transition: "background .1s",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = danger ? "rgba(220,38,38,0.08)" : "#f1f5f9"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ width: 18, textAlign: "center", fontSize: 14, lineHeight: 1 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );

  const SecHeader = ({ icon, title, subtitle, open, onToggle, extra, badge }: {
    icon:React.ReactNode; title:string; subtitle:string; open:boolean; onToggle:()=>void; extra?:React.ReactNode; badge?:React.ReactNode;
  }) => (
    <div onClick={onToggle} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 22px", cursor:"pointer", userSelect:"none" as const, borderBottom: open ? `1px solid ${THEME.border}` : "none", background: open ? "#fff" : "#f9fafb", transition:"background .12s" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:34, height:34, borderRadius:9, background:"rgba(15,23,42,0.05)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, flexShrink:0 }}>{icon}</div>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontWeight:800, fontSize:14, color:THEME.text }}>{title}</span>
            {badge}
          </div>
          {!open && subtitle && <div style={{ fontSize:11, color:THEME.muted, fontWeight:600, marginTop:1 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        {extra}
        <div style={{ width:22, height:22, borderRadius:6, border:`1px solid ${THEME.border}`, background:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:THEME.muted, fontWeight:700, flexShrink:0 }}>{open?"−":"+"}</div>
      </div>
    </div>
  );

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 700,
    color: THEME.muted, marginBottom: 5,
    textTransform: "uppercase", letterSpacing: 0.5,
  };

  const tableHeaderStyle: React.CSSProperties = {
    textAlign: "left", padding: "11px 14px",
    fontSize: 11, color: THEME.muted, fontWeight: 700,
    borderBottom: `1.5px solid ${THEME.border}`,
    background: "rgba(241,245,249,0.9)",
    textTransform: "uppercase", letterSpacing: 0.5,
  };

  function btnPrimary(label: string, onClick: () => void, disabled = false): React.ReactNode {
    return (
      <button onClick={onClick} disabled={disabled} style={{
        padding: "9px 18px", borderRadius: 8, border: "none",
        background: disabled ? THEME.gray : "linear-gradient(135deg, #0d9488, #2563eb)",
        color: "#fff", fontWeight: 700, fontSize: 13, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1, boxShadow: disabled ? "none" : "0 2px 8px rgba(13,148,136,0.2)",
      }}>{label}</button>
    );
  }

  function btnOutline(label: string, onClick: () => void, color = THEME.blue, disabled = false): React.ReactNode {
    return (
      <button onClick={onClick} disabled={disabled} style={{
        padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${color}`,
        background: THEME.panelBg, color, fontWeight: 700, fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      }}>{label}</button>
    );
  }

  // ─── Loading / error states ───────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: THEME.appBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: THEME.muted, fontWeight: 600, fontSize: 15 }}>Caricamento scheda paziente…</div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div style={{ minHeight: "100vh", background: THEME.appBg, padding: 40 }}>
        <div style={{ color: THEME.red, fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Scheda paziente non trovata</div>
        <div style={{ fontSize: 13, color: THEME.muted, marginBottom: 16 }}>ID: <code>{patientId}</code></div>
        {error && <div style={{ ...cardStyle, borderColor: "rgba(220,38,38,0.3)", color: THEME.red, fontSize: 13 }}>{error}</div>}
        <Link href="/patients" style={{ color: THEME.blue, fontWeight: 700, textDecoration: "none" }}>← Torna ai pazienti</Link>
      </div>
    );
  }

  const headerName = privacyMode ? maskName(patient).toUpperCase() : `${patient.last_name} ${patient.first_name}`.toUpperCase();

  // ─── Render ───────────────────────────────────────────────────────────────

  // ─── Utilità consensi ────────────────────────────────────────────────────
  function initSigCanvas(ref: React.RefObject<HTMLCanvasElement | null>) {
    const cv = ref.current; if (!cv) return;
    cv.width = cv.offsetWidth || 500;
    const ctx = cv.getContext("2d")!;
    ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    let drawing = false, lx = 0, ly = 0;
    const xy = (e: MouseEvent | TouchEvent): [number, number] => {
      const r = cv.getBoundingClientRect();
      const s = "touches" in e ? e.touches[0] : e as MouseEvent;
      return [s.clientX - r.left, s.clientY - r.top];
    };
    cv.onmousedown  = (e) => { drawing = true; [lx, ly] = xy(e); ctx.beginPath(); ctx.moveTo(lx, ly); };
    cv.onmousemove  = (e) => { if (!drawing) return; const [x, y] = xy(e); ctx.lineTo(x, y); ctx.stroke(); lx = x; ly = y; };
    cv.onmouseup    = () => { drawing = false; };
    cv.onmouseleave = () => { drawing = false; };
    cv.addEventListener("touchstart",  (e) => { e.preventDefault(); drawing = true; [lx, ly] = xy(e); ctx.beginPath(); ctx.moveTo(lx, ly); }, { passive: false });
    cv.addEventListener("touchmove",   (e) => { e.preventDefault(); if (!drawing) return; const [x, y] = xy(e); ctx.lineTo(x, y); ctx.stroke(); lx = x; ly = y; }, { passive: false });
    cv.addEventListener("touchend",    () => { drawing = false; });
  }
  function clearSigCanvas(ref: React.RefObject<HTMLCanvasElement | null>) {
    const cv = ref.current; if (!cv) return;
    cv.getContext("2d")!.clearRect(0, 0, cv.width, cv.height);
  }
  function isSigEmpty(ref: React.RefObject<HTMLCanvasElement | null>) {
    const cv = ref.current; if (!cv) return true;
    return !cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data.some(v => v !== 0);
  }

  // Dati studio (dinamici da currentStudio + fallback ragionevoli)
  const STUDIO_DATA = {
    nome:   getStudioBranding(currentStudio).signatureName  || "—",
    titolo: getStudioBranding(currentStudio).signatureTitle || "Fisioterapista",
    studio: currentStudio?.name            || "Studio",
    addr:   currentStudio?.address         || "—",
    piva:   "",  // P.IVA non in tabella studios al momento — campo opzionale per futuro
    email:  currentStudio?.email           || "—",
    phone:  currentStudio?.phone           || "",
    logo:   currentStudio?.logo_base64     || "",
  };

  function buildConsentHtml(type: "privacy" | "consenso", sigDataUrl: string | null, p: NonNullable<typeof patient>): string {
    const nome    = `${p.last_name} ${p.first_name}`.trim();
    const nascita = ddmmyyyy(p.birth_date);
    const cf      = p.tax_code ?? "";
    const citta   = p.residence_city ?? "";
    const tel     = p.phone ?? "";
    const oggi    = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
    const { nome: dNome, titolo, studio, addr, piva, email, logo, phone } = STUDIO_DATA;

    const css = `
      @page { size: A4; margin: 18mm 20mm; }
      @media print { .no-print { display: none !important; } body { margin: 0; } }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Georgia, serif; font-size: 9.5px; line-height: 1.7; color: #1e293b; background: #fff; padding: 16mm 18mm; }
      strong { font-weight: 700; }
      p { margin: 0; }
      ul { padding-left: 14px; }
      li { margin-bottom: 2px; }
      h2 { font-family: Arial, sans-serif; font-size: 9.5px; font-weight: 700; color: #0d9488; text-transform: uppercase; letter-spacing: .6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; margin: 10px 0 5px; }
      .hdr { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 10px; border-bottom: 2px solid #0d9488; margin-bottom: 14px; gap: 14px; }
      .hdr-logo { width: 50px; height: 50px; object-fit: contain; flex-shrink: 0; }
      .hdr-left { flex: 1; display: flex; align-items: center; gap: 12px; }
      .hdr-left .name { font-size: 14px; font-weight: 800; color: #0d9488; font-family: Arial, sans-serif; }
      .hdr-left .role { font-size: 10px; color: #334155; font-weight: 600; font-family: Arial, sans-serif; margin-top: 1px; }
      .hdr-left .contact { font-size: 9px; color: #64748b; font-family: Arial, sans-serif; margin-top: 1px; }
      .hdr-right { font-size: 9px; color: #94a3b8; font-family: Arial, sans-serif; text-align: right; }
      .doc-title { text-align: center; margin-bottom: 12px; }
      .doc-title h1 { font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #0f172a; }
      .doc-title p { font-size: 9px; color: #64748b; font-family: Arial, sans-serif; margin-top: 2px; }
      table { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 9px; }
      th { background: #0d9488; color: #fff; padding: 4px 7px; text-align: left; }
      td { padding: 4px 7px; border-bottom: 1px solid #e2e8f0; color: #334155; }
      tr.alt td { background: #f8fafc; }
      .box-green { background: #f0fdf4; border: 1px solid #86efac; border-radius: 5px; padding: 8px 12px; margin-top: 10px; }
      .box-warn  { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 5px; padding: 7px 10px; margin: 8px 0; }
      .box-data  { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; }
      .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; }
      .field label { font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 1px; }
      .field .val { border-bottom: 1px solid #94a3b8; min-height: 17px; font-size: 10px; padding: 1px 2px; }
      .checks { font-size: 9.5px; line-height: 2; }
      .firma-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 10px; margin-top: 14px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
      .firma-field label { font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px; }
      .firma-line { border-bottom: 1px solid #334155; min-height: 22px; }
      .sig-img { border: 1px solid #e2e8f0; border-radius: 4px; height: 58px; background: #fafafa; margin-top: 10px; }
      .sig-img img { height: 100%; }
      .footer { margin-top: 14px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8; }
      .btn-print { padding: 9px 24px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: Arial, sans-serif; }`;

    const contactParts = [addr, email, phone, piva].filter(s => s && s !== "—").join(" · ");
    const hdr = `<div class="hdr"><div class="hdr-left">${logo ? `<img src="${logo}" alt="Logo" class="hdr-logo"/>` : ""}<div><div class="name">${studio}</div><div class="role">${dNome !== "—" ? dNome + (titolo ? " — " + titolo : "") : titolo}</div><div class="contact">${contactParts}</div></div></div><div class="hdr-right">Data: ${oggi}</div></div>`;
    const footer = `<div class="footer"><span>${studio}${dNome !== "—" ? " — " + dNome + ", " + titolo : ""}</span><span>Generato il ${oggi}</span></div>`;
    const firmaArea = `
      <div class="firma-grid">
        <div><div class="firma-field"><label>Luogo</label><div class="firma-line"></div></div></div>
        <div><div class="firma-field"><label>Data</label><div class="firma-line" style="font-size:10px;padding-top:2px">${oggi}</div></div></div>
        <div><div class="firma-field"><label>Firma professionista</label><div class="firma-line"></div></div></div>
      </div>
      <div class="firma-field"><label>Firma del paziente</label>
        <div class="sig-img">${sigDataUrl ? `<img src="${sigDataUrl}" alt="firma"/>` : ""}</div>
      </div>`;

    if (type === "privacy") {
      return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Informativa Privacy – ${nome}</title><style>${css}</style></head><body>
<div class="no-print" style="padding:12px 0 16px;text-align:center"><button class="btn-print" onclick="window.print()">🖨 Stampa / Salva PDF</button></div>
${hdr}
<div class="doc-title"><h1>Informativa sul trattamento dei dati personali</h1><p>Art. 13 Regolamento UE 2016/679 (GDPR)</p></div>
<h2>1. Titolare del trattamento</h2>
<p><strong>${dNome}</strong>, ${titolo} — ${piva}<br>${addr} · ${email}</p>
<h2>2. Dati personali trattati</h2>
<ul><li><strong>Dati anagrafici:</strong> nome, cognome, data di nascita, codice fiscale, indirizzo, telefono, e-mail</li><li><strong>Dati di salute (Art. 9 GDPR):</strong> anamnesi, diagnosi, referti, cartella clinica fisioterapica</li><li><strong>Dati amministrativi:</strong> fatturazione e pagamento</li></ul>
<h2>3. Finalità e basi giuridiche</h2>
<table><tr><th>Finalità</th><th>Base giuridica</th></tr>
<tr><td>Erogazione prestazioni fisioterapiche</td><td>Art. 9 par. 2 lett. h GDPR</td></tr>
<tr class="alt"><td>Adempimenti di legge (fatturazione, SSN)</td><td>Art. 6 par. 1 lett. c GDPR</td></tr>
<tr><td>Gestione amministrativa e contabile</td><td>Art. 6 par. 1 lett. b GDPR</td></tr>
<tr class="alt"><td>Promemoria appuntamenti (SMS/WhatsApp)</td><td>Art. 6 par. 1 lett. a GDPR — consenso esplicito</td></tr></table>
<h2>4. Conservazione</h2>
<ul><li>Documentazione sanitaria: <strong>10 anni</strong> dalla cessazione del rapporto (D.M. 14/02/1997)</li><li>Documentazione fiscale: <strong>10 anni</strong> dalla data del documento</li><li>I dati non vengono venduti né ceduti a terzi per finalità commerciali</li></ul>
<h2>5. Diritti dell'interessato (Artt. 15–22 GDPR)</h2>
<p>Ha diritto di accesso, rettifica, cancellazione, limitazione, portabilità e opposizione. Può proporre reclamo al Garante: www.garanteprivacy.it — Contatto: ${email}</p>
<div class="box-green">
<p><strong>Io sottoscritto/a</strong> <span style="border-bottom:1px solid #166534;padding:0 50px">${nome}</span> nato/a il <span style="border-bottom:1px solid #166534;padding:0 25px">${nascita}</span> residente in <span style="border-bottom:1px solid #166534;padding:0 35px">${citta}</span><br>
dichiaro di aver letto e compreso la presente informativa e <strong>acconsento al trattamento dei dati di salute</strong> per finalità terapeutiche.</p>
<p style="margin-top:7px">Promemoria via WhatsApp/SMS: <input type="checkbox" checked> <strong>Acconsento</strong> &nbsp;&nbsp;<input type="checkbox"> <strong>Non acconsento</strong></p>
</div>
${firmaArea}
${footer}
</body></html>`;
    } else {
      return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Consenso Trattamento – ${nome}</title><style>${css}</style></head><body>
<div class="no-print" style="padding:12px 0 16px;text-align:center"><button class="btn-print" onclick="window.print()">🖨 Stampa / Salva PDF</button></div>
${hdr}
<div class="doc-title"><h1>Consenso informato al trattamento fisioterapico</h1><p>Legge n. 219/2017 · GDPR Reg. UE 2016/679</p></div>
<div class="box-data">
<div style="font-family:Arial,sans-serif;font-size:8px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Dati del paziente</div>
<div class="data-grid">
<div class="field"><label>Cognome e nome</label><div class="val">${nome}</div></div>
<div class="field"><label>Data di nascita</label><div class="val">${nascita}</div></div>
<div class="field"><label>Codice fiscale</label><div class="val">${cf}</div></div>
<div class="field"><label>Città di residenza</label><div class="val">${citta}</div></div>
<div class="field"><label>Telefono</label><div class="val">${tel}</div></div>
</div>
</div>
<h2>Informazioni ricevute</h2>
<p>Il <strong>${dNome}</strong>, ${titolo}, mi ha illustrato:</p>
<ul style="margin-top:4px"><li><strong>Diagnosi e condizione clinica:</strong> natura del problema, cause e evoluzione attesa</li><li><strong>Trattamento proposto:</strong> terapia manuale, esercizio terapeutico, strumentale (ultrasuoni, TENS, TECAR, laser…)</li><li><strong>Benefici attesi</strong> nel breve, medio e lungo termine</li><li><strong>Rischi:</strong> dolore post-seduta, ecchimosi, aggravamento transitorio dei sintomi</li><li><strong>Alternative terapeutiche</strong>, inclusa la non effettuazione del trattamento</li></ul>
<h2>Dichiarazioni del paziente</h2>
<div class="checks">
<div><input type="checkbox" checked> Ho ricevuto e compreso le informazioni e ho potuto porre domande con risposte esaurienti</div>
<div><input type="checkbox" checked> Non sono a conoscenza di controindicazioni; ho comunicato eventuali condizioni di salute rilevanti</div>
<div><input type="checkbox" checked> Sono consapevole di poter revocare il presente consenso in qualsiasi momento</div>
<div><input type="checkbox" checked> Ho ricevuto copia dell'informativa GDPR e ho espresso il relativo consenso</div>
</div>
<div class="box-warn"><p style="font-size:9px"><strong>Controindicazioni comunicate:</strong> pace-maker o dispositivi impiantati, gravidanza, neoplasie attive, ferite aperte o infezioni, alterazioni della sensibilità cutanea, flebiti e trombosi in fase acuta.</p></div>
<div class="box-green"><p style="font-weight:700;margin-bottom:4px">Espressione del consenso</p><p>Lette e comprese le informazioni, <strong>acconsento liberamente</strong> all'esecuzione del trattamento fisioterapico proposto dal <strong>${dNome}</strong>, nelle modalità concordate.</p></div>
${firmaArea}
${footer}
</body></html>`;
    }
  }

  // Apri in nuova finestra come HTML renderizzato (Blob URL)
  function openHtmlInWindow(html: string) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const w    = window.open(url, "_blank", "noopener,noreferrer");
    if (w) setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ── Arricchisce un esercizio con video YouTube + foto dimostrativa ────────
  async function enrichEsercizio(e: Esercizio): Promise<Esercizio> {
    let out = { ...e };
    // Video YouTube (query in italiano sul nome)
    try {
      const q = e.nome + (e.categoria ? ` ${e.categoria}` : "");
      const res = await fetch(`/api/youtube-search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.videoId) out.youtube_id = data.videoId;
    } catch {}
    // Foto dimostrativa (query in inglese: image_query se presente, altrimenti il nome)
    try {
      const iq = e.image_query || e.nome;
      const res = await fetch(`/api/image-search?q=${encodeURIComponent(iq + " exercise")}`);
      const data = await res.json();
      if (data.url || data.thumbnail) out.image_url = data.url || data.thumbnail;
    } catch {}
    return out;
  }

  // ── Scheda Esercizi — Genera con AI ──────────────────────────────────────
  async function generaEserciziAI() {
    if (!patient) return;
    setGenLoading(true); setGenError("");
    try {
      const ctx = [
        `Paziente: ${lastName} ${firstName}`,
        bodyRegion ? `Zona corporea: ${bodyRegion}` : "",
        side ? `Lato: ${side}` : "",
        pathologyType ? `Tipo patologia: ${pathologyType}` : "",
        mainComplaint ? `Disturbo principale: ${mainComplaint}` : "",
        medicalDiagnosis ? `Diagnosi medica: ${medicalDiagnosis}` : "",
        diagnosis ? `Diagnosi fisioterapica: ${diagnosis}` : "",
        anamnesis ? `Anamnesi: ${anamnesis}` : "",
        treatment ? `Trattamento in corso: ${treatment}` : "",
        eserciziNote ? `Istruzioni aggiuntive: ${eserciziNote}` : "",
      ].filter(Boolean).join("\n");

      const response = await fetch("/api/ai-esercizi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: `Sei un fisioterapista esperto. Genera esattamente 5 esercizi domiciliari per questo paziente:

${ctx}

Rispondi SOLO con un array JSON valido, senza testo aggiuntivo, senza markdown.
Per youtube_id metti l'ID reale di un video YouTube di fisioterapia/riabilitazione per quell'esercizio (solo l'ID, es: "abc123xyz"). Per categoria scegli tra: stretching, rinforzo, mobilita, respirazione, equilibrio.
Per image_query scrivi 2-4 parole IN INGLESE per cercare una foto dimostrativa dell'esercizio (es: "side plank exercise", "shoulder stretch", "glute bridge").

[{"id":"1","nome":"","descrizione":"Come eseguirlo (1-2 frasi)","serie":"3","ripetizioni":"10","frequenza":"1 volta al giorno","note":"","avvertenze":"Fermarsi se...","youtube_id":"ID_VIDEO_YOUTUBE","categoria":"stretching","image_query":"english search terms"}]

Genera 5 esercizi in italiano adatti alla diagnosi.` }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Errore API");
      const text = data.text ?? "";
      const clean = text.replace(/```json|```/g, "").trim();
      // Estrai solo il JSON array anche se Claude aggiunge testo extra
      const match = clean.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("Nessun array JSON trovato nella risposta AI");
      const parsed: Esercizio[] = JSON.parse(match[0]);
      const withIds = parsed.map((e, i) => ({ ...e, id: e.id ?? String(i+1) }));
      setEsercizi(withIds);

      // Cerca automaticamente video YouTube + foto per ogni esercizio
      setGenError(""); 
      const withVideos = await Promise.all(withIds.map(e => enrichEsercizio(e)));
      setEsercizi(withVideos);
      // Salva automaticamente nel DB
      setTimeout(async () => {
        try {
          const token = crypto.randomUUID();
          const payload = {
            patient_id: patientId,
            patient_name: `${lastName} ${firstName}`.trim(),
            esercizi: JSON.stringify(withVideos),
            note: eserciziNote || null,
            expires_at: new Date(Date.now() + 90*24*60*60*1000).toISOString(),
          };
          if (schedaId) {
            await supabase.from("schede_esercizi_pubbliche").update(payload).eq("id", schedaId);
          } else {
            const { data } = await supabase.from("schede_esercizi_pubbliche").insert({ ...payload, token }).select("id,token").single();
            if (data) { setSchedaId(data.id); setPubLink(`${window.location.origin}/esercizi/${data.token}`); }
          }
          await loadSchedaEsercizi();
        } catch(e) { console.warn("autosave", e); }
      }, 100);
    } catch(e: any) {
      setGenError(`Errore: ${e?.message ?? "sconosciuto"}.`);
      console.error(e);
    } finally {
      setGenLoading(false);
    }
  }

  function addEsercizioVuoto() {
    const id = Date.now().toString();
    setEsercizi(prev => [...prev, { id, nome:"", descrizione:"", serie:"3", ripetizioni:"10", frequenza:"1 volta al giorno", note:"", avvertenze:"" }]);
    setEditingEx(id);
  }

  // ── Aggiungi un singolo esercizio con AI (es: "plank laterale") ───────────
  async function aggiungiEsercizioAI() {
    const nome = aiExName.trim();
    if (!nome || !patient) return;
    setAiAddLoading(true); setGenError("");
    try {
      const ctx = [
        bodyRegion ? `Zona corporea: ${bodyRegion}` : "",
        pathologyType ? `Tipo patologia: ${pathologyType}` : "",
        medicalDiagnosis ? `Diagnosi medica: ${medicalDiagnosis}` : "",
        diagnosis ? `Diagnosi fisioterapica: ${diagnosis}` : "",
      ].filter(Boolean).join("\n");

      const response = await fetch("/api/ai-esercizi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: `Sei un fisioterapista esperto. Descrivi l'esercizio "${nome}" come scheda domiciliare per un paziente.
${ctx ? `\nContesto clinico:\n${ctx}\n` : ""}
Rispondi SOLO con un oggetto JSON valido, senza testo aggiuntivo, senza markdown.
Per categoria scegli tra: stretching, rinforzo, mobilita, respirazione, equilibrio.
Per image_query scrivi 2-4 parole IN INGLESE per cercare una foto dimostrativa (es: "side plank exercise").

{"nome":"${nome}","descrizione":"Come eseguirlo (1-2 frasi)","serie":"3","ripetizioni":"10","frequenza":"1 volta al giorno","note":"","avvertenze":"Fermarsi se...","categoria":"rinforzo","image_query":"english search terms"}

Adatta serie, ripetizioni e avvertenze alla condizione del paziente. Testo in italiano.` }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Errore API");
      const clean = (data.text ?? "").replace(/```json|```/g, "").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Nessun JSON trovato nella risposta AI");
      const obj = JSON.parse(match[0]);

      let nuovo: Esercizio = {
        id: Date.now().toString(),
        nome: obj.nome || nome,
        descrizione: obj.descrizione || "",
        serie: obj.serie || "3",
        ripetizioni: obj.ripetizioni || "10",
        frequenza: obj.frequenza || "1 volta al giorno",
        note: obj.note || "",
        avvertenze: obj.avvertenze || "",
        categoria: obj.categoria || "rinforzo",
        image_query: obj.image_query || "",
      };
      // Arricchisci con video + foto, poi accoda
      nuovo = await enrichEsercizio(nuovo);
      const updated = [...esercizi, nuovo];
      setEsercizi(updated);
      setAiExName("");

      // Salva nel DB (aggiorna scheda corrente o ne crea una nuova)
      try {
        const payload = {
          patient_id: patientId,
          patient_name: `${lastName} ${firstName}`.trim(),
          esercizi: JSON.stringify(updated),
          note: eserciziNote || null,
          expires_at: new Date(Date.now() + 90*24*60*60*1000).toISOString(),
        };
        if (schedaId) {
          await supabase.from("schede_esercizi_pubbliche").update(payload).eq("id", schedaId);
        } else {
          const token = crypto.randomUUID();
          const { data: d } = await supabase.from("schede_esercizi_pubbliche").insert({ ...payload, token }).select("id,token").single();
          if (d) { setSchedaId(d.id); setPubLink(`${window.location.origin}/esercizi/${d.token}`); }
        }
        await loadSchedaEsercizi();
      } catch(e) { console.warn("autosave add-ai", e); }
    } catch(e: any) {
      setGenError(`Errore: ${e?.message ?? "sconosciuto"}.`);
      console.error(e);
    } finally {
      setAiAddLoading(false);
    }
  }

  function updateEsercizio(id: string, field: keyof Esercizio, value: string) {
    setEsercizi(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  }

  function removeEsercizio(id: string) {
    setEsercizi(prev => prev.filter(e => e.id !== id));
  }

  function moveEsercizio(id: string, dir: -1|1) {
    setEsercizi(prev => {
      const idx = prev.findIndex(e => e.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }


  async function generatePortalLink(): Promise<string|null> {
    if (!patient) return null;
    setPortalLinkLoading(true);
    try {
      const r = await fetch("/api/portal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patient.id }),
      });
      const d = await r.json();
      if (d.error) { alert("Errore: " + d.error); return null; }
      const link = `${window.location.origin}/portale/${d.token}`;
      setPortalLink(link);
      return link;
    } catch (e:any) {
      alert("Errore: " + (e?.message || "sconosciuto"));
      return null;
    } finally {
      setPortalLinkLoading(false);
    }
  }

  async function sendPortalLink() {
    if (!phone) { alert("Nessun numero di telefono per questo paziente."); return; }
    // ⚠️ Safari fix: apri finestra vuota PRIMA di qualsiasi await
    const waWindow = window.open("about:blank", "_blank");
    const link = await generatePortalLink();
    if (!link) { if (waWindow) waWindow.close(); return; }
    const nome = firstName?.trim() || lastName?.trim() || "Paziente";
    const studioNameInline = currentStudio?.name || "";
    const firma = buildFirma(false); // solo nome, senza titolo per questo msg
    const firmaLine = firma ? `\n\nCordiali saluti,\n${firma}` : "\n\nCordiali saluti";
    const msg = "Gentile " + nome + ",\n\nle ho attivato la sua area personale" +
      (studioNameInline ? ` ${studioNameInline}` : "") +
      " dove puo vedere:\n- i suoi prossimi appuntamenti\n- la scheda esercizi da casa\n- i contatti dello studio\n\nIl suo link personale (valido 6 mesi):\n" + link +
      firmaLine;
    const clean = cleanPhoneWA(phone);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(typeof navigator!=="undefined"?navigator.userAgent:"");
    const url = isMobile
      ? `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`
      : `https://web.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(msg)}`;
    if (waWindow) { waWindow.location.href = url; }
    else { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 200); }
  }

  async function copyPortalLink() {
    const link = portalLink || await generatePortalLink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setPortalLinkCopied(true);
      setTimeout(() => setPortalLinkCopied(false), 2000);
    } catch { alert("Link: " + link); }
  }


  // ── Questionario soddisfazione ───────────────────────────────────────────
  async function sendSatisfactionSurvey() {
    if (!patient) return;
    if (!phone) { alert("Nessun numero di telefono per questo paziente."); return; }
    // ⚠️ Safari fix: apri finestra vuota PRIMA di qualsiasi await
    const waWindow = window.open("about:blank", "_blank");
    const token = crypto.randomUUID();
    try {
      await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, patient_id: patient.id, patient_name: `${lastName} ${firstName}`.trim(), q1: null, q2: null, q3: null, _create_token: true }),
      });
    } catch {}
    const link = `${window.location.origin}/survey/${token}`;

    let msg: string;
    if (templateMessages?.satisfaction_message?.trim()) {
      msg = applyTemplate(templateMessages.satisfaction_message, {
        nome: firstName || "Paziente",
        link,
      });
    } else {
      const firma = buildFirma(false);
      msg = `Gentile ${firstName},\nil suo ciclo di trattamento è terminato.\n\nLe saremmo grati se volesse rispondere a 3 brevi domande:\n${link}\n\nGrazie${firma ? `, ${firma}` : ""}`;
    }

    const clean = cleanPhoneWA(phone);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(typeof navigator!=="undefined"?navigator.userAgent:"");
    const url = isMobile
      ? `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`
      : `https://web.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(msg)}`;
    if (waWindow) { waWindow.location.href = url; }
    else { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 200); }
  }

  // ── Auguri compleanno ────────────────────────────────────────────────────
  function sendBirthdayMsg() {
    if (!patient || !phone) { alert("Nessun numero di telefono."); return; }
    const nome = firstName?.trim() || "Paziente";

    let msg: string;
    if (templateMessages?.birthday_message?.trim()) {
      // Usa il template dalle Impostazioni
      msg = applyTemplate(templateMessages.birthday_message, { nome });
    } else {
      // Fallback: template di default se l'utente non ne ha salvato uno
      const firma = buildFirma(false);
      const firmaLine = firma ? `\n\nCordiali saluti,\n${firma}` : "\n\nCordiali saluti";
      const staffLine = currentStudio?.name ? `Tutto lo staff di ${currentStudio.name}` : "Tutto lo staff";
      msg = `Buon compleanno ${nome}! 🎂\n\n${staffLine} le augura una splendida giornata.\nSe ha bisogno di noi, siamo a sua disposizione.${firmaLine}`;
    }

    openWhatsAppSafe(phone, msg);
  }

  // ── Promemoria pagamento ──────────────────────────────────────────────────
  function sendPaymentMsg() {
    if (!patient || !phone) { alert("Nessun numero di telefono."); return; }
    const nome = firstName?.trim() || "Paziente";
    const importo = unpaidAmount.toLocaleString("it-IT", { minimumFractionDigits: 2 });

    let msg: string;
    if (templateMessages?.payment_message?.trim()) {
      msg = applyTemplate(templateMessages.payment_message, { nome, importo });
    } else {
      const firma = buildFirma(true);
      const firmaLine = firma ? `\n\nCordiali saluti,\n${firma}` : "\n\nCordiali saluti";
      msg = `Gentile ${nome},\n\nle ricordiamo un saldo aperto di €${importo} per le sedute effettuate.\n\nPer qualsiasi informazione non esiti a contattarci.${firmaLine}`;
    }

    openWhatsAppSafe(phone, msg);
  }

  // ── Export scheda paziente completa PDF ──────────────────────────────────
  function exportPazientePDF() {
    if (!patient) return;
    const oggi = new Date().toLocaleDateString("it-IT",{day:"2-digit",month:"long",year:"numeric"});
    const nomeCompleto = `${lastName} ${firstName}`.trim();
    const eta = birthDate ? `${Math.floor((Date.now()-new Date(birthDate).getTime())/31557600000)} anni` : "—";
    const apptRows = appointments.slice(0,30).map((a,i)=>{
      const d=new Date(a.start_at);
      const stato=(a.status as string)==="done"?"Eseguita":(a.status as string)==="not_paid"?"Non pagata":(a.status as string)==="cancelled"?"Annullata":(a.status as string)==="confirmed"?"Confermata":"Prenotata";
      const pagato=a.is_paid?"✓":"";
      return `<tr style="background:${i%2===0?"#f8fafc":"#fff"}"><td style="padding:6px 10px">${d.toLocaleDateString("it-IT")}</td><td style="padding:6px 10px">${d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}</td><td style="padding:6px 10px">${stato}</td><td style="padding:6px 10px;text-align:center">${pagato}</td><td style="padding:6px 10px;text-align:right">${a.amount?`€${a.amount}`:""}</td></tr>`;
    }).join("");
    const exRows = esercizi.map((e,i)=>`<tr style="background:${i%2===0?"#f8fafc":"#fff"}"><td style="padding:6px 10px;font-weight:700">${e.nome}</td><td style="padding:6px 10px">${e.serie}×${e.ripetizioni}</td><td style="padding:6px 10px">${e.frequenza}</td><td style="padding:6px 10px">${e.avvertenze||"—"}</td></tr>`).join("");
    const html=`<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>Scheda — ${nomeCompleto}</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;padding:40px;color:#0f172a;font-size:12px;max-width:760px;margin:0 auto;}
  h2{font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1.5px solid #e2e8f0;padding-bottom:5px;margin:20px 0 10px;}
  .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:8px;}
  .field label{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;display:block;margin-bottom:2px;}
  .field span{font-size:13px;font-weight:600;}
  .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;}
  table{width:100%;border-collapse:collapse;font-size:11px;}
  th{background:#f1f5f9;padding:6px 10px;text-align:left;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;}
  @media print{button{display:none!important;}.no-print{display:none!important;}}
  ${studioHeaderCss}
</style></head><body>
${studioPdfHeader(currentStudio,{docTitle:"Scheda Clinica",docSubtitle:nomeCompleto})}
<h2>Anagrafica</h2>
<div class="box grid">
  <div class="field"><label>Data di nascita</label><span>${birthDate?new Date(birthDate+"T12:00:00").toLocaleDateString("it-IT"):"—"} (${eta})</span></div>
  <div class="field"><label>Luogo di nascita</label><span>${birthPlace||"—"}</span></div>
  <div class="field"><label>Codice Fiscale</label><span>${taxCode||"—"}</span></div>
  <div class="field"><label>Città</label><span>${resCity||"—"}</span></div>
  <div class="field"><label>Telefono</label><span>${phone||"—"}</span></div>
  <div class="field"><label>Prima visita</label><span>${firstVisitDate?new Date(firstVisitDate+"T12:00:00").toLocaleDateString("it-IT"):"—"}</span></div>
</div>
<h2>Quadro clinico</h2>
<div class="box">
  <div class="grid">
    <div class="field"><label>Disturbo principale</label><span>${mainComplaint||"—"}</span></div>
    <div class="field"><label>Zona corporea</label><span>${bodyRegion||"—"} ${side?`(${side})`:""}</span></div>
    <div class="field"><label>Tipo patologia</label><span>${pathologyType||"—"}</span></div>
    <div class="field" style="grid-column:1/-1"><label>Diagnosi medica</label><span>${medicalDiagnosis||"—"}</span></div>
  </div>
  ${anamnesis?`<div class="field" style="margin-top:8px"><label>Anamnesi</label><span style="white-space:pre-wrap">${anamnesis}</span></div>`:""}
  ${diagnosis?`<div class="field" style="margin-top:8px"><label>Diagnosi fisioterapica</label><span style="white-space:pre-wrap">${diagnosis}</span></div>`:""}
  ${treatment?`<div class="field" style="margin-top:8px"><label>Trattamento</label><span style="white-space:pre-wrap">${treatment}</span></div>`:""}
</div>
${appointments.length>0?`
<h2>Storico sedute (ultime 30)</h2>
<table><thead><tr><th>Data</th><th>Ora</th><th>Stato</th><th>Pagata</th><th>Importo</th></tr></thead><tbody>${apptRows}</tbody></table>`:""}
${esercizi.length>0?`
<h2>Scheda esercizi attuale</h2>
<table><thead><tr><th>Esercizio</th><th>Serie×Rip</th><th>Frequenza</th><th>Avvertenze</th></tr></thead><tbody>${exRows}</tbody></table>`:""}
<div style="text-align:center;margin-top:32px" class="no-print">
  <button onclick="window.print()" style="padding:10px 28px;background:#0d9488;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">🖨️ Stampa / Salva PDF</button>
</div>
</body></html>`;
    const w=window.open("","_blank","width=900,height:1000"); if(w){w.document.write(html);w.document.close();}
  }

  function stampaEsercizi() {
    if (!patient || esercizi.length === 0) return;
    const oggi = new Date().toLocaleDateString("it-IT", { day:"2-digit", month:"long", year:"numeric" });
    const rows = esercizi.map((e, i) => `
      <div class="esercizio">
        <div class="ex-header">
          <span class="ex-num">${i+1}</span>
          <span class="ex-nome">${e.nome}</span>
          <span class="ex-params">${e.serie} serie × ${e.ripetizioni} ripetizioni &nbsp;·&nbsp; ${e.frequenza}</span>
        </div>
        <div class="ex-desc">${e.descrizione}</div>
        ${(e as any).image_url ? `<img class="ex-img" src="${(e as any).image_url}" alt="Foto esercizio" />` : ""}
        ${e.note ? `<div class="ex-note">📌 ${e.note}</div>` : ""}
        ${e.avvertenze ? `<div class="ex-warn">⚠️ ${e.avvertenze}</div>` : ""}
        ${(e as any).youtube_id ? `<div class="ex-video">▶ Video dimostrativo: <a href="https://www.youtube.com/watch?v=${(e as any).youtube_id}" style="color:#dc2626">youtube.com/watch?v=${(e as any).youtube_id}</a></div>` : ""}
      </div>
    `).join("");

    const html = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">
<title>Programma Esercizi — ${lastName} ${firstName}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Segoe UI',Arial,sans-serif;padding:32px 40px;color:#0f172a;background:#fff;font-size:13px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:18px;border-bottom:2.5px solid #0d9488;}
  .logo{font-size:20px;font-weight:800;color:#0d9488;}.logo span{color:#2563eb;}
  .studio{font-size:11px;color:#64748b;margin-top:4px;line-height:1.6;}
  .doc-info{text-align:right;}
  .doc-info h2{font-size:15px;font-weight:800;color:#0f172a;}
  .doc-info .paziente{font-size:13px;color:#2563eb;font-weight:700;margin-top:3px;}
  .doc-info .data{font-size:11px;color:#64748b;margin-top:2px;}
  .intro{background:#f0fdf4;border-left:4px solid #0d9488;padding:10px 14px;border-radius:0 8px 8px 0;margin-bottom:24px;font-size:12px;color:#15803d;font-weight:600;}
  .esercizio{margin-bottom:18px;padding:14px 16px;border:1.5px solid #e2e8f0;border-radius:10px;page-break-inside:avoid;}
  .esercizio:nth-child(odd){background:#fafbff;}
  .ex-header{display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;}
  .ex-num{width:24px;height:24px;border-radius:50%;background:#0d9488;color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .ex-nome{font-weight:800;font-size:14px;color:#0f172a;flex:1;}
  .ex-params{font-size:11px;font-weight:700;color:#2563eb;background:rgba(37,99,235,0.08);padding:3px 10px;border-radius:99px;white-space:nowrap;}
  .ex-desc{font-size:12px;color:#334155;line-height:1.6;margin-bottom:6px;}
  .ex-note{font-size:11px;color:#0d9488;background:rgba(13,148,136,0.06);padding:5px 10px;border-radius:6px;margin-bottom:4px;}
  .ex-warn{font-size:11px;color:#dc2626;background:rgba(220,38,38,0.05);padding:5px 10px;border-radius:6px;}
  .ex-video{font-size:11px;color:#64748b;margin-top:4px;}
  .ex-img{max-width:260px;max-height:170px;width:auto;border-radius:8px;border:1px solid #e2e8f0;margin:6px 0;display:block;object-fit:cover;}
  .footer{margin-top:32px;padding-top:18px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:flex-end;}
  .firma-box{border-bottom:1.5px solid #0f172a;width:200px;height:40px;margin-top:24px;}
  .firma-label{font-size:10px;color:#64748b;margin-top:4px;}
  .footer-info{font-size:10px;color:#94a3b8;line-height:1.8;}
  @media print{body{padding:16px 20px;}button{display:none!important;}.esercizio{border-color:#cbd5e1;}}
  ${studioHeaderCss}
</style></head><body>
${studioPdfHeader(currentStudio,{docTitle:"Programma Esercizi",docSubtitle:`${lastName} ${firstName}`,docDate:`Emesso il ${oggi}`})}
<div class="intro">
  Eseguire gli esercizi con attenzione, rispettando le indicazioni. In caso di dolore acuto o peggioramento dei sintomi, sospendere e contattare lo studio.
</div>
${rows}
<div class="footer">
  <div>
    <div style="font-size:11px;color:#64748b;margin-bottom:4px;">Firma del paziente per presa visione</div>
    <div class="firma-box"></div>
    <div class="firma-label">Data: ___________</div>
  </div>
  <div class="footer-info">
    ${(() => { const b = getStudioBranding(currentStudio); return [b.signatureName, b.signatureTitle].filter(Boolean).join(" — ") || ""; })()}<br>
    ${currentStudio?.address || ""}<br>
    Documento generato il ${oggi}
  </div>
</div>
<div style="text-align:center;margin-top:20px;">
  <button onclick="window.print()" style="padding:10px 28px;background:#0d9488;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">🖨️ Stampa / Salva PDF</button>
</div>
</body></html>`;

    const w = window.open("", "_blank", "width=900,height=1000");
    if (w) { w.document.write(html); w.document.close(); }
  }

  // ── Carica/salva scheda esercizi nel DB ─────────────────────────────────
  async function loadSchedaEsercizi() {
    try {
      const { data } = await supabase
        .from("schede_esercizi_pubbliche")
        .select("id, token, esercizi, note, created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (data && data.length > 0) {
        // Carica la scheda più recente
        const latest = data[0];
        setSchedaId(latest.id);
        setEsercizi(JSON.parse(latest.esercizi ?? "[]"));
        setEserciziNote(latest.note ?? "");
        setPubLink(`${window.location.origin}/esercizi/${latest.token}`);
        // Popola storico
        setSchedeStorico(data.map((d:any) => ({ id:d.id, created_at:d.created_at, token:d.token, note:d.note })));
      }
    } catch(e) { console.warn("loadSchedaEsercizi", e); }
  }

  async function saveSchedaEsercizi() {
    if (esercizi.length === 0) return;
    setSavingScheda(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const payload = {
        patient_id: patientId,
        patient_name: `${lastName} ${firstName}`.trim(),
        esercizi: JSON.stringify(esercizi),
        note: eserciziNote || null,
        expires_at: new Date(Date.now() + 90*24*60*60*1000).toISOString(),
      };
      if (schedaId) {
        // Aggiorna esistente
        await supabase.from("schede_esercizi_pubbliche").update(payload).eq("id", schedaId);
      } else {
        // Crea nuova
        const token = crypto.randomUUID();
        const { data } = await supabase.from("schede_esercizi_pubbliche").insert({ ...payload, token }).select("id,token").single();
        if (data) { setSchedaId(data.id); setPubLink(`${window.location.origin}/esercizi/${data.token}`); }
      }
      await loadSchedaEsercizi();
    } catch(e:any) { console.error(e); }
    finally { setSavingScheda(false); }
  }

  async function loadSchedaStorico(id: string) {
    const { data } = await supabase.from("schede_esercizi_pubbliche").select("*").eq("id", id).single();
    if (data) {
      setSchedaId(data.id);
      setEsercizi(JSON.parse(data.esercizi ?? "[]"));
      setEserciziNote(data.note ?? "");
      setPubLink(`${window.location.origin}/esercizi/${data.token}`);
      setShowStorico(false);
    }
  }

  async function generatePubLink() {
    if (esercizi.length === 0) return;
    setPubLinkLoading(true); setPubLink("");
    try {
      const res = await fetch("/api/esercizi-pubblici", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patient?.id ?? null,
          patient_name: `${lastName} ${firstName}`.trim(),
          esercizi,
          note: eserciziNote || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const fullUrl = `${window.location.origin}${data.url}`;
      setPubLink(fullUrl);
    } catch(e: any) {
      setGenError(`Errore generazione link: ${translateError(e)}`);
    } finally {
      setPubLinkLoading(false);
    }
  }

  // Genera e apri per stampa (firma a mano)
  function printConsentDoc(type: "privacy" | "consenso") {
    if (!patient) return;
    const html = buildConsentHtml(type, null, patient);
    openHtmlInWindow(html);
  }

  // Salva su Supabase (con firma digitale embedded)
  async function saveConsents() {
    if (!patient) return;
    if (isSigEmpty(sigPrivacyRef))  { setConsentError("Firma mancante sull'Informativa Privacy."); return; }
    if (isSigEmpty(sigConsensoRef)) { setConsentError("Firma mancante sul Consenso al trattamento."); return; }
    setConsentError(""); setConsentSaving(true);
    const nome = `${patient.last_name} ${patient.first_name}`.trim();
    const sigP = sigPrivacyRef.current!.toDataURL("image/png");
    const sigC = sigConsensoRef.current!.toDataURL("image/png");
    const ts   = Date.now();
    const docs2 = [
      { html: buildConsentHtml("privacy",  sigP, patient), docType: "gdpr_informativa_privacy" as DocType, fname: `Privacy_${nome.replace(/ /g,"_")}_${ts}.html` },
      { html: buildConsentHtml("consenso", sigC, patient), docType: "consenso_trattamento"     as DocType, fname: `Consenso_${nome.replace(/ /g,"_")}_${ts}.html` },
    ];
    for (const doc of docs2) {
      const blob = new Blob([doc.html], { type: "text/html;charset=utf-8" });
      const path = `${patientId}/${doc.fname}`;
      const up   = await supabase.storage.from("patient_docs").upload(path, blob, { upsert: false, contentType: "text/html" });
      if (up.error)  { setConsentError(`Upload fallito: ${translateError(up.error)}`);  setConsentSaving(false); return; }
      const ins  = await supabase.from("patient_documents").insert({ patient_id: patientId, doc_type: doc.docType, file_name: doc.fname, storage_path: path, studio_id: currentStudio?.id });
      if (ins.error) { setConsentError(`Errore DB: ${ins.error.message}`); setConsentSaving(false); return; }
    }
    setConsentSaving(false); setConsentSaved(true);
    await loadDocs();
    setTimeout(() => { setShowConsentModal(false); setConsentSaved(false); }, 2000);
  }
  return (
    <div style={{ minHeight: "100vh", background: THEME.appBg, fontFamily: "'Outfit', 'Segoe UI', system-ui, sans-serif" }}>

      {/* ━━━ TOUR ONBOARDING (Tappa 9) ━━━ */}
      <PatientPageTour
        forceShow={tourForceShow}
        onClose={() => setTourForceShow(false)}
      />

      {/* ━━━ MODAL CONSENSI ━━━ */}
      {showConsentModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px 16px", overflowY: "auto" }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 920, boxShadow: "0 24px 64px rgba(0,0,0,0.3)", marginBottom: 20 }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: `1px solid ${THEME.border}` }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: THEME.text }}>🔏 Genera consensi</div>
                <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>Firma entrambi i documenti con Apple Pencil o mouse · vengono salvati automaticamente</div>
              </div>
              <button onClick={() => { setShowConsentModal(false); setConsentSaved(false); setConsentError(""); }} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${THEME.border}`, background: THEME.panelSoft, cursor: "pointer", fontSize: 16, color: THEME.muted }}>✕</button>
            </div>

            <div style={{ padding: "18px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>

              {/* Informativa Privacy */}
              <div style={{ border: `1.5px solid ${THEME.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ background: "linear-gradient(135deg, #0d9488, #0891b2)", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>1 · Informativa Privacy GDPR</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", marginTop: 1 }}>Art. 13 Reg. UE 2016/679</div>
                  </div>
                  <button onClick={() => printConsentDoc("privacy")} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🖨 Stampa</button>
                </div>
                <div style={{ padding: "12px 14px", maxHeight: 300, overflowY: "auto", fontSize: 10.5, lineHeight: 1.65, color: THEME.text }}>
                  <p style={{ marginBottom: 6 }}>
                    <strong>Titolare:</strong>{" "}
                    {[
                      getStudioBranding(currentStudio).signatureName,
                      getStudioBranding(currentStudio).signatureTitle,
                      currentStudio?.address,
                    ].filter(Boolean).join(", ") || currentStudio?.name || "—"}
                  </p>
                  <p style={{ marginBottom: 4 }}><strong>Dati trattati:</strong> anagrafici, dati di salute (Art. 9 GDPR), amministrativi.</p>
                  <p style={{ marginBottom: 4 }}><strong>Finalità:</strong> prestazioni fisioterapiche, obblighi di legge, gestione amministrativa, promemoria appuntamenti (con consenso).</p>
                  <p style={{ marginBottom: 4 }}><strong>Conservazione:</strong> 10 anni per documentazione sanitaria e fiscale.</p>
                  <p style={{ marginBottom: 6 }}><strong>Diritti (Artt. 15–22):</strong> accesso, rettifica, cancellazione, limitazione, portabilità, opposizione.</p>
                  <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, padding: "8px 10px" }}>
                    <p><strong>Io sottoscritto/a</strong> {patient?.last_name} {patient?.first_name} dichiaro di aver letto e compreso l'informativa e <strong>acconsento al trattamento dei dati di salute</strong> per finalità terapeutiche.</p>
                    <p style={{ marginTop: 5 }}><input type="checkbox" defaultChecked readOnly /> Acconsento ai promemoria WhatsApp/SMS</p>
                  </div>
                </div>
                <div style={{ padding: "12px 14px", borderTop: `1px solid ${THEME.border}`, background: THEME.panelSoft }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Firma del paziente</div>
                  <canvas
                    ref={el => { if (el && !el.onmousedown) { (sigPrivacyRef as React.MutableRefObject<HTMLCanvasElement>).current = el; setTimeout(() => initSigCanvas(sigPrivacyRef), 80); } }}
                    height={90}
                    style={{ display: "block", width: "100%", border: "1.5px dashed #94a3b8", borderRadius: 6, background: "#fff", touchAction: "none", cursor: "crosshair" }}
                  />
                  <button onClick={() => clearSigCanvas(sigPrivacyRef)} style={{ marginTop: 5, padding: "3px 10px", borderRadius: 6, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.muted, fontSize: 11, cursor: "pointer" }}>Cancella</button>
                </div>
              </div>

              {/* Consenso trattamento */}
              <div style={{ border: `1.5px solid ${THEME.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>2 · Consenso al trattamento fisioterapico</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", marginTop: 1 }}>Legge n. 219/2017</div>
                  </div>
                  <button onClick={() => printConsentDoc("consenso")} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🖨 Stampa</button>
                </div>
                <div style={{ padding: "12px 14px", maxHeight: 300, overflowY: "auto", fontSize: 10.5, lineHeight: 1.65, color: THEME.text }}>
                  <p style={{ marginBottom: 6 }}><strong>Paziente:</strong> {patient?.last_name} {patient?.first_name} · {ddmmyyyy(patient?.birth_date ?? null)} · {patient?.tax_code} · {patient?.residence_city} · {patient?.phone}</p>
                  <p style={{ marginBottom: 4 }}>Il <strong>{getStudioBranding(currentStudio).signatureName || "professionista"}</strong> mi ha illustrato: diagnosi, trattamento proposto (terapia manuale, esercizio, strumentale), benefici, rischi (dolore post-seduta, ecchimosi, aggravamento transitorio), alternative terapeutiche.</p>
                  <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 5, padding: "6px 10px", margin: "6px 0", fontSize: 10 }}>
                    <strong>Controindicazioni:</strong> pace-maker, gravidanza, neoplasie attive, ferite aperte, flebiti in fase acuta.
                  </div>
                  <div style={{ fontSize: 10.5, lineHeight: 2 }}>
                    <div><input type="checkbox" defaultChecked readOnly /> Ho ricevuto e compreso le informazioni</div>
                    <div><input type="checkbox" defaultChecked readOnly /> Non sono a conoscenza di controindicazioni</div>
                    <div><input type="checkbox" defaultChecked readOnly /> Posso revocare il consenso in qualsiasi momento</div>
                    <div><input type="checkbox" defaultChecked readOnly /> Ho ricevuto copia dell'informativa GDPR</div>
                  </div>
                  <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, padding: "8px 10px", marginTop: 6 }}>
                    <p><strong>Acconsento liberamente</strong> all'esecuzione del trattamento fisioterapico nelle modalità concordate.</p>
                  </div>
                </div>
                <div style={{ padding: "12px 14px", borderTop: `1px solid ${THEME.border}`, background: THEME.panelSoft }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Firma del paziente</div>
                  <canvas
                    ref={el => { if (el && !el.onmousedown) { (sigConsensoRef as React.MutableRefObject<HTMLCanvasElement>).current = el; setTimeout(() => initSigCanvas(sigConsensoRef), 80); } }}
                    height={90}
                    style={{ display: "block", width: "100%", border: "1.5px dashed #94a3b8", borderRadius: 6, background: "#fff", touchAction: "none", cursor: "crosshair" }}
                  />
                  <button onClick={() => clearSigCanvas(sigConsensoRef)} style={{ marginTop: 5, padding: "3px 10px", borderRadius: 6, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.muted, fontSize: 11, cursor: "pointer" }}>Cancella</button>
                </div>
              </div>
            </div>

            {/* Footer modal */}
            <div style={{ padding: "14px 24px 18px", borderTop: `1px solid ${THEME.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                {consentError && <div style={{ fontSize: 12, color: THEME.red, fontWeight: 600 }}>⚠️ {consentError}</div>}
                {consentSaved && <div style={{ fontSize: 12, color: THEME.green, fontWeight: 700 }}>✓ Documenti firmati e salvati!</div>}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setShowConsentModal(false); setConsentError(""); }} style={{ padding: "10px 18px", borderRadius: 8, border: `1.5px solid ${THEME.border}`, background: "#fff", color: THEME.muted, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Annulla</button>
                <button onClick={saveConsents} disabled={consentSaving || consentSaved} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: consentSaved ? THEME.green : "linear-gradient(135deg, #0d9488, #2563eb)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: consentSaving ? "wait" : "pointer", opacity: consentSaving ? 0.7 : 1 }}>
                  {consentSaving ? "Salvataggio…" : consentSaved ? "✓ Salvati!" : "✓ Conferma firma e salva"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        * { -webkit-font-smoothing: antialiased; box-sizing: border-box; }
        body { font-family: 'Outfit','Segoe UI',system-ui,sans-serif; margin:0; background:${THEME.appBg}; }
        select, input, textarea, button { font-family: inherit; }
        input:focus, select:focus, textarea:focus {
          border-color: ${THEME.blue} !important;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.12) !important;
          outline: none !important;
        }
        @media (min-width: 768px) and (max-width: 1199px) {
          .tab-hide    { display: none !important; }
          .tab-compact { font-size: 11px !important; padding: 3px 8px !important; }
          .tab-grid-2  { grid-template-columns: 1fr 1fr !important; }
          .tab-p       { padding: 20px 18px !important; }
          .patient-header-btns button, .patient-header-btns a {
            font-size: 12px !important; padding: 8px 12px !important;
          }
        }
        /* ── Layout sidebar paziente (Tappa 1) ─────────────────────── */
        @media (max-width: 1023px) {
          .patient-layout {
            grid-template-columns: 1fr !important;
          }
          .patient-sidebar-hamburger {
            display: inline-flex !important;
          }
        }
      `}</style>

      {/* ━━━ NAVBAR (unificata) ━━━ */}
      <AppNavbar active="patients" />

      {/* ━━━ MAIN ━━━ */}
      <main style={{ padding: "28px 40px", maxWidth: 1680, margin: "0 auto" }} className="tab-p">

        {/* Page header */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 15, flexShrink: 0,
              background: "linear-gradient(135deg, #0d9488, #2563eb)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 800, fontSize: 21, letterSpacing: 0.5,
            }}>
              {privacyMode ? maskInitial(patient) : (`${patient.first_name?.[0] ?? ""}${patient.last_name?.[0] ?? ""}`.toUpperCase() || "?")}
            </div>
            <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <h1 style={{ margin: 0, fontWeight: 800, fontSize: 26, color: THEME.text, letterSpacing: -0.5 }}>
                {headerName}
              </h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, color: THEME.muted, fontWeight: 600 }}>
                🎂 {ddmmyyyy(patient.birth_date)}
                {patient.birth_date && (() => {
                  const b = new Date(patient.birth_date);
                  const t = new Date();
                  let age = t.getFullYear() - b.getFullYear();
                  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
                  return <strong style={{ color: THEME.textSoft }}> · {age} anni</strong>;
                })()}
              </span>
              {patient.phone && canPerm("patient.phone") && (
                <a href={`tel:${patient.phone}`} style={{ fontSize: 14, fontWeight: 700, color: THEME.blue, textDecoration: "none" }}>
                  📞 {displayPhone(patient.phone)}
                </a>
              )}
            </div>
            {consentStatus !== null && (
              <button onClick={() => setActiveSection("gdpr")}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 9,
                  padding: "4px 12px", borderRadius: 99, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 13, fontWeight: 700, alignSelf: "flex-start",
                  background: "transparent", border: "none", paddingLeft: 0,
                  color: consentStatus.ok ? "#15803d" : "#b45309" }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%",
                  background: consentStatus.ok ? "#15803d" : "#b45309" }} />
                {consentStatus.ok ? "Consensi firmati" : consentStatus.pending > 0 ? "Consensi in attesa" : "Consensi mancanti"}
              </button>
            )}
            </div>
          </div>

          <div className="patient-header-btns" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>

            {/* ── BOTTONI PRIMARI (sempre visibili) ─────────────────────── */}
            <button onClick={exportPazientePDF} style={{
              padding: "6px 12px", borderRadius: 7, border: `1px solid ${THEME.border}`,
              background: THEME.panelBg, color: THEME.textSoft, fontWeight: 600,
              fontSize: 12, cursor: "pointer", height: 30,
              display: "inline-flex", alignItems: "center", gap: 5,
              fontFamily: "inherit",
            }}>📄 PDF</button>

            <button onClick={() => setShowConsentModal(true)} style={{
              padding: "6px 12px", borderRadius: 7, border: "none",
              background: "linear-gradient(135deg, #0d9488, #2563eb)",
              color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", height: 30,
              display: "inline-flex", alignItems: "center", gap: 5,
              fontFamily: "inherit",
            }}>🔏 Consensi</button>

            <button onClick={async () => {
              if (!patient) return;
              setQuickConsentMsg("⏳ …");
              const r = await quickSendRemoteConsents({
                patientId,
                firstName: patient.first_name ?? "",
                lastName: patient.last_name ?? "",
                phone: patient.phone ?? null,
                studio: currentStudio,
              });
              setQuickConsentMsg(r.message);
              setTimeout(() => setQuickConsentMsg(null), 4000);
            }} title="Invia link di firma a distanza (riusa il link se già in attesa)" style={{
              padding: "6px 12px", borderRadius: 7,
              border: `1px solid rgba(13,148,136,0.35)`,
              background: "rgba(13,148,136,0.07)",
              color: "#0d9488", fontWeight: 700, fontSize: 12, cursor: "pointer", height: 30,
              display: "inline-flex", alignItems: "center", gap: 5,
              fontFamily: "inherit",
            }}>🖊️ A distanza</button>

            {quickConsentMsg && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "#0d9488",
                padding: "4px 10px", borderRadius: 99,
                background: "rgba(13,148,136,0.08)", border: "1px solid rgba(13,148,136,0.25)" }}>
                {quickConsentMsg}
              </span>
            )}

            {/* ── SALDO APERTO (visibile solo se >0) ─────────────────────── */}
            {unpaidAmount > 0 && phone && (
              <button onClick={sendPaymentMsg} title={`Saldo aperto: €${unpaidAmount.toFixed(2)}`} style={{
                padding: "6px 12px", borderRadius: 7,
                border: `1px solid rgba(220,38,38,0.25)`,
                background: "rgba(220,38,38,0.05)", color: "#dc2626", fontWeight: 700,
                fontSize: 12, cursor: "pointer", height: 30,
                display: "inline-flex", alignItems: "center", gap: 5,
                fontFamily: "inherit",
              }}>💶 Saldo €{unpaidAmount % 1 === 0 ? unpaidAmount.toFixed(0) : unpaidAmount.toFixed(2)}</button>
            )}

            {/* ── MENU KEBAB (azioni secondarie) ─────────────────────────── */}
            <div ref={kebabRef} style={{ position: "relative" }}>
              <button
                onClick={() => setKebabOpen(o => !o)}
                aria-label="Altre azioni"
                aria-expanded={kebabOpen}
                title="Altre azioni"
                style={{
                  width: 30, height: 30, padding: 0, borderRadius: 7,
                  border: `1px solid ${THEME.border}`,
                  background: kebabOpen ? "#f1f5f9" : THEME.panelBg,
                  color: THEME.textSoft, fontWeight: 700, fontSize: 16, cursor: "pointer",
                  lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "inherit",
                }}
              >⋮</button>

              {kebabOpen && (
                <div role="menu" style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0,
                  width: 240,
                  background: THEME.panelBg,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 10,
                  boxShadow: "0 10px 30px rgba(15,23,42,0.18), 0 2px 8px rgba(15,23,42,0.08)",
                  padding: 6,
                  zIndex: 50,
                }}>
                  <KebabItem icon="←" label="Lista pazienti" onClick={() => { setKebabOpen(false); router.push("/patients"); }} />

                  {patient.phone && (
                    <KebabItem
                      icon="📲"
                      label="Promemoria settimana"
                      onClick={() => { setKebabOpen(false); setWeeklyReminderOpen(true); }}
                    />
                  )}

                  <KebabItem
                    icon="⭐"
                    label="Questionario soddisfazione"
                    onClick={() => { setKebabOpen(false); sendSatisfactionSurvey(); }}
                  />

                  <KebabItem
                    icon="🔑"
                    label={portalLinkLoading ? "Caricamento…" : "Invia area riservata"}
                    onClick={() => { setKebabOpen(false); sendPortalLink(); }}
                    disabled={portalLinkLoading}
                  />
                  <KebabItem
                    icon={portalLinkCopied ? "✓" : "📋"}
                    label={portalLinkCopied ? "Link copiato!" : "Copia link area riservata"}
                    onClick={() => { copyPortalLink(); }}
                    disabled={portalLinkLoading}
                    keepOpen
                  />

                  {birthDate && phone && (
                    <KebabItem
                      icon="🎂"
                      label="Auguri di compleanno"
                      onClick={() => { setKebabOpen(false); sendBirthdayMsg(); }}
                    />
                  )}

                  {/* Separatore */}
                  <div style={{ height: 1, background: THEME.border, margin: "6px 4px" }} />

                  {/* Tappa 9 — Riapertura tour onboarding */}
                  <KebabItem
                    icon="ℹ"
                    label="Tour guidato (riapri)"
                    onClick={() => { setKebabOpen(false); setTourForceShow(true); }}
                  />

                  <KebabItem
                    icon="🗑"
                    label={deletingPatient ? "Elimino…" : "Elimina paziente"}
                    onClick={() => { setKebabOpen(false); deletePatient(); }}
                    disabled={deletingPatient}
                    danger
                  />
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            marginBottom: 16, padding: "12px 16px", borderRadius: 8,
            background: "rgba(249,115,22,0.08)", border: `1px solid rgba(249,115,22,0.3)`,
            color: "#92400e", fontWeight: 600, fontSize: 13,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── KPI ─────────────────────────────────────────────────────────── */}
        <div style={{
          background: "linear-gradient(135deg, #0c4a6e 0%, #0d9488 60%, #0f766e 100%)",
          borderRadius: 14, marginBottom: 16, overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          <div style={{ display: "flex", flexWrap: "wrap" }} className="tab-grid-2">
            {[
              {
                label: "Sedute totali",
                value: String(therapiesCount),
                sub: therapiesCount > 0 ? `${Math.round((doneCount/therapiesCount)*100)}% completate` : "nessuna seduta",
                highlight: false,
              },
              {
                label: "Eseguite",
                value: `${doneCount}/${therapiesCount}`,
                sub: doneCount === therapiesCount && therapiesCount > 0 ? "tutte eseguite ✓" : `${therapiesCount - doneCount} rimaste`,
                highlight: doneCount === therapiesCount && therapiesCount > 0,
              },
              {
                label: "Eseguite e pagate",
                value: String(paidCount),
                sub: doneCount > 0 ? `${Math.round((paidCount/doneCount)*100)}% saldate` : "—",
                highlight: paidCount === doneCount && doneCount > 0,
              },
              {
                label: "Ultima seduta",
                value: lastTherapy ? formatDateTimeIT(lastTherapy).split(" ")[0] : "—",
                sub: lastTherapy ? formatDateTimeIT(lastTherapy).split(" ").slice(1).join(" ") : "nessuna seduta",
                highlight: false,
              },
            ].map((k, i) => (
              <div key={k.label} style={{
                flex: "1 1 160px", minWidth: 0,
                padding: "18px 22px 20px",
                borderRight: i < 3 ? "1px solid rgba(255,255,255,0.10)" : "none",
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: k.highlight ? "#86efac" : "#fff", lineHeight: 1, marginBottom: 4, letterSpacing: -0.5 }}>{k.value}</div>
                <div style={{ fontSize: 12, color: k.highlight ? "#86efac" : "rgba(255,255,255,0.5)", fontWeight: 500 }}>{k.sub}</div>
              </div>
            ))}
          </div>
          {/* Progress bar completamento */}
          {therapiesCount > 0 && (
            <div style={{ height: 3, background: "rgba(255,255,255,0.10)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round((doneCount/therapiesCount)*100)}%`, background: "rgba(134,239,172,0.75)", transition: "width 0.5s ease" }}/>
            </div>
          )}
        </div>

        {/* ── Hamburger per iPad/mobile (apre drawer sidebar) ───────────── */}
        <button
          onClick={() => setSidebarMobileOpen(true)}
          className="patient-sidebar-hamburger"
          aria-label="Apri menu sezioni"
          style={{
            display: "none",
            padding: "9px 14px", borderRadius: 8,
            border: `1.5px solid ${THEME.border}`, background: THEME.panelBg,
            color: THEME.textSoft, fontWeight: 700, fontSize: 13,
            cursor: "pointer", marginBottom: 12,
            alignItems: "center", gap: 8,
          }}
        >
          ☰ <span>Sezioni</span>
        </button>

        {/* ── LAYOUT 2-COLONNE: sidebar + contenuto sezione attiva ──────── */}
        <div className="patient-layout" style={{
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          gap: 20,
          alignItems: "start",
        }}>
          <PatientSidebar
            activeSection={activeSection}
            onChange={setActiveSection}
            badges={{
              terapie:   therapiesCount > 0 ? (therapiesCount - paidCount > 0 ? therapiesCount - paidCount : undefined) : undefined,
            }}
            mobileOpen={sidebarMobileOpen}
            onCloseMobile={() => setSidebarMobileOpen(false)}
          />

          {/* Colonna contenuto: renderizza SOLO la sezione attiva */}
          <div style={{ minWidth: 0 }}>

        {/* ── PANORAMICA ───────────────────────────────────────────────────── */}
        {activeSection === "panoramica" && patient && (
        <section style={{ ...cardStyle }}>
          <SecHeader
            icon="🏠"
            title="Panoramica"
            subtitle={`A che punto siamo con ${privacyMode ? maskName(patient) : (patient.first_name ?? "il paziente")}`}
            open={true}
            onToggle={() => {}}
          />
          <div style={cardBody}>
            <PatientOverview patientId={patient.id} variant="desktop" onNavigate={(t) => setActiveSection(t)} />
          </div>
        </section>
        )}

        {/* ── ANAGRAFICA ───────────────────────────────────────────────────── */}
        {activeSection === "anagrafica" && (
        <section style={cardStyle}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 22px", borderBottom:`1px solid ${THEME.border}`, background:"#fff" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:34, height:34, borderRadius:9, background:"rgba(13,148,136,0.08)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17 }}>👤</div>
              <div>
                <span style={{ fontWeight:800, fontSize:14, color:THEME.text }}>Anagrafica</span>
                <div style={{ fontSize:11, color:THEME.muted, fontWeight:600, marginTop:1 }}>{demoEditMode ? "Modalità modifica attiva" : "Clicca Modifica per cambiare i dati"}</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              {!demoEditMode ? btnOutline("Modifica", () => setDemoEditMode(true), THEME.teal)
                : <>{btnOutline("Annulla", () => { resetDemographics(); setDemoEditMode(false); })}{btnPrimary(savingDemo ? "Salvataggio…" : "Salva", saveDemographics, savingDemo || !demoDirty)}</>}
            </div>
          </div>
          <div style={cardBody}>

          {/* Campi base */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }} className="tab-grid-2">
            <div>
              <label style={labelStyle}>Nome</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
            </div>
            <div>
              <label style={labelStyle}>Cognome</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
            </div>
            {canPerm("patient.phone") && (
              <div>
                <label style={labelStyle}>Telefono</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
              </div>
            )}
            {/* Terapista di riferimento (mig. 078): solo in multi-operatore. */}
            {multiOperatorEnabled && teamMembers.length >= 2 && (
              <div>
                <label style={labelStyle}>Terapista di riferimento</label>
                <select
                  value={referentId}
                  onChange={e => setReferentId(e.target.value)}
                  style={inputStyle}
                  disabled={!demoEditMode}
                >
                  <option value="">Nessuno</option>
                  {teamMembers.filter(m => m.user_id).map(m => (
                    <option key={m.user_id!} value={m.user_id!}>{m.display_name || "—"}</option>
                  ))}
                </select>
              </div>
            )}
            {canPerm("patient.address") && (
              <div>
                <label style={labelStyle}>Città</label>
                <input value={resCity} onChange={e => setResCity(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }} className="tab-grid-2">
            <div>
              <label style={labelStyle}>Data di nascita</label>
              <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
              <div style={{ marginTop: 5, fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
                {ddmmyyyy(birthDate || patient.birth_date)}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Luogo di nascita</label>
              <input value={birthPlace} onChange={e => setBirthPlace(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
            </div>
            <div>
              <label style={labelStyle}>Codice Fiscale</label>
              <input value={taxCode} onChange={e => setTaxCode(e.target.value)} style={inputStyle} disabled={!demoEditMode} placeholder="RSSMRC..." />
              <div style={{ marginTop: 5, fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
                {normalizeTaxCode(taxCode || patient.tax_code || "") || "—"}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Preferenza documento</label>
              <select value={preferredPlan} onChange={e => setPreferredPlan(e.target.value as Plan)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                <option value="invoice">Fattura</option>
                <option value="no_invoice">Non fattura</option>
              </select>
            </div>
          </div>

          {/* V2 — Dati clinici */}
          <div style={{ borderTop: `1.5px solid ${THEME.border}`, paddingTop: 16, marginTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: THEME.blueDark }}>Campi avanzati</div>
                <div style={{ fontSize: 11, color: THEME.muted, fontWeight: 600, marginTop: 2 }}>Segmentazione, follow-up, previsioni.</div>
              </div>
            </div>

            {/* Clinica iniziale */}
            <button type="button" onClick={() => setShowV2Clinical(s => !s)} style={{
              width: "100%", textAlign: "left",
              background: "rgba(37,99,235,0.03)", border: `1.5px solid ${THEME.border}`,
              padding: "10px 14px", borderRadius: 8, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontWeight: 700, fontSize: 13, color: THEME.blueDark, marginBottom: showV2Clinical ? 12 : 0,
            }}>
              <span>🧠 Dati clinici iniziali</span>
              <span>{showV2Clinical ? "−" : "+"}</span>
            </button>

            {showV2Clinical && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }} className="tab-grid-2">
                <div style={{ gridColumn: "1 / span 2" }}>
                  <label style={labelStyle}>Motivo principale</label>
                  <textarea value={mainComplaint} onChange={e => setMainComplaint(e.target.value)} rows={3} style={textareaStyle} placeholder="Es. dolore lombare da 3 settimane…" disabled={!demoEditMode} />
                </div>
                <div>
                  <label style={labelStyle}>Distretto</label>
                  <select value={bodyRegion} onChange={e => setBodyRegion(e.target.value)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                    <option value="">Seleziona</option>
                    <option value="cervicale">Cervicale</option><option value="dorsale">Dorsale</option>
                    <option value="lombare">Lombare</option><option value="spalla">Spalla</option>
                    <option value="gomito">Gomito</option><option value="polso_mano">Polso/Mano</option>
                    <option value="anca">Anca</option><option value="ginocchio">Ginocchio</option>
                    <option value="caviglia_piede">Caviglia/Piede</option><option value="atm">ATM</option>
                    <option value="neurologico">Neurologico</option><option value="altro">Altro</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Lato</label>
                  <select value={side} onChange={e => setSide(e.target.value)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                    <option value="">Seleziona</option>
                    <option value="dx">DX</option><option value="sx">SX</option><option value="bilaterale">Bilaterale</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Tipo problema</label>
                  <select value={pathologyType} onChange={e => setPathologyType(e.target.value)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                    <option value="">Seleziona</option>
                    <option value="traumatico">Traumatico</option><option value="degenerativo">Degenerativo</option>
                    <option value="post_chirurgico">Post-chirurgico</option><option value="neurologico">Neurologico</option>
                    <option value="cronico">Cronico</option><option value="funzionale">Funzionale</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Diagnosi medica</label>
                  <input value={medicalDiagnosis} onChange={e => setMedicalDiagnosis(e.target.value)} style={inputStyle} disabled={!demoEditMode} placeholder="Es. discopatia L4-L5" />
                </div>
              </div>
            )}

            {/* Business */}
            <button type="button" onClick={() => setShowV2Business(s => !s)} style={{
              width: "100%", textAlign: "left",
              background: "rgba(22,163,74,0.03)", border: `1.5px solid ${THEME.border}`,
              padding: "10px 14px", borderRadius: 8, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontWeight: 700, fontSize: 13, color: THEME.greenDark, marginBottom: showV2Business ? 12 : 0,
            }}>
              <span>💼 Stato & dati economici</span>
              <span>{showV2Business ? "−" : "+"}</span>
            </button>

            {showV2Business && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }} className="tab-grid-2">
                <div>
                  <label style={labelStyle}>Stato paziente</label>
                  <select value={patientStatus} onChange={e => setPatientStatus(e.target.value)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                    <option value="active">Attivo</option><option value="lead">Lead</option>
                    <option value="paused">In pausa</option><option value="follow_up">Follow-up</option>
                    <option value="discharged">Dimesso</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Canale acquisizione</label>
                  <select value={acquisitionChannel} onChange={e => setAcquisitionChannel(e.target.value)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }} disabled={!demoEditMode}>
                    <option value="">Seleziona</option>
                    <option value="passaparola">Passaparola</option><option value="medico">Medico</option>
                    <option value="instagram">Instagram</option><option value="google">Google</option>
                    <option value="evento">Evento</option><option value="altro">Altro</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Data primo contatto</label>
                  <input type="date" value={firstVisitDate} onChange={e => setFirstVisitDate(e.target.value)} style={inputStyle} disabled={!demoEditMode} />
                </div>
                <div>
                  <label style={labelStyle}>Frequenza prevista (sett.)</label>
                  <input value={expectedFrequency} onChange={e => setExpectedFrequency(e.target.value)} style={inputStyle} disabled={!demoEditMode} placeholder="Es. 2" />
                </div>
                <div>
                  <label style={labelStyle}>Pacchetto sedute</label>
                  <input value={packageSize} onChange={e => setPackageSize(e.target.value)} style={inputStyle} disabled={!demoEditMode} placeholder="Es. 10" />
                </div>
              </div>
            )}

            <p style={{ margin: "12px 0 0", fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
              Questi campi si salvano con il bottone "Salva anagrafica".
            </p>
          </div>
          </div>
        </section>
        )}

        {/* ── CLINICA ──────────────────────────────────────────────────────── */}
        {activeSection === "clinica" && (
        <section style={cardStyle}>
          <SecHeader icon="🩺" title="Clinica" subtitle="Anamnesi · Diagnosi · Trattamento" open={secClinica} onToggle={()=>setSecClinica(s=>!s)}
            extra={<div style={{display:"flex",gap:8}} onClick={e=>e.stopPropagation()}>{btnOutline("Ripristina",resetClinical,THEME.muted,!clinicalDirty)}{btnPrimary(savingClinical?"Salvataggio…":"Salva",saveClinical,savingClinical||!clinicalDirty)}</div>}
          />
          {secClinica && (
          <div style={cardBody}>

            {/* ── Tappa 4: Pannello Riassunto Clinico ──────────────── */}
            <PatientSummaryPanel
              diagnosis={diagnosis}
              soapNotes={summarySoapNotes}
              therapiesCount={therapiesCount}
              doneCount={doneCount}
              activeGoals={activeGoals}
              patientId={patient?.id}
            />

            {/* ── Tappa 5: ANAMNESI STRUTTURATA ──────────────────────── */}
            {patient && currentStudio && userId && (
              <StructuredAnamnesis
                patientId={patient.id}
                studioId={currentStudio.id}
                ownerId={userId}
              />
            )}

            {/* Note libere aggiuntive (textarea originale, ora come fallback) */}
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span>📝</span>
                <span>Note libere aggiuntive (anamnesi)</span>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontWeight: 500 }}>
                Tutto quello che non sta nei campi strutturati sopra
              </div>
              <textarea value={anamnesis} onChange={e => setAnamnesis(e.target.value)} rows={4} style={{ ...textareaStyle, marginTop: 0 }} placeholder="Note aggiuntive di anamnesi: farmaci, allergie, dettagli specifici, contesto…" />
            </div>

            <div style={{ marginTop: 18 }}>
              {patient && currentStudio && userId && (
                <StructuredDiagnosis
                  patientId={patient.id}
                  studioId={currentStudio.id}
                  ownerId={userId}
                />
              )}
            </div>

            {/* Note libere diagnosi (textarea originale come fallback) */}
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span>📝</span>
                <span>Note libere aggiuntive (diagnosi)</span>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontWeight: 500 }}>
                Ragionamento clinico, considerazioni, dettagli che non stanno nei campi sopra
              </div>
              <textarea value={diagnosis} onChange={e => setDiagnosis(e.target.value)} rows={4} style={{ ...textareaStyle, marginTop: 0 }} placeholder="Note libere…" />
            </div>

          {/* Piano trattamento — STRUTTURATO (Tappa 7) */}
          <div style={{ marginTop: 18 }}>
            {patient && currentStudio && userId && (
              <StructuredTreatmentPlan
                patientId={patient.id}
                studioId={currentStudio.id}
                ownerId={userId}
              />
            )}
          </div>

          {/* Note libere Piano (textarea originale come fallback) */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <span>📝</span>
              <span>Note libere aggiuntive (piano)</span>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontWeight: 500 }}>
              Considerazioni, progressioni, dettagli che non stanno nei campi sopra
            </div>
            <textarea value={treatment} onChange={e => setTreatment(e.target.value)} rows={4} style={{ ...textareaStyle, marginTop: 0 }} placeholder="Note libere…" />
          </div>
          </div>
          )}
        </section>
        )}

        {/* ── BODY CHART ───────────────────────────────────────────────────── */}
        {activeSection === "mappa-dolore" && (
        <section style={cardStyle}>
          <SecHeader
            icon={
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg,#0d9488,#2563eb)" }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="5" r="2.4" />
                  <path d="M12 7.4V15" />
                  <path d="M5.5 9.5C7.5 10.6 9.7 11.2 12 11.2s4.5-.6 6.5-1.7" />
                  <path d="M12 15l-3.2 5.4M12 15l3.2 5.4" />
                </svg>
              </span>
            }
            title="Body Chart — Mappa del Dolore" subtitle="Dipingi le zone dolorose · irradiazioni · referto PDF" open={secBodyChart} onToggle={()=>setSecBodyChart(s=>!s)}/>
          {secBodyChart && (
            <div style={cardBody}>
              <PainMapSection patientId={patientId} patientName={patient ? `${patient.last_name} ${patient.first_name}`.trim() : "Paziente"} studio={currentStudio} ownerId={ownerId ?? ""}/>
            </div>
          )}
        </section>
        )}

        {/* ── DOCUMENTI CLINICI ─────────────────────────────────────────────── */}
        {activeSection === "documenti-clinici" && (
        <section style={cardStyle}>
          <SecHeader icon="📋" title="Documenti Clinici" subtitle={`${clinicalDocs.length} documenti · immagini e PDF`} open={secDocClinici} onToggle={()=>setSecDocClinici(s=>!s)}
            badge={clinicalDocs.length>0?<span style={{fontSize:11,fontWeight:700,color:THEME.blue,background:"rgba(37,99,235,0.1)",padding:"2px 8px",borderRadius:99}}>{clinicalDocs.length}</span>:undefined}
            extra={<div onClick={e=>e.stopPropagation()}>{btnOutline(loadingClinicalDocs?"Aggiorno…":"Aggiorna",loadClinicalDocs,THEME.blue,loadingClinicalDocs)}</div>}
          />
          {secDocClinici && (
          <div style={cardBody}>
          <div style={{ border: `1.5px solid ${THEME.border}`, borderRadius: 10, padding: 16, background: THEME.panelSoft, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Tipo documento</label>
                <select value={clinicalUploadType} onChange={e => setClinicalUploadType(e.target.value as ClinicalDocType)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }}>
                  <option value="prescrizione">Prescrizione</option>
                  <option value="rx">Rx (Radiografia)</option>
                  <option value="rm">RM (Risonanza Magnetica)</option>
                  <option value="tac">TAC</option>
                  <option value="elettromiografia">Elettromiografia</option>
                  <option value="ecografia">Ecografia</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Nome (opzionale)</label>
                <input value={clinicalUploadTitle} onChange={e => setClinicalUploadTitle(e.target.value)} style={inputStyle} placeholder="Es. RM Lombare 12-02-2026" />
              </div>
              <div style={{ gridColumn: "1 / span 2" }}>
                <label style={labelStyle}>File (immagini o PDF)</label>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.webp" onChange={e => setClinicalUploadFile(e.target.files?.[0] || null)} style={inputStyle} />
                {clinicalUploadFile && (
                  <div style={{ marginTop: 6, fontSize: 12, color: THEME.green, fontWeight: 700 }}>
                    ✓ {clinicalUploadFile.name}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {btnPrimary(savingClinicalDoc === "upload" ? "Carico…" : "Carica documento", uploadClinicalDocument, savingClinicalDoc === "upload")}
            </div>
          </div>

          {/* Lista documenti clinici */}
          {clinicalDocs.length === 0 ? (
            <div style={{ fontSize: 13, color: THEME.muted, fontWeight: 600 }}>Nessun documento clinico caricato.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {clinicalDocs.map(doc => (
                <div key={doc.id} style={{
                  border: `1.5px solid ${THEME.border}`, borderRadius: 8, padding: "12px 16px",
                  background: THEME.panelBg, display: "flex", alignItems: "center",
                  justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                }}>
                  <div>
                    <div style={{ fontWeight: 700, color: THEME.text, fontSize: 13 }}>
                      {clinicalDocTypeLabel(doc.doc_type)} · {doc.file_name || "Documento"}
                    </div>
                    <div style={{ marginTop: 3, fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
                      {new Date(doc.uploaded_at).toLocaleString("it-IT")}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {btnOutline("Apri", () => openClinicalDocument(doc))}
                    <button type="button" onClick={() => deleteClinicalDocument(doc)} style={{
                      padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${THEME.red}`,
                      background: "rgba(220,38,38,0.06)", color: THEME.red, fontWeight: 700, fontSize: 13, cursor: "pointer",
                    }}>Elimina</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
          )}
        </section>
        )}

        {/* ── PACCHETTI SEDUTE ──────────────────────────────────────────────── */}
        {activeSection === "pacchetti" && (
        <section style={{ ...cardStyle }}>
          <SecHeader
            icon="📦"
            title="Pacchetti sedute"
            subtitle="Cicli di trattamento prepagati · acconti · saldi · rate"
            open={secPacchetti}
            onToggle={() => setSecPacchetti(s => !s)}
          />
          {secPacchetti && patient && (
            <div style={cardBody}>
              <PatientPackagesSection patientId={patient.id} mode="desktop" />
            </div>
          )}
        </section>
        )}

        {/* ── TERAPIE + PAGAMENTO ───────────────────────────────────────────── */}
        {activeSection === "terapie" && (
        <section style={{ ...cardStyle }}>
          <SecHeader
            icon="📅"
            title="Terapie fatte"
            subtitle="Stato e pagamento per ogni seduta"
            open={secTerapie}
            onToggle={() => setSecTerapie(s => !s)}
            extra={!secTerapie && btnOutline(loadingAppts ? "Aggiorno…" : "Aggiorna", loadAppointments, THEME.blue, loadingAppts)}
            badge={!secTerapie && appointments.length > 0
              ? <span style={{ background:"rgba(22,163,74,0.1)", color:THEME.teal, fontWeight:800, fontSize:12, borderRadius:99, padding:"2px 10px", border:"1px solid rgba(22,163,74,0.2)" }}>
                  {appointments.filter(a=>a.status==="done").length} sedute
                </span>
              : undefined}
          />
          {secTerapie && (
          <div style={cardBody}>
            <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12, gap: 8 }}>
              <button
                onClick={() => setAiBriefingOpen(true)}
                title="Le consegne AI prima della seduta: quadro, ultima risposta, cosa monitorare"
                style={{
                  padding: "8px 14px", borderRadius: 8,
                  border: `1px solid ${THEME.border}`,
                  background: THEME.panelSoft, color: THEME.text,
                  fontWeight: 600, fontSize: 13, cursor: "pointer",
                }}
              >
                ✨ Briefing
              </button>
              <button
                onClick={() => setAiLetterOpen(true)}
                title="Lettera formale al medico generata dal percorso clinico"
                style={{
                  padding: "8px 14px", borderRadius: 8,
                  border: `1px solid ${THEME.border}`,
                  background: THEME.panelSoft, color: THEME.text,
                  fontWeight: 600, fontSize: 13, cursor: "pointer",
                }}
              >
                🖋 Lettera medico
              </button>
              <button
                onClick={() => setShowCertDialog(true)}
                disabled={appointments.filter(a => a.status === "done").length === 0}
                title={appointments.filter(a => a.status === "done").length === 0
                  ? "Disponibile dopo almeno una seduta completata"
                  : "Genera attestato di presenza PDF per più date"}
                style={{
                  padding: "8px 14px", borderRadius: 8,
                  border: `1px solid ${THEME.border}`,
                  background: THEME.panelSoft, color: THEME.text,
                  fontWeight: 600, fontSize: 13,
                  cursor: appointments.filter(a => a.status === "done").length === 0 ? "not-allowed" : "pointer",
                  opacity: appointments.filter(a => a.status === "done").length === 0 ? 0.5 : 1,
                }}
              >
                📄 Attestato presenza
              </button>
              {btnOutline(loadingAppts ? "Aggiorno…" : "Aggiorna", loadAppointments, THEME.blue, loadingAppts)}
            </div>

          {appointments.length === 0 && !loadingAppts ? (
            <div style={{ fontSize: 13, color: THEME.muted, fontWeight: 600 }}>Nessuna seduta trovata.</div>
          ) : (
            <div style={{ overflow: "hidden", borderRadius: 10, border: `1.5px solid ${THEME.border}` }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Data", "Stato", "Pagata", "Importo"].map(h => (
                      <th key={h} style={tableHeaderStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((a, idx) => {
                    const busy = !!rowBusy[a.id];
                    const c    = statusColors(a.status);
                    const selectStyle: React.CSSProperties = {
                      padding: "5px 10px", borderRadius: 6,
                      border: `1.5px solid ${c.bd}`, background: c.bg,
                      color: c.fg, fontWeight: 700, fontSize: 12,
                      cursor: busy ? "not-allowed" : "pointer", outline: "none",
                    };
                    return (
                      <tr key={a.id} style={{ background: idx % 2 === 0 ? "#fff" : THEME.panelSoft, borderBottom: `1px solid ${THEME.border}` }}>
                        <td style={{ padding: "12px 14px", color: THEME.text, fontWeight: 700, fontSize: 13 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span>{formatDateTimeIT(a.start_at)}</span>
                            {a.package_id && <PackageBadge packageId={a.package_id} variant="default" />}
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center",
                              padding: "5px 10px", borderRadius: 6,
                              background: c.bg, border: `1.5px solid ${c.bd}`,
                              color: c.fg, fontWeight: 700, fontSize: 12,
                            }}>{statusLabel(a.status)}</span>
                            <select
                              value={a.status}
                              disabled={busy}
                              onChange={e => updateTherapyStatus(a.id, e.target.value as Status)}
                              style={selectStyle}
                            >
                              <option value="booked">Prenotata</option>
                              <option value="confirmed">Confermata</option>
                              <option value="done">Eseguita</option>
                            </select>
                            {busy && <span style={{ fontSize: 12, color: THEME.muted }}>Salvo…</span>}
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          {a.status === "done" ? (
                            <PaidPill
                              data={{
                                is_paid: a.is_paid,
                                paid_at: a.paid_at,
                                payment_method: a.payment_method,
                                price_type: a.price_type,
                              }}
                              onUpdate={async (next) => handleUpdatePayment(a.id, next)}
                              disabled={busy}
                            />
                          ) : (
                            <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                              —
                            </span>
                          )}
                          {a.status !== "done" && (
                            <div style={{ marginTop: 4, fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
                              Pagamento attivo solo se eseguita.
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 13, color: THEME.muted, fontWeight: 700 }}>€</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              defaultValue={a.amount != null ? String(a.amount).replace(".", ",") : ""}
                              placeholder="0,00"
                              disabled={busy}
                              onBlur={e => {
                                const v = e.target.value.trim();
                                const cur = a.amount != null ? String(a.amount).replace(".", ",") : "";
                                if (v !== cur) handleUpdateAmount(a.id, v);
                              }}
                              style={{
                                width: 78, padding: "6px 8px", borderRadius: 7,
                                border: `1px solid ${THEME.border}`, fontSize: 13,
                                fontWeight: 700, color: THEME.text, fontFamily: "inherit",
                                textAlign: "right",
                              }}
                            />
                          </div>
                          {a.status === "done" && (
                            <div style={{ marginTop: 4, fontSize: 10.5, fontWeight: 700,
                              color: (a.amount == null || Number(a.amount) === 0) ? THEME.amber
                                : a.is_paid ? THEME.green : THEME.red }}>
                              {(a.amount == null || Number(a.amount) === 0) ? "Gratuita"
                                : a.is_paid ? "Pagata" : "Da incassare"}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ margin: "10px 0 0", fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
            Nota: "Annullato" mantiene lo storico · se una seduta torna da "Eseguita" a un altro stato, il pagamento viene azzerato.
          </p>
          </div>
          )}
        </section>
        )}

        {/* ── DIARIO CLINICO (SOAP) ────────────────────────────────────────── */}
        {activeSection === "diario" && patient && (
        <section style={{ ...cardStyle }}>
          <SecHeader
            icon="📝"
            title="Diario clinico"
            subtitle="Cronologia sedute · note rapide · SOAP · trend VAS"
            open={secDiarioSOAP}
            onToggle={() => setSecDiarioSOAP(s => !s)}
          />
          {secDiarioSOAP && (
            <div style={cardBody}>
              <ClinicalDiarySection
                patientId={patient.id}
                studioId={currentStudio?.id}
                ownerId={userId || undefined}
              />
            </div>
          )}
        </section>
        )}

        {/* ── SCALE DI VALUTAZIONE ──────────────────────────────────────────── */}
        {activeSection === "scale" && (
        <section style={{ ...cardStyle }}>
          <SecHeader
            icon="📊"
            title="Scale di valutazione"
            subtitle="VAS · NDI · Oswestry · DASH · LEFS — monitora i progressi nel tempo"
            open={secScales}
            onToggle={() => setSecScales(s => !s)}
          />
          {secScales && patient && (
            <div style={cardBody}>
              <ScalesSection patientId={patient.id} patientFirstName={patient.first_name ?? ""} patientPhone={patient.phone ?? null} studio={currentStudio} />
            </div>
          )}
        </section>
        )}

        {/* ── FOTO POSTURALI PRE/POST ─────────────────────────────────────── */}
        {activeSection === "foto" && (
        <section style={{ ...cardStyle }}>
          <SecHeader
            icon="📷"
            title="Foto cliniche"
            subtitle="Analisi posturale · confronto pre/post · progressi visibili"
            open={secPhotos}
            onToggle={() => setSecPhotos(s => !s)}
          />
          {secPhotos && patient && (
            <div style={cardBody}>
              <PhotoGallerySection patientId={patient.id} />
            </div>
          )}
        </section>
        )}

        {/* ── SCHEDA ESERCIZI ──────────────────────────────────────────────── */}
        {activeSection === "esercizi" && (
        <section style={{ ...cardStyle }}>
          <SecHeader
            icon="🏋️"
            title="Programma Esercizi"
            subtitle="Fase clinica · progressione settimanale · genera con AI · link paziente"
            open={secEsercizi}
            onToggle={() => setSecEsercizi(s => !s)}
          />
          {secEsercizi && patient && (
            <div style={cardBody}>
              <ExerciseProgramSection
                patientId={patient.id}
                patientName={`${patient.last_name ?? ""} ${patient.first_name ?? ""}`.trim()}
                patientPhone={patient.phone ?? null}
                studio={currentStudio}
              />
            </div>
          )}
        </section>
        )}


        {/* ── TIMELINE PAZIENTE ────────────────────────────────────────────── */}
        {activeSection === "timeline" && (
        <section style={{ ...cardStyle }}>
          <SecHeader
            icon="📈"
            title="Timeline sedute"
            subtitle="Andamento visivo di tutti gli appuntamenti nel tempo"
            open={secTimeline}
            onToggle={() => setSecTimeline(s => !s)}
            badge={!secTimeline && appointments.length > 0
              ? <span style={{ background:"rgba(13,148,136,0.1)", color:THEME.teal, fontWeight:800, fontSize:12, borderRadius:99, padding:"2px 10px", border:"1px solid rgba(13,148,136,0.2)" }}>
                  {appointments.length} sedute
                </span>
              : undefined}
          />
          {secTimeline && (
            <div style={cardBody}>
              {appointments.length === 0 ? (
                <div style={{ fontSize:13, color:THEME.muted, fontWeight:600 }}>Nessuna seduta trovata.</div>
              ) : (() => {
                // Raggruppa per mese
                const byMonth = new Map<string, typeof appointments>();
                [...appointments].sort((a,b) => new Date(a.start_at).getTime()-new Date(b.start_at).getTime()).forEach(a => {
                  const d = new Date(a.start_at);
                  const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
                  if (!byMonth.has(key)) byMonth.set(key, []);
                  byMonth.get(key)!.push(a);
                });
                const mesi = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
                const statusC: Record<string,string> = { done:"#16a34a", confirmed:"#2563eb", booked:"#f97316", cancelled:"#dc2626", not_paid:"#7c3aed" };
                const totalDone = appointments.filter(a=>a.status==="done").length;
                const totalRev  = appointments.filter(a=>a.status==="done").reduce((s,a)=>s+(a.amount??0),0);
                const firstDate = new Date(appointments[appointments.length-1]?.start_at ?? new Date());
                const lastDate  = new Date(appointments[0]?.start_at ?? new Date());
                const months    = Math.max(1, Math.round((lastDate.getTime()-firstDate.getTime())/2629800000)+1);

                return (
                  <>
                    {/* KPI strip */}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
                      {[
                        { l:"Sedute totali",   v:appointments.length, c:THEME.teal },
                        { l:"Eseguite",        v:totalDone, c:THEME.green },
                        { l:"Incasso totale",  v:`€${Math.round(totalRev)}`, c:THEME.blue },
                        { l:"Media/mese",      v:(totalDone/months).toFixed(1), c:THEME.amber },
                      ].map(k=>(
                        <div key={k.l} style={{ padding:"12px 14px", borderRadius:10, border:`1px solid ${k.c}22`, background:`${k.c}08`, textAlign:"center" }}>
                          <div style={{ fontSize:20, fontWeight:800, color:k.c }}>{k.v}</div>
                          <div style={{ fontSize:10, color:THEME.muted, fontWeight:600, marginTop:2 }}>{k.l}</div>
                        </div>
                      ))}
                    </div>

                    {/* Timeline per mese */}
                    <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                      {Array.from(byMonth.entries()).reverse().map(([key, appts]) => {
                        const [yr, mo] = key.split("-");
                        const label = `${mesi[parseInt(mo)-1]} ${yr}`;
                        const done = appts.filter(a=>a.status==="done");
                        const rev  = done.reduce((s,a)=>s+(a.amount??0),0);
                        const maxPerMonth = Math.max(...Array.from(byMonth.values()).map(v=>v.length));
                        const barW = Math.round((appts.length/maxPerMonth)*100);

                        return (
                          <div key={key} style={{ display:"flex", alignItems:"flex-start", gap:14, padding:"10px 0", borderBottom:`1px solid ${THEME.border}` }}>
                            {/* Label mese */}
                            <div style={{ width:70, flexShrink:0, paddingTop:6 }}>
                              <div style={{ fontSize:12, fontWeight:700, color:THEME.text }}>{label}</div>
                              <div style={{ fontSize:10, color:THEME.muted }}>{appts.length} sedute</div>
                            </div>
                            {/* Barra + dot sedute */}
                            <div style={{ flex:1, minWidth:0 }}>
                              {/* Barra progresso */}
                              <div style={{ height:8, background:"rgba(13,148,136,0.1)", borderRadius:4, marginBottom:8, overflow:"hidden" }}>
                                <div style={{ height:"100%", width:`${barW}%`, background:`linear-gradient(90deg,#0d9488,#2563eb)`, borderRadius:4, transition:"width 0.3s" }}/>
                              </div>
                              {/* Dot per ogni seduta */}
                              <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                                {appts.map(a=>{
                                  const d=new Date(a.start_at);
                                  const col=statusC[a.status]??"#94a3b8";
                                  return (
                                    <div key={a.id} title={`${d.toLocaleDateString("it-IT")} ${d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})} — ${a.status}${a.amount?` — €${a.amount}`:""}`}
                                      style={{ width:28, height:28, borderRadius:6, background:`${col}18`, border:`1.5px solid ${col}`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"default" }}>
                                      <span style={{ fontSize:9, fontWeight:700, color:col }}>{d.getDate()}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            {/* Incasso mese */}
                            {rev > 0 && (
                              <div style={{ flexShrink:0, textAlign:"right", paddingTop:4 }}>
                                <div style={{ fontSize:13, fontWeight:800, color:THEME.green }}>€{Math.round(rev)}</div>
                                <div style={{ fontSize:9, color:THEME.muted }}>incassato</div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </section>
        )}

        {/* ── GDPR ──────────────────────────────────────────────────────────── */}
        {activeSection === "gdpr" && (
        <section style={{ ...cardStyle }}>
          <SecHeader
            icon="🔏"
            title="Documenti GDPR"
            subtitle="Genera · stampa · firma · archivia"
            open={secGDPR}
            onToggle={() => setSecGDPR(s => !s)}
            badge={!secGDPR && docs.length > 0
              ? <span style={{ background:"rgba(249,115,22,0.1)", color:THEME.amber, fontWeight:800, fontSize:12, borderRadius:99, padding:"2px 10px", border:"1px solid rgba(249,115,22,0.2)" }}>
                  {docs.length} doc
                </span>
              : undefined}
          />
          {secGDPR && (
          <div style={cardBody}>

            {/* Genera e firma digitale */}
            <div style={{ background: THEME.panelSoft, borderRadius: 10, border: `1px solid ${THEME.border}`, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Genera moduli</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                {/* Informativa Privacy */}
                <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ background: "linear-gradient(135deg, #0d9488, #0891b2)", padding: "8px 12px" }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#fff" }}>📄 Informativa Privacy GDPR</div>
                  </div>
                  <div style={{ padding: "10px 12px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => printConsentDoc("privacy")} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "#0d9488", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>🖨 Stampa (firma a mano)</button>
                    <button onClick={() => setShowConsentModal(true)} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${THEME.teal}`, background: "#fff", color: THEME.teal, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>✍️ Firma su iPad</button>
                  </div>
                </div>
                {/* Consenso trattamento */}
                <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)", padding: "8px 12px" }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#fff" }}>📄 Consenso al trattamento</div>
                  </div>
                  <div style={{ padding: "10px 12px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => printConsentDoc("consenso")} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>🖨 Stampa (firma a mano)</button>
                    <button onClick={() => setShowConsentModal(true)} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid #7c3aed`, background: "#fff", color: "#7c3aed", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>✍️ Firma su iPad</button>
                  </div>
                </div>
              </div>
              <button onClick={() => setShowConsentModal(true)} style={{ width: "100%", padding: "9px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #0d9488, #2563eb)", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                🔏 Firma entrambi su iPad e salva automaticamente
              </button>
            </div>

            {/* Autovalutazione pre-visita (mig. 093) */}
            <div style={{ marginBottom: 16 }}>
              <IntakeSection
                patientId={patientId}
                patientFirstName={patient?.first_name ?? ""}
                patientPhone={patient?.phone ?? null}
                studioId={currentStudio?.id ?? null}
              />
            </div>

            {/* Consensi a distanza (firma via link da casa) */}
            <div style={{ marginBottom: 16 }}>
              <RemoteConsentsSection
                patientId={patientId}
                patientFirstName={patient?.first_name ?? ""}
                patientLastName={patient?.last_name ?? ""}
                patientPhone={patient?.phone ?? null}
                patientBirthDate={patient?.birth_date ?? null}
                studio={currentStudio}
              />
            </div>

            {/* Upload manuale */}
            <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Carica documento firmato (PDF o immagine)</div>
            <div style={{ display: "flex", justifyContent:"flex-end", marginBottom: 8 }}>
              {btnOutline(loadingDocs ? "Aggiorno…" : "Aggiorna", loadDocs, THEME.blue, loadingDocs)}
            </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 16 }} className="tab-grid-2">
            <div>
              <label style={labelStyle}>Tipo documento</label>
              <select value={docType} onChange={e => setDocType(e.target.value as DocType)} style={{ ...inputStyle, marginTop: 6, appearance: "none" as const }}>
                <option value="gdpr_informativa_privacy">GDPR – Informativa Privacy</option>
                <option value="consenso_trattamento">Consenso al trattamento</option>
                <option value="altro">Altro</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>File</label>
              <input type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1 / span 2", display: "flex", justifyContent: "flex-end" }}>
              {btnPrimary(uploading ? "Caricamento…" : "Carica documento", uploadDocument, uploading)}
            </div>
          </div>

          {docs.length === 0 && !loadingDocs ? (
            <div style={{ fontSize: 13, color: THEME.muted, fontWeight: 600 }}>Nessun documento caricato.</div>
          ) : (
            <div style={{ overflow: "hidden", borderRadius: 10, border: `1.5px solid ${THEME.border}` }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Tipo", "File", "Caricato", "Azioni"].map(h => (
                      <th key={h} style={tableHeaderStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d, idx) => (
                    <tr key={d.id} style={{ background: idx % 2 === 0 ? "#fff" : THEME.panelSoft, borderBottom: `1px solid ${THEME.border}` }}>
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: THEME.text, fontSize: 13 }}>{docTypeLabel(d.doc_type)}</td>
                      <td style={{ padding: "12px 14px", color: THEME.textSoft, fontSize: 13 }}>{d.file_name}</td>
                      <td style={{ padding: "12px 14px", color: THEME.muted, fontSize: 12 }}>{new Date(d.uploaded_at).toLocaleString("it-IT")}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          {btnOutline("Apri", () => openDocument(d))}
                          <button onClick={() => deleteDocument(d)} style={{
                            padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${THEME.red}`,
                            background: "rgba(220,38,38,0.06)", color: THEME.red, fontWeight: 700, fontSize: 13, cursor: "pointer",
                          }}>Elimina</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
          )}
        </section>
        )}

          </div>
          {/* fine colonna contenuto */}
        </div>
        {/* fine .patient-layout */}

        <WeeklyReminderDialog
          open={weeklyReminderOpen}
          onClose={() => setWeeklyReminderOpen(false)}
          patientId={patientId as string}
          patientFirstName={firstName || (patient?.first_name ?? "")}
          patientPhone={phone || patient?.phone || null}
          appointments={appointments.map(a => ({
            patient_id: patientId as string,
            start: new Date(a.start_at),
            end: new Date(a.end_at),
            status: a.status,
          }))}
          template={weeklyReminderTemplate}
          signatureName={getStudioBranding(currentStudio).signatureName}
          signatureTitle={getStudioBranding(currentStudio).signatureTitle}
        />

        {/* Attestato di presenza cumulativo (mig. 034 + Step 5) */}
        {aiBriefingOpen && (
        <AiBriefingModal
          open={aiBriefingOpen}
          onClose={() => setAiBriefingOpen(false)}
          patientId={patient.id}
          patientName={privacyMode ? maskName(patient) : `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim()}
        />
      )}
      {aiLetterOpen && (
        <AiLetterModal
          open={aiLetterOpen}
          onClose={() => setAiLetterOpen(false)}
          patientId={patient.id}
          patientName={`${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim()}
        />
      )}
      {showCertDialog && (
          <AttendanceCertificateDialog
            patientId={patientId as string}
            patientFirstName={firstName || (patient?.first_name ?? "")}
            patientLastName={lastName || (patient?.last_name ?? "")}
            appointments={appointments.map(a => ({
              id: a.id,
              start_at: a.start_at,
              status: a.status,
              treatment_type: null,
            }))}
            onClose={() => setShowCertDialog(false)}
          />
        )}

      </main>
    </div>
  );
}
