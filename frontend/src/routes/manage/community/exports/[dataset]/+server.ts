import type { RequestHandler } from "./$types";

import { requireBranchArea } from "#lib/server/branchAccess.js";
import {
  buildExport,
  findExportDataset,
  parseExportParams,
} from "#lib/server/communityExports.js";
import { csvResponse } from "#lib/server/csv.js";
import { requestError } from "#lib/server/requestError.js";

export const prerender = false;

/**
 * CSV download for one community dataset. Gated here as well as on the page:
 * endpoints don't inherit the layout's guard, and the download URL is
 * shareable.
 */
export const GET: RequestHandler = async ({ params, url, cookies, fetch, locals }) => {
  await requireBranchArea(
    { cookies, fetch, locals },
    "community",
    "Stats exports are restricted to the Community branch and guild leadership",
  );
  const dataset = findExportDataset(params.dataset);
  if (!dataset) requestError(locals, 404, "No such export");

  const parsed = parseExportParams(dataset, url.searchParams);
  if (!parsed.ok) requestError(locals, 400, parsed.message);

  const result = await buildExport(fetch, dataset.id, parsed.params);
  if (!result.ok) requestError(locals, result.status, result.message);

  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`sequoia-${dataset.id}-${stamp}.csv`, result.rows);
};
