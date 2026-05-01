// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/panels/CalendarToolbar.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Toolbar sotto la barra superiore. Suddivisa in 3 sezioni:
//   • SINISTRA: navigazione (◀ Oggi ▶) — adatta in base alla vista
//                (settimana → ±1 settimana, mese → ±1 mese, giorno → ±1 giorno)
//   • CENTRO:   KPI rapidi (eseguiti/totali, fatturato giornaliero, previsione
//                settimanale), search rapida, bottone Filtri (con "●" se attivi),
//                menu Azioni (CSV / Riepilogo / Bulk pagamenti), bottone Bulk
//                conferma quando attivo
//   • DESTRA:   view switcher Giorno / Settimana / Mese
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, addDays } from "../../utils";
import type { CalendarFilters } from "./FiltersPopover";

export type CalendarToolbarProps = {
  // ─── Vista corrente + navigazione ─────────────────────────────
  viewType: "day" | "week" | "month";
  setViewType: (v: "day" | "week" | "month") => void;
  setCurrentDate: (d: Date | ((prev: Date) => Date)) => void;
  onGoToPreviousWeek: () => void;
  onGoToNextWeek: () => void;
  onGoToPreviousMonth: () => void;
  onGoToNextMonth: () => void;
  onGoToToday: () => void;

  // ─── KPI ──────────────────────────────────────────────────────
  stats: { done: number; total: number; revenue: number };
  weeklyExpectedRevenue: number;

  // ─── Search rapida ────────────────────────────────────────────
  calendarSearch: string;
  setCalendarSearch: (v: string) => void;
  isSearchActive: boolean;
  searchMatchCount: number;

  // ─── Bottone filtri ───────────────────────────────────────────
  filters: CalendarFilters;
  onToggleFiltersPopover: () => void;

  // ─── Menu Azioni ──────────────────────────────────────────────
  actionsMenuOpen: boolean;
  setActionsMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  onExportAppointments: () => void;
  onOpenDailySummary: () => void;
  bulkMode: boolean;
  setBulkMode: (b: boolean | ((prev: boolean) => boolean)) => void;
  bulkSelected: Set<string>;
  setBulkSelected: (s: Set<string>) => void;
  onBulkMarkPaid: () => void;

  // ─── Sidebar (mostra "Mostra all upcoming" condizionato) ─────
  showAllUpcoming: boolean;
};

const navBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

