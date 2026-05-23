// ═══════════════════════════════════════════════════════════════════════
// app/mobile/(protected)/components/groupHandlers.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Funzioni di CRUD per gli appuntamenti di gruppo (mig. 014), condivise
// tra home mobile e calendar mobile per evitare duplicazione.
//
// Tutte le funzioni restituiscono `Promise<{ ok: boolean; error?: string }>`
// così il chiamante può decidere come notificare l'utente. Internamente
// chiamano supabase e mostrano `alert()` solo per errori critici.
//
// ═══════════════════════════════════════════════════════════════════════

import { supabase } from "@/src/lib/supabaseClient";
import type { Participant, PatientSearchResult, GroupEvent } from "./GroupEventModalMobile";

/** Ricerca pazienti per il search inline del modal gruppo */
export async function groupSearchPatientsApi(query: string): Promise<PatientSearchResult[]> {
  const cleaned = query.trim();
  if (!cleaned) return [];
  const { data, error } = await supabase
    .from("patients")
    .select("id, first_name, last_name, phone")
    .or(`first_name.ilike.%${cleaned}%,last_name.ilike.%${cleaned}%`)
    .order("last_name", { ascending: true })
    .limit(12);
  if (error) {
    console.error("[group] errore ricerca paziente:", error);
    return [];
  }
  return (data ?? []) as PatientSearchResult[];
}

/** Carica i partecipanti di un singolo appuntamento di gruppo (con dati paziente) */
export async function fetchGroupParticipants(appointmentId: string): Promise<Participant[]> {
  const { data, error } = await supabase
    .from("appointment_participants")
    .select(`
      id, appointment_id, patient_id, price, payment_status, payment_method, paid_at,
      attendance_status, checked_in_at, participant_notes,
      patients:patient_id ( first_name, last_name, phone )
    `)
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[group] errore caricamento partecipanti:", error);
    return [];
  }

  return (data ?? []).map((p: {
    id: string; appointment_id: string; patient_id: string;
    price: number | null; payment_status?: string | null;
    payment_method?: string | null; paid_at?: string | null;
    attendance_status?: string | null; checked_in_at?: string | null;
    participant_notes?: string | null;
    patients?: Array<{ first_name?: string; last_name?: string; phone?: string }> | { first_name?: string; last_name?: string; phone?: string } | null;
  }) => {
    const pp = Array.isArray(p.patients) ? p.patients[0] : p.patients;
    return {
      id: p.id,
      appointment_id: p.appointment_id,
      patient_id: p.patient_id,
      price: Number(p.price ?? 0),
      payment_status: (p.payment_status === "paid" ? "paid" : "unpaid") as "paid" | "unpaid",
      payment_method: (p.payment_method ?? null) as "cash" | "pos" | "bank_transfer" | null,
      paid_at: p.paid_at ?? null,
      attendance_status: (p.attendance_status === "present" || p.attendance_status === "absent"
        ? p.attendance_status : "pending") as "pending" | "present" | "absent",
      checked_in_at: p.checked_in_at ?? null,
      participant_notes: p.participant_notes ?? null,
      patient_first_name: pp?.first_name ?? null,
      patient_last_name: pp?.last_name ?? null,
      patient_phone: pp?.phone ?? null,
    };
  });
}

/** Aggiungi un paziente al gruppo */
export async function addParticipantApi(
  appointmentId: string,
  patientId: string,
  price: number,
): Promise<boolean> {
  const { error } = await supabase
    .from("appointment_participants")
    .insert({
      appointment_id: appointmentId,
      patient_id: patientId,
      price,
      payment_status: "unpaid",
      attendance_status: "pending",
    });
  if (error) {
    alert("Errore aggiunta partecipante: " + error.message);
    return false;
  }
  return true;
}

/** Aggiorna campi del partecipante (con coerenza paid_at e checked_in_at) */
export async function updateParticipantApi(
  participantId: string,
  patch: Partial<Pick<Participant,
    "payment_status" | "payment_method" | "attendance_status" | "price" | "participant_notes"
  >>,
): Promise<boolean> {
  const dbPatch: Record<string, unknown> = { ...patch };
  if (patch.payment_status === "paid") {
    dbPatch.paid_at = new Date().toISOString();
  } else if (patch.payment_status === "unpaid") {
    dbPatch.paid_at = null;
    dbPatch.payment_method = null;
  }
  if (patch.attendance_status === "present") {
    dbPatch.checked_in_at = new Date().toISOString();
  } else if (patch.attendance_status === "pending" || patch.attendance_status === "absent") {
    dbPatch.checked_in_at = null;
  }

  const { error } = await supabase
    .from("appointment_participants")
    .update(dbPatch)
    .eq("id", participantId);
  if (error) {
    alert("Errore aggiornamento partecipante: " + error.message);
    return false;
  }
  return true;
}

