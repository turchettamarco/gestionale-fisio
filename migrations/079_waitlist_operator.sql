-- ═══════════════════════════════════════════════════════════════════════
-- Migration 079: Lista d'attesa per operatore (Step 4)
-- ═══════════════════════════════════════════════════════════════════════
--
-- PROBLEMA:
-- waitlist_entries è di STUDIO: registra "questo paziente aspetta un posto",
-- senza dire con chi. Con un team la domanda vera è diversa: il paziente
-- che segue Elena non vuole un posto qualsiasi, vuole un posto DA ELENA.
-- Senza questo dato, quando si libera uno slot la segreteria non sa a chi
-- proporlo davvero.
--
-- SOLUZIONE:
-- operator_id sulla riga di attesa:
--   NULL  = va bene chiunque (comportamento storico, invariato)
--   valorizzato = aspetta quel professionista
--
-- Al momento dell'inserimento, se il paziente ha un terapista di
-- riferimento (mig. 078) è naturale proporlo come default: lo fa il client,
-- non un trigger, perché resta una scelta della segreteria.
--
-- ROLLBACK:
--   ALTER TABLE waitlist_entries DROP COLUMN IF EXISTS operator_id;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.waitlist_entries
  ADD COLUMN IF NOT EXISTS operator_id UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS waitlist_entries_operator_idx
  ON public.waitlist_entries (studio_id, operator_id)
  WHERE operator_id IS NOT NULL AND status = 'active';

COMMENT ON COLUMN public.waitlist_entries.operator_id IS
  'Professionista atteso. NULL = va bene chiunque (mig. 079).';
