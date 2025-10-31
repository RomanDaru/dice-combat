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
import { ActiveAbilityIds } from "../game/activeAbilities";
import { useGame } from "../context/GameContext";
import { useActiveAbilities } from "./useActiveAbilities";
import { useLatest } from "./useLatest";
import type { GameFlowEvent } from "./useTurnController";
import type { GameState } from "../game/state";
import type {
  OffensiveAbility,
  PlayerState,
  Side,
  Combo,
  ActiveAbilityContext,
  ActiveAbilityOutcome,
} from "../game/types";
import type { DefenseRollResult } from "../game/combat/types";
import { ManualEvasiveLog } from "./useCombatLog";
import {
  resolvePassTurn,
  type TurnEndResolution,
} from "../game/flow/turnEnd";

type PlayerDefenseState = {
  roll: DefenseRollResult;
  selectedCombo: Combo | null;
};

type UseDefenseActionsArgs = {
  turn: Side;
  rolling: boolean[];
  ability: OffensiveAbility | null;
  dice: number[];
  you: PlayerState;
  pendingAttack: GameState["pendingAttack"];
  attackChiSpend: number;
  defenseChiSpend: number;
  clearAttackChiSpend: () => void;
  clearDefenseChiSpend: () => void;
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
  animateDefenseDie: (onDone: (roll: number) => void, duration?: number) => void;
  animateDefenseRoll: (
    onDone: (dice: number[]) => void,
    duration?: number
  ) => void;
  openDiceTray: () => void;
  closeDiceTray: () => void;
  popDamage: (side: Side, amount: number, kind?: "hit" | "reflect") => void;
  restoreDiceAfterDefense: () => void;
  sendFlowEvent: (event: GameFlowEvent) => boolean;
  aiPlay: () => void;
  aiStepDelay: number;
  playerDefenseState: PlayerDefenseState | null;
  setPlayerDefenseState: Dispatch<
    SetStateAction<PlayerDefenseState | null>
  >;
  applyTurnEndResolution: (
    resolution: TurnEndResolution,
    logOptions?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
  ) => void;
};

