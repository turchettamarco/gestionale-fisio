-- ═══════════════════════════════════════════════════════════════════════
-- Migration 024 · weekly_view_layout — aggiungi 'roster'
-- ═══════════════════════════════════════════════════════════════════════
-- Estende l'enum di weekly_view_layout per supportare il quinto layout
-- "Roster": griglia ora × giorno con SUB-RIGHE per operatore dentro ogni
-- cella. Ogni giorno ha 2 sub-colonne: nome operatore | nome paziente
-- (o "ASSEGNA" se libero). Le sigle delle stanze (room.color) saranno
-- usate come sfondo quando le stanze saranno configurate.
--
-- Valori:
--   'classic'  → sub-colonne operatore (4b)
--   'timeline' → riga per operatore × giorni (4b)
--   'pile'     → pile cronologiche (4b)
--   'grid'     → chip rotondi (4b)
--   'roster'   → griglia ora × giorno con sub-righe operatore (NUOVO)
-- ═══════════════════════════════════════════════════════════════════════

-- Devo dropare il vecchio CHECK e ricrearlo con 'roster'.
ALTER TABLE studios
  DROP CONSTRAINT IF EXISTS studios_weekly_view_layout_check;

ALTER TABLE studios
  ADD CONSTRAINT studios_weekly_view_layout_check
  CHECK (weekly_view_layout IN ('classic', 'timeline', 'pile', 'grid', 'roster'));

COMMENT ON COLUMN studios.weekly_view_layout IS
  'Layout della vista settimana in modalità multi-operatore. Valori: classic|timeline|pile|grid|roster. Default classic. Senza effetto se multi_operator_enabled=false o <2 membri attivi.';
