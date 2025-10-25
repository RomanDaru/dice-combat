import React, { useMemo, useReducer, useState } from "react";
import HeroSelectScreen, { HeroOption } from "./components/HeroSelectScreen";
import { BattleScreen } from "./screens/BattleScreen";
import { IntroScreen } from "./screens/IntroScreen";
import { HEROES } from "./game/heroes";
import { createInitialState, gameReducer } from "./game/state";
import { GameContext } from "./context/GameContext";
import type { Hero } from "./game/types";
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

  const [screen, setScreen] = useState<"intro" | "hero-select" | "game">("intro");

  const heroOptions: HeroOption[] = useMemo(
    () =>
      Object.values(HEROES).map((hero) => ({
        hero,
        image: HERO_IMAGES[hero.id] ?? PyromancerPortrait,
      })),
    []
  );

  const startBattle = (playerHero: Hero, aiHero: Hero) => {
    dispatch({
      type: "RESET",
      payload: { youHero: playerHero, aiHero },
    });
    setScreen("game");
  };

  const handleOpenHeroSelect = () => setScreen("hero-select");
  const handleBackToIntro = () => setScreen("intro");
  const handleHeroSelection = (playerHero: Hero, aiHero: Hero) =>
    startBattle(playerHero, aiHero);

  let content;
  if (screen === "intro") {
    content = <IntroScreen onBegin={handleOpenHeroSelect} />;
  } else if (screen === "hero-select") {
    content = (
      <HeroSelectScreen
        heroOptions={heroOptions}
        onConfirm={handleHeroSelection}
        onClose={handleBackToIntro}
      />
    );
  } else {
    content = <BattleScreen />;
  }

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      <div key={screen} className='screen-transition'>
        {content}
      </div>
    </GameContext.Provider>
  );
}
