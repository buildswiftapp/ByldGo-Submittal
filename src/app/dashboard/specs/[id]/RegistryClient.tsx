"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createSubmittalFromRequirement,
  createSubmittalsFromRequirements,
  deleteSpecBook,
  getSpecSectionText,
  type SpecSectionTextResult,
} from "../actions";

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
  // Points at the spec_sections row holding this requirement's full source
  // text. Null for requirements from a spec book scanned before source
  // text saving was added — those only ever get the citation label.
  section_id: string | null;
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

  // Selection is tracked by the id of each group's primary requirement —
  // checking a row means "include this requirement" (its duplicates, if
  // any, aren't auto-included; expand the row to select one of those
  // individually instead). Rows that already have a submittal aren't
  // selectable — bulk-creating over them again would be a no-op at best.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectableIds = useMemo(
    () =>
      requirementGroups
        .filter((g) => !g.primary.submittal_id)
        .map((g) => g.primary.id),
    [requirementGroups]
  );

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Which requirement's source text is currently showing in the slide-in
  // panel, if any. Kept as the section id + a fallback label (the citation)
  // rather than the whole requirement, since that's all the panel needs.
  const [viewingSource, setViewingSource] = useState<{
    sectionId: string | null;
    sourceLabel: string;
  } | null>(null);

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
            <>
              <BulkCreateBar
                specBookId={specBook.id}
                selectedIds={selectedIds}
                selectableIds={selectableIds}
                onSelectAll={() => setSelectedIds(new Set(selectableIds))}
                onSelectNone={() => setSelectedIds(new Set())}
              />

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
                          <RequirementGroupRow
                            key={group.key}
                            group={group}
                            selected={selectedIds.has(group.primary.id)}
                            onToggleSelected={() =>
                              toggleSelected(group.primary.id)
                            }
                            onViewSource={(sectionId, sourceLabel) =>
                              setViewingSource({ sectionId, sourceLabel })
                            }
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {viewingSource && (
        <SourceTextPanel
          sectionId={viewingSource.sectionId}
          sourceLabel={viewingSource.sourceLabel}
          onClose={() => setViewingSource(null)}
        />
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

function BulkCreateBar({
  specBookId,
  selectedIds,
  selectableIds,
  onSelectAll,
  onSelectNone,
}: {
  specBookId: string;
  selectedIds: Set<string>;
  selectableIds: string[];
  onSelectAll: () => void;
  onSelectNone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    createSubmittalsFromRequirements,
    null
  );

  const selectedCount = selectedIds.size;

  // Clears the checkboxes once the bulk create actually finishes — those
  // rows will have a submittal now and switch to the "✓ already created"
  // indicator instead, so there's nothing left to leave selected.
  //
  // onSelectAll/onSelectNone are inline arrow functions passed down from
  // the parent, so they're a new reference on every render — including
  // the re-render this effect itself causes by calling onSelectNone. A
  // plain [state, onSelectNone] dependency array would re-fire on that
  // reference change alone, see the still-successful `state` again, and
  // call onSelectNone() forever ("Maximum update depth exceeded"). Tracking
  // which state object was already handled makes this idempotent no
  // matter how often the effect gets woken back up.
  const handledStateRef = useRef<typeof state>(null);
  useEffect(() => {
    if (
      state &&
      state !== handledStateRef.current &&
      "success" in state &&
      state.success
    ) {
      handledStateRef.current = state;
      onSelectNone();
    }
  }, [state, onSelectNone]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <button
        type="button"
        onClick={onSelectAll}
        disabled={selectableIds.length === 0}
        className="text-xs font-medium text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
      >
        Select all ({selectableIds.length})
      </button>
      <button
        type="button"
        onClick={onSelectNone}
        disabled={selectedCount === 0}
        className="text-xs font-medium text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
      >
        Select none
      </button>

      <span className="text-xs text-gray-500">{selectedCount} selected</span>

      <form action={formAction} className="ml-auto flex items-center gap-2">
        <input type="hidden" name="specBookId" value={specBookId} />
        {Array.from(selectedIds).map((id) => (
          <input key={id} type="hidden" name="requirementIds" value={id} />
        ))}
        <button
          type="submit"
          disabled={selectedCount === 0 || pending}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {pending
            ? `Creating ${selectedCount} submittal${selectedCount === 1 ? "" : "s"}...`
            : selectedCount === 0
              ? "Create Submittals"
              : `Create ${selectedCount} Submittal${selectedCount === 1 ? "" : "s"}`}
        </button>
      </form>

      {state && "error" in state && (
        <p className="w-full text-xs text-red-600">{state.error}</p>
      )}
      {state && "success" in state && state.success && (
        <p className="w-full text-xs text-green-700">
          Created {state.created} submittal{state.created === 1 ? "" : "s"}
          {state.alreadyLinked > 0
            ? ` (${state.alreadyLinked} already had one)`
            : ""}
          {state.failed > 0 ? ` — ${state.failed} failed` : ""}. Check the{" "}
          <Link href="/dashboard" className="underline">
            Submittal Log
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function RequirementGroupRow({
  group,
  selected,
  onToggleSelected,
  onViewSource,
}: {
  group: RequirementGroup;
  selected: boolean;
  onToggleSelected: () => void;
  onViewSource: (sectionId: string | null, sourceLabel: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDuplicates = group.occurrences.length > 1;
  const alreadyCreated = !!group.primary.submittal_id;

  return (
    <>
      <tr className="border-b border-gray-100 last:border-0">
        <td className="w-10 px-4 py-3 align-top">
          {alreadyCreated ? (
            <span className="block text-center text-xs text-gray-300" title="Already has a submittal">
              ✓
            </span>
          ) : (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelected}
              className="h-4 w-4 rounded border-gray-300"
              aria-label={`Select "${group.primary.description}"`}
            />
          )}
        </td>
        <td className="w-1/2 px-4 py-3 align-top text-gray-900">
          {group.primary.description}
        </td>
        <td className="px-4 py-3 align-top text-xs text-gray-500">
          {group.primary.source_label}
          <button
            type="button"
            onClick={() =>
              onViewSource(group.primary.section_id, group.primary.source_label)
            }
            className="mt-1 block font-medium text-blue-600 hover:underline"
          >
            View source text →
          </button>
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
        // occurrences[0] is the primary row shown above — only list the
        // others here, so the primary's own source isn't repeated right
        // under itself.
        group.occurrences.slice(1).map((occ) => (
          <tr key={occ.id} className="border-b border-gray-100 bg-gray-50 last:border-0">
            <td className="px-4 py-2 align-top"></td>
            <td className="w-1/2 px-4 py-2 pl-8 align-top text-xs text-gray-500">
              Same wording, found again here:
            </td>
            <td className="px-4 py-2 align-top text-xs text-gray-500">
              {occ.source_label}
              <button
                type="button"
                onClick={() => onViewSource(occ.section_id, occ.source_label)}
                className="mt-1 block font-medium text-blue-600 hover:underline"
              >
                View source text →
              </button>
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

  // Checks the live prop first, not just this row's own action result — a
  // bulk-create (a different action entirely, run from the selection bar
  // above) can be what actually created this submittal, and the prop is
  // what reflects that once the page's data refreshes.
  const submittalId =
    requirement.submittal_id ??
    (state && "success" in state && state.success ? state.submittalId : null);

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

// Slide-in panel showing a requirement's real source text (the full spec
// section it came from), not just the "Section X, p.Y" citation. Fetches
// on demand rather than the page loading every section's text up front —
// a big spec book can have well over a hundred sections, most of which
// nobody will ever open.
function SourceTextPanel({
  sectionId,
  sourceLabel,
  onClose,
}: {
  sectionId: string | null;
  sourceLabel: string;
  onClose: () => void;
}) {
  const [result, setResult] = useState<SpecSectionTextResult | null>(null);
  const [resultForSectionId, setResultForSectionId] = useState<string | null>(null);

  // Same "adjust state during render" pattern used for the stale-file-URL
  // fix in DashboardClient: clearing the previous section's result when
  // sectionId changes has to happen during render, not as a synchronous
  // setState inside the effect below — that's the set-state-in-effect
  // trap hit a few times already in this app.
  if (resultForSectionId !== sectionId) {
    setResultForSectionId(sectionId);
    setResult(null);
  }

  // The fetch itself IS a safe effect — the setState here happens inside
  // the promise's .then() callback, not synchronously in the effect body.
  useEffect(() => {
    let cancelled = false;
    getSpecSectionText(sectionId).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [sectionId]);

  return (
    <div className="fixed inset-y-0 right-0 z-20 w-full max-w-xl overflow-y-auto border-l border-gray-200 bg-white p-6 shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {result && "success" in result ? result.label : "Source text"}
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">{sourceLabel}</p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {!result && <p className="text-sm text-gray-400">Loading source text...</p>}

      {result && "error" in result && (
        <p className="text-sm text-amber-700">{result.error}</p>
      )}

      {result && "success" in result && (
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-700">
          {result.text}
        </pre>
      )}
    </div>
  );
}
