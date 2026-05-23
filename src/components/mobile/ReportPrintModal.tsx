// ═══════════════════════════════════════════════════════════════════════
// src/components/mobile/ReportPrintModal.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Modale full-screen per visualizzare/stampare report HTML su mobile.
//
// Motivazione: su iOS PWA (app installata in home), `window.open` apre
// una WebView senza barra di navigazione, lasciando l'utente bloccato
// e costretto a chiudere l'app. Questa modale risolve il problema
// mantenendo il rendering HTML del report dentro un iframe e
// fornendo bottoni "Chiudi" e "Stampa" sempre accessibili.
//
// Uso:
//   const [reportHtml, setReportHtml] = useState<string | null>(null);
//   ...
//   <button onClick={() => setReportHtml(buildHtml())}>Report totale</button>
//   {reportHtml && (
//     <ReportPrintModal html={reportHtml} onClose={() => setReportHtml(null)} />
//   )}
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useRef } from "react";

export type ReportPrintModalProps = {
  /** HTML completo (con <!DOCTYPE html>...) da renderizzare nell'iframe */
  html: string;
  /** Callback chiusura modale */
  onClose: () => void;
  /** Titolo opzionale per l'header della modale */
  title?: string;
};

export default function ReportPrintModal({
  html,
  onClose,
  title = "Anteprima report",
}: ReportPrintModalProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Lock dello scroll del body mentre il modale è aperto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ESC chiude
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Stampa il contenuto dell'iframe (non la pagina principale)
  const handlePrint = () => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      // Fallback: stampa la finestra principale (raro)
      window.print();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0f172a",
        zIndex: 100000,
        display: "flex",
        flexDirection: "column",
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Header con bottoni */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #e2e8f0",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          flexShrink: 0,
          // Safe area per iPhone notch / dynamic island
          paddingTop: "calc(10px + env(safe-area-inset-top, 0px))",
        }}
      >
        <button
          onClick={onClose}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            background: "#f8fafc",
            color: "#0f172a",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "Inter, -apple-system, sans-serif",
          }}
          aria-label="Chiudi anteprima"
        >
          ← Chiudi
        </button>

        <div
          style={{
            flex: 1,
            fontSize: 14,
            fontWeight: 700,
            color: "#0f172a",
            textAlign: "center",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: "Inter, -apple-system, sans-serif",
          }}
        >
          {title}
        </div>

        <button
          onClick={handlePrint}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: "linear-gradient(135deg, #0d9488 0%, #0891b2 100%)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "Inter, -apple-system, sans-serif",
          }}
          aria-label="Stampa report"
        >
          🖨️ Stampa
        </button>
      </div>

      {/* Iframe report */}
      <div style={{ flex: 1, background: "#f1f5f9", overflow: "hidden" }}>
        <iframe
          ref={iframeRef}
          srcDoc={html}
          title={title}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            background: "#fff",
          }}
          sandbox="allow-same-origin allow-modals allow-popups"
        />
      </div>
    </div>
  );
}
