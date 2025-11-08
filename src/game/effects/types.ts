export type EffectKind = "status" | "token" | "resource";

export type EffectId = "burn" | "chi" | "evasive" | "purify";

export type EffectDefinition = {
  id: EffectId;
  kind: EffectKind;
  name: string;
  icon: string;
  summary: string;
};
