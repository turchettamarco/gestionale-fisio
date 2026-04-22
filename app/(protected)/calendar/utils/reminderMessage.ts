// Costruisce il messaggio WhatsApp di promemoria/conferma appuntamento
// applicando i placeholder del template alle variabili dell'appuntamento.

import type { CalendarEvent } from "./types";
import { CLINIC_ADDRESSES } from "./constants";
import { formatDateRelative, fmtTime } from "./dateHelpers";

// Template di default usati se il template personalizzato dal DB è assente
export const DEFAULT_TEMPLATE_CONFERMA =
  "Grazie per averci scelto.\nRicordiamo il prossimo appuntamento fissato per {data_relativa} alle {ora}.\n\nA presto,\nDr. Marco Turchetta\nFisioterapia e Osteopatia";

export const DEFAULT_TEMPLATE_PROMEMORIA =
  "Buongiorno {nome},\n\nLe ricordiamo il suo appuntamento di {data_relativa} alle ore {ora}.\n\n📍 {luogo}\n\nCordiali saluti,\nDr. Marco Turchetta\nFisioterapia e Osteopatia";

// Placeholders supportati dal template: {nome} {data_relativa} {data} {ora} {luogo} {link_conferma} {link}
export function buildReminderMessage(params: {
  appointment: CalendarEvent;
  patientFirstName?: string;
  template?: string;
  isConfirmation: boolean;
  linkConferma?: string;
}): string {
  const { appointment, patientFirstName, template, isConfirmation, linkConferma = "" } = params;

  const templateText =
    template ||
    (isConfirmation ? DEFAULT_TEMPLATE_CONFERMA : DEFAULT_TEMPLATE_PROMEMORIA);

  const dataRelativa = formatDateRelative(appointment.start);
  const ora = fmtTime(appointment.start.toISOString());
  const nomePaziente = (patientFirstName?.trim()) || "Cliente";

  let luogo = "";
  if (appointment.location === "studio") {
    luogo =
      CLINIC_ADDRESSES[appointment.clinic_site || ""] ||
      appointment.clinic_site ||
      "Pontecorvo, Via Galileo Galilei 5";
  } else {
    luogo = `Presso il suo domicilio (${appointment.domicile_address})`;
  }

  let message = templateText
    .replace(/{nome}/g, nomePaziente)
    .replace(/{data_relativa}/g, dataRelativa)
    .replace(/{data}/g, dataRelativa)
    .replace(/{ora}/g, ora)
    .replace(/{luogo}/g, luogo)
    .replace(/{link_conferma}/g, linkConferma)
    .replace(/{link}/g, linkConferma);

  // Aggiungi link conferma alla fine del messaggio se il template non lo contiene
  // (solo per i promemoria, non per le conferme di nuovo appuntamento)
  if (!isConfirmation && linkConferma && !message.includes(linkConferma)) {
    message += `\n\n👉 Conferma o annulla con un click:\n${linkConferma}`;
  }

  return message;
}
