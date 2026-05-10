-- ═══════════════════════════════════════════════════════════════════════
-- Migration 023 · default_calendar_view su studios (Fase D)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Aggiunge la colonna `default_calendar_view` su `studios`. Quando l'utente
-- apre /calendar, la vista iniziale viene letta da qui invece del default
-- hardcoded "week".
--
-- Valori ammessi: 'day' | 'week' | 'month'
-- Default: 'week' (comportamento storico)
--
-- Una volta caricato il calendario, l'utente può comunque cambiare vista
-- normalmente (la scelta NON viene persistita per cambio: vale come default
-- iniziale all'apertura della pagina).
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS default_calendar_view TEXT NOT NULL DEFAULT 'week'
  CHECK (default_calendar_view IN ('day', 'week', 'month'));

COMMENT ON COLUMN studios.default_calendar_view IS
  'Vista calendario predefinita all''apertura di /calendar. Valori: day|week|month. Default week. Studio-wide: vale per tutti i membri.';
