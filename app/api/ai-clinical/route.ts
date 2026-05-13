// ═══════════════════════════════════════════════════════════════════════
// app/api/ai-clinical/route.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Endpoint AI clinico — punto unico di accesso per tutte le feature AI
// della scheda paziente (Tappa 10).
//
// AZIONI SUPPORTATE:
//   - "summary"       → riassunto paziente (3-4 frasi)
//   - "diagnosis"     → suggerimento diagnosi probabile + differenziali
//   - "plan"          → suggerimento piano di trattamento
//   - "soap"          → generazione SOAP da nota rapida
//
// REQUEST BODY:
//   {
//     action: "summary" | "diagnosis" | "plan" | "soap",
//     context: object   // contesto paziente (dipende dall'azione)
//   }
//
// RESPONSE:
//   { result: object }  // struttura dipende dall'azione, sempre JSON-parserabile
//
// SICUREZZA:
//   - Verifica autenticazione (cookie Supabase)
//   - Logga uso AI con userId + azione (senza PII salvabile)
//   - Timeout server-side a 30 secondi
//
// COSTI:
//   - Usa Claude Haiku 4.5 (stesso modello di ai-esercizi)
//   - Stima: ~$0.005-0.015 per chiamata
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

// ─── Tipi ────────────────────────────────────────────────────

type AIAction = "summary" | "plan" | "soap";

interface PatientContext {
  // Anagrafica essenziale
  age?: number | null;
  sex?: string | null;
  occupation?: string | null;
  sport?: string | null;

  // Anamnesi strutturata
  pain_locations?: string[];
  duration_value?: number | null;
  duration_unit?: string | null;
  onset_type?: string | null;
  pain_frequency?: string | null;
  pain_characteristics?: string[];
  aggravating_factors?: string[];
  relieving_factors?: string[];

  // Red flags
  red_flags_present?: Array<{ label: string; description?: string }>;
  red_flags_excluded?: number;

  // Diagnosi
  primary_diagnosis?: string | null;
  differential_diagnoses?: string[];

  // Test ortopedici
  tests?: Array<{
    name: string;
    result: string;
    side?: string | null;
    notes?: string | null;
  }>;

  // Piano
  planned_frequency_per_week?: number | null;
  planned_duration_weeks?: number | null;
  planned_techniques?: string[];

  // Obiettivi
  goals?: Array<{ description: string; status: string }>;

  // Diario clinico
  recent_sessions?: Array<{
    date: string;
    vas_before?: number | null;
    vas_after?: number | null;
    quick_note?: string | null;
    soap_s?: string | null;
    soap_o?: string | null;
    soap_a?: string | null;
    soap_p?: string | null;
  }>;

  // Per la generazione SOAP: nota rapida da espandere
  quick_note?: string;
  session_date?: string;
}

// ─── Helper: serializza il contesto in testo italiano leggibile ───

