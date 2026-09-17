// Runs an async function over a list with at most `limit` in flight at
// once. A 300-400 page spec book can segment into dozens of sections —
// firing all of those at the AI simultaneously would risk hitting rate
// limits and makes failures harder to reason about, so this trickles them
// through a small worker pool instead.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  // Called after each item finishes (in completion order, not input
  // order — items don't necessarily finish in the order they started
  // since several run at once). Lets a caller report "X of Y done"
  // without having to track completion order itself.
  onItemDone?: (completedCount: number, total: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let completed = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
      completed++;
      onItemDone?.(completed, items.length);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
