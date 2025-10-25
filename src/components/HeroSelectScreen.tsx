import { useMemo, useState } from "react";
import clsx from "clsx";
import { Hero } from "../game/types";
import styles from "./HeroSelectScreen.module.css";
import PyromancerPreview from "../assets/Pyromancer_Animated1.mp4";

const AbilityPreviewList = ({ hero }: { hero: Hero }) => {
  return (
    <div className={styles.abilityList}>
      {hero.abilities.map((ability) => {
        const effects: string[] = [];
        if (ability.apply?.burn) effects.push(`Burn +${ability.apply.burn}`);
        if (ability.apply?.ignite)
          effects.push(`Ignite +${ability.apply.ignite}`);
        if (ability.apply?.chi) effects.push(`Chi +${ability.apply.chi}`);
        if (ability.apply?.evasive)
          effects.push(`Evasive +${ability.apply.evasive}`);

        return (
          <div key={ability.combo} className={styles.abilityRow}>
            <div className={styles.abilityRowContent}>
              <span
                className={clsx(
                  "badge",
                  ability.ultimate
                    ? styles.abilityBadgeUlt
                    : styles.abilityBadgeSkill
                )}>
                {ability.ultimate ? "ULT" : "SK"}
              </span>
              <span>{ability.label ?? ability.combo}</span>
            </div>
            <div className={styles.abilityStats}>
              <span className={clsx("num", styles.damageText)}>
                {ability.damage} dmg
              </span>
              {effects.length > 0 && (
                <span className={styles.effectText}>
                  {effects.join(", ")}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const HERO_MEDIA: Partial<Record<string, string>> = {
  Pyromancer: PyromancerPreview,
};

type HeroDetailPanelProps = {
  hero: Hero;
  image: string;
};

const HeroDetailPanel = ({ hero, image }: HeroDetailPanelProps) => {
  const mediaSource = HERO_MEDIA[hero.id] ?? null;

  return (
    <div className={styles.detailLayout}>
      <div className={styles.detailVisual}>
        {mediaSource ? (
          <video
            key={hero.id}
            className={styles.detailMedia}
            autoPlay
            loop
            muted
            playsInline
            poster={image}>
            <source src={mediaSource} type='video/mp4' />
          </video>
        ) : (
          <img src={image} alt={hero.name} className={styles.detailMedia} />
        )}
      </div>

      <div className={styles.abilityPreview}>
        <AbilityPreviewList hero={hero} />
      </div>
    </div>
  );
};

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
    if (!heroOptions.length) {
      return null;
    }
    if (!selectedHeroOption) {
      const randomIndex = Math.floor(Math.random() * heroOptions.length);
      return heroOptions[randomIndex];
    }
    const remaining = heroOptions.filter(
      (option) => option.hero.id !== selectedHeroOption.hero.id
    );
    if (!remaining.length) {
      return selectedHeroOption;
    }
    const randomIndex = Math.floor(Math.random() * remaining.length);
    return remaining[randomIndex];
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

  const headingText =
    phase === "detail" && selectedHeroOption
      ? selectedHeroOption.hero.name
      : "Select Your Hero";

  return (
    <div className='welcome-screen phase-select'>
      <div className={clsx("welcome-heading", "raised", styles.headingSwapWrapper)}>
        <span key={headingText} className={styles.headingSwapText}>
          {headingText}
        </span>
      </div>
      {phase === "grid" ? (
        <div className={clsx("welcome-body", styles.phaseBody, styles.gridEnter)}>
          <p className='welcome-subtext'>
            Choose your hero to begin the battle.
          </p>
          <div className={styles.heroGrid}>
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
          <div
            key={selectedHeroOption.hero.id}
            className={clsx("welcome-body", styles.phaseBody, styles.detailEnter)}>
            <p className='welcome-subtext'>
              Review abilities and confirm your choice.
            </p>
            <HeroDetailPanel
              hero={selectedHeroOption.hero}
              image={selectedHeroOption.image}
            />
            <div className={styles.actionRow}>
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
        )
      )}
    </div>
  );
}

