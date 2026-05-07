// ═══════════════════════════════════════════════════════════════════════
// scripts/_lib.ts
// ═══════════════════════════════════════════════════════════════════════
// Helper condiviso da db-status.ts e db-migrate.ts.
// Carica le credenziali Supabase, legge la cartella migrations/,
// calcola hash, gestisce connessione.
//
// SICUREZZA:
// Questi script usano SUPABASE_SERVICE_ROLE_KEY (bypassa RLS).
// Vanno eseguiti SOLO da te, in locale, con le env var del .env.local.
// MAI da una pipeline o da un client.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ─── Colors per output terminale ──────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

export const colors = C;

// ─── Carica .env.local manualmente ────────────────────────────────────
// (Non vogliamo dipendere da dotenv: lo facciamo a mano, è banale)
function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// ─── Crea client Supabase admin ───────────────────────────────────────
export function createAdminClient(): SupabaseClient {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      `${C.red}❌ Configurazione mancante.${C.reset}\n` +
        `Servono in .env.local:\n` +
        `  NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co\n` +
        `  SUPABASE_SERVICE_ROLE_KEY=eyJ...\n`
    );
    process.exit(1);
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Lista migration nel filesystem ───────────────────────────────────
export type FsMigration = {
  /** Nome senza estensione, es. "017_error_logs" */
  name: string;
  /** Path assoluto al file .sql */
  path: string;
  /** Contenuto SQL */
  sql: string;
  /** SHA-256 del contenuto */
  hash: string;
};

export function listFilesystemMigrations(): FsMigration[] {
  const dir = resolve(process.cwd(), "migrations");
  if (!existsSync(dir)) {
    console.error(`${C.red}❌ Cartella migrations/ non trovata.${C.reset}`);
    process.exit(1);
  }

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => /^\d{3}_/.test(f)) // solo NNN_*.sql
    .sort();

  return files.map((file) => {
    const path = join(dir, file);
    const sql = readFileSync(path, "utf-8");
    const name = file.replace(/\.sql$/, "");
    const hash = createHash("sha256").update(sql).digest("hex");
    return { name, path, sql, hash };
  });
}

// ─── Lista migration registrate nel DB ────────────────────────────────
export type DbMigration = {
  name: string;
  content_hash: string;
  applied_at: string;
  duration_ms: number | null;
  applied_by: string | null;
};

export async function listDatabaseMigrations(
  db: SupabaseClient
): Promise<DbMigration[]> {
  const { data, error } = await db
    .from("schema_migrations")
    .select("name, content_hash, applied_at, duration_ms, applied_by")
    .order("name", { ascending: true });

  if (error) {
    // Se la tabella non esiste ancora (prima della 018), restituiamo vuoto
    // così `db:status` mostra tutto come pending e l'utente sa che deve
    // applicare la 018 per primo.
    if (error.message.includes("schema_migrations") || error.code === "42P01") {
      return [];
    }
    throw error;
  }

  return (data ?? []) as DbMigration[];
}
