-- 064: modelli SOAP per patologia.
-- Note precompilate riutilizzabili (lombalgia, spalla, post-LCA…):
-- si selezionano nella nota della seduta e si creano dalle proprie note
-- con "Salva come modello". Per studio.
CREATE TABLE IF NOT EXISTS soap_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id  uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  name       text NOT NULL,
  soap_s     text,
  soap_o     text,
  soap_a     text,
  soap_p     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soap_templates_studio ON soap_templates(studio_id);

ALTER TABLE soap_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS soap_templates_select ON soap_templates;
CREATE POLICY soap_templates_select ON soap_templates
  FOR SELECT USING (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS soap_templates_insert ON soap_templates;
CREATE POLICY soap_templates_insert ON soap_templates
  FOR INSERT WITH CHECK (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS soap_templates_delete ON soap_templates;
CREATE POLICY soap_templates_delete ON soap_templates
  FOR DELETE USING (studio_id IN (SELECT my_studios()));
