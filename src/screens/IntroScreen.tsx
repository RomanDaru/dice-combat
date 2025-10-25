import React from "react";

type IntroScreenProps = {
  onBegin: () => void;
};

export function IntroScreen({ onBegin }: IntroScreenProps) {
  return (
    <div className='welcome-screen phase-intro'>
      <div className='welcome-heading'>Fantasy Dice Combat</div>
      <div className='welcome-body'>
        <p className='welcome-subtext'>Prepare for battle!</p>
        <div className='welcome-action'>
          <button type='button' className='welcome-primary' onClick={onBegin}>
            Select Hero
          </button>
        </div>
      </div>
    </div>
  );
}
