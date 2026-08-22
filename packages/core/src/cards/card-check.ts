/** Validates both cards + the surface card together at construction; collects EVERY
 *  problem; throws one CardError with named codes and fix-stating sentences. A
 *  misconfigured guard THROWS — an inert guard that reads as coverage is worse than
 *  an absent one. */
import type { Json, SurfaceFacts, ToolFact } from '../contract/vocabulary.js';
import { CardError } from '../contract/vocabulary.js';
import type { AgentSpec, Disclosure, DomainContract, Guard, Limits } from './cards.js';

type Problem = { readonly code: string; readonly sentence: string };

function schemaArgs(fact: ToolFact | undefined): readonly string[] {
  const schema = fact?.schema;
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return [];
  const properties = (schema as { readonly properties?: Json }).properties;
  if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) return [];
  return Object.keys(properties);
}

export class CardCheck {
  check(spec: AgentSpec, contract: DomainContract | undefined, facts: SurfaceFacts): void {
    const problems: Problem[] = [];
    this.checkGuards(spec.guards ?? [], 'spec', facts, problems);
    this.checkGuards(contract?.guards ?? [], 'contract', facts, problems);
    this.checkDisclosure(contract?.disclosure ?? {}, facts, problems);
    this.checkSecrets(contract?.secrets ?? [], problems);
    this.checkLimits(spec.limits, problems);
    this.checkLimits(contract?.limits, problems);
    for (const fact of Object.values(facts.tools)) {
      if (fact.effect === 'destructive' && fact.label === null) {
        problems.push({ code: 'LABEL_MISSING',
          sentence: `Destructive tool '${fact.name}' has no label — the consent question needs one.` });
      }
    }
    if (problems.length > 0) throw new CardError(problems);
  }

  private checkGuards(guards: readonly Guard[], home: 'spec' | 'contract',
                      facts: SurfaceFacts, problems: Problem[]): void {
    const seen = new Set<string>();
    for (const g of guards) {
      if (seen.has(g.name)) {
        problems.push({ code: 'GUARD_NAME_DUP',
          sentence: `Guard '${g.name}' is declared twice on the ${home} card — pass { name } to one of them.` });
      }
      seen.add(g.name);
      if (g.deny !== undefined && g.judgeQuery !== undefined) {
        problems.push({ code: 'GUARD_BOTH_DENY_AND_JUDGE',
          sentence: `Guard '${g.name}' declares deny AND judgeQuery — delete one; deny decides, judgeQuery asks.` });
      }
      if ((g as { readonly on?: string }).on === undefined) {
        problems.push({ code: 'GUARD_PHASE_MISSING',
          sentence: `Guard '${g.name}' declares no 'on' phase — a hand-written guard types it.` });
      }
      if (g.judgeQuery !== undefined && g.on !== 'reply') {
        problems.push({ code: 'GUARD_JUDGE_PHASE',
          sentence: `Guard '${g.name}' is judged, so its 'on' must be 'reply'.` });
      }
      if (g.judgeQuery !== undefined && home === 'contract') {
        problems.push({ code: 'GUARD_JUDGE_ON_CONTRACT',
          sentence: `Guard '${g.name}' is judged and sits on the contract, so it runs on every reply of every desk. `
            + `Declare it on the spec that owes the judgement.` });
      }
      const tools = g.tool === undefined ? [] : typeof g.tool === 'string' ? [g.tool] : g.tool;
      for (const t of tools) {
        if (facts.tools[t] === undefined) {
          problems.push({ code: 'TOOL_GUARD_OFF_SURFACE',
            sentence: `Guard '${g.name}' names tool '${t}', and the surface declares no such tool.` });
        }
      }
    }
  }

