// ═══════════════════════════════════════════════════════════════════════
// src/lib/convenzioni/registry.ts
// ═══════════════════════════════════════════════════════════════════════
//
// REGISTRO DEGLI ENTI DI SANITÀ INTEGRATIVA ITALIANA
//
// Serve a due cose:
//   1. non digitare a mano nomi che sbagli (Fasdac vs FASDAC vs Fasdak);
//   2. sapere DA CHI passa la pratica: non ci si accredita col fondo, ci si
//      accredita con la RETE che ne gestisce le prestazioni. Quando il
//      paziente dice "ho Metasalute", la domanda di convenzionamento va
//      fatta a Previmedical, non a Metasalute.
//
// ONESTÀ SUI DATI: i nomi degli enti sono stabili, il campo `network` no —
// i fondi cambiano provider alle gare, a volte ne usano più di uno per
// garanzie diverse. Va inteso come "di norma passa da qui", da confermare
// col fondo. Gli URL di accreditamento delle reti principali sono stati
// verificati; per gli altri enti si parte dal sito ufficiale.
//
// L'elenco è modificabile: quando aggiungi un ente allo studio, i dati
// vengono copiati e restano tuoi (puoi correggerli senza toccare questo
// file).
// ═══════════════════════════════════════════════════════════════════════

export type EnteKind = "rete" | "fondo" | "cassa" | "mutua" | "assicurazione";

export type RegistryEntry = {
  name: string;
  kind: EnteKind;
  /** Rete/provider che di norma gestisce le prestazioni in convenzione. */
  network?: string;
  /** Categoria/settore di riferimento, per orientarsi nella lista. */
  settore?: string;
  site?: string;
  /** Pagina dove una struttura chiede il convenzionamento (solo reti). */
  accreditation?: string;
  contactEmail?: string;
  note?: string;
};

// ─────────────────────────────────────────────────────────────────────────
// 1. RETI / PROVIDER — è QUI che si fa domanda di convenzionamento
// ─────────────────────────────────────────────────────────────────────────
export const RETI: RegistryEntry[] = [
  {
    name: "Previmedical",
    kind: "rete",
    settore: "Rete sanitaria (Gruppo Intesa Sanpaolo / ex RBM)",
    site: "https://www.previmedical.it",
    accreditation: "https://www.previmedical.it/network.html",
    contactEmail: "ufficio.convenzioni@previmedical.it",
    note: "Gestisce molti fondi negoziali e aziendali. Nell'area Network c'è la voce «Richiedi una Convenzione».",
  },
  {
    name: "UniSalute",
    kind: "rete",
    settore: "Rete sanitaria (Gruppo Unipol)",
    site: "https://www.unisalute.it",
    accreditation: "https://www.unisalute.it/medici-e-case-di-cura/perche-convenzionarsi",
    note: "Indirizza gli assicurati alle strutture convenzionate e paga direttamente la struttura.",
  },
  {
    name: "Blue Assistance",
    kind: "rete",
    settore: "Rete sanitaria (Reale Group)",
    site: "https://www.blueassistance.it",
    accreditation: "https://www.blueassistance.it/per-il-network/modulo-richiesta-convenzionamento",
    note: "Il convenzionamento è coordinato con InSalute Servizi (joint venture con Intesa Sanpaolo Assicurazioni).",
  },
  {
    name: "InSalute Servizi",
    kind: "rete",
    settore: "Rete sanitaria (Intesa Sanpaolo + Reale Group)",
    site: "https://www.blueassistance.it",
    accreditation: "https://www.blueassistance.it/per-il-network/modulo-richiesta-convenzionamento",
  },
  { name: "Generali Welion", kind: "rete", settore: "Rete sanitaria (Gruppo Generali)", site: "https://www.welion.it" },
  { name: "Poste Welfare Servizi", kind: "rete", settore: "Rete sanitaria (Gruppo Poste Italiane)", site: "https://www.postewelfare.it" },
  { name: "Europ Assistance Italia", kind: "rete", settore: "Rete sanitaria e assistenza", site: "https://www.europassistance.it" },
  { name: "Health Assistance", kind: "rete", settore: "Rete sanitaria", site: "https://www.healthassistance.it" },
  { name: "MyAssistance", kind: "rete", settore: "Rete sanitaria", site: "https://www.myassistance.it" },
  { name: "Pronto-Care", kind: "rete", settore: "Rete sanitaria", site: "https://www.pronto-care.com" },
  { name: "OneNet", kind: "rete", settore: "Rete sanitaria indipendente", note: "Rete indipendente diffusa a livello nazionale." },
  { name: "Winsalute", kind: "rete", settore: "Rete sanitaria / welfare", site: "https://www.winsalute.it" },
  { name: "Assirete", kind: "rete", settore: "Rete sanitaria", site: "https://www.assirete.it" },
  { name: "Caring (Poste)", kind: "rete", settore: "Rete sanitaria", note: "Programma di assistenza del gruppo Poste." },
];

