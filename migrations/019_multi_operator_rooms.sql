-- ═══════════════════════════════════════════════════════════════════════
-- Migration 019: Multi-operatore + multi-stanza (Fase 1 — fondamenta)
-- ═══════════════════════════════════════════════════════════════════════
--
-- OBIETTIVO:
-- Aggiungere supporto opzionale a (a) team multi-operatore con colori,
-- ruoli, indisponibilità e (b) catalogo stanze legate a una sede.
-- Tutto è retrocompatibile: i flag a livello studio sono OFF di default,
-- l'app continua a funzionare esattamente come prima della migration.
--
-- MODELLO:
-- 1. Flag su studios:
--    - multi_operator_enabled, multi_room_enabled (entrambi false di default)
-- 2. Estensione studio_members:
--    - display_color, signature_short, is_active, sort_order
--    - email, invited_at (preparazione fase 2: invito via email)
-- 3. Nuova tabella studio_rooms (sul modello di studio_locations)
-- 4. Nuove colonne su appointments: operator_id, room_id (entrambe NULL ok)
-- 5. Nuova tabella operator_unavailability (ferie/malattia per-operatore)
-- 6. Backfill signature_short per i membri esistenti
--
-- ROLLBACK:
-- DROP TABLE IF EXISTS operator_unavailability;
-- ALTER TABLE appointments DROP COLUMN IF EXISTS operator_id;
-- ALTER TABLE appointments DROP COLUMN IF EXISTS room_id;
-- DROP TABLE IF EXISTS studio_rooms;
-- ALTER TABLE studio_members DROP COLUMN IF EXISTS display_color;
-- ALTER TABLE studio_members DROP COLUMN IF EXISTS signature_short;
-- ALTER TABLE studio_members DROP COLUMN IF EXISTS is_active;
-- ALTER TABLE studio_members DROP COLUMN IF EXISTS sort_order;
-- ALTER TABLE studio_members DROP COLUMN IF EXISTS email;
-- ALTER TABLE studio_members DROP COLUMN IF EXISTS invited_at;
-- ALTER TABLE studios DROP COLUMN IF EXISTS multi_operator_enabled;
-- ALTER TABLE studios DROP COLUMN IF EXISTS multi_room_enabled;
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Flag a livello studio ──────────────────────────────────────────
ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS multi_operator_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS multi_room_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN studios.multi_operator_enabled IS
  'Quando TRUE, il calendario mostra colonne/sub-colonne per operatore. '
  'I modal di creazione richiedono di scegliere l''operatore. '
  'Default FALSE: lo studio funziona in modalità single-operatore.';

COMMENT ON COLUMN studios.multi_room_enabled IS
  'Quando TRUE, gli appuntamenti possono essere associati a una stanza '
  '(tabella studio_rooms) e il calendario controlla i conflitti di stanza. '
  'Default FALSE.';


-- ─── 2. Estensione studio_members ──────────────────────────────────────
ALTER TABLE studio_members
  ADD COLUMN IF NOT EXISTS display_color TEXT;

ALTER TABLE studio_members
  ADD COLUMN IF NOT EXISTS signature_short TEXT;

ALTER TABLE studio_members
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE studio_members
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE studio_members
  ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE studio_members
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

COMMENT ON COLUMN studio_members.display_color IS
  'Colore hex (es. #0d9488) usato per identificare visivamente l''operatore '
  'nel calendario: bordo eventi, badge, micro-barre. NULL = non personalizzato.';

COMMENT ON COLUMN studio_members.signature_short IS
  'Iniziali (1-3 caratteri, es. "MT" per Marco Turchetta) mostrate nei badge '
  'compatti del calendario. Auto-derivate da display_name al primo accesso.';

COMMENT ON COLUMN studio_members.is_active IS
  'Disattivare un membro senza cancellarlo: scompare dai filtri attivi e dai '
  'modal di creazione, ma gli appuntamenti storici restano associati.';

