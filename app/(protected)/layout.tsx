import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <>{children}</>;
}
