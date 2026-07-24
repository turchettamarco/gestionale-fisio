// ═══════════════════════════════════════════════════════════════════════
// src/hooks/calendar/useReminderFlow.ts
// ═══════════════════════════════════════════════════════════════════════
// Cos'è:
//   Hook che gestisce tutto il flusso di promemoria WhatsApp lato calendar:
//   invio singolo, invio aggregato a tutti i partecipanti di un gruppo,
//   richiesta recensione Google, dialog del promemoria settimanale.
//   Estratto da calendar/page.tsx (refactor B3.4).
//
// Dove si usa:
//   In app/(protected)/calendar/page.tsx, dopo useCalendarEvents (perché
//   sendReminder ha bisogno di events e setEvents).
//
// Cosa fa:
//   - showWhatsAppConfirm + lastCreatedAppointment: stato del dialog di
//     conferma "Hai appena creato un appuntamento, vuoi mandare il
//     promemoria?"
//   - weeklyReminderTarget: target del dialog promemoria settimanale
//     (paziente + appuntamenti pre-caricati)
//   - openWeeklyReminder(patientId, firstName, phone): apre il dialog
//     settimanale caricando da Supabase tutti gli appuntamenti futuri
//     del paziente nei prossimi 30 giorni
//   - weeklyReminderTemplate: template testuale (con fallback) letto
//     da practice_settings.weekly_reminder_message
//   - sendReminder(appointmentId, phone, firstName, isConfirmation):
//     genera token di conferma sicuro, costruisce il messaggio con
//     buildReminderMessage, apre WhatsApp Web/wa.me a seconda del
//     dispositivo (con fix Safari iOS sui popup), aggiorna lo stato
//     "whatsapp_sent" sull'appointment
//   - onSendReminderToAll(event): per i gruppi, invia il promemoria a
//     tutti i partecipanti con telefono, uno alla volta con piccolo
//     delay per evitare blocchi popup
//   - sendGoogleReview(phone, firstName): apre WhatsApp con messaggio
//     "lascia una recensione" + link Google review (priorità: studio →
//     practice_settings → fallback)
//
// Dipendenze:
//   - events, setEvents (events): per find appointment + update locale
//     dopo invio
//   - currentStudio, practiceSettings, studioLocations (bootstrap): per
//     firma, indirizzo, link recensione, multi-sede
//   - setError (events): per propagare errori del fetch openWeeklyReminder
//
// Note:
//   - Zero modifiche di comportamento rispetto al codice originale.
//   - Il fix Safari iOS (window.open sincrono prima di await) è
//     mantenuto identico: si apre about:blank al click e si fa
//     redirect a WhatsApp dopo l'await.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { getStudioBranding } from "@/src/lib/studioBranding";
import { translateError } from "@/src/lib/translateError";
import {
  buildReminderMessage,
  getPatientAreaLink,
  cleanPhoneForWA,
  openWhatsApp,
  GOOGLE_REVIEW_LINK_FALLBACK,
  type CalendarEvent,
  type PracticeSettings,
} from "@/app/(protected)/calendar/utils";
import type { Studio, StudioLocationLite } from "@/src/contexts/StudioContext";

/* ─── tipi ─── */

export type WeeklyReminderTarget = {
  patientId: string;
  patientFirstName: string;
  patientPhone: string | null;
  appointments: Array<{
    patient_id: string;
    start: Date;
    end: Date;
    status: string | null;
  }>;
};

export type LastCreatedAppointment = {
  id: string;
  patientPhone?: string | null;
  patientName?: string;
  startTime?: Date;
};

export interface UseReminderFlowOptions {
  events: CalendarEvent[];
  setEvents: Dispatch<SetStateAction<CalendarEvent[]>>;
  currentStudio: Studio | null;
  studioLocations: StudioLocationLite[];
  practiceSettings: PracticeSettings | null;
  setError: Dispatch<SetStateAction<string>>;
}

