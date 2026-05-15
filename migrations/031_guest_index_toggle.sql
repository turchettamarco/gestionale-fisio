-- ════════════════════════════════════════════════════════════════════════
-- migrations/031_guest_index_toggle.sql
-- ════════════════════════════════════════════════════════════════════════
-- Toggle per pagina indice ospiti (mig. 031).
--
-- Permette al titolare di scegliere se la voce "Agenda Ospiti" nel menu
-- utente apre direttamente la pagina indice /ospiti (utile con 3+ ospiti
-- attivi) oppure mantiene il comportamento smart (1 ospite=diretto,
-- 2+=submenu collassabile).
--
-- DEFAULT: FALSE → comportamento smart, non cambia nulla per chi ha 1 ospite.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS use_guest_index_page BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN studios.use_guest_index_page IS
  'Se TRUE, la voce "Agenda Ospiti" nel menu utente porta alla pagina '
  'indice /ospiti (utile con 3+ ospiti). Se FALSE (default), comportamento '
  'smart: 1 ospite=link diretto, 2+ ospiti=submenu collassabile.';
