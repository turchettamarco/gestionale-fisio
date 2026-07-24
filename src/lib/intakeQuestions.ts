// src/lib/intakeQuestions.ts
// ═══════════════════════════════════════════════════════════════════════
// Domande dell'autovalutazione pre-visita (mig. 093).
//
// Definite qui una volta sola: le usano sia la pagina che compila il
// paziente sia la scheda dove il terapista rilegge le risposte. Cambiando
// una domanda cambiano insieme, senza rischio che le due viste si
// allineino male.
//
// IMPOSTAZIONE: sono domande di anamnesi, non di diagnosi. Il paziente
// racconta la sua situazione; l'interpretazione clinica resta al
// terapista. Per questo nessuna domanda chiede al paziente di dare un
// nome al problema.
//
// Le domande marcate redFlag riguardano segnali che meritano attenzione
// prima di iniziare un trattamento. Non sono di per sé una controindicazione
// e non decidono nulla da sole: servono a far sì che il terapista le
// conosca prima di avere il paziente sul lettino.
// ═══════════════════════════════════════════════════════════════════════

export type IntakeQuestion = {
  id: string;
  label: string;
  hint?: string;
  type: "text" | "textarea" | "select" | "scale" | "checkbox";
  options?: string[];
  required?: boolean;
  /** Segnale a cui il terapista deve dare un'occhiata prima di iniziare. */
  redFlag?: boolean;
};

export type IntakeSection = {
  id: string;
  title: string;
  intro?: string;
  questions: IntakeQuestion[];
};

export const INTAKE_SECTIONS: IntakeSection[] = [
  {
    id: "motivo",
    title: "Il motivo della visita",
    questions: [
      {
        id: "motivo",
        label: "Per cosa vieni?",
        hint: "Descrivilo con parole tue, non serve un termine tecnico",
        type: "textarea",
        required: true,
      },
      {
        id: "zona",
        label: "In quale zona del corpo?",
        hint: "Es. spalla destra, parte bassa della schiena",
        type: "text",
        required: true,
      },
      {
        id: "da_quanto",
        label: "Da quanto tempo?",
        type: "select",
        options: ["Meno di una settimana", "1-4 settimane", "1-6 mesi", "Più di 6 mesi"],
        required: true,
      },
      {
        id: "esordio",
        label: "Come è iniziato?",
        type: "select",
        options: [
          "Dopo un trauma o una caduta",
          "Dopo uno sforzo o un movimento particolare",
          "Poco a poco, senza una causa precisa",
          "Non saprei",
        ],
        required: true,
      },
    ],
  },
  {
    id: "dolore",
    title: "Il dolore",
    questions: [
      {
        id: "dolore_ora",
        label: "Quanto ti fa male in questo momento?",
        hint: "0 nessun dolore · 10 il dolore più forte che riesci a immaginare",
        type: "scale",
        required: true,
      },
      {
        id: "dolore_peggiore",
        label: "E nel momento peggiore dell'ultima settimana?",
        type: "scale",
        required: true,
      },
      {
        id: "peggiora",
        label: "Cosa lo peggiora?",
        hint: "Movimenti, posizioni, momenti della giornata",
        type: "textarea",
      },
      {
        id: "migliora",
        label: "Cosa lo allevia?",
        type: "textarea",
      },
      {
        id: "limita",
        label: "Cosa non riesci più a fare come prima?",
        hint: "Lavoro, sport, sonno, gesti di tutti i giorni",
        type: "textarea",
      },
    ],
  },
  {
    id: "storia",
    title: "Cosa hai già fatto",
    questions: [
      {
        id: "esami",
        label: "Hai fatto esami per questo problema?",
        hint: "Radiografia, risonanza, ecografia… e quando",
        type: "textarea",
      },
      {
        id: "terapie",
        label: "Hai già provato altre terapie?",
        hint: "Fisioterapia, infiltrazioni, osteopatia, riposo…",
        type: "textarea",
      },
      {
        id: "farmaci",
        label: "Stai prendendo farmaci?",
        hint: "Anche quelli che prendi da tempo per altri motivi",
        type: "textarea",
      },
      {
        id: "patologie",
        label: "Hai patologie o interventi di cui dovrei sapere?",
        hint: "Diabete, problemi cardiaci, protesi, operazioni passate…",
        type: "textarea",
      },
    ],
  },
  {
    id: "segnali",
    title: "Qualche domanda di controllo",
    intro: "Rispondere sì non significa che ci sia qualcosa di grave: servono solo a farmi sapere in anticipo se conviene approfondire.",
    questions: [
      {
        id: "rf_notte",
        label: "Il dolore ti sveglia di notte anche stando fermo?",
        type: "checkbox",
        redFlag: true,
      },
      {
        id: "rf_peso",
        label: "Hai perso peso senza volerlo negli ultimi mesi?",
        type: "checkbox",
        redFlag: true,
      },
      {
        id: "rf_febbre",
        label: "Hai avuto febbre o malessere generale insieme al dolore?",
        type: "checkbox",
        redFlag: true,
      },
      {
        id: "rf_sfinteri",
        label: "Hai notato difficoltà a trattenere urina o feci?",
        type: "checkbox",
        redFlag: true,
      },
      {
        id: "rf_formicolii",
        label: "Hai formicolii, perdita di forza o di sensibilità?",
        type: "checkbox",
        redFlag: true,
      },
    ],
  },
  {
    id: "obiettivo",
    title: "Cosa ti aspetti",
    questions: [
      {
        id: "lavoro_sport",
        label: "Che lavoro fai e quale attività fisica pratichi?",
        type: "textarea",
      },
      {
        id: "obiettivo",
        label: "Qual è la cosa che vorresti tornare a fare?",
        hint: "L'obiettivo concreto che per te conta di più",
        type: "textarea",
        required: true,
      },
      {
        id: "note",
        label: "Vuoi aggiungere altro?",
        type: "textarea",
      },
    ],
  },
];

/** Tutte le domande in un unico elenco, comodo per la rilettura. */
export const INTAKE_ALL_QUESTIONS: IntakeQuestion[] =
  INTAKE_SECTIONS.flatMap(s => s.questions);

/** Id delle domande di controllo, per evidenziarle nella scheda. */
export const INTAKE_RED_FLAG_IDS: string[] =
  INTAKE_ALL_QUESTIONS.filter(q => q.redFlag).map(q => q.id);

/** Segnali marcati sì dal paziente, in ordine di comparsa. */
export function redFlagsFrom(payload: Record<string, unknown>): IntakeQuestion[] {
  return INTAKE_ALL_QUESTIONS.filter(q => q.redFlag && payload[q.id] === true);
}