export interface UseReminderFlowReturn {
  // Stato dialog "appuntamento creato"
  showWhatsAppConfirm: boolean;
  setShowWhatsAppConfirm: Dispatch<SetStateAction<boolean>>;
  lastCreatedAppointment: LastCreatedAppointment | null;
  setLastCreatedAppointment: Dispatch<
    SetStateAction<LastCreatedAppointment | null>
  >;

  // Stato dialog "promemoria settimanale"
  weeklyReminderTarget: WeeklyReminderTarget | null;
  setWeeklyReminderTarget: Dispatch<
    SetStateAction<WeeklyReminderTarget | null>
  >;
  weeklyReminderTemplate: string;
  openWeeklyReminder: (
    patientId: string,
    firstName: string,
    phone: string | null
  ) => Promise<void>;

  // Azioni di invio
  sendReminder: (
    appointmentId: string,
    patientPhone?: string,
    patientFirstName?: string,
    isConfirmation?: boolean
  ) => Promise<void>;
  onSendReminderToAll: (event: CalendarEvent) => Promise<void>;
  sendGoogleReview: (
    patientPhone?: string,
    patientFirstName?: string
  ) => Promise<void>;
}

/* ─── hook ─── */

export function useReminderFlow(
  options: UseReminderFlowOptions
): UseReminderFlowReturn {
  const {
    events,
    setEvents,
    currentStudio,
    studioLocations,
    practiceSettings,
    setError,
  } = options;

  /* ─── Stato dialog "appuntamento creato → manda WA?" ─── */
  const [showWhatsAppConfirm, setShowWhatsAppConfirm] = useState(false);
  const [lastCreatedAppointment, setLastCreatedAppointment] =
    useState<LastCreatedAppointment | null>(null);

  /* ─── Stato dialog "promemoria settimanale" ─── */
  // Promemoria settimanale aggregato (1 messaggio = N appuntamenti).
  // Gli `appointments` sono PRE-CARICATI da Supabase quando si apre il dialog,
  // perché lo stato `events` del calendar contiene solo la settimana visibile.
  const [weeklyReminderTarget, setWeeklyReminderTarget] =
    useState<WeeklyReminderTarget | null>(null);

  /**
   * Carica TUTTI gli appuntamenti futuri del paziente (max 30 giorni) e
   * apre il dialog Promemoria. Usato dai 3 punti del calendar.
   */
  const openWeeklyReminder = useCallback(
    async (
      patientId: string,
      firstName: string,
      phone: string | null
    ) => {
      try {
        // Da oggi 00:00 a +30 giorni (margine extra rispetto ai 15gg del dialog)
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const horizon = new Date(startOfToday);
        horizon.setDate(horizon.getDate() + 30);

        const { data, error } = await supabase
          .from("appointments")
          .select("id, start_at, end_at, status, patient_id")
          .eq("patient_id", patientId)
          .gte("start_at", startOfToday.toISOString())
          .lte("start_at", horizon.toISOString())
          .order("start_at", { ascending: true });

        if (error) {
          setError(`Errore caricamento appuntamenti: ${translateError(error)}`);
          return;
        }

        const mapped = (data ?? []).map((a) => ({
          patient_id: a.patient_id as string,
          start: new Date(a.start_at as string),
          end: new Date(a.end_at as string),
          status: (a.status ?? null) as string | null,
        }));

        setWeeklyReminderTarget({
          patientId,
          patientFirstName: firstName,
          patientPhone: phone,
          appointments: mapped,
        });
      } catch (e) {
        setError(`Errore: ${translateError(e)}`);
      }
    },
    [setError]
  );

  /* ─── Template promemoria settimanale ─── */
  // Template del promemoria settimanale: viene da practice_settings, con
  // fallback al testo di default se l'utente lo ha svuotato per errore.
  const weeklyReminderTemplate = useMemo(() => {
    const fromDb = practiceSettings?.weekly_reminder_message?.trim();
    if (fromDb) return fromDb;
    return `Ciao {nome},

ti ricordo i prossimi appuntamenti:

{lista_appuntamenti}

A presto,
{firma}`;
  }, [practiceSettings]);

  /* ─── sendReminder ─── */
  const sendReminder = useCallback(
    async (
      appointmentId: string,
      patientPhone?: string,
      patientFirstName?: string,
      isConfirmation?: boolean
    ) => {
      if (!patientPhone) {
        alert("Nessun telefono registrato per questo paziente");
        return;
      }
      const appointment = events.find((e) => e.id === appointmentId);
      if (!appointment) return;

      // ⚠️ SAFARI iOS FIX
      // Apriamo SUBITO una nuova finestra vuota in modo sincrono (direttamente dal click).
      // Poi possiamo fare fetch/await e aggiornare la URL della finestra aperta.
      // Se chiamassimo window.open DOPO un await, Safari lo bloccherebbe come popup.
      const waWindow =
        typeof window !== "undefined"
          ? window.open("about:blank", "_blank")
          : null;

      try {
        // 1. Genera token di conferma sicuro (UUID lato server)
        let linkConferma = "";
        try {
          const r = await fetch("/api/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appointment_id: appointmentId }),
          });
          const j = await r.json();
          if (r.ok && j.token) {
            const originBase =
              typeof window !== "undefined" ? window.location.origin : "";
            linkConferma = `${originBase}/conferma/${j.token}`;
          }
        } catch (e) {
          console.warn(
            "Impossibile generare token conferma, proseguo senza link:",
            e
          );
        }

        // 2. Carica template
        const templateName = isConfirmation ? "Appuntamento" : "Promemoria";
        const { data: templateData } = await supabase
          .from("message_templates")
          .select("template")
          .eq("name", templateName)
          .maybeSingle();

        // 2-bis. Link all'area riservata del paziente (storico sedute,
        //        pagamenti, prenotazioni). Se fallisce resta vuoto e il
        //        messaggio parte lo stesso.
        const linkArea = await getPatientAreaLink(appointment.patient_id);

        // 3. Costruisci messaggio usando l'helper puro
        const message = buildReminderMessage({
          appointment,
          patientFirstName,
          template: templateData?.template ?? undefined,
          isConfirmation: !!isConfirmation,
          linkConferma,
          linkArea,
          studioAddress: currentStudio?.address,
          signatureName: getStudioBranding(currentStudio).signatureName,
          signatureTitle: getStudioBranding(currentStudio).signatureTitle,
          // Multi-sede (mig. 014, fase 2): passa l'elenco sedi così il reminder
          // può lookup l'indirizzo della sede dell'appuntamento.
          studioLocations,
        });

        // 4. Costruisci URL WhatsApp scegliendo il formato giusto per dispositivo:
        //    - Desktop → web.whatsapp.com/send (apre DIRETTAMENTE WhatsApp Web)
        //    - Mobile  → wa.me (apre app WhatsApp anche se contatto non in rubrica)
        const clean = cleanPhoneForWA(patientPhone);
        if (!clean) {
          if (waWindow) waWindow.close();
          alert("Numero di telefono non valido.");
          return;
        }
        const isMobile = /iPhone|iPad|iPod|Android/i.test(
          typeof navigator !== "undefined" ? navigator.userAgent : ""
        );
        const waUrl = isMobile
          ? `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
          : `https://web.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(
              message
            )}`;

        if (waWindow) {
          waWindow.location.href = waUrl;
        } else {
          // Fallback: popup bloccato → prova con anchor
          const a = document.createElement("a");
          a.href = waUrl;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          document.body.appendChild(a);
          a.click();
          setTimeout(() => document.body.removeChild(a), 200);
        }

        // 5. Aggiorna stato "whatsapp_sent" (in background, non blocca nulla)
        const nowIso = new Date().toISOString();
        await supabase
          .from("appointments")
          .update({ whatsapp_sent_at: nowIso, whatsapp_sent: true })
          .eq("id", appointmentId);
        setEvents((prev) =>
          prev.map((ev) =>
            ev.id === appointmentId
              ? {
                  ...ev,
                  whatsapp_sent_at: new Date(nowIso),
                  whatsapp_sent: true,
                }
              : ev
          )
        );
      } catch (e) {
        console.error("Errore invio promemoria:", e);
        if (waWindow) waWindow.close();
        alert("Errore durante l'invio del promemoria.");
      }
    },
    [events, currentStudio, studioLocations, setEvents]
  );

  /* ─── onSendReminderToAll (gruppi) ─── */
  /** Invia promemoria WhatsApp a tutti i partecipanti (1 messaggio per paziente) */
  const onSendReminderToAll = useCallback(
    async (event: CalendarEvent) => {
      const participants = event.participants ?? [];
      if (participants.length === 0) {
        alert("Nessun partecipante a cui inviare il promemoria.");
        return;
      }
      const withPhone = participants.filter((p) =>
        (p.patient_phone ?? "").trim()
      );
      if (withPhone.length === 0) {
        alert("Nessun partecipante ha un numero di telefono registrato.");
        return;
      }
      const skipped = participants.length - withPhone.length;
      const confirmMsg =
        `Invio promemoria WhatsApp a ${withPhone.length} partecipanti?` +
        (skipped > 0
          ? `\n\n(${skipped} senza telefono verranno saltati)`
          : "");
      if (!window.confirm(confirmMsg)) return;

      // Apriamo le finestre WhatsApp una alla volta con piccolo delay
      // (Safari iOS può bloccare popup multipli istantanei)
      for (const p of withPhone) {
        // sendReminder vuole l'appointment_id, ma per i gruppi usiamo l'event.id
        // come riferimento: il messaggio è personalizzato per il singolo paziente.
        try {
          await sendReminder(
            event.id,
            p.patient_phone ?? undefined,
            p.patient_first_name ?? undefined
          );
          // piccola pausa tra un invio e l'altro
          await new Promise((resolve) => setTimeout(resolve, 350));
        } catch (e) {
          console.error(
            "Errore invio promemoria a " + p.patient_first_name,
            e
          );
        }
      }
    },
    [sendReminder]
  );

  /* ─── sendGoogleReview ─── */
  // ── Chiedi Recensione Google via WhatsApp ──────────────────────────
  const sendGoogleReview = useCallback(
    async (patientPhone?: string, patientFirstName?: string) => {
      if (!patientPhone) {
        alert("Nessun telefono registrato per questo paziente");
        return;
      }
      const nomePaziente = patientFirstName?.trim() || "Cliente";
      // Preferisci il link studio (multi-tenancy); fallback a practice_settings; ultimo fallback locale
      const googleLink =
        currentStudio?.google_review_link ||
        practiceSettings?.google_review_link ||
        GOOGLE_REVIEW_LINK_FALLBACK;
      const firma = [
        getStudioBranding(currentStudio).signatureName,
        getStudioBranding(currentStudio).signatureTitle,
      ]
        .filter(Boolean)
        .join("\n");
      const message = `Buongiorno ${nomePaziente},

Grazie per aver scelto il nostro studio! 🙏

Se è rimasto/a soddisfatto/a del trattamento, le saremmo molto grati se potesse lasciarci una breve recensione su Google:

${googleLink}

La sua opinione ci aiuta a migliorare e a farci conoscere.

Grazie di cuore${firma ? `,\n${firma}` : ""}`;

      openWhatsApp(patientPhone, message);
    },
    [practiceSettings, currentStudio]
  );

  return {
    // Dialog "appuntamento creato"
    showWhatsAppConfirm,
    setShowWhatsAppConfirm,
    lastCreatedAppointment,
    setLastCreatedAppointment,

    // Dialog "promemoria settimanale"
    weeklyReminderTarget,
    setWeeklyReminderTarget,
    weeklyReminderTemplate,
    openWeeklyReminder,

    // Azioni
    sendReminder,
    onSendReminderToAll,
    sendGoogleReview,
  };
}
