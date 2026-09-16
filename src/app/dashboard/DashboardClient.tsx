"use client";

import { useActionState, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createSubmittal } from "./actions";

export type Submittal = {
  id: string;
  name: string;
  project_title: string | null;
  status: "draft" | "pending_review" | "approved" | "needs_revision";
  subcontractor_name: string | null;
  reviewer_name: string | null;
  reviewer_email: string | null;
  file_path: string | null;
  review_token: string;
  created_at: string;
  updated_at: string;
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
  const [selected, setSelected] = useState<Submittal | null>(null);
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
                  No submittals yet. Click "New Submittal" to add one.
                </td>
              </tr>
            )}
            {sorted.map((s) => (
              <tr
                key={s.id}
                onClick={() => setSelected(s)}
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
          </tbody>
        </table>
      </div>

      {modalOpen && <NewSubmittalModal onClose={() => setModalOpen(false)} />}
      {selected && (
        <DetailPanel submittal={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function NewSubmittalModal({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(createSubmittal, null);

  if (state?.success) {
    onClose();
  }

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
          <Field label="Subcontractor / trade" name="subcontractorName" />
          <Field label="Reviewer name" name="reviewerName" />
          <Field label="Reviewer email" name="reviewerEmail" type="email" />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              File (PDF/DOCX)
            </label>
            <input
              name="file"
              type="file"
              accept=".pdf,.doc,.docx"
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
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
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
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
      />
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
  const [loadingFile, setLoadingFile] = useState(false);

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
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">
          {submittal.name}
        </h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>

      <div className="space-y-4 text-sm">
        <div>
          <span className="mb-1 block text-xs uppercase text-gray-400">
            Status
          </span>
          <StatusBadge status={submittal.status} />
        </div>

        <Row label="Project" value={submittal.project_title} />
        <Row label="Subcontractor / trade" value={submittal.subcontractor_name} />
        <Row label="Reviewer" value={submittal.reviewer_name} />
        <Row label="Reviewer email" value={submittal.reviewer_email} />
        <Row
          label="Created"
          value={new Date(submittal.created_at).toLocaleString()}
        />
        <Row
          label="Last updated"
          value={new Date(submittal.updated_at).toLocaleString()}
        />

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
