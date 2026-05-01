// app/(protected)/settings/components/sections/IntegrationsSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Backup & Integrazioni" — export CSV + feed iCal per Google
// Calendar (con token di sicurezza ruotabile).
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead } from "../shared/theme";

export type IntegrationsSectionProps = {
  show: boolean;
  onToggle: () => void;
  exportingBackup: boolean;
  onExportBackup: () => void;

  calendarToken: string | null;
  calendarTokenLoading: boolean;
  calendarTokenRotating: boolean;
  onRotateToken: () => void;
  onCopyLink: (url: string) => void;
};

export default function IntegrationsSection(p: IntegrationsSectionProps) {
  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>Backup & Integrazioni</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>Esporta dati · Google Calendar</div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>
      {p.show && (
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ── Backup CSV ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: 10, border: `1px solid ${THEME.border}`, background: THEME.panelSoft }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: THEME.text }}>Backup completo dati</div>
              <div style={{ fontSize: 12, color: THEME.muted, marginTop: 3 }}>Scarica 3 file CSV: pazienti, appuntamenti, noleggii. Apribili in Excel.</div>
            </div>
            <button onClick={p.onExportBackup} disabled={p.exportingBackup} style={{ padding: "9px 18px", borderRadius: 7, border: "none", background: `linear-gradient(135deg,#0d9488,#2563eb)`, color: "#fff", fontWeight: 700, fontSize: 13, cursor: p.exportingBackup ? "wait" : "pointer", opacity: p.exportingBackup ? 0.6 : 1, flexShrink: 0 }}>
              {p.exportingBackup ? "Preparazione…" : "↓ Scarica backup"}
            </button>
          </div>

          {/* ── Google Calendar feed ── */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "14px 16px", borderRadius: 10, border: `1px solid ${THEME.border}`, background: THEME.panelSoft, gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: THEME.text }}>Google Calendar — Feed automatico</div>
              <div style={{ fontSize: 12, color: THEME.muted, marginTop: 3, marginBottom: 10 }}>
                Copia questo link e aggiungilo a Google Calendar come <strong>Calendario da URL</strong>. Si aggiorna automaticamente ogni 1-2 ore.
              </div>

              {p.calendarTokenLoading ? (
                <div style={{ fontSize: 12, color: THEME.muted, padding: "8px 0" }}>
                  Caricamento link…
                </div>
              ) : !p.calendarToken ? (
                <div style={{ fontSize: 12, color: THEME.amber, padding: "8px 0", fontWeight: 600 }}>
                  ⚠️ Token non disponibile. Verifica di avere uno studio configurato e ricarica la pagina.
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <code style={{ fontSize: 11, background: THEME.text, color: "#fff", padding: "5px 10px", borderRadius: 6, userSelect: "all", wordBreak: "break-all" }}>
                      {typeof window !== "undefined"
                        ? `${window.location.origin}/api/calendar.ics?token=${p.calendarToken}`
                        : `https://tuo-dominio.vercel.app/api/calendar.ics?token=${p.calendarToken}`}
                    </code>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/api/calendar.ics?token=${p.calendarToken}`;
                        p.onCopyLink(url);
                      }}
                      style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${THEME.blue}`, background: "rgba(37,99,235,0.06)", color: THEME.blue, fontWeight: 700, fontSize: 11, cursor: "pointer", flexShrink: 0 }}
                    >
                      📋 Copia link
                    </button>
                    <a
                      href={typeof window !== "undefined"
                        ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`${window.location.origin}/api/calendar.ics?token=${p.calendarToken}`)}`
                        : "#"}
                      target="_blank" rel="noopener noreferrer"
                      style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${THEME.teal}`, background: "rgba(13,148,136,0.06)", color: THEME.teal, fontWeight: 700, fontSize: 11, textDecoration: "none", flexShrink: 0 }}
                    >
                      Apri Google Calendar →
                    </a>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 11, color: THEME.muted, lineHeight: 1.6 }}>
                    <strong>Come aggiungere:</strong> Apri Google Calendar → <em>+</em> accanto a &quot;Altri calendari&quot; → <em>Da URL</em> → incolla il link → <em>Aggiungi calendario</em>
                  </div>

                  <div style={{
                    marginTop: 14,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "rgba(245,158,11,0.06)",
                    border: `1px solid rgba(245,158,11,0.25)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: THEME.amber }}>🔒 Sicurezza link</div>
                      <div style={{ fontSize: 11, color: THEME.muted, marginTop: 2, lineHeight: 1.5 }}>
                        Chi ha questo link può vedere i tuoi appuntamenti.
                        Se l&apos;hai condiviso per sbaglio, rigenera il token: il vecchio URL smetterà di funzionare.
                      </div>
                    </div>
                    <button
                      onClick={p.onRotateToken}
                      disabled={p.calendarTokenRotating}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `1px solid ${THEME.amber}`,
                        background: "#fff",
                        color: THEME.amber,
                        fontWeight: 700,
                        fontSize: 11,
                        cursor: p.calendarTokenRotating ? "default" : "pointer",
                        opacity: p.calendarTokenRotating ? 0.6 : 1,
                        flexShrink: 0,
                      }}
                    >
                      {p.calendarTokenRotating ? "Rigenerazione…" : "🔄 Rigenera token"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
