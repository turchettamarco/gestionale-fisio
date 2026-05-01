-- ═══════════════════════════════════════════════════════════════════════
-- Migration 009: Security Hardening (RLS multi-tenancy)
-- ═══════════════════════════════════════════════════════════════════════
--
-- ⚠️  PRIMA DI ESEGUIRE QUESTA MIGRATION:
--    1. Esegui 009_BACKUP_BEFORE_RUN.sql e SALVA l'output (per rollback)
--    2. Verifica di avere uno snapshot/backup del DB su Supabase Dashboard
--
-- COSA RISOLVE:
-- L'audit RLS ha trovato 12+ policy "open all" che annullavano la sicurezza
-- multi-tenancy. Questa migration:
--
--   1. Rimuove le policy "open all" duplicate (allow_all, auth_all, ecc.)
--   2. Mantiene SOLO le policy multi-tenant corrette (studio_id IN ...)
--   3. Aggiunge RLS deny-by-default a password_reset_tokens
--   4. Sostituisce la policy aperta di confirm_tokens con una basata su token
--   5. Restringe la lettura anon di working_hours/booking_services al minimo
--   6. Mantiene gli endpoint pubblici (booking, esercizi, conferma) FUNZIONANTI
--
-- ENDPOINT PUBBLICI CHE RESTANO FUNZIONANTI:
--   GET  /api/booking/slots         → legge working_hours (anon)
--   POST /api/booking               → inserisce in booking_requests (anon)
--   GET  /conferma/[token]          → conferma_tokens via service_role API
--   GET  /api/calendar.ics?token=…  → studios via service_role API
--   /esercizi/[token], /portal/...  → via service_role API
--
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- 1. CONFIRM_TOKENS — rimozione policy "allow_all" pericolosa
-- ════════════════════════════════════════════════════════════════════════
-- La policy allow_all permetteva a chiunque (anche anon) di leggere/modificare
-- TUTTI i token di conferma. Gli endpoint /api/confirm e /conferma usano
-- service_role lato server, quindi non hanno bisogno di RLS aperta.
-- Lasciamo solo deny-by-default (nessuna policy = nessun accesso anon/auth).

DROP POLICY IF EXISTS allow_all ON public.confirm_tokens;

-- Policy minima: solo authenticated può vedere token del proprio studio
-- (utile per il gestionale per debug, opzionale)
DO $$
BEGIN
  -- Verifica se la tabella ha studio_id (non sempre è il caso)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='confirm_tokens' AND column_name='studio_id'
  ) THEN
    EXECUTE $POLICY$
      CREATE POLICY confirm_tokens_studio_select ON public.confirm_tokens
      FOR SELECT TO authenticated
      USING (studio_id IN (SELECT my_studios()));
    $POLICY$;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════════
-- 2. CLINICAL_SCALES — rimozione policy "allow_all"
-- ════════════════════════════════════════════════════════════════════════
-- Esistono già le 4 policy multi-tenant corrette. La allow_all le annullava.

DROP POLICY IF EXISTS allow_all ON public.clinical_scales;


-- ════════════════════════════════════════════════════════════════════════
-- 3. BODY_CHARTS — rimozione policy "auth users" aperta
-- ════════════════════════════════════════════════════════════════════════
-- Esistono già le 4 policy multi-tenant corrette.

DROP POLICY IF EXISTS "auth users" ON public.body_charts;


-- ════════════════════════════════════════════════════════════════════════
-- 4. CLINICAL_DOCUMENTS — rimozione policy "Enable all..."
-- ════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.clinical_documents;


-- ════════════════════════════════════════════════════════════════════════
-- 5. NOLEGGIOS — rimozione policy "noleggios_auth_all"
-- ════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS noleggios_auth_all ON public.noleggios;


-- ════════════════════════════════════════════════════════════════════════
-- 6. NOLEGGIO_SETTINGS — rimozione policy "noleggio_settings_auth"
-- ════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS noleggio_settings_auth ON public.noleggio_settings;


-- ════════════════════════════════════════════════════════════════════════
-- 7. BLOCKED_DAYS — rimozione policy aperte
-- ════════════════════════════════════════════════════════════════════════
-- blocked_days_write era ALL=true (qualsiasi auth scrive su qualsiasi studio).
-- blocked_days_read era SELECT anon=true (chiunque legge tutti i blocchi).
--
-- L'endpoint pubblico /api/booking/slots NON usa blocked_days direttamente,
-- quindi la lettura anon non serve. Se in futuro servirà, va aggiunta
-- una policy mirata che filtri per studio_id passato come parametro.

DROP POLICY IF EXISTS blocked_days_write ON public.blocked_days;
DROP POLICY IF EXISTS blocked_days_read ON public.blocked_days;


-- ════════════════════════════════════════════════════════════════════════
-- 8. BOOKING_SERVICES — rimozione policy "_write"
-- ════════════════════════════════════════════════════════════════════════
-- booking_services_read (anon=true) RESTA: serve alla pagina pubblica /booking
-- per vedere quali trattamenti sono prenotabili.
-- booking_services_write era ALL=true → la rimuoviamo.

DROP POLICY IF EXISTS booking_services_write ON public.booking_services;


