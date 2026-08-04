# Consent by Challenge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** consent to a destructive act becomes a token the engine issues and the user types back, so no
agent declaration licenses anything.

**Architecture:** a conversation-scoped challenge store on the ledger; the RUNTIME issues challenges
(from a `requiresConfirmation` result, or from a vetoed destructive call), renders them into the
delivered text, and marks them consumed by scanning the user's incoming message. Guards stay pure —
`confirmFirst` reads the consumed set off the ctx and never touches text or state.

**Tech Stack:** TypeScript, pnpm workspace, vitest.

Spec: `docs/superpowers/specs/2026-08-05-consent-by-challenge-design.md`.

## Global Constraints

- Everything written to a file is English — identifiers, comments, string literals, prompt text.
- Comments and docs state what the system IS. No history narration, no citing tests or measurements.
- No RegExp in any guard factory's configuration surface. Matching is equality over issued values.
- Pre-1.0: zero retro-compat. Rewrite tests; never shim, skip or weaken.
- The engine is domain-neutral: only the four speech-op names live in core.
- User-delivered text never names a tool, a terminal, or `respond`.
- A surface change carries its guard-catalog parity entry and its chapter regen in the SAME commit.
- Run `pnpm -r typecheck` and the package's tests before every commit.

## Two decisions this plan makes, beyond the spec

