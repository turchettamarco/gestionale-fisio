-- ═══════════════════════════════════════════════════════════════════════
-- Migration 070: Realtime agenda (Tappa C multi-op)
-- ═══════════════════════════════════════════════════════════════════════
--
-- OBIETTIVO:
-- Con più operatori (o titolare + segreteria) sulla stessa agenda, ognuno
-- vedeva dati fermi al proprio ultimo caricamento: due persone potevano
-- prenotare lo stesso slot senza accorgersene. Qui abilitiamo la
-- pubblicazione Realtime di Supabase sulle tabelle dell'agenda, così il
-- client può ricevere INSERT/UPDATE/DELETE e ricaricare la finestra
-- visibile in tempo reale.
--
-- COSA FA:
--   1. Aggiunge appointments e operator_unavailability alla publication
--      "supabase_realtime" (idempotente: salta se già presenti).
--   2. Imposta REPLICA IDENTITY FULL, necessario perché nei payload di
--      UPDATE/DELETE arrivi il record "old" completo — senza, il filtro
--      per studio_id sui DELETE non funzionerebbe.
--
-- SICUREZZA:
--   Realtime rispetta le RLS esistenti: ogni utente riceve solo gli eventi
--   delle righe che potrebbe già leggere via SELECT. Nessuna nuova
--   superficie di esposizione dati.
--
-- ROLLBACK:
--   ALTER PUBLICATION supabase_realtime DROP TABLE appointments;
--   ALTER PUBLICATION supabase_realtime DROP TABLE operator_unavailability;
--   ALTER TABLE appointments REPLICA IDENTITY DEFAULT;
--   ALTER TABLE operator_unavailability REPLICA IDENTITY DEFAULT;
-- ═══════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- La publication esiste di default sui progetti Supabase; se manca
  -- (self-hosted minimale) la creiamo vuota.
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- appointments
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'appointments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
  END IF;

  -- operator_unavailability (ferie/malattia: se un collega si segna
  -- assente, l'agenda degli altri lo mostra subito)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'operator_unavailability')
     AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'operator_unavailability'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.operator_unavailability;
  END IF;
END $$;

-- REPLICA IDENTITY FULL: payload "old" completo su UPDATE/DELETE.
ALTER TABLE public.appointments REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'operator_unavailability') THEN
    ALTER TABLE public.operator_unavailability REPLICA IDENTITY FULL;
  END IF;
END $$;
