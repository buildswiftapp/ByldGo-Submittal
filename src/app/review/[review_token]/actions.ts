"use server";

// Step 2 only builds this page's UI. Actually updating status and sending
// the notification emails is Step 3 — this stub just confirms the click
// reached the server, so the page is testable before that's wired up.
export async function submitReview(_prevState: unknown, formData: FormData) {
  const action = String(formData.get("action") ?? "");
  const comments = String(formData.get("comments") ?? "");

  return {
    message: `Received "${action}"${
      comments ? ` with comments: "${comments}"` : ""
    }. This will actually update the submittal once Step 3 is wired up.`,
  };
}
