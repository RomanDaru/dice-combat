import React from "react";
import clsx from "clsx";
import LargeBg from "../assets/Main_Btn_Large.png";
import MediumBg from "../assets/Main_Btn_Medium.png";
import SquareBg from "../assets/Square_Btn_96.png";
import styles from "./ArtButton.module.css";

type ArtButtonVariant = "large" | "medium" | "square";

type ArtButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ArtButtonVariant;
  /**
   * When falsey, renders button with text but hides surface image.
   * Useful for debugging or future theme swaps.
   */
  withBackground?: boolean;
};

const VARIANT_IMAGE: Record<ArtButtonVariant, string> = {
  large: LargeBg,
  medium: MediumBg,
  square: SquareBg,
};

export function ArtButton({
  className,
  variant = "medium",
  withBackground = true,
  children,
  ...rest
}: ArtButtonProps) {
  const backgroundImage = withBackground ? VARIANT_IMAGE[variant] : undefined;

  return (
    <button
      type='button'
      className={clsx(styles.btn, styles[variant], className)}
      style={
        backgroundImage
          ? { backgroundImage: `url(${backgroundImage})` }
          : undefined
      }
      {...rest}>
      <span className={styles.content}>{children}</span>
    </button>
  );
}

export default ArtButton;
