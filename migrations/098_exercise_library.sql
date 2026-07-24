-- ═══════════════════════════════════════════════════════════════════════
-- Migration 098: Libreria esercizi dello studio
-- ═══════════════════════════════════════════════════════════════════════
--
-- PERCHÉ:
-- Oggi ogni scheda esercizi si costruisce da zero: gli esercizi vivono
-- come JSON dentro schede_esercizi_pubbliche e non esistono al di fuori
-- del singolo paziente. Chi assegna dieci volte lo stesso esercizio per la
-- cuffia dei rotatori lo riscrive dieci volte, con descrizioni ogni volta
-- un po' diverse.
--
-- Qui gli esercizi diventano un archivio dello studio: si salvano una
-- volta, si ripescano sempre. Chi lavora in due su uno studio scrive lo
-- stesso esercizio nello stesso modo, che è anche una questione di qualità
-- verso il paziente.
--
-- LA FORMA È QUELLA CHE C'È GIÀ:
-- le colonne rispecchiano il tipo Esercizio usato dalle schede
-- (ExerciseProgramSection), così un esercizio ripescato dalla libreria
-- entra nella scheda senza conversioni.
--
-- La libreria NON sostituisce le schede: resta possibile scrivere un
-- esercizio al volo senza salvarlo, e le schede già create non cambiano.
--
-- COPIA, NON COLLEGAMENTO:
-- portando un esercizio dalla libreria nella scheda se ne copiano i valori.
-- Se poi si corregge la libreria, le schede già consegnate ai pazienti non
-- cambiano sotto i piedi — cosa desiderabile: quel foglio è già stampato o
-- già aperto sul telefono di qualcuno.
--
-- NOTA TRANSAZIONI: niente BEGIN;/COMMIT; — il runner esegue il file
-- dentro exec_migration_sql(), dove i comandi di transazione danno
-- "EXECUTE of transaction commands is not implemented [0A000]".
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.studio_exercise_library;
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.studio_exercise_library (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id     UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,

  nome          TEXT NOT NULL,
  descrizione   TEXT NOT NULL DEFAULT '',
  serie         TEXT NOT NULL DEFAULT '',
  ripetizioni   TEXT NOT NULL DEFAULT '',
  frequenza     TEXT NOT NULL DEFAULT '',
  note          TEXT,
  avvertenze    TEXT,
  youtube_id    TEXT,
  image_url     TEXT,
  categoria     TEXT,

  -- Etichette libere per ritrovarlo: "spalla", "post-operatorio", "anziani"
  tags          TEXT[] NOT NULL DEFAULT '{}',

  -- Quante volte è stato usato: i più usati vanno in cima all'elenco
  use_count     INTEGER NOT NULL DEFAULT 0,
  last_used_at  TIMESTAMPTZ,

  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sel_studio_idx
  ON public.studio_exercise_library (studio_id, use_count DESC, nome)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS sel_tags_idx
  ON public.studio_exercise_library USING GIN (tags);

ALTER TABLE public.studio_exercise_library ENABLE ROW LEVEL SECURITY;

-- La libreria è patrimonio dello studio: tutti la leggono e tutti la
-- alimentano. A differenza della scheda clinica, aggiungere un esercizio
-- non cambia il modo di lavorare di nessun altro.
DROP POLICY IF EXISTS sel_studio_select ON public.studio_exercise_library;
CREATE POLICY sel_studio_select ON public.studio_exercise_library
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS sel_studio_insert ON public.studio_exercise_library;
CREATE POLICY sel_studio_insert ON public.studio_exercise_library
  FOR INSERT TO authenticated
  WITH CHECK (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS sel_studio_update ON public.studio_exercise_library;
CREATE POLICY sel_studio_update ON public.studio_exercise_library
  FOR UPDATE TO authenticated
  USING (studio_id IN (SELECT my_studios()))
  WITH CHECK (studio_id IN (SELECT my_studios()));

-- Eliminazione riservata ai titolari: un esercizio cancellato per sbaglio
-- è lavoro di scrittura perso per tutto lo studio.
DROP POLICY IF EXISTS sel_owner_delete ON public.studio_exercise_library;
CREATE POLICY sel_owner_delete ON public.studio_exercise_library
  FOR DELETE TO authenticated
  USING (studio_id IN (SELECT my_owned_studios()));

COMMENT ON TABLE public.studio_exercise_library IS
  'Archivio esercizi riutilizzabili dello studio. Portandone uno in una scheda se ne copiano i valori: correggere la libreria non altera le schede già consegnate (mig. 098).';

-- ─── Verifica post-migration ─────────────────────────────────────────
--   SELECT nome, categoria, tags, use_count
--     FROM studio_exercise_library WHERE is_active
--    ORDER BY use_count DESC;
