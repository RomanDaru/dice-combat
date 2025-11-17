import { createInitialState } from "../game/state";
import { HEROES } from "../game/heroes";
import type { HeroId, PlayerState, Side, Tokens } from "../game/types";
import type {
  BaseDefenseResolution,
  DefensePlanResult,
} from "../game/combat/types";
import { buildDefensePlan } from "../game/combat/defensePipeline";
import { resolveAttack } from "../engine/resolveAttack";
import {
  createStatusSpendSummary,
  getStacks,
  getStatus,
  registerStatusLifecycleSink,
  setStacks,
  spendStatus,
  type StatusId,
  type StatusLifecycleEvent,
  type StatusSpendSummary,
} from "../engine/status";
import type { StatusTimingPhase } from "../engine/status/types";
import type { DefenseStatusGrant } from "../defense/effects";
import {
  buildPendingDefenseBuffsFromGrants,
  partitionPendingDefenseBuffs,
  type PendingDefenseBuff,
  type PendingDefenseBuffTrigger,
} from "../game/defenseBuffs";
import type { AttackResolution } from "../game/combat/types";
import { deriveVirtualTokensForSide } from "../context/virtualTokens";
import type { VirtualTokenDerivationResult } from "../context/virtualTokens";

type StatusHarnessRequests = Partial<Record<Side, Record<StatusId, number>>>;

export type StatusHarnessPendingGrant = {
  grant: DefenseStatusGrant;
  triggerPhase: StatusTimingPhase;
  triggerOwner?: Side;
};

export type StatusHarnessReaction = {
  statusId: StatusId;
  roll?: number;
};

export type StatusHarnessOptions = {
  id: string;
  attackDamage: number;
  attackerHeroId?: HeroId;
  defenderHeroId?: HeroId;
  defenseBaseBlock?: number;
  defenderTokens?: Tokens;
  defenseSpendRequests?: Record<StatusId, number>;
  attackStatusSpends?: StatusSpendSummary[];
  pendingGrants?: StatusHarnessPendingGrant[];
  defenseReactions?: StatusHarnessReaction[];
  attackStatusRequests?: StatusHarnessRequests;
  defenseStatusRequests?: StatusHarnessRequests;
};

export type StatusHarnessResult = {
  id: string;
  attackerSide: Side;
  defenderSide: Side;
  attackerBefore: PlayerState;
  defenderBefore: PlayerState;
  attackerAfter: PlayerState;
  defenderAfter: PlayerState;
  defensePlan: DefensePlanResult;
  resolution: AttackResolution;
  lifecycleEvents: StatusLifecycleEvent[];
  pendingDefenseBuffs: PendingDefenseBuff[];
  expiredDefenseBuffs: Array<{ buff: PendingDefenseBuff; reason: string }>;
  reactionSummaries: StatusSpendSummary[];
  virtualTokens: Record<Side, VirtualTokenDerivationResult>;
};

const DEFAULT_ATTACKER: HeroId = "Pyromancer";
const DEFAULT_DEFENDER: HeroId = "Shadow Monk";

const clonePlayer = (player: PlayerState): PlayerState => ({
  ...player,
  tokens: { ...(player.tokens ?? {}) },
});

const applyPendingDefenseBuffToPlayer = (
  player: PlayerState,
  buff: PendingDefenseBuff,
  trigger: PendingDefenseBuffTrigger
): PlayerState => {
  const currentStacks = getStacks(player.tokens ?? {}, buff.statusId, 0);
  let nextStacks = currentStacks + buff.stacks;
  if (typeof buff.stackCap === "number") {
    nextStacks = Math.min(nextStacks, buff.stackCap);
  }
  const def = getStatus(buff.statusId);
  if (typeof def?.maxStacks === "number") {
    nextStacks = Math.min(nextStacks, def.maxStacks);
  }
  if (nextStacks === currentStacks) {
    return player;
  }
  const nextTokens = setStacks(player.tokens ?? {}, buff.statusId, nextStacks, {
    eventType: "grant",
    ownerLabel: player.hero.id,
    phase: trigger.phase,
    source: {
      kind: "pendingDefenseBuff",
      ruleId: buff.source?.ruleId,
      effectId: buff.source?.effectId,
      buffId: buff.id,
    },
    note: `harness:${buff.id}`,
  });
  return {
    ...player,
    tokens: nextTokens,
  };
};

const buildBaseResolution = (baseBlock: number): BaseDefenseResolution => ({
  selection: {
    roll: { dice: [], combos: [], options: [] },
    selected: null,
  },
  baseBlock: Math.max(0, baseBlock),
  reflect: 0,
  heal: 0,
  appliedTokens: {},
  retaliatePercent: 0,
});

const applyPendingGrants = (
  allGrants: StatusHarnessPendingGrant[] | undefined,
  context: {
    attackerSide: Side;
    defenderSide: Side;
    round: number;
    turnId: string;
  },
  players: Record<Side, PlayerState>
) => {
  if (!allGrants?.length) {
    return {
      pending: [] as PendingDefenseBuff[],
      expired: [] as Array<{ buff: PendingDefenseBuff; reason: string }>,
    };
  }
  const grants = allGrants.map((entry) => entry.grant);
  let pending = buildPendingDefenseBuffsFromGrants(grants, context);
  const expired: Array<{ buff: PendingDefenseBuff; reason: string }> = [];

  allGrants.forEach((entry, index) => {
    const trigger: PendingDefenseBuffTrigger = {
      phase: entry.triggerPhase,
      owner: entry.triggerOwner ?? context.defenderSide,
      turnId: `${context.turnId}_${index}`,
      round: context.round,
    };
    const partition = partitionPendingDefenseBuffs(pending, trigger);
    pending = partition.pending;
    if (partition.expired.length) {
      expired.push(...partition.expired);
    }
    partition.ready.forEach((buff) => {
      const owner = buff.owner;
      players[owner] = applyPendingDefenseBuffToPlayer(
        players[owner],
        buff,
        trigger
      );
    });
  });

  return { pending, expired };
};