COMMENT ON COLUMN studio_members.email IS
  'Email del membro. Usata per invito (fase 2) e notifiche. Può differire '
  'dall''email del record auth.users se l''account è stato creato dopo l''invito.';


-- ─── 3. Tabella studio_rooms ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS studio_rooms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  location_id     UUID REFERENCES studio_locations(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  color           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE studio_rooms IS
  'Catalogo stanze/ambienti operativi (Sala 1, Sala 2, Palestra, ecc.). '
  'Una stanza può appartenere a una specifica sede (location_id) o essere '
  'trasversale (location_id NULL). Il domiciliare non è una stanza: resta '
  'gestito tramite appointments.location.';

COMMENT ON COLUMN studio_rooms.color IS
  'Colore hex per identificare visivamente la stanza nei badge degli eventi. '
  'NULL = colore neutro di default.';

CREATE INDEX IF NOT EXISTS idx_studio_rooms_studio_id ON studio_rooms(studio_id);
CREATE INDEX IF NOT EXISTS idx_studio_rooms_location_id ON studio_rooms(location_id);

-- RLS studio-scoped: tutti i membri dello studio vedono le stanze
ALTER TABLE studio_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_rooms_select ON studio_rooms;
CREATE POLICY studio_rooms_select ON studio_rooms
  FOR SELECT TO authenticated
  USING (
    studio_id IN (
      SELECT studio_id FROM studio_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS studio_rooms_insert ON studio_rooms;
CREATE POLICY studio_rooms_insert ON studio_rooms
  FOR INSERT TO authenticated
  WITH CHECK (
    studio_id IN (
      SELECT studio_id FROM studio_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'therapist')
    )
  );

DROP POLICY IF EXISTS studio_rooms_update ON studio_rooms;
CREATE POLICY studio_rooms_update ON studio_rooms
  FOR UPDATE TO authenticated
  USING (
    studio_id IN (
      SELECT studio_id FROM studio_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'therapist')
    )
  );

DROP POLICY IF EXISTS studio_rooms_delete ON studio_rooms;
CREATE POLICY studio_rooms_delete ON studio_rooms
  FOR DELETE TO authenticated
  USING (
    studio_id IN (
      SELECT studio_id FROM studio_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );


-- ─── 4. Estensione appointments ────────────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS operator_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS room_id UUID
    REFERENCES studio_rooms(id) ON DELETE SET NULL;

COMMENT ON COLUMN appointments.operator_id IS
  'Membro del team che effettua la seduta. NULL = non assegnato (legacy o '
  'studio in modalità single-operatore). Quando multi_operator_enabled=true '
  'la UI di creazione richiede di valorizzarlo.';

COMMENT ON COLUMN appointments.room_id IS
  'Stanza in cui si svolge la seduta. NULL = non assegnata (es. domiciliare, '
  'oppure studio in modalità single-room). Il check di conflitto stanza '
  'ignora gli appuntamenti con room_id NULL.';

CREATE INDEX IF NOT EXISTS idx_appointments_operator_id ON appointments(operator_id);
CREATE INDEX IF NOT EXISTS idx_appointments_room_id ON appointments(room_id);
-- Indice composito per il check overlap stanza efficiente
CREATE INDEX IF NOT EXISTS idx_appointments_room_time
  ON appointments(room_id, start_at, end_at)
  WHERE room_id IS NOT NULL AND status NOT IN ('cancelled');


-- ─── 5. Tabella operator_unavailability ────────────────────────────────
CREATE TABLE IF NOT EXISTS operator_unavailability (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  operator_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  all_day         BOOLEAN NOT NULL DEFAULT FALSE,
  reason          TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT operator_unavailability_time_range CHECK (end_at > start_at)
);

COMMENT ON TABLE operator_unavailability IS
  'Indisponibilità di un singolo operatore: ferie, malattia, formazione, '
  'pausa pranzo strutturata. È diverso da blocked_days (chiusura studio-wide). '
  'Il calendario mostra queste fasce con pattern striped sulla colonna '
  'dell''operatore corrispondente.';

COMMENT ON COLUMN operator_unavailability.all_day IS
  'Se TRUE, l''indisponibilità copre l''intera giornata (UI mostra etichetta '
  'tipo "FERIE" a tutta cella). Se FALSE, mostra fascia oraria specifica.';

COMMENT ON COLUMN operator_unavailability.reason IS
  'Motivo libero (es. "Ferie", "Corso EOM Cranio", "Malattia"). Mostrato '
  'come tooltip al hover. Per privacy, "Malattia" può essere mostrata '
  'genericamente come "Indisponibile" agli altri membri.';

CREATE INDEX IF NOT EXISTS idx_operator_unav_studio_id ON operator_unavailability(studio_id);
CREATE INDEX IF NOT EXISTS idx_operator_unav_operator_id ON operator_unavailability(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_unav_time
  ON operator_unavailability(operator_id, start_at, end_at);

-- RLS studio-scoped
ALTER TABLE operator_unavailability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operator_unav_select ON operator_unavailability;
CREATE POLICY operator_unav_select ON operator_unavailability
  FOR SELECT TO authenticated
  USING (
    studio_id IN (
      SELECT studio_id FROM studio_members WHERE user_id = auth.uid()
    )
  );

-- INSERT: ogni operatore può inserire la propria; owner/therapist anche per altri
DROP POLICY IF EXISTS operator_unav_insert ON operator_unavailability;
CREATE POLICY operator_unav_insert ON operator_unavailability
  FOR INSERT TO authenticated
  WITH CHECK (
    studio_id IN (
      SELECT studio_id FROM studio_members WHERE user_id = auth.uid()
    )
    AND (
      operator_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM studio_members
        WHERE studio_id = operator_unavailability.studio_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'therapist')
      )
    )
  );

-- UPDATE/DELETE: solo proprio record o ruolo owner/therapist
DROP POLICY IF EXISTS operator_unav_update ON operator_unavailability;
CREATE POLICY operator_unav_update ON operator_unavailability
  FOR UPDATE TO authenticated
  USING (
    studio_id IN (
      SELECT studio_id FROM studio_members WHERE user_id = auth.uid()
    )
    AND (
      operator_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM studio_members
        WHERE studio_id = operator_unavailability.studio_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'therapist')
      )
    )
  );

