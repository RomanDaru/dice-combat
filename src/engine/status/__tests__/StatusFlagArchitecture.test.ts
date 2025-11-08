import { describe, expect, it } from "vitest";

type EntityId = "player" | "ai";

// --- 1. ZLÁ ARCHITEKTÚRA (ownerFlag v Definícii) ---

interface BadStatusDefinition {
  id: string;
  transferable: boolean;
  ownerFlag: boolean;
}

interface BadStatusInstance {
  instanceId: string;
  statusId: string;
  currentOwnerId: EntityId;
}

const BAD_DEFINITIONS: Record<string, BadStatusDefinition> = {
  chi: {
    id: "chi",
    transferable: true,
    ownerFlag: true,
  },
};

// --- 2. DOBRÁ ARCHITEKTÚRA (originalOwnerId v inštancii) ---

interface GoodStatusDefinition {
  id: string;
  transferable: boolean;
}

interface GoodStatusInstance {
  instanceId: string;
  statusId: string;
  currentOwnerId: EntityId;
  originalOwnerId: EntityId;
}

const GOOD_DEFINITIONS: Record<string, GoodStatusDefinition> = {
  chi: {
    id: "chi",
    transferable: true,
  },
};

describe("Architektonický Dôkaz: ownerFlag (Definícia) vs. originalOwnerId (Inštancia)", () => {
  it("ZLYHÁ: ownerFlag v definícii nevie rozlíšiť ukradnutý token", () => {
    const chiDef = BAD_DEFINITIONS.chi;
    expect(chiDef.ownerFlag).toBe(true);

    const tokenA: BadStatusInstance = {
      instanceId: "token-A",
      statusId: "chi",
      currentOwnerId: "ai",
    };

    const tokenB: BadStatusInstance = {
      instanceId: "token-B",
      statusId: "chi",
      currentOwnerId: "ai",
    };

    const isTokenAOriginal = BAD_DEFINITIONS[tokenA.statusId].ownerFlag;
    const isTokenBOriginal = BAD_DEFINITIONS[tokenB.statusId].ownerFlag;

    expect(isTokenAOriginal).toBe(true);
    expect(isTokenBOriginal).toBe(true);
  });

  it("USPEJE: originalOwnerId v inštancii jasne rozlišuje pôvodného vlastníka", () => {
    const chiDef = GOOD_DEFINITIONS.chi;
    expect(chiDef.transferable).toBe(true);

    const tokenA: GoodStatusInstance = {
      instanceId: "token-A",
      statusId: "chi",
      currentOwnerId: "ai",
      originalOwnerId: "ai",
    };

    const tokenB: GoodStatusInstance = {
      instanceId: "token-B",
      statusId: "chi",
      currentOwnerId: "ai",
      originalOwnerId: "player",
    };

    const isTokenAOriginal = tokenA.currentOwnerId === tokenA.originalOwnerId;
    const isTokenBOriginal = tokenB.currentOwnerId === tokenB.originalOwnerId;

    expect(isTokenAOriginal).toBe(true);
    expect(isTokenBOriginal).toBe(false);
  });
});
