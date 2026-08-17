/** RFC 4180 CSV writing, shared by every export endpoint. */

export type CsvValue = string | number | null | undefined;

/** RFC 4180: quote when needed, double inner quotes, CRLF rows. */
export function csvField(value: CsvValue): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: CsvValue[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

/**
 * A download response for a CSV export. Never cached: exports are gated and
 * reflect live data. The filename is sanitized to the characters a plain
 * quoted `filename=` parameter can carry.
 */
export function csvResponse(filename: string, rows: CsvValue[][]): Response {
  const safeName = filename.replaceAll(/[^\w.-]+/g, "-");
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${safeName}"`,
      "cache-control": "no-store",
    },
  });
}
