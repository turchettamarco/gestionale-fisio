"use client";

import Link from "next/link";

// ═══════════════════════════════════════════════════════════════════════════
// DOMICILI COOPERATIVE — pagina UNIFICATA (desktop + mobile, useIsMobile)
// ═══════════════════════════════════════════════════════════════════════════
//
// Sezione COMPLETAMENTE ISOLATA dal resto del gestionale: i pazienti PAI
// delle cooperative (Santa Lucia, CRN, ...) NON entrano in anagrafica,
// report, contabilità né Sistema TS. Tabelle dedicate (mig. 055).
//
// COSA FA:
//   • viste calendario GIORNO / SETTIMANA / MESE (desktop e mobile);
//   • vista PAZIENTI: tabella completa su desktop, card su mobile,
//     con paese (città) sempre visibile;
//   • spunta accessi (fatto/saltato), contatore n/tot con progressivo;
//   • contatore IMPOSTABILE (manuale o automatico a fine giornata);
//   • nuovo paziente da FOTO del Modulo PAI (AI) o manuale;
//   • report settimanale a schermo + PDF; PLANNER settimanale PDF
//     (giro visite con orari, paesi e telefoni);
//   • generatore MESSAGGIO accessi per il gruppo WhatsApp della
//     cooperativa (template Santa Lucia) con copia negli appunti.
//
// STILE (regola di progetto): piatto, bordi neutri grigi, NIENTE bordi
// colorati con glow/gradienti "stile AI". Il colore della cooperativa
// compare solo come pallino, badge o barra laterale sottile.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { usePrivacyMode, usePrivacyDisplay, useDisplayPatientPhone } from "@/src/contexts/PrivacyModeContext";
import AppNavbar from "@/src/components/AppNavbar";
import MobileTabBar from "@/src/components/MobileTabBar";
import { useIsMobile } from "@/src/hooks/useIsMobile";
import { Icon } from "@/src/components/icons";
import { ToastProvider, showToast } from "@/src/components/mobile/ToastProvider";
import PaiPatientModal from "./components/PaiPatientModal";
import ReportSettimanale from "./components/ReportSettimanale";
import {
  Cooperative, CoopPatient, CoopAccess, CounterMode, PatientCounters,
  COOP_PRESETS, COOP_COLOR_CHOICES, DOW_LABELS, DOW_LABELS_FULL,
  localISO, parseISODate, addDays, mondayOf, fmtShort, fmtIT, fmtWeekRange,
  fmtDayLong, fmtMonthYear, normTime, daysUntil, computeCounters, ageFrom,
  generateAccessDates,
} from "@/src/lib/domicili/types";

// ─── Theme (piatto, alto contrasto) ──────────────────────────────────────────
// helper: tinta chiara del colore cooperativa (card colorata leggibile)
function coopTint(hex: string, alpha = 0.12): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#F1F5F9";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const THEME = {
  appBg: "#FAF7F2", panelBg: "#ffffff", panelSoft: "#FFFDF9",
  text: "#0f172a", textSoft: "#1e293b",
  muted: "#334155",        // descrizioni / testo secondario importante
  mutedLight: "#475569",   // testo secondario
  label: "#64748b",        // micro-label uppercase
  placeholder: "#94a3b8",  // SOLO placeholder / disabilitati
  border: "#cbd5e1", borderSoft: "#e2e8f0",
  blue: "#2563eb", green: "#16a34a", teal: "#0d9488", tealDark: "#0f766e",
  red: "#dc2626", amber: "#b45309",
};

type AccessesLite = { coop_patient_id: string; data: string; stato: string };
type CalView = "giorno" | "settimana" | "mese";

// ─── Range visibile per vista ────────────────────────────────────────────────
function viewRange(view: CalView, anchor: Date): { from: Date; to: Date } {
  if (view === "mese") {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12);
    return { from: mondayOf(first), to: addDays(mondayOf(last), 5) };
  }
  const m = mondayOf(anchor);
  return { from: m, to: addDays(m, 5) };
}

