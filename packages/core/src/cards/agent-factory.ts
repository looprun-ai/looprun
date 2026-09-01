/** Cards + surface facts → ONE frozen CompiledAgent: the priority-ordered guard
 *  array (spec → contract → consent → the engine floor, with the auto-installed
 *  guards derived from declarations), the judged rows, the rewrites, the mask keys,
 *  the disclosure bindings (slot derivability re-proved by CardCheck), the resolved
 *  wording, and the prompt raw material. NOTHING JUDGED IS AUTO-INSTALLED, and the
 *  judged rows are filled only for a spec that declares the judged pass. Compiled
 *  once, deep-frozen; the runtime never re-reads the authored form. */
import type { Json, SurfaceFacts, ToolFact } from '../contract/vocabulary.js';
import { TurnFailure } from '../contract/vocabulary.js';
import { deepFreeze } from '../contract/freeze.js';
import type { AgentSpec, CompiledAgent, CompiledGuard, Disclosure, DisclosureBinding,
              DomainContract, Guard, JudgedGuard, MaskKey } from './cards.js';
import { DEFAULT_LIMITS } from './cards.js';
import { CardCheck } from './card-check.js';
import { argMatchesFormat, argRequired, brokenReply, confirmFirst, groundedDates, groundedIds, maxDestructive,
         questionAnswered,
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

/** A needs guard's declared relation, carried on its seed for the disclosure merge. */
interface NeedsRelation { readonly read: string; readonly args: Readonly<Record<string, string>>;
  readonly pick?: { readonly list: string; readonly by: string; readonly key: string } }

/** Every needs guard whose relation declares its args serves the consent disclosure
 *  too: the relation lands on the act's binding under the read's alias. One
 *  declaration, one home — an alias already on the disclosure block throws. */
function mergeNeedsRelations(bindings: Record<string, DisclosureBinding>,
                             contract: DomainContract | undefined): void {
  for (const g of contract?.guards ?? []) {
    const seed = g as { kind?: string; tool?: string | readonly string[];
                        relation?: NeedsRelation | null };
    if (seed.kind !== 'needs' || seed.relation == null) continue;
    const tool = typeof seed.tool === 'string' ? seed.tool : seed.tool?.[0];
    if (tool === undefined) continue;
    const binding = bindings[tool] ?? { needs: {}, before: null, after: null,
      later: null, cap: null, empty: null };
    if (binding.needs[seed.relation.read] !== undefined) {
      throw new TurnFailure('construction',
        `one declaration, one home: '${seed.relation.read}' is declared on both the needs guard and the disclosure of '${tool}'`);
    }
    bindings[tool] = { ...binding, needs: { ...binding.needs,
      [seed.relation.read]: { tool: seed.relation.read, args: { ...seed.relation.args },
        ...(seed.relation.pick === undefined ? {} : { pick: seed.relation.pick }) } } };
  }
}

function compileDisclosure(disclosure: Readonly<Record<string, Disclosure>>,
                           facts: SurfaceFacts): Record<string, DisclosureBinding> {
  const out: Record<string, DisclosureBinding> = {};
  for (const [tool, d] of Object.entries(disclosure)) {
    const held = facts.tools[tool];
    // The contract discloses every act the BUSINESS holds; a desk compiles only the acts in
    // its own lane. A sentence about an act this desk cannot perform binds to nothing.
    if (held === undefined) continue;
    const needs: Record<string, { tool: string; args: Record<string, string>;
      pick?: { list: string; by: string; key: string } }> = {};
    for (const [alias, recipe] of Object.entries(d.needs ?? {})) {
      if (typeof recipe === 'string') {
        const target = held.target ?? 'id';
        needs[alias] = { tool: recipe, args: { [target]: target } };
      } else {
        needs[alias] = { tool: recipe.tool, args: { ...recipe.args },
          ...(recipe.pick === undefined ? {} : { pick: recipe.pick }) };
      }
    }
    out[tool] = { needs, before: d.before ?? null, after: d.after ?? null,
      later: d.later ?? null, cap: d.cap ?? null, empty: d.empty ?? null };
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
          .filter(([name]) => spec.tools?.includes(name))),
        };

    const limits = { ...DEFAULT_LIMITS, ...contract?.limits, ...spec.limits };
    const guards: CompiledGuard[] = [];
    const judged: JudgedGuard[] = [];

    const declare = (list: readonly Guard[], home: 'spec' | 'contract'): void => {
      for (const g of list) {
        if (g.judgeQuery !== undefined) {
          const tools = g.tool === undefined ? [] : typeof g.tool === 'string' ? [g.tool] : [...g.tool];
          judged.push({ name: g.name, rule: g.rule, home, on: g.on, tools, kind: 'judged',
            judged: true, installedBecause: `declared on the ${home} card`,
            judgeQuery: g.judgeQuery });
          continue;
        }
        guards.push(isSeed(g) ? g.compile(home, lane) : installHandWritten(g, home));
      }
    };
    declare(spec.guards ?? [], 'spec');
    declare(contract?.guards ?? [], 'contract');

    // Groundedness outranks consent: an id nobody produced refuses before it is
    // ever put up for approval.
    guards.push(groundedIds().compile('engine', lane));
    guards.push(groundedDates().compile('engine', lane));
    for (const fact of Object.values(lane.tools)) {
      if (fact.effect === 'destructive') {
        guards.push(confirmFirst(fact.name, fact.label ?? fact.name,
          fact.destructiveWhen ?? undefined).compile('engine', lane));
      }
    }
    // A re-proposed call restates its first result before any budget counts it:
    // the duplicate floor walks ahead of the destructive cap, so re-saying an act
    // that already ran is never narrated as a second act being blocked.
    guards.push(noDuplicateCall().compile('engine', lane));
    guards.push(maxDestructive(limits.destructive).compile('engine', lane));
    for (const fact of Object.values(lane.tools)) {
      const { properties, required } = schemaOf(fact);
      for (const arg of required) {
        guards.push(argRequired(fact.name, arg).compile('engine', lane));
      }
      for (const [arg, decl] of Object.entries(properties)) {
        const pattern = typeof decl === 'object' && decl !== null && !Array.isArray(decl)
          ? (decl as { readonly pattern?: Json }).pattern : undefined;
        if (typeof pattern === 'string') {
          guards.push(argMatchesFormat(fact.name, arg, pattern).compile('engine', lane));
        }
      }
    }
    guards.push(brokenReply().compile('engine', lane));
    guards.push(questionAnswered().compile('engine', lane));

    const disclosureBindings = compileDisclosure(contract?.disclosure ?? {}, lane);
    mergeNeedsRelations(disclosureBindings, contract);

    const armedGuards = armed ? guards : guards.map(g => ({
      ...g,
      deny: () => null,
      ...(g.owe !== undefined ? { owe: () => null } : {}),
      ...(g.restate !== undefined ? { restate: () => null } : {}),
      ...(g.hold !== undefined ? { hold: () => null } : {})
    }));

    return {
      guards: armedGuards,
      // The judged pass is the desk's own purchase: a judged guard is asked only where
      // the spec declares the pass, so no card but this desk's can spend the call.
      judged: armed && spec.judgePass === true ? judged : [],
      rewrites: armed ? [...contract?.rewrites ?? []] : [],
      limits,
      maskKeys: compileMaskKeys(contract?.secrets),
      disclosureBindings: disclosureBindings,
      wording: resolveWording(contract?.wording),
      promptParts: {
        persona: spec.persona,
        voice: contract?.voice ?? null,
        facts: [...contract?.facts ?? []],
        teammates: spec.teammates ?? null
      },
      facts: lane
    };
  }
}
