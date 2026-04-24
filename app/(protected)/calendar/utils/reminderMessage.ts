// Costruisce il messaggio WhatsApp di promemoria/conferma appuntamento
// applicando i placeholder del template alle variabili dell'appuntamento.

import type { CalendarEvent } from "./types";
import { CLINIC_ADDRESSES } from "./constants";
import { formatDateRelative, fmtTime } from "./dateHelpers";

// Calcola saluto dinamico in base all'ora corrente di invio.
// Prima delle 14:00 → "Buongiorno", dalle 14:00 in poi → "Buonasera"
export function getGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  return hour < 14 ? "Buongiorno" : "Buonasera";
}

// Costruisce un template di default basato sui dati dello studio corrente.
// Se signature_name/title mancano, usa "Cordiali saluti" generico.
export function defaultTemplateConferma(signatureName?: string | null, signatureTitle?: string | null): string {
  const firma = [signatureName, signatureTitle].filter(Boolean).join("\n");
  return (
    "Grazie per averci scelto.\nRicordiamo il prossimo appuntamento fissato per {data_relativa} alle {ora}." +
    "\n\nA presto" +
    (firma ? `,\n${firma}` : "")
  );
}

export function defaultTemplatePromemoria(signatureName?: string | null, signatureTitle?: string | null): string {
  const firma = [signatureName, signatureTitle].filter(Boolean).join("\n");
  return (
    "{saluto} {nome},\n\nLe ricordiamo il suo appuntamento di {data_relativa} alle ore {ora}." +
    "\n\n📍 {luogo}\n\nCordiali saluti" +
    (firma ? `,\n${firma}` : "")
  );
}

// Placeholders supportati dal template: {saluto} {nome} {data_relativa} {data} {ora} {luogo} {link_conferma} {link} {firma}
export function buildReminderMessage(params: {
  appointment: CalendarEvent;
  patientFirstName?: string;
  template?: string;
  isConfirmation: boolean;
  linkConferma?: string;
  // ─── Branding studio (multi-tenancy) ───
  studioAddress?: string | null;
  signatureName?: string | null;
  signatureTitle?: string | null;
}): string {
  const {
    appointment, patientFirstName, template, isConfirmation, linkConferma = "",
    studioAddress, signatureName, signatureTitle,
  } = params;

  const templateText =
    template ||
    (isConfirmation
      ? defaultTemplateConferma(signatureName, signatureTitle)
      : defaultTemplatePromemoria(signatureName, signatureTitle));

  const dataRelativa = formatDateRelative(appointment.start);
  const ora = fmtTime(appointment.start.toISOString());
  const nomePaziente = (patientFirstName?.trim()) || "Cliente";
  const saluto = getGreeting();

  let luogo = "";
  if (appointment.location === "studio") {
    luogo =
      CLINIC_ADDRESSES[appointment.clinic_site || ""] ||
      appointment.clinic_site ||
      studioAddress ||
      "";
  } else {
    luogo = `Presso il suo domicilio (${appointment.domicile_address})`;
  }

  const firma = [signatureName, signatureTitle].filter(Boolean).join("\n");

  // Auto-fix per template salvati nel DB con emoji corrotti.
  // Quando un emoji UTF-8 a 4 byte (📍, 👉, ⏰, ecc.) viene troncato durante il
  // salvataggio o transito (es. encoding errato), può apparire come uno di questi
  // caratteri di sostituzione:
  //   U+FFFD (�)            replacement char standard
  //   U+25A1 (□)            white square
  //   U+25A2 (▢)            rounded square
  //   U+FFFC (￼)            object replacement char (iOS)
  //   '?'                   alcuni transitatori sostituiscono con '?'
  // Ricostruiamo l'emoji originale basandoci sul contesto testuale adiacente.
  const fixCorruptedEmojis = (s: string): string => {
    // Set di caratteri "broken" da considerare emoji corrotti
    const BROKEN = "[\\uFFFD\\uFFFC\\u25A1\\u25A2\\u25A0\\u25FB\\u25FC]";
    return s
      // 📍 + spazio + (luogo/indirizzo) — ricostruzione emoji posizione
      .replace(new RegExp(`${BROKEN}\\s*(\\{luogo\\}|Pontecorvo|Presso|Studio|Via\\b|Piazza\\b|Corso\\b)`, "g"), "📍 $1")
      // 👉 + spazio + Conferma — ricostruzione emoji indicazione
      .replace(new RegExp(`${BROKEN}\\s*(Conferma|Annulla|Clicca)`, "g"), "👉 $1")
      // ⏰ + spazio + ora (es. "⏰ 09:00")
      .replace(new RegExp(`${BROKEN}\\s*(\\d{1,2}:\\d{2})`, "g"), "⏰ $1")
      // Pattern: "alle ore HH:MM." seguito da quadratino (con o senza spazio) → era 📍
      .replace(new RegExp(`(alle ore \\d{1,2}:\\d{2}[.,]?\\s*)${BROKEN}`, "g"), "$1📍")
      // Pattern: "{ora}." seguito da quadratino (template non rimpiazzato ancora) → era 📍
      .replace(new RegExp(`(\\{ora\\}[.,]?\\s*)${BROKEN}`, "g"), "$1📍")
      // Quadratino a inizio riga seguito da spazio (tipico del 📍 luogo) — generico
      .replace(new RegExp(`^${BROKEN}\\s+`, "gm"), "📍 ")
      // Qualunque rimasto in mezzo a testo: rimuoviamo (no emoji a caso, meglio nulla)
      .replace(new RegExp(BROKEN, "g"), "");
  };

  let message = fixCorruptedEmojis(templateText)
    .replace(/{saluto}/g, saluto)
    .replace(/{nome}/g, nomePaziente)
    .replace(/{data_relativa}/g, dataRelativa)
    .replace(/{data}/g, dataRelativa)
    .replace(/{ora}/g, ora)
    .replace(/{luogo}/g, luogo)
    .replace(/{link_conferma}/g, linkConferma)
    .replace(/{link}/g, linkConferma)
    .replace(/{firma}/g, firma);

  // Se nel template esiste un "Buongiorno" hardcoded (vecchi template senza {saluto}),
  // lo sostituiamo dinamicamente in base all'ora corrente.
  // Questo gestisce backward-compat senza forzare l'utente a modificare i template.
  if (saluto === "Buonasera") {
    message = message.replace(/^Buongiorno\b/m, "Buonasera");
  }

  // Aggiungi link conferma alla fine del messaggio se il template non lo contiene
  if (!isConfirmation && linkConferma && !message.includes(linkConferma)) {
    message += `\n\n👉 Conferma o annulla con un click:\n${linkConferma}`;
  }

  return message;
}

// Backward compatibility: i vecchi consumatori che importano queste costanti
// ricevono un template senza firma (vuoto). Preferibile usare le funzioni sopra.
export const DEFAULT_TEMPLATE_CONFERMA = defaultTemplateConferma();
export const DEFAULT_TEMPLATE_PROMEMORIA = defaultTemplatePromemoria();
