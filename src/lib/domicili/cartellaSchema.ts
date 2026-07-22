// ═══════════════════════════════════════════════════════════════════════
// src/lib/domicili/cartellaSchema.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Cartella di valutazione — Cooperativa Santa Lucia Life.
// Schema dichiarativo delle scale (ADL, IADL, MMSE, Tinetti) con i
// punteggi ESATTAMENTE come stampati sul modulo cartaceo.
//
// ATTENZIONE — tre punti del modulo cartaceo ingannano:
//   • T8  "Girarsi a 360°" elenca 4 righe che sono DUE valutazioni
//     distinte (passi discontinui/continui + instabile/stabile): max 2.
//   • T11 e T12 "Lunghezza ed altezza del passo" idem: superamento del
//     piede controlaterale + sollevamento dal pavimento, max 2 ciascuna.
// Trattandole come domanda singola i totali darebbero 13/16 e 9/12
// invece dei 16/12 dichiarati in fondo al modulo. Qui sono spezzate.
//
// Il testo delle opzioni è riportato fedele al cartaceo, refusi inclusi
// (es. "SPOTARSI", T2 "È capace senza aiuto" con valore 0): la cartella
// digitale deve restare sovrapponibile a quella firmata su carta.
// ═══════════════════════════════════════════════════════════════════════

export type ScaleOption = { label: string; value: number };
export type ScaleItem = {
  /** Chiave stabile: finisce nel JSONB, non cambiarla mai. */
  key: string;
  title: string;
  /** Nota esplicativa sotto il titolo (opzionale). */
  hint?: string;
  options: ScaleOption[];
};
export type ScaleBlock = {
  key: string;
  title: string;
  subtitle?: string;
  max: number;
  items: ScaleItem[];
};

// ─── ADL (Activity of Daily Living) — max 6 ──────────────────────────
export const ADL: ScaleBlock = {
  key: "adl",
  title: "ADL — Activity of Daily Living",
  subtitle: "0 = completa dipendenza · 6 = indipendenza in tutte le funzioni",
  max: 6,
  items: [
    {
      key: "adl_a",
      title: "A. Fare il bagno",
      hint: "vasca, doccia, spugnature",
      options: [
        { label: "Fa il bagno da solo (entra ed esce dalla vasca da solo)", value: 1 },
        { label: "Ha bisogno di assistenza soltanto nella pulizia di una parte del corpo (es. dorso)", value: 1 },
        { label: "Ha bisogno di assistenza in una o più parti del corpo", value: 0 },
      ],
    },
    {
      key: "adl_b",
      title: "B. Vestirsi",
      hint: "prendere i vestiti da armadio e cassetti, inclusa biancheria intima, uso delle allacciature e delle bretelle",
      options: [
        { label: "Prende i vestiti e si veste completamente senza bisogno di assistenza", value: 1 },
        { label: "Prende i vestiti e si veste senza bisogno di assistenza eccetto che per allacciare le scarpe", value: 1 },
        { label: "Ha bisogno di assistenza nel prendere i vestiti o nel vestirsi, oppure rimane parzialmente o completamente svestito", value: 0 },
      ],
    },
    {
      key: "adl_c",
      title: "C. Toilette",
      hint: "andare nella stanza da bagno per la minzione e l'evacuazione, pulirsi, rivestirsi",
      options: [
        { label: "Va in bagno, si pulisce e si riveste senza bisogno di assistenza (può usare bastone, deambulatore o sedia a rotelle, vaso da notte o comoda svuotandoli al mattino)", value: 1 },
        { label: "Ha bisogno di assistenza nell'andare in bagno o nel pulirsi o nel rivestirsi o nell'uso del vaso da notte o della comoda", value: 0 },
        { label: "Non si reca in bagno per l'evacuazione", value: 0 },
      ],
    },
    {
      key: "adl_d",
      title: "D. Spostarsi",
      options: [
        { label: "Si sposta dentro e fuori dal letto e in poltrona senza assistenza (eventualmente con canadesi o deambulatore)", value: 1 },
        { label: "Compie questi trasferimenti se aiutato", value: 0 },
        { label: "Allettato, non esce dal letto", value: 0 },
      ],
    },
    {
      key: "adl_e",
      title: "E. Continenza feci e urine",
      options: [
        { label: "Controlla completamente feci ed urine", value: 1 },
        { label: "«Incidenti» occasionali", value: 0 },
        { label: "Necessita di supervisione per il controllo di feci ed urine, usa il catetere, è incontinente", value: 0 },
      ],
    },
    {
      key: "adl_f",
      title: "F. Alimentazione",
      options: [
        { label: "Senza assistenza", value: 1 },
        { label: "Assistenza solo per tagliare la carne o imburrare il pane", value: 1 },
        { label: "Richiede assistenza per portare il cibo alla bocca o viene nutrito parzialmente o completamente per via parenterale", value: 0 },
      ],
    },
  ],
};

