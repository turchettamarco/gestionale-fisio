-- migrations/013_booking_ui_toggles.sql
-- ═══════════════════════════════════════════════════════════════════════
-- Toggle visibilità della feature "Prenotazioni dal sito" (booking_requests)
-- ═══════════════════════════════════════════════════════════════════════
-- La feature di booking pubblico (turchettamarco.com → booking_requests)
-- continua a funzionare sul backend (le richieste arrivano nel DB), ma la
-- UI nel gestionale è di default nascosta perché poco usata.
--
-- Lo studio può riattivare manualmente la card in home + la campanella
-- nel calendario dalle impostazioni.
--
-- Default = false (UI nascosta).
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS show_booking_card_home BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_booking_bell_calendar BOOLEAN NOT NULL DEFAULT false;
