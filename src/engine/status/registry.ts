import type { StatusDef, StatusRegistry } from "./types";

const REGISTRY: StatusRegistry = {};

export function defineStatus(definition: StatusDef): StatusDef {
  REGISTRY[definition.id] = definition;
  return definition;
}

export function getStatus(id: string): StatusDef | undefined {
  return REGISTRY[id];
}

export function listStatuses(): StatusDef[] {
  return Object.values(REGISTRY);
}

export function resetStatuses() {
  Object.keys(REGISTRY).forEach((key) => {
    delete REGISTRY[key];
  });
}

