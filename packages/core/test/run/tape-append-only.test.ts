/** The tape law: a sealed turn's bytes are written once and never edited again.
 *  What a turn carries is decided when it seals; no later turn may rewrite it.
 *  A retention rule shaped as "the last N turns" is a rewrite rule — it deletes
 *  record lines from bytes the model already read, and everything behind the
 *  deletion has to be read again. */
import { test, expect } from 'vitest';
import type { StepInput } from '../../src/contract/vocabulary.js';
import { payingDesk, callStep, finishStep } from '../fixtures/scripted-model.js';
import { testEngine } from '../fixtures/compiled-agents.js';

const IDS = ['bk_1', 'bk_2', 'bk_3', 'bk_4', 'bk_5'] as const;

/** One read act and a finish that states the id back, per turn. */
function readingScript() {
  return payingDesk(IDS.flatMap(id => [
    callStep('getBooking', { id }),
    finishStep(`Booking ${id} is room 12 on Tuesday.`,
      [{ tool: 'getBooking', target: id, word: 'done' }])
  ]));
}

/** The assistant messages of one window, oldest first — one per sealed turn. */
function assistantTexts(input: StepInput): readonly string[] {
  return input.messages.filter(m => m.role === 'assistant').map(m => m.text);
}

/** The window each turn opened with, turn 1 first. */
async function windowsOverFiveTurns(): Promise<readonly (readonly string[])[]> {
  const model = readingScript();
  const { engine } = testEngine({ model });
  const windows: (readonly string[])[] = [];
  for (const id of IDS) {
    const before = model.seen.length;
    await engine.chat('s1', `read ${id}`);
    windows.push(assistantTexts(model.seen[before]));
  }
  return windows;
}

test('a sealed turn reads the same in every later window, byte for byte', async () => {
  const windows = await windowsOverFiveTurns();

  // Turn 1 is first visible in the window turn 2 opened. From there on its bytes
  // are frozen: turns 3, 4 and 5 must show that exact assistant message.
  const turnOne = windows[1][0];
  expect(turnOne).toContain('getBooking(bk_1) — done');
  for (const later of [2, 3, 4]) expect(windows[later][0]).toBe(turnOne);

  // And the same for turn 2, first visible at turn 3.
  const turnTwo = windows[2][1];
  for (const later of [3, 4]) expect(windows[later][1]).toBe(turnTwo);
});

test('every sealed turn states what it ran, not only the newest two', async () => {
  const windows = await windowsOverFiveTurns();
  const last = windows[4];

  expect(last).toHaveLength(4);
  for (const [i, id] of IDS.slice(0, 4).entries()) {
    expect(last[i]).toBe(`Booking ${id} is room 12 on Tuesday.\ngetBooking(${id}) — done`);
  }
});
