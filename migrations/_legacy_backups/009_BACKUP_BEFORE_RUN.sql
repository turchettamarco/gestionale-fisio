-- ═══════════════════════════════════════════════════════════════════════
-- BACKUP delle RLS policies prima della migration 009
-- ═══════════════════════════════════════════════════════════════════════
--
-- ESEGUI QUESTA QUERY PRIMA DI APPLICARE 009_security_hardening.sql.
-- Salva in un file di testo l'output. Se qualcosa va storto puoi
-- ricreare manualmente le policy che vuoi ripristinare.
--
-- COME USARLO:
-- 1. Esegui questa query nel SQL Editor di Supabase
-- 2. Vedrai N righe (una per policy esistente)
-- 3. Per ogni riga, troverai il comando CREATE POLICY pronto da rieseguire
-- 4. Salva l'output in un file di testo locale come backup_rls_DATA.txt
--
-- ═══════════════════════════════════════════════════════════════════════

SELECT
  'DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON ' || quote_ident(schemaname) || '.' || quote_ident(tablename) || ';' AS drop_statement,
  'CREATE POLICY ' || quote_ident(policyname) || ' ON ' || quote_ident(schemaname) || '.' || quote_ident(tablename)
    || ' AS ' || CASE WHEN permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END
    || ' FOR ' || cmd
    || ' TO ' || array_to_string(roles, ', ')
    || COALESCE(' USING (' || qual || ')', '')
    || COALESCE(' WITH CHECK (' || with_check || ')', '')
    || ';' AS recreate_statement
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
