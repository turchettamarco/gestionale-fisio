-- ═══════════════════════════════════════════════════════════════════════
-- Migration 027: Foundation — Tabelle cliniche strutturate
-- ═══════════════════════════════════════════════════════════════════════
--
-- OBIETTIVO (Tappa 3 del refactor "ristrutturazione completa"):
-- Creare le tabelle di base per trasformare il "Quadro clinico" del paziente
-- da textarea libere (anamnesi, diagnosi, piano) in dati strutturati che
-- permettano:
--   • lettura a colpo d'occhio (campi separati, non paragrafi da leggere)
--   • progress-tracking nel tempo (cosa è cambiato seduta dopo seduta)
--   • estrazione automatica per pannello "Riassunto rapido"
--
-- TABELLE CREATE (5):
--   1. red_flag_types      — catalogo modificabile dei tipi di red flag
--                            (lista internazionale standard, ma editabile
--                            dallo studio: aggiungere/disattivare voci)
--   2. clinical_assessments — 1 record per paziente con la valutazione
--                            clinica strutturata (sede, durata, insorgenza,
--                            caratteristiche dolore, diagnosi, piano)
--   3. clinical_red_flags   — N record per paziente, link a red_flag_types
--                            con valore (true/false/null) e note
--   4. clinical_tests       — N record per paziente, test ortopedici
--                            eseguiti con risultato
--   5. clinical_goals       — N record per paziente, obiettivi numerati
--                            con stato (attivo/raggiunto/archiviato)
--
-- IMPORTANTE — TAPPA 3 NON TOCCA LA UI:
-- Questa migration crea SOLO le tabelle vuote. L'app continua a funzionare
-- come prima. I pazienti esistenti restano con le loro textarea libere.
-- Le tabelle saranno popolate dalla UI a partire dalla Tappa 5+.
--
-- COMPATIBILITÀ DATI ESISTENTI:
-- Nessuna migrazione di dati esistenti. Le textarea attuali
-- (`clinical_data.anamnesis`, `.diagnosis`, `.treatment_plan`) restano e
-- continueranno a funzionare. Le nuove tabelle sono ADDITIVE.
--
-- MULTI-TENANT:
-- Ogni record ha studio_id + owner_id come tutte le altre tabelle.
-- RLS policy: l'utente vede solo i record con owner_id = auth.uid().
-- Coerente con il pattern di patient_packages, session_notes, ecc.
--
-- SEED red_flag_types:
-- Pre-popoliamo con 12 red flags standard internazionali per fisioterapia
-- (basate su evidenza letteraria — Roman 2019, Greenhalgh 2010 per rachide).
-- Sono is_system=true: non eliminabili (solo disattivabili) per non perdere
-- riferimenti da clinical_red_flags già scritti.
--
-- ROLLBACK:
-- Tutte le DROP in cascata; eseguire in ordine inverso:
--   DROP TABLE IF EXISTS clinical_goals CASCADE;
--   DROP TABLE IF EXISTS clinical_tests CASCADE;
--   DROP TABLE IF EXISTS clinical_red_flags CASCADE;
--   DROP TABLE IF EXISTS clinical_assessments CASCADE;
--   DROP TABLE IF EXISTS red_flag_types CASCADE;
--
-- NOTA TRANSAZIONI:
-- Niente BEGIN/COMMIT espliciti in questa migration. Lo script
-- npm run db:migrate la esegue via la function exec_migration_sql che
-- avvolge tutto in un blocco PL/pgSQL atomico (transazione implicita).
-- Aggiungere BEGIN/COMMIT qui produrrebbe l'errore PostgreSQL:
--   "EXECUTE of transaction commands is not implemented [0A000]"
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════
-- 1. red_flag_types — Catalogo dei tipi di red flag (modificabile)
-- ═══════════════════════════════════════════════════════════════════════
-- 12 red flags di sistema seed (is_system=true, non eliminabili).
-- Ogni studio può aggiungere i propri (is_system=false, owner_id valorizzato).
-- I red flag di sistema sono visibili a tutti gli studi (owner_id NULL).

