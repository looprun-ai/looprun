/** A subject whose world spells two refusals at the seam and whose cards speak for neither.
 *  One act a case drives into with a preset, one act no case reaches; everything else on the
 *  card — voices, licences, checks — clears its own verb, so what the gate says about this
 *  directory is what it says about the seam budget. */
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

/** The reason each prose-only rule exists. No seam law lives here: both refusals the world
 *  spells out below meet the operator as bare codes. */
export const WHY = {};

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
  guards: [...conduct(VOICES)]
};

export const claimsContract = {
  name: 'claims',
  guards: [
    precondition('settleClaim', ({ record }) => record?.status === 'OPEN'),
    precondition('archiveClaim', ({ record }) => record?.status === 'CLOSED')
  ]
};
