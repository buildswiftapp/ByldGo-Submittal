"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { deleteSpecBook, uploadSpecBook } from "./actions";

export type SpecBook = {
  id: string;
  name: string;
  status: "processing" | "ready" | "failed";
  error: string | null;
  created_at: string;
};

const STATUS_STYLES: Record<SpecBook["status"], string> = {
  processing: "bg-amber-100 text-amber-800",
  ready: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<SpecBook["status"], string> = {
  processing: "Scanning...",
  ready: "Ready",
  failed: "Failed",
};

function StatusBadge({ status }: { status: SpecBook["status"] }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function SpecsListClient({
  specBooks,
}: {
  specBooks: SpecBook[];
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            Specifications
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload a full project spec book and let AI build a registry of
            every submittal requirement in it, cited back to its section.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="shrink-0 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Upload Spec Book
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Uploaded</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {specBooks.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                  No spec books yet. Click &quot;Upload Spec Book&quot; to scan one.
                </td>
              </tr>
            )}
            {specBooks.map((book) => (
              <tr
                key={book.id}
                className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
              >
                <td className="px-4 py-3 font-medium text-gray-900">
                  <Link href={`/dashboard/specs/${book.id}`} className="hover:underline">
                    {book.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={book.status} />
                  {book.status === "failed" && book.error && (
                    <span className="ml-2 text-xs text-red-600">{book.error}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {new Date(book.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <DeleteButton specBookId={book.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && <UploadModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}

function DeleteButton({ specBookId }: { specBookId: string }) {
  const [state, formAction, pending] = useActionState(deleteSpecBook, null);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !confirm(
            "Delete this spec book and its whole registry? This can't be undone."
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
        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
      >
        {pending ? "Deleting..." : "Delete"}
      </button>
      {state?.error && (
        <p className="mt-1 text-xs text-red-600">{state.error}</p>
      )}
    </form>
  );
}

function UploadModal({ onClose }: { onClose: () => void }) {
  // A successful upload redirects server-side to the new spec book's page
  // (see uploadSpecBook), so there's no "success" state to watch for here —
  // only an error leaves this modal open with a message.
  const [state, formAction, pending] = useActionState(uploadSpecBook, null);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Upload Spec Book
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <form action={formAction} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Project / spec book name
            </label>
            <input
              name="name"
              type="text"
              required
              placeholder="e.g. Maple Street Apartments — Project Manual"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Spec book file (PDF or DOCX)
            </label>
            <input
              name="file"
              type="file"
              required
              accept=".pdf,.docx"
              className="w-full text-sm"
            />
            <p className="mt-1 text-xs text-gray-400">
              This can take a few minutes for a large document — you&apos;ll be
              taken to the registry page and can watch it fill in.
            </p>
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
              {pending ? "Uploading..." : "Upload & Scan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
