#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { Side } from "../game/types";
import { HEROES } from "../game/heroes";
import { runMany, type SimulationOptions, type BalanceAdjustments } from "./simulator";
import { BUILD_HASH, HERO_VERSION_MAP, RULES_VERSION } from "../config/buildInfo";
import {
  appendReportIndex,
  buildAbilityHistoryMap,
  readReportIndex,
  writeReportIndex,
} from "./history";
import {
  DEFAULT_POLICY_ID,
  HISTORY_LOOKBACK,
  RNG_IMPLEMENTATION,
  SIM_VERSION,
} from "./meta";

type CliConfig = {
  games: number;
  seed?: number;
  youHeroId?: string;
  aiHeroId?: string;
  first?: "you" | "ai" | "random";
  showSample: boolean;
  jsonPath?: string;
};

const helpText = `Usage: npm run sim -- [options]

Options:
  --games <n>        Number of simulations to run (default 1000)
  --seed <n>         Base seed used for RNG
  --you <heroId>     Hero ID for the player (default "Pyromancer")
  --ai <heroId>      Hero ID for the opponent (default "Shadow Monk")
  --first <side>     Force first player: "you", "ai", or "random"
  --sample           Print the first game's summary + last turn log
  --json <path>      Also emit the report as JSON (use "-" for stdout)
  --help             Show this message
`;

const parseArgs = (): CliConfig => {
  const args = process.argv.slice(2);
  const config: CliConfig = {
    games: 1000,
    showSample: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--help":
      case "-h":
        console.log(helpText);
        process.exit(0);
        break;
      case "--games":
        config.games = parseInt(args[++i] ?? "", 10);
        break;
      case "--seed":
        config.seed = parseInt(args[++i] ?? "", 10);
        break;
      case "--you":
        config.youHeroId = args[++i];
        break;
      case "--ai":
        config.aiHeroId = args[++i];
        break;
      case "--first":
        config.first = (args[++i] as CliConfig["first"]) ?? "random";
        break;
      case "--sample":
        config.showSample = true;
        break;
      case "--json":
        config.jsonPath = args[++i];
        break;
      default:
        if (arg.startsWith("--games=")) {
          config.games = parseInt(arg.split("=")[1], 10);
        } else if (arg.startsWith("--seed=")) {
          config.seed = parseInt(arg.split("=")[1], 10);
        } else if (arg.startsWith("--you=")) {
          config.youHeroId = arg.split("=")[1];
        } else if (arg.startsWith("--ai=")) {
          config.aiHeroId = arg.split("=")[1];
        } else if (arg.startsWith("--first=")) {
          config.first = arg.split("=")[1] as CliConfig["first"];
        } else if (arg.startsWith("--json=")) {
          config.jsonPath = arg.split("=")[1];
        } else {
          console.warn(`Unknown option: ${arg}`);
        }
        break;
    }
  }

  if (!Number.isFinite(config.games) || config.games <= 0) {
    throw new Error("Invalid --games value.");
  }

  return config;
};

const slugify = (value: string): string => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "ability";
};

