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

// ═══════════════════════════════════════════════════════════════════════
// PROMEMORIA SETTIMANALE (1 messaggio = N appuntamenti settimana paziente)
// ═══════════════════════════════════════════════════════════════════════

/** Scelta della settimana per il promemoria aggregato. */
export type WeekChoice = "current" | "next";

/**
 * Calcola lunedì 00:00 e domenica 23:59:59 per la settimana scelta.
 * "current" = settimana di oggi (lun–dom).
 * "next"    = settimana successiva (lun–dom).
 */
export function getWeekRange(choice: WeekChoice, today: Date = new Date()): { start: Date; end: Date } {
  // Lunedì = giorno 0 della nostra settimana ISO
  // JS getDay(): 0 = domenica, 1 = lunedì, ..., 6 = sabato
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  // Distanza in giorni dal lunedì di QUESTA settimana
  // se oggi è domenica (0) → -6, se lunedì (1) → 0, se martedì (2) → -1, ecc.
  const daysFromMonday = dow === 0 ? -6 : -(dow - 1);
  const monday = new Date(d);
  monday.setDate(d.getDate() + daysFromMonday);

  if (choice === "next") {
    monday.setDate(monday.getDate() + 7);
  }

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { start: monday, end: sunday };
}

/**
 * Ritorna l'etichetta umanizzata della settimana, da inserire in {settimana}.
 *   • "questa settimana"      (se current)
 *   • "settimana del 28 aprile" (se next, con la data del lunedì)
 */
export function getWeekLabel(choice: WeekChoice, weekStart: Date): string {
  if (choice === "current") return "questa settimana";
  const months = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
  ];
  const day = weekStart.getDate();
  const month = months[weekStart.getMonth()];
  return `settimana del ${day} ${month}`;
}

/** Singolo appuntamento per la lista del messaggio. */
export type WeeklyAppointmentItem = {
  start: Date;
  end?: Date;
  treatment?: string | null;
  location?: string | null;
};

/**
 * Formatta un singolo appuntamento per il bullet della lista.
 *   "• Lunedì 28/04 alle 09:00"
 */
function formatAppointmentBullet(appt: WeeklyAppointmentItem): string {
  const dayNames = [
    "Domenica", "Lunedì", "Martedì", "Mercoledì",
    "Giovedì", "Venerdì", "Sabato",
  ];
  const dayName = dayNames[appt.start.getDay()];
  const dd = String(appt.start.getDate()).padStart(2, "0");
  const mm = String(appt.start.getMonth() + 1).padStart(2, "0");
  const hh = String(appt.start.getHours()).padStart(2, "0");
  const min = String(appt.start.getMinutes()).padStart(2, "0");
  return `• ${dayName} ${dd}/${mm} alle ${hh}:${min}`;
}

/**
 * Costruisce il testo del messaggio WhatsApp di promemoria settimanale,
 * sostituendo le variabili nel template:
 *   • {nome}                → patientFirstName
 *   • {settimana}           → weekLabel (resta supportato per retrocompatibilità)
 *   • {lista_appuntamenti}  → bullet list (1 per riga)
 *   • {firma}               → signatureName + ", " + signatureTitle
 *
 * Esempio output (template default):
 *   Ciao Mario,
 *
 *   ti ricordo i prossimi appuntamenti:
 *
 *   • Lunedì 28/04 alle 09:00
 *   • Mercoledì 30/04 alle 10:30
 *
 *   A presto,
 *   Marco Turchetta, Fisioterapista e Osteopata
 */
export function buildWeeklyReminderMessage(opts: {
  template: string;
  patientFirstName: string;
  weekLabel: string;
  appointments: WeeklyAppointmentItem[];
  signatureName?: string | null;
  signatureTitle?: string | null;
}): string {
  const { template, patientFirstName, weekLabel, appointments } = opts;

  const list = appointments.map(formatAppointmentBullet).join("\n");

  const signaturePieces = [opts.signatureName, opts.signatureTitle]
    .map(s => (s ?? "").trim())
    .filter(s => s.length > 0);
  // Uniformato al singolo: firma su 2 righe, no virgola.
  const signature = signaturePieces.join("\n");

  return template
    .replaceAll("{nome}", patientFirstName || "")
    .replaceAll("{settimana}", weekLabel)
    .replaceAll("{lista_appuntamenti}", list)
    .replaceAll("{firma}", signature);
}
