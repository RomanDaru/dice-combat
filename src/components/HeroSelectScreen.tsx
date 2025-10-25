import { useEffect, useMemo, useState } from "react";
import AbilityList from "./AbilityList";
import { Hero } from "../game/types";

export type HeroOption = {
  hero: Hero;
  image: string;
};

type HeroSelectScreenProps = {
  heroOptions: HeroOption[];
  onConfirm: (playerHero: Hero, aiHero: Hero) => void;
};

type Phase = "intro" | "select" | "confirm";

export default function HeroSelectScreen({
  heroOptions,
  onConfirm,
}: HeroSelectScreenProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [titleRaised, setTitleRaised] = useState(false);
  const [showSelectButton, setShowSelectButton] = useState(false);
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "intro") return;
    setTitleRaised(false);
    setShowSelectButton(false);
    const titleTimer = window.setTimeout(() => setTitleRaised(true), 700);
    const buttonTimer = window.setTimeout(() => setShowSelectButton(true), 1300);
    return () => {
      window.clearTimeout(titleTimer);
      window.clearTimeout(buttonTimer);
    };
  }, [phase]);

  const selectedHeroOption = useMemo(
    () => heroOptions.find((option) => option.hero.id === selectedHeroId) ?? null,
    [heroOptions, selectedHeroId]
  );

  const aiHeroOption = useMemo(() => {
    if (!selectedHeroOption) {
      return heroOptions[0] ?? null;
    }
    const remaining = heroOptions.filter(
      (option) => option.hero.id !== selectedHeroOption.hero.id
    );
    return remaining[0] ?? selectedHeroOption;
  }, [heroOptions, selectedHeroOption]);

  const handleOpenSelection = () => {
    setPhase("select");
    setTitleRaised(true);
  };

  const handleChooseHero = (heroId: string) => {
    setSelectedHeroId(heroId);
    setPhase("confirm");
  };

  const handleConfirm = () => {
    if (!selectedHeroOption || !aiHeroOption) return;
    onConfirm(selectedHeroOption.hero, aiHeroOption.hero);
  };

  const handleChangeHero = () => {
    setSelectedHeroId(null);
    setPhase("select");
  };

  return (
    <div className={`welcome-screen phase-${phase}`}>
      <div className={`welcome-heading ${titleRaised ? "raised" : ""}`}>
        Fantasy Dice Combat
      </div>
      {phase === "intro" ? (
        showSelectButton && (
          <div className='welcome-action'>
            <button
              type='button'
              className='welcome-primary'
              onClick={handleOpenSelection}>
              Select Hero
            </button>
          </div>
        )
      ) : (
        <div className='welcome-body visible'>
          <p className='welcome-subtext'>Choose your hero to begin the battle.</p>
          <div className='hero-stage'>
            {phase === "select" && (
              <div className='hero-grid'>
                {heroOptions.map((option) => (
                  <button
                    key={option.hero.id}
                    type='button'
                    className={`hero-card ${
                      selectedHeroId === option.hero.id ? "selected" : ""
                    }`}
                    onClick={() => handleChooseHero(option.hero.id)}>
                    <img src={option.image} alt={option.hero.name} />
                    <span>{option.hero.name}</span>
                  </button>
                ))}
              </div>
            )}
            {phase === "confirm" && selectedHeroOption && (
              <div className='hero-confirm'>
                <div className='hero-confirm-layout'>
                  <div className='hero-preview'>
                    <img
                      src={selectedHeroOption.image}
                      alt={selectedHeroOption.hero.name}
                    />
                    <div className='hero-preview-meta'>
                      <h3>{selectedHeroOption.hero.name}</h3>
                      <p>HP {selectedHeroOption.hero.maxHp}</p>
                      {aiHeroOption &&
                        aiHeroOption.hero.id !== selectedHeroOption.hero.id && (
                          <div className='hero-ai-preview'>
                            AI will play as{" "}
                            <strong>{aiHeroOption.hero.name}</strong>
                          </div>
                        )}
                    </div>
                  </div>
                  <div className='hero-abilities'>
                    <AbilityList
                      hero={selectedHeroOption.hero}
                      title='Abilities'
                    />
                  </div>
                </div>
                <div className='hero-confirm-actions'>
                  <button
                    type='button'
                    className='welcome-secondary'
                    onClick={handleChangeHero}>
                    Choose another
                  </button>
                  <button
                    type='button'
                    className='welcome-primary'
                    onClick={handleConfirm}>
                    Confirm {selectedHeroOption.hero.name}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

