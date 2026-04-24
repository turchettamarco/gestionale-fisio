// ═══════════════════════════════════════════════════════════════════════
// src/lib/openHtmlWindow.ts
// ═══════════════════════════════════════════════════════════════════════
// Apre una nuova finestra del browser contenente HTML generato al volo.
//
// PERCHÉ ESISTE:
// Il pattern tradizionale `window.open("") + document.write(html)` è stato
// deprecato dai browser moderni quando la pagina è servita via HTTPS
// (Chrome/Edge/Firefox lo bloccano per policy Cross-Origin-Opener).
//
// Funziona in localhost HTTP ma fallisce silenziosamente in produzione.
//
// QUESTA FUNZIONE usa Blob + URL.createObjectURL che è il modo moderno
// e funziona in tutti gli ambienti: localhost, HTTPS, Vercel, Netlify.
//
// USO:
//   import { openHtmlWindow } from "@/src/lib/openHtmlWindow";
//   openHtmlWindow(html, { width: 800, height: 900 });
// ═══════════════════════════════════════════════════════════════════════

type Options = {
  width?: number;
  height?: number;
  /** Se true, dopo 60 secondi revoca l'URL per liberare memoria (default: true) */
  autoRevoke?: boolean;
};

export function openHtmlWindow(html: string, opts: Options = {}): Window | null {
  const { width = 800, height = 900, autoRevoke = true } = opts;

  try {
    // 1. Crea un Blob con l'HTML
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });

    // 2. Genera un URL temporaneo locale (blob:https://...)
    const url = URL.createObjectURL(blob);

    // 3. Apri una nuova finestra PUNTANDO a quell'URL
    //    Questo funziona in HTTPS perché il browser vede un URL valido,
    //    non un popup vuoto da riempire successivamente.
    const features = `width=${width},height=${height},scrollbars=yes,resizable=yes`;
    const w = window.open(url, "_blank", features);

    if (!w) {
      // Popup bloccato dall'utente → feedback esplicito
      URL.revokeObjectURL(url);
      alert(
        "⚠️ Il tuo browser ha bloccato l'apertura del documento.\n\n" +
        "Per permettere l'apertura: clicca sull'icona in alto a destra nella barra indirizzi e consenti i popup per questo sito, poi riprova."
      );
      return null;
    }

    // 4. Revoca l'URL dopo un po' (il documento è già caricato, liberiamo memoria)
    if (autoRevoke) {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    return w;
  } catch (err) {
    console.error("[openHtmlWindow] Errore apertura finestra:", err);
    alert("Errore durante l'apertura del documento. Riprova o contatta l'assistenza.");
    return null;
  }
}
