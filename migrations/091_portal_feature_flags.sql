-- ═══════════════════════════════════════════════════════════════════════
-- Migration 091: Interruttori di visibilità dell'area paziente
-- ═══════════════════════════════════════════════════════════════════════
--
-- PERCHÉ:
-- L'area paziente sta diventando il contenitore unico di tutto ciò che il
-- paziente può vedere e fare: appuntamenti, storico, prenotazione,
-- esercizi, scale di valutazione, consensi. Non tutti gli studi vogliono
-- mostrare tutto — chi non usa le scale non deve ritrovarsi un riquadro
-- vuoto, chi preferisce gestire le prenotazioni al telefono deve poter
-- togliere quel pulsante.
--
-- Ogni blocco ha quindi il suo interruttore in Impostazioni → Area
-- Paziente. Tutti attivi per default: chi ha già mandato il link ai
-- pazienti non vede cambiare nulla.
--
-- portal_show_amounts (mig. 087) resta separato perché non accende o
-- spegne un blocco: decide se dentro lo storico si vedono le cifre.
--
-- NOTA TRANSAZIONI: niente BEGIN;/COMMIT; — il runner esegue il file
-- dentro exec_migration_sql(), dove i comandi di transazione danno
-- "EXECUTE of transaction commands is not implemented [0A000]".
--
-- ROLLBACK:
--   ALTER TABLE studios
--     DROP COLUMN IF EXISTS portal_show_appointments,
--     DROP COLUMN IF EXISTS portal_show_history,
--     DROP COLUMN IF EXISTS portal_show_booking,
--     DROP COLUMN IF EXISTS portal_show_exercises,
--     DROP COLUMN IF EXISTS portal_show_scales,
--     DROP COLUMN IF EXISTS portal_show_consents;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS portal_show_appointments boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_show_history      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_show_booking      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_show_exercises    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_show_scales       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_show_consents     boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.studios.portal_show_appointments IS
  'Area paziente: mostra il riquadro dei prossimi appuntamenti (mig. 091).';
COMMENT ON COLUMN public.studios.portal_show_history IS
  'Area paziente: mostra lo storico delle sedute svolte. Gli importi al suo interno dipendono da portal_show_amounts (mig. 091).';
COMMENT ON COLUMN public.studios.portal_show_booking IS
  'Area paziente: mostra il pulsante per richiedere un appuntamento. Ha effetto solo se la prenotazione online è attiva (mig. 091).';
COMMENT ON COLUMN public.studios.portal_show_exercises IS
  'Area paziente: mostra la scheda esercizi assegnata (mig. 091).';
COMMENT ON COLUMN public.studios.portal_show_scales IS
  'Area paziente: mostra i questionari di valutazione in attesa di compilazione (mig. 091).';
COMMENT ON COLUMN public.studios.portal_show_consents IS
  'Area paziente: mostra i consensi informati da firmare (mig. 091).';

-- ─── Verifica post-migration ─────────────────────────────────────────
--   SELECT name, portal_show_appointments, portal_show_history,
--          portal_show_booking, portal_show_exercises,
--          portal_show_scales, portal_show_consents, portal_show_amounts
--     FROM studios;
