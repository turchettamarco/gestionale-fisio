// app/api/packages/[id]/payments/[pid]/route.ts
// ═══════════════════════════════════════════════════════════════════════
//   DELETE /api/packages/[id]/payments/[pid]  → storna un versamento
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";
import { autoUpdatePackageStatus } from "@/src/lib/packages/queries";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  try {
    const { id: packageId, pid: paymentId } = await params;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    // Verifica che il versamento appartenga al pacchetto indicato (sanity)
    const { data: payment } = await supabase
      .from("package_payments")
      .select("id, package_id")
      .eq("id", paymentId)
      .maybeSingle();

    if (
      !payment ||
      (payment as { package_id: string }).package_id !== packageId
    ) {
      return NextResponse.json(
        { error: "Versamento non trovato" },
        { status: 404 }
      );
    }

    const { error: delErr } = await supabase
      .from("package_payments")
      .delete()
      .eq("id", paymentId);

    if (delErr) {
      console.error("[payments DELETE]", delErr.message);
      return NextResponse.json(
        { error: "Errore eliminazione" },
        { status: 500 }
      );
    }

    // Se il pacchetto era 'completed' e ora non è più pagato, NON lo riportiamo
    // automaticamente ad 'active' (rischio di confondere l'utente).
    // autoUpdatePackageStatus agisce solo nella direzione active → completed.
    await autoUpdatePackageStatus(supabase, packageId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[payments DELETE]", err);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