CREATE TABLE IF NOT EXISTS red_flag_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenancy: NULL = red flag di sistema (visibile a tutti).
  -- UUID = red flag personalizzato dello studio.
  studio_id    UUID REFERENCES studios(id) ON DELETE CASCADE,
  owner_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Codice unico (per riferimenti programmatici, es. da TypeScript)
  code         TEXT NOT NULL,

  -- Nome leggibile mostrato nella UI
  label        TEXT NOT NULL,

  -- Descrizione clinica più estesa (tooltip / info)
  description  TEXT,

  -- Categoria clinica (per raggrupparli nella UI)
  category     TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'spine', 'neurological', 'oncological', 'infectious', 'cardiovascular')),

  -- Severità suggerita (info per la UI, non vincolante)
  severity     TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('warning', 'urgent', 'emergency')),

  -- Red flag di sistema (seed) o personalizzato dallo studio.
  -- Quelli di sistema non sono eliminabili (solo disattivabili da is_active).
  is_system    BOOLEAN NOT NULL DEFAULT false,

  -- Soft-delete: per nascondere senza perdere i dati che fanno riferimento
  is_active    BOOLEAN NOT NULL DEFAULT true,

  -- Ordine di visualizzazione nella UI
  sort_order   INT NOT NULL DEFAULT 0,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- I red flag di sistema NON hanno studio/owner; quelli custom sì.
  CONSTRAINT red_flag_types_ownership CHECK (
    (is_system = true  AND studio_id IS NULL AND owner_id IS NULL) OR
    (is_system = false AND studio_id IS NOT NULL AND owner_id IS NOT NULL)
  )
);

COMMENT ON TABLE red_flag_types IS
  'Catalogo dei tipi di red flag clinici. Seed con 12 voci standard di sistema (is_system=true). '
  'Ogni studio può aggiungere i propri (is_system=false). Modificabili dalla UI delle impostazioni.';

-- Indice per ricerca per studio + codice (uniqueness logica)
CREATE UNIQUE INDEX IF NOT EXISTS idx_red_flag_types_code_per_studio
  ON red_flag_types (COALESCE(studio_id::text, 'system'), code);

CREATE INDEX IF NOT EXISTS idx_red_flag_types_active
  ON red_flag_types (is_active, sort_order)
  WHERE is_active = true;


-- ═══════════════════════════════════════════════════════════════════════
-- 2. clinical_assessments — Valutazione clinica strutturata del paziente
-- ═══════════════════════════════════════════════════════════════════════
-- 1 record per paziente (UNIQUE su patient_id). Convive con
-- clinical_data.anamnesis/diagnosis/treatment_plan (textarea libere)
-- che restano per compatibilità.

CREATE TABLE IF NOT EXISTS clinical_assessments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id    UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- ─── ANAMNESI STRUTTURATA ───
  -- Sede del dolore (lista zone selezionate; es. ["lombare", "gluteo dx"])
  pain_locations    TEXT[] NOT NULL DEFAULT '{}',

  -- Durata del problema (numero + unità)
  duration_value    INT,
  duration_unit     TEXT CHECK (duration_unit IN ('days', 'weeks', 'months', 'years')),

  -- Modalità di insorgenza
  onset_type        TEXT
    CHECK (onset_type IN ('gradual', 'sudden', 'traumatic', 'post_surgical', 'unknown')),

  -- Frequenza del dolore
  pain_frequency    TEXT
    CHECK (pain_frequency IN ('constant', 'intermittent', 'episodic', 'with_activity')),

  -- Caratteristiche del dolore (multi-select; es. ["burning", "dull", "sharp"])
  pain_characteristics TEXT[] NOT NULL DEFAULT '{}',

  -- Fattori aggravanti / allevianti (testo libero, le chip standard verranno in Tappa 5)
  aggravating_factors  TEXT[] NOT NULL DEFAULT '{}',
  relieving_factors    TEXT[] NOT NULL DEFAULT '{}',

  -- ─── DIAGNOSI ───
  -- Diagnosi principale (singola riga)
  primary_diagnosis    TEXT,

  -- Diagnosi differenziali considerate
  differential_diagnoses TEXT[] NOT NULL DEFAULT '{}',

  -- ─── PIANO DI TRATTAMENTO ───
  -- Frequenza prevista (sedute/settimana)
  planned_frequency_per_week  NUMERIC(3,1)
    CHECK (planned_frequency_per_week IS NULL OR planned_frequency_per_week > 0),

  -- Durata stimata totale (settimane)
  planned_duration_weeks      INT
    CHECK (planned_duration_weeks IS NULL OR planned_duration_weeks > 0),

  -- Tecniche pianificate (chip multi-select; es. ["manipulation", "exercise"])
  planned_techniques          TEXT[] NOT NULL DEFAULT '{}',

  -- ─── NOTE LIBERE (fallback per ciò che non sta nei campi strutturati) ───
  notes        TEXT,

  -- ─── TIMESTAMP ───
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 1 valutazione per paziente
  UNIQUE (patient_id)
);

