"use client";

// ════════════════════════════════════════════════════════════════════════
// src/components/PhoneInput.tsx
// ════════════════════════════════════════════════════════════════════════
//
// Input telefono strutturato con selettore prefisso paese.
//
// COMPORTAMENTO:
//   - L'utente vede 2 campi: dropdown prefisso (+39, +33, ...) + numero
//   - Il valore esposto al parent è una STRINGA E.164 (es. "+393331234567")
//   - In input accetta vecchi formati (spazi, trattini, parentesi) e li
//     normalizza automaticamente.
//
// USO:
//   <PhoneInput value={phone} onChange={setPhone} />
//
// Default: prefisso +39 (Italia). Il selettore include i paesi dove c'è
// più probabilità di avere collaboratori (UE + adiacenti).
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";

// ── Lista prefissi (ordinata per probabilità d'uso in IT) ───────────────
const COUNTRIES: { code: string; name: string; flag: string; example?: string }[] = [
  { code: "+39",  name: "Italia",         flag: "🇮🇹", example: "333 1234567" },
  { code: "+41",  name: "Svizzera",       flag: "🇨🇭", example: "78 123 4567" },
  { code: "+33",  name: "Francia",        flag: "🇫🇷", example: "6 12 34 56 78" },
  { code: "+34",  name: "Spagna",         flag: "🇪🇸", example: "612 34 56 78" },
  { code: "+49",  name: "Germania",       flag: "🇩🇪", example: "151 12345678" },
  { code: "+44",  name: "Regno Unito",    flag: "🇬🇧", example: "7400 123456" },
  { code: "+43",  name: "Austria",        flag: "🇦🇹", example: "664 1234567" },
  { code: "+386", name: "Slovenia",       flag: "🇸🇮", example: "31 234 567" },
  { code: "+385", name: "Croazia",        flag: "🇭🇷", example: "91 234 5678" },
  { code: "+356", name: "Malta",          flag: "🇲🇹", example: "7900 1234" },
  { code: "+30",  name: "Grecia",         flag: "🇬🇷", example: "694 123 4567" },
  { code: "+377", name: "Monaco",         flag: "🇲🇨", example: "12 34 56 78" },
  { code: "+378", name: "San Marino",     flag: "🇸🇲", example: "612 345" },
  { code: "+212", name: "Marocco",        flag: "🇲🇦", example: "612 345 678" },
  { code: "+216", name: "Tunisia",        flag: "🇹🇳", example: "20 123 456" },
  { code: "+1",   name: "USA/Canada",     flag: "🇺🇸", example: "201 555 0123" },
];

// ── Helper: separa prefisso dal numero locale ────────────────────────────
function parseE164(value: string): { prefix: string; local: string } {
  if (!value) return { prefix: "+39", local: "" };
  // Trova il prefisso più lungo che matcha tra quelli noti
  const cleaned = value.replace(/[\s\-()]/g, "");
  const sorted = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length);
  for (const c of sorted) {
    if (cleaned.startsWith(c.code)) {
      return { prefix: c.code, local: cleaned.substring(c.code.length) };
    }
  }
  // Nessun match → assume +39 (legacy)
  if (cleaned.startsWith("+")) {
    // Prefisso sconosciuto, ma è già internazionale: mostralo come +39 con tutto nel local
    return { prefix: "+39", local: cleaned };
  }
  return { prefix: "+39", local: cleaned };
}

// ── Helper: format E.164 finale ─────────────────────────────────────────
function toE164(prefix: string, local: string): string {
  const cleanLocal = local.replace(/[\s\-()]/g, "").replace(/^0+/, "");  // rimuovi zeri iniziali (legacy IT)
  if (!cleanLocal) return "";
  return `${prefix}${cleanLocal}`;
}

// ── Helper: validazione minima ──────────────────────────────────────────
function isValidE164(value: string): boolean {
  if (!value) return true; // vuoto = ok (campo opzionale)
  // E.164: + seguito da 7-15 cifre
  return /^\+\d{7,15}$/.test(value);
}

type Props = {
  value: string;                  // Valore E.164 (o stringa libera legacy)
  onChange: (e164: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Mostra messaggio di validazione se il numero non è ben formato */
  showValidation?: boolean;
  /** Stile del wrapper input */
  inputStyle?: React.CSSProperties;
};

export default function PhoneInput({
  value,
  onChange,
  placeholder,
  required,
  disabled,
  showValidation = true,
  inputStyle,
}: Props) {
  const parsed = useMemo(() => parseE164(value), [value]);
  const [prefix, setPrefix] = useState(parsed.prefix);
  const [local, setLocal] = useState(parsed.local);

  // Sync interno con value esterno (se il parent lo cambia)
  useEffect(() => {
    const p = parseE164(value);
    setPrefix(p.prefix);
    setLocal(p.local);
  }, [value]);

  // Quando uno dei due cambia, costruisce E.164 e propaga
  const propagate = (newPrefix: string, newLocal: string) => {
    const e164 = toE164(newPrefix, newLocal);
    onChange(e164);
  };

  const handlePrefixChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPrefix = e.target.value;
    setPrefix(newPrefix);
    propagate(newPrefix, local);
  };

  const handleLocalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Pulisce subito caratteri non-numerici (a parte spazi e trattini visivi)
    const raw = e.target.value.replace(/[^\d\s\-]/g, "");
    setLocal(raw);
    propagate(prefix, raw);
  };

  const currentCountry = COUNTRIES.find(c => c.code === prefix) ?? COUNTRIES[0];
  const fullE164 = toE164(prefix, local);
  const isValid = isValidE164(fullE164);
  const showError = showValidation && !!local && !isValid;

  const baseInputStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${showError ? "#ef4444" : "#cbd5e1"}`,
    fontSize: 14,
    color: "#0f172a",
    fontWeight: 600,
    outline: "none",
    background: "#fff",
    ...inputStyle,
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6 }}>
        <select
          value={prefix}
          onChange={handlePrefixChange}
          disabled={disabled}
          style={{
            ...baseInputStyle,
            width: 110,
            flexShrink: 0,
            paddingLeft: 10,
            paddingRight: 6,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
          aria-label="Prefisso paese"
        >
          {COUNTRIES.map(c => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.code}
            </option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="tel"
          value={local}
          onChange={handleLocalChange}
          placeholder={placeholder ?? currentCountry.example ?? "Numero"}
          required={required}
          disabled={disabled}
          style={{
            ...baseInputStyle,
            flex: 1,
            minWidth: 0,
          }}
          aria-label="Numero di telefono"
        />
      </div>
      {showError && (
        <div style={{
          fontSize: 11, fontWeight: 600,
          color: "#dc2626", marginTop: 4, lineHeight: 1.3,
        }}>
          Numero non valido. Inserisci 7-15 cifre.
        </div>
      )}
      {!showError && local && isValid && (
        <div style={{
          fontSize: 10, fontWeight: 500,
          color: "#64748b", marginTop: 4, lineHeight: 1.3,
        }}>
          Salvato come: <code style={{ background: "#f1f5f9", padding: "1px 4px", borderRadius: 3 }}>{fullE164}</code>
        </div>
      )}
    </div>
  );
}

// Export helpers per chi vuole validare altrove
export { isValidE164, parseE164, toE164 };
