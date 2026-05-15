/*
 * scripts/db-rehash.ts
 * ════════════════════════════════════════════════════════════════════════
 * Script una-tantum per riallineare il content_hash di migration
 * applicate manualmente (via SQL editor Supabase) ai file fisici nel
 * repo.
 *
 * USO:
 *   npm run db:rehash
 *
 * Cosa fa:
 * 1) Per ogni file in migrations/, calcola lo SHA-256
 * 2) Confronta con il content_hash nel DB
 * 3) Aggiorna le righe con content_hash="manual-…" o "bootstrap" all'hash
 *    reale del file. NON tocca le righe con un hash già reale.
 *
 * Dopo l'esecuzione, "npm run db:status" mostrerà tutte le righe come
 * ✅ applicate, senza warning HASH MISMATCH.
 * ════════════════════════════════════════════════════════════════════════
 */

import {
  createAdminClient,
  listDatabaseMigrations,
  listFilesystemMigrations,
  colors as C,
} from "./_lib";

async function main() {
  console.log(`${C.bold}📋 Riallineamento hash migrations${C.reset}\n`);

  const db = createAdminClient();
  const fsRows = listFilesystemMigrations();
  const dbRows = await listDatabaseMigrations(db);
  const dbByName = new Map(dbRows.map((r) => [r.name, r]));

  const updates: { name: string; oldHash: string; newHash: string }[] = [];

  for (const fs of fsRows) {
    const dbRow = dbByName.get(fs.name);
    if (!dbRow) {
      console.log(
        `${C.yellow}⚠️  ${fs.name.padEnd(34)}${C.reset} non nel DB (pending — lancia ${C.bold}npm run db:migrate${C.reset})`
      );
      continue;
    }

    if (dbRow.content_hash === fs.hash) {
      console.log(`${C.green}✅ ${fs.name.padEnd(34)}${C.reset} ${C.dim}hash già allineato${C.reset}`);
      continue;
    }

    if (dbRow.content_hash === "bootstrap" || dbRow.content_hash.startsWith("manual-")) {
      console.log(
        `${C.blue}🔧 ${fs.name.padEnd(34)}${C.reset} ${C.dim}${dbRow.content_hash} → ${fs.hash.slice(0, 12)}…${C.reset}`
      );
      updates.push({ name: fs.name, oldHash: dbRow.content_hash, newHash: fs.hash });
      continue;
    }

    // Hash diverso ma non bootstrap/manual → file modificato dopo apply
    console.log(
      `${C.red}⚠️  ${fs.name.padEnd(34)}${C.reset} hash file diverso da DB (file modificato dopo apply) — SKIP, sistemare manualmente`
    );
  }

  if (updates.length === 0) {
    console.log(`\n${C.green}✓ Tutti gli hash sono già allineati. Nessuna azione necessaria.${C.reset}\n`);
    return;
  }

  console.log(`\n${C.bold}📝 ${updates.length} hash da aggiornare. Eseguo gli UPDATE...${C.reset}\n`);

  for (const u of updates) {
    const { error } = await db
      .from("schema_migrations")
      .update({ content_hash: u.newHash })
      .eq("name", u.name);
    if (error) {
      console.error(`${C.red}❌ ${u.name}: ${error.message}${C.reset}`);
    } else {
      console.log(`${C.green}✅ ${u.name}${C.reset} aggiornato`);
    }
  }

  console.log(`\n${C.green}✓ Riallineamento completato.${C.reset} Lancia ${C.bold}npm run db:status${C.reset} per verificare.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