// ─── Planner settimanale PDF (giro visite) ───────────────────────────────────
async function generatePlannerPdf(opts: {
  weekStart: Date;
  coop: Cooperative | null;
  patientById: Map<string, CoopPatient>;
  accesses: CoopAccess[];   // già filtrati a settimana + perimetro
  coopById?: Map<string, Cooperative>;
}) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  // Vista SETTIMANALE: griglia 6 colonne (Lun–Sab), una visita per cella.
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const days = Array.from({ length: 6 }, (_, i) => addDays(opts.weekStart, i));
  const DOW_FULL = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

  const perDay = days.map(d => {
    const iso = localISO(d);
    return opts.accesses
      .filter(a => a.data === iso && a.stato !== "saltato")
      .sort((a, b) => {
        const oa = a.ordine, ob = b.ordine;
        if (oa != null && ob != null && oa !== ob) return oa - ob;
        if (oa != null && ob == null) return -1;
        if (oa == null && ob != null) return 1;
        return (a.orario || "99:99").localeCompare(b.orario || "99:99");
      });
  });
  const totWeek = perDay.reduce((s, l) => s + l.length, 0);

  // Intestazione
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(`Planner settimana — ${opts.coop ? opts.coop.nome : "Tutte le cooperative"}`, 10, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(fmtWeekRange(opts.weekStart), 10, 19);
  doc.text(`${totWeek} accessi`, pageW - 10, 13, { align: "right" });
  doc.text(`Generato il ${new Date().toLocaleDateString("it-IT")}`, pageW - 10, 19, { align: "right" });

  // Griglia: intestazioni giorno, poi una riga per "slot" (i-esima visita del giorno)
  const maxN = Math.max(1, ...perDay.map(l => l.length));
  const head = [days.map((d, i) => `${DOW_FULL[i]} ${d.getDate()}   ·   ${perDay[i].length}`)];
  const body = Array.from({ length: maxN }, (_, r) =>
    days.map((_, i) => {
      const a = perDay[i][r];
      if (!a) return "";
      const p = opts.patientById.get(a.coop_patient_id);
      if (!p) return "";
      const line2 = [a.orario || "", p.citta || ""].filter(Boolean).join("  ·  ");
      return `${p.cognome.toUpperCase()} ${p.nome}${line2 ? "\n" + line2 : ""}`;
    })
  );

  autoTable(doc, {
    startY: 24,
    head, body,
    theme: "grid",
    styles: {
      font: "helvetica", fontSize: 8.5, cellPadding: { top: 2.5, bottom: 2.5, left: 2.5, right: 2 },
      valign: "top", textColor: [15, 23, 42],
      lineColor: [148, 163, 184], lineWidth: 0.15,
      minCellHeight: 11,
    },
    headStyles: {
      fillColor: [13, 148, 136], textColor: [255, 255, 255],
      fontStyle: "bold", fontSize: 9, halign: "left",
      lineColor: [13, 148, 136], lineWidth: 0.15,
      cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2 },
    },
    alternateRowStyles: { fillColor: [250, 250, 249] },
    margin: { left: 10, right: 10 },
    didParseCell: (data: any) => {
      // prima riga della cella (nome) più marcata la rendiamo col fontStyle bold globale?
      // autoTable non mixa stili nella cella: usiamo bold sull'intera cella
      if (data.section === "body" && data.cell.raw) data.cell.styles.fontStyle = "bold";
    },
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("FisioHub — Domicili Cooperative", 10, pageH - 6);
    doc.text(`Pagina ${i} di ${pageCount}`, pageW - 10, pageH - 6, { align: "right" });
  }

  const slug = (opts.coop?.nome || "tutte").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  doc.save(`planner-settimana-${slug}-${localISO(opts.weekStart)}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════════════

export default function DomiciliPage() {
  return (
    <ToastProvider>
      <DomiciliInner />
    </ToastProvider>
  );
}

/* ─── Griglia settimana mobile: identica all'agenda del calendario ─── */
const DW_HOUR_PX  = 44;   // altezza di 1 ora
const DW_H_START  = 7;    // prima ora visibile
const DW_H_END    = 20;   // ultima ora visibile
const DW_GUTTER   = 24;   // colonna orari a sinistra
const DW_SNAP_MIN = 60;   // snap del drag: uno slot da 1 ora
const DW_SLOT_MIN = 60;   // durata visiva di un accesso: 1 ora piena
const DW_BASE_MIN = (8 - DW_H_START) * 60; // 08:00: da qui partono gli accessi senza orario

function hhmmToMin(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function minToHHMM(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/* ─── Navigazione e chiamate ─────────────────────────────────────────────── */
function addrOf(p: { residenza: string | null; citta: string | null } | undefined): string | null {
  if (!p) return null;
  const a = [p.residenza, p.citta].filter(Boolean).join(", ").trim();
  return a || null;
}
function mapsSearchUrl(p: { residenza: string | null; citta: string | null } | undefined): string | null {
  const a = addrOf(p);
  return a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` : null;
}
function telHref(recapiti: string | null | undefined): string | null {
  if (!recapiti) return null;
  const m = recapiti.match(/\+?\d[\d\s./-]{5,}\d/);
  return m ? `tel:${m[0].replace(/[^\d+]/g, "")}` : null;
}
/** URL Google Maps con il giro completo del giorno (max 10 tappe, limite di Maps). */
function giroMapsUrl(addrs: string[]): { url: string; tagliate: number } | null {
  const stops = addrs.filter(Boolean);
  if (!stops.length) return null;
  const usable = stops.slice(0, 10);
  const dest = usable[usable.length - 1];
  const way = usable.slice(0, -1);
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}` +
    (way.length ? `&waypoints=${way.map(encodeURIComponent).join("|")}` : "") + `&travelmode=driving`;
  return { url, tagliate: stops.length - usable.length };
}

function DomiciliInner() {
  const isMobile = useIsMobile();
  const { studio } = useCurrentStudio();
  const studioId = studio?.id || null;

  const { privacyMode } = usePrivacyMode();
  const { maskName } = usePrivacyDisplay();
  const displayPhone = useDisplayPatientPhone();
  const displayName = useCallback(
    (full: string) => (privacyMode ? maskName(full) : full),
    [privacyMode, maskName]
  );

  // Notifiche: toast su mobile, alert su desktop (stessa convenzione di noleggio)
  const notify = {
    success: (m: string) => { if (isMobile) showToast.success(m); else alert(m); },
    error:   (m: string) => { if (isMobile) showToast.error(m);   else alert(m); },
    warning: (m: string) => { if (isMobile) showToast.warning(m); else alert(m); },
    info:    (m: string) => { if (isMobile) showToast.info(m);    else alert(m); },
  };

  // ─── Stato dati ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [cooperatives, setCooperatives] = useState<Cooperative[]>([]);
  const [patients, setPatients] = useState<CoopPatient[]>([]);
  const [rangeAccesses, setRangeAccesses] = useState<CoopAccess[]>([]);
  const [allLite, setAllLite] = useState<AccessesLite[]>([]);
  const [chiusure, setChiusure] = useState<{ id: string; data_da: string; data_a: string; motivo: string | null }[]>([]);
  const [ferieForm, setFerieForm] = useState<{ da: string; a: string }>({ da: "", a: "" });
  const [counterMode, setCounterMode] = useState<CounterMode>("manuale");

  // ─── Stato UI ────────────────────────────────────────────────────────────
  const [selectedCoopId, setSelectedCoopId] = useState<string>("all");
  const [calView, setCalView] = useState<CalView>("settimana");
  const [mainView, setMainView] = useState<"calendario" | "pazienti">("calendario"); // desktop
  const [mobileView, setMobileView] = useState<"agenda" | "pazienti">("agenda");
  const [anchor, setAnchor] = useState<Date>(() => {
    const t = new Date();
    const base = t.getDay() === 0 ? addDays(t, 1) : t; // domenica → lunedì
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12);
  });
  const [showConclusi, setShowConclusi] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [docSheet, setDocSheet] = useState(false); // mobile: foglio Report/Planner/Messaggio

  // Modali
  const [patientModal, setPatientModal] = useState<{ open: boolean; patient: CoopPatient | null; startWithPhoto: boolean }>({ open: false, patient: null, startWithPhoto: false });
  const [reportOpen, setReportOpen] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [coopModal, setCoopModal] = useState<{ open: boolean; coop: Cooperative | null }>({ open: false, coop: null });
  const [addAccess, setAddAccess] = useState<{ open: boolean; dayISO: string }>({ open: false, dayISO: "" });

  const todayISO = localISO(new Date());
  const weekStart = useMemo(() => mondayOf(anchor), [anchor]);

  // ─── Caricamento dati ────────────────────────────────────────────────────

  const loadRange = useCallback(async (sid: string, view: CalView, anchorD: Date) => {
    const { from, to } = viewRange(view, anchorD);
    const { data, error } = await supabase
      .from("coop_accesses").select("*")
      .eq("studio_id", sid).gte("data", localISO(from)).lte("data", localISO(to))
      .order("data");
    if (!error) {
      setRangeAccesses((data || []).map(a => ({ ...a, orario: normTime(a.orario) })) as CoopAccess[]);
    }
  }, []);

  const loadAll = useCallback(async (sid: string) => {
    setLoading(true);

    const [coopsRes, patsRes, setRes, chiusRes] = await Promise.all([
      supabase.from("cooperatives").select("*").eq("studio_id", sid).order("created_at"),
      supabase.from("coop_patients").select("*").eq("studio_id", sid).order("cognome"),
      supabase.from("domicili_settings").select("counter_mode").eq("studio_id", sid).maybeSingle(),
      supabase.from("domicili_chiusure").select("id, data_da, data_a, motivo").eq("studio_id", sid).order("data_da"),
    ]);

    const mode: CounterMode = (setRes.data?.counter_mode as CounterMode) || "manuale";
    setCounterMode(mode);
    setCooperatives((coopsRes.data || []) as Cooperative[]);
    setChiusure((chiusRes.data || []) as any[]);
    setPatients((patsRes.data || []).map(p => ({ ...p, giorni_orari: p.giorni_orari || [] })) as CoopPatient[]);

    // Catch-up automatico: i pianificati dei giorni passati diventano "fatto"
    if (mode === "automatico") {
      await supabase.from("coop_accesses")
        .update({ stato: "fatto", fatto_alle: new Date().toISOString() })
        .eq("studio_id", sid).eq("stato", "pianificato").lt("data", todayISO);
    }

    const { data: lite } = await supabase
      .from("coop_accesses").select("coop_patient_id, data, stato")
      .eq("studio_id", sid);
    setAllLite((lite || []) as AccessesLite[]);

    setLoading(false);
  }, [todayISO]);

  // Insieme di tutte le date chiuse (espande i periodi ferie giorno per giorno)
  const closedDatesSet = useMemo(() => {
    const s = new Set<string>();
    for (const c of chiusure) {
      let d = parseISODate(c.data_da);
      const end = parseISODate(c.data_a);
      while (d.getTime() <= end.getTime()) { s.add(localISO(d)); d = addDays(d, 1); }
    }
    return s;
  }, [chiusure]);

  useEffect(() => {
    if (!studioId) return;
    loadAll(studioId);
  }, [studioId, loadAll]);

  useEffect(() => {
    if (!studioId) return;
    loadRange(studioId, calView, anchor);
  }, [studioId, calView, anchor, loadRange]);

  const refreshAll = useCallback(() => {
    if (!studioId) return;
    loadAll(studioId);
    loadRange(studioId, calView, anchor);
  }, [studioId, calView, anchor, loadAll, loadRange]);

  // ─── Derivati ────────────────────────────────────────────────────────────

  const coopById = useMemo(() => {
    const m = new Map<string, Cooperative>();
    cooperatives.forEach(c => m.set(c.id, c));
    return m;
  }, [cooperatives]);

  const selectedCoop: Cooperative | null =
    selectedCoopId === "all" ? null : coopById.get(selectedCoopId) || null;

  const scopePatients = useMemo(() =>
    patients.filter(p =>
      (selectedCoopId === "all" || p.cooperative_id === selectedCoopId) &&
      (showConclusi || p.stato !== "concluso")
    ), [patients, selectedCoopId, showConclusi]);

  const patientById = useMemo(() => {
    const m = new Map<string, CoopPatient>();
    patients.forEach(p => m.set(p.id, p));
    return m;
  }, [patients]);

  const countersByPatient = useMemo(() => {
    const grouped = new Map<string, AccessesLite[]>();
    allLite.forEach(a => {
      const arr = grouped.get(a.coop_patient_id) || [];
      arr.push(a);
      grouped.set(a.coop_patient_id, arr);
    });
    const m = new Map<string, PatientCounters>();
    patients.forEach(p => m.set(p.id, computeCounters(p, (grouped.get(p.id) || []) as any)));
    return m;
  }, [allLite, patients]);

  /** progressivo n° dell'accesso: chiave "pid|data" → indice tra i non saltati */
  const progressivo = useMemo(() => {
    const inizioByPid = new Map(patients.map(p => [p.id, p.data_attivazione || null]));
    const grouped = new Map<string, AccessesLite[]>();
    allLite.forEach(a => {
      const inizio = inizioByPid.get(a.coop_patient_id);
      if (inizio && a.data < inizio) return; // ciclo precedente (rinnovo): non conta
      const arr = grouped.get(a.coop_patient_id) || [];
      arr.push(a);
      grouped.set(a.coop_patient_id, arr);
    });
    const m = new Map<string, number>();
    grouped.forEach((arr, pid) => {
      arr.filter(a => a.stato !== "saltato")
        .sort((a, b) => a.data.localeCompare(b.data))
        .forEach((a, i) => m.set(`${pid}|${a.data}`, i + 1));
    });
    return m;
  }, [allLite, patients]);

  /** Accessi del range visibile, nel perimetro, raggruppati per giorno ISO. */
  const accByDay = useMemo(() => {
    const scopeIds = new Set(scopePatients.map(p => p.id));
    const m = new Map<string, CoopAccess[]>();
    rangeAccesses.forEach(a => {
      if (!scopeIds.has(a.coop_patient_id)) return;
      const arr = m.get(a.data) || [];
      arr.push(a);
      m.set(a.data, arr);
    });
    m.forEach(arr => arr.sort((a, b) => {
      // 1) ordine manuale (scaletta) se impostato su entrambi
      const oa = a.ordine, ob = b.ordine;
      if (oa != null && ob != null && oa !== ob) return oa - ob;
      if (oa != null && ob == null) return -1;
      if (oa == null && ob != null) return 1;
      // 2) altrimenti per orario
      const ta = a.orario || "99:99", tb = b.orario || "99:99";
      if (ta !== tb) return ta.localeCompare(tb);
      const pa = patientById.get(a.coop_patient_id), pb = patientById.get(b.coop_patient_id);
      return (pa?.cognome || "").localeCompare(pb?.cognome || "");
    }));
    return m;
  }, [rangeAccesses, scopePatients, patientById]);

  const weekDays = useMemo(
    () => Array.from({ length: 6 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const monthWeeks = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12);
    const start = mondayOf(first);
    const weeks: Date[][] = [];
    for (let w = new Date(start); w.getTime() <= last.getTime(); w = addDays(w, 7)) {
      weeks.push(Array.from({ length: 6 }, (_, i) => addDays(w, i)));
    }
    return weeks;
  }, [anchor]);

  // Conteggio ACCESSI (non ore): per giorno, settimana visibile, mese corrente.
  const accessCounts = useMemo(() => {
    const perDay = new Map<string, number>();
    accByDay.forEach((arr, iso) => perDay.set(iso, arr.filter(a => a.stato !== "saltato").length));
    const weekTot = weekDays.reduce((s, d) => s + (perDay.get(localISO(d)) || 0), 0);
    // mese: somma su tutti i giorni del mese corrente presenti nel range caricato
    const y = anchor.getFullYear(), mo = anchor.getMonth();
    let monthTot = 0;
    perDay.forEach((n, iso) => { const dt = parseISODate(iso); if (dt.getFullYear() === y && dt.getMonth() === mo) monthTot += n; });
    return { perDay, weekTot, monthTot };
  }, [accByDay, weekDays, anchor]);

  const calTitle =
    calView === "giorno" ? fmtDayLong(anchor)
    : calView === "settimana" ? fmtWeekRange(weekStart)
    : fmtMonthYear(anchor);

  // ─── Navigazione ─────────────────────────────────────────────────────────

  const stepDesktop = (dir: 1 | -1) => setAnchor(a => {
    if (calView === "giorno") return addDays(a, dir);
    if (calView === "settimana") return addDays(a, 7 * dir);
    return new Date(a.getFullYear(), a.getMonth() + dir, 1, 12);
  });
  const stepMobile = (dir: 1 | -1) => setAnchor(a => {
    if (calView === "mese") return new Date(a.getFullYear(), a.getMonth() + dir, 1, 12);
    return addDays(a, 7 * dir); // giorno (strip) e settimana si muovono a settimane
  });
  const goToday = () => {
    const t = new Date();
    const base = t.getDay() === 0 ? addDays(t, 1) : t;
    setAnchor(new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12));
  };

  // ─── Mutazioni accessi ───────────────────────────────────────────────────

  const patchLocal = (id: string, patch: Partial<CoopAccess>) => {
    setRangeAccesses(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  };
  const patchLite = (pid: string, dataISO: string, stato: string | null) => {
    setAllLite(prev => {
      if (stato === null) return prev.filter(a => !(a.coop_patient_id === pid && a.data === dataISO));
      const found = prev.some(a => a.coop_patient_id === pid && a.data === dataISO);
      if (!found) return [...prev, { coop_patient_id: pid, data: dataISO, stato }];
      return prev.map(a => a.coop_patient_id === pid && a.data === dataISO ? { ...a, stato } : a);
    });
  };

  // ─── Chiusure / Ferie ────────────────────────────────────────────────────
  // Ricalcola i futuri pianificati di TUTTI i pazienti coinvolti, saltando i
  // giorni chiusi (gli accessi slittano al primo giorno-fisso utile).
  const ricalcolaConChiusure = async (sid: string, closed: Set<string>) => {
    const todayISOx = localISO(new Date());
    // per ogni paziente attivo con giorni fissi, rigenera i pianificati futuri
    for (const p of patients) {
      if (p.stato !== "attivo") continue;
      if (!p.giorni_orari || p.giorni_orari.length === 0) continue;
      // accessi esistenti del paziente
      const { data: exist } = await supabase
        .from("coop_accesses").select("id, data, stato")
        .eq("coop_patient_id", p.id);
      const rows = (exist || []) as { id: string; data: string; stato: string }[];
      // cancella i pianificati futuri (li rigeneriamo saltando le chiusure)
      const toDelete = rows.filter(a => a.stato === "pianificato" && a.data >= todayISOx);
      if (toDelete.length > 0) {
        await supabase.from("coop_accesses").delete().in("id", toDelete.map(a => a.id));
      }
      // "keep": fatti + saltati + eventuali pianificati passati
      const keep = rows.filter(a => !(a.stato === "pianificato" && a.data >= todayISOx));
      const dates = generateAccessDates(
        { giorni_orari: p.giorni_orari, data_attivazione: p.data_attivazione, data_scadenza: p.data_scadenza, tot_accessi: p.tot_accessi },
        keep, undefined, closed,
      );
      const futuri = dates.filter(d => d.data >= todayISOx && d.stato === "pianificato");
      if (futuri.length > 0) {
        await supabase.from("coop_accesses").insert(
          futuri.map(d => ({ studio_id: sid, coop_patient_id: p.id, data: d.data, orario: d.orario, stato: "pianificato" }))
        );
      }
    }
  };

  const addChiusura = async (dataDa: string, dataA: string, motivo: string) => {
    if (!studioId) return;
    const { data: ins, error } = await supabase.from("domicili_chiusure")
      .insert({ studio_id: studioId, data_da: dataDa, data_a: dataA, motivo: motivo || null })
      .select("id, data_da, data_a, motivo").single();
    if (error) { notify.error("Errore salvataggio chiusura"); return; }
    // aggiorna set locale e ricalcola
    const newChiusure = [...chiusure, ins as any];
    setChiusure(newChiusure);
    const closed = new Set<string>();
    for (const c of newChiusure) {
      let d = parseISODate(c.data_da); const end = parseISODate(c.data_a);
      while (d.getTime() <= end.getTime()) { closed.add(localISO(d)); d = addDays(d, 1); }
    }
    notify.info("Ricalcolo accessi in corso…");
    await ricalcolaConChiusure(studioId, closed);
    await loadAll(studioId);
    loadRange(studioId, calView, anchor);
    notify.success("Chiusura salvata e accessi ricalcolati");
  };

  const removeChiusura = async (id: string) => {
    if (!studioId) return;
    await supabase.from("domicili_chiusure").delete().eq("id", id);
    const newChiusure = chiusure.filter(c => c.id !== id);
    setChiusure(newChiusure);
    const closed = new Set<string>();
    for (const c of newChiusure) {
      let d = parseISODate(c.data_da); const end = parseISODate(c.data_a);
      while (d.getTime() <= end.getTime()) { closed.add(localISO(d)); d = addDays(d, 1); }
    }
    await ricalcolaConChiusure(studioId, closed);
    await loadAll(studioId);
    loadRange(studioId, calView, anchor);
    notify.success("Chiusura rimossa");
  };

  const toggleGiornoChiuso = async (dayISO: string) => {
    const existing = chiusure.find(c => c.data_da === dayISO && c.data_a === dayISO);
    if (existing) { await removeChiusura(existing.id); }
    else { await addChiusura(dayISO, dayISO, "Chiuso"); }
  };

  // ── Spunte offline-safe ──────────────────────────────────────────────────
  // Dentro casa di un paziente il segnale spesso non c'è: la spunta viene
  // salvata subito in locale, messa in coda, e sincronizzata al ritorno
  // della rete. Ultima scrittura vince (una sola op in coda per accesso).
  type PendingOp = { accessId: string; patch: { stato: "fatto" | "saltato" | "pianificato"; fatto_alle: string | null }; tries: number };
  const PENDING_KEY = "domicili_pending_sync";
  const [pendingCount, setPendingCount] = useState(0);
  const flushingRef = useRef(false);

  const readPending = (): PendingOp[] => {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); } catch { return []; }
  };
  const writePending = (ops: PendingOp[]) => {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(ops)); } catch {}
    setPendingCount(ops.length);
  };
  const queuePending = (accessId: string, patch: PendingOp["patch"]) => {
    const ops = readPending().filter(o => o.accessId !== accessId);
    ops.push({ accessId, patch, tries: 0 });
    writePending(ops);
  };
  const isNetworkError = (e: { message?: string } | null) =>
    !!e?.message && /fetch|network|internet|connessione/i.test(e.message);

  const flushPending = useCallback(async () => {
    if (flushingRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    let ops = readPending();
    if (!ops.length) return;
    flushingRef.current = true;
    try {
      for (const op of [...ops]) {
        const { error } = await supabase.from("coop_accesses").update(op.patch).eq("id", op.accessId);
        if (!error) {
          ops = ops.filter(o => o.accessId !== op.accessId);
          writePending(ops);
        } else if (isNetworkError(error)) {
          break; // ancora offline: riprovo al prossimo giro
        } else {
          op.tries += 1;
          if (op.tries >= 5) {
            ops = ops.filter(o => o.accessId !== op.accessId);
            notify.error("Una spunta non è stata sincronizzata");
          }
          writePending(ops);
        }
      }
      if (!readPending().length) refreshAll(); // riallinea dopo il recupero
    } finally {
      flushingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshAll]);

  useEffect(() => {
    setPendingCount(readPending().length);
    void flushPending();
    const onOnline = () => { void flushPending(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flushPending]);

  const applyStatoPatch = async (a: CoopAccess, patch: PendingOp["patch"]) => {
    patchLocal(a.id, patch);
    patchLite(a.coop_patient_id, a.data, patch.stato);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      queuePending(a.id, patch);
      notify.warning("Offline: spunta salvata, sincronizzo appena torna la rete");
      return;
    }
    const { error } = await supabase.from("coop_accesses").update(patch).eq("id", a.id);
    if (!error) return;
    if (isNetworkError(error)) {
      queuePending(a.id, patch);
      notify.warning("Offline: spunta salvata, sincronizzo appena torna la rete");
    } else {
      notify.error("Errore salvataggio");
      refreshAll();
    }
  };

  const toggleFatto = async (a: CoopAccess) => {
    const toFatto = a.stato !== "fatto";
    await applyStatoPatch(a, toFatto
      ? { stato: "fatto", fatto_alle: new Date().toISOString() }
      : { stato: "pianificato", fatto_alle: null });
  };

  const setSaltato = async (a: CoopAccess) => {
    const toSaltato = a.stato !== "saltato";
    setMenuFor(null);
    await applyStatoPatch(a, toSaltato
      ? { stato: "saltato", fatto_alle: null }
      : { stato: "pianificato", fatto_alle: null });
  };

  // ── Drag & Drop: spostamento e riordino accessi ──
  const [dragAccessId, setDragAccessId] = useState<string | null>(null);
  // Drag touch: la card VERA viene clonata e segue il dito (come il calendario).
  const [touchOverDay, setTouchOverDay] = useState<string | null>(null);
  const [touchOverCardId, setTouchOverCardId] = useState<string | null>(null);
  const [touchOverAfter, setTouchOverAfter] = useState(false);
  // Riga di inserimento: sopra o sotto la card bersaglio (neutra, niente glow)
  const dropIndicator = (id: string) =>
    touchOverCardId === id ? (touchOverAfter ? "inset 0 -3px 0 #334155" : "inset 0 3px 0 #334155") : "none";
  const ghostElRef = useRef<HTMLElement | null>(null);
  const grabOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const touchBlockerRef = useRef<((ev: TouchEvent) => void) | null>(null);

  // Sposta un accesso in un altro giorno INSERENDOLO in una posizione precisa
  // della scaletta di quel giorno (data + ordine in un colpo solo).
  const moveAccessToPosition = async (accessId: string, newDayISO: string, index: number) => {
    const a = rangeAccesses.find(x => x.id === accessId);
    if (!a) return;
    const fromISO = a.data;
    const ids = (accByDay.get(newDayISO) || []).map(x => x.id).filter(id => id !== accessId);
    ids.splice(Math.max(0, Math.min(index, ids.length)), 0, accessId);
    const orderMap = new Map(ids.map((id, i) => [id, i]));

    // aggiornamento ottimistico
    setRangeAccesses(prev => prev.map(x => {
      if (x.id === accessId) return { ...x, data: newDayISO, ordine: orderMap.get(accessId) ?? 0 };
      return orderMap.has(x.id) ? { ...x, ordine: orderMap.get(x.id)! } : x;
    }));
    if (fromISO !== newDayISO) {
      patchLite(a.coop_patient_id, fromISO, null);
      patchLite(a.coop_patient_id, newDayISO, a.stato);
    }

    const { error } = await supabase.from("coop_accesses")
      .update({ data: newDayISO, ordine: orderMap.get(accessId) ?? 0 })
      .eq("id", accessId);
    if (error) {
      if ((error as any).code === "23505") notify.warning("Questo paziente ha già un accesso in quel giorno");
      else notify.error("Errore spostamento");
      refreshAll();
      return;
    }
    // riallinea la scaletta del giorno di destinazione (RPC atomica, con fallback)
    await persistOrder(ids);
    notify.success("Accesso spostato");
  };

  // ── Drag UNIFICATO ──────────────────────────────────────────────────────
  // Mobile: long-press 350ms (touch). Desktop: afferra col mouse e muovi >6px
  // (Pointer Events — niente HTML5 drag, troppo fragile con React).
  // In entrambi i casi: la card viene CLONATA e segue dito/cursore;
  // elementFromPoint individua il bersaglio (card = riordino, giorno = spostamento).
  const suppressClickRef = useRef(false);
  const touchDragRef = useRef<{
    accessId: string; fromISO: string;
    startX: number; startY: number; lastX: number; lastY: number;
    activated: boolean; timer: any; viaTouch: boolean;
    cardEl: HTMLElement | null;
    overDay: string | null; overCard: string | null;
    overAfter: boolean;           // drop sotto la card bersaglio invece che sopra
  } | null>(null);

  // Badge "Mer 22 · 3ª" che segue il dito (DOM diretto: nessun re-render)
  const dragBadgeRef = useRef<HTMLElement | null>(null);
  // Auto-scroll quando il dito arriva ai bordi dello schermo
  const autoScrollRef = useRef<number | null>(null);
  const lastPtRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const stopAutoScroll = () => {
    if (autoScrollRef.current !== null) { cancelAnimationFrame(autoScrollRef.current); autoScrollRef.current = null; }
  };

  const clearTouchGhost = () => {
    if (ghostElRef.current) { ghostElRef.current.remove(); ghostElRef.current = null; }
    if (dragBadgeRef.current) { dragBadgeRef.current.remove(); dragBadgeRef.current = null; }
  };

  const activateDrag = () => {
    const cur = touchDragRef.current;
    if (!cur || cur.activated || !cur.cardEl) return;
    cur.activated = true;
    setDragAccessId(cur.accessId);
    const rect = cur.cardEl.getBoundingClientRect();
    grabOffsetRef.current = { dx: cur.startX - rect.left, dy: cur.startY - rect.top };
    const clone = cur.cardEl.cloneNode(true) as HTMLElement;
    clone.style.position = "fixed";
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.margin = "0";
    clone.style.zIndex = "3000";
    clone.style.pointerEvents = "none";
    clone.style.opacity = "0.96";
    clone.style.boxShadow = "0 18px 42px rgba(15,23,42,.35)";
    clone.style.transform = "scale(1.02)";
    clone.style.transition = "none";
    document.body.appendChild(clone);
    ghostElRef.current = clone;
    // Badge compatto con giorno + posizione nella scaletta
    const badge = document.createElement("div");
    badge.style.position = "fixed";
    badge.style.zIndex = "3001";
    badge.style.pointerEvents = "none";
    badge.style.background = "#ffffff";
    badge.style.border = "1px solid #cbd5e1";
    badge.style.borderRadius = "8px";
    badge.style.padding = "3px 8px";
    badge.style.fontSize = "11px";
    badge.style.fontWeight = "700";
    badge.style.lineHeight = "1.2";
    badge.style.whiteSpace = "nowrap";
    badge.style.color = "#334155";
    badge.style.boxShadow = "0 2px 8px rgba(15,23,42,0.12)";
    document.body.appendChild(badge);
    dragBadgeRef.current = badge;
    if (cur.viaTouch) {
      // blocca scroll/gesti (listener NON-passive: quello di React è passive)
      const blocker = (ev: TouchEvent) => { ev.preventDefault(); };
      document.addEventListener("touchmove", blocker, { passive: false });
      touchBlockerRef.current = blocker;
      try { (navigator as any).vibrate?.(25); } catch {}
    } else {
      document.body.style.userSelect = "none";
    }
  };

  // Calcola l'indice di inserimento nella scaletta del giorno bersaglio
  const dropIndexFor = (targetISO: string, accessId: string, overCard: string | null, after: boolean) => {
    const ids = (accByDay.get(targetISO) || []).map(x => x.id).filter(id => id !== accessId);
    if (!overCard) return { ids, idx: ids.length };
    const i = ids.indexOf(overCard);
    if (i < 0) return { ids, idx: ids.length };
    return { ids, idx: after ? i + 1 : i };
  };

  const paintDragBadge = (ghostLeft: number, ghostTop: number) => {
    const b = dragBadgeRef.current; const st = touchDragRef.current;
    if (!b || !st) return;
    if (st.overDay) {
      const [yy, mm, dd] = st.overDay.split("-").map(Number);
      const d = new Date(yy, mm - 1, dd, 12);
      const dow = DOW_LABELS[d.getDay() === 0 ? 7 : d.getDay()] || "";
      const { idx } = dropIndexFor(st.overDay, st.accessId, st.overCard, st.overAfter);
      const text = `${dow} ${d.getDate()} · ${idx + 1}ª`;
      if (b.textContent !== text) b.textContent = text;
      b.style.display = "block";
    } else {
      b.style.display = "none";
    }
    const above = ghostTop > 42;
    b.style.left = `${Math.max(6, Math.min(ghostLeft, window.innerWidth - 110))}px`;
    b.style.top = `${above ? ghostTop - 30 : ghostTop + 8}px`;
  };

  const dragMoveTo = (x: number, y: number) => {
    const st = touchDragRef.current;
    if (!st?.activated) return;
    st.lastX = x; st.lastY = y;
    lastPtRef.current = { x, y };
    const gLeft = x - grabOffsetRef.current.dx;
    const gTop = y - grabOffsetRef.current.dy;
    const g = ghostElRef.current;
    if (g) { g.style.left = `${gLeft}px`; g.style.top = `${gTop}px`; }

    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const cardEl = el?.closest?.("[data-access-card]") as HTMLElement | null;
    const dayEl = el?.closest?.("[data-drop-day]") as HTMLElement | null;

    // Ora il riordino vale su QUALSIASI giorno, non solo su quello di partenza
    let overCard: string | null = null;
    let after = false;
    if (cardEl && cardEl.dataset.accessCard !== st.accessId) {
      overCard = cardEl.dataset.accessCard || null;
      const r = cardEl.getBoundingClientRect();
      after = y > r.top + r.height / 2; // metà bassa → inserisci sotto
    }
    // il giorno lo prendo dal contenitore o, in mancanza, dalla card sotto il dito
    const overDay = dayEl?.dataset.dropDay || cardEl?.dataset.accessDay || null;

    const changed = overCard !== st.overCard || overDay !== st.overDay || after !== st.overAfter;
    if (overCard !== st.overCard) { st.overCard = overCard; setTouchOverCardId(overCard); }
    if (overDay !== st.overDay) {
      const dayChanged = overDay !== st.overDay;
      st.overDay = overDay; setTouchOverDay(overDay);
      if (dayChanged && overDay) { try { (navigator as any).vibrate?.(8); } catch {} }
    }
    if (after !== st.overAfter) setTouchOverAfter(after);
    st.overAfter = after;
    paintDragBadge(gLeft, gTop);
    void changed;

    // Auto-scroll ai bordi (la settimana mobile è più alta dello schermo)
    const EDGE = 80, SPEED = 10;
    if (y >= EDGE && y <= window.innerHeight - EDGE) { stopAutoScroll(); return; }
    if (autoScrollRef.current !== null) return;
    const step = () => {
      const s = touchDragRef.current;
      if (!s?.activated) { autoScrollRef.current = null; return; }
      const p = lastPtRef.current;
      const dir = p.y < EDGE ? -1 : p.y > window.innerHeight - EDGE ? 1 : 0;
      if (dir === 0) { autoScrollRef.current = null; return; }
      window.scrollBy(0, dir * SPEED);
      dragMoveTo(p.x, p.y); // ricalcola il bersaglio dopo lo scroll
      if (autoScrollRef.current === null) return; // dragMoveTo ha fermato il loop
      autoScrollRef.current = requestAnimationFrame(step);
    };
    autoScrollRef.current = requestAnimationFrame(step);
  };

  const finishDrag = (commit: boolean) => {
    const st = touchDragRef.current;
    touchDragRef.current = null;
    if (st?.timer) clearTimeout(st.timer);
    stopAutoScroll();
    clearTouchGhost();
    if (touchBlockerRef.current) { document.removeEventListener("touchmove", touchBlockerRef.current); touchBlockerRef.current = null; }
    document.body.style.userSelect = "";
    setDragAccessId(null);
    setTouchOverDay(null);
    setTouchOverCardId(null);
    setTouchOverAfter(false);
    if (!st?.activated) return;
    suppressClickRef.current = true;
    setTimeout(() => { suppressClickRef.current = false; }, 400);
    if (!commit || !st.overDay) return;
    if (st.overDay !== st.fromISO && closedDatesSet.has(st.overDay)) {
      notify.warning("Giorno chiuso: riaprilo dalle Chiusure per spostarci accessi");
      return;
    }
    const { ids, idx } = dropIndexFor(st.overDay, st.accessId, st.overCard, st.overAfter);
    if (st.overDay === st.fromISO) {
      const cur = (accByDay.get(st.fromISO) || []).map(x => x.id);
      ids.splice(idx, 0, st.accessId);
      if (cur.join("|") === ids.join("|")) return; // nessun cambiamento reale
      try { (navigator as any).vibrate?.(24); } catch {}
      reorderInDay(st.fromISO, ids);
    } else {
      try { (navigator as any).vibrate?.(24); } catch {}
      moveAccessToPosition(st.accessId, st.overDay, idx);
    }
  };

  // Cleanup difensivo: se la pagina smonta con un drag attivo
  useEffect(() => () => {
    if (ghostElRef.current) { ghostElRef.current.remove(); ghostElRef.current = null; }
    if (dragBadgeRef.current) { dragBadgeRef.current.remove(); dragBadgeRef.current = null; }
    if (touchBlockerRef.current) { document.removeEventListener("touchmove", touchBlockerRef.current); touchBlockerRef.current = null; }
    if (autoScrollRef.current !== null) { cancelAnimationFrame(autoScrollRef.current); autoScrollRef.current = null; }
    document.body.style.userSelect = "";
  }, []);

  /* ═══ Vista settimana mobile a griglia oraria ═══════════════════════════
     Stessa resa e stesso drag della settimana nel calendario pazienti.
     Chi ha un orario sta al suo orario; chi non ce l'ha occupa il primo
     slot da 30' libero a partire dalle 08:00, seguendo la scaletta.      */
  const dwGridRef = useRef<HTMLDivElement | null>(null);
  const dwDragRef = useRef<{
    accessId: string; fromISO: string;
    startX: number; startY: number;
    activated: boolean; viaTouch: boolean;
    cardEl: HTMLElement | null; timer: any;
    dayIdx: number | null; startMin: number | null;
  } | null>(null);
  const [dwDragId, setDwDragId] = useState<string | null>(null);
  const [dwOver, setDwOver] = useState<{ dayIdx: number; startMin: number } | null>(null);
  const [showSabDw, setShowSabDw] = useState(false);
  // ── Sovrapposizione agenda studio ────────────────────────────────────────
  // Mostra in trasparenza gli appuntamenti del calendario normale, per vedere
  // se un accesso a domicilio si accavalla con una seduta in studio.
  // Parte sempre spento e NON viene persistito.
  const [showStudio, setShowStudio] = useState(false);
  const [studioAppts, setStudioAppts] = useState<{
    id: string; data: string; from: number; to: number; nome: string;
  }[]>([]);

  useEffect(() => {
    if (!showStudio || !studioId) { setStudioAppts([]); return; }
    let annullato = false;
    (async () => {
      const { from, to } = viewRange(calView, anchor);
      const dal = new Date(from); dal.setHours(0, 0, 0, 0);
      const al = new Date(to); al.setHours(23, 59, 59, 999);
      const { data, error } = await supabase.from("appointments")
        .select("id, start_at, end_at, status, patients:patient_id(first_name, last_name)")
        .eq("studio_id", studioId)
        .gte("start_at", dal.toISOString())
        .lte("start_at", al.toISOString())
        .neq("status", "cancelled");
      if (annullato || error || !data) return;
      setStudioAppts(data.map(a => {
        const st = new Date(a.start_at as string);
        const en = new Date(a.end_at as string);
        const pt = a.patients as unknown as { first_name?: string; last_name?: string } | null;
        const full = `${pt?.last_name ?? ""} ${pt?.first_name ?? ""}`.trim();
        return {
          id: a.id as string,
          data: localISO(st),
          from: st.getHours() * 60 + st.getMinutes(),
          to: en.getHours() * 60 + en.getMinutes(),
          nome: full ? displayName(full) : "Studio",
        };
      }));
    })();
    return () => { annullato = true; };
  }, [showStudio, studioId, calView, anchor, displayName]);

  const studioByDay = useMemo(() => {
    const m = new Map<string, typeof studioAppts>();
    studioAppts.forEach(a => { const arr = m.get(a.data) || []; arr.push(a); m.set(a.data, arr); });
    m.forEach(arr => arr.sort((x, y) => x.from - y.from));
    return m;
  }, [studioAppts]);

  // Conflitti: solo per accessi CON orario. Quelli senza orario stanno in slot
  // riempiti d'ufficio dalle 08:00, quindi segnalarli darebbe falsi allarmi.
  const studioConflicts = useCallback((dayISO: string, orario: string | null | undefined) => {
    if (!showStudio || !orario) return [];
    const s = hhmmToMin(orario), e = s + 60;
    return (studioByDay.get(dayISO) || []).filter(x => x.from < e && x.to > s);
  }, [showStudio, studioByDay]);

  // ── Giro del giorno: zone e Maps ─────────────────────────────────────────
  // Rileva quando la scaletta "zigzaga" tra comuni (Pontecorvo → Cassino →
  // Pontecorvo) e offre il raggruppamento per zona. Cambia SOLO l'ordine
  // della scaletta: gli orari impostati non vengono toccati.
  const giroInfo = useCallback((dayISO: string) => {
    const list = accByDay.get(dayISO) || [];
    const seq = list.map(a => (patientById.get(a.coop_patient_id)?.citta || "").trim()).filter(Boolean);
    const compress: string[] = [];
    seq.forEach(c => { if (compress[compress.length - 1] !== c) compress.push(c); });
    const ritorni = Array.from(new Set(compress.filter((c, i) => compress.indexOf(c) < i)));
    const addrs = list.map(a => addrOf(patientById.get(a.coop_patient_id))).filter((x): x is string => !!x);
    return { list, ritorni, giro: giroMapsUrl(addrs) };
  }, [accByDay, patientById]);

  const reorderByZone = async (dayISO: string) => {
    const list = accByDay.get(dayISO) || [];
    if (list.length < 2) return;
    const order: string[] = [];
    const groups = new Map<string, CoopAccess[]>();
    list.forEach(a => {
      const city = (patientById.get(a.coop_patient_id)?.citta || "~senza città").trim();
      if (!groups.has(city)) { groups.set(city, []); order.push(city); }
      groups.get(city)!.push(a);
    });
    const ids = order.flatMap(city =>
      groups.get(city)!
        .slice()
        .sort((x, y) => {
          const mx = x.orario ? hhmmToMin(x.orario) : 9999;
          const my = y.orario ? hhmmToMin(y.orario) : 9999;
          return mx - my || (x.ordine ?? 0) - (y.ordine ?? 0);
        })
        .map(x => x.id));
    const cur = list.map(x => x.id);
    if (cur.join("|") === ids.join("|")) { notify.success("Scaletta già raggruppata per zona"); return; }
    const pos = new Map(ids.map((id, i) => [id, i]));
    setRangeAccesses(prev => prev.map(x => pos.has(x.id) ? { ...x, ordine: pos.get(x.id)! } : x));
    await persistOrder(ids);
    notify.success("Scaletta raggruppata per zona");
  };

  // ── Copia scaletta → prossima settimana ──────────────────────────────────
  // Applica l'ORDINE del giro di questa settimana ai giorni corrispondenti
  // della successiva. Tocca solo la scaletta: niente creazioni, spostamenti
  // di giorno o orari. I pazienti non presenti nella sorgente vanno in coda
  // mantenendo il loro ordine attuale.
  const [copiaBusy, setCopiaBusy] = useState(false);
  const copiaScalettaProssima = async () => {
    if (!studioId || copiaBusy) return;
    const dstMon = addDays(weekStart, 7);
    const dstFrom = localISO(dstMon), dstTo = localISO(addDays(dstMon, 5));
    setCopiaBusy(true);
    try {
      const { data: next, error } = await supabase.from("coop_accesses")
        .select("id, coop_patient_id, data, ordine")
        .eq("studio_id", studioId)
        .gte("data", dstFrom).lte("data", dstTo)
        .order("data").order("ordine");
      if (error) { notify.error("Errore caricamento prossima settimana"); return; }
      const dstByDay = new Map<string, { id: string; coop_patient_id: string; ordine: number | null }[]>();
      (next || []).forEach(a => {
        const arr = dstByDay.get(a.data) || [];
        arr.push(a); dstByDay.set(a.data, arr);
      });
      let toccati = 0;
      for (let i = 0; i < 6; i++) {
        const src = (accByDay.get(localISO(addDays(weekStart, i))) || []).map(a => a.coop_patient_id);
        const dst = dstByDay.get(localISO(addDays(dstMon, i))) || [];
        if (!src.length || dst.length < 2) continue;
        const rank = new Map(src.map((pid, ix) => [pid, ix]));
        const sorted = dst.slice().sort((a, b) => {
          const ra = rank.has(a.coop_patient_id) ? rank.get(a.coop_patient_id)! : 1000 + (a.ordine ?? 0);
          const rb = rank.has(b.coop_patient_id) ? rank.get(b.coop_patient_id)! : 1000 + (b.ordine ?? 0);
          return ra - rb;
        }).map(x => x.id);
        if (dst.map(x => x.id).join("|") === sorted.join("|")) continue;
        await persistOrder(sorted);
        toccati++;
      }
      if (toccati === 0) notify.info("La prossima settimana è già in quest'ordine");
      else notify.success(`Ordine copiato su ${toccati} giorn${toccati === 1 ? "o" : "i"} (${fmtWeekRange(dstMon)})`);
    } finally {
      setCopiaBusy(false);
    }
  };

  // ── Rinnovo PAI in un tocco ──────────────────────────────────────────────
  // Chiude il ciclo attuale (i pianificati dal nuovo inizio in poi vengono
  // rimossi), aggiorna date e budget, rigenera gli accessi con gli stessi
  // giorni/orari. Lo storico fatti/saltati resta consultabile nel calendario
  // e nei consuntivi; i contatori ripartono dal nuovo ciclo.
  const [rinnovaFor, setRinnovaFor] = useState<CoopPatient | null>(null);
  const [rinnAtt, setRinnAtt] = useState("");
  const [rinnScad, setRinnScad] = useState("");
  const [rinnTot, setRinnTot] = useState("");
  const [rinnovaBusy, setRinnovaBusy] = useState(false);

  const openRinnovo = (p: CoopPatient) => {
    const durata = p.data_attivazione && p.data_scadenza
      ? Math.max(14, Math.round((parseISODate(p.data_scadenza).getTime() - parseISODate(p.data_attivazione).getTime()) / 86_400_000))
      : 60;
    setRinnAtt(todayISO);
    setRinnScad(localISO(addDays(parseISODate(todayISO), durata)));
    setRinnTot(p.tot_accessi != null ? String(p.tot_accessi) : "");
    setRinnovaFor(p);
  };

  const doRinnovo = async () => {
    const p = rinnovaFor;
    if (!p || !studioId || !rinnAtt) return;
    setRinnovaBusy(true);
    try {
      // 1) via i pianificati del vecchio ciclo dal nuovo inizio in poi
      await supabase.from("coop_accesses").delete()
        .eq("coop_patient_id", p.id).eq("stato", "pianificato").gte("data", rinnAtt);
      // 2) nuovo ciclo sul paziente
      const patch = {
        data_attivazione: rinnAtt,
        data_scadenza: rinnScad || null,
        tot_accessi: rinnTot ? Math.max(1, parseInt(rinnTot, 10) || 0) : null,
        stato: "attivo" as const,
      };
      const { error: e1 } = await supabase.from("coop_patients").update(patch).eq("id", p.id);
      if (e1) { notify.error("Errore rinnovo"); return; }
      // 3) rigenera gli accessi (stessi giorni/orari, salta le chiusure)
      const gen = generateAccessDates({ ...p, ...patch }, [], parseISODate(rinnAtt), closedDatesSet);
      if (gen.length) {
        const inCoda = new Map<string, number>();
        allLite.forEach(a => { if (a.data >= rinnAtt) inCoda.set(a.data, (inCoda.get(a.data) || 0) + 1); });
        const rows = gen.map(g => ({
          studio_id: studioId, coop_patient_id: p.id, data: g.data, orario: g.orario,
          stato: g.stato, fatto_alle: g.stato === "fatto" ? new Date().toISOString() : null,
          ordine: inCoda.get(g.data) ?? 0,
        }));
        const { error: e2 } = await supabase.from("coop_accesses")
          .upsert(rows, { onConflict: "coop_patient_id,data", ignoreDuplicates: true });
        if (e2) notify.error("Alcuni accessi non sono stati rigenerati");
      }
      notify.success(`PAI rinnovato: ${gen.length} accessi in agenda`);
      setRinnovaFor(null);
      refreshAll();
    } finally {
      setRinnovaBusy(false);
    }
  };

  const rinnovoModal = rinnovaFor && (
    <div onClick={() => !rinnovaBusy && setRinnovaFor(null)} style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1200,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 18,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 16, border: `1px solid ${THEME.border}`,
        width: "100%", maxWidth: 400, padding: "18px 18px 16px",
      }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: THEME.text }}>
          Rinnova PAI — {displayName(`${rinnovaFor.cognome} ${rinnovaFor.nome}`)}
        </div>
        <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, margin: "6px 0 14px" }}>
          Chiude il ciclo attuale e rigenera gli accessi con gli stessi giorni e orari.
          Lo storico resta consultabile; i contatori ripartono da zero.
        </div>
        {([
          ["Nuova attivazione", rinnAtt, setRinnAtt, "date", true],
          ["Nuova scadenza", rinnScad, setRinnScad, "date", false],
          ["Totale accessi", rinnTot, setRinnTot, "number", false],
        ] as const).map(([label, val, set, type, req]) => (
          <label key={label} style={{ display: "block", marginBottom: 10 }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 3 }}>
              {label}{req ? "" : " (opzionale)"}
            </span>
            <input type={type} value={val} onChange={e => set(e.target.value)}
              min={type === "number" ? 1 : undefined}
              style={{
                width: "100%", boxSizing: "border-box", padding: "9px 10px",
                border: `1px solid ${THEME.border}`, borderRadius: 9,
                fontSize: 13.5, fontWeight: 600, color: THEME.text,
              }} />
          </label>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={() => setRinnovaFor(null)} disabled={rinnovaBusy} style={{
            flex: 1, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.text,
            borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>Annulla</button>
          <button onClick={doRinnovo} disabled={rinnovaBusy || !rinnAtt} style={{
            flex: 1, border: "none", background: THEME.teal, color: "#fff",
            borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700,
            cursor: "pointer", opacity: rinnovaBusy || !rinnAtt ? .6 : 1,
          }}>{rinnovaBusy ? "Rinnovo…" : "Rinnova"}</button>
        </div>
      </div>
    </div>
  );

  // ── PAI da attenzionare: scaduti con residui, esauriti, in scadenza ──────
  const paiAlerts = useMemo(() => {
    const today = parseISODate(todayISO);
    const soon = addDays(today, 14);
    const out: { p: CoopPatient; kind: "scaduto" | "esauriti" | "scadenza"; label: string }[] = [];
    patients.forEach(p => {
      if (p.stato !== "attivo") return;
      if (selectedCoopId !== "all" && p.cooperative_id !== selectedCoopId) return;
      const rim = countersByPatient.get(p.id)?.rimanenti ?? null;
      const scad = p.data_scadenza ? parseISODate(p.data_scadenza) : null;
      if (scad && scad < today && (rim ?? 0) > 0) out.push({ p, kind: "scaduto", label: `scaduto · ${rim} rim.` });
      else if (rim !== null && rim <= 0) out.push({ p, kind: "esauriti", label: "accessi esauriti" });
      else if (scad && scad <= soon && (rim ?? 0) > 0) out.push({ p, kind: "scadenza", label: `scade ${fmtShort(scad)} · ${rim} rim.` });
    });
    const rank = { scaduto: 0, esauriti: 1, scadenza: 2 } as const;
    return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
  }, [patients, selectedCoopId, countersByPatient, todayISO]);

  // ── Trend accessi: ultimi 6 mesi fino al mese visualizzato ──────────────
  // SOLO conteggi (accessi fatti), volutamente nessun valore economico.
  const trendMesi = useMemo(() => {
    const months: { key: string; label: string }[] = [];
    const base = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1, 12);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("it-IT", { month: "short" }).replace(".", ""),
      });
    }
    const coopIds = selectedCoopId === "all" ? cooperatives.map(c => c.id) : [selectedCoopId];
    const keys = new Set(months.map(m => m.key));
    const counts = new Map<string, Map<string, number>>();
    allLite.forEach(a => {
      if (a.stato !== "fatto") return;
      const mk = a.data.slice(0, 7);
      if (!keys.has(mk)) return;
      const cid = patientById.get(a.coop_patient_id)?.cooperative_id;
      if (!cid) return;
      if (selectedCoopId !== "all" && cid !== selectedCoopId) return;
      const per = counts.get(mk) || new Map<string, number>();
      per.set(cid, (per.get(cid) || 0) + 1);
      counts.set(mk, per);
    });
    let max = 0;
    counts.forEach(per => per.forEach(n => { if (n > max) max = n; }));
    return { months, coopIds, counts, max };
  }, [allLite, patientById, cooperatives, selectedCoopId, anchor]);

  const trendPanel = trendMesi.max === 0 ? null : (
    <div style={{ background: "#fff", border: `1px solid ${THEME.borderSoft}`, borderRadius: 12, padding: "8px 12px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: .4, textTransform: "uppercase", color: "#475569" }}>Trend accessi</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#64748b" }}>fatti · ultimi 6 mesi</span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", paddingTop: 6 }}>
        {trendMesi.months.map(m => {
          const per = trendMesi.counts.get(m.key);
          const tot = per ? Array.from(per.values()).reduce((a, b) => a + b, 0) : 0;
          return (
            <div key={m.key} style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: tot ? THEME.text : "transparent", lineHeight: 1.4 }}>{tot || "0"}</div>
              <div style={{ display: "flex", gap: 2, alignItems: "flex-end", justifyContent: "center", height: 44 }}>
                {trendMesi.coopIds.map(cid => {
                  const n = per?.get(cid) || 0;
                  const h = trendMesi.max ? Math.round((n / trendMesi.max) * 44) : 0;
                  return (
                    <div key={cid}
                      title={`${coopById.get(cid)?.nome || ""}: ${n}`}
                      style={{
                        width: 9, height: Math.max(n ? 3 : 1, h),
                        background: n ? (coopById.get(cid)?.colore || THEME.teal) : THEME.borderSoft,
                        borderRadius: 3, opacity: .9,
                      }} />
                  );
                })}
              </div>
              <div style={{ fontSize: 8.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>{m.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const paiAlertsPanel = paiAlerts.length === 0 ? null : (
    <div style={{ background: "#fff", border: `1px solid ${THEME.border}`, borderRadius: 12, padding: "8px 11px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: .4, textTransform: "uppercase", color: "#475569" }}>
        PAI da attenzionare ({paiAlerts.length})
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingTop: 6, WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
        {paiAlerts.map(({ p, kind, label }) => (
          <button key={p.id}
            onClick={() => setPatientModal({ open: true, patient: p, startWithPhoto: false })}
            style={{
              display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
              border: `1px solid ${THEME.border}`, borderRadius: 99, background: "#fff",
              padding: "5px 11px", cursor: "pointer",
            }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: kind === "scadenza" ? "#f59e0b" : THEME.red, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: THEME.text, whiteSpace: "nowrap" }}>{displayName(`${p.cognome}`)}</span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}>{label}</span>
            {(kind === "scaduto" || kind === "esauriti") && (
              <span
                onClick={e => { e.stopPropagation(); openRinnovo(p); }}
                style={{
                  fontSize: 10.5, fontWeight: 700, color: THEME.tealDark,
                  border: `1px solid ${THEME.border}`, borderRadius: 99,
                  padding: "2px 8px", whiteSpace: "nowrap",
                }}>Rinnova</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );

  // Mese: pannello inferiore col dettaglio del giorno toccato (mobile)
  const [monthSheetDay, setMonthSheetDay] = useState<string | null>(null);
  // Mese desktop: di default tutti gli accessi in colonna; "Vista compatta"
  // li limita a 3 per giorno e ogni giorno si riapre col "+N altri".
  const [mesePiuCompatto, setMesePiuCompatto] = useState(false);
  const [meseGiorniAperti, setMeseGiorniAperti] = useState<Set<string>>(new Set());
  // "Solo questo"    = tocca solo l'accesso che stai spostando. SEMPRE il default.
  // "Tutti i giorni"  = l'ora si propaga agli altri accessi dello stesso paziente.
  // Volutamente NON persistito: riscrive l'orario su molti giorni, quindi va
  // riattivato consapevolmente ad ogni sessione invece di restare acceso.
  const [propagaOrario, setPropagaOrario] = useState(false);
  useEffect(() => {
    // ripulisce la vecchia preferenza salvata, che teneva acceso "Tutti i giorni"
    try { localStorage.removeItem("domicili_propaga_orario"); } catch {}
  }, []);
  const togglePropaga = () => setPropagaOrario(v => !v);

  // Sabato attivabile/disattivabile come nel calendario
  const dwDays = useMemo(() => showSabDw ? weekDays : weekDays.slice(0, 5), [weekDays, showSabDw]);

  // La giornata è una pila di slot da 1 ora (7…19). Ogni accesso ne occupa uno
  // solo: MAI due accessi sovrapposti. Priorità a chi ha un orario impostato;
  // chi non ce l'ha riempie gli slot liberi dalle 08:00 in poi.
  const DW_MAX_SLOT = DW_H_END - DW_H_START - 1;

  const slotOfOrario = useCallback((orario: string | null | undefined) => {
    if (!orario) return null;
    const s = Math.floor((hhmmToMin(orario) - DW_H_START * 60) / 60);
    return Math.max(0, Math.min(DW_MAX_SLOT, s));
  }, [DW_MAX_SLOT]);

  // Slot già occupati da accessi CON orario in un dato giorno
  const takenSlots = useCallback((dayISO: string, exceptId?: string) => {
    const set = new Set<number>();
    rangeAccesses.forEach(a => {
      if (a.data !== dayISO || a.id === exceptId) return;
      const s = slotOfOrario(a.orario);
      if (s !== null) set.add(s);
    });
    return set;
  }, [rangeAccesses, slotOfOrario]);

  // Primo slot libero a partire da quello desiderato (prima sotto, poi sopra)
  const firstFreeSlot = useCallback((dayISO: string, desired: number, exceptId?: string) => {
    const taken = takenSlots(dayISO, exceptId);
    for (let s = desired; s <= DW_MAX_SLOT; s++) if (!taken.has(s)) return s;
    for (let s = desired - 1; s >= 0; s--) if (!taken.has(s)) return s;
    return desired;
  }, [takenSlots, DW_MAX_SLOT]);

  const layoutDay = useCallback((list: CoopAccess[]) => {
    const res = new Map<string, number>();
    const taken = new Set<number>();
    // 1) prima chi ha l'orario: si prende il suo slot
    const timed = list.filter(a => a.orario)
      .sort((a, b) => hhmmToMin(a.orario!) - hhmmToMin(b.orario!));
    timed.forEach(a => {
      let s = slotOfOrario(a.orario)!;
      while (taken.has(s) && s < DW_MAX_SLOT) s++;      // difesa: mai sovrapposti
      while (taken.has(s) && s > 0) s--;
      res.set(a.id, s * 60);
      taken.add(s);
    });
    // 2) poi chi non ce l'ha, negli slot rimasti liberi dalle 08:00
    let slot = DW_BASE_MIN / 60;
    list.forEach(a => {
      if (a.orario) return;
      while (taken.has(slot) && slot < DW_MAX_SLOT) slot++;
      res.set(a.id, slot * 60);
      taken.add(slot);
      slot++;
    });
    return res;
  }, [slotOfOrario, DW_MAX_SLOT]);

  // Propaga l'orario agli altri accessi dello stesso paziente (da oggi in poi):
  // Marco va sempre alla stessa ora dallo stesso paziente.
  // Persiste la scaletta: 1 sola chiamata (RPC 060); se la migrazione non è
  // ancora applicata, fallback ai singoli update come prima.
  const persistOrder = async (orderedIds: string[]) => {
    const { error } = await supabase.rpc("domicili_reorder_day", { p_ids: orderedIds });
    if (!error) return;
    await Promise.all(orderedIds.map((id, i) =>
      supabase.from("coop_accesses").update({ ordine: i }).eq("id", id)));
  };

  // Propaga l'orario a TUTTI gli accessi futuri pianificati del paziente,
  // anche fuori dal range caricato. Salta slot occupati e giorni chiusi.
  // Prova la RPC atomica (migrazione 060); senza, fallback con query dirette.
  const propagateOrario = async (patientId: string, orario: string, exceptId: string) => {
    if (!propagaOrario || !studioId) return 0;
    const slot = slotOfOrario(orario);
    if (slot === null) return 0;

    // ── Via maestra: RPC atomica server-side ──
    const { data: rpcN, error: rpcErr } = await supabase.rpc("domicili_propaga_orario", {
      p_studio_id: studioId, p_patient_id: patientId, p_orario: orario,
      p_except_id: exceptId, p_from_date: todayISO,
    });
    if (!rpcErr && typeof rpcN === "number") {
      if (rpcN > 0) {
        setRangeAccesses(prev => prev.map(x =>
          x.coop_patient_id === patientId && x.id !== exceptId &&
          x.data >= todayISO && x.stato === "pianificato" &&
          !takenSlots(x.data, x.id).has(slot) && !closedDatesSet.has(x.data)
            ? { ...x, orario } : x));
      }
      return rpcN;
    }

    // ── Fallback (migrazione 060 non ancora applicata) ──
    const { data: futuri, error: e1 } = await supabase.from("coop_accesses")
      .select("id, data, orario")
      .eq("studio_id", studioId)
      .eq("coop_patient_id", patientId)
      .neq("id", exceptId)
      .gte("data", todayISO)
      .eq("stato", "pianificato");
    if (e1 || !futuri?.length) return 0;
    const cand = futuri.filter(x => (x.orario || "").slice(0, 5) !== orario);
    if (!cand.length) return 0;
    const dates = Array.from(new Set(cand.map(x => x.data)));
    const [{ data: occ }, { data: chius }] = await Promise.all([
      supabase.from("coop_accesses")
        .select("id, data, orario")
        .eq("studio_id", studioId)
        .in("data", dates)
        .not("orario", "is", null),
      supabase.from("domicili_chiusure")
        .select("data_da, data_a")
        .eq("studio_id", studioId),
    ]);
    const occupied = new Set(
      (occ || [])
        .filter(o => slotOfOrario(o.orario) === slot)
        .map(o => `${o.data}|${o.id}`));
    const isClosed = (d: string) => (chius || []).some(c => d >= c.data_da && d <= c.data_a);
    const ids = cand
      .filter(x => !isClosed(x.data))
      .filter(x => ![...occupied].some(k => k.startsWith(`${x.data}|`) && !k.endsWith(`|${x.id}`)))
      .map(x => x.id);
    if (!ids.length) return 0;
    setRangeAccesses(prev => prev.map(x => ids.includes(x.id) ? { ...x, orario } : x));
    await Promise.all(ids.map(id =>
      supabase.from("coop_accesses").update({ orario }).eq("id", id)));
    return ids.length;
  };

  // Coordinate schermo → { colonna giorno, minuti dall'inizio griglia }
  const dwResolve = useCallback((x: number, topY: number) => {
    const grid = dwGridRef.current; if (!grid) return null;
    const r = grid.getBoundingClientRect();
    const nDays = showSabDw ? 6 : 5;
    const colW = (r.width - DW_GUTTER) / nDays;
    if (colW <= 0) return null;
    const dayIdx = Math.max(0, Math.min(nDays - 1, Math.floor((x - r.left - DW_GUTTER) / colW)));
    const rawMin = ((topY - r.top) / DW_HOUR_PX) * 60;
    const maxMin = (DW_H_END - DW_H_START) * 60 - DW_SLOT_MIN;
    const startMin = Math.max(0, Math.min(maxMin, Math.round(rawMin / DW_SNAP_MIN) * DW_SNAP_MIN));
    return { dayIdx, startMin };
  }, [showSabDw]);

  // Sposta un accesso: giorno + orario dello slot, poi riallinea la scaletta
  const moveAccessToSlot = async (accessId: string, newDayISO: string, startMin: number) => {
    const a = rangeAccesses.find(x => x.id === accessId);
    if (!a) return;
    if (newDayISO !== a.data && closedDatesSet.has(newDayISO)) {
      notify.warning("Giorno chiuso: riaprilo dalle Chiusure per spostarci accessi");
      return;
    }
    // mai due accessi sullo stesso slot: se è occupato, scalo al primo libero
    const desired = Math.floor(startMin / 60);
    const slot = firstFreeSlot(newDayISO, desired, accessId);
    const tot = (DW_H_START + slot) * 60;
    const orario = minToHHMM(tot);
    const shifted = slot !== desired;
    const fromISO = a.data;
    if (fromISO === newDayISO && (a.orario || "").slice(0, 5) === orario) return;

    setRangeAccesses(prev => prev.map(x => x.id === accessId ? { ...x, data: newDayISO, orario } : x));
    if (fromISO !== newDayISO) {
      patchLite(a.coop_patient_id, fromISO, null);
      patchLite(a.coop_patient_id, newDayISO, a.stato);
    }
    const { error } = await supabase.from("coop_accesses")
      .update({ data: newDayISO, orario }).eq("id", accessId);
    if (error) {
      if ((error as any).code === "23505") notify.warning("Questo paziente ha già un accesso in quel giorno");
      else notify.error("Errore spostamento");
      refreshAll();
      return;
    }
    const ordered = [
      ...(accByDay.get(newDayISO) || []).filter(x => x.id !== accessId)
        .map(x => ({ id: x.id, min: x.orario ? hhmmToMin(x.orario) : 9999 })),
      { id: accessId, min: tot },
    ].sort((p2, q2) => p2.min - q2.min).map(x => x.id);
    await persistOrder(ordered);

    // stesso paziente, stessa ora anche negli altri giorni (e nel piano PAI)
    const n = await propagateOrario(a.coop_patient_id, orario, accessId);
    if (propagaOrario) await syncPianificazioneOrario(a.coop_patient_id, orario);
    if (shifted) notify.warning(`Slot occupato: spostato alle ${orario}`);
    else if (n > 0) notify.success(`Spostato · ${orario} anche su altri ${n} giorni`);
    else notify.success("Accesso spostato");
  };

  // Punto debole chiuso: la propagazione aggiornava gli accessi ESISTENTI ma
  // non la pianificazione (giorni_orari) del paziente, così i nuovi accessi
  // generati in futuro nascevano con l'orario vecchio. Ora, quando propaghi
  // con "Tutti i giorni", anche il piano prende il nuovo orario.
  const syncPianificazioneOrario = async (patientId: string, orario: string) => {
    const p = patients.find(x => x.id === patientId);
    if (!p || !p.giorni_orari?.length) return;
    if (p.giorni_orari.every(g => (g.orario || "") === orario)) return;
    const nuovi = p.giorni_orari.map(g => ({ ...g, orario }));
    setPatients(prev => prev.map(x => x.id === patientId ? { ...x, giorni_orari: nuovi } : x));
    const { error } = await supabase.from("coop_patients")
      .update({ giorni_orari: nuovi }).eq("id", patientId);
    if (error) notify.error("Pianificazione non aggiornata");
  };

  const dwPaintBadge = (ghostLeft: number, ghostTop: number, dayIdx: number, startMin: number) => {
    const b = dragBadgeRef.current; if (!b) return;
    const d = dwDays[dayIdx];
    const dow = d ? DOW_LABELS[(d.getDay() === 0 ? 7 : d.getDay())] || "" : "";
    const text = `${dow} ${d ? d.getDate() : ""} ${minToHHMM(DW_H_START * 60 + startMin)}`;
    if (b.textContent !== text) b.textContent = text;
    b.style.left = `${Math.max(6, Math.min(ghostLeft, window.innerWidth - 110))}px`;
    b.style.top = `${ghostTop > 42 ? ghostTop - 30 : ghostTop + 8}px`;
  };

  const dwActivate = () => {
    const st = dwDragRef.current;
    if (!st || st.activated || !st.cardEl) return;
    st.activated = true;
    setDwDragId(st.accessId);
    const rect = st.cardEl.getBoundingClientRect();
    grabOffsetRef.current = { dx: st.startX - rect.left, dy: st.startY - rect.top };
    const clone = st.cardEl.cloneNode(true) as HTMLElement;
    clone.style.position = "fixed";
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.margin = "0";
    clone.style.zIndex = "3000";
    clone.style.pointerEvents = "none";
    clone.style.opacity = "0.96";
    clone.style.background = "#fff";
    clone.style.boxShadow = "0 14px 34px rgba(15,23,42,0.32)";
    clone.style.transform = "scale(1.08)";
    document.body.appendChild(clone);
    ghostElRef.current = clone;

    const badge = document.createElement("div");
    badge.style.position = "fixed";
    badge.style.zIndex = "3001";
    badge.style.pointerEvents = "none";
    badge.style.background = "#ffffff";
    badge.style.border = "1px solid #cbd5e1";
    badge.style.borderRadius = "8px";
    badge.style.padding = "3px 8px";
    badge.style.fontSize = "11px";
    badge.style.fontWeight = "700";
    badge.style.whiteSpace = "nowrap";
    badge.style.color = "#334155";
    badge.style.boxShadow = "0 2px 8px rgba(15,23,42,0.12)";
    document.body.appendChild(badge);
    dragBadgeRef.current = badge;

    if (st.viaTouch) {
      const blocker = (ev: TouchEvent) => { ev.preventDefault(); };
      document.addEventListener("touchmove", blocker, { passive: false });
      touchBlockerRef.current = blocker;
      try { (navigator as any).vibrate?.(18); } catch {}
    } else {
      document.body.style.userSelect = "none";
    }
    const res = dwResolve(st.startX, st.startY - grabOffsetRef.current.dy);
    if (res) { st.dayIdx = res.dayIdx; st.startMin = res.startMin; setDwOver(res); dwPaintBadge(rect.left, st.startY - grabOffsetRef.current.dy, res.dayIdx, res.startMin); }
  };

  const dwMoveTo = (x: number, y: number) => {
    const st = dwDragRef.current; if (!st?.activated) return;
    lastPtRef.current = { x, y };
    const gLeft = x - grabOffsetRef.current.dx;
    const gTop = y - grabOffsetRef.current.dy;
    const g = ghostElRef.current;
    if (g) { g.style.left = `${gLeft}px`; g.style.top = `${gTop}px`; }
    const res = dwResolve(x, gTop);
    if (res) {
      dwPaintBadge(gLeft, gTop, res.dayIdx, res.startMin);
      if (res.dayIdx !== st.dayIdx || res.startMin !== st.startMin) {
        const dayChanged = res.dayIdx !== st.dayIdx;
        st.dayIdx = res.dayIdx; st.startMin = res.startMin;
        setDwOver(res);
        if (dayChanged) { try { (navigator as any).vibrate?.(8); } catch {} }
      }
    }
    const EDGE = 80, SPEED = 10;
    if (y >= EDGE && y <= window.innerHeight - EDGE) { stopAutoScroll(); return; }
    if (autoScrollRef.current !== null) return;
    const step = () => {
      const s = dwDragRef.current;
      if (!s?.activated) { autoScrollRef.current = null; return; }
      const p = lastPtRef.current;
      const dir = p.y < EDGE ? -1 : p.y > window.innerHeight - EDGE ? 1 : 0;
      if (dir === 0) { autoScrollRef.current = null; return; }
      window.scrollBy(0, dir * SPEED);
      dwMoveTo(p.x, p.y);
      if (autoScrollRef.current === null) return;
      autoScrollRef.current = requestAnimationFrame(step);
    };
    autoScrollRef.current = requestAnimationFrame(step);
  };

  const dwFinish = (commit: boolean) => {
    const st = dwDragRef.current; dwDragRef.current = null;
    if (st?.timer) clearTimeout(st.timer);
    stopAutoScroll();
    clearTouchGhost();
    if (touchBlockerRef.current) { document.removeEventListener("touchmove", touchBlockerRef.current); touchBlockerRef.current = null; }
    document.body.style.userSelect = "";
    setDwDragId(null); setDwOver(null);
    if (!st?.activated) return;
    suppressClickRef.current = true;
    setTimeout(() => { suppressClickRef.current = false; }, 420);
    if (!commit || st.dayIdx === null || st.startMin === null) return;
    const targetISO = localISO(dwDays[st.dayIdx]);
    try { (navigator as any).vibrate?.(24); } catch {}
    moveAccessToSlot(st.accessId, targetISO, st.startMin);
  };

  const dwDragHandlers = (a: CoopAccess) => ({
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      dwDragRef.current = {
        accessId: a.id, fromISO: a.data,
        startX: t.clientX, startY: t.clientY,
        activated: false, viaTouch: true, cardEl: e.currentTarget as HTMLElement,
        dayIdx: null, startMin: null, timer: setTimeout(dwActivate, 260),
      };
    },
    onTouchMove: (e: React.TouchEvent) => {
      const st = dwDragRef.current; if (!st || !st.viaTouch) return;
      const t = e.touches[0];
      if (!st.activated) {
        // la card ha touchAction:none, quindi muovere il dito NON è mai uno
        // scroll: è sempre intenzione di spostare → attivo subito il drag
        // invece di annullarlo (prima partiva il tap e si apriva la modale)
        if (Math.abs(t.clientX - st.startX) > 8 || Math.abs(t.clientY - st.startY) > 8) {
          if (st.timer) clearTimeout(st.timer);
          dwActivate();
        } else {
          return;
        }
      }
      dwMoveTo(t.clientX, t.clientY);
    },
    onTouchEnd: () => dwFinish(true),
    onTouchCancel: () => dwFinish(false),
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      dwDragRef.current = {
        accessId: a.id, fromISO: a.data,
        startX: e.clientX, startY: e.clientY,
        activated: false, viaTouch: false, cardEl: e.currentTarget as HTMLElement,
        dayIdx: null, startMin: null, timer: null,
      };
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    },
    onPointerMove: (e: React.PointerEvent) => {
      const st = dwDragRef.current; if (!st || st.viaTouch) return;
      if (!st.activated) {
        if (Math.abs(e.clientX - st.startX) > 6 || Math.abs(e.clientY - st.startY) > 6) dwActivate();
        else return;
      }
      dwMoveTo(e.clientX, e.clientY);
    },
    onPointerUp: () => {
      const st = dwDragRef.current; if (!st || st.viaTouch) return;
      dwFinish(true);
    },
  });

  const accessTouchHandlers = (a: CoopAccess) => ({
    // ── Mobile (touch, long-press) ──
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      touchDragRef.current = {
        accessId: a.id, fromISO: a.data,
        startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastY: t.clientY,
        activated: false, viaTouch: true, cardEl: e.currentTarget as HTMLElement,
        overDay: null, overCard: null, overAfter: false,
        timer: setTimeout(activateDrag, 260),
      };
    },
    onTouchMove: (e: React.TouchEvent) => {
      const st = touchDragRef.current;
      if (!st || !st.viaTouch) return;
      const t = e.touches[0];
      if (!st.activated) {
        if (Math.abs(t.clientX - st.startX) > 8 || Math.abs(t.clientY - st.startY) > 8) {
          clearTimeout(st.timer); touchDragRef.current = null;
        }
        return;
      }
      dragMoveTo(t.clientX, t.clientY);
    },
    onTouchEnd: () => finishDrag(true),
    onTouchCancel: () => finishDrag(false),
    // ── Desktop (mouse, pointer events) ──
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("input,button,a,select,textarea")) return; // non da checkbox/menu
      touchDragRef.current = {
        accessId: a.id, fromISO: a.data,
        startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY,
        activated: false, viaTouch: false, cardEl: e.currentTarget as HTMLElement,
        overDay: null, overCard: null, overAfter: false, timer: null,
      };
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    },
    onPointerMove: (e: React.PointerEvent) => {
      const st = touchDragRef.current;
      if (!st || st.viaTouch) return;
      if (!st.activated) {
        if (Math.abs(e.clientX - st.startX) > 6 || Math.abs(e.clientY - st.startY) > 6) activateDrag();
        else return;
      }
      dragMoveTo(e.clientX, e.clientY);
    },
    onPointerUp: () => {
      const st = touchDragRef.current;
      if (!st || st.viaTouch) return;
      finishDrag(true);
    },
  });

  // Riordina a scaletta dentro lo stesso giorno: assegna "ordine" progressivo
  const reorderInDay = async (dayISO: string, orderedIds: string[]) => {
    // aggiorna locale
    setRangeAccesses(prev => {
      const map = new Map(orderedIds.map((id, i) => [id, i]));
      return prev.map(x => map.has(x.id) ? { ...x, ordine: map.get(x.id)! } : x);
    });
    // persisti (RPC atomica, con fallback)
    await persistOrder(orderedIds);
  };

  const updateOrario = async (a: CoopAccess, time: string) => {
    if (!time) {
      patchLocal(a.id, { orario: null });
      const { error } = await supabase.from("coop_accesses").update({ orario: null }).eq("id", a.id);
      if (error) { notify.error("Errore salvataggio"); refreshAll(); }
      return;
    }
    // stessa regola del drag: mai due accessi sullo stesso slot
    const desired = slotOfOrario(time);
    const slot = firstFreeSlot(a.data, desired ?? 0, a.id);
    const orario = minToHHMM((DW_H_START + slot) * 60);
    const shifted = desired !== null && slot !== desired;
    patchLocal(a.id, { orario });
    const { error } = await supabase.from("coop_accesses").update({ orario }).eq("id", a.id);
    if (error) { notify.error("Errore salvataggio"); refreshAll(); return; }
    // Dal menu dell'accesso (vista Giorno) la modifica resta SOLO su quel giorno:
    // la propagazione agli altri giorni avviene unicamente col drag in Settimana.
    if (shifted) notify.warning(`Slot occupato: impostato alle ${orario}`);
  };

  const removeAccess = async (a: CoopAccess) => {
    if (!window.confirm("Rimuovere questo accesso dal calendario?")) return;
    setMenuFor(null);
    setRangeAccesses(prev => prev.filter(x => x.id !== a.id));
    patchLite(a.coop_patient_id, a.data, null);
    const { error } = await supabase.from("coop_accesses").delete().eq("id", a.id);
    if (error) { notify.error("Errore eliminazione"); refreshAll(); }
  };

  const insertAccess = async (patientId: string, dayISO: string, time: string) => {
    if (!studioId) return;
    const row = {
      studio_id: studioId, coop_patient_id: patientId,
      data: dayISO, orario: time || null, stato: "pianificato",
    };
    const { error } = await supabase.from("coop_accesses").insert(row);
    if (error) {
      if ((error as any).code === "23505") notify.warning("Esiste già un accesso per questo paziente in quella data");
      else notify.error("Errore inserimento");
      return;
    }
    patchLite(patientId, dayISO, "pianificato");
    setAddAccess({ open: false, dayISO: "" });
    loadRange(studioId, calView, anchor);
    notify.success("Accesso aggiunto");
  };

  // ─── Impostazioni contatore ──────────────────────────────────────────────

  const saveCounterMode = async (mode: CounterMode) => {
    if (!studioId) return;
    setCounterMode(mode);
    setSettingsOpen(false);
    const { error } = await supabase.from("domicili_settings")
      .upsert({ studio_id: studioId, counter_mode: mode, updated_at: new Date().toISOString() });
    if (error) { notify.error("Errore salvataggio impostazione"); return; }
    if (mode === "automatico") {
      await supabase.from("coop_accesses")
        .update({ stato: "fatto", fatto_alle: new Date().toISOString() })
        .eq("studio_id", studioId).eq("stato", "pianificato").lt("data", todayISO);
      refreshAll();
      notify.success("Contatore automatico attivo");
    } else {
      notify.success("Contatore manuale attivo");
    }
  };

  // ─── Cooperative ─────────────────────────────────────────────────────────

  const saveCooperative = async (form: { nome: string; logo_url: string | null; colore: string; attiva: boolean }, coop: Cooperative | null) => {
    if (!studioId) return;
    if (coop) {
      const { error } = await supabase.from("cooperatives").update(form).eq("id", coop.id);
      if (error) { notify.error("Errore salvataggio"); return; }
    } else {
      const { data, error } = await supabase.from("cooperatives")
        .insert({ studio_id: studioId, ...form }).select("id").single();
      if (error) { notify.error("Errore creazione"); return; }
      if (data?.id) setSelectedCoopId(data.id);
    }
    setCoopModal({ open: false, coop: null });
    refreshAll();
  };

  const quickCreatePreset = async (preset: { nome: string; logo_url: string; colore: string }) => {
    await saveCooperative({ ...preset, attiva: true }, null);
  };

  // ─── Planner PDF ─────────────────────────────────────────────────────────

  // ─── Consuntivo mensile per cooperativa ──────────────────────────────────
  // Documento per la fatturazione: accessi del mese visualizzato, divisi per
  // cooperativa, con ora effettiva della spunta e riepilogo per paziente.
  // NOMI SEMPRE REALI (come gli export dei Report): documento fiscale,
  // la Modalità Privacy non si applica.
  const loadMeseRows = async () => {
    if (!studioId) return null;
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12);
    const { data, error } = await supabase.from("coop_accesses")
      .select("id, coop_patient_id, data, orario, stato, fatto_alle, note")
      .eq("studio_id", studioId)
      .gte("data", localISO(first)).lte("data", localISO(last))
      .order("data", { ascending: true }).order("ordine", { ascending: true });
    if (error || !data) { notify.error("Errore caricamento dati"); return null; }
    const scopeIds = new Set(scopePatients.map(p => p.id));
    const rows = data.filter(a => scopeIds.has(a.coop_patient_id));
    if (!rows.length) { notify.info("Nessun accesso nel mese visualizzato"); return null; }
    // sezioni per cooperativa
    const byCoop = new Map<string, typeof rows>();
    rows.forEach(a => {
      const cid = patientById.get(a.coop_patient_id)?.cooperative_id || "?";
      const arr = byCoop.get(cid) || [];
      arr.push(a); byCoop.set(cid, arr);
    });
    const sezioni = Array.from(byCoop.entries())
      .map(([cid, list]) => ({ coop: coopById.get(cid) || null, list }))
      .sort((x, y) => (x.coop?.nome || "").localeCompare(y.coop?.nome || ""));
    return sezioni;
  };

  const oraEffettiva = (fatto_alle: string | null) => {
    if (!fatto_alle) return "";
    const d = new Date(fatto_alle);
    return minToHHMM(d.getHours() * 60 + d.getMinutes());
  };
  const statoLabel = (st: string) => st === "fatto" ? "Fatto" : st === "saltato" ? "Saltato" : "Pianificato";

  const openConsuntivoPdf = async () => {
    const sezioni = await loadMeseRows();
    if (!sezioni) return;
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setFontSize(14);
    doc.text(`Consuntivo accessi domiciliari — ${fmtMonthYear(anchor)}`, 10, 14);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Generato il ${fmtIT(todayISO)}`, 10, 19);
    doc.setTextColor(0);
    let y = 26;
    sezioni.forEach(({ coop, list }) => {
      const fatti = list.filter(a => a.stato === "fatto").length;
      const saltati = list.filter(a => a.stato === "saltato").length;
      const pian = list.length - fatti - saltati;
      doc.setFontSize(12);
      doc.text(`${coop?.nome || "Cooperativa"} — ${fatti} fatti · ${saltati} saltati${pian ? ` · ${pian} pianificati` : ""}`, 10, y);
      y += 3;
      autoTable(doc, {
        startY: y,
        head: [["Data", "Ora", "Paziente", "Stato", "Eseguito alle", "Note"]],
        body: list.map(a => {
          const p = patientById.get(a.coop_patient_id);
          return [
            fmtIT(a.data),
            a.orario ? a.orario.slice(0, 5) : "—",
            p ? `${p.cognome} ${p.nome}` : "?",
            statoLabel(a.stato),
            oraEffettiva(a.fatto_alle),
            a.note || "",
          ];
        }),
        styles: { fontSize: 8, cellPadding: 1.4 },
        headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: "bold" },
        margin: { left: 10, right: 10 },
        theme: "grid",
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
      // riepilogo per paziente (per la fattura)
      const perPaz = new Map<string, { fatti: number; saltati: number }>();
      list.forEach(a => {
        const k = a.coop_patient_id;
        const c = perPaz.get(k) || { fatti: 0, saltati: 0 };
        if (a.stato === "fatto") c.fatti++;
        if (a.stato === "saltato") c.saltati++;
        perPaz.set(k, c);
      });
      autoTable(doc, {
        startY: y,
        head: [["Paziente", "Accessi fatti", "Saltati"]],
        body: Array.from(perPaz.entries())
          .map(([pid, c]) => {
            const p = patientById.get(pid);
            return [p ? `${p.cognome} ${p.nome}` : "?", String(c.fatti), String(c.saltati)];
          })
          .sort((x, y2) => x[0].localeCompare(y2[0])),
        styles: { fontSize: 8, cellPadding: 1.4 },
        headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: "bold" },
        margin: { left: 10, right: 10 },
        theme: "grid",
        tableWidth: 110,
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
      if (y > 260) { doc.addPage(); y = 14; }
    });
    const mm = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}`;
    doc.save(`consuntivo-domicili-${selectedCoop ? selectedCoop.nome.toLowerCase().replace(/\s+/g, "-") : "tutte"}-${mm}.pdf`);
  };

  const openConsuntivoCsv = async () => {
    const sezioni = await loadMeseRows();
    if (!sezioni) return;
    const righe: string[] = ["cooperativa;data;ora;cognome;nome;stato;eseguito_alle;note"];
    sezioni.forEach(({ coop, list }) => {
      list.forEach(a => {
        const p = patientById.get(a.coop_patient_id);
        const esc = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;
        righe.push([
          esc(coop?.nome || ""), a.data, a.orario ? a.orario.slice(0, 5) : "",
          esc(p?.cognome || ""), esc(p?.nome || ""), statoLabel(a.stato),
          oraEffettiva(a.fatto_alle), esc(a.note || ""),
        ].join(";"));
      });
    });
    const mm = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}`;
    const blob = new Blob(["\ufeff" + righe.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a2 = document.createElement("a");
    a2.href = url;
    a2.download = `consuntivo-domicili-${mm}.csv`;
    a2.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const openPlanner = async () => {
    const from = localISO(weekStart), to = localISO(addDays(weekStart, 5));
    const scopeIds = new Set(scopePatients.map(p => p.id));
    const wk = rangeAccesses.filter(a => a.data >= from && a.data <= to && scopeIds.has(a.coop_patient_id));
    if (wk.filter(a => a.stato !== "saltato").length === 0) {
      notify.info("Nessun accesso in questa settimana");
      return;
    }
    try {
      await generatePlannerPdf({ weekStart, coop: selectedCoop, patientById, accesses: wk });
    } catch (e: any) {
      notify.error("Errore generazione planner");
    }
  };

  // ─── Guard viewport ──────────────────────────────────────────────────────
  if (isMobile === null) {
    return <div style={{ minHeight: "100vh", background: THEME.appBg }} />;
  }

  // ─── Guard feature flag (mig. 056): sezione attiva solo se abilitata ─────
  // (posizionato DOPO tutti gli hook — mai return prima degli hook)
  if (studio && studio.feature_domicili !== true) {
    return (
      <div style={{ minHeight: "100vh", background: THEME.appBg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "#fff", border: `1px solid ${THEME.border}`, borderRadius: 14, padding: "26px 28px", maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: THEME.text, marginBottom: 8 }}>Sezione non disponibile</div>
          <div style={{ fontSize: 13, color: THEME.mutedLight, lineHeight: 1.6, marginBottom: 16 }}>
            La sezione Domicili Cooperative non è attiva per questo studio.
          </div>
          <Link href="/" style={{ display: "inline-block", padding: "10px 18px", borderRadius: 10, background: THEME.teal, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
            Torna alla home
          </Link>
        </div>
      </div>
    );
  }

  const activeCoops = cooperatives.filter(c => c.attiva);
  const patientsCountByCoop = new Map<string, number>();
  patients.forEach(p => {
    if (p.stato === "concluso") return;
    patientsCountByCoop.set(p.cooperative_id, (patientsCountByCoop.get(p.cooperative_id) || 0) + 1);
  });

  const editPatientAccesses = patientModal.patient
    ? allLite.filter(a => a.coop_patient_id === patientModal.patient!.id).map(a => ({ data: a.data, stato: a.stato }))
    : [];

  // ─── Modali condivise ────────────────────────────────────────────────────

  const sharedModals = (
    <>
      <PaiPatientModal
        open={patientModal.open}
        onClose={() => setPatientModal({ open: false, patient: null, startWithPhoto: false })}
        isMobile={!!isMobile}
        studioId={studioId || ""}
        cooperatives={activeCoops}
        defaultCooperativeId={selectedCoopId === "all" ? activeCoops[0]?.id : selectedCoopId}
        patient={patientModal.patient}
        patientAccesses={editPatientAccesses}
        startWithPhoto={patientModal.startWithPhoto}
        onSaved={refreshAll}
      />
      <ReportSettimanale
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        isMobile={!!isMobile}
        weekStart={weekStart}
        coop={selectedCoop}
        cooperatives={activeCoops}
        patients={patients}
        weekAccesses={rangeAccesses.filter(a => a.data >= localISO(weekStart) && a.data <= localISO(addDays(weekStart, 5)))}
        countersByPatient={countersByPatient}
        displayName={displayName}
      />
      <MessageModal
        open={msgOpen}
        onClose={() => setMsgOpen(false)}
        isMobile={!!isMobile}
        studioId={studioId || ""}
        cooperatives={activeCoops}
        preferredCoopId={selectedCoopId !== "all" ? selectedCoopId : undefined}
        patients={patients}
      />
      <CoopModal
        open={coopModal.open}
        coop={coopModal.coop}
        isMobile={!!isMobile}
        onClose={() => setCoopModal({ open: false, coop: null })}
        onSave={saveCooperative}
      />
      <AddAccessModal
        open={addAccess.open}
        dayISO={addAccess.dayISO}
        isMobile={!!isMobile}
        patients={scopePatients.filter(p => p.stato === "attivo")}
        displayName={displayName}
        onClose={() => setAddAccess({ open: false, dayISO: "" })}
        onAdd={insertAccess}
      />
    </>
  );

  const isolationNote = (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
      background: "#f0fdfa", border: `1px solid ${THEME.borderSoft}`, borderRadius: 12,
      fontSize: 12, color: THEME.tealDark, fontWeight: 600,
    }}>
      Sezione separata: questi pazienti non entrano in anagrafica, report, contabilità o Sistema TS.
    </div>
  );

  // Popover impostazioni contatore (condiviso)
  const settingsPanel = settingsOpen && (
    <>
      <div onClick={() => setSettingsOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 900 }} />
      <div style={{
        position: isMobile ? "fixed" : "absolute",
        top: isMobile ? "auto" : 44, right: isMobile ? 0 : 0,
        bottom: isMobile ? 0 : "auto", left: isMobile ? 0 : "auto",
        zIndex: 950, background: "#fff",
        borderRadius: isMobile ? "16px 16px 0 0" : 14,
        border: `1px solid ${THEME.border}`,
        boxShadow: "0 16px 44px rgba(15,23,42,.18)",
        padding: 16, width: isMobile ? "auto" : 330,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: THEME.text, marginBottom: 10 }}>Avanzamento contatore accessi</div>
        {(["manuale", "automatico"] as CounterMode[]).map(mode => (
          <label key={mode} style={{
            display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 10px",
            borderRadius: 10, cursor: "pointer",
            background: counterMode === mode ? "#f1f5f9" : "transparent",
            border: `1px solid ${counterMode === mode ? THEME.border : "transparent"}`,
            marginBottom: 6,
          }}>
            <input
              type="radio" name="counterMode" checked={counterMode === mode}
              onChange={() => saveCounterMode(mode)} style={{ marginTop: 2, accentColor: THEME.teal }}
            />
            <span>
              <span style={{ fontSize: 14, fontWeight: 700, color: THEME.text, display: "block" }}>
                {mode === "manuale" ? "Spunta manuale" : "Automatico"}
              </span>
              <span style={{ fontSize: 12.5, color: THEME.muted, lineHeight: 1.45 }}>
                {mode === "manuale"
                  ? "Il contatore avanza solo quando segni l'accesso come fatto."
                  : "Gli accessi pianificati dei giorni passati diventano \"fatto\" da soli. Puoi sempre correggerli in \"saltato\"."}
              </span>
            </span>
          </label>
        ))}
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700, color: THEME.muted, padding: "8px 10px 2px", cursor: "pointer" }}>
          <input type="checkbox" checked={showConclusi} onChange={e => setShowConclusi(e.target.checked)} style={{ accentColor: THEME.teal }} />
          Mostra pazienti conclusi
        </label>

        {/* ── Ferie / Chiusure ── */}
        <div style={{ borderTop: `1px solid ${THEME.borderSoft}`, marginTop: 12, paddingTop: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: THEME.text, marginBottom: 4 }}>Ferie e chiusure</div>
          <div style={{ fontSize: 12, color: THEME.mutedLight, lineHeight: 1.45, marginBottom: 10 }}>
            Nei giorni indicati non vengono pianificati accessi: quelli previsti slittano ai giorni utili successivi.
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 8 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: THEME.mutedLight }}>Dal</span>
              <input type="date" value={ferieForm.da} onChange={e => setFerieForm(f => ({ ...f, da: e.target.value }))}
                style={{ padding: "7px 8px", borderRadius: 8, border: `1.5px solid ${THEME.border}`, fontSize: 12.5, fontWeight: 600, color: THEME.text, background: "#fff" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: THEME.mutedLight }}>Al</span>
              <input type="date" value={ferieForm.a} onChange={e => setFerieForm(f => ({ ...f, a: e.target.value }))}
                style={{ padding: "7px 8px", borderRadius: 8, border: `1.5px solid ${THEME.border}`, fontSize: 12.5, fontWeight: 600, color: THEME.text, background: "#fff" }} />
            </label>
            <button
              onClick={async () => {
                if (!ferieForm.da) { notify.warning("Scegli almeno la data di inizio"); return; }
                const da = ferieForm.da, a = ferieForm.a || ferieForm.da;
                if (a < da) { notify.warning("La data finale è prima di quella iniziale"); return; }
                await addChiusura(da, a, "Ferie");
                setFerieForm({ da: "", a: "" });
              }}
              style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: THEME.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              Aggiungi
            </button>
          </div>
          {chiusure.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 160, overflowY: "auto" }}>
              {chiusure.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, background: THEME.panelSoft, border: `1px solid ${THEME.borderSoft}`, borderRadius: 8, padding: "6px 10px" }}>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: THEME.text }}>
                    {c.data_da === c.data_a ? fmtIT(c.data_da) : `${fmtIT(c.data_da)} → ${fmtIT(c.data_a)}`}
                    {c.motivo ? <span style={{ fontWeight: 600, color: THEME.mutedLight }}>{"  ·  " + c.motivo}</span> : null}
                  </span>
                  <button onClick={() => removeChiusura(c.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: THEME.mutedLight, fontSize: 14 }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );

  // ═══════════════════════════════════════════════════════════════════════
  // VISTA MOBILE (< 768px)
  // ═══════════════════════════════════════════════════════════════════════
  if (isMobile) {
    const anchorISO = localISO(anchor);
    const dayAccesses = (accByDay.get(anchorISO) || []);

    return (
      <div style={{ minHeight: "100vh", background: THEME.appBg, color: THEME.text, paddingBottom: 130, overflowX: "hidden", width: "100%", maxWidth: "100%" }}>
        {/* Header */}
        <div style={{ padding: "16px 16px 10px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 21, fontWeight: 800, color: THEME.text }}>Domicili</div>
            <div style={{ fontSize: 11.5, color: THEME.mutedLight, fontWeight: 600 }}>Cooperative · dati separati dallo studio</div>
          </div>
          <button onClick={() => setDocSheet(true)} style={mBtnIcon()} title="Report / Planner / Messaggio"><Icon name="chart" size={17} color={THEME.mutedLight} /></button>
          <div style={{ position: "relative" }}>
            <button onClick={() => setSettingsOpen(o => !o)} style={mBtnIcon()}>
              <Icon name="settings" size={17} color={THEME.muted} />
            </button>
          </div>
        </div>
        {settingsPanel}

        {/* Pill cooperative */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 16px 10px", scrollbarWidth: "none", msOverflowStyle: "none" }} className="no-scrollbar">
          <CoopPill label="Tutte" active={selectedCoopId === "all"} color={THEME.teal} onClick={() => setSelectedCoopId("all")} />
          {activeCoops.map(c => (
            <CoopPill
              key={c.id} label={c.nome} logo={c.logo_url} color={c.colore}
              count={patientsCountByCoop.get(c.id) || 0}
              active={selectedCoopId === c.id}
              onClick={() => setSelectedCoopId(c.id)}
            />
          ))}
          <button onClick={() => setCoopModal({ open: true, coop: null })} style={{
            flex: "0 0 auto", border: `1.5px dashed ${THEME.border}`, background: "transparent",
            borderRadius: 999, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, color: THEME.mutedLight,
          }}>＋</button>
        </div>

        {/* Segmented Agenda | Pazienti */}
        <div style={{ margin: "0 16px 10px", display: "flex", background: "#e2e8f0", borderRadius: 12, padding: 3 }}>
          {(["agenda", "pazienti"] as const).map(v => (
            <button key={v} onClick={() => setMobileView(v)} style={{
              flex: 1, border: "none", borderRadius: 10, padding: "9px 0",
              fontSize: 13, fontWeight: 800, cursor: "pointer",
              background: mobileView === v ? "#fff" : "transparent",
              color: mobileView === v ? THEME.text : THEME.mutedLight,
              boxShadow: mobileView === v ? "0 1px 4px rgba(15,23,42,.12)" : "none",
            }}>
              {v === "agenda" ? "Agenda" : `Pazienti (${scopePatients.length})`}
            </button>
          ))}
        </div>

        {activeCoops.length === 0 && !loading && (
          <EmptyCoops onPreset={quickCreatePreset} onCustom={() => setCoopModal({ open: true, coop: null })} isMobile />
        )}

        {/* ── AGENDA ── */}
        {mobileView === "agenda" && activeCoops.length > 0 && (
          <>
            {/* Nav + switch vista */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 8px" }}>
              <button onClick={() => stepMobile(-1)} style={mBtnIcon()}>
                <Icon name="chevronLeft" size={16} color={THEME.muted} />
              </button>
              <div style={{ flex: 1, textAlign: "center", fontSize: 12.5, fontWeight: 800, color: THEME.textSoft }}>
                {calView === "mese" ? fmtMonthYear(anchor) : fmtWeekRange(weekStart)}
              </div>
              <button onClick={() => stepMobile(1)} style={mBtnIcon()}>
                <Icon name="chevronRight" size={16} color={THEME.muted} />
              </button>
            </div>
            {paiAlertsPanel && <div style={{ padding: "0 16px 10px" }}>{paiAlertsPanel}</div>}
            {trendPanel && <div style={{ padding: "0 16px 10px" }}>{trendPanel}</div>}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 12px" }}>
              <ViewSwitch value={calView} onChange={setCalView} compact />
              {pendingCount > 0 && (
                <button onClick={() => flushPending()} style={{
                  border: "1px solid #fcd34d", background: "#fffbeb", color: "#92400e",
                  fontSize: 11, fontWeight: 700, padding: "6px 10px", borderRadius: 99,
                  cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                }}>⇅ {pendingCount} offline</button>
              )}
              <div style={{ flex: 1 }} />
              <button onClick={goToday} style={{ ...mBtnIcon(), width: "auto", padding: "0 14px", fontSize: 12, fontWeight: 800, color: THEME.tealDark }}>
                Oggi
              </button>
            </div>

            {/* ── GIORNO: strip + lista ── */}
            {calView === "giorno" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, padding: "0 16px 12px" }}>
                  {weekDays.map((d, i) => {
                    const iso = localISO(d);
                    const sel = iso === anchorISO;
                    const isToday = iso === todayISO;
                    const count = (accByDay.get(iso) || []).length;
                    // data-drop-day: trascinando una card qui sopra, l'accesso si sposta a questo giorno
                    return (
                      <button key={iso} data-drop-day={iso} onClick={() => setAnchor(d)} style={{
                        border: `1.5px ${dragAccessId && touchOverDay !== iso ? "dashed" : "solid"} ${touchOverDay === iso ? "#94a3b8" : dragAccessId ? THEME.border : sel ? THEME.teal : THEME.border}`,
                        background: touchOverDay === iso ? "#f1f5f9" : sel ? THEME.teal : "#fff",
                        color: touchOverDay === iso ? "#164e63" : sel ? "#fff" : THEME.text,
                        borderRadius: 12, padding: "7px 0 6px", cursor: "pointer",
                        transform: touchOverDay === iso ? "scale(1.08)" : "none",
                        transition: "transform .12s ease, background .12s ease",
                      }}>
                        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: .5, color: sel ? "#ccfbf1" : isToday ? THEME.tealDark : THEME.label }}>{DOW_LABELS[i + 1]}</div>
                        <div style={{ fontSize: 15.5, fontWeight: 800 }}>{d.getDate()}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: sel ? "#ccfbf1" : THEME.mutedLight }}>{count > 0 ? `${count} acc.` : "—"}</div>
                      </button>
                    );
                  })}
                </div>

                <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {(() => {
                    const chiuso = closedDatesSet.has(anchorISO);
                    return (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 8,
                        background: chiuso ? "#fef2f2" : THEME.panelSoft,
                        border: `1px solid ${chiuso ? "#fecaca" : THEME.borderSoft}`,
                        borderRadius: 10, padding: "8px 11px",
                      }}>
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: chiuso ? THEME.red : THEME.mutedLight }}>
                          {chiuso ? "Giorno chiuso" : "Giorno lavorativo"}
                        </span>
                        <button onClick={() => toggleGiornoChiuso(anchorISO)} style={{
                          padding: "6px 11px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                          border: `1px solid ${chiuso ? THEME.border : "#fecaca"}`,
                          background: chiuso ? "#fff" : "#fef2f2", color: chiuso ? THEME.text : THEME.red,
                        }}>
                          {chiuso ? "Riapri" : "Non lavoro"}
                        </button>
                      </div>
                    );
                  })()}
                  {!loading && dayAccesses.length >= 2 && (() => {
                    const g = giroInfo(anchorISO);
                    if (!g.giro && g.ritorni.length === 0) return null;
                    return (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                        background: "#fff", border: `1px solid ${THEME.borderSoft}`,
                        borderRadius: 10, padding: "8px 11px",
                      }}>
                        {g.giro && (
                          <a href={g.giro.url} target="_blank" rel="noopener noreferrer"
                            onClick={() => { if (g.giro!.tagliate > 0) notify.warning(`Maps accetta 10 tappe: escluse le ultime ${g.giro!.tagliate}`); }}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none",
                              border: `1px solid ${THEME.border}`, borderRadius: 99, background: "#fff",
                              padding: "6px 12px", fontSize: 12, fontWeight: 700, color: THEME.text,
                            }}>
                            <Icon name="pin" size={13} color={THEME.tealDark} /> Giro in Maps
                          </a>
                        )}
                        {g.ritorni.length > 0 && (
                          <>
                            <button onClick={() => reorderByZone(anchorISO)} style={{
                              border: `1px solid ${THEME.border}`, borderRadius: 99, background: "#fff",
                              padding: "6px 12px", fontSize: 12, fontWeight: 700, color: THEME.text, cursor: "pointer",
                            }}>Riordina per zona</button>
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#92400e" }}>
                              ritorni su {g.ritorni.join(", ")}
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })()}
                  {loading && <div style={{ textAlign: "center", color: THEME.mutedLight, fontSize: 13, padding: 24 }}>Carico…</div>}
                  {!loading && dayAccesses.length === 0 && (
                    <div style={{ textAlign: "center", color: THEME.mutedLight, fontSize: 13, padding: "26px 10px", background: "#fff", borderRadius: 14, border: `1px dashed ${THEME.border}` }}>
                      Nessun accesso {fmtShort(anchor)}.
                    </div>
                  )}
                  {dayAccesses.map(a => {
                    const p = patientById.get(a.coop_patient_id);
                    if (!p) return null;
                    const coop = coopById.get(p.cooperative_id);
                    const prog = progressivo.get(`${p.id}|${a.data}`);
                    const fatto = a.stato === "fatto";
                    const saltato = a.stato === "saltato";
                    return (
                      <div key={a.id}
                        data-access-card={a.id} data-access-day={a.data}
                        {...accessTouchHandlers(a)}
                        onClick={() => { if (suppressClickRef.current) return; setPatientModal({ open: true, patient: p, startWithPhoto: false }); }}
                        style={{
                        cursor: "pointer",
                        background: coopTint(coop?.colore || THEME.teal), borderRadius: 14,
                        border: `1px ${dragAccessId === a.id ? "dashed" : "solid"} ${coop?.colore || THEME.teal}`,
                        padding: "12px 14px", opacity: dragAccessId === a.id ? .35 : saltato ? .55 : 1,
                        boxShadow: dropIndicator(a.id),
                        userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
                      } as React.CSSProperties}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: THEME.text, textDecoration: saltato ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {displayName(`${p.cognome} ${p.nome}`)}
                            </div>
                            {coop?.nome && <div style={{ fontSize: 10.5, fontWeight: 700, color: coop.colore || THEME.tealDark, textTransform: "uppercase", letterSpacing: .3, marginTop: 1 }}>{coop.nome}</div>}
                            <div style={{ fontSize: 12.5, color: THEME.mutedLight, fontWeight: 600, marginTop: 2 }}>
                              {[p.residenza, p.citta].filter(Boolean).join(", ") || p.prestazione}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: THEME.tealDark }}>{a.orario || "—"}</div>
                            {studioConflicts(a.data, a.orario).length > 0 && (
                              <div style={{ fontSize: 9.5, fontWeight: 700, color: THEME.red, whiteSpace: "nowrap" }}
                                title={studioConflicts(a.data, a.orario).map(x => `${minToHHMM(x.from)} ${x.nome}`).join(", ")}>
                                ⚠ studio
                              </div>
                            )}
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: saltato ? THEME.red : THEME.mutedLight }}>
                              {saltato ? "Saltato" : prog ? `Accesso ${prog}${p.tot_accessi ? `/${p.tot_accessi}` : ""}` : ""}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          {!saltato && (
                            <button onClick={e => { e.stopPropagation(); toggleFatto(a); }} style={{
                              flex: 1, border: fatto ? `1px solid ${THEME.borderSoft}` : "none",
                              borderRadius: 10, padding: "10px 0",
                              fontSize: 13.5, fontWeight: 800, cursor: "pointer",
                              background: fatto ? "#dcfce7" : THEME.teal,
                              color: fatto ? THEME.green : "#fff",
                            }}>
                              {fatto ? "✓ Fatto" : "Segna fatto"}
                            </button>
                          )}
                          {saltato && (
                            <button onClick={() => setSaltato(a)} style={{
                              flex: 1, border: `1px solid ${THEME.border}`, borderRadius: 10, padding: "10px 0",
                              fontSize: 13, fontWeight: 800, cursor: "pointer", background: "#fff", color: THEME.muted,
                            }}>↩ Ripristina</button>
                          )}
                          {mapsSearchUrl(p) && (
                            <a href={mapsSearchUrl(p)!} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{
                                width: 44, display: "flex", alignItems: "center", justifyContent: "center",
                                border: `1px solid ${THEME.border}`, borderRadius: 10, background: "#fff",
                                textDecoration: "none",
                              }} title={addrOf(p) || ""}>
                              <Icon name="pin" size={16} color={THEME.tealDark} />
                            </a>
                          )}
                          {telHref(p.recapiti) && (
                            <a href={telHref(p.recapiti)!} onClick={e => e.stopPropagation()} style={{
                              width: 44, display: "flex", alignItems: "center", justifyContent: "center",
                              border: `1px solid ${THEME.border}`, borderRadius: 10, background: "#fff",
                              textDecoration: "none",
                            }} title={displayPhone(p.recapiti)}>
                              <Icon name="phone" size={16} color={THEME.tealDark} />
                            </a>
                          )}
                          <div style={{ position: "relative" }}>
                            <button onClick={e => { e.stopPropagation(); setMenuFor(m => m === a.id ? null : a.id); }} style={{ ...mBtnIcon(), height: "100%" }}>⋯</button>
                            {menuFor === a.id && (
                              <AccessMenu a={a} onSaltato={() => setSaltato(a)} onRemove={() => removeAccess(a)} onOrario={t => { updateOrario(a, t); setMenuFor(null); }} onClose={() => setMenuFor(null)} alignRight />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {!loading && (
                    <button onClick={() => setAddAccess({ open: true, dayISO: anchorISO })} style={{
                      border: `1.5px dashed ${THEME.border}`, background: "transparent", borderRadius: 12,
                      padding: "12px 0", fontSize: 13, fontWeight: 700, color: THEME.mutedLight, cursor: "pointer",
                    }}>
                      ＋ Aggiungi accesso {fmtShort(anchor)}
                    </button>
                  )}
                </div>
              </>
            )}

            {/* ── SETTIMANA: elenco per giorno ── */}
            {calView === "settimana" && (() => {
              const HOUR_PX = DW_HOUR_PX, H_START = DW_H_START, H_END = DW_H_END;
              const nDays = showSabDw ? 6 : 5;
              const now = new Date();
              const totCount = dwDays.reduce((s, d) => s + (accByDay.get(localISO(d)) || []).length, 0);
              const doneCount = dwDays.reduce((s, d) => s + (accByDay.get(localISO(d)) || []).filter(a => a.stato === "fatto").length, 0);
              const nConflitti = !showStudio ? 0 : dwDays.reduce((s, d) => {
                const iso2 = localISO(d);
                return s + (accByDay.get(iso2) || []).filter(a => studioConflicts(iso2, a.orario).length > 0).length;
              }, 0);
              return (
                <div style={{ padding: "0 16px" }}>
                  <div style={{ background: "#fff", border: `1px solid ${THEME.borderSoft}`, borderRadius: 14, overflow: "hidden", marginBottom: 10 }}>
                    {/* Intestazioni giorno: tap → apre il Giorno */}
                    <div style={{ display: "grid", gridTemplateColumns: `${DW_GUTTER}px repeat(${nDays},1fr)`, borderBottom: `1px solid ${THEME.borderSoft}` }}>
                      <div />
                      {dwDays.map((d, i) => {
                        const iso = localISO(d); const t = iso === todayISO;
                        return (
                          <button key={iso}
                            onClick={() => { if (suppressClickRef.current) return; setAnchor(d); setCalView("giorno"); }}
                            style={{
                              border: "none", cursor: "pointer", textAlign: "center", padding: "5px 0 6px",
                              background: t ? THEME.teal : "transparent",
                            }}>
                            <p style={{ margin: 0, fontSize: 8, fontWeight: 700, letterSpacing: ".04em", color: t ? "rgba(255,255,255,.88)" : THEME.label }}>{DOW_LABELS[i + 1]}</p>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t ? "#fff" : THEME.text }}>{d.getDate()}</p>
                          </button>
                        );
                      })}
                    </div>
                    {/* Corpo 7→20, come l'agenda */}
                    <div ref={dwGridRef} style={{ display: "grid", gridTemplateColumns: `${DW_GUTTER}px repeat(${nDays},1fr)`, height: (H_END - H_START) * HOUR_PX }}>
                      <div style={{ position: "relative" }}>
                        {Array.from({ length: H_END - H_START }, (_, i) => (
                          i === 0 ? null : (
                            <span key={i} style={{ position: "absolute", top: i * HOUR_PX, right: 3, transform: "translateY(-50%)", fontSize: 7.5, fontWeight: 700, color: THEME.label }}>{H_START + i}</span>
                          )
                        ))}
                      </div>
                      {dwDays.map((d, dayIdx) => {
                        const iso = localISO(d);
                        const t = iso === todayISO;
                        const list = accByDay.get(iso) || [];
                        const pos = layoutDay(list);
                        const isTarget = dwOver?.dayIdx === dayIdx;
                        const chiuso = closedDatesSet.has(iso);
                        const colBg = chiuso
                          ? (isTarget ? "rgba(239,68,68,0.10)" : "rgba(239,68,68,0.05)")
                          : isTarget ? "rgba(100,116,139,0.08)"
                          : t ? "rgba(13,148,136,0.045)" : "transparent";
                        return (
                          <div key={iso} data-drop-day={iso}
                            style={{
                              position: "relative",
                              borderLeft: `1px solid ${THEME.borderSoft}`,
                              background: `repeating-linear-gradient(to bottom,${colBg} 0,${colBg} ${HOUR_PX - 1}px,${THEME.borderSoft} ${HOUR_PX - 1}px,${THEME.borderSoft} ${HOUR_PX}px)`,
                            }}>
                            {/* Agenda studio in trasparenza, dietro le card e non cliccabile */}
                            {showStudio && (studioByDay.get(iso) || []).map(g => {
                              if (g.to <= H_START * 60 || g.from >= H_END * 60) return null;
                              const gTop = Math.max(0, ((g.from - H_START * 60) / 60) * HOUR_PX);
                              const gH = Math.max(13, ((Math.min(g.to, H_END * 60) - Math.max(g.from, H_START * 60)) / 60) * HOUR_PX - 1);
                              return (
                                <div key={`s-${g.id}`} style={{
                                  position: "absolute", top: gTop, height: gH, left: 1, right: 1,
                                  borderRadius: 6, background: "rgba(100,116,139,0.10)",
                                  border: "1px dashed #cbd5e1", zIndex: 1, pointerEvents: "none",
                                  overflow: "hidden", padding: "0 4px",
                                }}>
                                  <span style={{ fontSize: 7.5, fontWeight: 700, color: "#475569", whiteSpace: "nowrap" }}>
                                    {minToHHMM(g.from)} {g.nome}
                                  </span>
                                </div>
                              );
                            })}
                            {list.map(a => {
                              const p = patientById.get(a.coop_patient_id);
                              if (!p) return null;
                              const coop = coopById.get(p.cooperative_id);
                              const c = coop?.colore || THEME.teal;
                              const saltato = a.stato === "saltato";
                              const top = ((pos.get(a.id) ?? 0) / 60) * HOUR_PX;
                              const height = (DW_SLOT_MIN / 60) * HOUR_PX - 2;
                              const cognome = displayName(`${p.cognome}`);
                              const conf = studioConflicts(iso, a.orario);
                              return (
                                <button key={a.id}
                                  data-access-card={a.id} data-access-day={a.data}
                                  {...dwDragHandlers(a)}
                                  title={conf.length ? `Si accavalla con: ${conf.map(x => `${minToHHMM(x.from)} ${x.nome}`).join(", ")}` : undefined}
                                  onClick={e => { e.stopPropagation(); if (suppressClickRef.current) return; setPatientModal({ open: true, patient: p, startWithPhoto: false }); }}
                                  style={{
                                    position: "absolute", top, height, left: 1.5, right: 1.5, zIndex: 3,
                                    border: `1.5px solid ${c}`,
                                    borderLeft: conf.length ? "3px solid #ef4444" : `1.5px solid ${c}`,
                                    borderRadius: 6, background: `${c}12`,
                                    padding: "2px 5px", overflow: "hidden", textAlign: "left",
                                    cursor: "pointer", display: "block", touchAction: "none",
                                    opacity: dwDragId === a.id ? 0.22 : saltato ? 0.5 : 1,
                                    userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
                                  } as React.CSSProperties}>
                                  <p style={{
                                    margin: 0, fontSize: 10, fontWeight: 700, lineHeight: 1.15,
                                    color: THEME.text, overflow: "hidden",
                                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                                    whiteSpace: "normal", overflowWrap: "anywhere",
                                    textDecoration: saltato ? "line-through" : "none",
                                  } as React.CSSProperties}>{cognome}</p>
                                </button>
                              );
                            })}
                            {isTarget && dwOver && (() => {
                              const tgtOrario = minToHHMM(H_START * 60 + dwOver.startMin);
                              const allarme = chiuso || studioConflicts(iso, tgtOrario).length > 0;
                              return (
                                <div style={{
                                  position: "absolute", left: 2, right: 2,
                                  top: (dwOver.startMin / 60) * HOUR_PX,
                                  height: (DW_SLOT_MIN / 60) * HOUR_PX - 2,
                                  border: `1.5px dashed ${allarme ? "#ef4444" : "#94a3b8"}`, borderRadius: 6,
                                  background: allarme ? "rgba(239,68,68,0.10)" : "rgba(100,116,139,0.10)",
                                  zIndex: 5, pointerEvents: "none",
                                }} />
                              );
                            })()}
                            {t && (() => {
                              const nh = now.getHours() + now.getMinutes() / 60;
                              if (nh < H_START || nh > H_END) return null;
                              return <div style={{ position: "absolute", left: 0, right: 0, top: (nh - H_START) * HOUR_PX, height: 2, background: "#C0392B", zIndex: 2 }} />;
                            })()}
                          </div>
                        );
                      })}
                    </div>
                    {/* Totali + Sabato */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderTop: `1px solid ${THEME.borderSoft}` }}>
                      <button onClick={() => setShowSabDw(v => !v)} style={{
                        border: `1px solid ${THEME.border}`,
                        background: showSabDw ? "#f1f5f9" : "#fff",
                        color: showSabDw ? THEME.text : "#475569",
                        fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 99, cursor: "pointer", flexShrink: 0,
                      }}>{showSabDw ? "Sab ✓" : "Sab"}</button>
                      <button onClick={togglePropaga}
                        title="Se attivo, l'ora che imposti trascinando vale anche per gli altri giorni dello stesso paziente"
                        style={{
                          border: `1px solid ${THEME.border}`,
                          background: propagaOrario ? "#f1f5f9" : "#fff",
                          color: propagaOrario ? THEME.text : "#475569",
                          fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 99,
                          cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
                        }}>{propagaOrario ? "Tutti i giorni ✓" : "Solo questo"}</button>
                      <button onClick={() => setShowStudio(v => !v)}
                        title="Mostra in trasparenza gli appuntamenti del calendario studio"
                        style={{
                          border: `1px solid ${THEME.border}`,
                          background: showStudio ? "#f1f5f9" : "#fff",
                          color: showStudio ? THEME.text : "#475569",
                          fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 99,
                          cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
                        }}>{showStudio ? "Studio ✓" : "Studio"}</button>
                      <button onClick={copiaScalettaProssima} disabled={copiaBusy}
                        title="Applica l'ordine del giro di questa settimana alla prossima"
                        style={{
                          border: `1px solid ${THEME.border}`, background: "#fff", color: "#475569",
                          fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 99,
                          cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap", opacity: copiaBusy ? .6 : 1,
                        }}>{copiaBusy ? "Copio…" : "Copia →"}</button>
                      <span style={{ fontSize: 10, fontWeight: 700, marginLeft: "auto", whiteSpace: "nowrap", color: nConflitti > 0 ? THEME.red : THEME.text }}>
                        {nConflitti > 0 ? `${nConflitti} sovrapp.` : `${totCount} · ${doneCount} fatti`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── MESE: come il mese del calendario ── */}
            {calView === "mese" && (
              <div style={{
                background: "#fff", marginBottom: 10,
                borderTop: `1px solid ${THEME.borderSoft}`, borderBottom: `1px solid ${THEME.borderSoft}`,
              }}>
                {/* Intestazioni Lun–Sab */}
                <div style={{
                  display: "grid", gridTemplateColumns: `repeat(${showSabDw ? 6 : 5},1fr)`,
                  borderBottom: `1px solid ${THEME.borderSoft}`, background: THEME.panelSoft,
                }}>
                  {(showSabDw ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]).map(d => (
                    <div key={d} style={{ textAlign: "center", padding: "7px 0", fontSize: 9, fontWeight: 700, color: THEME.label }}>
                      {DOW_LABELS[d]}
                    </div>
                  ))}
                </div>
                {/* Celle */}
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${showSabDw ? 6 : 5},1fr)` }}>
                  {monthWeeks.map((week, wi) => (
                    (showSabDw ? week : week.slice(0, 5)).map((d, di) => {
                      const iso = localISO(d);
                      const inMonth = d.getMonth() === anchor.getMonth();
                      const isToday = iso === todayISO;
                      const cols = showSabDw ? 6 : 5;
                      const list = accByDay.get(iso) || [];
                      const chiuso = closedDatesSet.has(iso);
                      return (
                        <div key={`${wi}-${iso}`}
                          onClick={() => setMonthSheetDay(iso)}
                          style={{
                            minHeight: 60, padding: "4px 3px", cursor: "pointer",
                            borderRight: di < cols - 1 ? `1px solid ${THEME.borderSoft}` : "none",
                            borderBottom: `1px solid ${THEME.borderSoft}`,
                            background: chiuso ? "#fef2f2" : isToday ? "rgba(13,148,136,0.05)" : "transparent",
                            opacity: inMonth ? 1 : 0.45,
                          }}>
                          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: 3 }}>
                            <span style={{
                              fontSize: 11, fontWeight: 700,
                              color: isToday ? "#fff" : THEME.text,
                              ...(isToday ? {
                                background: THEME.teal, borderRadius: "50%", width: 18, height: 18,
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                              } : {}),
                            }}>{d.getDate()}</span>
                          </div>
                          {list.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                              {list.slice(0, 3).map(a => {
                                const p = patientById.get(a.coop_patient_id);
                                if (!p) return null;
                                const coop = coopById.get(p.cooperative_id);
                                const c = coop?.colore || THEME.teal;
                                return (
                                  <div key={a.id} style={{
                                    fontSize: 8, fontWeight: 700, lineHeight: 1.3,
                                    color: THEME.text, background: `${c}1f`,
                                    borderRadius: 3, padding: "1px 3px",
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    textDecoration: a.stato === "saltato" ? "line-through" : "none",
                                  }}>{displayName(`${p.cognome}`)}</div>
                                );
                              })}
                              {list.length > 3 && (
                                <div style={{ fontSize: 8, fontWeight: 700, color: "#475569", paddingLeft: 2 }}>
                                  +{list.length - 3}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px" }}>
                  <button onClick={() => setShowSabDw(v => !v)} style={{
                    border: `1px solid ${THEME.border}`,
                    background: showSabDw ? "#f1f5f9" : "#fff",
                    color: showSabDw ? THEME.text : "#475569",
                    fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 99, cursor: "pointer",
                  }}>{showSabDw ? "Sab ✓" : "Sab"}</button>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#475569" }}>tocca un giorno per vederlo</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── PAZIENTI ── */}
        {mobileView === "pazienti" && activeCoops.length > 0 && (
          <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {scopePatients.length === 0 && !loading && (
              <div style={{ textAlign: "center", color: THEME.mutedLight, fontSize: 13, padding: "26px 10px", background: "#fff", borderRadius: 14, border: `1px dashed ${THEME.border}` }}>
                Nessun paziente. Aggiungi un PAI col tasto qui sotto.
              </div>
            )}
            {scopePatients.map(p => (
              <PatientCard
                key={p.id} p={p} coop={coopById.get(p.cooperative_id)}
                counters={countersByPatient.get(p.id)}
                displayName={displayName}
                onClick={() => setPatientModal({ open: true, patient: p, startWithPhoto: false })}
              />
            ))}
            <button onClick={() => setPatientModal({ open: true, patient: null, startWithPhoto: false })} style={{
              border: `1.5px dashed ${THEME.border}`, background: "transparent", borderRadius: 12,
              padding: "12px 0", fontSize: 13, fontWeight: 700, color: THEME.mutedLight, cursor: "pointer",
            }}>
              ＋ Nuovo paziente PAI
            </button>
          </div>
        )}

        {/* FAB foto */}
        {activeCoops.length > 0 && (
          <button
            onClick={() => setPatientModal({ open: true, patient: null, startWithPhoto: true })}
            style={{
              position: "fixed", right: 18, bottom: 92, zIndex: 800,
              width: 58, height: 58, borderRadius: "50%", border: "none",
              background: THEME.teal, color: "#fff", fontSize: 24, cursor: "pointer",
              boxShadow: "0 8px 20px rgba(15,23,42,.28)",
            }}
            title="Nuovo PAI da foto"
          ><Icon name="plus" size={22} color="#fff" /></button>
        )}

        {/* Foglio documenti: report / planner / messaggio */}
        {docSheet && (
          <MobileDocSheet
            onClose={() => setDocSheet(false)}
            onReport={() => { setDocSheet(false); setReportOpen(true); }}
            onPlanner={() => { setDocSheet(false); openPlanner(); }}
            onConsuntivo={() => { setDocSheet(false); openConsuntivoPdf(); }}
            onConsuntivoCsv={() => { setDocSheet(false); openConsuntivoCsv(); }}
            onMessage={() => { setDocSheet(false); setMsgOpen(true); }}
          />
        )}

        {/* Mese: dettaglio del giorno toccato */}
        {monthSheetDay && (() => {
          const [yy, mm, dd] = monthSheetDay.split("-").map(Number);
          const d = new Date(yy, mm - 1, dd, 12);
          const list = accByDay.get(monthSheetDay) || [];
          return (
            <>
              <div onClick={() => setMonthSheetDay(null)} style={{
                position: "fixed", inset: 0, background: "rgba(15,23,42,.35)", zIndex: 900,
              }} />
              <div style={{
                position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 901,
                background: "#fff", borderRadius: "16px 16px 0 0",
                maxHeight: "70vh", overflowY: "auto",
                boxShadow: "0 -8px 30px rgba(15,23,42,.22)",
                paddingBottom: 18,
              }}>
                <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
                  <span style={{ width: 36, height: 4, borderRadius: 99, background: THEME.border }} />
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "6px 16px 10px",
                  borderBottom: `1px solid ${THEME.borderSoft}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: THEME.text }}>
                      {DOW_LABELS_FULL[d.getDay() === 0 ? 7 : d.getDay()]} {d.getDate()}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: "#475569" }}>
                      {list.length > 0 ? `${list.length} accessi` : "Nessun accesso"}
                    </p>
                  </div>
                  <button onClick={() => { setAnchor(d); setCalView("giorno"); setMonthSheetDay(null); }} style={{
                    border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.text,
                    fontSize: 12, fontWeight: 700, padding: "7px 12px", borderRadius: 9, cursor: "pointer",
                  }}>Apri giorno</button>
                </div>
                {list.map(a => {
                  const p = patientById.get(a.coop_patient_id);
                  if (!p) return null;
                  const coop = coopById.get(p.cooperative_id);
                  const fatto = a.stato === "fatto";
                  const saltato = a.stato === "saltato";
                  return (
                    <div key={a.id}
                      onClick={() => { setMonthSheetDay(null); setPatientModal({ open: true, patient: p, startWithPhoto: false }); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 9,
                        padding: "10px 16px", borderBottom: `1px solid ${THEME.borderSoft}`,
                        cursor: "pointer", opacity: saltato ? .55 : 1,
                      }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: coop?.colore || THEME.teal, flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#475569", width: 42, flexShrink: 0 }}>{a.orario ? a.orario.slice(0, 5) : "—"}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: "block", fontSize: 13.5, fontWeight: 700, color: THEME.text,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          textDecoration: saltato ? "line-through" : "none",
                        }}>{displayName(`${p.cognome} ${p.nome}`)}</span>
                        {p.citta && <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#475569" }}>{p.citta}</span>}
                      </span>
                      {mapsSearchUrl(p) && (
                        <a href={mapsSearchUrl(p)!} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{
                            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            border: `1px solid ${THEME.border}`, background: "#fff", textDecoration: "none",
                          }} title={addrOf(p) || ""}>
                          <Icon name="pin" size={15} color={THEME.tealDark} />
                        </a>
                      )}
                      {!saltato && (
                        <button onClick={e => { e.stopPropagation(); toggleFatto(a); }} style={{
                          width: 34, height: 34, borderRadius: 9, cursor: "pointer", flexShrink: 0,
                          border: `1px solid ${fatto ? "#bbf7d0" : THEME.border}`,
                          background: fatto ? "#dcfce7" : "#fff",
                          color: fatto ? THEME.green : "#475569",
                          fontSize: 15, fontWeight: 700,
                        }}>✓</button>
                      )}
                    </div>
                  );
                })}
                {list.length === 0 && (
                  <div style={{ padding: "18px 16px", fontSize: 12.5, color: "#475569" }}>
                    Nessun accesso programmato in questo giorno.
                  </div>
                )}
              </div>
            </>
          );
        })()}

        <MobileTabBar />
        {rinnovoModal}
        {sharedModals}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VISTA DESKTOP (≥ 768px)
  // ═══════════════════════════════════════════════════════════════════════
  const anchorISO = localISO(anchor);
  const dayList = accByDay.get(anchorISO) || [];

  return (
    <div style={{ minHeight: "100vh", background: THEME.appBg, color: THEME.text, overflowX: "hidden" }}>
      <AppNavbar active="domicili" onRefresh={refreshAll} />

      <div style={{ maxWidth: 1380, margin: "0 auto", padding: "22px 24px 40px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: THEME.text }}>Domicili Cooperative</div>
            <div style={{ fontSize: 13, color: THEME.mutedLight, fontWeight: 600, marginTop: 2 }}>
              Pazienti PAI a domicilio — sezione separata: non entra in anagrafica, report, contabilità o Sistema TS.
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8, background: "#fff", border: `1px solid ${THEME.border}`, borderRadius: 10, padding: "6px 12px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: THEME.mutedLight, textTransform: "uppercase", letterSpacing: .4 }}>Accessi {fmtMonthYear(anchor)}</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: THEME.tealDark }}>{accessCounts.monthTot}</span>
            </div>
          </div>
          <button onClick={() => setPatientModal({ open: true, patient: null, startWithPhoto: true })} style={dBtn("pri")}>
            Nuovo PAI da foto
          </button>
          <button onClick={() => setPatientModal({ open: true, patient: null, startWithPhoto: false })} style={dBtn()}>
            <Icon name="plus" size={15} color={THEME.text} /> Manuale
          </button>
          <button onClick={() => setReportOpen(true)} style={dBtn()}>Report</button>
          <button onClick={openPlanner} style={dBtn()}>Planner</button>
          <button onClick={openConsuntivoPdf} style={dBtn()} title="PDF del mese visualizzato, per la fatturazione alle cooperative">Consuntivo</button>
          <button onClick={openConsuntivoCsv} style={dBtn()} title="Stesso contenuto in CSV per Excel">CSV</button>
          <button onClick={() => setMsgOpen(true)} style={dBtn()}>Messaggio</button>
          <div style={{ position: "relative" }}>
            <button onClick={() => setSettingsOpen(o => !o)} style={{ ...dBtn(), padding: "10px 12px" }} title="Impostazioni sezione">
              <Icon name="settings" size={16} color={THEME.muted} />
            </button>
            {settingsPanel}
          </div>
        </div>

        {/* Tab cooperative */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          <CoopPill label="Tutte" active={selectedCoopId === "all"} color={THEME.teal} onClick={() => setSelectedCoopId("all")} />
          {activeCoops.map(c => (
            <div key={c.id} style={{ display: "flex", alignItems: "center" }}>
              <CoopPill
                label={c.nome} logo={c.logo_url} color={c.colore}
                count={patientsCountByCoop.get(c.id) || 0}
                active={selectedCoopId === c.id}
                onClick={() => setSelectedCoopId(c.id)}
              />
              {selectedCoopId === c.id && (
                <button onClick={() => setCoopModal({ open: true, coop: c })} title="Modifica cooperativa" style={{
                  border: "none", background: "transparent", cursor: "pointer", marginLeft: 2, padding: 4,
                }}>
                  <Icon name="edit" size={14} color={THEME.label} />
                </button>
              )}
            </div>
          ))}
          <button onClick={() => setCoopModal({ open: true, coop: null })} style={{
            border: `1.5px dashed ${THEME.border}`, background: "transparent",
            borderRadius: 999, padding: "9px 16px", fontSize: 12.5, fontWeight: 700,
            color: THEME.mutedLight, cursor: "pointer",
          }}>
            ＋ Cooperativa
          </button>
        </div>

        {activeCoops.length === 0 && !loading && (
          <EmptyCoops onPreset={quickCreatePreset} onCustom={() => setCoopModal({ open: true, coop: null })} isMobile={false} />
        )}

        {activeCoops.length > 0 && (
          <>
            {/* Switch Calendario | Pazienti */}
            <div style={{ display: "inline-flex", background: "#e2e8f0", borderRadius: 11, padding: 3, marginBottom: 14 }}>
              {(["calendario", "pazienti"] as const).map(v => (
                <button key={v} onClick={() => setMainView(v)} style={{
                  border: "none", borderRadius: 9, padding: "8px 20px",
                  fontSize: 13, fontWeight: 800, cursor: "pointer",
                  background: mainView === v ? "#fff" : "transparent",
                  color: mainView === v ? THEME.text : THEME.mutedLight,
                  boxShadow: mainView === v ? "0 1px 4px rgba(15,23,42,.12)" : "none",
                }}>
                  {v === "calendario" ? "Calendario" : `Pazienti (${scopePatients.length})`}
                </button>
              ))}
            </div>

            {/* ═══ VISTA CALENDARIO ═══ */}
            {mainView === "calendario" && (
              <div>
                {paiAlertsPanel && <div style={{ marginBottom: 12 }}>{paiAlertsPanel}</div>}

                {/* ── Pannello calendario ── */}
                <div style={{ background: THEME.panelBg, borderRadius: 16, border: `1px solid ${THEME.borderSoft}`, padding: 16 }}>
                  {/* Toolbar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                    <button onClick={() => stepDesktop(-1)} style={dBtnIcon()}>
                      <Icon name="chevronLeft" size={16} color={THEME.muted} />
                    </button>
                    <div style={{ fontSize: 15, fontWeight: 800, color: THEME.text, minWidth: 230, textAlign: "center" }}>
                      {calTitle}
                    </div>
                    <button onClick={() => stepDesktop(1)} style={dBtnIcon()}>
                      <Icon name="chevronRight" size={16} color={THEME.muted} />
                    </button>
                    <button onClick={goToday} style={{ ...dBtn(), padding: "7px 14px", fontSize: 12.5, color: THEME.tealDark }}>
                      Oggi
                    </button>
                    <ViewSwitch value={calView} onChange={setCalView} />
                    {pendingCount > 0 && (
                      <button onClick={() => flushPending()} style={{
                        border: "1px solid #fcd34d", background: "#fffbeb", color: "#92400e",
                        fontSize: 12, fontWeight: 700, padding: "7px 12px", borderRadius: 99,
                        cursor: "pointer", whiteSpace: "nowrap",
                      }}>⇅ {pendingCount} offline</button>
                    )}
                    <button onClick={() => setShowStudio(v => !v)}
                      title="Segnala gli accessi che si accavallano con il calendario studio"
                      style={{
                        border: `1px solid ${THEME.border}`,
                        background: showStudio ? "#f1f5f9" : "#fff",
                        color: showStudio ? THEME.text : "#475569",
                        fontSize: 12, fontWeight: 700, padding: "7px 12px", borderRadius: 99,
                        cursor: "pointer", whiteSpace: "nowrap",
                      }}>{showStudio ? "Studio ✓" : "Studio"}</button>
                    <div style={{ flex: 1 }} />
                    <Legend />
                  </div>
                  {trendPanel && <div style={{ marginBottom: 12 }}>{trendPanel}</div>}

                  {/* ── GIORNO ── */}
                  {calView === "giorno" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                      {(() => {
                        const iso = localISO(anchor);
                        const chiuso = closedDatesSet.has(iso);
                        return (
                          <div style={{
                            display: "flex", alignItems: "center", gap: 10, marginBottom: 4,
                            background: chiuso ? "#fef2f2" : THEME.panelSoft,
                            border: `1px solid ${chiuso ? "#fecaca" : THEME.borderSoft}`,
                            borderRadius: 10, padding: "9px 12px",
                          }}>
                            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: chiuso ? THEME.red : THEME.mutedLight }}>
                              {chiuso ? "Giorno chiuso — non lavori" : "Giorno lavorativo"}
                            </span>
                            <button onClick={() => toggleGiornoChiuso(iso)} style={{
                              padding: "7px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                              border: `1px solid ${chiuso ? THEME.border : "#fecaca"}`,
                              background: chiuso ? "#fff" : "#fef2f2", color: chiuso ? THEME.text : THEME.red,
                            }}>
                              {chiuso ? "Riapri questo giorno" : "Oggi non lavoro"}
                            </button>
                          </div>
                        );
                      })()}
                      {dayList.length >= 2 && (() => {
                        const g = giroInfo(localISO(anchor));
                        if (!g.giro && g.ritorni.length === 0) return null;
                        return (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {g.giro && (
                              <a href={g.giro.url} target="_blank" rel="noopener noreferrer"
                                onClick={() => { if (g.giro!.tagliate > 0) notify.warning(`Maps accetta 10 tappe: escluse le ultime ${g.giro!.tagliate}`); }}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none",
                                  border: `1px solid ${THEME.border}`, borderRadius: 99, background: "#fff",
                                  padding: "7px 13px", fontSize: 12.5, fontWeight: 700, color: THEME.text,
                                }}>
                                <Icon name="pin" size={13} color={THEME.tealDark} /> Giro in Maps
                              </a>
                            )}
                            {g.ritorni.length > 0 && (
                              <>
                                <button onClick={() => reorderByZone(localISO(anchor))} style={{
                                  border: `1px solid ${THEME.border}`, borderRadius: 99, background: "#fff",
                                  padding: "7px 13px", fontSize: 12.5, fontWeight: 700, color: THEME.text, cursor: "pointer",
                                }}>Riordina per zona</button>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e" }}>
                                  ritorni su {g.ritorni.join(", ")}
                                </span>
                              </>
                            )}
                          </div>
                        );
                      })()}
                      {dayList.length === 0 && !loading && (
                        <div style={{ padding: "30px 10px", textAlign: "center", fontSize: 13, color: THEME.mutedLight, border: `1px dashed ${THEME.border}`, borderRadius: 12 }}>
                          Nessun accesso in questo giorno.
                        </div>
                      )}
                      {dayList.map(a => {
                        const p = patientById.get(a.coop_patient_id);
                        if (!p) return null;
                        const coop = coopById.get(p.cooperative_id);
                        const prog = progressivo.get(`${p.id}|${a.data}`);
                        const fatto = a.stato === "fatto";
                        const saltato = a.stato === "saltato";
                        return (
                          <div key={a.id}
                            data-access-card={a.id} data-access-day={a.data}
                            {...accessTouchHandlers(a)}
                            onClick={() => { if (suppressClickRef.current) return; setPatientModal({ open: true, patient: p, startWithPhoto: false }); }}
                            style={{
                            cursor: dragAccessId === a.id ? "grabbing" : "grab",
                            userSelect: "none", WebkitUserSelect: "none",
                            position: "relative", display: "flex", alignItems: "center", gap: 12,
                            background: coopTint(coop?.colore || THEME.teal),
                            border: `1px solid ${coop?.colore || THEME.teal}`,
                            borderRadius: 12, padding: "11px 14px",
                            opacity: dragAccessId === a.id ? .35 : saltato ? .55 : 1,
                            boxShadow: dropIndicator(a.id),
                          } as React.CSSProperties}>
                            <input
                              type="checkbox" checked={fatto} disabled={saltato}
                              onClick={e => e.stopPropagation()} onChange={() => toggleFatto(a)}
                              style={{ accentColor: coop?.colore || THEME.teal, width: 17, height: 17, cursor: "pointer" }}
                            />
                            <div style={{ width: 52 }}>
                              <div style={{ fontSize: 15, fontWeight: 700, color: coop?.colore || THEME.tealDark }}>{a.orario || "—"}</div>
                              {studioConflicts(a.data, a.orario).length > 0 && (
                                <div style={{ fontSize: 9.5, fontWeight: 700, color: THEME.red, whiteSpace: "nowrap" }}
                                  title={studioConflicts(a.data, a.orario).map(x => `${minToHHMM(x.from)} ${x.nome}`).join(", ")}>
                                  ⚠ studio
                                </div>
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 15, fontWeight: 700, color: THEME.text, textDecoration: saltato ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {displayName(`${p.cognome} ${p.nome}`)}
                              </div>
                              {coop?.nome && <div style={{ fontSize: 10, fontWeight: 700, color: coop.colore || THEME.tealDark, textTransform: "uppercase", letterSpacing: .3 }}>{coop.nome}</div>}
                              <div style={{ fontSize: 12.5, color: THEME.mutedLight, fontWeight: 600 }}>
                                {[p.residenza, p.citta].filter(Boolean).join(", ")}
                                {p.recapiti ? `  ·  ${displayPhone(p.recapiti)}` : ""}
                              </div>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: saltato ? THEME.red : THEME.mutedLight, whiteSpace: "nowrap" }}>
                              {saltato ? "Saltato" : prog ? `${prog}${p.tot_accessi ? `/${p.tot_accessi}` : ""}` : ""}
                            </div>
                            {mapsSearchUrl(p) && (
                              <a href={mapsSearchUrl(p)!} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                title={addrOf(p) || ""}
                                style={{ display: "flex", alignItems: "center", padding: "2px 3px", textDecoration: "none" }}>
                                <Icon name="pin" size={15} color={THEME.tealDark} />
                              </a>
                            )}
                            {telHref(p.recapiti) && (
                              <a href={telHref(p.recapiti)!} onClick={e => e.stopPropagation()}
                                title={displayPhone(p.recapiti)}
                                style={{ display: "flex", alignItems: "center", padding: "2px 3px", textDecoration: "none" }}>
                                <Icon name="phone" size={15} color={THEME.tealDark} />
                              </a>
                            )}
                            <button onClick={e => { e.stopPropagation(); setMenuFor(m => m === a.id ? null : a.id); }} style={{
                              border: "none", background: "transparent", cursor: "pointer",
                              color: THEME.label, fontSize: 17, lineHeight: 1, padding: "2px 4px",
                            }}>⋯</button>
                            {menuFor === a.id && (
                              <AccessMenu a={a} onSaltato={() => setSaltato(a)} onRemove={() => removeAccess(a)} onOrario={t => { updateOrario(a, t); setMenuFor(null); }} onClose={() => setMenuFor(null)} alignRight />
                            )}
                          </div>
                        );
                      })}
                      <button onClick={() => setAddAccess({ open: true, dayISO: anchorISO })} style={{
                        border: `1px dashed ${THEME.border}`, background: "transparent",
                        borderRadius: 10, padding: "10px 0", fontSize: 12.5, fontWeight: 700,
                        color: THEME.mutedLight, cursor: "pointer",
                      }}>＋ Aggiungi accesso</button>
                    </div>
                  )}

                  {/* ── SETTIMANA ── */}
                  {calView === "settimana" && (
                    <>
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <button onClick={copiaScalettaProssima} disabled={copiaBusy}
                        title="Applica l'ordine del giro di questa settimana alla prossima"
                        style={{
                          border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.text,
                          fontSize: 11.5, fontWeight: 700, padding: "5px 11px", borderRadius: 99,
                          cursor: "pointer", marginRight: "auto", opacity: copiaBusy ? .6 : 1,
                        }}>{copiaBusy ? "Copio…" : "Copia ordine → prossima settimana"}</button>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: THEME.mutedLight }}>Totale settimana:</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: THEME.tealDark }}>{accessCounts.weekTot} accessi</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
                      {weekDays.map((d, i) => {
                        const iso = localISO(d);
                        const isToday = iso === todayISO;
                        const list = accByDay.get(iso) || [];
                        return (
                          <div key={iso}
                            data-drop-day={iso}
                            style={{
                            background: touchOverDay === iso && dragAccessId ? "#f1f5f9" : closedDatesSet.has(iso) ? "#fef2f2" : isToday ? "#f0fdfa" : THEME.panelSoft,
                            border: touchOverDay === iso && dragAccessId ? "1.5px solid #94a3b8" : `1px ${dragAccessId ? "dashed" : "solid"} ${closedDatesSet.has(iso) ? "#fecaca" : THEME.border}`,
                            borderRadius: 13, padding: "9px 8px 10px", minHeight: 190,
                            display: "flex", flexDirection: "column", gap: 7,
                            transition: "background .12s ease",
                          }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "0 2px" }}>
                              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: .6, color: isToday ? THEME.tealDark : THEME.label }}>
                                {DOW_LABELS[i + 1]}
                              </span>
                              <span style={{ fontSize: 13.5, fontWeight: 800, color: THEME.text }}>{d.getDate()}</span>
                              {isToday && <span style={{ fontSize: 9.5, fontWeight: 800, color: THEME.tealDark }}>OGGI</span>}
                              <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: THEME.mutedLight }}>
                                {accessCounts.perDay.get(localISO(d)) || 0}
                              </span>
                            </div>

                            {list.map(a => {
                              const p = patientById.get(a.coop_patient_id);
                              if (!p) return null;
                              const coop = coopById.get(p.cooperative_id);
                              const prog = progressivo.get(`${p.id}|${a.data}`);
                              const fatto = a.stato === "fatto";
                              const saltato = a.stato === "saltato";
                              const counters = countersByPatient.get(p.id);
                              const low = counters?.rimanenti != null && counters.rimanenti <= 3;
                              return (
                                <div key={a.id}
                                  data-access-card={a.id} data-access-day={a.data}
                                  {...accessTouchHandlers(a)}
                                  onClick={() => { if (suppressClickRef.current) return; setPatientModal({ open: true, patient: p, startWithPhoto: false }); }}
                                  style={{
                                  cursor: dragAccessId === a.id ? "grabbing" : "grab",
                                  userSelect: "none", WebkitUserSelect: "none",
                                  position: "relative",
                                  background: coopTint(coop?.colore || THEME.teal),
                                  border: `1px solid ${coop?.colore || THEME.teal}`,
                                  borderRadius: 9, padding: "7px 8px",
                                  opacity: dragAccessId === a.id ? .35 : saltato ? .5 : 1,
                                  boxShadow: dropIndicator(a.id),
                                } as React.CSSProperties}>
                                  <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                                    <input
                                      type="checkbox" checked={fatto} disabled={saltato}
                                      onClick={e => e.stopPropagation()} onChange={() => toggleFatto(a)}
                                      style={{ accentColor: coop?.colore || THEME.teal, width: 15, height: 15, cursor: "pointer", flexShrink: 0, marginTop: 1 }}
                                      title={fatto ? "Segnato fatto" : "Segna fatto"}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{
                                        fontSize: 12.5, fontWeight: 700, color: THEME.text,
                                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                        textDecoration: saltato ? "line-through" : "none",
                                      }}>
                                        {displayName(`${p.cognome} ${p.nome}`)}
                                      </div>
                                      <div style={{ fontSize: 10.5, color: THEME.mutedLight, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {a.orario || "—"}{p.citta ? ` · ${p.citta}` : ""}
                                        {studioConflicts(a.data, a.orario).length > 0 && (
                                          <span style={{ color: THEME.red, fontWeight: 700 }}
                                            title={studioConflicts(a.data, a.orario).map(x => `${minToHHMM(x.from)} ${x.nome}`).join(", ")}> · ⚠ studio</span>
                                        )}
                                      </div>
                                      <div style={{ fontSize: 10, color: saltato ? THEME.red : THEME.label, fontWeight: 700 }}>
                                        {saltato ? "saltato" : prog ? `${prog}${p.tot_accessi ? `/${p.tot_accessi}` : ""}` : ""}
                                        {low && !saltato && <span style={{ color: THEME.red }}> !</span>}
                                      </div>
                                    </div>
                                    <button onClick={e => { e.stopPropagation(); setMenuFor(m => m === a.id ? null : a.id); }} style={{
                                      border: "none", background: "transparent", cursor: "pointer",
                                      color: THEME.label, fontSize: 15, lineHeight: 1, padding: "2px 3px", flexShrink: 0,
                                    }}>⋯</button>
                                  </div>
                                  {menuFor === a.id && (
                                    <AccessMenu a={a} onSaltato={() => setSaltato(a)} onRemove={() => removeAccess(a)} onOrario={t => { updateOrario(a, t); setMenuFor(null); }} onClose={() => setMenuFor(null)} />
                                  )}
                                </div>
                              );
                            })}

                            <button onClick={() => setAddAccess({ open: true, dayISO: iso })} style={{
                              marginTop: "auto", border: `1px dashed ${THEME.border}`, background: "transparent",
                              borderRadius: 8, padding: "5px 0", fontSize: 11, fontWeight: 700,
                              color: THEME.label, cursor: "pointer",
                            }}>＋</button>
                          </div>
                        );
                      })}
                    </div>
                    </>
                  )}

                  {/* ── MESE ── */}
                  {calView === "mese" && (
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 8 }}>
                        {[1, 2, 3, 4, 5, 6].map(d => (
                          <div key={d} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, letterSpacing: .6, color: THEME.label }}>{DOW_LABELS[d]}</div>
                        ))}
                      </div>
                      {monthWeeks.map((week, wi) => (
                        <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 8, alignItems: "stretch" }}>
                          {week.map(d => {
                            const iso = localISO(d);
                            const inMonth = d.getMonth() === anchor.getMonth();
                            const isToday = iso === todayISO;
                            const list = accByDay.get(iso) || [];
                            // Espansa di default. In modalità compatta mostra 3 righe,
                            // salvo i giorni che hai aperto singolarmente col "+N altri".
                            const compact = mesePiuCompatto && !meseGiorniAperti.has(iso);
                            const shown = compact ? list.slice(0, 3) : list;
                            return (
                              <div key={iso}
                                style={{
                                  background: isToday ? "#f0fdfa" : inMonth ? "#fff" : "#f8fafc",
                                  border: `1px solid ${THEME.borderSoft}`,
                                  borderRadius: 11, padding: "7px 8px", minHeight: 92,
                                  display: "flex", flexDirection: "column",
                                }}>
                                {/* Il numero del giorno porta alla vista Giorno */}
                                <button
                                  onClick={() => { setAnchor(d); setCalView("giorno"); }}
                                  title="Apri questo giorno"
                                  style={{
                                    alignSelf: "flex-start", border: "none", background: "transparent",
                                    padding: 0, marginBottom: 4, cursor: "pointer",
                                    fontSize: 12.5, fontWeight: 700,
                                    color: inMonth ? (isToday ? THEME.tealDark : THEME.text) : THEME.placeholder,
                                  }}>
                                  {d.getDate()}
                                </button>
                                {/* Gli accessi: click sul paziente → scheda */}
                                {shown.map(a => {
                                  const p = patientById.get(a.coop_patient_id);
                                  if (!p) return null;
                                  const coop = coopById.get(p.cooperative_id);
                                  const fatto = a.stato === "fatto";
                                  const saltato = a.stato === "saltato";
                                  return (
                                    <button key={a.id}
                                      onClick={() => setPatientModal({ open: true, patient: p, startWithPhoto: false })}
                                      title={`${p.cognome} ${p.nome}`}
                                      style={{
                                        display: "flex", alignItems: "center", gap: 4, marginBottom: 2,
                                        width: "100%", border: "none", background: "transparent",
                                        padding: 0, textAlign: "left", cursor: "pointer",
                                        opacity: saltato ? .5 : 1,
                                      }}>
                                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: coop?.colore || THEME.teal, flexShrink: 0 }} />
                                      <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", flexShrink: 0 }}>{a.orario ? a.orario.slice(0, 5) : ""}</span>
                                      <span style={{
                                        fontSize: 10.5, fontWeight: 700, color: THEME.textSoft,
                                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                        textDecoration: saltato ? "line-through" : "none",
                                      }}>
                                        {displayName(`${p.cognome}`)}
                                      </span>
                                      {fatto && <span style={{ fontSize: 10, color: THEME.green, fontWeight: 700, marginLeft: "auto" }}>✓</span>}
                                    </button>
                                  );
                                })}
                                {/* "+N altri" espande SOLO questo giorno, restando nel mese */}
                                {compact && list.length > 3 && (
                                  <button
                                    onClick={() => setMeseGiorniAperti(prev => new Set(prev).add(iso))}
                                    style={{
                                      alignSelf: "flex-start", border: "none", background: "transparent",
                                      padding: 0, marginTop: 1, cursor: "pointer",
                                      fontSize: 10, fontWeight: 700, color: "#475569", textDecoration: "underline",
                                    }}>
                                    +{list.length - 3} altri
                                  </button>
                                )}
                                {!compact && mesePiuCompatto && list.length > 3 && (
                                  <button
                                    onClick={() => setMeseGiorniAperti(prev => { const n = new Set(prev); n.delete(iso); return n; })}
                                    style={{
                                      alignSelf: "flex-start", border: "none", background: "transparent",
                                      padding: 0, marginTop: 1, cursor: "pointer",
                                      fontSize: 10, fontWeight: 700, color: "#475569", textDecoration: "underline",
                                    }}>
                                    mostra meno
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      {/* Comando in basso: compatta / espandi tutto */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 2 }}>
                        <button
                          onClick={() => { setMesePiuCompatto(v => !v); setMeseGiorniAperti(new Set()); }}
                          style={{
                            border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.text,
                            fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                          }}>
                          {mesePiuCompatto ? "Espandi tutto" : "Vista compatta"}
                        </button>
                        <span style={{ fontSize: 11.5, color: "#475569", fontWeight: 600 }}>
                          {mesePiuCompatto
                            ? "Massimo 3 per giorno — clicca “+N altri” per aprire il singolo giorno"
                            : "Tutti gli accessi in colonna — clicca il numero del giorno per aprirlo"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {isolationNote}
              </div>
            )}

            {/* ═══ VISTA PAZIENTI (tabella) ═══ */}
            {mainView === "pazienti" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <PatientsTable
                  patients={scopePatients}
                  coopById={coopById}
                  countersByPatient={countersByPatient}
                  displayName={displayName}
                  displayPhone={displayPhone}
                  onRowClick={p => setPatientModal({ open: true, patient: p, startWithPhoto: false })}
                />
                {isolationNote}
              </div>
            )}
          </>
        )}
      </div>

      {rinnovoModal}
      {sharedModals}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sotto-componenti
