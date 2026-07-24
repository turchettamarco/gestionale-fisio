-- ═══════════════════════════════════════════════════════════════════════
-- Migration 089: Durata facoltativa sui servizi prenotabili
-- ═══════════════════════════════════════════════════════════════════════
--
-- PERCHÉ:
-- Non tutte le voci del listino sono sedute con una durata. Il noleggio di
-- un apparecchio, per esempio, si paga al giorno e non ha senso mostrarlo
-- come "60 min". Finora la durata era obbligatoria e finiva comunque
-- stampata sotto il nome del servizio nella pagina pubblica.
--
-- COSA CAMBIA:
-- duration diventa facoltativa. Lasciando il campo vuoto in Impostazioni
-- il valore resta NULL e la pagina pubblica non mostra alcun minutaggio:
-- rimangono nome, descrizione e prezzo.
--
-- Per il calcolo degli orari liberi, un servizio senza durata occupa uno
-- slot di 30 minuti (valore usato solo per capire dove c'è posto in
-- agenda, mai mostrato al paziente).
--
-- Nota: rendere la colonna nullable basta anche in presenza di eventuali
-- vincoli CHECK del tipo "duration > 0": in SQL un CHECK su un valore
-- NULL non fallisce, viene considerato soddisfatto.
--
-- L'istruzione è idempotente: se la colonna è già nullable non fa nulla.
--
-- NOTA TRANSAZIONI: niente BEGIN;/COMMIT; — il runner esegue il file
-- dentro exec_migration_sql(), dove i comandi di transazione danno
-- "EXECUTE of transaction commands is not implemented [0A000]".
--
-- ROLLBACK (solo se nessun servizio ha durata NULL):
--   UPDATE booking_services SET duration = 30 WHERE duration IS NULL;
--   ALTER TABLE booking_services ALTER COLUMN duration SET NOT NULL;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.booking_services
  ALTER COLUMN duration DROP NOT NULL;

COMMENT ON COLUMN public.booking_services.duration IS
  'Durata in minuti. NULL = non indicata: la pagina pubblica non mostra il minutaggio e per gli slot si usano 30 minuti (mig. 089).';

-- ─── Verifica post-migration ─────────────────────────────────────────
--   SELECT name, duration, price, price_unit FROM booking_services
--    ORDER BY sort_order;
