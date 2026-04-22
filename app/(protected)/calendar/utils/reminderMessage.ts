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
  // Il carattere replacement Unicode (U+FFFD, che appare come � o come ?) compare
  // quando un emoji UTF-8 a 4 byte viene troncato durante il salvataggio.
  // Gli emoji più comuni nei template sono: 📍 per il luogo e 👉 per il link conferma.
  // Tentiamo un recupero basato sul contesto testuale adiacente.
  const fixCorruptedEmojis = (s: string): string => {
    return s
      // "� {luogo}" o "� Pontecorvo" → "📍 {luogo}"
      .replace(/\uFFFD(\s*(?:\{luogo\}|Pontecorvo|Presso|Studio))/g, "📍$1")
      // "� Conferma" → "👉 Conferma"
      .replace(/\uFFFD(\s*Conferma)/g, "👉$1")
      // Fallback: qualsiasi replacement char rimanente all'inizio di una riga "di indicazione"
      .replace(/^\uFFFD\s+/gm, "📍 ");
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
