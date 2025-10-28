import { useCallback, useRef } from "react";
import { rollDie } from "../game/combos";
import { calculateDefenseOutcome } from "../game/engine";
import type { GameState } from "../game/state";
import type {
  Ability,
  DefenseCalculationResult,
  PlayerState,
  Side,
} from "../game/types";
import { ManualDefenseLog, ManualEvasiveLog } from "./useCombatLog";
import { useGame } from "../context/GameContext";
import { useActiveAbilities } from "./useActiveAbilities";
import { ActiveAbilityIds } from "../game/activeAbilities";
import { useLatest } from "./useLatest";
import type { GameFlowEvent } from "./useTurnController";
import { resolveAttack } from "../game/combat/resolveAttack";
import { buildDefensePlan } from "../game/combat/defensePipeline";

type UseDefenseActionsArgs = {
  turn: Side;
  rolling: boolean[];
  ability: Ability | null;
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
    ability: Ability,
    attackerName: string
  ) => void;
  pushLog: (
    entry: string | string[],
    options?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
  ) => void;
  animateDefenseDie: (onDone: (roll: number) => void, duration?: number) => void;
  popDamage: (side: Side, amount: number, kind?: "hit" | "reflect") => void;
  restoreDiceAfterDefense: () => void;
  sendFlowEvent: (event: GameFlowEvent) => boolean;
  aiPlay: () => void;
  aiStepDelay: number;
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
  popDamage,
  restoreDiceAfterDefense,
  sendFlowEvent,
  aiPlay,
  aiStepDelay,
}: UseDefenseActionsArgs) {
  const { state, dispatch } = useGame();
  const latestState = useLatest(state);
  const manualEvasiveRef = useRef<ManualEvasiveLog | null>(null);
  const setPhase = useCallback(
    (phase: GameState["phase"]) => {
      sendFlowEvent({ type: "SET_PHASE", phase });
    },
    [sendFlowEvent]
  );
  const handleAiAbilityControllerAction = useCallback(
    () => {},
    []
  );

  const {
    abilities: aiActiveAbilities,
    performAbility: performAiActiveAbility,
  } = useActiveAbilities({
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
      }
    },
    [clearDefenseChiSpend, dispatch]
  );

  const setPlayer = useCallback(
    (side: Side, player: PlayerState) => {
      dispatch({ type: "SET_PLAYER", side, player });
    },
    [dispatch]
  );

  const onConfirmAttack = useCallback(() => {
    manualEvasiveRef.current = null;
    if (turn !== "you" || rolling.some(Boolean)) return;
    const selectedAbility = ability;
    if (!selectedAbility) {
      clearAttackChiSpend();
      logPlayerNoCombo([...dice], you.hero.name);
      setPhase("end");
      sendFlowEvent({
        type: "TURN_END",
        next: "ai",
        delayMs: 600,
        afterReady: () => {
          window.setTimeout(() => {
            const latest = latestState.current;
            const aiState = latest.players.ai;
            const youState = latest.players.you;
            if (!aiState || !youState || aiState.hp <= 0 || youState.hp <= 0)
              return;
            aiPlay();
          }, 400);
        },
      });
      return;
    }

    setPhase("attack");
    patchAiDefense({ inProgress: true, defenseRoll: null, evasiveRoll: null });
    const attackDice = [...dice];

    window.setTimeout(() => {
      const snapshot = latestState.current;
      let attacker = snapshot.players.you;
      let defender = snapshot.players.ai;
      if (!attacker || !defender || attacker.hp <= 0 || defender.hp <= 0) {
        patchAiDefense({ inProgress: false, defenseRoll: null, evasiveRoll: null });
        clearAttackChiSpend();
        return;
      }

      const spendableAttackChi = Math.min(
        attackChiSpend,
        attacker.tokens.chi ?? 0,
        turnChiAvailable.you ?? 0
      );
      const chiAttackSpend = Math.max(0, spendableAttackChi);
      if (chiAttackSpend > 0) {
        attacker = {
          ...attacker,
          tokens: {
            ...attacker.tokens,
            chi: Math.max(0, attacker.tokens.chi - chiAttackSpend),
          },
        };
        setPlayer("you", attacker);
        consumeTurnChi("you", chiAttackSpend);
      }
      clearAttackChiSpend();

      const effectiveAbility: Ability = {
        ...selectedAbility,
        damage: selectedAbility.damage + chiAttackSpend,
      };

      logPlayerAttackStart(attackDice, effectiveAbility, attacker.hero.name);

      const aiEvasiveAbility = aiActiveAbilities.find(
        (abilityItem) => abilityItem.id === ActiveAbilityIds.SHADOW_MONK_EVASIVE_ID
      );
      let aiShouldAttemptEvasive = false;
      if (aiEvasiveAbility) {
        aiShouldAttemptEvasive = performAiActiveAbility(aiEvasiveAbility.id);
      } else if (defender.tokens.evasive > 0) {
        aiShouldAttemptEvasive = true;
      }

      let manualEvasive: ManualEvasiveLog | undefined;
      if (aiShouldAttemptEvasive && defender.tokens.evasive > 0) {
        const roll = rollDie();
        patchAiDefense({ evasiveRoll: roll });
        manualEvasive = {
          used: true,
          success: roll >= 5,
          roll,
          label: defender.hero.name,
        };
      }

      let defensePlanResult: ReturnType<typeof buildDefensePlan> | null = null;
      let defenseRollValue: number | undefined;

      if (!(manualEvasive && manualEvasive.success)) {
        const defenseRoll = defender.hero.defense.roll(defender.tokens);
        defenseRollValue = defenseRoll.roll;
        patchAiDefense({ defenseRoll: defenseRoll.roll });
        const baseOutcome = calculateDefenseOutcome(
          attacker,
          defender,
          effectiveAbility,
          defenseRoll.roll
        );
        const defensePlan = buildDefensePlan({
          defender,
          abilityDamage: effectiveAbility.damage,
          defenseOutcome: baseOutcome,
          defenseRoll: defenseRoll.roll,
          requestedChi: Math.min(
            defender.tokens.chi ?? 0,
            turnChiAvailable.ai ?? 0
          ),
          manualEvasive,
        });
        defensePlanResult = defensePlan;
        if (defensePlan.chiSpent > 0) {
          setPlayer("ai", defensePlan.defenderAfter);
          consumeTurnChi("ai", defensePlan.chiSpent);
        }
      }

      const defenderForResolution = defensePlanResult
        ? defensePlanResult.defenderAfter
        : defender;
      const defenseContext = defensePlanResult
        ? defensePlanResult.defense
        : {
            defenseRoll: undefined as number | undefined,
            manualDefense: undefined,
            defenseOutcome: undefined,
            manualEvasive,
            defenseChiSpend: 0,
          };

      const resolution = resolveAttack({
        source: "player",
        attackerSide: "you",
        defenderSide: "ai",
        attacker,
        defender: defenderForResolution,
        ability: selectedAbility,
        attackChiSpend: chiAttackSpend,
        attackChiApplied: false,
        defense: {
          defenseRoll: defenseContext.defenseRoll ?? defenseRollValue,
          manualDefense: defenseContext.manualDefense,
          defenseOutcome: defenseContext.defenseOutcome,
          manualEvasive,
          defenseChiSpend: defenseContext.defenseChiSpend,
        },
      });

      setPlayer("you", resolution.updatedAttacker);
      setPlayer("ai", resolution.updatedDefender);
      setPendingAttackDispatch(null);
      patchAiDefense({ inProgress: false });

      if (resolution.logs.length) {
        pushLog(resolution.logs);
      }
      resolution.fx.forEach(({ side, amount, kind }) =>
        popDamage(side, amount, kind)
      );

      setPhase(resolution.nextPhase);

      resolution.events.forEach((event) => {
        const followUp =
          event.followUp === "trigger_ai_turn"
            ? () => {
                window.setTimeout(() => {
                  const latest = latestState.current;
                  const aiState = latest.players.ai;
                  const youState = latest.players.you;
                  if (!aiState || !youState || aiState.hp <= 0 || youState.hp <= 0)
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
    }, 900);
  }, [
    ability,
    aiPlay,
    aiStepDelay,
    aiActiveAbilities,
    attackChiSpend,
    clearAttackChiSpend,

    performAiActiveAbility,
    dice,
    logPlayerAttackStart,
    logPlayerNoCombo,
    patchAiDefense,
    setPhase,
    popDamage,
    pushLog,
    setPendingAttackDispatch,
    setPlayer,
    consumeTurnChi,
    rolling,
    turn,
    turnChiAvailable.ai,
    turnChiAvailable.you,
    latestState,
    sendFlowEvent,
    you.hero.name,
    resolveAttack,
  ]);

  const onUserDefenseRoll = useCallback(() => {
    if (!pendingAttack || pendingAttack.defender !== "you") return;
    setPhase("defense");
    const attackPayload = pendingAttack;
    animateDefenseDie((roll) => {
      const snapshot = latestState.current;
      const attacker = snapshot.players[attackPayload.attacker];
      const defender = snapshot.players[attackPayload.defender];
      if (!attacker || !defender) return;
      const effectiveAbility = attackPayload.ability;
      const baseOutcome = calculateDefenseOutcome(
        attacker,
        defender,
        effectiveAbility,
        roll
      );
      const defenderSide = attackPayload.defender;
      const requestedChi = Math.min(
        defenseChiSpend,
        turnChiAvailable[defenderSide] ?? 0
      );
      const defensePlan = buildDefensePlan({
        defender,
        abilityDamage: effectiveAbility.damage,
        defenseOutcome: baseOutcome,
        defenseRoll: roll,
        requestedChi,
        manualEvasive: manualEvasiveRef.current ?? undefined,
      });
      const chiSpend = defensePlan.chiSpent;
      const defenderAfterChi = defensePlan.defenderAfter;
      if (chiSpend > 0) {
        setPlayer(attackPayload.defender, defenderAfterChi);
        consumeTurnChi(defenderSide, chiSpend);
      }
      const manualEvasive = manualEvasiveRef.current ?? undefined;
      const resolution = resolveAttack({
        source: "ai",
        attackerSide: attackPayload.attacker,
        defenderSide: attackPayload.defender,
        attacker,
        defender: defenderAfterChi,
        ability: effectiveAbility,
        attackChiSpend: attackPayload.modifiers?.chiAttackSpend ?? 0,
        attackChiApplied: true,
        defense: {
          ...defensePlan.defense,
          manualEvasive,
        },
      });

      manualEvasiveRef.current = null;
      clearDefenseChiSpend();

      setPlayer(attackPayload.attacker, resolution.updatedAttacker);
      setPlayer(attackPayload.defender, resolution.updatedDefender);
      setPendingAttackDispatch(null);

      if (resolution.logs.length) {
        pushLog(resolution.logs);
      }
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
                    const latest = latestState.current;
                    const aiState = latest.players.ai;
                    const youState = latest.players.you;
                    if (!aiState || !youState || aiState.hp <= 0 || youState.hp <= 0)
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
    });
  }, [
    animateDefenseDie,
    pendingAttack,
    clearDefenseChiSpend,
    defenseChiSpend,

    setPhase,
    popDamage,
    pushLog,
    restoreDiceAfterDefense,
    setPendingAttackDispatch,
    setPlayer,
    consumeTurnChi,
    turnChiAvailable.ai,
    turnChiAvailable.you,
    latestState,
    sendFlowEvent,
    resolveAttack,
  ]);

  const onUserEvasiveRoll = useCallback(() => {
    if (!pendingAttack || pendingAttack.defender !== "you") return;
    const defenderSnapshot = latestState.current.players[pendingAttack.defender];
    if (!defenderSnapshot || defenderSnapshot.tokens.evasive <= 0) return;
    setPhase("defense");
    const attackPayload = pendingAttack;
    animateDefenseDie((evasiveRoll) => {
      const snapshot = latestState.current;
      const attacker = snapshot.players[attackPayload.attacker];
      const defender = snapshot.players[attackPayload.defender];
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
      setPlayer(attackPayload.defender, consumedDefender);
      if (evasiveRoll >= 5) {
        const resolution = resolveAttack({
          source: "ai",
          attackerSide: attackPayload.attacker,
          defenderSide: attackPayload.defender,
          attacker,
          defender: consumedDefender,
          ability: attackPayload.ability,
          attackChiSpend: attackPayload.modifiers?.chiAttackSpend ?? 0,
          attackChiApplied: true,
          defense: {
            manualEvasive: manualEvasiveAttempt,
            defenseChiSpend: 0,
          },
        });
        manualEvasiveRef.current = null;
        clearDefenseChiSpend();
        setPlayer(attackPayload.attacker, resolution.updatedAttacker);
        setPlayer(attackPayload.defender, resolution.updatedDefender);
        setPendingAttackDispatch(null);
        if (resolution.logs.length) {
          pushLog(resolution.logs);
        }
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
                      const latest = latestState.current;
                      const aiState = latest.players.ai;
                      const youState = latest.players.you;
                      if (!aiState || !youState || aiState.hp <= 0 || youState.hp <= 0)
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
        return;
      }
      // Evasive failed; defender may still choose to roll a defense die manually.
    }, 650);
  }, [
    animateDefenseDie,
    clearDefenseChiSpend,
    pendingAttack,
    setPhase,
    pushLog,
    restoreDiceAfterDefense,
    setPendingAttackDispatch,
    setPlayer,
    popDamage,
    sendFlowEvent,
    latestState,
    resolveAttack,
    aiPlay,
    aiStepDelay,
  ]);

  return {
    onConfirmAttack,
    onUserDefenseRoll,
    onUserEvasiveRoll,
  };
}



