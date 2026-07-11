-- 059: ordine manuale degli accessi nel giorno (riordino a scaletta drag&drop)
ALTER TABLE coop_accesses
  ADD COLUMN IF NOT EXISTS ordine integer;
