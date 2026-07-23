-- ═══════════════════════════════════════════════════════════════════════
-- Migration 075: Audit delle consultazioni (Tappa I)
-- ═══════════════════════════════════════════════════════════════════════
--
-- COS'È E PERCHÉ SERVE:
-- L'audit della mig. 073 registra solo le MODIFICHE. Chi apre e legge la
-- cartella di un paziente senza toccare nulla non lascia alcuna traccia:
-- è esattamente il caso classico di curiosità indebita (il conoscente, il
-- vicino di casa, l'ex partner). Nella sanità la tracciabilità degli
-- ACCESSI ai dati clinici è la misura che ci si aspetta di trovare, non
-- quella delle sole scritture.
--
-- COME:
-- Le letture non si catturano con un trigger (in SQL non esiste un trigger
-- ON SELECT utilizzabile a questo scopo): è l'applicazione a dichiararle,
-- chiamando log_patient_access() all'apertura della scheda paziente.
--
-- ANTI-RUMORE: la stessa persona che riapre la stessa scheda entro 30
-- minuti non genera una nuova riga. Senza questo accorgimento una giornata
-- di lavoro normale produrrebbe centinaia di voci inutili e il registro
-- diventerebbe illeggibile proprio quando serve.
--
-- NOTA: le consultazioni del TITOLARE vengono comunque registrate. Un
-- registro che esclude chi comanda non è un registro.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS log_patient_access(uuid, uuid, text);
--   ALTER TABLE audit_log DROP CONSTRAINT audit_log_action_check;
--   ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check
--     CHECK (action IN ('INSERT','UPDATE','DELETE'));
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Ammettere l'azione READ ──────────────────────────────────────────
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.audit_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%action%'
  LOOP
    EXECUTE format('ALTER TABLE public.audit_log DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.audit_log
    ADD CONSTRAINT audit_log_action_check
    CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'READ'));
END $$;

-- ── 2. Registrazione di una consultazione ───────────────────────────────
CREATE OR REPLACE FUNCTION public.log_patient_access(
  p_studio_id  uuid,
  p_patient_id uuid,
  p_context    text DEFAULT 'scheda'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  UUID := auth.uid();
  v_label  TEXT;
  v_name   TEXT;
  v_recent BOOLEAN;
BEGIN
  IF v_actor IS NULL OR p_studio_id IS NULL OR p_patient_id IS NULL THEN
    RETURN;
  END IF;

  -- Solo membri attivi dello studio: impedisce di gonfiare il registro
  -- con chiamate provenienti da fuori.
  IF NOT EXISTS (
    SELECT 1 FROM studio_members m
    WHERE m.studio_id = p_studio_id
      AND m.user_id = v_actor
      AND COALESCE(m.is_active, TRUE)
  ) THEN
    RETURN;
  END IF;

  -- Anti-rumore: stessa persona, stesso paziente, ultimi 30 minuti.
  SELECT EXISTS (
    SELECT 1 FROM audit_log a
    WHERE a.studio_id = p_studio_id
      AND a.actor_id = v_actor
      AND a.action = 'READ'
      AND a.record_id = p_patient_id
      AND a.created_at > NOW() - INTERVAL '30 minutes'
  ) INTO v_recent;

  IF v_recent THEN
    RETURN;
  END IF;

  SELECT m.display_name INTO v_label
  FROM studio_members m
  WHERE m.studio_id = p_studio_id AND m.user_id = v_actor
  LIMIT 1;

  SELECT COALESCE(p.last_name, '') || ' ' || COALESCE(p.first_name, '')
    INTO v_name
  FROM patients p
  WHERE p.id = p_patient_id
  LIMIT 1;

  INSERT INTO public.audit_log
    (studio_id, actor_id, actor_label, action, table_name, record_id, summary, changed)
  VALUES
    (p_studio_id, v_actor, v_label, 'READ', 'patients', p_patient_id,
     'Consultazione ' || COALESCE(p_context, 'scheda')
       || CASE WHEN v_name IS NOT NULL THEN ' — ' || btrim(v_name) ELSE '' END,
     NULL);
EXCEPTION WHEN OTHERS THEN
  -- Il fallimento del log non deve mai impedire la consultazione clinica.
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_patient_access(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.log_patient_access(uuid, uuid, text) IS
  'Registra la consultazione di una cartella paziente (mig. 075). Deduplica entro 30 minuti.';
