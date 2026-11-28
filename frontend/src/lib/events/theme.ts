import type { EventTheme } from "./types";

export function themeVars(theme: EventTheme): string {
  return [
    `--ev-sky-0:${theme.sky[0]}`,
    `--ev-sky-1:${theme.sky[1]}`,
    `--ev-accent:${theme.accent}`,
    `--ev-accent-2:${theme.accentSecondary}`,
    `--ev-star:${theme.star}`,
  ].join(";");
}
