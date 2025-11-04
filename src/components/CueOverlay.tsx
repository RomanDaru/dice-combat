import React, { useEffect, useState } from "react";
import clsx from "clsx";
import type { ActiveCue } from "../hooks/useTurnController";
import styles from "./CueOverlay.module.css";

type CueOverlayProps = {
  cue: ActiveCue;
};

export const CueOverlay = ({ cue }: CueOverlayProps) => {
  const iconSrc = cue.icon ?? null;
  const bannerSrc = cue.banner ?? null;
  const kindClass = styles[`kind-${cue.kind}`] ?? styles["kind-turn"];
  const repeat = cue.repeat ?? 1;
  const ariaLive = cue.kind === "status" ? "polite" : "assertive";
  const showProgress = cue.kind === "turn" && cue.durationMs > 0;
  const [progress, setProgress] = useState(() => {
    if (!showProgress) return 1;
    const total = Math.max(1, cue.endsAt - cue.startedAt);
    return Math.min(1, Math.max(0, (Date.now() - cue.startedAt) / total));
  });
  const [timeLeft, setTimeLeft] = useState(() =>
    showProgress ? Math.max(0, cue.endsAt - Date.now()) : 0
  );

  useEffect(() => {
    if (!showProgress) {
      setProgress(1);
      setTimeLeft(0);
      return;
    }
    if (typeof window === "undefined") {
      setProgress(1);
      setTimeLeft(0);
      return;
    }

    const raf =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : ((cb: FrameRequestCallback) =>
            window.setTimeout(() => cb(Date.now()), 16)) as typeof window.requestAnimationFrame;

    const caf =
      typeof window.cancelAnimationFrame === "function"
        ? window.cancelAnimationFrame.bind(window)
        : window.clearTimeout.bind(window);

    let frame: number | ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      const now = Date.now();
      const total = Math.max(1, cue.endsAt - cue.startedAt);
      const nextProgress = Math.min(1, Math.max(0, (now - cue.startedAt) / total));
      setProgress(nextProgress);
      setTimeLeft(Math.max(0, cue.endsAt - now));
      if (nextProgress < 1) {
        frame = raf(tick);
      }
    };

    tick();

    return () => {
      if (frame !== null) {
        caf(frame as number);
      }
    };
  }, [cue.endsAt, cue.startedAt, cue.durationMs, cue.id, showProgress]);

  const countdownLabel =
    showProgress && timeLeft > 0
      ? `${(Math.ceil(timeLeft / 100) / 10).toFixed(1)}s`
      : "Ready";

  return (
    <div className={styles.overlay}>
      <div
        className={clsx(styles.card, kindClass)}
        role='status'
        aria-live={ariaLive}
        aria-atomic='true'>
        {bannerSrc && (
          <div
            className={styles.banner}
            style={{ backgroundImage: `url(${bannerSrc})` }}
          />
        )}
        <div className={styles.body}>
          {iconSrc && (
            <div className={styles.iconWrap}>
              <img src={iconSrc} alt='' className={styles.icon} />
            </div>
          )}
          <div className={styles.text}>
            <span className={styles.title}>{cue.title}</span>
            {cue.subtitle && <span className={styles.subtitle}>{cue.subtitle}</span>}
            {cue.cta && <span className={styles.cta}>{cue.cta}</span>}
            {showProgress && (
              <span className={styles.srOnly}>
                {countdownLabel === "Ready"
                  ? "Transition complete"
                  : `${countdownLabel} remaining`}
              </span>
            )}
          </div>
          {repeat > 1 && (
            <span className={styles.repeatBadge} aria-label={`${repeat} times`}>
              ×{repeat}
            </span>
          )}
        </div>
        {showProgress && (
          <div className={styles.progress} aria-hidden='true'>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ transform: `scaleX(${progress})` }}
              />
            </div>
            <span className={styles.progressLabel}>{countdownLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
};
