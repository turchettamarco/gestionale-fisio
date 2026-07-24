// app/api/public/booking-info/[slug]/route.ts
// ════════════════════════════════════════════════════════════════════════
// Endpoint pubblico per la pagina di prenotazione ospitata (mig. 083).
//
// GET /api/public/booking-info/{slug}
//
// SICUREZZA (stesso pattern di /api/public-agenda/[token]):
// - Accessibile senza autenticazione (è il punto della feature)
// - Usa supabaseAdmin (SERVICE_ROLE_KEY) che bypassa RLS, ma filtra
//   RIGIDAMENTE per slug e per booking_public_enabled = true
// - Espone solo: nome studio, indirizzo/telefono pubblici, e l'elenco dei
//   servizi prenotabili (nome, durata, prezzo) — mai dati di pazienti,
//   incassi, membri del team o altro
// - Sola lettura: nessuna mutazione da qui (le mutazioni passano da
//   POST /api/booking)
//
// RESPONSE:
//   200 OK  { studio: {...}, services: [...] }
//   404 Not Found se lo slug non esiste o la pagina non è attiva
// ════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabaseServer";

export type PublicBookingStudio = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
};

export type PublicBookingService = {
  id: string;
  name: string;
  /** Minuti. NULL = non indicata: non si mostra il minutaggio (mig. 089). */
  duration: number | null;
  price: number;
  /** Riga di spiegazione sotto il nome (mig. 086). */
  description: string | null;
  /** Unità dopo il prezzo, es. "al giorno" (mig. 088). NULL = a seduta. */
  price_unit: string | null;
  /** Se false il prezzo non va mostrato per questa voce (mig. 090). */
  show_price: boolean;
};

export type PublicBookingLocation = {
  id: string;
  name: string;
  address: string | null;
};

export type PublicBookingInfo = {
  studio: PublicBookingStudio;
  services: PublicBookingService[];
  /** Se false la pagina non mostra i prezzi accanto ai servizi (mig. 085). */
  showPrices: boolean;
  /**
   * Sedi fra cui il paziente può scegliere (mig. 084). Vuoto quando lo
   * studio non ha il multi-sede attivo o ne ha una sola: in quel caso la
   * pagina pubblica non mostra il passo "scegli la sede" e gli orari
   * restano quelli generali dello studio.
   */
  locations: PublicBookingLocation[];
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  if (!slug || slug.length > 200) {
    return NextResponse.json({ error: "Link non valido" }, { status: 400 });
  }

  try {
    const { data: studio, error: studioErr } = await supabaseAdmin
      .from("studios")
      .select("id, name, address, phone, booking_public_enabled, multi_location_enabled, booking_show_prices")
      .eq("booking_slug", slug)
      .maybeSingle();

    if (studioErr) {
      console.error("[public/booking-info] studio query error:", studioErr);
      return NextResponse.json({ error: "Errore server" }, { status: 500 });
    }

    if (!studio || !studio.booking_public_enabled) {
      // Stesso messaggio sia se lo slug non esiste sia se la pagina è
      // disattivata: non c'è motivo di distinguere per un utente esterno.
      return NextResponse.json({ error: "Pagina di prenotazione non disponibile" }, { status: 404 });
    }

    const { data: services, error: servicesErr } = await supabaseAdmin
      .from("booking_services")
      .select("id, name, duration, price, description, price_unit, show_price")
      .eq("studio_id", studio.id)
      // mig. 088: ordine deciso dallo studio; il nome è solo lo spareggio
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (servicesErr) {
      console.error("[public/booking-info] services query error:", servicesErr);
      return NextResponse.json({ error: "Errore server" }, { status: 500 });
    }

    // Sedi: solo se il multi-sede è attivo. Con una sola sede il passo di
    // scelta non ha senso, quindi si restituisce comunque una lista vuota
    // e la pagina usa gli orari generali dello studio.
    let locations: PublicBookingLocation[] = [];
    if (studio.multi_location_enabled) {
      const { data: locs } = await supabaseAdmin
        .from("studio_locations")
        .select("id, name, address")
        .eq("studio_id", studio.id)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true });

      if (locs && locs.length > 1) {
        locations = locs as PublicBookingLocation[];
      }
    }

    const response: PublicBookingInfo = {
      studio: {
        id: studio.id,
        name: studio.name,
        address: studio.address ?? null,
        phone: studio.phone ?? null,
      },
      services: (services ?? []) as PublicBookingService[],
      showPrices: studio.booking_show_prices ?? true,
      locations,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    console.error("[public/booking-info] unexpected error:", err);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
