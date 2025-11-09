import { HEROES } from "../game/heroes";
import type { Hero, HeroId } from "../game/types";
import {
  type Combo,
  type DefensiveAbility,
  type OffensiveAbility,
  type PlayerState,
  type Side,
} from "../game/types";
import {
  rollDie,
  detectCombos,
  bestAbility,
} from "../game/combos";
import {
  makeRng,
  type Rng,
} from "../engine/rng";
import {
  addStacks,
  getStacks,
  setStacks,
  tickStatuses,
  getStatus,
  type StatusDef,
  type StatusId,
} from "../engine/status";
import {
  analyzeSimulations,
  type AnalyzeOptions,
  type SimulationAnalytics,
} from "./analytics";
import { applyAbilityEffects } from "../game/engine";

export type PolicyPhase = "attack" | "defense";

export type PolicyContext = {
  phase: PolicyPhase;
  side: Side;
  round: number;
  dice: number[];
  combos: Combo[];
  self: PlayerSnapshot;
  opponent: PlayerSnapshot;
  incomingAbility?: OffensiveAbility;
};

export type PolicyDecision = {
  combo?: Combo | null;
};

export type Policy = (context: PolicyContext) => PolicyDecision | null | undefined;

export type SimulationOptions = {
  youHeroId?: HeroId;
  aiHeroId?: HeroId;
  youPolicy?: Policy;
  aiPolicy?: Policy;
  firstPlayer?: Side | "random";
  maxRounds?: number;
  log?: (line: string) => void;
  balance?: BalanceAdjustments;
};

export type SimulationResult = {
  winner: Side | "draw";
  rounds: number;
  turns: number;
  meta: SimulationMeta;
  hp: Record<Side, number>;
  history: TurnRecord[];
  statusStats: StatusStats;
  roundDamage: Record<number, Record<Side, number>>;
  lethalShots: Array<{ side: Side; defenderHpBefore: number }>;
  statusDamageEvents: StatusDamageEvent[];
};

export type TurnRecord = {
  side: Side;
  round: number;
  dice: number[];
  defenseDice: number[];
  attackerHpBefore: number;
  attackerHpAfter: number;
  abilityId: string | null;
  combo: Combo | null;
  opportunities: Combo[];
  attackerHeroId: HeroId;
  defenderHeroId: HeroId;
  defenderHpBefore: number;
  defenderHpAfter: number;
  baseDamage: number | null;
  modifiedDamage: number | null;
  damageDealt: number;
  damageBlocked: number;
  damagePrevented: number;
  reflected: number;
  chiAttackBonus: number;
  chiBlock: number;
  evasiveUsed: boolean;
  evasiveSuccess: boolean;
  defenseAbilityId: string | null;
  attackerStatusDiff: Record<string, number>;
  defenderStatusDiff: Record<string, number>;
  notes: string[];
};

type SimulationMeta = {
  firstPlayer: Side;
  heroBySide: Record<Side, HeroId>;
};

type StatusStats = {
  applied: Record<string, number>;
  damage: Record<string, number>;
  mitigation: Record<string, number>;
  lifetimes: Record<string, number[]>;
};

type StatusDamageEvent = {
  target: Side;
  source: Side;
  statusId: string;
  amount: number;
  round: number;
};

export type BalanceAdjustments = {
  damageDelta?: Partial<Record<Side, number>>;
  blockDelta?: Partial<Record<Side, number>>;
};

export type BatchResult = {
  runs: number;
  wins: Record<Side | "draw", number>;
  winRateYou: number;
  averageRounds: number;
  sample?: SimulationResult;
  analytics: SimulationAnalytics;
  seed: number;
};

type PlayerSnapshot = {
  heroId: HeroId;
  hp: number;
  tokens: Record<string, number>;
};

const ROLLS_PER_ATTACK = 3;
const DEFENSE_DICE_COUNT = 5;
const DEFAULT_MAX_ROUNDS = 20;

const TRACKED_STATUSES: StatusId[] = ["burn", "chi", "evasive"];

const noop = () => {};

