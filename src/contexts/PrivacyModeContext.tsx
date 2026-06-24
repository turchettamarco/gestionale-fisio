// src/contexts/PrivacyModeContext.tsx
// ═══════════════════════════════════════════════════════════════════════
// MODALITÀ PRIVACY (solo visuale, NON tocca il database)
// ═══════════════════════════════════════════════════════════════════════
//
// Quando la Modalità Privacy è ATTIVA, in tutta l'app il nome e cognome
// dei pazienti viene sostituito a video. Due STILI possibili:
//   • "generic"  → sempre la dicitura "Paziente" (default, massimo anonimato)
//   • "initials" → iniziali del paziente, es. "M.R." (utile quando nello
//                  stesso screenshot compaiono più pazienti e vuoi poterli
//                  distinguere visivamente senza esporre il nome)
// Serve per fare screenshot da inviare (es. su WhatsApp, gruppi di studio,
// supporto) senza esporre dati personali dei pazienti.
//
// CARATTERISTICHE:
//   • Preferenza LOCALE del dispositivo/browser, salvata in localStorage.
//     NON è per-studio, NON sta nel DB: è una scelta di chi sta guardando
//     lo schermo in quel momento. Cambiare il toggle non scrive mai nulla
//     sui dati dei pazienti.
//   • Il provider avvolge sia il desktop che il mobile (è dentro
//     ProtectedProviders, condiviso dai due layout protetti).
//
// USO TIPICO NEI COMPONENTI:
//   import { useDisplayPatientName } from "@/src/contexts/PrivacyModeContext";
//   const displayName = useDisplayPatientName();
//   // ...
//   <span>{displayName(paziente)}</span>
//   // dove `paziente` può essere { first_name, last_name } oppure una
//   // stringa già composta. Se la Modalità Privacy è OFF ritorna il nome
//   // reale, se è ON ritorna "Paziente" o "M.R." in base allo stile scelto.
//
// TOGGLE (da Impostazioni):
//   const { privacyMode, setPrivacyMode, privacyStyle, setPrivacyStyle } = usePrivacyMode();
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";

// Etichetta mostrata al posto del nome reale quando lo stile è "generic".
export const PRIVACY_PLACEHOLDER = "Paziente";

// Stili di mascheramento disponibili.
export type PrivacyStyle = "generic" | "initials";
const DEFAULT_PRIVACY_STYLE: PrivacyStyle = "generic";

// Chiavi localStorage (prefisso fisiohub per non collidere con altre app).
const STORAGE_KEY = "fisiohub_privacy_mode";
const STYLE_STORAGE_KEY = "fisiohub_privacy_style";

// Eventi custom usati per sincronizzare più tab/istanze nello stesso device.
const SYNC_EVENT = "fisiohub:privacy-mode-change";
const STYLE_SYNC_EVENT = "fisiohub:privacy-style-change";

// ─────────────────────────────────────────────────────────────────────
// Tipi
// ─────────────────────────────────────────────────────────────────────

/**
 * Una "fonte nome" può essere:
 *   • un oggetto con first_name/last_name (il caso più comune nel codice),
 *   • un oggetto con un campo nome già composto (name / full_name / nome),
 *   • una stringa già pronta ("Mario Rossi"),
 *   • null/undefined (ritorna stringa vuota o placeholder a seconda della modalità).
 * Così l'hook si adatta a tutti i ~40 punti dell'app senza forzare un refactor
 * dei tipi esistenti.
 */
export type PatientNameSource =
  | string
  | null
  | undefined
  | {
      first_name?: string | null;
      last_name?: string | null;
      name?: string | null;
      full_name?: string | null;
      nome?: string | null;
      cognome?: string | null;
    };

type PrivacyModeContextValue = {
  /** TRUE se la modalità privacy è attiva (nomi mascherati a video). */
  privacyMode: boolean;
  /** Imposta esplicitamente lo stato. */
  setPrivacyMode: (on: boolean) => void;
  /** Inverte lo stato corrente. */
  togglePrivacyMode: () => void;
  /** Stile di mascheramento: "generic" ("Paziente") o "initials" ("M.R."). */
  privacyStyle: PrivacyStyle;
  /** Imposta lo stile di mascheramento. */
  setPrivacyStyle: (style: PrivacyStyle) => void;
  /** TRUE finché non abbiamo letto localStorage (evita flash al primo render). */
  hydrated: boolean;
};

