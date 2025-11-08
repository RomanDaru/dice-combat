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

type DefenseSummaryParams = {
  summary: NonNullable<ResolveAttackResult["summary"]>;
  context: DefenseResolutionContext;
  attackerSide: Side;
  defenderSide: Side;
};

type DefenseSummaryCueData = {
  title: string;
  subtitle: string;
  cta?: string;
  priority: Cue["priority"];
  side: Side;
  allowDuringTransition: boolean;
  lethal: boolean;
  mergeKey: string;
};

const formatStatsLine = (
  blocked: number,
  damageDealt: number,
  reflected: number,
  negated: boolean
) => {
  const entries = [`Blocked ${blocked}`, `Damage ${damageDealt}`];
  if (reflected > 0) {
    entries.push(`Reflect ${reflected}`);
  }
  if (negated) {
    entries.push("Negated");
  }
  return entries.join(" • ");
};

const buildDefenseSummaryCue = ({
  summary,
  context,
  attackerSide,
  defenderSide,
}: DefenseSummaryParams): DefenseSummaryCueData => {
  const {
    damageDealt,
    blocked,
    reflected,
    negated,
    attackerDefeated,
    defenderDefeated,
  } = summary;
  const attackerLabel = context.attackerName;
  const defenderLabel = context.defenderName;
  const playerIsDefender = defenderSide === "you";
  const playerIsAttacker = attackerSide === "you";
  const abilityLabel = context.abilityName || "attack";
  const defenseAbilityName = context.defenseAbilityName ?? null;
  const statsLine = formatStatsLine(blocked, damageDealt, reflected, negated);

  const abilityPair = defenseAbilityName
    ? `${abilityLabel} vs ${defenseAbilityName}`
    : abilityLabel;

  const lethal = attackerDefeated || defenderDefeated;
  let title: string;
  let lead: string;
  if (attackerDefeated && defenderDefeated) {
    title = "Double Knockout";
    lead = `${attackerLabel} and ${defenderLabel} fall together.`;
  } else if (defenderDefeated) {
    title = playerIsDefender ? "You Fall" : `${defenderLabel} Falls`;
    lead = playerIsDefender
      ? `${attackerLabel}'s ${abilityLabel} finishes you.`
      : `You defeat ${defenderLabel} with ${abilityLabel}.`;
  } else if (attackerDefeated) {
    title = playerIsAttacker ? "You Fall" : `${attackerLabel} Falls`;
    lead = playerIsAttacker
      ? `${defenderLabel}'s ${defenseAbilityName ?? "counter"} ends you.`
      : `${defenderLabel} defeats ${attackerLabel} with a counterattack.`;
  } else if (negated) {
    title = "Attack Negated";
    lead = playerIsDefender
      ? `You nullify ${attackerLabel}'s ${abilityLabel}.`
      : `${defenderLabel} nullifies your ${abilityLabel}.`;
  } else if (damageDealt > 0) {
    title = playerIsDefender ? "Damage Taken" : "Attack Lands";
    lead = playerIsDefender
      ? `You take ${damageDealt} damage from ${attackerLabel}.`
      : `${defenderLabel} takes ${damageDealt} damage.`;
  } else if (blocked > 0) {
    title = playerIsDefender ? "Defense Holds" : "Attack Blocked";
    lead = playerIsDefender
      ? `You block ${blocked} damage.`
      : `${defenderLabel} blocks ${blocked} damage.`;
  } else {
    title = playerIsDefender ? "Attack Evaded" : "Enemy Evades";
    lead = playerIsDefender
      ? `You evade ${attackerLabel}'s ${abilityLabel}.`
      : `${defenderLabel} evades your ${abilityLabel}.`;
  }

  const subtitle = `${lead} ${statsLine}`.trim();
  const cta = abilityPair ? `${attackerLabel}'s ${abilityPair}` : undefined;
  const priority: Cue["priority"] =
    lethal || damageDealt > 0 || negated ? "urgent" : "normal";

  return {
    title,
    subtitle,
    cta,
    priority,
    side: defenderSide,
    allowDuringTransition: lethal,
    lethal,
    mergeKey: `defenseSummary:${defenderSide}`,
  };
};

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
        const summaryCue = buildDefenseSummaryCue({
          summary: resolution.summary,
          context,
          attackerSide,
          defenderSide,
        });
        interruptCue();
        const summaryDuration = summaryCue.lethal
          ? getCueDuration("defenseSummaryLethal")
          : getCueDuration("defenseSummary");
        summaryDelay = Math.max(summaryDuration, 600);
        enqueueCue({
          kind: "defenseSummary",
          title: summaryCue.title,
          subtitle: summaryCue.subtitle,
          cta: summaryCue.cta,
          durationMs: summaryDuration,
          priority: summaryCue.priority,
          side: summaryCue.side,
          allowDuringTransition: summaryCue.allowDuringTransition,
          mergeKey: summaryCue.mergeKey,
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