/** Rimuovi un partecipante dal gruppo */
export async function removeParticipantApi(participantId: string): Promise<boolean> {
  const { error } = await supabase
    .from("appointment_participants")
    .delete()
    .eq("id", participantId);
  if (error) {
    alert("Errore rimozione partecipante: " + error.message);
    return false;
  }
  return true;
}

/** Bulk: segna tutti i partecipanti come pagati */
export async function markAllPaidApi(appointmentId: string): Promise<boolean> {
  const nowISO = new Date().toISOString();
  const { error } = await supabase
    .from("appointment_participants")
    .update({
      payment_status: "paid",
      paid_at: nowISO,
      payment_method: "cash",
    })
    .eq("appointment_id", appointmentId)
    .eq("payment_status", "unpaid");
  if (error) {
    alert("Errore aggiornamento pagamenti: " + error.message);
    return false;
  }
  return true;
}

/** Aggiorna titolo/max/prezzo del gruppo */
export async function updateGroupApi(
  appointmentId: string,
  patch: { group_title?: string; group_max_participants?: number; group_price_per_person?: number },
): Promise<boolean> {
  const { error } = await supabase
    .from("appointments")
    .update(patch)
    .eq("id", appointmentId);
  if (error) {
    alert("Errore aggiornamento gruppo: " + error.message);
    return false;
  }
  return true;
}

/** Elimina un gruppo (CASCADE rimuove anche i partecipanti) */
export async function deleteGroupApi(appointmentId: string): Promise<boolean> {
  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", appointmentId);
  if (error) {
    alert("Errore eliminazione gruppo: " + error.message);
    return false;
  }
  return true;
}

/**
 * Step 6.2: duplica un gruppo esistente alla nuova data.
 * @param sourceEvent il GroupEvent di partenza (deve avere is_group=true)
 * @param newStart data e ora del nuovo gruppo
 * @param withParticipants se true, copia anche i partecipanti
 *
 * Comportamento partecipanti duplicati:
 * - patient_id e price preservati
 * - payment_status='unpaid', attendance_status='pending', participant_notes=null
 * @returns id del nuovo gruppo creato, o null in caso di errore
 */
export async function duplicateGroupApi(
  sourceEvent: GroupEvent,
  newStart: Date,
  withParticipants: boolean,
): Promise<string | null> {
  // Recupero userId per owner_id
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    alert("Sessione scaduta. Effettua di nuovo il login.");
    return null;
  }

  // Calcolo end_at usando la stessa durata
  const srcStart = new Date(sourceEvent.start_at);
  const srcEnd = new Date(sourceEvent.end_at);
  const durationMs = srcEnd.getTime() - srcStart.getTime();
  const newEnd = new Date(newStart.getTime() + durationMs);

  // INSERT del nuovo gruppo
  const { data: created, error: createErr } = await supabase
    .from("appointments")
    .insert({
      patient_id: null,
      start_at: newStart.toISOString(),
      end_at: newEnd.toISOString(),
      status: "confirmed",
      location: sourceEvent.location ?? "studio",
      clinic_site: sourceEvent.clinic_site ?? "Studio",
      domicile_address: sourceEvent.domicile_address ?? null,
      owner_id: userId,
      studio_id: sourceEvent.studio_id,
      is_group: true,
      group_title: sourceEvent.group_title,
      group_max_participants: sourceEvent.group_max_participants,
      group_price_per_person: sourceEvent.group_price_per_person,
    })
    .select("id")
    .single();
  if (createErr || !created) {
    alert("Errore duplicazione gruppo: " + (createErr?.message || "errore sconosciuto"));
    return null;
  }

  // INSERT batch dei partecipanti (solo se richiesto e ce ne sono)
  if (withParticipants && sourceEvent.participants && sourceEvent.participants.length > 0) {
    const partRows = sourceEvent.participants.map(p => ({
      appointment_id: created.id,
      patient_id: p.patient_id,
      price: p.price,
      payment_status: "unpaid",
      attendance_status: "pending",
      participant_notes: null,
    }));
    const { error: partErr } = await supabase
      .from("appointment_participants")
      .insert(partRows);
    if (partErr) {
      console.error("[duplicate-group-mobile] errore partecipanti:", partErr);
      alert(
        `Gruppo duplicato, ma errore nell'aggiungere i partecipanti: ${partErr.message}\n` +
        `Puoi aggiungerli dalla scheda del nuovo gruppo.`,
      );
    }
  }

  return created.id;
}

/**
 * Invia promemoria WhatsApp a TUTTI i partecipanti di un gruppo.
 * Apre 1 finestra WA per ogni paziente con telefono (con delay tra l'una e l'altra).
 *
 * Multi-tenancy: il chiamante DEVE passare `branding` (da getStudioBranding del
 * currentStudio), altrimenti la firma sarà generica.
 *
 * Template: se passato (es. da practice_settings.reminder_message), applica
 * gli stessi placeholder usati dal desktop in buildReminderMessage:
 *   {saluto}, {nome}, {data_relativa}, {data}, {ora}, {luogo}, {titolo}, {firma}
 * Se template è null, fallback al messaggio generico (retrocompat).
 */
