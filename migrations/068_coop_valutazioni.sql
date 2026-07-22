-- ═══════════════════════════════════════════════════════════════════════
-- 068 — Cartella di valutazione PAI (Cooperativa Santa Lucia Life)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Digitalizza la cartella cartacea: consensi GDPR, consenso informato,
-- dichiarazione di responsabilità, scale ADL/IADL, MMSE e Tinetti.
--
-- SCELTE:
--   • `dati` JSONB tiene tutte le risposte e i campi liberi: le scale
--     possono evolvere senza migrazioni successive.
--   • i punteggi sono anche COLONNE dedicate, così sono interrogabili
--     (andamento nel tempo, filtri, report) senza scavare nel JSON.
--   • le firme sono dataURL PNG dentro `dati` (firma_paziente,
--     firma_operatore): niente bucket storage da configurare a mano.
--   • più valutazioni per paziente: la cartella si ripete nel tempo e
--     il confronto fra date è il senso stesso delle scale.

CREATE TABLE IF NOT EXISTS coop_valutazioni (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id         uuid NOT NULL,
  coop_patient_id   uuid NOT NULL REFERENCES coop_patients(id) ON DELETE CASCADE,

  data_valutazione  date NOT NULL DEFAULT CURRENT_DATE,
  dati              jsonb NOT NULL DEFAULT '{}'::jsonb,

  adl_score         int,
  iadl_score        int,
  mmse_score        int,
  mmse_aggiustato   numeric(4,1),
  tinetti_eq        int,
  tinetti_and       int,
  tinetti_tot       int,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coop_valutazioni_paziente
  ON coop_valutazioni (coop_patient_id, data_valutazione DESC);

CREATE INDEX IF NOT EXISTS idx_coop_valutazioni_studio
  ON coop_valutazioni (studio_id, data_valutazione DESC);

-- ── RLS (idempotente) ──
ALTER TABLE coop_valutazioni ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coop_valutazioni_all ON coop_valutazioni;
CREATE POLICY coop_valutazioni_all ON coop_valutazioni
  FOR ALL USING (studio_id IN (SELECT my_studios()))
  WITH CHECK (studio_id IN (SELECT my_studios()));
