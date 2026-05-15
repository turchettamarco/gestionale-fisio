-- ════════════════════════════════════════════════════════════════════════
-- migrations/033_guest_contact_fields.sql
-- ════════════════════════════════════════════════════════════════════════
-- Aggiunge campi di contatto al professionista ospite (mig. 033).
--
-- COLONNE:
--   - phone: numero di telefono (formato libero). Usato per:
--     * Bottone "Invia link su WhatsApp" dalla pagina /ospiti/[id]
--     * Click-to-call (futuro)
--   - email: email del professionista (opzionale).
--
-- Entrambi nullable: la feature è incrementale, gli ospiti già registrati
-- non hanno questi dati e devono poterli aggiungere quando serve.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE guest_practitioners
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN guest_practitioners.phone IS
  'Numero di telefono del professionista ospite (formato libero, idealmente E.164 con prefisso es. +39...). Usato per WhatsApp diretto.';

COMMENT ON COLUMN guest_practitioners.email IS
  'Email del professionista ospite. Opzionale.';
