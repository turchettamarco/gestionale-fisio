// app/(protected)/settings/components/sections/PrivacySection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Modalità Privacy" — toggle puramente visuale che nasconde
// nome e cognome dei pazienti in tutta l'app, mostrando "Paziente".
// Utile per fare screenshot da inviare senza esporre dati personali.
//
// NON tocca il database: è una preferenza locale del dispositivo
// (gestita da PrivacyModeContext, salvata in localStorage).
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead } from "../shared/theme";
import { usePrivacyMode, type PrivacyStyle } from "@/src/contexts/PrivacyModeContext";

export type PrivacySectionProps = {
  show: boolean;
  onToggle: () => void;
};

export default function PrivacySection({ show, onToggle }: PrivacySectionProps) {
  const { privacyMode, setPrivacyMode, privacyStyle, setPrivacyStyle, hydrated } = usePrivacyMode();

  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>
            Modalità Privacy
          </div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
            Nasconde nome e cognome dei pazienti negli screenshot
          </div>
        </div>
        <span
          style={{
            color: THEME.muted,
            fontSize: 12,
            transform: show ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
          }}
        >
          ▾
        </span>
      </div>

      {show && (
        <div style={{ padding: "20px" }}>
          {/* Riga toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "14px 16px",
              borderRadius: 9,
              background: privacyMode ? "rgba(13,148,136,0.07)" : THEME.panelSoft,
              border: `1px solid ${privacyMode ? "rgba(13,148,136,0.25)" : THEME.border}`,
              transition: "all 0.2s",
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: THEME.text }}>
                {privacyMode ? "Attiva" : "Disattivata"}
              </div>
              <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 3, lineHeight: 1.5 }}>
                {privacyMode
                  ? (privacyStyle === "initials"
                      ? 'I nomi dei pazienti sono nascosti: a video compaiono le iniziali (es. "M.R.").'
                      : 'I nomi dei pazienti sono nascosti: a video compare "Paziente" al loro posto.')
                  : "I nomi dei pazienti sono visibili normalmente in tutta l'app."}
              </div>
            </div>

            {/* Switch */}
            <button
              role="switch"
              aria-checked={privacyMode}
              aria-label="Attiva o disattiva la modalità privacy"
              disabled={!hydrated}
              onClick={() => setPrivacyMode(!privacyMode)}
              style={{
                position: "relative",
                width: 50,
                height: 28,
                flexShrink: 0,
                borderRadius: 999,
                border: "none",
                cursor: hydrated ? "pointer" : "wait",
                background: privacyMode ? THEME.teal : THEME.gray,
                transition: "background 0.2s",
                padding: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: privacyMode ? 25 : 3,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                  transition: "left 0.2s",
                }}
              />
            </button>
          </div>

          {/* Selettore stile mascheramento — visibile solo se privacy ON */}
          {privacyMode && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.text, marginBottom: 8 }}>
                Come mostrare i pazienti
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {([
                  { value: "generic" as PrivacyStyle, label: "Paziente", sub: "Uguale per tutti" },
                  { value: "initials" as PrivacyStyle, label: "Iniziali", sub: 'Es. "M.R."' },
                ]).map((opt) => {
                  const selected = privacyStyle === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setPrivacyStyle(opt.value)}
                      style={{
                        flex: 1,
                        textAlign: "left",
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: `1.5px solid ${selected ? THEME.teal : THEME.border}`,
                        background: selected ? "rgba(13,148,136,0.07)" : "#fff",
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13, color: selected ? THEME.teal : THEME.text }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: 11, color: THEME.muted, marginTop: 1 }}>
                        {opt.sub}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Nota informativa */}
          <div
            style={{
              marginTop: 14,
              padding: "11px 14px",
              borderRadius: 8,
              background: "rgba(37,99,235,0.05)",
              border: "1px solid rgba(37,99,235,0.15)",
              fontSize: 12.5,
              color: THEME.textSoft,
              lineHeight: 1.55,
            }}
          >
            <b>Come funziona.</b> È un filtro solo visivo: i dati dei pazienti
            non vengono modificati né cancellati. Disattivando la modalità i
            nomi tornano subito visibili. La preferenza vale solo su questo
            dispositivo.
          </div>
        </div>
      )}
    </div>
  );
}
