-- 061: granularità degli slot dell'agenda (30 o 15 minuti), per studio.
-- Governa la griglia orari proposta, lo snap del drag e le zone di click
-- nelle viste. Default 30 = comportamento attuale.
ALTER TABLE studios ADD COLUMN IF NOT EXISTS slot_minutes integer NOT NULL DEFAULT 30;
