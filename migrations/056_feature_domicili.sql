-- 056: feature flag Domicili Cooperative per studio
-- Default: DISATTIVATO per tutti i clienti. Attivabile per singolo studio
-- dal pannello fisiohub-admin (dettaglio cliente).
ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS feature_domicili boolean NOT NULL DEFAULT false;

-- Attivo di partenza SOLO per lo studio del titolare
UPDATE studios
SET feature_domicili = true
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
