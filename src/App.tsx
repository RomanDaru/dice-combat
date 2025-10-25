import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import Section from "./components/Section";
import HPBar from "./components/HPBar";
import TokenChips from "./components/TokenChips";
import AbilityList from "./components/AbilityList";
import DiceGrid from "./components/DiceGrid";
import TurnProgress from "./components/TurnProgress";
import DamageOverlay from "./components/DamageOverlay";
import HeroSelectScreen, {
  HeroOption,
} from "./components/HeroSelectScreen";
import { HEROES } from "./game/heroes";
import { Phase, PlayerState, Side, Ability, Hero } from "./game/types";
import { bestAbility, detectCombos, rollDie } from "./game/combos";
import { applyAttack } from "./game/engine";
import { tickStatuses } from "./game/defense";
import {
  AiDefenseState,
  AiPreviewState,
  GameState,
  PendingStatusClear,
  createInitialState,
  gameReducer,
} from "./game/state";
import PyromancerPortrait from "./assets/Pyromancer_Hero.png";
import ShadowMonkPortrait from "./assets/Shadow_Monk_Hero.png";

const HERO_IMAGES: Record<string, string> = {
  Pyromancer: PyromancerPortrait,
  "Shadow Monk": ShadowMonkPortrait,
};

export default function App() {
  const [state, dispatch] = useReducer(
    gameReducer,
    undefined,
    () => createInitialState(HEROES.Pyromancer, HEROES["Shadow Monk"])
  );

  const stateRef = useRef<GameState>(state);
  const [screen, setScreen] = useState<"welcome" | "game">("welcome");
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const {
    players,
    turn,
    phase,
    round,
    dice,
    held,
    rolling,
    rollsLeft,
    log,
    aiPreview,
    aiDefense,
    pendingAttack,
    pendingStatusClear,
    savedDefenseDice,
    fx,
  } = state;

  const heroOptions: HeroOption[] = useMemo(
    () =>
      Object.values(HEROES).map((hero) => ({
        hero,
        image: HERO_IMAGES[hero.id] ?? PyromancerPortrait,
      })),
    []
  );

  const startBattle = (playerHero: Hero, aiHero: Hero) => {
    if (timersRef.current) {
      window.clearInterval(timersRef.current);
      timersRef.current = null;
    }
    statusResumeRef.current = null;
    const resetState = createInitialState(playerHero, aiHero);
    stateRef.current = resetState;
    dispatch({
      type: "RESET",
      payload: { youHero: playerHero, aiHero },
    });
    setScreen("game");
    window.setTimeout(() => tickAndStart("you"), 0);
  };

  const handleHeroSelection = (playerHero: Hero, aiHero: Hero) => {
    startBattle(playerHero, aiHero);
  };

  const patchState = (partial: Partial<GameState>) =>
    dispatch({ type: "PATCH_STATE", payload: partial });

  const patchAiPreview = (partial: Partial<AiPreviewState>) =>
    dispatch({ type: "PATCH_AI_PREVIEW", payload: partial });

  const patchAiDefense = (partial: Partial<AiDefenseState>) =>
    dispatch({ type: "PATCH_AI_DEFENSE", payload: partial });

  const pushLog = (
    entry: string | string[],
    options: { blankLineBefore?: boolean; blankLineAfter?: boolean } = {}
  ) => {
    if (options.blankLineBefore) dispatch({ type: "PUSH_LOG", entry: "" });
    const text = Array.isArray(entry) ? entry.join("\n") : entry;
    dispatch({ type: "PUSH_LOG", entry: text });
    if (options.blankLineAfter) dispatch({ type: "PUSH_LOG", entry: "" });
  };

  const setPlayer = (side: Side, player: PlayerState) =>
    dispatch({ type: "SET_PLAYER", side, player });

  const setYou = (player: PlayerState) => setPlayer("you", player);
  const setAi = (player: PlayerState) => setPlayer("ai", player);

  const setPendingStatusClear = (status: PendingStatusClear) =>
    dispatch({ type: "SET_PENDING_STATUS", status });

  const setPendingAttack = (attack: GameState["pendingAttack"]) =>
    dispatch({ type: "SET_PENDING_ATTACK", attack });

  const setSavedDiceForDefense = (saved: number[] | null) =>
    dispatch({ type: "SET_SAVED_DEFENSE_DICE", dice: saved });

  const setTurn = (next: Side) => patchState({ turn: next });
  const setPhase = (next: Phase) => patchState({ phase: next });
  const setRound = (next: number) => patchState({ round: next });
  const setDice = (
    value: number[] | ((prev: number[]) => number[])
  ) => {
    const next =
      typeof value === "function"
        ? (value as (prev: number[]) => number[])(stateRef.current.dice)
        : value;
    patchState({ dice: next });
  };
  const setHeld = (
    value: boolean[] | ((prev: boolean[]) => boolean[])
  ) => {
    const next =
      typeof value === "function"
        ? (value as (prev: boolean[]) => boolean[])(
            stateRef.current.held
          )
        : value;
    patchState({ held: next });
  };
  const setRolling = (next: boolean[]) => patchState({ rolling: next });
  const setRollsLeft = (value: number | ((prev: number) => number)) => {
    const next =
      typeof value === "function"
        ? (value as (prev: number) => number)(stateRef.current.rollsLeft)
        : value;
    patchState({ rollsLeft: next });
  };

  const setAiSimActive = (value: boolean) =>
    patchAiPreview({ active: value });
  const setAiSimRolling = (value: boolean) =>
    patchAiPreview({ rolling: value });
  const setAiSimDice = (
    value: number[] | ((prev: number[]) => number[])
  ) => {
    const next =
      typeof value === "function"
        ? (value as (prev: number[]) => number[])(
            stateRef.current.aiPreview.dice
          )
        : value;
    patchAiPreview({ dice: next });
  };
  const setAiSimHeld = (value: boolean[]) =>
    patchAiPreview({ held: value });

  const setAiDefenseSim = (value: boolean) =>
    patchAiDefense({ inProgress: value });
  const setAiDefenseRoll = (value: number | null) =>
    patchAiDefense({ defenseRoll: value });
  const setAiEvasiveRoll = (value: number | null) =>
    patchAiDefense({ evasiveRoll: value });

  const formatDice = (values: number[]) => values.join(" ");
  const indent = (line: string) => ` > ${line}`;
  const formatAbilityName = (ability: Ability) => ability.label ?? ability.combo;
  const formatStacks = (value: number) =>
    `${value} stack${value === 1 ? "" : "s"}`;

  const getStatusGainLines = (
    attackerBefore: PlayerState,
    attackerAfter: PlayerState,
    defenderBefore: PlayerState,
    defenderAfter: PlayerState
  ) => {
    const lines: string[] = [];
    const burnBefore = defenderBefore.tokens.burn ?? 0;
    const burnAfter = defenderAfter.tokens.burn ?? 0;
    if (burnAfter > burnBefore) {
      lines.push(
        `${defenderBefore.hero.name} gains Burn (${formatStacks(burnAfter)}).`
      );
    }
    const igniteBefore = defenderBefore.tokens.ignite ?? 0;
    const igniteAfter = defenderAfter.tokens.ignite ?? 0;
    if (igniteAfter > igniteBefore) {
      lines.push(
        `${defenderBefore.hero.name} gains Ignite (${formatStacks(
          igniteAfter
        )}).`
      );
    }
    const chiDiff =
      (attackerAfter.tokens.chi ?? 0) - (attackerBefore.tokens.chi ?? 0);
    if (chiDiff > 0) {
      lines.push(`${attackerBefore.hero.name} gains Chi (+${chiDiff}).`);
    }
    const evasiveDiff =
      (attackerAfter.tokens.evasive ?? 0) -
      (attackerBefore.tokens.evasive ?? 0);
    if (evasiveDiff > 0) {
      lines.push(`${attackerBefore.hero.name} gains Evasive (+${evasiveDiff}).`);
    }
    return lines;
  };

  const logPlayerAttackStart = (
    diceValues: number[],
    ability: Ability,
    attackerName: string
  ) => {
    pushLog(
      `[H\u00E1\u010D] ${attackerName} \u00FAto\u010D\u00ED: ${formatDice(
        diceValues
      )} -> ${formatAbilityName(ability)}.`,
      { blankLineBefore: true }
    );
  };

  const logAiAttackRoll = (diceValues: number[], ability: Ability) => {
    pushLog(indent(`AI hod: ${formatDice(diceValues)} -> ${formatAbilityName(ability)}.`));
  };

  const logAiNoCombo = (diceValues: number[]) => {
    pushLog(
      indent(
        `AI hod: ${formatDice(diceValues)} -> \u017Eiadna kombin\u00E1cia.`
      )
    );
  };

  const buildAttackResolutionLines = ({
    attackerBefore,
    attackerAfter,
    defenderBefore,
    defenderAfter,
    incomingDamage,
    defenseRoll,
    manualEvasive,
    reflectedDamage,
  }: {
    attackerBefore: PlayerState;
    attackerAfter: PlayerState;
    defenderBefore: PlayerState;
    defenderAfter: PlayerState;
    incomingDamage: number;
    defenseRoll?: number;
    manualEvasive?: { used: boolean; success: boolean; roll: number };
    reflectedDamage: number;
  }) => {
    const lines: string[] = [];
    const damageDealt = Math.max(0, defenderBefore.hp - defenderAfter.hp);
    const blocked = Math.max(0, incomingDamage - damageDealt);

    if (manualEvasive?.used) {
      const evasionResult = manualEvasive.success
        ? "\u00FAspech"
        : "ne\u00FAspech";
      lines.push(
        indent(
          `${defenderBefore.hero.name} Evasive (hod: ${manualEvasive.roll}) -> ${evasionResult}.`
        )
      );
      if (manualEvasive.success) {
        lines.push(
          indent(
            `${defenderBefore.hero.name} HP: ${defenderAfter.hp}/${defenderAfter.hero.maxHp}.`
          )
        );
        return lines;
      }
    }

    if (defenseRoll !== undefined) {
      let defenseLine = `${defenderBefore.hero.name} obrana (hod: ${defenseRoll}): Hit for ${damageDealt} dmg (blocked ${blocked}).`;
      if (reflectedDamage > 0) {
        defenseLine = defenseLine.replace(/\.$/, `, reflected ${reflectedDamage}.`);
      }
      lines.push(indent(defenseLine));
    } else if (incomingDamage > 0) {
      let genericLine = `${defenderBefore.hero.name} receives ${damageDealt} dmg (blocked ${blocked}).`;
      if (reflectedDamage > 0) {
        genericLine = genericLine.replace(
          /\.$/,
          ` Reflected ${reflectedDamage}.`
        );
      }
      lines.push(indent(genericLine));
    }

    lines.push(
      indent(
        `${defenderBefore.hero.name} HP: ${defenderAfter.hp}/${defenderAfter.hero.maxHp}.`
      )
    );

    const statusLines = getStatusGainLines(
      attackerBefore,
      attackerAfter,
      defenderBefore,
      defenderAfter
    );
    statusLines.forEach((line) => lines.push(indent(line)));

    if (reflectedDamage > 0) {
      lines.push(
        indent(
          `${attackerBefore.hero.name} HP: ${attackerAfter.hp}/${attackerAfter.hero.maxHp}.`
        )
      );
    }

    return lines;
  };

  const setFloatDamage = (
    side: Side,
    value: GameState["fx"]["floatDamage"][Side]
  ) => dispatch({ type: "SET_FLOAT_DAMAGE", side, value });

  const setShake = (side: Side, value: boolean) =>
    dispatch({ type: "SET_SHAKE", side, value });

  const DEF_DIE_INDEX = 2;
  const ROLL_ANIM_MS = 1300;
  const AI_ROLL_ANIM_MS = 900;
  const AI_STEP_MS = 2000;
  const timersRef = useRef<number | null>(null);
  const statusResumeRef = useRef<(() => void) | null>(null);

  function popDamage(
    side: Side,
    amount: number,
    kind: "hit" | "reflect" = "hit"
  ) {
    const payload = { val: amount, kind } as const;
    setFloatDamage(side, payload);
    if (kind === "hit") {
      setShake(side, true);
      setTimeout(() => setShake(side, false), 450);
    }
    setTimeout(() => setFloatDamage(side, null), 1300);
  }

  const acting = turn === "you" ? players.you : players.ai;
  const aiSimActive = aiPreview.active;
  const aiSimRolling = aiPreview.rolling;
  const aiSimDice = aiPreview.dice;
  const aiSimHeld = aiPreview.held;
  const aiDefenseSim = aiDefense.inProgress;
  const aiDefenseRoll = aiDefense.defenseRoll;
  const aiEvasiveRoll = aiDefense.evasiveRoll;
  const savedDiceForDefense = savedDefenseDice;
  const floatDmgYou = fx.floatDamage.you;
  const floatDmgAi = fx.floatDamage.ai;
  const shakeYou = fx.shake.you;
  const shakeAi = fx.shake.ai;
  const ability = useMemo(
    () => bestAbility(acting.hero, dice),
    [acting.hero, dice]
  );
  const readyForActing = useMemo(() => detectCombos(dice), [dice]);
  const readyForAI = useMemo(() => detectCombos(aiSimDice), [aiSimDice]);

  const resetRoll = () => {
    setDice([2, 2, 3, 4, 6]);
    setHeld([false, false, false, false, false]);
    setRolling([false, false, false, false, false]);
    setRollsLeft(3);
  };

  function animateDefenseDie(onDone: (r: number) => void, duration = 700) {
    if (!savedDiceForDefense) setSavedDiceForDefense([...dice]);
    const mask = [false, false, false, false, false];
    mask[DEF_DIE_INDEX] = true;
    setRolling(mask);
    const start = Date.now();
    let workingDice = [...stateRef.current.dice];
    const timer = window.setInterval(() => {
      workingDice = workingDice.map((value, index) =>
        index === DEF_DIE_INDEX ? 1 + Math.floor(Math.random() * 6) : value
      );
      setDice([...workingDice]);
      if (Date.now() - start > duration) {
        clearInterval(timer);
        const result = rollDie();
        workingDice = workingDice.map((value, index) =>
          index === DEF_DIE_INDEX ? result : value
        );
        setDice([...workingDice]);
        setRolling([false, false, false, false, false]);
        setTimeout(() => onDone(result), 50);
      }
    }, 90);
  }
  function restoreDiceAfterDefense() {
    if (savedDiceForDefense) {
      const vals = savedDiceForDefense;
      setTimeout(() => {
        setDice(vals);
        setSavedDiceForDefense(null);
      }, 300);
    }
  }

  function tickAndStart(next: Side, afterReady?: () => void): boolean {
    let continueBattle = true;
    let statusPending = false;
    let statusEntry: { side: Side; status: "burn"; stacks: number } | null =
      null;
    const upkeepLines: string[] = [];
    let aiHeader: string | null = null;

    if (next === "you") {
      const before = stateRef.current.players.you;
      if (before) {
        const heroName = before.hero.name;
        const burnStacks = before.tokens.burn;
        const burnDamage = burnStacks * 2;
        const igniteDamage = before.tokens.ignite > 0 ? 1 : 0;
        const totalDamage = burnDamage + igniteDamage;
        const after = tickStatuses(before);
        setYou(after);
        if (totalDamage > 0) {
          popDamage("you", totalDamage, "hit");
          const parts: string[] = [];
          if (burnDamage > 0)
            parts.push(`Burn ${burnStacks} -> ${burnDamage} dmg`);
          if (igniteDamage > 0) parts.push("Ignite -> 1 dmg");
          upkeepLines.push(
            indent(
              `Upkeep: ${heroName} takes ${totalDamage} dmg (${parts.join(
                ", "
              )}). HP: ${after.hp}/${after.hero.maxHp}.`
            )
          );
        }
        if (after.hp <= 0) {
          pushLog(`${heroName} fell to status damage.`);
          continueBattle = false;
        }
        const opponent = stateRef.current.players.ai;
        if (!opponent || opponent.hp <= 0) continueBattle = false;
        const needsBurnClear =
          continueBattle && burnDamage > 0 && after.tokens.burn > 0;
        if (needsBurnClear) {
          statusPending = true;
          statusEntry = {
            side: next,
            status: "burn",
            stacks: after.tokens.burn,
          };
        }
      } else {
        continueBattle = false;
      }
    } else {
      const before = stateRef.current.players.ai;
      if (before) {
        const heroName = before.hero.name;
        aiHeader = `[AI] ${heroName} \u00FAto\u010D\u00ED:`;
        const burnStacks = before.tokens.burn;
        const burnDamage = burnStacks * 2;
        const igniteDamage = before.tokens.ignite > 0 ? 1 : 0;
        const totalDamage = burnDamage + igniteDamage;
        const after = tickStatuses(before);
        setAi(after);
        if (totalDamage > 0) {
          popDamage("ai", totalDamage, "hit");
          const parts: string[] = [];
          if (burnDamage > 0)
            parts.push(`Burn ${burnStacks} -> ${burnDamage} dmg`);
          if (igniteDamage > 0) parts.push("Ignite -> 1 dmg");
          upkeepLines.push(
            indent(
              `Upkeep: ${heroName} takes ${totalDamage} dmg (${parts.join(
                ", "
              )}). HP: ${after.hp}/${after.hero.maxHp}.`
            )
          );
        }
        if (after.hp <= 0) {
          pushLog(`${heroName} fell to status damage.`);
          continueBattle = false;
        }
        const opponent = stateRef.current.players.you;
        if (!opponent || opponent.hp <= 0) continueBattle = false;
        const needsBurnClear =
          continueBattle && burnDamage > 0 && after.tokens.burn > 0;
        if (needsBurnClear) {
          statusPending = true;
          statusEntry = {
            side: next,
            status: "burn",
            stacks: after.tokens.burn,
          };
        }
      } else {
        continueBattle = false;
      }
    }

    setTurn(next);
    setPhase("upkeep");
    setPendingAttack(null);
    setAiSimActive(false);
    setAiSimRolling(false);
    setAiDefenseSim(false);
    setAiDefenseRoll(null);
    setAiEvasiveRoll(null);
    resetRoll();

    if (!continueBattle) {
      setPendingStatusClear(null);
      statusResumeRef.current = null;
      return false;
    }

    if (next === "you") {
      const newRound = round + 1;
      setRound(newRound);
      stateRef.current = { ...stateRef.current, round: newRound };
      pushLog(`--- Kolo ${newRound} ---`, { blankLineBefore: true });
      if (upkeepLines.length) {
        pushLog(upkeepLines);
      }
    } else if (next === "ai") {
      const lines = [aiHeader ?? "[AI] AI \u00FAto\u010D\u00ED:"];
      if (upkeepLines.length) lines.push(...upkeepLines);
      pushLog(lines, { blankLineBefore: true });
    } else if (upkeepLines.length) {
      pushLog(upkeepLines, { blankLineBefore: true });
    }

    if (statusPending && statusEntry) {
      setPendingStatusClear(statusEntry);
      statusResumeRef.current = afterReady ?? null;
    } else {
      setPendingStatusClear(null);
      statusResumeRef.current = null;
      setTimeout(() => setPhase("roll"), 600);
      afterReady?.();
    }

    return true;
  }

  function aiPlay() {
    const curAi = stateRef.current.players.ai;
    const curYou = stateRef.current.players.you;
    if (!curAi || !curYou || curAi.hp <= 0 || curYou.hp <= 0) {
      setAiSimActive(false);
      setAiSimRolling(false);
      setPendingAttack(null);
      return;
    }
    setAiSimActive(true);
    setAiSimRolling(false);

    let localDice = Array.from({ length: 5 }, () => rollDie());
    let localHeld = [false, false, false, false, false];

    const animateStep = (
      targetDice: number[],
      heldMask: boolean[],
      onDone: () => void
    ) => {
      setAiSimRolling(true);
      const mask = heldMask.map((h) => !h);
      let previewDice = [...stateRef.current.aiPreview.dice];
      const interval = window.setInterval(() => {
        previewDice = previewDice.map((value, idx) =>
          mask[idx] ? rollDie() : value
        );
        setAiSimDice([...previewDice]);
      }, 90);
      window.setTimeout(() => {
        window.clearInterval(interval);
        setAiSimRolling(false);
        setAiSimDice([...targetDice]);
        onDone();
      }, AI_ROLL_ANIM_MS);
    };

    const doStep = (step: number) => {
      const latestAi = stateRef.current.players.ai;
      const latestYou = stateRef.current.players.you;
      if (!latestAi || !latestYou || latestAi.hp <= 0 || latestYou.hp <= 0) {
        setAiSimActive(false);
        setAiSimRolling(false);
        setPendingAttack(null);
        return;
      }

      for (let i = 0; i < 5; i += 1) {
        if (!localHeld[i]) localDice[i] = rollDie();
      }

      const finalDice = [...localDice];
      const heldMask = [...localHeld];
      setAiSimHeld(heldMask);

      animateStep(finalDice, heldMask, () => {
        const rollsRemaining = Math.max(0, 2 - step);
        const holdDecision =
          latestAi.hero.ai.chooseHeld({
            dice: finalDice,
            rollsRemaining,
            tokens: latestAi.tokens,
            hero: latestAi.hero,
          }) ?? [];
        for (let i = 0; i < 5; i += 1) {
          localHeld[i] = Boolean(holdDecision[i]);
        }

        if (step < 2) {
          window.setTimeout(() => doStep(step + 1), AI_STEP_MS);
        } else {
          const ab = bestAbility(curAi.hero, finalDice);
          if (!ab) {
            setAiSimActive(false);
            logAiNoCombo(finalDice);
            setPhase("end");
            window.setTimeout(() => {
              tickAndStart("you");
            }, 600);
            return;
          }
          setPendingAttack({
            attacker: "ai",
            defender: "you",
            dice: [...finalDice],
            ability: ab,
          });
          setPhase("defense");
          logAiAttackRoll(finalDice, ab);
        }
      });
    };

    doStep(0);
  }

  function onRoll() {
    if (turn !== "you" || rollsLeft <= 0 || statusActive) return;
    const mask = held.map((h) => !h);
    setRolling(mask);
    const start = Date.now();
    let workingDice = [...dice];
    if (timersRef.current) window.clearInterval(timersRef.current);
    timersRef.current = window.setInterval(() => {
      workingDice = workingDice.map((value, idx) =>
        mask[idx] ? rollDie() : value
      );
      setDice([...workingDice]);
      if (Date.now() - start > ROLL_ANIM_MS) {
        if (timersRef.current) window.clearInterval(timersRef.current);
        workingDice = workingDice.map((value, idx) =>
          mask[idx] ? rollDie() : value
        );
        setDice([...workingDice]);
        setRolling([false, false, false, false, false]);
        setRollsLeft((n) => n - 1);
      }
    }, 100);
  }
  const onToggleHold = (i: number) => {
    if (turn !== "you") return;
    setHeld((h) => h.map((v, idx) => (idx === i ? !v : v)));
  };

  function onConfirmAttack() {
    if (turn !== "you" || rolling.some(Boolean)) return;
    const ab = ability;
    if (!ab) {
      const diceValues = [...dice];
      pushLog(
        `[H\u00E1\u010D] ${you.hero.name} \u00FAto\u010D\u00ED: ${formatDice(
          diceValues
        )} -> \u017Eiadna kombin\u00E1cia.`,
        { blankLineBefore: true }
      );
      setPhase("end");
      setTimeout(() => {
        const cont = tickAndStart("ai", () => {
          setTimeout(() => {
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

    setPhase("attack");
    setAiDefenseSim(true);
    setAiDefenseRoll(null);
    setAiEvasiveRoll(null);
    const attackDice = [...dice];
    setTimeout(() => {
      const snapshot = stateRef.current;
      const attacker = snapshot.players.you;
      const defender = snapshot.players.ai;
      if (!attacker || !defender || attacker.hp <= 0 || defender.hp <= 0) {
        setAiDefenseSim(false);
        setAiDefenseRoll(null);
        setAiEvasiveRoll(null);
        return;
      }
      logPlayerAttackStart(attackDice, ab, attacker.hero.name);
      let manualEvasive:
        | undefined
        | { used: boolean; success: boolean; roll: number; label?: string } =
        undefined;
      if (defender.tokens.evasive > 0) {
        const roll = rollDie();
        setAiEvasiveRoll(roll);
        manualEvasive = {
          used: true,
          success: roll >= 5,
          roll,
          label: defender.hero.name,
        };
      }
      let manualDefense:
        | undefined
        | { reduced: number; reflect: number; roll: number; label?: string } =
        undefined;
      if (!(manualEvasive && manualEvasive.success)) {
        const defenseRoll = defender.hero.defense.roll(defender.tokens);
        setAiDefenseRoll(defenseRoll.roll);
        manualDefense = {
          reduced: defenseRoll.reduced,
          reflect: defenseRoll.reflect,
          roll: defenseRoll.roll,
          label: defender.hero.name,
        };
      }

      const [nextAttacker, nextDefender] = applyAttack(
        attacker,
        defender,
        ab,
        {
          manualDefense,
          manualEvasive,
        }
      );
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
        manualEvasive,
        reflectedDamage: dmgToYouReflect,
      });
      if (resolutionLines.length) {
        pushLog(resolutionLines);
      }
      setAiDefenseSim(false);
      setPhase("end");
      if (nextDefender.hp <= 0 || nextAttacker.hp <= 0) return;
      setTimeout(() => {
        const cont = tickAndStart("ai", () => {
          setTimeout(() => {
            const aiState = stateRef.current.players.ai;
            const youState = stateRef.current.players.you;
            if (!aiState || !youState || aiState.hp <= 0 || youState.hp <= 0)
              return;
            aiPlay();
          }, AI_STEP_MS);
        });
        if (!cont) return;
      }, 700);
    }, 900);
  }

  function onUserDefenseRoll() {
    if (!pendingAttack || pendingAttack.defender !== "you") return;
    setPhase("defense");
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
      const incoming = attackPayload.ability.damage;
      const dealt = Math.max(0, incoming - defense.reduced);
      const [nextAttacker, nextDefender] = applyAttack(
        attacker,
        defender,
        attackPayload.ability,
        {
          manualDefense: {
            reduced: defense.reduced,
            reflect: defense.reflect,
            roll,
            label: defender.hero.name,
          },
        }
      );
      if (dealt > 0) popDamage(attackPayload.defender, dealt, "hit");
      const reflected = Math.max(0, attacker.hp - nextAttacker.hp);
      if (reflected > 0) popDamage(attackPayload.attacker, reflected, "reflect");
      setPlayer(attackPayload.attacker, nextAttacker);
      setPlayer(attackPayload.defender, nextDefender);
      setPendingAttack(null);
      const resolutionLines = buildAttackResolutionLines({
        attackerBefore: attacker,
        attackerAfter: nextAttacker,
        defenderBefore: defender,
        defenderAfter: nextDefender,
        incomingDamage: incoming,
        defenseRoll: roll,
        manualEvasive: undefined,
        reflectedDamage: reflected,
      });
      if (resolutionLines.length) {
        pushLog(resolutionLines);
      }
      setTimeout(() => {
        setPhase("end");
        restoreDiceAfterDefense();
        if (nextDefender.hp <= 0 || nextAttacker.hp <= 0) return;
        setTimeout(() => tickAndStart("you"), 700);
      }, 600);
    });
  }

  function onUserEvasiveRoll() {
    if (!pendingAttack || pendingAttack.defender !== "you") return;
    const defenderSnapshot = stateRef.current.players[pendingAttack.defender];
    if (!defenderSnapshot || defenderSnapshot.tokens.evasive <= 0) return;
    setPhase("defense");
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
        setPendingAttack(null);
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
        setTimeout(() => {
          setPhase("end");
          restoreDiceAfterDefense();
          if (attacker.hp <= 0 || consumedDefender.hp <= 0) return;
          setTimeout(() => tickAndStart("you"), 700);
        }, 600);
        return;
      }
      animateDefenseDie(
        (defenseRoll) => {
          const defense = consumedDefender.hero.defense.fromRoll({
            roll: defenseRoll,
            tokens: consumedDefender.tokens,
          });
          const incoming = attackPayload.ability.damage;
          const dealt = Math.max(0, incoming - defense.reduced);
          const [nextAttacker, nextDefender] = applyAttack(
            attacker,
            consumedDefender,
            attackPayload.ability,
            {
              manualDefense: {
                reduced: defense.reduced,
                reflect: defense.reflect,
                roll: defenseRoll,
                label: consumedDefender.hero.name,
              },
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
          setPendingAttack(null);
          const resolutionLines = buildAttackResolutionLines({
            attackerBefore: attacker,
            attackerAfter: nextAttacker,
            defenderBefore: consumedDefender,
            defenderAfter: nextDefender,
            incomingDamage: incoming,
            defenseRoll: defenseRoll,
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
          setTimeout(() => {
            setPhase("end");
            restoreDiceAfterDefense();
            if (nextDefender.hp <= 0 || nextAttacker.hp <= 0) return;
            setTimeout(() => tickAndStart("you"), 700);
          }, 600);
        },
        650
      );
    }, 650);
  }

  function performStatusClearRoll(side: Side) {
    const currentStatus = stateRef.current.pendingStatusClear;
    if (!currentStatus || currentStatus.side !== side || currentStatus.rolling)
      return;
    setPendingStatusClear({ ...currentStatus, rolling: true });
    animateDefenseDie((roll) => {
      const success = roll >= 5;
      const snapshot = stateRef.current;
      const playerState = snapshot.players[side];
      if (success && playerState) {
        const updatedPlayer: PlayerState = {
          ...playerState,
          tokens: { ...playerState.tokens, burn: 0 },
        };
        setPlayer(side, updatedPlayer);
      }
      const heroName = playerState?.hero.name ?? (side === "you" ? "You" : "AI");
      pushLog(
        indent(
          `Upkeep: ${heroName} roll vs Burn: ${roll} ${
            success ? "-> removes Burn" : "-> Burn persists"
          }.`
        )
      );
      setPendingStatusClear({
        ...currentStatus,
        stacks: success ? 0 : currentStatus.stacks,
        rolling: false,
        roll,
        success,
      });
      setTimeout(() => {
        restoreDiceAfterDefense();
        setTimeout(() => {
          setPendingStatusClear(null);
          setPhase("roll");
          const resume = statusResumeRef.current;
          statusResumeRef.current = null;
          resume?.();
        }, 400);
      }, 600);
    }, 650);
  }

  useEffect(() => {
    if (
      pendingStatusClear &&
      pendingStatusClear.side === "ai" &&
      !pendingStatusClear.roll &&
      !pendingStatusClear.rolling
    ) {
      const timer = window.setTimeout(() => performStatusClearRoll("ai"), 700);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [pendingStatusClear]);

  const onEndTurnNoAttack = () => {
    if (turn !== "you" || rolling.some(Boolean)) return;
    setTimeout(() => {
      const cont = tickAndStart("ai", () => {
        setTimeout(() => {
          const aiState = stateRef.current.players.ai;
          const youState = stateRef.current.players.you;
          if (!aiState || !youState || aiState.hp <= 0 || youState.hp <= 0)
            return;
          aiPlay();
        }, 450);
      });
      if (!cont) return;
    }, 0);
  };
  const onReset = () => {
    startBattle(players.you.hero, players.ai.hero);
  };

  const isDefenseTurn =
    !!pendingAttack && pendingAttack.defender === "you";
  const statusActive = !!pendingStatusClear;
  const defenseAbility = pendingAttack?.ability;
  if (screen === "welcome") {
    return (
      <HeroSelectScreen
        heroOptions={heroOptions}
        onConfirm={handleHeroSelection}
      />
    );
  }

  const you = players.you;
  const ai = players.ai;
  const winner = you.hp <= 0 ? ai.hero.id : ai.hp <= 0 ? you.hero.id : null;
  const showDcLogo =
    turn === "you" && rollsLeft === 3 && !pendingAttack && !statusActive; // pred prvm rollom a ak nie je status

  return (
    <div className='container'>
      <div className='row'>
        <div className='row'>
            <div
              style={{
                display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
            <h1
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 20,
                fontWeight: 600,
              }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: "1px solid #059669",
                  background: "rgba(4,120,87,.3)",
                  fontWeight: 700,
                }}>
                DC
              </span>{" "}
              Fantasy Dice Combat
            </h1>
            <button className='btn' onClick={onReset}>
              Reset
            </button>
          </div>

          <div className='row grid-2'>
            <Section
              title={`You - ${you.hero.name}`}
              active={turn === "you"}>
              <div
                className={shakeYou ? "shake-card" : ""}
                style={{ position: "relative" }}>
                <div className='row'>
                  <HPBar hp={you.hp} max={you.hero.maxHp} />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}>
                    <div className='label'>Statuses</div>
                    <TokenChips tokens={you.tokens} />
                  </div>
                </div>
                {floatDmgYou && (
                  <div
                    style={{
                      pointerEvents: "none",
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                    <DamageOverlay
                      val={floatDmgYou.val}
                      kind={floatDmgYou.kind}
                    />
                  </div>
                )}
              </div>
            </Section>
            <Section
              title={`Opponent - ${ai.hero.name} (AI)`}
              active={turn === "ai"}>
              <div
                className={shakeAi ? "shake-card" : ""}
                style={{ position: "relative" }}>
                <div className='row'>
                  <HPBar hp={ai.hp} max={ai.hero.maxHp} />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}>
                    <div className='label'>Statuses</div>
                    <TokenChips tokens={ai.tokens} />
                  </div>
                </div>
                {floatDmgAi && (
                  <div
                    style={{
                      pointerEvents: "none",
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                    <DamageOverlay
                      val={floatDmgAi.val}
                      kind={floatDmgAi.kind}
                    />
                  </div>
                )}
              </div>
            </Section>
          </div>

          <Section title={`Kolo: ${turn === "you" ? "Ty to" : "AI hraje"}`}>
            {winner ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 0",
                  fontSize: 24,
                }}>
                Vaz: <b>{winner}</b>
              </div>
            ) : (
              <div className='row'>
                <div className='row grid-2'>
                  <div
                    className='card'
                    style={{
                      padding: 12,
                      borderColor: turn === "you" ? "#059669" : "#27272a",
                      background:
                        turn === "you" ? "rgba(6,78,59,.3)" : undefined,
                    }}>
                    Tvoje kolo
                  </div>
                  <div
                    className='card'
                    style={{
                      padding: 12,
                      borderColor: turn === "ai" ? "#4338ca" : "#27272a",
                      background:
                        turn === "ai" ? "rgba(49,46,129,.3)" : undefined,
                    }}>
                    AI kolo
                  </div>
                </div>

                <div className='row grid-2'>
                  <AbilityList
                    hero={you.hero}
                    title={`Tvoje schopnosti (${you.hero.name})`}
                    showReadyCombos={readyForActing as any}
                  />

                  <div className='row'>
                    <TurnProgress phase={phase} />
                    <DiceGrid
                      dice={dice}
                      held={held}
                      rolling={rolling}
                      canInteract={
                        turn === "you" && !isDefenseTurn && !statusActive
                      }
                      onToggleHold={onToggleHold}
                      defIndex={DEF_DIE_INDEX}
                      showDcLogo={showDcLogo}
                      isDefensePhase={
                        isDefenseTurn || statusActive || phase === "defense"
                      }
                      statusActive={statusActive}
                    />
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}>
                      <button
                        className='btn primary'
                        onClick={onRoll}
                        disabled={
                          turn !== "you" ||
                          rollsLeft <= 0 ||
                          isDefenseTurn ||
                          statusActive
                        }>
                        Roll ({rollsLeft})
                      </button>
                      {!statusActive &&
                        (isDefenseTurn ? (
                          <>
                            <button
                              className='btn success'
                              onClick={onUserDefenseRoll}>
                              Defense Roll
                            </button>
                            {you.tokens.evasive > 0 && (
                              <button
                                className='btn'
                                onClick={onUserEvasiveRoll}>
                                Use Evasive
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              className='btn success'
                              onClick={onConfirmAttack}
                              disabled={turn !== "you" || rollsLeft === 3}
                              title={
                                rollsLeft === 3
                                  ? "Roll at least once before attacking"
                                  : "Confirm attack"
                              }>
                              Confirm Attack
                            </button>
                            <button
                              className='btn'
                              onClick={onEndTurnNoAttack}
                              disabled={turn !== "you"}>
                              Pass Turn
                            </button>
                          </>
                        ))}
                      {statusActive ? (
                        <div
                          style={{
                            marginLeft: "auto",
                            fontSize: 14,
                            color: "#e4e4e7",
                          }}>
                          {pendingStatusClear?.roll !== undefined
                            ? `Status roll: ${pendingStatusClear.roll} ${
                                pendingStatusClear.success
                                  ? "-> Burn cleared"
                                  : "-> Burn stays"
                              }`
                            : `Burn ${
                                pendingStatusClear?.stacks ?? 0
                              } stack(s) - roll 5-6 to clear.`}
                        </div>
                      ) : isDefenseTurn ? (
                        <div
                          style={{
                            marginLeft: "auto",
                            fontSize: 14,
                            color: "#d4d4d8",
                          }}>
                          {aiEvasiveRoll !== null && (
                            <span
                              className='badge indigo'
                              style={{ marginRight: 8 }}>
                              AI Evasive roll: <b>{aiEvasiveRoll}</b>
                            </span>
                          )}
                          {aiDefenseRoll !== null && (
                            <span className='badge indigo'>
                              AI Defense roll: <b>{aiDefenseRoll}</b>
                            </span>
                          )}
                          {aiEvasiveRoll === null && aiDefenseRoll === null && (
                            <span>AI defense resolving...</span>
                          )}
                        </div>
                      ) : rollsLeft === 3 ? (
                        <div
                          style={{
                            marginLeft: "auto",
                            fontSize: 14,
                            color: "#a1a1aa",
                          }}>
                          Suggested ability appears after the first roll.
                        </div>
                      ) : ability ? (
                        <div
                          style={{
                            marginLeft: "auto",
                            fontSize: 14,
                            color: "#e4e4e7",
                          }}>
                          <b>Best ability:</b> {ability.label ?? ability.combo}{" "}
                          ({ability.damage} dmg)
                        </div>
                      ) : (
                        <div
                          style={{
                            marginLeft: "auto",
                            fontSize: 14,
                            color: "#a1a1aa",
                          }}>
                          No combo available
                        </div>
                      )}
                    </div>

                    {pendingStatusClear && (
                      <div
                        className='card'
                        style={{
                          borderColor: "#f97316",
                          background: "rgba(249,115,22,.12)",
                        }}>
                        <div style={{ fontSize: 14, marginBottom: 8 }}>
                          Burn on{" "}
                          <b>
                            {pendingStatusClear.side === "you"
                              ? you.hero.name
                              : ai.hero.name}
                          </b>{" "}
                          - stacks: <b>{pendingStatusClear.stacks}</b>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}>
                          {pendingStatusClear.side === "you" ? (
                            <button
                              className='btn success'
                              onClick={() => performStatusClearRoll("you")}
                              disabled={pendingStatusClear.rolling}>
                              {pendingStatusClear.rolling
                                ? "Rolling..."
                                : "Status Roll (Burn)"}
                            </button>
                          ) : (
                            <div style={{ fontSize: 14, color: "#d4d4d8" }}>
                              {pendingStatusClear.roll === undefined
                                ? pendingStatusClear.rolling
                                  ? "AI is rolling..."
                                  : "AI will roll automatically."
                                : ""}
                            </div>
                          )}
                          {pendingStatusClear.roll !== undefined && (
                            <div style={{ fontSize: 14, color: "#e4e4e7" }}>
                              Roll: <b>{pendingStatusClear.roll}</b>{" "}
                              {pendingStatusClear.success
                                ? "-> Burn cleared"
                                : "-> Burn sticks"}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {aiDefenseSim && (
                      <div
                        style={{
                          display: "flex",
                          gap: 12,
                          alignItems: "center",
                          fontSize: 14,
                          color: "#d4d4d8",
                        }}>
                        {aiEvasiveRoll !== null && (
                          <div className='badge indigo'>
                            AI Evasive: <b>{aiEvasiveRoll}</b>
                          </div>
                        )}
                        {aiDefenseRoll !== null && (
                          <div className='badge indigo'>
                            AI Defense: <b>{aiDefenseRoll}</b>
                          </div>
                        )}
                        {aiEvasiveRoll === null && aiDefenseRoll === null && (
                          <div>AI defense in progress...</div>
                        )}
                      </div>
                    )}

                    {statusActive ? (
                      <div style={{ fontSize: 12, color: "#a1a1aa" }}>
                        Upkeep burn check: roll 5-6 to clear Burn (
                        {pendingStatusClear?.side === "you"
                          ? "click Status Roll"
                          : "AI rolls automatically"}
                        ).
                      </div>
                    ) : isDefenseTurn ? (
                      <div style={{ fontSize: 12, color: "#a1a1aa" }}>
                        Click Defense Roll (or use Evasive) to respond to the
                        attack.
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "#a1a1aa" }}>
                        Tip: Confirm attack becomes available after the first{" "}
                        <b>Roll</b>.
                      </div>
                    )}
                  </div>
                </div>

                <div className='row grid-2'>
                  <AbilityList
                    hero={ai.hero}
                    title={`Opponent Abilities (${ai.hero.name})`}
                    showReadyCombos={readyForAI as any}
                  />
                  <div className='row'>
                    <DiceGrid
                      dice={aiSimDice}
                      held={[]}
                      rolling={aiSimRolling}
                      canInteract={false}
                      onToggleHold={() => {}}
                      defIndex={-1}
                      showDcLogo={false}
                      isDefensePhase={false}
                      statusActive={false}
                      isAi={true}
                      aiSimHeld={aiSimHeld}
                    />
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>
                      AI abilities highlight according to this preview roll
                      sequence.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Section>
        </div>

        <Section title='Combat Log'>
          <div
            style={{
              display: "grid",
              gap: 8,
              maxHeight: 360,
              overflow: "auto",
              paddingRight: 4,
            }}>
            {log.map((entry, idx) => (
              <div
                key={idx}
                style={{
                  fontSize: 14,
                  color: "#e5e7eb",
                  whiteSpace: "pre-wrap",
                }}>
                {entry.t}
              </div>
            ))}
          </div>
        </Section>
        <Section title='Tips'>
          <ul
            style={{
              paddingLeft: 18,
              fontSize: 14,
              color: "#d4d4d8",
              display: "grid",
              gap: 4,
            }}>
            <li>
              Click a die to hold it. Held dice stay locked through rolls.
            </li>
            <li>
              Confirm Attack becomes available after your first roll this turn.
            </li>
            <li>
              Pyromancer defense: roll 5-6 to block 2 dmg, 3-4 to block 1 dmg.
            </li>
            <li>
              Burn ticks in upkeep; roll 5-6 afterwards to clear it, otherwise
              it persists.
            </li>
            <li>
              Evasive is consumed when used; a 5+ completely dodges the attack.
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
