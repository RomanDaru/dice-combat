import { useCallback, useEffect, useRef } from "react";
import { rollDie } from "../game/combos";
import { applyAttack, calculateDefenseOutcome } from "../game/engine";
import type { GameState } from "../game/state";
import type {
  Ability,
  DefenseCalculationResult,
  PlayerState,
  Side,
} from "../game/types";
import {
  buildAttackResolutionLines,
  ManualEvasiveLog,
} from "./useCombatLog";
import { useGame } from "../context/GameContext";
import { useActiveAbilities } from "./useActiveAbilities";
import { ActiveAbilityIds } from "../game/activeAbilities";

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
  tickAndStart: (next: Side, afterReady?: () => void) => boolean;
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
  tickAndStart,
  aiPlay,
  aiStepDelay,
}: UseDefenseActionsArgs) {
  const { state, dispatch } = useGame();
  const stateRef = useRef<GameState>(state);
  const manualEvasiveRef = useRef<ManualEvasiveLog | null>(null);

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

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const patchState = useCallback(
    (partial: Partial<GameState>) => {
      dispatch({ type: "PATCH_STATE", payload: partial });
      stateRef.current = { ...stateRef.current, ...partial };
    },
    [dispatch]
  );

  const patchAiDefense = useCallback(
    (partial: Partial<GameState["aiDefense"]>) => {
      dispatch({ type: "PATCH_AI_DEFENSE", payload: partial });
      stateRef.current = {
        ...stateRef.current,
        aiDefense: { ...stateRef.current.aiDefense, ...partial },
      };
    },
    [dispatch]
  );

  const setPendingAttackDispatch = useCallback(
    (attack: GameState["pendingAttack"]) => {
      dispatch({ type: "SET_PENDING_ATTACK", attack });
      stateRef.current = { ...stateRef.current, pendingAttack: attack };
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
      stateRef.current = {
        ...stateRef.current,
        players: { ...stateRef.current.players, [side]: player },
      };
    },
    [dispatch]
  );

  const onConfirmAttack = useCallback(() => {
    manualEvasiveRef.current = null;
    if (turn !== "you" || rolling.some(Boolean)) return;
    const ab = ability;
    if (!ab) {
      clearAttackChiSpend();
      const diceValues = [...dice];
      logPlayerNoCombo(diceValues, you.hero.name);
      patchState({ phase: "end" });
      window.setTimeout(() => {
        const cont = tickAndStart("ai", () => {
          window.setTimeout(() => {
            const aiState = stateRef.current.players.ai;
            const youState = stateRef.current.players.you;
            if (!aiState || !youState || aiState.hp <= 0 || youState.hp <= 0)
              return;
            aiPlay();
          }, 400);
        });
        if (!cont) return;
      }, 600);
      return;
    }

    patchState({ phase: "attack" });
    patchAiDefense({ inProgress: true, defenseRoll: null, evasiveRoll: null });
    const attackDice = [...dice];
    window.setTimeout(() => {
      const snapshot = stateRef.current;
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
        ...ab,
        damage: ab.damage + chiAttackSpend,
      };

      logPlayerAttackStart(attackDice, effectiveAbility, attacker.hero.name);

      let manualEvasive: ManualEvasiveLog | undefined;
      let defenseOutcome: ReturnType<typeof calculateDefenseOutcome> | undefined;
      let manualDefense:
        | {
            reduced: number;
            reflect: number;
            roll: number;
            label?: string;
          }
        | undefined;
      let defenseChiSpent = 0;

      const aiEvasiveAbility = aiActiveAbilities.find(
        (ability) => ability.id === ActiveAbilityIds.SHADOW_MONK_EVASIVE_ID
      );
      let aiShouldAttemptEvasive = false;
      if (aiEvasiveAbility) {
        aiShouldAttemptEvasive = performAiActiveAbility(aiEvasiveAbility.id);
      } else if (defender.tokens.evasive > 0) {
        aiShouldAttemptEvasive = true;
      }

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

      let defenderBeforeChi = defender;
      if (!(manualEvasive && manualEvasive.success)) {
        const defenseRoll = defender.hero.defense.roll(defender.tokens);
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
        defender = chiAdjustment.defenderAfter;
        defenseOutcome = chiAdjustment.outcome;
        if (defenseChiSpent > 0) {
          setPlayer("ai", defender);
          consumeTurnChi("ai", defenseChiSpent);
          if (manualDefense) {
            manualDefense = {
              ...manualDefense,
              reduced: defenseOutcome.totalBlock,
              chiUsed: (manualDefense.chiUsed ?? 0) + defenseChiSpent,
            };
          }
        }
      }

      const [nextAttacker, nextDefender] = applyAttack(
        attacker,
        defender,
        effectiveAbility,
        {
          manualDefense,
          manualEvasive,
        }
      );

      const damageDealt =
        defenseOutcome?.damageDealt ??
        Math.max(0, defender.hp - nextDefender.hp);
      const reflectDamage =
        defenseOutcome?.totalReflect ??
        Math.max(0, attacker.hp - nextAttacker.hp);

      if (damageDealt > 0) {
        popDamage("ai", damageDealt, "hit");
      }
      if (reflectDamage > 0) {
        popDamage("you", reflectDamage, "reflect");
      }
      setPlayer("you", nextAttacker);
      setPlayer("ai", nextDefender);
      setPendingAttackDispatch(null);
      const resolutionLines = buildAttackResolutionLines({
        attackerBefore: attacker,
        attackerAfter: nextAttacker,
        defenderBefore: defenderBeforeChi,
        defenderAfter: nextDefender,
        incomingDamage: effectiveAbility.damage,
        defenseRoll: defenseOutcome?.defenseRoll ?? manualDefense?.roll,
        manualDefense,
        manualEvasive,
        reflectedDamage: reflectDamage,
        defenseOutcome,
        attackChiSpent: chiAttackSpend,
        defenseChiSpent,
      });
      if (resolutionLines.length) {
        pushLog(resolutionLines);
      }
      patchAiDefense({ inProgress: false });
      patchState({ phase: "end" });
      if (nextDefender.hp <= 0 || nextAttacker.hp <= 0) return;
      window.setTimeout(() => {
        const cont = tickAndStart("ai", () => {
          window.setTimeout(() => {
            const aiState = stateRef.current.players.ai;
            const youState = stateRef.current.players.you;
            if (!aiState || !youState || aiState.hp <= 0 || youState.hp <= 0)
              return;
            aiPlay();
          }, aiStepDelay);
        });
        if (!cont) return;
      }, 700);
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
    patchState,
    popDamage,
    pushLog,
    setPendingAttackDispatch,
    setPlayer,
    consumeTurnChi,
    rolling,
    tickAndStart,
    turn,
    turnChiAvailable.ai,
    turnChiAvailable.you,
    you.hero.name,
  ]);

  const onUserDefenseRoll = useCallback(() => {
    if (!pendingAttack || pendingAttack.defender !== "you") return;
    patchState({ phase: "defense" });
    const attackPayload = pendingAttack;
    animateDefenseDie((roll) => {
      const snapshot = stateRef.current;
      const attacker = snapshot.players[attackPayload.attacker];
      const defender = snapshot.players[attackPayload.defender];
      if (!attacker || !defender) return;
      const effectiveAbility = attackPayload.ability;
      const defenseOutcome = calculateDefenseOutcome(
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
      const adjustedOutcome = chiAdjustment.outcome;
      const chiSpend = chiAdjustment.chiSpent;
      const defenderAfterChi = chiAdjustment.defenderAfter;
      if (chiSpend > 0) {
        setPlayer(attackPayload.defender, defenderAfterChi);
        consumeTurnChi(defenderSide, chiSpend);
      }
      const manualDefensePayload = {
        reduced: adjustedOutcome.totalBlock,
        reflect: adjustedOutcome.totalReflect,
        roll,
        label: defender.hero.name,
        chiUsed: chiSpend,
      };
      const manualEvasive = manualEvasiveRef.current ?? undefined;
      const [nextAttacker, nextDefender] = applyAttack(
        attacker,
        defenderAfterChi,
        effectiveAbility,
        {
          manualDefense: manualDefensePayload,
          manualEvasive,
        }
      );
      if (adjustedOutcome.damageDealt > 0) {
        popDamage(attackPayload.defender, adjustedOutcome.damageDealt, "hit");
      }
      if (adjustedOutcome.totalReflect > 0) {
        popDamage(attackPayload.attacker, adjustedOutcome.totalReflect, "reflect");
      }
      setPlayer(attackPayload.attacker, nextAttacker);
      setPlayer(attackPayload.defender, nextDefender);
      setPendingAttackDispatch(null);
      const resolutionLines = buildAttackResolutionLines({
        attackerBefore: attacker,
        attackerAfter: nextAttacker,
        defenderBefore: defender,
        defenderAfter: nextDefender,
        incomingDamage: effectiveAbility.damage,
        defenseRoll: roll,
        manualDefense: manualDefensePayload,
        manualEvasive,
        reflectedDamage: adjustedOutcome.totalReflect,
        defenseOutcome: adjustedOutcome,
        attackChiSpent: attackPayload.modifiers?.chiAttackSpend ?? 0,
        defenseChiSpent: chiSpend,
      });
      manualEvasiveRef.current = null;
      clearDefenseChiSpend();
      if (resolutionLines.length) {
        pushLog(resolutionLines);
      }
      window.setTimeout(() => {
        patchState({ phase: "end" });
        restoreDiceAfterDefense();
        if (nextDefender.hp <= 0 || nextAttacker.hp <= 0) return;
        window.setTimeout(() => tickAndStart("you"), 700);
      }, 600);
    });
  }, [
    animateDefenseDie,
    pendingAttack,
    clearDefenseChiSpend,
    defenseChiSpend,
    applyReactiveChiDefense,
    patchState,
    popDamage,
    pushLog,
    restoreDiceAfterDefense,
    setPendingAttackDispatch,
    setPlayer,
    consumeTurnChi,
    tickAndStart,
    turnChiAvailable.ai,
    turnChiAvailable.you,
  ]);

  const onUserEvasiveRoll = useCallback(() => {
    if (!pendingAttack || pendingAttack.defender !== "you") return;
    const defenderSnapshot = stateRef.current.players[pendingAttack.defender];
    if (!defenderSnapshot || defenderSnapshot.tokens.evasive <= 0) return;
    patchState({ phase: "defense" });
    const attackPayload = pendingAttack;
    animateDefenseDie((evasiveRoll) => {
      const snapshot = stateRef.current;
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
        setPendingAttackDispatch(null);
        const resolutionLines = buildAttackResolutionLines({
          attackerBefore: attacker,
          attackerAfter: attacker,
          defenderBefore: consumedDefender,
          defenderAfter: consumedDefender,
          incomingDamage: attackPayload.ability.damage,
          defenseRoll: undefined,
          manualEvasive: manualEvasiveAttempt,
          reflectedDamage: 0,
          attackChiSpent: attackPayload.modifiers?.chiAttackSpend ?? 0,
        });
        if (resolutionLines.length) {
          pushLog(resolutionLines);
        }
        window.setTimeout(() => {
          patchState({ phase: "end" });
          restoreDiceAfterDefense();
          if (attacker.hp <= 0 || consumedDefender.hp <= 0) return;
          window.setTimeout(() => tickAndStart("you"), 700);
        }, 600);
        manualEvasiveRef.current = null;
        clearDefenseChiSpend();
        return;
      }
      // Evasive failed; defender may still choose to roll a defense die manually.
    }, 650);
  }, [
    animateDefenseDie,
    clearDefenseChiSpend,
    pendingAttack,
    patchState,
    pushLog,
    restoreDiceAfterDefense,
    setPendingAttackDispatch,
    setPlayer,
    tickAndStart,
  ]);

  return {
    onConfirmAttack,
    onUserDefenseRoll,
    onUserEvasiveRoll,
  };
}



