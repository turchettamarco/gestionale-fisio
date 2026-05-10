-- ═══════════════════════════════════════════════════════════════════════
-- Migration 022 · weekly_view_layout
-- ═══════════════════════════════════════════════════════════════════════
-- Aggiunge il campo studios.weekly_view_layout per permettere all'owner di
-- scegliere il layout della vista settimana quando lo studio è in modalità
-- multi-operatore. La scelta è a livello studio (tutto il team vede lo
-- stesso layout) — eventuale override per-utente sarà aggiunto in futuro.
--
-- Valori possibili:
--   'classic'  → vista settimana con sub-colonne MGA (attuale Fase 4b)
--   'timeline' → riga per operatore × settimana orizzontale (Approccio A)
--   'pile'     → giorni come pile cronologiche (Approccio C)
--   'grid'     → chip orizzontali nella griglia ora × giorno (Approccio D)
--
-- Quando lo studio è in single-operator (multi_operator_enabled = false oppure
-- <2 operatori attivi), il layout NON ha effetto: il calendario rende sempre
-- la WeekView classica.
-- ═══════════════════════════════════════════════════════════════════════

-- Aggiungi il campo. Default 'classic' = comportamento attuale, niente
-- regressione per chi ha già attivato multi-op.
ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS weekly_view_layout TEXT NOT NULL DEFAULT 'classic'
  CHECK (weekly_view_layout IN ('classic', 'timeline', 'pile', 'grid'));

-- Commento per documentazione DB
COMMENT ON COLUMN studios.weekly_view_layout IS
  'Layout della vista settimana in modalità multi-operatore. Valori: classic|timeline|pile|grid. Default classic (sub-colonne MGA). Senza effetto se multi_operator_enabled=false o <2 membri attivi.';
