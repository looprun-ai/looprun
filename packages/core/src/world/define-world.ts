/**
 * `defineWorld` — a typed builder that interprets a DECLARATIVE {@link WorldSpec}
 * into a factory producing worlds that implement the engine's `AgentWorld` seam.
 *
 * The machinery it supplies, so a subject never hand-writes it: RECEPTION (`reception.ts`), two-step
 * probe/confirm, deterministic ids/counters + audit + `tookEffect` marking, `projection()` carrying
 * the clock, echo-safety tagging, preset application over seed, transition gates (`gates.ts`), and a
 * quarantined `custom` executor escape hatch. Everything is deterministic: no clock read, no RNG.
 *
 * Build contract: a WorldSpec MUST declare a `'default'` preset (`makeWorld()` builds it when the
 * caller names none) — its absence is a spec bug caught once at build with a NAMED error, not a
 * throw on every construction.
 */
import { receive } from './reception.js';
import { evaluateGates, type RecordStore } from './gates.js';
import { compileFormula, type CompiledFormula } from './formula.js';
import type {
  AuditEntry,
  BuiltWorld,
  CreateResult,
  CustomExecutor,
  DefineWorldOptions,
  ReadResult,
  ToolDecl,
  WorldCall,
  WorldFactory,
  WorldSpec,
} from './types.js';

const TERMINAL_TOOLS = new Set(['respond']);

export function defineWorld(spec: WorldSpec, options: DefineWorldOptions = {}): WorldFactory {
  validateSpec(spec, options);
  const derived = compileDerived(spec); // #derived — compiled at BUILD; unknown identifiers throw HERE.

  const factory = ((preset = 'default') => build(spec, options, preset, derived)) as WorldFactory;
  factory.describe = () => ({
    clock: spec.clock,
    entities: Object.keys(spec.entities ?? {}),
    tools: Object.fromEntries(
      Object.entries(spec.tools).map(([name, t]) => [name, { kind: t.kind, twoStep: Boolean(t.twoStep), ...(t.custom ? { custom: t.custom } : {}) }]),
    ),
    presets: Object.keys(spec.presets ?? {}),
    customExecutors: Object.keys(options.custom ?? {}),
    derived: Object.keys(spec.derived ?? {}),
  });
  return factory;
}

/**
 * Compile every `derived` formula to a closed AST at BUILD time (load, never run). The allowed
 * identifier set is the union of all declared entity fields and the derived entry's own `inputs` — so
 * `lateDays * dailyRate * 0.5` with `inputs: ['lateDays']` reads `dailyRate` from a field and `lateDays`
 * from an input, while a typo in either throws HERE, named.
 */
function compileDerived(spec: WorldSpec): Record<string, CompiledFormula> {
  const fields = new Set<string>();
  for (const entity of Object.values(spec.entities ?? {})) {
    for (const field of Object.keys(entity.fields ?? {})) fields.add(field);
  }
  const out: Record<string, CompiledFormula> = {};
  for (const [name, decl] of Object.entries(spec.derived ?? {})) {
    const allowed = [...new Set([...fields, ...(decl.inputs ?? [])])];
    try {
      out[name] = compileFormula(decl.formula, allowed);
    } catch (e) {
      throw new Error(`defineWorld: derived '${name}': ${(e as Error).message}`);
    }
  }
  return out;
}

/**
 * Fail-fast wiring checks, all at build (never at exec):
 *  - the WorldSpec MUST declare a `'default'` preset — `makeWorld()` defaults to it, so its absence
 *    would otherwise throw on every construction; caught here with a named error;
 *  - a `custom` tool must name a registered executor, AND every registered executor must be
 *    referenced by some `custom` tool (dead wiring is an author mistake, never silent).
 */
function validateSpec(spec: WorldSpec, options: DefineWorldOptions): void {
  if (!spec.presets || !Object.prototype.hasOwnProperty.call(spec.presets, 'default')) {
    throw new Error(`defineWorld: WorldSpec must declare a 'default' preset`);
  }
  const registered = new Set(Object.keys(options.custom ?? {}));
  const referenced = new Set<string>();
  for (const [name, tool] of Object.entries(spec.tools)) {
    if (tool.kind === 'custom') {
      if (!tool.custom) throw new Error(`defineWorld: custom tool '${name}' names no executor`);
      if (!registered.has(tool.custom)) throw new Error(`defineWorld: custom tool '${name}' → unregistered executor '${tool.custom}'`);
      referenced.add(tool.custom);
    }
  }
  for (const executor of registered) {
    if (!referenced.has(executor)) throw new Error(`defineWorld: registered executor '${executor}' is referenced by no custom tool`);
  }
}

