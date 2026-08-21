/** The static lints over a subject and the guard-coverage census over run dumps.
 *  Purity: subject code carries NO regex — the four lawful regex homes live in the
 *  engine's catalog, never in a subject. Name gate: the §11 register with an EMPTY
 *  allowlist. Census: a guard is covered only by a dump in which it FIRED — an
 *  exclusion keyed on a label cannot certify a never-fired guard. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import type { CompiledAgent, DeclaredWorld, ExamCase, GuardCensus, LiveWorldCard, McpWorldCard,
              PromptParts, SurfaceFacts, TurnRecord, WorldCard } from '@looprun-ai/core';
import type { Subject } from './subject-loader.js';
import { PromptWriter, RETIRED_NAMES } from '@looprun-ai/core';

export interface LintFinding { readonly code: string; readonly sentence: string }

function subjectSources(dir: string): readonly { rel: string; text: string }[] {
  const out: { rel: string; text: string }[] = [];
  const visit = (at: string, rel: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = join(at, entry.name);
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) visit(full, childRel);
      else if (entry.name.endsWith('.ts')) out.push({ rel: childRel, text: readFileSync(full, 'utf8') });
    }
  };
  visit(dir, '');
  return out;
}

const PATTERN_HOMES = new Set(['blockPattern', 'purgePattern', 'maskPattern']);

/** A regex is lawful only as the pattern ARGUMENT of one of the three pattern
 *  factories — the pattern is that rewrite's own data; everywhere else it is a
 *  finding. */
function insidePatternHome(node: ts.Node): boolean {
  for (let at: ts.Node | undefined = node.parent; at !== undefined; at = at.parent) {
    if (ts.isCallExpression(at) && ts.isIdentifier(at.expression)
      && PATTERN_HOMES.has(at.expression.text)) return true;
  }
  return false;
}

export function purity(subjectDir: string): readonly LintFinding[] {
  const findings: LintFinding[] = [];
  for (const f of subjectSources(subjectDir)) {
    const sf = ts.createSourceFile(f.rel, f.text, ts.ScriptTarget.ES2022, true);
    const visit = (node: ts.Node): void => {
      if ((ts.isRegularExpressionLiteral(node)
        || (ts.isNewExpression(node) && ts.isIdentifier(node.expression)
            && node.expression.text === 'RegExp'))
        && !insidePatternHome(node)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        findings.push({ code: 'SUBJECT_REGEX',
          sentence: `${f.rel}:${line + 1} — a subject carries no regex; patterns live in the engine catalog` });
      }
      node.forEachChild(visit);
    };
    visit(sf);
  }
  return findings;
}

export function nameGate(subjectDir: string): readonly LintFinding[] {
  const banned = new Set(RETIRED_NAMES);
  const findings: LintFinding[] = [];
  for (const f of subjectSources(subjectDir)) {
    const sf = ts.createSourceFile(f.rel, f.text, ts.ScriptTarget.ES2022, true);
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && banned.has(node.text)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        findings.push({ code: 'SUBJECT_RETIRED_NAME',
          sentence: `${f.rel}:${line + 1} — '${node.text}' is a retired identifier` });
      }
      node.forEachChild(visit);
    };
    visit(sf);
  }
  return findings;
}

type Source = { readonly rel: string; readonly text: string };

const parse = (f: Source): ts.SourceFile =>
  ts.createSourceFile(f.rel, f.text, ts.ScriptTarget.ES2022, true);

const EFFECT_BLOCKS = new Set(['reads', 'writes', 'destructive']);

/** The tool surface: the keys of the world card's three effect blocks. The block a tool sits
 *  in IS its effect declaration. `limits.destructive` is a number, so an object literal is
 *  required before the keys count. */
function toolSurface(sources: readonly Source[]): ReadonlySet<string> {
  const tools = new Set<string>();
  for (const f of sources) {
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)
        && EFFECT_BLOCKS.has(node.name.text)
        && ts.isObjectLiteralExpression(node.initializer)) {
        for (const entry of node.initializer.properties) {
          if (!ts.isPropertyAssignment(entry)) continue;
          if (ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name)) tools.add(entry.name.text);
        }
      }
      node.forEachChild(visit);
    };
    visit(parse(f));
  }
  return tools;
}

const DETERMINISTIC_FACTORIES = ['onlyAfter', 'precondition', 'valueFromUser', 'argFormat',
  'argAbsent', 'checkResult', 'mustAccountFor', 'maxCalls', 'blockPattern'];

function callsAny(node: ts.Node, names: ReadonlySet<string>): boolean {
  let found = false;
  const visit = (at: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(at) && ts.isIdentifier(at.expression) && names.has(at.expression.text))
      found = true;
    else at.forEachChild(visit);
  };
  visit(node);
  return found;
}

/** A subject wraps factories in named helpers, so a helper whose body reaches a factory IS a
 *  factory for this reading. The set grows until it stops growing. */
function factoryNames(sources: readonly Source[]): ReadonlySet<string> {
  const known = new Set(DETERMINISTIC_FACTORIES);
  const locals: { name: string; body: ts.Node }[] = [];
  for (const f of sources) {
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined)
        locals.push({ name: node.name.text, body: node.body });
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined
        && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)))
        locals.push({ name: node.name.text, body: node.initializer.body });
      node.forEachChild(visit);
    };
    visit(parse(f));
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const local of locals) {
      if (known.has(local.name) || !callsAny(local.body, known)) continue;
      known.add(local.name);
      grew = true;
    }
  }
  return known;
}

/** Tool → the mechanisms that refuse on it. A factory call names its tool first, or names
 *  several inside an array; a disclosure entry carrying a `cap` refuses at a figure a read
 *  returned, which is a mechanism on the tool that entry is keyed by. */
function checksByTool(sources: readonly Source[],
                      factories: ReadonlySet<string>): ReadonlyMap<string, readonly string[]> {
  const byTool = new Map<string, string[]>();
  const note = (tool: string, mechanism: string): void => {
    const at = byTool.get(tool);
    if (at === undefined) byTool.set(tool, [mechanism]);
    else if (!at.includes(mechanism)) at.push(mechanism);
  };
  const lists = namedToolLists(sources);
  const take = (arg: ts.Expression | undefined, mechanism: string): void => {
    for (const tool of toolsOf(arg, lists) ?? []) note(tool, mechanism);
  };
  for (const f of sources) {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && factories.has(node.expression.text)) {
        const mechanism = node.expression.text;
        take(node.arguments[0], mechanism);
        for (const arg of node.arguments)
          if (ts.isArrayLiteralExpression(arg) || ts.isIdentifier(arg)) take(arg, mechanism);
      }
      // A guard an author wrote by hand refuses just as a factory's does: a literal carrying
      // `deny` or `judgeQuery` is a check on every tool it declares.
      if (ts.isObjectLiteralExpression(node)) {
        let kind: string | null = null;
        let declared: ts.Expression | undefined;
        for (const property of node.properties) {
          const key = property.name !== undefined && ts.isIdentifier(property.name)
            ? property.name.text : null;
          if (key === 'deny') kind = 'deny';
          if (key === 'judgeQuery') kind = 'judged';
          if (key === 'tool' && ts.isPropertyAssignment(property)) declared = property.initializer;
        }
        if (kind !== null) take(declared, kind);
      }
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'cap') {
        const keyed = node.parent.parent;
        if (ts.isPropertyAssignment(keyed) && ts.isIdentifier(keyed.name)) note(keyed.name.text, 'cap');
      }
      node.forEachChild(visit);
    };
    visit(parse(f));
  }
  return byTool;
}

