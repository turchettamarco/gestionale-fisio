// app/api/packages/route.ts
// ═══════════════════════════════════════════════════════════════════════
// API pacchetti pazienti
//
//   GET  /api/packages                          → lista (filtri: patient_id, status)
//   POST /api/packages                          → crea pacchetto + eventuale acconto
//
// Auth: cookie Supabase (createSupabaseServerClient).
// Multi-tenancy: studio_id ricavato da studio_members, RLS protegge comunque.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";
import { listPackagesEnriched } from "@/src/lib/packages/queries";
import type {
  CreatePackageInput,
  PaymentMethod,
} from "@/src/lib/packages/types";

// ─── GET: lista pacchetti ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { data: member } = await supabase
      .from("studio_members")
      .select("studio_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!member) {
      return NextResponse.json({ packages: [] });
    }

    const patientId = req.nextUrl.searchParams.get("patient_id") || undefined;
    const statusParam = req.nextUrl.searchParams.get("status");
    const status: "active" | "all" =
      statusParam === "all" ? "all" : "active";

    const packages = await listPackagesEnriched(supabase, {
      studioId: (member as { studio_id: string }).studio_id,
      patientId,
      status,
    });

    return NextResponse.json({ packages });
  } catch (err) {
    console.error("[packages GET]", err);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

// ─── POST: crea pacchetto ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { data: member } = await supabase
      .from("studio_members")
      .select("studio_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!member) {
      return NextResponse.json(
        { error: "Studio non trovato" },
        { status: 403 }
      );
    }
    const studioId = (member as { studio_id: string }).studio_id;

    let body: CreatePackageInput;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Body JSON non valido" },
        { status: 400 }
      );
    }

    // ─── Validazione ───────────────────────────────────────────────────
    if (!body.patient_id || typeof body.patient_id !== "string") {
      return NextResponse.json(
        { error: "patient_id obbligatorio" },
        { status: 400 }
      );
    }
    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json(
        { error: "title obbligatorio" },
        { status: 400 }
      );
    }
    if (
      typeof body.total_amount_cents !== "number" ||
      body.total_amount_cents < 0
    ) {
      return NextResponse.json(
        { error: "total_amount_cents non valido" },
        { status: 400 }
      );
    }
    if (
      body.total_sessions !== null &&
      (typeof body.total_sessions !== "number" || body.total_sessions <= 0)
    ) {
      return NextResponse.json(
        { error: "total_sessions deve essere null o > 0" },
        { status: 400 }
      );
    }

    // Verifica che il paziente appartenga allo studio dell'utente
    const { data: patient } = await supabase
      .from("patients")
      .select("id, studio_id")
      .eq("id", body.patient_id)
      .maybeSingle();

    if (
      !patient ||
      (patient as { studio_id: string }).studio_id !== studioId
    ) {
      return NextResponse.json(
        { error: "Paziente non trovato o non autorizzato" },
        { status: 404 }
      );
    }

    // ─── Insert pacchetto ──────────────────────────────────────────────
    const { data: created, error: insertErr } = await supabase
      .from("patient_packages")
      .insert({
        studio_id: studioId,
        owner_id: user.id,
        patient_id: body.patient_id,
        title: body.title.trim(),
        notes: body.notes ?? null,
        total_sessions: body.total_sessions,
        total_amount_cents: body.total_amount_cents,
        default_payment_method: body.default_payment_method ?? null,
        starts_at: body.starts_at ?? new Date().toISOString().slice(0, 10),
        expires_at: body.expires_at ?? null,
      })
      .select("id")
      .single();

    if (insertErr || !created) {
      console.error("[packages POST] insert error:", insertErr?.message);
      return NextResponse.json(
        { error: "Errore creazione pacchetto" },
        { status: 500 }
      );
    }

    const newPackageId = (created as { id: string }).id;

    // ─── Eventuale versamento iniziale ─────────────────────────────────
    if (body.initial_payment) {
      const ip = body.initial_payment;
      if (
        typeof ip.amount_cents !== "number" ||
        ip.amount_cents <= 0 ||
        !["cash", "pos", "bank_transfer"].includes(ip.payment_method)
      ) {
        // Annullo il pacchetto appena creato per non lasciare stato sporco
        await supabase
          .from("patient_packages")
          .delete()
          .eq("id", newPackageId);
        return NextResponse.json(
          { error: "initial_payment non valido" },
          { status: 400 }
        );
      }

      const { error: payErr } = await supabase
        .from("package_payments")
        .insert({
          package_id: newPackageId,
          studio_id: studioId,
          owner_id: user.id,
          amount_cents: ip.amount_cents,
          payment_method: ip.payment_method as PaymentMethod,
          paid_at: ip.paid_at ?? new Date().toISOString(),
          label: ip.label ?? "Acconto",
        });

      if (payErr) {
        console.error(
          "[packages POST] initial_payment error:",
          payErr.message
        );
        // Pacchetto creato ma versamento fallito: non rollback automatico,
        // restituiamo warning così la UI può chiedere all'utente
        return NextResponse.json(
          {
            id: newPackageId,
            warning: "Pacchetto creato ma versamento iniziale fallito",
          },
          { status: 201 }
        );
      }
    }

    return NextResponse.json({ id: newPackageId }, { status: 201 });
  } catch (err) {
    console.error("[packages POST]", err);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