  private checkDisclosure(disclosure: Readonly<Record<string, Disclosure>>,
                          facts: SurfaceFacts, problems: Problem[]): void {
    for (const [toolName, d] of Object.entries(disclosure)) {
      const held = facts.tools[toolName];
      if (held === undefined) {
        problems.push({ code: 'DISCLOSURE_UNKNOWN_TOOL',
          sentence: `Disclosure names tool '${toolName}', and the surface declares no such tool.` });
        continue;
      }
      for (const [alias, recipe] of Object.entries(d.needs ?? {})) {
        const readName = typeof recipe === 'string' ? recipe : recipe.tool;
        const read = facts.tools[readName];
        if (read === undefined) {
          problems.push({ code: 'DISCLOSURE_UNKNOWN_TOOL',
            sentence: `Disclosure alias '${alias}' needs tool '${readName}', and the surface declares no such tool.` });
          continue;
        }
        if (read.effect !== 'read') {
          problems.push({ code: 'SLOT_UNDERIVABLE',
            sentence: `Disclosure alias '${alias}' needs '${readName}', which is not a read — the engine performs only reads.` });
          continue;
        }
        const readArgs = schemaArgs(read);
        const heldArgs = schemaArgs(held);
        if (typeof recipe === 'string') {
          const target = held.target;
          if (target === null || !readArgs.includes(target)) {
            problems.push({ code: 'SLOT_UNDERIVABLE',
              sentence: `'{${alias}.*}' needs ${readName} to accept the held call's target '${String(target)}' — it declares no '${String(target)}' arg; add needs: { ${alias}: { tool: '${readName}', args: { ${readArgs[0] ?? 'arg'}: '${String(target)}' } } }.` });
          }
        } else {
          for (const [readArg, heldArg] of Object.entries(recipe.args)) {
            if (!readArgs.includes(readArg)) {
              problems.push({ code: 'SLOT_UNDERIVABLE',
                sentence: `Disclosure alias '${alias}' maps '${readArg}', and ${readName} declares no such arg.` });
            }
            if (heldArg.includes('.')) {
              const head = heldArg.slice(0, heldArg.indexOf('.'));
              if (head === alias || !(head in (d.needs ?? {}))) {
                problems.push({ code: 'SLOT_UNDERIVABLE',
                  sentence: `Disclosure alias '${alias}' fills '${readArg}' with '${heldArg}', and '${head}' is no other alias of this entry — a chained value starts at an alias declared beside it.` });
              }
            } else if (!heldArgs.includes(heldArg)) {
              problems.push({ code: 'SLOT_UNDERIVABLE',
                sentence: `Disclosure alias '${alias}' fills '${readArg}' using held arg '${heldArg}', and ${toolName} declares no such arg.` });
            }
          }
        }
      }
      this.checkNeedsOrder(toolName, d, problems);
    }
  }

  /** Aliases that read each other have no running order. The chain graph is walked the way the
   *  engine will run it — an alias whose every reference is already placed runs next — and what
   *  cannot be placed is a cycle, named by its members. */
  private checkNeedsOrder(toolName: string, entry: Disclosure, problems: Problem[]): void {
    const needs = entry.needs ?? {};
    const refsOf = (recipe: (typeof needs)[string]): readonly string[] =>
      typeof recipe === 'string' ? [] : Object.values(recipe.args)
        .filter(v => v.includes('.')).map(v => v.slice(0, v.indexOf('.')))
        .filter(head => head in needs);
    const placed = new Set<string>();
    const pending = new Set(Object.keys(needs));
    let moved = true;
    while (moved) {
      moved = false;
      for (const alias of [...pending]) {
        if (refsOf(needs[alias]).every(head => placed.has(head))) {
          placed.add(alias);
          pending.delete(alias);
          moved = true;
        }
      }
    }
    if (pending.size > 0) {
      problems.push({ code: 'SLOT_UNDERIVABLE',
        sentence: `Disclosure needs of '${toolName}' form a cycle over ${[...pending].map(a => `'${a}'`).join(', ')} — no order can run them.` });
    }
  }

  private checkSecrets(secrets: NonNullable<DomainContract['secrets']>, problems: Problem[]): void {
    for (const s of secrets) {
      const path = typeof s === 'string' ? s : s.path;
      if (path.trim() === '') {
        problems.push({ code: 'SECRET_EMPTY',
          sentence: 'A secret entry is empty — name the field or dotted path it protects.' });
      }
    }
  }

  private checkLimits(limits: Limits | undefined, problems: Problem[]): void {
    for (const [key, value] of Object.entries(limits ?? {})) {
      if (typeof value === 'number' && (!Number.isInteger(value) || value <= 0)) {
        problems.push({ code: 'LIMIT_NOT_POSITIVE',
          sentence: `Limit '${key}' is ${String(value)} — a ceiling is a positive integer.` });
      }
    }
  }
}
