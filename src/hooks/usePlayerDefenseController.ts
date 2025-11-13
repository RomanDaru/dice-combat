import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  evaluateDefenseRoll,
  resolveDefenseSelection,
  selectDefenseOptionByCombo,
  selectHighestBlockOption,
} from "../game/combat/defenseBoard";
import { buildDefensePlan } from "../game/combat/defensePipeline";
import type {
  BaseDefenseResolution,
  DefenseRollResult,
} from "../game/combat/types";
import {
  isDefenseSchemaEnabled,
  resolveDefenseSchemaRoll,
} from "../game/combat/defenseSchemaRuntime";
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
import type { StatusTimingPhase } from "../engine/status/types";
import type { DefenseStatusGrant } from "../defense/effects";
import type { GameState } from "../game/state";
import type {
  Combo,
  PlayerState,
  Side,
} from "../game/types";
import {
  combineDefenseSpends,
  extractDefenseAbilityName,
  formatAbilityName,
  type DefenseSelectionCarrier,
} from "./defenseActions.helpers";
import type { DefenseResolutionHandler } from "./useDefenseResolution";
import { getPreDefenseReactionDescriptor } from "../game/combat/preDefenseReactions";

export type PlayerDefenseState = {
  roll: DefenseRollResult;
  selectedCombo: Combo | null;
  baseResolution: BaseDefenseResolution;
};

type UsePlayerDefenseControllerArgs = {
  pendingAttack: GameState["pendingAttack"];
  playerDefenseState: PlayerDefenseState | null;
  setPlayerDefenseState: Dispatch<SetStateAction<PlayerDefenseState | null>>;
  latestState: MutableRefObject<GameState>;
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
  setDefenseStatusRollDisplay: (
    display:
      | {
          dice: number[];
          inProgress: boolean;
          label: string | null;
          outcome: "success" | "failure" | null;
        }
      | null
  ) => void;
  setDefenseStatusMessage: (message: string | null) => void;
  defenseStatusRequests: Record<StatusId, number>;
  getStatusBudget: (side: Side, statusId: StatusId) => number;
  consumeStatusBudget: (side: Side, statusId: StatusId, amount: number) => void;
  pendingDefenseSpendsRef: MutableRefObject<StatusSpendSummary[]>;
  setPlayer: (side: Side, player: PlayerState) => void;
  resetDefenseRequests: () => void;
  setPendingAttack: (attack: GameState["pendingAttack"]) => void;
  resolveDefenseWithEvents: DefenseResolutionHandler;
  scheduleCallback: (durationMs: number, callback: () => void) => () => void;
  queuePendingDefenseGrants: (payload: {
    grants: DefenseStatusGrant[];
    attackerSide: Side;
    defenderSide: Side;
  }) => void;
  triggerDefenseBuffs: (phase: StatusTimingPhase, owner: Side) => void;
};

