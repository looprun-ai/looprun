/** A coded argument is licensed by an ANSWER to a question that is OPEN right now. The engine
 *  opens the question and mints its code; the desk puts the declared options to the operator in
 *  the operator's own language; the licence is the reply carrying one option token and that
 *  question's code, those two and nothing else. The act consumes the question.
 *
 *  Every fixture is a scripted conversation driven through the real ChoiceDesk: no model runs,
 *  and every licence is a pure function of what the desk asked and what the operator answered.
 *  The operator's messages are Portuguese, English and Japanese because the mechanism's whole
 *  claim is that it reads none of them as words — they are the input under test. */
import { test, expect } from 'vitest';
import type { CallCtx, Json, StateSnapshot } from '../../src/contract/vocabulary.js';
import { choiceFromUser } from '../../src/cards/catalog.js';
import { ChoiceDesk } from '../../src/run/choice-desk.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { HOSTILE } from '../fixtures/hostile-world.js';

const FACTS = factsFromWorld(HOSTILE);
const STATE: StateSnapshot = HOSTILE.card.records;

const ACT = 'recordScreeningOutcome';
const OUTCOME = ['passed', 'failed'];
const REASON = ['incomplete_labs', 'age_out_of_range', 'consent_missing'];
const OUTCOME_RULE = 'Send the screening outcome only as the operator answered it.';
const REASON_RULE = 'Send the screening reason only as the operator answered it.';

const outcomeGuard = choiceFromUser(ACT, 'outcome', OUTCOME, OUTCOME_RULE)
  .compile('contract', FACTS);
const reasonGuard = choiceFromUser(ACT, 'reason', REASON, REASON_RULE)
  .compile('contract', FACTS);

/** Codes in the order the desk mints them, so a scripted conversation can name them. */
function deskOf(...codes: readonly string[]): ChoiceDesk {
  let at = 0;
  return new ChoiceDesk(() => codes[at++] ?? '000000');
}

/** The ctx the ENGINE builds: `userTexts` is the current turn FIRST, then the sealed turns
 *  oldest first (call-runner). The guard reads the desk, never this array — the shape is here
 *  so a fixture can never quietly disagree with the engine about it. */
function ctxOf(desk: ChoiceDesk, args: Record<string, Json>,
               said: readonly string[]): CallCtx {
  const current = said[said.length - 1] ?? '';
  return { call: { tool: ACT, args, key: JSON.stringify({ args, tool: ACT }) },
           effect: 'destructive', consented: false, state: STATE,
           userText: current, userTexts: [current, ...said.slice(0, -1)],
           choices: desk.standing(), turnActs: [], pastActs: [] };
}

const PT_PASSED = 'A triagem da pt_4133 passou. Registre isso no prontuário.';
const PT_FAILED = 'A triagem da pt_4133 não passou. Registre isso no prontuário.';
const EN_PASSED = 'The screening for pt_4133 passed. Record it on the chart.';
const EN_FAILED = 'The screening for pt_4133 has not passed. Record it on the chart.';
const JP_PASSED = 'pt_4133 のスクリーニングは合格しました。カルテに記録してください。';
const PT_BOTH = 'A triagem da pt_4133 não passou, faltaram exames. Registre no prontuário.';

const CODE = '917997';
const REASON_CODE = '204118';

/** One scripted conversation: the desk asks `outcome`, then the operator speaks. */
function afterAsking(said: readonly string[]): ChoiceDesk {
  const desk = deskOf(CODE);
  desk.beginTurn();
  desk.raise(ACT, 'outcome', OUTCOME);
  for (const message of said) desk.readAnswer(message);
  return desk;
}

/** The operator scenarios, in pt-BR, English and Japanese. `licensed` is whether the engine
 *  lets the proposed value through; the desk's own reading of the prose licenses nothing. */
