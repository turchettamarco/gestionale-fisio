-- ═══════════════════════════════════════════════════════════════════════
-- Migration 093: Autovalutazione pre-visita
-- ═══════════════════════════════════════════════════════════════════════
--
-- PERCHÉ:
-- I primi dieci minuti di una prima visita se ne vanno in domande sempre
-- uguali: da quanto tempo, come è iniziato, cosa peggiora, che esami ha
-- fatto, che farmaci prende. Farle compilare a casa prima dell'incontro
-- restituisce quel tempo alla valutazione vera e arriva con il paziente
-- che ci ha già ragionato sopra.
--
-- Il questionario comprende anche le domande sulle bandiere rosse (perdita
-- di peso non spiegata, febbre, disturbi sfinterici, dolore notturno che
-- sveglia): non decidono nulla da sole, ma se il paziente le segnala è
-- bene saperlo PRIMA di averlo sul lettino, non a metà seduta.
--
-- COME FUNZIONA:
-- Il terapista genera l'invito dalla cartella del paziente. Nasce una riga
-- in stato 'pending' con un token personale; il paziente la compila dal
-- link o dalla sua area riservata; le risposte restano in payload e il
-- terapista le rilegge nella scheda.
--
-- ACCESSO: il paziente scrive via service role con il suo token, come per
-- consensi (mig. 034) e diario del dolore (mig. 092). Lo staff legge e
-- crea tramite RLS sul proprio studio.
--
-- Le risposte NON si sovrascrivono a quanto già presente in cartella:
-- sono quello che dice il paziente, non una valutazione clinica. È il
-- terapista a decidere cosa riportare nell'anamnesi.
--
-- NOTA TRANSAZIONI: niente BEGIN;/COMMIT; — il runner esegue il file
-- dentro exec_migration_sql(), dove i comandi di transazione danno
-- "EXECUTE of transaction commands is not implemented [0A000]".
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.patient_intake;
--   ALTER TABLE studios DROP COLUMN IF EXISTS portal_show_intake;
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.patient_intake (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id     UUID NOT NULL REFERENCES public.studios(id)  ON DELETE CASCADE,
  patient_id    UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  access_token  TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'completed', 'cancelled')),
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS patient_intake_patient_idx
  ON public.patient_intake (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS patient_intake_studio_pending_idx
  ON public.patient_intake (studio_id)
  WHERE status = 'pending';

ALTER TABLE public.patient_intake ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_intake_studio_select ON public.patient_intake;
CREATE POLICY patient_intake_studio_select ON public.patient_intake
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS patient_intake_studio_insert ON public.patient_intake;
CREATE POLICY patient_intake_studio_insert ON public.patient_intake
  FOR INSERT TO authenticated
  WITH CHECK (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS patient_intake_studio_update ON public.patient_intake;
CREATE POLICY patient_intake_studio_update ON public.patient_intake
  FOR UPDATE TO authenticated
  USING (studio_id IN (SELECT my_studios()))
  WITH CHECK (studio_id IN (SELECT my_studios()));

COMMENT ON TABLE public.patient_intake IS
  'Autovalutazione compilata dal paziente prima della visita. Le risposte in payload sono dichiarazioni del paziente, non una valutazione clinica (mig. 093).';

-- Interruttore per l'area paziente (stessa logica di mig. 091/092)
ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS portal_show_intake boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.studios.portal_show_intake IS
  'Area paziente: mostra le autovalutazioni pre-visita da compilare (mig. 093).';

-- ─── Verifica post-migration ─────────────────────────────────────────
--   SELECT id, status, sent_at, completed_at FROM patient_intake;
