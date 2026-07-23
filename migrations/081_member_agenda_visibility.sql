-- ═══════════════════════════════════════════════════════════════════════
-- Migration 081: Chi compare in agenda
-- ═══════════════════════════════════════════════════════════════════════
--
-- PROBLEMA:
-- Le colonne e i filtri dell'agenda si costruiscono su TUTTI i membri
-- attivi, senza distinguere chi svolge sedute da chi no. Risultato: la
-- segretaria compare in calendario come se fosse un terapista. E poiché il
-- trigger di auto-assegnazione (mig. 067) intesta l'appuntamento a chi lo
-- crea, gli appuntamenti che inserisce lei le vengono pure assegnati.
--
-- SOLUZIONE:
--   1. shows_in_agenda su studio_members: chi ha una propria agenda.
--      Default TRUE, ma la migration lo mette a FALSE per gli assistenti
--      (segreteria), che è il caso che ha generato il problema.
--      Resta modificabile a mano: un titolare che non riceve pazienti può
--      togliersi dall'agenda, un assistente che fa anche trattamenti può
--      essere rimesso.
--   2. Il trigger 067 non assegna più a chi non ha agenda propria. Se il
--      paziente ha un terapista di riferimento (mig. 078) l'appuntamento
--      va a lui; altrimenti resta non assegnato, che è la verità: la
--      segretaria ha prenotato, ma la seduta non è sua.
--
-- ROLLBACK:
--   ALTER TABLE studio_members DROP COLUMN IF EXISTS shows_in_agenda;
--   (e ripristinare fn_appointments_default_operator dalla mig. 067)
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.studio_members
  ADD COLUMN IF NOT EXISTS shows_in_agenda BOOLEAN NOT NULL DEFAULT TRUE;

-- La segreteria non ha un'agenda di sedute.
UPDATE public.studio_members
   SET shows_in_agenda = FALSE
 WHERE role = 'assistant';

COMMENT ON COLUMN public.studio_members.shows_in_agenda IS
  'TRUE se il membro ha una propria agenda (colonna e filtri in calendario). FALSE per chi non svolge sedute, es. segreteria (mig. 081).';

-- ── Auto-assegnazione consapevole del ruolo ─────────────────────────────
CREATE OR REPLACE FUNCTION fn_appointments_default_operator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid;
  v_owner     uuid;
  v_in_agenda boolean;
  v_referent  uuid;
BEGIN
  -- Già assegnato o appuntamento ospite: non si tocca.
  IF NEW.operator_id IS NOT NULL OR NEW.guest_practitioner_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_uid := auth.uid();

  -- a) Il creatore, ma solo se ha un'agenda propria.
  IF v_uid IS NOT NULL THEN
    SELECT COALESCE(m.shows_in_agenda, TRUE) INTO v_in_agenda
    FROM studio_members m
    WHERE m.studio_id = NEW.studio_id
      AND m.user_id = v_uid
      AND COALESCE(m.is_active, TRUE)
    LIMIT 1;

    IF v_in_agenda THEN
      NEW.operator_id := v_uid;
      RETURN NEW;
    END IF;

    -- b) Chi prenota non svolge sedute (segreteria): si prova con il
    --    terapista di riferimento del paziente.
    IF v_in_agenda IS NOT NULL THEN
      SELECT p.referent_operator_id INTO v_referent
      FROM patients p WHERE p.id = NEW.patient_id LIMIT 1;

      IF v_referent IS NOT NULL THEN
        NEW.operator_id := v_referent;
      END IF;
      -- Nessun riferimento: si lascia non assegnato. È corretto, e in
      -- calendario finisce nella colonna "Non assegnati" dove si vede.
      RETURN NEW;
    END IF;
  END IF;

  -- c) Inserimenti di sistema (cron, service role): al titolare.
  SELECT m.user_id INTO v_owner
  FROM studio_members m
  WHERE m.studio_id = NEW.studio_id
    AND m.role IN ('owner', 'co_owner')
    AND m.user_id IS NOT NULL
    AND COALESCE(m.shows_in_agenda, TRUE)
  ORDER BY m.created_at NULLS LAST
  LIMIT 1;

  IF v_owner IS NOT NULL THEN
    NEW.operator_id := v_owner;
  END IF;

  RETURN NEW;
END;
$$;
