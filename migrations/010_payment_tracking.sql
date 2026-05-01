-- ═══════════════════════════════════════════════════════════════════════
-- Migration 010: Tracking pagamenti completo (paid_at + CHECK constraint)
-- ═══════════════════════════════════════════════════════════════════════
--
-- OBIETTIVO:
-- Portare il tracking pagamenti da binario (is_paid sì/no) a tracciato
-- in modo completo: sapere QUANDO è stato pagato, in modo che i report
-- "incassato a marzo" usino la data del pagamento e non quella della seduta.
--
-- AGGIUNGE:
-- 1. Colonna paid_at (TIMESTAMPTZ) su appointments → data del pagamento
-- 2. Backfill paid_at per gli appuntamenti già pagati (usa start_at come
--    proxy, perché storicamente non sapevamo quando fossero stati pagati)
-- 3. Indice su (studio_id, paid_at) per i report di incasso per periodo
-- 4. CHECK constraint per garantire coerenza: is_paid=true ↔ paid_at NOT NULL
--
-- COMPATIBILITÀ:
-- - payment_method esiste già (cash | pos | bank_transfer | null)
-- - is_paid esiste già (boolean)
-- - Non rinominiamo né rimuoviamo nulla → zero rischi sul codice esistente
--
-- ROLLBACK:
-- ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_paid_consistency;
-- DROP INDEX IF EXISTS idx_appointments_studio_paid_at;
-- ALTER TABLE appointments DROP COLUMN paid_at;
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

COMMENT ON COLUMN appointments.paid_at IS
  'Data e ora del pagamento. NULL se non pagato. '
  'Usata per report di incasso per periodo (es. "incassato a marzo").';

UPDATE appointments
SET paid_at = start_at
WHERE is_paid = true
  AND paid_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_studio_paid_at
  ON appointments (studio_id, paid_at)
  WHERE paid_at IS NOT NULL;

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_paid_consistency;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_paid_consistency
  CHECK (
    (is_paid = true  AND paid_at IS NOT NULL) OR
    (is_paid = false AND paid_at IS NULL)
  );

COMMIT;
