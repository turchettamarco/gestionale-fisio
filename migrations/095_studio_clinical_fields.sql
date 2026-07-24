-- ═══════════════════════════════════════════════════════════════════════
-- Migration 095: Scheda clinica configurabile
-- ═══════════════════════════════════════════════════════════════════════
--
-- PERCHÉ:
-- Finora il quadro clinico era una struttura fissa decisa dal software:
-- otto campi di anamnesi, test ortopedici, obiettivi, sempre quelli per
-- tutti. Ma l'anamnesi di un fisioterapista non è quella di un osteopata,
-- e due terapisti della stessa disciplina lavorano in modo diverso. Il
-- risultato è che chi non usa quei campi li subisce, e la compilazione
-- diventa lunga e macchinosa.
--
-- Da qui ogni studio si costruisce la propria scheda: i campi che gli
-- servono, del tipo che gli serve, nell'ordine che vuole.
--
-- DUE PEZZI:
--  1. studio_clinical_fields — la definizione dei campi, per studio.
--  2. patients.custom_clinical — le risposte, una mappa
--     { id_campo: valore } sul singolo paziente.
--
-- Il valore sta in JSONB e non in colonne dedicate perché i campi li
-- decide l'utente a runtime: non si può creare una colonna per ognuno.
--
-- COSA NON TOCCA:
-- Anamnesi, diagnosi e trattamento liberi restano dove sono, e così i
-- blocchi strutturati esistenti: chi li usa continua a usarli. La scheda
-- configurabile si aggiunge, non sostituisce nulla. Uno studio che non
-- definisce campi non vede alcun cambiamento.
--
-- CANCELLAZIONE DI UN CAMPO:
-- si disattiva (is_active = false) invece di eliminarlo, così i valori già
-- raccolti sui pazienti restano leggibili e non si creano buchi nello
-- storico clinico.
--
-- NOTA TRANSAZIONI: niente BEGIN;/COMMIT; — il runner esegue il file
-- dentro exec_migration_sql(), dove i comandi di transazione danno
-- "EXECUTE of transaction commands is not implemented [0A000]".
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.studio_clinical_fields;
--   ALTER TABLE patients DROP COLUMN IF EXISTS custom_clinical;
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.studio_clinical_fields (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id   UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  hint        TEXT,
  type        TEXT NOT NULL DEFAULT 'textarea'
              CHECK (type IN ('text','textarea','select','multiselect','scale','checkbox','date')),
  -- elenco di scelte per select e multiselect, ignorato dagli altri tipi
  options     JSONB NOT NULL DEFAULT '[]'::jsonb,
  section     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scf_studio_order_idx
  ON public.studio_clinical_fields (studio_id, sort_order)
  WHERE is_active;

ALTER TABLE public.studio_clinical_fields ENABLE ROW LEVEL SECURITY;

-- Lettura: chiunque nello studio, serve per compilare la scheda paziente
DROP POLICY IF EXISTS scf_studio_select ON public.studio_clinical_fields;
CREATE POLICY scf_studio_select ON public.studio_clinical_fields
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_studios()));

-- Modifica della struttura: solo i titolari. Cambiare i campi della scheda
-- clinica riguarda tutto lo studio, non è una preferenza personale.
DROP POLICY IF EXISTS scf_owner_insert ON public.studio_clinical_fields;
CREATE POLICY scf_owner_insert ON public.studio_clinical_fields
  FOR INSERT TO authenticated
  WITH CHECK (studio_id IN (SELECT my_owned_studios()));

DROP POLICY IF EXISTS scf_owner_update ON public.studio_clinical_fields;
CREATE POLICY scf_owner_update ON public.studio_clinical_fields
  FOR UPDATE TO authenticated
  USING (studio_id IN (SELECT my_owned_studios()))
  WITH CHECK (studio_id IN (SELECT my_owned_studios()));

DROP POLICY IF EXISTS scf_owner_delete ON public.studio_clinical_fields;
CREATE POLICY scf_owner_delete ON public.studio_clinical_fields
  FOR DELETE TO authenticated
  USING (studio_id IN (SELECT my_owned_studios()));

COMMENT ON TABLE public.studio_clinical_fields IS
  'Campi della scheda clinica definiti dallo studio: ogni terapista costruisce la propria struttura. I valori stanno in patients.custom_clinical (mig. 095).';

-- ── Valori sul paziente ────────────────────────────────────────────────

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS custom_clinical JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.patients.custom_clinical IS
  'Risposte ai campi personalizzati della scheda clinica: mappa { id_campo: valore }. La definizione dei campi sta in studio_clinical_fields (mig. 095).';

-- ─── Verifica post-migration ─────────────────────────────────────────
--   SELECT label, type, sort_order, is_active
--     FROM studio_clinical_fields ORDER BY studio_id, sort_order;
