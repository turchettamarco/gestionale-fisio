-- ═══════════════════════════════════════════════════════════════════════
-- Migration 018: Schema migrations tracking
-- ═══════════════════════════════════════════════════════════════════════
--
-- OBIETTIVO:
-- Tenere un registro di quali migration sono state applicate al DB,
-- quando, e con che hash. Permette ai comandi `npm run db:status` e
-- `npm run db:migrate` di sapere cosa è già live e cosa è pending.
--
-- HASH:
-- Salviamo SHA-256 del contenuto SQL al momento dell'applicazione.
-- Se in futuro qualcuno modifica il file di una migration già applicata,
-- `db:status` lo segnala come WARNING (l'hash non corrisponde).
--
-- ROLLBACK:
-- DROP TABLE IF EXISTS schema_migrations;
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  -- Nome del file senza estensione, es. "017_error_logs"
  name              TEXT PRIMARY KEY,

  -- SHA-256 del contenuto SQL al momento dell'applicazione
  content_hash      TEXT NOT NULL,

  -- Quando è stata applicata
  applied_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Quanto è durata l'esecuzione (ms)
  duration_ms       INT,

  -- Chi l'ha applicata (email/identificatore, opzionale)
  applied_by        TEXT
);

COMMENT ON TABLE schema_migrations IS
  'Registro delle migration applicate al DB. Popolato da scripts/db-migrate.ts.';

-- Niente RLS: questa tabella è di servizio, accessibile solo via service_role
-- (che bypassa RLS comunque). Non vogliamo che i client possano vederla né
-- modificarla. Le migration sono operazioni admin.
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;

-- Nessuna policy = nessuno tranne service_role può accedere
-- (RLS-blocked-by-default per gli utenti normali, che è quello che vogliamo)

-- ─── Bootstrap: registra le migration già applicate prima di questo sistema ──
-- Le migration dalla 010 alla 017 erano già applicate manualmente.
-- Le inseriamo qui con hash NULL (placeholder) così `db:status` non le segnala
-- come pending. Se in futuro vuoi verificare gli hash, ri-applichi solo le
-- nuove (questa è la 018, già "auto-registrata" alla fine).
INSERT INTO schema_migrations (name, content_hash, applied_at)
VALUES
  ('010_payment_tracking',     'bootstrap', NOW()),
  ('011_auto_payment_method',  'bootstrap', NOW()),
  ('012_notifications',        'bootstrap', NOW()),
  ('013_booking_ui_toggles',   'bootstrap', NOW()),
  ('014_patient_packages',     'bootstrap', NOW()),
  ('015_payments',             'bootstrap', NOW()),
  ('016_studio_locations',     'bootstrap', NOW()),
  ('017_error_logs',           'bootstrap', NOW())
ON CONFLICT (name) DO NOTHING;

-- Auto-registra anche questa migration 018
INSERT INTO schema_migrations (name, content_hash, applied_at)
VALUES ('018_schema_migrations', 'bootstrap', NOW())
ON CONFLICT (name) DO NOTHING;

COMMIT;
