"use client";

import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Non registrare in dev per evitare problemi di hot reload
    if (window.location.hostname === "localhost" && window.location.port === "3000") return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        // Controlla aggiornamenti ogni volta che la pagina torna in foreground
        const onVisible = () => { if (document.visibilityState === "visible") reg.update(); };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
      } catch (err) {
        console.warn("[PWA] Registrazione SW fallita:", err);
      }
    };
    register();
  }, []);

  return null;
}
