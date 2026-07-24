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

// Placeholders supportati dal template: {saluto} {nome} {data_relativa} {data} {ora} {luogo} {link_conferma} {link} {link_area} {firma}
export function buildReminderMessage(params: {
  appointment: CalendarEvent;
  patientFirstName?: string;
  template?: string;
  isConfirmation: boolean;
  linkConferma?: string;
  /** Link all'area riservata del paziente (/portale/{token}). Facoltativo:
   *  se assente il messaggio resta identico a prima. */
  linkArea?: string;
  // ─── Branding studio (multi-tenancy) ───
  studioAddress?: string | null;
  signatureName?: string | null;
  signatureTitle?: string | null;
  // ─── Multi-sede (mig. 014, fase 2) ───
  // Se passate, cerca l'indirizzo dalla sede dell'appuntamento (location_id).
  // Fallback: studioAddress (sede principale) oppure clinic_site label.
  studioLocations?: Array<{ id: string; name: string; address: string | null; is_primary: boolean }>;
}): string {
  const {
    appointment, patientFirstName, template, isConfirmation, linkConferma = "",
    linkArea = "",
    studioAddress, signatureName, signatureTitle,
    studioLocations,
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
    // Multi-sede (mig. 014, fase 2): se l'appuntamento ha location_id e
    // l'elenco sedi è disponibile, usa l'indirizzo di QUELLA sede.
    let multiSedeAddress: string | null = null;
    if (appointment.location_id && studioLocations && studioLocations.length > 0) {
      const matched = studioLocations.find(l => l.id === appointment.location_id);
      if (matched?.address) multiSedeAddress = matched.address;
    }
    // Fallback chain:
    //   1. Indirizzo sede multi-sede (se trovato)
    //   2. studioAddress (legacy, sede principale)
    //   3. CLINIC_ADDRESSES (storico)
    //   4. clinic_site label
    luogo =
      multiSedeAddress ||
      studioAddress ||
      CLINIC_ADDRESSES[appointment.clinic_site || ""] ||
      appointment.clinic_site ||
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
    .replace(/{link_area}/g, linkArea)
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

  // Link all'area riservata: appuntamenti, storico sedute e prenotazioni.
  // Come per il link di conferma, si aggiunge solo se il template non lo
  // ha già inserito tramite {link_area}.
  if (linkArea && !message.includes(linkArea)) {
    message += `\n\n🔒 La tua area riservata:\n${linkArea}`;
  }

  return message;
}

// Backward compatibility: i vecchi consumatori che importano queste costanti
// ricevono un template senza firma (vuoto). Preferibile usare le funzioni sopra.
export const DEFAULT_TEMPLATE_CONFERMA = defaultTemplateConferma();
export const DEFAULT_TEMPLATE_PROMEMORIA = defaultTemplatePromemoria();

/**
 * Recupera (o crea) il link all'area riservata del paziente.
 * L'endpoint riusa un token ancora valido, quindi chiamarlo a ogni
 * promemoria non moltiplica i link.
 * In caso di errore restituisce "" e il messaggio parte comunque: il
 * promemoria è più importante del link all'area.
 */
export async function getPatientAreaLink(patientId?: string | null): Promise<string> {
  if (!patientId || typeof window === "undefined") return "";
  try {
    const r = await fetch("/api/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patient_id: patientId }),
    });
    const j = await r.json();
    if (!r.ok || !j?.token) return "";
    return `${window.location.origin}/portale/${j.token}`;
  } catch {
    return "";
  }
}
