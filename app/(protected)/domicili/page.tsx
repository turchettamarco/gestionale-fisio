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
    const grouped = new Map<string, AccessesLite[]>();
    allLite.forEach(a => {
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
  }, [allLite]);

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

  const toggleFatto = async (a: CoopAccess) => {
    const toFatto = a.stato !== "fatto";
    const patch = toFatto
      ? { stato: "fatto" as const, fatto_alle: new Date().toISOString() }
      : { stato: "pianificato" as const, fatto_alle: null };
    patchLocal(a.id, patch);
    patchLite(a.coop_patient_id, a.data, patch.stato);
    const { error } = await supabase.from("coop_accesses").update(patch).eq("id", a.id);
    if (error) { notify.error("Errore salvataggio"); refreshAll(); }
  };

  const setSaltato = async (a: CoopAccess) => {
    const toSaltato = a.stato !== "saltato";
    const patch = toSaltato
      ? { stato: "saltato" as const, fatto_alle: null }
      : { stato: "pianificato" as const, fatto_alle: null };
    patchLocal(a.id, patch);
    patchLite(a.coop_patient_id, a.data, patch.stato);
    setMenuFor(null);
    const { error } = await supabase.from("coop_accesses").update(patch).eq("id", a.id);
    if (error) { notify.error("Errore salvataggio"); refreshAll(); }
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
    // riallinea la scaletta del giorno di destinazione
    await Promise.all(ids
      .filter(id => id !== accessId)
      .map((id, ) => supabase.from("coop_accesses").update({ ordine: orderMap.get(id)! }).eq("id", id)));
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
  // Mese: pannello inferiore col dettaglio del giorno toccato
  const [monthSheetDay, setMonthSheetDay] = useState<string | null>(null);
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
  const propagateOrario = async (patientId: string, orario: string, exceptId: string) => {
    if (!propagaOrario) return 0;          // modalità "Solo questo"
    const slot = slotOfOrario(orario);
    if (slot === null) return 0;
    const ids: string[] = [];
    rangeAccesses.forEach(x => {
      if (x.coop_patient_id !== patientId || x.id === exceptId) return;
      if (x.data < todayISO || x.stato !== "pianificato") return;
      if ((x.orario || "").slice(0, 5) === orario) return;
      if (takenSlots(x.data, x.id).has(slot)) return;   // in quel giorno lo slot è preso
      ids.push(x.id);
    });
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
    await Promise.all(ordered.map((id, i) =>
      supabase.from("coop_accesses").update({ ordine: i }).eq("id", id)));

    // stesso paziente, stessa ora anche negli altri giorni
    const n = await propagateOrario(a.coop_patient_id, orario, accessId);
    if (shifted) notify.warning(`Slot occupato: spostato alle ${orario}`);
    else if (n > 0) notify.success(`Spostato · ${orario} anche su altri ${n} giorni`);
    else notify.success("Accesso spostato");
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
    // persisti
    await Promise.all(orderedIds.map((id, i) =>
      supabase.from("coop_accesses").update({ ordine: i }).eq("id", id)
    ));
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
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 12px" }}>
              <ViewSwitch value={calView} onChange={setCalView} compact />
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
                        border: `1.5px ${dragAccessId && touchOverDay !== iso ? "dashed" : "solid"} ${touchOverDay === iso ? "#0891b2" : dragAccessId ? "#67e8f9" : sel ? THEME.teal : THEME.border}`,
                        background: touchOverDay === iso ? "#a5f3fc" : dragAccessId ? "#ecfeff" : sel ? THEME.teal : "#fff",
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
                          {p.recapiti && (
                            <a href={`tel:${p.recapiti.replace(/\s+/g, "")}`} style={{
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
                        return (
                          <div key={iso} data-drop-day={iso}
                            style={{
                              position: "relative",
                              borderLeft: `1px solid ${THEME.borderSoft}`,
                              background: `repeating-linear-gradient(to bottom,${isTarget ? "rgba(100,116,139,0.08)" : t ? "rgba(13,148,136,0.045)" : "transparent"} 0,${isTarget ? "rgba(100,116,139,0.08)" : t ? "rgba(13,148,136,0.045)" : "transparent"} ${HOUR_PX - 1}px,${THEME.borderSoft} ${HOUR_PX - 1}px,${THEME.borderSoft} ${HOUR_PX}px)`,
                            }}>
                            {list.map(a => {
                              const p = patientById.get(a.coop_patient_id);
                              if (!p) return null;
                              const coop = coopById.get(p.cooperative_id);
                              const c = coop?.colore || THEME.teal;
                              const saltato = a.stato === "saltato";
                              const top = ((pos.get(a.id) ?? 0) / 60) * HOUR_PX;
                              const height = (DW_SLOT_MIN / 60) * HOUR_PX - 2;
                              const cognome = displayName(`${p.cognome}`);
                              return (
                                <button key={a.id}
                                  data-access-card={a.id} data-access-day={a.data}
                                  {...dwDragHandlers(a)}
                                  onClick={e => { e.stopPropagation(); if (suppressClickRef.current) return; setPatientModal({ open: true, patient: p, startWithPhoto: false }); }}
                                  style={{
                                    position: "absolute", top, height, left: 1.5, right: 1.5,
                                    border: `1.5px solid ${c}`, borderRadius: 6, background: `${c}12`,
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
                            {isTarget && dwOver && (
                              <div style={{
                                position: "absolute", left: 2, right: 2,
                                top: (dwOver.startMin / 60) * HOUR_PX,
                                height: (DW_SLOT_MIN / 60) * HOUR_PX - 2,
                                border: "1.5px dashed #94a3b8", borderRadius: 6,
                                background: "rgba(100,116,139,0.10)", zIndex: 4, pointerEvents: "none",
                              }} />
                            )}
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
                      <span style={{ fontSize: 10, fontWeight: 700, color: THEME.text, marginLeft: "auto" }}>{totCount} · {doneCount} fatti</span>
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
                    <div style={{ flex: 1 }} />
                    <Legend />
                  </div>

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
                            <div style={{ fontSize: 15, fontWeight: 700, color: coop?.colore || THEME.tealDark, width: 52 }}>{a.orario || "—"}</div>
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
                            background: touchOverDay === iso && dragAccessId ? "#cffafe" : dragAccessId ? "#ecfeff" : closedDatesSet.has(iso) ? "#fef2f2" : isToday ? "#f0fdfa" : THEME.panelSoft,
                            border: touchOverDay === iso && dragAccessId ? "2px solid #0891b2" : `1px ${dragAccessId ? "dashed #67e8f9" : "solid"} ${dragAccessId ? "#67e8f9" : closedDatesSet.has(iso) ? "#fecaca" : THEME.borderSoft}`,
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
                          <div key={d} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 800, letterSpacing: .6, color: THEME.label }}>{DOW_LABELS[d]}</div>
                        ))}
                      </div>
                      {monthWeeks.map((week, wi) => (
                        <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 8 }}>
                          {week.map(d => {
                            const iso = localISO(d);
                            const inMonth = d.getMonth() === anchor.getMonth();
                            const isToday = iso === todayISO;
                            const list = accByDay.get(iso) || [];
                            const shown = list.slice(0, 3);
                            return (
                              <div
                                key={iso}
                                onClick={() => { setAnchor(d); setCalView("giorno"); }}
                                style={{
                                  background: isToday ? "#f0fdfa" : inMonth ? "#fff" : "#f8fafc",
                                  border: `1px solid ${THEME.borderSoft}`,
                                  borderRadius: 11, padding: "7px 8px", minHeight: 92, cursor: "pointer",
                                }}>
                                <div style={{ fontSize: 12.5, fontWeight: 800, color: inMonth ? (isToday ? THEME.tealDark : THEME.text) : THEME.placeholder, marginBottom: 4 }}>
                                  {d.getDate()}
                                </div>
                                {shown.map(a => {
                                  const p = patientById.get(a.coop_patient_id);
                                  if (!p) return null;
                                  const coop = coopById.get(p.cooperative_id);
                                  const fatto = a.stato === "fatto";
                                  const saltato = a.stato === "saltato";
                                  return (
                                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2, opacity: saltato ? .5 : 1 }}>
                                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: coop?.colore || THEME.teal, flexShrink: 0 }} />
                                      <span style={{ fontSize: 10, fontWeight: 800, color: THEME.tealDark, flexShrink: 0 }}>{a.orario ? a.orario.slice(0, 5) : ""}</span>
                                      <span style={{
                                        fontSize: 10.5, fontWeight: 700, color: THEME.textSoft,
                                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                        textDecoration: saltato ? "line-through" : "none",
                                      }}>
                                        {displayName(`${p.cognome}`)}
                                      </span>
                                      {fatto && <span style={{ fontSize: 10, color: THEME.green, fontWeight: 800 }}>✓</span>}
                                    </div>
                                  );
                                })}
                                {list.length > 3 && (
                                  <div style={{ fontSize: 10, fontWeight: 800, color: THEME.mutedLight }}>+{list.length - 3} altri</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      <div style={{ fontSize: 11.5, color: THEME.mutedLight, fontWeight: 600, textAlign: "center" }}>
                        Clicca un giorno per aprire la vista giorno.
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
function MobileDocSheet({ onClose, onReport, onPlanner, onMessage }: {
  onClose: () => void; onReport: () => void; onPlanner: () => void; onMessage: () => void;
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