const main = () => {
  const args = parseArgs();
  const simOptions: SimulationOptions = {
    youHeroId: args.youHeroId as SimulationOptions["youHeroId"],
    aiHeroId: args.aiHeroId as SimulationOptions["aiHeroId"],
    firstPlayer: args.first,
  };
  const youHeroId = args.youHeroId ?? "Pyromancer";
  const aiHeroId = args.aiHeroId ?? "Shadow Monk";
  const youHeroName = HEROES[youHeroId]?.name ?? youHeroId;
  const aiHeroName = HEROES[aiHeroId]?.name ?? aiHeroId;
  const policyId = DEFAULT_POLICY_ID;
  const reportsDir = resolve(process.cwd(), "reports", BUILD_HASH);
  const indexPath = resolve(reportsDir, "index.json");
  const existingIndex = readReportIndex(indexPath);
  const abilityHistory = buildAbilityHistoryMap(existingIndex, {
    youHeroId,
    aiHeroId,
    policyId,
    limit: HISTORY_LOOKBACK,
  });

  const result = runMany(
    args.games,
    { ...simOptions, seed: args.seed },
    { abilityHistory }
  );
  console.log(`Simulations: ${result.runs}`);
  console.log(`You wins: ${result.wins.you}`);
  console.log(`AI wins: ${result.wins.ai}`);
  console.log(`Draws: ${result.wins.draw}`);
  console.log(`Win rate (you): ${(result.winRateYou * 100).toFixed(2)}%`);
  console.log(`Avg rounds: ${result.averageRounds.toFixed(2)}`);
  console.log(`Matchup: you=${youHeroName}, ai=${aiHeroName}`);
  console.log(
    `Win rate 95% CI: [${(result.analytics.winRateCi.lower * 100).toFixed(
      2
    )}%, ${(result.analytics.winRateCi.upper * 100).toFixed(2)}%]`
  );

  printInitiativeSection(result.analytics.initiative);
  printInitiativeBreakdown(result.analytics.initiativeBreakdown);
  printTtkSection(result.analytics.ttk);
  printDprSection(result.analytics.dpr);
  printSwingSection(result.analytics.damageSwing);
  printMitigationSection(result.analytics.mitigation);
  printStatusSection(result.analytics.statuses);
  printAbilitySection(result.analytics.abilityTiering);
  printConvergence(result.analytics.convergence);

  if (args.showSample && result.sample) {
    console.log("\nSample game:");
    console.log(
      `  winner=${result.sample.winner}, rounds=${result.sample.rounds}, youHP=${result.sample.hp.you}, aiHP=${result.sample.hp.ai}`
    );
    const lastTurn = result.sample.history[result.sample.history.length - 1];
    if (lastTurn) {
      console.log(
        `  last turn: ${lastTurn.side} played ${lastTurn.combo ?? "none"} for ${
          lastTurn.damageDealt
        } dmg`
      );
      lastTurn.notes.forEach((note) => console.log(`    - ${note}`));
    }
  }

  const elasticity = runElasticitySweep(
    simOptions,
    args,
    result.seed,
    {
      winRate: result.winRateYou,
      lethal5: result.analytics.damageSwing.lethalFromHp[5] ?? 0,
    }
  );
  printElasticity(elasticity);

  const timestamp = Date.now();
  const header = {
    simVersion: SIM_VERSION,
    policyId,
    rng: RNG_IMPLEMENTATION,
    seed: result.seed,
    rulesVersion: RULES_VERSION,
    buildHash: BUILD_HASH,
    heroVersions: HERO_VERSION_MAP,
    timestamp,
  };
  const payload: JsonReport = {
    header,
    matchup: {
      youHeroId,
      youHeroName,
      aiHeroId,
      aiHeroName,
      firstPlayer: result.sample?.meta.firstPlayer ?? null,
    },
    summary: {
      games: result.runs,
      wins: result.wins,
      winRateYou: result.winRateYou,
      averageRounds: result.averageRounds,
      seed: result.seed,
    },
    analytics: result.analytics,
    sample: result.sample ?? null,
    elasticity,
  };

  mkdirSync(reportsDir, { recursive: true });
  const canonicalName = `${timestamp}_${slugify(youHeroId)}_vs_${slugify(
    aiHeroId
  )}_${args.games}.json`;
  const canonicalPath = resolve(reportsDir, canonicalName);
  emitJsonReport(canonicalPath, payload);

  const abilityVerdicts = Object.fromEntries(
    result.analytics.abilityTiering.abilities.map((ability) => [
      ability.abilityId,
      {
        verdict: ability.verdict,
        evEff: ability.evEff,
        score: ability.score,
      },
    ])
  );
  const nextIndex = appendReportIndex(existingIndex, {
    path: relative(process.cwd(), canonicalPath),
    timestamp,
    youHeroId,
    aiHeroId,
    policyId,
    games: args.games,
    abilityVerdicts,
  });
  writeReportIndex(indexPath, nextIndex);

  if (args.jsonPath) {
    if (args.jsonPath === "-") {
      emitJsonReport("-", payload);
    } else {
      const resolved = resolve(process.cwd(), args.jsonPath);
      if (resolved !== canonicalPath) {
        emitJsonReport(resolved, payload);
      }
    }
  }
};

