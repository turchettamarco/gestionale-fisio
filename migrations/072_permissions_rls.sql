-- ═══════════════════════════════════════════════════════════════════════
-- Migration 072: RLS hardening dei permessi (Tappa G2)
-- ═══════════════════════════════════════════════════════════════════════
--
-- La mig. 071 ha introdotto i permessi granulari, applicati finora solo
-- nell'interfaccia. Qui li portiamo DENTRO il database, dove diventano un
-- confine vero: chi conosce le API non può più aggirarli.
--
-- COSA FA
--   1. my_studios() / my_owned_studios(): ricreate includendo il nuovo
--      ruolo 'co_owner', che deve avere gli stessi diritti dell'owner.
--   2. has_permission(studio, chiave): replica in SQL la logica dei preset
--      di src/lib/permissions.ts. Unica fonte di verità lato database.
--   3. FALLA CRITICA CHIUSA — la policy studio_members_update_owner_or_self
--      permetteva a chiunque di aggiornare la PROPRIA riga: un terapista
--      poteva assegnarsi role='owner' o permission_preset='all' e ottenere
--      accesso totale. Un trigger ora blocca la modifica dei campi sensibili
--      (ruolo, permessi, stato, studio) da parte di chi non è titolare,
--      lasciando liberi i campi cosmetici (nome mostrato, colore, sigla).
--   4. Policy RESTRICTIVE su appointments, patients e studios. Sono
--      restrittive di proposito: si sommano in AND alle policy multi-tenant
--      già esistenti senza doverle riscrivere, quindi non allargano mai
--      nulla e non possono rompere accessi legittimi già funzionanti.
--
-- INVARIANTE DI SICUREZZA: titolare e co-titolare superano sempre ogni
-- controllo; chi non ha permessi configurati mantiene il comportamento
-- storico (assistente = tutto, terapista = livello base).
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS appointments_perm_select ON appointments;
--   DROP POLICY IF EXISTS appointments_perm_write ON appointments;
--   DROP POLICY IF EXISTS appointments_perm_insert ON appointments;
--   DROP POLICY IF EXISTS patients_perm_update ON patients;
--   DROP POLICY IF EXISTS patients_perm_delete ON patients;
--   DROP POLICY IF EXISTS studios_perm_update ON studios;
--   DROP TRIGGER IF EXISTS trg_studio_members_guard ON studio_members;
--   DROP FUNCTION IF EXISTS fn_studio_members_guard();
--   DROP FUNCTION IF EXISTS has_permission(uuid, text);
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Appartenenza allo studio (co_owner incluso) ──────────────────────
CREATE OR REPLACE FUNCTION public.my_studios()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.studio_id FROM studio_members m
  WHERE m.user_id = auth.uid()
    AND COALESCE(m.is_active, TRUE);
$$;

CREATE OR REPLACE FUNCTION public.my_owned_studios()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.studio_id FROM studio_members m
  WHERE m.user_id = auth.uid()
    AND m.role IN ('owner', 'co_owner')
    AND COALESCE(m.is_active, TRUE);
$$;

GRANT EXECUTE ON FUNCTION public.my_studios() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_owned_studios() TO authenticated;

-- ── 2. has_permission(): i preset di permissions.ts, in SQL ─────────────
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
    'patient.notes_private','agenda.edit_others','manage.patients_edit',
    'manage.exports'];
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

  -- Non membro dello studio
  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Titolare e co-titolare: sempre tutto
  IF v_role IN ('owner', 'co_owner') THEN
    RETURN TRUE;
  END IF;

  -- Configurazione su misura
  IF v_preset = 'custom' THEN
    RETURN COALESCE(v_perms, '[]'::jsonb) ? p_key;
  END IF;

  IF v_preset = 'all'          THEN RETURN TRUE; END IF;
  IF v_preset = 'patient_full' THEN RETURN p_key = ANY(v_full); END IF;
  IF v_preset = 'medium'       THEN RETURN p_key = ANY(v_medium); END IF;
  IF v_preset = 'base'         THEN RETURN p_key = ANY(v_base); END IF;

  -- Nessuna configurazione: default storico del ruolo
  IF v_role = 'assistant' THEN RETURN TRUE; END IF;
  RETURN p_key = ANY(v_base);
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;

