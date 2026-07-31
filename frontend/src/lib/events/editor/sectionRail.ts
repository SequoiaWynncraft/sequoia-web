import { EDITOR_SECTIONS, type SectionId } from "./issues";

export function nearestVisibleSection(
  visible: ReadonlySet<string>,
  active: SectionId,
): SectionId | null {
  // Sticky tie-break: a click target that genuinely landed in the observer
  // band remains active when neighboring grid sections are visible too.
  if (visible.has(active)) return active;

  // Otherwise hand off to the candidate nearest the prior active section.
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