export function usePlayerDefenseController({
  pendingAttack,
  playerDefenseState,
  setPlayerDefenseState,
  latestState,
  setPhase,
  openDiceTray,
  closeDiceTray,
  animateDefenseRoll,
  animateDefenseDie,
  pushLog,
  setDefenseStatusRollDisplay,
  setDefenseStatusMessage,
  defenseStatusRequests,
  getStatusBudget,
  consumeStatusBudget,
  pendingDefenseSpendsRef,
  setPlayer,
  resetDefenseRequests,
  setPendingAttack,
  resolveDefenseWithEvents,
  scheduleCallback,
  queuePendingDefenseGrants,
  triggerDefenseBuffs,
}: UsePlayerDefenseControllerArgs) {
  const runDefenseResolution = useCallback(
    ({
      attacker,
      defender,
      baseResolution,
      schemaLogs,
    }: {
      attacker: PlayerState;
      defender: PlayerState;
      baseResolution: BaseDefenseResolution;
      schemaLogs?: string[];
    }) => {
      if (!pendingAttack) return;

      const incomingDamage =
        pendingAttack.baseDamage ?? pendingAttack.ability.damage;

      const defensePlan = buildDefensePlan({
        defender,
        incomingDamage,
        baseResolution,
        spendRequests: defenseStatusRequests,
      });

      let updatedDefender = defensePlan.defenderAfter;
      defensePlan.defense.statusSpends.forEach((spend) => {
        if (spend.stacksSpent <= 0) return;
        if (getStatus(spend.id)?.spend?.turnLimited) {
          consumeStatusBudget(pendingAttack.defender, spend.id, spend.stacksSpent);
        }
      });

      setPlayer(pendingAttack.defender, updatedDefender);

      const currentAttacker =
        latestState.current.players[pendingAttack.attacker];
      if (currentAttacker && currentAttacker !== attacker) {
        setPlayer(pendingAttack.attacker, attacker);
      }

      const attackStatusSpends = pendingAttack.modifiers?.statusSpends ?? [];
      const attackBonusDamage = attackStatusSpends.reduce(
        (sum, spend) => sum + spend.bonusDamage,
        0
      );
      const baseAttackDamage =
        pendingAttack.baseDamage ??
        Math.max(0, pendingAttack.ability.damage - attackBonusDamage);

      const pendingDefenseSpends = pendingDefenseSpendsRef.current;
      pendingDefenseSpendsRef.current = [];
      const mergedDefense = combineDefenseSpends(
        defensePlan.defense,
        pendingDefenseSpends
      );

      if (schemaLogs?.length) {
        pushLog(
          [
            `[Defense] ${defender.hero.name} resolves defense schema:`,
            ...schemaLogs,
          ],
          { blankLineBefore: true }
        );
      }

      triggerDefenseBuffs("preApplyDamage", pendingAttack.defender);
      const resolution = resolveAttack({
        source: "ai",
        attackerSide: pendingAttack.attacker,
        defenderSide: pendingAttack.defender,
        attacker,
        defender: updatedDefender,
        ability: pendingAttack.ability,
        baseDamage: baseAttackDamage,
        attackStatusSpends,
        defense: {
          resolution: mergedDefense,
        },
      });

      resetDefenseRequests();
      setPendingAttack(null);
      setPlayerDefenseState(null);
      closeDiceTray();
      const defenseAbilityName = extractDefenseAbilityName(
        mergedDefense as DefenseSelectionCarrier | null
      );
      resolveDefenseWithEvents(resolution, {
        attackerSide: pendingAttack.attacker,
        defenderSide: pendingAttack.defender,
        attackerName: attacker.hero.name,
        defenderName: updatedDefender.hero.name,
        abilityName: formatAbilityName(pendingAttack.ability),
        defenseAbilityName,
      });
    },
    [
      closeDiceTray,
      consumeStatusBudget,
      defenseStatusRequests,
      latestState,
      pendingAttack,
      pendingDefenseSpendsRef,
      pushLog,
      resetDefenseRequests,
      resolveDefenseWithEvents,
      setPendingAttack,
      setPlayer,
      setPlayerDefenseState,
      triggerDefenseBuffs,
    ]
  );

  const onUserDefenseRoll = useCallback(() => {
    if (!pendingAttack || pendingAttack.defender !== "you") return;
    if (playerDefenseState) return;

    triggerDefenseBuffs("preDefenseRoll", pendingAttack.defender);
    setDefenseStatusMessage(null);
    setDefenseStatusRollDisplay(null);
    openDiceTray();
    const snapshot = latestState.current;
    const attacker = snapshot.players[pendingAttack.attacker];
    const defender = snapshot.players[pendingAttack.defender];
    if (!attacker || !defender || attacker.hp <= 0 || defender.hp <= 0) {
      return;
    }

    setPhase("defense");
    const useSchema = isDefenseSchemaEnabled(defender.hero);
    animateDefenseRoll((rolledDice) => {
      if (useSchema && defender.hero.defenseSchema) {
        const schemaOutcome = resolveDefenseSchemaRoll({
          hero: defender.hero,
          dice: rolledDice,
          attacker,
          defender,
          incomingDamage:
            pendingAttack.baseDamage ?? pendingAttack.ability.damage,
        });
        if (schemaOutcome.pendingStatusGrants.length) {
          queuePendingDefenseGrants({
            grants: schemaOutcome.pendingStatusGrants,
            attackerSide: pendingAttack.attacker,
            defenderSide: pendingAttack.defender,
          });
        }
        runDefenseResolution({
          attacker: schemaOutcome.updatedAttacker,
          defender: schemaOutcome.updatedDefender,
          baseResolution: schemaOutcome.baseResolution,
          schemaLogs: schemaOutcome.logs,
        });
        return;
      }
      const rollResult = evaluateDefenseRoll(defender.hero, rolledDice);
      if (rollResult.options.length === 0) {
        pushLog(
          `[Defense] ${defender.hero.name} found no defensive combos and will block 0 damage.`,
          { blankLineBefore: true }
        );
      }
      const initialCombo = rollResult.options[0]?.combo ?? null;
      const initialSelection = selectDefenseOptionByCombo(
        rollResult,
        initialCombo
      );
      const initialBaseResolution = resolveDefenseSelection(initialSelection);
      setPlayerDefenseState({
        roll: rollResult,
        selectedCombo: initialCombo,
        baseResolution: initialBaseResolution,
      });
    });
  }, [
    animateDefenseRoll,
    latestState,
    pendingAttack,
    playerDefenseState,
    pushLog,
    queuePendingDefenseGrants,
    setDefenseStatusRollDisplay,
    setPhase,
    setPlayerDefenseState,
    setDefenseStatusMessage,
    openDiceTray,
    triggerDefenseBuffs,
  ]);

  const onChooseDefenseOption = useCallback(
    (combo: Combo | null) => {
      setPlayerDefenseState((prev) => {
        if (!prev) return prev;
        const nextSelection = selectDefenseOptionByCombo(prev.roll, combo);
        const nextBaseResolution = resolveDefenseSelection(nextSelection);
        return {
          ...prev,
          selectedCombo: combo,
          baseResolution: nextBaseResolution,
        };
      });
    },
    [setPlayerDefenseState]
  ]);

  const onConfirmDefense = useCallback(() => {
    if (!pendingAttack || pendingAttack.defender !== "you") return;
    const defenseState = playerDefenseState;
    if (!defenseState) return;

    const snapshot = latestState.current;
    const attacker = snapshot.players[pendingAttack.attacker];
    let defender = snapshot.players[pendingAttack.defender];
    if (!attacker || !defender || attacker.hp <= 0 || defender.hp <= 0) {
      setPlayerDefenseState(null);
      return;
    }

    const selection = selectDefenseOptionByCombo(
      defenseState.roll,
      defenseState.selectedCombo ?? null
    );
    const baseResolution = resolveDefenseSelection(selection);
    runDefenseResolution({
      attacker,
      defender,
      baseResolution,
    });
  }, [
    closeDiceTray,
    latestState,
    pendingAttack,
    playerDefenseState,
    setPlayerDefenseState,
  ]);

  const onUserStatusReaction = useCallback(
    (statusId: StatusId) => {
      if (!pendingAttack || pendingAttack.defender !== "you") return;
      const defenderSnapshot =
        latestState.current.players[pendingAttack.defender];
      if (
        !defenderSnapshot ||
        getStacks(defenderSnapshot.tokens, statusId, 0) <= 0
      ) {
        return;
      }
      const reaction = getPreDefenseReactionDescriptor(statusId);
      if (!reaction) return;

      triggerDefenseBuffs("preDefenseRoll", pendingAttack.defender);
      const buildFrame = (value?: number) =>
        Array.from({ length: reaction.diceCount }, () =>
          typeof value === "number"
            ? value
            : 1 + Math.floor(Math.random() * 6)
        );

      setDefenseStatusMessage(reaction.messages.rolling);
      setDefenseStatusRollDisplay({
        dice: buildFrame(),
        inProgress: true,
        label: reaction.rollLabel,
        outcome: null,
      });
      openDiceTray();

      animateDefenseDie(
        (reactionRoll) => {
          const defender =
            latestState.current.players[pendingAttack.defender];
          const attacker =
            latestState.current.players[pendingAttack.attacker];
          if (!defender || !attacker) return;

          const spendResult = spendStatus(
            defender.tokens,
            statusId,
            "defenseRoll",
            { phase: "defenseRoll", roll: reactionRoll }
          );
          if (!spendResult) return;
          const consumedDefender = {
            ...defender,
            tokens: spendResult.next,
          };
          const reactionSummary = createStatusSpendSummary(
            statusId,
            reaction.costStacks,
            [spendResult.spend]
          );
          const reactionSuccess =
            typeof spendResult.spend.success === "boolean"
              ? spendResult.spend.success
              : !!spendResult.spend.negateIncoming;
          setPlayer(pendingAttack.defender, consumedDefender);
          if (reactionSuccess) {
            setDefenseStatusRollDisplay({
              dice: buildFrame(reactionRoll),
              inProgress: false,
              label: reaction.rollLabel,
              outcome: "success",
            });
            setDefenseStatusMessage(
              spendResult.spend.log ?? reaction.messages.success
            );
            const attackStatusSpends =
              pendingAttack.modifiers?.statusSpends ?? [];
            const attackBonusDamage = attackStatusSpends.reduce(
              (sum, spend) => sum + spend.bonusDamage,
              0
            );
            const baseAttackDamage =
              pendingAttack.baseDamage ??
              Math.max(0, pendingAttack.ability.damage - attackBonusDamage);
            const reactionDefense = combineDefenseSpends(null, [
              reactionSummary,
            ]);
            triggerDefenseBuffs("preApplyDamage", pendingAttack.defender);
            const resolution = resolveAttack({
              source: "ai",
              attackerSide: pendingAttack.attacker,
              defenderSide: pendingAttack.defender,
              attacker,
              defender: consumedDefender,
              ability: pendingAttack.ability,
              baseDamage: baseAttackDamage,
              attackStatusSpends,
              defense: {
                resolution: reactionDefense,
              },
            });
            resetDefenseRequests();
            setPendingAttack(null);
            setPlayerDefenseState(null);
            scheduleCallback(1200, () => {
              closeDiceTray();
            });
            const defenseAbilityName = extractDefenseAbilityName(
              reactionDefense as DefenseSelectionCarrier | null
            );
            resolveDefenseWithEvents(resolution, {
              attackerSide: pendingAttack.attacker,
              defenderSide: pendingAttack.defender,
              attackerName: attacker.hero.name,
              defenderName: consumedDefender.hero.name,
              abilityName: formatAbilityName(pendingAttack.ability),
              defenseAbilityName,
            });
            return;
          }

          setDefenseStatusRollDisplay({
            dice: buildFrame(reactionRoll),
            inProgress: false,
            label: reaction.rollLabel,
            outcome: "failure",
          });
          setDefenseStatusMessage(
            spendResult.spend.log ?? reaction.messages.failure
          );
          pendingDefenseSpendsRef.current = [
            ...pendingDefenseSpendsRef.current,
            reactionSummary,
          ];
        },
        650,
        {
          animateSharedDice: false,
          onTick: (value) => {
            setDefenseStatusRollDisplay({
              dice: buildFrame(value),
              inProgress: true,
              label: reaction.rollLabel,
              outcome: null,
            });
          },
        }
      );
    },
    [
      animateDefenseDie,
      closeDiceTray,
      latestState,
      openDiceTray,
      pendingAttack,
      pendingDefenseSpendsRef,
      resolveDefenseWithEvents,
      resetDefenseRequests,
    scheduleCallback,
    setDefenseStatusMessage,
    setDefenseStatusRollDisplay,
    setPendingAttack,
    setPhase,
    setPlayer,
    setPlayerDefenseState,
    triggerDefenseBuffs,
  ]
);
  return {
    onUserDefenseRoll,
    onChooseDefenseOption,
    onConfirmDefense,
    onUserStatusReaction,
  };
}