const SCENARIOS: readonly { readonly id: string; readonly said: readonly string[];
                            readonly value: string; readonly licensed: boolean }[] = [
  { id: 'pt-negated · the answer licenses the value it names',
    said: [PT_FAILED, `2 ${CODE}`], value: 'failed', licensed: true },
  { id: 'pt-negated · the opposite value stays refused',
    said: [PT_FAILED, `2 ${CODE}`], value: 'passed', licensed: false },
  { id: 'pt-happy · the answer licenses',
    said: [PT_PASSED, `1 ${CODE}`], value: 'passed', licensed: true },
  { id: 'pt-happy · the prose alone licenses nothing',
    said: [PT_PASSED], value: 'passed', licensed: false },
  { id: 'en-happy · the answer licenses',
    said: [EN_PASSED, `1 ${CODE}`], value: 'passed', licensed: true },
  { id: 'en-happy · English prose stating the option licenses nothing',
    said: [EN_PASSED], value: 'passed', licensed: false },
  { id: 'en-negated · the answer licenses the value the operator chose',
    said: [EN_FAILED, `2 ${CODE}`], value: 'failed', licensed: true },
  { id: 'en-negated · the value the prose spells stays refused',
    said: [EN_FAILED], value: 'passed', licensed: false },
  { id: 'jp-happy · the answer licenses',
    said: [JP_PASSED, `1 ${CODE}`], value: 'passed', licensed: true },
  { id: 'jp-happy · the prose alone licenses nothing',
    said: [JP_PASSED], value: 'passed', licensed: false },
  { id: 'lang-flip · prose in a second language licenses nothing',
    said: [PT_FAILED, 'the second one, please'], value: 'failed', licensed: false },
  { id: 'lang-flip · the answer after the flip licenses',
    said: [PT_FAILED, 'the second one, please', `2 ${CODE}`], value: 'failed', licensed: true },
  { id: 'two-args · the outcome answer licenses the outcome',
    said: [PT_BOTH, `2 ${CODE}`, `1 ${REASON_CODE}`], value: 'failed', licensed: true },
  { id: 'two-args · a second answer does not disturb the first',
    said: [PT_BOTH, `2 ${CODE}`, `1 ${REASON_CODE}`], value: 'passed', licensed: false }
];

test('the scenario table: 14 licences, and the operator answers every one of them', () => {
  const wrong = SCENARIOS.filter(row => {
    const desk = afterAsking(row.said);
    const verdict = outcomeGuard.deny(
      ctxOf(desk, { caseId: 'pt_4133', outcome: row.value }, row.said));
    return row.licensed ? verdict !== null : verdict === null;
  });
  expect(wrong.map(row => row.id)).toEqual([]);
  expect(SCENARIOS.length).toBe(14);
});

test('an operator writing Portuguese licenses the value English term-matching refuses', () => {
  const said = [PT_PASSED, `1 ${CODE}`];
  const desk = afterAsking(said);
  expect(outcomeGuard.deny(ctxOf(desk, { caseId: 'pt_4133', outcome: 'passed' }, said)))
    .toBeNull();
  expect(outcomeGuard.deny(ctxOf(desk, { caseId: 'pt_4133', outcome: 'failed' }, said)))
    .not.toBeNull();
});

/** The echo edges of the measured table, against one open question whose options are the
 *  outcome's. `chose` is the value the message licenses, `null` where it licenses nothing.
 *  All 14 rows of the measured table are here; `"2"` is a 15th, the bare option token the
 *  coded rule refuses where the uncoded rule accepted it. */
const EDGES: readonly { readonly answer: string; readonly chose: string | null }[] = [
  { answer: `2 ${CODE}`, chose: 'failed' },
  { answer: `2, por favor ${CODE}`, chose: null },
  { answer: `22 ${CODE}`, chose: null },
  { answer: `a segunda opção ${CODE}`, chose: null },
  { answer: `failed ${CODE}`, chose: 'failed' },
  { answer: `FAILED ${CODE}`, chose: 'failed' },
  { answer: `1 e 3 ${CODE}`, chose: null },
  { answer: ` 1 ${CODE} `, chose: 'passed' },
  { answer: `opção 1 ${CODE}`, chose: null },
  { answer: `não é a 2 ${CODE}`, chose: null },
  { answer: `failed. ${CODE}`, chose: null },
  { answer: `pt_4133 · 2 ${CODE}`, chose: null },
  { answer: `2 e nada mais ${CODE}`, chose: null },
  { answer: '', chose: null },
  { answer: '2', chose: null }
];