// ─── IADL (Instrumental ADL) — max 8 ─────────────────────────────────
export const IADL: ScaleBlock = {
  key: "iadl",
  title: "IADL — Instrumental Activity of Daily Living",
  subtitle: "0 = completa dipendenza · 8 = indipendenza in tutte le funzioni",
  max: 8,
  items: [
    {
      key: "iadl_a",
      title: "A. Usare il telefono",
      options: [
        { label: "Usa il telefono di sua iniziativa: cerca e compone il numero", value: 1 },
        { label: "Compone solo alcuni numeri ben conosciuti", value: 1 },
        { label: "È in grado di rispondere al telefono ma non compone i numeri", value: 1 },
        { label: "Non è capace di usare il telefono", value: 0 },
      ],
    },
    {
      key: "iadl_b",
      title: "B. Fare la spesa",
      options: [
        { label: "Si prende autonomamente cura di tutte le necessità di acquisti nei negozi", value: 1 },
        { label: "È in grado di effettuare piccoli acquisti nei negozi", value: 0 },
        { label: "Necessita di essere accompagnato per qualsiasi acquisto", value: 0 },
        { label: "È del tutto incapace di fare acquisti nei negozi", value: 0 },
      ],
    },
    {
      key: "iadl_c",
      title: "C. Preparare il cibo",
      options: [
        { label: "Organizza, prepara e serve pasti adeguatamente preparati", value: 1 },
        { label: "Prepara pasti adeguati solo se sono procurati gli ingredienti", value: 0 },
        { label: "Scalda pasti preparati o prepara cibi ma non mantiene una dieta adeguata", value: 0 },
        { label: "Ha bisogno di avere cibi preparati e serviti", value: 0 },
      ],
    },
    {
      key: "iadl_d",
      title: "D. Governo della casa",
      options: [
        { label: "Mantiene la casa da solo/a o con occasionale aiuto", value: 1 },
        { label: "Esegue solo compiti quotidiani leggeri ma il livello di pulizia non è sufficiente", value: 1 },
        { label: "Ha bisogno di aiuto in ogni operazione di governo della casa", value: 0 },
        { label: "Non partecipa a nessuna operazione di governo della casa", value: 0 },
      ],
    },
    {
      key: "iadl_e",
      title: "E. Fare il bucato",
      options: [
        { label: "Fa il bucato personalmente e completamente", value: 1 },
        { label: "Lava le piccole cose (calze, fazzoletti ecc.)", value: 1 },
        { label: "Tutta la biancheria deve essere lavata da altri", value: 0 },
      ],
    },
    {
      key: "iadl_f",
      title: "F. Mezzi di trasporto",
      options: [
        { label: "Si sposta da solo su mezzi pubblici o guida la propria auto", value: 1 },
        { label: "Si sposta in taxi ma non usa mezzi di trasporto pubblici", value: 1 },
        { label: "Usa i mezzi di trasporto se assistito o accompagnato", value: 1 },
        { label: "Può spostarsi solo con taxi o auto e solo con assistenza", value: 0 },
        { label: "Non si sposta per niente", value: 0 },
      ],
    },
    {
      key: "iadl_g",
      title: "G. Assunzione farmaci",
      options: [
        { label: "Prende le medicine che gli/le sono state prescritte", value: 1 },
        { label: "Prende le medicine se sono state preparate in dosi separate", value: 0 },
        { label: "Non è in grado di prendere medicine da solo/a", value: 0 },
      ],
    },
    {
      key: "iadl_h",
      title: "H. Uso del denaro",
      options: [
        { label: "Maneggia le proprie finanze in modo indipendente", value: 1 },
        { label: "È in grado di fare piccoli acquisti", value: 1 },
        { label: "È incapace di maneggiare i soldi", value: 0 },
      ],
    },
  ],
};

// ─── MMSE — max 30 ───────────────────────────────────────────────────
// Voci a punteggio diretto (slider/pulsantiera 0..max).
export type MmseItem = { key: string; title: string; hint?: string; max: number };

