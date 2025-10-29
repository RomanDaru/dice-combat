import { Hero, HeroId, OffensiveAbility, DefensiveAbility } from "./types";
import type { EffectId } from "./effects";
import { defaultAiStrategy, monkAiStrategy, pyroAiStrategy } from "./ai";

export const HEROES: Record<HeroId, Hero> = {
  Pyromancer: {
    id: "Pyromancer",
    name: "Pyromancer",
    maxHp: 30,
    offensiveBoard: {
      FULL_HOUSE: {
        combo: "FULL_HOUSE",
        damage: 8,
        label: "Full House",
        tooltip: "Ignite foes with a strong poker hand.",
      },
      "4OAK": {
        combo: "4OAK",
        damage: 7,
        apply: { burn: 1 },
        label: "Four of a kind + Burn",
        tooltip: "Channel four flames into a lingering burn.",
      },
      SMALL_STRAIGHT: {
        combo: "SMALL_STRAIGHT",
        damage: 6,
        apply: { burn: 1 },
        label: "Small straight + Burn",
      },
      "3OAK": { combo: "3OAK", damage: 5, label: "Three of a kind" },
      PAIR_PAIR: { combo: "PAIR_PAIR", damage: 4, label: "Two pairs" },
      LARGE_STRAIGHT: {
        combo: "LARGE_STRAIGHT",
        damage: 12,
        ultimate: true,
        apply: { burn: 2 },
        label: "ULT: Inferno",
      },
      "5OAK": {
        combo: "5OAK",
        damage: 13,
        ultimate: true,
        label: "ULT: Supernova",
      },
    },
    defensiveBoard: {
      "5OAK": {
        combo: "5OAK",
        label: "Flame Ward",
        block: 8,
        reflect: 2,
      },
      LARGE_STRAIGHT: {
        combo: "LARGE_STRAIGHT",
        label: "Blazing Barrier",
        block: 6,
      },
      FULL_HOUSE: {
        combo: "FULL_HOUSE",
        label: "Ember Shield",
        block: 5,
      },
      "4OAK": {
        combo: "4OAK",
        label: "Cinder Guard",
        block: 5,
      },
      SMALL_STRAIGHT: {
        combo: "SMALL_STRAIGHT",
        label: "Ashen Veil",
        block: 3,
      },
      "3OAK": {
        combo: "3OAK",
        label: "Spark Parry",
        block: 2,
      },
      PAIR_PAIR: {
        combo: "PAIR_PAIR",
        label: "Flicker Step",
        block: 1,
      },
    },
    ai: {
      chooseHeld: pyroAiStrategy,
    },
  },
  "Shadow Monk": {
    id: "Shadow Monk",
    name: "Shadow Monk",
    maxHp: 30,
    offensiveBoard: {
      FULL_HOUSE: {
        combo: "FULL_HOUSE",
        damage: 7,
        apply: { chi: 1 },
        label: "Full House + Chi",
      },
      "4OAK": {
        combo: "4OAK",
        damage: 6,
        apply: { chi: 1 },
        label: "Four of a kind + Chi",
      },
      SMALL_STRAIGHT: {
        combo: "SMALL_STRAIGHT",
        damage: 5,
        apply: { evasive: 1 },
        label: "Small straight + Evasive",
      },
      "3OAK": { combo: "3OAK", damage: 4, label: "Three of a kind" },
      PAIR_PAIR: {
        combo: "PAIR_PAIR",
        damage: 3,
        apply: { chi: 1 },
        label: "Two pairs + Chi",
      },
      LARGE_STRAIGHT: {
        combo: "LARGE_STRAIGHT",
        damage: 10,
        ultimate: true,
        apply: { evasive: 1 },
        label: "ULT: Palm of Night",
      },
      "5OAK": {
        combo: "5OAK",
        damage: 11,
        ultimate: true,
        label: "ULT: Silent Fist",
      },
    },
    defensiveBoard: {
      "5OAK": {
        combo: "5OAK",
        label: "DEF: Shadow Riposte",
        block: 3,
        reflect: 2,
      },
      LARGE_STRAIGHT: {
        combo: "LARGE_STRAIGHT",
        label: "DEF: Velvet Shroud",
        block: 3,
        apply: { evasive: 1 },
      },
      FULL_HOUSE: {
        combo: "FULL_HOUSE",
        label: "DEF: Chi Redirect",
        block: 2,
        apply: { chi: 1 },
      },
      "4OAK": {
        combo: "4OAK",
        label: "DEF: Palm Deflection",
        block: 2,
        reflect: 1,
      },
      SMALL_STRAIGHT: {
        combo: "SMALL_STRAIGHT",
        label: "DEF: Smoke Step",
        block: 1,
        apply: { evasive: 1 },
      },
      "3OAK": {
        combo: "3OAK",
        label: "DEF: Slip Strike",
        block: 1,
      },
      PAIR_PAIR: {
        combo: "PAIR_PAIR",
        label: "DEF: Ring Guard",
        block: 1,
        apply: { chi: 1 },
      },
    },
    ai: {
      chooseHeld: monkAiStrategy,
    },
  },
  "Training Dummy": {
    id: "Training Dummy",
    name: "Training Dummy",
    maxHp: 50,
    offensiveBoard: {
      "5OAK": { combo: "5OAK", damage: 13, label: "Crushing Finale" },
      LARGE_STRAIGHT: {
        combo: "LARGE_STRAIGHT",
        damage: 12,
        label: "Heroic Charge",
      },
      FULL_HOUSE: { combo: "FULL_HOUSE", damage: 8, label: "Bonebreaker" },
      "4OAK": { combo: "4OAK", damage: 7, label: "Skullsplitter" },
      SMALL_STRAIGHT: {
        combo: "SMALL_STRAIGHT",
        damage: 6,
        label: "Whirlwind",
      },
      "3OAK": { combo: "3OAK", damage: 5, label: "Shield Bash" },
      PAIR_PAIR: { combo: "PAIR_PAIR", damage: 4, label: "Twin Strike" },
    },
    defensiveBoard: {
      "5OAK": { combo: "5OAK", label: "DEF: 5OAK", block: 13 },
      LARGE_STRAIGHT: {
        combo: "LARGE_STRAIGHT",
        label: "DEF: LS",
        block: 12,
      },
      FULL_HOUSE: { combo: "FULL_HOUSE", label: "DEF: FH", block: 8 },
      "4OAK": { combo: "4OAK", label: "DEF: 4OAK", block: 8 },
      SMALL_STRAIGHT: {
        combo: "SMALL_STRAIGHT",
        label: "DEF: SM",
        block: 4,
      },
      "3OAK": { combo: "3OAK", label: "DEF: 3OAK", block: 4 },
      PAIR_PAIR: { combo: "PAIR_PAIR", label: "DEF: Parry", block: 2 },
    },
    ai: {
      chooseHeld: defaultAiStrategy,
    },
  },
};

export const getHeroEffectIds = (hero: Hero): EffectId[] => {
  const effectIds = new Set<EffectId>();

  const collectApply = (ability?: OffensiveAbility | DefensiveAbility) => {
    if (!ability?.apply) return;
    const applyData = ability.apply;

    if (applyData.burn && applyData.burn > 0) effectIds.add("burn");
    if (applyData.chi && applyData.chi > 0) effectIds.add("chi");
    if (applyData.evasive && applyData.evasive > 0) effectIds.add("evasive");
  };

  Object.values(hero.offensiveBoard).forEach((ability) =>
    collectApply(ability)
  );
  Object.values(hero.defensiveBoard).forEach((ability) =>
    collectApply(ability)
  );

  return Array.from(effectIds);
};
