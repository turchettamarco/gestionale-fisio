"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import { StudioProvider } from "@/src/contexts/StudioContext";
import { PrivacyModeProvider } from "@/src/contexts/PrivacyModeContext";
import { ToastProvider } from "@/src/components/mobile/ToastProvider";
import WelcomeTour from "@/app/(protected)/components/WelcomeTour";
import ActivityTracker from "@/app/(protected)/components/ActivityTracker";
import MobileTabBar from "./components/MobileTabBar";

export default function MobileProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });

    return () => sub.subscription.unsubscribe();
  }, [router]);

  if (!ready) return null;
  return (
    <StudioProvider>
      <PrivacyModeProvider>
        <ToastProvider>
        {children}
        <MobileTabBar />
        <WelcomeTour />
        <ActivityTracker />
      </ToastProvider>
      </PrivacyModeProvider>
    </StudioProvider>
  );
}
