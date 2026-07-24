-- ═══════════════════════════════════════════════════════════════════════
-- Migration 083: Booking pubblico — fix multi-tenancy + pagina senza sito
-- ═══════════════════════════════════════════════════════════════════════
--
-- PROBLEMA (trovato in revisione, non introdotto ora):
-- La migration 009 (hardening RLS) ha ripulito le policy pre-multi-tenancy
-- di booking_requests/booking_services/blocked_days ma non le ha MAI
-- sostituite con policy corrette per lo staff autenticato. Risultato:
--   • booking_requests: nessuna policy SELECT/UPDATE per authenticated →
--     il pannello "Richieste prenotazione" in agenda è sempre vuoto.
--   • booking_services: policy SELECT esiste solo per il ruolo anon →
--     "Servizi prenotabili online" in Impostazioni è sempre vuoto per lo
--     staff (che è authenticated, non anon).
--   • blocked_days: nessuna policy affatto → "Giorni di chiusura" in
--     Impostazioni è sempre vuoto e non salva.
-- In più, il codice che leggeva queste tabelle non filtrava mai per
-- studio_id, quindi anche sistemando le policy sarebbero rimaste
-- multi-tenant SOLO grazie a RLS, senza query pulite lato client.
--
-- SOLUZIONE:
--   1. Policy multi-tenant complete per staff autenticato sulle 3 tabelle.
--   2. Rimossa la policy anon SELECT di booking_services: da ora la
--      pagina pubblica legge tramite API server-side con service role
--      (stesso pattern già usato da /api/public-agenda), non più RLS
--      anon aperta senza filtro studio.
--   3. booking_slug + booking_public_enabled su studios: per avere un
--      link di prenotazione ospitato da FisioHub stesso, utilizzabile
--      da chi non ha un sito (es. myfisiohub.app/prenota/nome-studio).
--
-- ROLLBACK:
--   DROP POLICY booking_requests_studio_select ON booking_requests;
--   DROP POLICY booking_requests_studio_update ON booking_requests;
--   DROP POLICY booking_services_studio_all ON booking_services;
--   DROP POLICY blocked_days_studio_all ON blocked_days;
--   ALTER TABLE studios DROP COLUMN IF EXISTS booking_slug;
--   ALTER TABLE studios DROP COLUMN IF EXISTS booking_public_enabled;
-- ═══════════════════════════════════════════════════════════════════════

-- NOTA SULLE TRANSAZIONI:
-- Niente BEGIN;/COMMIT; espliciti. Il runner (npm run db:migrate) passa
-- l'intero file a exec_migration_sql(), una funzione PL/pgSQL che fa
-- EXECUTE sql_text: lì i comandi di transazione danno
-- "EXECUTE of transaction commands is not implemented [0A000]".
-- La funzione gira comunque già dentro una transazione, quindi
-- l'atomicità è garantita lo stesso: se qualcosa fallisce, rollback di
-- tutto. (La mig. 009 ha BEGIN/COMMIT perché ai tempi veniva incollata
-- a mano nel SQL Editor di Supabase.)

-- ── 0. RLS attivo su tutte e tre le tabelle ────────────────────────────
-- Nessuna migration l'ha mai abilitato esplicitamente su booking_requests
-- e booking_services: se fosse spento, le policy sotto non verrebbero
-- nemmeno valutate e le tabelle resterebbero leggibili da chiunque abbia
-- la anon key. ENABLE è idempotente, quindi si può eseguire comunque.

ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_days     ENABLE ROW LEVEL SECURITY;

