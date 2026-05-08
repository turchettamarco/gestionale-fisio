-- ═══════════════════════════════════════════════════════════════════════
-- Script DI TEST (NON una migration): popola 2 membri fittizi + 1 ferie
-- ═══════════════════════════════════════════════════════════════════════
--
-- SCOPO:
-- Permettere di testare la vista giorno multi-operatore (Fase 4a) senza
-- dover inviare inviti veri e fare 2 signup. Crea 2 membri "placeholder"
-- nel tuo studio con user_id NULL, così:
--   • la TeamSection in /settings li vede come "INVITO PENDENTE"
--   • il calendario li conta come operatori e mostra le 3 colonne
--   • puoi creare appuntamenti e assegnarli (manualmente per ora) ai loro UUID
--
-- IMPORTANTE — DA NON ESEGUIRE IN PRODUZIONE PER I COLLEGHI VERI:
-- Questi sono dati di test usa-e-getta. Quando inviti i colleghi veri,
-- elimini prima questi inserendo le SQL DELETE in fondo a questo file.
--
-- COME USARLO:
-- 1. Apri Supabase → SQL Editor → New query
-- 2. Copia tutto questo SQL (eccetto la parte CLEANUP in fondo)
-- 3. Sostituisci 'YOUR_STUDIO_ID' con il tuo studio_id reale
--    Per trovarlo: SELECT id, name FROM studios;
-- 4. Premi Run
--
-- Per CANCELLARE i dati di test dopo, esegui solo la parte CLEANUP in fondo.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Trova il tuo studio_id (esegui solo questa per scoprirlo) ──────────
-- SELECT id, name FROM studios ORDER BY created_at;


-- ─── INSERIMENTO DATI DI TEST ──────────────────────────────────────────
-- Sostituisci 'YOUR_STUDIO_ID' con il tuo UUID reale, poi esegui.

DO $$
DECLARE
  v_studio_id UUID := 'YOUR_STUDIO_ID';  -- ← SOSTITUISCI QUI
  v_giulia_token UUID := gen_random_uuid();
  v_andrea_token UUID := gen_random_uuid();
  v_giulia_member_id UUID;
BEGIN
  -- Verifica che lo studio esista
  IF NOT EXISTS (SELECT 1 FROM studios WHERE id = v_studio_id) THEN
    RAISE EXCEPTION 'Studio % non trovato. Esegui prima: SELECT id, name FROM studios;', v_studio_id;
  END IF;

  -- Membro fittizio 1: Giulia (Therapist)
  INSERT INTO studio_members (
    studio_id, user_id, role, display_name,
    display_color, signature_short, is_active, sort_order,
    email, invite_token, invited_at
  ) VALUES (
    v_studio_id, NULL, 'therapist', 'Giulia Rossi',
    '#8b5cf6', 'GR', TRUE, 100,
    'giulia.test@fisiohub.local', v_giulia_token, NOW()
  )
  RETURNING user_id INTO v_giulia_member_id;
  -- Nota: user_id resta NULL, ma la riga ha invite_token quindi rispetta
  -- il constraint pending_invite_check (mig. 020).

  -- Membro fittizio 2: Andrea (Therapist)
  INSERT INTO studio_members (
    studio_id, user_id, role, display_name,
    display_color, signature_short, is_active, sort_order,
    email, invite_token, invited_at
  ) VALUES (
    v_studio_id, NULL, 'therapist', 'Andrea Sirti',
    '#ec4899', 'AS', TRUE, 101,
    'andrea.test@fisiohub.local', v_andrea_token, NOW()
  );

  RAISE NOTICE 'Creati 2 membri di test. Token invito (ignorabili per il test):';
  RAISE NOTICE '  Giulia: %', v_giulia_token;
  RAISE NOTICE '  Andrea: %', v_andrea_token;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- LIMITAZIONE NOTA:
-- Visto che questi membri hanno user_id = NULL (sono invitati pendenti),
-- NON possono ancora apparire come colonne nel calendario, perché il
-- DayTimelineMulti filtra solo i membri con user_id valorizzato (quelli
-- effettivamente registrati).
--
-- Per testare DAVVERO la vista a 3 colonne, hai due opzioni:
--
-- OPZIONE A (consigliata per primo test): attiva il flag
--   multi_operator_enabled e basta, vedrai un solo te stesso come colonna
--   ma confermi che la nuova vista renderizza senza errori.
--
-- OPZIONE B (per test reale a 3 colonne): apri il link invito di Giulia
--   in incognito e fa il signup come tua mail+test1@gmail.com.
--   Idem per Andrea con +test2. Così tu+2 = 3 colonne reali nel calendario.
--
-- I link invito sono visibili in /settings/team dopo aver eseguito questo
-- script (sezione "Inviti pendenti").
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════
-- CLEANUP — esegui SOLO questa parte per cancellare i dati di test
-- ═══════════════════════════════════════════════════════════════════════
--
-- DELETE FROM studio_members
--   WHERE email IN ('giulia.test@fisiohub.local', 'andrea.test@fisiohub.local')
--   AND user_id IS NULL;
--
-- (Il filtro user_id IS NULL è di sicurezza: non cancelli mai membri reali
-- registrati anche se hanno coincidenza email, cosa improbabile ma possibile.)
