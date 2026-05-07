// ═══════════════════════════════════════════════════════════════════════
// src/lib/logger.ts
// ═══════════════════════════════════════════════════════════════════════
// Logging strutturato per FisioHub.
//
// USO TIPICO:
//   import { logger } from "@/src/lib/logger";
//
//   try {
//     await loadPatients();
//   } catch (err) {
//     logger.error("Errore caricamento pazienti", err, {
//       action: "load_patients",
//     });
//   }
//
//   logger.warn("Fetch lenta", { duration_ms: 5400, fetch_url: "/api/calendar" });
//
// CARATTERISTICHE:
// - Inserisce in error_logs (mig. 017)
// - Sanitizza context per non spedire PII (email, telefoni, codici fiscali)
// - Rate-limita errori ripetuti (1 evento per fingerprint ogni 5 min)
// - Fail-safe: se il logging fallisce, l'app continua (console fallback)
// - Funziona sia client (browser) che server (route handlers)
//
// CONFIGURAZIONE STUDIO:
// Il logger ottiene studio_id chiamando setLoggerStudioId() dal
// StudioContext quando lo studio viene caricato. Se non è ancora caricato,
// gli errori si loggano comunque ma con studio_id NULL.
// ═══════════════════════════════════════════════════════════════════════

import { supabase } from "./supabaseClient";

// ─── Tipi ──────────────────────────────────────────────────────────────
type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
type LogSource = "client" | "server" | "cron" | "webhook";

export interface LogContext {
  fetch_url?: string;
  fetch_status?: number;
  duration_ms?: number;
  retry_count?: number;
  resource_id?: string;
  resource_type?: string;
  action?: string;
  [key: string]: unknown;
}

// ─── Configurazione ────────────────────────────────────────────────────
const STACK_MAX_LENGTH = 4000;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const ON_FAILURE_CONSOLE_FALLBACK = true;

// ─── Studio corrente (popolato dal StudioContext) ─────────────────────
let _currentStudioId: string | null = null;

export function setLoggerStudioId(studioId: string | null): void {
  _currentStudioId = studioId;
}

// ─── Stato in-memory per rate-limiting ────────────────────────────────
const recentFingerprints = new Map<string, number>();

function isRateLimited(fingerprint: string): boolean {
  const now = Date.now();
  const lastSent = recentFingerprints.get(fingerprint);
  if (lastSent && now - lastSent < RATE_LIMIT_WINDOW_MS) {
    return true;
  }
  recentFingerprints.set(fingerprint, now);
  if (recentFingerprints.size > 200) {
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    for (const [k, t] of recentFingerprints.entries()) {
      if (t < cutoff) recentFingerprints.delete(k);
    }
  }
  return false;
}

// ─── Hash semplice (FNV-1a) per generare fingerprint ──────────────────
function hashString(s: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function makeFingerprint(
  message: string,
  errorName: string | undefined,
  url: string | undefined
): string {
  return hashString(`${errorName ?? ""}::${message}::${url ?? ""}`);
}

// ─── Sanitizzazione PII ────────────────────────────────────────────────
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /\b(?:\+?39\s*)?(?:3\d{2})\s*\d{6,7}\b/g;
const CF_RE = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g;

function sanitizeString(s: string): string {
  return s
    .replace(EMAIL_RE, "[email]")
    .replace(PHONE_RE, "[phone]")
    .replace(CF_RE, "[cf]");
}

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "auth",
  "first_name",
  "last_name",
  "name",
  "patient_name",
  "phone",
  "email",
  "tax_code",
  "codice_fiscale",
]);

function sanitizeContext(input: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth_limit]";
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return sanitizeString(input);
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (Array.isArray(input)) {
    return input.slice(0, 50).map((v) => sanitizeContext(v, depth + 1));
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = "[redacted]";
      } else {
        out[k] = sanitizeContext(v, depth + 1);
      }
    }
    return out;
  }
  return String(input);
}

