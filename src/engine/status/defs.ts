import { defineStatus } from "./registry";

defineStatus({
  id: "chi",
  name: "Chi",
  icon: "C",
  polarity: "positive",
  activation: "active",
  windows: ["attack:roll", "defense:afterRoll"],
  behaviorId: "bonus_pool",
  behaviorConfig: {
    attack: { bonusDamagePerStack: 1 },
    defense: { bonusBlockPerStack: 1 },
  },
  attachment: { transferable: false },
  maxStacks: 6,
  spend: {
    costStacks: 1,
    allowedPhases: ["attackRoll", "defenseRoll"],
    turnLimited: true,
  },
});

defineStatus({
  id: "evasive",
  name: "Evasive",
  icon: "E",
  polarity: "positive",
  activation: "active",
  windows: ["preDefense:start"],
  behaviorId: "pre_defense_reaction",
  behaviorConfig: {
    negateOnSuccess: true,
    successThreshold: 5,
  },
  attachment: { transferable: false },
  maxStacks: 3,
  spend: {
    costStacks: 1,
    allowedPhases: ["defenseRoll"],
    needsRoll: true,
  },
});

defineStatus({
  id: "burn",
  name: "Burn",
  icon: "B",
  polarity: "negative",
  activation: "passive",
  windows: ["upkeep:tick"],
  behaviorId: "damage_over_time",
  behaviorConfig: {
    tiers: [2, 3, 4],
    decayPerTick: 1,
  },
  attachment: { transferable: true },
  maxStacks: 3,
  priority: 10,
  cleanse: {
    type: "roll",
    threshold: 5,
    resolve: (roll, currentStacks) => {
      const success = roll >= 5;
      return {
        success,
        nextStacks: success ? 0 : currentStacks,
        log: success
          ? `Burn cleanse success (roll ${roll})`
          : `Burn cleanse failed (roll ${roll})`,
      };
    },
  },
});

defineStatus({
  id: "purify",
  name: "Purifying Flame",
  icon: "P",
  polarity: "positive",
  activation: "passive",
  windows: ["turn:preEnd"],
  attachment: { transferable: false },
  maxStacks: 2,
  transfer: {
    mode: "transfer",
    targetPolarity: "negative",
    allowedStatuses: ["burn"],
    transferStacks: 1,
    consumeStacks: 1,
    rollThreshold: 4,
    dieSize: 6,
    window: "upkeep",
    successLog: "Purifying Flame reflects Burn back to the attacker.",
    failureLog: "Purifying Flame sputters out. Burn remains.",
  },
});
