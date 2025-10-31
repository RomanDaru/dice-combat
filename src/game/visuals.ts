import DefaultBoard from "../assets/Default_Board.png";
import DefaultTray from "../assets/Default_Board.png";
import DefaultPortrait from "../assets/TrainingDummy_Hero.png";
import PyromancerBoard from "../assets/Pyromancer_Board_Fiery.png";
import PyromancerTray from "../assets/Pyromancer_Tray_Fiery.png";
import PyromancerPortrait from "../assets/Pyromancer_Hero.png";
import PyromancerDiceFace1 from "../assets/Pyromancer_Dices/Pyromancer_Dice_1.png";
import PyromancerDiceFace2 from "../assets/Pyromancer_Dices/Pyromancer_Dice_2.png";
import PyromancerDiceFace3 from "../assets/Pyromancer_Dices/Pyromancer_Dice_3.png";
import PyromancerDiceFace4 from "../assets/Pyromancer_Dices/Pyromancer_Dice_4.png";
import PyromancerDiceFace5 from "../assets/Pyromancer_Dices/Pyromancer_Dice_5.png";
import PyromancerDiceFace6 from "../assets/Pyromancer_Dices/Pyromancer_Dice_6.png";
import ShadowMonkBoard from "../assets/ShadowMonk_Board.png";
import ShadowMonkTray from "../assets/ShadowMonk_Tray.png";
import ShadowMonkPortrait from "../assets/Shadow_Monk_Hero.png";
import ShadowMonkDiceFace1 from "../assets/ShadowMonk_Dices/ShadowMonk_Dice_1_128.png";
import ShadowMonkDiceFace2 from "../assets/ShadowMonk_Dices/ShadowMonk_Dice_2_128.png";
import ShadowMonkDiceFace3 from "../assets/ShadowMonk_Dices/ShadowMonk_Dice_3_128.png";
import ShadowMonkDiceFace4 from "../assets/ShadowMonk_Dices/ShadowMonk_Dice_4_128.png";
import ShadowMonkDiceFace5 from "../assets/ShadowMonk_Dices/ShadowMonk_Dice_5_128.png";
import ShadowMonkDiceFace6 from "../assets/ShadowMonk_Dices/ShadowMonk_Dice_6_128.png";
import TrainingDummyPortrait from "../assets/TrainingDummy_Hero.png";
import TrainingDummyTray from "../assets/TrainingDummy_Trazy.png";
import TrainingDummyDiceFace1 from "../assets/TrainingDummy_Dices/TrainingDummy_Dice_1.png";
import TrainingDummyDiceFace2 from "../assets/TrainingDummy_Dices/TrainingDummy_Dice_2.png";
import TrainingDummyDiceFace3 from "../assets/TrainingDummy_Dices/TrainingDummy_Dice_3.png";
import TrainingDummyDiceFace4 from "../assets/TrainingDummy_Dices/TrainingDummy_Dice_4.png";
import TrainingDummyDiceFace5 from "../assets/TrainingDummy_Dices/TrainingDummy_Dice_5.png";
import TrainingDummyDiceFace6 from "../assets/TrainingDummy_Dices/TrainingDummy_Dice_6.png";

export const HERO_SKIN_IDS = {
  DEFAULT: "default",
  PYROMANCER_DEFAULT: "pyromancer-default",
  SHADOW_MONK_DEFAULT: "shadow-monk-default",
  TRAINING_DUMMY_DEFAULT: "training-dummy-default",
} as const;

export type HeroSkinId = (typeof HERO_SKIN_IDS)[keyof typeof HERO_SKIN_IDS];

export type HeroDiceSkin = {
  sprite?: string;
  faces?: string[];
};

export type HeroSkin = {
  id: HeroSkinId;
  label: string;
  board?: string;
  boardHalf?: string;
  tray?: string;
  hudFrame?: string;
  portrait?: string;
  diceSet?: HeroDiceSkin;
};

const DEFAULT_SKIN: HeroSkin = {
  id: HERO_SKIN_IDS.DEFAULT,
  label: "Default Skin",
  board: DefaultBoard,
  boardHalf: DefaultBoard,
  tray: DefaultTray,
  portrait: DefaultPortrait,
};

export const HERO_SKINS: Record<HeroSkinId, HeroSkin> = {
  [HERO_SKIN_IDS.DEFAULT]: DEFAULT_SKIN,
  [HERO_SKIN_IDS.PYROMANCER_DEFAULT]: {
    id: HERO_SKIN_IDS.PYROMANCER_DEFAULT,
    label: "Pyromancer",
    board: PyromancerBoard,
    boardHalf: PyromancerBoard,
    tray: PyromancerTray,
    portrait: PyromancerPortrait,
    diceSet: {
      faces: [
        PyromancerDiceFace1,
        PyromancerDiceFace2,
        PyromancerDiceFace3,
        PyromancerDiceFace4,
        PyromancerDiceFace5,
        PyromancerDiceFace6,
      ],
    },
  },
  [HERO_SKIN_IDS.SHADOW_MONK_DEFAULT]: {
    id: HERO_SKIN_IDS.SHADOW_MONK_DEFAULT,
    label: "Shadow Monk",
    board: ShadowMonkBoard,
    boardHalf: ShadowMonkBoard,
    tray: ShadowMonkTray,
    portrait: ShadowMonkPortrait,
    diceSet: {
      faces: [
        ShadowMonkDiceFace1,
        ShadowMonkDiceFace2,
        ShadowMonkDiceFace3,
        ShadowMonkDiceFace4,
        ShadowMonkDiceFace5,
        ShadowMonkDiceFace6,
      ],
    },
  },
  [HERO_SKIN_IDS.TRAINING_DUMMY_DEFAULT]: {
    ...DEFAULT_SKIN,
    id: HERO_SKIN_IDS.TRAINING_DUMMY_DEFAULT,
    label: "Training Dummy",
    portrait: TrainingDummyPortrait,
    tray: TrainingDummyTray,
    diceSet: {
      faces: [
        TrainingDummyDiceFace1,
        TrainingDummyDiceFace2,
        TrainingDummyDiceFace3,
        TrainingDummyDiceFace4,
        TrainingDummyDiceFace5,
        TrainingDummyDiceFace6,
      ],
    },
  },
};

export function getHeroSkin(id?: HeroSkinId | null): HeroSkin {
  if (!id) return DEFAULT_SKIN;
  return HERO_SKINS[id] ?? DEFAULT_SKIN;
}
