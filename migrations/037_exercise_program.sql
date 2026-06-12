-- ════════════════════════════════════════════════════════════════════════
-- migrations/037_exercise_program.sql
-- ════════════════════════════════════════════════════════════════════════
-- Programma esercizi con progressione (mig. 037).
--
-- La scheda esercizi diventa un PROGRAMMA con dimensione temporale:
--   - fase: fase clinica (acuta | subacuta | cronica) → guida l'AI nella
--     scelta di esercizi e dosaggio
--   - durata_settimane: durata del programma (1-12)
--   - start_date: inizio programma → la pagina pubblica calcola e
--     evidenzia la settimana corrente del paziente
--
-- La progressione settimanale per esercizio vive nel JSON `esercizi`
-- (campo `progressione: [{settimana, serie, ripetizioni, carico}]`),
-- retrocompatibile: le schede esistenti senza progressione continuano a
-- funzionare come liste semplici.
--
-- NB: nessun BEGIN/COMMIT — il runner non supporta comandi transazionali.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE schede_esercizi_pubbliche
  ADD COLUMN IF NOT EXISTS fase TEXT
    CHECK (fase IS NULL OR fase IN ('acuta', 'subacuta', 'cronica')),
  ADD COLUMN IF NOT EXISTS durata_settimane INTEGER
    CHECK (durata_settimane IS NULL OR (durata_settimane BETWEEN 1 AND 12)),
  ADD COLUMN IF NOT EXISTS start_date DATE;

COMMENT ON COLUMN schede_esercizi_pubbliche.fase IS
  'Fase clinica del programma: acuta | subacuta | cronica. Guida l''AI nel '
  'dosaggio. NULL per schede legacy senza programma.';

COMMENT ON COLUMN schede_esercizi_pubbliche.durata_settimane IS
  'Durata del programma in settimane (1-12). NULL per schede legacy.';

COMMENT ON COLUMN schede_esercizi_pubbliche.start_date IS
  'Data inizio programma: la pagina pubblica evidenzia la settimana '
  'corrente del paziente calcolata da qui.';