// ─────────────────────────────────────────────────────────────────────────
// 2. FONDI E CASSE DI CATEGORIA — quelli che il paziente ti nomina
// ─────────────────────────────────────────────────────────────────────────
export const FONDI: RegistryEntry[] = [
  // Metalmeccanica
  { name: "Metasalute", kind: "fondo", settore: "Metalmeccanici (CCNL industria)", network: "Previmedical", site: "https://www.fondometasalute.it" },
  { name: "PMI Salute", kind: "fondo", settore: "Metalmeccanici PMI", network: "Previmedical", site: "https://www.pmisalute.it" },
  { name: "San.Arti.", kind: "fondo", settore: "Artigianato", site: "https://www.sanarti.it" },

  // Commercio, turismo, servizi
  { name: "Fondo Est", kind: "fondo", settore: "Commercio, turismo e servizi", site: "https://www.fondoest.it" },
  { name: "Sanimpresa", kind: "cassa", settore: "Terziario — Roma e Lazio", site: "https://www.sanimpresa.it" },
  { name: "Qu.A.S.", kind: "cassa", settore: "Quadri del commercio", site: "https://www.quas.it" },
  { name: "FASDAC (Mario Besusso)", kind: "cassa", settore: "Dirigenti del commercio", site: "https://www.fasdac.it" },
  { name: "Fondo Fast", kind: "fondo", settore: "Telecomunicazioni", site: "https://www.fondofast.it" },
  { name: "Fon.Te / Fondo Salute", kind: "fondo", settore: "Terziario" },

  // Industria e dirigenza
  { name: "FASI", kind: "fondo", settore: "Dirigenti aziende industriali", site: "https://www.fasi.it" },
  { name: "FASI Open", kind: "fondo", settore: "Quadri e professionisti", site: "https://www.fasiopen.it" },
  { name: "Assidai", kind: "fondo", settore: "Dirigenti e quadri (Federmanager)", site: "https://www.assidai.it" },
  { name: "Previndai / Fondo dirigenti", kind: "fondo", settore: "Dirigenti industria" },
  { name: "Faschim", kind: "fondo", settore: "Industria chimica e farmaceutica", site: "https://www.faschim.it" },
  { name: "Fondapi", kind: "fondo", settore: "Piccola e media industria" },
  { name: "Fondo Salute", kind: "fondo", settore: "Multisettore" },

  // Edilizia, logistica, agricoltura
  { name: "Fondo Sanedil", kind: "fondo", settore: "Edilizia", site: "https://www.fondosanedil.it" },
  { name: "Sanilog", kind: "fondo", settore: "Logistica, trasporto merci e spedizioni", site: "https://www.sanilog.it" },
  { name: "Agrifondo", kind: "fondo", settore: "Agricoltura" },
  { name: "FISDE", kind: "fondo", settore: "Gruppo Enel", site: "https://www.fisde.it" },
  { name: "FASIE", kind: "fondo", settore: "Energia e petrolio" },
  { name: "ASSILT", kind: "fondo", settore: "Telecomunicazioni (ex Telecom)", site: "https://www.assilt.it" },

  // Moda, alimentare, cooperazione
  { name: "Sanimoda", kind: "fondo", settore: "Tessile, moda e calzature", site: "https://www.sanimoda.it" },
  { name: "Coopersalute", kind: "fondo", settore: "Cooperative (distribuzione e servizi)", site: "https://www.coopersalute.it" },
  { name: "Fondo Sanitario Integrativo Alimentare", kind: "fondo", settore: "Industria alimentare" },
  { name: "Fondo Sanità", kind: "fondo", settore: "Sanità privata" },

  // Professionisti dipendenti, somministrati, vigilanza
  { name: "Cadiprof", kind: "cassa", settore: "Studi professionali", site: "https://www.cadiprof.it" },
  { name: "Ebitemp", kind: "fondo", settore: "Lavoratori in somministrazione", site: "https://www.ebitemp.it" },
  { name: "Fontemp", kind: "fondo", settore: "Lavoratori in somministrazione" },
  { name: "FASIV", kind: "fondo", settore: "Istituti di vigilanza privata" },
  { name: "Casagit Salute", kind: "cassa", settore: "Giornalisti", site: "https://www.casagit.it" },

  // Bancari, assicurativi, pubblici
  { name: "Uni.C.A.", kind: "cassa", settore: "Gruppo UniCredit", network: "Previmedical" },
  { name: "Cassa Assistenza Intesa Sanpaolo", kind: "cassa", settore: "Gruppo Intesa Sanpaolo" },
  { name: "FASCHIM / Fondo bancari", kind: "cassa", settore: "Credito e assicurazioni" },
  { name: "Fondo Sanitario Poste (Fondo Salute)", kind: "fondo", settore: "Gruppo Poste Italiane" },
  { name: "Fondo Sanitario Ferrovie", kind: "fondo", settore: "Gruppo FS" },
];

