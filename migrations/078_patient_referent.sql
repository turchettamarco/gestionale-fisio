-- ═══════════════════════════════════════════════════════════════════════
-- Migration 078: Terapista di riferimento del paziente (Step 2)
-- ═══════════════════════════════════════════════════════════════════════
--
-- PROBLEMA:
-- In uno studio con più terapisti ogni paziente ha di fatto "il suo"
-- professionista, ma il gestionale non lo sa: a ogni nuovo appuntamento
-- bisogna ricordarsi di scegliere l'operatore giusto. È l'attrito
-- quotidiano più frequente, e l'errore più facile da fare in segreteria.
--
-- SOLUZIONE:
-- referent_operator_id sul paziente. Quando lo si seleziona in creazione,
-- l'appuntamento si assegna da solo al suo terapista. Resta sempre
-- modificabile: è un valore predefinito, non un vincolo.
--
-- NULL = nessun riferimento, comportamento storico invariato (l'operatore
-- resta quello scelto a mano, o il creatore per via del trigger mig. 067).
--
-- Il campo punta a auth.users come appointments.operator_id, così il
-- confronto è diretto. ON DELETE SET NULL: se il collaboratore lascia lo
-- studio i pazienti restano, semplicemente senza riferimento.
--
-- ROLLBACK:
--   ALTER TABLE patients DROP COLUMN IF EXISTS referent_operator_id;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS referent_operator_id UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS patients_referent_idx
  ON public.patients (studio_id, referent_operator_id)
  WHERE referent_operator_id IS NOT NULL;

COMMENT ON COLUMN public.patients.referent_operator_id IS
  'Terapista di riferimento: preseleziona l''operatore nei nuovi appuntamenti. NULL = nessuno (mig. 078).';