DROP POLICY IF EXISTS operator_unav_delete ON operator_unavailability;
CREATE POLICY operator_unav_delete ON operator_unavailability
  FOR DELETE TO authenticated
  USING (
    studio_id IN (
      SELECT studio_id FROM studio_members WHERE user_id = auth.uid()
    )
    AND (
      operator_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM studio_members
        WHERE studio_id = operator_unavailability.studio_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'therapist')
      )
    )
  );


-- ─── 6. Backfill signature_short per membri esistenti ──────────────────
-- Calcola le iniziali da display_name. Se display_name è NULL, lascia NULL
-- (verrà compilato dall'utente in settings al primo accesso).
UPDATE studio_members
SET signature_short = (
  SELECT STRING_AGG(LEFT(part, 1), '')
  FROM regexp_split_to_table(
    UPPER(TRIM(display_name)),
    '\s+'
  ) AS part
  WHERE part != ''
  LIMIT 3
)
WHERE signature_short IS NULL
  AND display_name IS NOT NULL
  AND display_name != '';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- POST-MIGRATION CHECK (run manually):
-- ═══════════════════════════════════════════════════════════════════════
-- SELECT id, name, multi_operator_enabled, multi_room_enabled FROM studios;
-- SELECT user_id, display_name, signature_short, display_color, is_active
--   FROM studio_members ORDER BY created_at;
-- SELECT COUNT(*) AS rooms_count FROM studio_rooms;
-- SELECT COUNT(*) AS unav_count FROM operator_unavailability;
