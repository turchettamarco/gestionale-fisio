-- ═══════════════════════════════════════════════════════════════════════
-- Migration 085: Prenotazione online — indirizzo modificabile e prezzi
-- ═══════════════════════════════════════════════════════════════════════
--
-- COSA AGGIUNGE:
-- 1. booking_show_prices: se lo studio vuole pubblicare o meno i prezzi
--    del listino sulla pagina di prenotazione. Default TRUE = comportamento
--    attuale invariato (i prezzi si vedevano già); chi non li vuole
--    mostrare lo disattiva da Impostazioni.
-- 2. Vincolo di formato su booking_slug. Fino alla mig. 083 lo slug era
--    generato dal sistema e quindi sempre valido; ora diventa modificabile
--    dal titolare in Impostazioni, quindi il formato va garantito nel
--    database e non solo nell'interfaccia (l'unicità era già coperta dal
--    vincolo UNIQUE della 083).
--
-- FORMATO AMMESSO: minuscole, cifre e trattini singoli non iniziali/finali
-- (es. "studio-turchetta"), da 3 a 60 caratteri.
--
-- NOTA: il listino dei servizi prenotabili (booking_services) NON viene
-- precompilato da nessuna parte, né qui né altrove: ogni studio parte
-- senza nessun servizio e li configura lui. Nessun seed da rimuovere.
--
-- NOTA TRANSAZIONI: niente BEGIN;/COMMIT; — il runner esegue il file
-- dentro exec_migration_sql(), dove i comandi di transazione danno
-- "EXECUTE of transaction commands is not implemented [0A000]".
--
-- ROLLBACK:
--   ALTER TABLE studios DROP CONSTRAINT IF EXISTS studios_booking_slug_format;
--   ALTER TABLE studios DROP COLUMN IF EXISTS booking_show_prices;
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Toggle prezzi sulla pagina pubblica ─────────────────────────────

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS booking_show_prices boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.studios.booking_show_prices IS
  'Se TRUE la pagina /prenota/{slug} mostra i prezzi del listino accanto ai servizi. Se FALSE mostra solo nome e durata (mig. 085).';

-- ── 2. Normalizza gli slug esistenti prima di vincolarli ───────────────
-- Gli slug generati dalla 083 rispettano già il formato, ma uno studio con
-- nome cortissimo può averne prodotto uno sotto i 3 caratteri (es. "AB" →
-- "ab"). Qui si sistemano quei casi, gestendo eventuali collisioni, così
-- il vincolo sotto non può fallire su dati preesistenti.

DO $$
DECLARE
  r RECORD;
  candidate text;
  suffix int;
BEGIN
  FOR r IN
    SELECT id, booking_slug FROM public.studios
    WHERE booking_slug IS NULL
       OR booking_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       OR length(booking_slug) < 3
       OR length(booking_slug) > 60
  LOOP
    candidate := left(coalesce(fn_slugify(r.booking_slug), 'studio'), 60);
    IF candidate IS NULL OR length(candidate) < 3 THEN
      candidate := 'studio-' || left(replace(r.id::text, '-', ''), 6);
    END IF;

    suffix := 1;
    WHILE EXISTS (
      SELECT 1 FROM public.studios WHERE booking_slug = candidate AND id <> r.id
    ) LOOP
      suffix := suffix + 1;
      candidate := left(candidate, 55) || '-' || suffix;
    END LOOP;

    UPDATE public.studios SET booking_slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- ── 3. Vincolo di formato ──────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'studios_booking_slug_format'
  ) THEN
    ALTER TABLE public.studios
      ADD CONSTRAINT studios_booking_slug_format CHECK (
        booking_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        AND length(booking_slug) BETWEEN 3 AND 60
      );
  END IF;
END $$;

COMMENT ON COLUMN public.studios.booking_slug IS
  'Indirizzo pubblico della pagina di prenotazione: myfisiohub.app/prenota/{slug}. Generato dal nome studio alla mig. 083, modificabile dal titolare in Impostazioni. Minuscole, cifre e trattini, 3-60 caratteri, univoco (mig. 083, 085).';

-- ─── Verifica post-migration ─────────────────────────────────────────
--   SELECT name, booking_slug, booking_public_enabled, booking_show_prices
--     FROM studios ORDER BY created_at;