test('the echo edges: one option token and the code, those two and nothing else', () => {
  const wrong = EDGES.filter(edge => {
    const desk = afterAsking([edge.answer]);
    const licensed = OUTCOME.filter(value =>
      outcomeGuard.deny(ctxOf(desk, { caseId: 'pt_4133', outcome: value }, [edge.answer]))
        === null);
    return JSON.stringify(licensed) !== JSON.stringify(edge.chose === null ? [] : [edge.chose]);
  });
  expect(wrong.map(edge => edge.answer)).toEqual([]);
  expect(EDGES.length).toBe(15);
});

test('an echo arriving before any question was asked licenses nothing', () => {
  const desk = deskOf(CODE);
  desk.beginTurn();
  desk.readAnswer(`2 ${CODE}`);
  expect(desk.standing()).toEqual({});
  expect(outcomeGuard.deny(ctxOf(desk, { caseId: 'pt_4133', outcome: 'failed' }, [`2 ${CODE}`])))
    .not.toBeNull();
});

test('a consumed question licenses no later call — a new record gets a new ask and a new code', () => {
  const desk = deskOf(CODE, '550123');
  desk.beginTurn();
  const firstAsk = desk.raise(ACT, 'outcome', OUTCOME);
  expect(firstAsk).toContain(CODE);
  desk.readAnswer(`2 ${CODE}`);
  expect(outcomeGuard.deny(ctxOf(desk, { caseId: 'pt_4133', outcome: 'failed' }, []))).toBeNull();

  desk.consume(ACT, { caseId: 'pt_4133', outcome: 'failed' });
  expect(desk.standing()).toEqual({});
  expect(outcomeGuard.deny(ctxOf(desk, { caseId: 'pt_9000', outcome: 'failed' }, [])))
    .not.toBeNull();

  const secondAsk = desk.raise(ACT, 'outcome', OUTCOME);
  expect(secondAsk).toContain('550123');
  expect(secondAsk).not.toContain(CODE);
});

test('a former question\'s code licenses nothing once a new question stands', () => {
  const desk = deskOf(CODE, '550123');
  desk.beginTurn();
  desk.raise(ACT, 'outcome', OUTCOME);
  desk.readAnswer(`2 ${CODE}`);
  desk.consume(ACT, { caseId: 'pt_4133', outcome: 'failed' });
  desk.raise(ACT, 'outcome', OUTCOME);

  desk.readAnswer(`2 ${CODE}`);
  expect(outcomeGuard.deny(ctxOf(desk, { caseId: 'pt_9000', outcome: 'failed' }, [])))
    .not.toBeNull();
  desk.readAnswer('2 550123');
  expect(outcomeGuard.deny(ctxOf(desk, { caseId: 'pt_9000', outcome: 'failed' }, []))).toBeNull();
});

test('while a question is open, the latest answer replaces the one before it', () => {
  const desk = afterAsking([`1 ${CODE}`, 'Sorry, wrong one.', `2 ${CODE}`]);
  expect(outcomeGuard.deny(ctxOf(desk, { caseId: 'pt_4133', outcome: 'failed' }, [])))
    .toBeNull();
  expect(outcomeGuard.deny(ctxOf(desk, { caseId: 'pt_4133', outcome: 'passed' }, [])))
    .toContain("chose 'failed'");
});

test('a re-ask restates the standing question — never a second live code', () => {
  const desk = deskOf(CODE, '550123');
  desk.beginTurn();
  expect(desk.raise(ACT, 'outcome', OUTCOME)).toContain(CODE);
  expect(desk.raise(ACT, 'outcome', OUTCOME)).toContain(CODE);
});

test('an answer to a different question licenses nothing — the code is what tells them apart', () => {
  const desk = deskOf(CODE, REASON_CODE);
  desk.beginTurn();
  desk.raise(ACT, 'outcome', OUTCOME);
  desk.raise(ACT, 'reason', REASON);
  desk.readAnswer(`2 ${CODE}`);
  expect(outcomeGuard.deny(ctxOf(desk, { caseId: 'pt_4133', outcome: 'failed' }, []))).toBeNull();
  for (const value of REASON) {
    expect(reasonGuard.deny(ctxOf(desk, { caseId: 'pt_4133', reason: value }, []))).not.toBeNull();
  }
  desk.readAnswer(`1 ${REASON_CODE}`);
  expect(reasonGuard.deny(ctxOf(desk, { caseId: 'pt_4133', reason: 'incomplete_labs' }, [])))
    .toBeNull();
});

