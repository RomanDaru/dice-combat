import { describe, expect, it } from 'vitest';
import { resolvePassTurn } from '../flow/turnEnd';

describe('resolvePassTurn', () => {
  it('produces TURN_END event with AI follow-up for player pass', () => {
    const resolution = resolvePassTurn({
      side: 'you',
      message: '[Turn] Pyromancer ends the turn.',
    });

    expect(resolution.logs).toEqual(['[Turn] Pyromancer ends the turn.']);
    expect(resolution.nextSide).toBe('ai');
    expect(resolution.nextPhase).toBe('end');
    expect(resolution.events).toHaveLength(1);

    const [event] = resolution.events;
    expect(event.type).toBe('TURN_END');
    expect(event.payload).toMatchObject({ next: 'ai', prePhase: 'end', delayMs: 0 });
    expect(event.followUp).toBe('trigger_ai_turn');
  });

  it('omits follow-up when AI passes to the player', () => {
    const resolution = resolvePassTurn({ side: 'ai', delayMs: 600 });

    expect(resolution.logs).toEqual([]);
    expect(resolution.nextSide).toBe('you');
    expect(resolution.events[0].payload.delayMs).toBe(600);
    expect(resolution.events[0].followUp).toBeUndefined();
  });
});
