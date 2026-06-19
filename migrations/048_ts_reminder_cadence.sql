-- ═══════════════════════════════════════════════════════════════════════
-- Migration 048: cadenza del promemoria di invio al Sistema TS
-- ═══════════════════════════════════════════════════════════════════════
--
--   - ts_reminder_cadence → 'off' | 'monthly' | 'quarterly' | 'semiannual'
--       off        = nessun promemoria
--       monthly    = ogni 1° del mese
--       quarterly  = ogni 3 mesi (1° gen/apr/lug/ott)
--       semiannual = ogni 6 mesi (1° gen/lug)
--
-- ROLLBACK:
--   ALTER TABLE practice_settings DROP COLUMN IF EXISTS ts_reminder_cadence;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE practice_settings
  ADD COLUMN IF NOT EXISTS ts_reminder_cadence TEXT NOT NULL DEFAULT 'monthly';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'practice_settings_ts_reminder_cadence_chk'
  ) THEN
    ALTER TABLE practice_settings
      ADD CONSTRAINT practice_settings_ts_reminder_cadence_chk
      CHECK (ts_reminder_cadence IN ('off', 'monthly', 'quarterly', 'semiannual'));
  END IF;
END $$;

COMMENT ON COLUMN practice_settings.ts_reminder_cadence IS
  'Cadenza promemoria invio Sistema TS: off | monthly | quarterly | semiannual. (mig. 048)';
