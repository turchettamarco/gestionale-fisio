-- ═══════════════════════════════════════════════════════════════════════
-- Migration 044: modalità numerazione documenti + numero documento testuale
-- ═══════════════════════════════════════════════════════════════════════
--
-- OBIETTIVO:
-- Supportare due modi di numerazione delle ricevute/fatture per il Sistema TS:
--   - 'external'  → l'utente fattura fuori (Xolo / commercialista): FisioHub
--                   NON genera numeri; il numero documento (testo, es. "2026/123")
--                   e la data documento si inseriscono a mano per ogni spesa.
--   - 'fisiohub'  → FisioHub genera il progressivo (e in Fase 2 la ricevuta PDF).
--
-- I numeri reali possono essere alfanumerici/sezionali, quindi il numero
-- "ufficiale" inviato al TS è un campo TESTO: appointments.ts_doc_ref.
-- In modalità 'fisiohub' ts_doc_ref viene riempito dal progressivo intero.
--
-- assign_ts_doc_numbers() ora:
--   - gira SOLO se la modalità del soggetto è 'fisiohub' (altrimenti ritorna 0);
--   - oltre a ts_doc_number/anno/data, valorizza ts_doc_ref = numero::text.
--
-- ROLLBACK:
--   ALTER TABLE practice_settings DROP COLUMN IF EXISTS ts_numbering_mode;
--   ALTER TABLE appointments DROP COLUMN IF EXISTS ts_doc_ref;
--   (e ripristinare la versione 042/043 della funzione)
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. practice_settings: modalità numerazione ─────────────────────────
ALTER TABLE practice_settings
  ADD COLUMN IF NOT EXISTS ts_numbering_mode TEXT NOT NULL DEFAULT 'external';

COMMENT ON COLUMN practice_settings.ts_numbering_mode IS
  'Modalità numerazione documenti: ''external'' (numeri da Xolo/commercialista, '
  'inseriti a mano) oppure ''fisiohub'' (progressivo generato da FisioHub).';

-- ─── 2. appointments: numero documento testuale (ufficiale per il TS) ────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS ts_doc_ref TEXT;

COMMENT ON COLUMN appointments.ts_doc_ref IS
  'Numero documento di spesa "ufficiale" inviato al Sistema TS (testo, può '
  'essere alfanumerico/sezionale, es. "2026/123"). In modalità ''external'' '
  'inserito a mano (es. numero Xolo); in ''fisiohub'' = ts_doc_number::text.';

-- ─── 3. Funzione: numera solo in modalità 'fisiohub', valorizza ts_doc_ref ─
CREATE OR REPLACE FUNCTION assign_ts_doc_numbers()
RETURNS INTEGER AS $$
DECLARE
  v_owner     UUID := auth.uid();
  v_mode      TEXT;
  r           RECORD;
  v_local     DATE;
  v_year      INTEGER;
  v_next      INTEGER;
  v_assigned  INTEGER := 0;
BEGIN
  IF v_owner IS NULL THEN
    RETURN 0;
  END IF;

  SELECT ts_numbering_mode INTO v_mode FROM practice_settings WHERE owner_id = v_owner;
  IF v_mode IS DISTINCT FROM 'fisiohub' THEN
    RETURN 0;  -- modalità esterna (Xolo): nessuna auto-numerazione
  END IF;

  FOR r IN
    SELECT id, paid_at
    FROM appointments
    WHERE owner_id             = v_owner
      AND is_paid              = true
      AND price_type           = 'invoiced'
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
        ts_doc_ref    = v_next::text,
        ts_doc_year   = v_year,
        ts_doc_date   = v_local
    WHERE id = r.id;

    v_assigned := v_assigned + 1;
  END LOOP;

  RETURN v_assigned;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION assign_ts_doc_numbers() IS
  'Numera le sole sedute fatturate, SOLO in modalità ts_numbering_mode=''fisiohub''. '
  'Valorizza ts_doc_number (intero progressivo), ts_doc_ref (testo), anno e data. '
  'Idempotente. In modalità ''external'' ritorna 0 (numeri inseriti a mano). (mig. 044)';
