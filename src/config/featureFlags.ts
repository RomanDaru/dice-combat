const envValue =
  typeof import.meta !== "undefined"
    ? (import.meta.env?.VITE_ENABLE_DEFENSE_V2 as string | undefined)
    : undefined;

// Default to true so defense schema v2 is the always-on pipeline.
export const ENABLE_DEFENSE_V2 =
  (envValue ?? "true").toLowerCase() === "true";