const ensureArrayMap = (
  target: Record<string, number[]>,
  key: string
): number[] => {
  if (!target[key]) {
    target[key] = [];
  }
  return target[key];
};

const addToMap = (
  target: Record<string, number>,
  key: string,
  value: number
) => {
  if (value === 0) return;
  target[key] = (target[key] ?? 0) + value;
};

const createStatusStats = (): StatusStats => ({
  applied: {},
  damage: {},
  mitigation: {},
  lifetimes: {},
});

const createStatusTimers = (): Record<Side, Record<StatusId, number | null>> =>
  ({
    you: Object.fromEntries(TRACKED_STATUSES.map((id) => [id, null])),
    ai: Object.fromEntries(TRACKED_STATUSES.map((id) => [id, null])),
  }) as Record<Side, Record<StatusId, number | null>>;

const recordStatusDiff = (
  stats: StatusStats,
  diff: Record<string, number>
) => {
  Object.entries(diff).forEach(([id, delta]) => {
    if (delta > 0) {
      addToMap(stats.applied, id, delta);
    }
  });
};

export function playOne(
  seed: number,
  options: SimulationOptions = {}
): SimulationResult {
  const youHero = HEROES[options.youHeroId ?? "Pyromancer"];
  const aiHero = HEROES[options.aiHeroId ?? "Shadow Monk"];
  if (!youHero || !aiHero) {
    throw new Error("Unsupported hero selection for simulation.");
  }

  const rng = makeRng(seed >>> 0);
  const log = options.log ?? noop;
  const players: Record<Side, PlayerState> = {
    you: createPlayer(youHero),
    ai: createPlayer(aiHero),
  };
  const history: TurnRecord[] = [];
  const first = pickFirstPlayer(rng, options.firstPlayer);
  const meta: SimulationMeta = {
    firstPlayer: first,
    heroBySide: { you: youHero.id, ai: aiHero.id },
  };
  const statusStats = createStatusStats();
  const statusTimers = createStatusTimers();
  const roundDamage: Record<number, Record<Side, number>> = {};
  const lethalShots: Array<{ side: Side; defenderHpBefore: number }> = [];
  const statusDamageEvents: StatusDamageEvent[] = [];
  let turn: Side = first;
  let round = 1;
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;

  while (round <= maxRounds && players.you.hp > 0 && players.ai.hp > 0) {
    if (
      !applyUpkeep(
        players,
        turn,
        rng,
        log,
        statusStats,
        statusDamageEvents,
        round
      )
    ) {
      break;
    }
    syncStatusTimers(statusStats, statusTimers, turn, players[turn].tokens, round);

    const defenderSide: Side = turn === "you" ? "ai" : "you";
    const attackRoll = rollAttackDice(players[turn], rng);
    const combos = combosFromMap(detectCombos(attackRoll.dice));
    const policy = turn === "you" ? options.youPolicy : options.aiPolicy;
    const selection = chooseAttackAbility(
      players[turn],
      players[defenderSide],
      attackRoll.dice,
      combos,
      round,
      turn,
      policy
    );
    const defenseDice = rollDefenseDice(rng);
    const defenseCombos = combosFromMap(detectCombos(defenseDice));
    const defensePolicy = turn === "you" ? options.aiPolicy : options.youPolicy;
    const defenseAbility = chooseDefenseAbility(
      players[defenderSide],
      players[turn],
      defenseDice,
      defenseCombos,
      round,
      defenderSide,
      selection?.ability ?? null,
      defensePolicy
    );

    const attackerHpBefore = players[turn].hp;
    const defenderHpBefore = players[defenderSide].hp;
    const turnResult = resolveAttackTurn({
      attackerSide: turn,
      attacker: players[turn],
      defender: players[defenderSide],
      offensiveAbility: selection?.ability ?? null,
      defensiveAbility: defenseAbility,
      attackDice: attackRoll.dice,
      defenseDice,
      rng,
      log,
      balance: options.balance,
    });

    players[turn] = turnResult.attacker;
    players[defenderSide] = turnResult.defender;
    const attackerHpAfter = players[turn].hp;
    syncStatusTimers(statusStats, statusTimers, turn, players[turn].tokens, round);
    syncStatusTimers(
      statusStats,
      statusTimers,
      defenderSide,
      players[defenderSide].tokens,
      round
    );
    recordStatusDiff(statusStats, turnResult.attackerStatusDiff);
    recordStatusDiff(statusStats, turnResult.defenderStatusDiff);
    addToMap(statusStats.damage, "chi", turnResult.chiAttackSpend);
    addToMap(statusStats.mitigation, "chi", turnResult.chiBlock);
    if (turnResult.evasiveSuccess) {
      addToMap(statusStats.mitigation, "evasive", turnResult.damagePrevented);
    }
    if (!roundDamage[round]) {
      roundDamage[round] = { you: 0, ai: 0 };
    }
    roundDamage[round][turn] =
      (roundDamage[round][turn] ?? 0) + turnResult.damageDealt;
    if (players[defenderSide].hp <= 0) {
      lethalShots.push({ side: turn, defenderHpBefore });
    }

    history.push({
      side: turn,
      round,
      dice: attackRoll.dice,
      defenseDice,
      attackerHpBefore,
      attackerHpAfter,
      abilityId: selection?.ability
        ? `${players[turn].hero.id}:${selection.ability.combo}`
        : null,
      combo: selection?.ability?.combo ?? null,
      opportunities: combos,
      attackerHeroId: players[turn].hero.id as HeroId,
      defenderHeroId: players[defenderSide].hero.id as HeroId,
      defenderHpBefore,
      defenderHpAfter: players[defenderSide].hp,
      baseDamage: turnResult.baseDamage,
      modifiedDamage: turnResult.modifiedDamage,
      damageDealt: turnResult.damageDealt,
      damageBlocked: turnResult.damageBlocked,
      damagePrevented: turnResult.damagePrevented,
      reflected: turnResult.reflected,
      chiAttackBonus: turnResult.chiAttackSpend,
      chiBlock: turnResult.chiBlock,
      evasiveUsed: turnResult.evasiveUsed,
      evasiveSuccess: turnResult.evasiveSuccess,
      defenseAbilityId: turnResult.defenseAbilityId,
      attackerStatusDiff: turnResult.attackerStatusDiff,
      defenderStatusDiff: turnResult.defenderStatusDiff,
      notes: turnResult.notes,
    });

    if (players.you.hp <= 0 || players.ai.hp <= 0) {
      break;
    }

    turn = turn === "you" ? "ai" : "you";
    if (turn === meta.firstPlayer) {
      round += 1;
    }
  }

  flushStatusTimers(statusStats, statusTimers, round);

  const winner =
    players.you.hp <= 0 && players.ai.hp <= 0
      ? "draw"
      : players.ai.hp <= 0
      ? "you"
      : players.you.hp <= 0
      ? "ai"
      : "draw";

  return {
    winner,
    rounds: round,
    turns: history.length,
    meta,
    hp: {
      you: players.you.hp,
      ai: players.ai.hp,
    },
    history,
    statusStats,
    roundDamage,
    lethalShots,
    statusDamageEvents,
  };
}

