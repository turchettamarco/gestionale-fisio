// ═══════════════════════════════════════════════════════════════════════
// src/lib/clinical/orthopedicTests/neuro.ts
// ═══════════════════════════════════════════════════════════════════════
// Test neurologici e screening per primo motoneurone / cerebellare / propriocezione.
// Fonti: Magee 6th ed., Greenberg Neurology, Physiopedia.
// ═══════════════════════════════════════════════════════════════════════

import type { OrthopedicTest } from "./types";

export const NEURO_TESTS: OrthopedicTest[] = [

  // ═════ PRIMO MOTONEURONE (PIRAMIDALI) ═══════════════════════════
  {
    name: "Babinski",
    district: "neuro",
    purpose: "Identifica lesione del primo motoneurone (vie piramidali / cortico-spinali).",
    procedure: "L'esaminatore strofina il margine laterale della pianta del piede dal tallone verso le dita con un oggetto smussato.",
    positive: "Estensione (dorsiflessione) dell'alluce e ventaglio delle altre dita = lesione del primo motoneurone (es. ictus, sclerosi multipla, mielopatia).",
    sensitivity: "73%", specificity: "73%", source: "Singerman & Lee 2008",
  },
  {
    name: "Chaddock",
    district: "neuro",
    purpose: "Variante del Babinski (segno equivalente).",
    procedure: "L'esaminatore strofina il margine laterale del dorso del piede dal malleolo al quinto dito.",
    positive: "Estensione dell'alluce = segno di Babinski equivalente (lesione del primo motoneurone).",
  },
  {
    name: "Oppenheim",
    district: "neuro",
    purpose: "Variante del Babinski.",
    procedure: "L'esaminatore preme con pollice e indice lungo la cresta tibiale dalla rotula verso la caviglia.",
    positive: "Estensione dell'alluce = lesione del primo motoneurone.",
  },
  {
    name: "Hoffmann",
    district: "neuro",
    purpose: "Identifica mielopatia cervicale o lesione del primo motoneurone (arto superiore).",
    procedure: "L'esaminatore flette rapidamente l'unghia del dito medio del paziente.",
    positive: "Flessione del pollice e/o dell'indice = mielopatia cervicale o lesione del primo motoneurone.",
    sensitivity: "58%", specificity: "78%", source: "Houten & Noce 2008",
  },
  {
    name: "Trömner",
    district: "neuro",
    purpose: "Variante del Hoffmann per primo motoneurone arto superiore.",
    procedure: "L'esaminatore percuote dal lato palmare le falangi distali delle dita lunghe.",
    positive: "Flessione del pollice = lesione del primo motoneurone.",
  },
  {
    name: "Clono di caviglia",
    district: "neuro",
    purpose: "Identifica lesione del primo motoneurone (iper-riflessia).",
    procedure: "L'esaminatore stira rapidamente in dorsiflessione la caviglia del paziente e mantiene la pressione.",
    positive: "Contrazioni ritmiche ripetute (clono) >3-4 battute = lesione del primo motoneurone.",
  },
  {
    name: "Iperriflessia (DTR)",
    district: "neuro",
    purpose: "Valutazione globale dei riflessi osteotendinei (lesione primo motoneurone).",
    procedure: "Percussione con martelletto: bicipite (C5-C6), brachioradiale (C6), tricipite (C7), rotuleo (L3-L4), achilleo (S1).",
    positive: "Riflessi vivaci (3+/4+) o policinetici = primo motoneurone. Aboliti (0) = secondo motoneurone/radicolopatia.",
  },

  // ═════ CEREBELLARI / COORDINAZIONE ══════════════════════════════
  {
    name: "Romberg",
    district: "neuro",
    purpose: "Identifica deficit propriocettivo (cordone posteriore midollare) o vestibolare.",
    procedure: "Paziente in piedi, piedi uniti, braccia lungo i fianchi. Si chiede di chiudere gli occhi per 30 secondi.",
    positive: "Oscillazione marcata o caduta ad occhi chiusi (con stabilità ad occhi aperti) = deficit propriocettivo o cordone posteriore.",
  },
  {
    name: "Test indice-naso",
    district: "neuro",
    purpose: "Valuta funzione cerebellare (dismetria).",
    procedure: "Il paziente porta il dito indice dal proprio naso al dito dell'esaminatore, ripetutamente.",
    positive: "Dismetria (sovra/sotto-mira) o tremore di intenzione = lesione cerebellare omolaterale.",
  },
  {
    name: "Test tallone-ginocchio",
    district: "neuro",
    purpose: "Valuta funzione cerebellare per l'arto inferiore.",
    procedure: "Paziente supino. Si chiede di portare il tallone sul ginocchio controlaterale e scorrere lungo la tibia.",
    positive: "Movimento atassico, dismetria = lesione cerebellare omolaterale.",
  },
  {
    name: "Diadococinesia",
    district: "neuro",
    purpose: "Valuta capacità di eseguire movimenti rapidi alternati (cerebellare).",
    procedure: "Si chiede di pronare e supinare rapidamente l'avambraccio o di battere il palmo/dorso sulla coscia.",
    positive: "Movimento lento, irregolare (adiadococinesia) = lesione cerebellare.",
  },
  {
    name: "Tandem walking",
    district: "neuro",
    purpose: "Valuta equilibrio e funzione cerebellare.",
    procedure: "Si chiede di camminare in linea retta posando il tallone davanti alle dita del piede opposto.",
    positive: "Incapacità di mantenere la linea = atassia cerebellare o vestibolare.",
  },

  // ═════ NERVI CRANICI ═══════════════════════════════════════════
  {
    name: "Riflesso corneale",
    district: "neuro",
    purpose: "Valuta integrità del trigemino (V) e facciale (VII).",
    procedure: "L'esaminatore tocca delicatamente la cornea con un cotton fioc.",
    positive: "Mancata chiusura della palpebra = lesione del trigemino o del facciale.",
  },
  {
    name: "Test del facciale",
    district: "neuro",
    purpose: "Identifica paresi del nervo facciale (centrale vs periferica).",
    procedure: "Si chiede di sorridere, sollevare le sopracciglia, gonfiare le guance, stringere gli occhi.",
    positive: "Asimmetria. Coinvolgimento della metà superiore = paresi periferica (Bell). Risparmio metà superiore = paresi centrale.",
  },

  // ═════ DERMATOMERI / MIOTOMERI / RIFLESSI ═══════════════════════
  {
    name: "Esame dermatomerico arto inferiore",
    district: "neuro",
    purpose: "Identifica deficit sensitivo radicolare lombare/sacrale.",
    procedure: "Test della sensibilità tattile e dolorifica nei dermatomeri: L1 (inguine), L2 (faccia anteriore coscia), L3 (sopra rotula), L4 (mediale gamba), L5 (laterale gamba+dorso piede), S1 (laterale piede), S2 (posteriore coscia).",
    positive: "Ipo/anestesia in un dermatomero specifico = compromissione di quella radice.",
  },
  {
    name: "Esame miotomerico arto inferiore",
    district: "neuro",
    purpose: "Identifica deficit motorio radicolare.",
    procedure: "Test della forza: L2 (flex anca), L3 (estens ginocchio), L4 (dorsiflex caviglia), L5 (estens alluce), S1 (plantarflex), S2 (flex ginocchio).",
    positive: "Debolezza (<5/5) in un miotomero = compromissione di quella radice.",
  },
  {
    name: "Esame dermatomerico arto superiore",
    district: "neuro",
    purpose: "Identifica deficit sensitivo radicolare cervicale.",
    procedure: "Test sensibilità: C5 (spalla laterale), C6 (pollice), C7 (dito medio), C8 (mignolo), T1 (mediale braccio).",
    positive: "Ipo/anestesia in un dermatomero = compromissione di quella radice cervicale.",
  },
  {
    name: "Esame miotomerico arto superiore",
    district: "neuro",
    purpose: "Identifica deficit motorio radicolare cervicale.",
    procedure: "Test forza: C5 (abduzione spalla, deltoide), C6 (flex gomito, bicipite), C7 (estens gomito, tricipite), C8 (flex dita), T1 (intrinseci mano).",
    positive: "Debolezza in un miotomero = compromissione di quella radice cervicale.",
  },
  {
    name: "Riflesso patellare (rotuleo)",
    district: "neuro",
    purpose: "Valuta integrità della radice L3-L4.",
    procedure: "Paziente seduto, gambe pendenti. Percussione del tendine rotuleo.",
    positive: "Assenza o iporeflessia = lesione radice L3-L4. Iperriflessia = primo motoneurone.",
  },
  {
    name: "Riflesso achilleo",
    district: "neuro",
    purpose: "Valuta integrità della radice S1.",
    procedure: "Paziente con piede leggermente dorsiflesso. Percussione del tendine d'Achille.",
    positive: "Assenza o iporeflessia = lesione radice S1. Iperriflessia = primo motoneurone.",
  },
  {
    name: "Riflesso bicipitale",
    district: "neuro",
    purpose: "Valuta integrità della radice C5-C6.",
    procedure: "Percussione del tendine bicipitale (con esaminatore che pone il proprio pollice sopra).",
    positive: "Assenza o iporeflessia = lesione radice C5-C6.",
  },
  {
    name: "Riflesso tricipitale",
    district: "neuro",
    purpose: "Valuta integrità della radice C7.",
    procedure: "Percussione del tendine tricipitale con gomito flesso.",
    positive: "Assenza o iporeflessia = lesione radice C7.",
  },

  // ═════ ALTRI SCREENING NEUROLOGICI ══════════════════════════════
  {
    name: "Test del cammino (gait)",
    district: "neuro",
    purpose: "Screening generale per patologie neurologiche/muscoloscheletriche.",
    procedure: "Si chiede al paziente di camminare avanti e indietro, di girare, di camminare sui talloni e sulle punte.",
    positive: "Anomalie del passo (atassico, falciante, anserino, parkinsoniano, antalgico) = pattern specifici di patologia.",
  },
  {
    name: "Lhermitte sign",
    district: "neuro",
    purpose: "Identifica lesione midollare cervicale (es. sclerosi multipla, mielopatia).",
    procedure: "Paziente seduto. L'esaminatore flette passivamente il capo del paziente.",
    positive: "Scossa elettrica lungo la colonna vertebrale o agli arti = lesione midollare cervicale.",
    sensitivity: "Bassa", specificity: "Alta",
  },
];
