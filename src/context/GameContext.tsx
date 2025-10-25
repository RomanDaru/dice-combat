import { createContext, useContext } from "react";
import { GameAction, GameState } from "../game/state";

export type GameContextType = {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
};

export const GameContext = createContext<GameContextType | undefined>(
  undefined
);

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error("useGame must be used within a GameProvider");
  }
  return context;
};

