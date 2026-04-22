// Costruisce il messaggio WhatsApp di promemoria/conferma appuntamento
// applicando i placeholder del template alle variabili dell'appuntamento.

import type { CalendarEvent } from "./types";
import { CLINIC_ADDRESSES } from "./constants";
import { formatDateRelative, fmtTime } from "./dateHelpers";

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
    "Buongiorno {nome},\n\nLe ricordiamo il suo appuntamento di {data_relativa} alle ore {ora}." +
    "\n\n📍 {luogo}\n\nCordiali saluti" +
    (firma ? `,\n${firma}` : "")
  );
}

// Placeholders supportati dal template: {nome} {data_relativa} {data} {ora} {luogo} {link_conferma} {link}
export function buildReminderMessage(params: {
  appointment: CalendarEvent;
  patientFirstName?: string;
  template?: string;
  isConfirmation: boolean;
  linkConferma?: string;
  // ─── Branding studio (multi-tenancy) ───
  studioAddress?: string | null;        // indirizzo studio per fallback
  signatureName?: string | null;        // "Dr. Marco Turchetta"
  signatureTitle?: string | null;       // "Fisioterapia e Osteopatia"
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

  let message = templateText
    .replace(/{nome}/g, nomePaziente)
    .replace(/{data_relativa}/g, dataRelativa)
    .replace(/{data}/g, dataRelativa)
    .replace(/{ora}/g, ora)
    .replace(/{luogo}/g, luogo)
    .replace(/{link_conferma}/g, linkConferma)
    .replace(/{link}/g, linkConferma)
    .replace(/{firma}/g, firma);

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
