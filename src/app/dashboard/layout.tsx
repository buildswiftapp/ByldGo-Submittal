import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";

// Runs before every dashboard page. Two jobs:
//   1. Bounce anyone without a session back to /login.
//   2. Make sure an `accounts` row exists for this user — it's created
//      here, the first time they actually reach the dashboard, using the
//      company name they gave at signup (see src/app/signup/actions.ts).
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id, company_name")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!account) {
    const companyName =
      (user.user_metadata?.company_name as string | undefined) ||
      "My Company";

    await supabase
      .from("accounts")
      .insert({ owner_user_id: user.id, company_name: companyName });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-semibold text-gray-900">
            ByldGo Submittals
          </span>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
