import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";
import GlobalSearch from "./components/GlobalSearch";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <>
      {children}
      <GlobalSearch />
    </>
  );
}
