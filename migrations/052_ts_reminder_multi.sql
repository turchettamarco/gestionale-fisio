-- ═══════════════════════════════════════════════════════════════════════
-- Migration 052: promemoria Sistema TS a selezione multipla
-- ═══════════════════════════════════════════════════════════════════════
--
-- ts_reminder_cadence diventa una lista separata da virgola di una o più
-- frequenze: 'monthly', 'quarterly', 'semiannual', 'annual'.
-- Vuoto o 'off' = nessun promemoria. Il cron invia se ALMENO una scatta nel mese.
-- Si rimuove il vecchio vincolo a valore singolo.
--
-- ROLLBACK: (riportare a valore singolo)
--   ALTER TABLE practice_settings
--     ADD CONSTRAINT practice_settings_ts_reminder_cadence_chk
--     CHECK (ts_reminder_cadence IN ('off','monthly','quarterly','semiannual'));
-- ═══════════════════════════════════════════════════════════════════════

-- garantisce la colonna anche se la 048 non fosse stata applicata
ALTER TABLE practice_settings
  ADD COLUMN IF NOT EXISTS ts_reminder_cadence TEXT NOT NULL DEFAULT 'monthly';

-- rimuove il vincolo a valore singolo (consente la lista separata da virgola)
ALTER TABLE practice_settings
  DROP CONSTRAINT IF EXISTS practice_settings_ts_reminder_cadence_chk;

COMMENT ON COLUMN practice_settings.ts_reminder_cadence IS
  'Promemoria invio Sistema TS: lista separata da virgola di monthly|quarterly|semiannual|annual. Vuoto/off = disattivato. (mig. 052)';