function build(spec: WorldSpec, options: DefineWorldOptions, preset: string, derived: Record<string, CompiledFormula>): BuiltWorld {
  const store = seedStore(spec);
  const counters: Record<string, number> = {};
  applyPreset(spec, preset, store, counters);

  const toolCalls: WorldCall[] = [];
  const audit: AuditEntry[] = [];
  const derivedFns = Object.fromEntries(
    Object.entries(derived).map(([name, f]) => [name, (scope: Record<string, number>) => f.evaluate(scope)]),
  );

  const mintId = (entity: string): string => {
    const prefix = spec.entities?.[entity]?.idPrefix ?? entity;
    counters[entity] = (counters[entity] ?? 0) + 1;
    return `${prefix}_${counters[entity]}`;
  };

  const world: BuiltWorld = {
    toolCalls,
    audit,
    sseActions: [],
    advanceTurn() {},
    ingestAttachment: () => 'att_1',
    projection: () => projection(spec, store, counters),
    derived: derivedFns,
    exec(name: string, rawArgs: Record<string, unknown>): unknown {
      const args = rawArgs ?? {};
      if (TERMINAL_TOOLS.has(name)) return { success: true };
      const tool = spec.tools[name];
      if (!tool) {
        audit.push({ tool: name, outcome: 'unknown-tool' });
        return push(toolCalls, name, args, { ok: false, error: `unknown tool ${name}` }, false);
      }
      return dispatch(name, tool, args);
    },
  };

  function dispatch(name: string, tool: ToolDecl, args: Record<string, unknown>): unknown {
    const received = receive(name, tool.args, args); // RECEPTION (#1) — throws on bad/missing input

    if (tool.kind === 'custom') return runCustom(name, tool, args);
    if (tool.kind === 'read') return runRead(name, tool.read, args);

    // write / transition — gates, then two-step, then create.
    const denied = evaluateGates(tool.gates, received, store);
    if (denied) {
      audit.push({ tool: name, outcome: 'denied', detail: denied });
      return push(toolCalls, name, args, { ok: false, error: denied }, false);
    }
    if (tool.twoStep && received.confirmed !== true && args.confirmed !== true) {
      audit.push({ tool: name, outcome: 'preview' });
      // side-effect-free preview — gates ALREADY evaluated (probe ≡ confirm identity, #2).
      return push(toolCalls, name, args, { ok: true, requiresConfirmation: true, preview: previewOf(tool.create, received) }, false);
    }
    return tool.transition ? runTransition(name, tool, received, args) : runCreate(name, tool, received, args);
  }

  function runTransition(name: string, tool: ToolDecl, received: Record<string, unknown>, rawArgs: Record<string, unknown>): unknown {
    const t = tool.transition!;
    const id = String(received[t.argRef] ?? rawArgs[t.argRef] ?? '');
    const rec = store[t.entity]?.[id];
    if (rec) rec.status = t.to; // patch in place — a preceding stateIs/exists gate guarantees the record
    audit.push({ tool: name, outcome: 'ok', detail: id });
    const result = { ok: true, status: t.to, ...(t.idKey ? { [t.idKey]: id } : {}) };
    return push(toolCalls, name, rawArgs, result, true);
  }

  function runRead(name: string, read: ReadResult | undefined, args: Record<string, unknown>): unknown {
    const result = buildReadResult(read, args, store);
    audit.push({ tool: name, outcome: 'ok' });
    return push(toolCalls, name, args, result, false);
  }

  function runCreate(name: string, tool: ToolDecl, received: Record<string, unknown>, rawArgs: Record<string, unknown>): unknown {
    const create = tool.create;
    if (!create) {
      audit.push({ tool: name, outcome: 'ok' });
      return push(toolCalls, name, rawArgs, { ok: true }, true);
    }
    const id = create.id === 'counter' ? mintId(create.entity) : create.id.fixed;
    const record: Record<string, unknown> = { id, status: firstState(spec, create.entity) };
    const echo = tagEcho(tool, received);
    for (const field of create.store ?? []) record[field] = received[field];
    (store[create.entity] ??= {})[id] = record;
    audit.push({ tool: name, outcome: 'ok', detail: id });
    const result = { ok: true, [create.idKey]: id };
    return push(toolCalls, name, rawArgs, result, true, echo);
  }

  function runCustom(name: string, tool: ToolDecl, args: Record<string, unknown>): unknown {
    const executor = options.custom![tool.custom!] as CustomExecutor;
    const { result, tookEffect } = executor({ args, records: store, mintId });
    audit.push({ tool: name, outcome: 'custom' });
    return push(toolCalls, name, args, result, tookEffect);
  }

  return world;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function push(ledger: WorldCall[], name: string, args: Record<string, unknown>, result: unknown, tookEffect: boolean, echo?: WorldCall['echo']): unknown {
  ledger.push({ name, args, result, tookEffect, ...(echo ? { echo } : {}) });
  return result;
}

function seedStore(spec: WorldSpec): RecordStore {
  const store: RecordStore = {};
  for (const [entity, records] of Object.entries(spec.seed ?? {})) {
    store[entity] = {};
    for (const rec of records) store[entity][String(rec.id)] = { ...rec };
  }
  for (const entity of Object.keys(spec.entities ?? {})) store[entity] ??= {};
  return store;
}

function applyPreset(spec: WorldSpec, preset: string, store: RecordStore, counters: Record<string, number>): void {
  const deltas = spec.presets?.[preset];
  if (deltas === undefined) throw new Error(`defineWorld: unknown preset '${preset}'`); // #6 — never a silent half-state
  for (const delta of deltas) {
    switch (delta.op) {
      case 'addRecord':
        (store[delta.entity] ??= {})[String(delta.record.id)] = { ...delta.record };
        break;
      case 'setCounter':
        counters[delta.entity] = delta.value;
        break;
      case 'patch': {
        const rec = store[delta.entity]?.[delta.id];
        if (rec) Object.assign(rec, delta.set);
        break;
      }
    }
  }
}

function buildReadResult(read: ReadResult | undefined, args: Record<string, unknown>, store: RecordStore): unknown {
  if (read?.collection) return { ok: true, [read.collection.key]: read.collection.value };
  if (read?.constant) return { ok: true, [read.constant.key]: read.constant.value };
  if (read?.find) {
    const f = read.find;
    const want = String(args[f.argRef] ?? '').toLowerCase();
    const rec = Object.values(store[f.entity] ?? {}).find((r) => String(r[f.byField] ?? '').toLowerCase() === want);
    const value = rec ? (f.returns ? project(rec, f.returns) : { ...rec }) : null;
    return { ok: true, [f.key]: value };
  }
  return { ok: true };
}

function tagEcho(tool: ToolDecl, received: Record<string, unknown>): WorldCall['echo'] | undefined {
  // segregate operator-authored stored strings from agent-dictated ones (#5). Only emitted when at
  // least one stored field is operator-authored — so a purely agent-dictated create stays untagged.
  const stored = tool.create?.store ?? [];
  if (stored.length === 0) return undefined;
  const isOperator = new Map((tool.args ?? []).map((a) => [a.name, Boolean(a.operator)]));
  const operator: Record<string, unknown> = {};
  const agent: Record<string, unknown> = {};
  for (const field of stored) {
    if (isOperator.get(field)) operator[field] = received[field];
    else agent[field] = received[field];
  }
  return Object.keys(operator).length > 0 ? { operator, agent } : undefined;
}

function previewOf(create: CreateResult | undefined, received: Record<string, unknown>): Record<string, unknown> {
  const fields = create?.store ?? [];
  return Object.fromEntries(fields.map((f) => [f, received[f]]));
}

function firstState(spec: WorldSpec, entity: string): string | undefined {
  return spec.entities?.[entity]?.states?.[0];
}

function project(rec: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((k) => k in rec).map((k) => [k, rec[k]]));
}

function projection(spec: WorldSpec, store: RecordStore, counters: Record<string, number>): Record<string, unknown> {
  const status: Record<string, unknown> = {};
  for (const entity of Object.keys(spec.entities ?? {})) {
    status[entity] = Object.fromEntries(Object.entries(store[entity] ?? {}).map(([id, rec]) => [id, rec.status ?? null]));
  }
  return { today: spec.clock, status, counters: { ...counters } };
}
