// Keep optional market enrichment off the NHL live-score critical path.
// Shares one in-flight market read, tolerates failure, and never paints after
// the page is unmounted or while its tab is hidden.
export function createNonblockingMarketRefresh({ load, onSettled, isActive = () => true }) {
  if (typeof load !== 'function' || typeof onSettled !== 'function' || typeof isActive !== 'function') {
    throw new TypeError('load, onSettled, and isActive functions are required');
  }
  let pending = null;
  let stopped = false;

  function refresh() {
    if (stopped || !isActive()) return null;
    if (pending) return pending;
    // A microtask isolates even synchronous market-client errors from the score tick.
    const request = Promise.resolve()
      .then(load)
      .then(value => { if (!stopped && isActive()) onSettled(value); })
      .catch(() => {}) // An optional market error must never interrupt scores.
      .finally(() => { if (pending === request) pending = null; });
    pending = request;
    return request;
  }

  return { refresh, stop: () => { stopped = true; } };
}
