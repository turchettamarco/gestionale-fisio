// ═══════════════════════════════════════════════════════════════════════
// scripts/db-migrate.ts
// ═══════════════════════════════════════════════════════════════════════
// Applica le migration pending in ordine alfabetico.
// Per ogni migration:
//   1. Esegue il contenuto SQL via RPC
//   2. Registra in schema_migrations (nome, hash, durata)
// Si ferma alla prima che fallisce, lasciando lo stato consistente.
//
// USO:
//   npm run db:migrate         (chiede conferma prima di applicare)
//   npm run db:migrate -- -y   (applica senza chiedere conferma)
//
// IMPORTANTE:
// Supabase non espone direttamente "esegui SQL arbitrario" via API per
// motivi di sicurezza. Per applicare migration multi-statement serve una
// FUNCTION SQL custom (vedi sotto).
// SETUP UNA TANTUM da fare nel SQL Editor di Supabase:
//
//   CREATE OR REPLACE FUNCTION exec_migration_sql(sql_text TEXT)
//   RETURNS VOID
//   LANGUAGE plpgsql
//   SECURITY DEFINER
//   AS $$
//   BEGIN
//     EXECUTE sql_text;
//   END;
//   $$;
//
//   REVOKE ALL ON FUNCTION exec_migration_sql(TEXT) FROM PUBLIC;
//   -- Solo service_role può chiamarla (default per le function SECURITY DEFINER
//   -- non concesse esplicitamente a 'anon' o 'authenticated')
//
// In alternativa, se non vuoi creare la function, puoi continuare ad
// applicare le migration manualmente nel SQL Editor e usare solo
// `npm run db:status` per il monitoraggio.
// ═══════════════════════════════════════════════════════════════════════

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  colors as C,
  createAdminClient,
  listFilesystemMigrations,
  listDatabaseMigrations,
} from "./_lib";

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  const answer = await rl.question(`${question} ${C.dim}(s/n)${C.reset} `);
  rl.close();
  return /^s|si|y|yes$/i.test(answer.trim());
}

async function main() {
  const skipConfirm = process.argv.includes("-y") || process.argv.includes("--yes");

  console.log(`${C.bold}${C.cyan}\n🚀 Migration runner${C.reset}\n`);

  const db = createAdminClient();
  const fsList = listFilesystemMigrations();
  const dbList = await listDatabaseMigrations(db);
  const dbNames = new Set(dbList.map((m) => m.name));

  // Filtra solo le pending
  const pending = fsList.filter((m) => !dbNames.has(m.name));

  if (pending.length === 0) {
    console.log(`${C.green}✓ Nessuna migration pending. Tutto live.${C.reset}\n`);
    return;
  }

  console.log(
    `${C.yellow}${pending.length} migration da applicare:${C.reset}`
  );
  for (const m of pending) {
    console.log(`  ${C.dim}—${C.reset} ${m.name}`);
  }
  console.log("");

  if (!skipConfirm) {
    const ok = await confirm("Procedere?");
    if (!ok) {
      console.log(`${C.dim}Annullato.${C.reset}\n`);
      return;
    }
    console.log("");
  }

  // Applica una alla volta
  let applied = 0;
  for (const m of pending) {
    process.stdout.write(`${C.cyan}⏳${C.reset} ${m.name}... `);
    const start = Date.now();

    try {
      // Esegue tramite la function exec_migration_sql (vedi commento in testa).
      const { error } = await db.rpc("exec_migration_sql", {
        sql_text: m.sql,
      });

      if (error) {
        // Fallback: la function non esiste o ha fallito. Mostra istruzioni.
        if (
          error.message.includes("exec_migration_sql") ||
          error.code === "42883" // function does not exist
        ) {
          console.log(`${C.red}KO${C.reset}\n`);
          console.error(
            `${C.red}❌ La function exec_migration_sql non esiste su Supabase.${C.reset}\n`
          );
          console.error(`Crea la function una tantum nel SQL Editor:\n`);
          console.error(C.dim);
          console.error(`  CREATE OR REPLACE FUNCTION exec_migration_sql(sql_text TEXT)`);
          console.error(`  RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER`);
          console.error(`  AS $$ BEGIN EXECUTE sql_text; END; $$;`);
          console.error(`  REVOKE ALL ON FUNCTION exec_migration_sql(TEXT) FROM PUBLIC;`);
          console.error(C.reset);
          console.error(
            `In alternativa, applica le migration manualmente nel SQL Editor di Supabase\n` +
              `e poi registrale eseguendo: npm run db:status (mostra lo stato)\n`
          );
          process.exit(1);
        }

        // Errore SQL vero proprio
        throw error;
      }

      const duration_ms = Date.now() - start;

      // Registra in schema_migrations
      const { error: regErr } = await db.from("schema_migrations").insert({
        name: m.name,
        content_hash: m.hash,
        duration_ms,
        applied_by: process.env.USER || process.env.USERNAME || null,
      });

      if (regErr) {
        // La migration è andata a buon fine ma non riusciamo a registrarla.
        // Stato problematico: avvertiamo e fermiamo.
        console.log(`${C.yellow}APPLICATA ma non registrata${C.reset}`);
        console.error(
          `${C.red}⚠ La migration ${m.name} è stata applicata, ma non sono riuscito a registrarla.${C.reset}\n` +
            `Errore: ${regErr.message}\n` +
            `Inseriscila a mano in schema_migrations:\n` +
            `  INSERT INTO schema_migrations (name, content_hash, duration_ms) VALUES\n` +
            `    ('${m.name}', '${m.hash}', ${duration_ms});\n`
        );
        process.exit(1);
      }

      console.log(`${C.green}OK${C.reset} ${C.dim}(${duration_ms}ms)${C.reset}`);
      applied++;
    } catch (err) {
      // Gli errori Supabase NON sono instanceof Error: sono oggetti
      // { message, code, details, hint }. Per stamparli leggibili dobbiamo
      // gestire entrambi i casi.
      const e = err as any;
      const message =
        err instanceof Error
          ? err.message
          : e?.message
              ? `${e.message}${e.code ? ` [${e.code}]` : ""}${e.details ? `\n   Details: ${e.details}` : ""}${e.hint ? `\n   Hint: ${e.hint}` : ""}`
              : JSON.stringify(err, null, 2);
      console.log(`${C.red}KO${C.reset}\n`);
      console.error(`${C.red}❌ Migration ${m.name} fallita:${C.reset}`);
      console.error(`   ${message}\n`);
      console.error(`Le migration successive non sono state applicate. Stato attuale:`);
      console.error(`  ${applied}/${pending.length} applicate, restano ${pending.length - applied}.`);
      console.error(`Sistema il problema e rilancia ${C.bold}npm run db:migrate${C.reset}.\n`);
      process.exit(1);
    }
  }

  console.log("");
  console.log(`${C.green}✓ ${applied} migration applicate con successo.${C.reset}\n`);
}

main().catch((err) => {
  console.error(`${C.red}❌ Errore:${C.reset}`, err.message ?? err);
  process.exit(1);
});
