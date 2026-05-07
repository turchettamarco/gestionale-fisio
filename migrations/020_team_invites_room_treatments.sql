-- ═══════════════════════════════════════════════════════════════════════
-- Migration 020: Inviti team via email + treatment_types su stanze
-- ═══════════════════════════════════════════════════════════════════════
--
-- OBIETTIVO:
-- Estendere la 019 per permettere inviti email a colleghi che ancora non
-- hanno un account, e associare ogni stanza ai trattamenti consentiti.
--
-- FLUSSO INVITI:
-- 1. Owner clicca "Invita collega" → INSERT studio_members con:
--    - user_id = NULL (placeholder)
--    - email = collega@esempio.it
--    - invite_token = random UUID
--    - invited_at = NOW()
-- 2. Owner copia/condivide il link: https://app.../signup?invite=<token>
-- 3. Collega apre il link, fa signup. Subito dopo il signup il client
--    chiama claim_invite(token) che:
--    - aggiorna studio_members SET user_id = auth.uid(), invite_token = NULL
--    - NON tocca display_name, color, signature, role (impostati dall'owner)
-- 4. Il collega ora vede il calendario dello studio.
--
-- ALTERNATIVA SENZA LINK:
-- L'owner può invitare un collega che è GIÀ registrato (es. ha un suo account
-- per un altro studio). In quel caso passa email + user_id direttamente,
-- e la riga si crea già con user_id valorizzato. Niente claim necessario.
--
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS claim_invite(UUID);
-- ALTER TABLE studio_rooms DROP COLUMN IF EXISTS treatment_types;
-- ALTER TABLE studio_members DROP COLUMN IF EXISTS invite_token;
-- ALTER TABLE studio_members ALTER COLUMN user_id SET NOT NULL;
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Permetti user_id NULL su studio_members ────────────────────────
-- Quando l'owner invita via email, creiamo la riga con user_id = NULL.
-- Verrà popolato al primo login del collega tramite claim_invite().
ALTER TABLE studio_members
  ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN studio_members.user_id IS
  'auth.users.id del membro. NULL se è un invito pendente (mig. 020): '
  'la riga è stata creata dall''owner ma il collega non ha ancora fatto '
  'signup. Verrà popolato dalla funzione claim_invite al primo login.';

-- ─── 2. Token di invito ────────────────────────────────────────────────
ALTER TABLE studio_members
  ADD COLUMN IF NOT EXISTS invite_token UUID;

COMMENT ON COLUMN studio_members.invite_token IS
  'Token random generato dall''owner per il link di invito. NULL per i '
  'membri creati senza link (es. signup diretto, o agganciati per email match). '
  'Si invalida (NULL) dopo che il collega ha fatto claim.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_members_invite_token
  ON studio_members(invite_token)
  WHERE invite_token IS NOT NULL;