| Decision | Why |
|---|---|
| the host declares its locale as a TEXT PACK (`DomainContract.engineText`), not an ISO code | the engine ships no translation table and stays language-neutral; identical seam shape to the existing `renderClaim` |
| `askedEarlier` is renamed `valueFromUser` | the kind's rule is "the value appears in the user's speech"; the old name describes a signal this design deletes |

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/guards/matching.ts` (create) | the ONE matching law: canonical value form, whole-value equality, contiguous-token containment |
| `packages/core/src/runtime/challenge.ts` (create) | the challenge model: issue, match, consume, render |
| `packages/core/src/runtime/ledger.ts` (modify) | conversation-scoped challenge store + issuance/consumption call sites |
| `packages/core/src/runtime/turn.ts` (modify) | render open challenges into the delivered text |
| `packages/core/src/runtime/claims.ts` (modify) | engine text pack for the record closures |
| `packages/core/src/trunk.ts` (modify) | `DomainContract.engineText` |
| `packages/core/src/rules.ts` (modify) | `GuardCtx.consent` |
| `packages/core/src/guards/confirmation.ts` (modify) | `confirmFirst` reduced to one rule; two kinds deleted |
| `packages/core/src/guards/structural.ts` (modify) | `valueFromUser` |
| `packages/core/src/spec.ts` (modify) | `destructiveLabels`, token derivation, collision check |

---

### Task 1: The matching law

**Files:**
- Create: `packages/core/src/guards/matching.ts`
- Modify: `packages/core/src/guards/honesty.ts` (delete `foldCase`/`canonValue`/`targetMatchesValue`, import instead)
- Test: `packages/core/test/matching.test.ts`

**Interfaces:**
- Produces: `canonValue(v: string): string`, `targetMatchesValue(target: string, value: string): boolean`, `valueSpokenBy(value: string, text: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/matching.test.ts
import { describe, it, expect } from 'vitest';
import { targetMatchesValue, valueSpokenBy } from '../src/guards/matching.js';

describe('targetMatchesValue', () => {
  it('matches a whole value regardless of edge punctuation and case', () => {
    expect(targetMatchesValue('BK-1', '(bk-1).')).toBe(true);
  });

  it('rejects a value that merely contains the target', () => {
    expect(targetMatchesValue('BK-1', 'BK-12')).toBe(false);
  });
});

describe('valueSpokenBy', () => {
  it('finds a single token inside a sentence', () => {
    expect(valueSpokenBy('marcos@x.com', 'my email is marcos@x.com.')).toBe(true);
  });

  it('rejects a value the user never said', () => {
    expect(valueSpokenBy('guess@y.com', 'my email is marcos@x.com.')).toBe(false);
  });

  it('rejects a prefix of a token the user said', () => {
    expect(valueSpokenBy('BK-1', 'cancel the BK-12')).toBe(false);
  });

  it('finds a contiguous multi-token value', () => {
    expect(valueSpokenBy('the engine locked up', 'I think the engine locked up yesterday')).toBe(true);
  });

  it('rejects the same tokens when they are not contiguous', () => {
    expect(valueSpokenBy('the engine locked up', 'the engine, I think, locked up')).toBe(false);
  });

  it('finds a token that carries internal punctuation', () => {
    expect(valueSpokenBy('CONFIRM BK-1', 'yes, CONFIRM BK-1')).toBe(true);
  });

  it('rejects a value that canonicalizes to nothing', () => {
    expect(valueSpokenBy('...', 'anything at all')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C packages/core exec vitest run test/matching.test.ts`
Expected: FAIL — `Failed to resolve import "../src/guards/matching.js"`.

- [ ] **Step 3: Create the module**

```ts
// packages/core/src/guards/matching.ts
/**
 * THE MATCHING LAW — the one comparison every verdict that must decide "is this string THAT string"
 * routes through: claim-to-ledger grounding, consent-token consumption, and a value the agent records
 * on the user's behalf.
 *
 * Two shapes, one canonical form. `targetMatchesValue` compares a target to ONE value. `valueSpokenBy`
 * looks for a value inside a person's sentence, as a CONTIGUOUS run of whole tokens — never as a
 * substring, because a substring lets one identifier stand for another:
 *
 * ```
 *   user says      "cancel the BK-12"
 *   pending token  CONFIRM BK-1
 *   substring      "BK-1" occurs inside "BK-12" → consent accepted for the wrong record
 * ```
 */
const LEADING_PUNCT = /^[^\p{L}\p{N}]+/u;
const TRAILING_PUNCT = /[^\p{L}\p{N}]+$/u;

/** ASCII test on the first code point — the guard against a fold that crosses scripts. */
function isAscii(ch: string): boolean {
  return (ch.codePointAt(0) ?? 0) < 128;
}

/**
 * CASE FOLD that never changes SCRIPT. `String.prototype.toLowerCase` maps some non-ASCII lookalikes
 * ONTO ASCII — KELVIN SIGN U+212A folds to `k` — so under a plain lowercase a target spelled with the
 * lookalike would match the real ASCII id while the renderer printed the lookalike back to the user. A
 * fold that would cross into ASCII keeps the original character instead, so lookalikes fail closed and
 * ordinary case folding (`BK-1` ⇄ `bk-1`) is untouched.
 */
function foldCase(v: string): string {
  let out = '';
  for (const ch of v) {
    const lower = ch.toLowerCase();
    out += lower.length === 1 && isAscii(lower) && !isAscii(ch) ? ch : lower;
  }
  return out;
}

/** The CANONICAL comparison form of one value: trimmed, case-folded, EDGE punctuation stripped — so
 *  `"(BK-1)"`, `"BK-1."` and `"  bk-1  "` all canonicalize to `bk-1`, while `BK-1-EXTRA` does not. */
export function canonValue(v: string): string {
  return foldCase(v.trim()).replace(LEADING_PUNCT, '').replace(TRAILING_PUNCT, '');
}

/**
 * THE BOUNDARY — is `target` the WHOLE of `value`?
 *
 * Match ⇔ the canonical forms are EQUAL. Nothing else: no substring, no authored pattern. A target that
 * canonicalizes to nothing (punctuation only) matches nothing.
 */
export function targetMatchesValue(target: string, value: string): boolean {
  const t = canonValue(target);
  if (!t) return false;
  return t === canonValue(value);
}

/** A person's sentence reduced to canonical tokens: split on WHITESPACE (never on punctuation, which
 *  would tear `marcos@x.com` into three pieces), each token canonicalized, empties dropped. */
function speechTokens(text: string): string[] {
  return text
    .split(/\s+/u)
    .map((t) => canonValue(t))
    .filter((t) => t.length > 0);
}

/**
 * Did the person SAY this value? True when the value's token sequence appears CONTIGUOUS in the text,
 * each token equal as a whole. A value that canonicalizes to no tokens is said by nothing.
 */
export function valueSpokenBy(value: string, text: string): boolean {
  const want = speechTokens(value);
  if (!want.length) return false;
  const said = speechTokens(text);
  for (let i = 0; i + want.length <= said.length; i++) {
    let all = true;
    for (let j = 0; j < want.length; j++) {
      if (said[i + j] !== want[j]) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -C packages/core exec vitest run test/matching.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Point `honesty.ts` at the shared law**

In `packages/core/src/guards/honesty.ts`, delete the local `LEADING_PUNCT`, `TRAILING_PUNCT`, `isAscii`,
`foldCase`, `canonValue` and `targetMatchesValue` definitions, and add at the top of the imports:

```ts
import { targetMatchesValue } from './matching.js';
```

Then re-export it so the package's public surface is unchanged — `honesty.ts` is where consumers import it from:

```ts
export { targetMatchesValue } from './matching.js';
```

- [ ] **Step 6: Run the core suite**

Run: `pnpm -C packages/core test`
Expected: PASS — no behaviour changed, only the definition site.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/guards/matching.ts packages/core/src/guards/honesty.ts packages/core/test/matching.test.ts
git commit -m "feat(core): the matching law is one module — whole-value equality and contiguous-token speech"
```

---

### Task 2: The challenge model

**Files:**
- Create: `packages/core/src/runtime/challenge.ts`
- Test: `packages/core/test/challenge.test.ts`

**Interfaces:**
- Consumes: `valueSpokenBy` (Task 1)
- Produces: `Challenge`, `deriveToken(meaning: string): string`, `challengeMatchesCall(c: Challenge, tool: string, args: Record<string, unknown>): boolean`, `consumeChallenges(open: Challenge[], userText: string, turnIndex: number): Challenge[]`, `renderChallenge(c: Challenge, text: EngineText): string`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/challenge.test.ts
import { describe, it, expect } from 'vitest';
import {
  deriveToken,
  challengeMatchesCall,
  consumeChallenges,
  type Challenge,
} from '../src/runtime/challenge.js';

const withRecord = (): Challenge => ({
  tool: 'cancelBooking',
  subject: 'BK-1',
  meaning: 'BK-1',
  token: 'CONFIRM BK-1',
  issuedTurn: 0,
});

const withLabel = (): Challenge => ({
  tool: 'deleteAllData',
  meaning: 'delete all of your data',
  token: 'CONFIRM DELETE-ALL',
  issuedTurn: 0,
});

describe('deriveToken', () => {
  it('takes the first two words, upper-cased and hyphen-joined', () => {
    expect(deriveToken('delete all of your data')).toBe('DELETE-ALL');
  });

  it('takes the whole meaning when it is a single word', () => {
    expect(deriveToken('BK-1')).toBe('BK-1');
  });

  it('ignores surrounding punctuation and extra spaces', () => {
    expect(deriveToken('  close   the account.  ')).toBe('CLOSE-THE');
  });
});

describe('challengeMatchesCall', () => {
  it('matches a record challenge when an arg carries the subject', () => {
    expect(challengeMatchesCall(withRecord(), 'cancelBooking', { id: 'BK-1' })).toBe(true);
  });

  it('rejects a record challenge when the arg names another record', () => {
    expect(challengeMatchesCall(withRecord(), 'cancelBooking', { id: 'BK-12' })).toBe(false);
  });

  it('rejects a record challenge on a different tool', () => {
    expect(challengeMatchesCall(withRecord(), 'deleteBooking', { id: 'BK-1' })).toBe(false);
  });

  it('matches a label challenge on the tool alone', () => {
    expect(challengeMatchesCall(withLabel(), 'deleteAllData', {})).toBe(true);
  });
});

describe('consumeChallenges', () => {
  it('consumes the challenge whose token the user typed', () => {
    const open = [withRecord(), withLabel()];
    const consumed = consumeChallenges(open, 'yes, CONFIRM BK-1', 3);
    expect(consumed.map((c) => c.token)).toEqual(['CONFIRM BK-1']);
    expect(open[0]!.consumedTurn).toBe(3);
    expect(open[1]!.consumedTurn).toBeUndefined();
  });

  it('consumes nothing on a human yes that is not the token', () => {
    const open = [withRecord()];
    expect(consumeChallenges(open, 'go ahead', 3)).toEqual([]);
    expect(open[0]!.consumedTurn).toBeUndefined();
  });

  it('never consumes a challenge twice', () => {
    const open = [withRecord()];
    consumeChallenges(open, 'CONFIRM BK-1', 3);
    expect(consumeChallenges(open, 'CONFIRM BK-1', 4)).toEqual([]);
    expect(open[0]!.consumedTurn).toBe(3);
  });
});

describe('closeChallengesFor', () => {
  it('closes an open challenge on a record that changed', () => {
    const open = [withRecord()];
    closeChallengesFor(open, 'BK-1');
    expect(open[0]!.closed).toBe(true);
  });

  it('leaves a challenge on another record open', () => {
    const open = [withRecord()];
    closeChallengesFor(open, 'BK-2');
    expect(open[0]!.closed).toBeUndefined();
  });

  it('never consumes a closed challenge', () => {
    const open = [withRecord()];
    closeChallengesFor(open, 'BK-1');
    expect(consumeChallenges(open, 'CONFIRM BK-1', 3)).toEqual([]);
  });
});
```

Add `closeChallengesFor` to the import list at the top of this test file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C packages/core exec vitest run test/challenge.test.ts`
Expected: FAIL — `Failed to resolve import "../src/runtime/challenge.js"`.

- [ ] **Step 3: Create the module**

```ts
// packages/core/src/runtime/challenge.ts
/**
 * THE CONSENT CHALLENGE — the engine's own question about a destructive act, and the literal the user
 * types back to agree to it.
 *
 * The agent writes no part of it: it does not compose the sentence, it does not name what the act
 * authorizes, and it does not report the answer. It only attempts the act, which is what causes the
 * question to appear.
 *
 * ```
 *   world says      cancelBooking → requiresConfirmation on BK-1
 *   engine renders  To confirm, reply: CONFIRM BK-1
 *   user types      yes, CONFIRM BK-1
 *   engine allows   cancelBooking({ id:'BK-1', confirmed:true })
 * ```
 */
import { targetMatchesValue, valueSpokenBy } from '../guards/matching.js';

/** One pending consent question. `subject` is the record identity the world issued; a challenge for an
 *  act on NO identifiable record carries none and is keyed on its tool alone. */
export interface Challenge {
  /** The destructive tool this challenge licenses. */
  tool: string;
  /** The record identity the world issued for the act, when the act names one. */
  subject?: string;
  /** What the user is agreeing to, in words: the world's record identity, or the spec's declared label. */
  meaning: string;
  /** The literal the user types back. */
  token: string;
  issuedTurn: number;
  /** The turn on which the user's own words carried the token. A challenge licenses its act only on
   *  that turn: consent is single use, and the act it consents to belongs to the message that gave it. */
  consumedTurn?: number;
  /** The question no longer stands: the record it names has changed, or a newer question about the same
   *  record replaced it. A closed challenge can never be consumed — the user would be agreeing to a
   *  sentence that is no longer true of the world. */
  closed?: boolean;
}

/** The prefix of every consent token. It is one word so a token is always two words at most, which is
 *  what a person can retype without copying. */
const TOKEN_PREFIX = 'CONFIRM';

/** The token DERIVED from a meaning: its first two words, upper-cased and hyphen-joined. Deterministic,
 *  so the same act always asks for the same literal, and short enough to type. */
export function deriveToken(meaning: string): string {
  const words = meaning
    .trim()
    .split(/\s+/u)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, ''))
    .filter((w) => w.length > 0)
    .slice(0, 2);
  return words.join('-').toUpperCase();
}

/** The full literal for a challenge: the prefix and the derived token. */
export function challengeToken(meaning: string): string {
  return `${TOKEN_PREFIX} ${deriveToken(meaning)}`;
}

/**
 * Does this challenge license THIS call? A challenge that names a record licenses a call on that record
 * of that tool — one of the call's own argument values must BE the subject, by whole-value equality. A
 * challenge with no record licenses its tool, which is the only thing it can be about.
 */
export function challengeMatchesCall(
  c: Challenge,
  tool: string,
  args: Record<string, unknown>,
): boolean {
  if (c.tool !== tool) return false;
  if (c.subject === undefined) return true;
  return Object.values(args).some(
    (v) => typeof v === 'string' && targetMatchesValue(c.subject!, v),
  );
}

/**
 * Mark every OPEN challenge whose token the user's message carries, and return the ones just consumed.
 * Consumption is single use: an already-consumed challenge is never consumed again, so one typed token
 * licenses one act.
 */
export function consumeChallenges(
  open: Challenge[],
  userText: string,
  turnIndex: number,
): Challenge[] {
  const consumed: Challenge[] = [];
  for (const c of open) {
    if (c.consumedTurn !== undefined || c.closed) continue;
    if (!valueSpokenBy(c.token, userText)) continue;
    c.consumedTurn = turnIndex;
    consumed.push(c);
  }
  return consumed;
}

/**
 * Close every open question about a record whose state has moved. The user agreed to a sentence about
 * the world; once that sentence stops being true of it, the agreement they were asked for is not the
 * one they would be giving.
 */
export function closeChallengesFor(open: Challenge[], subject: string): void {
  for (const c of open) {
    if (c.consumedTurn !== undefined || c.closed) continue;
    if (c.subject !== undefined && targetMatchesValue(c.subject, subject)) c.closed = true;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -C packages/core exec vitest run test/challenge.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/runtime/challenge.ts packages/core/test/challenge.test.ts
git commit -m "feat(core): the consent challenge — its token, what it licenses, and single-use consumption"
```

---

### Task 3: The engine text pack

**Files:**
- Modify: `packages/core/src/runtime/claims.ts` (closures read from the pack)
- Modify: `packages/core/src/trunk.ts` (`DomainContract.engineText`)
- Test: `packages/core/test/engine-text.test.ts`

**Interfaces:**
- Produces: `EngineText`, `DEFAULT_ENGINE_TEXT`, `resolveEngineText(t?: Partial<EngineText>): EngineText`; `RenderOpts` gains `text?: EngineText`; `DomainContract` gains `engineText?: Partial<EngineText>`

The engine's user-facing sentences are DATA, so a host that runs its conversation in another language
supplies them. A challenge the user cannot type is an act that can never be consented to.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/engine-text.test.ts
import { describe, it, expect } from 'vitest';
import { resolveEngineText, DEFAULT_ENGINE_TEXT } from '../src/runtime/engine-text.js';
import { renderOperationReport } from '../src/runtime/claims.js';

describe('resolveEngineText', () => {
  it('defaults every sentence when the host declares none', () => {
    expect(resolveEngineText()).toEqual(DEFAULT_ENGINE_TEXT);
  });

  it('takes only the sentences the host overrides', () => {
    const t = resolveEngineText({ recordClosureNone: 'Nenhuma operação foi realizada neste turno.' });
    expect(t.recordClosureNone).toBe('Nenhuma operação foi realizada neste turno.');
    expect(t.recordClosureSome).toBe(DEFAULT_ENGINE_TEXT.recordClosureSome);
  });

  it('renders the challenge sentence from the meaning and the token', () => {
    expect(DEFAULT_ENGINE_TEXT.challenge('BK-1', 'CONFIRM BK-1')).toBe(
      'To confirm BK-1, reply: CONFIRM BK-1',
    );
  });
});

describe('the record speaks the declared language', () => {
  it('closes an empty record with the host sentence', () => {
    const text = resolveEngineText({ recordClosureNone: 'Nenhuma operação foi realizada neste turno.' });
    expect(renderOperationReport([{ op: 'inform' }], { text })).toBe(
      'Nenhuma operação foi realizada neste turno.',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C packages/core exec vitest run test/engine-text.test.ts`
Expected: FAIL — `Failed to resolve import "../src/runtime/engine-text.js"`.

- [ ] **Step 3: Create the pack**

```ts
// packages/core/src/runtime/engine-text.ts
/**
 * THE ENGINE'S USER-FACING SENTENCES.
 *
 * Everything the engine itself puts on the user's screen lives here, so a host whose conversation runs
 * in another language declares them and the engine speaks it. The consent challenge is the reason this
 * is not cosmetic: the user must TYPE the token back, and a token they cannot read is an act they can
 * never agree to.
 */
export interface EngineText {
  /** Closes a record that names at least one operation. */
  recordClosureSome: string;
  /** Closes a record that names none. */
  recordClosureNone: string;
  /** The consent question: what the user is agreeing to, and the literal that agrees to it. */
  challenge: (meaning: string, token: string) => string;
}

export const DEFAULT_ENGINE_TEXT: EngineText = Object.freeze({
  recordClosureSome: 'Nothing else was changed on this turn.',
  recordClosureNone: 'No operation was carried out on this turn.',
  challenge: (meaning: string, token: string) => `To confirm ${meaning}, reply: ${token}`,
});

/** The pack a render call uses: the host's sentences where it declared them, the engine's elsewhere. */
export function resolveEngineText(t?: Partial<EngineText>): EngineText {
  return t ? { ...DEFAULT_ENGINE_TEXT, ...t } : DEFAULT_ENGINE_TEXT;
}
```

- [ ] **Step 4: Read the closures from the pack**

In `packages/core/src/runtime/claims.ts`:

1. Add the import:

```ts
import { resolveEngineText, type EngineText } from './engine-text.js';
```

2. Delete the `RECORD_CLOSURE_SOME` and `RECORD_CLOSURE_NONE` constants and their doc comments, and
   move the "why the two sentences are not interchangeable" explanation onto `EngineText` —
   `recordClosureNone` asserts the absence outright, so a false claim beside it stands contradicted,
   while `recordClosureSome` over an empty list would presuppose that something WAS changed.

3. Add `text` to `RenderOpts`:

```ts
export interface RenderOpts {
  renderClaim?: (c: RenderedClaim, core: CoreOutcome) => string;
  outcomes?: OutcomeMap;
  /** The engine's own sentences. Absent ⇒ the engine's English defaults. */
  text?: EngineText;
}
```

4. In `operationRecord`, replace the closure selection:

```ts
  const hasOperations = lines.length > 0;
  const text = resolveEngineText(opts?.text);
  return {
    lines,
    hasOperations,
    text: [...lines, hasOperations ? text.recordClosureSome : text.recordClosureNone].join('\n'),
  };
```

5. Update every import of `RECORD_CLOSURE_NONE` / `RECORD_CLOSURE_SOME` across the repo to read
   `DEFAULT_ENGINE_TEXT.recordClosureNone` / `.recordClosureSome`. Find them with:

```bash
grep -rn "RECORD_CLOSURE_" packages --include="*.ts" | grep -v /dist/
```

- [ ] **Step 5: Add the domain seam**

In `packages/core/src/trunk.ts`, inside `DomainContract`, after `renderClaim`:

```ts
  /** The engine's OWN user-facing sentences — the record closures and the consent challenge. The engine
   *  puts these on the user's screen itself, so a conversation held in another language declares them
   *  here. Absent ⇒ the engine's English defaults. Partial: what is not declared falls back per key. */
  engineText?: Partial<EngineText>;
```

with `import type { EngineText } from './runtime/engine-text.js';` added to its imports.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm -C packages/core exec vitest run test/engine-text.test.ts && pnpm -C packages/core test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/runtime/engine-text.ts packages/core/src/runtime/claims.ts packages/core/src/trunk.ts packages/core/test/engine-text.test.ts
git commit -m "feat(core): the engine's user-facing sentences are host-declarable data"
```

---

### Task 4: The challenge store, issuance and consumption

**Files:**
- Modify: `packages/core/src/runtime/ledger.ts`
- Modify: `packages/core/src/rules.ts` (`GuardCtx.consent`)
- Test: `packages/core/test/challenge-ledger.test.ts`

**Interfaces:**
- Consumes: `Challenge`, `challengeToken`, `consumeChallenges` (Task 2)
- Produces: `TurnLedger.challenges: Challenge[]`, `TurnLedger.consentThisTurn: Challenge[]`,
  `TurnLedger.challengesIssuedThisTurn: Challenge[]`, `TurnLedger.destructiveLabels: Record<string, string>`,
  `issueChallengeForVeto(ledger, tool)`; `GuardCtx.consent?: ReadonlyArray<Challenge>`

Issuance and consumption are the RUNTIME's, never a guard's: reading the user's text and mutating the
store are exactly what a guard must not do, so the guard layer only ever reads the result.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/challenge-ledger.test.ts
import { describe, it, expect } from 'vitest';
import { createLedger, beginTurn, recordToolResult, issueChallengeForVeto } from '../src/runtime/ledger.js';

describe('a world result that requires confirmation issues a challenge', () => {
  it('names the record the world issued', () => {
    const ledger = createLedger();
    beginTurn(ledger, 0, 'cancel BK-1');
    recordToolResult(ledger, 'cancelBooking', { id: 'BK-1' }, {
      ok: true,
      requiresConfirmation: true,
      id: 'BK-1',
    });
    expect(ledger.challenges).toHaveLength(1);
    expect(ledger.challenges[0]).toMatchObject({ tool: 'cancelBooking', subject: 'BK-1', token: 'CONFIRM BK-1' });
    expect(ledger.challengesIssuedThisTurn).toHaveLength(1);
  });

  it('issues one challenge per record, never a duplicate for an already-open one', () => {
    const ledger = createLedger();
    beginTurn(ledger, 0, 'cancel BK-1');
    const result = { ok: true, requiresConfirmation: true, id: 'BK-1' };
    recordToolResult(ledger, 'cancelBooking', { id: 'BK-1' }, result);
    recordToolResult(ledger, 'cancelBooking', { id: 'BK-1' }, result);
    expect(ledger.challenges).toHaveLength(1);
  });
});

describe('a vetoed destructive call issues a challenge from its declared label', () => {
  it('uses the label the spec declared', () => {
    const ledger = createLedger();
    ledger.destructiveLabels = { deleteAllData: 'delete all of your data' };
    beginTurn(ledger, 0, 'wipe everything');
    issueChallengeForVeto(ledger, 'deleteAllData');
    expect(ledger.challenges[0]).toMatchObject({
      tool: 'deleteAllData',
      meaning: 'delete all of your data',
      token: 'CONFIRM DELETE-ALL',
    });
    expect(ledger.challenges[0]!.subject).toBeUndefined();
  });

  it('issues nothing for a tool with no declared label', () => {
    const ledger = createLedger();
    beginTurn(ledger, 0, 'wipe everything');
    issueChallengeForVeto(ledger, 'deleteAllData');
    expect(ledger.challenges).toHaveLength(0);
  });
});

describe('the user\'s own words consume an open challenge', () => {
  it('records the consumption on the turn that carried the token', () => {
    const ledger = createLedger();
    ledger.destructiveLabels = { deleteAllData: 'delete all of your data' };
    beginTurn(ledger, 0, 'wipe everything');
    issueChallengeForVeto(ledger, 'deleteAllData');
    beginTurn(ledger, 1, 'ok, CONFIRM DELETE-ALL');
    expect(ledger.consentThisTurn).toHaveLength(1);
    expect(ledger.challenges[0]!.consumedTurn).toBe(1);
  });

  it('carries no consent on a turn whose message is a human yes', () => {
    const ledger = createLedger();
    ledger.destructiveLabels = { deleteAllData: 'delete all of your data' };
    beginTurn(ledger, 0, 'wipe everything');
    issueChallengeForVeto(ledger, 'deleteAllData');
    beginTurn(ledger, 1, 'go ahead');
    expect(ledger.consentThisTurn).toEqual([]);
  });

  it('keeps a challenge open across an unrelated turn', () => {
    const ledger = createLedger();
    ledger.destructiveLabels = { deleteAllData: 'delete all of your data' };
    beginTurn(ledger, 0, 'wipe everything');
    issueChallengeForVeto(ledger, 'deleteAllData');
    beginTurn(ledger, 1, 'wait, what does that remove?');
    beginTurn(ledger, 2, 'CONFIRM DELETE-ALL');
    expect(ledger.consentThisTurn).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C packages/core exec vitest run test/challenge-ledger.test.ts`
Expected: FAIL — `issueChallengeForVeto` is not exported.

- [ ] **Step 3: Add the store to the ledger**

In `packages/core/src/runtime/ledger.ts`, add to `TurnLedger`:

```ts
  /** Every consent challenge this CONVERSATION has issued — open and consumed alike. Conversation-scoped:
   *  a challenge stays open until the user's words carry its token, a newer challenge on the same record
   *  supersedes it, or the record it names changes. There is no turn window; what bounds a stale token is
   *  that consuming it requires typing that exact literal, and consuming it closes it. */
  challenges: Challenge[];
  /** The challenges the CURRENT turn's incoming message consumed — the whole of what licenses a
   *  destructive act on this turn. Read into every GuardCtx as `ctx.consent`. Reset per turn. */
  consentThisTurn: Challenge[];
  /** The challenges ISSUED on the current turn — the ones the delivered text must carry, so the user can
   *  see the question they are being asked. Reset per turn. */
  challengesIssuedThisTurn: Challenge[];
  /** Per destructive tool that acts on NO identifiable record, the human-facing label the spec declared.
   *  A tool absent from this map can issue no challenge, so it can never be consented to. */
  destructiveLabels: Record<string, string>;
```

with `import { challengeToken, closeChallengesFor, consumeChallenges, type Challenge } from './challenge.js';` and
`import { preferredIdentityValues } from '../guards/honesty.js';` — export
`preferredIdentityValues` from `honesty.ts` for this (it is the one place that decides what identity a
world result issued, and the challenge's subject must be that same value).

Seed them in `createLedger`:

```ts
    challenges: [],
    consentThisTurn: [],
    challengesIssuedThisTurn: [],
    destructiveLabels: {},
```

- [ ] **Step 4: Consume at turn start**

In `beginTurn`, after `ledger.currentUserText = userText;`, add:

```ts
  ledger.challengesIssuedThisTurn = [];
  // The user's own words are the ONLY thing that turns an open challenge into consent, and they are read
  // exactly here — once per turn, by the runtime. No guard reads text.
  ledger.consentThisTurn = consumeChallenges(ledger.challenges, userText, turnIndex);
```

- [ ] **Step 5: Issue from a world result**

In `recordToolResult`, after the observed entry is pushed, add:

```ts
  // PATH (c): the world runs the two-step protocol itself. Its "I need confirmation" answer names the
  // record, so the challenge it issues is bound to that record and to nothing else.
  if (resultFlags?.requiresConfirmation) {
    const [subject] = preferredIdentityValues(output);
    if (subject) issueChallenge(ledger, { tool: name, subject, meaning: subject });
  } else if (tookEffect) {
    // A write that LANDED moves the record, so every open question about it stops being true and closes.
    for (const subject of preferredIdentityValues(output)) closeChallengesFor(ledger.challenges, subject);
  }
```

using the local `resultFlags` and `tookEffect` values already computed there for the observed entry
(read the surrounding code and reuse them rather than recomputing).

- [ ] **Step 6: Add the two issuance entry points**

```ts
/**
 * Open a challenge.
 *
 * An identical open one is left alone: a second identical question would render twice and consume once,
 * and the record's own question is asked once and stays asked until it is answered. A DIFFERENT question
 * about the same act SUPERSEDES the old one — two open literals for one act would let the user answer a
 * question they are no longer being asked.
 */
function issueChallenge(ledger: TurnLedger, c: { tool: string; subject?: string; meaning: string }): void {
  const token = challengeToken(c.meaning);
  const sameAct = (x: Challenge): boolean =>
    x.consumedTurn === undefined && !x.closed && x.tool === c.tool && x.subject === c.subject;
  if (ledger.challenges.some((x) => sameAct(x) && x.token === token)) return;
  for (const x of ledger.challenges) if (sameAct(x)) x.closed = true;
  const challenge: Challenge = { ...c, token, issuedTurn: ledger.turnIndex };
  ledger.challenges.push(challenge);
  ledger.challengesIssuedThisTurn.push(challenge);
}

/**
 * PATH (b): a destructive tool with no preview form was denied. The denial IS the question — attempting
 * the act is what puts it on the user's screen. Its meaning is the label the spec declared; a tool with
 * no label issues nothing, so it can never be consented to and never runs.
 */
export function issueChallengeForVeto(ledger: TurnLedger, tool: string): void {
  const meaning = ledger.destructiveLabels[tool];
  if (!meaning) return;
  issueChallenge(ledger, { tool, meaning });
}
```

- [ ] **Step 7: Add the ctx field**

In `packages/core/src/rules.ts`, inside `GuardCtx`:

```ts
  /** The consent challenges the CURRENT turn's incoming message consumed. The whole licensing surface for
   *  a destructive act: a guard asks whether one of these is about the call in front of it, and never
   *  reads text or history to decide. Absent ⇒ empty (no consent arrived). */
  consent?: ReadonlyArray<Challenge>;
```

with `import type { Challenge } from './runtime/challenge.js';`.

Thread it wherever the runtime builds a `GuardCtx` — find the sites with:

```bash
grep -rn "userText: ledger.currentUserText" packages/core/src packages/mastra/src | grep -v /dist/
```

and add `consent: ledger.consentThisTurn,` beside it in each.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm -C packages/core exec vitest run test/challenge-ledger.test.ts && pnpm -C packages/core test`
Expected: the new file PASSES, 7 tests. The existing suite still passes.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/runtime/ledger.ts packages/core/src/rules.ts packages/core/src/guards/honesty.ts packages/core/test/challenge-ledger.test.ts
git commit -m "feat(core): the runtime issues consent challenges and reads the user's answer"
```

---

### Task 5: Render the challenge into the delivered text

**Files:**
- Modify: `packages/core/src/runtime/turn.ts`
- Test: `packages/core/test/challenge-render.test.ts`

**Interfaces:**
- Consumes: `TurnLedger.challengesIssuedThisTurn` (Task 4), `EngineText` (Task 3)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/challenge-render.test.ts
import { describe, it, expect } from 'vitest';
import { composeDeliveryText } from '../src/runtime/turn.js';
import type { Challenge } from '../src/runtime/challenge.js';

const challenge: Challenge = {
  tool: 'cancelBooking',
  subject: 'BK-1',
  meaning: 'BK-1',
  token: 'CONFIRM BK-1',
  issuedTurn: 0,
};

describe('composeDeliveryText', () => {
  it('puts the challenge between the prose and the record', () => {
    expect(composeDeliveryText('Your booking BK-1 carries a fee.', [{ op: 'inform' }], [challenge])).toBe(
      'Your booking BK-1 carries a fee.\n\n' +
        'To confirm BK-1, reply: CONFIRM BK-1\n\n' +
        'No operation was carried out on this turn.',
    );
  });

  it('delivers the record alone when no challenge was issued', () => {
    expect(composeDeliveryText('All set.', [{ op: 'inform' }], [])).toBe(
      'All set.\n\nNo operation was carried out on this turn.',
    );
  });

  it('renders one line per challenge issued this turn', () => {
    const second: Challenge = { ...challenge, subject: 'BK-2', meaning: 'BK-2', token: 'CONFIRM BK-2' };
    const text = composeDeliveryText('Two bookings carry fees.', [{ op: 'inform' }], [challenge, second]);
    expect(text).toContain('To confirm BK-1, reply: CONFIRM BK-1');
    expect(text).toContain('To confirm BK-2, reply: CONFIRM BK-2');
  });

  it('speaks the sentences the host declared', () => {
    const text = composeDeliveryText('Pronto.', [{ op: 'inform' }], [challenge], {
      engineText: {
        recordClosureNone: 'Nenhuma operação foi realizada neste turno.',
        challenge: (meaning, token) => `Para confirmar ${meaning}, responda: ${token}`,
      },
    });
    expect(text).toBe(
      'Pronto.\n\n' +
        'Para confirmar BK-1, responda: CONFIRM BK-1\n\n' +
        'Nenhuma operação foi realizada neste turno.',
    );
  });
});
```

The TOKEN is engine-issued and identical whatever language the sentence around it is in: the user types
the same literal either way, and the host's declaration is what makes the instruction readable.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C packages/core exec vitest run test/challenge-render.test.ts`
Expected: FAIL — `composeDeliveryText` is not exported.

- [ ] **Step 3: Rewrite `composeDelivery` around a testable core**

In `packages/core/src/runtime/turn.ts`, replace `composeDelivery` with:

```ts
/**
 * The DELIVERED text: the agent's `message`, then the CHALLENGES this turn issued, then the engine's
 * OPERATION RECORD. The two engine blocks are the parts the agent does not write — the question it must
 * not be able to reframe, and the account of what changed it must not be able to soften.
 *
 * EVERY delivery carries the record, with no exception and no configuration. A turn that declared only
 * speech carries the empty-case closure — the sentence that denies whatever operation the prose beside
 * it may have claimed.
 */
export function composeDeliveryText(
  message: string,
  did: Intention[],
  challenges: readonly Challenge[],
  contract?: Pick<DomainContract, 'renderClaim' | 'outcomes' | 'engineText'>,
): string {
  const text = resolveEngineText(contract?.engineText);
  const report = renderOperationReport(did, {
    renderClaim: contract?.renderClaim,
    outcomes: contract?.outcomes,
    text,
  });
  const ask = challenges.map((c) => text.challenge(c.meaning, c.token)).join('\n');
  return [message.trim(), ask, report].filter((s) => s.trim()).join('\n\n');
}

function composeDelivery(payload: RespondPayload, ledger: TurnLedger, contract?: DomainContract): string {
  return composeDeliveryText(payload.message, payload.did, ledger.challengesIssuedThisTurn, contract);
}
```

Add the imports it needs: `resolveEngineText` from `./engine-text.js`, `type Challenge` from
`./challenge.js`. Update the two `composeDelivery(payload, contract)` call sites to pass `ledger`, and
pass `text` through to `renderOperationReport` at the other two call sites in this file
(`deriveExhaustionClosure`, `withBlankFloor`) so the closure and the floor speak the same language.

- [ ] **Step 4: Extend the blank floor**

In `withBlankFloor`, a turn whose prose is blank but which ISSUED a challenge has something to deliver:

```ts
  if (!isBlankDelivery(payload.message) || record.hasOperations || ledger.challengesIssuedThisTurn.length) {
```

Add `ledger` to its call if it is not already a parameter (it is), and update the comment above the
branch to state the rule: prose gone AND nothing changed AND nothing asked is the case with nothing to
deliver.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm -C packages/core exec vitest run test/challenge-render.test.ts && pnpm -C packages/core test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/runtime/turn.ts packages/core/test/challenge-render.test.ts
git commit -m "feat(core): the delivered text carries the engine's consent question"
```

---

### Task 6: `confirmFirst` becomes one rule

**Files:**
- Modify: `packages/core/src/guards/confirmation.ts` (rewrite `confirmFirst`, delete `noActAfterAskSameTurn` and `pendingConfirmMustAsk`)
- Modify: `packages/core/src/guards/shared.ts` (delete `askedInDeliveredTurn`)
- Modify: `packages/core/src/guards/index.ts`, `packages/core/src/index.ts`, `packages/core/src/guards/catalog.ts`
- Test: `packages/core/test/guards-confirmation.test.ts` (rewrite the confirm-family cases)

**Interfaces:**
- Consumes: `GuardCtx.consent` (Task 4), `challengeMatchesCall` (Task 2)
- Produces: `confirmFirst(): Guard` — no options

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/guards-confirmation.test.ts
import { describe, it, expect } from 'vitest';
import { confirmFirst } from '../src/guards/confirmation.js';
import type { Challenge } from '../src/runtime/challenge.js';
import type { GuardCtx } from '../src/rules.js';

const consented: Challenge = {
  tool: 'cancelBooking',
  subject: 'BK-1',
  meaning: 'BK-1',
  token: 'CONFIRM BK-1',
  issuedTurn: 0,
  consumedTurn: 1,
};

const ctx = (over: Partial<GuardCtx>): GuardCtx =>
  ({
    args: {},
    world: {} as GuardCtx['world'],
    observed: [],
    turnIndex: 1,
    userText: '',
    history: [],
    ...over,
  }) as GuardCtx;

describe('confirmFirst', () => {
  it('allows the act the user consented to', () => {
    const g = confirmFirst();
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-1' }, consent: [consented] }))).toBeNull();
  });

  it('denies the act when no consent arrived', () => {
    const g = confirmFirst();
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-1' }, consent: [] }))).toContain('confirm');
  });

  it('denies an act on a record the consent does not name', () => {
    const g = confirmFirst();
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-12' }, consent: [consented] }))).not.toBeNull();
  });

  it('denies an act on a different tool', () => {
    const g = confirmFirst();
    expect(g.check(ctx({ tool: 'deleteBooking', args: { id: 'BK-1' }, consent: [consented] }))).not.toBeNull();
  });

  it('denies when the ctx carries no consent field at all', () => {
    const g = confirmFirst();
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-1' } }))).not.toBeNull();
  });

  it('names no tool in the sentence the user could ever read', () => {
    const g = confirmFirst();
    expect(g.prose()).not.toContain('cancelBooking');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C packages/core exec vitest run test/guards-confirmation.test.ts`
Expected: FAIL — the current `confirmFirst` reads `ctx.args[flag]` and returns null.

- [ ] **Step 3: Rewrite the guard**

Replace the whole of `confirmFirst` in `packages/core/src/guards/confirmation.ts` with:

```ts
/**
 * A destructive tool runs only on a turn whose incoming message carried the engine's consent token for
 * THIS record.
 *
 * The guard is a pure read of `ctx.consent` — the challenges the runtime already matched against the
 * user's own words. It reads no text, keeps no state, and accepts no declaration: an agent has no
 * channel through which to produce a consent, because consent is a literal only the engine issued and
 * only the user can type.
 *
 * ```
 *   open challenge   CONFIRM BK-1
 *   user types       "yes, CONFIRM BK-1"     → cancelBooking({id:'BK-1'}) runs
 *   user types       "go ahead"              → denied; the question is asked again
 *   user types       "cancel the BK-12"      → denied; BK-12 is not BK-1
 * ```
 *
 * A denial is what PUTS the question on the user's screen for a tool the world has no preview form for,
 * so attempting the act is what asks for permission to do it.
 */
export function confirmFirst(): Guard {
  return {
    kind: 'confirmFirst',
    dim: 'run',
    check(ctx) {
      if (!ctx.tool) return null;
      const consent = ctx.consent ?? [];
      const licensed = consent.some((c) => challengeMatchesCall(c, ctx.tool!, ctx.args));
      return licensed
        ? null
        : 'The user has not confirmed this action. Do not run it — reply to them, and run it only after their next message carries the confirmation they were asked for.';
    },
    prose: () =>
      'a destructive action runs only after the user has typed back the confirmation they were shown — never on the strength of anything you say or declare',
  };
}
```

Add `import { challengeMatchesCall } from '../runtime/challenge.js';` and delete the now-unused
`canonArgs`, `askedInDeliveredTurn`, `hasAskIntent`, `isAskEvent`, `isBlankDelivery` imports that only
those functions used (keep what `destructiveThrottle` still needs).

- [ ] **Step 4: Delete the two kinds**

Delete `noActAfterAskSameTurn` and `pendingConfirmMustAsk` entirely from
`packages/core/src/guards/confirmation.ts`, and delete `askedInDeliveredTurn` from
`packages/core/src/guards/shared.ts`.

Remove their exports from `packages/core/src/guards/index.ts` and `packages/core/src/index.ts`.

- [ ] **Step 5: Update the catalog**

In `packages/core/src/guards/catalog.ts`:

1. Delete the `noActAfterAskSameTurn` and `pendingConfirmMustAsk` entries.
2. Replace the `confirmFirst` entry's `whenToUse` and `example`:

```ts
  {
    name: 'confirmFirst',
    // keep the entry's existing dim/hook/target fields unchanged
    whenToUse:
      'The user must have agreed before this call runs, and the agreement has to be theirs: the engine issues a confirmation token naming the record, renders it into the delivered text, and this gate allows the act only on a turn whose incoming message carried that token. It takes no options — there is nothing to configure, because there is no declaration to trust. Its neighbours answer different questions: `destructiveThrottle` caps the blast radius of a turn that IS confirmed, and `consentRequired` reads a standing world flag rather than the conversation. A destructive tool that acts on no identifiable record needs a declared label on the spec, or it can issue no question and never runs.',
    example: `confirmFirst()`,
  },
```

3. Leave `CONFIRM_CLASS_KINDS` as it stands — `confirmFirst`, `destructiveThrottle` and `precondition`
   are all still shipped kinds.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm -C packages/core exec vitest run test/guards-confirmation.test.ts`
Expected: PASS, 6 tests.

Then: `pnpm -C packages/core exec vitest run test/guard-catalog-parity.test.ts`
Expected: PASS — the catalog names exactly the shipped kinds.

- [ ] **Step 7: Pin the `ask` incentive law**

A self-declared signal is safe only where declaring it to excess costs the declarer. Append to
`packages/core/test/laws.test.ts`:

```ts
import { operationRecord } from '../src/runtime/claims.js';
import { DEFAULT_ENGINE_TEXT } from '../src/runtime/engine-text.js';
import { isLieCheckEligible } from '../src/runtime/lie-check.js';

describe('a declared ask relieves the agent of nothing', () => {
  it('renders no operation line, so it cannot soften the record', () => {
    const record = operationRecord([{ op: 'ask' }]);
    expect(record.lines).toEqual([]);
    expect(record.hasOperations).toBe(false);
    expect(record.text).toBe(DEFAULT_ENGINE_TEXT.recordClosureNone);
  });

  it('leaves the prose eligible for the lie check', () => {
    expect(isLieCheckEligible([{ op: 'ask' }])).toBe(true);
  });
});
```

If `lie-check.ts` has no `isLieCheckEligible` export, add one that returns
`!operationRecord(did).hasOperations` — the eligibility rule the reply pipeline already applies — and use
it at the pipeline's existing decision point so the test pins the shipped path rather than a copy.

- [ ] **Step 8: Rewrite the suites that exercise the deleted kinds**

Run: `pnpm -C packages/core test`

Every failure is a test asserting a rule this design deletes. Rewrite each to the shipped rule — never
skip, never weaken. The files to expect: `test/guards-structural.test.ts`, `test/claims-guards.test.ts`,
`test/redteam/*.test.ts`, `test/proofs/*`. A red-team case that asserted "a declared ask licenses an act"
becomes "a declared ask licenses NOTHING".

- [ ] **Step 9: Commit**

```bash
git add packages/core/src packages/core/test
git commit -m "feat!(core): consent is an engine-issued token, and the ask licenses nothing"
```

---

### Task 7: Destructive labels on the spec

**Files:**
- Modify: `packages/core/src/spec.ts`
- Test: `packages/core/test/agent-spec.test.ts` (add the label cases)

**Interfaces:**
- Consumes: `deriveToken` (Task 2)
- Produces: `AgentSpecConfig.destructiveLabels?: Record<string, string>`, `AgentSpecBase.destructiveLabels`

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/agent-spec.test.ts`:

```ts
describe('destructiveLabels', () => {
  const base = {
    id: 'a',
    mode: 'm',
    persona: 'p',
    surface: { tools: ['deleteAllData', 'deleteEverything'] },
    tools: ['deleteAllData', 'deleteEverything'],
  };

  it('rejects a label for a tool that is not destructive', () => {
    expect(
      () =>
        new AgentSpecBase({
          ...base,
          destructiveTools: ['deleteAllData'],
          destructiveLabels: { deleteEverything: 'delete everything' },
        } as never),
    ).toThrow(/not in destructiveTools/);
  });

  it('rejects two labels whose derived tokens collide', () => {
    expect(
      () =>
        new AgentSpecBase({
          ...base,
          destructiveTools: ['deleteAllData', 'deleteEverything'],
          destructiveLabels: {
            deleteAllData: 'delete all of your data',
            deleteEverything: 'delete all of your bookings',
          },
        } as never),
    ).toThrow(/CONFIRM DELETE-ALL/);
  });

  it('accepts labels whose derived tokens differ', () => {
    expect(
      () =>
        new AgentSpecBase({
          ...base,
          destructiveTools: ['deleteAllData', 'deleteEverything'],
          destructiveLabels: {
            deleteAllData: 'delete all of your data',
            deleteEverything: 'close your account',
          },
        } as never),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C packages/core exec vitest run test/agent-spec.test.ts -t destructiveLabels`
Expected: FAIL — no throw; `destructiveLabels` is not a config key.

- [ ] **Step 3: Add the config field**

In `AgentSpecConfig`, beside `confirmMechanism`:

```ts
  /** Per destructive tool that acts on NO identifiable record, the human-facing label the consent
   *  question is built from — what the user is agreeing to, in their own language. The engine derives
   *  the token from it, so two labels whose first two words agree are a construction error. A destructive
   *  tool with neither a record nor a label can issue no question, so it can never be consented to. */
  destructiveLabels?: Record<string, string>;
```

Add the field to the class and seat it in the constructor beside `confirmMechanism`:

```ts
  readonly destructiveLabels: Record<string, string>;
  …
    this.destructiveLabels = { ...(cfg.destructiveLabels ?? {}) };
```

- [ ] **Step 4: Validate it in `installBase`**

Right after the `strayMech` check, add:

```ts
    // A label for a tool that is not destructive gates nothing — the same silent-no-op class the stray
    // mechanism check closes.
    const strayLabel = Object.keys(this.destructiveLabels).filter((t) => !destructive.includes(t));
    if (strayLabel.length) {
      throw new Error(
        `AgentSpec "${this.id}": destructiveLabels names tool(s) that are not in destructiveTools: ${strayLabel.join(', ')}.`,
      );
    }
    // Two labels that derive the SAME token would give the user one literal for two different acts:
    // typing it would consent to whichever challenge is open, which is not what they read.
    const byToken = new Map<string, string>();
    for (const [tool, label] of Object.entries(this.destructiveLabels)) {
      const token = `CONFIRM ${deriveToken(label)}`;
      const owner = byToken.get(token);
      if (owner) {
        throw new Error(
          `AgentSpec "${this.id}": destructiveLabels for "${owner}" and "${tool}" both derive the token "${token}". ` +
            'One typed literal would consent to either act. Give them labels whose first two words differ.',
        );
      }
      byToken.set(token, tool);
    }
```

with `import { deriveToken } from './runtime/challenge.js';`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm -C packages/core exec vitest run test/agent-spec.test.ts`
Expected: PASS.

- [ ] **Step 6: Thread the labels to the ledger**

Find where the runtime creates the ledger for a spec conversation:

```bash
grep -rn "createLedger(" packages/core/src packages/mastra/src | grep -v /dist/
```

At each site that has the spec to hand, set `ledger.destructiveLabels = spec.destructiveLabels ?? {};`
immediately after creation. Where a veto is recorded for a destructive tool, call
`issueChallengeForVeto(ledger, name)` — find the veto site with:

```bash
grep -rn "recordVeto(" packages/core/src packages/mastra/src | grep -v /dist/
```

- [ ] **Step 7: Run the full suite**

Run: `pnpm -r typecheck && pnpm -C packages/core test && pnpm -C packages/mastra test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src packages/core/test packages/mastra/src
git commit -m "feat!(core): a destructive act with no record declares the label its question is built from"
```

---

### Task 8: `askedEarlier` becomes `valueFromUser`

**Files:**
- Modify: `packages/core/src/guards/structural.ts`
- Modify: `packages/core/src/guards/index.ts`, `packages/core/src/index.ts`, `packages/core/src/guards/catalog.ts`
- Test: `packages/core/test/guards-structural.test.ts`

**Interfaces:**
- Consumes: `valueSpokenBy` (Task 1)
- Produces: `valueFromUser(opts: { arg: string }): Guard`

- [ ] **Step 1: Write the failing test**

Replace the `askedEarlier` block in `packages/core/test/guards-structural.test.ts` with:

```ts
import { valueFromUser } from '../src/guards/structural.js';
import type { GuardCtx } from '../src/rules.js';

const ctx = (over: Partial<GuardCtx>): GuardCtx =>
  ({
    args: {},
    world: {} as GuardCtx['world'],
    observed: [],
    turnIndex: 1,
    userText: '',
    history: [],
    ...over,
  }) as GuardCtx;

describe('valueFromUser', () => {
  const g = valueFromUser({ arg: 'email' });

  it('allows a value the user said this turn', () => {
    expect(g.check(ctx({ tool: 'saveLead', args: { email: 'marcos@x.com' }, userText: 'my email is marcos@x.com' }))).toBeNull();
  });

  it('denies a value the user never said', () => {
    expect(g.check(ctx({ tool: 'saveLead', args: { email: 'guess@y.com' }, userText: 'my email is marcos@x.com' }))).not.toBeNull();
  });

  it('allows a value the user said on an earlier turn', () => {
    expect(
      g.check(
        ctx({
          tool: 'saveLead',
          args: { email: 'marcos@x.com' },
          userText: 'go ahead',
          history: [{ turnIndex: 0, userText: 'my email is marcos@x.com', reply: '', toolCalls: [], did: [], attemptedCalls: [], guardEvents: [] }],
        }),
      ),
    ).toBeNull();
  });

  it('denies a paraphrase of what the user said', () => {
    const d = valueFromUser({ arg: 'diagnosis' });
    expect(d.check(ctx({ tool: 'saveCase', args: { diagnosis: 'engine seized' }, userText: 'the engine locked up' }))).not.toBeNull();
  });

  it('is silent when the gated argument is absent', () => {
    expect(g.check(ctx({ tool: 'saveLead', args: {}, userText: '' }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C packages/core exec vitest run test/guards-structural.test.ts`
Expected: FAIL — `valueFromUser` is not exported.

- [ ] **Step 3: Rewrite the guard**

Replace the whole of `packages/core/src/guards/structural.ts`:

```ts
/**
 * STRUCTURAL guards — the kind that keys ONLY on values the conversation itself produced. No text is
 * ever pattern-matched: matching is the engine's one law (whole tokens, contiguous, whole-value equal).
 */
import type { Guard, GuardCtx } from '../rules.js';
import { valueSpokenBy } from './matching.js';

/**
 * A value the agent records on the user's behalf must be a value the USER SAID.
 *
 * ```
 *   user says   "my email is marcos@x.com"
 *   saveLead({ email:'marcos@x.com' })   allowed — the user said it
 *   saveLead({ email:'guess@y.com' })    denied  — the agent invented it
 *
 *   user says   "the engine locked up"
 *   saveCase({ diagnosis:'engine seized' })        denied — a paraphrase is the agent's words
 *   saveCase({ diagnosis:'the engine locked up' }) allowed
 * ```
 *
 * The world receives the person's own words, not the agent's normalization. Every turn of the
 * conversation counts, this one included: a value the user supplied is theirs however long ago they
 * said it, and nothing about a later turn unsays it.
 *
 * Fires only when the gated argument is present on this call — an absent arg is not this guard's
 * business.
 */
export function valueFromUser(opts: { arg: string }): Guard {
  const arg = opts.arg;
  return {
    kind: 'valueFromUser',
    dim: 'run',
    check(ctx: GuardCtx): string | null {
      const v = ctx.args[arg];
      if (typeof v !== 'string' || v === '') return null;
      if (valueSpokenBy(v, ctx.userText)) return null;
      if (ctx.history.some((t) => valueSpokenBy(v, t.userText))) return null;
      return `Record ${arg} only with the value the user gave you, in their own words — do not supply or rephrase it.`;
    },
    prose: () => `record ${arg} only using the exact words the user gave you — never your own rephrasing`,
  };
}
```

- [ ] **Step 4: Update the exports and the catalog**

In `packages/core/src/guards/index.ts` and `packages/core/src/index.ts`, replace `askedEarlier` with
`valueFromUser`.

In `packages/core/src/guards/catalog.ts`, replace the `askedEarlier` entry's `name`, `whenToUse` and
`example`:

```ts
    name: 'valueFromUser',
    whenToUse:
      'A field the agent fills in on the user\'s behalf must carry the user\'s own words. It compares the recorded value against everything the user has said in the conversation, as a contiguous run of whole tokens — so an invented value is denied and so is a paraphrase, because the world is meant to receive what the person said rather than the agent\'s normalization of it.',
    example: `valueFromUser({ arg: 'email' })`,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm -C packages/core exec vitest run test/guards-structural.test.ts test/guard-catalog-parity.test.ts`
Expected: PASS.

- [ ] **Step 6: Fix every remaining reference**

Run: `pnpm -r typecheck && pnpm -r test`

Update each `askedEarlier` call site the compiler names. Find them with:

```bash
grep -rn "askedEarlier" packages docs examples --include="*.ts" | grep -v /dist/
```

- [ ] **Step 7: Commit**

```bash
git add packages docs examples
git commit -m "feat!(core): a value recorded for the user must be the user's own words"
```

---

### Task 9: The canonical guard chapter and the tutorial

**Files:**
- Modify: `packages/core/GUARDS.md`
- Modify: `docs/tutorial/01-concepts.md`, `03-agent-anatomy.md`, `04-guards.md`, `05-running-and-eval.md`, `06-advanced.md`
- Modify: `docs/tutorial/snippets/scheduler/spec.ts`, `docs/tutorial/snippets/scheduler/tools.ts`, `docs/tutorial/snippets/scheduler-subject/evals/cases.ts`, `docs/tutorial/snippets/test/05-running-and-eval.test.ts`

- [ ] **Step 1: Rewrite the guarantee section of `GUARDS.md`**

The four rows the design's §14 states, replacing the consent rows that read "self-declared":

```markdown
| Property | Deterministic? |
|---|---|
| A real action cannot be HIDDEN (`claimIsComplete`) | **YES** |
| A claim cannot be FABRICATED (`claimIsGrounded`) | **YES** |
| Every finalized turn declares ≥1 intention | **YES** |
| The user saw a question about this exact act | **YES** — the engine wrote it |
| The question names what it authorizes | **YES** — the world's record or the spec's label |
| The user agreed | **YES** — their own words carry the engine's token |
| An operational LIE in free prose | **NO** — the operation record contradicts it |
```

- [ ] **Step 2: Rewrite the consent chapter of `GUARDS.md`**

Replace every passage describing the ask signal, `via`, `within`, `askedInDeliveredTurn`,
`pendingConfirmMustAsk` and `noActAfterAskSameTurn` with the shipped mechanism: the challenge lifecycle
(issue from a `requiresConfirmation` result or a denial, render, consume, single use), the one matching
law, and the world/spec obligations table from the design's §12.

Add the `ask` incentive law verbatim from the design's §10 — the two tables of what may and may not
read a self-declared signal.

- [ ] **Step 3: Update the tutorial prose**

| File | Change |
|---|---|
| `01-concepts.md` | consent is introduced as a token the engine issues and the user types back |
| `03-agent-anatomy.md` | the `did` op list keeps `ask`, described as a speech classification that licenses nothing |
| `04-guards.md` | the confirm-gate lesson is the challenge lifecycle; `confirmFirst()` takes no options |
| `05-running-and-eval.md` | the consent scenario's user turn carries the token |
| `06-advanced.md` | the one guard reference follows the new name |

- [ ] **Step 4: Update the taught domain**

In `docs/tutorial/snippets/scheduler/tools.ts`, the destructive tool returns `requiresConfirmation`
with the record under an identity key. In `spec.ts`, `confirmFirst()` takes no options; a destructive
tool with no record declares its label in `destructiveLabels`. In the eval cases, the confirming user
turn types the engine's token.

- [ ] **Step 5: Regenerate the chapter and verify**

```bash
pnpm docs:guards
pnpm -r typecheck
pnpm test
```

Expected: PASS, including the chapter-in-sync check that `pnpm test` runs.

- [ ] **Step 6: Commit**

```bash
git add packages/core/GUARDS.md docs/tutorial
git commit -m "docs: the guard chapter and the tutorial teach consent by challenge"
```

---

### Task 10: The governance skill and the agentspec skill

**Files:**
- Modify: `skills/looprun-governance/references/proof-case-authoring.md`
- Modify: `skills/looprun-governance/scripts/scaffold-proof-cases.mjs`
- Modify (separate repo, leak-reviewed per file): `~/Dev/js/looprun/agentspec/skill/references/guard-catalog.md`, `norms.md`, `spec-template.ts`, `test.md`

- [ ] **Step 1: Update the governance skill**

In `proof-case-authoring.md`, the consent proof case is authored as a two-turn shape: a turn that
attempts the act and receives the challenge, then a turn whose user text carries the token.

In `scaffold-proof-cases.mjs`, the scaffolded consent case emits that same two-turn shape.

- [ ] **Step 2: Run the governance gate**

```bash
pnpm test:proofs
```

Expected: PASS.

- [ ] **Step 3: Commit the looprun side**

```bash
git add skills/looprun-governance
git commit -m "docs(skill): a consent proof case is a challenge and the turn that answers it"
```

- [ ] **Step 4: Update the agentspec skill**

In the `agentspec` repo, on its own branch:

| File | Change |
|---|---|
| `references/guard-catalog.md` | the `confirmFirst` entry takes no options; the two deleted kinds go; `askedEarlier` becomes `valueFromUser` |
| `references/norms.md` | the consent norm is the challenge; the world/spec obligations gain the label |
| `references/spec-template.ts` | the destructive tool shape carries `destructiveLabels` |
| `references/test.md` | a consent case types the token |

- [ ] **Step 5: Lint and commit the agentspec side**

```bash
cd ~/Dev/js/looprun/agentspec
node skill/scripts/lint-guard-catalog.mjs
node skill/scripts/lint-authoring.mjs
git add skill && git commit -m "docs(skill): consent is an engine-issued token"
```

- [ ] **Step 6: Whole-repo verification**

```bash
cd ~/Dev/js/looprun/looprun
pnpm -r typecheck && pnpm -r test && pnpm test:proofs && pnpm docs:guards
git status --porcelain
```

Expected: every suite PASSES, and `pnpm docs:guards` leaves the tree clean.
