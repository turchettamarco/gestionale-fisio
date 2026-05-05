// app/(protected)/calendar/utils/locationHelpers.ts
// ═══════════════════════════════════════════════════════════════════════
// Helper multi-sede (mig. 014, fase 3) per il rendering delle card del
// calendario: dato un appuntamento e la lista delle sedi, restituisce
// il colore del bordo da disegnare (null = nessun bordo, sede principale)
// e le iniziali per il badge.
// ═══════════════════════════════════════════════════════════════════════

import type { CalendarEvent } from "./types";

export type StudioLocationLite = {
  id: string;
  name: string;
  address: string | null;
  is_primary: boolean;
  border_color: string | null;
};

// Calcola le iniziali (max 3 caratteri uppercase) dal nome di una sede.
// Se il nome contiene più parole significative, prende la prima lettera
// di ognuna; altrimenti prende le prime lettere del nome stesso.
export function locationInitials(name: string): string {
  if (!name) return "";
  // Tokens "puliti": rimuove "studio", "sede", articoli, parentesi, ecc.
  const STOP = new Set(["studio", "sede", "il", "la", "lo", "i", "le", "di", "del", "della", "presso"]);
  const tokens = name
    .replace(/[()\[\]]/g, " ")
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0 && !STOP.has(t.toLowerCase()));

  if (tokens.length === 0) {
    // Niente di significativo: prendi le prime 2 lettere del nome originale
    return name.trim().slice(0, 2).toUpperCase();
  }
  if (tokens.length === 1) {
    // Un solo token: prendi le prime 2-3 lettere
    return tokens[0].slice(0, Math.min(3, tokens[0].length)).toUpperCase();
  }
  // Più token: prima lettera di ciascuno (max 3)
  return tokens.slice(0, 3).map(t => t[0]).join("").toUpperCase();
}

// Risolve la sede di un appuntamento. Restituisce null se:
//   - non c'è location_id (multi-sede non attivo o legacy)
//   - non si trova nella lista
//   - la sede risolta è la principale (per la principale NON disegniamo bordi)
export function resolveAppointmentLocation(
  event: Pick<CalendarEvent, "location_id" | "location">,
  locations: StudioLocationLite[] | undefined
): StudioLocationLite | null {
  if (!event.location_id) return null;
  if (!locations || locations.length === 0) return null;
  if (event.location !== "studio") return null;
  return locations.find(l => l.id === event.location_id) ?? null;
}

// Restituisce stile da applicare a una card per evidenziare la sede secondaria.
// Per la principale (o assenza di sede): { borderColor: null, initials: null }
// → nessun bordo, nessun badge.
export function getLocationCardStyle(
  event: Pick<CalendarEvent, "location_id" | "location">,
  locations: StudioLocationLite[] | undefined
): { borderColor: string | null; initials: string | null; locationName: string | null } {
  const loc = resolveAppointmentLocation(event, locations);
  if (!loc) return { borderColor: null, initials: null, locationName: null };
  if (loc.is_primary) return { borderColor: null, initials: null, locationName: loc.name };
  return {
    borderColor: loc.border_color || "#2563eb",
    initials: locationInitials(loc.name),
    locationName: loc.name,
  };
}