// ═══════════════════════════════════════════════════════════════════════════

function CoopPill({ label, logo, color, count, active, onClick }: {
  label: string; logo?: string | null; color: string; count?: number;
  active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      flex: "0 0 auto", display: "flex", alignItems: "center", gap: 7,
      border: `1.5px solid ${active ? "#334155" : THEME.border}`,
      background: "#fff",
      borderRadius: 999, padding: "7px 14px", cursor: "pointer",
    }}>
      {logo
        /* eslint-disable-next-line @next/next/no-img-element */
        ? <img src={logo} alt="" style={{ width: 19, height: 19, objectFit: "contain", borderRadius: 4 }} />
        : <span style={{ width: 9, height: 9, borderRadius: "50%", background: color }} />}
      <span style={{ fontSize: 12.5, fontWeight: 800, color: active ? THEME.text : THEME.mutedLight }}>{label}</span>
      {count != null && count > 0 && (
        <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: color, borderRadius: 999, padding: "1px 7px" }}>{count}</span>
      )}
    </button>
  );
}

function ViewSwitch({ value, onChange, compact }: {
  value: CalView; onChange: (v: CalView) => void; compact?: boolean;
}) {
  const LBL: Record<CalView, string> = compact
    ? { giorno: "G", settimana: "S", mese: "M" }
    : { giorno: "Giorno", settimana: "Settimana", mese: "Mese" };
  return (
    <div style={{ display: "inline-flex", background: "#eef2f7", borderRadius: 10, padding: 2, border: `1px solid ${THEME.borderSoft}` }}>
      {(["giorno", "settimana", "mese"] as CalView[]).map(v => (
        <button key={v} onClick={() => onChange(v)} style={{
          border: "none", borderRadius: 8, cursor: "pointer",
          padding: compact ? "7px 13px" : "7px 14px",
          fontSize: 12.5, fontWeight: 800,
          background: value === v ? "#fff" : "transparent",
          color: value === v ? THEME.text : THEME.mutedLight,
          boxShadow: value === v ? "0 1px 3px rgba(15,23,42,.14)" : "none",
        }}>
          {LBL[v]}
        </button>
      ))}
    </div>
  );
}

