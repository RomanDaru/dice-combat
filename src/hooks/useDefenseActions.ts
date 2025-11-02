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
import {
  getStatus,
  getStacks,
  spendStatus,
  createStatusSpendSummary,
  aggregateStatusSpendSummaries,
} from "../engine/status";
import type { StatusId, StatusSpend } from "../engine/status";
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
import type {
  BaseDefenseResolution,
  DefenseRollResult,
} from "../game/combat/types";
import type {
  StatusSpendApplyResult,
  StatusSpendSummary,
} from "../engine/status";
import { resolvePassTurn, type TurnEndResolution } from "../game/flow/turnEnd";

type PlayerDefenseState = {
  roll: DefenseRollResult;
  selectedCombo: Combo | null;
  baseResolution: BaseDefenseResolution;
};

type UseDefenseActionsArgs = {
  turn: Side;
  rolling: boolean[];
  ability: OffensiveAbility | null;
  dice: number[];
  you: PlayerState;
  pendingAttack: GameState["pendingAttack"];
  attackStatusRequests: Record<StatusId, number>;
  defenseStatusRequests: Record<StatusId, number>;
  clearAttackStatusRequests: () => void;
  clearDefenseStatusRequests: () => void;
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
  animateDefenseDie: (
    onDone: (roll: number) => void,
    duration?: number,
    options?: {
      animateSharedDice?: boolean;
      onTick?: (value: number) => void;
    }
  ) => void;
  animateDefenseRoll: (
    onDone: (dice: number[]) => void,
    duration?: number,
    options?: {
      animateSharedDice?: boolean;
      onTick?: (dice: number[]) => void;
    }
  ) => void;
  openDiceTray: () => void;
  closeDiceTray: () => void;
  popDamage: (side: Side, amount: number, kind?: "hit" | "reflect") => void;
  restoreDiceAfterDefense: () => void;
  sendFlowEvent: (event: GameFlowEvent) => boolean;
  aiPlay: () => void;
  aiStepDelay: number;
  playerDefenseState: PlayerDefenseState | null;
  setPlayerDefenseState: Dispatch<SetStateAction<PlayerDefenseState | null>>;
  setDefenseStatusRollDisplay: (
    display: {
      dice: number[];
      inProgress: boolean;
      label: string | null;
      outcome: "success" | "failure" | null;
    } | null
  ) => void;
  applyTurnEndResolution: (
    resolution: TurnEndResolution,
    logOptions?: { blankLineBefore?: boolean; blankLineAfter?: boolean }
  ) => void;
  setDefenseStatusMessage: (message: string | null) => void;
};

