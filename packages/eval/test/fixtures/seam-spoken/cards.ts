/** The spoken sibling of seam-unspoken: the same world, and a seam law on the one act a case
 *  drives into, so the operator who meets that refusal meets it in words the card wrote. The act
 *  no case reaches stays unspoken on purpose — its row is the budget line the gate prints and
 *  never fails. */
import type { Json } from '@looprun-ai/core';
import { world } from '@looprun-ai/core';

interface Held { readonly record: { readonly status: string } | null }

interface Rule { readonly name: string; readonly rule: string; readonly on: string;
                 readonly tool?: readonly string[] }

interface Check { readonly name: string; readonly tool: readonly string[]; readonly on: string;
                  readonly rule: string; readonly deny: (held: Held) => string | null }

const prose = (name: string, rule: string): Rule => ({ name, rule, on: 'reply' });

const precondition = (tool: string, holds: (held: Held) => boolean): Check => ({
  name: `precondition:${tool}`, tool: [tool], on: 'preTool',
  rule: 'A claim moves only while the read shows it open.',
  deny: held => holds(held) ? null : 'the claim is not open, so this act cannot run'
});

/** The six voices a house teaches at every one of its counters. */
const VOICES = ['declareHonestly', 'oneQuestion', 'yourLaneYourReads', 'recordsOverAssertions',
                'askBeforeYouChoose', 'nameItDoNotPassItOn'];

const conduct = (taught: readonly string[]): readonly Rule[] =>
  taught.map(voice => prose(voice, `The ${voice} law, in this house's own words.`));

/** The reason each prose-only rule exists: the settle's refusal is the one seam this card pays
 *  a sentence for. */
export const WHY = { 'seam:settleClaim:BLOCKED_Y': 'seam' };

/** The world's own refusal channel: a refused call moves nothing and answers with its code. */
const fail = (code: string): { readonly refuse: Json } => ({ refuse: { error: code } });

export const claimsWorld = world({
  records: { claims: { clm_1: { status: 'OPEN' } } },
  reads: { getClaim: { form: 'get', entity: 'claims', label: 'Look up a claim' } },
  writes: { settleClaim: { form: 'run', entity: 'claims', label: 'Settle a claim' },
            archiveClaim: { form: 'run', entity: 'claims', label: 'Archive a claim' } },
  presets: { blocked: [{ entity: 'claims', id: 'clm_1', set: { status: 'BLOCKED' } }] }
}, {
  settleClaim: ({ records }) => records.claims?.clm_1?.status === 'OPEN'
    ? { result: { settled: true }, patches: [] }
    : fail('BLOCKED_Y'),
  archiveClaim: ({ records }) => records.claims?.clm_1?.status === 'CLOSED'
    ? { result: { archived: true }, patches: [] }
    : fail('CLAIM_STILL_OPEN')
});

export const claimsDesk = {
  name: 'claimsDesk',
  persona: 'You are the claims desk.',
  guards: [...conduct(VOICES),
           // The law the operator hears around the refusal the WORLD spells out on the settle.
           prose('seam:settleClaim:BLOCKED_Y',
             'A blocked claim takes no settlement: say which status the read returned, and what '
             + 'would have to change before the claim can settle.')]
};

export const claimsContract = {
  name: 'claims',
  guards: [
    precondition('settleClaim', ({ record }) => record?.status === 'OPEN'),
    precondition('archiveClaim', ({ record }) => record?.status === 'CLOSED')
  ]
};
