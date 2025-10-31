import React from "react";
import IntroVideo from "../assets/IntroBackground_Animated.mp4";
import IntroPoster from "../assets/IntroScreen.jpg";
import { ArtButton } from "../components/ArtButton";

type IntroScreenProps = {
  onBegin: () => void;
};

export function IntroScreen({ onBegin }: IntroScreenProps) {
  return (
    <div className='welcome-screen phase-intro'>
      <video
        className='welcome-bg-video'
        autoPlay
        muted
        loop
        playsInline
        poster={IntroPoster}>
        <source src={IntroVideo} type='video/mp4' />
      </video>
      <div className='welcome-overlay'>
        <div className='welcome-heading'>Fantasy Dice Combat</div>
        <div className='welcome-body'>
          <p className='welcome-subtext'>Prepare for battle!</p>
          <div className='welcome-action'>
            <ArtButton
              variant='large'
              className='welcome-primary'
              onClick={onBegin}>
              Select Hero
            </ArtButton>
          </div>
        </div>
      </div>
    </div>
  );
}
