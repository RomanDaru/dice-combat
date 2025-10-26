import { Hero, HeroId } from "./types";
import type { EffectId } from "./effects";
import {
  monkDefenseFromRoll,
  monkDefenseRoll,
  pyroDefenseFromRoll,
  pyroDefenseRoll,
} from "./defense";
import { monkAiStrategy, pyroAiStrategy } from "./ai";

export const HEROES: Record<HeroId, Hero> = {
  Pyromancer: {
    id: "Pyromancer",
    name: "Pyromancer",
    maxHp: 30,
    abilities: [
      { combo: "FULL_HOUSE", damage: 8, label: "Full House" },
      {
        combo: "4OAK",
        damage: 7,
        apply: { burn: 1 },
        label: "Four of a kind + Burn",
      },
      {
        combo: "SMALL_STRAIGHT",
        damage: 6,
        apply: { burn: 1 },
        label: "Small straight + Burn",
      },
      { combo: "3OAK", damage: 5, label: "Three of a kind" },
      { combo: "PAIR_PAIR", damage: 4, label: "Two pairs" },
      {
        combo: "LARGE_STRAIGHT",
        damage: 12,
        ultimate: true,
        apply: { burn: 2 },
        label: "ULT: Inferno",
      },
      { combo: "5OAK", damage: 13, ultimate: true, label: "ULT: Supernova" },
    ],
    defense: {
      fromRoll: pyroDefenseFromRoll,
      roll: pyroDefenseRoll,
    },
    ai: {
      chooseHeld: pyroAiStrategy,
    },
  },
  "Shadow Monk": {
    id: "Shadow Monk",
    name: "Shadow Monk",
    maxHp: 30,
    abilities: [
      {
        combo: "FULL_HOUSE",
        damage: 7,
        apply: { chi: 1 },
        label: "Full House + Chi",
      },
      {
        combo: "4OAK",
        damage: 6,
        apply: { chi: 1 },
        label: "Four of a kind + Chi",
      },
      {
        combo: "SMALL_STRAIGHT",
        damage: 5,
        apply: { evasive: 1 },
        label: "Small straight + Evasive",
      },
      { combo: "3OAK", damage: 4, label: "Three of a kind" },
      {
        combo: "PAIR_PAIR",
        damage: 3,
        apply: { chi: 1 },
        label: "Two pairs + Chi",
      },
      {
        combo: "LARGE_STRAIGHT",
        damage: 10,
        ultimate: true,
        apply: { evasive: 1 },
        label: "ULT: Palm of Night",
      },
      { combo: "5OAK", damage: 11, ultimate: true, label: "ULT: Silent Fist" },
    ],
    defense: {
      fromRoll: monkDefenseFromRoll,
      roll: monkDefenseRoll,
    },
    ai: {
      chooseHeld: monkAiStrategy,
    },
  },
};

export const getHeroEffectIds = (hero: Hero): EffectId[] => {
  const effectIds = new Set<EffectId>();

  hero.abilities.forEach((ability) => {
    const applyData = ability.apply;
    if (!applyData) return;

    if (applyData.burn && applyData.burn > 0) effectIds.add("burn");
    if (applyData.chi && applyData.chi > 0) effectIds.add("chi");
    if (applyData.evasive && applyData.evasive > 0) effectIds.add("evasive");
  });

  return Array.from(effectIds);
};