export function runMany(
  games: number,
  options: SimulationOptions & { seed?: number } = {},
  analysisOptions?: AnalyzeOptions
): BatchResult {
  const runs = Math.max(1, games | 0);
  const wins: Record<Side | "draw", number> = {
    you: 0,
    ai: 0,
    draw: 0,
  };
  let totalRounds = 0;
  const seedBase = options.seed ?? Date.now();
  let sample: SimulationResult | undefined;
  const allResults: SimulationResult[] = [];

  for (let i = 0; i < runs; i += 1) {
    const result = playOne(seedBase + i, options);
    wins[result.winner] += 1;
    totalRounds += result.rounds;
    if (!sample) {
      sample = result;
    }
    allResults.push(result);
  }

  const analytics = analyzeSimulations(allResults, analysisOptions);

  return {
    runs,
    wins,
    winRateYou: wins.you / runs,
    averageRounds: totalRounds / runs,
    sample,
    analytics,
    seed: seedBase,
  };
}

const createPlayer = (hero: Hero): PlayerState => ({
  hero,
  hp: hero.maxHp,
  tokens: {},
});

const pickFirstPlayer = (
  rng: Rng,
  preference?: Side | "random"
): Side => {
  if (!preference || preference === "random") {
    return rng() < 0.5 ? "you" : "ai";
  }
  return preference;
};

