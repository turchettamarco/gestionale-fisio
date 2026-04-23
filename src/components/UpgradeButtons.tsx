// ═══════════════════════════════════════════════════════════════════════
// src/components/UpgradeButtons.tsx
// ═══════════════════════════════════════════════════════════════════════
// Tre pulsanti affiancati per contattare Marco Turchetta e richiedere
// l'upgrade del piano: WhatsApp, Email, Sito.
//
// I messaggi sono precompilati con contesto (nome studio, piano attuale)
// se disponibile.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useCurrentStudio } from "@/src/contexts/StudioContext";

// ⚠️ DATI CONTATTO — modifica qui se cambiano
const CONTACT = {
  whatsapp: "393209631792", // senza + per wa.me
  email: "turchettamrc@gmail.com",
  siteUrl: "https://turchettamarco.com/contatti", // ← modifica se diverso
};

type Props = {
  /** Nome del piano a cui vuole fare upgrade (es. "Pro") — opzionale */
  targetPlan?: string;
  /** Piano attuale dello studio (es. "Free") — opzionale */
  currentPlan?: string;
  /** Dimensione dei pulsanti (default "md") */
  size?: "sm" | "md" | "lg";
  /** Stile: pieno o ridotto */
  fullWidth?: boolean;
};

export default function UpgradeButtons({
  targetPlan,
  currentPlan,
  size = "md",
  fullWidth = false,
}: Props) {
  const { studio } = useCurrentStudio();
  const studioName = studio?.name ?? "il mio studio";

  // Messaggi precompilati
  const targetLabel = targetPlan ? ` al piano ${targetPlan}` : "";
  const currentLabel = currentPlan ? ` (attualmente sono sul piano ${currentPlan})` : "";

  const waText = encodeURIComponent(
    `Ciao Marco, sono ${studioName} e vorrei fare l'upgrade${targetLabel} di FisioHub${currentLabel}. Puoi aiutarmi? 🙏`
  );
  const waUrl = `https://wa.me/${CONTACT.whatsapp}?text=${waText}`;

  const emailSubject = encodeURIComponent(
    `Richiesta upgrade piano FisioHub — ${studioName}`
  );
  const emailBody = encodeURIComponent(
    `Ciao Marco,\n\nSono ${studioName}${currentLabel} e vorrei maggiori informazioni per l'upgrade${targetLabel} del mio account FisioHub.\n\nRispondimi appena puoi.\n\nGrazie!`
  );
  const emailUrl = `mailto:${CONTACT.email}?subject=${emailSubject}&body=${emailBody}`;

  // Size presets
  const sizeStyles = {
    sm: { padding: "7px 10px", fontSize: 12, iconSize: 14 },
    md: { padding: "10px 14px", fontSize: 13, iconSize: 16 },
    lg: { padding: "13px 18px", fontSize: 14, iconSize: 18 },
  }[size];

  const baseBtnStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: sizeStyles.padding,
    fontSize: sizeStyles.fontSize,
    fontWeight: 700,
    textDecoration: "none",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    transition: "opacity 0.15s, transform 0.15s",
    whiteSpace: "nowrap",
    flex: fullWidth ? 1 : "0 0 auto",
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        width: fullWidth ? "100%" : "auto",
      }}
    >
      {/* WhatsApp */}
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          ...baseBtnStyle,
          background: "#25d366",
          color: "#fff",
          boxShadow: "0 2px 6px rgba(37, 211, 102, 0.25)",
        }}
        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
        onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        <svg width={sizeStyles.iconSize} height={sizeStyles.iconSize} viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
        WhatsApp
      </a>

      {/* Email */}
      <a
        href={emailUrl}
        style={{
          ...baseBtnStyle,
          background: "#2563eb",
          color: "#fff",
          boxShadow: "0 2px 6px rgba(37, 99, 235, 0.25)",
        }}
        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
        onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        <svg width={sizeStyles.iconSize} height={sizeStyles.iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
        Email
      </a>

      {/* Sito */}
      <a
        href={CONTACT.siteUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          ...baseBtnStyle,
          background: "#0d9488",
          color: "#fff",
          boxShadow: "0 2px 6px rgba(13, 148, 136, 0.25)",
        }}
        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
        onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        <svg width={sizeStyles.iconSize} height={sizeStyles.iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
        </svg>
        Sito web
      </a>
    </div>
  );
}
