-- ═══════════════════════════════════════════════════════════════════════
-- Migration 090: Prezzo visibile per singolo servizio
-- ═══════════════════════════════════════════════════════════════════════
--
-- PERCHÉ:
-- Finora la scelta sui prezzi era tutto-o-niente per l'intero studio
-- (studios.booking_show_prices, mig. 085). Ma capita di voler pubblicare
-- il prezzo di una voce sola — il noleggio della magnetoterapia a 7 € al
-- giorno — e tenere riservati quelli delle prestazioni cliniche, che
-- dipendono dal caso, dalla convenzione o dal pacchetto.
--
-- COSA CAMBIA:
-- show_price su ogni servizio. Le due impostazioni si combinano così:
--
--   booking_show_prices = FALSE  →  nessun prezzo, comunque (interruttore
--                                   generale, ha la precedenza)
--   booking_show_prices = TRUE   →  si vedono i prezzi dei soli servizi
--                                   con show_price = TRUE
--
-- Default TRUE: chi ha già configurato il listino non vede cambiare nulla.
-- Per mostrare solo il noleggio basta togliere la spunta agli altri.
--
-- NOTA TRANSAZIONI: niente BEGIN;/COMMIT; — il runner esegue il file
-- dentro exec_migration_sql(), dove i comandi di transazione danno
-- "EXECUTE of transaction commands is not implemented [0A000]".
--
-- ROLLBACK:
--   ALTER TABLE booking_services DROP COLUMN IF EXISTS show_price;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.booking_services
  ADD COLUMN IF NOT EXISTS show_price boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.booking_services.show_price IS
  'Se FALSE il prezzo di questo servizio non compare nella pagina pubblica, anche quando lo studio mostra i prezzi. Subordinato a studios.booking_show_prices, che se disattivo li nasconde tutti (mig. 090).';

-- ─── Verifica post-migration ─────────────────────────────────────────
--   SELECT name, price, price_unit, show_price
--     FROM booking_services ORDER BY sort_order;
