-- ═══════════════════════════════════════════════════════════════════════
-- Migration 096: Schede cliniche multiple, scelte per paziente
-- ═══════════════════════════════════════════════════════════════════════
--
-- PERCHÉ:
-- La mig. 095 dava allo studio UNA scheda clinica, uguale per tutti. Ma
-- chi lavora come fisioterapista e osteopata ragiona in due modi diversi,
-- e uno studio con più professionisti ne ha ancora di più. Con una scheda
-- sola, o si sceglie quella di uno o si fa un ibrido che non va bene a
-- nessuno. In più, caricato un modello, non si poteva più cambiarlo.
--
-- COSA CAMBIA:
--   • studio_clinical_templates — le schede dello studio, ognuna col suo
--     nome ("Fisioterapia", "Osteopatia", "Prima visita"...).
--   • studio_clinical_fields.template_id — ogni campo appartiene a una
--     scheda.
--   • patients.clinical_template_id — quale scheda usa quel paziente.
--     NULL = quella predefinita dello studio.
--
-- I VALORI NON SI PERDONO CAMBIANDO SCHEDA:
-- patients.custom_clinical è una mappa id_campo → valore, e gli id dei
-- campi non cambiano. Passando un paziente da una scheda all'altra si
-- vedono i campi della nuova, ma le risposte date sulla vecchia restano
-- salvate e ricompaiono se lo si riporta indietro.
--
-- MIGRAZIONE DELL'ESISTENTE:
-- per ogni studio che ha già campi (mig. 095) si crea una scheda
-- "Scheda clinica" e vi si agganciano tutti: chi aveva già configurato
-- non deve rifare nulla.
--
-- NOTA TRANSAZIONI: niente BEGIN;/COMMIT; — il runner esegue il file
-- dentro exec_migration_sql(), dove i comandi di transazione danno
-- "EXECUTE of transaction commands is not implemented [0A000]".
--
-- ROLLBACK:
--   ALTER TABLE patients DROP COLUMN IF EXISTS clinical_template_id;
--   ALTER TABLE studio_clinical_fields DROP COLUMN IF EXISTS template_id;
--   DROP TABLE IF EXISTS public.studio_clinical_templates;
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.studio_clinical_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id   UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sct_studio_idx
  ON public.studio_clinical_templates (studio_id, sort_order);

ALTER TABLE public.studio_clinical_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sct_studio_select ON public.studio_clinical_templates;
CREATE POLICY sct_studio_select ON public.studio_clinical_templates
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_studios()));

-- Creare e modificare le schede riguarda tutto lo studio: solo titolari.
DROP POLICY IF EXISTS sct_owner_insert ON public.studio_clinical_templates;
CREATE POLICY sct_owner_insert ON public.studio_clinical_templates
  FOR INSERT TO authenticated
  WITH CHECK (studio_id IN (SELECT my_owned_studios()));

DROP POLICY IF EXISTS sct_owner_update ON public.studio_clinical_templates;
CREATE POLICY sct_owner_update ON public.studio_clinical_templates
  FOR UPDATE TO authenticated
  USING (studio_id IN (SELECT my_owned_studios()))
  WITH CHECK (studio_id IN (SELECT my_owned_studios()));

DROP POLICY IF EXISTS sct_owner_delete ON public.studio_clinical_templates;
CREATE POLICY sct_owner_delete ON public.studio_clinical_templates
  FOR DELETE TO authenticated
  USING (studio_id IN (SELECT my_owned_studios()));

COMMENT ON TABLE public.studio_clinical_templates IS
  'Schede cliniche dello studio: ognuna raccoglie i propri campi. Il paziente ne usa una, scelta in cartella (mig. 096).';

-- ── Il campo appartiene a una scheda ───────────────────────────────────

ALTER TABLE public.studio_clinical_fields
  ADD COLUMN IF NOT EXISTS template_id UUID
  REFERENCES public.studio_clinical_templates(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS scf_template_order_idx
  ON public.studio_clinical_fields (template_id, sort_order)
  WHERE is_active;

-- ── Il paziente usa una scheda ─────────────────────────────────────────

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS clinical_template_id UUID
  REFERENCES public.studio_clinical_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.patients.clinical_template_id IS
  'Scheda clinica usata per questo paziente. NULL = quella predefinita dello studio (mig. 096).';

-- ── Aggancio dei campi già esistenti (mig. 095) ────────────────────────

DO $$
DECLARE
  r RECORD;
  nuovo_id UUID;
BEGIN
  FOR r IN
    SELECT DISTINCT studio_id
    FROM public.studio_clinical_fields
    WHERE template_id IS NULL
  LOOP
    INSERT INTO public.studio_clinical_templates (studio_id, name, is_default, sort_order)
    VALUES (r.studio_id, 'Scheda clinica', true, 10)
    RETURNING id INTO nuovo_id;

    UPDATE public.studio_clinical_fields
    SET template_id = nuovo_id
    WHERE studio_id = r.studio_id AND template_id IS NULL;
  END LOOP;
END $$;

-- ─── Verifica post-migration ─────────────────────────────────────────
--   SELECT t.name, t.is_default, count(f.id) AS campi
--     FROM studio_clinical_templates t
--     LEFT JOIN studio_clinical_fields f
--       ON f.template_id = t.id AND f.is_active
--    GROUP BY t.id, t.name, t.is_default
--    ORDER BY t.sort_order;
