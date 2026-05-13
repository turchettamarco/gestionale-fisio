-- ════════════════════════════════════════════════════════════════════════
-- migrations/028_patient_v2_tour.sql
-- ════════════════════════════════════════════════════════════════════════
-- Tappa 9 — Aggiunge timestamp per il tour onboarding della scheda paziente
-- refattorizzata (Tappe 1-8).
--
-- Una sola colonna: patient_v2_tour_completed_at su studio_members.
-- Quando NULL, il tour si attiva al primo accesso a /patients/[id].
-- Quando popolato, il tour non si mostra più (a meno che l'utente lo
-- riavvii dal bottone help).
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE studio_members
ADD COLUMN IF NOT EXISTS patient_v2_tour_completed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN studio_members.patient_v2_tour_completed_at IS
  'Timestamp di completamento o skip del tour onboarding della scheda paziente refattorizzata (Tappe 1-8). NULL = tour da mostrare.';
