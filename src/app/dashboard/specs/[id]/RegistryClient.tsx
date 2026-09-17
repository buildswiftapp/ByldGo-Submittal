"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSubmittalFromRequirement, deleteSpecBook } from "../actions";

export type SpecBookDetail = {
  id: string;
  name: string;
  status: "processing" | "ready" | "failed";
  error: string | null;
  created_at: string;
  progress_stage: string | null;
  progress_current: number | null;
  progress_total: number | null;
};

export type SpecRequirement = {
  id: string;
  spec_book_id: string;
  division_code: string | null;
  division_title: string | null;
  description: string;
  source_label: string;
  submittal_id: string | null;
};

export default function RegistryClient({
  specBook,
  requirements,
}: {
  specBook: SpecBookDetail;
  requirements: SpecRequirement[];
}) {
  const router = useRouter();

  // While the AI is still scanning, poll for updates every few seconds so
  // the page fills in on its own — no manual refresh needed.
  useEffect(() => {
    if (specBook.status !== "processing") return;
    const interval = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(interval);
  }, [specBook.status, router]);

  const grouped = useMemo(() => {
    const map = new Map<string, SpecRequirement[]>();
    for (const req of requirements) {
      const key = req.division_code
        ? `${req.division_code} ${req.division_title ?? ""}`.trim()
        : req.division_title ?? "Ungrouped";
      const list = map.get(key) ?? [];
      list.push(req);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [requirements]);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{specBook.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Uploaded {new Date(specBook.created_at).toLocaleString()}
          </p>
        </div>
        <DeleteSpecBookButton specBookId={specBook.id} />
      </div>

      {specBook.status === "processing" && (
        <ProcessingStatus
          // Remounts the clock below fresh whenever a poll brings back
          // actual new progress, instead of it just ticking up forever.
          key={`${specBook.progress_stage ?? ""}:${specBook.progress_current ?? ""}`}
          specBook={specBook}
        />
      )}

      {specBook.status === "failed" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-medium text-red-800">
            Something went wrong while scanning this document.
          </p>
          {specBook.error && (
            <p className="mt-1 text-sm text-red-700">{specBook.error}</p>
          )}
        </div>
      )}

      {specBook.status === "ready" && (
        <>
          <p className="mb-4 text-sm text-gray-500">
            {requirements.length} requirement
            {requirements.length === 1 ? "" : "s"} found across{" "}
            {grouped.length} section{grouped.length === 1 ? "" : "s"}.
          </p>

          {requirements.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-400">
              No submittal requirements were found in this document.
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([groupLabel, items]) => (
                <div
                  key={groupLabel}
                  className="overflow-hidden rounded-lg border border-gray-200 bg-white"
                >
                  <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase text-gray-500">
                    {groupLabel}
                  </div>
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {items.map((req) => (
                        <RequirementRow key={req.id} requirement={req} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProcessingStatus({ specBook }: { specBook: SpecBookDetail }) {
  // A plain "Scanning..." message looks identical whether it's actually
  // working or has silently died. Two things make that visible: a live
  // "checked X seconds ago" clock (proves the page really is polling), and
  // real progress numbers once the background job reports them — which
  // stage it's in, and "X of Y" once it knows a total (page reads and
  // section detection don't have a clean total to report; per-section
  // extraction does, since it knows how many sections there are).
  // Remounted (see the `key` on this component where it's used) whenever a
  // poll brings back real new progress, so this always starts fresh at 0
  // rather than needing to reset itself mid-life.
  const [secondsSinceCheck, setSecondsSinceCheck] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => setSecondsSinceCheck((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  const hasTotal =
    specBook.progress_total !== null && specBook.progress_total > 0;
  const percent = hasTotal
    ? Math.round(
        ((specBook.progress_current ?? 0) / specBook.progress_total!) * 100
      )
    : null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
      <p className="text-sm font-medium text-amber-800">
        {specBook.progress_stage ?? "Scanning this spec book..."}
      </p>

      {hasTotal ? (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-amber-100">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-amber-700">
            {specBook.progress_current} of {specBook.progress_total} done (
            {percent}%)
          </p>
        </div>
      ) : (
        <p className="mt-1 text-sm text-amber-700">
          This can take a few minutes for a large document.
        </p>
      )}

      <p className="mt-3 text-xs text-amber-600">
        Last update: {secondsSinceCheck === 0 ? "just now" : `${secondsSinceCheck}s ago`}.
        This page checks in on its own every few seconds — this number
        resets each time it sees real progress, so as long as it isn&apos;t
        climbing past a couple minutes it&apos;s still working, just on a
        slow step.
      </p>
    </div>
  );
}

function DeleteSpecBookButton({ specBookId }: { specBookId: string }) {
  const [state, formAction, pending] = useActionState(deleteSpecBook, null);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !confirm(
            "Delete this spec book and its whole registry? This can't be undone. Any submittals already created from it are kept."
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="specBookId" value={specBookId} />
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "Deleting..." : "Delete"}
      </button>
      {state?.error && (
        <p className="mt-1 text-xs text-red-600">{state.error}</p>
      )}
    </form>
  );
}

function RequirementRow({ requirement }: { requirement: SpecRequirement }) {
  const [state, formAction, pending] = useActionState(
    createSubmittalFromRequirement,
    requirement.submittal_id
      ? { success: true, submittalId: requirement.submittal_id }
      : null
  );

  const submittalId =
    state && "success" in state && state.success ? state.submittalId : null;

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="w-1/2 px-4 py-3 align-top text-gray-900">
        {requirement.description}
      </td>
      <td className="px-4 py-3 align-top text-xs text-gray-500">
        {requirement.source_label}
      </td>
      <td className="px-4 py-3 align-top text-right">
        {submittalId ? (
          <Link
            href="/dashboard"
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            View in Submittal Log →
          </Link>
        ) : (
          <form action={formAction}>
            <input type="hidden" name="requirementId" value={requirement.id} />
            <input type="hidden" name="specBookId" value={requirement.spec_book_id} />
            <button
              type="submit"
              disabled={pending}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {pending ? "Creating..." : "Create Submittal"}
            </button>
          </form>
        )}
        {state && "error" in state && (
          <p className="mt-1 text-xs text-red-600">{state.error}</p>
        )}
      </td>
    </tr>
  );
}