function Legend() {
  const item = (bg: string, label: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: THEME.mutedLight }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: bg }} /> {label}
    </span>
  );
  return (
    <div style={{ display: "flex", gap: 12 }}>
      {item(THEME.teal, "Fatto")}
      {item("#cbd5e1", "Pianificato")}
      {item("#fca5a5", "Saltato")}
    </div>
  );
}

function PatientCard({ p, coop, counters, displayName, onClick }: {
  p: CoopPatient; coop?: Cooperative; counters?: PatientCounters;
  displayName: (s: string) => string; onClick: () => void;
}) {
  const tot = p.tot_accessi;
  const fatti = counters?.fatti ?? 0;
  const pct = tot ? Math.min(100, Math.round((fatti / tot) * 100)) : 0;
  const rim = counters?.rimanenti;
  const dScad = daysUntil(p.data_scadenza);
  const age = ageFrom(p.data_nascita);

  return (
    <div onClick={onClick} style={{
      background: coopTint(coop?.colore || THEME.teal), border: `1px solid ${coop?.colore || THEME.teal}`,
      borderRadius: 14, padding: "11px 13px", cursor: "pointer",
      opacity: p.stato === "concluso" ? .55 : p.stato === "sospeso" ? .75 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: THEME.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {displayName(`${p.cognome} ${p.nome}`)}{age != null ? ` · ${age}a` : ""}
          </div>
          {coop?.nome && <div style={{ fontSize: 10, fontWeight: 700, color: coop.colore || THEME.tealDark, textTransform: "uppercase", letterSpacing: .3 }}>{coop.nome}</div>}
          <div style={{ fontSize: 11.5, color: THEME.mutedLight, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {[p.citta, p.prestazione].filter(Boolean).join(" · ")}
          </div>
        </div>
        {tot != null ? (
          <div style={{ fontSize: 13, fontWeight: 800, color: THEME.tealDark, flexShrink: 0 }}>
            {fatti}/{tot}
          </div>
        ) : (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: THEME.tealDark, lineHeight: 1 }}>{counters?.fattiMese ?? 0}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: THEME.mutedLight, textTransform: "uppercase", letterSpacing: .3 }}>questo mese</div>
          </div>
        )}
      </div>

      {tot != null && (
        <div style={{ height: 5, background: "#eef2f7", borderRadius: 99, marginTop: 8, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: coop?.colore || THEME.teal, borderRadius: 99 }} />
        </div>
      )}

      <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        {(p.giorni_orari || []).map(g => (
          <span key={g.dow} style={{
            fontSize: 9.5, fontWeight: 800, color: THEME.muted,
            background: "#f1f5f9", border: `1px solid ${THEME.borderSoft}`,
            borderRadius: 6, padding: "2px 6px",
          }}>
            {DOW_LABELS[g.dow]}{g.orario ? ` ${normTime(g.orario)}` : ""}
          </span>
        ))}
        {p.stato !== "attivo" && (
          <span style={{ fontSize: 9.5, fontWeight: 800, color: THEME.muted, background: "#f1f5f9", borderRadius: 6, padding: "2px 6px", textTransform: "uppercase" }}>
            {p.stato}
          </span>
        )}
        {rim != null && rim <= 3 && p.stato === "attivo" && (
          <span style={{ fontSize: 9.5, fontWeight: 800, color: THEME.red, background: "#fef2f2", borderRadius: 6, padding: "2px 6px" }}>
            {rim === 0 ? "Accessi finiti" : `${rim} rimasti`}
          </span>
        )}
        {dScad != null && dScad <= 15 && p.stato === "attivo" && (
          <span style={{ fontSize: 9.5, fontWeight: 800, color: THEME.amber, background: "#fffbeb", borderRadius: 6, padding: "2px 6px" }}>
            {dScad < 0 ? "PAI scaduto" : dScad === 0 ? "Scade oggi" : `Scade tra ${dScad}g`}
          </span>
        )}
      </div>
    </div>
  );
}