-- ── 3. Anti auto-promozione su studio_members ───────────────────────────
-- La policy di UPDATE consente a ciascuno di aggiornare la propria riga
-- (serve per nome/colore/sigla). Senza questo trigger consentirebbe anche
-- di cambiarsi ruolo e permessi: è la falla che rendeva aggirabile tutto
-- il sistema.
CREATE OR REPLACE FUNCTION public.fn_studio_members_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM studio_members m
    WHERE m.studio_id = OLD.studio_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'co_owner')
      AND COALESCE(m.is_active, TRUE)
  ) INTO v_is_owner;

  -- Il titolare può tutto; le operazioni di sistema (service_role, cron,
  -- trigger interni) hanno auth.uid() NULL e non vanno bloccate.
  IF v_is_owner OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.permission_preset IS DISTINCT FROM OLD.permission_preset
     OR NEW.permissions IS DISTINCT FROM OLD.permissions
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.studio_id IS DISTINCT FROM OLD.studio_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Solo il titolare dello studio può modificare ruolo, permessi o stato di un membro';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_studio_members_guard ON public.studio_members;
CREATE TRIGGER trg_studio_members_guard
  BEFORE UPDATE ON public.studio_members
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_studio_members_guard();

-- ── 4. Policy RESTRICTIVE basate sui permessi ───────────────────────────
-- Nota: si sommano in AND alle policy multi-tenant esistenti.

-- APPOINTMENTS ----------------------------------------------------------
-- Senza 'agenda.view_all' si vedono solo i propri appuntamenti.
DROP POLICY IF EXISTS appointments_perm_select ON public.appointments;
CREATE POLICY appointments_perm_select ON public.appointments
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    has_permission(studio_id, 'agenda.view_all')
    OR operator_id = auth.uid()
  );

-- Creare appuntamenti richiede 'agenda.create'.
DROP POLICY IF EXISTS appointments_perm_insert ON public.appointments;
CREATE POLICY appointments_perm_insert ON public.appointments
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(studio_id, 'agenda.create'));

-- Modificare l'appuntamento di un collega richiede 'agenda.edit_others';
-- i propri restano sempre modificabili.
DROP POLICY IF EXISTS appointments_perm_update ON public.appointments;
CREATE POLICY appointments_perm_update ON public.appointments
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    has_permission(studio_id, 'agenda.edit_others')
    OR operator_id = auth.uid()
  );

DROP POLICY IF EXISTS appointments_perm_delete ON public.appointments;
CREATE POLICY appointments_perm_delete ON public.appointments
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (
    has_permission(studio_id, 'agenda.edit_others')
    OR operator_id = auth.uid()
  );

-- PATIENTS --------------------------------------------------------------
DROP POLICY IF EXISTS patients_perm_update ON public.patients;
CREATE POLICY patients_perm_update ON public.patients
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (has_permission(studio_id, 'manage.patients_edit'));

DROP POLICY IF EXISTS patients_perm_delete ON public.patients;
CREATE POLICY patients_perm_delete ON public.patients
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (has_permission(studio_id, 'manage.patients_delete'));

-- STUDIOS ---------------------------------------------------------------
-- Le impostazioni dello studio le tocca solo titolare o co-titolare.
DROP POLICY IF EXISTS studios_perm_update ON public.studios;
CREATE POLICY studios_perm_update ON public.studios
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (id IN (SELECT my_owned_studios()));

COMMENT ON FUNCTION public.has_permission(uuid, text) IS
  'Permessi granulari (mig. 071/072). Rispecchia i preset di src/lib/permissions.ts: modificare entrambi insieme.';
