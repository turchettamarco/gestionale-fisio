-- ═══════════════════════════════════════════════════════════════════════
-- Migration 087: Importi visibili nell'area paziente
-- ═══════════════════════════════════════════════════════════════════════
--
-- COSA AGGIUNGE:
-- portal_show_amounts su studios. Lo storico sedute nell'area paziente
-- mostra anche quanto è stato pagato e quanto resta da saldare: utile per
-- molti studi, ma non per tutti (tariffe differenziate, convenzioni,
-- accordi personali che non si vogliono mettere per iscritto in una
-- pagina raggiungibile da un link).
--
-- Con il valore a FALSE lo storico resta visibile — date, orari e tipo di
-- trattamento — ma senza cifre: niente importo per seduta e niente totale
-- da saldare. Gli importi non vengono proprio inclusi nella risposta del
-- server, quindi non sono recuperabili nemmeno ispezionando la pagina.
--
-- Default TRUE: comportamento invariato per chi ha già inviato il link.
--
-- NOTA TRANSAZIONI: niente BEGIN;/COMMIT; — il runner esegue il file
-- dentro exec_migration_sql(), dove i comandi di transazione danno
-- "EXECUTE of transaction commands is not implemented [0A000]".
--
-- ROLLBACK:
--   ALTER TABLE studios DROP COLUMN IF EXISTS portal_show_amounts;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS portal_show_amounts boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.studios.portal_show_amounts IS
  'Se FALSE, lo storico sedute nell''area paziente (/portale/{token}) non mostra importi né totale da saldare: restano solo data, orario e trattamento. Gli importi sono esclusi lato server, non nascosti via CSS (mig. 087).';

-- ─── Verifica post-migration ─────────────────────────────────────────
--   SELECT name, portal_show_amounts FROM studios;