const PrivacyModeContext = createContext<PrivacyModeContextValue>({
  privacyMode: false,
  setPrivacyMode: () => {},
  togglePrivacyMode: () => {},
  privacyStyle: DEFAULT_PRIVACY_STYLE,
  setPrivacyStyle: () => {},
  hydrated: false,
});

// ─────────────────────────────────────────────────────────────────────
// Helper puro: compone il nome reale da una PatientNameSource.
// Non dipende dal context, così è riusabile anche fuori da React se serve.
// ─────────────────────────────────────────────────────────────────────

/**
 * Ordine di composizione del nome REALE (quando privacy OFF):
 *   1. se è già una stringa → la usa
 *   2. name / full_name → li usa così come sono
 *   3. first_name + last_name (o nome + cognome) → li concatena
 * Mantiene l'ordine "Nome Cognome". I singoli punti dell'app che vogliono
 * "Cognome Nome" continuano a comporlo da soli quando privacy è OFF: questo
 * helper è il fallback generico, non sostituisce la logica locale dove serve.
 */
export function composeRealName(src: PatientNameSource): string {
  if (src == null) return "";
  if (typeof src === "string") return src.trim();

  if (src.full_name && src.full_name.trim()) return src.full_name.trim();
  if (src.name && src.name.trim()) return src.name.trim();

  const first = (src.first_name ?? src.nome ?? "").trim();
  const last = (src.last_name ?? src.cognome ?? "").trim();
  return `${first} ${last}`.trim();
}

/**
 * Calcola le iniziali nel formato "M.R." (iniziale nome + iniziale cognome,
 * entrambe maiuscole, separate da punto, senza spazio finale).
 * Richiede first_name/last_name separati: se la fonte è solo una stringa
 * già composta ("Mario Rossi"), la spezza sugli spazi come fallback,
 * prendendo la prima e l'ultima parola. Se non si riesce a ricavare
 * nulla, ritorna PRIVACY_PLACEHOLDER ("Paziente") come fallback sicuro.
 */
export function composeInitials(src: PatientNameSource): string {
  if (src == null) return PRIVACY_PLACEHOLDER;

  let first = "";
  let last = "";

  if (typeof src === "string") {
    const parts = src.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return PRIVACY_PLACEHOLDER;
    first = parts[0];
    last = parts.length > 1 ? parts[parts.length - 1] : "";
  } else {
    first = (src.first_name ?? src.nome ?? "").trim();
    last = (src.last_name ?? src.cognome ?? "").trim();
    // Fallback: se non ci sono first/last separati ma c'è un nome composto
    // (full_name/name), spezza quello sugli spazi come per le stringhe.
    if (!first && !last) {
      const composed = (src.full_name ?? src.name ?? "").trim();
      if (composed) {
        const parts = composed.split(/\s+/).filter(Boolean);
        first = parts[0] ?? "";
        last = parts.length > 1 ? parts[parts.length - 1] : "";
      }
    }
  }

  const fi = first.charAt(0).toUpperCase();
  const li = last.charAt(0).toUpperCase();

  if (fi && li) return `${fi}.${li}.`;
  if (fi) return `${fi}.`;
  if (li) return `${li}.`;
  return PRIVACY_PLACEHOLDER;
}

// ─────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────

