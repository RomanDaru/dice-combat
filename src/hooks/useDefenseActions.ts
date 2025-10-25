import { useCallback, useEffect, useRef } from "react";
import { rollDie } from "../game/combos";
import { applyAttack } from "../game/engine";
import type { GameState } from "../game/state";
import type { Ability, PlayerState, Side } from "../game/types";
import { buildAttackResolutionLines } from "./useCombatLog";
import { useGame } from "../context/GameContext";

type UseDefenseActionsArgs = {
  turn: Side;
  rolling: boolean[];
  ability: Ability | null;
  dice: number[];
  you: PlayerState;
  pendingAttack: GameState["pendingAttack"];
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
    },
    [dispatch]
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
    if (turn !== "you" || rolling.some(Boolean)) return;
    const ab = ability;
    if (!ab) {
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
      const attacker = snapshot.players.you;
      const defender = snapshot.players.ai;
      if (!attacker || !defender || attacker.hp <= 0 || defender.hp <= 0) {
        patchAiDefense({ inProgress: false, defenseRoll: null, evasiveRoll: null });
        return;
      }
      logPlayerAttackStart(attackDice, ab, attacker.hero.name);
      let manualEvasive:
        | undefined
        | { used: boolean; success: boolean; roll: number; label?: string } =
        undefined;
      if (defender.tokens.evasive > 0) {
        const roll = rollDie();
        patchAiDefense({ evasiveRoll: roll });
        manualEvasive = {
          used: true,
          success: roll >= 5,
          roll,
          label: defender.hero.name,
        };
      }
      let manualDefense:
        | undefined
        | {
            reduced: number;
            reflect: number;
            roll: number;
            label?: string;
            baseReduced?: number;
            chiUsed?: number;
          } = undefined;
      if (!(manualEvasive && manualEvasive.success)) {
        const defenseRoll = defender.hero.defense.roll(defender.tokens);
        patchAiDefense({ defenseRoll: defenseRoll.roll });
        const isMonkDefender = defender.hero.id === "Shadow Monk";
        const defenseWithoutChi = isMonkDefender
          ? defender.hero.defense.fromRoll({
              roll: defenseRoll.roll,
              tokens: { ...defender.tokens, chi: 0 },
            })
          : null;
        const baseReduced = defenseWithoutChi?.reduced ?? defenseRoll.reduced;
        manualDefense = {
          reduced: defenseRoll.reduced,
          reflect: defenseRoll.reflect,
          roll: defenseRoll.roll,
          label: defender.hero.name,
          baseReduced,
          chiUsed: isMonkDefender
            ? Math.max(0, defenseRoll.reduced - baseReduced)
            : undefined,
        };
      }

      const [nextAttacker, nextDefender] = applyAttack(attacker, defender, ab, {
        manualDefense,
        manualEvasive,
      });
      const dmgToAi = Math.max(0, defender.hp - nextDefender.hp);
      const dmgToYouReflect = Math.max(0, attacker.hp - nextAttacker.hp);
      if (dmgToAi > 0) popDamage("ai", dmgToAi, "hit");
      if (dmgToYouReflect > 0) popDamage("you", dmgToYouReflect, "reflect");
      setPlayer("you", nextAttacker);
      setPlayer("ai", nextDefender);
      const resolutionLines = buildAttackResolutionLines({
        attackerBefore: attacker,
        attackerAfter: nextAttacker,
        defenderBefore: defender,
        defenderAfter: nextDefender,
        incomingDamage: ab.damage,
        defenseRoll: manualDefense?.roll,
        manualDefense,
        manualEvasive,
        reflectedDamage: dmgToYouReflect,
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
    dice,
    logPlayerAttackStart,
    logPlayerNoCombo,
    patchAiDefense,
    patchState,
    popDamage,
    pushLog,
    rolling,
    tickAndStart,
    turn,
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
      const defense = defender.hero.defense.fromRoll({
        roll,
        tokens: defender.tokens,
      });
      const isMonkDefender = defender.hero.id === "Shadow Monk";
      const defenseWithoutChi = isMonkDefender
        ? defender.hero.defense.fromRoll({
            roll,
            tokens: { ...defender.tokens, chi: 0 },
          })
        : null;
      const baseReduced = defenseWithoutChi?.reduced ?? defense.reduced;
      const manualDefensePayload = {
        reduced: defense.reduced,
        reflect: defense.reflect,
        roll,
        label: defender.hero.name,
        baseReduced,
        chiUsed: isMonkDefender
          ? Math.max(0, defense.reduced - baseReduced)
          : undefined,
      };
      const incoming = attackPayload.ability.damage;
      const dealt = Math.max(0, incoming - defense.reduced);
      const [nextAttacker, nextDefender] = applyAttack(
        attacker,
        defender,
        attackPayload.ability,
        {
          manualDefense: manualDefensePayload,
        }
      );
      if (dealt > 0) popDamage(attackPayload.defender, dealt, "hit");
      const reflected = Math.max(0, attacker.hp - nextAttacker.hp);
      if (reflected > 0) popDamage(attackPayload.attacker, reflected, "reflect");
      setPlayer(attackPayload.attacker, nextAttacker);
      setPlayer(attackPayload.defender, nextDefender);
      setPendingAttackDispatch(null);
      const resolutionLines = buildAttackResolutionLines({
        attackerBefore: attacker,
        attackerAfter: nextAttacker,
        defenderBefore: defender,
        defenderAfter: nextDefender,
        incomingDamage: incoming,
        defenseRoll: roll,
        manualDefense: manualDefensePayload,
        manualEvasive: undefined,
        reflectedDamage: reflected,
      });
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
    popDamage,
    pushLog,
    restoreDiceAfterDefense,
    setPendingAttackDispatch,
    setPlayer,
    tickAndStart,
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
      if (evasiveRoll >= 5) {
        setPlayer(attackPayload.defender, consumedDefender);
        setPendingAttackDispatch(null);
        const resolutionLines = buildAttackResolutionLines({
          attackerBefore: attacker,
          attackerAfter: attacker,
          defenderBefore: consumedDefender,
          defenderAfter: consumedDefender,
          incomingDamage: attackPayload.ability.damage,
          defenseRoll: undefined,
          manualEvasive: {
            used: true,
            success: true,
            roll: evasiveRoll,
          },
          reflectedDamage: 0,
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
        return;
      }
      animateDefenseDie(
        (defenseRoll) => {
          const defense = consumedDefender.hero.defense.fromRoll({
            roll: defenseRoll,
            tokens: consumedDefender.tokens,
          });
          const isMonk = consumedDefender.hero.id === "Shadow Monk";
          const monkBaseReduced = isMonk
            ? consumedDefender.hero.defense.fromRoll({
                roll: defenseRoll,
                tokens: { ...consumedDefender.tokens, chi: 0 },
              }).reduced
            : undefined;
          const incoming = attackPayload.ability.damage;
          const dealt = Math.max(0, incoming - defense.reduced);
          const manualDefensePayload = {
            reduced: defense.reduced,
            reflect: defense.reflect,
            roll: defenseRoll,
            label: consumedDefender.hero.name,
            baseReduced: isMonk
              ? monkBaseReduced ?? defense.reduced
              : defense.reduced,
            chiUsed: isMonk
              ? Math.max(0, defense.reduced - (monkBaseReduced ?? 0))
              : undefined,
          };
          const [nextAttacker, nextDefender] = applyAttack(
            attacker,
            consumedDefender,
            attackPayload.ability,
            {
              manualDefense: manualDefensePayload,
              manualEvasive: {
                used: true,
                success: false,
                roll: evasiveRoll,
                label: consumedDefender.hero.name,
              },
            }
          );
          if (dealt > 0) popDamage(attackPayload.defender, dealt, "hit");
          const reflected = Math.max(0, attacker.hp - nextAttacker.hp);
          if (reflected > 0)
            popDamage(attackPayload.attacker, reflected, "reflect");
          setPlayer(attackPayload.attacker, nextAttacker);
          setPlayer(attackPayload.defender, nextDefender);
          setPendingAttackDispatch(null);
          const resolutionLines = buildAttackResolutionLines({
            attackerBefore: attacker,
            attackerAfter: nextAttacker,
            defenderBefore: consumedDefender,
            defenderAfter: nextDefender,
            incomingDamage: incoming,
            defenseRoll: defenseRoll,
            manualDefense: manualDefensePayload,
            manualEvasive: {
              used: true,
              success: false,
              roll: evasiveRoll,
            },
            reflectedDamage: reflected,
          });
          if (resolutionLines.length) {
            pushLog(resolutionLines);
          }
          window.setTimeout(() => {
            patchState({ phase: "end" });
            restoreDiceAfterDefense();
            if (nextDefender.hp <= 0 || nextAttacker.hp <= 0) return;
            window.setTimeout(() => tickAndStart("you"), 700);
          }, 600);
        },
        650
      );
    }, 650);
  }, [
    animateDefenseDie,
    pendingAttack,
    popDamage,
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



