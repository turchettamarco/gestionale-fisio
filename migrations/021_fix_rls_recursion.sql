-- ═══════════════════════════════════════════════════════════════════════
-- Migration 021: Fix ricorsione RLS su studio_members / studio_rooms /
--                operator_unavailability (ufficializzazione hotfix)
-- ═══════════════════════════════════════════════════════════════════════
--
-- CONTESTO:
-- Le migration 019 e 020 hanno introdotto policy RLS che facevano subquery
-- direttamente su studio_members nella WHERE clause:
--   USING (studio_id IN (SELECT sm.studio_id FROM studio_members sm WHERE ...))
--
-- Postgres ha rilevato la ricorsione (RLS si applica anche alla subquery
-- interna che legge studio_members) e bloccato le query, causando il caricamento
-- vuoto della pagina settings su DB esistenti.
--
-- HOTFIX:
-- Il 7/5/2026 abbiamo applicato la fix DIRETTAMENTE sul DB di produzione
-- via Supabase SQL Editor, sostituendo le subquery con chiamate alle funzioni
-- SECURITY DEFINER my_studios() e my_owned_studios() già presenti nel
-- codebase (vedi migrations/008_email_and_onboarding.sql).
--
-- QUESTA MIGRATION:
-- Replica la stessa fix come file .sql tracciato nel filesystem, in modo
-- che chiunque cloni il progetto e applichi le migration su un DB nuovo
-- ottenga le policy CORRETTE (no ricorsione).
--
-- IDEMPOTENZA:
-- Tutti i CREATE POLICY sono preceduti da DROP IF EXISTS, quindi è sicuro
-- rieseguirla. Sul DB di produzione (dove la fix è già live) non ha alcun
-- effetto pratico oltre alla riconferma delle stesse policy.
--
-- ROLLBACK:
-- Non ha senso un rollback "logico" — questa migration RIPARA un bug,
-- tornare indietro reintrodurrebbe la ricorsione. Se serve disabilitare
-- temporaneamente RLS per un debug, usare:
--   ALTER TABLE studio_members DISABLE ROW LEVEL SECURITY;
-- (e ricordarsi di riabilitarlo subito dopo).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── studio_members ────────────────────────────────────────────────────
DROP POLICY IF EXISTS studio_members_select_team ON studio_members;
DROP POLICY IF EXISTS studio_members_update_owner_or_self ON studio_members;
DROP POLICY IF EXISTS studio_members_delete_owner ON studio_members;
DROP POLICY IF EXISTS studio_members_insert_owner ON studio_members;

CREATE POLICY studio_members_select_team ON studio_members
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_studios()));

CREATE POLICY studio_members_update_owner_or_self ON studio_members
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR studio_id IN (SELECT my_owned_studios())
  );

CREATE POLICY studio_members_delete_owner ON studio_members
  FOR DELETE TO authenticated
  USING (
    user_id IS DISTINCT FROM auth.uid()
    AND studio_id IN (SELECT my_owned_studios())
  );

CREATE POLICY studio_members_insert_owner ON studio_members
  FOR INSERT TO authenticated
  WITH CHECK (studio_id IN (SELECT my_owned_studios()));


-- ─── studio_rooms ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS studio_rooms_select ON studio_rooms;
DROP POLICY IF EXISTS studio_rooms_insert ON studio_rooms;
DROP POLICY IF EXISTS studio_rooms_update ON studio_rooms;
DROP POLICY IF EXISTS studio_rooms_delete ON studio_rooms;

CREATE POLICY studio_rooms_select ON studio_rooms
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_studios()));

CREATE POLICY studio_rooms_insert ON studio_rooms
  FOR INSERT TO authenticated
  WITH CHECK (studio_id IN (SELECT my_owned_studios()));

CREATE POLICY studio_rooms_update ON studio_rooms
  FOR UPDATE TO authenticated
  USING (studio_id IN (SELECT my_owned_studios()));

CREATE POLICY studio_rooms_delete ON studio_rooms
  FOR DELETE TO authenticated
  USING (studio_id IN (SELECT my_owned_studios()));


-- ─── operator_unavailability ───────────────────────────────────────────
DROP POLICY IF EXISTS operator_unav_select ON operator_unavailability;
DROP POLICY IF EXISTS operator_unav_insert ON operator_unavailability;
DROP POLICY IF EXISTS operator_unav_update ON operator_unavailability;
DROP POLICY IF EXISTS operator_unav_delete ON operator_unavailability;

CREATE POLICY operator_unav_select ON operator_unavailability
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_studios()));

CREATE POLICY operator_unav_insert ON operator_unavailability
  FOR INSERT TO authenticated
  WITH CHECK (
    studio_id IN (SELECT my_studios())
    AND (
      operator_id = auth.uid()
      OR studio_id IN (SELECT my_owned_studios())
    )
  );

CREATE POLICY operator_unav_update ON operator_unavailability
  FOR UPDATE TO authenticated
  USING (
    operator_id = auth.uid()
    OR studio_id IN (SELECT my_owned_studios())
  );

CREATE POLICY operator_unav_delete ON operator_unavailability
  FOR DELETE TO authenticated
  USING (
    operator_id = auth.uid()
    OR studio_id IN (SELECT my_owned_studios())
  );

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- POST-MIGRATION CHECK (run manually):
-- ═══════════════════════════════════════════════════════════════════════
-- SELECT policyname, cmd FROM pg_policies
--   WHERE tablename IN ('studio_members', 'studio_rooms', 'operator_unavailability')
--   ORDER BY tablename, cmd, policyname;
