-- 058: chiusure e ferie della sezione Domicili (giorni in cui non si lavora)
CREATE TABLE IF NOT EXISTS domicili_chiusure (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id    uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  data_da      date NOT NULL,           -- giorno singolo: data_da = data_a
  data_a       date NOT NULL,
  motivo       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_domicili_chiusure_studio ON domicili_chiusure(studio_id, data_da, data_a);

ALTER TABLE domicili_chiusure ENABLE ROW LEVEL SECURITY;

-- Idempotente: la tabella può già esistere da un'applicazione manuale
-- precedente, quindi le policy vanno ricreate anziché create.
DROP POLICY IF EXISTS domicili_chiusure_select ON domicili_chiusure;
CREATE POLICY domicili_chiusure_select ON domicili_chiusure
  FOR SELECT USING (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS domicili_chiusure_insert ON domicili_chiusure;
CREATE POLICY domicili_chiusure_insert ON domicili_chiusure
  FOR INSERT WITH CHECK (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS domicili_chiusure_delete ON domicili_chiusure;
CREATE POLICY domicili_chiusure_delete ON domicili_chiusure
  FOR DELETE USING (studio_id IN (SELECT my_studios()));