export default function CalendarToolbar({
  viewType, setViewType, setCurrentDate,
  onGoToPreviousWeek, onGoToNextWeek,
  onGoToPreviousMonth, onGoToNextMonth, onGoToToday,
  stats, weeklyExpectedRevenue,
  calendarSearch, setCalendarSearch, isSearchActive, searchMatchCount,
  filters, onToggleFiltersPopover,
  actionsMenuOpen, setActionsMenuOpen,
  onExportAppointments, onOpenDailySummary,
  bulkMode, setBulkMode, bulkSelected, setBulkSelected, onBulkMarkPaid,
  showAllUpcoming,
}: CalendarToolbarProps) {

  // Indica se almeno uno dei filtri avanzati è attivo (per evidenziare il bottone)
  const hasActiveFilters =
    filters.location !== "all" ||
    filters.treatmentType !== "all" ||
    !!filters.minAmount ||
    !!filters.maxAmount;

  // Classe scrollbar identica al codice originale
  const containerClass = `no-print sidebar-scroll ${showAllUpcoming ? "show-scrollbar" : ""}`;

  // Stili dei bottoni di navigazione (◀ ▶) e "Oggi"
  const arrowBtnStyle: React.CSSProperties = {
    ...navBtnStyle,
    border: `1px solid ${THEME.borderSoft}`,
    background: THEME.panelSoft,
    color: THEME.text,
    minWidth: 44,
  };
  const todayBtnStyle: React.CSSProperties = {
    ...navBtnStyle,
    border: `1px solid ${THEME.blueDark}`,
    background: THEME.blue,
    color: "#fff",
  };

  // Handler per "Oggi" / "Indietro" / "Avanti" in base alla vista
  const handlePrev = () => {
    if (viewType === "week") onGoToPreviousWeek();
    else if (viewType === "month") onGoToPreviousMonth();
    else setCurrentDate(prev => addDays(prev, -1));
  };
  const handleNext = () => {
    if (viewType === "week") onGoToNextWeek();
    else if (viewType === "month") onGoToNextMonth();
    else setCurrentDate(prev => addDays(prev, 1));
  };
  const handleToday = () => {
    if (viewType === "day") setCurrentDate(new Date());
    else onGoToToday();
  };

  // Stile bottoni view switcher
  const viewBtnStyle = (active: boolean, position: "left" | "middle" | "right"): React.CSSProperties => ({
    padding: "8px 18px",
    borderRadius:
      position === "left" ? "8px 0 0 8px"
      : position === "right" ? "0 8px 8px 0"
      : 0,
    border: `2px solid ${active ? THEME.blue : THEME.border}`,
    background: active ? "linear-gradient(135deg, #0d9488, #2563eb)" : THEME.panelBg,
    color: active ? "#93c5fd" : THEME.text,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
    minWidth: 80,
    letterSpacing: 0.3,
  });

  return (
    <div className={containerClass} style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
      padding: "12px 16px",
      background: THEME.panelBg,
      borderRadius: 8,
      border: `1.5px solid ${THEME.border}`,
      top: 0,
      zIndex: 9,
    }}>

      {/* ─── SINISTRA: navigazione ─────────────────────────────── */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handlePrev} style={arrowBtnStyle}>◀</button>
        <button onClick={handleToday} style={todayBtnStyle}>Oggi</button>
        <button onClick={handleNext} style={arrowBtnStyle}>▶</button>
      </div>

      {/* ─── CENTRO: KPI + search + filtri + azioni ────────────── */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>

        {/* KPI rapidi */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginRight: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: THEME.green, background: "rgba(22, 163, 74, 0.1)", padding: "4px 8px", borderRadius: 6 }}>
            ✓ {stats.done}/{stats.total}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: THEME.blue, background: "rgba(91,130,168,0.1)", padding: "4px 8px", borderRadius: 6 }}>
            €{stats.revenue}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: THEME.amber, background: "rgba(245, 158, 11, 0.1)", padding: "4px 8px", borderRadius: 6 }}>
            € {Math.round(weeklyExpectedRevenue).toLocaleString("it-IT")} prev.
          </div>
        </div>

        {/* Ricerca rapida */}
        <div style={{ position: "relative" }}>
          <input
            value={calendarSearch}
            onChange={e => setCalendarSearch(e.target.value)}
            placeholder="Cerca paziente..."
            style={{
              padding: "7px 70px 7px 12px",
              borderRadius: 8,
              border: isSearchActive ? "2px solid #f59e0b" : `1px solid ${THEME.borderSoft}`,
              background: isSearchActive ? "rgba(245,158,11,0.06)" : THEME.panelBg,
              color: THEME.text,
              fontWeight: 600,
              fontSize: 12,
              width: 180,
              outline: "none",
              boxShadow: isSearchActive ? "0 0 8px rgba(245,158,11,0.2)" : "none",
            }}
          />
          {calendarSearch.trim().length >= 2 && (
            <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontSize: 10, fontWeight: 800,
                color: searchMatchCount > 0 ? "#92400e" : THEME.red,
                background: searchMatchCount > 0 ? "rgba(245,158,11,0.25)" : "rgba(220,38,38,0.1)",
                padding: "2px 6px", borderRadius: 4,
              }}>
                {searchMatchCount}
              </span>
              <button
                onClick={() => setCalendarSearch("")}
                style={{
                  width: 18, height: 18, borderRadius: 4, border: "none",
                  background: "rgba(107,114,128,0.15)", color: THEME.muted,
                  cursor: "pointer", fontWeight: 800, fontSize: 11,
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                }}
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Bottone filtri (apre il popover) */}
        <button
          onClick={onToggleFiltersPopover}
          style={{
            padding: "8px 14px", borderRadius: 8,
            border: `1.5px solid ${hasActiveFilters ? THEME.blue : THEME.border}`,
            background: hasActiveFilters ? "rgba(37,99,235,0.08)" : THEME.panelSoft,
            color: hasActiveFilters ? THEME.blue : THEME.text,
            cursor: "pointer", fontWeight: 700, fontSize: 12,
            display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
          }}
        >
          ⚙ Filtri{hasActiveFilters ? " ●" : ""}
        </button>

        {/* Menu Azioni */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setActionsMenuOpen(v => !v)}
            style={{
              padding: "8px 14px", borderRadius: 8,
              border: `1px solid ${THEME.border}`,
              background: THEME.panelSoft, color: THEME.text,
              cursor: "pointer", fontWeight: 700, fontSize: 12,
              display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
            }}
          >
            Azioni {actionsMenuOpen ? "▲" : "▼"}
          </button>
          {actionsMenuOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onClick={() => setActionsMenuOpen(false)} />
              <div style={{
                position: "fixed", top: 120, right: 28,
                background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
                borderRadius: 10, boxShadow: "0 8px 28px rgba(30,64,175,0.18)",
                zIndex: 9999, minWidth: 220, overflow: "hidden",
              }}>
                <button
                  onClick={() => { onExportAppointments(); setActionsMenuOpen(false); }}
                  style={{ width: "100%", padding: "11px 16px", background: "none", border: "none", borderBottom: `1px solid ${THEME.border}`, textAlign: "left", fontSize: 13, fontWeight: 600, cursor: "pointer", color: THEME.text }}
                >
                  ▤ Esporta CSV
                </button>
                <button
                  onClick={() => { onOpenDailySummary(); setActionsMenuOpen(false); }}
                  style={{ width: "100%", padding: "11px 16px", background: "none", border: "none", borderBottom: `1px solid ${THEME.border}`, textAlign: "left", fontSize: 13, fontWeight: 600, cursor: "pointer", color: THEME.text }}
                >
                  📋 Riepilogo giornaliero
                </button>
                <button
                  onClick={() => {
                    setBulkMode(m => !m);
                    setBulkSelected(new Set());
                    setActionsMenuOpen(false);
                  }}
                  style={{ width: "100%", padding: "11px 16px", background: "none", border: "none", textAlign: "left", fontSize: 13, fontWeight: 600, cursor: "pointer", color: bulkMode ? THEME.blue : THEME.text }}
                >
                  💰 {bulkMode ? `Bulk attivo (${bulkSelected.size})` : "Segna pagati in blocco"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Bulk confirm — visibile solo se bulk attivo e selezione > 0 */}
        {bulkMode && bulkSelected.size > 0 && (
          <button
            onClick={onBulkMarkPaid}
            style={{
              padding: "8px 14px", borderRadius: 8, border: "none",
              background: THEME.green, color: "#fff", cursor: "pointer",
              fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
            }}
          >
            Segna {bulkSelected.size} pagati
          </button>
        )}
      </div>

      {/* ─── DESTRA: view switcher ─────────────────────────────── */}
      <div style={{ display: "flex", gap: 4 }}>
        <button
          onClick={() => {
            setViewType("day");
            if (viewType !== "day") setCurrentDate(new Date());
          }}
          style={viewBtnStyle(viewType === "day", "left")}
        >
          Giorno
        </button>
        <button
          onClick={() => {
            setViewType("week");
            if (viewType !== "week") setCurrentDate(new Date());
          }}
          style={viewBtnStyle(viewType === "week", "middle")}
        >
          Settimana
        </button>
        <button
          onClick={() => {
            setViewType("month");
            if (viewType !== "month") setCurrentDate(new Date());
          }}
          style={viewBtnStyle(viewType === "month", "right")}
        >
          Mese
        </button>
      </div>
    </div>
  );
}