/** Tabella pazienti (desktop): tutti i dati chiave, paese incluso. */
function PatientsTable({ patients, coopById, countersByPatient, displayName, displayPhone, onRowClick }: {
  patients: CoopPatient[];
  coopById: Map<string, Cooperative>;
  countersByPatient: Map<string, PatientCounters>;
  displayName: (s: string) => string;
  displayPhone: (s: string | null | undefined) => string;
  onRowClick: (p: CoopPatient) => void;
}) {
  const th: React.CSSProperties = {
    fontSize: 10, letterSpacing: .6, textTransform: "uppercase", color: THEME.label,
    fontWeight: 800, borderBottom: `1px solid ${THEME.border}`, padding: "10px 10px", textAlign: "left",
    background: "#f8fafc",
  };
  const td: React.CSSProperties = {
    borderBottom: `1px solid #eef2f6`, padding: "11px 10px", fontSize: 13, color: THEME.text,
    verticalAlign: "middle",
  };

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: `1px solid ${THEME.borderSoft}`, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Paziente</th>
            <th style={th}>Cooperativa</th>
            <th style={th}>Paese</th>
            <th style={th}>Recapiti</th>
            <th style={th}>Giorni</th>
            <th style={{ ...th, textAlign: "center" }}>Freq.</th>
            <th style={{ ...th, textAlign: "center" }}>Accessi</th>
            <th style={th}>Scadenza PAI</th>
            <th style={th}>Stato</th>
          </tr>
        </thead>
        <tbody>
          {patients.length === 0 && (
            <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: THEME.mutedLight, padding: "26px 10px" }}>Nessun paziente in questo perimetro.</td></tr>
          )}
          {patients.map(p => {
            const coop = coopById.get(p.cooperative_id);
            const c = countersByPatient.get(p.id);
            const tot = p.tot_accessi;
            const dScad = daysUntil(p.data_scadenza);
            const age = ageFrom(p.data_nascita);
            return (
              <tr key={p.id} onClick={() => onRowClick(p)} style={{ cursor: "pointer", opacity: p.stato === "concluso" ? .55 : 1 }}>
                <td style={{ ...td, fontWeight: 800 }}>
                  {displayName(`${p.cognome} ${p.nome}`)}
                  {age != null && <span style={{ fontWeight: 600, color: THEME.mutedLight }}> · {age}a</span>}
                </td>
                <td style={td}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, color: THEME.muted }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: coop?.colore || THEME.teal }} />
                    {coop?.nome || "—"}
                  </span>
                </td>
                <td style={{ ...td, fontWeight: 700, color: THEME.muted }}>{p.citta || "—"}</td>
                <td style={{ ...td, color: THEME.muted }}>{p.recapiti ? displayPhone(p.recapiti) : "—"}</td>
                <td style={td}>
                  <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                    {(p.giorni_orari || []).map(g => (
                      <span key={g.dow} style={{ fontSize: 10, fontWeight: 800, color: THEME.muted, background: "#f1f5f9", border: `1px solid ${THEME.borderSoft}`, borderRadius: 6, padding: "2px 6px" }}>
                        {DOW_LABELS[g.dow]}{g.orario ? ` ${normTime(g.orario)}` : ""}
                      </span>
                    ))}
                    {(p.giorni_orari || []).length === 0 && <span style={{ color: THEME.placeholder }}>—</span>}
                  </span>
                </td>
                <td style={{ ...td, textAlign: "center", fontWeight: 700, color: THEME.muted }}>
                  {p.frequenza_settimanale ? `${p.frequenza_settimanale}/sett` : "—"}
                </td>
                <td style={{ ...td, textAlign: "center" }}>
                  <span style={{ fontWeight: 800, color: THEME.tealDark }}>{c?.fatti ?? 0}{tot ? `/${tot}` : ""}</span>
                  {c?.rimanenti != null && c.rimanenti <= 3 && p.stato === "attivo" && (
                    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: THEME.red, background: "#fef2f2", borderRadius: 6, padding: "2px 6px" }}>
                      {c.rimanenti === 0 ? "finiti" : `${c.rimanenti} rim.`}
                    </span>
                  )}
                </td>
                <td style={{ ...td, fontWeight: 700, color: THEME.muted }}>
                  {fmtIT(p.data_scadenza) || "—"}
                  {dScad != null && dScad <= 15 && p.stato === "attivo" && (
                    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: THEME.amber, background: "#fffbeb", borderRadius: 6, padding: "2px 6px" }}>
                      {dScad < 0 ? "scaduto" : dScad === 0 ? "oggi" : `${dScad}g`}
                    </span>
                  )}
                </td>
                <td style={{ ...td, fontWeight: 800, textTransform: "capitalize", color: p.stato === "attivo" ? THEME.green : THEME.muted }}>
                  {p.stato}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Menu contestuale su un accesso: saltato / orario / rimuovi. */
