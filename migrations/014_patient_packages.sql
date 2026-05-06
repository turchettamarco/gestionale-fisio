-- ═══════════════════════════════════════════════════════════════════════
-- Migration 014: Pacchetti sedute + pagamenti dilazionati
-- ═══════════════════════════════════════════════════════════════════════
--
-- OBIETTIVO:
-- Gestire pacchetti sedute (es. "10 sedute a €350") con possibilità di
-- pagamento in più rate (acconto + saldo, o N versamenti).
--
-- MODELLO:
-- 1. patient_packages: il "contratto" (paziente, n. sedute, totale, stato)
-- 2. package_payments: i singoli versamenti (acconto, saldi, rate)
-- 3. appointments.package_id: link opzionale → la seduta scala dal pacchetto
--
-- LOGICA INCASSI (configurabile in practice_settings):
-- - 'on_payment' (default forfettario): incasso = data del versamento
-- - 'on_session': incasso = quota proporzionale alla data di ogni seduta
--
-- IMPORTANTE:
-- - Un appuntamento con package_id NON genera incasso proprio
--   (l'incasso vive sui package_payments)
-- - is_paid sull'appuntamento riflette "questa seduta è coperta dal
--   pacchetto" → quindi true se package_id IS NOT NULL
--
-- ROLLBACK:
-- ALTER TABLE appointments DROP COLUMN IF EXISTS package_id;
-- DROP TABLE IF EXISTS package_payments;
-- DROP TABLE IF EXISTS patient_packages;
-- ALTER TABLE practice_settings DROP COLUMN IF EXISTS package_revenue_recognition;
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Setting di studio: come riconoscere l'incasso ──────────────────
ALTER TABLE practice_settings
  ADD COLUMN IF NOT EXISTS package_revenue_recognition TEXT
    NOT NULL DEFAULT 'on_payment'
    CHECK (package_revenue_recognition IN ('on_payment', 'on_session'));

COMMENT ON COLUMN practice_settings.package_revenue_recognition IS
  'Come riportare l''incasso dei pacchetti nei report: '
  '"on_payment" = data del versamento (forfettario classico, cassa). '
  '"on_session" = quota proporzionale alla data di ogni seduta consumata (competenza).';

-- ─── 2. Tabella pacchetti ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_packages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,

  title           TEXT NOT NULL,
  notes           TEXT,

  total_sessions  INT,
  CHECK (total_sessions IS NULL OR total_sessions > 0),

  total_amount_cents     INT NOT NULL CHECK (total_amount_cents >= 0),

  default_payment_method TEXT
    CHECK (default_payment_method IN ('cash', 'pos', 'bank_transfer')),

  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'expired', 'refunded', 'cancelled')),

  starts_at       DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at      DATE,

  payer_type      TEXT NOT NULL DEFAULT 'private'
    CHECK (payer_type IN ('private')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE patient_packages IS
  'Pacchetti di sedute acquistati dal paziente. Supporta pagamento in rate '
  '(vedi package_payments) e numero sedute fisso o aperto (acconto libero).';

CREATE INDEX IF NOT EXISTS idx_packages_studio_status
  ON patient_packages (studio_id, status);

CREATE INDEX IF NOT EXISTS idx_packages_patient
  ON patient_packages (patient_id, status);

-- ─── 3. Tabella versamenti (rate / acconti / saldi) ────────────────────
CREATE TABLE IF NOT EXISTS package_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id      UUID NOT NULL REFERENCES patient_packages(id) ON DELETE CASCADE,
  studio_id       UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  amount_cents    INT NOT NULL CHECK (amount_cents > 0),
  payment_method  TEXT NOT NULL
    CHECK (payment_method IN ('cash', 'pos', 'bank_transfer')),

  paid_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  label           TEXT,
  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE package_payments IS
  'Singoli versamenti per un pacchetto. Un pacchetto può avere N pagamenti '
  '(acconto + saldo, rate mensili, ecc.).';

CREATE INDEX IF NOT EXISTS idx_package_payments_package
  ON package_payments (package_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_package_payments_studio_paid_at
  ON package_payments (studio_id, paid_at);

-- ─── 4. Link appuntamento → pacchetto ──────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS package_id UUID
    REFERENCES patient_packages(id) ON DELETE SET NULL;

COMMENT ON COLUMN appointments.package_id IS
  'Se valorizzato, l''appuntamento consuma una seduta dal pacchetto. '
  'L''incasso NON è sull''appuntamento ma sui package_payments del pacchetto.';

CREATE INDEX IF NOT EXISTS idx_appointments_package
  ON appointments (package_id)
  WHERE package_id IS NOT NULL;

-- ─── 5. Trigger: aggiorna updated_at su patient_packages ───────────────
CREATE OR REPLACE FUNCTION trg_packages_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS packages_updated_at ON patient_packages;
CREATE TRIGGER packages_updated_at
  BEFORE UPDATE ON patient_packages
  FOR EACH ROW EXECUTE FUNCTION trg_packages_updated_at();

-- ─── 6. RLS: stesso pattern delle altre tabelle (multi-tenant) ─────────
ALTER TABLE patient_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS packages_select ON patient_packages;
CREATE POLICY packages_select ON patient_packages
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS packages_insert ON patient_packages;
CREATE POLICY packages_insert ON patient_packages
  FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS packages_update ON patient_packages;
CREATE POLICY packages_update ON patient_packages
  FOR UPDATE USING (owner_id = auth.uid())
                WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS packages_delete ON patient_packages;
CREATE POLICY packages_delete ON patient_packages
  FOR DELETE USING (owner_id = auth.uid());

DROP POLICY IF EXISTS package_payments_select ON package_payments;
CREATE POLICY package_payments_select ON package_payments
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS package_payments_insert ON package_payments;
CREATE POLICY package_payments_insert ON package_payments
  FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS package_payments_update ON package_payments;
CREATE POLICY package_payments_update ON package_payments
  FOR UPDATE USING (owner_id = auth.uid())
                WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS package_payments_delete ON package_payments;
CREATE POLICY package_payments_delete ON package_payments
  FOR DELETE USING (owner_id = auth.uid());

COMMIT;
