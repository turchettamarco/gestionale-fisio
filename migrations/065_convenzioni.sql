-- ═══════════════════════════════════════════════════════════════════════
-- 065: Convenzioni / enti (modulo opzionale, spento di default)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Gestione di fondi sanitari, casse e assicurazioni con cui lo studio è
-- convenzionato: anagrafica enti, listino per ente e marcatura degli
-- appuntamenti erogati in convenzione.
--
-- NOTA SUL MODELLO: ci si accredita con la RETE (Previmedical, UniSalute,
-- Blue Assistance…), non col singolo fondo. Per questo l'ente ha un campo
-- `network_name`: quando il paziente dice "ho Metasalute", si sa che la
-- pratica passa da Previmedical.

-- Feature flag: il modulo compare solo se acceso dalle Impostazioni.
ALTER TABLE studios ADD COLUMN IF NOT EXISTS convenzioni_enabled boolean NOT NULL DEFAULT false;

-- ── Anagrafica enti ──
CREATE TABLE IF NOT EXISTS convenzioni_enti (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id         uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  name              text NOT NULL,
  kind              text NOT NULL DEFAULT 'fondo',   -- rete | fondo | cassa | assicurazione | mutua
  network_name      text,        -- rete che gestisce le pratiche
  accreditation_url text,        -- pagina per accreditarsi
  site_url          text,
  contact_email     text,
  contact_phone     text,
  notes             text,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conv_enti_studio ON convenzioni_enti(studio_id);

-- ── Listino per ente: prestazione → quanto paga l'ente, quanto il paziente ──
CREATE TABLE IF NOT EXISTS convenzioni_tariffe (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id      uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  ente_id        uuid NOT NULL REFERENCES convenzioni_enti(id) ON DELETE CASCADE,
  prestazione    text NOT NULL,
  tariffa_ente   numeric(10,2),
  quota_paziente numeric(10,2),
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conv_tariffe_ente ON convenzioni_tariffe(ente_id);

-- ── Marcatura sull'appuntamento ──
-- auth_code: senza il numero di autorizzazione la rete può respingere la
-- pratica. auth_expires: le autorizzazioni scadono, un ciclo lungo rischia
-- di sforare → avviso in agenda.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS convenzione_ente_id   uuid REFERENCES convenzioni_enti(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS convenzione_auth_code text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS convenzione_auth_expires date;
CREATE INDEX IF NOT EXISTS idx_appt_conv_ente ON appointments(convenzione_ente_id);

-- ── RLS (idempotente) ──
ALTER TABLE convenzioni_enti    ENABLE ROW LEVEL SECURITY;
ALTER TABLE convenzioni_tariffe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conv_enti_all ON convenzioni_enti;
CREATE POLICY conv_enti_all ON convenzioni_enti
  FOR ALL USING (studio_id IN (SELECT my_studios()))
  WITH CHECK (studio_id IN (SELECT my_studios()));

DROP POLICY IF EXISTS conv_tariffe_all ON convenzioni_tariffe;
CREATE POLICY conv_tariffe_all ON convenzioni_tariffe
  FOR ALL USING (studio_id IN (SELECT my_studios()))
  WITH CHECK (studio_id IN (SELECT my_studios()));
