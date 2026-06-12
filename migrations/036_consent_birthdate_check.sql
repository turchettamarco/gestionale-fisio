-- ════════════════════════════════════════════════════════════════════════
-- migrations/036_consent_birthdate_check.sql
-- ════════════════════════════════════════════════════════════════════════
-- Verifica identità con data di nascita (mig. 036).
--
-- Prima di mostrare i documenti, la pagina pubblica chiede al paziente la
-- propria data di nascita e la confronta server-side con
-- patients.birth_date. Aggiunge un FATTORE DI CONOSCENZA al fascicolo
-- probatorio: possesso del telefono (token via WhatsApp) + conoscenza di
-- un dato personale + firma grafica + IP/UA/timestamp.
--
-- Se il paziente non ha birth_date in anagrafica la verifica viene
-- saltata (flusso invariato).
--
-- ANTI BRUTE-FORCE: verify_attempts conta i tentativi falliti per riga;
-- oltre la soglia (10, in codice) il link si blocca e serve rigenerarlo.
-- Azzerato al primo tentativo corretto. verified_at registra quando la
-- verifica è andata a buon fine (ulteriore evidenza).
--
-- NB: nessun BEGIN/COMMIT — il runner non supporta comandi transazionali.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE patient_consents
  ADD COLUMN IF NOT EXISTS verify_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

COMMENT ON COLUMN patient_consents.verify_attempts IS
  'Tentativi falliti di verifica data di nascita. Oltre la soglia (10) il '
  'link si blocca: rigenerare il consenso dalla scheda paziente.';

COMMENT ON COLUMN patient_consents.verified_at IS
  'Timestamp della verifica identità (data di nascita) andata a buon fine. '
  'Parte del fascicolo probatorio della firma.';
