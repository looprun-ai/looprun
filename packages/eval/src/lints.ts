/** The static lints over a subject and the guard-coverage census over run dumps.
 *  Purity: subject code carries NO regex — the four lawful regex homes live in the
 *  engine's catalog, never in a subject. Name gate: the §11 register with an EMPTY
 *  allowlist. Census: a guard is covered only by a dump in which it FIRED — an
 *  exclusion keyed on a label cannot certify a never-fired guard. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import type { GuardCensus, TurnRecord } from '@looprun-ai/core';
import { RETIRED_NAMES } from '@looprun-ai/core';

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
  const take = (arg: ts.Expression | undefined, mechanism: string): void => {
    if (arg === undefined) return;
    if (ts.isStringLiteral(arg)) note(arg.text, mechanism);
    else if (ts.isArrayLiteralExpression(arg))
      for (const element of arg.elements) if (ts.isStringLiteral(element)) note(element.text, mechanism);
  };
  for (const f of sources) {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && factories.has(node.expression.text)) {
        const mechanism = node.expression.text;
        take(node.arguments[0], mechanism);
        for (const arg of node.arguments) if (ts.isArrayLiteralExpression(arg)) take(arg, mechanism);
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

/** The laws a subject states and no call can break, each with the reason a reviewer weighs. */
function residue(sources: readonly Source[]): ReadonlyMap<string, string> {
  const reasons = new Map<string, string>();
  for (const f of sources) {
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
        && node.name.text === 'RESIDUE' && node.initializer !== undefined) {
        const object = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
        if (ts.isObjectLiteralExpression(object))
          for (const property of object.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            if (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) continue;
            if (ts.isStringLiteral(property.initializer))
              reasons.set(property.name.text, property.initializer.text);
          }
      }
      node.forEachChild(visit);
    };
    visit(parse(f));
  }
  return reasons;
}

/** A rule the prompt states and no function decides — whichever shape it was written in.
 *  `tools` is null when the rule declares none: it reaches no act at all. */
type ProseRule = { readonly name: string; readonly tools: readonly string[] | null;
                   readonly node: ts.Node };

const toolsOf = (arg: ts.Expression | undefined): readonly string[] | null => {
  if (arg === undefined) return null;
  if (ts.isStringLiteral(arg)) return [arg.text];
  if (!ts.isArrayLiteralExpression(arg)) return null;
  return arg.elements.filter(ts.isStringLiteral).map(element => element.text);
};

/** Two shapes reach the same place: a `prose(name, rule, tool)` call, and an object literal
 *  naming itself with a string, carrying a rule, and carrying neither `deny` nor `judgeQuery`.
 *  A factory's own output is neither — it names itself through a spread, or carries a check. */
function proseRules(sf: ts.SourceFile): readonly ProseRule[] {
  const rules: ProseRule[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'prose') {
      const first = node.arguments[0];
      if (first !== undefined && ts.isStringLiteral(first))
        rules.push({ name: first.text, tools: toolsOf(node.arguments[2]), node });
    }
    if (ts.isObjectLiteralExpression(node)) {
      let name: string | null = null, ruled = false, decides = false;
      let tools: readonly string[] | null = null;
      for (const property of node.properties) {
        const key = property.name !== undefined && ts.isIdentifier(property.name)
          ? property.name.text : null;
        if (key === null) continue;
        if (key === 'deny' || key === 'judgeQuery') decides = true;
        if (!ts.isPropertyAssignment(property)) continue;
        if (key === 'name' && ts.isStringLiteral(property.initializer)) name = property.initializer.text;
        if (key === 'rule') ruled = true;
        if (key === 'tool') tools = toolsOf(property.initializer);
      }
      if (name !== null && ruled && !decides) rules.push({ name, tools, node });
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return rules;
}

/** Shorter than this and a residue reason is a label, not a justification a reviewer weighs. */
const A_REASON = 20;

export function pairing(subjectDir: string): readonly LintFinding[] {
  const sources = subjectSources(subjectDir);
  const surface = toolSurface(sources);
  const checks = checksByTool(sources, factoryNames(sources));
  const reasons = residue(sources);
  const findings: LintFinding[] = [];

  for (const [name, reason] of reasons)
    if (reason.trim().length < A_REASON) findings.push({ code: 'PROSE_RESIDUE_UNEXPLAINED',
      sentence: `RESIDUE names '${name}' with no reason a reviewer can weigh` });

  for (const f of sources) {
    const sf = parse(f);
    for (const rule of proseRules(sf)) {
      const at = `${f.rel}:${sf.getLineAndCharacterOfPosition(rule.node.getStart(sf)).line + 1}`;
      if (rule.tools === null || rule.tools.length === 0) {
        if (!reasons.has(rule.name)) findings.push({ code: 'PROSE_RESIDUE_UNDECLARED',
          sentence: `${at} — prose rule '${rule.name}' names no act, and RESIDUE does not say why` });
        continue;
      }
      for (const tool of rule.tools) {
        if (!surface.has(tool)) findings.push({ code: 'PROSE_TOOL_UNKNOWN',
          sentence: `${at} — prose rule '${rule.name}' names '${tool}', which is on no effect block` });
        else if (!checks.has(tool)) findings.push({ code: 'PROSE_TOOL_UNCHECKED',
          sentence: `${at} — prose rule '${rule.name}' names '${tool}', which carries no deterministic guard and no cap` });
      }
    }
  }
  return findings;
}

/** The justification table, read from the card. The rows above the rule are derived; the rows
 *  below it are the residue, and their reason is the only line an author writes. */
export function pairingTable(subjectDir: string): string {
  const sources = subjectSources(subjectDir);
  const checks = checksByTool(sources, factoryNames(sources));
  const reasons = residue(sources);
  const carried: string[] = [], residual: string[] = [];
  for (const f of sources)
    for (const rule of proseRules(parse(f))) {
      if (rule.tools === null || rule.tools.length === 0) {
        residual.push(`| ${rule.name} | — | nothing | ${reasons.get(rule.name) ?? '(undeclared)'} |`);
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
