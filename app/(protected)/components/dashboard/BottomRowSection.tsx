// app/(protected)/components/dashboard/BottomRowSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Riga inferiore della dashboard:
//   1. Slot liberi (oggi e domani, ore 8-20)
//   2. Saldi aperti (raggruppati per paziente, con stampa PDF)
//   3. Compleanni della settimana
// ═══════════════════════════════════════════════════════════════════════

"use client";

import Link from "next/link";
import { getStudioBranding } from "@/src/lib/studioBranding";
import { THEME } from "./shared/theme";
import { fmtDate, fmtPhone, openWA } from "./shared/utils";
import { studioPdfHeader, studioHeaderCss, studioPdfFooter, type StudioHeaderData } from "@/src/lib/pdfHeader";
import type {
  BirthdayRow, FreeSlot, OpenBalanceGroup, OpenBalanceRow,
} from "./shared/types";

export type BottomRowSectionProps = {
  // Slot liberi
  freeSlots: FreeSlot[];

  // Saldi aperti
  loadingBalances: boolean;
  openBalances: OpenBalanceRow[];
  openBalanceGroups: OpenBalanceGroup[];
  currentStudio: StudioHeaderData;
  onTogglePaid: (id: string, isPaid: boolean) => void;

  // Compleanni
  loadingBirthdays: boolean;
  birthdays: BirthdayRow[];
};

