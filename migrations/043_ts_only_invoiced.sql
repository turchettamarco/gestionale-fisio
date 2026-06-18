-- ═══════════════════════════════════════════════════════════════════════
-- Migration 043: numerazione TS solo per sedute FATTURATE
-- ═══════════════════════════════════════════════════════════════════════
--
-- OBIETTIVO:
-- Restringere assign_ts_doc_numbers() alle sole sedute fatturate
-- (price_type = 'invoiced'). Le sedute incassate in contanti senza
-- documento fiscale non ricevono un numero documento di spesa, cosi' la
-- serie progressiva delle fatturate resta continua e senza buchi.
--
-- NOTA: nessuna modifica di schema, solo CREATE OR REPLACE della funzione.
-- I numeri eventualmente gia' assegnati restano invariati (idempotente).
--
-- ROLLBACK: ri-applicare la versione della migration 042 (senza il filtro
--   price_type = 'invoiced').
-- ═══════════════════════════════════════════════════════════════════════

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
  'alle sole sedute FATTURATE (price_type = ''invoiced''), pagate, non escluse, '
  'con paziente e importo, escludendo gli ospiti, in ordine di data incasso. '
  'Idempotente. Restituisce quante spese ha numerato. (mig. 043)';
