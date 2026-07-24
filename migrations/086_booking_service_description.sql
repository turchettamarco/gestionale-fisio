-- ═══════════════════════════════════════════════════════════════════════
-- Migration 086: Descrizione dei servizi prenotabili
-- ═══════════════════════════════════════════════════════════════════════
--
-- COSA AGGIUNGE:
-- description su booking_services: una riga breve sotto il nome del
-- servizio nella pagina pubblica, che spiega al paziente cosa comprende
-- (es. "Prima visita fisioterapica" → "Valutazione clinica e piano
-- terapeutico personalizzato").
--
-- Si compila a mano oppure si fa proporre dall'AI a partire dal nome del
-- servizio (pulsante in Impostazioni → Prenotazione Online). Resta
-- comunque un campo di testo normale: quello che scrive l'AI è una bozza
-- modificabile, non un valore imposto.
--
-- NULL o vuota = la pagina mostra solo nome e durata, come prima.
--
-- NOTA TRANSAZIONI: niente BEGIN;/COMMIT; — il runner esegue il file
-- dentro exec_migration_sql(), dove i comandi di transazione danno
-- "EXECUTE of transaction commands is not implemented [0A000]".
--
-- ROLLBACK:
--   ALTER TABLE booking_services DROP COLUMN IF EXISTS description;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.booking_services
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.booking_services.description IS
  'Riga di spiegazione mostrata sotto il nome del servizio nella pagina pubblica di prenotazione. Compilabile a mano o proposta dall''AI dal nome del servizio (mig. 086).';

-- ─── Verifica post-migration ─────────────────────────────────────────
--   SELECT name, duration, price, description FROM booking_services;
