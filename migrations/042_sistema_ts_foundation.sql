-- ═══════════════════════════════════════════════════════════════════════
-- Migration 042: Fondamenta Sistema Tessera Sanitaria (invio spese sanitarie)
-- ═══════════════════════════════════════════════════════════════════════
--
-- OBIETTIVO:
-- Posare lo strato DB per l'adempimento Sistema TS (D.Lgs. 175/2014).
-- NON tocca la fatturazione elettronica SdI: per le prestazioni sanitarie
-- a persone fisiche la e-fattura via SdI e' VIETATA (D.Lgs. 81/2025), quindi
-- il flusso paziente resta ricevuta/PDF + invio dati al Sistema TS.
--
-- SCELTE DI DESIGN:
-- - La config TS (interruttore + tipo spesa) vive in practice_settings,
--   accanto a P.IVA/PEC: e' una preferenza per-SOGGETTO (per owner_id),
--   non per sede. practice_settings ha una riga per owner_id.
-- - La numerazione del documento di spesa e' per SOGGETTO + ANNO solare
--   (un'unica serie progressiva per Partita IVA, anche con piu' sedi).
-- - I campi per-spesa stanno su appointments (ogni seduta incassata = spesa).
--
-- COSA AGGIUNGE:
-- 1. practice_settings: ts_enabled + ts_tipo_spesa_default (configurabile).
-- 2. patients: preferenza di opposizione "permanente" del paziente.
-- 3. appointments: campi per-spesa (esclusione, opposizione, tipo spesa
--    override, numero/anno/data documento, timestamp invio).
-- 4. ts_doc_counters: contatore progressivo per owner e per anno
--    (numerazione azzerata ogni anno, senza buchi).
-- 5. assign_ts_doc_numbers(): assegna i numeri documento mancanti in ordine
--    cronologico di incasso. Idempotente: salta chi e' gia' numerato.
--    Esclude sedute di ospiti, gratuite, senza paziente o importo nullo.
--
-- NOTA: ts_enabled = false di default -> comportamento invariato per tutti
-- finche' l'utente non attiva il TS dalle impostazioni.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS assign_ts_doc_numbers();
--   DROP TABLE IF EXISTS ts_doc_counters;
--   DROP INDEX IF EXISTS uq_appointments_ts_docnum;
--   DROP INDEX IF EXISTS idx_appointments_ts_pending;
--   ALTER TABLE appointments
--     DROP COLUMN IF EXISTS ts_exclude, DROP COLUMN IF EXISTS ts_opposizione,
--     DROP COLUMN IF EXISTS ts_tipo_spesa, DROP COLUMN IF EXISTS ts_doc_number,
--     DROP COLUMN IF EXISTS ts_doc_year, DROP COLUMN IF EXISTS ts_doc_date,
--     DROP COLUMN IF EXISTS ts_sent_at;
--   ALTER TABLE patients DROP COLUMN IF EXISTS ts_opposizione;
--   ALTER TABLE practice_settings
--     DROP COLUMN IF EXISTS ts_enabled, DROP COLUMN IF EXISTS ts_tipo_spesa_default;
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. practice_settings: configurazione TS (per soggetto) ──────────────
ALTER TABLE practice_settings
  ADD COLUMN IF NOT EXISTS ts_enabled            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ts_tipo_spesa_default TEXT    NOT NULL DEFAULT 'SP';

COMMENT ON COLUMN practice_settings.ts_enabled IS
  'Interruttore Sistema TS. true = soggetto obbligato che invia i dati di '
  'spesa al Sistema Tessera Sanitaria. Default false (nessun effetto).';
COMMENT ON COLUMN practice_settings.ts_tipo_spesa_default IS
  'Codice tipologia spesa di default per le prestazioni (es. SP). '
  'CONFIGURABILE: da confermare col commercialista in base alla figura '
  '(fisioterapista vs osteopata) e al tracciato XSD vigente.';

-- ─── 2. patients: opposizione permanente ────────────────────────────────
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS ts_opposizione BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN patients.ts_opposizione IS
  'Preferenza permanente del paziente: true = si oppone alla trasmissione '
  'dei propri dati di spesa all''Agenzia delle Entrate (precompilata). '
  'Default per le nuove sedute; resta overridabile per singola spesa.';

-- ─── 3. appointments: campi per-spesa TS ────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS ts_exclude     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ts_opposizione BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ts_tipo_spesa  TEXT,
  ADD COLUMN IF NOT EXISTS ts_doc_number  INTEGER,
  ADD COLUMN IF NOT EXISTS ts_doc_year    INTEGER,
  ADD COLUMN IF NOT EXISTS ts_doc_date    DATE,
  ADD COLUMN IF NOT EXISTS ts_sent_at     TIMESTAMPTZ;

