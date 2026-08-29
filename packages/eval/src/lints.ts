/** The static lints over a subject and the guard-coverage census over run dumps.
 *  Purity: subject code carries NO regex — the four lawful regex homes live in the
 *  engine's catalog, never in a subject. Name gate: the §11 register with an EMPTY
 *  allowlist. Census: a guard is covered only by a dump in which it FIRED — an
 *  exclusion keyed on a label cannot certify a never-fired guard. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import type { AgentSpec, ApproveRef, CompiledAgent, DeclaredWorld, DomainContract, ExamCase,
              ExamTurn, GuardCensus, Json, LiveWorldCard, McpWorldCard, PromptParts, SurfaceFacts,
              ToolFact, TurnRecord, WorldCard } from '@looprun-ai/core';
import type { Subject } from './subject-loader.js';
import { AgentFactory, CardError, factsFromWorld, PromptWriter,
         RETIRED_NAMES, WorldBuilder } from '@looprun-ai/core';

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
/** The two blocks that hold the ACTS: a tool in either one changes a record of the world. */
const ACTING_BLOCKS = new Set(['writes', 'destructive']);

/** The keys of the world card's effect blocks, read from source. The block a tool sits in IS its
 *  effect declaration, so the blocks asked for decide what comes back: all three name the whole
 *  surface, the acting two name the acts. `limits.destructive` is a number, so an object literal
 *  is required before the keys count. */
function surfaceKeys(sources: readonly Source[], blocks: ReadonlySet<string>): ReadonlySet<string> {
  const tools = new Set<string>();
  for (const f of sources) {
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)
        && blocks.has(node.name.text)
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

const DETERMINISTIC_FACTORIES = ['onlyAfter', 'precondition', 'valueFromUser', 'choiceFromUser',
  'argFormat', 'argAbsent', 'checkResult', 'mustAccountFor', 'maxCalls', 'blockPattern'];

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
 *  `tools` is null when the rule declares none: it reaches no act at all. `rule` is the
 *  sentence itself when the source spells it out as a literal. */
type ProseRule = { readonly name: string; readonly tools: readonly string[] | null;
                   readonly rule: string | null; readonly node: ts.Node };

/** `as const`, `satisfies` and a wrapping paren are punctuation around the value. */
const unwrap = (node: ts.Expression): ts.Expression =>
  ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)
    ? unwrap(node.expression) : node;

/** A sentence an author wraps across lines is one string: fold the concatenation. */
function literalText(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.PlusToken) return null;
  const left = literalText(node.left), right = literalText(node.right);
  return left === null || right === null ? null : left + right;
}

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

/** An author names a refusal code once and hands that name to every call that refuses with it.
 *  The name resolves to the string it was declared as, so a code held in a constant reads exactly
 *  as a code written at the call site does. */
function namedStrings(sources: readonly Source[]): ReadonlyMap<string, string> {
  const named = new Map<string, string>();
  for (const f of sources) {
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
        && node.initializer !== undefined) {
        const text = literalText(unwrap(node.initializer));
        if (text !== null) named.set(node.name.text, text);
      }
      node.forEachChild(visit);
    };
    visit(parse(f));
  }
  return named;
}

/** An author names a list of gate literals once and spreads it onto the acts that carry it. The
 *  name resolves to the elements it was declared with, so a spread entry reads as the entries it
 *  brings. */