/** A rule the prompt states and no function decides — whichever shape it was written in.
 *  `tools` is null when the rule declares none: it reaches no act at all. */
type ProseRule = { readonly name: string; readonly tools: readonly string[] | null;
                   readonly node: ts.Node };

/** `as const`, `satisfies` and a wrapping paren are punctuation around the value. */
const unwrap = (node: ts.Expression): ts.Expression =>
  ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)
    ? unwrap(node.expression) : node;

/** An author names a group of tools once and reaches for that name in the gate and in the rule
 *  it teaches. Both readings resolve the name to the same list. */
function namedToolLists(sources: readonly Source[]): ReadonlyMap<string, readonly string[]> {
  const lists = new Map<string, readonly string[]>();
  for (const f of sources) {
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
        const value = unwrap(node.initializer);
        if (ts.isArrayLiteralExpression(value)) {
          const names = value.elements.filter(ts.isStringLiteral).map(element => element.text);
          if (names.length > 0 && names.length === value.elements.length)
            lists.set(node.name.text, names);
        }
      }
      node.forEachChild(visit);
    };
    visit(parse(f));
  }
  return lists;
}

const toolsOf = (arg: ts.Expression | undefined,
                 lists: ReadonlyMap<string, readonly string[]>): readonly string[] | null => {
  if (arg === undefined) return null;
  const value = unwrap(arg);
  if (ts.isStringLiteral(value)) return [value.text];
  if (ts.isIdentifier(value)) return lists.get(value.text) ?? null;
  if (!ts.isArrayLiteralExpression(value)) return null;
  const tools: string[] = [];
  for (const element of value.elements) {
    if (ts.isStringLiteral(element)) tools.push(element.text);
    else if (ts.isSpreadElement(element) && ts.isIdentifier(element.expression))
      tools.push(...(lists.get(element.expression.text) ?? []));
  }
  return tools;
};

type GuardLiteral = { readonly name: string | null; readonly tools: readonly string[] | null;
                      readonly ruled: boolean; readonly decides: boolean };

/** An object literal read once: its name, the tools it reaches, whether it states a rule of its
 *  own, and whether a spread or a hand-written check decides it. Tools come from a direct `tool`
 *  property when the literal states its own, or — when a spread carries a factory's own check
 *  into the literal — from that factory call's own first argument, the tool it was handed. */
function guardLiteral(node: ts.ObjectLiteralExpression,
                      lists: ReadonlyMap<string, readonly string[]>): GuardLiteral {
  let name: string | null = null, ruled = false, decides = false;
  let tools: readonly string[] | null = null;
  for (const property of node.properties) {
    if (ts.isSpreadAssignment(property)) {
      decides = true;
      if (tools === null && ts.isCallExpression(property.expression))
        tools = toolsOf(property.expression.arguments[0], lists);
      continue;
    }
    const key = property.name !== undefined && ts.isIdentifier(property.name)
      ? property.name.text : null;
    if (key === null) continue;
    if (key === 'deny' || key === 'judgeQuery') decides = true;
    if (!ts.isPropertyAssignment(property)) continue;
    if (key === 'name' && ts.isStringLiteral(property.initializer)) name = property.initializer.text;
    if (key === 'rule') ruled = true;
    if (key === 'tool') tools = toolsOf(property.initializer, lists);
  }
  return { name, tools, ruled, decides };
}

/** Two shapes reach the same place: a `prose(name, rule, tool)` call, and an object literal
 *  naming itself with a string, carrying a rule, and carrying neither `deny` nor `judgeQuery`.
 *  A factory's own output is neither — it names itself through a spread, or carries a check. */
