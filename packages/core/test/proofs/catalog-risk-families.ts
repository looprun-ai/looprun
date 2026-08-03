/**
 * Guard proofs — RISK FAMILIES.
 *
 * Risk-family concerns over reply / tool-result TEXT are text judgment, expressed as `llmCheck`
 * rubrics (the `llmCheck` proof in catalog-behavior.ts proves the kind). The one STRUCTURAL family is
 * `consentRequired` — a `precondition` specialised to a tool set, keyed on a world flag, no text — and
 * it is what this file proves.
 */
import { consentRequired } from '../../src/guards/index.js';
import { FixtureWorld } from '../../src/testing/index.js';
import type { GuardProof } from '../../src/testing/index.js';

/** TurnInput shorthand (channel-agnostic — just the user text). */
const turn = (userText: string) => ({ userText });

// ── consentRequired (retention / consent) — the structural family ────────────
const CONSENT_REASON =
  'There is no stored consent for handling this person’s data — do not send or store it; explain that consent is needed first.';

const consentRequiredProof: GuardProof = {
  guard: 'consentRequired',
  make: () =>
    consentRequired({
      tools: ['useMedia'],
      // The fixture world exposes no consent flag of its own — `hasPrimary()` stands in as the
      // world-owned boolean the host would wire to its real consent field.
      consentOk: (w) => (w as unknown as { hasPrimary(): boolean }).hasPrimary(),
      reason: CONSENT_REASON,
    }),
  hook: 'preTool',
  target: ['useMedia'],
  cases: [
    {
      name: 'the consent flag reads false — the transmitting write is blocked',
      polarity: 'negative',
      ctx: { tool: 'useMedia', args: { label: 'u900' }, world: new FixtureWorld('empty'), turnIndex: 0 },
      l1: 'fires',
      l3: {
        preset: 'empty',
        turns: [turn('send that over to them')],
        script: [
          [{ tool: 'useMedia', args: { label: 'u900' } }],
          [
            {
              tool: 'respond',
              args: { message: 'Consent is not on file for that, so I have not sent it — I can request it first if you like.', did: [{ op: 'inform' }] },
            },
          ],
        ],
        expect: 'veto',
        tool: 'useMedia',
      },
    },
    {
      name: 'the consent flag reads true — the write runs',
      polarity: 'positive',
      ctx: { tool: 'useMedia', args: { label: 'u900' }, world: new FixtureWorld('has-primary'), turnIndex: 0 },
      l1: 'silent',
      l3: {
        preset: 'has-primary',
        turns: [turn('send that over to them')],
        script: [
          [{ tool: 'useMedia', args: { label: 'u900' } }],
          [{ tool: 'respond', args: { message: 'The asset has been attached as agreed.', did: [{ op: 'inform' }] } }],
        ],
        expect: 'pass',
      },
    },
    {
      name: 'a tool outside the consent set is never gated',
      polarity: 'neutral',
      ctx: { tool: 'searchItem', args: { query: 'x' }, world: new FixtureWorld('empty'), turnIndex: 0 },
      l1: 'silent',
    },
  ],
};

export const RISK_FAMILY_PROOFS: GuardProof[] = [consentRequiredProof];
