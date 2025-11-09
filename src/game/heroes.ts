import { Hero, HeroId, OffensiveAbility, DefensiveAbility } from "./types";
import type { EffectId } from "./effects";
import { defaultAiStrategy, monkAiStrategy, pyroAiStrategy } from "./ai";
import { HERO_SKIN_IDS } from "./heroSkinIds";

export const HEROES: Record<HeroId, Hero> = {
  Pyromancer: {
    id: "Pyromancer",
    skin: HERO_SKIN_IDS.PYROMANCER_DEFAULT,
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
        applyPostDamage: { burn: 1 },
        label: "Four of a kind + Burn",
        tooltip: "Channel four flames into a lingering burn.",
      },
      SMALL_STRAIGHT: {
        combo: "SMALL_STRAIGHT",
        damage: 6,
        applyPostDamage: { burn: 1 },
        label: "Small straight + Burn",
      },
      "3OAK": { combo: "3OAK", damage: 5, label: "Three of a kind" },
      PAIR_PAIR: { combo: "PAIR_PAIR", damage: 4, label: "Two pairs" },
      LARGE_STRAIGHT: {
        combo: "LARGE_STRAIGHT",
        damage: 12,
        applyPostDamage: { burn: 2 },
        label: "Inferno",
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
        apply: { purify: 1 },
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
    skin: HERO_SKIN_IDS.SHADOW_MONK_DEFAULT,
    name: "Shadow Monk",
    maxHp: 30,
    offensiveBoard: {
      FULL_HOUSE: {
        combo: "FULL_HOUSE",
        damage: 7,
        applyPostDamage: { chi: 1 },
        label: "Foot Step",
        tooltip: "Full House: deal 7 damage and gain 1 Chi.",
      },
      "4OAK": {
        combo: "4OAK",
        damage: 6,
        applyPostDamage: { chi: 1 },
        label: "Moon Splitting Cut",
        tooltip: "Four of a Kind: deal 6 damage and gain 1 Chi.",
      },
      SMALL_STRAIGHT: {
        combo: "SMALL_STRAIGHT",
        damage: 5,
        applyPostDamage: { evasive: 1 },
        label: "Balance the Scales",
        tooltip: "Small Straight: deal 5 damage and gain 1 Evasive.",
      },
      "3OAK": {
        combo: "3OAK",
        damage: 4,
        label: "Shade Break",
        tooltip: "Three of a Kind: deal 4 damage.",
      },
      PAIR_PAIR: {
        combo: "PAIR_PAIR",
        damage: 3,
        applyPostDamage: { chi: 1 },
        label: "Vow at Dusk",
        tooltip: "Two Pairs: deal 3 damage and gain 1 Chi.",
      },
      LARGE_STRAIGHT: {
        combo: "LARGE_STRAIGHT",
        damage: 10,
        applyPostDamage: { evasive: 1 },
        label: "Weight of Regret",
        tooltip: "Large Straight: deal 10 damage and gain 1 Evasive.",
      },
      "5OAK": {
        combo: "5OAK",
        damage: 11,
        ultimate: true,
        label: "ULT: Dusk Extinction",
        tooltip: "Ultimate: deal 11 damage.",
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
        label: "Unseen Mercy",
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
    skin: HERO_SKIN_IDS.TRAINING_DUMMY_DEFAULT,
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

  const collectApplyMap = (
    apply?: OffensiveAbility["apply"] | OffensiveAbility["applyPreDamage"]
  ) => {
    if (!apply) return;
    if (apply.burn && apply.burn > 0) effectIds.add("burn");
    if (apply.chi && apply.chi > 0) effectIds.add("chi");
    if (apply.evasive && apply.evasive > 0) effectIds.add("evasive");
    if (apply.purify && apply.purify > 0) effectIds.add("purify");
  };

  Object.values(hero.offensiveBoard).forEach((ability) => {
    collectApplyMap(ability?.applyPreDamage);
    collectApplyMap(ability?.applyPostDamage ?? ability?.apply);
  });
  Object.values(hero.defensiveBoard).forEach((ability) =>
    collectApplyMap(ability?.apply)
  );

  return Array.from(effectIds);
};
