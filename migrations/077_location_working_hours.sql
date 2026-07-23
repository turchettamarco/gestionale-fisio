-- ═══════════════════════════════════════════════════════════════════════
-- Migration 077: Orari di apertura per sede (Tappa M, step 3)
-- ═══════════════════════════════════════════════════════════════════════
--
-- PROBLEMA:
-- working_hours è per STUDIO. Con due sedi che aprono in giorni e orari
-- diversi (es. Pontecorvo tutti i giorni, Cassino solo martedì e giovedì
-- pomeriggio) non è modellabile: l'agenda mostra la stessa griglia
-- ovunque e la prenotazione online propone slot in una sede chiusa.
--
-- MODELLO:
--   location_id IS NULL   → riga di STUDIO (default, comportamento storico)
--   location_id valorizzato → orario di QUELLA sede
-- Una sede senza righe proprie eredita l'orario dello studio: nessuna
-- configurazione obbligatoria, chi ha una sola sede non tocca nulla.
--
-- ATTENZIONE COMPATIBILITÀ (patch incluse in questo stesso rilascio):
--   1. Tutte le SELECT esistenti filtravano solo per studio_id: aggiunto
--      .is("location_id", null) così continuano a leggere l'orario di
--      studio (impostazioni, dashboard, occupazione, onboarding, booking).
--      Senza, mescolerebbero le righe delle sedi e i conti sarebbero errati.
--   2. Gli UPSERT passano a onConflict "studio_id,location_id,day_of_week".
--
-- REQUISITO: PostgreSQL 15+ per UNIQUE NULLS NOT DISTINCT (Supabase lo è).
-- Serve perché due righe di studio con location_id NULL devono collidere
-- fra loro: con la semantica standard NULL ≠ NULL e si creerebbero
-- duplicati silenziosi per lo stesso giorno.
--
-- ROLLBACK:
--   ALTER TABLE working_hours DROP CONSTRAINT working_hours_studio_loc_day_uq;
--   ALTER TABLE working_hours DROP COLUMN IF EXISTS location_id;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.working_hours
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES studio_locations(id) ON DELETE CASCADE;

-- Sostituzione dei vincoli di unicità esistenti
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.working_hours'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.working_hours DROP CONSTRAINT %I', c.conname);
  END LOOP;

  -- Indici unici "nudi" (non generati da un constraint): quelli dei
  -- constraint sono già stati rimossi sopra. Si escludono esplicitamente
  -- la PRIMARY KEY e ogni indice di supporto a un vincolo, altrimenti
  -- DROP INDEX fallisce con "cannot drop index ... required by constraint".
  FOR c IN
    SELECT i.relname AS conname
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'working_hours'
      AND x.indisunique
      AND NOT x.indisprimary
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint pc WHERE pc.conindid = x.indexrelid
      )
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', c.conname);
  END LOOP;

  -- Idempotente: se la migration viene rilanciata dopo un errore, il
  -- vincolo potrebbe già esistere.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.working_hours'::regclass
      AND conname = 'working_hours_studio_loc_day_uq'
  ) THEN
    ALTER TABLE public.working_hours
      ADD CONSTRAINT working_hours_studio_loc_day_uq
      UNIQUE NULLS NOT DISTINCT (studio_id, location_id, day_of_week);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS working_hours_location_idx
  ON public.working_hours (location_id)
  WHERE location_id IS NOT NULL;

COMMENT ON COLUMN public.working_hours.location_id IS
  'NULL = orario dello studio (default ereditato). Valorizzato = orario di quella sede (mig. 077).';