COMMENT ON TABLE clinical_assessments IS
  'Valutazione clinica strutturata del paziente. 1:1 con patients. Convive con clinical_data '
  '(textarea libere) per compatibilità retroattiva. Popolata dalla UI a partire dalla Tappa 5.';

CREATE INDEX IF NOT EXISTS idx_clinical_assessments_studio
  ON clinical_assessments (studio_id);

CREATE INDEX IF NOT EXISTS idx_clinical_assessments_patient
  ON clinical_assessments (patient_id);


-- ═══════════════════════════════════════════════════════════════════════
-- 3. clinical_red_flags — Red flag rilevati per paziente
-- ═══════════════════════════════════════════════════════════════════════
-- N record per paziente. Link a red_flag_types.

CREATE TABLE IF NOT EXISTS clinical_red_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  red_flag_type_id UUID NOT NULL REFERENCES red_flag_types(id) ON DELETE RESTRICT,

  -- true = presente, false = escluso, NULL = da valutare
  is_present      BOOLEAN,

  -- Note specifiche (es. "perde 5kg in 2 mesi senza dieta")
  notes           TEXT,

  -- Quando è stato rilevato
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un paziente ha 1 sola entry per ogni tipo di red flag
  UNIQUE (patient_id, red_flag_type_id)
);

COMMENT ON TABLE clinical_red_flags IS
  'Red flag rilevati su un paziente. UNIQUE (patient, type) — un paziente ha 1 entry per tipo, '
  'con is_present TRUE/FALSE/NULL. Permette di tracciare anche le esclusioni esplicite.';

CREATE INDEX IF NOT EXISTS idx_clinical_red_flags_patient
  ON clinical_red_flags (patient_id, is_present);


-- ═══════════════════════════════════════════════════════════════════════
-- 4. clinical_tests — Test ortopedici/clinici eseguiti
-- ═══════════════════════════════════════════════════════════════════════
-- N record per paziente. Nessun catalogo: il nome del test è testo libero
-- (così non vincoliamo a un elenco — chiunque scrive "Lasègue", "Hawkins",
-- ecc. liberamente). In Tappa 6 aggiungeremo autocomplete.

CREATE TABLE IF NOT EXISTS clinical_tests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id    UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Nome del test (es. "Lasègue", "Kemp", "Hawkins-Kennedy")
  test_name    TEXT NOT NULL,

  -- Risultato
  result       TEXT NOT NULL
    CHECK (result IN ('positive', 'negative', 'inconclusive', 'not_assessable')),

  -- Lato (per test bilaterali; NULL per quelli non lateralizzati)
  side         TEXT CHECK (side IN ('left', 'right', 'bilateral', NULL)),

  -- Note specifiche (es. "riproduce sintomi a 45°")
  notes        TEXT,

  -- Quando è stato eseguito
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE clinical_tests IS
  'Test ortopedici e clinici eseguiti sul paziente. Storico completo (no UNIQUE: lo stesso '
  'test può essere ri-eseguito a distanza di settimane per misurare progressi).';

CREATE INDEX IF NOT EXISTS idx_clinical_tests_patient_performed
  ON clinical_tests (patient_id, performed_at DESC);


-- ═══════════════════════════════════════════════════════════════════════
-- 5. clinical_goals — Obiettivi del paziente
-- ═══════════════════════════════════════════════════════════════════════
-- N record per paziente. Lista numerata di obiettivi con stato.

CREATE TABLE IF NOT EXISTS clinical_goals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id    UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Descrizione dell'obiettivo (es. "tornare a correre 5km entro 2 mesi")
  description  TEXT NOT NULL,

  -- Stato
  status       TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'achieved', 'archived')),

  -- Ordine di visualizzazione (drag-and-drop nella UI in Tappa 7)
  sort_order   INT NOT NULL DEFAULT 0,

  -- Target date opzionale
  target_date  DATE,

  -- Quando è stato raggiunto (popolato quando status passa a 'achieved')
  achieved_at  TIMESTAMPTZ,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE clinical_goals IS
  'Obiettivi del paziente. Lista ordinabile, ogni obiettivo ha stato attivo/raggiunto/archiviato. '
  'Usata anche dal pannello "Riassunto rapido" per mostrare a colpo d''occhio gli obiettivi attivi.';

