-- ════════════════════════════════════════════════════════════════════════
-- migrations/035_consent_bundle.sql
-- ════════════════════════════════════════════════════════════════════════
-- Firma unica per consensi inviati insieme (mig. 035).
--
-- Quando privacy + consenso trattamento vengono inviati nello stesso
-- momento, condividono lo stesso bundle_token: il paziente riceve UN solo
-- link, legge entrambi i documenti, spunta una casella per ciascuno
-- (granularità GDPR) e firma UNA volta. La firma viene registrata su
-- tutti i record accettati.
--
-- Il link può essere indifferentemente /consensi/{access_token} o
-- /consensi/{bundle_token}: l'API risolve entrambi e mostra tutti i
-- documenti del bundle.
--
-- NB: nessun BEGIN/COMMIT — il runner non supporta comandi transazionali.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE patient_consents
  ADD COLUMN IF NOT EXISTS bundle_token TEXT;

CREATE INDEX IF NOT EXISTS idx_patient_consents_bundle
  ON patient_consents(bundle_token)
  WHERE bundle_token IS NOT NULL;

COMMENT ON COLUMN patient_consents.bundle_token IS
  'Token condiviso (48 hex) tra consensi inviati insieme. Permette al '
  'paziente di firmare più documenti con una sola firma da un unico link. '
  'NULL per consensi inviati singolarmente.';
