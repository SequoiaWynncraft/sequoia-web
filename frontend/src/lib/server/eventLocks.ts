/**
 * Per-slug mutual exclusion for event-lifecycle races the database cannot
 * arbitrate on its own: deleting an event purges its raffle rolls, and a
 * concurrent roll that already committed its winner must not insert its
 * record between that purge and the removal - the orphan row would replay a
 * dead event's wheel under whatever later event reuses the slug.
 *
 * In-process only, deliberately: this server runs as a single process (the
 * same constraint liveRolls.ts documents), so an in-memory queue is the
 * whole story.
 */
const tails = new Map<string, Promise<unknown>>();

/** Runs `task` after every previously queued task for `slug` has settled. */
export function withEventLock<T>(slug: string, task: () => Promise<T>): Promise<T> {
  // Stored tails are already settled-swallowing, so chaining with .then
  // alone cannot skip `task`, and a failing task releases - never poisons -
  // the lock.
  const run = (tails.get(slug) ?? Promise.resolve()).then(task);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(slug, settled);
  void settled.then(() => {
    if (tails.get(slug) === settled) tails.delete(slug);
  });
  return run;
}
