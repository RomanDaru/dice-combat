import { defineStatus } from "./registry";

defineStatus({
  id: "chi",
  kind: "positive",
  name: "Chi",
  icon: "C",
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
        const block = (roll ?? 0) >= 5 ? 2 : 1;
        return {
          bonusBlock: block,
          log: `Chi -> +${block} block`,
        };
      }
      return {};
    },
  },
});

defineStatus({
  id: "evasive",
  kind: "positive",
  name: "Evasive",
  icon: "E",
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
  kind: "negative",
  name: "Burn",
  icon: "B",
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
