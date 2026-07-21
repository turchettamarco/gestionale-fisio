-- 063: richiami pazienti dormienti.
-- last_recall_at: quando è stato contattato l'ultima volta per un richiamo,
-- così la lista "da richiamare" non ripropone chi hai già sentito da poco
-- e il dato vale su tutti i dispositivi.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_recall_at TIMESTAMPTZ;