main();

function printInitiativeSection(
  buckets: ReturnType<typeof runMany>["analytics"]["initiative"]
) {
  console.log("\nInitiative Winrate (95% CI)");
  buckets.forEach((bucket) => {
    const winrate =
      bucket.games > 0 ? (bucket.wins / bucket.games) * 100 : 0;
    console.log(
      `- ${bucket.heroName}: ${winrate.toFixed(1)}% [${(
        bucket.ci.lower * 100
      ).toFixed(1)}, ${(bucket.ci.upper * 100).toFixed(
        1
      )}] over ${bucket.games} games`
    );
  });
}

function printTtkSection(ttk: ReturnType<typeof runMany>["analytics"]["ttk"]) {
  console.log("\nTTK (rounds)");
  console.log(
    `- Avg: ${ttk.average.toFixed(2)}, Median: ${ttk.median.toFixed(
      2
    )}, IQR: ${ttk.iqr.toFixed(2)}`
  );
  const histPreview = ttk.histogram.slice(0, 6);
  console.log(
    `- Histogram (rounds -> games): ${histPreview
      .map((entry) => `${entry.round}:${entry.games}`)
      .join(", ")}${ttk.histogram.length > histPreview.length ? " ..." : ""}`
  );
}

function printDprSection(
  dpr: ReturnType<typeof runMany>["analytics"]["dpr"]
) {
  console.log("\nDPR (damage per attack turn)");
  (["you", "ai"] as Side[]).forEach((side) => {
    console.log(
      `- ${side.toUpperCase()}: attack-only ${dpr[side].attackOnly.toFixed(
        2
      )}, actual ${dpr[side].actual.toFixed(2)}`
    );
  });
}

function printSwingSection(
  swing: ReturnType<typeof runMany>["analytics"]["damageSwing"]
) {
  console.log("\nDamage Swing & Lethals");
  console.log(
    `- Avg swing per round: ${swing.averageSwing.toFixed(
      2
    )}, avg max swing: ${swing.averageMaxSwing.toFixed(2)}`
  );
  console.log(
    `- Lethal probabilities: ${Object.entries(swing.lethalFromHp)
      .map(([hp, prob]) => `>=${hp} HP: ${(prob * 100).toFixed(1)}%`)
      .join(", ")}`
  );
}

function printMitigationSection(
  mitigation: ReturnType<typeof runMany>["analytics"]["mitigation"]
) {
  console.log("\nMitigation");
  (["you", "ai"] as Side[]).forEach((side) => {
    console.log(
      `- ${side.toUpperCase()}: blocked ${(mitigation.blockedPercent[
        side
      ] * 100).toFixed(1)}%, prevented ${(mitigation.preventedPercent[
        side
      ] * 100).toFixed(1)}%`
    );
  });
  console.log("- Defense vs top attacks:");
  mitigation.defenseVsTopAbilities.forEach((entry) => {
    console.log(
      `  - ${entry.label}: ${
        entry.successRate != null
          ? `${(entry.successRate * 100).toFixed(1)}% success`
          : "n/a"
      }`
    );
  });
}