function namedObjectLists(sources: readonly Source[])
  : ReadonlyMap<string, readonly ts.ObjectLiteralExpression[]> {
  const lists = new Map<string, readonly ts.ObjectLiteralExpression[]>();
  for (const f of sources) {
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
        && node.initializer !== undefined) {
        const value = unwrap(node.initializer);
        if (ts.isArrayLiteralExpression(value)) {
          const entries = value.elements.map(unwrap).filter(ts.isObjectLiteralExpression);
          if (entries.length > 0 && entries.length === value.elements.length)
            lists.set(node.name.text, entries);
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

/** The acts a `prose(...)` call reaches. A three-argument call names them itself. A two-argument
 *  call spread into a guard literal takes the acts THAT literal states — `{ ...prose(name, rule),
 *  tool: ['checkOutAsset', 'cancelBooking'] }` is one rule stamped on two cards, and the sentence
 *  the desk reads is the same either way. */
function toolsOfProse(call: ts.CallExpression,
                      lists: ReadonlyMap<string, readonly string[]>): readonly string[] | null {
  const own = toolsOf(call.arguments[2], lists);
  if (own !== null) return own;
  const spread = call.parent;
  if (spread === undefined || !ts.isSpreadAssignment(spread)
    || !ts.isObjectLiteralExpression(spread.parent)) return null;
  for (const property of spread.parent.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
      ? property.name.text : null;
    if (key === 'tool') return toolsOf(property.initializer, lists);
  }
  return null;
}

type GuardLiteral = { readonly name: string | null; readonly tools: readonly string[] | null;
                      readonly ruled: boolean; readonly decides: boolean;
                      readonly rule: string | null };

/** An object literal read once: its name, the tools it reaches, whether it states a rule of its
 *  own, and whether a spread or a hand-written check decides it. Tools come from a direct `tool`
 *  property when the literal states its own, or — when a spread carries a factory's own check
 *  into the literal — from that factory call's own first argument, the tool it was handed. */
function guardLiteral(node: ts.ObjectLiteralExpression,
                      lists: ReadonlyMap<string, readonly string[]>): GuardLiteral {
  let name: string | null = null, ruled = false, decides = false;
  let tools: readonly string[] | null = null, rule: string | null = null;
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
    if (key === 'rule') { ruled = true; rule = literalText(unwrap(property.initializer)); }
    if (key === 'tool') tools = toolsOf(property.initializer, lists);
  }
  return { name, tools, ruled, decides, rule };
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
      const second = node.arguments[1];
      if (first !== undefined && ts.isStringLiteral(first))
        rules.push({ name: first.text, tools: toolsOfProse(node, lists),
                     rule: second === undefined ? null : literalText(unwrap(second)), node });
    }
    if (ts.isObjectLiteralExpression(node)) {
      const literal = guardLiteral(node, lists);
      if (literal.name !== null && literal.ruled && !literal.decides)
        rules.push({ name: literal.name, tools: literal.tools, rule: literal.rule, node });
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
        guards.push({ name: first.text, tools: toolsOfProse(node, lists) ?? [], node });
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

/** Every act of a subject carries at least one deterministic check, and every rule about an act
 *  is carried by a mechanism on that act.
 *
 *  The two are one walk because they answer the same question from opposite ends. A rule the card
 *  states about a tool nothing refuses is a law written and never enforced. An ACT — a write or a
 *  destructive effect — that nothing refuses is worse: no rule even claims it, so a reader of the
 *  card sees nothing missing while the engine has nothing to stop the call with.
 *
 *  An ACT owes a mechanism that DECIDES its call. An order is not one: `onlyAfter` is paid by
 *  running the read, and the act then proceeds. A tool that changes no record owes a mechanism of
 *  any shape — a check over its result or its reply is the only kind there is for a read.
 *
 *  `declared` and `acting` are the surface and the acts as a CALLER holds them, off a card already
 *  built. A world that assembles its effect blocks in code spells no tool out in its source, so a
 *  caller with the loaded card hands both over and this reads the truth instead of the text. */
export function pairing(subjectDir: string, declared?: Iterable<string>,
                        acting?: Iterable<string>): readonly LintFinding[] {
  const sources = subjectSources(subjectDir);
  const surface = declared === undefined ? surfaceKeys(sources, EFFECT_BLOCKS) : new Set(declared);
  // An empty surface read from source means the card spells no block out, so membership is
  // unknowable here and an act a rule names stands.
  const membershipKnown = surface.size > 0;
  const lists = namedToolLists(sources);
  const checks = checksByTool(sources, factoryNames(sources));
  const denying = denyingNames(sources);
  const acts = new Set(acting ?? surfaceKeys(sources, ACTING_BLOCKS));
  const carriedBy = (tool: string): readonly string[] => checks.get(tool) ?? [];
  const decided = (tool: string): boolean => acts.has(tool)
    ? carriedBy(tool).some(mechanism => denying.has(mechanism))
    : carriedBy(tool).length > 0;
  /** What an act carries, when what it carries cannot refuse the call. */
  const inertly = (tool: string): string => {
    const carried = carriedBy(tool);
    return carried.length === 0 ? 'nothing refuses that call'
      : `it carries only ${carried.join(' · ')}, and ${NOTHING_DECIDES}`;
  };
  const findings: LintFinding[] = [];
  // One act, one row: a rule that names an unchecked act says it at its own line, and the sweep
  // below speaks only for the acts no rule mentions at all.
  const spoken = new Set<string>();

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
        } else if (!decided(tool)) {
          spoken.add(tool);
          findings.push({ code: 'ACT_WITHOUT_CHECK',
            sentence: `${at} — '${rule.name}' states a law about '${tool}' and ${inertly(tool)}. Spread the factory that enforces it and sharpen its rule, or say why no check can` });
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

  // The acts nothing on the card speaks for. A rule naming one has already been charged above at
  // its own line; the rest are named here, because an act with no rule and no check is the one
  // nobody reading the card can see.
  for (const act of acts) {
    if (decided(act) || spoken.has(act)) continue;
    spoken.add(act);
    findings.push({ code: 'ACT_WITHOUT_CHECK',
      sentence: `'${act}' changes a record and ${inertly(act)}; no rule on this card names it `
        + `either. Every act carries at least one check the engine decides: spread the factory `
        + `that decides this one onto the contract, or declare '${act}' a read if it changes `
        + `nothing` });
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

/** One sentence with its layout forgotten: an author wraps a rule to fit a column, and two
 *  copies of one law differ only in where the line broke. */
function oneLine(text: string): string {
  const words: string[] = [];
  let word = '';
  for (const character of `${text} `) {
    if (character === ' ' || character === '\n' || character === '\t') {
      if (word !== '') words.push(word);
      word = '';
    } else word += character;
  }
  return words.join(' ');
}

/** Two sentences carrying the same words: identical once the line breaks are forgotten, or one
 *  quoted whole inside the other. Anything short of that is two sentences about one act, which
 *  is what a card looks like when a check states its own law and a prose rule states the rest. */
function sameWords(a: string, b: string): boolean {
  const left = oneLine(a), right = oneLine(b);
  if (left === '' || right === '') return false;
  return left.includes(right) || right.includes(left);
}

type CheckRule = { readonly name: string; readonly rule: string; readonly tools: readonly string[] };

/** Every guard that DECIDES and spells its sentence out in the source: the shape a duplicate can
 *  be compared against. A factory's own minted sentence appears nowhere in the source, so a prose
 *  rule can never be its verbatim copy. */
function checkRules(sf: ts.SourceFile,
                    lists: ReadonlyMap<string, readonly string[]>): readonly CheckRule[] {
  const rules: CheckRule[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const literal = guardLiteral(node, lists);
      if (literal.name !== null && literal.decides && literal.rule !== null)
        rules.push({ name: literal.name, rule: literal.rule, tools: literal.tools ?? [] });
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return rules;
}

/** Every act carrying a check and a prose rule that say the SAME WORDS — one law written twice,
 *  paid for on every turn the card renders. Each row is a question only the author can answer:
 *  which home keeps the sentence? The check's `rule` is the one the desk reads at the refusal, so
 *  it is usually the copy that stays.
 *
 *  Two DIFFERENT sentences on one act are not a row: a check states the law it decides, and a
 *  prose rule beside it states what no check can reach — the cover a silent mechanism needs. */
export function doubleStated(subjectDir: string): readonly string[] {
  const sources = subjectSources(subjectDir);
  const lists = namedToolLists(sources);
  const checks: CheckRule[] = [];
  for (const f of sources) checks.push(...checkRules(parse(f), lists));
  const rows: string[] = [];
  for (const f of sources)
    for (const rule of proseRules(parse(f), lists)) {
      if (rule.rule === null) continue;
      for (const tool of rule.tools ?? [])
        for (const check of checks) {
          if (!check.tools.includes(tool) || !sameWords(check.rule, rule.rule)) continue;
          rows.push(`${tool}: '${check.name}' and prose '${rule.name}' carry the same sentence`);
        }
    }
  return [...new Set(rows)].sort();
}

/** The factories whose MINTED sentence already states the whole law, so a card that adds nothing
 *  has still said it:
 *    onlyAfter       'Run <prerequisite> before <tool>.'      — the order, both names in it
 *    valueFromUser   "Send <tool>'s '<arg>' only as the user wrote it."
 *    argAbsent       "Never send '<arg>' on <tool>."
 *    argFormat       "Send '<arg>' on <tool> in its declared format." — the format is the schema's
 *                    own declared pattern, and the schema rides the same card the sentence does
 *    mustAccountFor  'The report must account for <records> as <status>.' — the records and the
 *                    status word are both in it; it names no tool and reaches no act at all */
const SELF_STATING_FACTORIES = new Set(['onlyAfter', 'valueFromUser', 'argAbsent', 'argFormat',
  'mustAccountFor']);

/** The factories that take the law as an ARGUMENT — `precondition`'s reason, `choiceFromUser`'s
 *  rule, `maxCalls`'s reason, `blockPattern`'s rule. The words are the author's, so an act one of
 *  these names is an act somebody has written a sentence about. */
const AUTHORED_RULE_ARG: ReadonlyMap<string, number> = new Map([
  ['precondition', 2], ['choiceFromUser', 3], ['maxCalls', 2], ['blockPattern', 2]]);

/** What is left of the deterministic catalog once the self-stating factories and the ones handed
 *  their law are taken out: a factory that refuses on an act and mints a sentence naming no law. */
const SILENT_FACTORIES = new Set(DETERMINISTIC_FACTORIES.filter(name =>
  !SELF_STATING_FACTORIES.has(name) && !AUTHORED_RULE_ARG.has(name)));

/** Whether the argument at that position carries words: a sentence, or the `reason` of an options
 *  object the factory reads its wording out of. */
function authoredWords(call: ts.CallExpression, index: number): boolean {
  const argument = call.arguments[index];
  if (argument === undefined) return false;
  const value = unwrap(argument);
  if (literalText(value) !== null) return true;
  if (!ts.isObjectLiteralExpression(value)) return false;
  for (const property of value.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
      ? property.name.text : null;
    if (key === 'reason' && literalText(unwrap(property.initializer)) !== null) return true;
  }
  return false;
}

/** Every act some sentence in the source speaks about: a prose rule that names it, a guard literal
 *  that declares its own `rule`, or a factory handed the law as an argument. A guard whose whole
 *  sentence was minted by a factory speaks that factory's law and no other, so it is not counted
 *  here — it cannot stand as the words behind a different mechanism on the same act. */
function spokenActs(sources: readonly Source[],
                    lists: ReadonlyMap<string, readonly string[]>): ReadonlySet<string> {
  const spoken = new Set<string>();
  for (const f of sources) {
    const sf = parse(f);
    for (const rule of proseRules(sf, lists)) for (const tool of rule.tools ?? []) spoken.add(tool);
    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node)) {
        const literal = guardLiteral(node, lists);
        if (literal.ruled) for (const tool of literal.tools ?? []) spoken.add(tool);
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const index = AUTHORED_RULE_ARG.get(node.expression.text);
        if (index !== undefined && authoredWords(node, index))
          for (const tool of toolsOf(node.arguments[0], lists) ?? []) spoken.add(tool);
      }
      node.forEachChild(visit);
    };
    visit(sf);
  }
  return spoken;
}

/** A check that refuses on an act whose law no sentence on the card states. Two mechanisms can
 *  reach an act without saying anything: `checkResult`, whose minted sentence says only that a
 *  declared check exists, and a disclosure `cap`, which refuses at a figure and appears in no rule
 *  at all. Either one meets the desk as a refusal it was never taught, and the operator as a limit
 *  nobody wrote down.
 *
 *  A prose rule naming the act is lawful cover, not a copy: the check decides, the sentence teaches,
 *  and only sentences that say the SAME WORDS are a duplicate — which is what `doubleStated` reads. */
export function unspokenChecks(subjectDir: string): readonly LintFinding[] {
  const sources = subjectSources(subjectDir);
  const lists = namedToolLists(sources);
  const spoken = spokenActs(sources, lists);
  const findings: LintFinding[] = [];
  for (const f of sources) {
    const sf = parse(f);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && SILENT_FACTORIES.has(node.expression.text)) {
        const at = `${f.rel}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
        const factory = node.expression.text;
        for (const tool of toolsOf(node.arguments[0], lists) ?? []) {
          if (spoken.has(tool)) continue;
          findings.push({ code: 'CHECK_UNSPOKEN',
            sentence: `${at} — the ${factory} check on '${tool}' states no law: its sentence says `
              + `only that a declared check exists, and nothing on this card tells the desk what `
              + `that check wants. Give the guard a rule that states it, or write the prose that `
              + `does.` });
        }
      }
      node.forEachChild(visit);
    };
    visit(sf);
  }
  for (const [tool, entry] of disclosureEntries(sources)) {
    if (entry.capAt === null || spoken.has(tool)) continue;
    findings.push({ code: 'CHECK_UNSPOKEN',
      sentence: `disclosure.${tool}.cap refuses at a figure and no sentence on this card states `
        + `that ceiling: the desk proposes the call, and the operator meets a limit nobody wrote `
        + `down. Give the guard on '${tool}' a rule that states the ceiling, or write the prose `
        + `that does.` });
  }
  return findings;
}

const LICENCES = new Set(['noSuchAct', 'aboutARead', 'conduct', 'seam']);
const WIDE_LICENCES = new Set(['oneLawEveryAct', 'sameRefusal']);
/** The licence a law about ONE refusal the world spells out claims. Its home is the act, so the
 *  desks holding that act read it and the desks that cannot perform it owe nothing — which is why
 *  the house-law rule steps over it. */
const SEAM_LICENCE = 'seam';

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
          sentence: `${at} — prose rule '${rule.name}' claims no reason. WHY names one: noSuchAct, aboutARead, conduct, seam, or measured:<case>` });
      } else if (!LICENCES.has(claim) && !claim.startsWith('measured:')) {
        findings.push({ code: 'PROSE_LICENCE_UNKNOWN',
          sentence: `${at} — prose rule '${rule.name}' claims '${claim}', which is not one of noSuchAct, aboutARead, conduct, seam or measured:<case>` });
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
function optionCode(node: ts.PropertyAssignment,
                    named: ReadonlyMap<string, string>): string | null {
  if (!ts.isIdentifier(node.name) && !ts.isStringLiteral(node.name)) return null;
  if (node.name.text !== 'code') return null;
  const code = codeText(node.initializer, named);
  if (code === null) return null;
  let at: ts.Node = node.parent;
  if (!ts.isObjectLiteralExpression(at)) return null;
  while (at.parent !== undefined && (ts.isAsExpression(at.parent)
    || ts.isSatisfiesExpression(at.parent) || ts.isParenthesizedExpression(at.parent))) at = at.parent;
  const call = at.parent;
  if (call === undefined || !ts.isCallExpression(call)) return null;
  const held = at;
  return call.arguments.some(argument => argument === held) ? code : null;
}

/** The code a declared gate refuses with: its kind, and the field it tests when it names one. */
function gateCode(node: ts.ObjectLiteralExpression,
                  named: ReadonlyMap<string, string>): string | null {
  let kind: string | null = null, field: string | null = null;
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) continue;
    const value = codeText(property.initializer, named);
    if (value === null) continue;
    if (property.name.text === 'kind') kind = value;
    if (property.name.text === 'field') field = value;
  }
  return kind === null ? null : field === null ? kind : `${kind}:${field}`;
}

/** The string an expression states, whether it states it itself or names the constant that
 *  holds it. */
function codeText(node: ts.Expression, named: ReadonlyMap<string, string>): string | null {
  const value = unwrap(node);
  if (ts.isIdentifier(value)) return named.get(value.text) ?? null;
  return literalText(value);
}

/** The gate literals a `gates` list carries: the ones written in place, and the ones a spread
 *  brings in from the list it names. */
function gateLiterals(listed: ts.Expression,
                      lists: ReadonlyMap<string, readonly ts.ObjectLiteralExpression[]>)
                      : readonly ts.ObjectLiteralExpression[] {
  const value = unwrap(listed);
  if (ts.isIdentifier(value)) return lists.get(value.text) ?? [];
  if (!ts.isArrayLiteralExpression(value)) return [];
  const entries: ts.ObjectLiteralExpression[] = [];
  for (const element of value.elements) {
    if (ts.isSpreadElement(element) && ts.isIdentifier(element.expression)) {
      entries.push(...(lists.get(element.expression.text) ?? []));
      continue;
    }
    const entry = unwrap(element);
    if (ts.isObjectLiteralExpression(entry)) entries.push(entry);
  }
  return entries;
}

/** The refusal codes a named helper hands back, so an act that calls it answers with every one of
 *  them: `return { error: 'CODE' }` and `return fail('CODE')` are the two shapes a world writes a
 *  shared refusal in. A helper reaching another helper carries that one's codes too, and the map
 *  grows until it stops growing. */
function helperCodes(sources: readonly Source[],
                     named: ReadonlyMap<string, string>): ReadonlyMap<string, readonly string[]> {
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
  const codes = new Map<string, string[]>();
  const note = (name: string, code: string): boolean => {
    const at = codes.get(name);
    if (at === undefined) { codes.set(name, [code]); return true; }
    if (at.includes(code)) return false;
    at.push(code);
    return true;
  };
  const errorCode = (node: ts.Node): string | null => {
    if (!ts.isObjectLiteralExpression(node)) return null;
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      if (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) continue;
      if (property.name.text === 'error') return codeText(property.initializer, named);
    }
    return null;
  };
  for (let grew = true; grew;) {
    grew = false;
    for (const local of locals) {
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const called = node.expression.text;
          if (REFUSAL_CALLS.has(called)) {
            const first = node.arguments[0];
            const code = first === undefined ? null : codeText(first, named);
            if (code !== null && note(local.name, code)) grew = true;
          }
          for (const code of codes.get(called) ?? [])
            if (note(local.name, code)) grew = true;
        }
        const returned = ts.isReturnStatement(node) && node.expression !== undefined
          ? unwrap(node.expression) : null;
        const code = returned === null ? null : errorCode(returned);
        if (code !== null && note(local.name, code)) grew = true;
        node.forEachChild(visit);
      };
      visit(local.body);
    }
  }
  return codes;
}

/** The refusals a WORLD spells out, paired to the card guard that refuses earlier in words. Four
 *  shapes make a row: a code at the emit site — `fail('CODE')` or `gateFail('CODE')` — a `code:`
 *  option a validator call is handed, a `gates` entry on an act, whose code is the gate's
 *  `kind:field`, and a call to a helper whose own returns spell refusal codes out. A code is read
 *  as it is written and through the constant or the named list that holds it; a code computed from
 *  a value nothing in the source spells offers nothing to read and makes no row. The act is the
 *  nearest enclosing key the surface declares, and the row set is one row per distinct
 *  act-and-code pair. A row whose guard is null is a refusal the operator meets as a bare code. */
export function seamCovered(subjectDir: string,
                            facts: { readonly tools: Readonly<Record<string, unknown>> }): readonly SeamRow[] {
  const sources = subjectSources(subjectDir);
  const lists = namedToolLists(sources);
  const named = namedStrings(sources);
  const gateLists = namedObjectLists(sources);
  const helpers = helperCodes(sources, named);
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
        const code = first === undefined ? null : codeText(first, named);
        if (code !== null) {
          const act = enclosingAct(node, declared);
          if (act !== null) add(act, code);
        }
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && !REFUSAL_CALLS.has(node.expression.text)) {
        const carried = helpers.get(node.expression.text) ?? [];
        const act = carried.length === 0 ? null : enclosingAct(node, declared);
        if (act !== null) for (const code of carried) add(act, code);
      }
      if (ts.isPropertyAssignment(node)) {
        const option = optionCode(node, named);
        if (option !== null) {
          const act = enclosingAct(node, declared);
          if (act !== null) add(act, option);
        }
      }
      if (ts.isPropertyAssignment(node)
        && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
        && node.name.text === 'gates') {
        const act = enclosingAct(node, declared);
        if (act !== null)
          for (const entry of gateLiterals(node.initializer, gateLists)) {
            const code = gateCode(entry, named);
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

/** One subject's desks: one spec each, and the business every one of them shares. It is the whole
 *  input to the prompt a subject sends — the world supplies the acts, and these supply who carries
 *  which of them. */
export interface DeskSubject {
  readonly specs: Readonly<Record<string, AgentSpec>>;
  readonly contract: DomainContract | undefined;
  readonly world: DeclaredWorld | McpWorldCard | LiveWorldCard;
}

/** Every problem the factory refused a desk's card for, as findings the caller reads in the one
 *  list it asked for. The desk is named in front of each, because the problem's own sentence
 *  speaks about a guard or a slot and not about which counter carries it. */
function refusedCard(desk: string, error: unknown): readonly LintFinding[] {
  if (!(error instanceof CardError)) throw error;
  return error.problems.map(problem => ({ code: problem.code,
    sentence: `desk '${desk}' — ${problem.sentence}` }));
}

/** What one desk renders, read off the card the ENGINE compiles: the acts the factory put in its
 *  lane, the bytes of its system prefix, and the DOES bytes of the tool cards behind it. A card's
 *  schema is not weighed here — it is argument structure the model fills, and `byteOrigin` counts
 *  it as its own slice.
 *
 *  A card the factory refuses renders nothing, so that desk has no row and its problems ride back
 *  as findings: a verb answers with a list, and a subject whose cards do not compile is owed the
 *  answers of every other verb in the same breath. */
function renderedDesks(subject: DeskSubject): {
  readonly rows: readonly { readonly desk: string; readonly lane: number;
                            readonly system: number; readonly cards: number }[];
  readonly refused: readonly LintFinding[] } {
  const facts = factsFromWorld(subject.world);
  const factory = new AgentFactory();
  const rows: { desk: string; lane: number; system: number; cards: number }[] = [];
  const refused: LintFinding[] = [];
  for (const [desk, spec] of Object.entries(subject.specs)) {
    try {
      const writer = new PromptWriter(factory.governed(spec, subject.contract, facts));
      rows.push({ desk,
        lane: writer.toolCards().length,
        system: writer.system().length,
        cards: writer.toolCards().reduce((n, card) => n + card.does.length, 0) });
    } catch (error) {
      refused.push(...refusedCard(desk, error));
    }
  }
  return { rows, refused };
}

/** The most acts one desk carries, reads counted. */
const LANE_CEILING = 15;

/** How much heavier than its system prefix a desk's cards may be. */
const CARD_WEIGHT_MULTIPLE = 2;

/** A desk carries at most fifteen acts. Past that the model stops choosing the act the operator
 *  asked for and starts choosing one that reads like it, and no sentence on any card recovers what
 *  the width costs — the split does.
 *
 *  The lane is the one the FACTORY built, not the list the spec typed: a spec naming no tools is
 *  handed every act the surface declares, and a name the surface does not hold is handed to no
 *  desk at all. A desk whose card the factory refuses has no lane to count, and what it is
 *  refused for is the finding it returns instead. */
export function laneWidth(subject: DeskSubject): readonly LintFinding[] {
  const { rows, refused } = renderedDesks(subject);
  return [...refused, ...rows
    .filter(row => row.lane > LANE_CEILING)
    .map(row => ({ code: 'LANE_TOO_WIDE',
      sentence: `desk '${row.desk}' carries ${row.lane} acts, and a desk carries at most `
        + `${LANE_CEILING}, reads counted: past that the act it picks is the one that reads like `
        + `what was asked for. Split the lane into desks that each hold the acts one operator asks `
        + `for together.` }))];
}

/** A desk's tool cards weigh at most twice its system prefix. The prefix is who the desk is and
 *  how it must behave; the cards are its acts and the rules riding on them — and a desk reading
 *  three times more about its acts than about its conduct answers the way the cards read.
 *
 *  Only the DOES bytes are weighed: the schema beside them is the shape of the arguments, which
 *  the model fills rather than obeys. Both counts come off the render the engine itself sends, so
 *  a desk whose card the factory refuses weighs nothing and returns that refusal instead. */
export function cardWeight(subject: DeskSubject): readonly LintFinding[] {
  const { rows, refused } = renderedDesks(subject);
  return [...refused, ...rows
    .filter(row => row.cards > row.system * CARD_WEIGHT_MULTIPLE)
    .map(row => ({ code: 'CARD_OVER_WEIGHT',
      sentence: `desk '${row.desk}' renders ${row.cards} B of tool cards behind a ${row.system} B `
        + `system prefix, and the cards weigh at most ${CARD_WEIGHT_MULTIPLE}× the prefix — `
        + `${row.system * CARD_WEIGHT_MULTIPLE} B here, so they are `
        + `${row.cards - row.system * CARD_WEIGHT_MULTIPLE} B over. The bytes sit in the sentence `
        + `each act carries and in every contract rule copied onto its card: split a rule that `
        + `names many acts so each act carries only its own, or split the lane.` }))];
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

type DisclosureEntry = { readonly before: string | null; readonly after: string | null;
                         readonly needs: ReadonlyMap<string, string>;
                         readonly capAt: string | null };

/** Every entry a subject's own `disclosure` map declares, read straight from source: the `before`
 *  and `after` sentences as written, its `needs` aliases resolved to the tool name each one reads,
 *  and the `cap.at` path when the entry carries a cap. */
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
          let before: string | null = null, after: string | null = null;
          let capAt: string | null = null, needs: ReadonlyMap<string, string> = new Map();
          for (const property of entry.initializer.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
              ? property.name.text : null;
            if (key === 'before') before = literalText(unwrap(property.initializer)) ?? '';
            if (key === 'after') after = literalText(unwrap(property.initializer)) ?? '';
            if (key === 'needs') needs = readNeeds(property.initializer);
            if (key === 'cap' && ts.isObjectLiteralExpression(property.initializer)) {
              for (const p of property.initializer.properties) {
                if (!ts.isPropertyAssignment(p)) continue;
                const capKey = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
                if (capKey === 'at') capAt = literalText(unwrap(p.initializer));
              }
            }
          }
          out.set(tool, { before, after, needs, capAt });
        }
      }
      node.forEachChild(visit);
    };
    visit(parse(f));
  }
  return out;
}

/** The acts one scripted turn licenses. A turn is the operator's text, a typed decline, or one or
 *  several approvals — and a single approval is the shape carrying `tool` itself. */
function approvedBy(turn: ExamTurn): readonly ApproveRef[] {
  if (typeof turn === 'string' || !('approve' in turn)) return [];
  return 'tool' in turn.approve ? [turn.approve] : turn.approve;
}

/** The acts an exam's turns hand a typed approval to: the case names the tool it licenses, so the
 *  consent question for that act is a question the exam actually renders. */
function approvedActs(cases: readonly ExamCase[]): ReadonlyMap<string, string> {
  const byAct = new Map<string, string>();
  for (const c of cases)
    for (const turn of c.turns)
      for (const ref of approvedBy(turn)) if (!byAct.has(ref.tool)) byAct.set(ref.tool, c.id);
  return byAct;
}

/** A slot the engine fills from THE RECORD: `{alias.…}` over a read the entry's own `needs`
 *  performs. An `{args.…}` slot is not one — it echoes the argument the model just proposed, so
 *  the operator reads the model's own word for the call back at them and learns nothing the record
 *  holds. */
function carriesFigure(sentence: string, needs: ReadonlyMap<string, string>): boolean {
  for (const alias of needs.keys()) if (sentence.includes(`{${alias}.`)) return true;
  return false;
}

/** The `{args.…}` slots a sentence carries, each one once and spelled as it is written, so a
 *  finding about them can quote the sentence's own words back to the author. */
function argsSlots(sentence: string): readonly string[] {
  const slots: string[] = [];
  for (let at = sentence.indexOf('{args.'); at !== -1; at = sentence.indexOf('{args.', at + 1)) {
    const end = sentence.indexOf('}', at);
    if (end === -1) continue;
    const slot = sentence.slice(at, end + 1);
    if (!slots.includes(slot)) slots.push(slot);
  }
  return slots;
}

/** Every tool whose fact carries `effect: 'destructive'` must have a disclosure entry that
 *  carries a `before`: the words the consent question renders. Without one the question asks
 *  with only the tool's own label — no amount, no record, nothing that cannot be undone named.
 *
 *  A `before` an exam actually renders owes one thing more. An act a case approves has its consent
 *  question read by the operator of that case, and that question states a figure off THE RECORD:
 *  an `{alias.…}` slot over a read the entry's own `needs` performs. The author's own words state
 *  what they knew when they wrote them, and an `{args.…}` echo states what the model proposed —
 *  neither is the record the operator is being asked to agree to move. */
export function destructiveDisclosed(subjectDir: string,
                                     facts: { readonly tools: Readonly<Record<string,
                                       { readonly effect?: string }>> },
                                     cases: readonly ExamCase[]): readonly LintFinding[] {
  const entries = disclosureEntries(subjectSources(subjectDir));
  const approved = approvedActs(cases);
  const findings: LintFinding[] = [];
  for (const [tool, fact] of Object.entries(facts.tools)) {
    if (fact.effect !== 'destructive') continue;
    const entry = entries.get(tool) ?? { before: null, after: null, needs: new Map(), capAt: null };
    if (entry.before === null) {
      findings.push({ code: 'DISCLOSURE_BEFORE_MISSING',
        sentence: `Destructive act '${tool}' has no disclosure 'before', so the consent question `
          + `carries only its label: no amount, no record, nothing that cannot be undone.` });
      continue;
    }
    const approvedBy = approved.get(tool);
    if (approvedBy === undefined || carriesFigure(entry.before, entry.needs)) continue;
    const aliases = [...entry.needs.keys()];
    const echoed = argsSlots(entry.before);
    findings.push({ code: 'DISCLOSURE_BEFORE_UNFIGURED',
      sentence: `case '${approvedBy}' approves '${tool}' and its disclosure 'before' carries no `
        + `figure off the record: `
        + (echoed.length > 0
          ? `${echoed.join(', ')} echoes the argument the model proposed, which the `
            + `operator is being asked about — it is not what the record holds. `
          : `every word of the question is the author's, and none of it is the record's. `)
        + (aliases.length === 0
          ? `Declare a needs read on this entry and quote what it returns.`
          : `Put a slot over one of this entry's needs aliases (${aliases.join(', ')}) in it.`) });
  }
  return findings;
}

/** Every act a case expects to change nothing, with the first case that expects it. The invariant
 *  watches one name — `anyOf` widens which CALL a required read is answered by and has no meaning
 *  here — so the act is the matcher's own name. */
function noEffectActs(cases: readonly ExamCase[]): ReadonlyMap<string, string> {
  const byAct = new Map<string, string>();
  for (const c of cases)
    for (const matcher of c.invariants?.noEffectToolCalls ?? [])
      if (!byAct.has(matcher.name)) byAct.set(matcher.name, c.id);
  return byAct;
}

/** The prose laws that pay a seam row, act by act: every WHY entry claiming the seam licence,
 *  read back through the coordinate its name carries — `seam:<act>:<CODE>`. A tool name carries no
 *  colon and a gate's code carries one, so the act ends at the SECOND colon and everything after
 *  it is the code. A name outside that shape pays no row, because nothing can say which row it
 *  meant. */
function seamLawsByAct(sources: readonly Source[]): ReadonlyMap<string, readonly string[]> {
  const byAct = new Map<string, string[]>();
  for (const [name, licence] of declaredMap(sources, 'WHY')) {
    if (licence !== SEAM_LICENCE || !name.startsWith('seam:')) continue;
    const end = name.indexOf(':', 'seam:'.length);
    if (end === -1) continue;
    const act = name.slice('seam:'.length, end);
    byAct.set(act, [...(byAct.get(act) ?? []), name.slice(end + 1)]);
  }
  return byAct;
}

/** The seam table folded act by act: every code the world can refuse the act's call with. */
function seamRowsByAct(subjectDir: string,
                       facts: { readonly tools: Readonly<Record<string, unknown>> })
                       : ReadonlyMap<string, readonly string[]> {
  const byAct = new Map<string, string[]>();
  for (const row of seamCovered(subjectDir, facts))
    byAct.set(row.act, [...(byAct.get(row.act) ?? []), row.code]);
  return byAct;
}

/** The code a custom executor's refusal spells: the refuse payload itself when it is the bare
 *  code, or its `error` field when detail rides along. Any other payload spells no code. */
function refusalCode(refuse: Json): string | null {
  if (typeof refuse === 'string') return refuse;
  if (typeof refuse === 'object' && refuse !== null && !Array.isArray(refuse)) {
    const error = (refuse as { readonly error?: Json }).error;
    if (typeof error === 'string') return error;
  }
  return null;
}

/** The code the world answers one call with: the act's own executor, run over the declared
 *  records — under a preset when one is named — with the same frozen snapshot a live call hands
 *  it. A successful call, a payload that spells no code, an executor that throws, or a preset the
 *  store refuses all answer null: nothing there is a refusal an operator can be owed a sentence
 *  about. */
function worldAnswerCode(world: DeclaredWorld, preset: string | undefined, act: string,
                         args: Readonly<Record<string, Json>>): string | null {
  const executor = world.executors[act];
  if (executor === undefined) return null;
  try {
    const records = new WorldBuilder().build(world, preset).snapshot();
    const out = executor({ args, records, mintId: entity => `${entity}_rehearsal` });
    return 'refuse' in out ? refusalCode(out.refuse) : null;
  } catch {
    return null;
  }
}

/** The rows the exam drives the world into. For every case that carries a preset and expects an
 *  act to change nothing, the act is run twice with the arguments the case's matcher supplies —
 *  once over the records as the card declares them, once under the case's preset. The row is
 *  driven when the preset run refuses with a code the base run does not answer: the preset, not
 *  the argument shape, is what put the world in front of that refusal. A case with no preset
 *  drives into nothing — the no-effect it expects is the consent hold's work, and the world never
 *  refuses. Only a declared world can be run here; a remote card drives nothing. */
function drivenRows(cases: readonly ExamCase[],
                    world: DeclaredWorld | McpWorldCard | LiveWorldCard)
                    : ReadonlyMap<string, ReadonlyMap<string, string>> {
  const out = new Map<string, Map<string, string>>();
  if (!('card' in world)) return out;
  const presets = world.card.presets ?? {};
  for (const c of cases) {
    if (c.preset === undefined || presets[c.preset] === undefined) continue;
    for (const matcher of c.invariants?.noEffectToolCalls ?? []) {
      const args = matcher.anyArgs ?? {};
      const driven = worldAnswerCode(world, c.preset, matcher.name, args);
      if (driven === null) continue;
      if (worldAnswerCode(world, undefined, matcher.name, args) === driven) continue;
      const rows = out.get(matcher.name) ?? new Map<string, string>();
      if (!rows.has(driven)) rows.set(driven, c.id);
      out.set(matcher.name, rows);
    }
  }
  return out;
}

/** A seam row a case drives into is one its operator stands in front of: the case's preset
 *  leaves the world refusing the act with that code, and the reply the operator reads is composed
 *  around that refusal. The row is spoken only when a seam law names ITS code —
 *  `seam:<act>:<CODE>` — because a sentence on one of the act's other rows is a sentence about a
 *  refusal this operator never meets. A case with no preset drives into nothing: the no-effect it
 *  expects is the consent hold refusing the unapproved call, and the world never answers. The
 *  rows nobody drives into are the budget, not failures. */
export function seamSpoken(subjectDir: string, cases: readonly ExamCase[],
                           world: DeclaredWorld | McpWorldCard | LiveWorldCard)
                           : readonly LintFinding[] {
  const spoken = seamLawsByAct(subjectSources(subjectDir));
  const findings: LintFinding[] = [];
  for (const [act, rows] of [...drivenRows(cases, world)].sort(([a], [b]) => a.localeCompare(b))) {
    for (const [code, caseId] of [...rows].sort(([a], [b]) => a.localeCompare(b))) {
      if ((spoken.get(act) ?? []).includes(code)) continue;
      findings.push({ code: 'SEAM_UNSPOKEN',
        sentence: `case '${caseId}' drives '${act}' into '${act} · ${code}': its preset leaves `
          + `the world refusing that call with this code, and no rule on this card states the `
          + `law around it. Declare a contract.seam entry on '${act}' for '${code}' — the `
          + `refusal this case's operator actually meets.` });
    }
  }
  return findings;
}

/** Every row of the seam table the exam leaves alone: no case drives the world into it, and no
 *  seam law names its code. Each row is its own warning line — a budget line, never a failure:
 *  the sentence it asks for is one the prompt would carry on every turn, and nobody has put an
 *  operator in front of the refusal. The gate prints every one of these with the run, so the
 *  whole unspoken table stays visible while the sentences stay unspent. */
export function seamUnreached(subjectDir: string, cases: readonly ExamCase[],
                              facts: { readonly tools: Readonly<Record<string, unknown>> },
                              world: DeclaredWorld | McpWorldCard | LiveWorldCard)
                              : readonly LintFinding[] {
  const spoken = seamLawsByAct(subjectSources(subjectDir));
  const driven = drivenRows(cases, world);
  const findings: LintFinding[] = [];
  for (const [act, codes] of [...seamRowsByAct(subjectDir, facts)]
      .sort(([a], [b]) => a.localeCompare(b))) {
    for (const code of [...codes].sort()) {
      if (driven.get(act)?.has(code) === true || (spoken.get(act) ?? []).includes(code)) continue;
      findings.push({ code: 'SEAM_UNREACHED',
        sentence: `no case drives into '${act} · ${code}', and no seam law names it — an operator `
          + `who meets that code meets it bare. A contract.seam entry on '${act}' for '${code}' `
          + `pays the sentence the day a case reaches this row.` });
    }
  }
  return findings;
}

/** The mechanisms that can refuse the CALL: each one judges the arriving call, and a call it
 *  refuses never reaches the world. Three shapes that look like protection are not here.
 *
 *  An `onlyAfter` owes a read rather than deciding a call: a desk that runs the prerequisite walks
 *  straight through it. A `checkResult` runs after the call returned — the record has already
 *  moved, and the finding it raises is a correction on the reply. A reply-bound check —
 *  `mustAccountFor`, a judged query, a `blockPattern` on the reply — reads words the desk wrote
 *  once the act was over. */
const DENYING_FACTORIES = ['precondition', 'valueFromUser', 'choiceFromUser', 'argFormat',
  'argAbsent', 'maxCalls'];

/** The words that say why the mechanisms an act carries cannot refuse its call. */
const NOTHING_DECIDES = 'none of those decides the call — an order is cleared by reading it, and '
  + 'a check over the result or over the reply lands after the record has moved';

/** The names that DECIDE a call, the wrappers around them included: a subject names a gate once
 *  and reaches for that name on every act it covers, so a helper whose body reaches a denying
 *  factory denies too. The set grows until it stops growing, and `deny` and `cap` join it as
 *  themselves — a hand-written predicate and a ceiling both answer the call. */
function denyingNames(sources: readonly Source[]): ReadonlySet<string> {
  const known = new Set(DENYING_FACTORIES);
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
  known.add('deny');
  known.add('cap');
  return known;
}

/** A case that lists an act under `noEffectToolCalls` measures a REFUSAL, and a refusal the cards
 *  cannot produce is a refusal the exam is asking the model to perform out of goodwill. The act
 *  therefore carries a mechanism that can deny the call itself — a role or state precondition, a
 *  choice or value the operator has to have given, a format or ceiling the arriving call fails.
 *
 *  What the act carries is read for its SHAPE, never counted. An `onlyAfter` is satisfied by
 *  running the read, and a desk that reads first then acts has cleared it. A `checkResult` or a
 *  reply-bound check answers once the call has returned, and by then the record has moved. Either
 *  way the invariant fails on a call the engine allowed. */
export function noEffectDenied(subjectDir: string, cases: readonly ExamCase[]): readonly LintFinding[] {
  const sources = subjectSources(subjectDir);
  const checks = checksByTool(sources, factoryNames(sources));
  const denying = denyingNames(sources);
  const findings: LintFinding[] = [];
  for (const [act, caseId] of noEffectActs(cases)) {
    const carried = checks.get(act) ?? [];
    if (carried.some(mechanism => denying.has(mechanism))) continue;
    findings.push({ code: 'ACT_UNDENIABLE',
      sentence: `case '${caseId}' expects '${act}' to change nothing, and nothing on this card can `
        + `refuse that call: it carries ${carried.length === 0 ? 'no check at all'
          : `only ${carried.join(' · ')}, and ${NOTHING_DECIDES}`}. Put a check that decides the `
        + `call itself over '${act}' — a role or state `
        + `precondition, a choice or a value the operator has to have given.` });
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
 *  packages/core/src/cards/agent-factory.ts; two more — claimIsGrounded and
 *  claimIsComplete, the honesty floor — are installed by Rulebook in
 *  packages/core/src/run/rulebook.ts; and figureIsGrounded is raised by the turn itself in
 *  packages/core/src/run/turn.ts, over every figure the outgoing message states. A card that
 *  authors any of these, bare or prefixed with a colon, shadows a guard the engine installs
 *  itself. */
const FLOOR_NAMES = new Set(['confirmFirst', 'groundedIds', 'groundedDates', 'noDuplicateCall',
  'argRequired', 'maxDestructive', 'brokenReply', 'questionAnswered', 'claimIsGrounded',
  'claimIsComplete', 'figureIsGrounded']);

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


/** The six voices a house teaches, one conduct law each. A conduct law is a prose guard on the
 *  desk that carries it, and a spec guard's RULE renders into that desk's system prefix — so a
 *  voice a desk does not carry, and a voice whose rule says nothing, are the same law that desk
 *  never reads. */
const VOICES = ['declareHonestly', 'oneQuestion', 'yourLaneYourReads', 'recordsOverAssertions',
  'askBeforeYouChoose', 'nameItDoNotPassItOn'];

/** Every desk of a multi-desk house teaches all six voices. The operator is handed from one
 *  counter to the next inside a single conversation, and a voice taught at the first and missing
 *  at the second answers the same person two different ways: the desk that carries
 *  `recordsOverAssertions` states what the read returned, and the desk beside it — reading a
 *  prefix that never names the law — states what it remembers.
 *
 *  One desk is one counter, and there is no second way for it to answer, so the six bind nothing
 *  on a single-spec subject. */
export function conductComplete(specs: Readonly<Record<string, AgentSpec>>): readonly LintFinding[] {
  const desks = Object.entries(specs);
  if (desks.length < 2) return [];
  const findings: LintFinding[] = [];
  for (const [desk, spec] of desks) {
    const taught = new Set((spec.guards ?? [])
      .filter(guard => guard.rule.trim() !== '').map(guard => guard.name));
    for (const voice of VOICES) {
      if (taught.has(voice)) continue;
      findings.push({ code: 'CONDUCT_INCOMPLETE',
        sentence: `desk '${desk}' says nothing under '${voice}', so its system prefix never states `
          + `that law: the desks of this house answer one operator by different laws depending on `
          + `which counter the conversation reached. Teach '${voice}' on this desk too.` });
    }
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
 *  declares none is walked past in silence.
 *
 *  A preset is a patch over records a card declares, and only a card-carrying world is built from
 *  one: over an MCP or live surface the runner never reaches the builder, so it neither applies a
 *  preset nor refuses one. The sentence below states a refusal, and a refusal that cannot happen is
 *  not a finding to state — those worlds are left to the verb that can describe what they do. */
export function presetsDeclared(cases: readonly ExamCase[],
                                world: DeclaredWorld | McpWorldCard | LiveWorldCard): readonly LintFinding[] {
  if (!('card' in world)) return [];
  const declared = new Set(Object.keys(world.card.presets ?? {}));
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
