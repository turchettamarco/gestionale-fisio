import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";
import GlobalSearch from "./components/GlobalSearch";
import WelcomeTour from "./components/WelcomeTour";
import ProtectedProviders from "@/src/contexts/ProtectedProviders";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <ProtectedProviders>
      {children}
      <GlobalSearch />
      <WelcomeTour />
    </ProtectedProviders>
  );
}
