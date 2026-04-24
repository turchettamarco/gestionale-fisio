// ═══════════════════════════════════════════════════════════════════════
// src/lib/openHtmlWindow.ts
// ═══════════════════════════════════════════════════════════════════════
// Stampa HTML senza usare popup (bypass totale ad-blocker / popup blocker).
//
// COME FUNZIONA:
// 1. Crea un <iframe> nascosto nella pagina corrente
// 2. Scrive l'HTML dentro l'iframe
// 3. Chiama iframe.contentWindow.print() → dialog di stampa del browser
// 4. Dopo stampa/cancel rimuove l'iframe
//
// VANTAGGI:
// - Nessun popup da bloccare
// - Immune ad adblocker (Brave, uBlock, AdBlock, Shields, ecc.)
// - Funziona in locale, HTTPS, Vercel, ogni browser
// - Esperienza uniforme: clicchi, parte il dialog di stampa
//
// Il nome della funzione resta `openHtmlWindow` per compatibilità
// con tutti i file che già la usano (import invariati).
// ═══════════════════════════════════════════════════════════════════════

type Options = {
  width?: number;  // ignorato, mantenuto per compatibilità API
  height?: number; // ignorato, mantenuto per compatibilità API
  autoRevoke?: boolean; // ignorato, mantenuto per compatibilità API
};

export function openHtmlWindow(html: string, _opts: Options = {}): Window | null {
  try {
    // 1. Rimuovi l'HTML tutti i pulsanti/elementi con onclick="window.print()"
    //    perché ora la stampa la gestiamo da qui, non serve quel pulsante
    //    dentro l'iframe. Li nascondiamo con CSS print-friendly.

    // 2. Crea iframe nascosto
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.setAttribute("aria-hidden", "true");

    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      alert("Errore apertura stampa. Riprova o contatta l'assistenza.");
      return null;
    }

    // 3. Inietta CSS che nasconde tutti i pulsanti in fase di stampa
    //    e rimuove gli script auto-print (che farebbero doppia stampa)
    let cleanHtml = html.replace(
      /<\/head>/i,
      `<style>
        @media print {
          button, .print-btn, .no-print { display: none !important; }
        }
        button, .print-btn { display: none !important; }
      </style></head>`
    );
    // Rimuovi script che chiamano window.print() auto (altrimenti stampa doppia)
    cleanHtml = cleanHtml.replace(
      /<script[^>]*>[\s\S]*?window\.print\(\)[\s\S]*?<\/script>/gi,
      ""
    );

    // 4. Scrivi HTML nell'iframe
    doc.open();
    doc.write(cleanHtml);
    doc.close();

    // 5. Aspetta il caricamento completo (immagini, font), poi stampa
    const triggerPrint = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) {
          cleanup();
          return;
        }
        win.focus();
        win.print();
      } catch (err) {
        console.error("[openHtmlWindow] Errore print:", err);
      }
      // Cleanup dopo un delay (utente potrebbe ancora vedere il dialog)
      setTimeout(cleanup, 1000);
    };

    const cleanup = () => {
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
    };

    // Se tutto è già caricato (HTML inline è veloce), stampa subito
    if (doc.readyState === "complete") {
      setTimeout(triggerPrint, 200);
    } else {
      iframe.onload = () => setTimeout(triggerPrint, 200);
    }

    // Ritorna il contentWindow dell'iframe per compatibilità API
    // (chi chiama può anche ignorarlo, oggi non serve a nessuno)
    return iframe.contentWindow;
  } catch (err) {
    console.error("[openHtmlWindow] Errore:", err);
    alert("Errore durante la stampa. Riprova o contatta l'assistenza.");
    return null;
  }
}
