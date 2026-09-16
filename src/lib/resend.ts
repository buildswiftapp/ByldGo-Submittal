import { Resend } from "resend";

// If RESEND_API_KEY isn't set yet, this stays undefined and callers just
// skip sending rather than crashing — lets the rest of the app run before
// you've set up Resend.
export const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// onboarding@resend.dev works out of the box for testing, before you've
// verified your own sending domain in Resend. Once you have, set
// RESEND_FROM_EMAIL to something like "ByldGo Submittals <notify@byldgo.com>".
export const EMAIL_FROM =
  process.env.RESEND_FROM_EMAIL ?? "ByldGo Submittals <onboarding@resend.dev>";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
