// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/panels/FiltersPopover.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Popover modale dei filtri avanzati per il calendario:
//   • Stato appuntamento (Tutti / Prenotato / Confermato / Eseguito / ...)
//   • Luogo (Tutti / Studio / Domicilio)
//   • Trattamento (Tutti / Seduta / Macchinario / Laser / ...)
//   • Toggle "Mostra finestre libere" (slot liberi tra appuntamenti)
//   • Bottone Reset tutto
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import {
  THEME, ALL_TREATMENTS, statusColor, statusLabel,
  type Status, type TreatmentType,
} from "../../utils";

export type CalendarFilters = {
  location: "all" | "studio" | "domicile";
  /** Filtro sede specifica (multi-sede, mig. 014). "all" = tutte le sedi,
   *  altrimenti l'id della studio_location. Tappa A multi-op/stanza. */
  locationId: "all" | string;
  treatmentType: "all" | TreatmentType;
  priceType: "all" | "invoiced" | "cash";
  minAmount: string;
  maxAmount: string;
};

export type FiltersPopoverProps = {
  /** Filtro stato corrente */
  statusFilter: Status | "all";
  setStatusFilter: (v: Status | "all") => void;

  /** Filtri avanzati */
  filters: CalendarFilters;
  setFilters: (f: CalendarFilters | ((prev: CalendarFilters) => CalendarFilters)) => void;

  /** Toggle "Mostra finestre libere" */
  showAvailableOnly: boolean;
  setShowAvailableOnly: (v: boolean) => void;

  /** Numero eventi visibili dopo applicazione filtri (mostrato in basso) */
  filteredEventsCount: number;

  /** Chiude il popover (overlay click o ✕) */
  onClose: () => void;

  // ─── Multi-sede (Tappa A): dropdown sede specifica ────────────────────
  /** Sedi dello studio. Il dropdown appare solo se multiLocationEnabled
   *  e ci sono almeno 2 sedi. */
  studioLocations?: Array<{ id: string; name: string; is_primary: boolean }>;
  multiLocationEnabled?: boolean;
};

const STATUS_OPTIONS = ["all", "booked", "confirmed", "done", "not_paid", "cancelled"] as const;

export default function FiltersPopover({
  statusFilter, setStatusFilter,
  filters, setFilters,
  showAvailableOnly, setShowAvailableOnly,
  filteredEventsCount,
  onClose,
  studioLocations,
  multiLocationEnabled,
}: FiltersPopoverProps) {

  // Indica se almeno un filtro avanzato è attivo (per il reset)
  const hasActiveAdvanced =
    filters.location !== "all" ||
    filters.locationId !== "all" ||
    filters.treatmentType !== "all" ||
    filters.priceType !== "all" ||
    !!filters.minAmount ||
    !!filters.maxAmount;

  const handleReset = () => {
    setFilters({ location: "all", locationId: "all", treatmentType: "all", priceType: "all", minAmount: "", maxAmount: "" });
    setStatusFilter("all");
    setShowAvailableOnly(false);
  };

  // Dropdown sede: solo se multi-sede attivo e almeno 2 sedi configurate.
  const showLocationIdFilter =
    !!multiLocationEnabled && !!studioLocations && studioLocations.length >= 2;

  return (
    <>
      {/* Overlay per chiusura su click esterno */}
      <div
        className="no-print"
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 29 }}
      />

      {/* Popover */}
      <div className="no-print" style={{
        position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)",
        zIndex: 30, background: THEME.panelBg,
        border: `2px solid ${THEME.border}`,
        borderRadius: 12, padding: "18px 20px",
        boxShadow: "0 8px 32px rgba(30,64,175,0.14)",
        width: 540, maxWidth: "96vw",
        color: THEME.text,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: THEME.blue }}>⚙ Filtri</span>
          <button onClick={onClose}
            style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16, color: THEME.muted, padding: "2px 6px" }}>
            ✕
          </button>
        </div>

        {/* ─── Stato ────────────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Stato appuntamento
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {STATUS_OPTIONS.map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status as Status | "all")}
                style={{
                  padding: "6px 12px", borderRadius: 6, cursor: "pointer",
                  fontWeight: 600, fontSize: 11, transition: "all 0.15s",
                  border: `1px solid ${statusFilter === status ? statusColor(status as Status) : THEME.borderSoft}`,
                  background: statusFilter === status ? statusColor(status as Status) : THEME.panelBg,
                  color: statusFilter === status ? "#fff" : THEME.text,
                }}
              >
                {status === "all" ? "Tutti" : statusLabel(status as Status)}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Luogo + Trattamento ──────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              Luogo
            </div>
            <select
              value={filters.location}
              onChange={e => setFilters(p => ({ ...p, location: e.target.value as "all" | "studio" | "domicile" }))}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: `1px solid ${THEME.borderSoft}`, background: THEME.panelBg, fontSize: 12, fontWeight: 600, color: THEME.text }}
            >
              <option value="all">Tutti i luoghi</option>
              <option value="studio">Studio</option>
              <option value="domicile">Domicilio</option>
            </select>
            {/* ─── Sede specifica (Tappa A, multi-sede) ─────────────── */}
            {showLocationIdFilter && (
              <select
                value={filters.locationId}
                onChange={e => setFilters(p => ({ ...p, locationId: e.target.value }))}
                style={{ width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 7, border: `1px solid ${THEME.borderSoft}`, background: THEME.panelBg, fontSize: 12, fontWeight: 600, color: THEME.text }}
              >
                <option value="all">Tutte le sedi</option>
                {studioLocations!.map(l => (
                  <option key={l.id} value={l.id}>{l.name}{l.is_primary ? " (principale)" : ""}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              Trattamento
            </div>
            <select
              value={filters.treatmentType}
              onChange={e => setFilters(p => ({ ...p, treatmentType: e.target.value as "all" | TreatmentType }))}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: `1px solid ${THEME.borderSoft}`, background: THEME.panelBg, fontSize: 12, fontWeight: 600, color: THEME.text }}
            >
              <option value="all">Tutti</option>
              {ALL_TREATMENTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        {/* ─── Slot liberi ──────────────────────────────────────── */}
        <div style={{ borderTop: `1px solid ${THEME.border}`, paddingTop: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <div style={{
              width: 36, height: 20, borderRadius: 999,
              background: showAvailableOnly ? THEME.green : THEME.borderSoft,
              position: "relative", transition: "background 0.2s", flexShrink: 0,
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: "50%", background: "#fff",
                position: "absolute", top: 2,
                left: showAvailableOnly ? 18 : 2,
                transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
              <input
                type="checkbox"
                checked={showAvailableOnly}
                onChange={e => setShowAvailableOnly(e.target.checked)}
                style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text }}>Mostra finestre libere</div>
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 2 }}>
                Evidenzia i gap tra appuntamenti in cui puoi inserirne di nuovi
              </div>
            </div>
          </label>
        </div>

        {/* ─── Footer: counter + reset ──────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, alignItems: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted }}>
            {filteredEventsCount} eventi visibili
          </div>
          <button
            onClick={handleReset}
            disabled={!hasActiveAdvanced && statusFilter === "all" && !showAvailableOnly}
            style={{
              padding: "6px 14px", borderRadius: 7,
              border: `1px solid ${THEME.borderSoft}`,
              background: THEME.panelSoft, color: THEME.text,
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
          >
            Reset tutto
          </button>
        </div>
      </div>
    </>
  );
}