export default function BottomRowSection(p: BottomRowSectionProps) {
  // Helper per costruire il messaggio di sollecito
  const __b = getStudioBranding(p.currentStudio); const firma = [__b.signatureName, __b.signatureTitle].filter(Boolean).join("\n");
  const firmaLine = firma ? `\n\nCordiali saluti,\n${firma}` : "\n\nCordiali saluti";

  function printOpenBalances() {
    const rows = p.openBalanceGroups.map(g =>
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${g.patient_name}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${g.sessions}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#dc2626">${g.total.toLocaleString("it-IT")}€</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b">${new Date(g.last_at).toLocaleDateString("it-IT")}</td></tr>`
    ).join("");
    const totSessions = p.openBalanceGroups.reduce((s, g) => s + g.sessions, 0);
    const totAmount   = p.openBalanceGroups.reduce((s, g) => s + g.total, 0);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Saldi aperti</title><style>body{font-family:system-ui,sans-serif;padding:32px;color:#0f172a}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}th{background:#f1f5f9;padding:8px 12px;text-align:left;font-weight:700;font-size:12px}tfoot td{font-weight:800;font-size:14px;padding:10px 12px;border-top:2px solid #0f172a}@media print{button{display:none}}${studioHeaderCss}</style></head><body>${studioPdfHeader(p.currentStudio, { docTitle: "Saldi Aperti", docSubtitle: `${p.openBalanceGroups.length} pazienti` })}<table><thead><tr><th>Paziente</th><th style="text-align:center">Sedute</th><th style="text-align:right">Totale</th><th>Ultima seduta</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>TOTALE</td><td style="text-align:center">${totSessions}</td><td style="text-align:right;color:#dc2626">${totAmount.toLocaleString("it-IT")}€</td><td></td></tr></tfoot></table>${studioPdfFooter(p.currentStudio)}<button onclick="window.print()" style="margin-top:24px;padding:10px 24px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">🖨 Stampa</button></body></html>`;
    const w = window.open("", "_blank", "width=800,height=600");
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, alignItems: "start" }}>

      {/* ─── SLOT LIBERI ───────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${THEME.border}`, overflow: "hidden" }}>
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${THEME.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 12, color: THEME.text }}>Slot liberi</span>
            <div style={{ fontSize: 10, color: THEME.muted, marginTop: 1 }}>oggi e domani · in base ai tuoi orari di apertura</div>
          </div>
          {p.freeSlots.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: THEME.blue, background: "rgba(37,99,235,0.08)", padding: "2px 8px", borderRadius: 4 }}>
              {p.freeSlots.length} ore libere
            </span>
          )}
        </div>
        <div style={{ padding: "12px 16px" }}>
          {p.freeSlots.length === 0 ? (
            <div style={{ color: THEME.muted, fontSize: 12, fontWeight: 500 }}>Nessuno slot disponibile.</div>
          ) : (
            (["oggi", "domani"] as const).map(label => {
              const slots = p.freeSlots.filter(s => s.day === label);
              if (!slots.length) return null;
              return (
                <div key={label} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 7 }}>{label}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {slots.map(s => (
                      <Link
                        key={s.time}
                        href={`/calendar?date=${s.dateYMD}&new=1&time=${s.time.replace(":", "")}`}
                        style={{ padding: "5px 11px", borderRadius: 7, border: `1px solid ${THEME.border}`, background: THEME.panelSoft, fontSize: 12, fontWeight: 700, color: THEME.blue, cursor: "pointer", textDecoration: "none" }}
                      >
                        {s.time}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── SALDI APERTI ──────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${THEME.border}`, overflow: "hidden" }}>
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${THEME.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 12, color: THEME.text }}>💰 Saldi aperti</span>
            <div style={{ fontSize: 10, color: THEME.muted, marginTop: 1 }}>sedute eseguite non pagate · raggruppate per paziente</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {p.openBalanceGroups.length > 0 && (
              <>
                <span style={{ fontSize: 11, fontWeight: 700, color: THEME.red, background: "rgba(220,38,38,0.08)", padding: "2px 8px", borderRadius: 4 }}>
                  {p.openBalanceGroups.reduce((s, g) => s + g.total, 0).toLocaleString("it-IT", { maximumFractionDigits: 0 })}€
                </span>
                <button onClick={printOpenBalances} style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.text, fontWeight: 700, fontSize: 10, cursor: "pointer" }}>
                  🖨 Stampa
                </button>
              </>
            )}
          </div>
        </div>
        <div style={{ padding: "6px 12px", maxHeight: 280, overflowY: "auto" }}>
          {p.loadingBalances ? (
            <div style={{ color: THEME.muted, fontSize: 12, padding: "10px 0" }}>Caricamento…</div>
          ) : p.openBalanceGroups.length === 0 ? (
            <div style={{ color: THEME.green, fontSize: 12, padding: "12px 2px", fontWeight: 600 }}>Nessun saldo aperto ✓</div>
          ) : (
            p.openBalanceGroups.map((g, i) => {
              const clean = g.phone ? fmtPhone(g.phone) : "";
              const waMsg = `Gentile ${g.patient_name.split(" ")[1] || g.patient_name},\n\nLe ricordiamo che risultano ${g.sessions} seduta${g.sessions > 1 ? "e" : ""} non ancora saldate per un totale di ${g.total.toLocaleString("it-IT")}€.\n\nPer qualsiasi informazione siamo a disposizione.${firmaLine}`;
              return (
                <div key={g.patient_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 4px", borderBottom: i < p.openBalanceGroups.length - 1 ? `1px solid ${THEME.border}` : "none" }}>
                  {/* Avatar */}
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(220,38,38,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: THEME.red, flexShrink: 0 }}>
                    {(g.patient_name[0] || "?").toUpperCase()}
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={`/patients/${g.patient_id}`} style={{ fontWeight: 700, fontSize: 12, color: THEME.text, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.patient_name}</Link>
                    <div style={{ fontSize: 10, color: THEME.muted, marginTop: 1, display: "flex", gap: 6 }}>
                      <span>{g.sessions} seduta{g.sessions > 1 ? "e" : ""}</span>
                      <span>·</span>
                      <span>ultima {new Date(g.last_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}</span>
                    </div>
                  </div>
                  {/* Totale + azioni */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: THEME.red }}>{g.total.toLocaleString("it-IT")}€</span>
                    {clean && (
                      <button
                        onClick={() => openWA(g.phone || "", waMsg)}
                        style={{ padding: "3px 7px", borderRadius: 4, border: "none", background: "#25d366", color: "#fff", fontWeight: 700, fontSize: 10, cursor: "pointer" }}
                        title="Invia sollecito pagamento su WhatsApp"
                      >
                        WA
                      </button>
                    )}
                    <button
                      onClick={() => p.onTogglePaid(p.openBalances.find(r => r.patient_id === g.patient_id)?.id || "", true)}
                      style={{ padding: "3px 7px", borderRadius: 4, border: "none", background: THEME.green, color: "#fff", fontWeight: 700, fontSize: 10, cursor: "pointer" }}
                    >
                      Incassa
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── COMPLEANNI ────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${THEME.border}`, overflow: "hidden" }}>
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${THEME.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: THEME.text }}>🎂 Compleanni</span>
          <span style={{ fontSize: 10, color: THEME.muted }}>prossimi 7 giorni</span>
        </div>
        <div style={{ padding: "6px 12px" }}>
          {p.loadingBirthdays ? (
            <div style={{ color: THEME.muted, fontSize: 12, padding: "10px 0" }}>Caricamento…</div>
          ) : p.birthdays.length === 0 ? (
            <div style={{ color: THEME.muted, fontSize: 12, padding: "12px 2px", fontWeight: 500 }}>Nessun compleanno questa settimana.</div>
          ) : (
            p.birthdays.map((b, i) => {
              const waClean = b.phone ? fmtPhone(b.phone) : "";
              const waText  = `Gentile ${b.first_name},\n\nLe auguriamo un felice compleanno!${firmaLine}`;
              return (
                <div key={b.patient_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 4px", borderBottom: i < p.birthdays.length - 1 ? `1px solid ${THEME.border}` : "none" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: b.isToday ? "rgba(249,115,22,0.12)" : "rgba(37,99,235,0.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎂</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={`/patients/${b.patient_id}`} style={{ fontWeight: 600, fontSize: 12, color: THEME.text, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</Link>
                    <div style={{ fontSize: 10, marginTop: 1, display: "flex", gap: 5 }}>
                      <span style={{ color: b.isToday ? THEME.amber : THEME.muted, fontWeight: b.isToday ? 700 : 500 }}>{b.weekday}</span>
                      <span style={{ color: THEME.muted }}>· {b.age} anni</span>
                    </div>
                  </div>
                  {waClean && (
                    <button onClick={() => openWA(b.phone || "", waText)} style={{ padding: "4px 8px", borderRadius: 5, border: "none", background: THEME.green, color: "#fff", fontWeight: 700, fontSize: 10, cursor: "pointer", flexShrink: 0 }}>
                      🎉 WA
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
