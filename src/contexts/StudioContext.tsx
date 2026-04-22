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
  website: string | null;
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
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const StudioContext = createContext<StudioContextValue>({
  studio: null,
  member: null,
  loading: true,
  error: null,
  refresh: async () => {},
});

export function StudioProvider({ children }: { children: ReactNode }) {
  const [studio, setStudio] = useState<Studio | null>(null);
  const [member, setMember] = useState<StudioMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Recupera utente corrente
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        setStudio(null);
        setMember(null);
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
        setLoading(false);
        return;
      }

      setMember(memberData as StudioMember);

      // 3. Recupera i dati completi dello studio
      const { data: studioData, error: studioErr } = await supabase
        .from("studios")
        .select("id, name, address, phone, email, google_review_link, logo_url, website")
        .eq("id", memberData.studio_id)
        .maybeSingle();

      if (studioErr || !studioData) {
        setError("Studio non trovato");
        setStudio(null);
        setLoading(false);
        return;
      }

      setStudio(studioData as Studio);
    } catch (e: any) {
      setError(e?.message || "Errore caricamento studio");
      setStudio(null);
      setMember(null);
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
    <StudioContext.Provider value={{ studio, member, loading, error, refresh: load }}>
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
