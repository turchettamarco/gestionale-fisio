-- ═══════════════════════════════════════════════════════════════════════
-- Migration 067: Auto-assegnazione operatore (Tappa A multi-op)
-- ═══════════════════════════════════════════════════════════════════════
--
-- OBIETTIVO:
-- Nessun appuntamento deve restare "non assegnato" per caso.
--   1. TRIGGER BEFORE INSERT su appointments: se operator_id è NULL e
--      l'appuntamento non è di un ospite (guest_practitioner_id NULL),
--      assegna automaticamente:
--        a) l'utente autenticato che sta creando, se è membro attivo
--           dello studio (caso normale: desktop, mobile, booking approvato);
--        b) altrimenti l'owner dello studio (caso service-role: cron,
--           inserimenti di sistema).
--      Copre TUTTI i percorsi di creazione, incluso il mobile che oggi
--      non valorizza operator_id.
--   2. RPC backfill_operator_assignments(studio): assegna in blocco lo
--      STORICO (operator_id NULL) all'owner dello studio. Chiamata dal
--      client quando si attiva il toggle multi_operator_enabled, così
--      chi ha sempre lavorato da solo si ritrova tutti gli appuntamenti
--      (passati e futuri) già assegnati a sé. Solo l'owner può invocarla
--      e SOLO sul proprio studio.
--
-- NOTE:
--   • Rispetta il constraint appointments_operator_xor_guest (mig. 029):
--     gli appuntamenti ospite restano con operator_id NULL.
--   • Nessun backfill automatico globale in migration: gli studi esistenti
--     vengono sistemati solo quando attivano il multi-operatore (opt-in),
--     senza toccare dati di studi che non usano la feature.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_appointments_default_operator ON appointments;
--   DROP FUNCTION IF EXISTS fn_appointments_default_operator();
--   DROP FUNCTION IF EXISTS backfill_operator_assignments(uuid);
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Trigger: default operator alla creazione ─────────────────────────
CREATE OR REPLACE FUNCTION fn_appointments_default_operator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_owner uuid;
BEGIN
  -- Già assegnato o appuntamento ospite: non tocco nulla.
  IF NEW.operator_id IS NOT NULL OR NEW.guest_practitioner_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- a) Il creatore autenticato, se membro attivo dello studio.
  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM studio_members m
      WHERE m.studio_id = NEW.studio_id
        AND m.user_id = v_uid
        AND COALESCE(m.is_active, TRUE)
    ) THEN
      NEW.operator_id := v_uid;
      RETURN NEW;
    END IF;
  END IF;

  -- b) Fallback: owner dello studio (inserimenti service-role/sistema).
  SELECT m.user_id INTO v_owner
  FROM studio_members m
  WHERE m.studio_id = NEW.studio_id
    AND m.role = 'owner'
    AND m.user_id IS NOT NULL
  ORDER BY m.created_at NULLS LAST
  LIMIT 1;

  IF v_owner IS NOT NULL THEN
    NEW.operator_id := v_owner;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_default_operator ON appointments;
CREATE TRIGGER trg_appointments_default_operator
  BEFORE INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION fn_appointments_default_operator();

-- ── 2. RPC: backfill dello storico all'owner ────────────────────────────
-- Ritorna il numero di appuntamenti aggiornati.
CREATE OR REPLACE FUNCTION backfill_operator_assignments(p_studio_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_owner uuid;
  v_count integer;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non autenticato';
  END IF;

  -- Il chiamante deve essere l'owner dello studio indicato.
  IF NOT EXISTS (
    SELECT 1 FROM studio_members m
    WHERE m.studio_id = p_studio_id
      AND m.user_id = v_uid
      AND m.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Solo il titolare dello studio può eseguire questa operazione';
  END IF;

  -- Owner destinatario del backfill (= il chiamante, che è owner).
  v_owner := v_uid;

  UPDATE appointments a
     SET operator_id = v_owner
   WHERE a.studio_id = p_studio_id
     AND a.operator_id IS NULL
     AND a.guest_practitioner_id IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION backfill_operator_assignments(uuid) TO authenticated;
