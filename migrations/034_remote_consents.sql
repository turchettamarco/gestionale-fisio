-- ════════════════════════════════════════════════════════════════════════
-- migrations/034_remote_consents.sql
-- ════════════════════════════════════════════════════════════════════════
-- Consensi a distanza via link (mig. 034).
--
-- COMPLEMENTA (non sostituisce) il flusso consensi in-studio già esistente
-- (modal desktop con doppia firma canvas, salvataggio HTML in patient_docs).
--
-- FLUSSO REMOTO:
--   1. Dalla scheda paziente (tab Referti): "Invia consensi a distanza"
--      → crea righe in patient_consents con snapshot del testo
--      (interpolato con branding studio + dati paziente al momento
--      dell'invio: il testo firmato resta immutabile — requisito legale)
--   2. Link pubblico /consensi/[token] inviato via WhatsApp
--   3. Il paziente legge, spunta la presa visione, digita nome e cognome,
--      firma sul canvas touch → status='signed' + IP + user-agent + timestamp
--   4. Badge "Firmato" nella scheda paziente, documento apribile/stampabile
--
-- SICUREZZA:
--   - RLS via my_studios() (pattern mig. 021, no ricorsione)
--   - Accesso pubblico SOLO via API route server-side (service role)
--     con token: NESSUNA policy anon su questa tabella
--   - Token 48 hex chars (24 byte random, pgcrypto)
-- ════════════════════════════════════════════════════════════════════════


CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS patient_consents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id         UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  patient_id        UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consent_type      TEXT NOT NULL CHECK (consent_type IN (
                      'gdpr_informativa_privacy', 'consenso_trattamento')),
  title             TEXT NOT NULL,     -- snapshot al momento dell'invio
  body_text         TEXT NOT NULL,     -- snapshot immutabile (paragrafi separati da \n\n)
  access_token      TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                      'pending', 'signed', 'revoked')),
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signed_at         TIMESTAMPTZ,
  signed_name       TEXT,              -- nome e cognome digitati dal paziente
  signature_data    TEXT,              -- PNG base64 della firma su canvas
  signer_ip         TEXT,
  signer_user_agent TEXT,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_consents_patient
  ON patient_consents(patient_id, status);

CREATE INDEX IF NOT EXISTS idx_patient_consents_studio
  ON patient_consents(studio_id);

CREATE INDEX IF NOT EXISTS idx_patient_consents_token
  ON patient_consents(access_token);

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE patient_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_consents_select ON patient_consents;
CREATE POLICY patient_consents_select ON patient_consents
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS patient_consents_insert ON patient_consents;
CREATE POLICY patient_consents_insert ON patient_consents
  FOR INSERT TO authenticated
  WITH CHECK (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS patient_consents_update ON patient_consents;
CREATE POLICY patient_consents_update ON patient_consents
  FOR UPDATE TO authenticated
  USING (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS patient_consents_delete ON patient_consents;
CREATE POLICY patient_consents_delete ON patient_consents
  FOR DELETE TO authenticated
  USING (studio_id IN (SELECT my_studios()));

-- ── Commenti ─────────────────────────────────────────────────────────────
COMMENT ON TABLE patient_consents IS
  'Consensi inviati a distanza ai pazienti (link pubblico). body_text è uno '
  'snapshot immutabile del testo al momento dell''invio. Firma remota: '
  'signed_name + signature_data (canvas PNG) + IP + user-agent come evidenza.';

COMMENT ON COLUMN patient_consents.access_token IS
  'Token 48 hex per il link pubblico /consensi/[token]. La firma è '
  'accettata solo se status=pending.';

