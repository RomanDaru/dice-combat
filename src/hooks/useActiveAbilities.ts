import { useCallback, useMemo } from "react";
import { useGame } from "../context/GameContext";
import type { GameState } from "../game/state";
import type { GameFlowEvent } from "./useTurnController";
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
import { useLatest } from "./useLatest";

type UseActiveAbilitiesArgs = {
  side: Side;
  pushLog: ActiveAbilityContext["pushLog"];
  popDamage: ActiveAbilityContext["popDamage"];
  sendFlowEvent: (event: GameFlowEvent) => boolean;
  handleControllerAction: (
    action: NonNullable<ActiveAbilityOutcome["controllerAction"]>,
    context: ActiveAbilityContext
  ) => void;
};

const toActiveAbilityPhase = (phase: Phase): ActiveAbilityPhase | null => {
  switch (phase) {
    case "upkeep":
    case "roll":
    case "attack":
    case "defense":
    case "end":
      return phase;
    default:
      return null;
  }
};

const matchesPhase = (
  abilityPhase: ActiveAbilityPhase | ActiveAbilityPhase[],
  phase: Phase
) => {
  const normalized = toActiveAbilityPhase(phase);
  if (!normalized) return false;
  const phases = Array.isArray(abilityPhase) ? abilityPhase : [abilityPhase];
  return phases.includes(normalized);
};

const hasTokenCost = (tokens: Tokens, cost?: Partial<Tokens>) => {
  if (!cost) return true;
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
  sendFlowEvent,
  handleControllerAction,
}: UseActiveAbilitiesArgs) => {
  const { state, dispatch } = useGame();
  const latestState = useLatest(state);

  const heroId = state.players[side]?.hero.id;
  const abilities = useMemo<ActiveAbility[]>(() => {
    if (!heroId) return [];
    return getActiveAbilitiesForHero(heroId);
  }, [heroId]);

  const buildContext = useCallback(
    (
      ability: ActiveAbility,
      baseState?: GameState
    ): ActiveAbilityContext | null => {
      const current = baseState ?? latestState.current;
      const actingPlayer = current.players[side];
      const opposingPlayer = current.players[side === "you" ? "ai" : "you"];
      if (!actingPlayer || !opposingPlayer) return null;
      return {
        state: current,
        dispatch,
        phase: current.phase as Phase,
        turn: current.turn,
        side,
        actingPlayer,
        opposingPlayer,
        pendingAttack: current.pendingAttack,
        abilityId: ability.id,
        pushLog,
        popDamage,
      };
    },
    [dispatch, latestState, popDamage, pushLog, side]
  );

  const canPayCost = useCallback(
    (ability: ActiveAbility, baseState?: GameState) => {
      const current = baseState ?? latestState.current;
      const actingPlayer = current.players[side];
      if (!actingPlayer) return false;
      if (!ability.cost?.tokens) return true;
      return hasTokenCost(actingPlayer.tokens, ability.cost.tokens);
    },
    [latestState, side]
  );

  const availableAbilities = useMemo(() => {
    return abilities.filter((ability) => {
      const current = state;
      const context = buildContext(ability, current);
      if (!context) return false;
      if (!matchesPhase(ability.phase, context.phase)) return false;
      if (!canPayCost(ability, current)) return false;
      return ability.canUse(context);
    });
  }, [abilities, buildContext, canPayCost, state]);

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
        const { phase, turn, round, pendingAttack, pendingStatusClear, ...rest } =
          outcome.statePatch;
        if (phase) {
          sendFlowEvent({ type: "SET_PHASE", phase });
        }
        if (turn) {
          dispatch({ type: "SET_TURN", turn });
        }
        if (typeof round === "number") {
          dispatch({ type: "SET_ROUND", round });
        }
        if (pendingAttack !== undefined) {
          dispatch({ type: "SET_PENDING_ATTACK", attack: pendingAttack });
        }
        if (pendingStatusClear !== undefined) {
          dispatch({ type: "SET_PENDING_STATUS", status: pendingStatusClear });
        }
        const remaining = Object.keys(rest);
        if (remaining.length > 0) {
          console.warn(
            "[useActiveAbilities] Unhandled statePatch keys:",
            remaining
          );
        }
      }
      if (outcome?.nextPhase) {
        sendFlowEvent({ type: "SET_PHASE", phase: outcome.nextPhase });
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
      sendFlowEvent,
      side,
    ]
  );

  return {
    abilities: availableAbilities,
    performAbility,
  };
};
