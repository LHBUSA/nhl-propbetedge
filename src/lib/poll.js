// Visibility-aware poller. One timer, one in-flight request, full cleanup.
// run(signal) resolves to the next delay in ms, or null to stop polling.
export function createPoller(run, { onError, maxBackoff = 120000 } = {}) {
  let timer = null;
  let controller = null;
  let failures = 0;
  let stopped = true;
  let generation = 0;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
  };

  const schedule = delay => {
    if (stopped || delay === null || delay === undefined) return;
    if (document.hidden) return; // resumes on visibilitychange
    timer = setTimeout(tickNow, delay);
  };

  async function tickNow() {
    clear();
    if (stopped) return;
    const mine = ++generation;
    controller = new AbortController();
    try {
      const next = await run(controller.signal);
      if (mine !== generation || stopped) return;
      failures = 0;
      schedule(next);
    } catch (error) {
      if (mine !== generation || stopped || error?.kind === 'aborted') return;
      failures += 1;
      const retry = onError?.(error, failures);
      schedule(retry === null ? null : Math.min(maxBackoff, (retry ?? 5000) * 2 ** Math.min(failures - 1, 5)));
    }
  }

  const onVisibility = () => {
    if (stopped) return;
    if (document.hidden) clear();
    else tickNow();
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      document.addEventListener('visibilitychange', onVisibility);
      tickNow();
    },
    refresh() { if (!stopped) tickNow(); },
    stop() {
      stopped = true;
      generation += 1;
      clear();
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