function proseRules(sf: ts.SourceFile,
                    lists: ReadonlyMap<string, readonly string[]>): readonly ProseRule[] {
  const rules: ProseRule[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'prose') {
      const first = node.arguments[0];
      if (first !== undefined && ts.isStringLiteral(first))
        rules.push({ name: first.text, tools: toolsOf(node.arguments[2], lists), node });
    }
    if (ts.isObjectLiteralExpression(node)) {
      const literal = guardLiteral(node, lists);
      if (literal.name !== null && literal.ruled && !literal.decides)
        rules.push({ name: literal.name, tools: literal.tools, node });
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return rules;
}

type GuardWithTools = { readonly name: string; readonly tools: readonly string[]; readonly node: ts.Node };

/** Every guard a card declares, whichever shape it was written in — prose-only or
 *  factory-decided, spread or written by hand — with the acts it reaches resolved to a plain
 *  list. A guard whose acts cannot be resolved reaches none. */
function guardsWithTools(sf: ts.SourceFile,
                         lists: ReadonlyMap<string, readonly string[]>): readonly GuardWithTools[] {
  const guards: GuardWithTools[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'prose') {
      const first = node.arguments[0];
      if (first !== undefined && ts.isStringLiteral(first))
        guards.push({ name: first.text, tools: toolsOf(node.arguments[2], lists) ?? [], node });
    }
    if (ts.isObjectLiteralExpression(node)) {
      const literal = guardLiteral(node, lists);
      if (literal.name !== null) guards.push({ name: literal.name, tools: literal.tools ?? [], node });
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return guards;
}

/** The tool surface a loaded subject actually offers. A world card that builds its three
 *  effect blocks in code says nothing to a reader of its source, so a caller holding the
 *  loaded card hands it over and the pairing reads membership from the truth. */
export function surfaceOf(subject: Subject): readonly string[] {
  const world = subject.world as { readonly card?: WorldCard };
  const card = world.card;
  if (card === undefined) return [];
  return [...Object.keys(card.reads ?? {}), ...Object.keys(card.writes ?? {}),
          ...Object.keys(card.destructive ?? {})];
}

/** Which card a guard sits on, read from the source: the engine renders a SPEC guard's rule
 *  into the system prefix and a CONTRACT guard's rule only into the cards of the tools it
 *  names, so the home decides whether a rule is read at all. */
/** The card a guard sits on, read from the object that declares it: an AgentSpec carries a
 *  persona and a DomainContract does not, so the enclosing card names itself whatever order the
 *  file is written in. A guard the walk cannot place is left uncharged — the render phase catches
 *  a rule that reaches no prompt by printing the prompt. */
function homeOf(node: ts.Node): 'spec' | 'contract' {
  for (let at: ts.Node | undefined = node; at !== undefined; at = at.parent) {
    if (!ts.isObjectLiteralExpression(at)) continue;
    let guards = false, persona = false;
    for (const property of at.properties) {
      const key = property.name !== undefined && ts.isIdentifier(property.name)
        ? property.name.text : null;
      if (key === 'guards') guards = true;
      if (key === 'persona') persona = true;
    }
    if (guards) return persona ? 'spec' : 'contract';
  }
  return 'spec';
}

export function pairing(subjectDir: string, declared?: Iterable<string>): readonly LintFinding[] {
  const sources = subjectSources(subjectDir);
  const fromSource = toolSurface(sources);
  const surface = declared === undefined ? fromSource : new Set(declared);
  // An empty surface read from source means the card spells no block out, so membership is
  // unknowable here and an act a rule names stands.
  const membershipKnown = surface.size > 0;
  const lists = namedToolLists(sources);
  const checks = checksByTool(sources, factoryNames(sources));
  const findings: LintFinding[] = [];

  for (const f of sources) {
    const sf = parse(f);
    for (const rule of proseRules(sf, lists)) {
      const at = `${f.rel}:${sf.getLineAndCharacterOfPosition(rule.node.getStart(sf)).line + 1}`;
      const home = homeOf(rule.node);
      if (home === 'spec') continue;                      // the system prefix carries it, always
      if (rule.tools === null || rule.tools.length === 0) {
        findings.push({ code: 'RULE_NEVER_RENDERED',
          sentence: `${at} — '${rule.name}' is on the contract and names no tool, so it renders in no prompt; put it on the specs that owe it` });
        continue;
      }
      for (const tool of rule.tools) {
        if (membershipKnown && !surface.has(tool)) {
          findings.push({ code: 'PROSE_TOOL_UNKNOWN',
            sentence: `${at} — '${rule.name}' names '${tool}', which is on no effect block` });
        } else if (!checks.has(tool)) {
          findings.push({ code: 'ACT_WITHOUT_CHECK',
            sentence: `${at} — '${rule.name}' states a law about '${tool}' and nothing refuses that call. Spread the factory that enforces it and sharpen its rule, or say why no check can` });
        }
      }
    }
    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node)) {
        let judged = false, tools: readonly string[] | null = null, name = '(unnamed)';
        for (const property of node.properties) {
          const key = property.name !== undefined && ts.isIdentifier(property.name)
            ? property.name.text : null;
          if (key === 'judgeQuery') judged = true;
          if (!ts.isPropertyAssignment(property)) continue;
          if (key === 'tool') tools = toolsOf(property.initializer, lists);
          if (key === 'name' && ts.isStringLiteral(property.initializer)) name = property.initializer.text;
        }
        if (judged && (tools === null || tools.length === 0)) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          findings.push({ code: 'JUDGED_UNSCOPED',
            sentence: `${f.rel}:${line} — judged guard '${name}' names no tool, so it runs on every reply; a YES redrives the turn and past the retry ceiling the engine deletes the desk's answer` });
        }
      }
      node.forEachChild(visit);
    };
    visit(sf);
  }
  return findings;
}

/** The justification table, read from the card. A rule that names an act is carried by the
 *  mechanisms on that act; a rule that names none is carried by the channel it renders in. */
export function pairingTable(subjectDir: string): string {
  const sources = subjectSources(subjectDir);
  const checks = checksByTool(sources, factoryNames(sources));
  const lists = namedToolLists(sources);
  const carried: string[] = [], residual: string[] = [];
  for (const f of sources)
    for (const rule of proseRules(parse(f), lists)) {
      if (rule.tools === null || rule.tools.length === 0) {
        residual.push(`| ${rule.name} | — | the system prefix | on a spec, read every turn |`);
        continue;
      }
      const mechanisms = [...new Set(rule.tools.flatMap(t => checks.get(t) ?? []))];
      carried.push(`| ${rule.name} | ${rule.tools.join(' · ')} | `
        + `${mechanisms.length === 0 ? 'nothing' : mechanisms.join(' · ')} | — |`);
    }
  return ['| prose rule | reaches | what carries it | why nothing stronger |',
          '|---|---|---|---|', ...carried, ...residual].join('\n');
}

/** Fired = an act attributes the guard, or a reply correction names it. */
export function census(guards: GuardCensus,
                       dumps: readonly TurnRecord[]): readonly LintFinding[] {
  const fired = new Set<string>();
  for (const record of dumps) {
    for (const act of record.acts) if (act.guard !== null) fired.add(act.guard);
    for (const correction of record.corrections) {
      if (correction.kind === 'redrive') fired.add(correction.guardName);
    }
  }
  return guards.guards.filter(g => !fired.has(g.name)).map(g => ({ code: 'GUARD_NEVER_FIRED',
    sentence: `Guard '${g.name}' is installed but no dump shows it firing.` }));
}

/** The source with every comment blanked, so a count of calls never counts a doc comment
 *  that spells one out. Lengths are preserved so an offset still points where it pointed. */
function stripComments(text: string): string {
  const out = [...text];
  let inBlock = false, inLine = false;
  for (let at = 0; at < out.length; at += 1) {
    if (inLine) { if (out[at] === '\n') inLine = false; else out[at] = ' '; continue; }
    if (inBlock) {
      if (out[at] === '*' && out[at + 1] === '/') { out[at] = ' '; out[at + 1] = ' '; at += 1; inBlock = false; }
      else if (out[at] !== '\n') out[at] = ' ';
      continue;
    }
    if (out[at] === '/' && out[at + 1] === '/') { inLine = true; out[at] = ' '; }
    else if (out[at] === '/' && out[at + 1] === '*') { inBlock = true; out[at] = ' '; out[at + 1] = ' '; at += 1; }
  }
  return out.join('');
}

export interface CardProfile { readonly bytes: number; readonly checks: number;
                               readonly acting: number; readonly actingChecked: number;
                               readonly unchecked: readonly string[];
                               readonly prose: number }

/** What a subject's cards cost and what they enforce, counted against its own surface. Acting
 *  tools are the ones a caller names as changing a record; every one of them owes a check. */
export function profile(subjectDir: string, acting: Iterable<string>): CardProfile {
  const sources = subjectSources(subjectDir);
  const checks = checksByTool(sources, factoryNames(sources));
  const cards = sources.filter(f => f.rel.endsWith('cards.ts'));
  const bytes = cards.reduce((n, f) => n + f.text.length, 0);
  const proseCalls = (text: string): number => {
    const bare = stripComments(text);
    let n = 0;
    for (let at = bare.indexOf('prose('); at !== -1; at = bare.indexOf('prose(', at + 1)) {
      const before = at === 0 ? ' ' : bare[at - 1];
      if (!((before >= 'a' && before <= 'z') || (before >= 'A' && before <= 'Z'))) n += 1;
    }
    return n;
  };
  const prose = cards.reduce((n, f) => n + proseCalls(f.text), 0);
  const actingTools = [...acting];
  const unchecked = actingTools.filter(tool => !checks.has(tool));
  let total = 0;
  for (const names of checks.values()) total += names.length;
  return { bytes, checks: total, acting: actingTools.length,
           actingChecked: actingTools.length - unchecked.length, unchecked, prose };
}

