-- ═══════════════════════════════════════════════════════════════════════
-- Migration 017: Error logs (logging strutturato lato client e server)
-- ═══════════════════════════════════════════════════════════════════════
--
-- OBIETTIVO:
-- Avere visibilità sugli errori che accadono in produzione, sia lato client
-- (browser dei colleghi beta tester) sia lato server (API routes).
--
-- COSA LOGGHIAMO:
-- - Errori JS non catturati (window.onerror, ErrorBoundary)
-- - Fetch fallite (AbortError, 5xx, timeout)
-- - Errori applicativi catturati esplicitamente con logger.error(...)
--
-- COSA NON LOGGHIAMO:
-- - Dati personali del paziente (PII): no nomi, telefoni, ecc. nel context
-- - Token o credenziali: il logger.ts li sanitizza prima di inviare
--
-- VOLUME ATTESO:
-- - In condizioni normali: 0-50 righe al giorno per studio
-- - Durante un bug serio: anche 100-1000 righe (rate-limiting nel logger)
--
-- POLITICA RETENTION:
-- - 90 giorni (cancellazione automatica via cron, non in questa migration)
--
-- ROLLBACK:
-- DROP TABLE IF EXISTS error_logs;
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Tabella error_logs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS error_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Chi (può essere NULL se errore prima del login)
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  studio_id       UUID REFERENCES studios(id) ON DELETE SET NULL,

  -- Severità
  level           TEXT NOT NULL DEFAULT 'error'
    CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),

  -- Cosa
  message         TEXT NOT NULL,
  error_name      TEXT,
  stack           TEXT,

  -- Dove
  source          TEXT NOT NULL DEFAULT 'client'
    CHECK (source IN ('client', 'server', 'cron', 'webhook')),
  url             TEXT,

  -- Contesto tecnico (sanitizzato lato client per evitare PII)
  user_agent      TEXT,
  context         JSONB,

  -- Quando
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Per dedupe rapida (stesso errore ripetuto N volte → si può aggregare)
  fingerprint     TEXT
);

COMMENT ON TABLE error_logs IS
  'Log errori applicativi (client + server). Retention: 90 giorni. '
  'Sanitizzato dal client per non contenere PII.';

-- ─── Indici per le query tipiche ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_error_logs_studio_recent
  ON error_logs (studio_id, occurred_at DESC)
  WHERE studio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint_recent
  ON error_logs (fingerprint, occurred_at DESC)
  WHERE fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_logs_user_recent
  ON error_logs (user_id, occurred_at DESC)
  WHERE user_id IS NOT NULL;

-- ─── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS error_logs_select ON error_logs;
CREATE POLICY error_logs_select ON error_logs
  FOR SELECT USING (
    studio_id IS NULL
    OR studio_id IN (SELECT my_studios())
  );

DROP POLICY IF EXISTS error_logs_insert ON error_logs;
CREATE POLICY error_logs_insert ON error_logs
  FOR INSERT WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
  );

COMMIT;
