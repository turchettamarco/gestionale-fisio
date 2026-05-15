-- ════════════════════════════════════════════════════════════════════════
-- migrations/032_guest_access_token.sql
-- ════════════════════════════════════════════════════════════════════════
-- Token di accesso portale ospite pubblico (mig. 032).
--
-- Permette al titolare di generare un link pubblico
-- (https://app.fisiohub.it/agenda/<token>) da inviare al professionista
-- ospite, dove può vedere la sua agenda SENZA fare login.
--
-- COLONNE:
--   - access_token: UUID univoco (nullable). Quando NULL, il portale non
--     è attivo. Quando valorizzato, il link è valido.
--   - token_created_at: TIMESTAMPTZ quando è stato generato il token.
--   - last_access_at: TIMESTAMPTZ ultimo accesso pubblico (aggiornato dal
--     server quando l'ospite apre il link). Per stats al titolare.
--
-- SICUREZZA: il token è un UUID v4 (~10^38 combinazioni → impossibile
-- brute-force). Quando il titolare "revoca", basta settare a NULL: il
-- vecchio link smette istantaneamente di funzionare.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE guest_practitioners
  ADD COLUMN IF NOT EXISTS access_token UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS token_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_access_at TIMESTAMPTZ;

COMMENT ON COLUMN guest_practitioners.access_token IS
  'UUID univoco per accesso pubblico al portale ospite. Quando NULL, '
  'il portale non è abilitato per questo ospite. Quando valorizzato, '
  'il link https://<app>/agenda/<token> permette la visualizzazione '
  'sola lettura della propria agenda senza login.';

COMMENT ON COLUMN guest_practitioners.token_created_at IS
  'Quando è stato generato il token corrente. Utile per indicare al '
  'titolare da quanto tempo è attivo il link.';

COMMENT ON COLUMN guest_practitioners.last_access_at IS
  'Ultimo accesso del professionista ospite al portale pubblico. '
  'Aggiornato automaticamente dal server quando l''ospite apre il link.';

-- Indice parziale per lookup veloce per token (uniqueness implica già un
-- indice, ma ne creiamo uno parziale dedicato solo ai token non-NULL).
CREATE INDEX IF NOT EXISTS idx_guest_practitioners_access_token
  ON guest_practitioners(access_token)
  WHERE access_token IS NOT NULL;
