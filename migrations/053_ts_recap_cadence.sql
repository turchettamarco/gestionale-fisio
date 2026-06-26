-- ═══════════════════════════════════════════════════════════════════════
-- Migration 053: riepilogo periodico degli invii al Sistema TS
-- ═══════════════════════════════════════════════════════════════════════
--
-- ts_recap_cadence: lista separata da virgola di 'monthly' e/o 'annual'.
-- Vuoto/off = disattivato. Il cron mensile (1° del mese) invia, oltre al
-- promemoria, un'email con la lista di tutti gli invii del periodo concluso
-- (mese precedente e/o anno precedente).
--
-- ROLLBACK:
--   ALTER TABLE practice_settings DROP COLUMN IF EXISTS ts_recap_cadence;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE practice_settings
  ADD COLUMN IF NOT EXISTS ts_recap_cadence TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN practice_settings.ts_recap_cadence IS
  'Riepilogo periodico invii TS: lista separata da virgola di monthly|annual. Vuoto = disattivato. (mig. 053)';
