// ═══════════════════════════════════════════════════════════════════════
// src/lib/translateError.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Traduce in italiano i messaggi di errore restituiti da Supabase /
// PostgreSQL e da altre librerie comuni. Pensato per essere chiamato
// **subito prima** di mostrare l'errore all'utente (`setError`, `alert`,
// `toast`, ecc.).
//
// Strategia:
//   1. Se l'errore è null/undefined → ritorna "Errore sconosciuto"
//   2. Estrae il messaggio (string | Error.message | { message })
//   3. Cerca un match in TRANSLATIONS (regex case-insensitive)
//   4. Se nessun match → restituisce il messaggio originale (per non
//      perdere informazioni utili in development)
//
// Esempio d'uso:
//   const { error } = await supabase.from("...").update(...);
//   if (error) setError(`Errore aggiornamento: ${translateError(error)}`);
//
// ═══════════════════════════════════════════════════════════════════════

type ErrorLike = unknown;

/**
 * Coppie [pattern, traduzione]. Le regex sono case-insensitive.
 * L'ordine conta: il primo match vince — i pattern più specifici devono
 * stare prima dei generici.
 */
const TRANSLATIONS: Array<[RegExp, string]> = [
  // ─── Vincoli anti doppia prenotazione (mig. 074) ────────────────
  // Vanno PRIMA delle regole generiche: il messaggio Postgres per una
  // violazione EXCLUDE contiene "conflicting key value", che altrimenti
  // finirebbe in un messaggio tecnico incomprensibile.
  [/appointments_no_overlap_operator/i,
    "Questo operatore ha già un appuntamento in quell'orario. Scegli un altro orario o un altro operatore."],
  [/appointments_no_overlap_room/i,
    "Questa stanza è già occupata in quell'orario. Scegli un altro orario o un'altra stanza."],
  [/conflicting key value violates exclusion constraint/i,
    "L'orario scelto si sovrappone a un altro appuntamento."],
  // ─── Permessi a livello database (RLS: mig. 072, 082, 083) ──────
  // Va PRIMA dei generici: senza questa riga l'utente vedrebbe il
  // messaggio Postgres grezzo in inglese quando una policy lo blocca.
  [/new row violates row-level security policy/i,
    "Non hai il permesso per questa operazione. Chiedi al titolare dello studio."],
  [/violates row-level security policy/i,
    "Non hai il permesso per questa operazione. Chiedi al titolare dello studio."],
  // ─── PostgreSQL / Supabase ──────────────────────────────────────
  [/duplicate key value violates unique constraint/i,
    "Esiste già un record con gli stessi dati"],
  [/violates foreign key constraint/i,
    "Operazione bloccata: il record è collegato ad altri dati nel sistema"],
  [/violates not-null constraint/i,
    "Campo obbligatorio mancante"],
  [/violates check constraint/i,
    "Valore non ammesso per uno dei campi"],
  [/permission denied for (table|relation|schema)/i,
    "Permesso negato. Verifica di essere autenticato"],
  [/JWT expired/i,
    "Sessione scaduta. Effettua di nuovo il login"],
  [/invalid input syntax for type/i,
    "Formato dato non valido"],
  [/value too long for type/i,
    "Testo troppo lungo per il campo"],
  [/relation .* does not exist/i,
    "Risorsa non trovata nel database"],
  [/column .* does not exist/i,
    "Campo non esistente"],
  [/operator does not exist/i,
    "Operazione non supportata su questi tipi di dato"],
  [/null value in column/i,
    "Manca un valore obbligatorio"],
  [/division by zero/i,
    "Errore di calcolo: divisione per zero"],

  // ─── Supabase Auth ──────────────────────────────────────────────
  [/invalid login credentials/i,
    "Email o password non corretti"],
  [/email not confirmed/i,
    "Email non ancora confermata. Controlla la posta"],
  [/user already registered/i,
    "Esiste già un account con questa email"],
  [/email rate limit exceeded/i,
    "Troppe email inviate. Riprova fra qualche minuto"],
  [/(password|new_password) should be at least/i,
    "La password deve avere almeno 6 caratteri"],
  [/password (is too short|too short)/i,
    "Password troppo corta"],
  [/invalid api key/i,
    "Chiave API non valida"],
  [/user not found/i,
    "Utente non trovato"],
  [/signup is disabled/i,
    "Registrazione non abilitata"],

  // ─── Supabase Storage ───────────────────────────────────────────
  [/the resource was not found/i,
    "Risorsa non trovata"],
  [/payload too large/i,
    "File troppo grande"],
  [/mime type .* is not supported/i,
    "Tipo di file non supportato"],
  [/bucket not found/i,
    "Cartella di archiviazione non trovata"],

  // ─── Network / fetch ────────────────────────────────────────────
  [/failed to fetch/i,
    "Connessione al server fallita. Controlla la rete"],
  [/network request failed/i,
    "Errore di rete. Riprova fra poco"],
  [/network error/i,
    "Errore di rete"],
  [/timeout|timed out/i,
    "La richiesta ha impiegato troppo tempo. Riprova"],
  [/connection (refused|reset)/i,
    "Connessione interrotta"],
  [/CORS/i,
    "Errore di configurazione del server (CORS)"],

  // ─── HTTP status comuni ─────────────────────────────────────────
  [/\b401\b|unauthorized/i,
    "Non sei autorizzato a questa operazione"],
  [/\b403\b|forbidden/i,
    "Operazione non consentita"],
  [/\b404\b|not found/i,
    "Risorsa non trovata"],
  [/\b500\b|internal server error/i,
    "Errore interno del server. Riprova fra poco"],
  [/\b502\b|bad gateway/i,
    "Server temporaneamente non raggiungibile"],
  [/\b503\b|service unavailable/i,
    "Servizio temporaneamente non disponibile"],
];

/**
 * Estrae un messaggio testuale da qualunque tipo di errore.
 */
function extractMessage(err: ErrorLike): string {
  if (err == null) return "Errore sconosciuto";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.error_description === "string") return obj.error_description;
    if (typeof obj.error === "string") return obj.error;
    if (obj.error && typeof obj.error === "object") {
      const inner = obj.error as Record<string, unknown>;
      if (typeof inner.message === "string") return inner.message;
    }
    try { return JSON.stringify(err); } catch { return "Errore sconosciuto"; }
  }
  return String(err);
}

/**
 * Traduce un errore in italiano. Se nessun pattern corrisponde, ritorna
 * il messaggio originale (utile in development per identificare nuovi
 * pattern da aggiungere).
 */
export function translateError(err: ErrorLike): string {
  const raw = extractMessage(err);
  for (const [pattern, translation] of TRANSLATIONS) {
    if (pattern.test(raw)) return translation;
  }
  return raw;
}
