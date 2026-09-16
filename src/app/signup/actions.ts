"use server";

import { createClient } from "@/lib/supabase/server";

export async function signUp(_prevState: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const companyName = String(formData.get("companyName") ?? "");

  const supabase = await createClient();

  // company_name is stashed in the auth user's metadata now, and copied
  // into the accounts table the first time this user reaches the
  // dashboard (see src/app/dashboard/layout.tsx) — that's the earliest
  // point a session definitely exists to attach the account row to.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { company_name: companyName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return {
    success:
      "Check your email for a confirmation link, then sign in.",
  };
}
