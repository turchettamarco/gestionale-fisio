-- ════════════════════════════════════════════════════════════════════════
-- migrations/030_guest_pdf_fields.sql
-- ════════════════════════════════════════════════════════════════════════
-- Campi configurabili per il PDF dell'agenda ospite (mig. 030).
--
-- Permette al titolare di scegliere quali colonne mostrare nel PDF
-- stampato per ciascun ospite (es. l'ortopedico vuole vedere telefono
-- + diagnosi, il nutrizionista magari solo nome + note).
-- Data/ora/paziente sono sempre presenti.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE guest_practitioners
  ADD COLUMN IF NOT EXISTS pdf_print_fields JSONB
  NOT NULL
  DEFAULT '{"telefono": true, "durata": true, "diagnosi": true, "note": true}'::jsonb;

COMMENT ON COLUMN guest_practitioners.pdf_print_fields IS
  'Configurazione campi visibili nel PDF stampato dell''agenda di questo '
  'ospite. Default: tutti i campi attivi. Schema: { telefono, durata, '
  'diagnosi, note } — tutti boolean.';
