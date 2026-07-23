-- ═══════════════════════════════════════════════════════════════════════
-- Migration 082: "Può prenotare per i colleghi"
-- ═══════════════════════════════════════════════════════════════════════
--
-- PROBLEMA:
-- Il permesso 'agenda.create' consente di creare appuntamenti, ma non dice
-- NULLA su a chi intestarli. Risultato: un terapista con livello Base può
-- inserire pazienti nell'agenda di un collega, che se li ritrova senza
-- averlo deciso. Segreteria e titolari devono poterlo fare, un terapista
-- di norma no.
--
-- SOLUZIONE:
-- Nuovo permesso 'agenda.book_for_others', incluso nei livelli "Completo
-- paziente" e "Accesso totale" (segreteria), assente in "Base" e
-- "Intermedio". Titolare e co-titolare lo hanno sempre.
--
-- Chi non ce l'ha può comunque creare appuntamenti: semplicemente restano
-- suoi. Se non sceglie nessun operatore, ci pensa il trigger della mig.
-- 067/081 ad assegnarli a lui.
--
-- Due controlli, non uno:
--   • INSERT: non si può creare un appuntamento intestato ad altri.
--   • UPDATE: non si può nemmeno prendere un proprio appuntamento e
--     girarlo a un collega, che sarebbe la scorciatoia ovvia.
--
-- ROLLBACK:
--   (ripristinare has_permission dalla mig. 072 e le due policy sotto)
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. has_permission: il nuovo permesso nei livelli alti ───────────────
CREATE OR REPLACE FUNCTION public.has_permission(p_studio_id uuid, p_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   text;
  v_preset text;
  v_perms  jsonb;
  v_base   text[] := ARRAY[
    'patient.name_full','patient.age','patient.clinical','agenda.create'];
  v_medium text[] := ARRAY[
    'patient.name_full','patient.age','patient.clinical','agenda.create',
    'patient.birthdate','patient.history_full','patient.attachments',
    'patient.email','agenda.view_all','manage.waitlist'];
  v_full   text[] := ARRAY[
    'patient.name_full','patient.age','patient.clinical','agenda.create',
    'patient.birthdate','patient.history_full','patient.attachments',
    'patient.email','agenda.view_all','manage.waitlist',
    'patient.phone','patient.address','patient.fiscal_code',
    'patient.notes_private','agenda.edit_others','agenda.book_for_others',
    'manage.patients_edit','manage.exports'];
BEGIN
  IF p_studio_id IS NULL OR auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT m.role, m.permission_preset, m.permissions
    INTO v_role, v_preset, v_perms
  FROM studio_members m
  WHERE m.studio_id = p_studio_id
    AND m.user_id = auth.uid()
    AND COALESCE(m.is_active, TRUE)
  LIMIT 1;

  IF v_role IS NULL THEN RETURN FALSE; END IF;
  IF v_role IN ('owner', 'co_owner') THEN RETURN TRUE; END IF;

  IF v_preset = 'custom' THEN
    RETURN COALESCE(v_perms, '[]'::jsonb) ? p_key;
  END IF;

  IF v_preset = 'all'          THEN RETURN TRUE; END IF;
  IF v_preset = 'patient_full' THEN RETURN p_key = ANY(v_full); END IF;
  IF v_preset = 'medium'       THEN RETURN p_key = ANY(v_medium); END IF;
  IF v_preset = 'base'         THEN RETURN p_key = ANY(v_base); END IF;

  -- Nessuna configurazione: default storico del ruolo.
  IF v_role = 'assistant' THEN RETURN TRUE; END IF;
  RETURN p_key = ANY(v_base);
END;
$$;

-- ── 2. INSERT: non si intesta un appuntamento ad altri ──────────────────
DROP POLICY IF EXISTS appointments_perm_insert ON public.appointments;
CREATE POLICY appointments_perm_insert ON public.appointments
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    has_permission(studio_id, 'agenda.create')
    AND (
      -- NULL: appuntamento di un ospite, o assegnazione lasciata al trigger
      operator_id IS NULL
      OR operator_id = auth.uid()
      OR has_permission(studio_id, 'agenda.book_for_others')
    )
  );

-- ── 3. UPDATE: né girarlo a un collega dopo averlo creato ───────────────
DROP POLICY IF EXISTS appointments_perm_update ON public.appointments;
CREATE POLICY appointments_perm_update ON public.appointments
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    has_permission(studio_id, 'agenda.edit_others')
    OR operator_id = auth.uid()
  )
  WITH CHECK (
    operator_id IS NULL
    OR operator_id = auth.uid()
    OR has_permission(studio_id, 'agenda.book_for_others')
  );

COMMENT ON FUNCTION public.has_permission(uuid, text) IS
  'Permessi granulari (mig. 071/072/082). Rispecchia i preset di src/lib/permissions.ts: modificare entrambi insieme.';
