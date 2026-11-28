const tails = new Map<string, Promise<unknown>>();

export function withEventLock<T>(slug: string, task: () => Promise<T>): Promise<T> {
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