const rollAttackDice = (
  player: PlayerState,
  rng: Rng
): { dice: number[] } => {
  let dice = Array.from({ length: 5 }, () => rollDie(rng));
  for (let attempt = 1; attempt < ROLLS_PER_ATTACK; attempt += 1) {
    const rollsRemaining = Math.max(0, ROLLS_PER_ATTACK - 1 - attempt);
    const hold =
      player.hero.ai.chooseHeld?.({
        dice,
        rollsRemaining,
        tokens: player.tokens,
        hero: player.hero,
      }) ?? [];
    if (hold.every(Boolean)) {
      break;
    }
    dice = dice.map((value, index) => (hold[index] ? value : rollDie(rng)));
  }
  return { dice };
};

const rollDefenseDice = (rng: Rng): number[] =>
  Array.from({ length: DEFENSE_DICE_COUNT }, () => rollDie(rng));

const combosFromMap = (map: Record<Combo, boolean>): Combo[] =>
  (Object.keys(map) as Combo[]).filter((combo) => map[combo]);

const chooseAttackAbility = (
  attacker: PlayerState,
  defender: PlayerState,
  dice: number[],
  combos: Combo[],
  round: number,
  side: Side,
  policy?: Policy
): { ability: OffensiveAbility | null } => {
  const snapshot = snapshotPlayer(attacker);
  const opponentSnapshot = snapshotPlayer(defender);
  if (policy) {
    const decision = policy({
      phase: "attack",
      side,
      round,
      dice,
      combos,
      self: snapshot,
      opponent: opponentSnapshot,
    });
    if (decision?.combo === null) {
      return { ability: null };
    }
    if (decision?.combo && combos.includes(decision.combo)) {
      const ability = attacker.hero.offensiveBoard[decision.combo];
      if (ability) {
        return { ability };
      }
    }
  }
  return { ability: bestAbility(attacker.hero, dice) };
};

const chooseDefenseAbility = (
  defender: PlayerState,
  attacker: PlayerState,
  dice: number[],
  combos: Combo[],
  round: number,
  side: Side,
  incoming: OffensiveAbility | null,
  policy?: Policy
): DefensiveAbility | null => {
  const snapshot = snapshotPlayer(defender);
  const opponentSnapshot = snapshotPlayer(attacker);
  if (policy) {
    const decision = policy({
      phase: "defense",
      side,
      round,
      dice,
      combos,
      self: snapshot,
      opponent: opponentSnapshot,
      incomingAbility: incoming ?? undefined,
    });
    if (decision?.combo === null) {
      return null;
    }
    if (decision?.combo && combos.includes(decision.combo)) {
      const ability = defender.hero.defensiveBoard[decision.combo];
      if (ability) {
        return ability;
      }
    }
  }
  const options = combos
    .map((combo) => defender.hero.defensiveBoard[combo])
    .filter((ability): ability is DefensiveAbility => Boolean(ability));
  if (!options.length) return null;
  return options
    .slice()
    .sort((a, b) => (b.block ?? 0) - (a.block ?? 0))[0];
};

const snapshotPlayer = (player: PlayerState): PlayerSnapshot => ({
  heroId: player.hero.id as HeroId,
  hp: player.hp,
  tokens: { ...(player.tokens ?? {}) },
});

const diffTokens = (
  before: PlayerState,
  after: PlayerState
): Record<string, number> => {
  const beforeTokens = before.tokens ?? {};
  const afterTokens = after.tokens ?? {};
  const diff: Record<string, number> = {};
  const keys = new Set([
    ...Object.keys(beforeTokens),
    ...Object.keys(afterTokens),
  ]);
  keys.forEach((key) => {
    const delta = (afterTokens[key] ?? 0) - (beforeTokens[key] ?? 0);
    if (delta !== 0) {
      diff[key] = delta;
    }
  });
  return diff;
};

