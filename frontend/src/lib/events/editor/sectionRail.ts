import { EDITOR_SECTIONS, type SectionId } from "./issues";

export function nearestVisibleSection(
  visible: ReadonlySet<string>,
  active: SectionId,
): SectionId | null {
  if (visible.has(active)) return active;

  const activeIndex = EDITOR_SECTIONS.findIndex((section) => section.id === active);
  let best: SectionId | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  EDITOR_SECTIONS.forEach((section, index) => {
    if (!visible.has(section.id)) return;
    const distance = activeIndex < 0 ? index : Math.abs(index - activeIndex);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = section.id;
    }
  });
  return best;
}