function AccessMenu({ a, onSaltato, onRemove, onOrario, onClose, alignRight }: {
  a: CoopAccess;
  onSaltato: () => void; onRemove: () => void;
  onOrario: (t: string) => void; onClose: () => void;
  alignRight?: boolean;
}) {
  const [time, setTime] = useState(a.orario || "");
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 890 }} />
      <div style={{
        position: "absolute", top: "100%", right: alignRight ? 0 : 4, marginTop: 4, zIndex: 900,
        background: "#fff", border: `1px solid ${THEME.border}`, borderRadius: 11,
        boxShadow: "0 12px 30px rgba(15,23,42,.18)", padding: 8, width: 190,
      }}>
        <button onClick={onSaltato} style={menuItem()}>
          {a.stato === "saltato" ? "↩ Ripristina pianificato" : "✕ Segna saltato"}
        </button>
        <div style={{ display: "flex", gap: 6, padding: "6px 8px", alignItems: "center" }}>
          <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{
            flex: 1, border: `1px solid ${THEME.border}`, borderRadius: 8, padding: "5px 7px", fontSize: 12.5, color: THEME.text,
          }} />
          <button onClick={() => onOrario(time)} style={{
            border: "none", background: THEME.teal, color: "#fff", borderRadius: 8,
            padding: "6px 10px", fontSize: 11.5, fontWeight: 800, cursor: "pointer",
          }}>OK</button>
        </div>
        <button onClick={onRemove} style={{ ...menuItem(), color: THEME.red }}>🗑 Rimuovi accesso</button>
      </div>
    </>
  );
}