/** Every act that carries BOTH a check and a separate prose sentence. Each row is a question
 *  only the author can answer: are these two the same law? When they are, the check's own rule
 *  is where it belongs and the prose is a copy. When they are not, both stay. */
export function doubleStated(subjectDir: string): readonly string[] {
  const sources = subjectSources(subjectDir);
  const checks = checksByTool(sources, factoryNames(sources));
  const lists = namedToolLists(sources);
  const rows: string[] = [];
  for (const f of sources)
    for (const rule of proseRules(parse(f), lists)) {
      for (const tool of rule.tools ?? []) {
        const on = checks.get(tool);
        if (on !== undefined) rows.push(`${tool}: ${on.join(' · ')}  +  prose '${rule.name}'`);
      }
    }
  return [...new Set(rows)].sort();
}

/** A sentence an author wraps across lines is one string: fold the concatenation. */
function literalText(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.PlusToken) return null;
  const left = literalText(node.left), right = literalText(node.right);
  return left === null || right === null ? null : left + right;
}

const LICENCES = new Set(['noSuchAct', 'aboutARead', 'conduct']);
const WIDE_LICENCES = new Set(['oneLawEveryAct', 'sameRefusal']);

/** A module-local map declared by NAME — `export const <name> = { ... }` — read as string keys
 *  to string values. Two closed sets are read through this one walk: `WHY` names the reason a
 *  prose-only rule exists, `WIDE` names the licence a rule needs to span more than one act. */
function declaredMap(sources: readonly Source[], name: string): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const f of sources) {
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
        && node.name.text === name && node.initializer !== undefined) {
        const object = unwrap(node.initializer);
        if (ts.isObjectLiteralExpression(object))
          for (const property of object.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            if (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) continue;
            const value = literalText(property.initializer);
            if (value !== null) out.set(property.name.text, value);
          }
      }
      node.forEachChild(visit);
    };
    visit(parse(f));
  }
  return out;
}

/** A prose-only rule with no licence, or one claiming a reason outside the closed set. Prose is
 *  the residue: what is left when no check decides it, and each one says which kind it is. */
export function unlicensed(subjectDir: string): readonly LintFinding[] {
  const sources = subjectSources(subjectDir);
  const lists = namedToolLists(sources);
  const why = declaredMap(sources, 'WHY');
  const findings: LintFinding[] = [];
  for (const f of sources) {
    const sf = parse(f);
    for (const rule of proseRules(sf, lists)) {
      const at = `${f.rel}:${sf.getLineAndCharacterOfPosition(rule.node.getStart(sf)).line + 1}`;
      const claim = why.get(rule.name);
      if (claim === undefined) {
        findings.push({ code: 'PROSE_UNLICENSED',
          sentence: `${at} — prose rule '${rule.name}' claims no reason. WHY names one: noSuchAct, aboutARead, conduct, or measured:<case>` });
      } else if (!LICENCES.has(claim) && !claim.startsWith('measured:')) {
        findings.push({ code: 'PROSE_LICENCE_UNKNOWN',
          sentence: `${at} — prose rule '${rule.name}' claims '${claim}', which is not one of noSuchAct, aboutARead, conduct or measured:<case>` });
      }
    }
  }
  return findings;
}

/** A contract rule is stamped on the card of every act it names, in every lane holding that act.
 *  A rule over five acts is five copies of one sentence, and it can only say what all five share.
 *  Naming more than one act therefore costs a licence: `oneLawEveryAct` when the sentence is true
 *  and useful on each, `sameRefusal` when the acts share the refusal word for word. A rule that
 *  claims neither is a rule that splits, one act at a time. */
export function overWide(subjectDir: string): readonly LintFinding[] {
  const sources = subjectSources(subjectDir);
  const lists = namedToolLists(sources);
  const licences = declaredMap(sources, 'WIDE');
  const findings: LintFinding[] = [];
  for (const f of sources) {
    const sf = parse(f);
    for (const guard of guardsWithTools(sf, lists)) {
      if (guard.tools.length < 2) continue;
      const at = `${f.rel}:${sf.getLineAndCharacterOfPosition(guard.node.getStart(sf)).line + 1}`;
      const claim = licences.get(guard.name);
      if (claim === undefined) {
        findings.push({ code: 'RULE_WIDE_UNLICENSED',
          sentence: `${at} — '${guard.name}' names ${guard.tools.length} acts, so its sentence is `
            + `stamped that many times. WIDE names why: oneLawEveryAct, or sameRefusal. `
            + `Neither? Split it, one act at a time.` });
      } else if (!WIDE_LICENCES.has(claim)) {
        findings.push({ code: 'RULE_WIDE_LICENCE_UNKNOWN',
          sentence: `${at} — '${guard.name}' claims '${claim}', which is neither oneLawEveryAct nor sameRefusal.` });
      }
    }
  }
  return findings;
}

export interface SeamRow { readonly act: string; readonly code: string; readonly guard: string | null }

const REFUSAL_CALLS = new Set(['fail', 'gateFail']);

/** The act a refusal sits under: the nearest ENCLOSING key the surface declares. A handler is
 *  written as `cancelBooking: (w, a) => ...` or as the method `cancelBooking(w, a) { ... }`, and
 *  either way the key above the call IS the act it refuses on. A refusal inside a helper that no
 *  act keys reaches no act here. */
function enclosingAct(node: ts.Node, declared: ReadonlySet<string>): string | null {
  for (let at: ts.Node | undefined = node.parent; at !== undefined; at = at.parent) {
    if (!ts.isPropertyAssignment(at) && !ts.isMethodDeclaration(at)) continue;
    const key = at.name;
    if (!ts.isIdentifier(key) && !ts.isStringLiteral(key)) continue;
    if (declared.has(key.text)) return key.text;
  }
  return null;
}

/** The code a world hands a validator instead of naming at the emit site: `code: 'X'` on the
 *  option literal a call READS as an argument. The validator refuses with that code and the emit
 *  site passes it on, so the act the call sits under can emit it. */
function optionCode(node: ts.PropertyAssignment): string | null {
  if (!ts.isIdentifier(node.name) && !ts.isStringLiteral(node.name)) return null;
  if (node.name.text !== 'code') return null;
  const value = unwrap(node.initializer);
  if (!ts.isStringLiteral(value)) return null;
  let at: ts.Node = node.parent;
  if (!ts.isObjectLiteralExpression(at)) return null;
  while (at.parent !== undefined && (ts.isAsExpression(at.parent)
    || ts.isSatisfiesExpression(at.parent) || ts.isParenthesizedExpression(at.parent))) at = at.parent;
  const call = at.parent;
  if (call === undefined || !ts.isCallExpression(call)) return null;
  const held = at;
  return call.arguments.some(argument => argument === held) ? value.text : null;
}