// ─────────────────────────────────────────────────────────────────────────
// 3. CASSE PREVIDENZIALI DEI PROFESSIONISTI (spesso con polizza sanitaria)
// ─────────────────────────────────────────────────────────────────────────
export const CASSE_PROFESSIONALI: RegistryEntry[] = [
  { name: "Cassa Forense", kind: "cassa", settore: "Avvocati", site: "https://www.cassaforense.it" },
  { name: "ENPAM", kind: "cassa", settore: "Medici e odontoiatri", site: "https://www.enpam.it" },
  { name: "Inarcassa", kind: "cassa", settore: "Ingegneri e architetti", site: "https://www.inarcassa.it" },
  { name: "ENPAF", kind: "cassa", settore: "Farmacisti", site: "https://www.enpaf.it" },
  { name: "ENPAB", kind: "cassa", settore: "Biologi", site: "https://www.enpab.it" },
  { name: "ENPAP", kind: "cassa", settore: "Psicologi", site: "https://www.enpap.it" },
  { name: "ENPAPI", kind: "cassa", settore: "Infermieri", site: "https://www.enpapi.it" },
  { name: "Cassa Geometri", kind: "cassa", settore: "Geometri", site: "https://www.cassageometri.it" },
  { name: "Cassa Ragionieri e Dottori Commercialisti", kind: "cassa", settore: "Commercialisti" },
  { name: "Cassa Notariato", kind: "cassa", settore: "Notai" },
  { name: "ENASARCO", kind: "cassa", settore: "Agenti e rappresentanti di commercio", site: "https://www.enasarco.it" },
];

// ─────────────────────────────────────────────────────────────────────────
// 4. MUTUE E SOCIETÀ DI MUTUO SOCCORSO
// ─────────────────────────────────────────────────────────────────────────
export const MUTUE: RegistryEntry[] = [
  { name: "Società Nazionale di Mutuo Soccorso Cesare Pozzo", kind: "mutua", settore: "Mutua nazionale", site: "https://www.mutuacesarepozzo.org" },
  { name: "Insieme Salute", kind: "mutua", settore: "Mutua", site: "https://www.insiemesalute.org" },
  { name: "Campa", kind: "mutua", settore: "Mutua (Bologna)", site: "https://www.campa.it" },
  { name: "Mutua MBA", kind: "mutua", settore: "Mutua nazionale", site: "https://www.mutuamba.it" },
  { name: "Reciproca — Mutua Sanitaria", kind: "mutua", settore: "Mutua" },
  { name: "Sanità Più", kind: "mutua", settore: "Mutua" },
  { name: "Mutua Sanitaria Solidarietà Salute", kind: "mutua", settore: "Mutua" },
  { name: "Mutua Nuova Sanità", kind: "mutua", settore: "Mutua" },
];

