// ═══════════════════════════════════════════════════════════════════════
// src/lib/whatsapp.ts
// ═══════════════════════════════════════════════════════════════════════
// UNICO POSTO dove si gestisce la normalizzazione dei numeri di telefono
// italiani e l'apertura di WhatsApp.
//
// STRATEGIA APERTURA WHATSAPP:
//
//   - DESKTOP (Win/Mac/Linux):
//     → https://web.whatsapp.com/send?phone=...
//     Apre direttamente WhatsApp Web nella chat al numero.
//     NIENTE pagina intermedia "Apri con WA Desktop o continua online".
//
//   - MOBILE (iOS/Android):
//     → whatsapp://send?phone=...&text=...
//     Schema URI nativo che apre DIRETTAMENTE l'app WhatsApp
//     bypassando completamente Safari/Chrome e api.whatsapp.com.
//
//     Se l'app non è installata, il browser ignora il link.
//     Per coprire questo caso usiamo un piccolo fallback:
//     dopo 1.5s se l'utente è ancora sulla pagina, lo redirigiamo a wa.me.
//
//   - https://wa.me/... veniva usato prima ma su iPhone redireziona
//     a api.whatsapp.com/send (pagina di download) invece di aprire l'app
//     se questa non è già aperta. whatsapp:// è più affidabile.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Normalizza un numero di telefono italiano in formato internazionale
 * senza "+" (es. "393331234567") — il formato accettato da WhatsApp.
 */
export function normalizePhoneForWA(phone: string | null | undefined): string {
  if (!phone) return "";
  let c = String(phone).trim().replace(/[\s\(\)\-\.\/]/g, "");
  if (c.startsWith("00")) c = "+" + c.slice(2);
  const hadPlus = c.startsWith("+");
  if (hadPlus) c = c.slice(1);
  c = c.replace(/\D/g, "");
  if (!c) return "";
  if (c.length < 7) return "";
  if (hadPlus) {
    if (c.startsWith("3939") && c.length > 13) c = c.slice(2);
    return c;
  }
  if (c.startsWith("39") && c.length === 12) return c;
  if (c.startsWith("39") && (c.length === 11 || c.length === 12 || c.length === 13)) return c;
  if (c.startsWith("3939") && c.length > 13) return c.slice(2);
  if (c.startsWith("3") && c.length === 10) return "39" + c;
  if (c.startsWith("0") && c.length >= 9 && c.length <= 11) return "39" + c.slice(1);
  if (c.length >= 7 && c.length <= 10) return "39" + c;
  return c;
}

/**
 * Detection device.
 * iPhone, iPad, iPod, Android → mobile.
 * Windows, Mac, Linux → desktop.
 */
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Costruisce l'URL WhatsApp giusto per il device corrente.
 * Esposto come funzione pubblica per i casi in cui serve solo la URL
 * (es. dentro un anchor JSX) senza fare il click programmaticamente.
 */
export function buildWhatsAppUrl(phone: string | null | undefined, message: string = ""): string {
  const clean = normalizePhoneForWA(phone);
  if (!clean) return "";

  const encodedMsg = message ? encodeURIComponent(message) : "";

  if (isMobileDevice()) {
    // Schema URI nativo → apre direttamente l'app WhatsApp
    return `whatsapp://send?phone=${clean}${encodedMsg ? `&text=${encodedMsg}` : ""}`;
  } else {
    // Desktop: WhatsApp Web diretto, no pagina intermedia
    return `https://web.whatsapp.com/send?phone=${clean}${encodedMsg ? `&text=${encodedMsg}` : ""}`;
  }
}

/**
 * Apre WhatsApp con un messaggio precompilato verso un numero.
 *
 * Su mobile usa whatsapp:// (nativo, apre l'app diretta).
 * Su desktop usa web.whatsapp.com (no pagina di scelta).
 *
 * Su mobile aggiunge un fallback: se dopo 1.5s siamo ancora sulla pagina
 * (= l'app WhatsApp non è installata), redirige automaticamente a wa.me
 * che mostra il messaggio "Scarica WhatsApp".
 */
export function openWhatsApp(phone: string | null | undefined, message: string = ""): boolean {
  const clean = normalizePhoneForWA(phone);
  if (!clean) {
    alert("Numero di telefono non valido o mancante.");
    return false;
  }

  const encodedMsg = message ? encodeURIComponent(message) : "";
  const isMobile = isMobileDevice();

  if (isMobile) {
    // Su mobile: schema nativo whatsapp://, apre app diretta.
    // location.href = ... è preferito a window.open() per gli schemi custom
    // perché iOS richiede una user gesture e la stessa tab.
    const nativeUrl = `whatsapp://send?phone=${clean}${encodedMsg ? `&text=${encodedMsg}` : ""}`;
    const fallbackUrl = `https://wa.me/${clean}${encodedMsg ? `?text=${encodedMsg}` : ""}`;

    // Tentativo nativo
    window.location.href = nativeUrl;

    // Fallback per chi non ha WA installata: dopo 1.5s, se siamo ancora qui,
    // redirigi a wa.me (che almeno mostra "scarica WhatsApp").
    setTimeout(() => {
      if (document.visibilityState === "visible") {
        window.location.href = fallbackUrl;
      }
    }, 1500);

    return true;
  } else {
    // Su desktop: web.whatsapp.com diretto in nuova tab via anchor click
    const url = `https://web.whatsapp.com/send?phone=${clean}${encodedMsg ? `&text=${encodedMsg}` : ""}`;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  }
}

/**
 * Apre WhatsApp senza specificare un numero (solo il messaggio).
 * L'utente sceglierà il destinatario dalla sua lista contatti.
 * Utile per "Inoltra a qualcuno" o "Condividi".
 */
export function openWhatsAppShare(message: string): void {
  const isMobile = isMobileDevice();
  const enc = encodeURIComponent(message);

  if (isMobile) {
    window.location.href = `whatsapp://send?text=${enc}`;
    setTimeout(() => {
      if (document.visibilityState === "visible") {
        window.location.href = `https://wa.me/?text=${enc}`;
      }
    }, 1500);
  } else {
    const a = document.createElement("a");
    a.href = `https://web.whatsapp.com/send?text=${enc}`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

/**
 * Formatta un numero per visualizzazione leggibile: "+39 333 1234567"
 */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  const normalized = normalizePhoneForWA(phone);
  if (!normalized) return "";
  if (normalized.startsWith("39") && normalized.length === 12) {
    return `+39 ${normalized.slice(2, 5)} ${normalized.slice(5)}`;
  }
  if (normalized.startsWith("39") && normalized.length === 11) {
    return `+39 ${normalized.slice(2, 4)} ${normalized.slice(4)}`;
  }
  return "+" + normalized;
}