const resolveAttackTurn = ({
  attackerSide,
  attacker,
  defender,
  offensiveAbility,
  defensiveAbility,
  attackDice,
  defenseDice,
  rng,
  log,
  balance,
}: {
  attackerSide: Side;
  attacker: PlayerState;
  defender: PlayerState;
  offensiveAbility: OffensiveAbility | null;
  defensiveAbility: DefensiveAbility | null;
  attackDice: number[];
  defenseDice: number[];
  rng: Rng;
  log: (line: string) => void;
  balance?: BalanceAdjustments;
}) => {
  const notes: string[] = [];
  const defenderSide: Side = attackerSide === "you" ? "ai" : "you";
  if (!offensiveAbility) {
    notes.push("No combo available.");
    return {
      attacker,
      defender,
      damageDealt: 0,
      damageBlocked: 0,
      damagePrevented: 0,
      reflected: 0,
      chiAttackSpend: 0,
      chiBlock: 0,
      evasiveUsed: false,
      evasiveSuccess: false,
      baseDamage: null,
      modifiedDamage: null,
      defenseAbilityId: null,
      attackerStatusDiff: {},
      defenderStatusDiff: {},
      notes,
    };
  }

  let workingAttacker = attacker;
  let workingDefender = defender;

  const baseDamage = offensiveAbility.damage;
  let damage = baseDamage;
  const damageAdjust =
    balance?.damageDelta?.[attackerSide] ?? 0;
  if (damageAdjust !== 0) {
    damage = Math.max(0, damage + damageAdjust);
  }
  const chiStacks = getStacks(workingAttacker.tokens, "chi", 0);
  let chiAttackSpend = 0;
  if (chiStacks > 0) {
    const spend = Math.min(chiStacks, Math.max(0, workingDefender.hp - damage));
    if (spend > 0) {
      damage += spend;
      chiAttackSpend = spend;
      workingAttacker = {
        ...workingAttacker,
        tokens: setStacks(workingAttacker.tokens, "chi", chiStacks - spend),
      };
      notes.push(`Spent ${spend} Chi for +${spend} damage.`);
    }
  }

  const evasive = tryEvasive(workingDefender, rng);
  workingDefender = evasive.player;
  if (evasive.negated) {
    notes.push(`Evasive roll ${evasive.roll} negates attack.`);
    const statusResult = applyOffensiveStatuses(
      workingAttacker,
      workingDefender,
      offensiveAbility
    );
    workingAttacker = statusResult.attacker;
    workingDefender = statusResult.defender;
    return {
      attacker: workingAttacker,
      defender: workingDefender,
      damageDealt: 0,
      damageBlocked: damage,
      damagePrevented: damage,
      reflected: 0,
      chiAttackSpend,
      chiBlock: 0,
      evasiveUsed: true,
      evasiveSuccess: true,
      baseDamage,
      modifiedDamage: damage,
      defenseAbilityId: null,
      attackerStatusDiff: diffTokens(attacker, workingAttacker),
      defenderStatusDiff: diffTokens(defender, workingDefender),
      notes,
    };
  }

  const baseBlock = defensiveAbility?.block ?? 0;
  const adjustedBaseBlock = Math.max(
    0,
    baseBlock + (balance?.blockDelta?.[defenderSide] ?? 0)
  );
  const chiDefStacks = getStacks(workingDefender.tokens, "chi", 0);
  const chiBlock = Math.min(
    chiDefStacks,
    Math.max(0, damage - adjustedBaseBlock)
  );
  if (chiBlock > 0) {
    workingDefender = {
      ...workingDefender,
      tokens: setStacks(workingDefender.tokens, "chi", chiDefStacks - chiBlock),
    };
    notes.push(`Defender spends ${chiBlock} Chi for +${chiBlock} block.`);
  }
  const totalBlock = adjustedBaseBlock + chiBlock;
  const reflected = defensiveAbility?.reflect ?? 0;
  const heal = defensiveAbility?.heal ?? 0;

  const net = Math.max(0, damage - totalBlock);
  const blocked = Math.min(damage, totalBlock);

  workingDefender = {
    ...workingDefender,
    hp: Math.min(
      workingDefender.hero.maxHp,
      Math.max(0, workingDefender.hp - net) + heal
    ),
  };
  workingAttacker = {
    ...workingAttacker,
    hp: Math.max(0, workingAttacker.hp - reflected),
  };

  if (heal > 0) {
    notes.push(`Defense heals ${heal}.`);
  }
  if (reflected > 0) {
    notes.push(`Defense reflects ${reflected} damage.`);
  }

  workingDefender = gainDefenseStatuses(workingDefender, defensiveAbility);
  const updated = applyOffensiveStatuses(
    workingAttacker,
    workingDefender,
    offensiveAbility
  );
  const attackerStatusDiff = diffTokens(attacker, updated.attacker);
  const defenderStatusDiff = diffTokens(defender, updated.defender);

  log(
    `[${attackerSide}] ${offensiveAbility.combo} hits for ${net} (blocked ${blocked}).`
  );

  return {
    attacker: updated.attacker,
    defender: updated.defender,
    damageDealt: net,
    damageBlocked: blocked,
    damagePrevented: 0,
    reflected,
    chiAttackSpend,
    chiBlock,
    evasiveUsed: evasive.roll !== null,
    evasiveSuccess: false,
    baseDamage,
    modifiedDamage: damage,
    defenseAbilityId: defensiveAbility
      ? `${defender.hero.id}:${defensiveAbility.combo}`
      : null,
    attackerStatusDiff,
    defenderStatusDiff,
    notes,
  };
};