/** Modal rapido "aggiungi accesso" (paziente + orario) per un giorno. */
function AddAccessModal({ open, dayISO, isMobile, patients, displayName, onClose, onAdd }: {
  open: boolean; dayISO: string; isMobile: boolean;
  patients: CoopPatient[];
  displayName: (s: string) => string;
  onClose: () => void;
  onAdd: (patientId: string, dayISO: string, time: string) => void;
}) {
  const [patientId, setPatientId] = useState("");
  const [time, setTime] = useState("");

  useEffect(() => {
    if (open) { setPatientId(patients[0]?.id || ""); setTime(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const d = dayISO ? parseISODate(dayISO) : new Date();

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000,
      display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
      padding: isMobile ? 0 : 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", width: isMobile ? "100%" : 380,
        borderRadius: isMobile ? "18px 18px 0 0" : 16, padding: 18,
      }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: THEME.text, marginBottom: 12 }}>
          Aggiungi accesso — {fmtShort(d)}
        </div>
        <label style={{ display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: .5, textTransform: "uppercase", color: THEME.label, marginBottom: 4 }}>Paziente</label>
        <select value={patientId} onChange={e => setPatientId(e.target.value)} style={{
          width: "100%", border: `1px solid ${THEME.border}`, borderRadius: 9, padding: "9px 11px", fontSize: 14, color: THEME.text, marginBottom: 12,
        }}>
          {patients.length === 0 && <option value="">— nessun paziente attivo —</option>}
          {patients.map(p => <option key={p.id} value={p.id}>{displayName(`${p.cognome} ${p.nome}`)}</option>)}
        </select>
        <label style={{ display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: .5, textTransform: "uppercase", color: THEME.label, marginBottom: 4 }}>Orario (opzionale)</label>
        <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{
          width: "100%", border: `1px solid ${THEME.border}`, borderRadius: 9, padding: "9px 11px", fontSize: 14, color: THEME.text, marginBottom: 16,
        }} />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, border: `1px solid ${THEME.border}`, background: "#fff", borderRadius: 10, padding: "11px 0", fontSize: 13.5, fontWeight: 700, color: THEME.text, cursor: "pointer" }}>Annulla</button>
          <button
            disabled={!patientId}
            onClick={() => patientId && onAdd(patientId, dayISO, time)}
            style={{ flex: 1, border: "none", background: THEME.teal, color: "#fff", borderRadius: 10, padding: "11px 0", fontSize: 13.5, fontWeight: 800, cursor: "pointer", opacity: patientId ? 1 : .5 }}>
            Aggiungi
          </button>
        </div>
      </div>
    </div>
  );
}