export function PrivacyModeProvider({ children }: { children: ReactNode }) {
  const [privacyMode, setPrivacyModeState] = useState(false);
  const [privacyStyle, setPrivacyStyleState] = useState<PrivacyStyle>(DEFAULT_PRIVACY_STYLE);
  const [hydrated, setHydrated] = useState(false);

  // Lettura iniziale da localStorage (solo lato client).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setPrivacyModeState(raw === "1" || raw === "true");
      const rawStyle = localStorage.getItem(STYLE_STORAGE_KEY);
      setPrivacyStyleState(rawStyle === "initials" ? "initials" : DEFAULT_PRIVACY_STYLE);
    } catch {
      // localStorage non disponibile (es. SSR/privacy browser): resta default.
    } finally {
      setHydrated(true);
    }
  }, []);

  // Sincronizza tra tab dello stesso device:
  //   • evento "storage" → cambio fatto in un'altra tab
  //   • evento custom SYNC_EVENT/STYLE_SYNC_EVENT → cambio fatto in questa
  //     tab da un'altra istanza del provider
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setPrivacyModeState(e.newValue === "1" || e.newValue === "true");
      }
      if (e.key === STYLE_STORAGE_KEY) {
        setPrivacyStyleState(e.newValue === "initials" ? "initials" : DEFAULT_PRIVACY_STYLE);
      }
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      setPrivacyModeState(Boolean(detail));
    };
    const onStyleCustom = (e: Event) => {
      const detail = (e as CustomEvent<PrivacyStyle>).detail;
      setPrivacyStyleState(detail === "initials" ? "initials" : DEFAULT_PRIVACY_STYLE);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SYNC_EVENT, onCustom as EventListener);
    window.addEventListener(STYLE_SYNC_EVENT, onStyleCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SYNC_EVENT, onCustom as EventListener);
      window.removeEventListener(STYLE_SYNC_EVENT, onStyleCustom as EventListener);
    };
  }, []);

  const setPrivacyMode = useCallback((on: boolean) => {
    setPrivacyModeState(on);
    try {
      localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    } catch {
      // ignora: lo stato in memoria funziona comunque per la sessione corrente
    }
    // Notifica le altre istanze del provider nella stessa tab.
    try {
      window.dispatchEvent(new CustomEvent<boolean>(SYNC_EVENT, { detail: on }));
    } catch {
      /* no-op */
    }
  }, []);

  const togglePrivacyMode = useCallback(() => {
    setPrivacyMode(!privacyMode);
  }, [privacyMode, setPrivacyMode]);

  const setPrivacyStyle = useCallback((style: PrivacyStyle) => {
    setPrivacyStyleState(style);
    try {
      localStorage.setItem(STYLE_STORAGE_KEY, style);
    } catch {
      /* ignora */
    }
    try {
      window.dispatchEvent(new CustomEvent<PrivacyStyle>(STYLE_SYNC_EVENT, { detail: style }));
    } catch {
      /* no-op */
    }
  }, []);

  return (
    <PrivacyModeContext.Provider
      value={{ privacyMode, setPrivacyMode, togglePrivacyMode, privacyStyle, setPrivacyStyle, hydrated }}
    >
      {children}
    </PrivacyModeContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Hook base
// ─────────────────────────────────────────────────────────────────────

export function usePrivacyMode(): PrivacyModeContextValue {
  return useContext(PrivacyModeContext);
}

// ─────────────────────────────────────────────────────────────────────
// Hook di comodo: ritorna una funzione che, dato un paziente, restituisce
// il nome da MOSTRARE a video (reale, "Paziente" o "M.R." in base alla
// modalità e allo stile scelti).
//
// È il punto di sostituzione in tutti i componenti: ovunque oggi si scrive
//   {`${p.last_name} ${p.first_name}`}
// si passa a
//   const dn = useDisplayPatientName();
//   {dn(p, `${p.last_name} ${p.first_name}`)}   // 2° arg = come comporre il nome reale
//
// Se il 2° argomento (fallback) non viene passato, usa composeRealName().
// Con privacyStyle "initials" servono first_name/last_name distinti per
// calcolare le iniziali correttamente: passa l'oggetto paziente come 1°
// argomento (non solo una stringa già composta) quando possibile.
// ─────────────────────────────────────────────────────────────────────

export function useDisplayPatientName() {
  const { privacyMode, privacyStyle } = usePrivacyMode();

  return useCallback(
    (src: PatientNameSource, realNameOverride?: string | null): string => {
      if (privacyMode) {
        return privacyStyle === "initials" ? composeInitials(src) : PRIVACY_PLACEHOLDER;
      }
      const real =
        realNameOverride != null && realNameOverride.trim()
          ? realNameOverride.trim()
          : composeRealName(src);
      return real;
    },
    [privacyMode, privacyStyle],
  );
}

// ─────────────────────────────────────────────────────────────────────
// Hook generico per i punti dell'app che oggi fanno il mascheramento
// "a mano" (es. `privacyMode ? "Paziente" : nomeReale`). Ritorna una
// funzione `maskName(src)` che applica automaticamente lo stile scelto
// (generic/initials) quando la privacy è attiva, da usare così:
//
//   const { maskName } = usePrivacyDisplay();
//   {privacyMode ? maskName(p) : nomeReale}
//
// `maskInitial(src)` è l'equivalente per gli avatar a singola lettera
// (oggi "P" fissa): con stile iniziali ritorna "M.R." anche lì, con
// stile generico ritorna "P" come prima.
// ─────────────────────────────────────────────────────────────────────

export function usePrivacyDisplay() {
  const { privacyMode, privacyStyle } = usePrivacyMode();

  const maskName = useCallback(
    (src: PatientNameSource): string =>
      privacyStyle === "initials" ? composeInitials(src) : PRIVACY_PLACEHOLDER,
    [privacyStyle],
  );

  const maskInitial = useCallback(
    (src: PatientNameSource): string =>
      privacyStyle === "initials" ? composeInitials(src) : "P",
    [privacyStyle],
  );

  return { active: privacyMode, style: privacyStyle, maskName, maskInitial };
}

// ─────────────────────────────────────────────────────────────────────
// Mascheramento TELEFONO
// ─────────────────────────────────────────────────────────────────────
//
// Quando la Modalità Privacy è attiva, il numero di telefono non deve
// comparire per intero negli screenshot. Mostriamo solo il prefisso
// (le prime 3 cifre, es. "333", "320", "0776"...) e sostituiamo le
// cifre restanti con "x", mantenendo la lunghezza originale così il
// risultato resta leggibile come "numero di telefono mascherato" e
// non come un valore mancante.
//
// Esempi:
//   "3331234567"   → "333xxxxxxx"
//   "+39 333 1234567" → "+39 333 xxxxxxx"   (il prefisso internazionale
//                        e gli spazi/separatori vengono preservati,
//                        si mascherano solo le cifre dopo il prefisso
//                        nazionale di 3 cifre)
//   "0776 123456"  → "0776 xxxxxx"
//   null/undefined → ""  (nessun numero da mostrare)
//
// La logica: si scorre la stringa carattere per carattere, si lasciano
// intatti spazi/simboli (+, -, spazio, parentesi) e le prime 3 cifre
// numeriche incontrate; ogni cifra numerica successiva diventa "x".
// ─────────────────────────────────────────────────────────────────────

const PHONE_PREFIX_DIGITS = 3;

/**
 * Maschera un numero di telefono mantenendo visibile solo il prefisso
 * (prime 3 cifre numeriche) e l'eventuale prefisso internazionale/simboli,
 * sostituendo il resto delle cifre con "x". Ritorna stringa vuota se
 * il numero è nullo/vuoto.
 */
export function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";
  let digitsSeen = 0;
  let chars = "";
  for (const ch of phone) {
    if (/[0-9]/.test(ch)) {
      digitsSeen += 1;
      chars += digitsSeen <= PHONE_PREFIX_DIGITS ? ch : "x";
    } else {
      // spazi, +, -, (), . restano invariati per leggibilità
      chars += ch;
    }
  }
  return chars;
}

/**
 * Hook di comodo: ritorna una funzione che, dato un numero di telefono,
 * lo mostra per intero (privacy OFF) o mascherato (privacy ON, vedi
 * maskPhoneNumber). Stesso pattern di useDisplayPatientName.
 */
export function useDisplayPatientPhone() {
  const { privacyMode } = usePrivacyMode();

  return useCallback(
    (phone: string | null | undefined): string => {
      if (!phone) return "";
      return privacyMode ? maskPhoneNumber(phone) : phone;
    },
    [privacyMode],
  );
}
