-- ═══════════════════════════════════════════════════════════════════════
-- Migration 076: Notifiche all'operatore (Tappa M, step 2)
-- ═══════════════════════════════════════════════════════════════════════
--
-- PROBLEMA:
-- Le notifiche (mig. 012) sono di STUDIO e nascono da eventi del paziente
-- (conferma, disdetta, prenotazione online). Con un team serve l'altra
-- direzione: se assegno una seduta a Elena, o le sposto un appuntamento,
-- lei deve accorgersene senza dover ricontrollare l'agenda a mano.
--
-- COSA FA:
--   1. recipient_id sulle notifiche: NULL = notifica di studio (tutti la
--      vedono, comportamento storico invariato), valorizzato = destinata a
--      quella persona.
--   2. Tre nuovi tipi: 'assigned' (ti è stata assegnata una seduta),
--      'moved' (una tua seduta è stata spostata), 'unassigned' (una seduta
--      non è più tua).
--   3. Trigger su appointments che le genera automaticamente.
--
-- REGOLA CHE EVITA IL RUMORE:
-- Non si notifica mai a sé stessi. Se Elena sposta un proprio appuntamento
-- non riceve nulla; lo riceve solo se a spostarlo è stato qualcun altro.
-- Senza questa regola la campanella suonerebbe a ogni azione dell'utente e
-- verrebbe ignorata nel giro di due giorni.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_notify_operator ON appointments;
--   DROP FUNCTION IF EXISTS fn_notify_operator();
--   ALTER TABLE notifications DROP COLUMN IF EXISTS recipient_id;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON public.notifications (recipient_id, created_at DESC)
  WHERE recipient_id IS NOT NULL;

-- Nuovi tipi ammessi
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('confirm', 'cancel', 'booking', 'assigned', 'moved', 'unassigned'));
END $$;

-- ── Trigger di notifica ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_notify_operator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID := auth.uid();
  v_patient TEXT;
  v_when    TEXT;
BEGIN
  -- Annullati: se ne occupa già il flusso notifiche esistente.
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT btrim(COALESCE(p.last_name, '') || ' ' || COALESCE(p.first_name, ''))
    INTO v_patient
  FROM patients p WHERE p.id = NEW.patient_id LIMIT 1;

  v_when := to_char(NEW.start_at AT TIME ZONE 'Europe/Rome', 'DD/MM alle HH24:MI');

  -- ── Assegnazione a un nuovo operatore ───────────────────────────────
  IF NEW.operator_id IS NOT NULL
     AND NEW.operator_id IS DISTINCT FROM COALESCE(OLD.operator_id, NULL)
     AND NEW.operator_id IS DISTINCT FROM v_actor THEN
    INSERT INTO notifications (studio_id, recipient_id, type, appointment_id, patient_id, payload)
    VALUES (NEW.studio_id, NEW.operator_id, 'assigned', NEW.id, NEW.patient_id,
      jsonb_build_object(
        'message', 'Ti è stata assegnata una seduta con ' || COALESCE(v_patient, 'un paziente') || ' il ' || v_when,
        'start_at', NEW.start_at));
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- ── Sottratta all'operatore precedente ────────────────────────────
    IF OLD.operator_id IS NOT NULL
       AND OLD.operator_id IS DISTINCT FROM NEW.operator_id
       AND OLD.operator_id IS DISTINCT FROM v_actor THEN
      INSERT INTO notifications (studio_id, recipient_id, type, appointment_id, patient_id, payload)
      VALUES (NEW.studio_id, OLD.operator_id, 'unassigned', NEW.id, NEW.patient_id,
        jsonb_build_object(
          'message', 'La seduta con ' || COALESCE(v_patient, 'un paziente') || ' del ' || v_when || ' non è più assegnata a te',
          'start_at', NEW.start_at));
    END IF;

    -- ── Orario spostato da qualcun altro ──────────────────────────────
    IF NEW.operator_id IS NOT NULL
       AND NEW.operator_id IS NOT DISTINCT FROM OLD.operator_id
       AND NEW.start_at IS DISTINCT FROM OLD.start_at
       AND NEW.operator_id IS DISTINCT FROM v_actor THEN
      INSERT INTO notifications (studio_id, recipient_id, type, appointment_id, patient_id, payload)
      VALUES (NEW.studio_id, NEW.operator_id, 'moved', NEW.id, NEW.patient_id,
        jsonb_build_object(
          'message', 'La tua seduta con ' || COALESCE(v_patient, 'un paziente') || ' è stata spostata al ' || v_when,
          'from', OLD.start_at, 'start_at', NEW.start_at));
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Una notifica mancata non deve mai impedire di salvare un appuntamento.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_operator ON public.appointments;
CREATE TRIGGER trg_notify_operator
  AFTER INSERT OR UPDATE OF operator_id, start_at ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_operator();

COMMENT ON COLUMN public.notifications.recipient_id IS
  'NULL = notifica di studio (tutti). Valorizzato = destinata a quell''utente (mig. 076).';
