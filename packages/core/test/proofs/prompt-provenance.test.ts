/**
 * AssembledPrompt PROVENANCE — the MECHANISM proof.
 *
 * WHERE THIS LIVES AND WHY. The mechanism (render → attributed table → fold) is runtime code and is
 * proven HERE, on the domain-neutral fixture domain/specs, exactly like every other guard-proof: it
 * must hold for ANY bundle. Auditing the prose of a REAL bundle is a different job — a fact about that
 * business's content, belonging to that bundle's own test lane.
 *
 * THE INVARIANT THAT GATES EVERYTHING ELSE: the fold is byte-identical to the pre-refactor join. The
 * shared-prefix law, the cacheable prefix, and every certified number measured against them depend
 * on it.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase } from '../../src/spec.js';
import { argRequired, mustAccountFor, custom, forbidThisTurn, jargonScrub, maxCalls } from '../../src/guards/index.js';
import { renderAssembledPrompt, renderPromptBlocks } from '../../src/assembled-prompt.js';
import { GUARD_KIND_SUBJECT, derivePolarity, deriveSubject, foldPrompt } from '../../src/prompt-fold.js';
import type { PromptBlock, PromptLine } from '../../src/prompt-fold.js';
import { FIXTURE_DOMAIN, FIXTURE_TOOL_NAMES, FixtureWorld } from '../../src/testing/index.js';

const world = new FixtureWorld('seeded-media');

/** Flatten the attributed table to its lines — the view every provenance assertion reads. */
const assembledPromptLines = (blocks: readonly PromptBlock[]): PromptLine[] => blocks.flatMap((b) => b.rows.flatMap((r) => r.lines));

