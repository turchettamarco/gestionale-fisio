"use client";
// ═══════════════════════════════════════════════════════════════════════
// src/hooks/useDictation.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Hook di dettatura vocale basato su Web Speech API (SpeechRecognition).
//
// PERCHÉ WEB SPEECH API:
//   - Zero costi, zero infrastruttura, zero latenza di upload
//   - Supporto nativo it-IT eccellente su Chrome (desktop + Android)
//     e Safari (macOS + iOS 14.5+, usa il motore Siri)
//   - Non supportato su Firefox → il bottone mic viene nascosto
//
// COMPORTAMENTO:
//   - continuous + interimResults: trascrizione live mentre si parla
//   - I segmenti FINALI vengono consegnati via onFinal(text) → il chiamante
//     li appende alla nota; l'interim è esposto per il "ghost text" live
//   - Keep-alive: iOS/Android fermano il riconoscimento dopo pause di
//     silenzio → su onend, se l'utente non ha premuto stop, riavviamo
//
// PRIVACY:
//   - L'audio è processato dal motore STT del browser (Google/Apple),
//     non passa MAI dai server FisioHub. Nessun audio viene salvato.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Tipi minimi Web Speech API (assenti dalle lib TS standard) ───────

interface SRAlternative {
  transcript: string;
  confidence: number;
}
interface SRResult {
  isFinal: boolean;
  length: number;
  [index: number]: SRAlternative;
}
interface SRResultList {
  length: number;
  [index: number]: SRResult;
}
interface SREvent extends Event {
  resultIndex: number;
  results: SRResultList;
}
interface SRErrorEvent extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// ─── Hook ──────────────────────────────────────────────────────────────

export interface UseDictationOptions {
  /** Callback per ogni segmento di testo FINALE riconosciuto */
  onFinal: (text: string) => void;
  /** Lingua di riconoscimento (default: it-IT) */
  lang?: string;
}

export interface UseDictationResult {
  /** true se il browser supporta la dettatura (Chrome, Safari, Edge) */
  supported: boolean;
  /** true mentre il microfono è attivo */
  listening: boolean;
  /** testo provvisorio in tempo reale (non ancora consolidato) */
  interim: string;
  /** eventuale messaggio di errore (permessi, rete, ...) */
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  clearError: () => void;
}

export function useDictation({ onFinal, lang = "it-IT" }: UseDictationOptions): UseDictationResult {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // true finché l'UTENTE vuole ascoltare → guida il keep-alive su onend
  const wantRef = useRef(false);
  // ref al callback per non ricreare il recognizer ad ogni render
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  // Rileva il supporto solo lato client (evita mismatch SSR)
  useEffect(() => {
    setSupported(!!getRecognitionCtor());
  }, []);

  const stop = useCallback(() => {
    wantRef.current = false;
    setListening(false);
    setInterim("");
    try {
      recRef.current?.stop();
    } catch {
      /* già fermo */
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("Dettatura non supportata da questo browser. Usa Chrome o Safari.");
      return;
    }
    setError(null);

    // Chiudi eventuale istanza precedente rimasta appesa
    try {
      recRef.current?.abort();
    } catch {
      /* noop */
    }

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => setListening(true);

    rec.onresult = (e: SREvent) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0]?.transcript ?? "";
        if (res.isFinal) {
          const clean = t.trim();
          if (clean) onFinalRef.current(clean);
        } else {
          interimText += t;
        }
      }
      setInterim(interimText);
    };

    rec.onerror = (e: SRErrorEvent) => {
      setInterim("");
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Permesso microfono negato. Abilitalo nelle impostazioni del browser e riprova.");
        wantRef.current = false;
        setListening(false);
      } else if (e.error === "network") {
        setError("Errore di rete nel servizio di dettatura. Controlla la connessione e riprova.");
        wantRef.current = false;
        setListening(false);
      } else if (e.error === "no-speech" || e.error === "aborted") {
        // no-speech: pausa di silenzio → il keep-alive su onend riavvia
        // aborted: stop volontario → nessun errore da mostrare
      } else if (e.error === "audio-capture") {
        setError("Nessun microfono rilevato sul dispositivo.");
        wantRef.current = false;
        setListening(false);
      } else {
        setError("Errore dettatura: " + e.error);
      }
    };

    rec.onend = () => {
      setInterim("");
      if (wantRef.current) {
        // Keep-alive: iOS/Android fermano il riconoscimento dopo pause
        // di silenzio. Se l'utente non ha premuto stop, riavviamo.
        try {
          rec.start();
        } catch {
          wantRef.current = false;
          setListening(false);
        }
      } else {
        setListening(false);
      }
    };

    recRef.current = rec;
    wantRef.current = true;
    try {
      rec.start();
    } catch {
      setError("Impossibile avviare la dettatura. Riprova.");
      wantRef.current = false;
      setListening(false);
    }
  }, [lang]);

  const toggle = useCallback(() => {
    if (wantRef.current) stop();
    else start();
  }, [start, stop]);

  const clearError = useCallback(() => setError(null), []);

  // Cleanup allo smontaggio: spegni tutto senza riavvii fantasma
  useEffect(() => {
    return () => {
      wantRef.current = false;
      try {
        recRef.current?.abort();
      } catch {
        /* noop */
      }
    };
  }, []);

  return { supported, listening, interim, error, start, stop, toggle, clearError };
}

/**
 * Appende un segmento dettato al testo esistente con separatore pulito.
 * Prima parola in maiuscolo se il testo parte da zero.
 */
export function appendDictated(prev: string | null | undefined, segment: string): string {
  const base = (prev || "").trimEnd();
  const t = segment.trim();
  if (!t) return base;
  if (!base) return t.charAt(0).toUpperCase() + t.slice(1);
  return base + " " + t;
}