export function useDefenseActions({
  turn,
  rolling,
  ability,
  dice,
  you,
  pendingAttack,
  attackChiSpend,
  defenseChiSpend,
  clearAttackChiSpend,
  clearDefenseChiSpend,
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
  sendFlowEvent,
  aiPlay,
  aiStepDelay,
  playerDefenseState,
  setPlayerDefenseState,
  applyTurnEndResolution,
}: UseDefenseActionsArgs) {
  const { state, dispatch } = useGame();
  const latestState = useLatest(state);
  const manualEvasiveRef = useRef<ManualEvasiveLog | null>(null);
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

  const { abilities: aiActiveAbilities, performAbility: performAiActiveAbility } =
    useActiveAbilities({
      side: "ai",
      pushLog,
      popDamage,
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
        manualEvasiveRef.current = null;
        clearDefenseChiSpend();
        setPlayerDefenseState(null);
      }
    },
    [clearDefenseChiSpend, dispatch, setPlayerDefenseState]
  );

  const setPlayer = useCallback(
    (side: Side, player: PlayerState) => {
      dispatch({ type: "SET_PLAYER", side, player });
    },
    [dispatch]
  );

  const resolveWithEvents = useCallback(
    (
      resolution: ReturnType<typeof resolveAttack>,
      attackerSide: Side,
      defenderSide: Side
    ) => {
      setPlayer(attackerSide, resolution.updatedAttacker);
      setPlayer(defenderSide, resolution.updatedDefender);
      if (resolution.logs.length) pushLog(resolution.logs);
      resolution.fx.forEach(({ side, amount, kind }) =>
        popDamage(side, amount, kind)
      );
      window.setTimeout(() => {
        setPhase(resolution.nextPhase);
        restoreDiceAfterDefense();
        resolution.events.forEach((event) => {
          const followUp =
            event.followUp === "trigger_ai_turn"
              ? () => {
                  window.setTimeout(() => {
                    const snapshot = latestState.current;
                    const aiState = snapshot.players.ai;
                    const youState = snapshot.players.you;
                    if (
                      !aiState ||
                      !youState ||
                      aiState.hp <= 0 ||
                      youState.hp <= 0
                    )
                      return;
                    aiPlay();
                  }, aiStepDelay);
                }
              : undefined;

          sendFlowEvent({
            type: event.type,
            next: event.payload.next,
            delayMs: event.payload.delayMs,
            prePhase: event.payload.prePhase,
            afterReady: followUp,
          });
        });
      }, 600);
    },
    [
      aiPlay,
      aiStepDelay,
      latestState,
      popDamage,
      pushLog,
      restoreDiceAfterDefense,
      sendFlowEvent,
      setPhase,
      setPlayer,
    ]
  );

  const spendChi = useCallback(
    (side: Side, player: PlayerState, amount: number) => {
      if (amount <= 0) return player;
      consumeTurnChi(side, amount);
      const nextPlayer: PlayerState = {
        ...player,
        tokens: {
          ...player.tokens,
          chi: Math.max(0, (player.tokens.chi ?? 0) - amount),
        },
      };
      setPlayer(side, nextPlayer);
      return nextPlayer;
    },
    [consumeTurnChi, setPlayer]
  );

  const onConfirmAttack = useCallback(() => {
    manualEvasiveRef.current = null;
    if (turn !== "you" || rolling.some(Boolean)) return;
    const selectedAbility = ability;
    if (!selectedAbility) {
      clearAttackChiSpend();
      logPlayerNoCombo(dice, you.hero.name);
      applyTurnEndResolution(resolvePassTurn({ side: "you" }));
      return;
    }

    setPhase("attack");
    patchAiDefense({
      inProgress: true,
      defenseRoll: null,
      defenseDice: null,
      defenseCombo: null,
      evasiveRoll: null,
    });
    const attackDice = [...dice];

    window.setTimeout(() => {
      const snapshot = latestState.current;
      let attacker = snapshot.players.you;
      let defender = snapshot.players.ai;
      if (!attacker || !defender || attacker.hp <= 0 || defender.hp <= 0) {
        patchAiDefense({
          inProgress: false,
          defenseRoll: null,
          defenseDice: null,
          defenseCombo: null,
          evasiveRoll: null,
        });
        clearAttackChiSpend();
        return;
      }

      const spendableAttackChi = Math.min(
        attackChiSpend,
        attacker.tokens.chi ?? 0,
        turnChiAvailable.you ?? 0
      );
      let chiApplied = false;
      if (spendableAttackChi > 0) {
        attacker = spendChi("you", attacker, spendableAttackChi);
        chiApplied = true;
      }
      clearAttackChiSpend();

      const effectiveAbility: OffensiveAbility = {
        ...selectedAbility,
        damage: selectedAbility.damage + spendableAttackChi,
      };

      logPlayerAttackStart(attackDice, effectiveAbility, attacker.hero.name);

      const aiEvasiveAbility = aiActiveAbilities.find(
        (abilityItem) =>
          abilityItem.id === ActiveAbilityIds.SHADOW_MONK_EVASIVE_ID
      );
      let aiShouldAttemptEvasive = false;
      if (aiEvasiveAbility) {
        aiEvasiveRequestedRef.current = false;
        const executed = performAiActiveAbility(aiEvasiveAbility.id);
        if (executed && aiEvasiveRequestedRef.current) {
          aiShouldAttemptEvasive = true;
        }
      } else if (defender.tokens.evasive > 0) {
        aiShouldAttemptEvasive = true;
      }

      aiEvasiveRequestedRef.current = false;

      const resolveAfterDefense = (
        defenderState: PlayerState,
        defenseResolution: ReturnType<typeof buildDefensePlan>["defense"] | null,
        manualEvasive?: ManualEvasiveLog
      ) => {
        window.setTimeout(() => {
          closeDiceTray();
          const resolution = resolveAttack({
            source: "player",
            attackerSide: "you",
            defenderSide: "ai",
            attacker,
            defender: defenderState,
            ability: effectiveAbility,
            attackChiSpend: spendableAttackChi,
            attackChiApplied: chiApplied,
            defense: {
              resolution: defenseResolution,
              manualEvasive,
            },
          });

          resolveWithEvents(resolution, "you", "ai");
        }, 600);
      };

      const runDefenseRoll = (
        defenderState: PlayerState,
        manualEvasive?: ManualEvasiveLog,
        { showTray = false }: { showTray?: boolean } = {}
      ) => {
        setPhase("defense");
        if (showTray) {
          openDiceTray();
        }
        animateDefenseRoll((rolledDice) => {
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
            defenderState.tokens.chi ?? 0,
            turnChiAvailable.ai ?? 0
          );
          const defensePlan = buildDefensePlan({
            defender: defenderState,
            incomingDamage: effectiveAbility.damage,
            baseResolution,
            requestedChi,
          });

          patchAiDefense({
            inProgress: false,
            defenseDice: rolledDice,
            defenseCombo:
              defensePlan.defense.selection.selected?.combo ?? null,
            defenseRoll: defensePlan.defense.block,
          });

          let updatedDefender = defenderState;
          if (defensePlan.defense.chiSpent > 0) {
            updatedDefender = spendChi(
              "ai",
              defensePlan.defenderAfter,
              defensePlan.defense.chiSpent
            );
          } else if (defensePlan.defenderAfter !== defenderState) {
            updatedDefender = defensePlan.defenderAfter;
            setPlayer("ai", updatedDefender);
          }

          resolveAfterDefense(updatedDefender, defensePlan.defense, manualEvasive);
        });
      };

      if (aiShouldAttemptEvasive && defender.tokens.evasive > 0) {
        setPhase("defense");
        animateDefenseDie((roll) => {
          const consumedDefender: PlayerState = {
            ...defender,
            tokens: {
              ...defender.tokens,
              evasive: Math.max(0, defender.tokens.evasive - 1),
            },
          };
          setPlayer("ai", consumedDefender);

          const manualEvasive: ManualEvasiveLog = {
            used: true,
            success: roll >= 5,
            roll,
            label: consumedDefender.hero.name,
            alreadySpent: true,
          };

          patchAiDefense({ evasiveRoll: roll });

          if (manualEvasive.success) {
            patchAiDefense({
              inProgress: false,
              defenseRoll: null,
              defenseDice: null,
              defenseCombo: null,
            });
            resolveAfterDefense(consumedDefender, null, manualEvasive);
            return;
          }

          window.setTimeout(() => {
            runDefenseRoll(consumedDefender, manualEvasive);
          }, 360);
        }, 650);
        return;
      }

      runDefenseRoll(defender);
    }, 60);
  }, [
    ability,
    aiActiveAbilities,
    aiStepDelay,
    animateDefenseDie,
    animateDefenseRoll,
    attackChiSpend,
    clearAttackChiSpend,
    closeDiceTray,
    consumeTurnChi,
    dice,
    latestState,
    logPlayerAttackStart,
    logPlayerNoCombo,
    openDiceTray,
    pushLog,
    patchAiDefense,
    performAiActiveAbility,
    popDamage,
    resolveWithEvents,
    rolling,
    sendFlowEvent,
    setPhase,
    setPlayer,
    spendChi,
    turn,
    turnChiAvailable.ai,
    turnChiAvailable.you,
    you.hero.name,
  ]);

  const onUserDefenseRoll = useCallback(() => {
    if (!pendingAttack || pendingAttack.defender !== "you") return;
    if (playerDefenseState) return;

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
      setPlayerDefenseState({
        roll: rollResult,
        selectedCombo: rollResult.options[0]?.combo ?? null,
      });
    });
  }, [
    animateDefenseRoll,
    latestState,
    pendingAttack,
    playerDefenseState,
    pushLog,
    setPhase,
    setPlayerDefenseState,
  ]);

  const onChooseDefenseOption = useCallback(
    (combo: Combo | null) => {
      setPlayerDefenseState((prev) =>
        prev ? { ...prev, selectedCombo: combo } : prev
      );
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
      defenseChiSpend,
      defender.tokens.chi ?? 0,
      turnChiAvailable.you ?? 0
    );
    const defensePlan = buildDefensePlan({
      defender,
      incomingDamage: pendingAttack.ability.damage,
      baseResolution,
      requestedChi,
    });

    if (defensePlan.defense.chiSpent > 0) {
      defender = spendChi(
        "you",
        defensePlan.defenderAfter,
        defensePlan.defense.chiSpent
      );
    } else {
      defender = defensePlan.defenderAfter;
      setPlayer("you", defender);
    }

    const resolution = resolveAttack({
      source: "ai",
      attackerSide: pendingAttack.attacker,
      defenderSide: pendingAttack.defender,
      attacker,
      defender,
      ability: pendingAttack.ability,
      attackChiSpend: pendingAttack.modifiers?.chiAttackSpend ?? 0,
      attackChiApplied: true,
      defense: {
        resolution: defensePlan.defense,
        manualEvasive: manualEvasiveRef.current ?? undefined,
      },
    });

    manualEvasiveRef.current = null;
    clearDefenseChiSpend();
    setPendingAttackDispatch(null);
    setPlayerDefenseState(null);
    closeDiceTray();
    resolveWithEvents(resolution, pendingAttack.attacker, pendingAttack.defender);
  }, [
    clearDefenseChiSpend,
    defenseChiSpend,
    latestState,
    manualEvasiveRef,
    pendingAttack,
    playerDefenseState,
    resolveWithEvents,
    closeDiceTray,
    setPendingAttackDispatch,
    setPlayer,
    setPlayerDefenseState,
    spendChi,
    turnChiAvailable.you,
  ]);

  const onUserEvasiveRoll = useCallback(() => {
    if (!pendingAttack || pendingAttack.defender !== "you") return;
    const defenderSnapshot = latestState.current.players[pendingAttack.defender];
    if (!defenderSnapshot || defenderSnapshot.tokens.evasive <= 0) return;
    openDiceTray();
    setPhase("defense");
    animateDefenseDie((evasiveRoll) => {
      const snapshot = latestState.current;
      const attacker = snapshot.players[pendingAttack.attacker];
      const defender = snapshot.players[pendingAttack.defender];
      if (!attacker || !defender) return;
      const consumedDefender = {
        ...defender,
        tokens: {
          ...defender.tokens,
          evasive: Math.max(0, defender.tokens.evasive - 1),
        },
      };
      const manualEvasiveAttempt: ManualEvasiveLog = {
        used: true,
        success: evasiveRoll >= 5,
        roll: evasiveRoll,
        label: consumedDefender.hero.name,
        alreadySpent: true,
      };
      manualEvasiveRef.current = manualEvasiveAttempt;
      setPlayer(pendingAttack.defender, consumedDefender);
      if (evasiveRoll >= 5) {
        const resolution = resolveAttack({
          source: "ai",
          attackerSide: pendingAttack.attacker,
          defenderSide: pendingAttack.defender,
          attacker,
          defender: consumedDefender,
          ability: pendingAttack.ability,
          attackChiSpend: pendingAttack.modifiers?.chiAttackSpend ?? 0,
          attackChiApplied: true,
          defense: {
            resolution: null,
            manualEvasive: manualEvasiveAttempt,
          },
        });
        manualEvasiveRef.current = null;
        clearDefenseChiSpend();
        setPendingAttackDispatch(null);
        setPlayerDefenseState(null);
        closeDiceTray();
        resolveWithEvents(resolution, pendingAttack.attacker, pendingAttack.defender);
      }
    }, 650);
  }, [
    animateDefenseDie,
    clearDefenseChiSpend,
    latestState,
    pendingAttack,
    resolveWithEvents,
    openDiceTray,
    closeDiceTray,
    setPendingAttackDispatch,
    setPhase,
    setPlayer,
    setPlayerDefenseState,
  ]);

  return {
    onConfirmAttack,
    onUserDefenseRoll,
    onChooseDefenseOption,
    onConfirmDefense,
    onUserEvasiveRoll,
  };
}
