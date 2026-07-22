// ═══════════════════════════════════════════════════════════════════════
// src/lib/domicili/cartellaCoords.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Coordinate dei campi sul modulo originale della Cooperativa Santa Lucia
// Life (public/cartella-santa-lucia.pdf, 14 pagine A4 595.32 x 841.92 pt).
//
// GENERATO dall'analisi del PDF stesso, non trascritto a mano: le posizioni
// dei puntini, delle opzioni e delle parentesi MMSE sono state estratte dal
// documento. Se la cooperativa cambia il modulo, il file va rigenerato.
//
// Sistema di riferimento: `top` è la distanza dal BORDO SUPERIORE (come la
// legge un PDF parser); pdf-lib disegna invece da quello inferiore, quindi
// in fase di stampa si converte con y = ALTEZZA - top - offset.
// ═══════════════════════════════════════════════════════════════════════

export const PAGINA = {
  consenso: 2,        // p3  — consenso informato
  consensiGdpr: 4,    // p5  — consensi n° 1/2/3
  responsabilita: 6,  // p7  — dichiarazione di responsabilità
  adlIadl: 8,         // p9  — ADL e IADL
  mmse: 10,           // p11 — Mini-Mental
  tinetti: 12,        // p13 — Tinetti
} as const;

export const ALTEZZA = 841.92;
export const LARGHEZZA = 595.32;

/** Campi a puntini: [x di partenza, top, larghezza utile]. */
export const CAMPI_CONSENSO = {
  trattamentoTitolo: [269.6, 53.0, 139.6],
  sottoscritto:      [126.1, 181.7, 418.3],
  natoIl:            [82.3, 198.6, 62.9],
  luogo:             [188.1, 198.6, 134.2],
  cf:                [340.3, 198.6, 205.9],
  residente:         [94.0, 215.4, 446.3],
  tutore:            [151.7, 232.3, 248.8],
  tutoreNatoIl:      [440.8, 232.3, 102.4],
  tutoreCf:          [51.1, 249.1, 219.8],
  tutoreTel:         [291.2, 249.1, 245.4],
  operatoreNome:     [209.8, 413.4, 212.9],
  operatoreQualifica:[117.3, 430.4, 148.9],
  trattamentoFinale: [316.2, 615.7, 196.2],
} as const;

/** Righe di firma su p3: [x0, x1, top della riga]. */
export const FIRME_CONSENSO = {
  operatore: [36.0, 197.4, 741.2],
  paziente:  [319.2, 510.0, 741.2],
  data:      [70.0, 780.0],
} as const;

/** Riquadri di consenso su p5: [x nome, x firma, top, bottom]. */
export const CONSENSI_GDPR = {
  n1:            [51.2, 293.1, 268.3, 313.2],
  n2Tutore:      [51.2, 293.1, 485.9, 530.7],
  n2SecondoGen:  [51.2, 293.1, 530.7, 575.6],
  n3:            [51.2, 293.1, 695.6, 740.5],
} as const;

/** Campi della dichiarazione di responsabilità (p7). */
export const CAMPI_RESPONSABILITA = {
  attivazionePai: [342.3, 186.6, 35.8],
  assistito:      [100.3, 236.3, 262.8],
  assistitoNatoIl:[455.0, 236.3, 35.8],
  sottoscritto:   [124.5, 286.0, 292.8],
  luogoNascita:   [301.3, 316.0, 101.6],
  dataNascita:    [458.9, 316.0, 35.8],
  data:           [127.4, 582.2, 35.8],
  firma:          [347.5, 607.1, 191.1],
} as const;

/** Intestazioni delle pagine scale: [x, top, larghezza]. */
export const INTESTAZIONI = {
  adlIadl: {
    nome:    [83.8, 39.5, 164.6],
    cognome: [293.5, 39.5, 169.7],
    nascita: [122.5, 58.8, 90.7],
    valutaz: [302.4, 58.8, 90.7],
  },
  mmse: {
    nome:    [103.4, 57.7, 153.3],
    cognome: [304.5, 57.7, 153.4],
    nascita: [139.3, 86.7, 96.2],
    valutaz: [327.2, 86.7, 96.0],
  },
  tinetti: {
    nome:    [86.4, 60.2, 164.3],
    cognome: [298.4, 60.2, 169.8],
    nascita: [124.6, 87.1, 90.7],
    valutaz: [306.3, 87.1, 90.7],
  },
} as const;

/** Totali da stampare: [x, top]. */
export const TOTALI = {
  adl:        [246.0, 684.5],
  iadl:       [533.0, 812.8],
  mmseGrezzo: [534.7, 753.6],
  mmseAggiust:[534.3, 775.9],
  tinettiEq:  [456.0, 669.0],
  tinettiAnd: [456.6, 696.8],
} as const;