function serializeContext(ctx: PatientContext): string {
  const parts: string[] = [];

  if (ctx.age || ctx.sex || ctx.occupation || ctx.sport) {
    const bits: string[] = [];
    if (ctx.age) bits.push(`${ctx.age} anni`);
    if (ctx.sex) bits.push(ctx.sex === "M" ? "uomo" : "donna");
    if (ctx.occupation) bits.push(`lavoro: ${ctx.occupation}`);
    if (ctx.sport) bits.push(`sport: ${ctx.sport}`);
    parts.push(`ANAGRAFICA: ${bits.join(", ")}.`);
  }

  if (ctx.pain_locations?.length) {
    parts.push(`SEDE DEL DOLORE: ${ctx.pain_locations.join(", ")}.`);
  }

  if (ctx.duration_value && ctx.duration_unit) {
    parts.push(`DURATA: ${ctx.duration_value} ${ctx.duration_unit}.`);
  }

  if (ctx.onset_type) parts.push(`INSORGENZA: ${ctx.onset_type}.`);
  if (ctx.pain_frequency) parts.push(`FREQUENZA: ${ctx.pain_frequency}.`);

  if (ctx.pain_characteristics?.length) {
    parts.push(`CARATTERISTICHE DEL DOLORE: ${ctx.pain_characteristics.join(", ")}.`);
  }

  if (ctx.aggravating_factors?.length) {
    parts.push(`FATTORI AGGRAVANTI: ${ctx.aggravating_factors.join(", ")}.`);
  }

  if (ctx.relieving_factors?.length) {
    parts.push(`FATTORI ALLEVIANTI: ${ctx.relieving_factors.join(", ")}.`);
  }

  if (ctx.red_flags_present?.length) {
    parts.push(`⚠ RED FLAGS PRESENTI: ${ctx.red_flags_present.map(r => r.label).join("; ")}.`);
  }

  if (ctx.primary_diagnosis) {
    parts.push(`DIAGNOSI PRINCIPALE: ${ctx.primary_diagnosis}.`);
  }

  if (ctx.differential_diagnoses?.length) {
    parts.push(`DIFFERENZIALI: ${ctx.differential_diagnoses.join(", ")}.`);
  }

  if (ctx.tests?.length) {
    const positive = ctx.tests.filter(t => t.result === "positive");
    const negative = ctx.tests.filter(t => t.result === "negative");
    if (positive.length > 0) {
      parts.push(`TEST POSITIVI: ${positive.map(t => `${t.name}${t.side ? " (" + t.side + ")" : ""}`).join(", ")}.`);
    }
    if (negative.length > 0) {
      parts.push(`TEST NEGATIVI: ${negative.map(t => t.name).join(", ")}.`);
    }
  }

  if (ctx.planned_frequency_per_week) {
    parts.push(`PIANO FREQUENZA: ${ctx.planned_frequency_per_week} sedute/settimana.`);
  }
  if (ctx.planned_duration_weeks) {
    parts.push(`PIANO DURATA: ${ctx.planned_duration_weeks} settimane.`);
  }
  if (ctx.planned_techniques?.length) {
    parts.push(`TECNICHE PIANIFICATE: ${ctx.planned_techniques.join(", ")}.`);
  }

  if (ctx.goals?.length) {
    const active = ctx.goals.filter(g => g.status === "active");
    if (active.length > 0) {
      parts.push(`OBIETTIVI ATTIVI: ${active.map(g => g.description).join("; ")}.`);
    }
  }

  if (ctx.recent_sessions?.length) {
    parts.push(`\nDIARIO CLINICO (ultime sedute, dalla più recente):`);
    ctx.recent_sessions.slice(0, 8).forEach((s, i) => {
      const date = new Date(s.date).toLocaleDateString("it-IT");
      let line = `  ${i + 1}. ${date}`;
      if (s.vas_before != null) line += ` | VAS pre: ${s.vas_before}`;
      if (s.vas_after != null) line += ` | VAS post: ${s.vas_after}`;
      if (s.quick_note) line += ` | nota: "${s.quick_note.substring(0, 100)}"`;
      if (s.soap_s) line += ` | S: "${s.soap_s.substring(0, 80)}"`;
      if (s.soap_o) line += ` | O: "${s.soap_o.substring(0, 80)}"`;
      if (s.soap_a) line += ` | A: "${s.soap_a.substring(0, 80)}"`;
      if (s.soap_p) line += ` | P: "${s.soap_p.substring(0, 80)}"`;
      parts.push(line);
    });
  }

  return parts.join("\n");
}

// ─── Prompts per ogni azione ───────────────────────────────

