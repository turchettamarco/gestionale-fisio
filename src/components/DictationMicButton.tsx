"use client";
// ═══════════════════════════════════════════════════════════════════════
// src/components/DictationMicButton.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Bottone microfono per la dettatura vocale (usato con useDictation).
//
//   - Stato inattivo: cerchio gradiente teal→blu con icona microfono
//   - Stato attivo:  cerchio rosso pulsante con icona stop (quadrato)
//   - Browser non supportato: non renderizza nulla (zero clutter)
//
// SVG inline → nessuna dipendenza esterna, funziona ovunque il
// componente venga importato (desktop, mobile, portale).
// ═══════════════════════════════════════════════════════════════════════

export function DictationMicButton({
  listening,
  supported,
  onToggle,
  size = 34,
}: {
  listening: boolean;
  supported: boolean;
  onToggle: () => void;
  size?: number;
}) {
  if (!supported) return null;

  const iconSize = Math.round(size * 0.5);

  return (
    <button
      type="button"
      onClick={onToggle}
      title={listening ? "Ferma dettatura" : "Detta la seduta"}
      aria-label={listening ? "Ferma dettatura" : "Avvia dettatura vocale"}
      aria-pressed={listening}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: "none",
        cursor: "pointer",
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        background: listening
          ? "#dc2626"
          : "linear-gradient(135deg, #0d9488, #2563eb)",
        boxShadow: listening ? "none" : "0 1px 4px rgba(15,23,42,0.25)",
        animation: listening ? "fh-mic-pulse 1.5s ease-out infinite" : "none",
        transition: "background 0.15s",
        padding: 0,
      }}
    >
      {listening ? (
        // Icona STOP (quadrato arrotondato)
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="2.5" />
        </svg>
      ) : (
        // Icona MICROFONO
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="2.5" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <line x1="12" y1="18" x2="12" y2="21.5" />
        </svg>
      )}
      <style>{`
        @keyframes fh-mic-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(220,38,38,0.45); }
          70%  { box-shadow: 0 0 0 11px rgba(220,38,38,0); }
          100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); }
        }
      `}</style>
    </button>
  );
}
