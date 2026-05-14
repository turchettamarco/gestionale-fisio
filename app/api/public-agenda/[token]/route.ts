// ════════════════════════════════════════════════════════════════════════
// app/api/public-agenda/[token]/route.ts
// ════════════════════════════════════════════════════════════════════════
//
// Endpoint pubblico per il portale ospite (mig. 032, Step 6c).
//
// SICUREZZA:
// - Accessibile senza autenticazione (è il punto della feature)
// - Usa supabaseAdmin (SERVICE_ROLE_KEY) che bypassa RLS, ma filtra
//   RIGIDAMENTE per access_token in tutti i punti
// - Mai espone dati sensibili: ritorna solo nome ospite, specialità,
//   colore, e gli APPUNTAMENTI dell'ospite con i campi paziente minimi
//   (nome, telefono, diagnosi, note) — solo se l'ospite l'ha configurato
//   in pdf_print_fields
// - Mai espone: incassi del titolare, altri ospiti, altri pazienti,
//   dati clinici dei pazienti diversi da quelli configurati
// - Mai permette MUTAZIONI: l'endpoint è solo GET
// - Token è un UUID v4 (10^38 combinazioni → bruteforce impossibile)
//
// QUERY STRING:
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD per filtrare il periodo
//   (default = mese corrente)
//
// RESPONSE:
//   200 OK con JSON { guest, appointments }
//   404 Not Found se token non trovato o ospite inattivo
//   400 Bad Request se token non è UUID valido
// ════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabaseServer";

// Regex UUID v4 (formato standard)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tipi di risposta (esportati per uso nel client)
export type PublicGuestData = {
  first_name: string;
  last_name: string;
  specialty: string;
  display_color: string | null;
  pdf_print_fields: {
    telefono?: boolean;
    durata?: boolean;
    diagnosi?: boolean;
    note?: boolean;
  };
};

export type PublicAppointmentData = {
  id: string;
  start_at: string;
  end_at: string;
  calendar_note: string | null;
  patient: {
    first_name: string;
    last_name: string;
    phone: string | null;
    diagnosis: string | null;
  } | null;
};

export type PublicAgendaResponse = {
  guest: PublicGuestData;
  appointments: PublicAppointmentData[];
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;

  // ── Validazione token ──────────────────────────────────────────────
  if (!token || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "Token non valido" }, { status: 400 });
  }

  try {
    // ── Cerca l'ospite con questo token ──────────────────────────────
    const { data: guest, error: guestErr } = await supabaseAdmin
      .from("guest_practitioners")
      .select("id, studio_id, first_name, last_name, specialty, display_color, is_active, pdf_print_fields")
      .eq("access_token", token)
      .eq("is_active", true)
      .maybeSingle();

    if (guestErr) {
      console.error("[public-agenda] guest query error:", guestErr);
      return NextResponse.json({ error: "Errore server" }, { status: 500 });
    }

    if (!guest) {
      // Token non esistente o ospite disattivato
      return NextResponse.json({ error: "Link non valido o scaduto" }, { status: 404 });
    }

    // ── Aggiorna last_access_at (fire-and-forget, non blocca la risposta) ──
    // Lo facciamo in modo non-bloccante: se fallisce, non importa,
    // la risposta principale parte ugualmente.
    supabaseAdmin
      .from("guest_practitioners")
      .update({ last_access_at: new Date().toISOString() })
      .eq("id", guest.id)
      .then(({ error }) => {
        if (error) console.error("[public-agenda] last_access update error:", error);
      });

    // ── Calcola intervallo date ─────────────────────────────────────
    const url = new URL(request.url);
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    let fromDate: Date;
    let toDate: Date;
    const now = new Date();
    if (fromParam && toParam) {
      fromDate = new Date(fromParam + "T00:00:00");
      toDate = new Date(toParam + "T23:59:59");
      // Validazione: max 1 anno di range (anti-abuse)
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      if (toDate.getTime() - fromDate.getTime() > oneYearMs) {
        return NextResponse.json({ error: "Intervallo troppo ampio" }, { status: 400 });
      }
    } else {
      // Default: mese corrente
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    // ── Carica appuntamenti ──────────────────────────────────────────
    const { data: appts, error: apptErr } = await supabaseAdmin
      .from("appointments")
      .select(`
        id, start_at, end_at, calendar_note,
        patient:patients(first_name, last_name, phone, diagnosis)
      `)
      .eq("guest_practitioner_id", guest.id)
      .eq("studio_id", guest.studio_id)
      .gte("start_at", fromDate.toISOString())
      .lte("start_at", toDate.toISOString())
      .neq("status", "cancelled")
      .order("start_at", { ascending: true });

    if (apptErr) {
      console.error("[public-agenda] appointments query error:", apptErr);
      return NextResponse.json({ error: "Errore caricamento appuntamenti" }, { status: 500 });
    }

    // Normalizza patient (può essere array o oggetto a seconda della FK)
    const normalizedAppts: PublicAppointmentData[] = (appts ?? []).map((r: Record<string, unknown>) => {
      const p = r.patient as unknown;
      const patient = Array.isArray(p) ? (p[0] ?? null) : (p ?? null);
      return {
        id: r.id as string,
        start_at: r.start_at as string,
        end_at: r.end_at as string,
        calendar_note: r.calendar_note as string | null,
        patient,
      };
    });

    // ── Filtra i campi paziente in base a pdf_print_fields ──────────
    // Se il titolare ha disabilitato "telefono" o "diagnosi", li azzeriamo
    // anche qui prima di mandarli al client → l'ospite non li vede mai.
    const fields = guest.pdf_print_fields || {};
    const showTelefono = fields.telefono !== false;
    const showDiagnosi = fields.diagnosi !== false;
    const showNote = fields.note !== false;

    const sanitizedAppts: PublicAppointmentData[] = normalizedAppts.map(a => ({
      ...a,
      calendar_note: showNote ? a.calendar_note : null,
      patient: a.patient ? {
        first_name: a.patient.first_name,
        last_name: a.patient.last_name,
        phone: showTelefono ? a.patient.phone : null,
        diagnosis: showDiagnosi ? a.patient.diagnosis : null,
      } : null,
    }));

    // ── Risposta finale ─────────────────────────────────────────────
    const response: PublicAgendaResponse = {
      guest: {
        first_name: guest.first_name,
        last_name: guest.last_name,
        specialty: guest.specialty,
        display_color: guest.display_color,
        pdf_print_fields: fields,
      },
      appointments: sanitizedAppts,
    };

    return NextResponse.json(response, {
      headers: {
        // No cache: i dati cambiano in tempo reale quando il titolare
        // aggiunge/sposta appuntamenti dal gestionale.
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    console.error("[public-agenda] unexpected error:", err);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
