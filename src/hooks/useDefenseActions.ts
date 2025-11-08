import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  evaluateDefenseRoll,
  resolveDefenseSelection,
  selectDefenseOptionByCombo,
  selectHighestBlockOption,
} from "../game/combat/defenseBoard";
import { buildDefensePlan } from "../game/combat/defensePipeline";
import { resolveAttack } from "../engine/resolveAttack";
import {
  getStatus,
  getStacks,
  spendStatus,
  createStatusSpendSummary,
  aggregateStatusSpendSummaries,
} from "../engine/status";
import type { StatusId, StatusSpend } from "../engine/status";
import { useGame } from "../context/GameContext";
import { useActiveAbilities } from "./useActiveAbilities";
import { useAttackExecution } from "./useAttackExecution";
import { useDefenseResolution } from "./useDefenseResolution";
import { useLatest } from "./useLatest";
import type { GameFlowEvent } from "./useTurnController";
import type { GameState } from "../game/state";
import type {
  OffensiveAbility,
  DefensiveAbility,
  PlayerState,
  Side,
  Combo,
  ActiveAbilityContext,
  ActiveAbilityOutcome,
} from "../game/types";
import type {
  BaseDefenseResolution,
  CombatEvent,
  DefenseRollResult,
} from "../game/combat/types";
import type { StatusSpendSummary } from "../engine/status";
import type { TurnEndResolution } from "../game/flow/turnEnd";
import type { Cue } from "../game/flow/cues";
import {
  combineDefenseSpends,
  extractDefenseAbilityName,
  formatAbilityName,
  type DefenseSelectionCarrier,
} from "./defenseActions.helpers";

type PlayerDefenseState = {
  roll: DefenseRollResult;
  selectedCombo: Combo | null;
  baseResolution: BaseDefenseResolution;
};

type UseDefenseActionsArgs = {
  turn: Side;
  rolling: boolean[];
  ability: OffensiveAbility | null;
  dice: number[];
  you: PlayerState;
  pendingAttack: GameState["pendingAttack"];
  attackStatusRequests: Record<StatusId, number>;
  defenseStatusRequests: Record<StatusId, number>;
  clearAttackStatusRequests: () => void;
  clearDefenseStatusRequests: () => void;
  turnChiAvailable: Record<Side, number>;
  consumeTurnChi: (side: Side, amount: number) => void;
  logPlayerNoCombo: (diceValues: number[], attackerName: string) => void;
  logPlayerAttackStart: (
    diceValues: number[],
    ability: OffensiveAbility,
    attackerName: string
  ) => void;
  pushLog: (
    entry: string | string[],
    options?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
  ) => void;
  animateDefenseDie: (
    onDone: (roll: number) => void,
    duration?: number,
    options?: {
      animateSharedDice?: boolean;
      onTick?: (value: number) => void;
    }
  ) => void;
  animateDefenseRoll: (
    onDone: (dice: number[]) => void,
    duration?: number,
    options?: {
      animateSharedDice?: boolean;
      onTick?: (dice: number[]) => void;
    }
  ) => void;
  openDiceTray: () => void;
  closeDiceTray: () => void;
  popDamage: (side: Side, amount: number, kind?: "hit" | "reflect") => void;
  restoreDiceAfterDefense: () => void;
  handleFlowEvent: (
    event: CombatEvent,
    options?: { afterReady?: () => void; durationMs?: number }
  ) => void;
  sendFlowEvent: (event: GameFlowEvent) => boolean;
  aiPlay: () => void;
  aiStepDelay: number;
  playerDefenseState: PlayerDefenseState | null;
  setPlayerDefenseState: Dispatch<SetStateAction<PlayerDefenseState | null>>;
  setDefenseStatusRollDisplay: (
    display: {
      dice: number[];
      inProgress: boolean;
      label: string | null;
      outcome: "success" | "failure" | null;
    } | null
  ) => void;
  applyTurnEndResolution: (
    resolution: TurnEndResolution,
    logOptions?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
  ) => void;
  setDefenseStatusMessage: (message: string | null) => void;
  enqueueCue: (cue: Cue) => void;
  interruptCue: () => void;
  scheduleCallback: (durationMs: number, callback: () => void) => () => void;
};

