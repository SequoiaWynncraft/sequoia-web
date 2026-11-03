export interface PrizeIcon {
  file: string;
  label: string;
}

export const PRIZE_ICONS: PrizeIcon[] = [
  { file: "le.svg", label: "LE" },
  { file: "crate.svg", label: "Crate" },
  { file: "credit.svg", label: "Store credit" },
  { file: "rank.svg", label: "Rank" },
  { file: "key.svg", label: "Key" },
  { file: "scroll.svg", label: "Scroll" },
  { file: "cracker.svg", label: "Cracker" },
  { file: "pet.svg", label: "Pet" },
  { file: "tower.svg", label: "Tower" },
  { file: "spark.svg", label: "Spark" },
];

export function prizeIconUrl(file: string): string {
  return `/assets/prizes/${file}`;
}

export function isPrizeIconFile(file: string): boolean {
  return PRIZE_ICONS.some((icon) => icon.file === file);
}
