-- migrations/012_notifications.sql
-- ═══════════════════════════════════════════════════════════════════════
-- Sistema notifiche cancellazioni/conferme via link WhatsApp
-- ═══════════════════════════════════════════════════════════════════════
-- Quando un paziente clicca su Conferma/Annulla nel link WhatsApp:
--   1. /api/confirm aggiorna lo status appuntamento (già esistente)
--   2. /api/confirm inserisce una riga in notifications (NUOVO)
--   3. /api/confirm restituisce wa_redirect_url per ridirigere il paziente
--      su WhatsApp con messaggio precompilato verso lo studio (NUOVO)
--
-- Lo studio ha 3 toggle in impostazioni:
--   - notify_email_enabled        → invia email a studio.email
--   - notify_bell_enabled         → mostra campanella nel calendario
--   - notify_wa_redirect_enabled  → mostra bottone WA al paziente dopo cancel
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Tabella notifications
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('confirm', 'cancel', 'booking')),
  appointment_id  UUID REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id      UUID REFERENCES patients(id) ON DELETE SET NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at         TIMESTAMPTZ
);

-- Indice per la query principale (notifiche non lette di uno studio)
CREATE INDEX IF NOT EXISTS idx_notifications_studio_unread
  ON notifications(studio_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_studio_all
  ON notifications(studio_id, created_at DESC);

-- 2. Toggle nelle impostazioni studio
ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS notify_email_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_bell_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_wa_redirect_enabled BOOLEAN NOT NULL DEFAULT true;

-- 3. RLS per notifications: solo i membri dello studio possono leggere/aggiornare le proprie
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_studio_members_select" ON notifications;
CREATE POLICY "notifications_studio_members_select" ON notifications
  FOR SELECT
  USING (studio_id IN (SELECT studio_id FROM studio_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "notifications_studio_members_update" ON notifications;
CREATE POLICY "notifications_studio_members_update" ON notifications
  FOR UPDATE
  USING (studio_id IN (SELECT studio_id FROM studio_members WHERE user_id = auth.uid()));

-- INSERT solo via service_role (l'API /api/confirm usa SUPABASE_SERVICE_ROLE_KEY).
-- Non serve policy INSERT per gli utenti normali (non devono creare notifiche).