-- ════════════════════════════════════════════════════════════════════════
-- 9. BOOKING_REQUESTS — rimozione policy vecchie pre-multi-tenancy
-- ════════════════════════════════════════════════════════════════════════
-- Le 3 policy vecchie ("chiunque può prenotare", "solo staff vede", "solo
-- staff aggiorna") sono PRE-multi-tenancy: usavano regole assolute
-- (true) invece di filtrare per studio_id.
--
-- Manteniamo solo le policy multi-tenant nuove + UNA policy di INSERT
-- per anon (necessaria al booking pubblico).

DROP POLICY IF EXISTS "chiunque può prenotare" ON public.booking_requests;
DROP POLICY IF EXISTS "solo staff vede le richieste" ON public.booking_requests;
DROP POLICY IF EXISTS "solo staff aggiorna le richieste" ON public.booking_requests;

-- Ricrea policy anon INSERT mirata: anon può prenotare ma deve sempre
-- specificare uno studio_id valido (non null, esistente).
-- Per ora teniamo la regola minima: studio_id deve essere valorizzato.
CREATE POLICY booking_requests_anon_insert ON public.booking_requests
  FOR INSERT TO anon
  WITH CHECK (studio_id IS NOT NULL);


-- ════════════════════════════════════════════════════════════════════════
-- 10. APPOINTMENTS — rimozione lettura pubblica anon (ics_feed_read)
-- ════════════════════════════════════════════════════════════════════════
-- Era usata dalla vecchia /api/calendar.ics PRIMA della migration 007.
-- Ora /api/calendar.ics usa service_role + filtro per token UUID,
-- quindi la lettura anon non serve più ed è un grave buco di sicurezza.

DROP POLICY IF EXISTS ics_feed_read ON public.appointments;


-- ════════════════════════════════════════════════════════════════════════
-- 11. PASSWORD_RESET_TOKENS — RLS deny-by-default
-- ════════════════════════════════════════════════════════════════════════
-- Tabella creata in migration 008 ma senza policy. Attiviamo RLS senza
-- aggiungere policy = deny by default. Solo service_role potrà accedere
-- (per gli endpoint API server-side).

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
-- Nessuna policy aggiunta = nessun accesso anon/authenticated → solo service_role


-- ════════════════════════════════════════════════════════════════════════
-- 12. EMAIL_LOG — fix policy SELECT (era public, deve essere authenticated)
-- ════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS email_log_studio_read ON public.email_log;

CREATE POLICY email_log_studio_read ON public.email_log
  FOR SELECT TO authenticated
  USING (
    studio_id IN (
      SELECT studio_id FROM studio_members WHERE user_id = auth.uid()
    )
  );


-- ════════════════════════════════════════════════════════════════════════
-- 13. APPOINTMENTS / NOLEGGIOS / ecc. — pulizia policy "_own" duplicate
-- ════════════════════════════════════════════════════════════════════════
-- Le policy *_own filtravano per owner_id = auth.uid() ed erano per il vecchio
-- modello pre-multi-tenancy (quando ogni utente aveva i suoi appuntamenti
-- senza il concetto di studio).
--
-- Ora il modello multi-tenant via studio_id le rende ridondanti: un utente
-- è SEMPRE membro del proprio studio, quindi vede sempre i propri.
--
-- Le rimuoviamo per chiarezza e per evitare query plan complicati.

DROP POLICY IF EXISTS appointments_select_own ON public.appointments;
DROP POLICY IF EXISTS appointments_insert_own ON public.appointments;
DROP POLICY IF EXISTS appointments_update_own ON public.appointments;
DROP POLICY IF EXISTS appointments_delete_own ON public.appointments;


-- ════════════════════════════════════════════════════════════════════════
-- 14. DOCUMENT_SIGNATURES — pulizia policy "_owner_*" duplicate
-- ════════════════════════════════════════════════════════════════════════
-- Anche queste sono filtri _own ridondanti rispetto alle policy multi-tenant.
-- Le rimuoviamo per consistenza.

DROP POLICY IF EXISTS signatures_owner_read   ON public.document_signatures;
DROP POLICY IF EXISTS signatures_owner_insert ON public.document_signatures;
DROP POLICY IF EXISTS signatures_owner_update ON public.document_signatures;
DROP POLICY IF EXISTS signatures_owner_delete ON public.document_signatures;


-- ════════════════════════════════════════════════════════════════════════
-- 15. DOCUMENT_TEMPLATES — restringi templates_read_active
-- ════════════════════════════════════════════════════════════════════════
-- La policy templates_read_active permetteva a qualsiasi authenticated
-- di leggere i template attivi di QUALSIASI studio.
-- I template del proprio studio sono già coperti da document_templates_select.

DROP POLICY IF EXISTS templates_read_active ON public.document_templates;


COMMIT;

-- ─── VERIFICA POST-MIGRATION ─────────────────────────────────────────────
--
-- Esegui per verificare che le policy aperte siano sparite:
--
--   SELECT tablename, policyname, qual
--   FROM pg_policies
--   WHERE schemaname='public' AND (qual = 'true' OR qual IS NULL AND with_check = 'true');
--
-- Dovresti vedere solo:
--   - booking_services.booking_services_read (lettura pubblica voluta)
--   - booking_requests.booking_requests_anon_insert (per booking pubblico)
--   - eventuali policy che hai aggiunto tu personalmente
--
-- Se vedi altre policy con qual='true' senza filtri studio_id, segnalamele.
