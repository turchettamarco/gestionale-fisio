// ═══════════════════════════════════════════════════════════════════════════
// FISIOHUB — DESIGN TOKENS (Restyling mobile, Direzione A)
//
// Unica fonte di verità per il tema mobile: base warm cream dal brand kit
// (#FAF7F2), grigi caldi al posto degli slate freddi, gradiente teal→blu
// SOLO su header, FAB, azioni primarie e barre di avanzamento.
//
// R1 adotta questi token su MobileTabBar e Home. Le altre pagine mobile
// migrano tappa per tappa sostituendo il proprio `const THEME` locale con:
//   import { MOBILE_THEME as THEME } from "@/src/theme/tokens";
// Le chiavi sono un SOVRAINSIEME di quelle usate dai THEME locali, quindi
// lo swap non richiede modifiche a valle.
// ═══════════════════════════════════════════════════════════════════════════

export const COLORS = {
  // Superfici (warm)
  cream:       "#FAF7F2",  // sfondo app (dal brand kit)
  surface:     "#FFFFFF",  // card
  surfaceSoft: "#FFFDF9",  // superfici secondarie, tab bar

  // Filetti
  line:        "#EDE6D8",  // hairline di default
  lineStrong:  "#E0D8C8",  // bordi input/bottoni secondari
  lineFaint:   "#F3EEE3",  // divisori interni alle card

  // Testo (scala calda)
  ink:         "#1A1D24",  // titoli, valori
  inkSoft:     "#3A3E46",  // testo secondario scuro
  warm600:     "#6B6455",  // testo di supporto
  warm500:     "#8A8377",  // didascalie
  warm400:     "#A9A092",  // placeholder, icone inattive

  // Brand
  teal:        "#0d9488",
  tealDeep:    "#085041",
  tealTint:    "#E1F5EE",
  blue:        "#2563eb",
  blueDeep:    "#1e40af",
  blueTint:    "#E8F0FD",

  // Semantici
  green:       "#16a34a",  // WhatsApp / successo
  greenTint:   "#E9F7EE",
  amber:       "#B45309",  // in sospeso / da saldare
  amberTint:   "#FAEEDA",
  red:         "#C0392B",  // errori / non pagato
  redTint:     "#FBEAE7",
  purpleTint:  "#EFE9FB",  // gruppi
  purpleDeep:  "#5B3FA8",

  gradient:    "linear-gradient(135deg,#0d9488,#2563eb)",
} as const;

export const RADII = {
  card: 14,
  control: 12,
  chip: 10,
  pill: 99,
  phoneAction: 10,
} as const;

export const SHADOWS = {
  card: "0 1px 4px rgba(26,29,36,0.06)",
  fab: "0 4px 16px rgba(13,148,136,0.35)",
  sheet: "0 -8px 30px rgba(26,29,36,0.14)",
  menu: "0 12px 32px rgba(26,29,36,0.15)",
} as const;

// ─────────────────────────────────────────────────────────────────────
// MOBILE_THEME — drop-in per i `const THEME` locali delle pagine mobile.
// Mantiene le chiavi storiche (appBg, panelBg, muted, gray…) mappate
// sulla nuova palette, più le chiavi nuove della Direzione A.
// ─────────────────────────────────────────────────────────────────────
export const MOBILE_THEME = {
  // Chiavi storiche (compatibilità con i THEME locali esistenti)
  appBg:     COLORS.cream,
  panelBg:   COLORS.surface,
  panelSoft: COLORS.surfaceSoft,
  text:      COLORS.ink,
  textSoft:  COLORS.inkSoft,
  muted:     COLORS.warm600,
  border:    COLORS.lineStrong,
  blue:      COLORS.blue,
  blueDark:  COLORS.blueDeep,
  green:     COLORS.green,
  red:       COLORS.red,
  amber:     COLORS.amber,
  gray:      COLORS.warm400,
  teal:      COLORS.teal,
  gradient:  COLORS.gradient,

  // Chiavi nuove (Direzione A)
  line:       COLORS.line,
  lineFaint:  COLORS.lineFaint,
  ink:        COLORS.ink,
  warm500:    COLORS.warm500,
  warm400:    COLORS.warm400,
  tealDeep:   COLORS.tealDeep,
  tealTint:   COLORS.tealTint,
  blueTint:   COLORS.blueTint,
  amberTint:  COLORS.amberTint,
  greenTint:  COLORS.greenTint,
  redTint:    COLORS.redTint,
  purpleTint: COLORS.purpleTint,
  purpleDeep: COLORS.purpleDeep,
} as const;

export type MobileTheme = typeof MOBILE_THEME;
