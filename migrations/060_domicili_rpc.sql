-- ============================================================================
-- 060 — Domicili: RPC atomiche
--   1) domicili_reorder_day(p_ids)      → scaletta in UN solo statement
--   2) domicili_propaga_orario(...)     → stessa ora su tutti gli accessi
--      futuri del paziente, saltando slot occupati e giorni chiusi
-- SECURITY INVOKER: le RLS esistenti restano il confine di sicurezza.
-- ============================================================================

-- 1) Riordino scaletta: ordine = posizione nell'array (0-based)
CREATE OR REPLACE FUNCTION domicili_reorder_day(p_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
  UPDATE coop_accesses a
  SET ordine = t.ord - 1
  FROM unnest(p_ids) WITH ORDINALITY AS t(id, ord)
  WHERE a.id = t.id;
$$;

GRANT EXECUTE ON FUNCTION domicili_reorder_day(uuid[]) TO authenticated;

-- 2) Propagazione orario: aggiorna gli accessi PIANIFICATI del paziente da
--    p_from_date in poi (escluso p_except_id), solo dove:
--      - lo slot orario (ora piena, 7–19) non è occupato da un altro paziente
--      - il giorno non cade in una chiusura (domicili_chiusure)
--    Ritorna il numero di accessi aggiornati.
CREATE OR REPLACE FUNCTION domicili_propaga_orario(
  p_studio_id  uuid,
  p_patient_id uuid,
  p_orario     text,
  p_except_id  uuid,
  p_from_date  date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_orario time := p_orario::time;
  v_slot   int  := least(greatest(extract(hour from p_orario::time)::int, 7), 19);
  v_count  int;
BEGIN
  WITH candidati AS (
    SELECT a.id, a.data
    FROM coop_accesses a
    WHERE a.studio_id       = p_studio_id
      AND a.coop_patient_id = p_patient_id
      AND a.id             <> p_except_id
      AND a.data           >= p_from_date
      AND a.stato           = 'pianificato'
      AND (a.orario IS NULL OR a.orario <> v_orario)
  ),
  liberi AS (
    SELECT c.id
    FROM candidati c
    WHERE NOT EXISTS (               -- slot già preso da un altro accesso con orario
      SELECT 1 FROM coop_accesses b
      WHERE b.studio_id = p_studio_id
        AND b.data      = c.data
        AND b.id       <> c.id
        AND b.orario IS NOT NULL
        AND least(greatest(extract(hour from b.orario)::int, 7), 19) = v_slot
    )
    AND NOT EXISTS (                 -- giorno dentro una chiusura
      SELECT 1 FROM domicili_chiusure ch
      WHERE ch.studio_id = p_studio_id
        AND c.data BETWEEN ch.data_da AND ch.data_a
    )
  )
  UPDATE coop_accesses a
  SET orario = v_orario
  FROM liberi l
  WHERE a.id = l.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION domicili_propaga_orario(uuid, uuid, text, uuid, date) TO authenticated;
