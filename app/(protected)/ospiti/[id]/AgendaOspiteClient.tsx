"use client";

// ════════════════════════════════════════════════════════════════════════
// app/(protected)/ospiti/[id]/AgendaOspiteClient.tsx
// ════════════════════════════════════════════════════════════════════════
//
// Pagina agenda professionista ospite (mig. 029 + Step 5d).
//
// Design allineato al brand FisioHub (vedi calendario per riferimento):
//   • Background pagina #f1f5f9 (stesso del gestionale)
//   • Header card con banda gradient teal→blu (#0d9488 → #2563eb)
//     identica alla sidebar destra del calendario
//   • KPI in 4 colonne divise da bordi verticali (pattern sidebar calendar)
//   • Card giorno con bordo sinistro 4px del colore dell'ospite
//   • Bottoni con border-radius 10px (coerenti con Giorno/Settimana/Mese)
//   • Bottone CTA "Scarica PDF" con gradient teal→blu
//   • Font weight 800 ovunque (regole studio)
//   • Border color #cbd5e1
//   • Numero appuntamenti in blu #2563eb (come conteggi sidebar)
//
// Mobile responsive: header e toolbar diventano stacked verticalmente,
// KPI rimangono in 4 col anche su mobile (compatte), tabella scrolla
// orizzontalmente quando troppo larga.
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState, useCallback, Fragment } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { Printer, Download, Eye, ChevronLeft, ChevronRight, ArrowLeft, Plus } from "lucide-react";
import { previewAgendaInBrowser, printAgenda, downloadAgendaPDF, type GuestAgendaData } from "./utils/exportGuestAgenda";
import GuestAppointmentModal, { type GuestApptInitial } from "./components/GuestAppointmentModal";

// ── Palette brand FisioHub ──────────────────────────────────────────────
const T = {
  appBg:       "#f1f5f9",
  panelBg:     "#ffffff",
  panelSoft:   "#f8fafc",
  text:        "#0f172a",
  textSoft:    "#1e293b",
  muted:       "#475569",
  mutedSoft:   "#64748b",
  border:      "#cbd5e1",
  borderSoft:  "#e2e8f0",
  borderXSoft: "#f1f5f9",
  blue:        "#2563eb",
  blueDark:    "#1e40af",
  teal:        "#0d9488",
  green:       "#16a34a",
  red:         "#dc2626",
  amber:       "#f97316",
  white:       "#ffffff",
};

// gradient brand (identico a header sidebar calendario)
const GRADIENT = "linear-gradient(135deg, #0d9488, #2563eb)";

// ── Tipi ────────────────────────────────────────────────────────────────
type GuestRow = {
  id: string;
  studio_id: string;
  first_name: string;
  last_name: string;
  specialty: string;
  display_color: string | null;
  default_room_id: string | null;
  is_active: boolean;
  pdf_print_fields: {
    telefono?: boolean;
    durata?: boolean;
    diagnosi?: boolean;
    note?: boolean;
  };
  // mig. 032 — Portale pubblico
  access_token: string | null;
  token_created_at: string | null;
  last_access_at: string | null;
  // mig. 033 — Contatti professionista
  phone: string | null;
  email: string | null;
};

type AppointmentRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  calendar_note: string | null;
  patient_id: string;
  room_id: string | null;
  patient: {
    first_name: string;
    last_name: string;
    phone: string | null;
    diagnosis: string | null;
  } | null;
};

// ── Helpers data ────────────────────────────────────────────────────────
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" })
    .replace(/^./, c => c.toUpperCase());
}
function fmtDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function durationMinutes(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayShortName(d: Date): string {
  // "Sab", "Lun", ecc.
  return d.toLocaleDateString("it-IT", { weekday: "short" })
    .replace(/^./, c => c.toUpperCase()).replace(/\.$/, "");
}
function fullDayLabel(d: Date): string {
  // "Sabato 16 Maggio 2026"
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .replace(/^./, c => c.toUpperCase());
}
function nextAppointmentLabel(groupedByDay: Array<{ date: Date }>): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const future = groupedByDay.find(g => g.date.getTime() >= today.getTime());
  if (!future) return "—";
  return future.date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })
    .replace(/^./, c => c.toUpperCase()).replace(/\./g, "");
}