export const MMSE_ITEMS: MmseItem[] = [
  { key: "mmse_orient_t", title: "1a. Orientamento temporale", hint: "giorno del mese, anno, mese, giorno della settimana, stagione", max: 5 },
  { key: "mmse_orient_s", title: "1b. Orientamento spaziale", hint: "luogo in cui si trova, piano, città, regione, stato", max: 5 },
  { key: "mmse_memoria", title: "2. Memoria — registrazione", hint: "ripetizione immediata di casa, pane, gatto", max: 3 },
  { key: "mmse_attenzione", title: "3. Attenzione e calcolo", hint: "contare per 7 all'indietro da 100 (5 risposte), oppure «MONDO» al contrario", max: 5 },
  { key: "mmse_richiamo", title: "4. Richiamo delle tre parole", max: 3 },
  { key: "mmse_denominaz", title: "5a. Linguaggio — denominazione", hint: "matita e orologio", max: 2 },
  { key: "mmse_ripetiz", title: "5b. Linguaggio — ripetizione", hint: "«TIGRE CONTRO TIGRE»", max: 1 },
  { key: "mmse_comando", title: "6a. Esecuzione di un compito su comando", hint: "prenda il foglio con la mano destra, lo pieghi a metà, lo butti dal tavolo", max: 3 },
  { key: "mmse_lettura", title: "6b. Lettura ed esecuzione", hint: "«Chiuda gli occhi»", max: 1 },
  { key: "mmse_scrittura", title: "6c. Scrittura di una frase", hint: "almeno soggetto e verbo", max: 1 },
  { key: "mmse_copia", title: "6d. Copia del disegno", hint: "i due pentagoni intersecati", max: 1 },
];

export const MMSE_MAX = MMSE_ITEMS.reduce((s, i) => s + i.max, 0); // 30

// ─── Tinetti — equilibrio 16 + andatura 12 = 28 ──────────────────────
export const TINETTI_EQ: ScaleBlock = {
  key: "tinetti_eq",
  title: "Equilibrio",
  max: 16,
  items: [
    {
      key: "t1", title: "T1. Equilibrio da seduto",
      options: [
        { label: "Si inclina, scivola dalla sedia", value: 0 },
        { label: "È stabile e sicuro", value: 1 },
      ],
    },
    {
      key: "t2", title: "T2. Alzarsi dalla sedia",
      options: [
        { label: "È capace senza aiuto", value: 0 },
        { label: "Deve aiutarsi con le braccia", value: 1 },
        { label: "Si alza senza aiutarsi con le braccia", value: 2 },
      ],
    },
    {
      key: "t3", title: "T3. Tentativo di alzarsi",
      options: [
        { label: "È incapace senza aiuto", value: 0 },
        { label: "Capace ma richiede più di un tentativo", value: 1 },
        { label: "Capace al primo tentativo", value: 2 },
      ],
    },
    {
      key: "t4", title: "T4. Equilibrio nella stazione eretta (primi 5 secondi)",
      options: [
        { label: "Instabile (vacilla, muove i piedi, marcata oscillazione del tronco)", value: 0 },
        { label: "Stabile grazie all'uso di bastone o altri ausili", value: 1 },
        { label: "Stabile senza ausili", value: 2 },
      ],
    },
    {
      key: "t5", title: "T5. Equilibrio nella stazione eretta prolungata",
      options: [
        { label: "Instabile (vacilla, muove i piedi, marcata oscillazione del tronco)", value: 0 },
        { label: "Stabile ma a base larga (malleoli mediali distano più di 10 cm tra loro)", value: 1 },
        { label: "Stabile a base stretta senza supporti", value: 2 },
      ],
    },
    {
      key: "t6", title: "T6. Romberg",
      options: [
        { label: "Instabile", value: 0 },
        { label: "Stabile", value: 1 },
      ],
    },
    {
      key: "t7", title: "T7. Romberg sensibilizzato",
      options: [
        { label: "Comincia a cadere", value: 0 },
        { label: "Oscilla ma si riprende da solo", value: 1 },
        { label: "Stabile", value: 2 },
      ],
    },
    // T8 = due valutazioni distinte sul cartaceo (vedi nota in testa al file)
    {
      key: "t8a", title: "T8. Girarsi a 360° — passi",
      options: [
        { label: "A passi discontinui", value: 0 },
        { label: "A passi continui", value: 1 },
      ],
    },
    {
      key: "t8b", title: "T8. Girarsi a 360° — stabilità",
      options: [
        { label: "Instabile", value: 0 },
        { label: "Stabile", value: 1 },
      ],
    },
    {
      key: "t9", title: "T9. Sedersi",
      options: [
        { label: "Insicuro (sbaglia la distanza, cade sulla sedia)", value: 0 },
        { label: "Usa le braccia o ha un movimento discontinuo", value: 1 },
        { label: "Sicuro, movimento continuo", value: 2 },
      ],
    },
  ],
};

