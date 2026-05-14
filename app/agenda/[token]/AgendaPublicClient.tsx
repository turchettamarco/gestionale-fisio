"use client";

// ════════════════════════════════════════════════════════════════════════
// app/agenda/[token]/AgendaPublicClient.tsx
// ════════════════════════════════════════════════════════════════════════
//
// Portale pubblico dell'ospite (mig. 032, Step 6c).
// Stesso design della pagina interna /ospiti/[id] ma:
//   - Niente AppNavbar / menu utente
//   - Header NEUTRO (no brand studio, no FisioHub)
//   - Badge "Sola lettura" per chiarezza
//   - Dati arrivano dalla API /api/public-agenda/[token] (no Supabase
//     diretto, no credenziali nel client)
//   - 3 bottoni Anteprima/Stampa/PDF tutti funzionanti
//
// Mobile responsive.
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState, useCallback, Fragment } from "react";
import { useParams } from "next/navigation";
import { Printer, Download, Eye, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { previewAgendaInBrowser, printAgenda, downloadAgendaPDF, type GuestAgendaData } from "@/app/(protected)/ospiti/[id]/utils/exportGuestAgenda";
import type { PublicAgendaResponse, PublicAppointmentData } from "@/app/api/public-agenda/[token]/route";

// ── Palette brand FisioHub ─────────────────────────────────────────────
const T = {
  appBg:       "#f1f5f9",
  panelBg:     "#ffffff",
  panelSoft:   "#f8fafc",
  text:        "#0f172a",
  textSoft:    "#1e293b",
  muted:       "#475569",
  mutedSoft:   "#64748b",
  mutedXSoft:  "#94a3b8",
  border:      "#cbd5e1",
  borderSoft:  "#e2e8f0",
  borderXSoft: "#f1f5f9",
  blue:        "#2563eb",
  teal:        "#0d9488",
  white:       "#ffffff",
};

const GRADIENT = "linear-gradient(135deg, #0d9488, #2563eb)";

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
  return d.toLocaleDateString("it-IT", { weekday: "short" })
    .replace(/^./, c => c.toUpperCase()).replace(/\.$/, "");
}
function fullDayLabel(d: Date): string {
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

// ════════════════════════════════════════════════════════════════════════

export default function AgendaPublicClient() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [data, setData] = useState<PublicAgendaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterMode, setFilterMode] = useState<"month" | "range">("month");
  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [rangeStart, setRangeStart] = useState<string>(fmtDateInput(startOfMonth(new Date())));
  const [rangeEnd, setRangeEnd] = useState<string>(fmtDateInput(endOfMonth(new Date())));
  const [selectedDays, setSelectedDays] = useState<Record<string, boolean>>({});

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

  // ── Carica via API pubblica ───────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const fromStr = fmtDateInput(fromDate);
        const toStr = fmtDateInput(toDate);
        const res = await fetch(`/api/public-agenda/${token}?from=${fromStr}&to=${toStr}`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404) {
            setError("Link non valido o scaduto. Contatta lo studio per ricevere un link aggiornato.");
          } else {
            setError("Impossibile caricare l'agenda. Riprova tra qualche istante.");
          }
          setLoading(false);
          return;
        }
        const json: PublicAgendaResponse = await res.json();
        setData(json);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setError("Errore di connessione. Verifica la connessione internet.");
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [token, fromDate, toDate]);

  // ── Raggruppa per giorno ──────────────────────────────────────────────
  const groupedByDay = useMemo(() => {
    if (!data) return [];
    const groups: Array<{ key: string; date: Date; events: PublicAppointmentData[] }> = [];
    const byKey = new Map<string, PublicAppointmentData[]>();
    for (const a of data.appointments) {
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
  }, [data]);

  useEffect(() => {
    const map: Record<string, boolean> = {};
    for (const g of groupedByDay) map[g.key] = true;
    setSelectedDays(map);
  }, [groupedByDay]);

  const totalAppointments = data?.appointments.length ?? 0;
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

  // Builder dati comune per export
  const buildExportData = useCallback((onlyDayKey?: string): GuestAgendaData => {
    if (!data) throw new Error("Dati non caricati");
    const localFields = data.guest.pdf_print_fields || {};
    const periodLabel = filterMode === "month"
      ? fmtMonthYear(currentMonth)
      : `dal ${new Date(rangeStart).toLocaleDateString("it-IT")} al ${new Date(rangeEnd).toLocaleDateString("it-IT")}`;

    const filteredGroups = onlyDayKey
      ? groupedByDay.filter(g => g.key === onlyDayKey)
      : groupedByDay.filter(g => selectedDays[g.key] !== false);

    return {
      guest: {
        first_name: data.guest.first_name,
        last_name: data.guest.last_name,
        specialty: data.guest.specialty,
        display_color: data.guest.display_color,
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
      // mig. 032 — NIENTE brand studio nel portale pubblico: passiamo null
      studio: null,
    };
  }, [data, filterMode, currentMonth, rangeStart, rangeEnd, groupedByDay, selectedDays]);

  const handlePdfDownload = useCallback(async () => {
    if (!data) return;
    try {
      await downloadAgendaPDF(buildExportData());
    } catch (e) {
      console.error("Errore PDF:", e);
      alert("Errore nella generazione del PDF. Riprova.");
    }
  }, [data, buildExportData]);

  const handlePrint = useCallback(() => {
    if (!data) return;
    printAgenda(buildExportData());
  }, [data, buildExportData]);

  const handlePreview = useCallback(() => {
    if (!data) return;
    previewAgendaInBrowser(buildExportData());
  }, [data, buildExportData]);

  const handlePrintSingleDay = useCallback((dayKeyToPrint: string) => {
    if (!data) return;
    printAgenda(buildExportData(dayKeyToPrint));
  }, [data, buildExportData]);

  // ── Render: loading / error / OK ──────────────────────────────────────
  if (loading && !data) {
    return (
      <div style={{
        minHeight: "100vh", background: T.appBg,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ color: T.muted, fontSize: 14, fontWeight: 600 }}>
          Caricamento agenda…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        minHeight: "100vh", background: T.appBg,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}>
        <div style={{
          maxWidth: 480, padding: 28,
          background: T.panelBg, border: `1px solid ${T.border}`,
          borderRadius: 14, textAlign: "center",
          boxShadow: "0 2px 14px rgba(15,23,42,0.06)",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "#fef2f2", color: "#dc2626",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
          }}>
            <Lock size={26} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 8 }}>
            Accesso non disponibile
          </div>
          <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
            {error}
          </div>
        </div>
      </div>
    );
  }

  const { guest } = data;
  const guestColor = guest.display_color || "#DB2777";
  const fields = guest.pdf_print_fields || {};
  const showTelefono = fields.telefono !== false;
  const showDurata = fields.durata !== false;
  const showDiagnosi = fields.diagnosi !== false;
  const showNote = fields.note !== false;
  const numCols = 2 + (showTelefono ? 1 : 0) + (showDurata ? 1 : 0) + (showDiagnosi ? 1 : 0) + (showNote ? 1 : 0);
  const periodLabel = filterMode === "month" ? fmtMonthYear(currentMonth) : "Personalizzato";
  const nextLabel = nextAppointmentLabel(groupedByDay);
  const initials = `${guest.first_name[0] ?? ""}${guest.last_name[0] ?? ""}`.toUpperCase();

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
          display: grid; grid-template-columns: repeat(3, 1fr);
        }
        .ao-kpi { padding: 16px 20px; }
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
        .ao-divider { width: 1px; height: 26px; background: ${T.borderSoft}; margin: 0 4px; }
        .ao-dateBlock {
          background: ${T.white}; border: 1px solid ${T.border};
          border-radius: 8px; padding: 6px 10px; text-align: center;
          min-width: 56px; flex-shrink: 0;
        }
        @media (max-width: 768px) {
          .ao-container { padding: 12px; }
          .ao-headerBand { padding: 14px 16px; }
          .ao-kpiGrid { grid-template-columns: 1fr 1fr 1fr; }
          .ao-kpi { padding: 10px 8px; }
          .ao-toolbar { flex-direction: column; align-items: stretch; }
          .ao-toolbarLeft, .ao-toolbarRight { justify-content: center; }
          .ao-toolbarRight .ao-btnCTA, .ao-toolbarRight .ao-btn {
            flex: 1; justify-content: center;
            padding: 9px 8px; font-size: 12px;
          }
        }
      `}</style>

      <div className="ao-wrap">
        <div className="ao-container">

          {/* ── HEADER NEUTRO (no brand studio per portale pubblico) ─── */}
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
                    Agenda professionale
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
                  }}>
                    {guest.specialty}
                  </div>
                </div>
              </div>
              {/* Badge "Sola lettura" */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "rgba(255,255,255,0.18)",
                border: "1px solid rgba(255,255,255,0.3)",
                padding: "6px 14px", borderRadius: 99,
                color: T.white, fontSize: 12, fontWeight: 800,
                whiteSpace: "nowrap", flexShrink: 0,
              }}>
                <Lock size={12} /> Sola lettura
              </div>
            </div>

            {/* KPI 3 colonne (no "stato attivo" che è dato del titolare) */}
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
                  Prossimo
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>
                  {nextLabel}
                </div>
              </div>
            </div>
          </div>

          {/* TOOLBAR */}
          <div className="ao-toolbar">
            <div className="ao-toolbarLeft">
              {filterMode === "month" ? (
                <>
                  <button onClick={goToPrevMonth} aria-label="Mese precedente" className="ao-iconBtn">
                    <ChevronLeft size={16} />
                  </button>
                  <button className="ao-btnPrimary" onClick={() => setCurrentMonth(startOfMonth(new Date()))}>
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

          {/* Bar selezione giorni */}
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

          {/* Lista giorni */}
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
                Non hai appuntamenti registrati per il periodo selezionato.
              </div>
            </div>
          ) : (
            groupedByDay.map(group => {
              const isSelected = selectedDays[group.key] !== false;
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
                            <tr key={ev.id} style={{
                              borderBottom: isLast ? "none" : `1px solid ${T.borderXSoft}`,
                            }}>
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

          {/* Footer minimo */}
          <div style={{
            marginTop: 32, padding: "16px 0",
            fontSize: 11, color: T.mutedSoft, textAlign: "center", fontWeight: 600,
            borderTop: `1px solid ${T.borderSoft}`,
          }}>
            Pagina di sola lettura · Aggiornata in tempo reale
          </div>
        </div>
      </div>
    </>
  );
}

// ── Stili tabella ─────────────────────────────────────────────────────
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
