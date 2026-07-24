-- ═══════════════════════════════════════════════════════════════════════
-- Migration 092: Diario del dolore + blocchi pacchetto e diario
-- ═══════════════════════════════════════════════════════════════════════
--
-- 1. patient_pain_log — il paziente segna ogni giorno il livello di dolore
--    (0-10) con una nota facoltativa. Al controllo successivo il terapista
--    apre l'andamento reale invece di affidarsi al ricordo del paziente,
--    che tende a essere schiacciato sugli ultimi due o tre giorni.
--
--    Una riga al giorno per paziente (vincolo UNIQUE): riaprendo la stessa
--    giornata si corregge il valore invece di accumularne due.
--
--    ACCESSO: scritture solo via service role, come esercizi_aderenza
--    (mig. 054) e patient_consents (mig. 034) — il paziente arriva dal
--    portale con un token, non ha un account. Lo staff legge tramite RLS
--    sul proprio studio.
--
-- 2. Due interruttori in più per l'area paziente (stessa logica della
--    mig. 091): sedute residue del pacchetto e diario del dolore.
--    Il diario parte SPENTO: è una funzione che va spiegata al paziente,
--    non deve comparirgli addosso senza che il terapista l'abbia deciso.
--
-- NOTA TRANSAZIONI: niente BEGIN;/COMMIT; — il runner esegue il file
-- dentro exec_migration_sql(), dove i comandi di transazione danno
-- "EXECUTE of transaction commands is not implemented [0A000]".
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.patient_pain_log;
--   ALTER TABLE studios
--     DROP COLUMN IF EXISTS portal_show_packages,
--     DROP COLUMN IF EXISTS portal_show_pain_diary;
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Diario del dolore ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.patient_pain_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id   UUID NOT NULL REFERENCES public.studios(id)  ON DELETE CASCADE,
  patient_id  UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  day         DATE NOT NULL,
  level       SMALLINT NOT NULL CHECK (level >= 0 AND level <= 10),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (patient_id, day)
);

CREATE INDEX IF NOT EXISTS patient_pain_log_patient_day_idx
  ON public.patient_pain_log (patient_id, day DESC);

CREATE INDEX IF NOT EXISTS patient_pain_log_studio_idx
  ON public.patient_pain_log (studio_id);

ALTER TABLE public.patient_pain_log ENABLE ROW LEVEL SECURITY;

-- Lo staff dello studio legge il diario dei propri pazienti.
-- Nessuna policy di scrittura: le voci arrivano dal portale via service
-- role, così non si possono falsificare da un client autenticato.
DROP POLICY IF EXISTS patient_pain_log_studio_select ON public.patient_pain_log;
CREATE POLICY patient_pain_log_studio_select ON public.patient_pain_log
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_studios()));

COMMENT ON TABLE public.patient_pain_log IS
  'Diario del dolore compilato dal paziente nella sua area riservata: una riga al giorno, livello 0-10. Scritture solo via service role con token di portale (mig. 092).';

-- ── 2. Interruttori aggiuntivi dell'area paziente ──────────────────────

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS portal_show_packages   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_show_pain_diary boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.studios.portal_show_packages IS
  'Area paziente: mostra le sedute residue dei pacchetti attivi (mig. 092).';
COMMENT ON COLUMN public.studios.portal_show_pain_diary IS
  'Area paziente: mostra il diario del dolore. Spento per default, va attivato dal terapista (mig. 092).';

-- ─── Verifica post-migration ─────────────────────────────────────────
--   SELECT portal_show_packages, portal_show_pain_diary FROM studios;
--   SELECT * FROM patient_pain_log ORDER BY day DESC LIMIT 10;
