"use client";

import {
  Fragment,
  useActionState,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { createSubmittal, sendForReview, updateSubmittalDetails } from "./actions";
import { querySpecAI } from "./ai-actions";
import {
  DIVISION_OPTIONS,
  SUBCONTRACTOR_OPTIONS,
  formatDivisionValue,
} from "@/lib/construction";

export type Submittal = {
  id: string;
  name: string;
  project_title: string | null;
  status: "draft" | "pending_review" | "approved" | "needs_revision";
  subcontractor_name: string | null;
  reviewer_name: string | null;
  reviewer_email: string | null;
  reviewer_comments: string | null;
  file_path: string | null;
  review_token: string;
  created_at: string;
  updated_at: string;
  division_code: string | null;
  division_title: string | null;
};

const STATUS_STYLES: Record<Submittal["status"], string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_review: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  needs_revision: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<Submittal["status"], string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  approved: "Approved",
  needs_revision: "Needs Revision",
};

function StatusBadge({ status }: { status: Submittal["status"] }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

type SortKey = "status" | "date";

export default function DashboardClient({
  submittals,
}: {
  submittals: Submittal[];
}) {
  const [modalOpen, setModalOpen] = useState(false);
  // Storing just the id (rather than the whole row) and looking it up fresh
  // on every render means the open detail panel automatically picks up new
  // values after a save — no effect needed to keep a stale local copy in
  // sync with the server data.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId
    ? (submittals.find((s) => s.id === selectedId) ?? null)
    : null;
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...submittals];
    copy.sort((a, b) => {
      if (sortKey === "status") {
        return sortAsc
          ? a.status.localeCompare(b.status)
          : b.status.localeCompare(a.status);
      }
      const diff =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortAsc ? diff : -diff;
    });
    return copy;
  }, [submittals, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  // Groups the already-sorted rows by CSI division (or whatever a non-CSI
  // spec calls its own division) — same idea as the Specifications
  // registry's grouping, just applied to the log. Sorting still happens
  // above this, and the sort order is preserved within each group.
  const groupedByDivision = useMemo(() => {
    const map = new Map<string, Submittal[]>();
    for (const s of sorted) {
      const key = s.division_code
        ? `${s.division_code} - ${s.division_title ?? ""}`.trim()
        : (s.division_title ?? "Ungrouped");
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    // Numeric-aware sort so "03 - Concrete" comes before "23 - Electrical"
    // rather than sorting as plain text; "Ungrouped" always goes last.
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "Ungrouped") return 1;
      if (b === "Ungrouped") return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }, [sorted]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">
          Submittal Log
        </h1>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + New Submittal
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Project</th>
              <th
                className="cursor-pointer select-none px-4 py-3"
                onClick={() => toggleSort("status")}
              >
                Status {sortKey === "status" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
              <th className="px-4 py-3">Subcontractor</th>
              <th
                className="cursor-pointer select-none px-4 py-3"
                onClick={() => toggleSort("date")}
              >
                Created {sortKey === "date" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                  No submittals yet. Click &quot;New Submittal&quot; to add one.
                </td>
              </tr>
            )}
            {groupedByDivision.map(([groupLabel, items]) => (
              <Fragment key={groupLabel}>
                <tr>
                  <td
                    colSpan={5}
                    className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase text-gray-500"
                  >
                    {groupLabel}
                  </td>
                </tr>
                {items.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {s.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.project_title ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.subcontractor_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && <NewSubmittalModal onClose={() => setModalOpen(false)} />}
      {selected && (
        <DetailPanel submittal={selected} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function NewSubmittalModal({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(createSubmittal, null);

  useEffect(() => {
    if (state?.success) {
      onClose();
    }
  }, [state?.success, onClose]);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            New Submittal
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <form action={formAction} className="space-y-3">
          <Field label="Submittal name" name="name" required />
          <Field label="Project title" name="projectTitle" />
          <ComboField
            label="Division"
            name="division"
            options={DIVISION_OPTIONS}
            placeholder="e.g. 03 - Concrete"
            helpText="Pick a CSI division, or type your own for a non-CSI spec."
          />
          <ComboField
            label="Subcontractor / trade"
            name="subcontractorName"
            options={SUBCONTRACTOR_OPTIONS}
            placeholder="e.g. Concrete Subcontractor"
          />
          <Field label="Reviewer name" name="reviewerName" />
          <Field label="Reviewer email" name="reviewerEmail" type="email" />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              File
            </label>
            <input
              name="file"
              type="file"
              className="w-full text-sm"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {pending ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
      />
    </div>
  );
}

// A text input backed by a <datalist> of suggestions — the browser filters
// the list as you type and shows it as a dropdown, but unlike a <select>
// it never restricts you to only those options. Used for Division and
// Subcontractor/trade, where a long reference list covers the common
// cases but real projects always have exceptions worth typing freely.
function ComboField({
  label,
  name,
  options,
  defaultValue,
  placeholder,
  helpText,
  required = false,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
}) {
  const listId = useId();
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        name={name}
        list={listId}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      {helpText && <p className="mt-1 text-xs text-gray-400">{helpText}</p>}
    </div>
  );
}

function DetailPanel({
  submittal,
  onClose,
}: {
  submittal: Submittal;
  onClose: () => void;
}) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileUrlPath, setFileUrlPath] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [editing, setEditing] = useState(false);

  // A previously-loaded signed link points at whatever file was current
  // when it was fetched — if editing just replaced the file, that link is
  // now stale. Resetting it here (during render, when the path we fetched
  // it for no longer matches) rather than in an effect is the pattern
  // React itself recommends for "state that depends on a prop" — it avoids
  // an extra render pass that a useEffect-based reset would cause.
  if (fileUrlPath !== submittal.file_path) {
    setFileUrlPath(submittal.file_path);
    setFileUrl(null);
  }

  const reviewLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/review/${submittal.review_token}`
      : "";

  async function loadFile() {
    if (!submittal.file_path) return;
    setLoadingFile(true);
    const supabase = createClient();
    const { data } = await supabase.storage
      .from("submittal-files")
      .createSignedUrl(submittal.file_path, 60 * 10);
    setFileUrl(data?.signedUrl ?? null);
    setLoadingFile(false);
  }

  return (
    <div className="fixed inset-y-0 right-0 z-20 w-full max-w-md overflow-y-auto border-l border-gray-200 bg-white p-6 shadow-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">
          {editing ? "Edit submittal" : submittal.name}
        </h2>
        <button onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>

      <div className="space-y-4 text-sm">
        <div>
          <span className="mb-1 block text-xs uppercase text-gray-400">
            Status
          </span>
          <div className="flex items-center gap-3">
            <StatusBadge status={submittal.status} />
            {submittal.status === "draft" && (
              <SendForReviewButton
                submittalId={submittal.id}
                hasReviewerEmail={!!submittal.reviewer_email}
              />
            )}
          </div>
        </div>

        {editing ? (
          <EditDetailsForm
            submittal={submittal}
            onDone={() => setEditing(false)}
          />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase text-gray-400">Details</span>
              <button
                onClick={() => setEditing(true)}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                Edit
              </button>
            </div>
            <Row label="Name" value={submittal.name} />
            <Row label="Project" value={submittal.project_title} />
            <Row
              label="Division"
              value={formatDivisionValue(
                submittal.division_code,
                submittal.division_title
              )}
            />
            <Row label="Subcontractor / trade" value={submittal.subcontractor_name} />
            <Row label="Reviewer" value={submittal.reviewer_name} />
            <Row label="Reviewer email" value={submittal.reviewer_email} />
            <Row label="Reviewer comments" value={submittal.reviewer_comments} />
            <Row
              label="Created"
              value={new Date(submittal.created_at).toLocaleString()}
            />
            <Row
              label="Last updated"
              value={new Date(submittal.updated_at).toLocaleString()}
            />
          </>
        )}

        <div>
          <span className="mb-1 block text-xs uppercase text-gray-400">
            File
          </span>
          {submittal.file_path ? (
            fileUrl ? (
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline"
              >
                Open file
              </a>
            ) : (
              <button
                onClick={loadFile}
                disabled={loadingFile}
                className="text-blue-600 underline disabled:opacity-50"
              >
                {loadingFile ? "Loading link..." : "Get file link"}
              </button>
            )
          ) : (
            <span className="text-gray-400">No file uploaded</span>
          )}
        </div>

        <SpecQA submittalId={submittal.id} hasFile={!!submittal.file_path} />

        <div>
          <span className="mb-1 block text-xs uppercase text-gray-400">
            Reviewer link (no login required)
          </span>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={reviewLink}
              className="w-full rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              onClick={() => navigator.clipboard.writeText(reviewLink)}
              className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
            >
              Copy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditDetailsForm({
  submittal,
  onDone,
}: {
  submittal: Submittal;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    updateSubmittalDetails,
    null
  );

  useEffect(() => {
    if (state && "success" in state && state.success) {
      onDone();
    }
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="submittalId" value={submittal.id} />
      <Field label="Name" name="name" defaultValue={submittal.name} required />
      <Field
        label="Project title"
        name="projectTitle"
        defaultValue={submittal.project_title ?? ""}
      />
      <ComboField
        label="Division"
        name="division"
        options={DIVISION_OPTIONS}
        placeholder="e.g. 03 - Concrete"
        helpText="Pick a CSI division, or type your own for a non-CSI spec."
        defaultValue={formatDivisionValue(
          submittal.division_code,
          submittal.division_title
        )}
      />
      <ComboField
        label="Subcontractor / trade"
        name="subcontractorName"
        options={SUBCONTRACTOR_OPTIONS}
        placeholder="e.g. Concrete Subcontractor"
        defaultValue={submittal.subcontractor_name ?? ""}
      />
      <Field
        label="Reviewer name"
        name="reviewerName"
        defaultValue={submittal.reviewer_name ?? ""}
      />
      <Field
        label="Reviewer email"
        name="reviewerEmail"
        type="email"
        defaultValue={submittal.reviewer_email ?? ""}
      />
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {submittal.file_path ? "Replace file" : "Attach a file"}
        </label>
        <input name="file" type="file" className="w-full text-sm" />
        {submittal.file_path && (
          <p className="mt-1 text-xs text-gray-400">
            Leave this blank to keep the current file.
          </p>
        )}
      </div>

      {state && "error" in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

function SendForReviewButton({
  submittalId,
  hasReviewerEmail,
}: {
  submittalId: string;
  hasReviewerEmail: boolean;
}) {
  const [state, formAction, pending] = useActionState(sendForReview, null);

  if (state?.success) {
    return (
      <span className="text-xs text-green-700">Sent for review ✓</span>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="submittalId" value={submittalId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        title={
          hasReviewerEmail
            ? undefined
            : "No reviewer email on file — status will still update, but no email will be sent."
        }
      >
        {pending ? "Sending..." : "Send for Review"}
      </button>
      {state?.error && (
        <span className="text-xs text-red-600">{state.error}</span>
      )}
    </form>
  );
}

function SpecQA({
  submittalId,
  hasFile,
}: {
  submittalId: string;
  hasFile: boolean;
}) {
  const [state, formAction, pending] = useActionState(querySpecAI, null);

  if (!hasFile) return null;

  return (
    <div className="border-t border-gray-200 pt-4">
      <span className="mb-2 block text-xs uppercase text-gray-400">
        Query Specification AI
      </span>
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="submittalId" value={submittalId} />
        <input
          name="query"
          type="text"
          placeholder="e.g. What are the curing time requirements?"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {pending ? "Searching..." : "Search"}
        </button>
      </form>

      {state && "error" in state && (
        <p className="mt-2 text-sm text-red-600">{state.error}</p>
      )}

      {state && "success" in state && state.success && (
        <div className="mt-3 rounded-md bg-gray-50 p-3 text-sm">
          <div className="whitespace-pre-wrap text-gray-900">
            {state.answer}
          </div>
          <div className="mt-2 text-xs text-gray-400">
            Searched: {state.sourceLabels.join(", ")}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="mb-1 block text-xs uppercase text-gray-400">
        {label}
      </span>
      <span className="text-gray-900">{value || "—"}</span>
    </div>
  );
}
