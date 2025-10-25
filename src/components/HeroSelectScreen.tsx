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
};

export default function HeroSelectScreen({
  heroOptions,
  onConfirm,
}: HeroSelectScreenProps) {
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(
    heroOptions[0]?.hero.id ?? null
  );

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

  const handleStartBattle = () => {
    if (!selectedHeroOption || !aiHeroOption) return;
    onConfirm(selectedHeroOption.hero, aiHeroOption.hero);
  };

  if (!heroOptions.length) {
    return (
      <div className='welcome-screen phase-select'>
        <div className='welcome-heading raised'>Fantasy Dice Combat</div>
        <p className='welcome-subtext'>No heroes available.</p>
      </div>
    );
  }

  return (
    <div className='welcome-screen phase-select'>
      <div className='welcome-heading raised'>Fantasy Dice Combat</div>
      <div className='welcome-body visible'>
        <p className='welcome-subtext'>Choose your hero to begin the battle.</p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)",
            gap: 24,
            marginTop: 24,
            width: "100%",
          }}>
          <div
            className='hero-grid'
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            }}>
            {heroOptions.map((option) => {
              const selected = selectedHeroId === option.hero.id;
              return (
                <button
                  key={option.hero.id}
                  type='button'
                  className={`hero-card ${selected ? "selected" : ""}`}
                  onClick={() => setSelectedHeroId(option.hero.id)}
                  style={{ textAlign: "left" }}>
                  <img src={option.image} alt={option.hero.name} />
                  <span>{option.hero.name}</span>
                </button>
              );
            })}
          </div>

          {selectedHeroOption ? (
            <div
              className='hero-confirm'
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}>
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  alignItems: "flex-start",
                }}>
                <img
                  src={selectedHeroOption.image}
                  alt={selectedHeroOption.hero.name}
                  style={{
                    width: 160,
                    height: 160,
                    objectFit: "cover",
                    borderRadius: 12,
                    border: "1px solid #3f3f46",
                  }}
                />
                <div style={{ display: "grid", gap: 8 }}>
                  <h3 style={{ fontSize: 22, margin: 0 }}>
                    {selectedHeroOption.hero.name}
                  </h3>
                  <p style={{ margin: 0, color: "#a1a1aa" }}>
                    Max HP: {selectedHeroOption.hero.maxHp}
                  </p>
                  {aiHeroOption && (
                    <p style={{ margin: 0, color: "#d4d4d8" }}>
                      AI opponent:{" "}
                      <strong>{aiHeroOption.hero.name}</strong>
                    </p>
                  )}
                </div>
              </div>

              <div
                className='hero-abilities'
                style={{
                  border: "1px solid #3f3f46",
                  borderRadius: 12,
                  padding: 16,
                  background: "rgba(24,24,27,.6)",
                }}>
                <AbilityList hero={selectedHeroOption.hero} title='Abilities' />
              </div>

              <div
                className='hero-confirm-actions'
                style={{
                  display: "flex",
                  gap: 12,
                  justifyContent: "flex-end",
                  marginTop: 8,
                }}>
                <button
                  type='button'
                  className='welcome-secondary'
                  onClick={() => setSelectedHeroId(null)}>
                  Clear selection
                </button>
                <button
                  type='button'
                  className='welcome-primary'
                  onClick={handleStartBattle}>
                  Start Battle
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                border: "1px dashed #52525b",
                borderRadius: 12,
                padding: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#a1a1aa",
                background: "rgba(24,24,27,.4)",
              }}>
              Select a hero on the left to see their abilities.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