// ─────────────────────────────────────────────────────────────────────────
// 5. COMPAGNIE ASSICURATIVE (polizze salute individuali e collettive)
// ─────────────────────────────────────────────────────────────────────────
export const ASSICURAZIONI: RegistryEntry[] = [
  { name: "UniSalute", kind: "assicurazione", settore: "Gruppo Unipol", network: "UniSalute" },
  { name: "Generali Italia", kind: "assicurazione", settore: "Salute", network: "Generali Welion" },
  { name: "Alleanza Assicurazioni", kind: "assicurazione", settore: "Salute", network: "Generali Welion" },
  { name: "Allianz", kind: "assicurazione", settore: "Salute" },
  { name: "AXA Italia", kind: "assicurazione", settore: "Salute" },
  { name: "Intesa Sanpaolo Assicura", kind: "assicurazione", settore: "Salute", network: "Previmedical" },
  { name: "Reale Mutua", kind: "assicurazione", settore: "Salute", network: "Blue Assistance" },
  { name: "Poste Vita", kind: "assicurazione", settore: "Salute", network: "Poste Welfare Servizi" },
  { name: "Zurich Italia", kind: "assicurazione", settore: "Salute" },
  { name: "Cattolica Assicurazioni", kind: "assicurazione", settore: "Salute" },
  { name: "Groupama", kind: "assicurazione", settore: "Salute" },
  { name: "Sara Assicurazioni", kind: "assicurazione", settore: "Salute" },
  { name: "Vittoria Assicurazioni", kind: "assicurazione", settore: "Salute" },
  { name: "HDI Assicurazioni", kind: "assicurazione", settore: "Salute" },
  { name: "ITAS Mutua", kind: "assicurazione", settore: "Salute" },
  { name: "Assimoco", kind: "assicurazione", settore: "Salute" },
  { name: "BeneSalute / Assicura", kind: "assicurazione", settore: "Salute" },
];

/** Tutti gli enti del registro, in un'unica lista. */
export const REGISTRY: RegistryEntry[] = [
  ...RETI, ...FONDI, ...CASSE_PROFESSIONALI, ...MUTUE, ...ASSICURAZIONI,
];

/** Registro ufficiale del Ministero: per verificare che un fondo esista. */
export const ANAGRAFE_MINISTERO =
  "https://www.salute.gov.it/new/it/servizi-online/ps-afis-02/anagrafe-fondi-sanitari-integrativi/";

export const KIND_LABEL: Record<EnteKind, string> = {
  rete: "Rete",
  fondo: "Fondo",
  cassa: "Cassa",
  mutua: "Mutua",
  assicurazione: "Assicurazione",
};

/** Ricerca semplice per nome/settore/rete. */
export function searchRegistry(q: string): RegistryEntry[] {
  const s = q.trim().toLowerCase();
  if (!s) return REGISTRY;
  return REGISTRY.filter(e =>
    e.name.toLowerCase().includes(s) ||
    (e.settore || "").toLowerCase().includes(s) ||
    (e.network || "").toLowerCase().includes(s),
  );
}

/**
 * Query pronta per cercare il tariffario di un ente.
 * NON scarichiamo tariffari in automatico: sono documenti riservati alle
 * strutture convenzionate e cambiano per piano e per anno, quindi un dato
 * preso da un sito terzo sarebbe vecchio o sbagliato — e sulle tariffe è
 * il danno peggiore. Questo apre una ricerca mirata: il numero che fa fede
 * entra dal documento ufficiale (che puoi caricare come foto o PDF).
 */
export function tariffarioSearchUrl(enteName: string, network?: string | null): string {
  const q = `${enteName}${network ? " " + network : ""} nomenclatore tariffario fisioterapia strutture convenzionate`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
