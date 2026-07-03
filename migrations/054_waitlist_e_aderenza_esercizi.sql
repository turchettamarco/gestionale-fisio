-- ════════════════════════════════════════════════════════════════════════
-- migrations/054_waitlist_e_aderenza_esercizi.sql
-- ════════════════════════════════════════════════════════════════════════
-- Due feature in una migrazione:
--
-- 1) LISTA D'ATTESA (waitlist_entries)
--    Pazienti in attesa di uno slot. Quando un appuntamento viene eliminato
--    dal calendario, FisioHub cerca le voci compatibili (giorno della
--    settimana + fascia oraria) e propone l'invio WhatsApp del posto
--    liberato. Stati: active → notified → booked (o cancelled/expired).
--
-- 2) ADERENZA ESERCIZI (esercizi_aderenza)
--    Spunte "Fatto oggi" del paziente sulla scheda esercizi pubblica
--    (/esercizi/[token]). Una riga per esercizio per giorno.
--    ⚠ NESSUNA policy: la tabella è accessibile SOLO via service role
--    (API /api/esercizi-pubblici), come da pattern consensi remoti (034).
--    Il fisioterapista la legge attraverso la stessa API col token.
--
-- RLS waitlist: pattern my_studios() (mig. 021/034, nessuna ricorsione).
-- NB: nessun BEGIN/COMMIT — il runner non supporta comandi transazionali.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS esercizi_aderenza;
--   DROP TABLE IF EXISTS waitlist_entries;
-- ════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. LISTA D'ATTESA
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id          UUID NOT NULL REFERENCES studios(id)  ON DELETE CASCADE,
  patient_id         UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Preferenze slot: giorni della settimana (1=lun … 7=dom, ISO) e fascia
  -- oraria. Array/campi vuoti = "qualsiasi".
  preferred_days     INT[] NOT NULL DEFAULT '{}',
  time_from          TIME,
  time_to            TIME,

  note               TEXT,

  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
                       'active',     -- in attesa
                       'notified',   -- avvisato di uno slot, in attesa di risposta
                       'booked',     -- ha prenotato → uscito dalla lista
                       'cancelled'   -- rimosso manualmente
                     )),
  notified_at        TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_studio_status
  ON waitlist_entries (studio_id, status);

CREATE INDEX IF NOT EXISTS idx_waitlist_patient
  ON waitlist_entries (patient_id);

COMMENT ON TABLE waitlist_entries IS
  'Lista d''attesa pazienti per slot liberati. preferred_days ISO 1=lun..7=dom, '
  'vuoto = qualsiasi giorno. time_from/time_to = fascia oraria preferita. (mig. 054)';

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waitlist_entries_select ON waitlist_entries;
CREATE POLICY waitlist_entries_select ON waitlist_entries
  FOR SELECT TO authenticated
  USING (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS waitlist_entries_insert ON waitlist_entries;
CREATE POLICY waitlist_entries_insert ON waitlist_entries
  FOR INSERT TO authenticated
  WITH CHECK (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS waitlist_entries_update ON waitlist_entries;
CREATE POLICY waitlist_entries_update ON waitlist_entries
  FOR UPDATE TO authenticated
  USING (studio_id IN (SELECT my_studios()))
  WITH CHECK (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS waitlist_entries_delete ON waitlist_entries;
CREATE POLICY waitlist_entries_delete ON waitlist_entries
  FOR DELETE TO authenticated
  USING (studio_id IN (SELECT my_studios()));


-- ─────────────────────────────────────────────────────────────────────────
-- 2. ADERENZA ESERCIZI (spunte "Fatto oggi" dal portale paziente)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS esercizi_aderenza (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheda_id    UUID NOT NULL REFERENCES schede_esercizi_pubbliche(id) ON DELETE CASCADE,
  exercise_id  TEXT NOT NULL,               -- id dell'esercizio nel JSON della scheda
  done_date    DATE NOT NULL,               -- giorno della spunta (Europe/Rome lato client)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (scheda_id, exercise_id, done_date)
);

CREATE INDEX IF NOT EXISTS idx_esercizi_aderenza_scheda
  ON esercizi_aderenza (scheda_id, done_date DESC);

COMMENT ON TABLE esercizi_aderenza IS
  'Spunte di aderenza del paziente sulla scheda esercizi pubblica. '
  'Accesso SOLO via service role (API esercizi-pubblici, token). (mig. 054)';

-- RLS attiva, NESSUNA policy → invisibile ad anon e authenticated,
-- accessibile solo con service role (stesso pattern di patient_consents
-- lato pubblico, mig. 034).
ALTER TABLE esercizi_aderenza ENABLE ROW LEVEL SECURITY;