function spec(): AgentSpecBase {
  return new AgentSpecBase({
    id: 'provenance-proof',
    mode: 'PROOF',
    persona: 'You are the proof agent.',
    scope: {
      lane: 'items and media',
      others: [{ label: 'the billing team', covers: 'invoices and refunds' }],
    },
    tools: [...FIXTURE_TOOL_NAMES],
    flow: [{ from: 'searchItem', to: 'updateItem' }],
    behavior: ['Be brief and concrete.'],
    directives: [{ id: 'd1', cond: 'no items exist', directive: 'offer to create the first one' }],
    destructiveTools: ['deleteItem', 'purgeAll'],
    confirmMechanism: { purgeAll: 'prior-ask' },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe('the assembledPrompt is a FOLD over an attributed table (byte-identity is the arbiter)', () => {
  it('foldPrompt(renderPromptBlocks(...)) IS renderAssembledPrompt(...)', () => {
    const s = spec();
    expect(foldPrompt(renderPromptBlocks(s, FIXTURE_DOMAIN))).toBe(renderAssembledPrompt(world, s, [], FIXTURE_DOMAIN));
  });

  it('every rendered byte is accounted for by some PromptLine (nothing is invented by the fold)', () => {
    const assembledPrompt = renderAssembledPrompt(world, spec(), [], FIXTURE_DOMAIN);
    for (const l of assembledPromptLines(renderPromptBlocks(spec(), FIXTURE_DOMAIN))) {
      expect(assembledPrompt).toContain(l.text);
    }
  });

  it('the subject lexicon is inert on the BYTES — it only populates provenance', () => {
    const s = spec();
    const bare = foldPrompt(renderPromptBlocks(s, FIXTURE_DOMAIN));
    const withLex = foldPrompt(
      renderPromptBlocks(s, FIXTURE_DOMAIN, { lexicon: [{ subject: 'output-language', re: /language/i }] }),
    );
    expect(withLex).toBe(bare);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('provenance: owner / section / hook / target survive the render', () => {
  const lines = assembledPromptLines(renderPromptBlocks(spec(), FIXTURE_DOMAIN));
  const owners = new Set(lines.map((l) => l.owner));

  it('names every emitting layer', () => {
    for (const o of ['domain.voice', 'domain.coreInvariants', 'domain.languageClause', 'spec.scope', 'spec.flow', 'spec.persona', 'spec.behavior', 'spec.controls.directives']) {
      expect(owners, `missing owner ${o}`).toContain(o);
    }
    expect([...owners].some((o) => o.startsWith('guard:'))).toBe(true);
  });

  it('a guard-owned line carries its hook and target', () => {
    const confirm = lines.find((l) => l.owner === 'guard:confirmFirst');
    expect(confirm?.hook).toBe('preTool');
    expect(confirm?.target).not.toBe('any');
    const reply = lines.find((l) => l.owner === 'guard:degenerationGuard');
    expect(reply?.hook).toBe('onReply');
    expect(reply?.target).toBe('any');
  });

  it('a `## Tool rules` row keeps ONE line per guard (the `; ` composition is not one opaque string)', () => {
    const blocks = renderPromptBlocks(spec(), FIXTURE_DOMAIN);
    const toolBlock = blocks.find((b) => b.heading === '## Tool rules')!;
    const deleteRow = toolBlock.rows.find((r) => r.prefix.includes('deleteItem'))!;
    expect(deleteRow.lines.length).toBeGreaterThan(1);
    expect(deleteRow.lines.every((l) => l.owner.startsWith('guard:'))).toBe(true);
    expect(deleteRow.lines.every((l) => l.tool === 'deleteItem')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('subject + polarity derivation is deterministic', () => {
  it('the guard KIND wins over the lexicon (the machine-owned answer is the precise one)', () => {
    expect(deriveSubject('anything at all', { guardKind: 'confirmFirst', lexicon: [{ subject: 'x', re: /.*/ }] }))
      .toBe('confirm-before-destructive');
  });

  it('falls back to the FIRST matching injected rule, then to null', () => {
    const lex = [{ subject: 'output-language', re: /language/i }, { subject: 'other', re: /language/i }];
    expect(deriveSubject('reply in the user language', { lexicon: lex })).toBe('output-language');
    expect(deriveSubject('something with no known subject', { lexicon: lex })).toBeNull();
  });

  it('a plain prohibition is `forbid`, a plain obligation is `require`, neither is `inform`', () => {
    expect(derivePolarity('never repeat a tool call in the same turn')).toBe('forbid');
    expect(derivePolarity('always pass "id"')).toBe('require');
    expect(derivePolarity('items belong to this workspace')).toBe('inform');
  });

  it('a prohibition QUALIFIED by an exception connective is a requirement, not its opposite', () => {
    // "never X without Y" and "always Y before X" are ONE rule — the shape that made the first cut of
    // query (a) report hundreds of fabricated contradictions on a real bundle.
    expect(derivePolarity('never move money without an explicit user confirmation')).toBe('require');
    expect(derivePolarity('do not act until the user has answered')).toBe('require');
  });

  it('a MIXED line has no clean polarity — it is `inform`, not a coin-flip', () => {
    expect(derivePolarity('you must read the record first; never estimate a figure')).toBe('inform');
  });

  it('the markers are ENGLISH-only by design — non-English prose derives `inform`', () => {
    // The assembled prompt is always rendered in English (the language clause tells the model which language to
    // REPLY in; it does not translate the prompt), so a pt-BR line has no marker to match.
    expect(derivePolarity('nunca invente um id')).toBe('inform');
  });

  it('a custom() guard has a free-form kind and therefore NO subject — a lint signal, not a gap', () => {
    const s = spec();
    s.addGuard('preTool', ['createItem'], custom({
      kind: 'houseStyleRule', dim: 'input', check: () => null, prose: () => 'follow the house style',
    }));
    const l = assembledPromptLines(renderPromptBlocks(s, FIXTURE_DOMAIN)).find((x) => x.owner === 'guard:houseStyleRule')!;
    expect(l.subject).toBeNull();
    expect(GUARD_KIND_SUBJECT.houseStyleRule).toBeUndefined();
  });

  it('every guard kind installed by AgentSpecBase itself has a subject (the always-on layer is covered)', () => {
    const auto = assembledPromptLines(renderPromptBlocks(spec(), FIXTURE_DOMAIN))
      .filter((l) => l.owner.startsWith('guard:'));
    expect(auto.length).toBeGreaterThan(0);
    expect(auto.filter((l) => l.subject === null).map((l) => l.owner)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('a reply MUTATOR carries no prose and therefore no bytes', () => {
  it('installing a jargonScrub leaves the rendered assembledPrompt byte-identical', () => {
    const s = spec();
    const before = renderAssembledPrompt(world, s, [], FIXTURE_DOMAIN);
    s.addMutator(jargonScrub({ SKU: 'item code' }), { id: 'agent:jargonScrub' });
    // A `ReplyMutator` is `{ kind, apply }` — no `prose()`, so it never enters assembled-prompt.ts's fold.
    expect(renderAssembledPrompt(world, s, [], FIXTURE_DOMAIN)).toBe(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('audit finding (i): an onInput rule does NOT render under a "reply" heading', () => {
  it('onInput prose gets its own INPUT section; onReply keeps the reply section', () => {
    const s = spec();
    s.addGuard('onInput', 'any', maxCalls('createItem', 2, 'too many', { scope: 'conversation' }));
    s.addReplyCheck(mustAccountFor({ records: ['L-1'], outcome: 'any' }, 'account for it'));
    const blocks = renderPromptBlocks(s, FIXTURE_DOMAIN);
    const headings = blocks.map((b) => b.heading);
    expect(headings).toContain('## Input rules (govern the incoming message — checked before you act)');
    const input = blocks.find((b) => b.heading?.startsWith('## Input rules'))!;
    expect(input.rows.flatMap((r) => r.lines).every((l) => l.hook === 'onInput')).toBe(true);
    const reply = blocks.find((b) => b.heading?.startsWith('## Reply rules'))!;
    expect(reply.rows.flatMap((r) => r.lines).every((l) => l.hook === 'onReply')).toBe(true);
    // AssembledPrompt-static ordering: Input then Reply, both after Tool rules and before Behavior.
    expect(headings.indexOf('## Tool rules')).toBeLessThan(headings.findIndex((h) => h?.startsWith('## Input rules')));
    expect(headings.findIndex((h) => h?.startsWith('## Input rules'))).toBeLessThan(headings.findIndex((h) => h?.startsWith('## Reply rules')));
  });

  it('BYTE-FREE for a spec with no onInput guard (every shipping bundle)', () => {
    const s = spec();
    expect(renderPromptBlocks(s, FIXTURE_DOMAIN).some((b) => b.heading?.startsWith('## Input rules'))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('audit finding (d): the ruleSections dedup is NOT global — and the table proves it', () => {
  it('a prose bound to N tools renders N times, once per tool row', () => {
    const s = spec();
    s.addGuard('preTool', ['createItem', 'updateItem', 'setPrimary'], argRequired('id'));
    const lines = assembledPromptLines(renderPromptBlocks(s, FIXTURE_DOMAIN)).filter((l) => l.owner === 'guard:argRequired');
    expect(lines).toHaveLength(3);
    expect(new Set(lines.map((l) => l.text)).size).toBe(1); // the SAME bytes, three times
  });

  it('the `target:any` sections DO share one order-respecting dedup set', () => {
    const s = spec();
    // The same prose on a global tool hook and on the reply hook: the second is suppressed.
    const p = () => 'do the same thing';
    s.addGuard('preTool', 'any', custom({ kind: 'k1', dim: 'run', check: () => null, prose: p }));
    s.addReplyCheck(custom({ kind: 'k2', dim: 'behavior', check: () => null, prose: p }));
    const hits = assembledPromptLines(renderPromptBlocks(s, FIXTURE_DOMAIN)).filter((l) => l.text === 'do the same thing');
    expect(hits).toHaveLength(1);
    expect(hits[0].section).toBe('## Global tool rules');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('audit finding (ii): a prose written as a full SENTENCE breaks `; ` composition', () => {
  it('the composed row is detectable as malformed — a fragment carrying sentence punctuation', () => {
    const s = spec();
    s.addGuard('preTool', ['createItem'], custom({
      kind: 'sentenceProse', dim: 'run', check: () => null,
      // A complete sentence with internal terminal punctuation: `proseText` only strips the TRAILING
      // '.', so the interior sentence break survives into the `; `-joined row.
      prose: () => 'Creating an item needs a title. Ask for one when it is missing.',
    }));
    const blocks = renderPromptBlocks(s, FIXTURE_DOMAIN);
    const rows = blocks.find((b) => b.heading === '## Tool rules')!.rows.filter((r) => r.prefix.includes('createItem'));
    const fragment = rows.flatMap((r) => r.lines).find((l) => l.owner === 'guard:sentenceProse')!;
    expect(/[.!?]\s/.test(fragment.text)).toBe(true);
  });

  it('a fragment-shaped prose (the correct form) carries no interior sentence break', () => {
    const l = assembledPromptLines(renderPromptBlocks(spec(), FIXTURE_DOMAIN)).find((x) => x.owner === 'guard:destructiveThrottle')!;
    expect(/[.!?]\s/.test(l.text)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('regressions the refactor must not introduce', () => {
  it('a spec with no scope / no flow / no directives renders without those blocks', () => {
    const s = new AgentSpecBase({ id: 'bare', mode: 'M', persona: 'p', tools: ['listItems'] });
    const headings = renderPromptBlocks(s, FIXTURE_DOMAIN).map((b) => b.heading);
    expect(headings).not.toContain('## Scope precedence (OUTRANKS every rule below)');
    expect(headings.some((h) => h?.startsWith('## Flow'))).toBe(false);
    expect(headings.some((h) => h?.startsWith('## Governance'))).toBe(false);
    expect(foldPrompt(renderPromptBlocks(s, FIXTURE_DOMAIN))).toBe(renderAssembledPrompt(world, s, [], FIXTURE_DOMAIN));
  });

  it('a tool-targeted onReply guard still renders under `## Tool rules`, not `## Reply rules`', () => {
    const s = spec();
    s.addGuard('onReply', ['createItem'], mustAccountFor({ records: ['L-1'], outcome: 'any' }, 'account for it'));
    const l = assembledPromptLines(renderPromptBlocks(s, FIXTURE_DOMAIN)).find((x) => x.owner === 'guard:mustAccountFor')!;
    expect(l.section).toBe('## Tool rules');
    expect(l.hook).toBe('onReply');
  });

  it('a forbidThisTurn binding is attributed to its own kind and tool', () => {
    const s = spec();
    s.addGuard('preTool', ['purgeAll'], forbidThisTurn('not now'));
    const l = assembledPromptLines(renderPromptBlocks(s, FIXTURE_DOMAIN)).find((x) => x.owner === 'guard:forbidThisTurn')!;
    expect(l.tool).toBe('purgeAll');
    expect(l.subject).toBe('tool-forbidden');
  });
});
