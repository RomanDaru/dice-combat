import { useCallback, type MutableRefObject } from "react";
import {
  evaluateDefenseRoll,
  resolveDefenseSelection,
  selectDefenseOptionByCombo,
  selectHighestBlockOption,
} from "../game/combat/defenseBoard";
import { buildDefensePlan } from "../game/combat/defensePipeline";
import {
  isDefenseSchemaEnabled,
  resolveDefenseSchemaRoll,
} from "../game/combat/defenseSchemaRuntime";
import { listPreDefenseReactions } from "../game/combat/preDefenseReactions";
import { resolveAttack } from "../engine/resolveAttack";
import {
  aggregateStatusSpendSummaries,
  createStatusSpendSummary,
  getStatus,
  spendStatus,
  type StatusId,
  type StatusSpendSummary,
} from "../engine/status";
import type { StatusTimingPhase } from "../engine/status/types";
import type { GameState } from "../game/state";
import type { OffensiveAbility, PlayerState, Side, Hero } from "../game/types";
import {
  combineDefenseSpends,
  extractDefenseAbilityName,
  formatAbilityName,
  type DefenseSelectionCarrier,
} from "./defenseActions.helpers";
import type { DefenseResolutionHandler } from "./useDefenseResolution";

type UseAiDefenseResponseArgs = {
  setDefenseStatusMessage: (message: string | null) => void;
  setDefenseStatusRollDisplay: (
    display: {
      dice: number[];
      inProgress: boolean;
      label: string | null;
      outcome: "success" | "failure" | null;
    } | null
  ) => void;
  setPhase: (phase: GameState["phase"]) => void;
  openDiceTray: () => void;
  closeDiceTray: () => void;
  animateDefenseRoll: (
    onDone: (dice: number[]) => void,
    duration?: number,
    options?: {
      animateSharedDice?: boolean;
      onTick?: (dice: number[]) => void;
    }
  ) => void;
  animateDefenseDie: (
    onDone: (roll: number) => void,
    duration?: number,
    options?: {
      animateSharedDice?: boolean;
      onTick?: (value: number) => void;
    }
  ) => void;
  pushLog: (
    entry: string | string[],
    options?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
  ) => void;
  patchAiDefense: (partial: Partial<GameState["aiDefense"]>) => void;
  consumeStatusBudget: (side: Side, statusId: StatusId, amount: number) => void;
  getStatusBudget: (side: Side, statusId: StatusId) => number;
  scheduleCallback: (durationMs: number, callback: () => void) => () => void;
  pendingDefenseSpendsRef: MutableRefObject<StatusSpendSummary[]>;
  resolveDefenseWithEvents: DefenseResolutionHandler;
  setPlayer: (side: Side, player: PlayerState) => void;
  queuePendingDefenseGrants: (payload: {
    grants: DefenseStatusGrant[];
    attackerSide: Side;
    defenderSide: Side;
  }) => void;
  triggerDefenseBuffs: (phase: StatusTimingPhase, owner: Side) => void;
  applyDefenseVersionOverride: (hero: Hero) => Hero;
};

type AiDefenseRequest = {
  attacker: PlayerState;
  defender: PlayerState;
  attackerSide: Side;
  defenderSide: Side;
  effectiveAbility: OffensiveAbility;
  baseDamage: number;
  attackStatusSpends: StatusSpendSummary[];
  reactionStatusId: StatusId | null;
};

const getDefenseBonusPerStack = (statusId: StatusId) => {
  const def = getStatus(statusId);
  if (!def || def.behaviorId !== "bonus_pool") return null;
  const config = def.behaviorConfig as
    | {
        defense?: {
          bonusBlockPerStack?: number;
        };
      }
    | undefined;
  const value = config?.defense?.bonusBlockPerStack;
  return typeof value === "number" && value > 0 ? value : null;
};