export async function sendReminderToAllApi(
  event: GroupEvent,
  branding?: { signatureName: string | null; signatureTitle: string | null },
  options?: {
    /** Template dal `reminder_message` di practice_settings, oppure null */
    template?: string | null;
    /** Indirizzo studio (per il placeholder {luogo}) */
    studioAddress?: string | null;
  },
): Promise<void> {
  const participants = event.participants ?? [];
  if (participants.length === 0) {
    alert("Nessun partecipante a cui inviare il promemoria.");
    return;
  }
  const withPhone = participants.filter(p => (p.patient_phone ?? "").trim());
  if (withPhone.length === 0) {
    alert("Nessun partecipante ha un numero di telefono registrato.");
    return;
  }
  const skipped = participants.length - withPhone.length;
  const ok = window.confirm(
    `Invio promemoria WhatsApp a ${withPhone.length} partecipanti?` +
    (skipped > 0 ? `\n(${skipped} senza telefono saltati)` : ""),
  );
  if (!ok) return;

  // ── Helpers per placeholder (riproduce la logica di buildReminderMessage) ──
  const fmtDataRelativa = (d: Date): string => {
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    const giorno = new Date(d);
    giorno.setHours(0, 0, 0, 0);
    const diff = Math.round((giorno.getTime() - oggi.getTime()) / 86400000);
    if (diff === 0) return "oggi";
    if (diff === 1) return "domani";
    if (diff === 2) return "dopodomani";
    return new Intl.DateTimeFormat("it-IT", {
      weekday: "long", day: "numeric", month: "long",
    }).format(d);
  };
  const fmtDataIt = (d: Date): string =>
    new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const getSaluto = (): string => (new Date().getHours() < 14 ? "Buongiorno" : "Buonasera");

  const dataRel = fmtDataRelativa(event.start);
  const dataStr = fmtDataIt(event.start);
  const oraStr = `${String(event.start.getHours()).padStart(2, "0")}:${String(event.start.getMinutes()).padStart(2, "0")}`;
  const titolo = event.group_title || "Lezione di gruppo";

  // Luogo: priorità indirizzo studio (dal currentStudio), fallback su clinic_site
  const luogo = options?.studioAddress?.trim()
    || event.clinic_site
    || event.domicile_address
    || "presso lo studio";

  const firmaArr = [branding?.signatureName, branding?.signatureTitle].filter(Boolean) as string[];
  const firmaText = firmaArr.length > 0 ? firmaArr.join("\n") : "";

  const buildMessage = (firstName: string | null): string => {
    const saluto = getSaluto();
    const nome = (firstName ?? "").trim() || "Cliente";

    // Se ho un template, applico i placeholder; altrimenti uso messaggio generico
    // ma sempre con firma da branding (mai hardcoded).
    if (options?.template && options.template.trim()) {
      let t = options.template;
      t = t.replace(/\{saluto\}/g, saluto);
      t = t.replace(/\{nome\}/g, nome);
      t = t.replace(/\{data_relativa\}/g, dataRel);
      t = t.replace(/\{data\}/g, dataStr);
      t = t.replace(/\{ora\}/g, oraStr);
      t = t.replace(/\{luogo\}/g, luogo);
      t = t.replace(/\{titolo\}/g, titolo);
      t = t.replace(/\{firma\}/g, firmaText);
      // Pulisce eventuali link conferma residui dai template del singolo
      t = t.replace(/\{link_conferma\}/g, "").replace(/\{link\}/g, "");
      return t;
    }

    // Fallback: messaggio generico (compatibilità con vecchi chiamanti)
    const ciaoMattina = saluto === "Buongiorno" ? saluto : "Buonasera";
    const firmaLine = firmaText
      ? `\n\nA presto,\n${firmaText}`
      : "\n\nA presto!";
    return (
      `${ciaoMattina} ${nome},\n` +
      `Le ricordo l'appuntamento di "${titolo}" ${dataRel} alle ${oraStr}.` +
      (luogo !== "presso lo studio" ? `\n\n📍 ${luogo}` : "") +
      firmaLine
    );
  };

  for (const p of withPhone) {
    const msg = encodeURIComponent(buildMessage(p.patient_first_name ?? null));
    const phone = (p.patient_phone ?? "").replace(/\D/g, "");
    const num = phone.startsWith("39") ? phone : `39${phone}`;
    const url = `https://wa.me/${num}?text=${msg}`;
    window.open(url, "_blank");
    await new Promise(resolve => setTimeout(resolve, 350));
  }
}
