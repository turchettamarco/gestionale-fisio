-- ═══════════════════════════════════════════════════════════════════════
-- Migration 007: Calendar Feed Token (multi-tenancy security)
-- ═══════════════════════════════════════════════════════════════════════
--
-- PROBLEMA CHE RISOLVE:
-- Prima di questa migration, l'endpoint /api/calendar.ics esponeva gli
-- appuntamenti di TUTTI gli studi a chiunque conoscesse l'URL.
-- Questa è una violazione grave della multi-tenancy.
--
-- SOLUZIONE:
-- Ogni studio ha ora un token univoco UUID per il proprio feed iCal.
-- L'URL diventa: /api/calendar.ics?token=<uuid-dello-studio>
-- L'endpoint filtra gli appuntamenti per studio_id corrispondente.
--
-- COMPATIBILITÀ:
-- Per gli studi esistenti che usavano già la sincronizzazione Google
-- Calendar, dovranno aggiornare l'URL nel loro Google Calendar (basta
-- cancellare il vecchio "Calendario da URL" e aggiungere quello nuovo
-- copiato dalle Impostazioni).
--
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Aggiungi colonna token (UUID univoco per studio)
ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS calendar_feed_token UUID DEFAULT gen_random_uuid();

-- 2. Genera token per studi esistenti che hanno NULL
--    (se la colonna esisteva già senza default, alcuni potrebbero non averlo)
UPDATE studios
   SET calendar_feed_token = gen_random_uuid()
 WHERE calendar_feed_token IS NULL;

-- 3. Rendi la colonna NOT NULL e UNIQUE per garantire il rispetto del vincolo
ALTER TABLE studios
  ALTER COLUMN calendar_feed_token SET NOT NULL;

-- Crea unique constraint solo se non esiste già
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'studios_calendar_feed_token_unique'
  ) THEN
    ALTER TABLE studios
      ADD CONSTRAINT studios_calendar_feed_token_unique
      UNIQUE (calendar_feed_token);
  END IF;
END $$;

-- 4. Crea indice per lookup veloce dal token
CREATE INDEX IF NOT EXISTS idx_studios_calendar_feed_token
  ON studios (calendar_feed_token);

-- 5. RLS: nessuno deve poter leggere i token di altri studi
--    (la query lato client deve sempre filtrare per studio_id dell'utente)
--    Le policy RLS esistenti su `studios` già limitano la lettura ai propri
--    studi, ma aggiungiamo un commento di sicurezza per chiarezza.
COMMENT ON COLUMN studios.calendar_feed_token IS
  'Token UUID univoco per il feed iCal pubblico (/api/calendar.ics?token=…). '
  'Da non condividere pubblicamente. Può essere rigenerato dalle Impostazioni '
  'in caso di compromissione.';

COMMIT;

-- ─── VERIFICA POST-MIGRATION ─────────────────────────────────────────────
-- Esegui questa query per controllare:
--
--   SELECT id, name, calendar_feed_token FROM studios LIMIT 10;
--
-- Ogni studio deve avere un UUID nel campo. Tutti diversi tra loro.