const buildDefenseSpendRequests = (
  defender: PlayerState,
  incomingDamage: number,
  baseBlock: number,
  side: Side,
  getBudget: (side: Side, statusId: StatusId) => number
): Record<StatusId, number> => {
  const desiredBlock = Math.max(0, incomingDamage - baseBlock);
  if (desiredBlock <= 0) {
    return {};
  }
  const requests: Record<StatusId, number> = {};
  Object.entries(defender.tokens).forEach(([rawId, stacks]) => {
    if (stacks <= 0) return;
    const statusId = rawId as StatusId;
    const bonusPerStack = getDefenseBonusPerStack(statusId);
    if (!bonusPerStack) return;
    const def = getStatus(statusId);
    const spendDef = def?.spend;
    if (!spendDef?.allowedPhases.includes("defenseRoll")) return;
    const budget = spendDef.turnLimited
      ? Math.min(stacks, getBudget(side, statusId))
      : stacks;
    if (budget <= 0) return;
    const stacksNeeded = Math.ceil(desiredBlock / bonusPerStack);
    requests[statusId] = Math.min(stacksNeeded, budget);
  });
  return requests;
};

export function useAiDefenseResponse({
  setDefenseStatusMessage,
  setDefenseStatusRollDisplay,
  setPhase,
  openDiceTray,
  closeDiceTray,
  animateDefenseRoll,
  animateDefenseDie,
  pushLog,
  patchAiDefense,
  consumeStatusBudget,
  getStatusBudget,
  scheduleCallback,
  pendingDefenseSpendsRef,
  resolveDefenseWithEvents,
  setPlayer,
  queuePendingDefenseGrants,
  triggerDefenseBuffs,
  applyDefenseVersionOverride,
}: UseAiDefenseResponseArgs) {
  const resolveHeroForDefense = useCallback(
    (hero: Hero) => applyDefenseVersionOverride(hero),
    [applyDefenseVersionOverride]
  );
  const handleAiDefenseResponse = useCallback(
    ({
      attacker,
      defender,
      attackerSide,
      defenderSide,
      effectiveAbility,
      baseDamage,
      attackStatusSpends,
      reactionStatusId,
    }: AiDefenseRequest) => {
      const resolveAfterDefense = (
        defenderState: PlayerState,
        defenseResolution: ReturnType<typeof buildDefensePlan>["defense"] | null,
        additionalSpends: StatusSpendSummary[] = [],
        attackerOverride?: PlayerState
      ) => {
        triggerDefenseBuffs("postDefenseRoll", defenderSide);
        triggerDefenseBuffs("preApplyDamage", defenderSide);
        scheduleCallback(600, () => {
          closeDiceTray();
          const pendingSpends = pendingDefenseSpendsRef.current;
          pendingDefenseSpendsRef.current = [];
          const mergedResolution = combineDefenseSpends(defenseResolution, [
            ...pendingSpends,
            ...additionalSpends,
          ]);
          const resolution = resolveAttack({
            source: attackerSide === "you" ? "player" : "ai",
            attackerSide,
            defenderSide,
            attacker: attackerOverride ?? attacker,
            defender: defenderState,
            ability: effectiveAbility,
            baseDamage,
            attackStatusSpends,
            defense: {
              resolution: mergedResolution,
            },
          });
          const defenseAbilityName = extractDefenseAbilityName(
            mergedResolution as DefenseSelectionCarrier | null
          );

          resolveDefenseWithEvents(resolution, {
            attackerSide,
            defenderSide,
            attackerName: (attackerOverride ?? attacker).hero.name,
            defenderName: defenderState.hero.name,
            abilityName: formatAbilityName(effectiveAbility),
            defenseAbilityName,
          });
        });
      };

      const runDefenseRoll = (
        defenderState: PlayerState,
        { showTray = false }: { showTray?: boolean } = {}
      ) => {
        triggerDefenseBuffs("preDefenseRoll", defenderSide);
        setDefenseStatusMessage(null);
        setDefenseStatusRollDisplay(null);
        setPhase("defense");
        if (showTray) {
          openDiceTray();
        }
        const defenseHero = resolveHeroForDefense(defenderState.hero);
        const useSchema = isDefenseSchemaEnabled(defenseHero);
        const defenseDiceCount =
          useSchema && defenseHero.defenseSchema ? defenseHero.defenseSchema.dice : undefined;
        animateDefenseRoll(
          (rolledDice) => {
            if (useSchema && defenseHero.defenseSchema) {
            const schemaOutcome = resolveDefenseSchemaRoll({
              hero: defenseHero,
              dice: rolledDice,
              attacker,
              defender: defenderState,
              incomingDamage: effectiveAbility.damage,
            });
            if (schemaOutcome.pendingStatusGrants.length) {
              pushLog(
                schemaOutcome.pendingStatusGrants.map((grant) => {
                  const targetName =
                    grant.target === "opponent"
                      ? attacker.hero.name
                      : defenderState.hero.name;
                  const timingLabel =
                    grant.usablePhase === "immediate"
                      ? "now"
                      : grant.usablePhase === "nextTurn"
                      ? "next turn"
                      : grant.usablePhase ?? "later";
                  return `[Status Pending] ${targetName} will gain ${grant.status} (${grant.stacks ?? 1} stack${
                    (grant.stacks ?? 1) === 1 ? "" : "s"
                  }) at ${timingLabel}.`;
                })
              );
              queuePendingDefenseGrants({
                grants: schemaOutcome.pendingStatusGrants,
                attackerSide,
                defenderSide,
              });
            }

              const defenderAfterSchema = schemaOutcome.updatedDefender;
              if (defenderAfterSchema !== defenderState) {
                setPlayer(defenderSide, defenderAfterSchema);
              }
              if (schemaOutcome.updatedAttacker !== attacker) {
                setPlayer(attackerSide, schemaOutcome.updatedAttacker);
              }

            const defenseSpendRequests = buildDefenseSpendRequests(
              defenderAfterSchema,
              effectiveAbility.damage,
              schemaOutcome.baseResolution.baseBlock,
              defenderSide,
              getStatusBudget
            );
              const defensePlan = buildDefensePlan({
                defender: defenderAfterSchema,
                incomingDamage: effectiveAbility.damage,
                baseResolution: schemaOutcome.baseResolution,
                spendRequests: defenseSpendRequests,
              });
              const defenseTotals = aggregateStatusSpendSummaries(
                defensePlan.defense.statusSpends
              );
              const totalBlock =
                defensePlan.defense.baseBlock + defenseTotals.bonusBlock;

              patchAiDefense({
                inProgress: false,
                defenseDice: rolledDice,
                defenseCombo: null,
                defenseRoll: totalBlock,
              });

              let updatedDefender = defensePlan.defenderAfter;
              defensePlan.defense.statusSpends.forEach((spend) => {
                if (spend.stacksSpent <= 0) return;
                if (getStatus(spend.id)?.spend?.turnLimited) {
                  consumeStatusBudget(defenderSide, spend.id, spend.stacksSpent);
                }
              });
              if (updatedDefender !== defenderAfterSchema) {
                setPlayer(defenderSide, updatedDefender);
              }

              if (schemaOutcome.logs.length) {
                pushLog(
                  [
                    `[Defense] ${defenderState.hero.name} resolves defense schema:`,
                    ...schemaOutcome.logs,
                  ],
                  { blankLineBefore: true }
                );
              }

              resolveAfterDefense(
                updatedDefender,
                defensePlan.defense,
                [],
                schemaOutcome.updatedAttacker
              );
              return;
            }

            const defenseRollResult = evaluateDefenseRoll(
              defenderState.hero,
              rolledDice
            );
            if (defenseRollResult.options.length === 0) {
              pushLog(
                `[Defense] ${defenderState.hero.name} found no defensive combos and will block 0 damage.`,
                { blankLineBefore: true }
              );
            }
            const selection = defenseRollResult.options.length
              ? selectHighestBlockOption(defenseRollResult)
              : selectDefenseOptionByCombo(defenseRollResult, null);
            const baseResolution = resolveDefenseSelection(selection);

            const defenseSpendRequests = buildDefenseSpendRequests(
              defenderState,
              effectiveAbility.damage,
              baseResolution.baseBlock,
              defenderSide,
              getStatusBudget
            );
            const defensePlan = buildDefensePlan({
              defender: defenderState,
              incomingDamage: effectiveAbility.damage,
              baseResolution,
              spendRequests: defenseSpendRequests,
            });
            const defenseTotals = aggregateStatusSpendSummaries(
              defensePlan.defense.statusSpends
            );
            const totalBlock =
              defensePlan.defense.baseBlock + defenseTotals.bonusBlock;

            patchAiDefense({
              inProgress: false,
              defenseDice: rolledDice,
              defenseCombo: defensePlan.defense.selection.selected?.combo ?? null,
              defenseRoll: totalBlock,
            });

            let updatedDefender = defensePlan.defenderAfter;
            defensePlan.defense.statusSpends.forEach((spend) => {
              if (spend.stacksSpent <= 0) return;
              if (getStatus(spend.id)?.spend?.turnLimited) {
                consumeStatusBudget(defenderSide, spend.id, spend.stacksSpent);
              }
            });
            if (updatedDefender !== defenderState) {
              setPlayer(defenderSide, updatedDefender);
            }

            resolveAfterDefense(updatedDefender, defensePlan.defense);
          },
          undefined,
          {
            animateSharedDice: false,
            onTick: (frame) => {
              patchAiDefense({ defenseDice: frame });
            },
            diceCount: defenseDiceCount,
          }
        );
      };

      const availableReactions = listPreDefenseReactions(defender.tokens);
      const preferredReaction =
        reactionStatusId &&
        availableReactions.find((reaction) => reaction.id === reactionStatusId);
      const reactionDescriptor = preferredReaction ?? availableReactions[0] ?? null;
      if (reactionDescriptor) {
        triggerDefenseBuffs("preDefenseRoll", defenderSide);
        const reactionToUse = reactionDescriptor.id;
        const buildFrame = (value?: number) =>
          Array.from({ length: reactionDescriptor.diceCount }, () =>
            typeof value === "number"
              ? value
              : 1 + Math.floor(Math.random() * 6)
          );
        setDefenseStatusMessage(reactionDescriptor.messages.rolling);
        setDefenseStatusRollDisplay({
          dice: buildFrame(),
          inProgress: true,
          label: reactionDescriptor.rollLabel,
          outcome: null,
        });
        setPhase("defense");
        animateDefenseDie(
          (roll) => {
            const spendResult = spendStatus(defender.tokens, reactionToUse, "defenseRoll", {
              phase: "defenseRoll",
              roll,
            });
            if (!spendResult) {
              patchAiDefense({ evasiveRoll: roll });
              scheduleCallback(360, () => {
                runDefenseRoll(defender);
              });
              return;
            }
            const consumedDefender: PlayerState = {
              ...defender,
              tokens: spendResult.next,
            };
            setPlayer(defenderSide, consumedDefender);

            const reactionSuccess =
              typeof spendResult.spend.success === "boolean"
                ? spendResult.spend.success
                : !!spendResult.spend.negateIncoming;

            const reactionSummary = createStatusSpendSummary(
              reactionToUse,
              reactionDescriptor.costStacks,
              [spendResult.spend]
            );

            patchAiDefense({ evasiveRoll: roll });

            if (reactionSuccess) {
              setDefenseStatusMessage(
                spendResult.spend.log ?? reactionDescriptor.messages.success
              );
              setDefenseStatusRollDisplay({
                dice: buildFrame(roll),
                inProgress: false,
                label: reactionDescriptor.rollLabel,
                outcome: "success",
              });
              patchAiDefense({
                inProgress: false,
                defenseRoll: null,
                defenseDice: null,
                defenseCombo: null,
              });
              resolveAfterDefense(consumedDefender, null, [reactionSummary]);
              return;
            }

            pendingDefenseSpendsRef.current = [
              ...pendingDefenseSpendsRef.current,
              reactionSummary,
            ];

            setDefenseStatusMessage(
              spendResult.spend.log ?? reactionDescriptor.messages.failure
            );
            setDefenseStatusRollDisplay({
              dice: buildFrame(roll),
              inProgress: false,
              label: reactionDescriptor.rollLabel,
              outcome: "failure",
            });

            scheduleCallback(360, () => {
              runDefenseRoll(consumedDefender);
            });
          },
          650,
          {
            animateSharedDice: false,
            onTick: (value) => {
              setDefenseStatusRollDisplay({
                dice: buildFrame(value),
                inProgress: true,
                label: reactionDescriptor.rollLabel,
                outcome: null,
              });
            },
          }
        );
        return;
      }

      runDefenseRoll(defender);
    },
    [
      animateDefenseDie,
      animateDefenseRoll,
      closeDiceTray,
      consumeStatusBudget,
      openDiceTray,
      patchAiDefense,
      pendingDefenseSpendsRef,
      pushLog,
      queuePendingDefenseGrants,
      resolveDefenseWithEvents,
      scheduleCallback,
      setDefenseStatusMessage,
      setDefenseStatusRollDisplay,
      setPhase,
      setPlayer,
      getStatusBudget,
      triggerDefenseBuffs,
      resolveHeroForDefense,
    ]
  );

  return { handleAiDefenseResponse };
}
