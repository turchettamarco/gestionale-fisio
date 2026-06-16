-- ════════════════════════════════════════════════════════════════════════
-- migrations/040_report_email.sql
-- ════════════════════════════════════════════════════════════════════════
-- Indirizzo email su cui ricevere i report automatici (mig. 040).
--
-- Se NULL o vuoto, i report vengono inviati all'email dell'owner dello
-- studio (account di login). Compilarlo permette di inviarli a un
-- indirizzo diverso (es. segreteria, commercialista).
--
-- NB: nessun BEGIN/COMMIT — il runner non supporta comandi transazionali.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS report_email TEXT;

COMMENT ON COLUMN studios.report_email IS
  'Email destinataria dei report automatici. Se NULL/vuota usa l''email '
  'dell''owner dello studio.';
