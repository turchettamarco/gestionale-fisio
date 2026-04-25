"use client";

// ═══════════════════════════════════════════════════════════════════════
// src/components/BuildInfo.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Mostra la data dell'ultimo deploy nel menu utente.
//
// In produzione (Vercel): legge la variabile d'ambiente NEXT_PUBLIC_BUILD_DATE
// che viene popolata automaticamente dal build con la data di commit Git.
//
// In locale (dev): mostra "Sviluppo" perché non c'è una build vera.
//
// Uso:
//   import { BuildInfo } from "@/src/components/BuildInfo";
//   <BuildInfo />
//
// ═══════════════════════════════════════════════════════════════════════

const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE;

function formatBuildDate(iso: string | undefined): string {
  if (!iso) return "Sviluppo";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Sviluppo";
    const date = d.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const time = d.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${date} · ${time}`;
  } catch {
    return "Sviluppo";
  }
}

export function BuildInfo() {
  const label = formatBuildDate(BUILD_DATE);
  const isDev = label === "Sviluppo";

  return (
    <div
      title={isDev ? "Ambiente di sviluppo locale" : "Ultimo aggiornamento del software"}
      style={{
        padding: "8px 16px",
        borderTop: "1px solid #e5e7eb",
        background: "#fafafa",
        fontSize: 10,
        color: "#94a3b8",
        textAlign: "center",
        fontWeight: 500,
        letterSpacing: 0.2,
      }}
    >
      {isDev ? "🔧 Sviluppo locale" : `Aggiornato il ${label}`}
    </div>
  );
}
