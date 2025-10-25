import { useMemo, useState } from "react";
import AbilityList from "./AbilityList";
import { Hero } from "../game/types";

export type HeroOption = {
  hero: Hero;
  image: string;
};

type HeroSelectScreenProps = {
  heroOptions: HeroOption[];
  onConfirm: (playerHero: Hero, aiHero: Hero) => void;
  onClose: () => void;
};

type SelectionPhase = "grid" | "detail";

export default function HeroSelectScreen({
  heroOptions,
  onConfirm,
  onClose,
}: HeroSelectScreenProps) {
  const [phase, setPhase] = useState<SelectionPhase>("grid");
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);

  const selectedHeroOption = useMemo(
    () => heroOptions.find((option) => option.hero.id === selectedHeroId) ?? null,
    [heroOptions, selectedHeroId]
  );

  const aiHeroOption = useMemo(() => {
    if (!selectedHeroOption) return heroOptions[0] ?? null;
    const remaining = heroOptions.filter(
      (option) => option.hero.id !== selectedHeroOption.hero.id
    );
    return remaining[0] ?? selectedHeroOption;
  }, [heroOptions, selectedHeroOption]);

  const handleSelectHero = (heroId: string) => {
    setSelectedHeroId(heroId);
    setPhase("detail");
  };

  const handleBackToGrid = () => {
    setPhase("grid");
    setSelectedHeroId(null);
  };

  const handleConfirm = () => {
    if (!selectedHeroOption || !aiHeroOption) return;
    onConfirm(selectedHeroOption.hero, aiHeroOption.hero);
  };

  if (!heroOptions.length) {
    return (
      <div className='welcome-screen phase-select'>
        <div className='welcome-heading raised'>Fantasy Dice Combat</div>
        <p className='welcome-subtext'>No heroes available.</p>
        <div className='welcome-action'>
          <button type='button' className='welcome-secondary' onClick={onClose}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className='welcome-screen phase-select'>
      <div className='welcome-heading raised'>Select Your Hero</div>
      {phase === "grid" ? (
        <div className='welcome-body visible'>
          <p className='welcome-subtext'>
            Choose your hero to begin the battle.
          </p>
          <div
            className='hero-grid'
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              marginTop: 24,
              width: "100%",
            }}>
            {heroOptions.map((option) => (
              <button
                key={option.hero.id}
                type='button'
                className='hero-card'
                onClick={() => handleSelectHero(option.hero.id)}>
                <img src={option.image} alt={option.hero.name} />
                <span>{option.hero.name}</span>
              </button>
            ))}
          </div>
          <div className='welcome-action'>
            <button
              type='button'
              className='welcome-secondary'
              onClick={onClose}>
              Back
            </button>
          </div>
        </div>
      ) : (
        selectedHeroOption && (
          <div className='welcome-body visible'>
            <p className='welcome-subtext'>
              Review abilities and confirm your choice.
            </p>
            <div
              style={{
                display: "grid",
                gap: 24,
                marginTop: 24,
                width: "100%",
              }}>
              <div
                style={{
                  display: "flex",
                  gap: 24,
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                }}>
                <img
                  src={selectedHeroOption.image}
                  alt={selectedHeroOption.hero.name}
                  style={{
                    width: 200,
                    height: 200,
                    objectFit: "cover",
                    borderRadius: 12,
                    border: "1px solid #3f3f46",
                  }}
                />
                <div style={{ minWidth: 220, display: "grid", gap: 8 }}>
                  <h3 style={{ fontSize: 24, margin: 0 }}>
                    {selectedHeroOption.hero.name}
                  </h3>
                  <p style={{ margin: 0, color: "#a1a1aa" }}>
                    Max HP: {selectedHeroOption.hero.maxHp}
                  </p>
                  {aiHeroOption &&
                    aiHeroOption.hero.id !== selectedHeroOption.hero.id && (
                      <p style={{ margin: 0, color: "#d4d4d8" }}>
                        AI opponent:{" "}
                        <strong>{aiHeroOption.hero.name}</strong>
                      </p>
                    )}
                </div>
              </div>

              <div
                style={{
                  border: "1px solid #3f3f46",
                  borderRadius: 12,
                  padding: 16,
                  background: "rgba(24,24,27,.6)",
                }}>
                <AbilityList hero={selectedHeroOption.hero} title='Abilities' />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  justifyContent: "flex-end",
                }}>
                <button
                  type='button'
                  className='welcome-secondary'
                  onClick={handleBackToGrid}>
                  Back to heroes
                </button>
                <button
                  type='button'
                  className='welcome-primary'
                  onClick={handleConfirm}>
                  Confirm {selectedHeroOption.hero.name}
                </button>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

