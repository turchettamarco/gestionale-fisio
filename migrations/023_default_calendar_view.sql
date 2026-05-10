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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'studios'
      AND column_name = 'default_calendar_view'
  ) THEN
    ALTER TABLE studios
      ADD COLUMN default_calendar_view TEXT NOT NULL DEFAULT 'week'
      CHECK (default_calendar_view IN ('day', 'week', 'month'));

    COMMENT ON COLUMN studios.default_calendar_view IS
      'Vista calendario predefinita all''apertura di /calendar. '
      'Valori: day, week, month. Default week.';
  END IF;
END $$;

-- ─── Registrazione migration ────────────────────────────────────────────
INSERT INTO schema_migrations (version, applied_at)
VALUES ('023_default_calendar_view', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = EXCLUDED.applied_at;
