-- ═══════════════════════════════════════════════════════════════════════
-- Migration 071: Permessi granulari per operatore + co-titolare (Tappa G)
-- ═══════════════════════════════════════════════════════════════════════
--
-- OBIETTIVO:
--   1. PERMESSI GRANULARI: ogni membro può avere un livello predefinito
--      (base / medio / completo / tutto) oppure una configurazione su misura
--      con i singoli permessi attivabili uno per uno.
--        • permission_preset: 'base' | 'medium' | 'patient_full' | 'all' | 'custom'
--        • permissions: array JSON di chiavi permesso, usato SOLO quando
--          il preset è 'custom' (altrimenti il preset è la fonte di verità)
--      NULL su entrambi = comportamento storico per ruolo, nessuna
--      regressione sugli studi esistenti.
--
--   2. CO-TITOLARE: nuovo ruolo 'co_owner' con gli stessi poteri dell'owner.
--      Serve al caso "io e la mia socia": due accessi distinti, entrambi
--      vedono e gestiscono tutto. L'owner resta uno solo (è il proprietario
--      dell'abbonamento e non è eliminabile), il co-titolare è di fatto un
--      secondo titolare operativo.
--
-- NOTA SICUREZZA:
--   Questa migration introduce il MODELLO dei permessi; l'applicazione lato
--   client nasconde funzioni e dati sensibili. Le RLS restano il confine
--   forte e vanno estese in un passaggio dedicato (vedi tappa successiva):
--   finché non lo si fa, i permessi vanno considerati una separazione
--   funzionale tra colleghi, non una barriera contro un utente ostile.
--
-- ROLLBACK:
--   ALTER TABLE studio_members DROP COLUMN IF EXISTS permission_preset;
--   ALTER TABLE studio_members DROP COLUMN IF EXISTS permissions;
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.studio_members
  ADD COLUMN IF NOT EXISTS permission_preset TEXT,
  ADD COLUMN IF NOT EXISTS permissions JSONB;

-- Valori ammessi per il preset (NULL = default per ruolo)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.studio_members'::regclass
      AND conname = 'studio_members_permission_preset_chk'
  ) THEN
    ALTER TABLE public.studio_members
      ADD CONSTRAINT studio_members_permission_preset_chk
      CHECK (permission_preset IS NULL OR permission_preset IN
        ('base', 'medium', 'patient_full', 'all', 'custom'));
  END IF;
END $$;

-- ── Ruolo co_owner ──────────────────────────────────────────────────────
-- Se esiste un CHECK sui ruoli, lo si sostituisce includendo 'co_owner'.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.studio_members'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
      AND pg_get_constraintdef(oid) ILIKE '%owner%'
  LOOP
    EXECUTE format('ALTER TABLE public.studio_members DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.studio_members
    ADD CONSTRAINT studio_members_role_chk
    CHECK (role IN ('owner', 'co_owner', 'therapist', 'assistant'));
END $$;

COMMENT ON COLUMN public.studio_members.permission_preset IS
  'Livello permessi: base | medium | patient_full | all | custom. NULL = default del ruolo (mig. 071).';
COMMENT ON COLUMN public.studio_members.permissions IS
  'Array JSON di chiavi permesso. Usato solo quando permission_preset = custom (mig. 071).';

-- ── RLS: il co-titolare ha gli stessi diritti dell'owner ────────────────
-- Le policy esistenti citano role = 'owner' o IN ('owner','therapist').
-- Qui non le riscriviamo una per una (sono molte e su tabelle diverse):
-- una funzione helper permette di aggiornarle progressivamente.
CREATE OR REPLACE FUNCTION public.is_studio_owner(p_studio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM studio_members m
    WHERE m.studio_id = p_studio_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'co_owner')
      AND COALESCE(m.is_active, TRUE)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_studio_owner(uuid) TO authenticated;
