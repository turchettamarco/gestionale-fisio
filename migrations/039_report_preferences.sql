-- ════════════════════════════════════════════════════════════════════════
-- migrations/039_report_preferences.sql
-- ════════════════════════════════════════════════════════════════════════
-- Preferenze invio report automatici via email (mig. 039).
--
-- L'owner sceglie dalle Impostazioni quali report ricevere. Ogni cadenza
-- è attivabile/disattivabile in modo indipendente:
--   - report_monthly_enabled    → 1° di ogni mese (mese precedente)
--   - report_quarterly_enabled  → 1° gen/apr/lug/ott (trimestre precedente)
--   - report_yearly_enabled     → 1° gennaio (anno precedente)
--
-- Default: solo mensile attivo (comportamento meno invasivo).
--
-- NB: nessun BEGIN/COMMIT — il runner non supporta comandi transazionali.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS report_monthly_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS report_quarterly_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS report_yearly_enabled    BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN studios.report_monthly_enabled IS
  'Invio automatico del report mensile PDF all''owner (1° del mese).';
COMMENT ON COLUMN studios.report_quarterly_enabled IS
  'Invio automatico del report trimestrale PDF (1° gen/apr/lug/ott).';
COMMENT ON COLUMN studios.report_yearly_enabled IS
  'Invio automatico del report annuale PDF (1° gennaio).';
