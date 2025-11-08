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
    apply: ({ phase, roll }) => {
      if (phase === "attackRoll") {
        return {
          bonusDamage: 1,
          log: "Chi -> +1 damage",
        };
      }
      if (phase === "defenseRoll") {
        return {
          bonusBlock: 1,
          log: "Chi -> +1 block",
        };
      }
      return {};
    },
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
    apply: ({ roll }) => {
      const rolled = roll ?? 0;
      const success = rolled >= 5;
      return success
        ? {
            negateIncoming: true,
            success,
            log: `Evasive success (roll ${rolled}) -> attack dodged`,
          }
        : {
            success,
            log: `Evasive failed (roll ${rolled})`,
          };
    },
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
  attachment: { transferable: true, ownerFlag: true },
  maxStacks: 3,
  priority: 10,
  onTick: (stacks) => {
    const capped = Math.min(Math.max(stacks, 0), 3);
    const damage = capped <= 0 ? 0 : capped === 1 ? 2 : capped === 2 ? 3 : 4;
    const nextStacks = Math.max(0, capped - 1);
    return {
      damage,
      nextStacks,
      log: damage > 0 ? `Burn ${capped} -> ${damage} dmg` : undefined,
      prompt: damage > 0 && nextStacks > 0,
    };
  },
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
