"use client";

import { useActionState } from "react";
import { submitReview } from "./actions";

type Submittal = {
  id: string;
  name: string;
  project_title: string | null;
  status: string;
  subcontractor_name: string | null;
};

export default function ReviewClient({
  submittal,
  fileUrl,
}: {
  submittal: Submittal;
  fileUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(submitReview, null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <p className="mb-1 text-xs uppercase text-gray-400">
          Submittal Review
        </p>
        <h1 className="mb-1 text-xl font-semibold text-gray-900">
          {submittal.name}
        </h1>
        {submittal.project_title && (
          <p className="mb-4 text-sm text-gray-500">
            {submittal.project_title}
          </p>
        )}
        {submittal.subcontractor_name && (
          <p className="mb-4 text-sm text-gray-500">
            Trade: {submittal.subcontractor_name}
          </p>
        )}

        <div className="mb-6">
          {fileUrl ? (
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Open submittal file
            </a>
          ) : (
            <p className="text-sm text-gray-400">No file uploaded yet.</p>
          )}
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Reviewer Comments
            </label>
            <textarea
              name="comments"
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>

          {state?.message && (
            <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-700">
              {state.message}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              name="action"
              value="approve"
              disabled={pending}
              className="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="submit"
              name="action"
              value="request_revision"
              disabled={pending}
              className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Request Revision
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
