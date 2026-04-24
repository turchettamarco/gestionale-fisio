-- ═══════════════════════════════════════════════════════════════════════
-- Migration 008: Email transazionali + Onboarding tracking
-- ═══════════════════════════════════════════════════════════════════════
--
-- AGGIUNGE:
-- 1. Tracking onboarding studio (per sapere se mostrare il wizard)
-- 2. Tabella email_log (per tracciare email inviate, evitare duplicati,
--    e debug)
-- 3. Tabella password_reset_tokens (per il flusso "ho dimenticato la
--    password")
-- 4. Indice su studios.plan_expires_at (per il cron promemoria scadenza)
--
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Onboarding tracking ────────────────────────────────────────────
-- Aggiungi colonna per sapere quando lo studio ha completato il wizard.
-- Se NULL → wizard ancora da fare → redirect automatico al primo login.
ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

COMMENT ON COLUMN studios.onboarded_at IS
  'Timestamp del completamento del wizard di onboarding. Se NULL, '
  'il wizard viene mostrato all''utente al primo accesso.';

-- ─── 2. Email log ──────────────────────────────────────────────────────
-- Traccia tutte le email inviate per debug, deduplicazione, statistiche.
CREATE TABLE IF NOT EXISTS email_log (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID         REFERENCES studios(id) ON DELETE CASCADE,
  recipient_email TEXT         NOT NULL,
  template        TEXT         NOT NULL,    -- es. 'welcome', 'reset_password', 'plan_expiring'
  subject         TEXT         NOT NULL,
  status          TEXT         NOT NULL DEFAULT 'sent', -- 'sent', 'failed', 'queued'
  provider_id     TEXT,                     -- ID di tracking di Resend
  error_message   TEXT,                     -- se status='failed'
  metadata        JSONB        DEFAULT '{}'::jsonb,
  sent_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_studio_template
  ON email_log (studio_id, template, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_log_recipient
  ON email_log (recipient_email, sent_at DESC);

-- RLS: solo admin può vedere il log completo, ogni studio vede solo i propri
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_log_studio_read ON email_log;
CREATE POLICY email_log_studio_read ON email_log
  FOR SELECT
  USING (
    studio_id IN (
      SELECT studio_id FROM studio_members WHERE user_id = auth.uid()
    )
  );

-- ─── 3. Password reset tokens ───────────────────────────────────────────
-- Token UUID per il flusso "Reimposta password".
-- NB: in realtà Supabase Auth ha già un suo sistema di reset password.
-- Questa tabella serve per tracciare le richieste e per email custom.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT         NOT NULL,
  expires_at  TIMESTAMPTZ  NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user
  ON password_reset_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_expires
  ON password_reset_tokens (expires_at)
  WHERE used_at IS NULL;

-- ─── 4. Plan expiration tracking ────────────────────────────────────────
-- Aggiungi colonna scadenza piano (per cron promemoria 7gg prima).
-- Se NULL → piano illimitato/permanente.
ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_studios_plan_expires_at
  ON studios (plan_expires_at)
  WHERE plan_expires_at IS NOT NULL;

COMMENT ON COLUMN studios.plan_expires_at IS
  'Data di scadenza del piano corrente. NULL = illimitato. '
  'Il cron job /api/cron/plan-expiring controlla 7 giorni prima e invia email.';

-- ─── 5. Email verification tracking (per email "Conferma indirizzo") ────
-- Traccia se l'email dell'utente è stata verificata.
-- NB: Supabase Auth ha già email_confirmed_at in auth.users, lo riusiamo.
-- Aggiungo solo una vista comoda per query lato app.
CREATE OR REPLACE VIEW v_user_email_status AS
SELECT
  u.id AS user_id,
  u.email,
  u.email_confirmed_at IS NOT NULL AS email_confirmed,
  u.email_confirmed_at,
  sm.studio_id,
  sm.role
FROM auth.users u
LEFT JOIN studio_members sm ON sm.user_id = u.id;

COMMIT;

-- ─── VERIFICA POST-MIGRATION ─────────────────────────────────────────────
-- Esegui per controllare:
--
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name='studios' AND column_name IN ('onboarded_at','plan_expires_at');
--
--   SELECT count(*) FROM email_log;        -- deve dare 0
--   SELECT count(*) FROM password_reset_tokens;  -- deve dare 0
--
-- Tutto ok se non ci sono errori.