-- Vincolo: se user_id è NULL deve esserci email + invite_token
-- (un invito pendente ha senso solo se c'è il modo di agganciarlo)
ALTER TABLE studio_members
  DROP CONSTRAINT IF EXISTS studio_members_pending_invite_check;
ALTER TABLE studio_members
  ADD CONSTRAINT studio_members_pending_invite_check CHECK (
    user_id IS NOT NULL
    OR (email IS NOT NULL AND invite_token IS NOT NULL)
  );

-- ─── 3. Funzione claim_invite ──────────────────────────────────────────
-- Il client la chiama subito dopo il signup, passandogli il token preso dal
-- query param ?invite=. La funzione:
-- - verifica che il token sia valido (riga esistente con user_id IS NULL)
-- - aggiorna user_id = auth.uid(), invite_token = NULL
-- - restituisce lo studio_id agganciato (o NULL se token invalido)
--
-- SECURITY DEFINER serve perché un utente appena registrato non ha ancora
-- diritto a SELECT/UPDATE su studio_members (RLS non lo include in nessuno
-- studio_member ancora). La funzione gira con privilegi elevati ma fa solo
-- l'operazione minima richiesta, in modo sicuro.
CREATE OR REPLACE FUNCTION claim_invite(p_token UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_studio_id UUID;
  v_current_user UUID;
BEGIN
  v_current_user := auth.uid();
  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Aggancia il placeholder a questo utente. La condizione user_id IS NULL
  -- impedisce di "rubare" un invito già reclamato.
  UPDATE studio_members
  SET
    user_id = v_current_user,
    invite_token = NULL,
    invited_at = COALESCE(invited_at, NOW())
  WHERE invite_token = p_token
    AND user_id IS NULL
  RETURNING studio_id INTO v_studio_id;

  RETURN v_studio_id; -- NULL se il token non era valido
END;
$$;

REVOKE ALL ON FUNCTION claim_invite(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_invite(UUID) TO authenticated;

COMMENT ON FUNCTION claim_invite IS
  'Aggancia il placeholder studio_members corrispondente al token al utente '
  'corrente (auth.uid). Restituisce lo studio_id agganciato, o NULL se il '
  'token non e'' valido o e'' gia'' stato reclamato.';

-- ─── 4. RLS aggiornata per gli inviti pendenti ─────────────────────────
-- Per la UI dell'owner: deve vedere i propri inviti pendenti (user_id NULL).
-- Le policy esistenti sulla 008 usano user_id = auth.uid() per i membri ma
-- per LIST tutti i membri dello studio bisogna scopare per studio_id.
-- Aggiungo una policy esplicita "vedi tutti i membri del tuo studio".
DROP POLICY IF EXISTS studio_members_select_team ON studio_members;
CREATE POLICY studio_members_select_team ON studio_members
  FOR SELECT TO authenticated
  USING (
    studio_id IN (
      SELECT sm.studio_id FROM studio_members sm
      WHERE sm.user_id = auth.uid()
    )
  );

-- INSERT membri: solo owner del proprio studio (anche per invitare placeholder)
DROP POLICY IF EXISTS studio_members_insert_owner ON studio_members;
CREATE POLICY studio_members_insert_owner ON studio_members
  FOR INSERT TO authenticated
  WITH CHECK (
    studio_id IN (
      SELECT sm.studio_id FROM studio_members sm
      WHERE sm.user_id = auth.uid() AND sm.role = 'owner'
    )
  );

-- UPDATE membri: solo owner del proprio studio (per cambiare colore/ruolo/etc.)
-- Eccezione: ognuno può modificare la propria riga (signature, color, etc.)
DROP POLICY IF EXISTS studio_members_update_owner_or_self ON studio_members;
CREATE POLICY studio_members_update_owner_or_self ON studio_members
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR studio_id IN (
      SELECT sm.studio_id FROM studio_members sm
      WHERE sm.user_id = auth.uid() AND sm.role = 'owner'
    )
  );

-- DELETE membri: solo owner; non può cancellare se stesso (lo studio resterebbe orfano)
DROP POLICY IF EXISTS studio_members_delete_owner ON studio_members;
CREATE POLICY studio_members_delete_owner ON studio_members
  FOR DELETE TO authenticated
  USING (
    user_id IS DISTINCT FROM auth.uid()
    AND studio_id IN (
      SELECT sm.studio_id FROM studio_members sm
      WHERE sm.user_id = auth.uid() AND sm.role = 'owner'
    )
  );

-- ─── 5. treatment_types su studio_rooms ────────────────────────────────
-- NULL = la stanza è "universale" (può ospitare qualsiasi trattamento)
-- Array vuoto = la stanza è "spazio fisico" generico, comportamento = NULL
-- Array popolato es. ['tecar','onde_urto'] = solo questi trattamenti permessi
ALTER TABLE studio_rooms
  ADD COLUMN IF NOT EXISTS treatment_types TEXT[];

COMMENT ON COLUMN studio_rooms.treatment_types IS
  'Lista dei treatment_type.key consentiti in questa stanza. NULL o '
  'array vuoto = nessuna restrizione (universale). Es. ["tecar","onde_urto"] '
  'per la sala con la TECAR. Usato dal modal di creazione appuntamento per '
  'filtrare le stanze proponibili in base al trattamento scelto.';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- POST-MIGRATION CHECK:
-- ═══════════════════════════════════════════════════════════════════════
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_name = 'studio_members' AND column_name IN ('user_id','invite_token','email');
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'studio_rooms' AND column_name = 'treatment_types';
-- SELECT proname FROM pg_proc WHERE proname = 'claim_invite';
