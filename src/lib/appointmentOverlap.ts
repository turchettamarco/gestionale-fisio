// ════════════════════════════════════════════════════════════════════════
// src/lib/appointmentOverlap.ts
// ════════════════════════════════════════════════════════════════════════
//
// Rileva sovrapposizioni di appuntamenti.
//
// USE-CASE TIPICI:
//   1. Stai creando un appt ospite alle 10:00–10:30 nella Sala A. Esiste già
//      un tuo appt alle 10:15 nella Sala A → conflitto sulla stanza.
//   2. Stai creando un tuo appt alle 14:00 in Sala B. Gerardi ha appt alle
//      14:00 in Sala B → conflitto.
//
// La funzione NON blocca: ritorna i conflitti e lascia la UI mostrarli.
// L'utente può comunque salvare se sa cosa fa.
// ════════════════════════════════════════════════════════════════════════

import { SupabaseClient } from "@supabase/supabase-js";

export type OverlapAppointment = {
  id: string;
  start_at: string;
  end_at: string;
  room_id: string | null;
  operator_id: string | null;
  guest_practitioner_id: string | null;
  patient_name: string | null;
  /** Nome del professionista (titolare/operator/ospite) per messaggio UX */
  practitioner_label: string;
  /** Nome della stanza */
  room_name: string | null;
};

type GuestNames = Record<string, { first_name: string; last_name: string }>;
type RoomNames = Record<string, string>;
type PatientName = { first_name: string; last_name: string };

type CheckOptions = {
  supabase: SupabaseClient;
  studioId: string;
  startAt: Date;
  endAt: Date;
  /** Filtra solo conflitti nella stessa stanza (consigliato). Se omesso, controlla TUTTI gli appt del periodo. */
  roomId?: string | null;
  /** Esclude un appt specifico (utile in fase di edit) */
  excludeAppointmentId?: string;
};

/**
 * Cerca appuntamenti che si sovrappongono al range [startAt, endAt).
 * Considera ENTRAMBI i casi: appuntamenti titolare/operatori (guest_practitioner_id NULL)
 * E appuntamenti ospiti (guest_practitioner_id NOT NULL).
 */
export async function checkAppointmentOverlap(opts: CheckOptions): Promise<OverlapAppointment[]> {
  const { supabase, studioId, startAt, endAt, roomId, excludeAppointmentId } = opts;

  // Logica overlap: due intervalli [a, b) e [c, d) si sovrappongono se a < d AND c < b
  // Quindi gli appt che ci interessano hanno: start_at < endAt AND end_at > startAt
  let q = supabase
    .from("appointments")
    .select("id, start_at, end_at, room_id, operator_id, guest_practitioner_id, patient_id, status, patients:patient_id(first_name, last_name)")
    .eq("studio_id", studioId)
    .neq("status", "cancelled")
    .lt("start_at", endAt.toISOString())
    .gt("end_at", startAt.toISOString());

  if (roomId !== undefined) {
    // roomId può essere null (nessuna stanza assegnata) o stringa
    if (roomId === null) {
      q = q.is("room_id", null);
    } else {
      q = q.eq("room_id", roomId);
    }
  }

  if (excludeAppointmentId) {
    q = q.neq("id", excludeAppointmentId);
  }

  const { data, error } = await q;
  if (error || !data || data.length === 0) return [];

  // Raccogli ID per arricchimento etichette
  const guestIds = Array.from(new Set(
    data.map(d => d.guest_practitioner_id).filter((v): v is string => Boolean(v))
  ));
  const operatorIds = Array.from(new Set(
    data.map(d => d.operator_id).filter((v): v is string => Boolean(v))
  ));
  const roomIds = Array.from(new Set(
    data.map(d => d.room_id).filter((v): v is string => Boolean(v))
  ));

  // Carica nomi guest_practitioners (per etichetta "Dr. Gerardi")
  let guestMap: GuestNames = {};
  if (guestIds.length > 0) {
    const { data: gd } = await supabase
      .from("guest_practitioners")
      .select("id, first_name, last_name")
      .in("id", guestIds);
    if (gd) {
      gd.forEach(g => { guestMap[g.id] = { first_name: g.first_name, last_name: g.last_name }; });
    }
  }

  // Carica nomi operatori (per multi-operator), se presenti
  let operatorMap: Record<string, string> = {};
  if (operatorIds.length > 0) {
    const { data: od } = await supabase
      .from("studio_members")
      .select("user_id, display_name")
      .in("user_id", operatorIds);
    if (od) {
      od.forEach((o: { user_id: string; display_name: string | null }) => {
        if (o.display_name) operatorMap[o.user_id] = o.display_name;
      });
    }
  }

  // Carica nomi stanze
  let roomMap: RoomNames = {};
  if (roomIds.length > 0) {
    const { data: rd } = await supabase
      .from("studio_rooms")
      .select("id, name")
      .in("id", roomIds);
    if (rd) {
      rd.forEach(r => { roomMap[r.id] = r.name; });
    }
  }

  // Costruisci output arricchito
  return data.map(d => {
    const pat = Array.isArray(d.patients) ? d.patients[0] : d.patients;
    const patName = pat ? `${(pat as PatientName).last_name} ${(pat as PatientName).first_name}` : null;

    let label: string;
    if (d.guest_practitioner_id) {
      const g = guestMap[d.guest_practitioner_id];
      label = g ? `${g.first_name} ${g.last_name} (ospite)` : "Professionista ospite";
    } else if (d.operator_id) {
      label = operatorMap[d.operator_id] ?? "Operatore";
    } else {
      label = "Tuo calendario";
    }

    return {
      id: d.id,
      start_at: d.start_at,
      end_at: d.end_at,
      room_id: d.room_id,
      operator_id: d.operator_id,
      guest_practitioner_id: d.guest_practitioner_id,
      patient_name: patName,
      practitioner_label: label,
      room_name: d.room_id ? (roomMap[d.room_id] ?? null) : null,
    };
  });
}

/** Helper: formato orario per messaggi UI */
export function fmtTimeRange(startISO: string, endISO: string): string {
  const fmt = (s: string) => {
    const d = new Date(s);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  return `${fmt(startISO)}–${fmt(endISO)}`;
}
