-- 057: memorizza la modalità d'inizio pianificazione del paziente PAI
-- (retroattiva sì/no), così la scelta persiste tra le aperture del modal.
ALTER TABLE coop_patients
  ADD COLUMN IF NOT EXISTS pianificazione_retroattiva boolean NOT NULL DEFAULT false;

-- I pazienti con accessi passati "fatto" sono di fatto retroattivi
UPDATE coop_patients p
SET pianificazione_retroattiva = true
WHERE EXISTS (
  SELECT 1 FROM coop_accesses a
  WHERE a.coop_patient_id = p.id
    AND a.stato = 'fatto'
    AND a.data < CURRENT_DATE
);
