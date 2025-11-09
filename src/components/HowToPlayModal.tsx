import React, { useEffect, useMemo, useRef, useState } from "react";
import { getStatus, type StatusId } from "../engine/status";
import styles from "./HowToPlayModal.module.css";

type HowToPlayModalProps = {
  open: boolean;
  onClose: () => void;
};

type StatusDetail = {
  id: StatusId;
  fallbackName: string;
  fallbackIcon: string;
  hero: string;
  summary: string;
  notes: string[];
};

const TURN_STEPS = [
  {
    id: "initiative",
    title: "Standoff / Initiative",
    detail:
      "Both heroes roll a single die. Highest result takes the first turn. Ties are rerolled until someone wins.",
  },
  {
    id: "upkeep",
    title: "Upkeep",
    detail:
      "Resolve ongoing effects (Burn damage, Purifying Flame transfers, delayed cues) before dice rolling begins.",
  },
  {
    id: "roll",
    title: "Roll Phase",
    detail:
      "Active hero rolls five dice up to three times, locking in a result that will drive their selected ability or combo.",
  },
  {
    id: "attack",
    title: "Attack Phase",
    detail:
      "Apply the chosen offensive ability, assign base damage, and hand off to the defender. Offense can spend Chi here.",
  },
  {
    id: "defense",
    title: "Defense Phase",
    detail:
      "Defender may spend Chi or Evasive, roll defense dice, block or reflect damage, then apply any status prompts.",
  },
  {
    id: "end",
    title: "End Phase",
    detail:
      "Clean up temporary effects, decay spent statuses, and pass the turn. After both players act, the round counter advances.",
  },
] as const;

const STATUS_DETAILS: StatusDetail[] = [
  {
    id: "chi",
    fallbackName: "Chi",
    fallbackIcon: "C",
    hero: "Shadow Monk resource",
    summary:
      "Spend Chi stacks to add precision hits or reinforce your guard during the exact roll window you are in.",
    notes: [
      "Gain Chi from several Shadow Monk offensive chains or defensive triggers; stacks cap at six.",
      "During your attack roll you may spend Chi to add +1 damage per stack before other modifiers resolve.",
      "During your defense roll you may instead spend Chi to add +1 block per stack before damage is applied.",
      "Chi is not transferable and unspent stacks carry over, so banking several for a spike turn is viable.",
    ],
  },
  {
    id: "evasive",
    fallbackName: "Evasive",
    fallbackIcon: "E",
    hero: "Shadow Monk protection",
    summary:
      "A panic button that lets the monk roll a die to attempt to dodge the entire incoming attack.",
    notes: [
      "Each stack lets you roll one die during the defense phase; a 5 or 6 negates all damage from that attack.",
      "Success consumes only the stack you spend. Failure still removes that stack, so mind how many you have.",
      "Stacks cap at three and are gained from select monk abilities or defensive rolls.",
      "Use Evasive before rolling defense dice; if it succeeds you skip the rest of the defense calculation.",
    ],
  },
  {
    id: "burn",
    fallbackName: "Burn",
    fallbackIcon: "B",
    hero: "Pyromancer damage-over-time",
    summary:
      "Lingering fire that automatically deals damage at the start of the afflicted hero’s turn.",
    notes: [
      "Burn damage occurs during the victim’s upkeep: 1 stack deals 2 damage, 2 stacks deal 3, and 3 stacks deal 4.",
      "After dealing damage, Burn decays by one stack, so repeated applications keep the flames alive.",
      "Burn can be cleansed by specific abilities or by Purifying Flame, otherwise it persists through turns.",
      "Stacks can be transferred to the opponent if an effect such as Purifying Flame succeeds.",
    ],
  },
  {
    id: "purify",
    fallbackName: "Purifying Flame",
    fallbackIcon: "P",
    hero: "Pyromancer utility",
    summary:
      "A defensive blessing that tries to sling one Burn stack back to the attacker before it hurts you.",
    notes: [
      "Triggers during your upkeep if you have both Purifying Flame and at least one Burn stack.",
      "Roll a die: on 4+ you move one Burn stack (and the damage it would deal) to your opponent instead.",
      "Each use consumes one Purifying Flame stack; up to two stacks can be maintained at once.",
      "Even on a failed roll the log explains the outcome so you can plan the next upkeep.",
    ],
  },
];

