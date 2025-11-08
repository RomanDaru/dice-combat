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
import { resolveAttack } from "../engine/resolveAttack";
import {
  aggregateStatusSpendSummaries,
  createStatusSpendSummary,
  getStatus,
  getStacks,
  spendStatus,
  type StatusId,
  type StatusSpend,
  type StatusSpendSummary,
} from "../engine/status";
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
  turnChiAvailableYou?: number;
  consumeTurnChi: (side: Side, amount: number) => void;
  pendingDefenseSpendsRef: MutableRefObject<StatusSpendSummary[]>;
  setPlayer: (side: Side, player: PlayerState) => void;
  resetDefenseRequests: () => void;
  setPendingAttack: (attack: GameState["pendingAttack"]) => void;
  resolveDefenseWithEvents: DefenseResolutionHandler;
  scheduleCallback: (durationMs: number, callback: () => void) => () => void;
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
  turnChiAvailableYou,
  consumeTurnChi,
  pendingDefenseSpendsRef,
  setPlayer,
  resetDefenseRequests,
  setPendingAttack,
  resolveDefenseWithEvents,
  scheduleCallback,
}: UsePlayerDefenseControllerArgs) {
  const onUserDefenseRoll = useCallback(() => {
    if (!pendingAttack || pendingAttack.defender !== "you") return;
    if (playerDefenseState) return;

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
    animateDefenseRoll((rolledDice) => {
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
    setDefenseStatusRollDisplay,
    setPhase,
    setPlayerDefenseState,
    setDefenseStatusMessage,
    openDiceTray,
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
  );

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

    const requestedChi = Math.min(
      defenseStatusRequests.chi ?? 0,
      getStacks(defender.tokens, "chi", 0),
      turnChiAvailableYou ?? 0
    );
    const defensePlan = buildDefensePlan({
      defender,
      incomingDamage: pendingAttack.ability.damage,
      baseResolution,
      requestedChi,
    });

    defender = defensePlan.defenderAfter;
    defensePlan.defense.statusSpends.forEach((spend) => {
      if (spend.id === "chi" && spend.stacksSpent > 0) {
        consumeTurnChi("you", spend.stacksSpent);
      }
    });
    setPlayer("you", defender);

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

    const resolution = resolveAttack({
      source: "ai",
      attackerSide: pendingAttack.attacker,
      defenderSide: pendingAttack.defender,
      attacker,
      defender,
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
      defenderName: defender.hero.name,
      abilityName: formatAbilityName(pendingAttack.ability),
      defenseAbilityName,
    });
  }, [
    closeDiceTray,
    consumeTurnChi,
    defenseStatusRequests,
    latestState,
    pendingAttack,
    pendingDefenseSpendsRef,
    playerDefenseState,
    resetDefenseRequests,
    resolveDefenseWithEvents,
    setPendingAttack,
    setPlayer,
    setPlayerDefenseState,
    turnChiAvailableYou,
  ]);

  const onUserEvasiveRoll = useCallback(() => {
    if (!pendingAttack || pendingAttack.defender !== "you") return;
    const defenderSnapshot = latestState.current.players[pendingAttack.defender];
    if (
      !defenderSnapshot ||
      getStacks(defenderSnapshot.tokens, "evasive", 0) <= 0
    )
      return;
    const evasiveStatus = getStatus("evasive");
    const evasiveSpend = evasiveStatus?.spend as
      | (StatusSpend & { diceCount?: number })
      | undefined;
    const diceCount = Math.max(
      1,
      typeof evasiveSpend?.diceCount === "number" ? evasiveSpend.diceCount : 1
    );
    const seedFrame = Array.from(
      { length: diceCount },
      () => 1 + Math.floor(Math.random() * 6)
    );
    setDefenseStatusMessage("Rolling for evasive...");
    setDefenseStatusRollDisplay({
      dice: seedFrame,
      inProgress: true,
      label: "Evasive Roll",
      outcome: null,
    });
    openDiceTray();
    setPhase("defense");
    animateDefenseDie(
      (evasiveRoll) => {
        const snapshot = latestState.current;
        const attacker = snapshot.players[pendingAttack.attacker];
        const defender = snapshot.players[pendingAttack.defender];
        if (!attacker || !defender) return;
        const spendResult = spendStatus(
          defender.tokens,
          "evasive",
          "defenseRoll",
          { phase: "defenseRoll", roll: evasiveRoll }
        );
        if (!spendResult) return;
        const consumedDefender = {
          ...defender,
          tokens: spendResult.next,
        };
        const evasiveCost = getStatus("evasive")?.spend?.costStacks ?? 1;
        const evasiveSummary = createStatusSpendSummary(
          "evasive",
          evasiveCost,
          [spendResult.spend]
        );
        const evadeSuccess =
          typeof spendResult.spend.success === "boolean"
            ? spendResult.spend.success
            : !!spendResult.spend.negateIncoming;
        setPlayer(pendingAttack.defender, consumedDefender);
        if (evadeSuccess) {
          const resultDice = Array.from(
            { length: diceCount },
            () => evasiveRoll
          );
          setDefenseStatusRollDisplay({
            dice: resultDice,
            inProgress: false,
            label: "Evasive Roll",
            outcome: "success",
          });
          setDefenseStatusMessage("Evasive successful! You blocked all damage.");
          const attackStatusSpends =
            pendingAttack.modifiers?.statusSpends ?? [];
          const attackBonusDamage = attackStatusSpends.reduce(
            (sum, spend) => sum + spend.bonusDamage,
            0
          );
          const baseAttackDamage =
            pendingAttack.baseDamage ??
            Math.max(0, pendingAttack.ability.damage - attackBonusDamage);
          const evasiveDefense = combineDefenseSpends(null, [evasiveSummary]);
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
              resolution: evasiveDefense,
            },
          });
          resetDefenseRequests();
          setPendingAttack(null);
          setPlayerDefenseState(null);
          scheduleCallback(1200, () => {
            closeDiceTray();
          });
          const defenseAbilityName = extractDefenseAbilityName(
            evasiveDefense as DefenseSelectionCarrier | null
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

        const resultDice = Array.from({ length: diceCount }, () => evasiveRoll);
        setDefenseStatusRollDisplay({
          dice: resultDice,
          inProgress: false,
          label: "Evasive Roll",
          outcome: "failure",
        });
        setDefenseStatusMessage("Evasive failed. Roll for Defense!");
        pendingDefenseSpendsRef.current = [
          ...pendingDefenseSpendsRef.current,
          evasiveSummary,
        ];
      },
      650,
      {
        animateSharedDice: false,
        onTick: () => {
          const frame = Array.from(
            { length: diceCount },
            () => 1 + Math.floor(Math.random() * 6)
          );
          setDefenseStatusRollDisplay({
            dice: frame,
            inProgress: true,
            label: "Evasive Roll",
            outcome: null,
          });
        },
      }
    );
  }, [
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
  ]);

  return {
    onUserDefenseRoll,
    onChooseDefenseOption,
    onConfirmDefense,
    onUserEvasiveRoll,
  };
}
