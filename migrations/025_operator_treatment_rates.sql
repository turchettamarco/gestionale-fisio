-- ═══════════════════════════════════════════════════════════════════════
-- Migration 025 · operator_treatment_rates (Fase R1: compenso operatori)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Crea la matrice "compenso per operatore × tipo di trattamento".
-- Ogni riga = "Operatore X riceve €Y per una seduta di Trattamento Z, con
-- durata standard di N minuti".
--
-- LOGICA DI CALCOLO COMPENSO PER UNA SEDUTA:
--   • compenso = rate_per_session × (durata_reale / treatment_types.duration_min)
--   • Esempio: Marco fa Tecar (rate €25, dur. standard 60min):
--       30min → €12.50    60min → €25.00    90min → €37.50
--
-- TARIFFE NULL:
--   • Se non esiste riga per (member_id, treatment_type_id), il compenso
--     per quella seduta è 0 (da impostare). Non blocchiamo la seduta.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS operator_treatment_rates;
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS operator_treatment_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES studio_members(id) ON DELETE CASCADE,
  treatment_type_id UUID NOT NULL REFERENCES treatment_types(id) ON DELETE CASCADE,
  rate_per_session NUMERIC(10, 2) NOT NULL CHECK (rate_per_session >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, treatment_type_id)
);

COMMENT ON TABLE operator_treatment_rates IS
  'Compenso (€) per operatore × tipo trattamento. Tariffa "standard" per la '
  'durata di riferimento del trattamento (treatment_types.duration_min). '
  'Il calcolo effettivo compenso scala in proporzione alla durata reale.';

COMMENT ON COLUMN operator_treatment_rates.rate_per_session IS
  'Compenso in € per una seduta alla durata standard del trattamento. '
  'Per durate diverse il compenso reale è scalato proporzionalmente.';

CREATE INDEX IF NOT EXISTS idx_operator_treatment_rates_studio
  ON operator_treatment_rates(studio_id);

CREATE INDEX IF NOT EXISTS idx_operator_treatment_rates_member
  ON operator_treatment_rates(member_id);

-- ─── RLS ───────────────────────────────────────────────────────────────
-- Solo i membri dello studio possono leggere/scrivere le tariffe del proprio studio.
-- L'owner (member.role = 'owner') può modificare. Gli operatori vedono solo le
-- proprie tariffe (per non fare gossip economico).

ALTER TABLE operator_treatment_rates ENABLE ROW LEVEL SECURITY;

-- SELECT: owner vede tutto, altri membri vedono solo la propria riga
DROP POLICY IF EXISTS "rates_select" ON operator_treatment_rates;
CREATE POLICY "rates_select" ON operator_treatment_rates
  FOR SELECT
  USING (
    studio_id IN (SELECT my_studios())
    AND (
      -- owner vede tutto
      EXISTS (
        SELECT 1 FROM studio_members sm
        WHERE sm.studio_id = operator_treatment_rates.studio_id
          AND sm.user_id = auth.uid()
          AND sm.role = 'owner'
      )
      -- oppure è la propria tariffa
      OR member_id IN (
        SELECT id FROM studio_members
        WHERE user_id = auth.uid() AND studio_id = operator_treatment_rates.studio_id
      )
    )
  );

-- INSERT/UPDATE/DELETE: solo owner
DROP POLICY IF EXISTS "rates_insert_owner" ON operator_treatment_rates;
CREATE POLICY "rates_insert_owner" ON operator_treatment_rates
  FOR INSERT
  WITH CHECK (
    studio_id IN (SELECT my_studios())
    AND EXISTS (
      SELECT 1 FROM studio_members sm
      WHERE sm.studio_id = operator_treatment_rates.studio_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "rates_update_owner" ON operator_treatment_rates;
CREATE POLICY "rates_update_owner" ON operator_treatment_rates
  FOR UPDATE
  USING (
    studio_id IN (SELECT my_studios())
    AND EXISTS (
      SELECT 1 FROM studio_members sm
      WHERE sm.studio_id = operator_treatment_rates.studio_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "rates_delete_owner" ON operator_treatment_rates;
CREATE POLICY "rates_delete_owner" ON operator_treatment_rates
  FOR DELETE
  USING (
    studio_id IN (SELECT my_studios())
    AND EXISTS (
      SELECT 1 FROM studio_members sm
      WHERE sm.studio_id = operator_treatment_rates.studio_id
        AND sm.user_id = auth.uid()
        AND sm.role = 'owner'
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_operator_treatment_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_operator_treatment_rates_updated_at ON operator_treatment_rates;
CREATE TRIGGER trg_operator_treatment_rates_updated_at
  BEFORE UPDATE ON operator_treatment_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_operator_treatment_rates_updated_at();
