import { describe, expect, it } from 'vitest';
import { CODE_SHAPED, ReplyComposer, gateMisses } from '../../src/run/reply-composer.js';
import type { DeliveryFact } from '../../src/run/delivery-facts.js';

const fact = (kind: DeliveryFact['kind'], text: string,
              state: DeliveryFact['state'] = null): DeliveryFact => ({ kind, text, state });
const scripted = (...texts: string[]): never => {
  let i = 0;
  return { step: async () => ({ calls: [], text: texts[i++] ?? '' }) } as never;
};

describe('the gate', () => {
  it('charges a missing id and a missing figure', () => {
    expect(gateMisses([fact('receipt', 'clm_3001 holds 2500.')], 'All done.'))
      .toEqual(['id clm_3001', 'figure 2500']);
  });
  it('matches figures on token boundaries — a lone 0 inside a date pays nothing', () => {
    expect(gateMisses([fact('receipt', '0 of deposit stays held.')],
      'Booked 2026-07-10 to 2026-07-15.')).toEqual(['figure 0']);
  });
  it('canonical figures match across written forms', () => {
    expect(gateMisses([fact('receipt', 'holds 3000.')], 'retém 3.000,00 no total')).toEqual([]);
  });
  it('the code must appear', () => {
    expect(gateMisses([fact('code', '384912')], 'reply 384912 to confirm')).toEqual([]);
    expect(gateMisses([fact('code', '384912')], 'please confirm')).toEqual(['code 384912']);
  });
});

describe('the composer', () => {
  const askFacts = [fact('ask', 'Cancelling bk_1 frees it.', 'held'), fact('code', '384912')];

  it('delivers a passing composition', async () => {
    const c = new ReplyComposer(scripted('bk_1 is free once you agree; reply 384912.'),
      { temperature: 0 });
    const out = await c.deliver('cancel bk_1', askFacts, '', () => 'FLOOR');
    expect(out).toEqual({ text: 'bk_1 is free once you agree; reply 384912.',
      by: 'composer', retried: false });
  });

  it('retries once, then floors — nothing is ever lost', async () => {
    const c = new ReplyComposer(scripted('no ids here', 'still none'), { temperature: 0 });
    const out = await c.deliver('cancel bk_1', askFacts, '', () => 'FLOOR');
    expect(out).toEqual({ text: 'FLOOR', by: 'floor', retried: true });
  });

  it('a code-shaped owed word floors without composing', async () => {
    let called = 0;
    const port = { step: async () => { called += 1; return { calls: [], text: 'x' }; } };
    const out = await new ReplyComposer(port as never, { temperature: 0 })
      .deliver('remove me', [fact('refusal', 'SOLE_OWNER_PROTECTED', 'refused')], '', () => 'FLOOR');
    expect(out).toEqual({ text: 'FLOOR', by: 'floor', retried: false });
    expect(called).toBe(0);
    expect(CODE_SHAPED.test('SOLE_OWNER_PROTECTED')).toBe(true);
  });

  it('no facts and no prose floors without composing', async () => {
    const out = await new ReplyComposer(scripted(), { temperature: 0 })
      .deliver('hi', [], '', () => 'FLOOR');
    expect(out).toEqual({ text: 'FLOOR', by: 'floor', retried: false });
  });

  it('an empty composition floors after the retry', async () => {
    const c = new ReplyComposer(scripted('', ''), { temperature: 0 });
    const out = await c.deliver('cancel bk_1', askFacts, 'draft words', () => 'FLOOR');
    expect(out).toEqual({ text: 'FLOOR', by: 'floor', retried: true });
  });
});