// ─── Estrazione info dall'errore ───────────────────────────────────────
function extractErrorInfo(err: unknown): {
  message: string;
  name: string;
  stack: string | null;
} {
  if (err instanceof Error) {
    return {
      message: err.message || err.name || "Unknown error",
      name: err.name || "Error",
      stack: (err.stack ?? "").slice(0, STACK_MAX_LENGTH) || null,
    };
  }
  if (typeof err === "string") {
    return { message: err, name: "StringError", stack: null };
  }
  try {
    return {
      message: JSON.stringify(err),
      name: "UnknownError",
      stack: null,
    };
  } catch {
    return { message: "Non-serializable error", name: "UnknownError", stack: null };
  }
}

async function resolveUserId(): Promise<string | null> {
  try {
    if (typeof window === "undefined") return null;
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Funzione core: invia un log al DB ─────────────────────────────────
async function sendLog(
  level: LogLevel,
  message: string,
  err: unknown,
  context: LogContext | undefined,
  source: LogSource
): Promise<void> {
  try {
    const { message: errMsg, name: errName, stack } = err
      ? extractErrorInfo(err)
      : { message: message, name: "ManualLog", stack: null };

    const finalMessage = err ? `${message}: ${errMsg}` : message;

    const url =
      typeof window !== "undefined" ? window.location.pathname : undefined;

    const fingerprint = makeFingerprint(finalMessage, errName, url);

    if (isRateLimited(fingerprint)) {
      if (typeof window !== "undefined") {
        // eslint-disable-next-line no-console
        console.warn("[logger] rate-limited:", finalMessage);
      }
      return;
    }

    const user_id = await resolveUserId();
    const sanitizedContext = context ? sanitizeContext(context) : null;
    const userAgent =
      typeof navigator !== "undefined" ? navigator.userAgent : null;

    const payload = {
      user_id,
      studio_id: _currentStudioId,
      level,
      message: sanitizeString(finalMessage).slice(0, 2000),
      error_name: errName.slice(0, 200),
      stack,
      source,
      url: url ?? null,
      user_agent: userAgent ? userAgent.slice(0, 500) : null,
      context: sanitizedContext,
      fingerprint,
      occurred_at: new Date().toISOString(),
    };

    const { error: insertErr } = await supabase
      .from("error_logs")
      .insert(payload);

    if (insertErr && ON_FAILURE_CONSOLE_FALLBACK) {
      // eslint-disable-next-line no-console
      console.error("[logger] failed to log to DB:", insertErr.message);
      // eslint-disable-next-line no-console
      console.error("[logger] original error was:", finalMessage);
    }
  } catch (loggerError) {
    if (ON_FAILURE_CONSOLE_FALLBACK) {
      // eslint-disable-next-line no-console
      console.error("[logger] internal failure:", loggerError);
    }
  }
}

function detectSource(): LogSource {
  return typeof window === "undefined" ? "server" : "client";
}

// ─── API pubblica ──────────────────────────────────────────────────────
export const logger = {
  error(message: string, err?: unknown, context?: LogContext) {
    void sendLog("error", message, err, context, detectSource());
  },
  warn(message: string, context?: LogContext) {
    void sendLog("warn", message, null, context, detectSource());
  },
  info(message: string, context?: LogContext) {
    void sendLog("info", message, null, context, detectSource());
  },
  fatal(message: string, err?: unknown, context?: LogContext) {
    void sendLog("fatal", message, err, context, detectSource());
  },
};

// ─── Helper: fetch con auto-logging ────────────────────────────────────
export async function fetchWithLogging(
  input: RequestInfo | URL,
  init?: RequestInit & { action?: string }
): Promise<Response> {
  const action = init?.action;
  const url = typeof input === "string" ? input : input.toString();
  const startedAt = Date.now();

  try {
    const response = await fetch(input, init);
    const duration_ms = Date.now() - startedAt;

    if (response.status >= 500) {
      logger.error(`Server error ${response.status}`, undefined, {
        fetch_url: url,
        fetch_status: response.status,
        duration_ms,
        action,
      });
    } else if (duration_ms > 10_000) {
      logger.warn("Fetch lenta", {
        fetch_url: url,
        fetch_status: response.status,
        duration_ms,
        action,
      });
    }

    return response;
  } catch (err) {
    const duration_ms = Date.now() - startedAt;
    logger.error("Fetch fallita", err, {
      fetch_url: url,
      duration_ms,
      action,
    });
    throw err;
  }
}