/** The code a declared gate refuses with: its kind, and the field it tests when it names one. */
function gateCode(node: ts.ObjectLiteralExpression): string | null {
  let kind: string | null = null, field: string | null = null;
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) continue;
    const value = unwrap(property.initializer);
    if (!ts.isStringLiteral(value)) continue;
    if (property.name.text === 'kind') kind = value.text;
    if (property.name.text === 'field') field = value.text;
  }
  return kind === null ? null : field === null ? kind : `${kind}:${field}`;
}

/** The refusals a WORLD spells out, paired to the card guard that refuses earlier in words. Three
 *  shapes make a row: a literal code at the emit site — `fail('CODE')` or `gateFail('CODE')` — a
 *  literal `code: 'CODE'` option a validator call is handed, and a `gates` entry on an act, whose
 *  code is the gate's `kind:field`. A code the emit site computes, as `fail(id.error)` does, offers
 *  no literal to read and makes no row. The act is the nearest enclosing key the surface declares,
 *  and the row set is one row per distinct act-and-code pair. A row whose guard is null is a
 *  refusal the operator meets as a bare code. */
export function seamCovered(subjectDir: string,
                            facts: { readonly tools: Readonly<Record<string, unknown>> }): readonly SeamRow[] {
  const sources = subjectSources(subjectDir);
  const lists = namedToolLists(sources);
  const declared = new Set(Object.keys(facts.tools));
  const speaksFor = new Map<string, string>();
  for (const f of sources)
    for (const guard of guardsWithTools(parse(f), lists))
      for (const tool of guard.tools) if (!speaksFor.has(tool)) speaksFor.set(tool, guard.name);

  const rows = new Map<string, SeamRow>();
  const add = (act: string, code: string): void => {
    const key = `${act}|${code}`;
    if (!rows.has(key)) rows.set(key, { act, code, guard: speaksFor.get(act) ?? null });
  };
  for (const f of sources) {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && REFUSAL_CALLS.has(node.expression.text)) {
        const first = node.arguments[0];
        if (first !== undefined && ts.isStringLiteral(first)) {
          const act = enclosingAct(node, declared);
          if (act !== null) add(act, first.text);
        }
      }
      if (ts.isPropertyAssignment(node)) {
        const option = optionCode(node);
        if (option !== null) {
          const act = enclosingAct(node, declared);
          if (act !== null) add(act, option);
        }
      }
      if (ts.isPropertyAssignment(node)
        && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
        && node.name.text === 'gates') {
        const listed = unwrap(node.initializer);
        const act = enclosingAct(node, declared);
        if (ts.isArrayLiteralExpression(listed) && act !== null)
          for (const element of listed.elements) {
            const value = unwrap(element);
            if (!ts.isObjectLiteralExpression(value)) continue;
            const code = gateCode(value);
            if (code !== null) add(act, code);
          }
      }
      node.forEachChild(visit);
    };
    visit(parse(f));
  }
  return [...rows.values()];
}

/** Two lines of one prompt that carry the same law. A line's DISTINCTIVE tokens are the ones
 *  few other lines use; when two lines share enough of them they are saying one thing twice,
 *  and the prompt pays for both every turn. This searches and never interprets: it counts
 *  shared words, and the author decides whether the law behind them is the same. */
export function echoes(prompt: string | readonly string[], floor = 5): readonly string[] {
  const lines = (typeof prompt === 'string' ? prompt.split('\n') : prompt)
    .map(l => l.trim()).filter(l => l.length > 0);
  const tokensOf = (line: string): ReadonlySet<string> => {
    const out = new Set<string>();
    let word = '';
    for (const character of `${line.toLowerCase()} `) {
      if (character >= 'a' && character <= 'z') { word += character; continue; }
      if (word.length >= 4) out.add(word);
      word = '';
    }
    return out;
  };
  const bags = lines.map(tokensOf);
  const spread = new Map<string, number>();
  for (const bag of bags) for (const token of bag) spread.set(token, (spread.get(token) ?? 0) + 1);
  // A token is DISTINCTIVE when almost no other line uses it. The ceiling is absolute, not a
  // share of the prompt: on a long prompt a word used in eighty lines is the domain's vocabulary,
  // and pairing two lines on it says nothing.
  const common = Math.min(4, Math.ceil(lines.length / 3));
  const rows: { shared: string[]; row: string }[] = [];
  for (let i = 0; i < bags.length; i += 1)
    for (let j = i + 1; j < bags.length; j += 1) {
      const shared = [...bags[i]].filter(token =>
        bags[j].has(token) && (spread.get(token) ?? 0) <= common);
      if (shared.length < floor) continue;
      const shorten = (line: string): string => line.length <= 64 ? line : `${line.slice(0, 61)}...`;
      rows.push({ shared, row: `${shared.length} shared: ${shared.sort().join(' ')}\n     A  ${shorten(lines[i])}\n     B  ${shorten(lines[j])}` });
    }
  return rows.sort((a, b) => b.shared.length - a.shared.length).map(r => r.row);
}

/** The longest run two texts share, by extending every matching start. Quadratic in the pair,
 *  which is fine: a subject has hundreds of rules, not millions. */
function longestShared(a: string, b: string): string {
  let best = '';
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      let n = 0;
      while (i + n < a.length && j + n < b.length && a[i + n] === b[j + n]) n += 1;
      if (n > best.length) best = a.slice(i, i + n);
    }
  }
  return best;
}

/** Two lines of one prompt carrying the same wording. The cost is the run's length times the
 *  lines beyond the first that repeat it: a closing sentence shared by eight rules, stamped on
 *  every act each rule names, is paid once per stamp and teaches once. A rare-word pairing
 *  cannot see it — the words are in every line, so none of them is rare. */
export function boilerplate(lines: readonly string[], minRun = 40): readonly string[] {
  const kept = lines.map(l => l.trim()).filter(l => l.length > 0);
  const carriers = new Map<string, Set<number>>();
  for (let i = 0; i < kept.length; i += 1)
    for (let j = i + 1; j < kept.length; j += 1) {
      const run = longestShared(kept[i], kept[j]).trim();
      if (run.length < minRun) continue;
      const held = carriers.get(run) ?? new Set<number>();
      held.add(i); held.add(j);
      carriers.set(run, held);
    }
  return [...carriers.entries()]
    .map(([run, lineNumbers]) => ({ run, cost: run.length * (lineNumbers.size - 1), lineNumbers }))
    .sort((a, b) => b.cost - a.cost)
    .map(r => `${String(r.cost).padStart(6)} B  ${r.run.length} chars × ${r.lineNumbers.size - 1} `
      + `lines beyond the first\n         "${r.run.slice(0, 96)}"`);
}

