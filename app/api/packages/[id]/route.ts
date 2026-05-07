// app/api/packages/[id]/route.ts
// ═══════════════════════════════════════════════════════════════════════
//   GET    /api/packages/[id]   → dettaglio + storico versamenti
//   PATCH  /api/packages/[id]   → modifica campi pacchetto
//   DELETE /api/packages/[id]   → elimina (solo se nessuna seduta consumata)
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";
import {
  getPackageEnriched,
  listPackagePayments,
  autoUpdatePackageStatus,
} from "@/src/lib/packages/queries";
import type {
  UpdatePackageInput,
  PackageStatus,
} from "@/src/lib/packages/types";

const VALID_STATUSES: PackageStatus[] = [
  "active",
  "completed",
  "expired",
  "refunded",
  "cancelled",
];

// ─── GET: dettaglio + storico versamenti ───────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const pkg = await getPackageEnriched(supabase, id);
    if (!pkg) {
      return NextResponse.json(
        { error: "Pacchetto non trovato" },
        { status: 404 }
      );
    }

    const payments = await listPackagePayments(supabase, id);

    return NextResponse.json({ package: pkg, payments });
  } catch (err) {
    console.error("[packages/[id] GET]", err);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

// ─── PATCH: modifica pacchetto ─────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    let body: UpdatePackageInput;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Body JSON non valido" },
        { status: 400 }
      );
    }

    // Costruisco un oggetto update con solo i campi presenti e validi
    const update: Record<string, unknown> = {};

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        return NextResponse.json(
          { error: "title non valido" },
          { status: 400 }
        );
      }
      update.title = body.title.trim();
    }
    if (body.notes !== undefined) update.notes = body.notes;
    if (body.total_sessions !== undefined) {
      if (
        body.total_sessions !== null &&
        (typeof body.total_sessions !== "number" || body.total_sessions <= 0)
      ) {
        return NextResponse.json(
          { error: "total_sessions non valido" },
          { status: 400 }
        );
      }
      update.total_sessions = body.total_sessions;
    }
    if (body.total_amount_cents !== undefined) {
      if (
        typeof body.total_amount_cents !== "number" ||
        body.total_amount_cents < 0
      ) {
        return NextResponse.json(
          { error: "total_amount_cents non valido" },
          { status: 400 }
        );
      }
      update.total_amount_cents = body.total_amount_cents;
    }
    if (body.default_payment_method !== undefined) {
      update.default_payment_method = body.default_payment_method;
    }
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { error: "status non valido" },
          { status: 400 }
        );
      }
      update.status = body.status;
    }
    if (body.starts_at !== undefined) update.starts_at = body.starts_at;
    if (body.expires_at !== undefined) update.expires_at = body.expires_at;

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "Nessun campo da aggiornare" },
        { status: 400 }
      );
    }

    const { error: updateErr } = await supabase
      .from("patient_packages")
      .update(update)
      .eq("id", id);

    if (updateErr) {
      console.error("[packages/[id] PATCH] update error:", updateErr.message);
      return NextResponse.json(
        { error: "Errore aggiornamento" },
        { status: 500 }
      );
    }

    // Se ho cambiato totale o numero sedute, lo status potrebbe dover cambiare
    await autoUpdatePackageStatus(supabase, id);

    const updated = await getPackageEnriched(supabase, id);
    return NextResponse.json({ package: updated });
  } catch (err) {
    console.error("[packages/[id] PATCH]", err);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

// ─── DELETE: elimina pacchetto ─────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    // Blocca delete se ci sono sedute già consumate (escluse cancelled)
    const { count: usedCount } = await supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("package_id", id)
      .neq("status", "cancelled");

    if ((usedCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "Impossibile eliminare: il pacchetto ha sedute già consumate. " +
            "Cambia lo status in 'cancelled' o 'refunded' invece.",
        },
        { status: 409 }
      );
    }

    // Elimina pacchetto. CASCADE su package_payments → si cancellano anche i versamenti.
    const { error: delErr } = await supabase
      .from("patient_packages")
      .delete()
      .eq("id", id);

    if (delErr) {
      console.error("[packages/[id] DELETE]", delErr.message);
      return NextResponse.json(
        { error: "Errore eliminazione" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[packages/[id] DELETE]", err);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