CREATE INDEX IF NOT EXISTS idx_clinical_goals_patient_status
  ON clinical_goals (patient_id, status, sort_order);


-- ═══════════════════════════════════════════════════════════════════════
-- 6. RLS — Row Level Security su tutte e 5 le tabelle
-- ═══════════════════════════════════════════════════════════════════════
-- Pattern identico a patient_packages: owner_id = auth.uid().
-- ECCEZIONE: red_flag_types ha policy speciale per i record di sistema
-- (is_system=true, owner_id=NULL): visibili a TUTTI in SELECT.

ALTER TABLE red_flag_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_assessments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_red_flags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_tests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_goals        ENABLE ROW LEVEL SECURITY;

-- ─── red_flag_types: lettura "tipi di sistema" libera, modifiche solo sul proprio ───
DROP POLICY IF EXISTS red_flag_types_select ON red_flag_types;
CREATE POLICY red_flag_types_select ON red_flag_types
  FOR SELECT USING (
    is_system = true OR owner_id = auth.uid()
  );

DROP POLICY IF EXISTS red_flag_types_insert ON red_flag_types;
CREATE POLICY red_flag_types_insert ON red_flag_types
  FOR INSERT WITH CHECK (
    is_system = false AND owner_id = auth.uid()
  );

DROP POLICY IF EXISTS red_flag_types_update ON red_flag_types;
CREATE POLICY red_flag_types_update ON red_flag_types
  FOR UPDATE
  USING      (is_system = false AND owner_id = auth.uid())
  WITH CHECK (is_system = false AND owner_id = auth.uid());

DROP POLICY IF EXISTS red_flag_types_delete ON red_flag_types;
CREATE POLICY red_flag_types_delete ON red_flag_types
  FOR DELETE USING (
    is_system = false AND owner_id = auth.uid()
  );

-- ─── clinical_assessments ───
DROP POLICY IF EXISTS clinical_assessments_select ON clinical_assessments;
CREATE POLICY clinical_assessments_select ON clinical_assessments
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS clinical_assessments_insert ON clinical_assessments;
CREATE POLICY clinical_assessments_insert ON clinical_assessments
  FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS clinical_assessments_update ON clinical_assessments;
CREATE POLICY clinical_assessments_update ON clinical_assessments
  FOR UPDATE USING (owner_id = auth.uid())
                WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS clinical_assessments_delete ON clinical_assessments;
CREATE POLICY clinical_assessments_delete ON clinical_assessments
  FOR DELETE USING (owner_id = auth.uid());

-- ─── clinical_red_flags ───
DROP POLICY IF EXISTS clinical_red_flags_select ON clinical_red_flags;
CREATE POLICY clinical_red_flags_select ON clinical_red_flags
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS clinical_red_flags_insert ON clinical_red_flags;
CREATE POLICY clinical_red_flags_insert ON clinical_red_flags
  FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS clinical_red_flags_update ON clinical_red_flags;
CREATE POLICY clinical_red_flags_update ON clinical_red_flags
  FOR UPDATE USING (owner_id = auth.uid())
                WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS clinical_red_flags_delete ON clinical_red_flags;
CREATE POLICY clinical_red_flags_delete ON clinical_red_flags
  FOR DELETE USING (owner_id = auth.uid());

-- ─── clinical_tests ───
DROP POLICY IF EXISTS clinical_tests_select ON clinical_tests;
CREATE POLICY clinical_tests_select ON clinical_tests
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS clinical_tests_insert ON clinical_tests;
CREATE POLICY clinical_tests_insert ON clinical_tests
  FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS clinical_tests_update ON clinical_tests;
CREATE POLICY clinical_tests_update ON clinical_tests
  FOR UPDATE USING (owner_id = auth.uid())
                WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS clinical_tests_delete ON clinical_tests;
CREATE POLICY clinical_tests_delete ON clinical_tests
  FOR DELETE USING (owner_id = auth.uid());

-- ─── clinical_goals ───
DROP POLICY IF EXISTS clinical_goals_select ON clinical_goals;
CREATE POLICY clinical_goals_select ON clinical_goals
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS clinical_goals_insert ON clinical_goals;
CREATE POLICY clinical_goals_insert ON clinical_goals
  FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS clinical_goals_update ON clinical_goals;
CREATE POLICY clinical_goals_update ON clinical_goals
  FOR UPDATE USING (owner_id = auth.uid())
                WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS clinical_goals_delete ON clinical_goals;
