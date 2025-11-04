import React from "react";
import clsx from "clsx";
import type { ActiveCue } from "../hooks/useTurnController";
import styles from "./CueOverlay.module.css";

type CueOverlayProps = {
  cue: ActiveCue;
};

export const CueOverlay = ({ cue }: CueOverlayProps) => {
  const iconSrc = cue.icon ?? null;
  const kindClass = styles[`kind-${cue.kind}`] ?? styles["kind-turn"];

  return (
    <div className={styles.overlay} role='status' aria-live='assertive'>
      <div className={clsx(styles.card, kindClass)}>
        {iconSrc && (
          <div className={styles.iconWrap}>
            <img src={iconSrc} alt='' className={styles.icon} />
          </div>
        )}
        <div className={styles.text}>
          <span className={styles.title}>{cue.title}</span>
          {cue.subtitle && <span className={styles.subtitle}>{cue.subtitle}</span>}
        </div>
      </div>
    </div>
  );
};

