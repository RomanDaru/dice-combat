export type Combo =
  | "5OAK" | "4OAK" | "FULL_HOUSE" | "3OAK" | "PAIR_PAIR" | "SMALL_STRAIGHT" | "LARGE_STRAIGHT";

export type Ability = {
  combo: Combo;
  damage: number;
  ultimate?: boolean;
  apply?: Partial<{ burn: number; chi: number; evasive: number }>;
  label?: string;
};

export type HeroId = string;

export type DefenseRoll = { roll: number; reduced: number; reflect: number };
export type DefenseFromRoll = (input: { roll: number; tokens: Tokens }) => {
  reduced: number;
  reflect: number;
};
export type DefenseRoller = (tokens: Tokens) => DefenseRoll;

export type AiDecisionContext = {
  dice: number[];
  rollsRemaining: number;
  tokens: Tokens;
  hero: Hero;
};

export interface Hero {
  id: HeroId;
  name: string;
  maxHp: number;
  abilities: Ability[];
  defense: {
    fromRoll: DefenseFromRoll;
    roll: DefenseRoller;
  };
  ai: {
    chooseHeld: (context: AiDecisionContext) => boolean[];
  };
}

export type Side = "you" | "ai";
export type Phase = "upkeep" | "roll" | "attack" | "defense" | "end";

export type Tokens = { burn: number; chi: number; evasive: number };
export type PlayerState = { hero: Hero; hp: number; tokens: Tokens };
export type TestResult = { name: string; pass: boolean; details?: string };
