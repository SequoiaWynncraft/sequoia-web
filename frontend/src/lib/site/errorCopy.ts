/**
 * Map an HTTP error status to the heading, recovery copy, and document title
 * shown on the global error page.
 *
 * Distinguishes the statuses the app actually surfaces (403, 404, 409, and the
 * 5xx family) and falls back to a generic message for anything else, so the
 * error page never claims "404" for a failure that was something else.
 *
 * @param status - The SvelteKit error status (`page.status`).
 * @returns The `heading` (large status label), `message` (recovery copy), and
 *   `title` (document `<title>` text) for that status.
 */
export function errorCopy(status: number): {
  heading: string;
  message: string;
  title: string;
} {
  const heading = String(status);

  if (status === 403) {
    return {
      heading,
      message: "This grove is closed to you. You do not have access here.",
      title: "403 — Forbidden",
    };
  }

  if (status === 404) {
    return {
      heading,
      message: "This path leads nowhere in the forest.",
      title: "404 — Not found",
    };
  }

  if (status === 409) {
    return {
      heading,
      message: "This request clashed with a change already in progress. Try again.",
      title: "409 — Conflict",
    };
  }

  if (status >= 500 && status < 600) {
    return {
      heading,
      message: "Something broke on our end. Give it a moment, then try again.",
      title: `${status} — Something went wrong`,
    };
  }

  return {
    heading,
    message: "Something went wrong reaching this page.",
    title: `${status} — Error`,
  };
}