CREATE POLICY clinical_goals_delete ON clinical_goals
  FOR DELETE USING (owner_id = auth.uid());


-- ═══════════════════════════════════════════════════════════════════════
-- 7. Trigger updated_at — Aggiornamento automatico timestamp
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_updated_at_clinical()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_red_flag_types_updated_at ON red_flag_types;
CREATE TRIGGER trg_red_flag_types_updated_at
  BEFORE UPDATE ON red_flag_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_clinical();

DROP TRIGGER IF EXISTS trg_clinical_assessments_updated_at ON clinical_assessments;
CREATE TRIGGER trg_clinical_assessments_updated_at
  BEFORE UPDATE ON clinical_assessments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_clinical();

DROP TRIGGER IF EXISTS trg_clinical_red_flags_updated_at ON clinical_red_flags;
CREATE TRIGGER trg_clinical_red_flags_updated_at
  BEFORE UPDATE ON clinical_red_flags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_clinical();

DROP TRIGGER IF EXISTS trg_clinical_tests_updated_at ON clinical_tests;
CREATE TRIGGER trg_clinical_tests_updated_at
  BEFORE UPDATE ON clinical_tests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_clinical();

DROP TRIGGER IF EXISTS trg_clinical_goals_updated_at ON clinical_goals;
CREATE TRIGGER trg_clinical_goals_updated_at
  BEFORE UPDATE ON clinical_goals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_clinical();


-- ═══════════════════════════════════════════════════════════════════════
-- 8. SEED red_flag_types — 12 red flags standard internazionali
-- ═══════════════════════════════════════════════════════════════════════
-- Lista basata su letteratura: red flags per dolore lombare e generale
-- in fisioterapia. is_system=true → visibili a tutti gli studi, non
-- eliminabili (solo disattivabili da is_active=false).
--
-- L'utente può aggiungere proprie red flags dalle impostazioni studio
-- (verranno gestite con is_system=false e studio_id/owner_id valorizzati).

INSERT INTO red_flag_types (code, label, description, category, severity, is_system, sort_order)
VALUES
  -- General red flags
  ('unexplained_weight_loss', 'Perdita di peso inspiegata',
   'Perdita superiore a 5kg in 6 mesi senza dieta o causa nota.',
   'general', 'urgent', true, 10),

  ('fever_chills', 'Febbre o brividi persistenti',
   'Febbre >38° o brividi senza causa apparente, soprattutto se associati a dolore.',
   'infectious', 'urgent', true, 20),

  ('history_of_cancer', 'Storia di cancro',
   'Pregressa diagnosi oncologica con possibile metastasi.',
   'oncological', 'urgent', true, 30),

  -- Spine red flags
  ('night_pain', 'Dolore notturno severo',
   'Dolore che sveglia il paziente e non migliora con il riposo.',
   'spine', 'urgent', true, 40),

  ('rest_pain', 'Dolore a riposo non meccanico',
   'Dolore costante non modulato dal movimento o dalla posizione.',
   'spine', 'warning', true, 50),

  ('thoracic_pain', 'Dolore toracico in giovane',
   'Dolore toracico in paziente <20 anni o >55 anni senza causa meccanica.',
   'spine', 'warning', true, 60),

  ('major_trauma', 'Trauma maggiore recente',
   'Caduta da altezza, incidente stradale, trauma significativo.',
   'spine', 'urgent', true, 70),

  -- Neurological red flags
  ('saddle_anesthesia', 'Anestesia a sella',
   'Perdita di sensibilità in zona perineale/glutea — sospetta cauda equina.',
   'neurological', 'emergency', true, 80),

  ('bowel_bladder_dysfunction', 'Disfunzione vescica/intestino',
   'Ritenzione urinaria, incontinenza recente — sospetta cauda equina.',
   'neurological', 'emergency', true, 90),

  ('progressive_weakness', 'Deficit motorio progressivo',
   'Debolezza muscolare in peggioramento o estesa a più miotomi.',
   'neurological', 'urgent', true, 100),

  ('widespread_paresthesia', 'Parestesie estese',
   'Formicolio/intorpidimento esteso a più dermatomeri o bilaterale.',
   'neurological', 'urgent', true, 110),

  -- Cardiovascular
  ('vascular_claudication', 'Claudicatio vascolare',
   'Dolore agli arti inferiori durante il cammino con remissione a riposo.',
   'cardiovascular', 'warning', true, 120)

ON CONFLICT DO NOTHING;
