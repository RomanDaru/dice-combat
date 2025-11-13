const envValue =
  typeof import.meta !== "undefined"
    ? (import.meta.env?.VITE_ENABLE_DEFENSE_V2 as string | undefined)
    : undefined;

export const ENABLE_DEFENSE_V2 =
  (envValue ?? "").toLowerCase() === "true";

