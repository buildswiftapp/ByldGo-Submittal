import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import RegistryClient, {
  type SpecBookDetail,
  type SpecRequirement,
} from "./RegistryClient";

export default async function SpecBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", user!.id)
    .single();

  const { data: specBook } = await supabase
    .from("spec_books")
    .select("id, name, status, error, created_at")
    .eq("id", id)
    .eq("account_id", account?.id ?? "")
    .maybeSingle();

  if (!specBook) notFound();

  const { data: requirements } = await supabase
    .from("spec_requirements")
    .select(
      "id, spec_book_id, division_code, division_title, description, source_label, submittal_id"
    )
    .eq("spec_book_id", id)
    .order("division_code", { ascending: true, nullsFirst: false });

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard/specs"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to Specifications
        </Link>
      </div>
      <RegistryClient
        specBook={specBook as SpecBookDetail}
        requirements={(requirements as SpecRequirement[]) ?? []}
      />
    </div>
  );
}
