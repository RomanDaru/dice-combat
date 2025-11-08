import { useCallback, type MutableRefObject } from "react";
import type { Cue } from "../game/flow/cues";
import { getCueDuration } from "../config/cueDurations";
import type { CombatEvent } from "../game/combat/types";
import type { GameState } from "../game/state";
import type { PlayerState, Side } from "../game/types";
import { resolveAttack } from "../engine/resolveAttack";

type ResolveAttackResult = ReturnType<typeof resolveAttack>;

export type DefenseResolutionContext = {
  attackerSide: Side;
  defenderSide: Side;
  attackerName: string;
  defenderName: string;
  abilityName: string;
  defenseAbilityName?: string | null;
};

export type DefenseResolutionHandler = (
  resolution: ResolveAttackResult,
  context: DefenseResolutionContext
) => void;

type UseDefenseResolutionArgs = {
  enqueueCue: (cue: Cue) => void;
  interruptCue: () => void;
  scheduleCallback: (durationMs: number, callback: () => void) => () => void;
  setPhase: (phase: GameState["phase"]) => void;
  restoreDiceAfterDefense: () => void;
  handleFlowEvent: (
    event: CombatEvent,
    options?: { afterReady?: () => void; durationMs?: number }
  ) => void;
  aiPlay: () => void;
  aiStepDelay: number;
  latestState: MutableRefObject<GameState>;
  popDamage: (side: Side, amount: number, kind?: "hit" | "reflect") => void;
  pushLog: (
    entry: string | string[],
    options?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
  ) => void;
  setPlayer: (side: Side, player: PlayerState) => void;
};

