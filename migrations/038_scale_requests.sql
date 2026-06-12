-- ════════════════════════════════════════════════════════════════════════
-- migrations/038_scale_requests.sql
-- ════════════════════════════════════════════════════════════════════════
-- Scale di valutazione a distanza (mig. 038).
--
-- Le scale (VAS, NDI, Oswestry, DASH, LEFS, PSFS) diventano
-- somministrabili VIA LINK: il fisioterapista invia la richiesta su
-- WhatsApp, il paziente compila da casa con gli slider, il risultato
-- atterra in clinical_scales come una compilazione normale (source =
-- 'remote') e finisce nel grafico andamento.
--
--   - scale_requests: una riga per richiesta inviata. token 48 hex,
--     payload (es. attività PSFS definite dal fisio), stato.
--   - clinical_scales.source: 'studio' (default, retrocompatibile) o
--     'remote'.
--
-- SICUREZZA: RLS via my_studios(); accesso pubblico SOLO tramite API
-- route server-side con token (nessuna policy anon).
--
-- NB: nessun BEGIN/COMMIT — il runner non supporta comandi transazionali.
-- ════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS scale_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id     UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  scale_type    TEXT NOT NULL,
  payload       JSONB,                 -- es. { "activities": ["...", "...", "..."] } per PSFS
  access_token  TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  clinical_scale_id UUID REFERENCES clinical_scales(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scale_requests_patient
  ON scale_requests(patient_id, status);

CREATE INDEX IF NOT EXISTS idx_scale_requests_token
  ON scale_requests(access_token);

ALTER TABLE clinical_scales
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'studio'
    CHECK (source IN ('studio', 'remote'));

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE scale_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scale_requests_select ON scale_requests;
CREATE POLICY scale_requests_select ON scale_requests
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS scale_requests_insert ON scale_requests;
CREATE POLICY scale_requests_insert ON scale_requests
  FOR INSERT TO authenticated
  WITH CHECK (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS scale_requests_update ON scale_requests;
CREATE POLICY scale_requests_update ON scale_requests
  FOR UPDATE TO authenticated
  USING (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS scale_requests_delete ON scale_requests;
CREATE POLICY scale_requests_delete ON scale_requests
  FOR DELETE TO authenticated
  USING (studio_id IN (SELECT my_studios()));

-- ── Commenti ─────────────────────────────────────────────────────────────
COMMENT ON TABLE scale_requests IS
  'Richieste di compilazione scale inviate ai pazienti via link pubblico '
  '/scale/[token]. Al completamento il punteggio viene inserito in '
  'clinical_scales (source=remote) e la richiesta marcata completed.';

COMMENT ON COLUMN clinical_scales.source IS
  'Origine della compilazione: studio (dal fisioterapista) o remote (dal '
  'paziente via link).';
