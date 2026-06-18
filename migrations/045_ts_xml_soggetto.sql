-- ═══════════════════════════════════════════════════════════════════════
-- Migration 045: dati del soggetto per la generazione del file XML Sistema TS
-- ═══════════════════════════════════════════════════════════════════════
--
-- Servono per la radice del tracciato e per la naturaIVA:
--   - ts_cf_proprietario  → codice fiscale del professionista (cfProprietario,
--                           verrà cifrato con SanitelCF.cer in fase di export)
--   - ts_regime_forfettario → true = forfettario (naturaIVA N2.2 in fattura),
--                             false = ordinario esente art.10 (naturaIVA N4)
--   - ts_dispositivo      → numero dispositivo del documento fiscale (default 1)
--
-- ROLLBACK:
--   ALTER TABLE practice_settings
--     DROP COLUMN IF EXISTS ts_cf_proprietario,
--     DROP COLUMN IF EXISTS ts_regime_forfettario,
--     DROP COLUMN IF EXISTS ts_dispositivo;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE practice_settings
  ADD COLUMN IF NOT EXISTS ts_cf_proprietario   TEXT,
  ADD COLUMN IF NOT EXISTS ts_regime_forfettario BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ts_dispositivo        SMALLINT NOT NULL DEFAULT 1;

COMMENT ON COLUMN practice_settings.ts_cf_proprietario IS
  'Codice fiscale del professionista (cfProprietario del tracciato Sistema TS), '
  'cifrato con SanitelCF.cer al momento della generazione del file XML.';
COMMENT ON COLUMN practice_settings.ts_regime_forfettario IS
  'true = forfettario (naturaIVA N2.2 in fattura); false = ordinario esente '
  'art.10 DPR 633/72 (naturaIVA N4). (mig. 045)';
COMMENT ON COLUMN practice_settings.ts_dispositivo IS
  'Numero dispositivo del documento fiscale per il tracciato TS (default 1).';
