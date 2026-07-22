-- ═══════════════════════════════════════════════════════════════════════
-- 066 — Soft-delete per i pazienti PAI (Domicili Cooperative)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Prima l'eliminazione di un PAI era un DELETE fisico irreversibile.
-- Ora: deleted_at valorizzato = "nel cestino", ripristinabile dal
-- pannello "PAI cancellati". Gli accessi restano al loro posto: al
-- ripristino il paziente ritrova tutto il suo calendario.
-- Il DELETE fisico resta possibile solo da "Elimina per sempre".

ALTER TABLE coop_patients
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

-- Le liste operative filtrano deleted_at IS NULL: index parziale mirato.
CREATE INDEX IF NOT EXISTS idx_coop_patients_active
  ON coop_patients (studio_id, cognome)
  WHERE deleted_at IS NULL;
