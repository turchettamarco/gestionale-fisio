-- ═══════════════════════════════════════════════════════════════════════
-- Migration 074: Anti doppia prenotazione a livello database (Tappa I)
-- ═══════════════════════════════════════════════════════════════════════
--
-- PROBLEMA:
-- Tutti i controlli sulle sovrapposizioni (modale, drag&drop, resize) sono
-- lato client. Se due persone salvano sullo stesso slot nello stesso
-- istante, entrambe passano: il realtime riduce la finestra di rischio ma
-- non la elimina. L'unico modo per rendere la doppia prenotazione
-- IMPOSSIBILE è un vincolo nel database.
--
-- SCELTA DI PROGETTO — perché opt-in:
-- practice_settings.overlap_mode ha tre valori: 'visual' (sovrapposizioni
-- libere), 'warn' (avvisa), 'block' (impedisci). Alcuni studi sovrappongono
-- di proposito (due lettini, seduta di gruppo, tempi che si accavallano di
-- 5 minuti). Un vincolo imposto a tutti romperebbe il loro lavoro. Quindi
-- il vincolo si attiva SOLO per gli studi che hanno già scelto 'block':
-- quel valore significa già "impedisci", e finora era solo una richiesta
-- gentile al client. Ora è una garanzia.
--
-- COME FUNZIONA:
--   • Colonna strict_slot su appointments, mantenuta da un trigger che
--     legge overlap_mode dello studio. È una denormalizzazione necessaria:
--     un vincolo EXCLUDE non può interrogare altre tabelle.
--   • Due vincoli EXCLUDE (GiST) applicati solo alle righe con strict_slot:
--     stesso operatore o stessa stanza non possono avere intervalli che si
--     sovrappongono. L'enforcement è dell'indice: niente race condition.
--   • Esclusi automaticamente: appuntamenti annullati, righe senza operatore
--     (ospiti) e senza stanza (domicili) — in SQL NULL non è mai uguale a
--     NULL, quindi non generano conflitti.
--
-- ATTIVARE SU UNO STUDIO: Impostazioni → sovrapposizioni → "Impedisci".
-- Se esistono già sovrapposizioni storiche, il backfill le lascia intatte
-- (strict_slot resta FALSE sulle righe passate) e il vincolo vale solo da
-- lì in avanti: nessuna migrazione può fallire per dati preesistenti.
--
-- ROLLBACK:
--   ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_no_overlap_operator;
--   ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_no_overlap_room;
--   DROP TRIGGER IF EXISTS trg_appointments_strict_slot ON appointments;
--   DROP FUNCTION IF EXISTS fn_appointments_strict_slot();
--   ALTER TABLE appointments DROP COLUMN IF EXISTS strict_slot;
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS strict_slot BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Trigger: allinea strict_slot alla scelta dello studio ───────────────
CREATE OR REPLACE FUNCTION public.fn_appointments_strict_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode TEXT;
BEGIN
  -- Gli annullati non occupano lo slot.
  IF NEW.status = 'cancelled' THEN
    NEW.strict_slot := FALSE;
    RETURN NEW;
  END IF;

  SELECT ps.overlap_mode INTO v_mode
  FROM practice_settings ps
  WHERE ps.studio_id = NEW.studio_id
  LIMIT 1;

  NEW.strict_slot := (COALESCE(v_mode, 'warn') = 'block');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_strict_slot ON public.appointments;
CREATE TRIGGER trg_appointments_strict_slot
  BEFORE INSERT OR UPDATE OF studio_id, status, start_at, end_at, operator_id, room_id
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_appointments_strict_slot();

-- ── Vincoli di esclusione ───────────────────────────────────────────────
-- NOT VALID: non vengono verificati sulle righe già esistenti, così la
-- migration non può fallire su dati storici sovrapposti.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.appointments'::regclass
      AND conname = 'appointments_no_overlap_operator'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_no_overlap_operator
      EXCLUDE USING gist (
        operator_id WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
      )
      WHERE (strict_slot AND operator_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.appointments'::regclass
      AND conname = 'appointments_no_overlap_room'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_no_overlap_room
      EXCLUDE USING gist (
        room_id WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
      )
      WHERE (strict_slot AND room_id IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN public.appointments.strict_slot IS
  'TRUE quando lo studio impone il divieto di sovrapposizione (practice_settings.overlap_mode = block). Mantenuta dal trigger, abilita i vincoli EXCLUDE (mig. 074).';