export function useDefenseActions({
  turn,
  rolling,
  ability,
  dice,
  you,
  pendingAttack,
  attackStatusRequests,
  defenseStatusRequests,
  clearAttackStatusRequests,
  clearDefenseStatusRequests,
  turnChiAvailable,
  consumeTurnChi,
  logPlayerNoCombo,
  logPlayerAttackStart,
  pushLog,
  animateDefenseDie,
  animateDefenseRoll,
  openDiceTray,
  closeDiceTray,
  popDamage,
  restoreDiceAfterDefense,
  handleFlowEvent,
  sendFlowEvent,
  aiPlay,
  aiStepDelay,
  playerDefenseState,
  setPlayerDefenseState,
  setDefenseStatusRollDisplay,
  applyTurnEndResolution,
  setDefenseStatusMessage,
  enqueueCue,
  interruptCue,
  scheduleCallback,
}: UseDefenseActionsArgs) {
  const { state, dispatch } = useGame();
  const latestState = useLatest(state);
  const pendingDefenseSpendsRef = useRef<StatusSpendSummary[]>([]);

  const combineDefenseSpends = (
    resolution: ReturnType<typeof buildDefensePlan>["defense"] | null,
    extraSpends: StatusSpendSummary[]
  ): ReturnType<typeof buildDefensePlan>["defense"] | null => {
    if (!resolution && extraSpends.length === 0) {
      return null;
    }
    if (!resolution) {
      return {
        selection: {
          roll: { dice: [], combos: [], options: [] },
          selected: null,
        },
        baseBlock: 0,
        reflect: 0,
        heal: 0,
        appliedTokens: {},
        retaliatePercent: 0,
        statusSpends: [...extraSpends],
      };
    }
    if (extraSpends.length === 0) {
      return resolution;
    }
    return {
      ...resolution,
      statusSpends: [...resolution.statusSpends, ...extraSpends],
    };
  };

  const resetDefenseRequests = useCallback(() => {
    pendingDefenseSpendsRef.current = [];
    clearDefenseStatusRequests();
  }, [clearDefenseStatusRequests]);
  const aiEvasiveRequestedRef = useRef(false);

  const setPhase = useCallback(
    (phase: GameState["phase"]) => {
      sendFlowEvent({ type: "SET_PHASE", phase });
    },
    [sendFlowEvent]
  );

  const handleAiAbilityControllerAction = useCallback(
    (
      action: NonNullable<ActiveAbilityOutcome["controllerAction"]>,
      _context: ActiveAbilityContext
    ) => {
      if (action.type === "USE_EVASIVE") {
        aiEvasiveRequestedRef.current = true;
      }
    },
    []
  );

  const {
    abilities: aiActiveAbilities,
    performAbility: performAiActiveAbility,
  } = useActiveAbilities({
    side: "ai",
    pushLog,
    popDamage,
    sendFlowEvent,
    handleControllerAction: handleAiAbilityControllerAction,
  });

  const patchAiDefense = useCallback(
    (partial: Partial<GameState["aiDefense"]>) => {
      dispatch({ type: "PATCH_AI_DEFENSE", payload: partial });
    },
    [dispatch]
  );

  const setPendingAttackDispatch = useCallback(
    (attack: GameState["pendingAttack"]) => {
      dispatch({ type: "SET_PENDING_ATTACK", attack });
      if (!attack) {
        resetDefenseRequests();
        setPlayerDefenseState(null);
      }
    },
    [dispatch, resetDefenseRequests, setPlayerDefenseState]
  );

  const setPlayer = useCallback(
    (side: Side, player: PlayerState) => {
      dispatch({ type: "SET_PLAYER", side, player });
    },
    [dispatch]
  );

  const { resolveDefenseWithEvents } = useDefenseResolution({
    enqueueCue,
    interruptCue,
    scheduleCallback,
    setPhase,
    restoreDiceAfterDefense,
    handleFlowEvent,
    aiPlay,
    aiStepDelay,
    latestState,
    popDamage,
    pushLog,
    setPlayer,
  });

  const { onConfirmAttack } = useAttackExecution({
    turn,
    rolling,
    ability,
    dice,
    you,
    attackStatusRequests,
    clearAttackStatusRequests,
    logPlayerNoCombo,
    logPlayerAttackStart,
    setDefenseStatusMessage,
    setDefenseStatusRollDisplay,
    applyTurnEndResolution,
    setPhase,
    patchAiDefense,
    scheduleCallback,
    latestState,
    setPlayer,
    consumeTurnChi,
    turnChiAvailable,
    openDiceTray,
    closeDiceTray,
    animateDefenseRoll,
    animateDefenseDie,
    pushLog,
    pendingDefenseSpendsRef,
    resolveDefenseWithEvents,
    aiActiveAbilities,
    performAiActiveAbility,
    aiEvasiveRequestedRef,
  });

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
      turnChiAvailable.you ?? 0
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
    setPendingAttackDispatch(null);
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
    resetDefenseRequests,
    defenseStatusRequests,
    latestState,
    combineDefenseSpends,
    pendingDefenseSpendsRef,
    pendingAttack,
    playerDefenseState,
    resolveDefenseWithEvents,
    closeDiceTray,
    setPendingAttackDispatch,
    setPlayer,
    setPlayerDefenseState,
    consumeTurnChi,
    turnChiAvailable.you,
  ]);

  const onUserEvasiveRoll = useCallback(() => {
    if (!pendingAttack || pendingAttack.defender !== "you") return;
    const defenderSnapshot =
      latestState.current.players[pendingAttack.defender];
    if (
      !defenderSnapshot ||
      getStacks(defenderSnapshot.tokens, "evasive", 0) <= 0
    )
      return;
    const evasiveStatus = getStatus("evasive");
    const evasiveSpend = evasiveStatus?.spend as
      | (StatusSpend & {
          diceCount?: number;
        })
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
          setDefenseStatusMessage(
            "Evasive successful! You blocked all damage."
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
          setPendingAttackDispatch(null);
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
    resetDefenseRequests,
    combineDefenseSpends,
    latestState,
    pendingAttack,
    pendingDefenseSpendsRef,
    resolveDefenseWithEvents,
    scheduleCallback,
    openDiceTray,
    closeDiceTray,
    setPendingAttackDispatch,
    setPhase,
    setPlayer,
    setPlayerDefenseState,
    setDefenseStatusRollDisplay,
    setDefenseStatusMessage,
  ]);
  return {
    onConfirmAttack,
    onUserDefenseRoll,
    onChooseDefenseOption,
    onConfirmDefense,
    onUserEvasiveRoll,
  };
}
