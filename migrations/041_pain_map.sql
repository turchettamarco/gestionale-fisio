-- ════════════════════════════════════════════════════════════════════════
-- migrations/041_pain_map.sql
-- ════════════════════════════════════════════════════════════════════════
-- Mappa del dolore (Body Chart) salvata per paziente.
-- A differenza della versione desktop (solo PDF al volo), qui la mappa
-- viene memorizzata nello storico clinico del paziente.
--
-- I dati della mappa vivono nel campo JSONB `data`:
--   {
--     "view":   "front" | "back",                  // ultima vista mostrata
--     "points": [ { "x":0-1, "y":0-1, "view":"front"|"back",
--                   "intensity":1|2|3, "id":"..." } ],
--     "zone":   "spalla destra"                     // etichetta zona principale
--   }
-- Coordinate normalizzate 0-1 → indipendenti dalla risoluzione dell'immagine.
--
-- NB: nessun BEGIN/COMMIT — il runner non supporta comandi transazionali.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pain_maps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  studio_id   UUID NOT NULL REFERENCES studios(id)  ON DELETE CASCADE,
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  vas         INTEGER CHECK (vas IS NULL OR (vas BETWEEN 0 AND 10)),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pain_maps_patient ON pain_maps (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pain_maps_studio  ON pain_maps (studio_id);

ALTER TABLE pain_maps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pain_maps_select ON pain_maps;
CREATE POLICY pain_maps_select ON pain_maps
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS pain_maps_insert ON pain_maps;
CREATE POLICY pain_maps_insert ON pain_maps
  FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS pain_maps_update ON pain_maps;
CREATE POLICY pain_maps_update ON pain_maps
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS pain_maps_delete ON pain_maps;
CREATE POLICY pain_maps_delete ON pain_maps
  FOR DELETE USING (owner_id = auth.uid());

COMMENT ON TABLE pain_maps IS
  'Mappa del dolore (body chart) salvata per paziente. data JSONB contiene '
  'i punti del dolore con coordinate normalizzate, vista e intensita.';
