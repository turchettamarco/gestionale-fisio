-- ═══════════════════════════════════════════════════════════════════════
-- Migration 046: credenziali Web Service per l'invio automatico al Sistema TS
-- ═══════════════════════════════════════════════════════════════════════
--
-- Servono per autenticare la chiamata SOAP "inviaFileMtom" al Sistema TS:
--   - ts_ws_user      → utente (userid) del web service Sistema TS (HTTP Basic)
--   - ts_ws_password  → password del web service (HTTP Basic)
--   - ts_ws_pincode   → pincode in chiaro (verrà CIFRATO con SanitelCF.cer al
--                       momento dell'invio → campo pincodeInvianteCifrato)
--   - ts_ws_ambiente  → 'test' (collaudo SOGEI) | 'prod' (produzione)
--
-- Sono credenziali personali del professionista, protette da RLS
-- (owner_id = auth.uid()), nella sua sola riga di practice_settings.
--
-- ROLLBACK:
--   ALTER TABLE practice_settings
--     DROP COLUMN IF EXISTS ts_ws_user,
--     DROP COLUMN IF EXISTS ts_ws_password,
--     DROP COLUMN IF EXISTS ts_ws_pincode,
--     DROP COLUMN IF EXISTS ts_ws_ambiente;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE practice_settings
  ADD COLUMN IF NOT EXISTS ts_ws_user     TEXT,
  ADD COLUMN IF NOT EXISTS ts_ws_password TEXT,
  ADD COLUMN IF NOT EXISTS ts_ws_pincode  TEXT,
  ADD COLUMN IF NOT EXISTS ts_ws_ambiente TEXT NOT NULL DEFAULT 'test';

-- vincolo ambiente: solo 'test' o 'prod'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'practice_settings_ts_ws_ambiente_chk'
  ) THEN
    ALTER TABLE practice_settings
      ADD CONSTRAINT practice_settings_ts_ws_ambiente_chk
      CHECK (ts_ws_ambiente IN ('test', 'prod'));
  END IF;
END $$;

COMMENT ON COLUMN practice_settings.ts_ws_user IS
  'Utente (userid) del Web Service Sistema TS, usato in HTTP Basic Auth per inviaFileMtom. (mig. 046)';
COMMENT ON COLUMN practice_settings.ts_ws_password IS
  'Password del Web Service Sistema TS (HTTP Basic Auth). (mig. 046)';
COMMENT ON COLUMN practice_settings.ts_ws_pincode IS
  'Pincode Sistema TS in chiaro; viene cifrato con SanitelCF.cer al momento dell''invio (pincodeInvianteCifrato). (mig. 046)';
COMMENT ON COLUMN practice_settings.ts_ws_ambiente IS
  'Ambiente di invio: test (collaudo SOGEI) oppure prod (produzione). (mig. 046)';
