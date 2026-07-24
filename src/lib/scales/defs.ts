// ═══════════════════════════════════════════════════════════════════════
// src/lib/scales/defs.ts
// ═══════════════════════════════════════════════════════════════════════
// Definizioni condivise delle scale di valutazione: usate dalla UI del
// fisioterapista (ScalesSection), dalla pagina pubblica di compilazione
// e dall'API (calcolo punteggio server-side).
//
// Gli item sono formulazioni descrittive a uso clinico interno, non le
// versioni testuali ufficiali degli strumenti.
// ═══════════════════════════════════════════════════════════════════════

export type ScaleQuestion = {
  label: string;
  max: number;            // valore massimo (min sempre 0)
  minLabel?: string;      // ancora sinistra (es. "Nessun dolore")
  maxLabel?: string;      // ancora destra
  invert?: boolean;       // true = punteggio alto è MIGLIORE (es. LEFS, PSFS)
};

export type Interpretation = { text: string; color: string };

export type ScaleDef = {
  id: string;
  name: string;
  full: string;
  area: string;
  icon: string;
  maxScore: number;
  higherIsBetter: boolean;     // direzione del punteggio (per grafico e delta)
  mcid?: number;               // Minimal Clinically Important Difference (punti)
  psfs?: boolean;              // scala paziente-specifica (attività custom)
  questions: ScaleQuestion[];
  interpret: (score: number) => Interpretation;
};

const C = { green: "#16a34a", teal: "#0d9488", amber: "#d97706", red: "#dc2626" };

const sev = (q: string, max = 5): ScaleQuestion => ({
  label: q, max, minLabel: "Nessuna difficoltà", maxLabel: "Impossibile / massima",
});

