export type CancelFn = () => void;

const getGlobal = () => {
  if (typeof window !== "undefined") return window;
  if (typeof globalThis !== "undefined") return globalThis as typeof window;
  return {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: undefined,
    cancelAnimationFrame: undefined,
  } as unknown as typeof window;
};

const root = getGlobal();

const setTimeoutFn =
  typeof root.setTimeout === "function"
    ? root.setTimeout.bind(root)
    : setTimeout;
const clearTimeoutFn =
  typeof root.clearTimeout === "function"
    ? root.clearTimeout.bind(root)
    : clearTimeout;
const setIntervalFn =
  typeof root.setInterval === "function"
    ? root.setInterval.bind(root)
    : setInterval;
const clearIntervalFn =
  typeof root.clearInterval === "function"
    ? root.clearInterval.bind(root)
    : clearInterval;

export const scheduleTimeout = (
  callback: () => void,
  durationMs: number
): CancelFn => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    callback();
    return () => {};
  }
  let cancelled = false;
  const handle = setTimeoutFn(() => {
    if (!cancelled) {
      callback();
    }
  }, durationMs);
  return () => {
    if (!cancelled) {
      cancelled = true;
      clearTimeoutFn(handle);
    }
  };
};

export const scheduleInterval = (
  callback: () => void,
  intervalMs: number
): CancelFn => {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    callback();
    return () => {};
  }
  const handle = setIntervalFn(callback, intervalMs);
  let cleared = false;
  return () => {
    if (!cleared) {
      cleared = true;
      clearIntervalFn(handle);
    }
  };
};

export const scheduleAnimationFrame = (
  callback: (time: number) => void
): CancelFn => {
  if (
    typeof root.requestAnimationFrame === "function" &&
    typeof root.cancelAnimationFrame === "function"
  ) {
    const handle = root.requestAnimationFrame(callback);
    let cancelled = false;
    return () => {
      if (!cancelled) {
        cancelled = true;
        root.cancelAnimationFrame(handle);
      }
    };
  }
  return scheduleTimeout(() => callback(Date.now()), 16);
};
