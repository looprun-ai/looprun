/**
 * Trunk PROVENANCE + the coherence queries — the MECHANISM proofs (2026-07-20).
 *
 * WHERE THIS LIVES AND WHY. The mechanism (render → attributed table → fold; the three queries) is
 * runtime code and is proven HERE, on the domain-neutral fixture domain/specs, exactly like every other
 * guard-proof: it must hold for any bundle, not for atlas. The CENSUS of a real bundle (atlas-r2, plus
 * the tool descriptions in `bench/bench-core/**` and `bench/bench-core/fixtures/tools.json`) is a
 * bench-side fact about business content and lives in `bench/test/trunk-coherence.test.ts`, on the
 * `test:invariants` lane. Putting the census here would import business strings into a package whose
 * neutrality is CI-backstopped.
 *
 * THE INVARIANT THAT GATES EVERYTHING ELSE: the fold is byte-identical to the pre-refactor join. The
 * trunk-static law / D8 cacheable prefix and every certified number measured against it depend on it.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase } from '../../src/spec.js';
import { argRequired, custom, forbidThisTurn, jargonScrub, maxCalls, replySingleQuestion } from '../../src/guards.js';
import { renderScopedSpecTrunk, renderTrunkBlocks } from '../../src/trunk.js';
import {
  GUARD_KIND_SUBJECT, derivePolarity, deriveSubject, findContradictions, findDuplications,
  findMultiOwnerSubjects, findSubjectlessLines, foldTrunk, trunkLines,
  mutatorLines, withPolarityLexicon,
} from '../../src/coherence.js';
import type { NormativeLine, PolarityLexicon } from '../../src/coherence.js';
import { FIXTURE_LEXICON, FIXTURE_DOMAIN, FIXTURE_TOOL_NAMES, FixtureWorld } from '../../src/testing/index.js';

const world = new FixtureWorld('seeded-media');

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
    lexicon: { falseFailureClaimRe: FIXTURE_LEXICON.falseFailureClaimRe, confirmAskRe: FIXTURE_LEXICON.confirmAskRe },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe('the trunk is a FOLD over an attributed table (byte-identity is the arbiter)', () => {
  it('foldTrunk(renderTrunkBlocks(...)) IS renderScopedSpecTrunk(...)', () => {
    const s = spec();
    expect(foldTrunk(renderTrunkBlocks(s, FIXTURE_DOMAIN))).toBe(renderScopedSpecTrunk(world, s, [], FIXTURE_DOMAIN));
  });

  it('every rendered byte is accounted for by some TrunkLine (nothing is invented by the fold)', () => {
    const trunk = renderScopedSpecTrunk(world, spec(), [], FIXTURE_DOMAIN);
    for (const l of trunkLines(renderTrunkBlocks(spec(), FIXTURE_DOMAIN))) {
      expect(trunk).toContain(l.text);
    }
  });

  it('the subject lexicon is inert on the BYTES — it only populates provenance', () => {
    const s = spec();
    const bare = foldTrunk(renderTrunkBlocks(s, FIXTURE_DOMAIN));
    const withLex = foldTrunk(
      renderTrunkBlocks(s, FIXTURE_DOMAIN, { lexicon: [{ subject: 'output-language', re: /language/i }] }),
    );
    expect(withLex).toBe(bare);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('provenance: owner / section / hook / target survive the render', () => {
  const lines = trunkLines(renderTrunkBlocks(spec(), FIXTURE_DOMAIN));
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
    const reply = lines.find((l) => l.owner === 'guard:emptyReply');
    expect(reply?.hook).toBe('onReply');
    expect(reply?.target).toBe('any');
  });

  it('a `## Tool rules` row keeps ONE line per guard (the `; ` composition is not one opaque string)', () => {
    const blocks = renderTrunkBlocks(spec(), FIXTURE_DOMAIN);
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
    // query (a) report ~200 fabricated contradictions on atlas-r2.
    expect(derivePolarity('never move money without an explicit user confirmation')).toBe('require');
    expect(derivePolarity('do not act until the user has answered')).toBe('require');
  });

  it('a MIXED line has no clean polarity — it is `inform`, not a coin-flip', () => {
    expect(derivePolarity('you must read the record first; never estimate a figure')).toBe('inform');
  });

  it('a custom() guard has a free-form kind and therefore NO subject — a lint signal, not a gap', () => {
    const s = spec();
    s.addGuard('preTool', ['createItem'], custom({
      kind: 'houseStyleRule', dim: 'input', check: () => null, prose: () => 'follow the house style',
    }));
    const l = trunkLines(renderTrunkBlocks(s, FIXTURE_DOMAIN)).find((x) => x.owner === 'guard:houseStyleRule')!;
    expect(l.subject).toBeNull();
    expect(GUARD_KIND_SUBJECT.houseStyleRule).toBeUndefined();
    expect(findSubjectlessLines([l])).toHaveLength(1);
  });

  it('every guard kind installed by AgentSpecBase itself has a subject (the always-on layer is covered)', () => {
    const auto = trunkLines(renderTrunkBlocks(spec(), FIXTURE_DOMAIN))
      .filter((l) => l.owner.startsWith('guard:'));
    expect(auto.length).toBeGreaterThan(0);
    expect(auto.filter((l) => l.subject === null).map((l) => l.owner)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B4 — reply MUTATORS are visible to the census (they were invisible: no prose)', () => {
  it('an installed jargonScrub surfaces as an `inform` line with a subject, NOT into the rendered trunk', () => {
    const s = spec();
    const before = renderScopedSpecTrunk(world, s, [], FIXTURE_DOMAIN);
    s.addMutator(jargonScrub({ SKU: 'item code' }), { id: 'agent:jargonScrub' });
    // A mutator has no prose → the RENDERED trunk is byte-identical (it never enters trunk.ts's fold).
    expect(renderScopedSpecTrunk(world, s, [], FIXTURE_DOMAIN)).toBe(before);
    // …but it is now on the CENSUS surface.
    const lines = mutatorLines(s.guards.onReplyMutate);
    expect(lines).toHaveLength(1);
    expect(lines[0].subject).toBe('term-substitution');
    expect(lines[0].polarity).toBe('inform');
    expect(lines[0].owner).toBe('spec.mutator:jargonScrub');
    expect(GUARD_KIND_SUBJECT.jargonScrub).toBe('term-substitution');
  });

  it('a DISABLED mutator is not surfaced (it governs nothing)', () => {
    const s = spec();
    const id = s.addMutator(jargonScrub({ SKU: 'item code' }), { id: 'agent:jargonScrub' });
    const b = s.guards.onReplyMutate!.find((x) => x.id === id)!;
    b.disabled = true;
    expect(mutatorLines(s.guards.onReplyMutate)).toEqual([]);
  });

  it('a surfaced mutator PARTICIPATES in a census query (findMultiOwnerSubjects sees it as an owner)', () => {
    const s = spec();
    s.addMutator(jargonScrub({ SKU: 'item code' }), { id: 'agent:jargonScrub' });
    const other: NormativeLine = { owner: 'tool:x.description', subject: 'term-substitution', polarity: 'inform', text: 'uses the term SKU' };
    const surface = [...mutatorLines(s.guards.onReplyMutate), other];
    const finding = findMultiOwnerSubjects(surface, ['term-substitution'])[0];
    expect(finding.owners).toContain('spec.mutator:jargonScrub');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('I7 — polarity markers are an injectable lexicon (a non-English subject is no longer degraded)', () => {
  const PT: PolarityLexicon = {
    forbid: /\b(?:nunca|não)\b/i,
    require: /\b(?:sempre|deve|precisa)\b/i,
    negativeRequirement: /\b(?:nunca|não)\b[^.;]{0,160}?\b(?:sem|antes de|até que|a menos que)\b/i,
    forbidSrc: 'nunca|não',
  };

  it('the English default MIS-reads pt-BR prohibition prose as `inform` — the degradation I7 names', () => {
    expect(derivePolarity('nunca invente um id')).toBe('inform');
  });

  it('the injected lexicon reads the same pt-BR line correctly', () => {
    expect(derivePolarity('nunca invente um id', PT)).toBe('forbid');
    expect(derivePolarity('sempre confirme antes de cancelar', PT)).toBe('require');
    // pt-BR negative-requirement: "nunca … sem …" is a requirement, not its opposite (mirrors the EN rule).
    expect(derivePolarity('nunca mova dinheiro sem uma confirmação explícita', PT)).toBe('require');
  });

  it('withPolarityLexicon re-derives a whole surface without mutating it (the census entry point)', () => {
    const lines: NormativeLine[] = [{ owner: 'spec.behavior', subject: 'no-fabrication', polarity: 'inform', text: 'nunca invente um id' }];
    const remapped = withPolarityLexicon(lines, PT);
    expect(remapped[0].polarity).toBe('forbid');
    expect(lines[0].polarity).toBe('inform'); // original untouched (pure)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('query (a) CONTRADICTION — same subject, opposite polarity, different owners', () => {
  const L = (owner: string, subject: string, polarity: NormativeLine['polarity'], text = 't'): NormativeLine =>
    ({ owner, subject, polarity, text });

  it('fires across owners', () => {
    const f = findContradictions([L('domain.languageClause', 'output-language', 'require'), L('tool:replyToUser.text', 'output-language', 'forbid')]);
    expect(f).toHaveLength(1);
    expect(f[0].subject).toBe('output-language');
  });

  it('does NOT fire within ONE owner (a rule may state both halves)', () => {
    expect(findContradictions([L('spec.behavior', 'x', 'require'), L('spec.behavior', 'x', 'forbid')])).toEqual([]);
  });

  it('`inform` is nobody\'s opposite', () => {
    expect(findContradictions([L('a', 'x', 'inform'), L('b', 'x', 'forbid')])).toEqual([]);
  });

  it('a subjectless line can never contradict (there is nothing to compare)', () => {
    expect(findContradictions([{ owner: 'a', subject: null, polarity: 'require', text: 't' }, L('b', 'x', 'forbid')])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('query (b) DUPLICATION — same subject+polarity from different owners, with a census', () => {
  it('counts the lines and attributes them per owner', () => {
    const f = findDuplications([
      { owner: 'guard:confirmFirst', subject: 'confirm-before-destructive', polarity: 'require', text: 'A' },
      { owner: 'guard:confirmFirst', subject: 'confirm-before-destructive', polarity: 'require', text: 'A' },
      { owner: 'domain.coreInvariants', subject: 'confirm-before-destructive', polarity: 'require', text: 'B' },
    ]);
    expect(f).toHaveLength(1);
    expect(f[0].count).toBe(3);
    expect(f[0].verbatimRepeats).toBe(1);
    expect(f[0].owners).toEqual([
      { owner: 'guard:confirmFirst', count: 2 },
      { owner: 'domain.coreInvariants', count: 1 },
    ]);
  });

  it('one owner repeating itself is NOT a duplication finding (that is the per-tool render, query (d))', () => {
    expect(findDuplications([
      { owner: 'guard:destructiveThrottle', subject: 'two-step-order', polarity: 'require', text: 'A' },
      { owner: 'guard:destructiveThrottle', subject: 'two-step-order', polarity: 'require', text: 'A' },
    ])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('query (c) SINGLE OWNER — reaches beyond the trunk into the tool surface', () => {
  it('a subject emitted by BOTH the trunk and a tool param doc is a finding', () => {
    const f = findMultiOwnerSubjects(
      [
        { owner: 'domain.languageClause', subject: 'output-language', polarity: 'require', text: "reply in the USER'S language" },
        { owner: 'tool:replyToUser.text', subject: 'output-language', polarity: 'inform', text: 'User-facing message in the brand language.' },
      ],
      ['output-language'],
    );
    expect(f).toHaveLength(1);
    expect(f[0].owners).toEqual(['domain.languageClause', 'tool:replyToUser.text']);
  });

  it('one owner, however many lines, is clean', () => {
    expect(findMultiOwnerSubjects(
      [
        { owner: 'domain.languageClause', subject: 'output-language', polarity: 'require', text: 'a' },
        { owner: 'domain.languageClause', subject: 'output-language', polarity: 'forbid', text: 'b' },
      ],
      ['output-language'],
    )).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('audit finding (i): an onInput rule does NOT render under a "reply" heading', () => {
  it('onInput prose gets its own INPUT section; onReply keeps the reply section', () => {
    const s = spec();
    s.addGuard('onInput', 'any', maxCalls('createItem', 2, 'too many', { scope: 'conversation' }));
    s.addReplyCheck(replySingleQuestion('ask one thing'));
    const blocks = renderTrunkBlocks(s, FIXTURE_DOMAIN);
    const headings = blocks.map((b) => b.heading);
    expect(headings).toContain('## Input rules (govern the incoming message — checked before you act)');
    const input = blocks.find((b) => b.heading?.startsWith('## Input rules'))!;
    expect(input.rows.flatMap((r) => r.lines).every((l) => l.hook === 'onInput')).toBe(true);
    const reply = blocks.find((b) => b.heading?.startsWith('## Reply rules'))!;
    expect(reply.rows.flatMap((r) => r.lines).every((l) => l.hook === 'onReply')).toBe(true);
    // Trunk-static ordering: Input then Reply, both after Tool rules and before Behavior.
    expect(headings.indexOf('## Tool rules')).toBeLessThan(headings.findIndex((h) => h?.startsWith('## Input rules')));
    expect(headings.findIndex((h) => h?.startsWith('## Input rules'))).toBeLessThan(headings.findIndex((h) => h?.startsWith('## Reply rules')));
  });

  it('BYTE-FREE for a spec with no onInput guard (every shipping bundle)', () => {
    const s = spec();
    expect(renderTrunkBlocks(s, FIXTURE_DOMAIN).some((b) => b.heading?.startsWith('## Input rules'))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('audit finding (d): the ruleSections dedup is NOT global — and the census proves it', () => {
  it('a prose bound to N tools renders N times, once per tool row', () => {
    const s = spec();
    s.addGuard('preTool', ['createItem', 'updateItem', 'setPrimary'], argRequired('id'));
    const lines = trunkLines(renderTrunkBlocks(s, FIXTURE_DOMAIN)).filter((l) => l.owner === 'guard:argRequired');
    expect(lines).toHaveLength(3);
    expect(new Set(lines.map((l) => l.text)).size).toBe(1); // the SAME bytes, three times
  });

  it('the `target:any` sections DO share one order-respecting dedup set', () => {
    const s = spec();
    // The same prose on a global tool hook and on the reply hook: the second is suppressed.
    const p = () => 'do the same thing';
    s.addGuard('preTool', 'any', custom({ kind: 'k1', dim: 'run', check: () => null, prose: p }));
    s.addReplyCheck(custom({ kind: 'k2', dim: 'behavior', check: () => null, prose: p }));
    const hits = trunkLines(renderTrunkBlocks(s, FIXTURE_DOMAIN)).filter((l) => l.text === 'do the same thing');
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
    const blocks = renderTrunkBlocks(s, FIXTURE_DOMAIN);
    const rows = blocks.find((b) => b.heading === '## Tool rules')!.rows.filter((r) => r.prefix.includes('createItem'));
    const fragment = rows.flatMap((r) => r.lines).find((l) => l.owner === 'guard:sentenceProse')!;
    expect(/[.!?]\s/.test(fragment.text)).toBe(true);
  });

  it('a fragment-shaped prose (the correct form) carries no interior sentence break', () => {
    const l = trunkLines(renderTrunkBlocks(spec(), FIXTURE_DOMAIN)).find((x) => x.owner === 'guard:destructiveThrottle')!;
    expect(/[.!?]\s/.test(l.text)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('regressions the refactor must not introduce', () => {
  it('a spec with no scope / no flow / no directives renders without those blocks', () => {
    const s = new AgentSpecBase({ id: 'bare', mode: 'M', persona: 'p', tools: ['listItems'] });
    const headings = renderTrunkBlocks(s, FIXTURE_DOMAIN).map((b) => b.heading);
    expect(headings).not.toContain('## Scope precedence (OUTRANKS every rule below)');
    expect(headings.some((h) => h?.startsWith('## Flow'))).toBe(false);
    expect(headings.some((h) => h?.startsWith('## Governance'))).toBe(false);
    expect(foldTrunk(renderTrunkBlocks(s, FIXTURE_DOMAIN))).toBe(renderScopedSpecTrunk(world, s, [], FIXTURE_DOMAIN));
  });

  it('a tool-targeted onReply guard still renders under `## Tool rules`, not `## Reply rules`', () => {
    const s = spec();
    s.addGuard('onReply', ['createItem'], replySingleQuestion('one question only'));
    const l = trunkLines(renderTrunkBlocks(s, FIXTURE_DOMAIN)).find((x) => x.owner === 'guard:replySingleQuestion')!;
    expect(l.section).toBe('## Tool rules');
    expect(l.hook).toBe('onReply');
  });

  it('a forbidThisTurn binding is attributed to its own kind and tool', () => {
    const s = spec();
    s.addGuard('preTool', ['purgeAll'], forbidThisTurn('not now'));
    const l = trunkLines(renderTrunkBlocks(s, FIXTURE_DOMAIN)).find((x) => x.owner === 'guard:forbidThisTurn')!;
    expect(l.tool).toBe('purgeAll');
    expect(l.subject).toBe('tool-forbidden');
  });
});
