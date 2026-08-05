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
  SESSION_HEADING,
  operationRecord,
  sessionRecord,
} from '../../src/internal.js';
import type { Intention, Judge } from '../../src/internal.js';
import type { HistoryTurn } from '../../src/rules.js';
import { DEFAULT_ENGINE_TEXT } from '../../src/runtime/engine-text.js';
import { createLedger, recordToolResult, recordTurnHistory } from '../../src/runtime/ledger.js';
import { composeDeliveryText, finalizeReply } from '../../src/runtime/turn.js';

const RECORD_CLOSURE_SOME = DEFAULT_ENGINE_TEXT.recordClosureSome;
const RECORD_CLOSURE_NONE = DEFAULT_ENGINE_TEXT.recordClosureNone;

// ── harness ────────────────────────────────────────────────────────────────────────────────────────

function fixtureWorld(): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] };
}

const CONTRACT: DomainContract = {
  voice: 'v', stateBlock: () => '', coreInvariants: ['x'], languageClause: 'lang',
  writeTools: ['cancelEvent'],
};

const specOf = (): AgentSpecBase =>
  new AgentSpecBase({ id: 'lie-check', mode: 'M', persona: 'p', tools: ['cancelEvent', 'getEvent'], contract: CONTRACT });

/** A write that TOOK EFFECT, aligned across the world ledger and the observed entry. */
function effectWrite(ledger: ReturnType<typeof createLedger>, world: AgentWorld, label: string): void {
  const args = { eventId: label };
  world.toolCalls.push({ name: 'cancelEvent', args, result: { id: label, label }, tookEffect: true });
  recordToolResult(ledger, 'cancelEvent', args, { id: label, label }, world);
}

/** A call the world RAN, with the result it returned — the evidence a non-success claim grounds on. */
function landCall(
  ledger: ReturnType<typeof createLedger>,
  world: AgentWorld,
  name: string,
  result: Record<string, unknown>,
): void {
  const args = { eventId: 'EV-2' };
  world.toolCalls.push({ name, args, result, tookEffect: false });
  recordToolResult(ledger, name, args, result, world);
}

/** A judge that records every prompt it is handed and answers from a queue. */
function recordingJudge(answers: string[]): { judge: Judge; prompts: string[] } {
  const prompts: string[] = [];
  let i = 0;
  return {
    prompts,
    judge: async (prompt: string) => {
      prompts.push(prompt);
      return answers[Math.min(i++, answers.length - 1)] ?? 'NONE';
    },
  };
}

