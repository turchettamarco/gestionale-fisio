// ═══════════════════════════════════════════════════════════════════════
// scripts/db-status.ts
// ═══════════════════════════════════════════════════════════════════════
// Mostra lo stato delle migration:
//  - Quali sono già live (applicate)
//  - Quali sono pending (da applicare)
//  - Quali sono state modificate dopo l'applicazione (warning sull'hash)
//
// USO:
//   npm run db:status
// ═══════════════════════════════════════════════════════════════════════

import {
  colors as C,
  createAdminClient,
  listFilesystemMigrations,
  listDatabaseMigrations,
} from "./_lib";

async function main() {
  console.log(`${C.bold}${C.cyan}\n📊 Stato migrazioni schema${C.reset}\n`);

  const db = createAdminClient();
  const fsList = listFilesystemMigrations();
  const dbList = await listDatabaseMigrations(db);

  if (fsList.length === 0) {
    console.log(`${C.yellow}⚠ Nessun file .sql trovato in migrations/${C.reset}`);
    return;
  }

  const dbByName = new Map(dbList.map((m) => [m.name, m]));

  let appliedCount = 0;
  let pendingCount = 0;
  let warningCount = 0;

  for (const fs of fsList) {
    const dbRow = dbByName.get(fs.name);

    if (!dbRow) {
      // Pending
      console.log(
        `${C.yellow}⏳ ${fs.name.padEnd(32)} PENDING${C.reset}`
      );
      pendingCount++;
      continue;
    }

    // Applicata. Verifica hash.
    if (dbRow.content_hash === "bootstrap") {
      // Migrazioni applicate prima dell'introduzione del tracking (mig 018).
      // Hash non disponibile, mostriamo un'icona "ℹ".
      console.log(
        `${C.blue}ℹ️  ${fs.name.padEnd(32)}${C.reset} ${C.dim}bootstrap (pre-tracking)${C.reset}`
      );
      appliedCount++;
      continue;
    }

    if (dbRow.content_hash !== fs.hash) {
      // File modificato dopo applicazione: warning
      console.log(
        `${C.red}⚠️  ${fs.name.padEnd(32)} HASH MISMATCH${C.reset} ${C.dim}(file modificato dopo apply)${C.reset}`
      );
      warningCount++;
      appliedCount++;
      continue;
    }

    // Tutto a posto
    const date = new Date(dbRow.applied_at).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const dur = dbRow.duration_ms
      ? `${dbRow.duration_ms}ms`
      : C.dim + "—" + C.reset;
    console.log(
      `${C.green}✅ ${fs.name.padEnd(32)}${C.reset} applicata ${date} ${C.dim}(${dur})${C.reset}`
    );
    appliedCount++;
  }

  // Riepilogo
  console.log("");
  if (pendingCount === 0 && warningCount === 0) {
    console.log(`${C.green}✓ Tutte le ${appliedCount} migration sono live. Nessuna pending.${C.reset}\n`);
  } else {
    if (pendingCount > 0) {
      console.log(
        `${C.yellow}${pendingCount} migration ${pendingCount === 1 ? "pending" : "pending"}.${C.reset} ` +
          `Esegui ${C.bold}npm run db:migrate${C.reset} per applicarle.`
      );
    }
    if (warningCount > 0) {
      console.log(
        `${C.red}⚠ ${warningCount} migration con hash diverso${C.reset} dal file. ` +
          `Probabilmente hai modificato un file SQL già applicato. Verifica manualmente.`
      );
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error(`${C.red}❌ Errore:${C.reset}`, err.message ?? err);
  process.exit(1);
});