/** Righe della tabella rischio cadute su p13: [top, x sinistra, x destra]. */
export const RISCHIO_TINETTI = {
  alto:  [763.2, 200.0, 420.0],
  medio: [778.6, 200.0, 420.0],
  basso: [794.0, 200.0, 420.0],
} as const;

// ─── Opzioni delle scale, in ordine di documento ──────────────────────
// Ogni voce: [top della riga, x di inizio del testo]. L'ordine coincide
// con quello dello schema in cartellaSchema.ts (verificato sui conteggi:
// ADL 18, IADL 30, Tinetti equilibrio 26, andatura 22).

export const OPZIONI_ADL: ReadonlyArray<readonly [number, number]> = [[109.0, 18.6], [123.0, 18.6], [150.0, 18.6], [205.0, 18.6], [232.0, 18.6], [260.0, 18.6], [328.0, 18.6], [382.0, 18.6], [423.0, 18.6], [451.0, 18.6], [491.0, 18.6], [505.0, 18.6], [533.0, 18.6], [547.0, 18.6], [561.0, 18.6], [602.0, 18.6], [616.0, 18.6], [644.0, 18.6]];

export const OPZIONI_IADL: ReadonlyArray<readonly [number, number]> = [[109.0, 305.5], [137.0, 305.5], [151.0, 305.5], [178.0, 305.5], [206.0, 305.5], [233.0, 305.5], [247.0, 305.5], [274.0, 305.5], [302.0, 305.5], [330.0, 305.5], [357.0, 305.5], [384.0, 305.5], [412.0, 305.5], [426.0, 305.5], [454.0, 305.5], [481.0, 305.5], [522.0, 305.5], [536.0, 305.5], [550.0, 305.5], [578.0, 305.5], [605.0, 305.5], [633.0, 305.5], [647.0, 305.5], [674.0, 305.5], [702.0, 305.5], [716.0, 305.5], [743.0, 305.5], [771.0, 305.5], [785.0, 305.5], [799.0, 305.5]];

export const OPZIONI_TINETTI_EQ: ReadonlyArray<readonly [number, number]> = [[144.0, 47.9], [158.0, 47.9], [185.0, 47.9], [199.0, 47.9], [213.0, 47.9], [255.0, 47.9], [268.0, 47.9], [283.0, 47.9], [324.0, 47.9], [351.0, 47.9], [365.0, 47.9], [406.0, 47.9], [434.0, 47.9], [461.0, 47.9], [489.0, 47.9], [503.0, 47.9], [531.0, 47.9], [545.0, 47.9], [559.0, 47.9], [613.0, 47.9], [627.0, 47.9], [641.0, 47.9], [655.0, 47.9], [683.0, 47.9], [697.0, 47.9], [711.0, 47.9]];

export const OPZIONI_TINETTI_AND: ReadonlyArray<readonly [number, number]> = [[144.0, 306.7], [158.0, 306.7], [185.0, 306.7], [199.0, 306.7], [213.0, 306.7], [241.0, 306.7], [268.0, 306.7], [283.0, 306.7], [296.0, 306.7], [324.0, 306.7], [365.0, 306.7], [379.0, 306.7], [434.0, 306.7], [461.0, 306.7], [489.0, 306.7], [503.0, 306.7], [517.0, 306.7], [545.0, 306.7], [559.0, 306.7], [586.0, 306.7], [627.0, 306.7], [641.0, 306.7]];

/** MMSE: per ogni voce, il top della riga e le parentesi [x0, x1] da 0 a max. */
export const PARENTESI_MMSE: ReadonlyArray<readonly [number, ReadonlyArray<readonly [number, number]>]> = [
  [138.0, [[464.9, 477.2], [479.5, 491.9], [494.3, 506.5], [508.9, 521.0], [523.4, 535.8], [538.3, 550.7]]],
  [162.0, [[426.6, 439.0], [441.3, 453.7], [456.1, 468.4], [470.7, 483.0], [485.4, 497.6], [500.1, 512.5]]],
  [229.0, [[510.8, 523.2], [525.6, 538.0], [540.2, 552.6], [554.9, 567.3]]],
  [349.0, [[441.0, 453.4], [455.9, 468.2], [468.3, 480.7], [483.0, 495.4], [497.7, 510.0], [512.4, 524.6]]],
  [394.0, [[274.6, 287.0], [289.5, 301.9], [304.3, 316.5], [319.0, 331.3]]],
  [470.0, [[474.4, 486.7], [489.2, 501.6], [503.9, 516.2]]],
  [494.0, [[318.7, 331.0], [333.5, 345.8]]],
  [623.0, [[137.4, 149.8], [152.1, 164.3], [166.7, 179.1], [181.0, 193.4]]],
  [678.0, [[281.6, 293.9], [296.4, 308.7]]],
  [698.0, [[351.2, 363.4], [365.8, 378.2]]],
  [718.0, [[230.3, 242.7], [245.4, 257.7]]]
];
