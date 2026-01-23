import { createClient } from "@supabase/supabase-js";

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseUrl = rawUrl.trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

console.log("RAW SUPABASE URL =", JSON.stringify(rawUrl));
console.log("TRIM SUPABASE URL =", JSON.stringify(supabaseUrl));
console.log("KEY PRESENT =", supabaseAnonKey.length > 20);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