/** Modal crea/modifica cooperativa: nome, logo preset, colore, attiva. */
function CoopModal({ open, coop, isMobile, onClose, onSave }: {
  open: boolean; coop: Cooperative | null; isMobile: boolean;
  onClose: () => void;
  onSave: (form: { nome: string; logo_url: string | null; colore: string; attiva: boolean }, coop: Cooperative | null) => void;
}) {
  const [nome, setNome] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [colore, setColore] = useState(COOP_COLOR_CHOICES[2]);
  const [attiva, setAttiva] = useState(true);

  useEffect(() => {
    if (!open) return;
    setNome(coop?.nome || "");
    setLogoUrl(coop?.logo_url ?? null);
    setColore(coop?.colore || COOP_COLOR_CHOICES[2]);
    setAttiva(coop?.attiva ?? true);
  }, [open, coop]);

  if (!open) return null;

  const applyPreset = (p: { nome: string; logo_url: string; colore: string }) => {
    if (!nome.trim()) setNome(p.nome);
    setLogoUrl(p.logo_url);
    setColore(p.colore);
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000,
      display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
      padding: isMobile ? 0 : 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", width: isMobile ? "100%" : 420,
        borderRadius: isMobile ? "18px 18px 0 0" : 16, padding: 18,
      }}>
        <div style={{ fontSize: 15.5, fontWeight: 800, color: THEME.text, marginBottom: 14 }}>
          {coop ? "Modifica cooperativa" : "Nuova cooperativa"}
        </div>

        <label style={coopLab()}>Nome</label>
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Es. Santa Lucia" style={coopInp()} />

        <label style={coopLab()}>Logo</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {COOP_PRESETS.map(p => (
            <button key={p.logo_url} onClick={() => applyPreset(p)} title={p.nome} style={{
              width: 54, height: 54, borderRadius: 12, cursor: "pointer",
              border: `2px solid ${logoUrl === p.logo_url ? "#334155" : THEME.border}`,
              background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.logo_url} alt={p.nome} style={{ width: 40, height: 40, objectFit: "contain" }} />
            </button>
          ))}
          <button onClick={() => setLogoUrl(null)} style={{
            width: 54, height: 54, borderRadius: 12, cursor: "pointer",
            border: `2px solid ${logoUrl === null ? "#334155" : THEME.border}`,
            background: "#f8fafc", fontSize: 10.5, fontWeight: 800, color: THEME.mutedLight,
          }}>
            Nessuno
          </button>
        </div>

        <label style={coopLab()}>Colore identificativo</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {COOP_COLOR_CHOICES.map(c => (
            <button key={c} onClick={() => setColore(c)} style={{
              width: 30, height: 30, borderRadius: "50%", cursor: "pointer",
              background: c, border: `3px solid ${colore === c ? "#0f172a" : "#fff"}`,
              boxShadow: "0 1px 4px rgba(15,23,42,.2)",
            }} />
          ))}
        </div>

        {coop && (
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700, color: THEME.muted, marginBottom: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={attiva} onChange={e => setAttiva(e.target.checked)} style={{ accentColor: THEME.teal }} />
            Cooperativa attiva
          </label>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, border: `1px solid ${THEME.border}`, background: "#fff", borderRadius: 10, padding: "11px 0", fontSize: 13.5, fontWeight: 700, color: THEME.text, cursor: "pointer" }}>Annulla</button>
          <button
            disabled={!nome.trim()}
            onClick={() => onSave({ nome: nome.trim(), logo_url: logoUrl, colore, attiva }, coop)}
            style={{ flex: 1, border: "none", background: THEME.teal, color: "#fff", borderRadius: 10, padding: "11px 0", fontSize: 13.5, fontWeight: 800, cursor: "pointer", opacity: nome.trim() ? 1 : .5 }}>
            Salva
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyCoops({ onPreset, onCustom, isMobile }: {
  onPreset: (p: { nome: string; logo_url: string; colore: string }) => void;
  onCustom: () => void;
  isMobile: boolean;
}) {
  return (
    <div style={{
      background: "#fff", border: `1px dashed ${THEME.border}`, borderRadius: 16,
      padding: isMobile ? "26px 18px" : "38px 24px", textAlign: "center",
      margin: isMobile ? "0 16px" : 0,
    }}>
      <div style={{ fontSize: 30, marginBottom: 8 }}>🏠</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: THEME.text }}>Inizia creando una cooperativa</div>
      <div style={{ fontSize: 13, color: THEME.mutedLight, fontWeight: 600, margin: "6px 0 16px" }}>
        Poi aggiungi i pazienti PAI fotografando il modulo — ci pensa l'AI.
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        {COOP_PRESETS.map(p => (
          <button key={p.nome} onClick={() => onPreset(p)} style={{
            display: "flex", alignItems: "center", gap: 8,
            border: `1px solid ${THEME.border}`, background: "#fff",
            borderRadius: 12, padding: "10px 16px", fontSize: 13, fontWeight: 800,
            color: THEME.text, cursor: "pointer",
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.logo_url} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />
            Crea {p.nome}
          </button>
        ))}
        <button onClick={onCustom} style={{
          border: `1.5px dashed ${THEME.border}`, background: "transparent",
          borderRadius: 12, padding: "10px 16px", fontSize: 13, fontWeight: 700,
          color: THEME.mutedLight, cursor: "pointer",
        }}>
          ＋ Altra cooperativa
        </button>
      </div>
    </div>
  );
}

/** Foglio azioni mobile: report / planner / messaggio. */
function MobileDocSheet({ onClose, onReport, onPlanner, onConsuntivo, onConsuntivoCsv, onMessage }: {
  onClose: () => void; onReport: () => void; onPlanner: () => void;
  onConsuntivo: () => void; onConsuntivoCsv: () => void; onMessage: () => void;
}) {
  const row = (icon: string, title: string, sub: string, onClick: () => void) => (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
      border: `1px solid ${THEME.borderSoft}`, background: "#fff", borderRadius: 13,
      padding: "13px 14px", cursor: "pointer", marginBottom: 8,
    }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, background: THEME.panelSoft, border: `1px solid ${THEME.borderSoft}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name={icon as any} size={17} color={THEME.tealDark} />
      </span>
      <span>
        <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: THEME.text }}>{title}</span>
        <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: THEME.mutedLight }}>{sub}</span>
      </span>
    </button>
  );
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000,
      display: "flex", alignItems: "flex-end",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#f8fafc", width: "100%", borderRadius: "18px 18px 0 0", padding: "16px 16px 20px",
      }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: THEME.text, marginBottom: 12 }}>Documenti e invii</div>
        {row("chart", "Report settimanale", "A schermo + PDF, per cooperativa o tutte", onReport)}
        {row("calendar", "Planner settimana (PDF)", "Il giro visite con orari, paesi e telefoni", onPlanner)}
        {row("euro", "Consuntivo mese (PDF)", "Accessi del mese per cooperativa, per la fatturazione", onConsuntivo)}
        {row("check", "Consuntivo mese (CSV)", "Stesso contenuto in formato Excel", onConsuntivoCsv)}
        {row("whatsapp", "Messaggio accessi", "Testo pronto da copiare nel gruppo della cooperativa", onMessage)}
        <button onClick={onClose} style={{
          width: "100%", border: `1px solid ${THEME.border}`, background: "#fff", borderRadius: 13,
          padding: "12px 0", fontSize: 13.5, fontWeight: 700, color: THEME.text, cursor: "pointer", marginTop: 2,
        }}>Annulla</button>
      </div>
    </div>
  );
}

/**
 * Generatore messaggio accessi per il gruppo della cooperativa
 * (template Santa Lucia): saluto in base all'orario, poi per ogni
 * paziente NOME in maiuscolo e "● giorni" del periodo scelto.
 * Il testo contiene i NOMI REALI (serve alla cooperativa), quindi
 * non applica la Privacy Mode — come i PDF.
 */
function MessageModal({ open, onClose, isMobile, studioId, cooperatives, preferredCoopId, patients }: {
  open: boolean; onClose: () => void; isMobile: boolean;
  studioId: string;
  cooperatives: Cooperative[];
  preferredCoopId?: string;
  patients: CoopPatient[];
}) {
  const [coopId, setCoopId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [nPatients, setNPatients] = useState(0);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const santa = cooperatives.find(c => /santa\s*lucia/i.test(c.nome));
    setCoopId(preferredCoopId || santa?.id || cooperatives[0]?.id || "");
    const t = new Date();
    setFrom(localISO(t));
    setTo(localISO(addDays(t, 9)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !coopId || !from || !to || !studioId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("coop_accesses")
        .select("coop_patient_id, data, stato")
        .eq("studio_id", studioId)
        .gte("data", from).lte("data", to)
        .neq("stato", "saltato")
        .order("data");
      if (cancelled) return;

      const patMap = new Map(patients.filter(p => p.cooperative_id === coopId).map(p => [p.id, p]));
      const daysByPatient = new Map<string, Set<number>>();
      (data || []).forEach(a => {
        if (!patMap.has(a.coop_patient_id)) return;
        const s = daysByPatient.get(a.coop_patient_id) || new Set<number>();
        s.add(parseInt(a.data.slice(8), 10));
        daysByPatient.set(a.coop_patient_id, s);
      });

      const entries = Array.from(daysByPatient.entries()).map(([pid, set]) => {
        const p = patMap.get(pid)!;
        const days = Array.from(set).sort((a, b) => a - b);
        return { p, days, key: days.join("-"), first: days[0] };
      });
      // Raggruppa i pattern uguali (come nel template), ordinati per primo giorno
      entries.sort((a, b) =>
        a.first !== b.first ? a.first - b.first
        : a.key !== b.key ? a.key.localeCompare(b.key, undefined, { numeric: true })
        : (a.p.cognome + a.p.nome).localeCompare(b.p.cognome + b.p.nome)
      );

      const greet = new Date().getHours() < 14 ? "Buongiorno" : "Buonasera";
      const lines = [greet];
      entries.forEach(e => {
        lines.push(`${e.p.cognome} ${e.p.nome}`.toUpperCase());
        lines.push(`● ${e.days.join("-")}`);
      });

      setNPatients(entries.length);
      setText(entries.length > 0 ? lines.join("\n") : "");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, coopId, from, to, studioId, patients]);

  if (!open) return null;

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.getElementById("domicili-msg-ta") as HTMLTextAreaElement | null;
      if (el) {
        el.focus();
        el.select();
        document.execCommand("copy");
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const overlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000,
    display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
    padding: isMobile ? 0 : 20,
  };
  const sheet: React.CSSProperties = isMobile
    ? { background: "#fff", width: "100%", maxHeight: "92vh", borderRadius: "18px 18px 0 0", display: "flex", flexDirection: "column", padding: 16 }
    : { background: "#fff", width: 480, maxWidth: "96vw", maxHeight: "90vh", borderRadius: 16, display: "flex", flexDirection: "column", padding: 18, boxShadow: "0 24px 60px rgba(15,23,42,.25)" };

  const smallLab: React.CSSProperties = {
    display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: .5,
    textTransform: "uppercase", color: THEME.label, marginBottom: 4,
  };
  const inpS: React.CSSProperties = {
    width: "100%", border: `1px solid ${THEME.border}`, borderRadius: 9,
    padding: "8px 10px", fontSize: 13.5, color: THEME.text,
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: THEME.text }}>Messaggio accessi</div>
            <div style={{ fontSize: 12, color: THEME.mutedLight, fontWeight: 600 }}>Da copiare e incollare nel gruppo della cooperativa</div>
          </div>
          <button onClick={onClose} style={{ border: `1px solid ${THEME.border}`, background: "#fff", borderRadius: 10, padding: "6px 12px", fontWeight: 700, color: THEME.text, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div style={{ gridColumn: isMobile ? "1 / -1" : "auto" }}>
            <label style={smallLab}>Cooperativa</label>
            <select value={coopId} onChange={e => setCoopId(e.target.value)} style={inpS}>
              {cooperatives.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={smallLab}>Dal</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inpS} />
          </div>
          <div>
            <label style={smallLab}>Al</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inpS} />
          </div>
        </div>

        <textarea
          id="domicili-msg-ta"
          readOnly
          value={loading ? "Genero il messaggio…" : (text || "Nessun accesso nel periodo scelto.")}
          rows={isMobile ? 11 : 13}
          style={{
            width: "100%", resize: "vertical",
            border: `1px solid ${THEME.border}`, borderRadius: 11,
            padding: "11px 12px", fontSize: 13.5, lineHeight: 1.5,
            color: THEME.text, background: "#f8fafc",
          }}
        />
        <div style={{ fontSize: 11.5, color: THEME.mutedLight, fontWeight: 600, margin: "8px 0 12px" }}>
          {nPatients > 0 ? `${nPatients} pazienti · giorni del mese dal ${fmtIT(from)} al ${fmtIT(to)}. ` : ""}
          Saluto automatico in base all'ora. Contiene i nomi reali (serve alla cooperativa).
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={copy} disabled={!text || loading} style={{
            flex: 1, border: "none", background: copied ? THEME.green : THEME.teal, color: "#fff", borderRadius: 10,
            padding: "12px 0", fontSize: 14, fontWeight: 800, cursor: "pointer",
            opacity: !text || loading ? .5 : 1,
          }}>
            {copied ? "Copiato ✓" : "Copia messaggio"}
          </button>
          <button onClick={onClose} style={{
            flex: isMobile ? 1 : .5, border: `1px solid ${THEME.border}`, background: "#fff",
            borderRadius: 10, padding: "12px 0", fontSize: 13.5, fontWeight: 700, color: THEME.text, cursor: "pointer",
          }}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stili helper ────────────────────────────────────────────────────────────

function dBtn(variant: "pri" | "ghost" = "ghost"): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 7,
    borderRadius: 11, fontSize: 13, fontWeight: 800, padding: "10px 15px",
    border: `1px solid ${variant === "pri" ? THEME.teal : THEME.border}`,
    background: variant === "pri" ? THEME.teal : "#fff",
    color: variant === "pri" ? "#fff" : THEME.text,
    cursor: "pointer", whiteSpace: "nowrap",
  };
}
function dBtnIcon(): React.CSSProperties {
  return {
    width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
    border: `1px solid ${THEME.border}`, background: "#fff", borderRadius: 10, cursor: "pointer",
  };
}
function mBtnIcon(): React.CSSProperties {
  return {
    width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
    border: `1px solid ${THEME.border}`, background: "#fff", borderRadius: 11,
    cursor: "pointer", fontSize: 15, flexShrink: 0,
  };
}
function menuItem(): React.CSSProperties {
  return {
    display: "block", width: "100%", textAlign: "left",
    border: "none", background: "transparent", cursor: "pointer",
    fontSize: 12.5, fontWeight: 700, color: THEME.text, padding: "8px 8px", borderRadius: 8,
  };
}
function coopLab(): React.CSSProperties {
  return {
    display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: .5,
    textTransform: "uppercase", color: THEME.label, marginBottom: 5,
  };
}
function coopInp(): React.CSSProperties {
  return {
    width: "100%", border: `1px solid ${THEME.border}`, borderRadius: 9,
    padding: "9px 11px", fontSize: 14, color: THEME.text, marginBottom: 12,
  };
}