test('a wrong code, a missing code and a reversed order all license nothing', () => {
  const licenses = (answer: string): boolean =>
    outcomeGuard.deny(ctxOf(afterAsking([answer]),
      { caseId: 'pt_4133', outcome: 'failed' }, [answer])) === null;
  expect(licenses(`2 ${CODE}`)).toBe(true);
  expect(licenses('2 999999')).toBe(false);
  expect(licenses('2')).toBe(false);
  expect(licenses(`${CODE} 2`)).toBe(false);
  expect(licenses(CODE)).toBe(false);
});

test('the guard reads the standing question, never the order of the conversation', () => {
  const desk = afterAsking([`2 ${CODE}`]);
  const args = { caseId: 'pt_4133', outcome: 'failed' };
  const call = { tool: ACT, args, key: 'k' };
  const base = { call, effect: 'destructive' as const, consented: false, state: STATE,
                 choices: desk.standing(), turnActs: [], pastActs: [] };
  for (const userTexts of [[`2 ${CODE}`, PT_FAILED], [PT_FAILED, `2 ${CODE}`], []]) {
    expect(outcomeGuard.deny({ ...base, userText: userTexts[0] ?? '', userTexts })).toBeNull();
  }
});

test('the ask names every option and the code the answer must carry', () => {
  const desk = deskOf(CODE);
  desk.beginTurn();
  const sentence = desk.raise(ACT, 'outcome', OUTCOME);
  expect(sentence).toContain('[1] passed');
  expect(sentence).toContain('[2] failed');
  expect(sentence).toContain(CODE);
  expect(outcomeGuard.rule).toBe(OUTCOME_RULE);
});

test('the guard asks exactly while no answer stands, and never for a value it does not carry', () => {
  const desk = deskOf(CODE);
  desk.beginTurn();
  const asking = (args: Record<string, Json>): unknown =>
    outcomeGuard.choose?.(ctxOf(desk, args, [])) ?? null;
  expect(asking({ caseId: 'pt_4133', outcome: 'failed' })).toEqual({ arg: 'outcome',
                                                                     options: OUTCOME });
  expect(asking({ caseId: 'pt_4133' })).toBeNull();
  expect(asking({ caseId: 'pt_4133', outcome: 'pending' })).toBeNull();
  desk.raise(ACT, 'outcome', OUTCOME);
  desk.readAnswer(`2 ${CODE}`);
  expect(asking({ caseId: 'pt_4133', outcome: 'failed' })).toBeNull();
});

test('a value outside the declared options refuses, whatever the operator answered', () => {
  const desk = afterAsking([`1 ${CODE}`]);
  expect(outcomeGuard.deny(ctxOf(desk, { caseId: 'pt_4133', outcome: 'pending' }, [])))
    .toContain('pending');
});

test('the gated argument has to arrive — a call leaving it out made the choice', () => {
  const desk = afterAsking([`1 ${CODE}`]);
  expect(outcomeGuard.deny(ctxOf(desk, { caseId: 'pt_4133' }, []))).toBe('');
});

test('a block of values is not a choice', () => {
  const desk = afterAsking([`1 ${CODE}`]);
  expect(outcomeGuard.deny(ctxOf(desk, { caseId: 'pt_4133', outcome: ['passed'] }, [])))
    .toContain('one value');
});

test('a discarded draft leaves no question behind; a sealed one carries into the next turn', () => {
  const desk = deskOf(CODE, '550123');
  desk.beginTurn();
  expect(desk.raise(ACT, 'outcome', OUTCOME)).toContain(CODE);
  // The turn failed: a fresh draft starts from what was last sealed, and nothing was.
  desk.beginTurn();
  expect(desk.standing()).toEqual({});

  expect(desk.raise(ACT, 'outcome', OUTCOME)).toContain('550123');
  desk.commit();
  desk.beginTurn();
  desk.readAnswer(`2 ${CODE}`);
  expect(outcomeGuard.deny(ctxOf(desk, { caseId: 'pt_4133', outcome: 'failed' }, [])))
    .not.toBeNull();
  desk.readAnswer('2 550123');
  expect(outcomeGuard.deny(ctxOf(desk, { caseId: 'pt_4133', outcome: 'failed' }, []))).toBeNull();
});