// ── Component ───────────────────────────────────────────────────────────
export default function AgendaOspiteClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const guestId = params?.id;
  const { studio } = useCurrentStudio();

  const [guest, setGuest] = useState<GuestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterMode, setFilterMode] = useState<"month" | "range">("month");
  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [rangeStart, setRangeStart] = useState<string>(fmtDateInput(startOfMonth(new Date())));
  const [rangeEnd, setRangeEnd] = useState<string>(fmtDateInput(endOfMonth(new Date())));

  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [selectedDays, setSelectedDays] = useState<Record<string, boolean>>({});

  // ── Fase B: modale create/edit appuntamento ospite ─────────────────────
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [modalInitial, setModalInitial] = useState<GuestApptInitial | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);  // bump per forzare refetch dopo save

  // ── Portale pubblico (mig. 032): genera/revoca/copia dal pannellino ────
  const [portalSaving, setPortalSaving] = useState(false);
  const [portalMessage, setPortalMessage] = useState<{ text: string; type: "ok" | "err" } | null>(null);

  // ── Carica ospite ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!guestId || !studio?.id) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error: err } = await supabase
        .from("guest_practitioners")
        .select("id, studio_id, first_name, last_name, specialty, display_color, default_room_id, is_active, pdf_print_fields, access_token, token_created_at, last_access_at, phone, email")
        .eq("id", guestId)
        .eq("studio_id", studio.id)
        .maybeSingle();
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }
      if (!data) { setError("Professionista non trovato."); setLoading(false); return; }
      setGuest(data as GuestRow);
      setError(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [guestId, studio?.id]);

  // ── Intervallo date attivo ────────────────────────────────────────────
  const { fromDate, toDate } = useMemo(() => {
    if (filterMode === "month") {
      return { fromDate: startOfMonth(currentMonth), toDate: endOfMonth(currentMonth) };
    }
    return {
      fromDate: new Date(rangeStart + "T00:00:00"),
      toDate: new Date(rangeEnd + "T23:59:59"),
    };
  }, [filterMode, currentMonth, rangeStart, rangeEnd]);

  // ── Carica appuntamenti ───────────────────────────────────────────────
  useEffect(() => {
    if (!guestId || !studio?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("appointments")
        .select(`
          id, start_at, end_at, status, calendar_note,
          patient_id, room_id,
          patient:patients(first_name, last_name, phone, diagnosis)
        `)
        .eq("guest_practitioner_id", guestId)
        .eq("studio_id", studio.id)
        .gte("start_at", fromDate.toISOString())
        .lte("start_at", toDate.toISOString())
        .neq("status", "cancelled")
        .order("start_at", { ascending: true });
      if (cancelled) return;
      if (err) { console.error(err); setAppointments([]); return; }
      const normalized: AppointmentRow[] = (data ?? []).map((r: Record<string, unknown>) => {
        const p = r.patient as unknown;
        const patient = Array.isArray(p) ? (p[0] ?? null) : (p ?? null);
        return { ...(r as object), patient } as AppointmentRow;
      });
      setAppointments(normalized);
    })();
    return () => { cancelled = true; };
  }, [guestId, studio?.id, fromDate, toDate, reloadKey]);

  // ── Raggruppa per giorno ──────────────────────────────────────────────
  const groupedByDay = useMemo(() => {
    const groups: Array<{ key: string; date: Date; events: AppointmentRow[] }> = [];
    const byKey = new Map<string, AppointmentRow[]>();
    for (const a of appointments) {
      const k = dayKey(a.start_at);
      const arr = byKey.get(k) ?? [];
      arr.push(a);
      byKey.set(k, arr);
    }
    for (const [k, evs] of byKey.entries()) {
      const d = new Date(evs[0].start_at);
      d.setHours(0, 0, 0, 0);
      groups.push({ key: k, date: d, events: evs });
    }
    groups.sort((a, b) => a.date.getTime() - b.date.getTime());
    return groups;
  }, [appointments]);

  useEffect(() => {
    const map: Record<string, boolean> = {};
    for (const g of groupedByDay) map[g.key] = true;
    setSelectedDays(map);
  }, [groupedByDay]);

  const totalAppointments = appointments.length;
  const totalDays = groupedByDay.length;
  const totalDaysSelected = Object.values(selectedDays).filter(Boolean).length;
  const totalApptInSelection = useMemo(() => {
    return groupedByDay.filter(g => selectedDays[g.key]).reduce((a, g) => a + g.events.length, 0);
  }, [groupedByDay, selectedDays]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const goToPrevMonth = useCallback(() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)), []);
  const goToNextMonth = useCallback(() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)), []);
  const toggleDaySelection = useCallback((k: string) => setSelectedDays(p => ({ ...p, [k]: !p[k] })), []);
  const selectAllDays = useCallback(() => {
    const m: Record<string, boolean> = {}; for (const g of groupedByDay) m[g.key] = true; setSelectedDays(m);
  }, [groupedByDay]);
  const deselectAllDays = useCallback(() => {
    const m: Record<string, boolean> = {}; for (const g of groupedByDay) m[g.key] = false; setSelectedDays(m);
  }, [groupedByDay]);

  // Builder dati comune per export (solo giorni selezionati)
  const buildExportData = useCallback((onlyDayKey?: string): GuestAgendaData => {
    if (!guest) throw new Error("Guest non disponibile");
    const localFields = guest.pdf_print_fields || {};
    const periodLabel = filterMode === "month"
      ? fmtMonthYear(currentMonth)
      : `dal ${new Date(rangeStart).toLocaleDateString("it-IT")} al ${new Date(rangeEnd).toLocaleDateString("it-IT")}`;

    // Se onlyDayKey è specificato → solo quel giorno; altrimenti i giorni selezionati
    const filteredGroups = onlyDayKey
      ? groupedByDay.filter(g => g.key === onlyDayKey)
      : groupedByDay.filter(g => selectedDays[g.key] !== false);

    return {
      guest: {
        first_name: guest.first_name,
        last_name: guest.last_name,
        specialty: guest.specialty,
        display_color: guest.display_color,
      },
      periodLabel: onlyDayKey
        ? (filteredGroups[0]
            ? filteredGroups[0].date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(/^./, c => c.toUpperCase())
            : periodLabel)
        : periodLabel,
      groups: filteredGroups.map(g => ({
        date: g.date,
        events: g.events.map(ev => ({
          start_at: ev.start_at,
          end_at: ev.end_at,
          calendar_note: ev.calendar_note,
          patient: ev.patient,
        })),
      })),
      fields: {
        telefono: localFields.telefono !== false,
        durata:   localFields.durata !== false,
        diagnosi: localFields.diagnosi !== false,
        note:     localFields.note !== false,
      },
      studio: studio as {
        name?: string | null; address?: string | null;
        phone?: string | null; email?: string | null;
        logo_base64?: string | null;
        signature_name?: string | null;
        signature_title?: string | null;
      } | null,
    };
  }, [guest, filterMode, currentMonth, rangeStart, rangeEnd, groupedByDay, selectedDays, studio]);

  const handlePdfDownload = useCallback(async () => {
    if (!guest) return;
    try {
      await downloadAgendaPDF(buildExportData());
    } catch (e) {
      console.error("Errore PDF:", e);
      alert("Errore nella generazione del PDF. Riprova.");
    }
  }, [guest, buildExportData]);

  const handlePrint = useCallback(() => {
    if (!guest) return;
    printAgenda(buildExportData());
  }, [guest, buildExportData]);

  const handlePreview = useCallback(() => {
    if (!guest) return;
    previewAgendaInBrowser(buildExportData());
  }, [guest, buildExportData]);

  const handlePrintSingleDay = useCallback((dayKeyToPrint: string) => {
    if (!guest) return;
    printAgenda(buildExportData(dayKeyToPrint));
  }, [guest, buildExportData]);

  // ── Fase B: handler open/close modale ──────────────────────────────────
  const openCreateModal = useCallback(() => {
    setModalInitial(undefined);
    setModalMode("create");
  }, []);

  const openEditModal = useCallback((appt: AppointmentRow) => {
    setModalInitial({
      id: appt.id,
      patient_id: appt.patient_id,
      patient_name: appt.patient ? `${appt.patient.last_name} ${appt.patient.first_name}` : "",
      start_at: appt.start_at,
      end_at: appt.end_at,
      room_id: appt.room_id,
      calendar_note: appt.calendar_note,
    });
    setModalMode("edit");
  }, []);

  const closeModal = useCallback(() => {
    setModalMode(null);
    setModalInitial(undefined);
  }, []);

  const handleSaved = useCallback(() => {
    setReloadKey(k => k + 1);
  }, []);

  // ── Portale pubblico: genera / revoca / copia ─────────────────────────
  const flashPortal = useCallback((text: string, type: "ok" | "err" = "ok") => {
    setPortalMessage({ text, type });
    setTimeout(() => setPortalMessage(null), 2500);
  }, []);

  const handleGenerateToken = useCallback(async () => {
    if (!guest) return;
    setPortalSaving(true);
    try {
      const newToken = crypto.randomUUID();
      const now = new Date().toISOString();
      const { error: err } = await supabase
        .from("guest_practitioners")
        .update({ access_token: newToken, token_created_at: now, last_access_at: null })
        .eq("id", guest.id);
      if (err) throw new Error(err.message);
      // Aggiorno lo state guest localmente per refresh immediato senza reload
      setGuest({ ...guest, access_token: newToken, token_created_at: now, last_access_at: null });
      flashPortal("Link generato. Ora puoi copiarlo e inviarlo all'ospite.");
    } catch (e) {
      flashPortal(e instanceof Error ? e.message : "Errore", "err");
    } finally {
      setPortalSaving(false);
    }
  }, [guest, flashPortal]);

  const handleRevokeToken = useCallback(async () => {
    if (!guest) return;
    if (!confirm("Revocare il link? L'ospite non potrà più aprirlo.")) return;
    setPortalSaving(true);
    try {
      const { error: err } = await supabase
        .from("guest_practitioners")
        .update({ access_token: null, token_created_at: null, last_access_at: null })
        .eq("id", guest.id);
      if (err) throw new Error(err.message);
      setGuest({ ...guest, access_token: null, token_created_at: null, last_access_at: null });
      flashPortal("Link revocato.");
    } catch (e) {
      flashPortal(e instanceof Error ? e.message : "Errore", "err");
    } finally {
      setPortalSaving(false);
    }
  }, [guest, flashPortal]);

  const handleCopyLink = useCallback(async () => {
    if (!guest?.access_token) return;
    const url = `${window.location.origin}/agenda/${guest.access_token}`;
    try {
      await navigator.clipboard.writeText(url);
      flashPortal("Link copiato negli appunti!");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      flashPortal("Link copiato!");
    }
  }, [guest, flashPortal]);

  // ── Invia link via WhatsApp (richiede phone valorizzato) ──────────────
  const handleSendWhatsApp = useCallback(() => {
    if (!guest?.access_token || !guest?.phone) {
      flashPortal("Aggiungi prima il numero del professionista nelle impostazioni.", "err");
      return;
    }
    const url = `${window.location.origin}/agenda/${guest.access_token}`;
    const studioLabel = studio?.name || "Studio";
    const message = `Ciao ${guest.first_name}, ecco il link aggiornato in tempo reale alla tua agenda da ${studioLabel}:\n\n${url}\n\nPuoi salvarlo nei preferiti del browser. Vedi solo i tuoi appuntamenti, nessun login richiesto.`;
    // Normalizza il numero: rimuovi spazi/trattini/parentesi. wa.me accetta formato internazionale senza +.
    const cleanPhone = guest.phone.replace(/[\s\-()]/g, "").replace(/^\+/, "");
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }, [guest, studio?.name, flashPortal]);

  // ── States ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: T.appBg, padding: 32, color: T.muted, fontSize: 13, fontWeight: 600 }}>
        Caricamento agenda…
      </div>
    );
  }
  if (error || !guest) {
    return (
      <div style={{ minHeight: "100vh", background: T.appBg, padding: 32 }}>
        <Link href="/calendar" style={{ color: T.muted, fontSize: 12, fontWeight: 700 }}>← Calendario</Link>
        <div style={{ marginTop: 16, padding: 20, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#991b1b", fontSize: 13, fontWeight: 700 }}>
          {error || "Professionista non trovato."}
        </div>
      </div>
    );
  }

  const guestColor = guest.display_color || "#DB2777";
  const pdfFields = guest.pdf_print_fields || {};
  const showTelefono = pdfFields.telefono !== false;
  const showDurata = pdfFields.durata !== false;
  const showDiagnosi = pdfFields.diagnosi !== false;
  const showNote = pdfFields.note !== false;
  const numCols = 2 + (showTelefono ? 1 : 0) + (showDurata ? 1 : 0) + (showDiagnosi ? 1 : 0) + (showNote ? 1 : 0);

  const initials = `${guest.first_name[0] ?? ""}${guest.last_name[0] ?? ""}`.toUpperCase();
  const nextLabel = nextAppointmentLabel(groupedByDay);
  const periodLabel = filterMode === "month" ? fmtMonthYear(currentMonth) : "Personalizzato";

  return (
    <>
      <style>{`
        .ao-wrap { min-height: 100vh; background: ${T.appBg}; }
        .ao-container { max-width: 1320px; margin: 0 auto; padding: 16px 24px 60px; }
        .ao-headerBand {
          background: ${GRADIENT}; padding: 18px 24px;
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 16px;
        }
        .ao-avatar {
          width: 50px; height: 50px; border-radius: 50%;
          background: rgba(255,255,255,0.18);
          border: 2px solid rgba(255,255,255,0.35);
          display: flex; align-items: center; justify-content: center;
          color: ${T.white}; font-weight: 800; font-size: 17px; flex-shrink: 0;
        }
        .ao-kpiGrid {
          display: grid; grid-template-columns: repeat(4, 1fr);
        }
        .ao-kpi {
          padding: 16px 20px;
        }
        .ao-kpi + .ao-kpi { border-left: 1px solid ${T.borderSoft}; }
        .ao-toolbar {
          background: ${T.panelBg}; border: 1px solid ${T.border};
          border-radius: 12px; padding: 12px 16px;
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 12px; margin-bottom: 16px;
        }
        .ao-toolbarLeft, .ao-toolbarRight {
          display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
        }
        .ao-iconBtn {
          width: 38px; height: 38px; border-radius: 10px;
          border: 1px solid ${T.border}; background: ${T.white};
          cursor: pointer; color: ${T.muted};
          display: flex; align-items: center; justify-content: center;
        }
        .ao-btn {
          padding: 9px 14px; border-radius: 10px; border: 1px solid ${T.border};
          background: ${T.white}; cursor: pointer; color: ${T.muted};
          font-size: 13px; font-weight: 700;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .ao-btnPrimary {
          padding: 10px 18px; border-radius: 10px; border: none;
          background: ${T.blue}; cursor: pointer; color: ${T.white};
          font-size: 13px; font-weight: 800;
        }
        .ao-btnCTA {
          padding: 10px 18px; border-radius: 10px; border: none;
          background: ${GRADIENT}; cursor: pointer; color: ${T.white};
          font-size: 13px; font-weight: 800;
          display: inline-flex; align-items: center; gap: 6px;
          box-shadow: 0 2px 8px rgba(37,99,235,0.25);
        }
        .ao-divider {
          width: 1px; height: 26px; background: ${T.borderSoft}; margin: 0 4px;
        }
        .ao-dateBlock {
          background: ${T.white}; border: 1px solid ${T.border};
          border-radius: 8px; padding: 6px 10px; text-align: center;
          min-width: 56px; flex-shrink: 0;
        }
        @media (max-width: 768px) {
          .ao-container { padding: 12px; }
          .ao-headerBand { padding: 14px 16px; }
          .ao-kpiGrid {
            grid-template-columns: repeat(2, 1fr);
          }
          .ao-kpi + .ao-kpi {
            border-left: 1px solid ${T.borderSoft};
          }
          .ao-kpi:nth-child(3) {
            border-left: none;
            border-top: 1px solid ${T.borderSoft};
          }
          .ao-kpi:nth-child(4) {
            border-top: 1px solid ${T.borderSoft};
          }
          .ao-toolbar {
            flex-direction: column; align-items: stretch;
          }
          .ao-toolbarLeft, .ao-toolbarRight {
            justify-content: center;
          }
          .ao-toolbarRight .ao-btnCTA,
          .ao-toolbarRight .ao-btn {
            flex: 1; justify-content: center;
            padding: 9px 8px; font-size: 12px;
          }
        }
      `}</style>

      <div className="ao-wrap">
        <div className="ao-container">

          {/* Back link */}
          <button
            onClick={() => router.push("/calendar")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 12, color: T.muted, background: "transparent",
              border: "none", cursor: "pointer", padding: 0,
              marginBottom: 14, fontWeight: 700,
            }}
          >
            <ArrowLeft size={14} /> Calendario
          </button>

          {/* ── HEADER card con banda gradient + KPI ─────────────────── */}
          <div style={{
            background: T.panelBg,
            borderRadius: 14, overflow: "hidden",
            boxShadow: "0 2px 14px rgba(15,23,42,0.06)",
            border: `1px solid ${T.border}`,
            marginBottom: 16,
          }}>
            <div className="ao-headerBand">
              <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, flex: 1 }}>
                <div className="ao-avatar">{initials}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 11, color: "rgba(255,255,255,0.85)",
                    fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
                    marginBottom: 2,
                  }}>
                    Professionista ospite
                  </div>
                  <div style={{
                    fontSize: 22, fontWeight: 800, color: T.white,
                    letterSpacing: -0.3, lineHeight: 1.1,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {guest.first_name} {guest.last_name}
                  </div>
                  <div style={{
                    fontSize: 13, color: "rgba(255,255,255,0.92)",
                    marginTop: 2, fontWeight: 600,
                    display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                  }}>
                    <span>{guest.specialty}</span>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "2px 8px",
                      background: "rgba(255,255,255,0.15)",
                      borderRadius: 99, fontSize: 11, fontWeight: 700,
                    }}>
                      <span style={{
                        width: 8, height: 8, background: guestColor,
                        borderRadius: "50%",
                        border: "1.5px solid rgba(255,255,255,0.6)",
                      }} />
                      Colore
                    </span>
                  </div>
                </div>
              </div>
              {/* Stato Attivo (pillula) */}
              <div style={{
                background: "rgba(255,255,255,0.18)",
                border: "1px solid rgba(255,255,255,0.3)",
                padding: "6px 14px", borderRadius: 99,
                color: T.white, fontSize: 12, fontWeight: 800,
                whiteSpace: "nowrap", flexShrink: 0,
              }}>
                {guest.is_active ? "Attivo" : "Disattivato"}
              </div>
            </div>

            {/* KPI griglia 4 colonne */}
            <div className="ao-kpiGrid">
              <div className="ao-kpi">
                <div style={{ fontSize: 11, color: T.mutedSoft, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Periodo
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>
                  {periodLabel}
                </div>
              </div>
              <div className="ao-kpi">
                <div style={{ fontSize: 11, color: T.mutedSoft, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Appuntamenti
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: T.blue, lineHeight: 1 }}>
                  {totalAppointments}
                </div>
              </div>
              <div className="ao-kpi">
                <div style={{ fontSize: 11, color: T.mutedSoft, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Giorni
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: T.teal, lineHeight: 1 }}>
                  {totalDays}
                </div>
              </div>
              <div className="ao-kpi">
                <div style={{ fontSize: 11, color: T.mutedSoft, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Prossimo
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>
                  {nextLabel}
                </div>
              </div>
            </div>
          </div>

          {/* ── PANNELLO PORTALE PUBBLICO (mig. 032) ─────────────────── */}
          <div style={{
            background: guest.access_token ? "rgba(22,163,74,0.05)" : T.panelBg,
            border: `1px solid ${guest.access_token ? "#86efac" : T.border}`,
            borderRadius: 12, padding: "12px 16px", marginBottom: 14,
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          }}>
            <div style={{ fontSize: 20 }}>🔗</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>
                Portale pubblico
                {guest.access_token && (
                  <span style={{
                    marginLeft: 8, fontSize: 10, fontWeight: 800,
                    color: "#16a34a", background: "#dcfce7",
                    padding: "2px 8px", borderRadius: 99,
                    textTransform: "uppercase", letterSpacing: 0.5,
                  }}>
                    Attivo
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: T.mutedSoft, marginTop: 2, lineHeight: 1.4 }}>
                {guest.access_token
                  ? <>
                      Link generato il {guest.token_created_at && new Date(guest.token_created_at).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}
                      {guest.last_access_at && <> · Ultimo accesso: {new Date(guest.last_access_at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>}
                    </>
                  : "Genera un link pubblico da inviare via WhatsApp o email per consultare l'agenda senza login."}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {guest.access_token ? (
                <>
                  {guest.phone ? (
                    <button
                      onClick={handleSendWhatsApp}
                      disabled={portalSaving}
                      className="ao-btnCTA"
                      style={{ background: "#25D366", boxShadow: "0 2px 8px rgba(37,211,102,0.3)" }}
                      title={`Invia il link a ${guest.first_name} via WhatsApp`}
                    >
                      💬 Invia su WhatsApp
                    </button>
                  ) : (
                    <button
                      onClick={() => flashPortal("Aggiungi prima il numero del professionista (Impostazioni → Team → Modifica).", "err")}
                      className="ao-btn"
                      style={{ color: T.mutedSoft, borderColor: T.border, opacity: 0.7 }}
                      title="Numero non impostato"
                    >
                      💬 WhatsApp (numero mancante)
                    </button>
                  )}
                  <button
                    onClick={handleCopyLink}
                    disabled={portalSaving}
                    className="ao-btnCTA"
                    style={{ background: T.teal, boxShadow: "0 2px 8px rgba(13,148,136,0.25)" }}
                  >
                    📋 Copia link
                  </button>
                  <button
                    onClick={handleRevokeToken}
                    disabled={portalSaving}
                    className="ao-btn"
                    style={{ color: T.red, borderColor: T.red }}
                  >
                    Revoca
                  </button>
                </>
              ) : (
                <button
                  onClick={handleGenerateToken}
                  disabled={portalSaving}
                  className="ao-btnCTA"
                  style={{
                    background: "linear-gradient(135deg, #0d9488, #2563eb)",
                    boxShadow: "0 2px 8px rgba(37,99,235,0.25)",
                  }}
                >
                  {portalSaving ? "Generazione…" : "🔗 Genera link agenda"}
                </button>
              )}
            </div>
          </div>

          {/* Feedback portale (toast inline) */}
          {portalMessage && (
            <div style={{
              padding: "8px 14px", marginBottom: 14, borderRadius: 8,
              fontSize: 12, fontWeight: 700,
              background: portalMessage.type === "ok" ? "#dcfce7" : "#fef2f2",
              border: `1px solid ${portalMessage.type === "ok" ? "#86efac" : "#fecaca"}`,
              color: portalMessage.type === "ok" ? "#15803d" : "#991b1b",
            }}>
              {portalMessage.text}
            </div>
          )}

          {/* ── TOOLBAR navigatore + azioni ─────────────────────────── */}
          <div className="ao-toolbar">
            <div className="ao-toolbarLeft">
              {filterMode === "month" ? (
                <>
                  <button onClick={goToPrevMonth} aria-label="Mese precedente" className="ao-iconBtn">
                    <ChevronLeft size={16} />
                  </button>
                  <button className="ao-btnPrimary" onClick={() => { setCurrentMonth(startOfMonth(new Date())); }}>
                    {fmtMonthYear(currentMonth)}
                  </button>
                  <button onClick={goToNextMonth} aria-label="Mese successivo" className="ao-iconBtn">
                    <ChevronRight size={16} />
                  </button>
                  <div className="ao-divider" />
                  <button className="ao-btn" onClick={() => setFilterMode("range")}>
                    Intervallo custom
                  </button>
                </>
              ) : (
                <>
                  <input
                    type="date"
                    value={rangeStart}
                    onChange={e => setRangeStart(e.target.value)}
                    style={{
                      padding: "9px 12px", borderRadius: 10,
                      border: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700,
                      color: T.text, outline: "none", background: T.white,
                    }}
                  />
                  <span style={{ fontSize: 12, color: T.muted, fontWeight: 700 }}>→</span>
                  <input
                    type="date"
                    value={rangeEnd}
                    onChange={e => setRangeEnd(e.target.value)}
                    style={{
                      padding: "9px 12px", borderRadius: 10,
                      border: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700,
                      color: T.text, outline: "none", background: T.white,
                    }}
                  />
                  <div className="ao-divider" />
                  <button className="ao-btn" onClick={() => setFilterMode("month")}>
                    Per mese
                  </button>
                </>
              )}
            </div>

            <div className="ao-toolbarRight">
              <button
                className="ao-btnCTA"
                onClick={openCreateModal}
                style={{ background: T.blue, boxShadow: "0 2px 8px rgba(37,99,235,0.25)" }}
              >
                <Plus size={14} /> Nuovo appuntamento
              </button>
              <div className="ao-divider" />
              <button className="ao-btn" onClick={handlePreview}>
                <Eye size={14} /> Anteprima
              </button>
              <button className="ao-btn" onClick={handlePrint}>
                <Printer size={14} /> Stampa
              </button>
              <button className="ao-btnCTA" onClick={handlePdfDownload}>
                <Download size={14} /> Scarica PDF
              </button>
            </div>
          </div>

          {/* ── Bar selezione giorni ─────────────────────────────────── */}
          {groupedByDay.length > 1 && (
            <div style={{
              background: T.panelBg, border: `1px solid ${T.border}`,
              borderRadius: 10, padding: "10px 16px", marginBottom: 14,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: 8,
            }}>
              <div style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>
                <strong style={{ color: T.text, fontWeight: 800 }}>{totalDaysSelected}</strong> di {groupedByDay.length} giorni selezionati
                {" · "}{totalApptInSelection} appuntament{totalApptInSelection === 1 ? "o" : "i"} nella stampa
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={selectAllDays}
                  style={{
                    padding: "5px 12px", borderRadius: 8,
                    border: `1px solid ${T.border}`, background: T.white,
                    cursor: "pointer", fontSize: 11, fontWeight: 800, color: T.muted,
                  }}
                >
                  Tutti
                </button>
                <button
                  onClick={deselectAllDays}
                  style={{
                    padding: "5px 12px", borderRadius: 8,
                    border: `1px solid ${T.border}`, background: T.white,
                    cursor: "pointer", fontSize: 11, fontWeight: 800, color: T.muted,
                  }}
                >
                  Nessuno
                </button>
              </div>
            </div>
          )}

          {/* ── Lista giorni ─────────────────────────────────────────── */}
          {groupedByDay.length === 0 ? (
            <div style={{
              padding: "60px 20px", textAlign: "center",
              background: T.panelBg, border: `1px solid ${T.border}`,
              borderRadius: 12, color: T.muted,
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6, color: T.text }}>
                Nessun appuntamento in questo periodo
              </div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {guest.first_name} non ha appuntamenti registrati per il periodo selezionato.
              </div>
            </div>
          ) : (
            groupedByDay.map(group => {
              const isSelected = selectedDays[group.key] !== false;
              const monthOfDay = group.date.toLocaleDateString("it-IT", { month: "long" }).replace(/^./, c => c.toUpperCase());
              return (
                <div
                  key={group.key}
                  style={{
                    background: T.panelBg,
                    border: `1px solid ${T.border}`,
                    borderLeft: `4px solid ${guestColor}`,
                    borderRadius: 12,
                    overflow: "hidden",
                    marginBottom: 12,
                    boxShadow: "0 1px 4px rgba(15,23,42,0.05)",
                    opacity: isSelected ? 1 : 0.5,
                    transition: "opacity 0.15s",
                  }}
                >
                  {/* Header giorno */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "14px 20px", background: T.panelSoft,
                    borderBottom: `1px solid ${T.borderSoft}`,
                    flexWrap: "wrap",
                  }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleDaySelection(group.key)}
                      style={{
                        width: 18, height: 18, cursor: "pointer",
                        accentColor: guestColor, flexShrink: 0,
                      }}
                    />
                    {/* Mini date block */}
                    <div className="ao-dateBlock">
                      <div style={{
                        fontSize: 9, color: guestColor, fontWeight: 800,
                        textTransform: "uppercase", letterSpacing: 0.5, lineHeight: 1,
                      }}>
                        {dayShortName(group.date)}
                      </div>
                      <div style={{
                        fontSize: 18, fontWeight: 800, color: T.text,
                        lineHeight: 1.1, marginTop: 2,
                      }}>
                        {group.date.getDate()}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 800, color: T.text,
                      }}>
                        {fullDayLabel(group.date)}
                      </div>
                      <div style={{
                        fontSize: 11, color: T.mutedSoft, fontWeight: 700,
                        marginTop: 1, letterSpacing: 0.3, textTransform: "uppercase",
                      }}>
                        {group.events.length} appuntament{group.events.length === 1 ? "o" : "i"}
                      </div>
                    </div>
                    <button
                      onClick={() => handlePrintSingleDay(group.key)}
                      style={{
                        padding: "6px 12px", borderRadius: 8,
                        border: `1px solid ${T.border}`, background: T.white,
                        cursor: "pointer", fontSize: 11, fontWeight: 800, color: T.muted,
                        display: "inline-flex", alignItems: "center", gap: 4,
                      }}
                    >
                      <Printer size={12} /> Stampa giorno
                    </button>
                  </div>

                  {/* Tabella appuntamenti */}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{
                      width: "100%", borderCollapse: "collapse",
                      fontSize: 13, minWidth: 600,
                    }}>
                      <thead>
                        <tr style={{ background: T.panelSoft, borderBottom: `1px solid ${T.borderSoft}` }}>
                          <th style={thStyle}>Ora</th>
                          <th style={thStyle}>Paziente</th>
                          {showTelefono && <th style={thStyle}>Telefono</th>}
                          {showDurata && <th style={thStyle}>Durata</th>}
                          {showDiagnosi && <th style={thStyle}>Diagnosi</th>}
                          {showNote && <th style={thStyle}>Note</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {group.events.map((ev, idx) => {
                          const patientName = ev.patient
                            ? `${ev.patient.last_name} ${ev.patient.first_name}`
                            : "—";
                          const isLast = idx === group.events.length - 1;
                          return (
                            <tr
                              key={ev.id}
                              onClick={() => openEditModal(ev)}
                              style={{
                                borderBottom: isLast ? "none" : `1px solid ${T.borderXSoft}`,
                                cursor: "pointer",
                                transition: "background 0.12s",
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = T.panelSoft}
                              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                            >
                              <td style={{
                                ...tdStyle, color: guestColor, fontWeight: 800,
                                whiteSpace: "nowrap", fontSize: 14,
                              }}>
                                {fmtTime(ev.start_at)}
                              </td>
                              <td style={{ ...tdStyle, fontWeight: 800, color: T.text }}>
                                {patientName}
                              </td>
                              {showTelefono && (
                                <td style={{ ...tdStyle, color: T.muted, fontWeight: 600 }}>
                                  {ev.patient?.phone || "—"}
                                </td>
                              )}
                              {showDurata && (
                                <td style={{ ...tdStyle, color: T.muted, fontWeight: 600, whiteSpace: "nowrap" }}>
                                  {durationMinutes(ev.start_at, ev.end_at)} min
                                </td>
                              )}
                              {showDiagnosi && (
                                <td style={{ ...tdStyle, color: T.muted, fontWeight: 600 }}>
                                  {ev.patient?.diagnosis || "—"}
                                </td>
                              )}
                              {showNote && (
                                <td style={{ ...tdStyle, color: T.muted, fontWeight: 600 }}>
                                  {ev.calendar_note || "—"}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}

          <div style={{ marginTop: 32, fontSize: 11, color: T.mutedSoft, textAlign: "center", fontWeight: 600 }}>
            Le colonne mostrate sono configurabili da Impostazioni → Team → Modifica {guest.first_name} {guest.last_name}
          </div>
        </div>
      </div>

      {/* ── Modale create/edit appuntamento ospite (Fase B) ─────────────── */}
      {modalMode && studio?.id && (
        <GuestAppointmentModal
          mode={modalMode}
          studioId={studio.id}
          guestId={guest.id}
          guestColor={guestColor}
          guestDefaultRoomId={guest.default_room_id}
          initial={modalInitial}
          defaultDate={(() => {
            // Default intelligente:
            //  - Se siamo nel mese corrente → oggi alle 9:00
            //  - Altrimenti → il 1° del mese visualizzato alle 9:00
            //  - Modo "range" → primo giorno del range alle 9:00
            const now = new Date();
            if (filterMode === "month") {
              const sameMonth =
                currentMonth.getFullYear() === now.getFullYear() &&
                currentMonth.getMonth() === now.getMonth();
              const base = sameMonth ? new Date(now) : new Date(currentMonth);
              base.setHours(9, 0, 0, 0);
              return base;
            }
            const base = new Date(rangeStart + "T09:00:00");
            return base;
          })()}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

// ── Stili tabella condivisi ────────────────────────────────────────────
const thStyle: React.CSSProperties = {
  padding: "11px 20px",
  textAlign: "left",
  fontSize: 10,
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const tdStyle: React.CSSProperties = {
  padding: "14px 20px",
  fontSize: 13,
  verticalAlign: "top",
};
