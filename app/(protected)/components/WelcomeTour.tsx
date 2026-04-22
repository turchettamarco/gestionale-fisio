"use client";

// WelcomeTour.tsx
// Overlay che mostra un tour guidato al primo accesso dopo la registrazione.
// Salva il completamento in studio_members.welcome_tour_completed_at.
//
// Viene renderizzato dentro ProtectedLayout. Se l'utente non ha completato il tour
// (e non è stato skippato), si mostra automaticamente.

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

type Step = {
  icon: string;
  title: string;
  description: string;
  tip?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

const STEPS: Step[] = [
  {
    icon: "👋",
    title: "Benvenuto in FisioHub!",
    description:
      "Il tuo studio è pronto. In 30 secondi ti mostro le sezioni principali per iniziare subito a lavorare.",
  },
  {
    icon: "📅",
    title: "Calendario",
    description:
      "Qui gestisci tutti gli appuntamenti: crei, modifichi, mandi promemoria WhatsApp con un click. Supporta vista giornaliera, settimanale e mensile.",
    tip: "Tocca uno slot vuoto per creare un appuntamento, tocca uno esistente per modificarlo.",
  },
  {
    icon: "👥",
    title: "Pazienti",
    description:
      "L'anagrafica completa dei tuoi pazienti. Per ogni scheda trovi: diagnosi, storico appuntamenti, note SOAP, esercizi domiciliari, foto, scale cliniche, e molto altro.",
    tip: "Dalla scheda paziente puoi inviare messaggi personalizzati: auguri, solleciti, questionari.",
  },
  {
    icon: "⚙️",
    title: "Impostazioni",
    description:
      "Configura il tuo studio: dati anagrafici, indirizzo, prezzi, template dei messaggi WhatsApp, link Google Reviews. Tutto quello che personalizza FisioHub per te.",
    tip: "Vai subito nelle impostazioni per inserire nome studio, indirizzo e template auguri/promemoria.",
    ctaLabel: "Vai alle impostazioni",
    ctaHref: "/settings",
  },
  {
    icon: "🚀",
    title: "Sei pronto!",
    description:
      "Puoi iniziare aggiungendo i tuoi primi pazienti e appuntamenti. Questo tour non sarà più mostrato. Se hai bisogno di aiuto, contatta l'assistenza.",
  },
];

export default function WelcomeTour() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  // Al mount, verifica se mostrare il tour
  useEffect(() => {
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (!uid) return;
        setUserId(uid);

        // Controlla se il tour è già stato completato/skippato
        const { data: member } = await supabase
          .from("studio_members")
          .select("welcome_tour_completed_at")
          .eq("user_id", uid)
          .maybeSingle();

        // Mostra il tour solo se non c'è un timestamp salvato
        if (member && !(member as any).welcome_tour_completed_at) {
          // Piccolo ritardo per evitare flash durante il rendering iniziale
          setTimeout(() => setVisible(true), 500);
        }
      } catch (e) {
        // Se la colonna non esiste ancora (migration mancante), non mostriamo il tour.
        // Non è un errore critico.
        console.warn("[WelcomeTour]", e);
      }
    })();
  }, []);

  const markCompleted = useCallback(async () => {
    if (!userId) return;
    try {
      await supabase
        .from("studio_members")
        .update({ welcome_tour_completed_at: new Date().toISOString() })
        .eq("user_id", userId);
    } catch {}
  }, [userId]);

  const close = useCallback(async () => {
    await markCompleted();
    setVisible(false);
  }, [markCompleted]);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else close();
  }, [step, close]);

  const back = useCallback(() => {
    if (step > 0) setStep(step - 1);
  }, [step]);

  const goToCta = useCallback(async (href: string) => {
    await markCompleted();
    setVisible(false);
    router.push(href);
  }, [markCompleted, router]);

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(15, 23, 42, 0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, backdropFilter: "blur(4px)",
      }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 480, width: "100%", background: "#fff",
          borderRadius: 16, overflow: "hidden",
          boxShadow: "0 20px 60px rgba(15,23,42,0.35)",
          animation: "tourSlideIn 0.25s ease-out",
        }}
      >
        <style>{`
          @keyframes tourSlideIn {
            from { opacity: 0; transform: translateY(20px) scale(0.96); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>

        {/* Progress dots */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 6,
          padding: "16px 20px 0",
        }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 24 : 8,
              height: 8,
              borderRadius: 4,
              background: i === step
                ? "linear-gradient(90deg, #0d9488, #2563eb)"
                : i < step ? "#0d9488" : "#e2e8f0",
              transition: "width 0.2s, background 0.2s",
            }} />
          ))}
        </div>

        {/* Close button */}
        <button
          onClick={close}
          aria-label="Chiudi tour"
          style={{
            position: "absolute", top: 12, right: 12,
            background: "transparent", border: "none", cursor: "pointer",
            fontSize: 22, color: "#94a3b8", padding: 4, lineHeight: 1,
          }}
        >
          ×
        </button>

        {/* Content */}
        <div style={{ padding: "28px 28px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 14 }}>{current.icon}</div>
          <h2 style={{
            margin: "0 0 10px",
            fontSize: 22, fontWeight: 800, color: "#0f172a",
            letterSpacing: -0.3,
          }}>
            {current.title}
          </h2>
          <p style={{
            margin: "0 0 14px",
            fontSize: 14.5, lineHeight: 1.6, color: "#475569",
          }}>
            {current.description}
          </p>
          {current.tip && (
            <div style={{
              padding: "10px 14px", borderRadius: 10,
              background: "#fef3c7", border: "1px solid #fde68a",
              fontSize: 12.5, color: "#92400e", textAlign: "left",
              marginTop: 12, display: "flex", gap: 8, alignItems: "flex-start",
            }}>
              <span>💡</span>
              <span style={{ flex: 1 }}>{current.tip}</span>
            </div>
          )}
          {current.ctaLabel && current.ctaHref && (
            <button
              onClick={() => goToCta(current.ctaHref!)}
              style={{
                marginTop: 14,
                padding: "8px 18px", borderRadius: 8, border: "none",
                background: "rgba(37,99,235,0.08)",
                color: "#2563eb", fontWeight: 700, fontSize: 13,
                cursor: "pointer",
              }}
            >
              → {current.ctaLabel}
            </button>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          padding: "16px 24px 24px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 10,
        }}>
          <button
            onClick={close}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: "#94a3b8", fontSize: 13, fontWeight: 600,
              padding: 8,
            }}
          >
            Salta tour
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            {!isFirst && (
              <button
                onClick={back}
                style={{
                  padding: "10px 18px", borderRadius: 8,
                  border: "1.5px solid #e2e8f0", background: "#fff",
                  color: "#475569", fontWeight: 700, fontSize: 13,
                  cursor: "pointer",
                }}
              >
                ← Indietro
              </button>
            )}
            <button
              onClick={next}
              style={{
                padding: "10px 22px", borderRadius: 8, border: "none",
                background: "linear-gradient(135deg, #0d9488, #2563eb)",
                color: "#fff", fontWeight: 700, fontSize: 13,
                cursor: "pointer",
              }}
            >
              {isLast ? "Inizia" : "Avanti →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
