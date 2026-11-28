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
