-- 062: Lista d'attesa potenziata.
-- Nuovi campi per il match vero buco↔paziente e per la gestione operativa:
--   duration_min      durata della seduta che il paziente aspetta (il match
--                     ora verifica che CI STIA nel buco liberato)
--   priority          urgente | normale | bassa → ordina candidati e lista
--   expires_on        "serve entro il": dopo questa data la voce è evidenziata
--                     come scaduta (nessuna cancellazione automatica)
--   treatment_type    trattamento atteso (precompila la prenotazione)
--   offered_count     quante proposte ha già ricevuto (anti-tempesta WhatsApp)
--   last_offered_slot ultimo slot proposto (per non riproporre lo stesso)
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS duration_min      INT  NOT NULL DEFAULT 60;
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS priority          TEXT NOT NULL DEFAULT 'normale';
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS expires_on        DATE;
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS treatment_type    TEXT;
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS offered_count     INT  NOT NULL DEFAULT 0;
ALTER TABLE waitlist_entries ADD COLUMN IF NOT EXISTS last_offered_slot TIMESTAMPTZ;
