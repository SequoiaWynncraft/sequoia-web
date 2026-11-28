export interface PrizeSlotRow {
  key: string;
  prize: string;
  icon: string | null;
  winner: { username: string; uuid: string } | null;
  spinning: boolean;
}

export interface PrizeGroup {
  key: string;
  prize: string;
  icon: string | null;
  slots: PrizeSlotRow[];
}

export function groupPrizeRows(rows: PrizeSlotRow[]): PrizeGroup[] {
  const groups = new Map<string, PrizeGroup>();
  for (const row of rows) {
    const key = `${row.icon ?? ""}\0${row.prize.trim().toLowerCase()}`;
    const group = groups.get(key);
    if (group) group.slots.push(row);
    else groups.set(key, { key, prize: row.prize, icon: row.icon, slots: [row] });
  }
  return [...groups.values()];
}