/** The lie every prose vector uses — an operation the turn never carried out. */
const LIE = 'Done — I cancelled your dentist appointment on 2026-03-03 at 09:00.';
const REWRITE = 'I have not cancelled the dentist appointment on 2026-03-03 at 09:00. Shall I do it now?';
/** The check's affirmative answer — the envelope's own VIOLATION verdict, never a bare YES. */
const FIRES = 'VIOLATION: the reader would believe an operation that never happened.';

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
    const { judge, prompts } = recordingJudge([FIRES, REWRITE]);
    const did: Intention[] = [{ op: 'cancel', target: 'EV-2', outcome: 'success' }];

    const out = await run(ledger, world, { message: LIE, did }, judge);

    expect(prompts).toEqual([]);
    expect(out.text).toBe(`${LIE}\n\nEV-2: done\n${RECORD_CLOSURE_SOME}`);
  });

  it('IMPOSSIBLE: a NON-success action line is still an action line — a blocked turn is not checked', async () => {
    const { judge, prompts } = recordingJudge([FIRES, REWRITE]);
    const did: Intention[] = [{ op: 'cancel', target: 'EV-2', outcome: 'blocked' }];

    await run(createLedger(), fixtureWorld(), { message: LIE, did }, judge);

    expect(prompts).toEqual([]);
  });

  it('CONTROL: a speech-only turn IS checked — exactly one judge call when the answer is no', async () => {
    const { judge, prompts } = recordingJudge(['NONE']);

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
  it('IMPOSSIBLE: VIOLATION → the delivered prose is the rewrite, and the lie is gone', async () => {
    const { judge } = recordingJudge([FIRES, REWRITE]);

    const out = await run(createLedger(), fixtureWorld(), P(LIE), judge);

    expect(out.text).toBe(`${REWRITE}\n\n${RECORD_CLOSURE_NONE}`);
    expect(out.text).not.toContain(LIE);
  });

  it('the rewrite touches the PROSE only — the verified declaration is delivered untouched', async () => {
    const { judge } = recordingJudge([FIRES, REWRITE]);
    const ledger = createLedger();
    const did: Intention[] = [{ op: 'inform' }];

    const out = await run(ledger, fixtureWorld(), { message: LIE, did }, judge);

    expect(out.did).toEqual(did);
    expect(ledger.did).toEqual(did);
    expect(ledger.turnCorrections).toContain('lie-check:rewritten');
  });

  it('an empty rewrite is not a delivery — the original stands under the record that denies it', async () => {
    const { judge } = recordingJudge([FIRES, '   ']);

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
  it('IMPOSSIBLE: NONE → the original prose, unaltered, under the record', async () => {
    const honest = 'The dentist appointment is still on your calendar. Shall I cancel it?';
    const { judge } = recordingJudge(['NONE']);

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

  it('IMPOSSIBLE: a judge that answers no readable verdict is read as NONE — the safe direction', async () => {
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

    const { judge, prompts } = recordingJudge(['NONE']);
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

    const { judge } = recordingJudge([FIRES, REWRITE]);
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

    const { judge } = recordingJudge([FIRES, REWRITE]);
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

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE WHOLE INPUT SPACE — the four failure modes, counted over every combination
//
// The algorithm has five inputs and each one has a small, enumerable set of shapes. Their product is
// the space the algorithm has to be right on, so it is swept rather than sampled: every cell runs a
// real `finalizeReply` and is scored on the four ways it can go wrong.
//
// ```
//   F1  the check ran on a turn that carried out an action
//   F2  the check ran without being shown what the session had already done
//   F3  the check found a lie, a usable rewrite came back, and the original still shipped
//   F4  no rewrite happened and the delivery was not exactly the message and the record
// ```
//
// F2 is the ENGINE's half of "a truth read as a lie". Whether the model then answers correctly is the
// model's half and no test can assert it; what the engine owes is that the question always carries the
// session's own account, so a reply about an earlier turn's action has something to be true against.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

type Ledger = ReturnType<typeof createLedger>;

/**
 * What the turn carried out — the axis eligibility is computed from. Each row carries the LEDGER
 * EVIDENCE its declaration needs, so every cell reaches the algorithm instead of stopping at the
 * cross-check: an ungrounded declaration is a different mechanism's job, and a sweep full of them
 * would be measuring that one.
 */
const DECLARATIONS: Array<{ id: string; did: Intention[]; seed: (l: Ledger, w: AgentWorld) => void }> = [
  { id: 'speech:inform', did: [{ op: 'inform' }], seed: () => {} },
  { id: 'speech:greet', did: [{ op: 'greet' }], seed: () => {} },
  { id: 'speech:refuse', did: [{ op: 'refuse' }], seed: () => {} },
  { id: 'speech:ask', did: [{ op: 'ask' }], seed: () => {} },
  {
    id: 'action:success',
    did: [{ op: 'cancel', target: 'EV-2', outcome: 'success' }],
    seed: (l, w) => effectWrite(l, w, 'EV-2'),
  },
  {
    id: 'action:blocked',
    did: [{ op: 'cancel', target: 'EV-2', outcome: 'blocked' }],
    seed: (l) => { l.attemptedCalls.push({ name: 'cancelEvent', args: { eventId: 'EV-2' } }); },
  },
  {
    id: 'action:failure',
    did: [{ op: 'cancel', target: 'EV-2', outcome: 'failure' }],
    seed: (l, w) => landCall(l, w, 'cancelEvent', { success: false, error: 'nope' }),
  },
  {
    id: 'action:not_found',
    did: [{ op: 'lookup', target: 'EV-2', outcome: 'not_found' }],
    seed: (l, w) => landCall(l, w, 'getEvent', { found: false, data: [] }),
  },
  {
    id: 'action:pending',
    did: [{ op: 'cancel', target: 'EV-2', outcome: 'pending_confirmation' }],
    seed: (l, w) => landCall(l, w, 'cancelEvent', { requiresConfirmation: true, id: 'EV-2' }),
  },
  {
    id: 'action:no_op',
    did: [{ op: 'cancel', target: 'EV-2', outcome: 'no_op' }],
    seed: (l, w) => landCall(l, w, 'cancelEvent', { id: 'EV-2', unchanged: true }),
  },
  {
    id: 'action:two-writes',
    did: [
      { op: 'cancel', target: 'EV-2', outcome: 'success' },
      { op: 'cancel', target: 'EV-9', outcome: 'success' },
    ],
    seed: (l, w) => { effectWrite(l, w, 'EV-2'); effectWrite(l, w, 'EV-9'); },
  },
  {
    id: 'mixed:action+speech',
    did: [{ op: 'cancel', target: 'EV-2', outcome: 'success' }, { op: 'inform' }],
    seed: (l, w) => effectWrite(l, w, 'EV-2'),
  },
];

/** What the model answers, and what comes back when it is asked to rewrite. */
const JUDGES: Array<{ id: string; answers?: string[]; throws?: boolean; absent?: boolean }> = [
  { id: 'judge:none', absent: true },
  { id: 'judge:no', answers: ['NONE'] },
  { id: 'judge:violation+rewrite', answers: [FIRES, REWRITE] },
  { id: 'judge:violation+empty', answers: [FIRES, ''] },
  { id: 'judge:violation+blank', answers: [FIRES, '   \n  '] },
  { id: 'judge:lowercase-violation', answers: ['violation: the reader would believe it.', REWRITE] },
  { id: 'judge:prose', answers: ['I am not sure what you are asking.'] },
  { id: 'judge:empty', answers: [''] },
  { id: 'judge:throws', throws: true },
];

/** What the session had already carried out before this turn. */
const SESSIONS: Array<{ id: string; entities: string[] }> = [
  { id: 'session:none', entities: [] },
  { id: 'session:one', entities: ['Lunch with Marina'] },
  { id: 'session:three', entities: ['Lunch with Marina', 'Dentist', 'Standup'] },
];

/** What the prose says. */
const MESSAGES: Array<{ id: string; text: string }> = [
  { id: 'msg:lie', text: LIE },
  { id: 'msg:earlier-truth', text: 'Your lunch with Marina was cancelled, as you asked.' },
  { id: 'msg:honest-refusal', text: 'I have not cancelled anything. Shall I?' },
  { id: 'msg:question', text: 'Which appointment should I cancel?' },
];

describe('THE WHOLE INPUT SPACE — the four failure modes over every combination', () => {
  it('sweeps every cell and counts zero of each', async () => {
    const failures = { F1: [] as string[], F2: [] as string[], F3: [] as string[], F4: [] as string[] };
    const exhausted: string[] = [];
    let cells = 0;
    let checked = 0;
    let rewritten = 0;

    for (const decl of DECLARATIONS) {
      for (const j of JUDGES) {
        for (const sess of SESSIONS) {
          for (const msg of MESSAGES) {
            cells += 1;
            const cell = `${decl.id} · ${j.id} · ${sess.id} · ${msg.id}`;

            const world = fixtureWorld();
            const ledger = createLedger();
            // The SESSION: one completed turn per entity it already carried out.
            for (const entity of sess.entities) {
              effectWrite(ledger, world, entity);
              ledger.did = [{ op: 'cancel', target: entity, outcome: 'success' }];
              recordTurnHistory(ledger, 'Cancelled.', world);
              ledger.turnIndex += 1;
            }
            ledger.did = [];
            // THIS turn's evidence, so the declaration grounds and the cell reaches the algorithm.
            decl.seed(ledger, world);

            const prompts: string[] = [];
            let judge: Judge | undefined;
            if (!j.absent) {
              let i = 0;
              judge = async (prompt: string) => {
                prompts.push(prompt);
                if (j.throws) throw new Error('judge unreachable');
                return j.answers![Math.min(i++, j.answers!.length - 1)];
              };
            }

            const payload = { message: msg.text, did: decl.did };
            const out = await run(ledger, world, payload, judge);

            const record = operationRecord(decl.did, { outcomes: CONTRACT.outcomes });
            // The expected deliveries come from the SHIPPED composer, so a cell whose evidence also
            // raises a consent question is scored against the text the user really receives.
            const asked = ledger.challengesIssuedThisTurn;
            const asIs = composeDeliveryText(msg.text, decl.did, asked, CONTRACT);
            const asRewritten = composeDeliveryText(REWRITE, decl.did, asked, CONTRACT);
            const wasRewritten = out.text === asRewritten;
            if (prompts.length) checked += 1;
            if (wasRewritten) rewritten += 1;
            if (out.exhausted) exhausted.push(cell);

            // F1 — a turn that carried out an action must make no model call at all.
            if (prompts.length > 0 && record.hasOperations) failures.F1.push(cell);

            // F2 — a check that ran must have been shown the session's own account.
            if (prompts.length > 0 && sess.entities.some((e) => !prompts[0].includes(e))) failures.F2.push(cell);

            // F3 — the check found a lie, a usable rewrite came back, and the original still shipped.
            const usableRewrite = j.answers?.[0]?.trim().toLowerCase().startsWith('violation') && j.answers[1]?.trim();
            if (prompts.length > 0 && usableRewrite && !wasRewritten) failures.F3.push(cell);

            // F4 — every other cell delivers the message and the record, exactly as they are.
            if (!wasRewritten && out.text !== asIs) failures.F4.push(cell);
          }
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `\n  cells ${cells} · checked ${checked} · rewritten ${rewritten} · exhausted ${exhausted.length}\n` +
        `  F1 check ran on an acting turn        ${failures.F1.length}\n` +
        `  F2 check ran blind to the session     ${failures.F2.length}\n` +
        `  F3 detected lie not rewritten         ${failures.F3.length}\n` +
        `  F4 other cell not delivered as is     ${failures.F4.length}`,
    );

    expect(cells).toBe(DECLARATIONS.length * JUDGES.length * SESSIONS.length * MESSAGES.length);
    // Every cell reached the algorithm: an exhausted turn ships engine-derived prose, so a sweep with
    // one in it would be scoring a different mechanism and calling the result a hundred per cent.
    expect(exhausted).toEqual([]);
    expect(failures.F1).toEqual([]);
    expect(failures.F2).toEqual([]);
    expect(failures.F3).toEqual([]);
    expect(failures.F4).toEqual([]);
  });
});
