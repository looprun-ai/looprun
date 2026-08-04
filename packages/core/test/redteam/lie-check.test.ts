/**
 * RED TEAM — THE OPERATION RECORD AND THE LIE CHECK.
 *
 * The algorithm, whole:
 *
 * ```
 *   no action was carried out this turn  →  run the lie check
 *       lie detected                     →  rewrite the prose
 *       no lie detected                  →  deliver the prose as it stands
 *
 *   any action was carried out           →  deliver the prose as it stands
 * ```
 *
 * Four ways that algorithm can go wrong, and each one gets a test that fails if it ever does:
 *
 * ```
 *   1  the check runs on a turn where an action WAS carried out
 *   2  a detected lie is not rewritten, so the lie ships
 *   3  an unchecked turn does not deliver the message and the record as they are
 *   4  a truth is detected as a lie
 * ```
 *
 * Plus two invariants that are easy to break without noticing: a finalized turn with no record at all,
 * and the session list reaching the text the user reads.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase } from '../../src/index.js';
import type { AgentWorld, DomainContract } from '../../src/index.js';
import {
  RECORD_CLOSURE_NONE,
  RECORD_CLOSURE_SOME,
  SESSION_HEADING,
  sessionRecord,
} from '../../src/internal.js';
import type { Intention, Judge } from '../../src/internal.js';
import type { HistoryTurn } from '../../src/rules.js';
import { createLedger, recordToolResult, recordTurnHistory } from '../../src/runtime/ledger.js';
import { finalizeReply } from '../../src/runtime/turn.js';

// ── harness ────────────────────────────────────────────────────────────────────────────────────────

function fixtureWorld(): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] };
}

const CONTRACT: DomainContract = {
  voice: 'v', stateBlock: () => '', coreInvariants: ['x'], languageClause: 'lang',
  writeTools: ['cancelEvent'],
};

const specOf = (): AgentSpecBase =>
  new AgentSpecBase({ id: 'lie-check', mode: 'M', persona: 'p', tools: ['cancelEvent'], contract: CONTRACT });

/** A write that TOOK EFFECT, aligned across the world ledger and the observed entry. */
function effectWrite(ledger: ReturnType<typeof createLedger>, world: AgentWorld, label: string): void {
  const args = { eventId: label };
  world.toolCalls.push({ name: 'cancelEvent', args, result: { id: label, label }, tookEffect: true });
  recordToolResult(ledger, 'cancelEvent', args, { id: label, label }, world);
}

/** A judge that records every prompt it is handed and answers from a queue. */
function recordingJudge(answers: string[]): { judge: Judge; prompts: string[] } {
  const prompts: string[] = [];
  let i = 0;
  return {
    prompts,
    judge: async (prompt: string) => {
      prompts.push(prompt);
      return answers[Math.min(i++, answers.length - 1)] ?? 'NO';
    },
  };
}

/** The lie every prose vector uses — an operation the turn never carried out. */
const LIE = 'Done — I cancelled your dentist appointment on 2026-03-03 at 09:00.';
const REWRITE = 'I have not cancelled the dentist appointment on 2026-03-03 at 09:00. Shall I do it now?';

const P = (message: string, did: Intention[] = [{ op: 'inform' }]) => ({ message, did });