export function useDefenseActions({
  turn,
  rolling,
  ability,
  dice,
  you,
  pendingAttack,
  attackStatusRequests,
  defenseStatusRequests,
  clearAttackStatusRequests,
  clearDefenseStatusRequests,
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
  setDefenseStatusRollDisplay,
  applyTurnEndResolution,
  setDefenseStatusMessage,
}: UseDefenseActionsArgs) {
  const { state, dispatch } = useGame();
  const latestState = useLatest(state);
  const pendingDefenseSpendsRef = useRef<StatusSpendSummary[]>([]);

  const combineDefenseSpends = (
    resolution: ReturnType<typeof buildDefensePlan>["defense"] | null,
    extraSpends: StatusSpendSummary[]
  ): ReturnType<typeof buildDefensePlan>["defense"] | null => {
    if (!resolution && extraSpends.length === 0) {
      return null;
    }
    if (!resolution) {
      return {
        selection: {
          roll: { dice: [], combos: [], options: [] },
          selected: null,
        },
        baseBlock: 0,
        reflect: 0,
        heal: 0,
        appliedTokens: {},
        retaliatePercent: 0,
        statusSpends: [...extraSpends],
      };
    }
    if (extraSpends.length === 0) {
      return resolution;
    }
    return {
      ...resolution,
      statusSpends: [...resolution.statusSpends, ...extraSpends],
    };
  };

  const resetDefenseRequests = useCallback(() => {
    pendingDefenseSpendsRef.current = [];
    clearDefenseStatusRequests();
  }, [clearDefenseStatusRequests]);
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
        resetDefenseRequests();
        setPlayerDefenseState(null);
      }
    },
    [dispatch, resetDefenseRequests, setPlayerDefenseState]
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

  const onConfirmAttack = useCallback(() => {
    if (turn !== "you" || rolling.some(Boolean)) return;
    const selectedAbility = ability;
    if (!selectedAbility) {
      clearAttackStatusRequests();
      logPlayerNoCombo(dice, you.hero.name);
      setDefenseStatusMessage(null);
      setDefenseStatusRollDisplay(null);
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
        clearAttackStatusRequests();
        return;
      }

      const baseDamage = selectedAbility.damage;
      const attackStatusSpends: StatusSpendSummary[] = [];
      let workingTokens = attacker.tokens;
      let tokensChanged = false;

      Object.entries(attackStatusRequests).forEach(
        ([rawStatusId, requested]) => {
          const statusId = rawStatusId as StatusId;
          if (requested <= 0) return;
          const statusDef = getStatus(statusId);
          const spendDef = statusDef?.spend;
          if (!spendDef || !spendDef.allowedPhases.includes("attackRoll")) {
            return;
          }
          if (baseDamage <= 0) return;
          const costStacks = spendDef.costStacks || 1;
          const availableStacks =
            statusId === "chi"
              ? Math.max(
                  0,
                  Math.min(
                    requested,
                    getStacks(workingTokens, "chi", 0),
                    turnChiAvailable.you ?? 0
                  )
                )
              : Math.max(
                  0,
                  Math.min(requested, getStacks(workingTokens, statusId, 0))
                );
          const attempts =
            costStacks > 0 ? Math.floor(availableStacks / costStacks) : 0;
          if (attempts <= 0) return;
          let localTokens = workingTokens;
          const spendResults: StatusSpendApplyResult[] = [];
          let damageContext = baseDamage;
          for (let i = 0; i < attempts; i += 1) {
            const spendResult = spendStatus(
              localTokens,
              statusId,
              "attackRoll",
              {
                phase: "attackRoll",
                baseDamage: damageContext,
              }
            );
            if (!spendResult) break;
            localTokens = spendResult.next;
            spendResults.push(spendResult.spend);
            if (typeof spendResult.spend.bonusDamage === "number") {
              damageContext += spendResult.spend.bonusDamage;
            }
          }
          if (spendResults.length > 0) {
            const stacksSpent = spendResults.length * costStacks;
            workingTokens = localTokens;
            tokensChanged = true;
            attackStatusSpends.push(
              createStatusSpendSummary(statusId, stacksSpent, spendResults)
            );
          }
        }
      );

      clearAttackStatusRequests();

      if (tokensChanged) {
        attacker = {
          ...attacker,
          tokens: workingTokens,
        };
        setPlayer("you", attacker);
      }

      const attackBonusDamage = attackStatusSpends.reduce(
        (sum, spend) => sum + spend.bonusDamage,
        0
      );
      attackStatusSpends.forEach((spend) => {
        if (spend.id === "chi" && spend.stacksSpent > 0) {
          consumeTurnChi("you", spend.stacksSpent);
        }
      });
      const effectiveAbility: OffensiveAbility = {
        ...selectedAbility,
        damage: baseDamage + attackBonusDamage,
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
      } else if (getStacks(defender.tokens, "evasive", 0) > 0) {
        aiShouldAttemptEvasive = true;
      }

      aiEvasiveRequestedRef.current = false;

      const resolveAfterDefense = (
        defenderState: PlayerState,
        defenseResolution:
          | ReturnType<typeof buildDefensePlan>["defense"]
          | null,
        additionalSpends: StatusSpendSummary[] = []
      ) => {
        window.setTimeout(() => {
          closeDiceTray();
          const pendingSpends = pendingDefenseSpendsRef.current;
          pendingDefenseSpendsRef.current = [];
          const mergedResolution = combineDefenseSpends(defenseResolution, [
            ...pendingSpends,
            ...additionalSpends,
          ]);
          const resolution = resolveAttack({
            source: "player",
            attackerSide: "you",
            defenderSide: "ai",
            attacker,
            defender: defenderState,
            ability: effectiveAbility,
            baseDamage,
            attackStatusSpends,
            defense: {
              resolution: mergedResolution,
            },
          });

          resolveWithEvents(resolution, "you", "ai");
        }, 600);
      };

  const runDefenseRoll = (
    defenderState: PlayerState,
    { showTray = false }: { showTray?: boolean } = {}
  ) => {
    setDefenseStatusMessage(null);
    setDefenseStatusRollDisplay(null);
    setPhase("defense");
    if (showTray) {
      openDiceTray();
    }
    animateDefenseRoll(
      (rolledDice) => {
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
            getStacks(defenderState.tokens, "chi", 0),
            turnChiAvailable.ai ?? 0
          );
          const defensePlan = buildDefensePlan({
            defender: defenderState,
            incomingDamage: effectiveAbility.damage,
            baseResolution,
            requestedChi,
          });
          const defenseTotals = aggregateStatusSpendSummaries(
            defensePlan.defense.statusSpends
          );
          const totalBlock =
            defensePlan.defense.baseBlock + defenseTotals.bonusBlock;

          patchAiDefense({
            inProgress: false,
            defenseDice: rolledDice,
            defenseCombo: defensePlan.defense.selection.selected?.combo ?? null,
            defenseRoll: totalBlock,
          });

          let updatedDefender = defensePlan.defenderAfter;
          defensePlan.defense.statusSpends.forEach((spend) => {
            if (spend.id === "chi" && spend.stacksSpent > 0) {
              consumeTurnChi("ai", spend.stacksSpent);
            }
          });
          if (updatedDefender !== defenderState) {
            setPlayer("ai", updatedDefender);
          }

      resolveAfterDefense(updatedDefender, defensePlan.defense);
      },
      undefined,
      {
        animateSharedDice: false,
        onTick: (frame) => {
          patchAiDefense({ defenseDice: frame });
        },
      }
    );
  };

      if (
        aiShouldAttemptEvasive &&
        getStacks(defender.tokens, "evasive", 0) > 0
      ) {
        setPhase("defense");
        animateDefenseDie(
          (roll) => {
          const spendResult = spendStatus(
            defender.tokens,
            "evasive",
            "defenseRoll",
            { phase: "defenseRoll", roll }
          );
          if (!spendResult) {
            patchAiDefense({ evasiveRoll: roll });
            window.setTimeout(() => {
              runDefenseRoll(defender);
            }, 360);
            return;
          }
          const consumedDefender: PlayerState = {
            ...defender,
            tokens: spendResult.next,
          };
          setPlayer("ai", consumedDefender);

          const evadeSuccess =
            typeof spendResult.spend.success === "boolean"
              ? spendResult.spend.success
              : !!spendResult.spend.negateIncoming;

          const evasiveCost = getStatus("evasive")?.spend?.costStacks ?? 1;
          const evasiveSummary = createStatusSpendSummary(
            "evasive",
            evasiveCost,
            [spendResult.spend]
          );

          patchAiDefense({ evasiveRoll: roll });

          if (evadeSuccess) {
            patchAiDefense({
              inProgress: false,
              defenseRoll: null,
              defenseDice: null,
              defenseCombo: null,
            });
            resolveAfterDefense(consumedDefender, null, [evasiveSummary]);
            return;
          }

          pendingDefenseSpendsRef.current = [
            ...pendingDefenseSpendsRef.current,
            evasiveSummary,
          ];

          window.setTimeout(() => {
            runDefenseRoll(consumedDefender);
          }, 360);
          },
          650,
          { animateSharedDice: false }
        );
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
    attackStatusRequests,
    clearAttackStatusRequests,
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
    turn,
    turnChiAvailable.ai,
    turnChiAvailable.you,
    you.hero.name,
  ]);

  const onUserDefenseRoll = useCallback(() => {
    if (!pendingAttack || pendingAttack.defender !== "you") return;
    if (playerDefenseState) return;

    setDefenseStatusMessage(null);
    setDefenseStatusRollDisplay(null);
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
      const initialCombo = rollResult.options[0]?.combo ?? null;
      const initialSelection = selectDefenseOptionByCombo(
        rollResult,
        initialCombo
      );
      const initialBaseResolution = resolveDefenseSelection(initialSelection);
      setPlayerDefenseState({
        roll: rollResult,
        selectedCombo: initialCombo,
        baseResolution: initialBaseResolution,
      });
    });
  }, [
    animateDefenseRoll,
    latestState,
    pendingAttack,
    playerDefenseState,
    pushLog,
    setDefenseStatusRollDisplay,
    setPhase,
    setPlayerDefenseState,
    setDefenseStatusMessage,
  ]);

  const onChooseDefenseOption = useCallback(
    (combo: Combo | null) => {
      setPlayerDefenseState((prev) => {
        if (!prev) return prev;
        const nextSelection = selectDefenseOptionByCombo(prev.roll, combo);
        const nextBaseResolution = resolveDefenseSelection(nextSelection);
        return {
          ...prev,
          selectedCombo: combo,
          baseResolution: nextBaseResolution,
        };
      });
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
      defenseStatusRequests.chi ?? 0,
      getStacks(defender.tokens, "chi", 0),
      turnChiAvailable.you ?? 0
    );
    const defensePlan = buildDefensePlan({
      defender,
      incomingDamage: pendingAttack.ability.damage,
      baseResolution,
      requestedChi,
    });

    defender = defensePlan.defenderAfter;
    defensePlan.defense.statusSpends.forEach((spend) => {
      if (spend.id === "chi" && spend.stacksSpent > 0) {
        consumeTurnChi("you", spend.stacksSpent);
      }
    });
    setPlayer("you", defender);

    const attackStatusSpends = pendingAttack.modifiers?.statusSpends ?? [];
    const attackBonusDamage = attackStatusSpends.reduce(
      (sum, spend) => sum + spend.bonusDamage,
      0
    );
    const baseAttackDamage =
      pendingAttack.baseDamage ??
      Math.max(0, pendingAttack.ability.damage - attackBonusDamage);

    const pendingDefenseSpends = pendingDefenseSpendsRef.current;
    pendingDefenseSpendsRef.current = [];
    const mergedDefense = combineDefenseSpends(
      defensePlan.defense,
      pendingDefenseSpends
    );

    const resolution = resolveAttack({
      source: "ai",
      attackerSide: pendingAttack.attacker,
      defenderSide: pendingAttack.defender,
      attacker,
      defender,
      ability: pendingAttack.ability,
      baseDamage: baseAttackDamage,
      attackStatusSpends,
      defense: {
        resolution: mergedDefense,
      },
    });

    resetDefenseRequests();
    setPendingAttackDispatch(null);
    setPlayerDefenseState(null);
    closeDiceTray();
    resolveWithEvents(
      resolution,
      pendingAttack.attacker,
      pendingAttack.defender
    );
  }, [
    resetDefenseRequests,
    defenseStatusRequests,
    latestState,
    combineDefenseSpends,
    pendingDefenseSpendsRef,
    pendingAttack,
    playerDefenseState,
    resolveWithEvents,
    closeDiceTray,
    setPendingAttackDispatch,
    setPlayer,
    setPlayerDefenseState,
    consumeTurnChi,
    turnChiAvailable.you,
  ]);

  const onUserEvasiveRoll = useCallback(() => {
    if (!pendingAttack || pendingAttack.defender !== "you") return;
    const defenderSnapshot =
      latestState.current.players[pendingAttack.defender];
    if (
      !defenderSnapshot ||
      getStacks(defenderSnapshot.tokens, "evasive", 0) <= 0
    )
      return;
    const evasiveStatus = getStatus("evasive");
    const evasiveSpend = evasiveStatus?.spend as (StatusSpend & {
      diceCount?: number;
    }) | undefined;
    const diceCount = Math.max(
      1,
      typeof evasiveSpend?.diceCount === "number"
        ? evasiveSpend.diceCount
        : 1
    );
    const seedFrame = Array.from(
      { length: diceCount },
      () => 1 + Math.floor(Math.random() * 6)
    );
    setDefenseStatusMessage("Rolling for evasive...");
    setDefenseStatusRollDisplay({
      dice: seedFrame,
      inProgress: true,
      label: "Evasive Roll",
      outcome: null,
    });
    openDiceTray();
    setPhase("defense");
    animateDefenseDie(
      (evasiveRoll) => {
        const snapshot = latestState.current;
        const attacker = snapshot.players[pendingAttack.attacker];
        const defender = snapshot.players[pendingAttack.defender];
        if (!attacker || !defender) return;
        const spendResult = spendStatus(
          defender.tokens,
          "evasive",
          "defenseRoll",
          { phase: "defenseRoll", roll: evasiveRoll }
        );
        if (!spendResult) return;
        const consumedDefender = {
          ...defender,
          tokens: spendResult.next,
        };
        const evasiveCost = getStatus("evasive")?.spend?.costStacks ?? 1;
        const evasiveSummary = createStatusSpendSummary("evasive", evasiveCost, [
          spendResult.spend,
        ]);
        const evadeSuccess =
          typeof spendResult.spend.success === "boolean"
            ? spendResult.spend.success
            : !!spendResult.spend.negateIncoming;
        setPlayer(pendingAttack.defender, consumedDefender);
        if (evadeSuccess) {
          const resultDice = Array.from(
            { length: diceCount },
            () => evasiveRoll
          );
          setDefenseStatusRollDisplay({
            dice: resultDice,
            inProgress: false,
            label: "Evasive Roll",
            outcome: "success",
          });
          setDefenseStatusMessage("Evasive successful! You blocked all damage.");
          const attackStatusSpends = pendingAttack.modifiers?.statusSpends ?? [];
          const attackBonusDamage = attackStatusSpends.reduce(
            (sum, spend) => sum + spend.bonusDamage,
            0
          );
          const baseAttackDamage =
            pendingAttack.baseDamage ??
            Math.max(0, pendingAttack.ability.damage - attackBonusDamage);
          const resolution = resolveAttack({
            source: "ai",
            attackerSide: pendingAttack.attacker,
            defenderSide: pendingAttack.defender,
            attacker,
            defender: consumedDefender,
            ability: pendingAttack.ability,
            baseDamage: baseAttackDamage,
            attackStatusSpends,
            defense: {
              resolution: combineDefenseSpends(null, [evasiveSummary]),
            },
          });
          resetDefenseRequests();
          setPendingAttackDispatch(null);
          setPlayerDefenseState(null);
          window.setTimeout(() => {
            closeDiceTray();
          }, 1200);
          resolveWithEvents(
            resolution,
            pendingAttack.attacker,
            pendingAttack.defender
          );
          return;
        }

        const resultDice = Array.from(
          { length: diceCount },
          () => evasiveRoll
        );
        setDefenseStatusRollDisplay({
          dice: resultDice,
          inProgress: false,
          label: "Evasive Roll",
          outcome: "failure",
        });
        setDefenseStatusMessage("Evasive failed. Roll for Defense!");
        pendingDefenseSpendsRef.current = [
          ...pendingDefenseSpendsRef.current,
          evasiveSummary,
        ];
      },
      650,
      {
        animateSharedDice: false,
        onTick: () => {
          const frame = Array.from(
            { length: diceCount },
            () => 1 + Math.floor(Math.random() * 6)
          );
          setDefenseStatusRollDisplay({
            dice: frame,
            inProgress: true,
            label: "Evasive Roll",
            outcome: null,
          });
        },
      }
    );
  }, [
    animateDefenseDie,
    resetDefenseRequests,
    combineDefenseSpends,
    latestState,
    pendingAttack,
    pendingDefenseSpendsRef,
    resolveWithEvents,
    openDiceTray,
    closeDiceTray,
    setPendingAttackDispatch,
    setPhase,
    setPlayer,
    setPlayerDefenseState,
    setDefenseStatusRollDisplay,
    setDefenseStatusMessage,
  ]);
  return {
    onConfirmAttack,
    onUserDefenseRoll,
    onChooseDefenseOption,
    onConfirmDefense,
    onUserEvasiveRoll,
  };
}
