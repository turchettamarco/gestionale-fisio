-- ═══════════════════════════════════════════════════════════════════════
-- Migration 049: abilitazione email di riepilogo dopo l'invio al Sistema TS
-- ═══════════════════════════════════════════════════════════════════════
--
--   - ts_invio_email_enabled → se true, dopo un invio accolto FisioHub invia
--     (posticipata di qualche minuto) un'email con report + ricevuta PDF.
--
-- ROLLBACK:
--   ALTER TABLE practice_settings DROP COLUMN IF EXISTS ts_invio_email_enabled;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE practice_settings
  ADD COLUMN IF NOT EXISTS ts_invio_email_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN practice_settings.ts_invio_email_enabled IS
  'Se true, invia email di riepilogo (report + ricevuta PDF) dopo l''invio al Sistema TS. (mig. 049)';
