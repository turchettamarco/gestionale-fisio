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
//
// FASE 2 (mig. 019): aggiunti members[], rooms[] e i due flag
//   multi_operator_enabled, multi_room_enabled. Tutto è retrocompatibile:
//   se la migration 019 non è applicata, members[] è solo [me_stesso],
//   rooms[] è [], e i flag sono undefined → trattati come false.

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
  // Multi-operatore + multi-stanza (mig. 019)
  // Quando undefined (es. migration non applicata) trattati come false in tutta la UI.
  multi_operator_enabled?: boolean;
  multi_room_enabled?: boolean;
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

/**
 * Singolo membro dello studio.
 * Pre-mig. 019: studio_id, user_id, role, display_name.
 * Post-mig. 019: aggiunti display_color, signature_short, is_active, sort_order, email, invited_at.
 * I campi nuovi sono opzionali nel tipo per non rompere il codice che usa solo i campi base.
 */
export type StudioMember = {
  studio_id: string;
  /** auth.users.id del membro, o NULL se è un invito pendente (mig. 020). */
  user_id: string | null;
  role: "owner" | "therapist" | "assistant";
  display_name: string | null;
  // Campi mig. 019 (opzionali per backward-compat con DB pre-019)
  display_color?: string | null;
  signature_short?: string | null;
  is_active?: boolean;
  sort_order?: number;
  email?: string | null;
  invited_at?: string | null;
  /** Token UUID dell'invito (mig. 020). NULL dopo il claim, oppure se il
   *  membro è stato aggiunto direttamente senza link (es. signup self). */
  invite_token?: string | null;
};

/**
 * Stanza/ambiente operativo (mig. 019).
 * Mirror di StudioLocationLite. Una stanza può essere legata a una sede (location_id)
 * o trasversale a tutte le sedi (location_id NULL).
 */
export type StudioRoomLite = {
  id: string;
  studio_id: string;
  location_id: string | null;
  name: string;
  color: string | null;
  is_active: boolean;
  sort_order: number;
};

