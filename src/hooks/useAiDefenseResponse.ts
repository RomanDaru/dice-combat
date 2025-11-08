import { useCallback, type MutableRefObject } from "react";
import {
  evaluateDefenseRoll,
  resolveDefenseSelection,
  selectDefenseOptionByCombo,
  selectHighestBlockOption,
} from "../game/combat/defenseBoard";
import { buildDefensePlan } from "../game/combat/defensePipeline";
import { getPreDefenseReactionStatuses } from "./preDefenseReactions";
import { resolveAttack } from "../engine/resolveAttack";
import {
  aggregateStatusSpendSummaries,
  createStatusSpendSummary,
  getStatus,
  getStacks,
  spendStatus,
  type StatusId,
  type StatusSpendSummary,
} from "../engine/status";
import type { GameState } from "../game/state";
import type { OffensiveAbility, PlayerState, Side } from "../game/types";
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
}: UseAiDefenseResponseArgs) {
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
        additionalSpends: StatusSpendSummary[] = []
      ) => {
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
            attacker,
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
            attackerName: attacker.hero.name,
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
        setDefenseStatusMessage(null);
        setDefenseStatusRollDisplay(null);
        setPhase("defense");
        if (showTray) {
          openDiceTray();
        }
        animateDefenseRoll(
          (rolledDice) => {
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
          }
        );
      };

      const availableReactions = getPreDefenseReactionStatuses(defender.tokens);
      let reactionToUse: StatusId | null = null;
      if (
        reactionStatusId &&
        getStacks(defender.tokens, reactionStatusId, 0) > 0
      ) {
        reactionToUse = reactionStatusId;
      } else if (availableReactions.length > 0) {
        reactionToUse = availableReactions[0];
      }
      if (reactionToUse) {
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

            const reactionDef = getStatus(reactionToUse);
            const reactionName = reactionDef?.name ?? reactionToUse;
            const reactionSuccess =
              typeof spendResult.spend.success === "boolean"
                ? spendResult.spend.success
                : !!spendResult.spend.negateIncoming;

            const reactionCost = reactionDef?.spend?.costStacks ?? 1;
            const reactionSummary = createStatusSpendSummary(
              reactionToUse,
              reactionCost,
              [spendResult.spend]
            );

            patchAiDefense({ evasiveRoll: roll });

            if (reactionSuccess) {
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

            scheduleCallback(360, () => {
              runDefenseRoll(consumedDefender);
            });
          },
          650,
          { animateSharedDice: false }
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
      resolveDefenseWithEvents,
      scheduleCallback,
      setDefenseStatusMessage,
      setDefenseStatusRollDisplay,
      setPhase,
      setPlayer,
      getStatusBudget,
    ]
  );

  return { handleAiDefenseResponse };
}
