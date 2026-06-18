-- ═══════════════════════════════════════════════════════════════════════
-- Migration 047: protocollo ed esito dell'invio Sistema TS sulle spese
-- ═══════════════════════════════════════════════════════════════════════
--
--   - ts_protocollo → protocollo restituito dal Sistema TS all'invio del file
--   - ts_esito      → esito sintetico recuperato dalla ricevuta
--                     (es. "Accolto", "Accolto con N errori", descrizione)
--   - ts_esito_at   → quando è stato verificato l'esito
--
-- ROLLBACK:
--   ALTER TABLE appointments
--     DROP COLUMN IF EXISTS ts_protocollo,
--     DROP COLUMN IF EXISTS ts_esito,
--     DROP COLUMN IF EXISTS ts_esito_at;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS ts_protocollo TEXT,
  ADD COLUMN IF NOT EXISTS ts_esito      TEXT,
  ADD COLUMN IF NOT EXISTS ts_esito_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_appointments_ts_protocollo
  ON appointments (ts_protocollo)
  WHERE ts_protocollo IS NOT NULL;

COMMENT ON COLUMN appointments.ts_protocollo IS
  'Protocollo restituito dal Sistema TS al momento dell''invio del file. (mig. 047)';
COMMENT ON COLUMN appointments.ts_esito IS
  'Esito sintetico dell''invio recuperato dalla ricevuta Sistema TS. (mig. 047)';
COMMENT ON COLUMN appointments.ts_esito_at IS
  'Data/ora dell''ultima verifica esito Sistema TS. (mig. 047)';
