-- ═══════════════════════════════════════════════════════════════════════
-- Migration 094: Richieste di disdetta e spostamento dal paziente
-- ═══════════════════════════════════════════════════════════════════════
--
-- PERCHÉ:
-- Oggi chi non può venire telefona, e se lo studio non risponde manda un
-- messaggio che finisce fra gli altri. Dall'area riservata il paziente
-- chiede la disdetta o lo spostamento con un tocco, e la richiesta arriva
-- tracciata e con l'appuntamento già collegato.
--
-- SCELTA IMPORTANTE — è una RICHIESTA, non una cancellazione:
-- l'appuntamento in agenda NON viene toccato. Resta lì finché non sei tu
-- ad accettare. Un paziente che disdice da solo alle 23 di domenica un
-- appuntamento del lunedì mattina lascerebbe un buco che nessuno ha visto
-- in tempo, e toglierebbe allo studio la possibilità di applicare le
-- proprie regole sui preavvisi.
--
-- CONTIENE ANCHE:
--  • estensione dei tipi ammessi in notifications: serviva per far
--    comparire la richiesta fra le notifiche dello studio;
--  • interruttore portal_allow_changes, spento per default — chi preferisce
--    gestire disdette al telefono non se lo ritrova acceso a sorpresa.
--
-- NOTA TRANSAZIONI: niente BEGIN;/COMMIT; — il runner esegue il file
-- dentro exec_migration_sql(), dove i comandi di transazione danno
-- "EXECUTE of transaction commands is not implemented [0A000]".
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.appointment_change_requests;
--   ALTER TABLE studios DROP COLUMN IF EXISTS portal_allow_changes;
--   (il vincolo su notifications.type va riportato ai 3 valori originali)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.appointment_change_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES public.studios(id)      ON DELETE CASCADE,
  patient_id      UUID NOT NULL REFERENCES public.patients(id)     ON DELETE CASCADE,
  appointment_id  UUID          REFERENCES public.appointments(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('cancel', 'reschedule')),
  message         TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  handled_at      TIMESTAMPTZ,
  handled_by      UUID
);

CREATE INDEX IF NOT EXISTS acr_studio_pending_idx
  ON public.appointment_change_requests (studio_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS acr_appointment_idx
  ON public.appointment_change_requests (appointment_id);

ALTER TABLE public.appointment_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS acr_studio_select ON public.appointment_change_requests;
CREATE POLICY acr_studio_select ON public.appointment_change_requests
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS acr_studio_update ON public.appointment_change_requests;
CREATE POLICY acr_studio_update ON public.appointment_change_requests
  FOR UPDATE TO authenticated
  USING (studio_id IN (SELECT my_studios()))
  WITH CHECK (studio_id IN (SELECT my_studios()));

COMMENT ON TABLE public.appointment_change_requests IS
  'Richieste di disdetta o spostamento inviate dal paziente dall''area riservata. Non modificano l''agenda: vanno approvate dallo studio (mig. 094).';

-- ── Notifiche: nuovi tipi ammessi ──────────────────────────────────────
-- Il vincolo originale (mig. 012) elencava solo confirm/cancel/booking.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('confirm', 'cancel', 'booking', 'change_request', 'intake'));

-- ── Interruttore area paziente ─────────────────────────────────────────

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS portal_allow_changes boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.studios.portal_allow_changes IS
  'Area paziente: consente di chiedere disdetta o spostamento di un appuntamento. Spento per default; la richiesta va comunque approvata dallo studio (mig. 094).';

-- ─── Verifica post-migration ─────────────────────────────────────────
--   SELECT kind, status, created_at FROM appointment_change_requests
--    ORDER BY created_at DESC;
