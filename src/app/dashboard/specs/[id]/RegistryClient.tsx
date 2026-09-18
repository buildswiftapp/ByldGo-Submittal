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

// Two requirements count as "the same" if their wording only differs by
// case, punctuation, or extra whitespace — the kind of near-identical
// repeat that comes from the AI scan re-describing the same requirement
// slightly differently across overlapping section windows. This is
// deliberately conservative: it does NOT try to merge requirements that are
// merely similar in meaning but worded differently, since two genuinely
// distinct requirements (e.g. product data for two different materials)
// can easily share most of their wording, and guessing wrong there would
// silently hide a real submittal requirement.
function normalizeDescription(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "");
}

export type RequirementGroup = {
  key: string;
  primary: SpecRequirement;
  occurrences: SpecRequirement[];
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

  // Collapse near-identical repeats into a single group before grouping by
  // division, so a requirement that got extracted more than once (e.g. from
  // overlapping section windows) shows up as one row with its other
  // occurrences tucked behind an expand toggle, instead of as separate
  // rows.
  const requirementGroups = useMemo(() => {
    const map = new Map<string, SpecRequirement[]>();
    for (const req of requirements) {
      const key = normalizeDescription(req.description);
      const list = map.get(key) ?? [];
      list.push(req);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(
      ([key, occurrences]): RequirementGroup => ({
        key,
        primary: occurrences[0],
        occurrences,
      })
    );
  }, [requirements]);

  const duplicateCount = requirements.length - requirementGroups.length;

  const grouped = useMemo(() => {
    const map = new Map<string, RequirementGroup[]>();
    for (const group of requirementGroups) {
      const req = group.primary;
      const key = req.division_code
        ? `${req.division_code} ${req.division_title ?? ""}`.trim()
        : req.division_title ?? "Ungrouped";
      const list = map.get(key) ?? [];
      list.push(group);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [requirementGroups]);

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
            {requirementGroups.length} requirement
            {requirementGroups.length === 1 ? "" : "s"} found across{" "}
            {grouped.length} section{grouped.length === 1 ? "" : "s"}
            {duplicateCount > 0 && (
              <>
                {" "}
                ({duplicateCount} near-identical repeat
                {duplicateCount === 1 ? "" : "s"} collapsed — expand a row to
                see them)
              </>
            )}
            .
          </p>

          {requirementGroups.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-400">
              No submittal requirements were found in this document.
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([groupLabel, groups]) => (
                <div
                  key={groupLabel}
                  className="overflow-hidden rounded-lg border border-gray-200 bg-white"
                >
                  <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase text-gray-500">
                    {groupLabel}
                  </div>
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {groups.map((group) => (
                        <RequirementGroupRow key={group.key} group={group} />
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

function RequirementGroupRow({ group }: { group: RequirementGroup }) {
  const [expanded, setExpanded] = useState(false);
  const hasDuplicates = group.occurrences.length > 1;

  return (
    <>
      <tr className="border-b border-gray-100 last:border-0">
        <td className="w-1/2 px-4 py-3 align-top text-gray-900">
          {group.primary.description}
        </td>
        <td className="px-4 py-3 align-top text-xs text-gray-500">
          {group.primary.source_label}
          {hasDuplicates && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 block font-medium text-blue-600 hover:underline"
            >
              {expanded ? "Hide" : "Show"} {group.occurrences.length} sources
              {expanded ? " ▲" : " ▼"}
            </button>
          )}
        </td>
        <td className="px-4 py-3 align-top text-right">
          <RequirementActionCell requirement={group.primary} />
        </td>
      </tr>
      {expanded &&
        group.occurrences.map((occ) => (
          <tr key={occ.id} className="border-b border-gray-100 bg-gray-50 last:border-0">
            <td className="w-1/2 px-4 py-2 pl-8 align-top text-xs text-gray-500">
              Same wording, found again here:
            </td>
            <td className="px-4 py-2 align-top text-xs text-gray-500">
              {occ.source_label}
            </td>
            <td className="px-4 py-2 align-top text-right">
              <RequirementActionCell requirement={occ} compact />
            </td>
          </tr>
        ))}
    </>
  );
}

function RequirementActionCell({
  requirement,
  compact = false,
}: {
  requirement: SpecRequirement;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createSubmittalFromRequirement,
    requirement.submittal_id
      ? { success: true, submittalId: requirement.submittal_id }
      : null
  );

  const submittalId =
    state && "success" in state && state.success ? state.submittalId : null;

  return (
    <>
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
            className={`rounded-md border border-gray-300 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 ${
              compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
            }`}
          >
            {pending ? "Creating..." : "Create Submittal"}
          </button>
        </form>
      )}
      {state && "error" in state && (
        <p className="mt-1 text-xs text-red-600">{state.error}</p>
      )}
    </>
  );
}
