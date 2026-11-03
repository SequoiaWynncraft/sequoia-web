export type CsvValue = string | number | null | undefined;

export function csvField(value: CsvValue): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: CsvValue[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

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
