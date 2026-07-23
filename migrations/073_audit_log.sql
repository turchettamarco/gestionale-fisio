-- ═══════════════════════════════════════════════════════════════════════
-- Migration 073: Audit log delle modifiche (Tappa H)
-- ═══════════════════════════════════════════════════════════════════════
--
-- OBIETTIVO:
-- Con più utenti nello studio serve sapere CHI ha fatto COSA. I permessi
-- (mig. 071/072) dicono chi può; l'audit dice chi ha fatto.
--
-- SCELTE DI PROGETTO
--   • Cattura via TRIGGER, non da codice applicativo: registra qualunque
--     strada passi la modifica (desktop, mobile, API, accesso diretto al
--     database). Il codice non può dimenticarsi di loggare.
--   • Solo MODIFICHE (INSERT/UPDATE/DELETE), non le consultazioni: volume
--     contenuto. La struttura è già pronta per aggiungere in seguito le
--     letture delle cartelle cliniche (action = 'READ').
--   • Su UPDATE salva SOLO i campi realmente cambiati, con i valori testuali
--     troncati: il log resta leggero e leggibile.
--   • Sola lettura per titolare e co-titolare. Nessuno può modificarlo o
--     cancellarlo dall'applicazione, nemmeno il titolare: un registro
--     alterabile da chi controlla non è un registro. La pulizia periodica
--     avviene solo tramite la funzione dedicata purge_audit_log().
--
-- TABELLE TRACCIATE: appuntamenti, pazienti, membri e permessi, pacchetti e
-- pagamenti, valutazioni e obiettivi clinici, convenzioni, impostazioni
-- studio, sedi, stanze, turni e assenze.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS purge_audit_log(integer);
--   -- rimuovere i trigger: DROP TRIGGER trg_audit_<tabella> ON <tabella>;
--   DROP FUNCTION IF EXISTS fn_audit_capture() CASCADE;
--   DROP TABLE IF EXISTS audit_log;
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Tabella ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          BIGSERIAL PRIMARY KEY,
  studio_id   UUID NOT NULL,
  actor_id    UUID,                      -- auth.users.id (NULL = sistema/cron)
  actor_label TEXT,                      -- nome al momento del fatto (storico)
  action      TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  table_name  TEXT NOT NULL,
  record_id   UUID,
  summary     TEXT,                      -- descrizione leggibile
  changed     JSONB,                     -- { campo: { da: …, a: … } }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_studio_time_idx
  ON public.audit_log (studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx
  ON public.audit_log (studio_id, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_record_idx
  ON public.audit_log (table_name, record_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Sola lettura, e solo per titolare/co-titolare.
DROP POLICY IF EXISTS audit_log_select_owner ON public.audit_log;
CREATE POLICY audit_log_select_owner ON public.audit_log
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_owned_studios()));

-- Nessuna policy di INSERT/UPDATE/DELETE: si scrive solo dal trigger
-- (SECURITY DEFINER), quindi il registro non è alterabile dall'app.

-- ── 2. Funzione di cattura ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_audit_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_studio   UUID;
  v_actor    UUID := auth.uid();
  v_label    TEXT;
  v_old      JSONB;
  v_new      JSONB;
  v_changed  JSONB := '{}'::jsonb;
  v_rec      UUID;
  v_summary  TEXT;
  k          TEXT;
  ov         JSONB;
  nv         JSONB;
  -- Campi tecnici da ignorare: cambiano da soli e sporcherebbero il log.
  v_skip     TEXT[] := ARRAY['updated_at','created_at','last_active_at','search_vector'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  END IF;

  -- studio_id: se la tabella non ce l'ha, non registriamo (fuori perimetro).
  v_studio := COALESCE(
    (v_new ->> 'studio_id')::uuid,
    (v_old ->> 'studio_id')::uuid
  );
  IF v_studio IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_rec := COALESCE((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);

  -- Nome dell'autore congelato al momento del fatto: se domani lo rinomini
  -- o lo rimuovi dal team, il registro resta comunque leggibile.
  SELECT m.display_name INTO v_label
  FROM studio_members m
  WHERE m.studio_id = v_studio AND m.user_id = v_actor
  LIMIT 1;

  -- Diff: solo i campi realmente cambiati, con troncamento dei testi lunghi.
  IF TG_OP = 'UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      IF k = ANY(v_skip) THEN CONTINUE; END IF;
      ov := v_old -> k;
      nv := v_new -> k;
      IF ov IS DISTINCT FROM nv THEN
        v_changed := v_changed || jsonb_build_object(k, jsonb_build_object(
          'da', CASE WHEN jsonb_typeof(ov) = 'string' AND length(ov #>> '{}') > 300
                     THEN to_jsonb(left(ov #>> '{}', 300) || '…') ELSE ov END,
          'a',  CASE WHEN jsonb_typeof(nv) = 'string' AND length(nv #>> '{}') > 300
                     THEN to_jsonb(left(nv #>> '{}', 300) || '…') ELSE nv END
        ));
      END IF;
    END LOOP;

    -- Nessun cambiamento sostanziale: non sporchiamo il registro.
    IF v_changed = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Descrizione sintetica, utile nella lista senza aprire il dettaglio.
  v_summary := CASE TG_OP
    WHEN 'INSERT' THEN 'Creato'
    WHEN 'DELETE' THEN 'Eliminato'
    ELSE 'Modificato: ' || array_to_string(
      ARRAY(SELECT jsonb_object_keys(v_changed) LIMIT 6), ', ')
  END;

  INSERT INTO public.audit_log
    (studio_id, actor_id, actor_label, action, table_name, record_id, summary, changed)
  VALUES
    (v_studio, v_actor, v_label, TG_OP, TG_TABLE_NAME, v_rec, v_summary,
     CASE WHEN TG_OP = 'UPDATE' THEN v_changed ELSE NULL END);

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Un errore nel log non deve MAI impedire il lavoro clinico: in caso di
  -- problemi si perde la riga di audit, non l'operazione dell'utente.
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── 3. Aggancio ai trigger ──────────────────────────────────────────────
-- Solo tabelle esistenti e dotate di studio_id: la migration resta valida
-- anche su installazioni con moduli diversi attivi.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'appointments', 'patients', 'studio_members', 'studios',
    'patient_packages', 'package_payments',
    'clinical_assessments', 'clinical_goals',
    'convenzioni_enti', 'convenzioni_tariffe',
    'studio_locations', 'studio_rooms',
    'operator_schedules', 'operator_unavailability',
    'guest_practitioners', 'patient_consents'
  ];
  has_studio BOOLEAN;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN CONTINUE; END IF;

    -- studios usa "id" come identificativo di studio: caso particolare,
    -- gestito più sotto con un trigger dedicato.
    IF t = 'studios' THEN CONTINUE; END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'studio_id'
    ) INTO has_studio;
    IF NOT has_studio THEN CONTINUE; END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.fn_audit_capture()', t, t);
  END LOOP;
END $$;

-- studios: lo studio_id coincide con id → funzione dedicata.
CREATE OR REPLACE FUNCTION public.fn_audit_capture_studios()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_label TEXT;
  v_changed JSONB := '{}'::jsonb;
  o JSONB := to_jsonb(OLD);
  n JSONB := to_jsonb(NEW);
  k TEXT;
BEGIN
  FOR k IN SELECT jsonb_object_keys(n) LOOP
    IF k IN ('updated_at', 'created_at') THEN CONTINUE; END IF;
    IF (o -> k) IS DISTINCT FROM (n -> k) THEN
      v_changed := v_changed || jsonb_build_object(k, jsonb_build_object('da', o -> k, 'a', n -> k));
    END IF;
  END LOOP;
  IF v_changed = '{}'::jsonb THEN RETURN NEW; END IF;

  SELECT m.display_name INTO v_label
  FROM studio_members m WHERE m.studio_id = NEW.id AND m.user_id = v_actor LIMIT 1;

  INSERT INTO public.audit_log
    (studio_id, actor_id, actor_label, action, table_name, record_id, summary, changed)
  VALUES
    (NEW.id, v_actor, v_label, 'UPDATE', 'studios', NEW.id,
     'Impostazioni studio: ' || array_to_string(ARRAY(SELECT jsonb_object_keys(v_changed) LIMIT 6), ', '),
     v_changed);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_studios ON public.studios;
CREATE TRIGGER trg_audit_studios
  AFTER UPDATE ON public.studios
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_capture_studios();

-- ── 4. Pulizia periodica ────────────────────────────────────────────────
-- Solo il titolare può invocarla, e solo sul proprio studio.
CREATE OR REPLACE FUNCTION public.purge_audit_log(p_studio_id uuid, p_keep_days integer DEFAULT 365)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM studio_members m
    WHERE m.studio_id = p_studio_id AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'co_owner') AND COALESCE(m.is_active, TRUE)
  ) THEN
    RAISE EXCEPTION 'Solo il titolare può ripulire il registro attività';
  END IF;

  IF p_keep_days < 30 THEN
    RAISE EXCEPTION 'Il registro deve conservare almeno 30 giorni';
  END IF;

  DELETE FROM public.audit_log
  WHERE studio_id = p_studio_id
    AND created_at < NOW() - (p_keep_days || ' days')::interval;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_audit_log(uuid, integer) TO authenticated;

COMMENT ON TABLE public.audit_log IS
  'Registro attività (mig. 073). Scritto solo da trigger, leggibile solo da titolare/co-titolare.';
