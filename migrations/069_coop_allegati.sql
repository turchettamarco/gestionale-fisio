-- ═══════════════════════════════════════════════════════════════════════
-- 069 — Allegati della cartella PAI (scansioni e cartelle cartacee)
-- ═══════════════════════════════════════════════════════════════════════
--
-- La cartella compilata a mano (o compilata da un altro operatore) deve
-- poter entrare nel gestionale accanto a quelle digitali. I file vivono
-- nel bucket storage `patient_docs`, sotto il prefisso `coop_valutazioni/`;
-- qui si tiene solo il riferimento e i metadati.
--
-- valutazione_id è opzionale: un allegato può stare in piedi da solo
-- (cartella cartacea senza controparte digitale).

CREATE TABLE IF NOT EXISTS coop_allegati (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id        uuid NOT NULL,
  coop_patient_id  uuid NOT NULL REFERENCES coop_patients(id) ON DELETE CASCADE,
  valutazione_id   uuid REFERENCES coop_valutazioni(id) ON DELETE SET NULL,

  titolo           text NOT NULL,
  storage_path     text NOT NULL,
  mime             text,
  size_kb          int,
  pagine           int,
  origine          text,          -- 'foto' | 'pdf'

  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coop_allegati_paziente
  ON coop_allegati (coop_patient_id, created_at DESC);

ALTER TABLE coop_allegati ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coop_allegati_all ON coop_allegati;
CREATE POLICY coop_allegati_all ON coop_allegati
  FOR ALL USING (studio_id IN (SELECT my_studios()))
  WITH CHECK (studio_id IN (SELECT my_studios()));
