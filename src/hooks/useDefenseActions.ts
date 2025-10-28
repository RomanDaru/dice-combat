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

  const applyReactiveChiDefense = ({
    defender,
    abilityDamage,
    defenseOutcome,
    requestedChi,
  }: {
    defender: PlayerState;
    abilityDamage: number;
    defenseOutcome: DefenseCalculationResult;
    requestedChi: number;
  }): {
    defenderAfter: PlayerState;
    outcome: DefenseCalculationResult;
    chiSpent: number;
  } => {
    const availableChi = defender.tokens.chi ?? 0;
    if (availableChi <= 0 || requestedChi <= 0) {
      return {
        defenderAfter: defender,
        outcome: defenseOutcome,
        chiSpent: 0,
      };
    }
    const chiBudget = Math.min(requestedChi, availableChi);
    const currentBlocked = defenseOutcome.totalBlock;
    const remainingDamage = Math.max(0, abilityDamage - currentBlocked);
    const chiSpent = Math.min(chiBudget, remainingDamage);
    if (chiSpent <= 0) {
      return {
        defenderAfter: defender,
        outcome: defenseOutcome,
        chiSpent: 0,
      };
    }
    const defenderAfter: PlayerState = {
      ...defender,
      tokens: {
        ...defender.tokens,
        chi: Math.max(0, availableChi - chiSpent),
      },
    };
    const totalBlock = currentBlocked + chiSpent;
    const damageDealt = Math.max(0, abilityDamage - totalBlock);
    const adjustedOutcome: DefenseCalculationResult = {
      ...defenseOutcome,
      totalBlock,
      damageDealt,
      finalDefenderHp: Math.max(0, defender.hp - damageDealt),
      modifiersApplied: [
        ...defenseOutcome.modifiersApplied,
        {
          id: "chi_spent_block",
          source: "Chi",
          blockBonus: chiSpent,
          reflectBonus: 0,
          logDetail: `<<resource:Chi>> +${chiSpent}`,
        },
      ],
    };
    return {
      defenderAfter,
      outcome: adjustedOutcome,
      chiSpent,
    };
  };

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

      let defenseOutcome: ReturnType<typeof calculateDefenseOutcome> | undefined;
      let manualDefense: ManualDefenseLog | undefined;
      let defenseRollValue: number | undefined;
      let defenseChiSpent = 0;
      let defenderForResolution = defender;

      if (!(manualEvasive && manualEvasive.success)) {
        const defenseRoll = defender.hero.defense.roll(defender.tokens);
        defenseRollValue = defenseRoll.roll;
        patchAiDefense({ defenseRoll: defenseRoll.roll });
        defenseOutcome = calculateDefenseOutcome(
          attacker,
          defender,
          effectiveAbility,
          defenseRoll.roll
        );
        manualDefense = {
          reduced: defenseOutcome.totalBlock,
          reflect: defenseOutcome.totalReflect,
          roll: defenseOutcome.defenseRoll,
          label: defender.hero.name,
          chiUsed: 0,
        };

        const chiAdjustment = applyReactiveChiDefense({
          defender,
          abilityDamage: effectiveAbility.damage,
          defenseOutcome,
          requestedChi: Math.min(
            defender.tokens.chi ?? 0,
            turnChiAvailable.ai ?? 0
          ),
        });
        defenseChiSpent = chiAdjustment.chiSpent;
        defenderForResolution = chiAdjustment.defenderAfter;
        defenseOutcome = chiAdjustment.outcome;
        if (defenseChiSpent > 0) {
          setPlayer("ai", defenderForResolution);
          consumeTurnChi("ai", defenseChiSpent);
          manualDefense = manualDefense
            ? {
                ...manualDefense,
                reduced: defenseOutcome.totalBlock,
                chiUsed: (manualDefense.chiUsed ?? 0) + defenseChiSpent,
              }
            : undefined;
        }
      }

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
          defenseRoll: defenseRollValue,
          manualDefense,
          defenseOutcome,
          manualEvasive,
          defenseChiSpend,
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
        sendFlowEvent({
          type: event.type,
          next: event.payload.next,
          delayMs: event.payload.delayMs,
          prePhase: event.payload.prePhase,
          afterReady:
            event.payload.next === "ai"
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
              : undefined,
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
    applyReactiveChiDefense,
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
      let defenseOutcome = calculateDefenseOutcome(
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
      const chiAdjustment = applyReactiveChiDefense({
        defender,
        abilityDamage: effectiveAbility.damage,
        defenseOutcome,
        requestedChi,
      });
      const chiSpend = chiAdjustment.chiSpent;
      const defenderAfterChi = chiAdjustment.defenderAfter;
      defenseOutcome = chiAdjustment.outcome;
      if (chiSpend > 0) {
        setPlayer(attackPayload.defender, defenderAfterChi);
        consumeTurnChi(defenderSide, chiSpend);
      }
      const manualDefensePayload: ManualDefenseLog = {
        reduced: defenseOutcome.totalBlock,
        reflect: defenseOutcome.totalReflect,
        roll,
        label: defender.hero.name,
        chiUsed: chiSpend,
      };
      const manualEvasive = manualEvasiveRef.current ?? undefined;
      const resolution = resolveAttack({
        source: "ai",
        attackerSide: attackPayload.attacker,
        defenderSide: attackPayload.defender,
        attacker,
        defenderAfterChi,
        effectiveAbility,
        attackChiSpend: attackPayload.modifiers?.chiAttackSpend ?? 0,
        attackChiApplied: true,
        defense: {
          defenseRoll: roll,
          manualDefense: manualDefensePayload,
          defenseOutcome,
          manualEvasive,
          defenseChiSpend: chiSpend,
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
          sendFlowEvent({
            type: event.type,
            next: event.payload.next,
            delayMs: event.payload.delayMs,
            prePhase: event.payload.prePhase,
          });
        });
      }, 600);
    });
  }, [
    animateDefenseDie,
    pendingAttack,
    clearDefenseChiSpend,
    defenseChiSpend,
    applyReactiveChiDefense,
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
          resolution.events.forEach((event) =>
            sendFlowEvent({
              type: event.type,
              next: event.payload.next,
              delayMs: event.payload.delayMs,
              prePhase: event.payload.prePhase,
            })
          );
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
  ]);

  return {
    onConfirmAttack,
    onUserDefenseRoll,
    onUserEvasiveRoll,
  };
}