export const TINETTI_AND: ScaleBlock = {
  key: "tinetti_and",
  title: "Andatura",
  max: 12,
  items: [
    {
      key: "t10", title: "T10. Inizio della deambulazione",
      options: [
        { label: "Una certa esitazione o più tentativi", value: 0 },
        { label: "Nessuna esitazione", value: 1 },
      ],
    },
    {
      key: "t11a", title: "T11. Passo destro — lunghezza",
      options: [
        { label: "Il piede dx non supera il piede sx", value: 0 },
        { label: "Il piede dx supera il piede sx", value: 1 },
      ],
    },
    {
      key: "t11b", title: "T11. Passo destro — altezza",
      options: [
        { label: "Il piede dx non si alza completamente dal pavimento", value: 0 },
        { label: "Il piede dx si alza completamente dal pavimento", value: 1 },
      ],
    },
    {
      key: "t12a", title: "T12. Passo sinistro — lunghezza",
      options: [
        { label: "Il piede sx non supera il piede dx", value: 0 },
        { label: "Il piede sx supera il piede dx", value: 1 },
      ],
    },
    {
      key: "t12b", title: "T12. Passo sinistro — altezza",
      options: [
        { label: "Il piede sx non si alza completamente dal pavimento", value: 0 },
        { label: "Il piede sx si alza completamente dal pavimento", value: 1 },
      ],
    },
    {
      key: "t13", title: "T13. Simmetria del passo",
      options: [
        { label: "Il passo dx e sx non sembrano uguali", value: 0 },
        { label: "Il passo dx e sx sembrano uguali", value: 1 },
      ],
    },
    {
      key: "t14", title: "T14. Continuità del passo",
      options: [
        { label: "Interrotto o discontinuo", value: 0 },
        { label: "Continuo", value: 1 },
      ],
    },
    {
      key: "t15", title: "T15. Traiettoria",
      options: [
        { label: "Deviazione marcata", value: 0 },
        { label: "Deviazione lieve o moderata o uso di ausili", value: 1 },
        { label: "Assenza di deviazione e di uso di ausili", value: 2 },
      ],
    },
    {
      key: "t16", title: "T16. Tronco",
      options: [
        { label: "Marcata oscillazione o uso di ausili", value: 0 },
        { label: "Flessione ginocchia o schiena, allargamento delle braccia", value: 1 },
        { label: "Nessuna oscillazione, flessione o uso delle braccia o ausili", value: 2 },
      ],
    },
    {
      key: "t17", title: "T17. Cammino",
      options: [
        { label: "I talloni sono separati", value: 0 },
        { label: "I talloni quasi si toccano durante il cammino", value: 1 },
      ],
    },
  ],
};

// ─── Calcolo ─────────────────────────────────────────────────────────

export type Risposte = Record<string, number | undefined>;

/** Somma le voci di un blocco. Le voci non compilate valgono 0. */
export function scoreBlock(block: ScaleBlock, r: Risposte): number {
  return block.items.reduce((sum, it) => sum + (r[it.key] ?? 0), 0);
}

/** Quante voci del blocco sono ancora da compilare. */
export function missingCount(block: ScaleBlock, r: Risposte): number {
  return block.items.filter(it => r[it.key] === undefined).length;
}

export function scoreMmse(r: Risposte): number {
  return MMSE_ITEMS.reduce((sum, it) => sum + (r[it.key] ?? 0), 0);
}

export function mmseMissing(r: Risposte): number {
  return MMSE_ITEMS.filter(it => r[it.key] === undefined).length;
}

/** Fascia di rischio di caduta sul totale Tinetti (equilibrio + andatura). */
export function tinettiRischio(tot: number): { label: string; color: string } {
  if (tot <= 18) return { label: "Alto", color: "#dc2626" };
  if (tot <= 24) return { label: "Medio", color: "#b45309" };
  return { label: "Basso", color: "#16a34a" };
}

/** Lettura sintetica ADL/IADL, con la legenda del modulo cartaceo. */
export function autonomiaLabel(score: number, max: number): string {
  if (score === 0) return "Completa dipendenza";
  if (score === max) return "Indipendenza in tutte le funzioni";
  if (score <= max / 2) return "Dipendenza marcata";
  return "Dipendenza parziale";
}

/** Interpretazione MMSE sul punteggio grezzo (soglie d'uso comune). */
export function mmseLabel(score: number): { label: string; color: string } {
  if (score >= 24) return { label: "Nella norma", color: "#16a34a" };
  if (score >= 18) return { label: "Deterioramento lieve", color: "#b45309" };
  if (score >= 10) return { label: "Deterioramento moderato", color: "#dc2626" };
  return { label: "Deterioramento severo", color: "#dc2626" };
}
