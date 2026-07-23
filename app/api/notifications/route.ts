// app/api/notifications/route.ts
// ═══════════════════════════════════════════════════════════════════════
// API gestione notifiche dello studio.
//
//   GET  /api/notifications              → lista ultime 20 non lette + 5 lette
//   GET  /api/notifications?all=1        → storico completo (max 100)
//   POST /api/notifications              → mark read
//        body: { id: string }            → singola notifica
//        body: { mark_all: true }        → tutte
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

    // Trova lo studio dell'utente (RLS protegge le query sotto comunque)
    const { data: member } = await supabase
      .from("studio_members")
      .select("studio_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!member) return NextResponse.json({ notifications: [], unread_count: 0 });

    const all = req.nextUrl.searchParams.get("all") === "1";

    // Storico completo: ultime 100, qualunque stato
    if (all) {
      const { data: rows } = await supabase
        .from("notifications")
        .select("id, type, appointment_id, patient_id, payload, created_at, read_at, recipient_id")
        .eq("studio_id", member.studio_id)
        .or(`recipient_id.is.null,recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(100);

      return NextResponse.json({
        notifications: rows ?? [],
        unread_count: (rows ?? []).filter((r: any) => !r.read_at).length,
      });
    }

    // Lista normale (campanella): tutte le non lette + ultime 5 lette
    const { data: unread } = await supabase
      .from("notifications")
      .select("id, type, appointment_id, patient_id, payload, created_at, read_at, recipient_id")
      .eq("studio_id", member.studio_id)
      .or(`recipient_id.is.null,recipient_id.eq.${user.id}`)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: lastRead } = await supabase
      .from("notifications")
      .select("id, type, appointment_id, patient_id, payload, created_at, read_at, recipient_id")
      .eq("studio_id", member.studio_id)
      .or(`recipient_id.is.null,recipient_id.eq.${user.id}`)
      .not("read_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);

    return NextResponse.json({
      notifications: [...(unread ?? []), ...(lastRead ?? [])],
      unread_count: (unread ?? []).length,
    });
  } catch (e: any) {
    console.error("[notifications GET]", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

    const body = await req.json();
    const nowIso = new Date().toISOString();

    // Mark all unread as read (per lo studio dell'utente)
    if (body.mark_all === true) {
      const { data: member } = await supabase
        .from("studio_members")
        .select("studio_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (!member) return NextResponse.json({ ok: true, count: 0 });

      // Conto le notifiche da marcare come lette (per restituire il numero al client)
      const { count: pendingCount } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("studio_id", member.studio_id)
        .is("read_at", null);

      const { error } = await supabase
        .from("notifications")
        .update({ read_at: nowIso })
        .eq("studio_id", member.studio_id)
        .is("read_at", null);

      if (error) throw error;
      return NextResponse.json({ ok: true, count: pendingCount ?? 0 });
    }

    // Mark singola notifica
    if (body.id) {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: nowIso })
        .eq("id", body.id);
      // RLS impedisce l'update di notifiche di altri studi.
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Body non valido" }, { status: 400 });
  } catch (e: any) {
    console.error("[notifications POST]", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore" }, { status: 500 });
  }
}
