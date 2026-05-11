-- ═══════════════════════════════════════════════════════════════════════
-- Migration 026 · operator_schedules (Fase R2: turni operatori)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Crea la tabella per memorizzare i turni di lavoro di ogni operatore.
-- Ogni riga = una fascia oraria in un giorno della settimana per un membro.
-- Più righe per stesso (member, day_of_week) = più fasce nello stesso giorno
-- (es. mattina + pomeriggio).
--
-- ESEMPIO:
--   Marco lun 09:00-13:00 + 15:00-19:00 = 2 righe (day_of_week=1, 2 fasce)
--   Marco mer off = 0 righe per day_of_week=3
--
-- DAY_OF_WEEK:
--   0=dom, 1=lun, 2=mar, 3=mer, 4=gio, 5=ven, 6=sab (postgres-style)
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS operator_schedules;
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS operator_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES studio_members(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

COMMENT ON TABLE operator_schedules IS
  'Turni di lavoro per operatore. Ogni riga = una fascia oraria in un giorno '
  'della settimana. Più fasce nello stesso giorno = più righe.';

CREATE INDEX IF NOT EXISTS idx_operator_schedules_studio
  ON operator_schedules(studio_id);

CREATE INDEX IF NOT EXISTS idx_operator_schedules_member_dow
  ON operator_schedules(member_id, day_of_week);

-- RLS
ALTER TABLE operator_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sched_select" ON operator_schedules;
CREATE POLICY "sched_select" ON operator_schedules
  FOR SELECT USING (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS "sched_modify_owner" ON operator_schedules;
CREATE POLICY "sched_modify_owner" ON operator_schedules
  FOR ALL
  USING (
    studio_id IN (SELECT my_studios())
    AND EXISTS (
      SELECT 1 FROM studio_members sm
      WHERE sm.studio_id = operator_schedules.studio_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  )
  WITH CHECK (
    studio_id IN (SELECT my_studios())
    AND EXISTS (
      SELECT 1 FROM studio_members sm
      WHERE sm.studio_id = operator_schedules.studio_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );
