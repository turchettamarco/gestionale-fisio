// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/PatientPageTour.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Tour onboarding della scheda paziente refattorizzata (Tappe 1-8).
//
// COMPORTAMENTO:
//   - Si attiva automaticamente al primo accesso a una scheda paziente
//   - Si chiude con "Salta" (in qualsiasi step) o "Fine" (ultimo step)
//   - Una volta completato/skippato, NON si mostra più automaticamente
//   - È riapribile dal bottone "ℹ️ Tour guidato" che il page.tsx
//     deve esporre (es. dentro il menù kebab del header)
//
// STORAGE:
//   - studio_members.patient_v2_tour_completed_at (migration 028)
//   - NULL = mostra al prossimo accesso
//   - timestamp = già visto, non mostrare più
//
// PROPS:
//   - forceShow: se true ignora il timestamp e mostra comunque (per il
//     bottone "riavvia tour")
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/src/lib/supabaseClient";

type Step = {
  icon: string;
  title: string;
  description: string;
  tip?: string;
};

const STEPS: Step[] = [
  {
    icon: "👋",
    title: "La scheda paziente è cambiata",
    description:
      "Abbiamo riorganizzato la scheda paziente in 4 gruppi nella sidebar a sinistra: Anagrafica, Quadro clinico, Trattamenti, Documenti. In 30 secondi ti mostro le novità principali.",
  },
  {
    icon: "📊",
    title: "Pannello Riassunto in cima",
    description:
      "Appena entri nel Quadro clinico vedi 5 KPI: diagnosi principale, trend VAS, numero sedute, obiettivi attivi e ultima nota clinica. È la panoramica veloce del paziente.",
    tip: "Il trend VAS mostra una freccia colorata: verde se sta migliorando, rossa se sta peggiorando.",
  },
  {
    icon: "✅",
    title: "Anamnesi, Diagnosi, Piano: ora a checklist",
    description:
      "I 3 grandi blocchi di testo libero sono diventati 'checklist con pallini'. Cliccando una riga la modifichi inline. Pallino verde = compilato, grigio = vuoto.",
    tip: "Le tue vecchie note libere sono ancora salvate in 'Note libere aggiuntive' sotto ogni card. Niente è andato perso.",
  },
  {
    icon: "🧪",
    title: "161 test ortopedici con tooltip",
    description:
      "Nella Diagnosi clicca 'Test eseguiti' → puoi sfogliare i test per cartelle distretto (Spalla, Ginocchio, Lombare...). Ogni test ha un'icona ℹ blu: ci passi sopra e vedi esecuzione, positività, sensibilità e specificità.",
    tip: "Puoi anche scrivere test personalizzati non in lista col bottone 'Aggiungi test personalizzato'.",
  },
  {
    icon: "📓",
    title: "Diario clinico unificato",
    description:
      "La sezione 'Diario clinico' nella sidebar adesso ha tutto: grafico VAS prima/dopo, filtri rapidi (Con SOAP, Solo nota, Vuote), e cronologia delle sedute con possibilità di modificare le note inline.",
    tip: "Il grafico VAS appare solo se ci sono almeno 2 sedute con misurazione del dolore.",
  },
  {
    icon: "🚀",
    title: "Buon lavoro!",
    description:
      "Tutto il resto (Body Chart, Scale, Foto, Esercizi, Documenti) è dove era prima. Se vuoi rivedere questo tour, c'è il bottone 'ℹ Tour guidato' nel menù kebab dell'header del paziente.",
  },
];

export type PatientPageTourProps = {
  /** Se true forza la visualizzazione anche se già completato. */
  forceShow?: boolean;
  /** Callback quando il tour si chiude (utile se forceShow=true). */
  onClose?: () => void;
};

