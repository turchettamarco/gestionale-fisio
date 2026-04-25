// app/(protected)/components/dashboard/ForecastAndRentalSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Riga centrale: previsione incasso 7 giorni + noleggi in scadenza.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME } from "./shared/theme";
import { openWA } from "./shared/utils";
import type { ForecastRevenue, NoleggioExpiring } from "./shared/types";

export type ForecastAndRentalSectionProps = {
  forecastRevenue: ForecastRevenue;
  noleggioExpiring: NoleggioExpiring[];
  noleggioWarningDays: number;
  signatureName: string | null | undefined;
  signatureTitle: string | null | undefined;
};

export default function ForecastAndRentalSection(p: ForecastAndRentalSectionProps) {
  const firma     = [p.signatureName, p.signatureTitle].filter(Boolean).join("\n");
  const firmaLine = firma ? `\nGrazie,\n${firma}` : "\nGrazie";

  function sendWAForRental(n: NoleggioExpiring) {
    const ph = n.patient_phone; if (!ph) return;
    const scad = new Date(n.end_date + "T12:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
    const expired = n.days_remaining < 0;
    const msg = expired
      ? `Gentile ${n.patient_name},\nLe ricordiamo che il noleggio del dispositivo *${n.device_name}* è scaduto il ${scad}.\nLa preghiamo di contattarci per la restituzione.${firmaLine}`
      : `Gentile ${n.patient_name},\nLe ricordiamo che il noleggio del dispositivo *${n.device_name}* scadrà il *${scad}*${n.days_remaining > 0 ? ` (tra ${n.days_remaining} giorni)` : ""}.\nPer informazioni contatti lo studio.${firmaLine}`;
    openWA(ph, msg);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

      {/* ─── PREVISIONE INCASSO ────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${THEME.border}`, overflow: "hidden" }}>
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${THEME.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: THEME.text }}>Previsione incasso</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: THEME.muted }}>prossimi 7 giorni</span>
        </div>
        <div style={{ padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: THEME.teal }}>€{p.forecastRevenue.total.toLocaleString("it-IT")}</span>
            <span style={{ fontSize: 13, color: THEME.muted }}>stimati</span>
          </div>
          <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 12 }}>
            Da <strong style={{ color: THEME.text }}>{p.forecastRevenue.sessCount} appuntamenti</strong> confermati/prenotati nei prossimi {p.forecastRevenue.days} giorni
          </div>
          {p.forecastRevenue.sessCount === 0 ? (
            <div style={{ fontSize: 12, color: THEME.muted, fontStyle: "italic" }}>
              Nessun appuntamento confermato nei prossimi 7 giorni.
            </div>
          ) : (
            <div style={{ background: "rgba(13,148,136,0.06)", borderRadius: 8, padding: "10px 12px", border: "1px solid rgba(13,148,136,0.15)" }}>
              <div style={{ fontSize: 11, color: THEME.teal, fontWeight: 700, marginBottom: 4 }}>Valore medio per seduta</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: THEME.teal }}>
                €{p.forecastRevenue.sessCount > 0 ? Math.round(p.forecastRevenue.total / p.forecastRevenue.sessCount) : 0}
              </div>
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <a href="/calendar" style={{ fontSize: 11, color: THEME.blue, fontWeight: 700, textDecoration: "none" }}>
              Vai al calendario →
            </a>
          </div>
        </div>
      </div>

      {/* ─── NOLEGGI IN SCADENZA ───────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${THEME.border}`, overflow: "hidden" }}>
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${THEME.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: THEME.text }}>Noleggi in scadenza</span>
          <a href="/noleggio" style={{ fontSize: 11, color: THEME.blue, fontWeight: 700, textDecoration: "none" }}>Gestisci →</a>
        </div>
        <div style={{ padding: "12px 16px" }}>
          {p.noleggioExpiring.length === 0 ? (
            <div style={{ fontSize: 12, color: THEME.muted, padding: "8px 0", fontStyle: "italic" }}>
              Nessun noleggio in scadenza nei prossimi {p.noleggioWarningDays} giorni.
            </div>
          ) : (
            p.noleggioExpiring.map((n, i) => {
              const expired = n.days_remaining < 0;
              const urgent  = n.days_remaining === 0;
              const col = expired ? THEME.red : urgent ? THEME.red : THEME.amber;
              const bg  = expired ? "rgba(220,38,38,0.05)" : urgent ? "rgba(220,38,38,0.05)" : "rgba(249,115,22,0.05)";
              return (
                <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: bg, border: `1px solid ${col}22`, marginBottom: i < p.noleggioExpiring.length - 1 ? 6 : 0 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{expired ? "⛔" : urgent ? "🚨" : "⏳"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: THEME.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.patient_name}</div>
                    <div style={{ fontSize: 11, color: THEME.muted }}>{n.device_name}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: col }}>
                      {expired ? `Scaduto ${Math.abs(n.days_remaining)}gg fa` : urgent ? "Scade oggi" : `${n.days_remaining} giorni`}
                    </div>
                    <div style={{ fontSize: 10, color: THEME.muted }}>
                      {new Date(n.end_date + "T12:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
                    </div>
                  </div>
                  {n.patient_phone && (
                    <button onClick={() => sendWAForRental(n)} title="Invia WA scadenza" style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid rgba(37,211,102,0.4)", background: "rgba(37,211,102,0.08)", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      💬
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
