// app/api/survey/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET: resolve token -> patient name
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  const { data } = await supabaseAdmin.from("survey_tokens")
    .select("patient_name").eq("token", token).maybeSingle();
  return NextResponse.json({ patient_name: data?.patient_name ?? "" });
}

// POST: create token OR save survey response
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = body;
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

    // Create token (from patient page)
    if (body._create_token) {
      await supabaseAdmin.from("survey_tokens").upsert({
        token, patient_id: body.patient_id ?? null, patient_name: body.patient_name ?? "",
      }, { onConflict: "token" });
      return NextResponse.json({ ok: true });
    }

    // Save survey response (from survey page)
    const { data: tk } = await supabaseAdmin.from("survey_tokens")
      .select("patient_id, patient_name").eq("token", token).maybeSingle();
    const { error } = await supabaseAdmin.from("survey_responses").insert({
      token, patient_id: tk?.patient_id ?? null, patient_name: tk?.patient_name ?? "",
      q1_score: body.q1, q2_score: body.q2, q3_text: body.q3 || null,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