type StudioContextValue = {
  studio: Studio | null;
  /** Il membro corrente (utente loggato). Mantiene il vecchio comportamento single-member. */
  member: StudioMember | null;
  /** Tutti i membri attivi dello studio (mig. 019). Se la mig. non è applicata contiene solo [member]. */
  members: StudioMember[];
  locations: StudioLocationLite[];
  /** Stanze attive dello studio (mig. 019). [] se mig. non applicata o nessuna stanza configurata. */
  rooms: StudioRoomLite[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshLocations: () => Promise<void>;
  refreshMembers: () => Promise<void>;
  refreshRooms: () => Promise<void>;
};

const StudioContext = createContext<StudioContextValue>({
  studio: null,
  member: null,
  members: [],
  locations: [],
  rooms: [],
  loading: true,
  error: null,
  refresh: async () => {},
  refreshLocations: async () => {},
  refreshMembers: async () => {},
  refreshRooms: async () => {},
});

export function StudioProvider({ children }: { children: ReactNode }) {
  const [studio, setStudio] = useState<Studio | null>(null);
  const [member, setMember] = useState<StudioMember | null>(null);
  const [members, setMembers] = useState<StudioMember[]>([]);
  const [locations, setLocations] = useState<StudioLocationLite[]>([]);
  const [rooms, setRooms] = useState<StudioRoomLite[]>([]);
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

  // Carica tutti i membri attivi dello studio (mig. 019).
  // Se le colonne nuove (display_color, signature_short, is_active, sort_order)
  // non esistono ancora, fa una query "minima" senza filtri/ordinamenti che le richiedano.
  // Fallback finale: array contenente solo il membro corrente.
  const loadMembers = async (studioId: string, fallbackSelf: StudioMember | null) => {
    try {
      // Tentativo 1: query post-019 con tutti i campi nuovi
      const { data, error: memErr } = await supabase
        .from("studio_members")
        .select("studio_id, user_id, role, display_name, display_color, signature_short, is_active, sort_order, email, invited_at, invite_token")
        .eq("studio_id", studioId)
        .order("sort_order", { ascending: true })
        .order("display_name", { ascending: true });

      if (!memErr && data) {
        // Filtra solo i membri attivi (default true se colonna assente)
        const activeMembers = (data as StudioMember[]).filter(
          m => m.is_active !== false
        );
        setMembers(activeMembers);
        return;
      }

      // Tentativo 2: fallback query pre-019 (solo campi base)
      const { data: dataBasic, error: memErrBasic } = await supabase
        .from("studio_members")
        .select("studio_id, user_id, role, display_name")
        .eq("studio_id", studioId);

      if (!memErrBasic && dataBasic) {
        setMembers(dataBasic as StudioMember[]);
        return;
      }

      // Tentativo 3: niente di tutto, almeno mostra il membro corrente
      setMembers(fallbackSelf ? [fallbackSelf] : []);
    } catch {
      setMembers(fallbackSelf ? [fallbackSelf] : []);
    }
  };

  // Carica le stanze attive dello studio (mig. 019).
  // Stesso pattern di loadLocations: se la tabella non esiste, restituisce [] e amen.
  const loadRooms = async (studioId: string) => {
    try {
      const { data, error: roomErr } = await supabase
        .from("studio_rooms")
        .select("id, studio_id, location_id, name, color, is_active, sort_order")
        .eq("studio_id", studioId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (roomErr) {
        setRooms([]);
        return;
      }
      setRooms((data || []) as StudioRoomLite[]);
    } catch {
      setRooms([]);
    }
  };

  const refreshLocations = async () => {
    if (studio?.id) await loadLocations(studio.id);
  };

  const refreshMembers = async () => {
    if (studio?.id) await loadMembers(studio.id, member);
  };

  const refreshRooms = async () => {
    if (studio?.id) await loadRooms(studio.id);
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
        setMembers([]);
        setLocations([]);
        setRooms([]);
        setLoading(false);
        return;
      }

      // 2. Recupera il primo studio a cui l'utente appartiene
      // (futuro: se l'utente ha più studi, qui andrà il selettore)
      // Tentativo con i campi nuovi della 019 — fallback al set base se non ci sono.
      let memberData: StudioMember | null = null;
      const { data: memberDataRich, error: memberErrRich } = await supabase
        .from("studio_members")
        .select("studio_id, user_id, role, display_name, display_color, signature_short, is_active, sort_order, email, invited_at, invite_token")
        .eq("user_id", userData.user.id)
        .limit(1)
        .maybeSingle();

      if (!memberErrRich && memberDataRich) {
        memberData = memberDataRich as StudioMember;
      } else {
        // Fallback pre-019
        const { data: memberDataBasic, error: memberErrBasic } = await supabase
          .from("studio_members")
          .select("studio_id, user_id, role, display_name")
          .eq("user_id", userData.user.id)
          .limit(1)
          .maybeSingle();

        if (memberErrBasic || !memberDataBasic) {
          setError("Nessuno studio associato al tuo account");
          setStudio(null);
          setMember(null);
          setMembers([]);
          setLocations([]);
          setRooms([]);
          setLoading(false);
          return;
        }
        memberData = memberDataBasic as StudioMember;
      }

      setMember(memberData);

      // 3. Recupera i dati completi dello studio (con i flag mig. 019)
      // Usiamo "*" per pescare anche i nuovi flag senza dover toccare la query
      // ad ogni nuova migration su `studios`. È una tabella piccola (1 riga),
      // niente over-fetch significativo.
      const { data: studioData, error: studioErr } = await supabase
        .from("studios")
        .select("*")
        .eq("id", memberData.studio_id)
        .maybeSingle();

      if (studioErr || !studioData) {
        setError("Studio non trovato");
        setStudio(null);
        setMembers([]);
        setLocations([]);
        setRooms([]);
        setLoading(false);
        return;
      }

      setStudio(studioData as Studio);

      // 4. Carica in parallelo: sedi, membri (tutti), stanze
      // Tutti silenziosi in caso di tabella mancante — l'app continua sempre.
      await Promise.all([
        loadLocations(memberData.studio_id),
        loadMembers(memberData.studio_id, memberData),
        loadRooms(memberData.studio_id),
      ]);
    } catch (e: any) {
      setError(e?.message || "Errore caricamento studio");
      setStudio(null);
      setMember(null);
      setMembers([]);
      setLocations([]);
      setRooms([]);
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
    <StudioContext.Provider
      value={{
        studio,
        member,
        members,
        locations,
        rooms,
        loading,
        error,
        refresh: load,
        refreshLocations,
        refreshMembers,
        refreshRooms,
      }}
    >
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

// ─────────────────────────────────────────────────────────────────────
// Helper Fase 2 — multi-operatore + multi-stanza (mig. 019)
// ─────────────────────────────────────────────────────────────────────

/**
 * Restituisce tutti i membri attivi dello studio corrente, ordinati per
 * sort_order poi display_name. Quando la mig. 019 non è applicata o lo
 * studio ha 1 solo membro, restituisce comunque almeno [me_stesso].
 */
export function useStudioMembers(): StudioMember[] {
  const { members } = useCurrentStudio();
  return members;
}

/**
 * Restituisce tutte le stanze attive dello studio corrente.
 * Vuoto se la mig. 019 non è applicata o se non ci sono stanze configurate.
 */
export function useStudioRooms(): StudioRoomLite[] {
  const { rooms } = useCurrentStudio();
  return rooms;
}

/**
 * Restituisce true se lo studio ha la modalità multi-operatore attiva.
 * False se il flag è OFF, undefined (mig. non applicata) o se lo studio è
 * null (non ancora caricato). È il check da usare in tutti i componenti
 * UI per decidere se mostrare colonne per operatore, selettori, filtri.
 */
export function useMultiOperatorEnabled(): boolean {
  const { studio } = useCurrentStudio();
  return Boolean(studio?.multi_operator_enabled);
}

/**
 * Speculare al precedente, ma per le stanze.
 */
export function useMultiRoomEnabled(): boolean {
  const { studio } = useCurrentStudio();
  return Boolean(studio?.multi_room_enabled);
}

/**
 * Trova un membro per user_id. Utile nel calendario per arricchire un
 * appointment.operator_id con i suoi metadati (color, signature_short, name).
 * Restituisce undefined se non trovato (es. operator_id punta a un membro
 * disattivato o cancellato).
 */
export function useMemberById(userId: string | null | undefined): StudioMember | undefined {
  const { members } = useCurrentStudio();
  if (!userId) return undefined;
  return members.find(m => m.user_id === userId);
}

/**
 * Trova una stanza per id. Stesso pattern di useMemberById.
 */
export function useRoomById(roomId: string | null | undefined): StudioRoomLite | undefined {
  const { rooms } = useCurrentStudio();
  if (!roomId) return undefined;
  return rooms.find(r => r.id === roomId);
}