/** Every line the model reads, as SEPARATE units. A tool card renders its own sentence and
 *  each of its contract guards' rules glued into one string, so the assembled card is useless
 *  as an echo unit: it pairs against everything and never against itself. */
export function promptLines(compiled: {
  readonly guards: readonly { readonly home: string; readonly rule: string;
                              readonly tools?: readonly string[] }[];
  readonly facts: { readonly tools: Readonly<Record<string, { readonly does: string }>> };
}, system: string, options?: { readonly skipGenerated?: boolean }): readonly string[] {
  const lane = compiled.facts.tools;
  const inLane = (rule: { readonly tools?: readonly string[] }): boolean =>
    (rule.tools ?? []).some(tool => lane[tool] !== undefined);
  return [
    ...system.split('\n'),
    ...compiled.guards.filter(g => g.home === 'contract' && inLane(g)).map(g => g.rule),
    ...(options?.skipGenerated === true ? [] : Object.values(lane).map(f => f.does))
  ];
}

/** What each contract guard COSTS in rendered bytes. A contract rule is copied into the card of
 *  every tool it names, in every desk whose lane holds that tool: a two-line sentence over eight
 *  acts across three desks is twenty-four copies the model reads on every turn. The rule's own
 *  length is the multiplier, so the cheapest edit is always the longest rule on the widest guard. */
export function ruleCopies(desks: readonly {
  readonly guards: readonly { readonly name: string; readonly home: string;
                              readonly rule: string; readonly tools: readonly string[] }[];
  readonly facts: { readonly tools: Readonly<Record<string, unknown>> };
}[]): readonly string[] {
  const bytes = new Map<string, number>();
  const copies = new Map<string, number>();
  const length = new Map<string, number>();
  for (const desk of desks)
    for (const guard of desk.guards) {
      if (guard.home !== 'contract') continue;
      const inLane = guard.tools.filter(tool => desk.facts.tools[tool] !== undefined).length;
      if (inLane === 0) continue;
      bytes.set(guard.name, (bytes.get(guard.name) ?? 0) + guard.rule.length * inLane);
      copies.set(guard.name, (copies.get(guard.name) ?? 0) + inLane);
      length.set(guard.name, guard.rule.length);
    }
  return [...bytes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, total]) =>
      `${String(total).padStart(6)} B  ${name} — ${length.get(name) ?? 0} B × ${copies.get(name) ?? 0} copies`);
}

/** The desk shape the prompt accounting reads: the compiled guards with their home and the acts
 *  they name, the lane's own facts, and the parts the system prefix renders from. A desk carrying
 *  no prompt parts renders no prefix. */
export interface CompiledDesk {
  readonly guards: readonly { readonly home: string; readonly rule: string;
                              readonly tools: readonly string[] }[];
  readonly facts: { readonly tools: Readonly<Record<string, { readonly does: string;
                                                              readonly schema: unknown }>> };
  readonly promptParts?: PromptParts;
}

export interface ByteOrigin {
  readonly systemPrefixes: number;   // personas, facts, voice, conduct laws
  readonly worldSentences: number;   // the `does` a GEN phase wrote, once per card that carries it
  readonly schemas: number;          // argument descriptions and JSON structure
  readonly contractRules: number;    // the sentences NORMS wrote
  readonly lanes: readonly string[]; // one row per act: its lane count, and what its world
                                     // sentence costs across those stamps
}

/** What each slice of the prompt costs, and who wrote it. A world `does` sentence is authored in
 *  the GEN phase and stamped on the card of every desk holding that act; a schema carries the
 *  argument descriptions someone wrote beside its types; a contract rule is the NORMS phase's own.
 *  The card's own name and JSON frame, and the engine's finish card, sit outside the four slices,
 *  so the four sum under the rendered prompt.
 *
 *  The lane rows price the desk split: an act in six lanes sends its card six times, and the split
 *  that decides it is made without counting a byte. A row charges that act's world sentence once
 *  per lane holding it — the sentence's stamps, not the whole card's. */
export function byteOrigin(desks: readonly CompiledDesk[], facts: SurfaceFacts): ByteOrigin {
  let systemPrefixes = 0;
  let worldSentences = 0;
  let schemas = 0;
  let contractRules = 0;
  const held = new Map<string, number>();
  for (const desk of desks) {
    const lane = desk.facts.tools;
    if (desk.promptParts !== undefined)
      systemPrefixes += new PromptWriter(desk as CompiledAgent).system().length;
    for (const [act, fact] of Object.entries(lane)) {
      worldSentences += fact.does.length;
      schemas += JSON.stringify(fact.schema).length;
      held.set(act, (held.get(act) ?? 0) + 1);
    }
    for (const guard of desk.guards) {
      if (guard.home !== 'contract') continue;
      contractRules += guard.rule.length * guard.tools.filter(act => lane[act] !== undefined).length;
    }
  }
  const lanes = Object.values(facts.tools)
    .map(fact => ({ act: fact.name, does: fact.does.length, cards: held.get(fact.name) ?? 0 }))
    .sort((a, b) => b.does * b.cards - a.does * a.cards)
    .map(r => `${String(r.does * r.cards).padStart(6)} B  ${r.act} — ${r.does} B does `
      + `× ${r.cards} lane${r.cards === 1 ? '' : 's'}`);
  return { systemPrefixes, worldSentences, schemas, contractRules, lanes };
}

/** A `precondition` whose predicate reads `record` over an act that can never carry one. The
 *  engine resolves `record` from the acting tool's OWN entity and target argument: when the
 *  surface declares the act without a `target`, or without an `entity`, the predicate is handed
 *  `record: null` on every call and a record test passes silently. The guard compiles, sits in
 *  the census, and refuses nothing.
 *
 *  A predicate that reads only `state` is correct over such an act — a tenant gate over every
 *  write is exactly that — so only a predicate that names `record` is charged. */
export function inertChecks(subjectDir: string,
                            facts: Readonly<Record<string, {
                              readonly target?: string | null;
                              readonly entity?: string | null }>>): readonly LintFinding[] {
  const sources = subjectSources(subjectDir);
  const lists = namedToolLists(sources);
  const findings: LintFinding[] = [];

  const readsRecord = (node: ts.Expression): boolean => {
    if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return false;
    const parameter = node.parameters[0];
    if (parameter !== undefined && ts.isObjectBindingPattern(parameter.name)) {
      const bound = parameter.name.elements.some(element =>
        ts.isIdentifier(element.name) && element.name.text === 'record');
      if (!bound) return false;
    }
    let found = false;
    const walk = (at: ts.Node): void => {
      if (ts.isIdentifier(at) && at.text === 'record') found = true;
      at.forEachChild(walk);
    };
    walk(node.body);
    return found;
  };

  for (const f of sources) {
    const sf = parse(f);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && node.expression.text === 'precondition' && node.arguments.length >= 2
        && readsRecord(node.arguments[1])) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        for (const tool of toolsOf(node.arguments[0], lists) ?? []) {
          const fact = facts[tool];
          if (fact === undefined) continue;
          const missing = fact.target === null || fact.target === undefined ? 'target argument'
            : fact.entity === null || fact.entity === undefined ? 'entity' : null;
          if (missing === null) continue;
          findings.push({ code: 'CHECK_INERT',
            sentence: `${f.rel}:${line} — the precondition over '${tool}' reads \`record\`, and the surface `
              + `declares '${tool}' with no ${missing}, so \`record\` is null on every call and the test `
              + `always passes. Read the id off \`call.args\` in a hand-written deny, or test \`state\` alone.` });
        }
      }
      node.forEachChild(visit);
    };
    visit(sf);
  }
  return findings;
}