export function useDefenseResolution({
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
}: UseDefenseResolutionArgs) {
  const resolveDefenseWithEvents = useCallback<DefenseResolutionHandler>(
    (resolution, context) => {
      const { attackerSide, defenderSide } = context;
      setPlayer(attackerSide, resolution.updatedAttacker);
      setPlayer(defenderSide, resolution.updatedDefender);
      if (resolution.logs.length) pushLog(resolution.logs);
      resolution.fx.forEach(({ side, amount, kind }) =>
        popDamage(side, amount, kind)
      );

      let summaryDelay = 600;

      if (resolution.summary) {
        const {
          damageDealt,
          blocked,
          reflected,
          negated,
          attackerDefeated,
          defenderDefeated,
        } = resolution.summary;
        const attackerLabel = context.attackerName;
        const defenderLabel = context.defenderName;
        const abilityLabel = context.abilityName || "attack";
        const defenseAbilityName = context.defenseAbilityName ?? null;

        const playerIsAttacker = attackerSide === "you";
        const playerIsDefender = defenderSide === "you";
        const opponentLabel = playerIsAttacker ? defenderLabel : attackerLabel;
        const incomingDamage = damageDealt + blocked;

        let title: string;
        let subtitle: string;
        let priority: Cue["priority"] = "normal";
        let cta: string | undefined;
        let kind: Cue["kind"] = "status";
        let allowDuringTransition = false;
        let cueSide: Side | undefined = attackerSide;

        const lethal = attackerDefeated || defenderDefeated;

        if (lethal) {
          priority = "urgent";
          kind = "attack";
          allowDuringTransition = true;
          if (attackerDefeated && defenderDefeated) {
            title = "Double Knockout";
            subtitle = defenseAbilityName
              ? `You and ${opponentLabel} fall together (${defenseAbilityName}).`
              : `You and ${opponentLabel} fall together.`;
            cueSide = "you";
            cta = "Both fighters collapse.";
          } else if (defenderDefeated) {
            cueSide = attackerSide;
            if (playerIsAttacker) {
              title = "Lethal Hit";
              subtitle = `You defeat ${defenderLabel} with ${abilityLabel}.`;
              cta = "Victory secured!";
            } else {
              title = "Crushing Blow";
              subtitle = `${attackerLabel} defeats you with ${abilityLabel}.`;
              cta = "You are defeated.";
            }
          } else {
            cueSide = defenderSide;
            if (playerIsAttacker) {
              title = "Fatal Reprisal";
              subtitle = defenseAbilityName
                ? `You fall to ${defenderLabel}'s ${defenseAbilityName}.`
                : `You fall to ${defenderLabel}'s retaliation.`;
              cta = "Retaliation succeeds!";
            } else {
              title = "Lethal Counter";
              subtitle = defenseAbilityName
                ? `You defeat ${attackerLabel} with ${defenseAbilityName}.`
                : `You defeat ${attackerLabel} on the counterattack.`;
              cta = "Enemy defeated!";
            }
          }
        } else if (negated) {
          priority = "urgent";
          cueSide = attackerSide;
          if (playerIsDefender) {
            title = defenseAbilityName ? `You: ${defenseAbilityName}` : "Attack Deflected";
            subtitle = defenseAbilityName
              ? `You negate ${attackerLabel}'s ${abilityLabel} with ${defenseAbilityName}.`
              : `You negate ${attackerLabel}'s ${abilityLabel}.`;
            cta = "Attack nullified.";
          } else {
            title = defenseAbilityName ? `${defenderLabel}: ${defenseAbilityName}` : "Attack Deflected";
            subtitle = defenseAbilityName
              ? `${defenderLabel} negates your ${abilityLabel} with ${defenseAbilityName}.`
              : `${defenderLabel} negates your ${abilityLabel}.`;
            cta = "Your attack was nullified.";
          }
        } else if (damageDealt <= 0) {
          if (playerIsDefender) {
            title = defenseAbilityName ? `You: ${defenseAbilityName}` : "Defense Holds";
            if (blocked > 0) {
              subtitle = defenseAbilityName
                ? `You block ${blocked} damage with ${defenseAbilityName}.`
                : `You block ${blocked} damage from ${attackerLabel}'s ${abilityLabel}.`;
              cta = "Damage prevented.";
            } else {
              subtitle = defenseAbilityName
                ? `You use ${defenseAbilityName} to avoid the attack.`
                : `You avoid ${attackerLabel}'s ${abilityLabel}.`;
              cta = "Evaded successfully.";
            }
            cueSide = "you";
          } else {
            title = defenseAbilityName ? `${defenderLabel}: ${defenseAbilityName}` : "Attack Blocked";
            if (blocked > 0) {
              subtitle = defenseAbilityName
                ? `${defenderLabel} blocks ${blocked} damage with ${defenseAbilityName}.`
                : `${defenderLabel} blocks ${blocked} damage from your ${abilityLabel}.`;
              cta = "No damage dealt.";
            } else {
              subtitle = defenseAbilityName
                ? `${defenderLabel} uses ${defenseAbilityName} to avoid your ${abilityLabel}.`
                : `${defenderLabel} avoids your ${abilityLabel}.`;
              cta = "Attack evaded.";
            }
          }
        } else {
          kind = "attack";
          priority = "urgent";
          if (playerIsAttacker) {
            title = abilityLabel ? `Your ${abilityLabel}` : "Your attack";
            const fragments = [`You attacked for ${incomingDamage} damage.`];
            if (blocked > 0) {
              fragments.push(
                defenseAbilityName
                  ? `${defenderLabel} used ${defenseAbilityName} and blocked ${blocked} damage.`
                  : `${defenderLabel} blocked ${blocked} damage.`
              );
            } else {
              fragments.push(`${defenderLabel} failed to block the attack.`);
            }
            if (reflected > 0) {
              fragments.push(`You take ${reflected} reflected damage.`);
            }
            subtitle = fragments.join(" ");
            cta = `Overall you dealt ${damageDealt} damage.`;
            cueSide = "you";
          } else {
            title = abilityLabel ? `${attackerLabel}'s ${abilityLabel}` : `${attackerLabel} attacks`;
            const fragments = [`You are being attacked for ${incomingDamage} damage.`];
            if (blocked > 0) {
              fragments.push(
                defenseAbilityName
                  ? `You used ${defenseAbilityName} and blocked ${blocked} damage.`
                  : `You blocked ${blocked} damage.`
              );
            } else if (defenseAbilityName) {
              fragments.push(`You used ${defenseAbilityName}, but it couldn't block the attack.`);
            } else {
              fragments.push(`You couldn't block the attack.`);
            }
            if (reflected > 0) {
              fragments.push(`${attackerLabel} takes ${reflected} reflected damage.`);
            }
            subtitle = fragments.join(" ");
            cta = `Overall you take ${damageDealt} damage.`;
          }
        }

        interruptCue();
        const summaryDuration = lethal
          ? getCueDuration("defenseSummaryLethal")
          : getCueDuration("defenseSummary");
        summaryDelay = Math.max(summaryDuration, 600);
        enqueueCue({
          kind,
          title,
          subtitle,
          cta,
          durationMs: summaryDuration,
          priority,
          side: cueSide,
          allowDuringTransition,
          mergeKey: lethal ? `battle:${cueSide ?? "any"}` : `defense:${defenderSide}`,
        });
      }

      scheduleCallback(summaryDelay, () => {
        setPhase(resolution.nextPhase);
        restoreDiceAfterDefense();
        resolution.events.forEach((event) => {
          const followUp =
            event.followUp === "trigger_ai_turn"
              ? () => {
                  scheduleCallback(aiStepDelay, () => {
                    const snapshot = latestState.current;
                    const aiState = snapshot.players.ai;
                    const youState = snapshot.players.you;
                    if (!aiState || !youState || aiState.hp <= 0 || youState.hp <= 0) return;
                    aiPlay();
                  });
                }
              : undefined;

          handleFlowEvent(event, followUp ? { afterReady: followUp } : undefined);
        });
      });
    },
    [
      aiPlay,
      aiStepDelay,
      enqueueCue,
      handleFlowEvent,
      interruptCue,
      latestState,
      popDamage,
      pushLog,
      restoreDiceAfterDefense,
      scheduleCallback,
      setPhase,
      setPlayer,
    ]
  );

  return { resolveDefenseWithEvents };
}
