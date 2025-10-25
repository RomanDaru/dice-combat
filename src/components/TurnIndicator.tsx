import React from "react";
import type { Side } from "../game/types";

type TurnIndicatorProps = {
  turn: Side;
};

export function TurnIndicator({ turn }: TurnIndicatorProps) {
  const youActive = turn === "you";
  const aiActive = turn === "ai";

  return (
    <div className='row grid-2'>
      <div
        className='card'
        style={{
          padding: 12,
          borderColor: youActive ? "#059669" : "#27272a",
          background: youActive ? "rgba(6,78,59,.3)" : undefined,
        }}>
        Tvoje kolo
      </div>
      <div
        className='card'
        style={{
          padding: 12,
          borderColor: aiActive ? "#4338ca" : "#27272a",
          background: aiActive ? "rgba(49,46,129,.3)" : undefined,
        }}>
        AI kolo
      </div>
    </div>
  );
}