type DisclosureEntry = { readonly hasBefore: boolean; readonly needs: ReadonlyMap<string, string>;
                         readonly capAt: string | null };

/** Every entry a subject's own `disclosure` map declares, read straight from source: whether the
 *  entry carries `before`, its `needs` aliases resolved to the tool name each one reads, and the
 *  `cap.at` path when the entry carries a cap. */
function disclosureEntries(sources: readonly Source[]): ReadonlyMap<string, DisclosureEntry> {
  const readNeeds = (init: ts.Expression): ReadonlyMap<string, string> => {
    const needs = new Map<string, string>();
    const value = unwrap(init);
    if (!ts.isObjectLiteralExpression(value)) return needs;
    for (const alias of value.properties) {
      if (!ts.isPropertyAssignment(alias)) continue;
      const key = ts.isIdentifier(alias.name) || ts.isStringLiteral(alias.name) ? alias.name.text : null;
      const recipe = unwrap(alias.initializer);
      if (key === null) continue;
      if (ts.isStringLiteral(recipe)) { needs.set(key, recipe.text); continue; }
      if (!ts.isObjectLiteralExpression(recipe)) continue;
      for (const p of recipe.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const propKey = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
        const tool = propKey === 'tool' ? literalText(unwrap(p.initializer)) : null;
        if (tool !== null) needs.set(key, tool);
      }
    }
    return needs;
  };
  const out = new Map<string, DisclosureEntry>();
  for (const f of sources) {
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'disclosure'
        && ts.isObjectLiteralExpression(node.initializer)) {
        for (const entry of node.initializer.properties) {
          if (!ts.isPropertyAssignment(entry) || !ts.isObjectLiteralExpression(entry.initializer)) continue;
          const tool = ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name) ? entry.name.text : null;
          if (tool === null) continue;
          let hasBefore = false, capAt: string | null = null, needs: ReadonlyMap<string, string> = new Map();
          for (const property of entry.initializer.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
              ? property.name.text : null;
            if (key === 'before') hasBefore = true;
            if (key === 'needs') needs = readNeeds(property.initializer);
            if (key === 'cap' && ts.isObjectLiteralExpression(property.initializer)) {
              for (const p of property.initializer.properties) {
                if (!ts.isPropertyAssignment(p)) continue;
                const capKey = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
                if (capKey === 'at') capAt = literalText(unwrap(p.initializer));
              }
            }
          }
          out.set(tool, { hasBefore, needs, capAt });
        }
      }
      node.forEachChild(visit);
    };
    visit(parse(f));
  }
  return out;
}

/** Every tool whose fact carries `effect: 'destructive'` must have a disclosure entry that
 *  carries a `before`: the words the consent question renders. Without one the question asks
 *  with only the tool's own label — no amount, no record, nothing that cannot be undone named. */
export function destructiveDisclosed(subjectDir: string,
                                     facts: { readonly tools: Readonly<Record<string,
                                       { readonly effect?: string }>> }): readonly LintFinding[] {
  const entries = disclosureEntries(subjectSources(subjectDir));
  const findings: LintFinding[] = [];
  for (const [tool, fact] of Object.entries(facts.tools)) {
    if (fact.effect !== 'destructive') continue;
    if (entries.get(tool)?.hasBefore === true) continue;
    findings.push({ code: 'DISCLOSURE_BEFORE_MISSING',
      sentence: `Destructive act '${tool}' has no disclosure 'before', so the consent question `
        + `carries only its label: no amount, no record, nothing that cannot be undone.` });
  }
  return findings;
}

/** A `cap.at` path reads as `{alias}.{...}` over the reads `needs` names — an alias the same
 *  entry declares, never the read's own tool name. A path rooted on the tool binds to nothing
 *  the engine ever produced, and the call it was meant to hold dies at the cap instead. */
export function capPaths(subjectDir: string): readonly LintFinding[] {
  const findings: LintFinding[] = [];
  for (const [tool, entry] of disclosureEntries(subjectSources(subjectDir))) {
    if (entry.capAt === null) continue;
    const dot = entry.capAt.indexOf('.');
    const root = dot === -1 ? entry.capAt : entry.capAt.slice(0, dot);
    if (entry.needs.has(root)) continue;
    const rest = dot === -1 ? '' : entry.capAt.slice(dot + 1);
    const alias = [...entry.needs].find(([, name]) => name === root)?.[0];
    const corrected = alias === undefined ? null : rest === '' ? alias : `${alias}.${rest}`;
    findings.push({ code: 'CAP_PATH_UNROOTED',
      sentence: alias === undefined
        ? `disclosure.${tool}.cap.at '${entry.capAt}' is rooted on '${root}', which needs declares no alias for`
        : `disclosure.${tool}.cap.at '${entry.capAt}' is rooted on '${root}', but '${root}' is a read, not `
          + `an alias; needs names '${alias}' for it — root the cap at '${corrected}'` });
  }
  return findings;
}

/** The floor: the guard names the engine installs on its own, never authored on a card. Eight —
 *  confirmFirst, groundedIds, groundedDates, noDuplicateCall, argRequired, maxDestructive,
 *  brokenReply, questionAnswered — are pushed by AgentFactory's compile() in
 *  packages/core/src/cards/agent-factory.ts; the remaining two — claimIsGrounded and
 *  claimIsComplete, the honesty floor — are installed by Rulebook in
 *  packages/core/src/run/rulebook.ts. A card that authors any of these, bare or prefixed with a
 *  colon, shadows a guard the engine installs itself. */
const FLOOR_NAMES = new Set(['confirmFirst', 'groundedIds', 'groundedDates', 'noDuplicateCall',
  'argRequired', 'maxDestructive', 'brokenReply', 'questionAnswered', 'claimIsGrounded', 'claimIsComplete']);

export function floorRedeclared(subjectDir: string): readonly LintFinding[] {
  const sources = subjectSources(subjectDir);
  const lists = namedToolLists(sources);
  const findings: LintFinding[] = [];
  for (const f of sources) {
    const sf = parse(f);
    for (const guard of guardsWithTools(sf, lists)) {
      const bare = guard.name.split(':')[0];
      if (!FLOOR_NAMES.has(bare)) continue;
      const at = `${f.rel}:${sf.getLineAndCharacterOfPosition(guard.node.getStart(sf)).line + 1}`;
      findings.push({ code: 'FLOOR_REDECLARED',
        sentence: `${at} — '${guard.name}' redeclares the engine floor guard '${bare}'; the engine `
          + `installs it itself and an authored guard of the same name shadows it.` });
    }
  }
  return findings;
}

