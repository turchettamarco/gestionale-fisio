-- ═══════════════════════════════════════════════════════════════════════
-- Migration 050: coda per l'invio posticipato dell'email di riepilogo TS
-- ═══════════════════════════════════════════════════════════════════════
--
-- Dopo un invio accolto, FisioHub accoda qui una richiesta; un cron
-- (ogni pochi minuti) la elabora quando send_after è passato, recupera la
-- ricevuta PDF con le credenziali salvate e invia l'email. Robusto anche a
-- scheda chiusa.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS ts_email_queue;
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ts_email_queue (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL,
  protocollo  text NOT NULL,
  periodo     text,
  esito       text,
  ambiente    text NOT NULL DEFAULT 'prod',
  righe       jsonb NOT NULL DEFAULT '[]'::jsonb,
  send_after  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz,
  attempts    integer NOT NULL DEFAULT 0,
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ts_email_queue_pending
  ON ts_email_queue (send_after)
  WHERE sent_at IS NULL;

ALTER TABLE ts_email_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ts_email_queue' AND policyname = 'ts_email_queue_owner_all'
  ) THEN
    CREATE POLICY ts_email_queue_owner_all ON ts_email_queue
      FOR ALL
      USING (owner_id = auth.uid())
      WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

COMMENT ON TABLE ts_email_queue IS
  'Coda per l''email di riepilogo post-invio Sistema TS, elaborata da cron ts-email-queue. (mig. 050)';
