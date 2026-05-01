-- ═══════════════════════════════════════════════════════════════════════
-- Migration 011: Auto-popolamento payment_method per appuntamenti cash
-- ═══════════════════════════════════════════════════════════════════════
--
-- OBIETTIVO:
-- Quando un appuntamento viene segnato come pagato (is_paid = true) ma
-- payment_method è NULL e il price_type non è "invoiced" (quindi è cash
-- o null), forziamo automaticamente payment_method = "cash".
--
-- DESIGN DECISION:
-- - Logica lato DB invece che lato client (12 entry point del codice).
-- - Modello mentale: "non fatturato = sempre contante" — invariante.
-- - A prova di bug futuri: ogni nuovo entry point eredita la logica.
--
-- BACKFILL:
-- Aggiorniamo i 209 appuntamenti già pagati con payment_method NULL.
-- I 76 fatturati senza metodo storico vengono settati a 'cash' come
-- default ragionevole, l'utente può correggerli dalla pillola UI.
--
-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_auto_payment_method_cash ON appointments;
-- DROP FUNCTION IF EXISTS auto_payment_method_cash();
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Funzione del trigger ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_payment_method_cash()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_paid = true
     AND NEW.payment_method IS NULL
     AND (NEW.price_type IS NULL OR NEW.price_type != 'invoiced')
  THEN
    NEW.payment_method := 'cash';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_payment_method_cash() IS
  'Trigger BEFORE INSERT/UPDATE su appointments. '
  'Auto-popola payment_method=''cash'' quando is_paid=true e price_type non è ''invoiced'' '
  'e payment_method è ancora NULL. '
  'Mantiene l''invariante "non fatturato = sempre contante" (mig. 011).';


-- ─── 2. Trigger BEFORE INSERT/UPDATE su appointments ────────────────────
DROP TRIGGER IF EXISTS trg_auto_payment_method_cash ON appointments;

CREATE TRIGGER trg_auto_payment_method_cash
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION auto_payment_method_cash();


-- ─── 3. Backfill: cash + paid_cash + null ───────────────────────────────
UPDATE appointments
SET payment_method = 'cash'
WHERE is_paid = true
  AND payment_method IS NULL
  AND (price_type IS NULL OR price_type != 'invoiced');


-- ─── 4. Backfill: invoiced storici senza metodo ─────────────────────────
-- Sono fatture vecchie pre-introduzione UI metodo. Default ragionevole.
UPDATE appointments
SET payment_method = 'cash'
WHERE is_paid = true
  AND payment_method IS NULL
  AND price_type = 'invoiced';


-- ─── 5. Commento sulla colonna ──────────────────────────────────────────
COMMENT ON COLUMN appointments.payment_method IS
  'Metodo di pagamento: ''cash'' | ''pos'' | ''bank_transfer''. '
  'Per appuntamenti non fatturati (price_type != ''invoiced'') è sempre ''cash''. '
  'Per appuntamenti fatturati può essere uno qualsiasi dei tre. '
  'Auto-popolato dal trigger trg_auto_payment_method_cash quando is_paid=true (mig. 011).';


COMMIT;
