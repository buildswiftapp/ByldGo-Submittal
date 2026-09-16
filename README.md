# ByldGo Submittals

AI spec-scanning submittal tracker for general contractors. Single-user
per account — the GC is the only logged-in role; reviewers (architects/
engineers) act through a no-login link scoped to one submittal.

**Stack:** Next.js (App Router, TypeScript) on Vercel · Supabase (Postgres,
Auth, Storage, pgvector) · Stripe · Resend · Claude Haiku 4.5 + OpenAI
embeddings for spec analysis.

See `BUILD_LOG.md` for what's been built so far and what's next.