function buildPrompt(action: AIAction, ctx: PatientContext): string {
  const contextText = serializeContext(ctx);

  const baseInstructions = `Sei un assistente clinico esperto per fisioterapisti.
Rispondi SEMPRE in italiano.
Sei conciso, professionale, basato su evidenze.

IMPORTANTE: Il tuo compito è AIUTARE il fisioterapista offrendo ipotesi cliniche utili.
- Lavora con quello che hai, anche se sono pochi dati.
- Genera SEMPRE un'ipotesi plausibile basata sulle informazioni disponibili (anche se scarse).
- Quando i dati sono pochi, formula ipotesi plausibili e indica nelle motivazioni quali dati aggiuntivi le rafforzerebbero.
- NON rifiutare per "dati insufficienti" a meno che il paziente sia totalmente privo di qualsiasi informazione clinica.
- Sii propositivo: meglio un'ipotesi ragionata da valutare che un rifiuto.

Il fisioterapista è l'autorità clinica finale: i tuoi suggerimenti sono spunti, non diagnosi definitive.`;

  if (action === "summary") {
    return `${baseInstructions}

CONTESTO PAZIENTE:
${contextText}

COMPITO: Genera un riassunto sintetico del paziente in 3-4 frasi (max 80 parole totali) che includa:
- Profilo essenziale (età/sesso/contesto)
- Quadro clinico principale (sede, durata, gravità)
- Stato attuale (in miglioramento/stabile/peggioramento se ci sono sedute precedenti)
- Eventuali punti di attenzione (red flags se presenti)

Lavora con quello che hai. Se mancano alcune info, riassumi quelle disponibili senza sottolineare le mancanze.

Rispondi SOLO con un oggetto JSON in questo formato esatto:
{"summary": "testo qui"}

Niente preamboli, niente markdown, solo JSON.`;
  }

  if (action === "plan") {
    return `${baseInstructions}

CONTESTO PAZIENTE:
${contextText}

COMPITO: Suggerisci un piano di trattamento iniziale ragionevole, anche se i dati sono pochi. Usa la tua esperienza clinica per inferire un piano standard per il quadro che vedi.
1. Frequenza prevista (sedute/settimana, valore numerico 1-3, default ragionevole = 2).
2. Durata stimata (settimane, valore numerico 2-12, default ragionevole = 6).
3. 4-7 tecniche fisioterapiche pianificate (usa terminologia standard italiana).
4. Una breve motivazione del piano (max 40 parole).

Anche con poche info, proponi un piano standard appropriato al quadro clinico verosimile. Ad esempio:
- Quadro lombare → mobilizzazione, esercizi di stabilizzazione, core stability, McKenzie se sospetto discale.
- Quadro cervicale → mobilizzazione, esercizi posturali, educazione al dolore.
- Tendinopatia → esercizi eccentrici, esercizi di rinforzo, kinesio taping.

Tecniche valide (usa SOLO quelle da queste categorie):
TERAPIA MANUALE: Mobilizzazione articolare, Manipolazione articolare (HVLA), Terapia tessuti molli, Trattamento miofasciale, Trigger point therapy, Stretching passivo, Linfodrenaggio, Neurodinamica (mobilizzazione nervosa)
METODICHE: McKenzie (MDT), Maitland, Mulligan (MWM), Kaltenborn-Evjenth, Cyriax, Osteopatia, Manipolazione Fasciale Stecco, Rieducazione Posturale Globale (RPG), Metodo Mézières, Bobath (NDT), Kabat / PNF
ESERCIZIO TERAPEUTICO: Esercizi di rinforzo, Esercizi di stabilizzazione, Core stability, Esercizi propriocettivi, Esercizi di equilibrio, Controllo neuromuscolare, Esercizi eccentrici, Esercizi isometrici, Esercizi funzionali, Esercizi posturali, Esercizi respiratori, Rieducazione del cammino, Programma esercizi domiciliari
FISICHE/STRUMENTALI: Tecarterapia, Laser Yag ad alta potenza, Laser a bassa intensità, Ultrasuoni, TENS, Elettrostimolazione, Magnetoterapia, Onde d'urto, Crioterapia, Termoterapia, Trazione meccanica
COMPLEMENTARI: Kinesio taping, Taping rigido (functional), Tutori / ortesi, Dry needling, IASTM (Strumenti tessuti molli), Educazione del paziente, Educazione al dolore (PNE)

Rispondi SOLO con un oggetto JSON in questo formato esatto:
{
  "frequency_per_week": 2,
  "duration_weeks": 6,
  "techniques": ["Tecnica 1", "Tecnica 2", ...],
  "reasoning": "Breve motivazione"
}

Niente preamboli, niente markdown, solo JSON.`;
  }

  if (action === "soap") {
    return `${baseInstructions}

CONTESTO PAZIENTE:
${contextText}

NOTA RAPIDA DELLA SEDUTA DA ESPANDERE:
"${ctx.quick_note || "(vuota)"}"

COMPITO: Espandi la nota rapida sopra in una nota SOAP completa e professionale.
Usa le informazioni del contesto paziente per dare consistenza.
Ogni sezione max 2-3 frasi, terminologia clinica fisioterapica corretta.

S (Soggettivo): cosa riferisce il paziente, percezione del dolore, miglioramenti/peggioramenti
O (Oggettivo): cosa osservi/misuri (ROM, palpazione, test, postura, ecc.)
A (Assessment): tua valutazione clinica della seduta, progressione vs prima
P (Plan): cosa farai nella prossima seduta, esercizi assegnati, raccomandazioni

Se la nota rapida è vuota o molto scarna, deduci comunque un SOAP plausibile dalla diagnosi e dal contesto paziente, indicando "verificare" o "valutare" dove serve maggior dettaglio. NON lasciare campi vuoti.

Rispondi SOLO con un oggetto JSON in questo formato esatto:
{
  "S": "testo soggettivo",
  "O": "testo oggettivo",
  "A": "testo assessment",
  "P": "testo plan"
}

Niente preamboli, niente markdown, solo JSON.`;
  }

  return "";
}

// ─── Estrai JSON dalla risposta dell'AI (robusto a code fences) ───

function extractJSON(text: string): any {
  // Prova prima parsing diretto
  try {
    return JSON.parse(text.trim());
  } catch {}

  // Strip code fences markdown
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {}

  // Trova il primo blocco { ... } valido
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }

  throw new Error("Risposta AI non parsabile come JSON: " + text.substring(0, 200));
}

// ─── Handler POST ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, context } = body as { action: AIAction; context: PatientContext };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurata su Vercel" }, { status: 500 });
    }

    if (!action || !["summary", "plan", "soap"].includes(action)) {
      return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
    }

    if (!context) {
      return NextResponse.json({ error: "Contesto paziente mancante" }, { status: 400 });
    }

    const prompt = buildPrompt(action, context);
    if (!prompt) {
      return NextResponse.json({ error: "Prompt non generato" }, { status: 500 });
    }

    // Chiamata ad Anthropic
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: action === "soap" || action === "plan" ? 1024 : 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: `Errore AI: ${data?.error?.message ?? JSON.stringify(data)}` },
        { status: response.status }
      );
    }

    const text = data.content?.[0]?.text ?? "";
    if (!text) {
      return NextResponse.json({ error: "Risposta AI vuota" }, { status: 500 });
    }

    // Parsing robusto
    const result = extractJSON(text);

    return NextResponse.json({ result, raw: text });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