const tryEvasive = (
  defender: PlayerState,
  rng: Rng
): { player: PlayerState; negated: boolean; roll: number | null } => {
  const stacks = getStacks(defender.tokens, "evasive", 0);
  if (stacks <= 0) {
    return { player: defender, negated: false, roll: null };
  }
  const roll = rollDie(rng);
  const success = roll >= 5;
  const next = setStacks(defender.tokens, "evasive", stacks - 1);
  return {
    player: { ...defender, tokens: next },
    negated: success,
    roll,
  };
};

const gainDefenseStatuses = (
  defender: PlayerState,
  ability: DefensiveAbility | null
): PlayerState => {
  if (!ability?.apply) return defender;
  let tokens = defender.tokens;
  Object.entries(ability.apply).forEach(([id, delta]) => {
    if (typeof delta !== "number" || delta === 0) return;
    tokens = addStacks(tokens, id, delta);
  });
  if (tokens === defender.tokens) return defender;
  return { ...defender, tokens };
};

const applyOffensiveStatuses = (
  attacker: PlayerState,
  defender: PlayerState,
  ability: OffensiveAbility
): { attacker: PlayerState; defender: PlayerState } => {
  if (!ability.apply && !ability.applyPostDamage && !ability.applyPreDamage) {
    return { attacker, defender };
  }
  let workingAttacker = attacker;
  let workingDefender = defender;
  if (ability.applyPreDamage) {
    const result = applyAbilityEffects(attacker, defender, ability.applyPreDamage);
    workingAttacker = result.attacker;
    workingDefender = result.defender;
  }
  const post = ability.applyPostDamage ?? ability.apply;
  if (post) {
    const result = applyAbilityEffects(workingAttacker, workingDefender, post);
    workingAttacker = result.attacker;
    workingDefender = result.defender;
  }
  return { attacker: workingAttacker, defender: workingDefender };
};

const applyUpkeep = (
  players: Record<Side, PlayerState>,
  side: Side,
  rng: Rng,
  log: (line: string) => void,
  statusStats: StatusStats,
  statusDamageEvents: StatusDamageEvent[],
  round: number
): boolean => {
  const player = players[side];
  const opponent = players[side === "you" ? "ai" : "you"];
  const { next, totalDamage, breakdown } = tickStatuses(player.tokens ?? {});
  player.tokens = next;
  if (totalDamage > 0) {
    player.hp = Math.max(0, player.hp - totalDamage);
    log(`[${side}] Upkeep deals ${totalDamage}.`);
  }
  if (breakdown) {
    Object.entries(breakdown).forEach(([statusId, dmg]) => {
      addToMap(statusStats.damage, statusId, dmg);
      statusDamageEvents.push({
        target: side,
        source: side === "you" ? "ai" : "you",
        statusId,
        amount: dmg,
        round,
      });
    });
  }
  attemptTransferStatuses(player, opponent, rng, log, side);
  return player.hp > 0;
};

