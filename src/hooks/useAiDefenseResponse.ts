import { useCallback, type MutableRefObject } from "react";
import {
  evaluateDefenseRoll,
  resolveDefenseSelection,
  selectDefenseOptionByCombo,
  selectHighestBlockOption,
} from "../game/combat/defenseBoard";
import { buildDefensePlan } from "../game/combat/defensePipeline";
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
  aiShouldAttemptEvasive: boolean;
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
      aiShouldAttemptEvasive,
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

            const requestedChi = Math.min(
              getStacks(defenderState.tokens, "chi", 0),
              getStatusBudget(defenderSide, "chi")
            );
            const defensePlan = buildDefensePlan({
              defender: defenderState,
              incomingDamage: effectiveAbility.damage,
              baseResolution,
              requestedChi,
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

      if (aiShouldAttemptEvasive && getStacks(defender.tokens, "evasive", 0) > 0) {
        setPhase("defense");
        animateDefenseDie(
          (roll) => {
            const spendResult = spendStatus(defender.tokens, "evasive", "defenseRoll", {
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

            const evadeSuccess =
              typeof spendResult.spend.success === "boolean"
                ? spendResult.spend.success
                : !!spendResult.spend.negateIncoming;

            const evasiveCost = getStatus("evasive")?.spend?.costStacks ?? 1;
            const evasiveSummary = createStatusSpendSummary("evasive", evasiveCost, [
              spendResult.spend,
            ]);

            patchAiDefense({ evasiveRoll: roll });

            if (evadeSuccess) {
              patchAiDefense({
                inProgress: false,
                defenseRoll: null,
                defenseDice: null,
                defenseCombo: null,
              });
              resolveAfterDefense(consumedDefender, null, [evasiveSummary]);
              return;
            }

            pendingDefenseSpendsRef.current = [
              ...pendingDefenseSpendsRef.current,
              evasiveSummary,
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