const deriveVirtualTokens = (
  player: PlayerState,
  side: Side,
  pending: PendingDefenseBuff[],
  attackRequests?: StatusHarnessRequests,
  defenseRequests?: StatusHarnessRequests
) =>
  deriveVirtualTokensForSide({
    player,
    side,
    attackStatusRequests: attackRequests?.[side] ?? {},
    defenseStatusRequests: defenseRequests?.[side] ?? {},
    pendingDefenseBuffs: pending,
  });

export const runStatusHarnessScenario = (
  options: StatusHarnessOptions
): StatusHarnessResult => {
  const attackerHero =
    HEROES[options.attackerHeroId ?? DEFAULT_ATTACKER] ??
    HEROES[DEFAULT_ATTACKER];
  const defenderHero =
    HEROES[options.defenderHeroId ?? DEFAULT_DEFENDER] ??
    HEROES[DEFAULT_DEFENDER];
  const attackerSide: Side = "you";
  const defenderSide: Side = "ai";

  const initial = createInitialState(attackerHero, defenderHero, 1337);
  let players: Record<Side, PlayerState> = {
    you: clonePlayer(initial.players.you),
    ai: clonePlayer(initial.players.ai),
  };

  if (options.defenderTokens) {
    players.ai = {
      ...players.ai,
      tokens: {
        ...(players.ai.tokens ?? {}),
        ...options.defenderTokens,
      },
    };
  }

  const attackerBefore = clonePlayer(players.you);
  const defenderBefore = clonePlayer(players.ai);

  const lifecycleEvents: StatusLifecycleEvent[] = [];
  const dispose = registerStatusLifecycleSink({
    publish: (event) => {
      lifecycleEvents.push(event);
    },
  });

  const grantContext = {
    attackerSide,
    defenderSide,
    round: 1,
    turnId: `statusHarness_${options.id}`,
  };
  const { pending, expired } = applyPendingGrants(
    options.pendingGrants,
    grantContext,
    players
  );
  let pendingDefenseBuffs = pending;
  const expiredDefenseBuffs = expired;

  const reactionSummaries: StatusSpendSummary[] = [];
  if (options.defenseReactions?.length) {
    options.defenseReactions.forEach((reaction) => {
      const spendResult = spendStatus(
        players.ai.tokens ?? {},
        reaction.statusId,
        "defenseRoll",
        reaction.roll !== undefined
          ? { phase: "defenseRoll", roll: reaction.roll }
          : { phase: "defenseRoll" }
      );
      if (!spendResult) {
        throw new Error(
          `Status harness "${options.id}" failed to spend reaction ${reaction.statusId}`
        );
      }
      players.ai = {
        ...players.ai,
        tokens: spendResult.next,
      };
      const def = getStatus(reaction.statusId);
      const cost = def?.spend?.costStacks ?? 1;
      reactionSummaries.push(
        createStatusSpendSummary(
          reaction.statusId,
          cost,
          [spendResult.spend],
          { def }
        )
      );
    });
  }

  const baseResolution = buildBaseResolution(options.defenseBaseBlock ?? 0);
  const defensePlan = buildDefensePlan({
    defender: players.ai,
    incomingDamage: options.attackDamage,
    baseResolution,
    spendRequests: options.defenseSpendRequests ?? {},
  });

  const ability = {
    combo: "HARNESS",
    damage: options.attackDamage,
    label: `Status Harness ${options.id}`,
  };

  const defenseState = {
    resolution: {
      ...defensePlan.defense,
      statusSpends: [
        ...reactionSummaries,
        ...defensePlan.defense.statusSpends,
      ],
    },
  };

  const resolution = resolveAttack({
    source: "status-harness",
    attackerSide,
    defenderSide,
    attacker: players.you,
    defender: defensePlan.defenderAfter,
    ability,
    baseDamage: ability.damage,
    attackStatusSpends: options.attackStatusSpends ?? [],
    defense: defenseState,
  });

  dispose();

  pendingDefenseBuffs = pendingDefenseBuffs.filter(
    (buff) => !expiredDefenseBuffs.some((entry) => entry.buff.id === buff.id)
  );

  return {
    id: options.id,
    attackerSide,
    defenderSide,
    attackerBefore,
    defenderBefore,
    attackerAfter: resolution.updatedAttacker,
    defenderAfter: resolution.updatedDefender,
    defensePlan,
    resolution,
    lifecycleEvents,
    pendingDefenseBuffs,
    expiredDefenseBuffs,
    reactionSummaries,
    virtualTokens: {
      you: deriveVirtualTokens(
        resolution.updatedAttacker,
        "you",
        pendingDefenseBuffs,
        options.attackStatusRequests,
        options.defenseStatusRequests
      ),
      ai: deriveVirtualTokens(
        resolution.updatedDefender,
        "ai",
        pendingDefenseBuffs,
        options.attackStatusRequests,
        options.defenseStatusRequests
      ),
    },
  };
};