const run = (
  ledger: ReturnType<typeof createLedger>,
  world: AgentWorld,
  payload: { message: string; did: Intention[] },
  judge?: Judge,
) => finalizeReply(specOf(), CONTRACT, world, ledger, payload, async () => payload, 0, judge);

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// FAILURE MODE 1 — the check runs on a turn where an action WAS carried out
//
// A rewriter handed a record that NAMES an operation anchors to that entity and leaves every other
// claim standing, so a turn that did something must never reach the check at all. This is not a
// preference the model can be talked out of: eligibility is computed from the record's action lines.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('MODE 1 — an action was carried out, so the check must not run', () => {
  it('IMPOSSIBLE: a turn whose record names an operation makes ZERO judge calls', async () => {
    const world = fixtureWorld();
    const ledger = createLedger();
    effectWrite(ledger, world, 'EV-2');
    const { judge, prompts } = recordingJudge(['YES', REWRITE]);
    const did: Intention[] = [{ op: 'cancel', target: 'EV-2', outcome: 'success' }];

    const out = await run(ledger, world, { message: LIE, did }, judge);

    expect(prompts).toEqual([]);
    expect(out.text).toBe(`${LIE}\n\nEV-2: done\n${RECORD_CLOSURE_SOME}`);
  });

  it('IMPOSSIBLE: a NON-success action line is still an action line — a blocked turn is not checked', async () => {
    const { judge, prompts } = recordingJudge(['YES', REWRITE]);
    const did: Intention[] = [{ op: 'cancel', target: 'EV-2', outcome: 'blocked' }];

    await run(createLedger(), fixtureWorld(), { message: LIE, did }, judge);

    expect(prompts).toEqual([]);
  });

  it('CONTROL: a speech-only turn IS checked — exactly one judge call when the answer is no', async () => {
    const { judge, prompts } = recordingJudge(['NO']);

    await run(createLedger(), fixtureWorld(), P(LIE), judge);

    expect(prompts).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// FAILURE MODE 2 — a detected lie is not rewritten
//
// The most consequential of the four: the check paid for the call, found the lie, and the lie shipped
// anyway. What comes back from the rewriter is what goes out — it is not re-checked, and there is no
// path that discards it.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('MODE 2 — a detected lie must be rewritten, and the rewrite must ship', () => {
  it('IMPOSSIBLE: YES → the delivered prose is the rewrite, and the lie is gone', async () => {
    const { judge } = recordingJudge(['YES', REWRITE]);

    const out = await run(createLedger(), fixtureWorld(), P(LIE), judge);

    expect(out.text).toBe(`${REWRITE}\n\n${RECORD_CLOSURE_NONE}`);
    expect(out.text).not.toContain(LIE);
  });

  it('the rewrite touches the PROSE only — the verified declaration is delivered untouched', async () => {
    const { judge } = recordingJudge(['YES', REWRITE]);
    const ledger = createLedger();
    const did: Intention[] = [{ op: 'inform' }];

    const out = await run(ledger, fixtureWorld(), { message: LIE, did }, judge);

    expect(out.did).toEqual(did);
    expect(ledger.did).toEqual(did);
    expect(ledger.turnCorrections).toContain('lie-check:rewritten');
  });

  it('an empty rewrite is not a delivery — the original stands under the record that denies it', async () => {
    const { judge } = recordingJudge(['YES', '   ']);

    const out = await run(createLedger(), fixtureWorld(), P(LIE), judge);

    expect(out.text).toBe(`${LIE}\n\n${RECORD_CLOSURE_NONE}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// FAILURE MODE 3 — an unchecked turn does not deliver the message and the record as they are
//
// Every path that is not "eligible and fired" must deliver exactly what the turn produced: the agent's
// own prose, then the engine's record. Nothing is dropped, nothing is added, nothing is reworded.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('MODE 3 — every other turn delivers the message and the record as they are', () => {
  it('IMPOSSIBLE: NO → the original prose, unaltered, under the record', async () => {
    const honest = 'The dentist appointment is still on your calendar. Shall I cancel it?';
    const { judge } = recordingJudge(['NO']);

    const out = await run(createLedger(), fixtureWorld(), P(honest), judge);

    expect(out.text).toBe(`${honest}\n\n${RECORD_CLOSURE_NONE}`);
  });

  it('IMPOSSIBLE: NO JUDGE → the same delivery, and no throw', async () => {
    const out = await run(createLedger(), fixtureWorld(), P(LIE));

    expect(out.text).toBe(`${LIE}\n\n${RECORD_CLOSURE_NONE}`);
    expect(out.exhausted).toBe(false);
  });

  it('IMPOSSIBLE: a judge that THROWS delivers what the turn had — a broken endpoint rewrites nothing', async () => {
    const throwing: Judge = async () => {
      throw new Error('judge unreachable');
    };

    const out = await run(createLedger(), fixtureWorld(), P(LIE), throwing);

    expect(out.text).toBe(`${LIE}\n\n${RECORD_CLOSURE_NONE}`);
  });

  it('IMPOSSIBLE: a judge that answers neither word is read as NO — the safe direction', async () => {
    const { judge } = recordingJudge(['I am not sure what you are asking.']);

    const out = await run(createLedger(), fixtureWorld(), P(LIE), judge);

    expect(out.text).toBe(`${LIE}\n\n${RECORD_CLOSURE_NONE}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// FAILURE MODE 4 — a truth is detected as a lie
//
// The shape that produces it: a reply that truthfully reports what an EARLIER turn did, read against a
// record scoped to THIS turn. The session list is what stops it — and a rewrite triggered here does
// not merely waste a call, it can deny something the world really did.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('MODE 4 — what an earlier turn did is shown to the check', () => {
  it('the session list carries the earlier turn\'s entity into both prompts', async () => {
    const world = fixtureWorld();
    const ledger = createLedger();
    effectWrite(ledger, world, 'Lunch with Marina');
    ledger.did = [{ op: 'cancel', target: 'Lunch with Marina', outcome: 'success' }];
    recordTurnHistory(ledger, 'Cancelled.', world);
    ledger.turnIndex = 1;
    ledger.did = [];

    const { judge, prompts } = recordingJudge(['NO']);
    await run(ledger, world, P('Your lunch with Marina was cancelled.'), judge);

    expect(prompts[0]).toContain(SESSION_HEADING);
    expect(prompts[0]).toContain('Lunch with Marina: done');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// INVARIANT A — a finalized turn always carries the record
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('INVARIANT — the record is never absent from a finalized turn', () => {
  it('IMPOSSIBLE: a speech-only turn, a rewritten turn and an acting turn all carry a record', async () => {
    const speech = await run(createLedger(), fixtureWorld(), P('Hello.'));

    const { judge } = recordingJudge(['YES', REWRITE]);
    const rewritten = await run(createLedger(), fixtureWorld(), P(LIE), judge);

    const world = fixtureWorld();
    const ledger = createLedger();
    effectWrite(ledger, world, 'EV-2');
    const acting = await run(ledger, world, { message: 'Done.', did: [{ op: 'cancel', target: 'EV-2', outcome: 'success' }] });

    expect(speech.text.endsWith(RECORD_CLOSURE_NONE)).toBe(true);
    expect(rewritten.text.endsWith(RECORD_CLOSURE_NONE)).toBe(true);
    expect(acting.text.endsWith(RECORD_CLOSURE_SOME)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// INVARIANT B — the session list is input, never output
//
// Two consumers, two views: the check and the rewriter see what the whole session did; the user sees
// what THIS turn did. A session line in the delivered text would tell the user an earlier turn's
// action happened again, on this one.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('INVARIANT — the session list never reaches the delivered text', () => {
  it('IMPOSSIBLE: neither the heading nor an earlier turn\'s line appears in the delivery', async () => {
    const world = fixtureWorld();
    const ledger = createLedger();
    effectWrite(ledger, world, 'Lunch with Marina');
    ledger.did = [{ op: 'cancel', target: 'Lunch with Marina', outcome: 'success' }];
    recordTurnHistory(ledger, 'Cancelled.', world);
    ledger.turnIndex = 1;
    ledger.did = [];

    const { judge } = recordingJudge(['YES', REWRITE]);
    const out = await run(ledger, world, P('Thanks!'), judge);

    expect(out.text).not.toContain(SESSION_HEADING);
    expect(out.text).not.toContain('Lunch with Marina');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE SESSION LIST — one line per DISTINCT ENTITY, its latest state, over the whole session
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('the session list', () => {
  const turnWith = (turnIndex: number, did: Intention[]): HistoryTurn =>
    ({ turnIndex, userText: 'u', reply: 'r', toolCalls: [], did, attemptedCalls: [], guardEvents: [] });

  it('folds three writes on ONE entity into one line, carrying the latest state', () => {
    const list = sessionRecord([
      turnWith(0, [{ op: 'cancel', target: 'EV-2', outcome: 'success' }]),
      turnWith(1, [{ op: 'cancel', target: 'EV-2', outcome: 'success' }]),
      turnWith(2, [{ op: 'cancel', target: 'EV-2', outcome: 'success' }]),
    ]);

    expect(list.lines).toEqual(['EV-2: done']);
  });

  it('keeps three DISTINCT entities apart, in first-touched order', () => {
    const list = sessionRecord([
      turnWith(0, [{ op: 'cancel', target: 'EV-2', outcome: 'success' }]),
      turnWith(1, [{ op: 'cancel', target: 'EV-9', outcome: 'success' }]),
      turnWith(2, [{ op: 'cancel', target: 'EV-4', outcome: 'success' }]),
    ]);

    expect(list.lines).toEqual(['EV-2: done', 'EV-9: done', 'EV-4: done']);
  });

  it('is empty when nothing was carried out, and prints no heading', () => {
    const list = sessionRecord([turnWith(0, [{ op: 'inform' }])]);

    expect(list.lines).toEqual([]);
    expect(list.hasEntries).toBe(false);
    expect(list.text).toBe('');
  });

  it('carries SUCCESS only — a blocked attempt would silence the check on the very claim it catches', () => {
    const list = sessionRecord([
      turnWith(0, [{ op: 'cancel', target: 'EV-2', outcome: 'blocked' }]),
      turnWith(1, [{ op: 'cancel', target: 'EV-9', outcome: 'failure' }]),
      turnWith(2, [{ op: 'cancel', target: 'EV-4', outcome: 'success' }]),
    ]);

    expect(list.lines).toEqual(['EV-4: done']);
  });

  it('folds one entity written under two spellings into one line, showing the latest', () => {
    const list = sessionRecord([
      turnWith(0, [{ op: 'cancel', target: 'ev-2', outcome: 'success' }]),
      turnWith(1, [{ op: 'cancel', target: 'EV-2', outcome: 'success' }]),
    ]);

    expect(list.lines).toEqual(['EV-2: done']);
  });
});
