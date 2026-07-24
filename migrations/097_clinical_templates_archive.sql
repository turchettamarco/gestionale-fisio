-- ═══════════════════════════════════════════════════════════════════════
-- Migration 097: Le schede cliniche si archiviano, non si cancellano
-- ═══════════════════════════════════════════════════════════════════════
--
-- PROBLEMA:
-- Con la mig. 096 eliminare una scheda cancellava i suoi campi (ON DELETE
-- CASCADE). Le risposte dei pazienti restavano in patients.custom_clinical
-- — sono indicizzate per id del campo — ma senza i campi si perdevano le
-- ETICHETTE: rimanevano coppie "id casuale → valore" illeggibili per
-- chiunque. In una cartella clinica è inaccettabile: quello che è stato
-- scritto su un paziente deve restare consultabile.
--
-- SOLUZIONE:
-- is_active anche sulle schede. Eliminare significa archiviare: la scheda
-- sparisce dall'elenco e dal menu del paziente, ma campi ed etichette
-- restano nel database e le risposte continuano a essere leggibili nella
-- cartella, in sola lettura. Una scheda archiviata si può ripristinare.
--
-- Stessa logica già adottata per i singoli campi nella mig. 095.
--
-- NOTA TRANSAZIONI: niente BEGIN;/COMMIT; — il runner esegue il file
-- dentro exec_migration_sql(), dove i comandi di transazione danno
-- "EXECUTE of transaction commands is not implemented [0A000]".
--
-- ROLLBACK:
--   ALTER TABLE studio_clinical_templates DROP COLUMN IF EXISTS is_active;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.studio_clinical_templates
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS sct_studio_active_idx
  ON public.studio_clinical_templates (studio_id, sort_order)
  WHERE is_active;

COMMENT ON COLUMN public.studio_clinical_templates.is_active IS
  'FALSE = scheda archiviata: non compare più fra quelle selezionabili, ma i suoi campi e le risposte già raccolte restano leggibili nella cartella del paziente (mig. 097).';

-- ─── Verifica post-migration ─────────────────────────────────────────
--   SELECT name, is_active, is_default FROM studio_clinical_templates
--    ORDER BY sort_order;