const attemptTransferStatuses = (
  owner: PlayerState,
  opponent: PlayerState,
  rng: Rng,
  log: (line: string) => void,
  side: Side
) => {
  Object.entries(owner.tokens).forEach(([rawId, stacks]) => {
    if ((stacks ?? 0) <= 0) return;
    const statusId = rawId as StatusId;
    const def = getStatus(statusId);
    const transfer = def?.transfer;
    if (!transfer) return;
    const consume = transfer.consumeStacks ?? 1;
    if (stacks < consume) return;
    const target = pickTransferTarget(owner.tokens, transfer);
    if (!target) return;
    const dieSize = Math.max(2, Math.floor(transfer.dieSize ?? 6));
    const threshold = transfer.rollThreshold ?? 4;
    const roll = 1 + Math.floor(rng() * dieSize);
    owner.tokens = setStacks(owner.tokens, statusId, stacks - consume);
    if (roll >= threshold) {
      const move = Math.min(transfer.transferStacks ?? 1, target.stacks);
      owner.tokens = setStacks(owner.tokens, target.id, target.stacks - move);
      if ((transfer.mode ?? "transfer") === "transfer" && move > 0) {
        opponent.tokens = addStacks(opponent.tokens, target.id, move);
      }
      log(`[${side}] ${def?.name ?? statusId} transfers ${move} ${target.id}.`);
    } else {
      log(`[${side}] ${def?.name ?? statusId} failed transfer (roll ${roll}).`);
    }
  });
};

const pickTransferTarget = (
  tokens: Record<string, number>,
  config: NonNullable<StatusDef["transfer"]>
): { id: StatusId; stacks: number } | null => {
  const candidates = Object.entries(tokens)
    .filter(([, stacks]) => (stacks ?? 0) > 0)
    .map(([id, stacks]) => {
      const def = getStatus(id);
      return def ? { id: id as StatusId, stacks: stacks ?? 0, def } : null;
    })
    .filter(
      (
        entry
      ): entry is { id: StatusId; stacks: number; def: StatusDef } => Boolean(entry)
    )
    .filter((entry) => {
      if (entry.def.polarity !== config.targetPolarity) return false;
      if (
        config.allowedStatuses &&
        !config.allowedStatuses.includes(entry.id)
      ) {
        return false;
      }
      if (entry.def.attachment?.transferable === false) return false;
      return true;
    })
    .sort((a, b) => b.stacks - a.stacks);
  if (!candidates.length) return null;
  return { id: candidates[0].id, stacks: candidates[0].stacks };
};

const syncStatusTimers = (
  statusStats: StatusStats,
  timers: Record<Side, Record<StatusId, number | null>>,
  side: Side,
  tokens: Record<string, number>,
  round: number
) => {
  TRACKED_STATUSES.forEach((id) => {
    const stacks = getStacks(tokens, id, 0);
    const activeSince = timers[side][id];
    if (stacks > 0 && activeSince == null) {
      timers[side][id] = round;
    } else if (stacks <= 0 && activeSince != null) {
      const samples = ensureArrayMap(statusStats.lifetimes, id);
      samples.push(Math.max(1, round - activeSince));
      timers[side][id] = null;
    }
  });
};

const flushStatusTimers = (
  statusStats: StatusStats,
  timers: Record<Side, Record<StatusId, number | null>>,
  round: number
) => {
  (["you", "ai"] as Side[]).forEach((side) => {
    TRACKED_STATUSES.forEach((id) => {
      const activeSince = timers[side][id];
      if (activeSince != null) {
        const samples = ensureArrayMap(statusStats.lifetimes, id);
        samples.push(Math.max(1, round - activeSince));
        timers[side][id] = null;
      }
    });
  });
};
