import { createClient } from "@/lib/supabase/server";
import DashboardClient, { type Submittal } from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", user!.id)
    .single();

  const { data: submittals } = await supabase
    .from("submittals")
    .select(
      "id, name, project_title, status, subcontractor_name, reviewer_name, reviewer_email, file_path, review_token, created_at, updated_at"
    )
    .eq("account_id", account?.id ?? "")
    .order("created_at", { ascending: false });

  return (
    <DashboardClient submittals={(submittals as Submittal[]) ?? []} />
  );
}