export default function PatientPageTour({ forceShow, onClose }: PatientPageTourProps) {
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

        // Se forceShow attivato, mostra senza controllare il timestamp
        if (forceShow) {
          setVisible(true);
          return;
        }

        // Controlla se il tour è già stato completato.
        // Strategia: se la query fallisce (colonna mancante, no riga, errore qualunque)
        // → mostriamo comunque il tour, perché è la prima volta che lo vede.
        // L'unico caso in cui NON mostriamo è quando ESISTE un timestamp valorizzato.
        const { data: member, error: queryError } = await supabase
          .from("studio_members")
          .select("patient_v2_tour_completed_at")
          .eq("user_id", uid)
          .maybeSingle();

        if (queryError) {
          // Colonna mancante o altro errore: mostriamo comunque (probabilmente è la prima volta)
          console.warn("[PatientPageTour] query error, mostro comunque:", queryError.message);
          setTimeout(() => setVisible(true), 800);
          return;
        }

        // Se non c'è un timestamp salvato, mostra il tour
        const completedAt = (member as any)?.patient_v2_tour_completed_at;
        if (!completedAt) {
          setTimeout(() => setVisible(true), 800);
        }
      } catch (e) {
        // Errore catastrofico (no auth, no network...) - mostriamo comunque
        console.warn("[PatientPageTour] catch errore, mostro comunque:", e);
        setTimeout(() => setVisible(true), 800);
      }
    })();
  }, [forceShow]);

  const markCompleted = useCallback(async () => {
    if (!userId) return;
    try {
      await supabase
        .from("studio_members")
        .update({ patient_v2_tour_completed_at: new Date().toISOString() })
        .eq("user_id", userId);
    } catch (e) {
      console.warn("[PatientPageTour] errore salvataggio", e);
    }
  }, [userId]);

  const close = useCallback(async () => {
    await markCompleted();
    setVisible(false);
    setStep(0); // reset per riapertura
    onClose?.();
  }, [markCompleted, onClose]);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else close();
  }, [step, close]);

  const back = useCallback(() => {
    if (step > 0) setStep(step - 1);
  }, [step]);

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background: "rgba(15, 23, 42, 0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, backdropFilter: "blur(4px)",
      }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 520, width: "100%", background: "#fff",
          borderRadius: 16, overflow: "hidden",
          boxShadow: "0 20px 60px rgba(15,23,42,0.35)",
          animation: "patientTourSlideIn 0.25s ease-out",
          position: "relative",
        }}
      >
        <style>{`
          @keyframes patientTourSlideIn {
            from { opacity: 0; transform: translateY(20px) scale(0.96); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>

        {/* Badge "Novità" */}
        <div style={{
          position: "absolute", top: 14, left: 14,
          padding: "3px 10px", borderRadius: 99,
          background: "linear-gradient(135deg, #0d9488, #2563eb)",
          color: "#fff", fontSize: 10, fontWeight: 800,
          textTransform: "uppercase", letterSpacing: 0.5,
          zIndex: 1,
        }}>
          ✨ Nuovo
        </div>

        {/* Close button */}
        <button
          onClick={close}
          aria-label="Chiudi tour"
          style={{
            position: "absolute", top: 12, right: 12, zIndex: 1,
            background: "transparent", border: "none", cursor: "pointer",
            fontSize: 22, color: "#94a3b8", padding: 4, lineHeight: 1,
          }}
        >×</button>

        {/* Progress dots */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 6,
          padding: "44px 20px 0",
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

        {/* Content */}
        <div style={{ padding: "24px 28px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 12, lineHeight: 1 }}>{current.icon}</div>
          <h2 style={{
            margin: "0 0 10px",
            fontSize: 21, fontWeight: 800, color: "#0f172a",
            letterSpacing: -0.3,
          }}>
            {current.title}
          </h2>
          <p style={{
            margin: "0 0 14px",
            fontSize: 14, lineHeight: 1.6, color: "#475569",
          }}>
            {current.description}
          </p>
          {current.tip && (
            <div style={{
              padding: "10px 14px", borderRadius: 10,
              background: "#fef3c7", border: "1px solid #fde68a",
              fontSize: 12.5, color: "#92400e", textAlign: "left",
              marginTop: 10, display: "flex", gap: 8, alignItems: "flex-start",
            }}>
              <span>💡</span>
              <span style={{ flex: 1 }}>{current.tip}</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          padding: "16px 24px 22px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 10,
        }}>
          <button
            onClick={close}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: "#94a3b8", fontSize: 13, fontWeight: 600,
              padding: 8, fontFamily: "inherit",
            }}
          >Salta</button>

          <div style={{ display: "flex", gap: 8 }}>
            {!isFirst && (
              <button
                onClick={back}
                style={{
                  padding: "9px 16px", borderRadius: 8,
                  border: "1.5px solid #e2e8f0", background: "#fff",
                  color: "#475569", fontWeight: 700, fontSize: 13,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >← Indietro</button>
            )}
            <button
              onClick={next}
              style={{
                padding: "9px 22px", borderRadius: 8, border: "none",
                background: "linear-gradient(135deg, #0d9488, #2563eb)",
                color: "#fff", fontWeight: 700, fontSize: 13,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >{isLast ? "Fine ✓" : "Avanti →"}</button>
          </div>
        </div>

        {/* Step counter */}
        <div style={{
          position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
          fontSize: 10, color: "#cbd5e1", fontWeight: 600,
        }}>
          {step + 1} / {STEPS.length}
        </div>
      </div>
    </div>
  );
}
