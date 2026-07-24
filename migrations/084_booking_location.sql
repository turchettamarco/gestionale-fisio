-- ═══════════════════════════════════════════════════════════════════════
-- Migration 084: Sede sulle richieste di prenotazione online
-- ═══════════════════════════════════════════════════════════════════════
--
-- PROBLEMA:
-- La mig. 077 ha portato gli orari di apertura per sede
-- (working_hours.location_id), ma il booking pubblico non è mai stato
-- adeguato: come nota la 077 stessa, era stato solo "tappato" con
-- .is("location_id", null) per continuare a leggere l'orario di studio.
-- Con due sedi che aprono in giorni diversi (Pontecorvo tutti i giorni,
-- Cassino solo martedì e giovedì) il paziente si vedeva proporre slot in
-- una sede chiusa, e la richiesta non portava con sé nessuna sede.
--
-- In più confirmBooking creava l'appuntamento SENZA location_id: una
-- prenotazione web confermata finiva senza sede e, in uno studio
-- multi-sede, nella corsia sbagliata del calendario.
--
-- SOLUZIONE:
-- location_id anche su booking_requests, così la sede scelta dal paziente
-- viaggia dalla pagina pubblica fino all'appuntamento creato.
--   NULL  → nessuna sede indicata (studio con una sola sede, o richieste
--           arrivate prima di questa migration): comportamento storico.
--   Valorizzato → la sede scelta dal paziente.
--
-- ON DELETE SET NULL e non CASCADE: se una sede viene eliminata, la
-- richiesta di prenotazione (che è uno storico) non deve sparire.
--
-- NOTA TRANSAZIONI: niente BEGIN;/COMMIT; — il runner esegue il file
-- dentro exec_migration_sql(), dove i comandi di transazione danno
-- "EXECUTE of transaction commands is not implemented [0A000]".
--
-- ROLLBACK:
--   ALTER TABLE booking_requests DROP COLUMN IF EXISTS location_id;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.booking_requests
  ADD COLUMN IF NOT EXISTS location_id UUID
  REFERENCES public.studio_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS booking_requests_location_idx
  ON public.booking_requests (location_id)
  WHERE location_id IS NOT NULL;

COMMENT ON COLUMN public.booking_requests.location_id IS
  'Sede scelta dal paziente nella pagina pubblica. NULL = non indicata (studio con una sola sede o richiesta antecedente alla mig. 084).';

-- ─── Verifica post-migration ─────────────────────────────────────────
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'booking_requests' AND column_name = 'location_id';
