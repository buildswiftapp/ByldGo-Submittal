"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createSubmittalFromRequirement } from "../actions";

export type SpecBookDetail = {
  id: string;
  name: string;
  status: "processing" | "ready" | "failed";
  error: string | null;
  created_at: string;
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
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-900">{specBook.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Uploaded {new Date(specBook.created_at).toLocaleString()}
        </p>
      </div>

      {specBook.status === "processing" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm font-medium text-amber-800">
            Scanning this spec book...
          </p>
          <p className="mt-1 text-sm text-amber-700">
            AI is chunking it by section and pulling out every submittal
            requirement. This can take a few minutes for a large document —
            this page will update on its own.
          </p>
        </div>
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