COMMENT ON COLUMN appointments.ts_exclude IS
  'true = la seduta NON va inviata al Sistema TS (gratuita/omaggio, oppure '
  'prestazione fatturata B2B a societa''/assicurazione).';
COMMENT ON COLUMN appointments.ts_opposizione IS
  'Opposizione del paziente alla trasmissione per QUESTA spesa.';
COMMENT ON COLUMN appointments.ts_tipo_spesa IS
  'Override del codice tipo spesa per questa seduta. NULL = usa '
  'practice_settings.ts_tipo_spesa_default.';
COMMENT ON COLUMN appointments.ts_doc_number IS
  'Numero progressivo del documento di spesa (annuale, per soggetto). '
  'Assegnato da assign_ts_doc_numbers(). In Fase 2 = numero ricevuta.';
COMMENT ON COLUMN appointments.ts_sent_at IS
  'Quando la spesa e'' stata marcata come inviata al Sistema TS.';

-- Numerazione univoca e senza buchi per (soggetto, anno)
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_ts_docnum
  ON appointments (owner_id, ts_doc_year, ts_doc_number)
  WHERE ts_doc_number IS NOT NULL;

-- Spese candidate all'invio (pagate, non escluse, non ancora marcate inviate)
CREATE INDEX IF NOT EXISTS idx_appointments_ts_pending
  ON appointments (owner_id, paid_at)
  WHERE is_paid = true AND ts_exclude = false AND ts_sent_at IS NULL;

-- ─── 4. Contatore progressivo per soggetto/anno ─────────────────────────
CREATE TABLE IF NOT EXISTS ts_doc_counters (
  owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year        INTEGER     NOT NULL,
  last_number INTEGER     NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, year)
);

COMMENT ON TABLE ts_doc_counters IS
  'Contatore del numero documento di spesa, per soggetto (owner) e anno '
  'solare. Garantisce numerazione progressiva e senza buchi.';

ALTER TABLE ts_doc_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ts_doc_counters_select ON ts_doc_counters;
CREATE POLICY ts_doc_counters_select ON ts_doc_counters
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS ts_doc_counters_insert ON ts_doc_counters;
CREATE POLICY ts_doc_counters_insert ON ts_doc_counters
  FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS ts_doc_counters_update ON ts_doc_counters;
CREATE POLICY ts_doc_counters_update ON ts_doc_counters
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS ts_doc_counters_delete ON ts_doc_counters;
CREATE POLICY ts_doc_counters_delete ON ts_doc_counters
  FOR DELETE USING (owner_id = auth.uid());

-- ─── 5. Assegnazione numeri documento (invoker -> rispetta RLS) ──────────
CREATE OR REPLACE FUNCTION assign_ts_doc_numbers()
RETURNS INTEGER AS $$
DECLARE
  v_owner     UUID := auth.uid();
  r           RECORD;
  v_local     DATE;
  v_year      INTEGER;
  v_next      INTEGER;
  v_assigned  INTEGER := 0;
BEGIN
  IF v_owner IS NULL THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT id, paid_at
    FROM appointments
    WHERE owner_id             = v_owner
      AND is_paid              = true
      AND ts_exclude           = false
      AND ts_doc_number        IS NULL
      AND paid_at              IS NOT NULL
      AND patient_id           IS NOT NULL
      AND guest_practitioner_id IS NULL
      AND COALESCE(amount, 0)  > 0
    ORDER BY paid_at ASC, id ASC
  LOOP
    v_local := (r.paid_at AT TIME ZONE 'Europe/Rome')::DATE;
    v_year  := EXTRACT(YEAR FROM v_local)::INT;

    INSERT INTO ts_doc_counters (owner_id, year, last_number)
    VALUES (v_owner, v_year, 0)
    ON CONFLICT (owner_id, year) DO NOTHING;

    SELECT last_number INTO v_next
    FROM ts_doc_counters
    WHERE owner_id = v_owner AND year = v_year
    FOR UPDATE;

    v_next := v_next + 1;

    UPDATE ts_doc_counters
    SET last_number = v_next, updated_at = now()
    WHERE owner_id = v_owner AND year = v_year;

    UPDATE appointments
    SET ts_doc_number = v_next,
        ts_doc_year   = v_year,
        ts_doc_date   = v_local
    WHERE id = r.id;

    v_assigned := v_assigned + 1;
  END LOOP;

  RETURN v_assigned;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION assign_ts_doc_numbers() IS
  'Assegna il numero documento di spesa progressivo (annuale, per soggetto) '
  'alle sedute pagate, non escluse, con paziente e importo, escludendo gli '
  'ospiti, in ordine di data incasso. Idempotente. Restituisce quante spese '
  'ha numerato. Eseguita prima dell''export TS.';
