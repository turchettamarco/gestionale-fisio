-- ═══════════════════════════════════════════════════════════════════════
-- Migration 088: Ordinamento e unità di prezzo dei servizi prenotabili
-- ═══════════════════════════════════════════════════════════════════════
--
-- COSA AGGIUNGE:
--
-- 1. sort_order: fino a ora i servizi erano elencati in ordine alfabetico,
--    sia in Impostazioni sia sulla pagina pubblica. Così "Prima visita"
--    finiva dopo "Laser terapia" e non si poteva mettere in cima ciò che
--    conta di più. Ora l'ordine lo decide lo studio.
--
--    Il backfill assegna 10, 20, 30… seguendo l'ordine alfabetico attuale:
--    chi ha già configurato i servizi non vede nulla spostarsi al primo
--    accesso. I salti da 10 servono a poter inserire in mezzo senza
--    riscrivere tutte le righe.
--
-- 2. price_unit: testo libero facoltativo mostrato dopo il prezzo, per i
--    servizi tariffati su un'unità diversa dalla seduta — tipicamente i
--    noleggi ("€7 al giorno"). NULL per tutti gli altri, che restano
--    esattamente come sono: è un campo aggiuntivo, non cambia nulla per
--    chi non lo usa.
--
-- NOTA TRANSAZIONI: niente BEGIN;/COMMIT; — il runner esegue il file
-- dentro exec_migration_sql(), dove i comandi di transazione danno
-- "EXECUTE of transaction commands is not implemented [0A000]".
--
-- ROLLBACK:
--   ALTER TABLE booking_services DROP COLUMN IF EXISTS sort_order;
--   ALTER TABLE booking_services DROP COLUMN IF EXISTS price_unit;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.booking_services
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_unit text;

-- Backfill: numera i servizi esistenti seguendo l'ordine alfabetico con
-- cui erano mostrati finora, separatamente per ogni studio.
UPDATE public.booking_services bs
SET sort_order = ordinati.pos * 10
FROM (
  SELECT id, row_number() OVER (PARTITION BY studio_id ORDER BY name) AS pos
  FROM public.booking_services
) AS ordinati
WHERE bs.id = ordinati.id
  AND bs.sort_order = 0;

CREATE INDEX IF NOT EXISTS booking_services_studio_order_idx
  ON public.booking_services (studio_id, sort_order, name);

COMMENT ON COLUMN public.booking_services.sort_order IS
  'Ordine di visualizzazione dei servizi, in Impostazioni e nella pagina pubblica. Valori crescenti = più in alto. A parità di valore si ordina per nome (mig. 088).';

COMMENT ON COLUMN public.booking_services.price_unit IS
  'Unità facoltativa mostrata dopo il prezzo, es. "al giorno" per i noleggi. NULL = prezzo a seduta, visualizzazione invariata (mig. 088).';

-- ─── Verifica post-migration ─────────────────────────────────────────
--   SELECT name, sort_order, price, price_unit
--     FROM booking_services ORDER BY studio_id, sort_order, name;
