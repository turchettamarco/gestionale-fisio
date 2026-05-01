// app/api/calendar-token/route.ts
//
// POST /api/calendar-token/rotate
//
// Rigenera il token UUID per il feed iCal dello studio dell'utente loggato.
// Da usare quando l'URL precedente è stato compromesso/condiviso per sbaglio.
//
// AUTENTICAZIONE:
// L'utente deve passare il proprio access token Supabase nell'header
// Authorization: Bearer <token>. L'endpoint verifica che l'utente sia
// membro di uno studio prima di consentire la rotazione.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Configurazione mancante: SUPABASE_SERVICE_ROLE_KEY richiesta");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// GET: ritorna il token corrente dello studio dell'utente
export async function GET(req: NextRequest) {
  return handleRequest(req, false);
}

// POST: rigenera il token (rotazione)
export async function POST(req: NextRequest) {
  return handleRequest(req, true);
}

async function handleRequest(req: NextRequest, rotate: boolean) {
  try {
    // ─── 1. Estrai access token dall'header Authorization ─────────────────
    const authHeader = req.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!accessToken) {
      return NextResponse.json(
        { error: "Autenticazione richiesta" },
        { status: 401 }
      );
    }

    // ─── 2. Verifica utente con il token fornito ──────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: "Configurazione mancante" }, { status: 500 });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser(accessToken);
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Sessione non valida" }, { status: 401 });
    }
    const userId = userData.user.id;

    // ─── 3. Trova lo studio dell'utente (via studio_members) ──────────────
    const db = getAdmin();
    const { data: member, error: memberErr } = await db
      .from("studio_members")
      .select("studio_id, role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (memberErr || !member) {
      return NextResponse.json(
        { error: "Nessuno studio associato all'utente" },
        { status: 403 }
      );
    }

    // ─── 4. Esegui l'operazione richiesta ─────────────────────────────────
    if (rotate) {
      // POST → genera nuovo UUID e aggiorna lo studio
      const newToken = randomUUID();
      const { error: updErr } = await db
        .from("studios")
        .update({ calendar_feed_token: newToken })
        .eq("id", member.studio_id);

      if (updErr) {
        console.error("[calendar-token] Errore update:", updErr.message);
        return NextResponse.json({ error: "Errore aggiornamento token" }, { status: 500 });
      }

      return NextResponse.json({ token: newToken, rotated: true });
    } else {
      // GET → leggi il token attuale
      const { data: studio, error: studioErr } = await db
        .from("studios")
        .select("calendar_feed_token")
        .eq("id", member.studio_id)
        .maybeSingle();

      if (studioErr || !studio) {
        return NextResponse.json({ error: "Studio non trovato" }, { status: 404 });
      }

      return NextResponse.json({ token: studio.calendar_feed_token });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "errore sconosciuto";
    console.error("[calendar-token] Errore:", msg);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
