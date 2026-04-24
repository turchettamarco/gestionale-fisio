// ═══════════════════════════════════════════════════════════════════════
// src/lib/whatsapp.ts
// ═══════════════════════════════════════════════════════════════════════
// UNICO POSTO dove si gestisce la normalizzazione dei numeri di telefono
// italiani e l'apertura di WhatsApp.
//
// Tutte le pagine del gestionale (desktop + mobile) DEVONO usare queste
// funzioni invece di reimplementare la logica, altrimenti ci sono
// inconsistenze tra dove si apre e dove no.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Normalizza un numero di telefono italiano in formato internazionale
 * senza "+" (es. "393331234567") — il formato richiesto da wa.me e api.whatsapp.com
 *
 * Accetta qualsiasi input comune:
 *  - "333 123 4567"         → "393331234567"   (mobile senza prefisso)
 *  - "3331234567"           → "393331234567"   (mobile 10 cifre)
 *  - "+39 333 123 4567"     → "393331234567"   (con +39 e spazi)
 *  - "0039 333 1234567"     → "393331234567"   (prefisso 0039)
 *  - "+39-333.123.4567"     → "393331234567"   (con trattini/punti)
 *  - "393331234567"         → "393331234567"   (già ok)
 *  - "0761 123456"          → "390761123456"   (fisso italiano)
 *  - "+1 555 123 4567"      → "15551234567"    (numero estero, conservato)
 *
 * Ritorna stringa vuota se l'input è invalido/troppo corto.
 */
export function normalizePhoneForWA(phone: string | null | undefined): string {
  if (!phone) return "";

  // 1. Togli TUTTO tranne cifre e +
  let c = String(phone).trim().replace(/[\s\(\)\-\.\/]/g, "");

  // 2. "0039..." → "+39..."
  if (c.startsWith("00")) c = "+" + c.slice(2);

  // 3. Togli il + per lavorare solo su cifre
  const hadPlus = c.startsWith("+");
  if (hadPlus) c = c.slice(1);

  // 4. Tieni solo cifre
  c = c.replace(/\D/g, "");
  if (!c) return "";

  // 5. Numero troppo corto → invalido
  if (c.length < 7) return "";

  // 6. Se iniziava con + è già internazionale, fidati
  if (hadPlus) {
    // Caso edge: "+3939..." è doppio prefisso, togli uno
    if (c.startsWith("3939") && c.length > 13) c = c.slice(2);
    return c;
  }

  // 7. Già con prefisso 39 (mobile 12 cifre "39 + 3XX XXXXXXX")
  if (c.startsWith("39") && c.length === 12) return c;

  // 8. Già con prefisso 39 (fisso 11-12 cifre)
  if (c.startsWith("39") && (c.length === 11 || c.length === 12 || c.length === 13)) return c;

  // 9. Doppio prefisso 39 (es. "3939...") → rimuovi uno
  if (c.startsWith("3939") && c.length > 13) return c.slice(2);

  // 10. Mobile italiano "3XX..." (10 cifre) → aggiungi 39
  if (c.startsWith("3") && c.length === 10) return "39" + c;

  // 11. Fisso italiano "0XX..." → togli 0 iniziale e aggiungi 39
  if (c.startsWith("0") && c.length >= 9 && c.length <= 11) return "39" + c.slice(1);

  // 12. Numero senza prefisso ma di lunghezza plausibile italiana → metti 39
  if (c.length >= 7 && c.length <= 10) return "39" + c;

  // 13. Fallback: qualcosa di più strano, ritorna come sta
  return c;
}

/**
 * Apre WhatsApp verso un numero con un messaggio precompilato.
 *
 * Strategia di apertura per device:
 *  - Desktop (Win/Mac/Linux) → https://web.whatsapp.com/send?phone=…
 *    Apre direttamente WhatsApp Web senza pagina intermedia di scelta.
 *  - Mobile (iOS/Android) → https://wa.me/…
 *    Apre l'app WhatsApp diretto sulla chat anche se il contatto non
 *    è salvato in rubrica (MAI schermata "scegli contatto").
 *
 * Ritorna true se il numero era valido e l'apertura è stata tentata,
 * false altrimenti.
 *
 * NON usa window.open() (bloccato da popup blocker): usa un <a> click sintetico
 * che il browser considera "user-initiated" e apre sempre correttamente.
 */
export function openWhatsApp(phone: string | null | undefined, message: string = ""): boolean {
  const clean = normalizePhoneForWA(phone);
  if (!clean) {
    alert("Numero di telefono non valido o mancante.");
    return false;
  }

  const isMobile = typeof navigator !== "undefined"
    && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Mobile: wa.me bypassa la rubrica e apre direttamente la chat
  // Desktop: web.whatsapp.com diretto (no pagina "Apri con WA Desktop / Continua web")
  const url = isMobile
    ? `https://wa.me/${clean}${message ? "?text=" + encodeURIComponent(message) : ""}`
    : `https://web.whatsapp.com/send?phone=${clean}${message ? "&text=" + encodeURIComponent(message) : ""}`;

  // Anchor click sincrono = non viene bloccato
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}

/**
 * Apre WhatsApp senza specificare un numero (solo il messaggio).
 * L'utente sceglierà il destinatario dalla sua lista contatti.
 * Utile per "Inoltra a qualcuno" o "Condividi".
 */
export function openWhatsAppShare(message: string): void {
  const url = "https://wa.me/?text=" + encodeURIComponent(message);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Formatta un numero per visualizzazione leggibile: "+39 333 1234567"
 * (diverso da normalizePhoneForWA che serve per wa.me).
 */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  const normalized = normalizePhoneForWA(phone);
  if (!normalized) return "";

  // Se è italiano "39..." → "+39 XXX XXXXXXX"
  if (normalized.startsWith("39") && normalized.length === 12) {
    return `+39 ${normalized.slice(2, 5)} ${normalized.slice(5)}`;
  }
  if (normalized.startsWith("39") && normalized.length === 11) {
    return `+39 ${normalized.slice(2, 4)} ${normalized.slice(4)}`;
  }
  return "+" + normalized;
}