-- ── 1. BOOKING_REQUESTS — policy multi-tenant per lo staff ─────────────
-- (l'INSERT anon di mig. 009 resta invariato, serve al form pubblico)

DROP POLICY IF EXISTS booking_requests_studio_select ON public.booking_requests;
CREATE POLICY booking_requests_studio_select ON public.booking_requests
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS booking_requests_studio_update ON public.booking_requests;
CREATE POLICY booking_requests_studio_update ON public.booking_requests
  FOR UPDATE TO authenticated
  USING (studio_id IN (SELECT my_studios()))
  WITH CHECK (studio_id IN (SELECT my_studios()));

-- ── 2. BOOKING_SERVICES — via service role per il pubblico, RLS per staff ─
-- La lettura anon (mig. 009) non filtrava per studio: chiunque vedeva i
-- servizi di TUTTI gli studi. La rimuoviamo: la pagina pubblica ora passa
-- da un'API server-side che filtra esplicitamente per studio_id.

DROP POLICY IF EXISTS booking_services_read ON public.booking_services;

DROP POLICY IF EXISTS booking_services_studio_all ON public.booking_services;
CREATE POLICY booking_services_studio_all ON public.booking_services
  FOR ALL TO authenticated
  USING (studio_id IN (SELECT my_studios()))
  WITH CHECK (studio_id IN (SELECT my_studios()));

-- ── 3. BLOCKED_DAYS — mai avuta una policy multi-tenant, la aggiungiamo ──

DROP POLICY IF EXISTS blocked_days_studio_all ON public.blocked_days;
CREATE POLICY blocked_days_studio_all ON public.blocked_days
  FOR ALL TO authenticated
  USING (studio_id IN (SELECT my_studios()))
  WITH CHECK (studio_id IN (SELECT my_studios()));

-- ── 4. STUDIOS — slug pubblico + toggle pagina ospitata ─────────────────

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS booking_slug text,
  ADD COLUMN IF NOT EXISTS booking_public_enabled boolean NOT NULL DEFAULT false;

-- Genera uno slug leggibile e univoco da un testo (nome studio).
--
-- Niente unaccent(): su Supabase l'estensione vive nello schema
-- "extensions", che non è nel search_path di tutti i ruoli, e la funzione
-- è STABLE (non IMMUTABLE) — inglobarla qui darebbe una funzione dichiarata
-- male e potenzialmente un errore "function unaccent(text) does not exist".
-- translate() copre le lettere accentate italiane, che è quanto serve.
CREATE OR REPLACE FUNCTION fn_slugify(txt text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(
    trim(both '-' from regexp_replace(
      lower(translate(
        coalesce(txt, ''),
        'àáâäãåèéêëìíîïòóôöõùúûüçñÀÁÂÄÃÅÈÉÊËÌÍÎÏÒÓÔÖÕÙÚÛÜÇÑ',
        'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN'
      )),
      '[^a-z0-9]+', '-', 'g'
    )),
    ''
  );
$$;

-- Backfill: uno slug per ogni studio esistente che non ce l'ha, con
-- suffisso numerico in caso di collisione (nomi studio uguali).
DO $$
DECLARE
  r RECORD;
  base_slug text;
  candidate text;
  suffix int;
BEGIN
  FOR r IN SELECT id, name FROM public.studios WHERE booking_slug IS NULL ORDER BY created_at LOOP
    base_slug := coalesce(fn_slugify(r.name), 'studio');
    candidate := base_slug;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM public.studios WHERE booking_slug = candidate) LOOP
      suffix := suffix + 1;
      candidate := base_slug || '-' || suffix;
    END LOOP;
    UPDATE public.studios SET booking_slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.studios ALTER COLUMN booking_slug SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'studios_booking_slug_unique'
  ) THEN
    ALTER TABLE public.studios
      ADD CONSTRAINT studios_booking_slug_unique UNIQUE (booking_slug);
  END IF;
END $$;

-- Auto-genera lo slug anche per i nuovi studi creati in futuro.
CREATE OR REPLACE FUNCTION fn_studios_default_booking_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base_slug text;
  candidate text;
  suffix int;
BEGIN
  IF NEW.booking_slug IS NOT NULL THEN
    RETURN NEW;
  END IF;

  base_slug := coalesce(fn_slugify(NEW.name), 'studio');
  candidate := base_slug;
  suffix := 1;
  WHILE EXISTS (SELECT 1 FROM public.studios WHERE booking_slug = candidate) LOOP
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  END LOOP;

  NEW.booking_slug := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_studios_default_booking_slug ON public.studios;
CREATE TRIGGER trg_studios_default_booking_slug
  BEFORE INSERT ON public.studios
  FOR EACH ROW
  EXECUTE FUNCTION fn_studios_default_booking_slug();

COMMENT ON COLUMN public.studios.booking_slug IS
  'Slug univoco per il link di prenotazione pubblico ospitato: myfisiohub.app/prenota/{slug} (mig. 083).';
COMMENT ON COLUMN public.studios.booking_public_enabled IS
  'Se TRUE, la pagina /prenota/{slug} è raggiungibile pubblicamente. Default FALSE: va attivata a mano dallo studio (mig. 083).';

-- ─── Verifica post-migration ─────────────────────────────────────────
--   SELECT id, name, booking_slug, booking_public_enabled FROM studios;
