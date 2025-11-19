import type { DefenseDieValue, DefenseSchema } from "../../defense/types";
import {
  resolveDefenseSchema,
  type DefenseSchemaResolution,
} from "../../defense/resolver";
import type {
  BaseDefenseResolution,
  DefenseRollResult,
  DefenseSelection,
} from "./types";
import type { Hero, PlayerState } from "../types";
import type { DefenseStatusGrant } from "../../defense/effects";
import {
  getStacks,
  setStacks,
  getStatus,
  type StatusId,
} from "../../engine/status";
type HeroWithSchema = Hero & { defenseSchema: DefenseSchema };

export const isDefenseSchemaEnabled = (
  hero: Hero | null | undefined
): hero is HeroWithSchema =>
  Boolean(hero && hero.defenseSchema);

type ApplyGrantResult = {
  player: PlayerState;
  log?: string;
};

const clampToCap = (
  nextStacks: number,
  grant: DefenseStatusGrant,
  statusId: StatusId
) => {
  const statusDef = getStatus(statusId);
  let result = nextStacks;
  if (typeof grant.stackCap === "number") {
    result = Math.min(result, grant.stackCap);
  }
  if (typeof statusDef?.maxStacks === "number") {
    result = Math.min(result, statusDef.maxStacks);
  }
  return Math.max(0, result);
};

const applyStatusGrant = (
  player: PlayerState,
  grant: DefenseStatusGrant
): ApplyGrantResult => {
  const stacks = grant.stacks ?? 0;
  if (stacks <= 0) {
    return { player };
  }
  const statusId = grant.status;
  const current = getStacks(player.tokens, statusId, 0);
  const capped = clampToCap(current + stacks, grant, statusId);
  if (capped === current) {
    return { player };
  }
  const nextTokens = setStacks(player.tokens, statusId, capped);
  const log = `${player.hero.name} gains ${stacks} stack${
    stacks === 1 ? "" : "s"
  } of ${statusId} (total ${capped}).`;
  return {
    player: player.tokens === nextTokens ? player : { ...player, tokens: nextTokens },
    log,
  };
};

const applyStatusGrants = (
  attacker: PlayerState,
  defender: PlayerState,
  grants: DefenseStatusGrant[]
) => {
  let updatedAttacker = attacker;
  let updatedDefender = defender;
  const logs: string[] = [];

  grants.forEach((grant) => {
    if (grant.target === "opponent") {
      const outcome = applyStatusGrant(updatedAttacker, grant);
      updatedAttacker = outcome.player;
      if (outcome.log) logs.push(outcome.log);
    } else {
      const outcome = applyStatusGrant(updatedDefender, grant);
      updatedDefender = outcome.player;
      if (outcome.log) logs.push(outcome.log);
    }
  });

  return { updatedAttacker, updatedDefender, logs };
};

const splitStatusGrantsByTiming = (
  grants: DefenseStatusGrant[]
): {
  immediate: DefenseStatusGrant[];
  pending: DefenseStatusGrant[];
} => {
  const immediate: DefenseStatusGrant[] = [];
  const pending: DefenseStatusGrant[] = [];
  grants.forEach((grant) => {
    if (grant.usablePhase === "immediate") {
      immediate.push(grant);
    } else {
      pending.push(grant);
    }
  });
  return { immediate, pending };
};

const coerceDice = (dice: number[]): DefenseDieValue[] =>
  dice.map((value) => {
    if (value < 1 || value > 6) {
      throw new Error(`Invalid defense die value "${value}"`);
    }
    return value as DefenseDieValue;
  });

export type SchemaDefenseRollOutcome = {
  selection: DefenseSelection;
  baseResolution: BaseDefenseResolution;
  updatedAttacker: PlayerState;
  updatedDefender: PlayerState;
  schema: DefenseSchemaResolution;
  logs: string[];
  pendingStatusGrants: DefenseStatusGrant[];
};

export const resolveDefenseSchemaRoll = ({
  hero,
  dice,
  attacker,
  defender,
  incomingDamage,
}: {
  hero: HeroWithSchema;
  dice: number[];
  attacker: PlayerState;
  defender: PlayerState;
  incomingDamage: number;
}): SchemaDefenseRollOutcome => {
  const expectedDice = hero.defenseSchema.dice;
  if (dice.length !== expectedDice) {
    throw new Error(
      `resolveDefenseSchemaRoll expected ${expectedDice} dice but received ${dice.length}`
    );
  }
  const typedDice = coerceDice(dice);
  const schema = resolveDefenseSchema({
    schema: hero.defenseSchema,
    dice: typedDice,
    incomingDamage,
    selfStatuses: defender.tokens,
    opponentStatuses: attacker.tokens,
    schemaHash: hero.defenseSchemaHash ?? null,
  });

  const { immediate, pending } = splitStatusGrantsByTiming(schema.statusGrants);
  const {
    updatedAttacker,
    updatedDefender,
    logs: statusLogs,
  } = applyStatusGrants(attacker, defender, immediate);

  const selection: DefenseSelection = {
    roll: {
      dice,
      combos: [],
      options: [],
      schema,
    },
    selected: null,
  };

  const baseResolution: BaseDefenseResolution = {
    selection,
    baseBlock: schema.totalBlock,
    reflect: schema.totalDamage,
    heal: 0,
    appliedTokens: {},
    retaliatePercent: 0,
  };

  return {
    selection,
    baseResolution,
    updatedAttacker,
    updatedDefender,
    schema,
    logs: [...schema.logs, ...statusLogs],
    pendingStatusGrants: pending,
  };
};