export function HowToPlayModal({ open, onClose }: HowToPlayModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [flowOpen, setFlowOpen] = useState(true);
  const [activeStatusId, setActiveStatusId] = useState<StatusId>(
    STATUS_DETAILS[0]?.id ?? "chi"
  );

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (closeButtonRef.current) {
      closeButtonRef.current.focus();
    } else {
      dialogRef.current?.focus();
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setFlowOpen(true);
    if (STATUS_DETAILS[0]) {
      setActiveStatusId(STATUS_DETAILS[0].id);
    }
  }, [open]);

  const statusCards = useMemo(
    () =>
      STATUS_DETAILS.map((detail) => {
        const def = getStatus(detail.id);
        return {
          ...detail,
          name: def?.name ?? detail.fallbackName,
          icon: def?.icon ?? detail.fallbackIcon,
        };
      }),
    []
  );

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const activeStatus =
    statusCards.find((status) => status.id === activeStatusId) ??
    statusCards[0];

  if (!open) {
    return null;
  }

  return (
    <div
      className={styles.overlay}
      role='presentation'
      onClick={handleOverlayClick}>
      <div
        className={styles.modal}
        role='dialog'
        aria-modal='true'
        aria-labelledby='howToPlayTitle'
        tabIndex={-1}
        ref={dialogRef}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Quick reference</p>
            <h2 id='howToPlayTitle'>How to Play</h2>
            <p className={styles.lede}>
              Dice Combat is a lightweight recreation of Dice Throne combat.
              Roll for initiative, advance through the standard Dice Throne turn
              windows, and lean on hero-specific status effects to swing each
              round.
            </p>
          </div>
          <button
            type='button'
            className={styles.closeButton}
            onClick={onClose}
            aria-label='Close How to Play'
            ref={closeButtonRef}>
            &times;
          </button>
        </header>

        <section className={styles.section}>
          <button
            type='button'
            className={styles.dropdownToggle}
            onClick={() => setFlowOpen((value) => !value)}
            aria-expanded={flowOpen}
            aria-controls='howToPlayTurnFlow'>
            <span>Turn Flow</span>
            <span className={styles.dropdownIcon}>
              {flowOpen ? "\u2212" : "+"}
            </span>
          </button>
          {flowOpen && (
            <ol id='howToPlayTurnFlow' className={styles.turnList}>
              {TURN_STEPS.map((step) => (
                <li key={step.id} className={styles.turnListItem}>
                  <span className={styles.turnTitle}>{step.title}</span>
                  <span className={styles.turnDetail}>{step.detail}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.section}>
          <h3>Status Effects</h3>
          <div className={styles.statusLayout}>
            <div
              className={styles.statusIconGrid}
              role='tablist'
              aria-label='Status tokens'>
              {statusCards.map((status) => {
                const isActive = status.id === activeStatusId;
                return (
                  <button
                    key={status.id}
                    type='button'
                    role='tab'
                    aria-selected={isActive}
                    className={`${styles.statusIconButton} ${
                      isActive ? styles.statusIconButtonActive : ""
                    }`}
                    onClick={() => setActiveStatusId(status.id)}>
                    <span className={styles.statusIconBadge} aria-hidden='true'>
                      {status.icon}
                    </span>
                    <span className={styles.statusIconLabel}>{status.name}</span>
                  </button>
                );
              })}
            </div>
            {activeStatus && (
              <article
                key={activeStatus.id}
                className={styles.statusDetailCard}
                role='tabpanel'
                aria-live='polite'>
                <div className={styles.statusDetailHeader}>
                  <span className={styles.statusDetailIcon} aria-hidden='true'>
                    {activeStatus.icon}
                  </span>
                  <div>
                    <p className={styles.statusDetailName}>
                      {activeStatus.name}
                    </p>
                    <p className={styles.statusDetailMeta}>
                      {activeStatus.hero}
                    </p>
                  </div>
                </div>
                <p className={styles.statusSummary}>{activeStatus.summary}</p>
                <ul className={styles.statusNotes}>
                  {activeStatus.notes.map((note, index) => (
                    <li key={`${activeStatus.id}-${index}`}>{note}</li>
                  ))}
                </ul>
              </article>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <h3>Status Windows & Tips</h3>
          <ul className={styles.tipList}>
            <li>
              Active statuses (Chi, Evasive) prompt during the roll phase you are
              in. Spend them before resolving attack or defense dice to ensure
              their bonuses apply.
            </li>
            <li>
              Passive statuses (Burn, Purifying Flame) resolve automatically
              during upkeep. Keep an eye on the combat log so you know how many
              stacks remain after each tick.
            </li>
            <li>
              The dice tray highlights when a status can be spent or cleansed.
              Click the glowing token to open the relevant roll helper.
            </li>
            <li>
              When multiple statuses are queued, their order follows official
              Dice Throne timing: upkeep damage first, then transfers/cleanses,
              then turn-end checks.
            </li>
          </ul>
          <p className={styles.reference}>
            Reference adapted from the official Dice Throne token guide.&nbsp;
            <a
              href='https://dice-throne.rulepop.com/#tokens'
              target='_blank'
              rel='noreferrer'>
              View full token descriptions
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}

export default HowToPlayModal;
