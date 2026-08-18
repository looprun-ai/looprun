/** Cards + surface facts → ONE frozen CompiledAgent: the priority-ordered guard
 *  array (spec → contract → consent → the engine floor, with the auto-installed
 *  guards derived from declarations), the judged rows, the rewrites, the mask keys,
 *  the disclosure bindings (slot derivability re-proved by CardCheck), the resolved
 *  wording, and the prompt raw material. NOTHING JUDGED IS AUTO-INSTALLED. Compiled
 *  once, deep-frozen; the runtime never re-reads the authored form. */
import type { Json, SurfaceFacts, ToolFact } from '../contract/vocabulary.js';
import { deepFreeze } from '../contract/freeze.js';
import type { AgentSpec, CompiledAgent, CompiledGuard, Disclosure, DisclosureBinding,
              DomainContract, Guard, JudgedGuard, MaskKey } from './cards.js';
import { DEFAULT_LIMITS } from './cards.js';
import { CardCheck } from './card-check.js';
import { argFormat, argRequired, brokenReply, confirmFirst, maxDestructive,
         noDuplicateCall, type SeedGuard } from './catalog.js';
import { resolveWording } from './wordings.js';

function isSeed(g: Guard): g is SeedGuard {
  return 'compile' in g && typeof (g as { compile?: unknown }).compile === 'function';
}

function isJsonRecord(v: Json | undefined): v is { readonly [k: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A hand-written Guard wrapped as its installed row: kind custom / judged / prose. */
function installHandWritten(g: Guard, home: 'spec' | 'contract'): CompiledGuard {
  const tools = g.tool === undefined ? [] : typeof g.tool === 'string' ? [g.tool] : [...g.tool];
  return {
    name: g.name, rule: g.rule, home, on: g.on, tools,
    kind: g.judgeQuery !== undefined ? 'judged' : g.deny !== undefined ? 'custom' : 'prose',
    judged: g.judgeQuery !== undefined,
    judgePolicy: g.judgeQuery === undefined ? null : g.judgePolicy ?? 'denyOnFails',
    installedBecause: `declared on the ${home} card`,
    deny: ctx => g.deny?.(ctx) ?? null
  };
}

function schemaOf(fact: ToolFact): { readonly properties: Readonly<Record<string, Json>>;
                                     readonly required: readonly string[] } {
  const schema = fact.schema;
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return { properties: {}, required: [] };
  }
  const s = schema as { readonly properties?: Json; readonly required?: Json };
  const properties = isJsonRecord(s.properties) ? s.properties : {};
  const required = Array.isArray(s.required) ? s.required.filter(r => typeof r === 'string') : [];
  return { properties, required };
}

function compileMaskKeys(secrets: DomainContract['secrets']): readonly MaskKey[] {
  return (secrets ?? []).map(s => typeof s === 'string'
    ? { path: s.split('.'), mode: 'mask' as const }
    : { path: s.path.split('.'), mode: s.mode });
}

function compileDisclosure(disclosure: Readonly<Record<string, Disclosure>>,
                           facts: SurfaceFacts): Record<string, DisclosureBinding> {
  const out: Record<string, DisclosureBinding> = {};
  for (const [tool, d] of Object.entries(disclosure)) {
    const held = facts.tools[tool];
    const needs: Record<string, { tool: string; args: Record<string, string> }> = {};
    for (const [alias, recipe] of Object.entries(d.needs ?? {})) {
      if (typeof recipe === 'string') {
        const target = held.target ?? 'id';
        needs[alias] = { tool: recipe, args: { [target]: target } };
      } else {
        needs[alias] = { tool: recipe.tool, args: { ...recipe.args } };
      }
    }
    out[tool] = { needs, before: d.before ?? null, after: d.after ?? null, later: d.later ?? null };
  }
  return out;
}

export class AgentFactory {
  governed(spec: AgentSpec, contract: DomainContract | undefined, facts: SurfaceFacts): CompiledAgent {
    return deepFreeze(this.compile(spec, contract, facts, true));
  }

  /** The same agent with every guard's enforcement disarmed and the PROMPT PARTS
   *  byte-identical — the prose still teaches every guard; an ungoverned run
   *  measures the model with teaching held constant. */
  ungoverned(spec: AgentSpec, contract: DomainContract | undefined, facts: SurfaceFacts): CompiledAgent {
    return deepFreeze(this.compile(spec, contract, facts, false));
  }

  private compile(spec: AgentSpec, contract: DomainContract | undefined,
                  facts: SurfaceFacts, armed: boolean): CompiledAgent {
    new CardCheck().check(spec, contract, facts);
    const lane = spec.tools === undefined ? facts
      : { tools: Object.fromEntries(Object.entries(facts.tools)
          .filter(([name]) => spec.tools?.includes(name))) };

    const limits = { ...DEFAULT_LIMITS, ...contract?.limits, ...spec.limits };
    const guards: CompiledGuard[] = [];
    const judged: JudgedGuard[] = [];

    const declare = (list: readonly Guard[], home: 'spec' | 'contract'): void => {
      for (const g of list) {
        if (g.judgeQuery !== undefined) {
          const tools = g.tool === undefined ? [] : typeof g.tool === 'string' ? [g.tool] : [...g.tool];
          judged.push({ name: g.name, rule: g.rule, home, on: g.on, tools, kind: 'judged',
            judged: true, judgePolicy: g.judgePolicy ?? 'denyOnFails',
            installedBecause: `declared on the ${home} card`, judgeQuery: g.judgeQuery });
          continue;
        }
        guards.push(isSeed(g) ? g.compile(home, lane) : installHandWritten(g, home));
      }
    };
    declare(spec.guards ?? [], 'spec');
    declare(contract?.guards ?? [], 'contract');

    for (const fact of Object.values(lane.tools)) {
      if (fact.effect === 'destructive') {
        guards.push(confirmFirst(fact.name, fact.label ?? fact.name).compile('engine', lane));
      }
    }
    guards.push(maxDestructive(limits.destructive).compile('engine', lane));
    guards.push(noDuplicateCall().compile('engine', lane));
    for (const fact of Object.values(lane.tools)) {
      const { properties, required } = schemaOf(fact);
      for (const arg of required) {
        guards.push(argRequired(fact.name, arg).compile('engine', lane));
      }
      for (const [arg, decl] of Object.entries(properties)) {
        const pattern = typeof decl === 'object' && decl !== null && !Array.isArray(decl)
          ? (decl as { readonly pattern?: Json }).pattern : undefined;
        if (typeof pattern === 'string') {
          guards.push(argFormat(fact.name, arg, pattern).compile('engine', lane));
        }
      }
    }
    guards.push(brokenReply().compile('engine', lane));

    const armedGuards = armed ? guards : guards.map(g => ({
      ...g,
      deny: () => null,
      ...(g.owe !== undefined ? { owe: () => null } : {}),
      ...(g.restate !== undefined ? { restate: () => null } : {}),
      ...(g.hold !== undefined ? { hold: () => null } : {})
    }));

    return {
      guards: armedGuards,
      judged: armed ? judged : [],
      rewrites: armed ? [...contract?.rewrites ?? []] : [],
      limits,
      maskKeys: compileMaskKeys(contract?.secrets),
      disclosureBindings: compileDisclosure(contract?.disclosure ?? {}, lane),
      wording: resolveWording(contract?.wording),
      promptParts: {
        persona: spec.persona,
        voice: contract?.voice ?? null,
        facts: [...contract?.facts ?? []]
      },
      facts: lane
    };
  }
}
