"use client";
// src/contexts/ProtectedProviders.tsx
// Wrapper client-side che avvolge tutto ciò che è sotto (protected) con il StudioProvider.
// Deve stare in un file separato "use client" perché il layout (protected)/layout.tsx
// è server-component (fa redirect se non autenticato).

import { ReactNode, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { StudioProvider, useCurrentStudio } from "./StudioContext";
import { PrivacyModeProvider } from "./PrivacyModeContext";
import { supabase } from "@/src/lib/supabaseClient";

export default function ProtectedProviders({ children }: { children: ReactNode }) {
  return (
    <StudioProvider>
      <PrivacyModeProvider>
        <OnboardingGuard>{children}</OnboardingGuard>
      </PrivacyModeProvider>
    </StudioProvider>
  );
}

// OnboardingGuard: redirige a /onboarding se lo studio non ha completato il wizard.
// Si attiva al primo render e ogni volta che cambia route.
// È trasparente: non blocca nulla se onboarded_at è già presente.
function OnboardingGuard({ children }: { children: ReactNode }) {
  const { studio, loading } = useCurrentStudio();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || !studio) return;
    // Se siamo già su /onboarding, non fare niente
    if (pathname?.startsWith("/onboarding")) return;

    // Verifica se ha completato il wizard (interroga supabase, non sta nel context)
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("studios")
        .select("onboarded_at")
        .eq("id", studio.id)
        .maybeSingle();
      if (cancelled) return;
      if (data && !data.onboarded_at) {
        router.replace("/onboarding");
      }
    })();
    return () => { cancelled = true; };
  }, [studio, loading, pathname, router]);

  return <>{children}</>;
}
