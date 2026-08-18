/** The static lints over a subject and the guard-coverage census over run dumps.
 *  Purity: subject code carries NO regex — the four lawful regex homes live in the
 *  engine's catalog, never in a subject. Name gate: the §11 register with an EMPTY
 *  allowlist. Census: a guard is covered only by a dump in which it FIRED — an
 *  exclusion keyed on a label cannot certify a never-fired guard. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import type { GuardCensus, TurnRecord } from '@looprun-ai/next-core';
import { RETIRED_NAMES } from '@looprun-ai/next-core';

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

export function purity(subjectDir: string): readonly LintFinding[] {
  const findings: LintFinding[] = [];
  for (const f of subjectSources(subjectDir)) {
    const sf = ts.createSourceFile(f.rel, f.text, ts.ScriptTarget.ES2022, true);
    const visit = (node: ts.Node): void => {
      if (ts.isRegularExpressionLiteral(node)
        || (ts.isNewExpression(node) && ts.isIdentifier(node.expression)
            && node.expression.text === 'RegExp')) {
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
