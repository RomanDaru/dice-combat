import { useCallback, useMemo } from "react";
import { useGame } from "../context/GameContext";
import { getActiveAbilitiesForHero } from "../game/activeAbilities";
import type {
  ActiveAbility,
  ActiveAbilityContext,
  ActiveAbilityOutcome,
  ActiveAbilityPhase,
  Phase,
  Side,
  Tokens,
} from "../game/types";

type UseActiveAbilitiesArgs = {
  side: Side;
  pushLog: ActiveAbilityContext["pushLog"];
  popDamage: ActiveAbilityContext["popDamage"];
  handleControllerAction: (
    action: NonNullable<ActiveAbilityOutcome["controllerAction"]>,
    context: ActiveAbilityContext
  ) => void;
};

const matchesPhase = (abilityPhase: ActiveAbilityPhase | ActiveAbilityPhase[], phase: Phase) => {
  const phases = Array.isArray(abilityPhase) ? abilityPhase : [abilityPhase];
  return phases.includes(phase);
};

const hasTokenCost = (tokens: Tokens, cost: Partial<Tokens>) => {
  return Object.entries(cost).every(([tokenKey, amount]) => {
    const current = tokens[tokenKey as keyof Tokens] ?? 0;
    return current >= (amount ?? 0);
  });
};

const applyTokenConsumption = (
  tokens: Tokens,
  consumed: Partial<Tokens>
): Tokens => {
  const updated: Tokens = { ...tokens };
  Object.entries(consumed).forEach(([tokenKey, amount]) => {
    const key = tokenKey as keyof Tokens;
    const current = updated[key] ?? 0;
    updated[key] = Math.max(0, current - (amount ?? 0));
  });
  return updated;
};

export const useActiveAbilities = ({
  side,
  pushLog,
  popDamage,
  handleControllerAction,
}: UseActiveAbilitiesArgs) => {
  const { state, dispatch } = useGame();

  const actingPlayer = state.players[side];
  const opposingPlayer = state.players[side === "you" ? "ai" : "you"];

  const abilities = useMemo<ActiveAbility[]>(() => {
    if (!actingPlayer) return [];
    return getActiveAbilitiesForHero(actingPlayer.hero.id);
  }, [actingPlayer?.hero.id]);

  const buildContext = useCallback(
    (ability: ActiveAbility): ActiveAbilityContext | null => {
      if (!actingPlayer || !opposingPlayer) return null;
      return {
        state,
        dispatch,
        phase: state.phase as Phase,
        turn: state.turn,
        side,
        actingPlayer,
        opposingPlayer,
        abilityId: ability.id,
        pushLog,
        popDamage,
      };
    },
    [actingPlayer, opposingPlayer, dispatch, popDamage, pushLog, state, side]
  );

  const canPayCost = useCallback(
    (ability: ActiveAbility) => {
      if (!actingPlayer) return false;
      if (!ability.cost?.tokens) return true;
      return hasTokenCost(actingPlayer.tokens, ability.cost.tokens);
    },
    [actingPlayer]
  );

  const availableAbilities = useMemo(() => {
    return abilities.filter((ability) => {
      const context = buildContext(ability);
      if (!context) return false;
      if (!matchesPhase(ability.phase, context.phase)) return false;
      if (!canPayCost(ability)) return false;
      return ability.canUse(context);
    });
  }, [abilities, buildContext, canPayCost]);

  const performAbility = useCallback(
    (abilityId: string) => {
      const ability = abilities.find((ab) => ab.id === abilityId);
      if (!ability) return false;
      const context = buildContext(ability);
      if (!context) return false;
      if (!matchesPhase(ability.phase, context.phase)) return false;
      if (!canPayCost(ability)) return false;
      if (!ability.canUse(context)) return false;

      const outcome = ability.execute(context);

      if (outcome?.tokensConsumed) {
        const updatedPlayer = {
          ...context.actingPlayer,
          tokens: applyTokenConsumption(
            context.actingPlayer.tokens,
            outcome.tokensConsumed
          ),
        };
        dispatch({
          type: "SET_PLAYER",
          side,
          player: updatedPlayer,
        });
      }

      if (outcome?.logs) {
        outcome.logs.forEach((entry) => pushLog(entry));
      }
      if (outcome?.damage) {
        outcome.damage.forEach(({ side: damageSide, amount, kind }) =>
          popDamage(damageSide, amount, kind)
        );
      }
      if (outcome?.controllerAction) {
        handleControllerAction(outcome.controllerAction, context);
      }
      if (outcome?.statePatch) {
        dispatch({ type: "PATCH_STATE", payload: outcome.statePatch });
      }
      if (outcome?.nextPhase) {
        dispatch({ type: "PATCH_STATE", payload: { phase: outcome.nextPhase } });
      }
      return true;
    },
    [
      abilities,
      buildContext,
      canPayCost,
      dispatch,
      handleControllerAction,
      popDamage,
      pushLog,
      side,
    ]
  );

  return {
    abilities: availableAbilities,
    performAbility,
  };
};