export const SCALES: ScaleDef[] = [
  {
    id: "VAS", name: "VAS", full: "Scala visuo-analogica del dolore", area: "Dolore",
    icon: "🌡️", maxScore: 10, higherIsBetter: false, mcid: 2,
    questions: [{
      label: "Quanto è intenso il tuo dolore in questo momento?",
      max: 10, minLabel: "Nessun dolore", maxLabel: "Peggior dolore immaginabile",
    }],
    interpret: s => s <= 3 ? { text: "Lieve", color: C.green }
      : s <= 6 ? { text: "Moderato", color: C.amber }
      : { text: "Severo", color: C.red },
  },
  {
    id: "PSFS", name: "PSFS", full: "Scala funzionale paziente-specifica", area: "Funzione",
    icon: "🎯", maxScore: 10, higherIsBetter: true, mcid: 2, psfs: true,
    questions: [],   // generate dalle attività definite all'invio
    interpret: s => s >= 8 ? { text: "Funzione ottima", color: C.green }
      : s >= 5 ? { text: "Funzione discreta", color: C.teal }
      : s >= 3 ? { text: "Limitazione marcata", color: C.amber }
      : { text: "Limitazione severa", color: C.red },
  },
  {
    id: "NDI", name: "NDI", full: "Indice di disabilità cervicale", area: "Cervicale",
    icon: "🦴", maxScore: 50, higherIsBetter: false, mcid: 7,
    questions: [
      sev("Intensità del dolore al collo"),
      sev("Cura personale (lavarsi, vestirsi)"),
      sev("Sollevare oggetti o pesi"),
      sev("Leggere a lungo"),
      sev("Mal di testa"),
      sev("Mantenere la concentrazione"),
      sev("Attività lavorative"),
      sev("Guidare l'auto"),
      sev("Qualità del sonno"),
      sev("Attività ricreative e tempo libero"),
    ],
    interpret: s => { const p = (s / 50) * 100;
      return p < 20 ? { text: "Nessuna disabilità", color: C.green }
        : p < 40 ? { text: "Disabilità lieve", color: C.teal }
        : p < 60 ? { text: "Disabilità moderata", color: C.amber }
        : { text: "Disabilità severa", color: C.red }; },
  },
  {
    id: "OSW", name: "Oswestry", full: "Indice di disabilità lombare", area: "Lombare",
    icon: "🧍", maxScore: 50, higherIsBetter: false, mcid: 10,
    questions: [
      sev("Intensità del dolore lombare"),
      sev("Cura personale (lavarsi, vestirsi)"),
      sev("Sollevare oggetti o pesi"),
      sev("Camminare"),
      sev("Stare seduto"),
      sev("Stare in piedi"),
      sev("Qualità del sonno"),
      sev("Vita sessuale (se applicabile)"),
      sev("Vita sociale"),
      sev("Viaggiare / spostarsi"),
    ],
    interpret: s => { const p = (s / 50) * 100;
      return p < 20 ? { text: "Disabilità minima", color: C.green }
        : p < 40 ? { text: "Disabilità moderata", color: C.teal }
        : p < 60 ? { text: "Disabilità severa", color: C.amber }
        : { text: "Disabilità invalidante", color: C.red }; },
  },
  {
    id: "DASH", name: "QuickDASH", full: "Funzione arto superiore (11 item)", area: "Arto superiore",
    icon: "💪", maxScore: 55, higherIsBetter: false, mcid: 8,
    questions: [
      sev("Aprire un barattolo nuovo o ben chiuso"),
      sev("Svolgere lavori domestici pesanti (pavimenti, vetri)"),
      sev("Portare una borsa della spesa o una valigetta"),
      sev("Lavarsi la schiena"),
      sev("Usare un coltello per tagliare il cibo"),
      sev("Attività ricreative con impatto sul braccio (tennis, martello…)"),
      sev("Interferenza con le normali attività sociali", 5),
      sev("Limitazione nel lavoro o nelle attività quotidiane", 5),
      sev("Dolore al braccio, spalla o mano", 5),
      sev("Formicolio a braccio, spalla o mano", 5),
      sev("Difficoltà a dormire per il dolore", 5),
    ],
    interpret: s => { const p = (s / 55) * 100;
      return p < 25 ? { text: "Funzione buona", color: C.green }
        : p < 50 ? { text: "Limitazione lieve", color: C.teal }
        : p < 75 ? { text: "Limitazione moderata", color: C.amber }
        : { text: "Limitazione severa", color: C.red }; },
  },
  {
    id: "LEFS", name: "LEFS", full: "Funzione arto inferiore", area: "Arto inferiore",
    icon: "🦵", maxScore: 80, higherIsBetter: true, mcid: 9,
    questions: [
      "Svolgere il lavoro o le faccende abituali", "Hobby e attività ricreative",
      "Entrare e uscire dalla vasca/doccia", "Camminare tra le stanze di casa",
      "Indossare scarpe e calze", "Accovacciarsi", "Sollevare un oggetto da terra",
      "Attività leggere in casa", "Attività pesanti in casa", "Entrare e uscire dall'auto",
      "Camminare per 2 isolati", "Camminare per 1,5 km", "Salire o scendere 10 gradini",
      "Stare in piedi 1 ora", "Stare seduto 1 ora", "Correre su terreno pianeggiante",
      "Correre su terreno irregolare", "Cambi di direzione in corsa veloce",
      "Saltare", "Girarsi nel letto",
    ].map(q => ({
      label: q, max: 4, minLabel: "Difficoltà estrema / impossibile", maxLabel: "Nessuna difficoltà",
      invert: true,
    })),
    interpret: s => { const p = (s / 80) * 100;
      return p > 75 ? { text: "Funzione ottima", color: C.green }
        : p > 50 ? { text: "Funzione buona", color: C.teal }
        : p > 25 ? { text: "Funzione moderata", color: C.amber }
        : { text: "Funzione compromessa", color: C.red }; },
  },
  // ═══════════════════════════════════════════════════════════════════
  // Aggiunte: rigidità, artrosi, spalla, paura del movimento, equilibrio,
  // mandibola, cambiamento percepito.
  //
  // Stessa impostazione delle precedenti: gli item sono formulazioni
  // cliniche nostre, non le versioni ufficiali degli strumenti citati come
  // riferimento. Servono a seguire l'andamento DELLO STESSO paziente nel
  // tempo; i punteggi non sono confrontabili con i valori di letteratura.
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "RIG", name: "Rigidità", full: "Rigidità articolare e mattutina", area: "Rigidità",
    icon: "🧊", maxScore: 30, higherIsBetter: false, mcid: 6,
    questions: [
      {
        label: "Quanto dura la rigidità appena ti alzi al mattino?",
        max: 5, minLabel: "Nessuna", maxLabel: "Oltre un'ora",
      },
      {
        label: "Quanto è intensa la rigidità al mattino?",
        max: 5, minLabel: "Assente", maxLabel: "Massima",
      },
      {
        label: "Quanto è intensa la rigidità dopo essere stato fermo a lungo?",
        max: 5, minLabel: "Assente", maxLabel: "Massima",
      },
      {
        label: "Quanto ti rallenta nei primi movimenti della giornata?",
        max: 5, minLabel: "Per niente", maxLabel: "Moltissimo",
      },
      {
        label: "Quanto migliora muovendoti o scaldandoti?",
        max: 5, minLabel: "Sparisce del tutto", maxLabel: "Non cambia nulla",
      },
      {
        label: "Quanto ti condiziona nelle attività quotidiane?",
        max: 5, minLabel: "Per niente", maxLabel: "Moltissimo",
      },
    ],
    interpret: s => s <= 6 ? { text: "Rigidità minima", color: C.green }
      : s <= 13 ? { text: "Rigidità lieve", color: C.teal }
      : s <= 21 ? { text: "Rigidità moderata", color: C.amber }
      : { text: "Rigidità marcata", color: C.red },
  },
  {
    id: "ARTRO", name: "Artrosi", full: "Anca e ginocchio: dolore, rigidità, funzione", area: "Arto inferiore",
    icon: "🦿", maxScore: 60, higherIsBetter: false, mcid: 10,
    questions: [
      sev("Dolore camminando in piano"),
      sev("Dolore salendo o scendendo le scale"),
      sev("Dolore di notte, a letto"),
      sev("Dolore stando seduto o sdraiato"),
      sev("Dolore stando in piedi fermo"),
      { label: "Rigidità appena sveglio", max: 5, minLabel: "Assente", maxLabel: "Massima" },
      { label: "Rigidità dopo essere stato seduto o fermo", max: 5, minLabel: "Assente", maxLabel: "Massima" },
      sev("Scendere le scale"),
      sev("Alzarsi da seduto"),
      sev("Infilare calze e scarpe"),
      sev("Entrare e uscire dall'auto"),
      sev("Fare la spesa o commissioni a piedi"),
    ],
    interpret: s => s <= 12 ? { text: "Impatto lieve", color: C.green }
      : s <= 26 ? { text: "Impatto moderato", color: C.teal }
      : s <= 42 ? { text: "Impatto marcato", color: C.amber }
      : { text: "Impatto severo", color: C.red },
  },
  {
    id: "SPALLA", name: "Spalla", full: "Dolore e disabilità di spalla", area: "Spalla",
    icon: "🫱", maxScore: 50, higherIsBetter: false, mcid: 8,
    questions: [
      sev("Dolore nel momento peggiore della giornata"),
      sev("Dolore dormendo sul lato interessato"),
      sev("Dolore alzando il braccio sopra la testa"),
      sev("Dolore spingendo o tirando"),
      sev("Lavarsi i capelli o la schiena"),
      sev("Vestirsi, infilare una maglia"),
      sev("Prendere un oggetto da uno scaffale alto"),
      sev("Portare una borsa della spesa"),
      sev("Allacciare il reggiseno o la cintura dietro la schiena"),
      sev("Lavorare o fare sport con quel braccio"),
    ],
    interpret: s => s <= 10 ? { text: "Spalla poco limitata", color: C.green }
      : s <= 22 ? { text: "Limitazione moderata", color: C.teal }
      : s <= 35 ? { text: "Limitazione marcata", color: C.amber }
      : { text: "Limitazione severa", color: C.red },
  },
  {
    id: "KINE", name: "Kinesiofobia", full: "Paura del movimento e convinzioni sul dolore", area: "Comportamento",
    icon: "🚧", maxScore: 40, higherIsBetter: false, mcid: 6,
    questions: [
      { label: "Ho paura di farmi male se mi muovo", max: 4, minLabel: "Per niente d'accordo", maxLabel: "Del tutto d'accordo" },
      { label: "Se ignorassi il dolore peggiorerebbe", max: 4, minLabel: "Per niente d'accordo", maxLabel: "Del tutto d'accordo" },
      { label: "Il mio corpo mi dice che c'è qualcosa di seriamente sbagliato", max: 4, minLabel: "Per niente d'accordo", maxLabel: "Del tutto d'accordo" },
      { label: "Sto più attento del necessario per non peggiorare", max: 4, minLabel: "Per niente d'accordo", maxLabel: "Del tutto d'accordo" },
      { label: "Evito i movimenti che mi fanno male", max: 4, minLabel: "Per niente d'accordo", maxLabel: "Del tutto d'accordo" },
      { label: "Il dolore significa che sto danneggiando qualcosa", max: 4, minLabel: "Per niente d'accordo", maxLabel: "Del tutto d'accordo" },
      { label: "Non riuscirò a tornare come prima", max: 4, minLabel: "Per niente d'accordo", maxLabel: "Del tutto d'accordo" },
      { label: "L'attività fisica potrebbe peggiorare la mia situazione", max: 4, minLabel: "Per niente d'accordo", maxLabel: "Del tutto d'accordo" },
      { label: "Rimando le cose per paura del dolore", max: 4, minLabel: "Per niente d'accordo", maxLabel: "Del tutto d'accordo" },
      { label: "Preferirei che nessuno mi facesse muovere l'area dolorante", max: 4, minLabel: "Per niente d'accordo", maxLabel: "Del tutto d'accordo" },
    ],
    interpret: s => s <= 12 ? { text: "Nessuna evitazione rilevante", color: C.green }
      : s <= 20 ? { text: "Qualche timore del movimento", color: C.teal }
      : s <= 29 ? { text: "Evitazione marcata", color: C.amber }
      : { text: "Forte paura del movimento", color: C.red },
  },
  {
    id: "EQUI", name: "Equilibrio", full: "Fiducia nell'equilibrio e paura di cadere", area: "Equilibrio",
    icon: "⚖️", maxScore: 40, higherIsBetter: false, mcid: 6,
    questions: [
      { label: "Pulire casa o rifare il letto", max: 4, minLabel: "Nessuna preoccupazione", maxLabel: "Molto preoccupato" },
      { label: "Vestirsi e spogliarsi", max: 4, minLabel: "Nessuna preoccupazione", maxLabel: "Molto preoccupato" },
      { label: "Salire o scendere le scale", max: 4, minLabel: "Nessuna preoccupazione", maxLabel: "Molto preoccupato" },
      { label: "Camminare in un luogo affollato", max: 4, minLabel: "Nessuna preoccupazione", maxLabel: "Molto preoccupato" },
      { label: "Camminare su superfici sconnesse o bagnate", max: 4, minLabel: "Nessuna preoccupazione", maxLabel: "Molto preoccupato" },
      { label: "Raggiungere qualcosa in alto o chinarsi", max: 4, minLabel: "Nessuna preoccupazione", maxLabel: "Molto preoccupato" },
      { label: "Uscire di casa da solo", max: 4, minLabel: "Nessuna preoccupazione", maxLabel: "Molto preoccupato" },
      { label: "Camminare al buio o con poca luce", max: 4, minLabel: "Nessuna preoccupazione", maxLabel: "Molto preoccupato" },
      { label: "Alzarsi o sedersi da una sedia", max: 4, minLabel: "Nessuna preoccupazione", maxLabel: "Molto preoccupato" },
      { label: "Partecipare a un'attività sociale", max: 4, minLabel: "Nessuna preoccupazione", maxLabel: "Molto preoccupato" },
    ],
    interpret: s => s <= 8 ? { text: "Sicuro nei movimenti", color: C.green }
      : s <= 16 ? { text: "Qualche insicurezza", color: C.teal }
      : s <= 26 ? { text: "Timore di cadere", color: C.amber }
      : { text: "Forte paura di cadere", color: C.red },
  },
  {
    id: "ATM", name: "ATM", full: "Limitazione funzionale mandibolare", area: "Mandibola",
    icon: "😬", maxScore: 40, higherIsBetter: false, mcid: 6,
    questions: [
      sev("Masticare cibi duri"),
      sev("Masticare cibi morbidi"),
      sev("Aprire la bocca abbastanza da mordere una mela"),
      sev("Sbadigliare"),
      sev("Parlare a lungo"),
      sev("Sorridere o ridere"),
      sev("Deglutire"),
      { label: "Rigidità della mandibola al risveglio", max: 5, minLabel: "Assente", maxLabel: "Massima" },
    ],
    interpret: s => s <= 8 ? { text: "Funzione conservata", color: C.green }
      : s <= 17 ? { text: "Limitazione lieve", color: C.teal }
      : s <= 28 ? { text: "Limitazione moderata", color: C.amber }
      : { text: "Limitazione severa", color: C.red },
  },
  {
    id: "PGIC", name: "Cambiamento", full: "Come il paziente valuta il cambiamento", area: "Esito",
    icon: "📈", maxScore: 6, higherIsBetter: false,
    questions: [{
      label: "Rispetto a quando hai iniziato il trattamento, come stai adesso?",
      max: 6, minLabel: "Moltissimo migliorato", maxLabel: "Moltissimo peggiorato",
    }],
    interpret: s => s <= 1 ? { text: "Nettamente migliorato", color: C.green }
      : s === 2 ? { text: "Migliorato", color: C.teal }
      : s === 3 ? { text: "Invariato", color: C.amber }
      : { text: "Peggiorato", color: C.red },
  },
];

export function getScale(id: string): ScaleDef | undefined {
  return SCALES.find(s => s.id === id);
}

// Domande PSFS a partire dalle attività definite dal fisioterapista
export function psfsQuestions(activities: string[]): ScaleQuestion[] {
  return activities.filter(Boolean).map(a => ({
    label: `Quanto riesci a svolgere: "${a}"?`,
    max: 10,
    minLabel: "Incapace di svolgerla",
    maxLabel: "Come prima del problema",
    invert: true,
  }));
}

// Punteggio: somma per le scale standard, media per PSFS
export function computeScore(def: ScaleDef, answers: number[]): number {
  if (def.psfs) {
    if (answers.length === 0) return 0;
    return Math.round((answers.reduce((a, b) => a + b, 0) / answers.length) * 10) / 10;
  }
  return answers.reduce((a, b) => a + b, 0);
}