function printStatusSection(
  statuses: ReturnType<typeof runMany>["analytics"]["statuses"]
) {
  console.log("\nStatuses");
  Object.entries(statuses).forEach(([id, data]) => {
    console.log(
      `- ${id}: applied ${data.applied}, dmg ${data.damage.toFixed(
        1
      )}, mitigation ${data.mitigation.toFixed(1)}, avg lifetime ${
        data.avgLifetime != null ? data.avgLifetime.toFixed(2) : "n/a"
      }`
    );
  });
}

function printAbilitySection(
  tiering: ReturnType<typeof runMany>["analytics"]["abilityTiering"]
) {
  console.log("\nAbility Tiering (top 5 by score)");
  const top = tiering.abilities
    .filter((a) => a.uses > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  top.forEach((ability) => {
    const ciText = ability.evEffCi
      ? `[${ability.evEffCi[0].toFixed(2)}, ${ability.evEffCi[1].toFixed(
          2
        )}]`
      : "n/a";
    console.log(
      `- ${ability.label}: ${ability.verdict}${
        ability.hysteresisLocked ? " (locked)" : ""
      }, score ${ability.score.toFixed(2)}, pick ${(
        ability.pickRate * 100
      ).toFixed(1)}%, EV_eff ${ability.evEff.toFixed(2)} ${ciText}, uplift ${
        ability.uplift != null ? ability.uplift.toFixed(3) : "n/a"
      }`
    );
    if (ability.notes) {
      console.log(`    note: ${ability.notes}`);
    }
  });
  const printVerdictList = (
    label: string,
    entries: typeof tiering.trap
  ) => {
    if (!entries.length) return;
    console.log(`\n${label}:`);
    entries.forEach((entry) => {
      console.log(
        `  - ${entry.label} (${(entry.pickRate * 100).toFixed(
          1
        )}% pick, score ${entry.score.toFixed(2)})`
      );
    });
  };
  printVerdictList("Trap abilities", tiering.trap);
  printVerdictList("Overtuned abilities", tiering.overtuned);
  printVerdictList("Watchlist", tiering.watchlist);
  printVerdictList("Niche abilities", tiering.niche);
}

function printInitiativeBreakdown(
  breakdown: ReturnType<typeof runMany>["analytics"]["initiativeBreakdown"]
) {
  console.log("\nInitiative Split Metrics");
  (["first", "second"] as const).forEach((role) => {
    const label = role === "first" ? "First player" : "Second player";
    const data = breakdown[role];
    console.log(
      `- ${label}: DPR attack-only ${data.dpr.attackOnly.toFixed(
        2
      )}, actual ${data.dpr.actual.toFixed(2)}`
    );
    console.log(
      `  Mitigation blocked ${(data.mitigation.blockedPercent * 100).toFixed(
        1
      )}%, prevented ${(data.mitigation.preventedPercent * 100).toFixed(1)}%`
    );
    const statusEntries = Object.entries(data.statuses);
    if (statusEntries.length) {
      const summary = statusEntries
        .map(
          ([id, stat]) =>
            `${id} (applied ${stat.applied}, dmg ${stat.damage.toFixed(
              1
            )}, mit ${stat.mitigation.toFixed(1)})`
        )
        .join("; ");
      console.log(`  Status impact: ${summary}`);
    }
  });
}

function printConvergence(
  convergence: ReturnType<typeof runMany>["analytics"]["convergence"]
) {
  if (!convergence.length) return;
  console.log("\nWinrate Convergence (games -> win%)");
  const preview = convergence.slice(0, 10);
  console.log(
    preview
      .map(
        (entry) =>
          `${entry.games}:${(entry.winRate * 100).toFixed(1)}`
      )
      .join(", ") +
      (convergence.length > preview.length ? " ..." : "")
  );
}

type ElasticityRow = {
  metric: "damage" | "block";
  delta: number;
  winRate: number;
  winRateDelta: number;
  lethal5: number;
  lethal5Delta: number;
};

function runElasticitySweep(
  baseOptions: SimulationOptions,
  cliArgs: CliConfig,
  seed: number,
  baseline: { winRate: number; lethal5: number }
): ElasticityRow[] {
  const variants: Array<{
    metric: "damage" | "block";
    delta: number;
    balance: BalanceAdjustments;
  }> = [
    {
      metric: "damage",
      delta: -1,
      balance: { damageDelta: { you: -1 } },
    },
    { metric: "damage", delta: 1, balance: { damageDelta: { you: 1 } } },
    { metric: "block", delta: -1, balance: { blockDelta: { you: -1 } } },
    { metric: "block", delta: 1, balance: { blockDelta: { you: 1 } } },
  ];

  return variants.map((variant) => {
    const variantOptions: SimulationOptions = {
      ...baseOptions,
      balance: mergeBalance(baseOptions.balance, variant.balance),
    };
    const variantResult = runMany(cliArgs.games, {
      ...variantOptions,
      seed,
    });
    const winRate = variantResult.winRateYou;
    const lethal5 =
      variantResult.analytics.damageSwing.lethalFromHp[5] ?? 0;
    return {
      metric: variant.metric,
      delta: variant.delta,
      winRate,
      winRateDelta: winRate - baseline.winRate,
      lethal5,
      lethal5Delta: lethal5 - baseline.lethal5,
    };
  });
}

function formatDelta(value: number, multiplier = 100) {
  return `${value >= 0 ? "+" : ""}${(value * multiplier).toFixed(2)}%`;
}

function printElasticity(rows: ElasticityRow[]) {
  if (!rows.length) return;
  console.log("\nElasticity Sweep (Δ winrate, Δ lethal>=5HP)");
  rows.forEach((row) => {
    console.log(
      `- ${row.metric} ${row.delta > 0 ? "+" : ""}${row.delta}: win ${formatDelta(
        row.winRateDelta
      )}, lethal>=5 ${formatDelta(row.lethal5Delta)}`
    );
  });
}

function mergeBalance (
  base: BalanceAdjustments | undefined,
  addition: BalanceAdjustments
): BalanceAdjustments {
  return {
    damageDelta: mergeDelta(base?.damageDelta, addition.damageDelta),
    blockDelta: mergeDelta(base?.blockDelta, addition.blockDelta),
  };
}

function mergeDelta (
  first?: Partial<Record<Side, number>>,
  second?: Partial<Record<Side, number>>
): Partial<Record<Side, number>> | undefined {
  if (!first && !second) return undefined;
  const result: Partial<Record<Side, number>> = { ...(first ?? {}) };
  if (second) {
    Object.entries(second).forEach(([key, value]) => {
      if (value == null) return;
      const side = key as Side;
      result[side] = (result[side] ?? 0) + value;
    });
  }
  return Object.keys(result).length ? result : undefined;
}

type JsonReport = {
  header: {
    simVersion: string;
    policyId: string;
    rng: string;
    seed: number;
    rulesVersion: string;
    buildHash: string;
    heroVersions: Record<string, string>;
    timestamp: number;
  };
  matchup: {
    youHeroId: string;
    youHeroName: string;
    aiHeroId: string;
    aiHeroName: string;
    firstPlayer?: string | null;
  };
  summary: {
    games: number;
    wins: ReturnType<typeof runMany>["wins"];
    winRateYou: number;
    averageRounds: number;
    seed: number;
  };
  analytics: ReturnType<typeof runMany>["analytics"];
  sample: ReturnType<typeof runMany>["sample"] | null;
  elasticity: ElasticityRow[];
};

function emitJsonReport(
  destination: string,
  payload: JsonReport
) {
  const output = JSON.stringify(payload, null, 2);
  if (destination === "-" || destination === "") {
    console.log("\nJSON report:");
    console.log(output);
    return;
  }
  const resolved = resolve(process.cwd(), destination);
  const dir = dirname(resolved);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolved, output, "utf-8");
  console.log(`\nJSON report saved to ${resolved}`);
}
