const DEFAULT_DELAY_MS = 20000;
const INTERACTION_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"];

export function scheduleNonCriticalWork(callback, delayMs = DEFAULT_DELAY_MS) {
  if (typeof window === "undefined") {
    return () => {};
  }

  let didRun = false;
  let didScheduleIdle = false;
  let delayTimer = 0;
  let cancelIdleTimer = () => {};

  const scheduleIdle = () => {
    if (didScheduleIdle) return;
    didScheduleIdle = true;

    if (typeof window.requestIdleCallback === "function") {
      const idleTimer = window.requestIdleCallback(() => {
        if (didRun) return;
        didRun = true;
        cleanup();
        callback();
      }, { timeout: 3000 });
      cancelIdleTimer = () => window.cancelIdleCallback(idleTimer);
      return;
    }

    const idleTimer = window.setTimeout(() => {
      if (didRun) return;
      didRun = true;
      cleanup();
      callback();
    }, 1200);
    cancelIdleTimer = () => window.clearTimeout(idleTimer);
  };

  function run() {
    if (didRun) return;
    scheduleIdle();
  }

  function cleanup() {
    if (delayTimer) {
      window.clearTimeout(delayTimer);
    }

    cancelIdleTimer();

    INTERACTION_EVENTS.forEach((eventName) => {
      window.removeEventListener(eventName, run);
    });
  }

  INTERACTION_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, run, { once: true, passive: true });
  });

  window.addEventListener("load", () => {
    delayTimer = window.setTimeout(run, delayMs);
  }, { once: true });

  return cleanup;
}