type SpecLaws = { readonly spec: string; readonly laws: ReadonlySet<string> };

/** Every object literal carrying a `persona` — a spec — read as its own `name` and the
 *  `prose(...)` names its `guards` array declares: the conduct laws that spec teaches. */
function specConduct(sources: readonly Source[]): readonly SpecLaws[] {
  const specs: SpecLaws[] = [];
  for (const f of sources) {
    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node)) {
        let hasPersona = false, name: string | null = null, guardsNode: ts.Expression | undefined;
        for (const property of node.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
            ? property.name.text : null;
          if (key === 'persona') hasPersona = true;
          if (key === 'name' && ts.isStringLiteral(property.initializer)) name = property.initializer.text;
          if (key === 'guards') guardsNode = property.initializer;
        }
        if (hasPersona && name !== null) {
          const laws = new Set<string>();
          if (guardsNode !== undefined) {
            const walk = (at: ts.Node): void => {
              if (ts.isCallExpression(at) && ts.isIdentifier(at.expression) && at.expression.text === 'prose') {
                const first = at.arguments[0];
                if (first !== undefined && ts.isStringLiteral(first)) laws.add(first.text);
              }
              at.forEachChild(walk);
            };
            walk(guardsNode);
          }
          specs.push({ spec: name, laws });
        }
      }
      node.forEachChild(visit);
    };
    visit(parse(f));
  }
  return specs;
}

/** A conduct law a `prose(...)` call teaches on some specs and not others: the desks that never
 *  read it never learn it, and a caller cannot tell whether that gap was decided or forgotten. */
export function conductComplete(subjectDir: string): readonly LintFinding[] {
  const specs = specConduct(subjectSources(subjectDir));
  const allLaws = new Set<string>();
  for (const spec of specs) for (const law of spec.laws) allLaws.add(law);
  const findings: LintFinding[] = [];
  for (const law of allLaws) {
    const missing = specs.filter(spec => !spec.laws.has(law)).map(spec => spec.spec);
    if (missing.length === 0) continue;
    findings.push({ code: 'CONDUCT_INCOMPLETE',
      sentence: `'${law}' is a conduct law taught on some specs and missing from ${missing.join(', ')}; `
        + `a desk that never reads it never learns it.` });
  }
  return findings;
}

/** The smallest number of single-character edits — insert, delete, substitute — that turns `a`
 *  into `b`. Classic two-row dynamic programming: a `covers` key is compared to a census name
 *  character by character, never pattern-matched. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost));
    }
    previous = current;
  }
  return previous[b.length];
}

/** The census name closest to `key` by edit distance, among names the case does not already
 *  claim elsewhere in its own `covers` list — a name the case already declares is not a fix for a
 *  different entry, it would just collapse two distinct requirements into one. An empty census
 *  names nothing back. */
function closestCensusName(key: string, censusNames: ReadonlySet<string>,
                           alreadyClaimed: ReadonlySet<string>): string | null {
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const name of censusNames) {
    if (alreadyClaimed.has(name)) continue;
    const distance = editDistance(key, name);
    if (distance < bestDistance) { bestDistance = distance; best = name; }
  }
  return best;
}

/** A case's `covers` key names the guard the case exercises, spelled exactly as the census carries
 *  it. The census is what `Engine.guards()` returns — the compiled agent's rows plus the honesty
 *  rows the Rulebook injects, which is why a key must be read from the engine and never composed
 *  by hand from a category and a tool. A key naming nothing measures nothing, and a subject whose
 *  keys all resolve to nothing still certifies. */
export function coversResolve(cases: readonly ExamCase[],
                              censusNames: ReadonlySet<string>): readonly LintFinding[] {
  const findings: LintFinding[] = [];
  for (const c of cases) {
    const claimed = new Set(c.covers ?? []);
    for (const key of c.covers ?? []) {
      if (censusNames.has(key)) continue;
      const suggestion = closestCensusName(key, censusNames, claimed);
      findings.push({ code: 'COVERS_UNRESOLVED',
        sentence: `case '${c.id}' covers '${key}', which the census carries no guard named`
          + (suggestion === null ? '.' : ` — the closest census name is '${suggestion}'.`) });
    }
  }
  return findings;
}

/** A case's `preset` names a scenario the world card declares. A preset the card does not carry is
 *  refused by the world builder before a single turn is taken, so the case constructs nothing and
 *  spends a model call to learn it. This is the half of the exam's promise no other verb reaches:
 *  `coversResolve` reads the guard names a case claims and never the scenario it claims them in,
 *  and `approvable` cannot see the gap at all — it walks a case's `covers` keys, and a case that
 *  declares none is walked past in silence. */
export function presetsDeclared(cases: readonly ExamCase[],
                                world: DeclaredWorld | McpWorldCard | LiveWorldCard): readonly LintFinding[] {
  const declared = new Set('card' in world ? Object.keys(world.card.presets ?? {}) : []);
  const findings: LintFinding[] = [];
  for (const c of cases) {
    if (c.preset === undefined || declared.has(c.preset)) continue;
    findings.push({ code: 'CASE_PRESET_UNKNOWN',
      sentence: `case '${c.id}' names preset '${c.preset}', and the world card declares no such `
        + `preset — the case constructs nothing and every rubric row goes unanswered.` });
  }
  return findings;
}

/** What `approvable` needs from a built world: whether a case's preset leaves the named guard
 *  inert — its `deny` unable to return non-null in any state that preset reaches. The caller
 *  builds this from the world it has already loaded and run the preset against; `approvable`
 *  never builds a world or runs a case itself. */
export interface ApprovabilitySubject {
  readonly presetLeavesGuardInert: (preset: string | undefined, guardName: string) => boolean;
}

/** A case covers a guard to prove the guard can fire; a preset that leaves the guard inert makes
 *  the case measure nothing, whether or not its `covers` key spells the guard's name right. This
 *  is the half of the exam's promise that `coversResolve` does not reach: a key can resolve to a
 *  real guard and the case can still never trip it. */
export function approvable(cases: readonly ExamCase[],
                           subject: ApprovabilitySubject): readonly LintFinding[] {
  const findings: LintFinding[] = [];
  for (const c of cases) {
    for (const guardName of c.covers ?? []) {
      if (!subject.presetLeavesGuardInert(c.preset, guardName)) continue;
      findings.push({ code: 'CASE_CANNOT_FIRE',
        sentence: `case '${c.id}' covers '${guardName}', but preset '${c.preset ?? '(default)'}' `
          + `leaves that guard inert — the case can run to completion without it ever firing.` });
    }
  }
  return findings;
}
