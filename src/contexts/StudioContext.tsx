// src/contexts/StudioContext.tsx
// Fornisce a tutta l'app lo studio corrente (quello a cui appartiene l'utente loggato)
// e le info di branding dello studio (nome, indirizzo, Google Reviews ecc.)
//
// USO:
//   const { studio, loading } = useCurrentStudio();
//   if (studio) {
//     const studioName = studio.name;
//     const studioId = studio.id;
//   }

"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/src/lib/supabaseClient";

export type Studio = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  google_review_link: string | null;
  logo_url: string | null;
  logo_base64: string | null;
  website: string | null;
  signature_name: string | null;
  signature_title: string | null;
  // Toggle notifiche (Fase N2)
  notify_email_enabled?: boolean;
  notify_bell_enabled?: boolean;
  notify_wa_redirect_enabled?: boolean;
  // Toggle UI feature legacy "Prenotazioni dal sito" (Fase N2.1)
  show_booking_card_home?: boolean;
  show_booking_bell_calendar?: boolean;
  // Multi-sede (mig. 014)
  multi_location_enabled?: boolean;
};

export type StudioLocationLite = {
  id: string;
  studio_id: string;
  name: string;
  address: string | null;
  is_primary: boolean;
  border_color: string | null;
  sort_order: number;
};

export type StudioMember = {
  studio_id: string;
  user_id: string;
  role: "owner" | "therapist" | "assistant";
  display_name: string | null;
};

type StudioContextValue = {
  studio: Studio | null;
  member: StudioMember | null;
  locations: StudioLocationLite[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshLocations: () => Promise<void>;
};

const StudioContext = createContext<StudioContextValue>({
  studio: null,
  member: null,
  locations: [],
  loading: true,
  error: null,
  refresh: async () => {},
  refreshLocations: async () => {},
});

export function StudioProvider({ children }: { children: ReactNode }) {
  const [studio, setStudio] = useState<Studio | null>(null);
  const [member, setMember] = useState<StudioMember | null>(null);
  const [locations, setLocations] = useState<StudioLocationLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carica le sedi di lavoro per uno studio.
  // Se la tabella studio_locations non esiste ancora (migration non applicata),
  // restituisce [] silenziosamente — il resto dell'app continua a funzionare
  // grazie al fallback su studios.address.
  const loadLocations = async (studioId: string) => {
    try {
      const { data, error: locErr } = await supabase
        .from("studio_locations")
        .select("id, studio_id, name, address, is_primary, border_color, sort_order")
        .eq("studio_id", studioId)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true });

      if (locErr) {
        // Tabella probabilmente non esiste ancora: silenzio totale, app continua
        // a funzionare in modalità single-tenant.
        setLocations([]);
        return;
      }
      setLocations((data || []) as StudioLocationLite[]);
    } catch {
      setLocations([]);
    }
  };

  const refreshLocations = async () => {
    if (studio?.id) await loadLocations(studio.id);
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Recupera utente corrente
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        setStudio(null);
        setMember(null);
        setLocations([]);
        setLoading(false);
        return;
      }

      // 2. Recupera il primo studio a cui l'utente appartiene
      // (futuro: se l'utente ha più studi, qui andrà il selettore)
      const { data: memberData, error: memberErr } = await supabase
        .from("studio_members")
        .select("studio_id, user_id, role, display_name")
        .eq("user_id", userData.user.id)
        .limit(1)
        .maybeSingle();

      if (memberErr || !memberData) {
        setError("Nessuno studio associato al tuo account");
        setStudio(null);
        setMember(null);
        setLocations([]);
        setLoading(false);
        return;
      }

      setMember(memberData as StudioMember);

      // 3. Recupera i dati completi dello studio
      const { data: studioData, error: studioErr } = await supabase
        .from("studios")
        .select("id, name, address, phone, email, google_review_link, logo_url, logo_base64, website, signature_name, signature_title, notify_email_enabled, notify_bell_enabled, notify_wa_redirect_enabled, show_booking_card_home, show_booking_bell_calendar, multi_location_enabled")
        .eq("id", memberData.studio_id)
        .maybeSingle();

      if (studioErr || !studioData) {
        setError("Studio non trovato");
        setStudio(null);
        setLocations([]);
        setLoading(false);
        return;
      }

      setStudio(studioData as Studio);

      // 4. Carica le sedi (silenzioso se la tabella non esiste ancora)
      await loadLocations(memberData.studio_id);
    } catch (e: any) {
      setError(e?.message || "Errore caricamento studio");
      setStudio(null);
      setMember(null);
      setLocations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();

    // Ricarica quando l'utente fa login/logout
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        load();
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <StudioContext.Provider value={{ studio, member, locations, loading, error, refresh: load, refreshLocations }}>
      {children}
    </StudioContext.Provider>
  );
}

export function useCurrentStudio(): StudioContextValue {
  return useContext(StudioContext);
}

// Helper: restituisce solo l'ID dello studio corrente (o null)
// Utile nei punti del codice dove serve solo l'ID per le INSERT
export function useCurrentStudioId(): string | null {
  const { studio } = useCurrentStudio();
  return studio?.id ?? null;
}

// Helper: restituisce le sedi di lavoro dello studio corrente.
// Vuoto se la migration multi-sede non è stata applicata (fallback su studios.address).
export function useStudioLocations(): StudioLocationLite[] {
  const { locations } = useCurrentStudio();
  return locations;
}

// Helper: restituisce la sede principale dello studio corrente, o null.
export function usePrimaryLocation(): StudioLocationLite | null {
  const { locations } = useCurrentStudio();
  return locations.find(l => l.is_primary) ?? null;
}

