-- ════════════════════════════════════════════════════════════════════════
-- migrations/029_guest_practitioners.sql
-- ════════════════════════════════════════════════════════════════════════
-- Professionisti ospiti (mig. 029).
--
-- Tabella guest_practitioners + colonna in appointments + flag studio.
-- Permette di registrare professionisti esterni (es. ortopedico Andrea
-- Gerardi) che lavorano una volta al mese nello studio: NON multi-operator
-- vero, ma "etichette" per appuntamenti dove l'ospite incassa direttamente
-- e gli appt NON entrano negli incassi titolare.
-- ════════════════════════════════════════════════════════════════════════

-- ── Tabella guest_practitioners ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guest_practitioners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  specialty       TEXT NOT NULL,
  display_color   TEXT,                   -- es. '#DB2777' (magenta default UI)
  default_room_id UUID REFERENCES studio_rooms(id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indici per performance ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_guest_practitioners_studio_id
  ON guest_practitioners(studio_id);

CREATE INDEX IF NOT EXISTS idx_guest_practitioners_active
  ON guest_practitioners(studio_id, is_active, sort_order)
  WHERE is_active = TRUE;

-- ── Trigger updated_at ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_guest_practitioners_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guest_practitioners_updated_at ON guest_practitioners;
CREATE TRIGGER trg_guest_practitioners_updated_at
  BEFORE UPDATE ON guest_practitioners
  FOR EACH ROW
  EXECUTE FUNCTION set_guest_practitioners_updated_at();

-- ── RLS: solo membri dello studio possono vedere/modificare ─────────────
ALTER TABLE guest_practitioners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guest_practitioners_select ON guest_practitioners;
CREATE POLICY guest_practitioners_select ON guest_practitioners
  FOR SELECT
  USING (studio_id IN (
    SELECT studio_members.studio_id
    FROM studio_members
    WHERE studio_members.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS guest_practitioners_insert ON guest_practitioners;
CREATE POLICY guest_practitioners_insert ON guest_practitioners
  FOR INSERT
  WITH CHECK (studio_id IN (
    SELECT studio_members.studio_id
    FROM studio_members
    WHERE studio_members.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS guest_practitioners_update ON guest_practitioners;
CREATE POLICY guest_practitioners_update ON guest_practitioners
  FOR UPDATE
  USING (studio_id IN (
    SELECT studio_members.studio_id
    FROM studio_members
    WHERE studio_members.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS guest_practitioners_delete ON guest_practitioners;
CREATE POLICY guest_practitioners_delete ON guest_practitioners
  FOR DELETE
  USING (studio_id IN (
    SELECT studio_members.studio_id
    FROM studio_members
    WHERE studio_members.user_id = auth.uid()
  ));

-- ── Colonna su appointments ─────────────────────────────────────────────
-- Quando guest_practitioner_id è valorizzato, operator_id deve essere NULL
-- (l'appuntamento è per l'ospite, non per un membro dello studio).
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS guest_practitioner_id UUID
    REFERENCES guest_practitioners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_guest_practitioner_id
  ON appointments(guest_practitioner_id)
  WHERE guest_practitioner_id IS NOT NULL;

-- Constraint XOR: o operator_id o guest_practitioner_id (o entrambi NULL),
-- ma mai entrambi valorizzati contemporaneamente.
ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_operator_xor_guest;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_operator_xor_guest
  CHECK (operator_id IS NULL OR guest_practitioner_id IS NULL);

-- ── Flag a livello studio per attivare/disattivare la feature ───────────
ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS guest_practitioners_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN studios.guest_practitioners_enabled IS
  'Se TRUE, lo studio può registrare professionisti ospiti. Default FALSE: feature opt-in.';

COMMENT ON TABLE guest_practitioners IS
  'Professionisti esterni (es. ortopedici, nutrizionisti) che lavorano '
  'occasionalmente nello studio. Gli appuntamenti registrati per loro NON '
  'entrano negli incassi del titolare: l''ospite incassa direttamente.';
