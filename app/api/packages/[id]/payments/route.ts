// app/api/packages/[id]/payments/route.ts
// ═══════════════════════════════════════════════════════════════════════
//   POST /api/packages/[id]/payments  → aggiungi versamento (acconto/saldo/rata)
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";
import { autoUpdatePackageStatus } from "@/src/lib/packages/queries";
import type { PaymentMethod } from "@/src/lib/packages/types";

const VALID_METHODS: PaymentMethod[] = ["cash", "pos", "bank_transfer"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: packageId } = await params;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    let body: {
      amount_cents?: number;
      payment_method?: string;
      paid_at?: string;
      label?: string;
      notes?: string;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Body JSON non valido" },
        { status: 400 }
      );
    }

    // ─── Validazione ───────────────────────────────────────────────────
    if (
      typeof body.amount_cents !== "number" ||
      !Number.isFinite(body.amount_cents) ||
      body.amount_cents <= 0
    ) {
      return NextResponse.json(
        { error: "amount_cents deve essere > 0" },
        { status: 400 }
      );
    }
    if (
      !body.payment_method ||
      !VALID_METHODS.includes(body.payment_method as PaymentMethod)
    ) {
      return NextResponse.json(
        { error: "payment_method non valido (cash | pos | bank_transfer)" },
        { status: 400 }
      );
    }

    // ─── Recupero pacchetto per ottenere studio_id e verificare stato ──
    const { data: pkg, error: pkgErr } = await supabase
      .from("patient_packages")
      .select("id, studio_id, status")
      .eq("id", packageId)
      .maybeSingle();

    if (pkgErr || !pkg) {
      return NextResponse.json(
        { error: "Pacchetto non trovato" },
        { status: 404 }
      );
    }

    const pkgRow = pkg as {
      id: string;
      studio_id: string;
      status: string;
    };

    if (pkgRow.status === "cancelled" || pkgRow.status === "refunded") {
      return NextResponse.json(
        {
          error: `Non è possibile aggiungere versamenti a un pacchetto ${pkgRow.status}`,
        },
        { status: 409 }
      );
    }

    // ─── Insert versamento ─────────────────────────────────────────────
    const { data: created, error: insertErr } = await supabase
      .from("package_payments")
      .insert({
        package_id: packageId,
        studio_id: pkgRow.studio_id,
        owner_id: user.id,
        amount_cents: body.amount_cents,
        payment_method: body.payment_method as PaymentMethod,
        paid_at: body.paid_at ?? new Date().toISOString(),
        label: body.label ?? null,
        notes: body.notes ?? null,
      })
      .select("id")
      .single();

    if (insertErr || !created) {
      console.error("[payments POST] insert error:", insertErr?.message);
      return NextResponse.json(
        { error: "Errore registrazione versamento" },
        { status: 500 }
      );
    }

    // Se il pacchetto è ora completato (sedute esaurite + pagato), aggiorna status
    await autoUpdatePackageStatus(supabase, packageId);

    return NextResponse.json(
      { id: (created as { id: string }).id },
      { status: 201 }
    );
  } catch (err) {
    console.error("[payments POST]", err);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
