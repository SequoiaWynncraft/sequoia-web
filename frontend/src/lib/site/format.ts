/** Formats a number in compact notation, e.g. 12_400 -> "12.4K". */
export function compact(value: number): string {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
