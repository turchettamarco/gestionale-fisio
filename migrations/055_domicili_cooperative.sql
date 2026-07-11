-- ═══════════════════════════════════════════════════════════════════════
-- 055_domicili_cooperative.sql
-- ═══════════════════════════════════════════════════════════════════════
--
-- Sezione "Domicili Cooperative" — assistenza domiciliare in convenzione
-- con cooperative esterne (Santa Lucia, CRN, ...): pazienti PAI,
-- calendario a giorni fissi con orario, contatore accessi e report
-- settimanale.
--
-- ⚠ ISOLAMENTO TOTALE (requisito di progetto):
--   • NESSUNA foreign key verso patients / appointments / invoices;
--   • questi dati NON concorrono a dashboard, report, contabilità o
--     Sistema TS: le query esistenti non vedono queste tabelle;
--   • unico aggancio: studio_id (multi-tenancy) → RLS pattern standard
--     con my_studios() (stesso schema di waitlist_entries, mig. 054).
--
-- TABELLE:
--   1. cooperatives       — anagrafica cooperative (nome, logo, colore)
--   2. coop_patients      — pazienti PAI (tutti i campi del Modulo PAI
--                            Operatori) + giorni/orari fissi settimanali
--   3. coop_accesses      — singoli accessi domiciliari a calendario
--                            (pianificato / fatto / saltato)
--   4. domicili_settings  — preferenze sezione per studio
--                            (avanzamento contatore: manuale/automatico)
-- ═══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. COOPERATIVE
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cooperatives (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id   UUID        NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  nome        TEXT        NOT NULL,
  logo_url    TEXT,                          -- es. '/coop-logos/santa-lucia.png'
  colore      TEXT        NOT NULL DEFAULT '#0d9488',
  attiva      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cooperatives_studio
  ON cooperatives(studio_id);

COMMENT ON TABLE cooperatives IS
  'Cooperative di assistenza domiciliare convenzionate (sezione Domicili). '
  'Isolata dal resto del gestionale. (mig. 055)';


-- ─────────────────────────────────────────────────────────────────────────
-- 2. PAZIENTI PAI (Modulo PAI Operatori — tutti i campi del foglio)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coop_patients (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id              UUID        NOT NULL REFERENCES studios(id)      ON DELETE CASCADE,
  cooperative_id         UUID        NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,

  -- Anagrafica (sezione "Paziente" del modulo)
  cognome                TEXT        NOT NULL,
  nome                   TEXT        NOT NULL,
  data_nascita           DATE,
  residenza              TEXT,       -- via e civico
  citta                  TEXT,
  distretto              TEXT,       -- es. 'D'
  recapiti               TEXT,
  diagnosi               TEXT,

  -- Date PAI
  data_arrivo            DATE,
  data_attivazione       DATE,
  data_scadenza          DATE,

  -- Prestazioni PAI
  prestazione            TEXT        NOT NULL DEFAULT 'Fisioterapia',
  frequenza_settimanale  INT,        -- es. 3 (accessi a settimana)
  tot_accessi            INT,        -- es. 28
  operatori              TEXT,

  -- Pianificazione: giorni fissi con orario
  -- [{"dow":1,"orario":"09:00"},{"dow":3,"orario":"10:30"},{"dow":5,"orario":null}]
  -- dow: 1=LUN ... 6=SAB
  giorni_orari           JSONB       NOT NULL DEFAULT '[]'::jsonb,

  note                   TEXT,
  stato                  TEXT        NOT NULL DEFAULT 'attivo'
                                     CHECK (stato IN ('attivo','sospeso','concluso')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coop_patients_studio
  ON coop_patients(studio_id);
CREATE INDEX IF NOT EXISTS idx_coop_patients_coop
  ON coop_patients(cooperative_id);

COMMENT ON TABLE coop_patients IS
  'Pazienti PAI delle cooperative domiciliari. Tutti i campi del Modulo '
  'PAI Operatori. NESSUN legame con la tabella patients dello studio. (mig. 055)';


-- ─────────────────────────────────────────────────────────────────────────
-- 3. ACCESSI DOMICILIARI (calendario)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coop_accesses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id         UUID        NOT NULL REFERENCES studios(id)       ON DELETE CASCADE,
  coop_patient_id   UUID        NOT NULL REFERENCES coop_patients(id) ON DELETE CASCADE,
  data              DATE        NOT NULL,
  orario            TIME,                       -- opzionale (giorno + orario)
  stato             TEXT        NOT NULL DEFAULT 'pianificato'
                                CHECK (stato IN ('pianificato','fatto','saltato')),
  fatto_alle        TIMESTAMPTZ,                -- quando è stato spuntato
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un accesso al giorno per paziente (schema PAI)
  UNIQUE (coop_patient_id, data)
);

CREATE INDEX IF NOT EXISTS idx_coop_accesses_studio_data
  ON coop_accesses(studio_id, data);
CREATE INDEX IF NOT EXISTS idx_coop_accesses_patient
  ON coop_accesses(coop_patient_id);

COMMENT ON TABLE coop_accesses IS
  'Singoli accessi domiciliari a calendario. Il contatore accessi del '
  'paziente = COUNT(stato=''fatto''). "saltato" non consuma accessi. (mig. 055)';


-- ─────────────────────────────────────────────────────────────────────────
-- 4. IMPOSTAZIONI SEZIONE (per studio)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS domicili_settings (
  studio_id     UUID PRIMARY KEY REFERENCES studios(id) ON DELETE CASCADE,
  -- 'manuale'    → il contatore avanza solo con la spunta "fatto"
  -- 'automatico' → gli accessi pianificati dei giorni passati diventano
  --                "fatto" da soli (catch-up all'apertura della sezione);
  --                restano correggibili a mano ("saltato")
  counter_mode  TEXT        NOT NULL DEFAULT 'manuale'
                            CHECK (counter_mode IN ('manuale','automatico')),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE domicili_settings IS
  'Preferenze della sezione Domicili Cooperative per studio. (mig. 055)';


-- ─────────────────────────────────────────────────────────────────────────
-- RLS — pattern studio-scoped standard: studio_id IN (SELECT my_studios())
-- (stesso schema di waitlist_entries, mig. 054)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE cooperatives      ENABLE ROW LEVEL SECURITY;
ALTER TABLE coop_patients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE coop_accesses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE domicili_settings ENABLE ROW LEVEL SECURITY;

-- cooperatives
DROP POLICY IF EXISTS cooperatives_select ON cooperatives;
CREATE POLICY cooperatives_select ON cooperatives
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS cooperatives_insert ON cooperatives;
CREATE POLICY cooperatives_insert ON cooperatives
  FOR INSERT TO authenticated
  WITH CHECK (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS cooperatives_update ON cooperatives;
CREATE POLICY cooperatives_update ON cooperatives
  FOR UPDATE TO authenticated
  USING (studio_id IN (SELECT my_studios()))
  WITH CHECK (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS cooperatives_delete ON cooperatives;
CREATE POLICY cooperatives_delete ON cooperatives
  FOR DELETE TO authenticated
  USING (studio_id IN (SELECT my_studios()));

-- coop_patients
DROP POLICY IF EXISTS coop_patients_select ON coop_patients;
CREATE POLICY coop_patients_select ON coop_patients
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS coop_patients_insert ON coop_patients;
CREATE POLICY coop_patients_insert ON coop_patients
  FOR INSERT TO authenticated
  WITH CHECK (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS coop_patients_update ON coop_patients;
CREATE POLICY coop_patients_update ON coop_patients
  FOR UPDATE TO authenticated
  USING (studio_id IN (SELECT my_studios()))
  WITH CHECK (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS coop_patients_delete ON coop_patients;
CREATE POLICY coop_patients_delete ON coop_patients
  FOR DELETE TO authenticated
  USING (studio_id IN (SELECT my_studios()));

-- coop_accesses
DROP POLICY IF EXISTS coop_accesses_select ON coop_accesses;
CREATE POLICY coop_accesses_select ON coop_accesses
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS coop_accesses_insert ON coop_accesses;
CREATE POLICY coop_accesses_insert ON coop_accesses
  FOR INSERT TO authenticated
  WITH CHECK (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS coop_accesses_update ON coop_accesses;
CREATE POLICY coop_accesses_update ON coop_accesses
  FOR UPDATE TO authenticated
  USING (studio_id IN (SELECT my_studios()))
  WITH CHECK (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS coop_accesses_delete ON coop_accesses;
CREATE POLICY coop_accesses_delete ON coop_accesses
  FOR DELETE TO authenticated
  USING (studio_id IN (SELECT my_studios()));

-- domicili_settings
DROP POLICY IF EXISTS domicili_settings_select ON domicili_settings;
CREATE POLICY domicili_settings_select ON domicili_settings
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS domicili_settings_insert ON domicili_settings;
CREATE POLICY domicili_settings_insert ON domicili_settings
  FOR INSERT TO authenticated
  WITH CHECK (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS domicili_settings_update ON domicili_settings;
CREATE POLICY domicili_settings_update ON domicili_settings
  FOR UPDATE TO authenticated
  USING (studio_id IN (SELECT my_studios()))
  WITH CHECK (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS domicili_settings_delete ON domicili_settings;
CREATE POLICY domicili_settings_delete ON domicili_settings
  FOR DELETE TO authenticated
  USING (studio_id IN (SELECT my_studios()));
