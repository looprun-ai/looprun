/** Interprets a WorldCard into a per-session BuiltWorld. Reception coerces declared
 *  args (a non-coercible value is a refusal, never a stringified object), gates run
 *  on EVERY tool kind against the declared target record, simulate ≡ act by shared
 *  code path against a throwaway store, refusals are honest results, every call that
 *  reaches an entry is an audit row, and done is answered from the world's own write.
 *  A preset never half-applies. The world's verdicts are engine-independent. */
import type { DeclaredWorld, Json, ReadyCall, StateSnapshot, ToolAnswer, AuditRow,
              WorldToolEntry, Effect } from '../contract/vocabulary.js';
import { CardError } from '../contract/vocabulary.js';
import { evaluateGates } from './world-gates.js';
import { PatchDesk, Store } from './patch-desk.js';

const TARGETED: ReadonlySet<string> = new Set(['get', 'set', 'remove', 'run']);

interface FoundEntry { readonly entry: WorldToolEntry; readonly effect: Effect }

function findEntry(declared: DeclaredWorld, tool: string): FoundEntry | null {
  const { reads, writes, destructive } = declared.card;
  if (reads?.[tool]) return { entry: reads[tool], effect: 'read' };
  if (writes?.[tool]) return { entry: writes[tool], effect: 'write' };
  if (destructive?.[tool]) return { entry: destructive[tool], effect: 'destructive' };
  return null;
}

function refusal(sentence: string): ToolAnswer {
  return { result: { refused: sentence }, done: 'no' };
}

function isRecord(v: Json | undefined): v is { readonly [k: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export class WorldBuilder {
  build(declared: DeclaredWorld, preset?: string): BuiltWorld {
    const store = new Store(declared.card.records);
    if (preset !== undefined) {
      const patches = declared.card.presets?.[preset];
      if (patches === undefined) {
        throw new CardError([{ code: 'WORLD_PRESET_UNKNOWN',
          sentence: `Preset '${preset}' is not declared on the card.` }]);
      }
      const refused = store.applyPatches(patches);
      if (refused !== null) {
        throw new CardError([{ code: 'WORLD_PRESET_UNKNOWN_RECORD',
          sentence: `Preset '${preset}': ${refused}` }]);
      }
    }
    return new BuiltWorld(declared, store);
  }
}

export class BuiltWorld {
  private readonly declared: DeclaredWorld;
  private readonly store: Store;
  private readonly trail: AuditRow[] = [];
  private readonly desk = new PatchDesk();

  constructor(declared: DeclaredWorld, store: Store) {
    this.declared = declared;
    this.store = store;
  }

  call(call: ReadyCall): Promise<ToolAnswer> {
    const found = findEntry(this.declared, call.tool);
    if (found === null) return Promise.resolve(refusal(`No such tool: ${call.tool}.`));
    const { entry } = found;

    const coerced = this.coerce(entry, call.args);
    if (typeof coerced === 'string') return Promise.resolve(refusal(coerced));
    const ready: ReadyCall = { tool: call.tool, args: coerced };

    const simulated = entry.simulation === true && coerced.simulate === true;
    const target = simulated ? new Store(this.store.snapshot()) : this.store;
    const answer = this.perform(entry, call.tool, ready, target);
    this.trail.push({ call: ready, done: answer.done,
                      executor: entry.form === 'run' ? 'custom' : 'declared' });
    return Promise.resolve(answer);
  }

  snapshot(): StateSnapshot {
    return this.store.snapshot();
  }

  audit(): readonly AuditRow[] {
    return [...this.trail];
  }

  /** Declared reception: scalars coerce to the form's declared type; an object or
   *  array where a scalar is declared is a refusal naming the arg. */
  private coerce(entry: WorldToolEntry, args: ReadyCall['args']): Record<string, Json> | string {
    const out: Record<string, Json> = { ...args };
    if (TARGETED.has(entry.form)) {
      const id = args.id;
      if (id === undefined) return `The call is missing its 'id' argument.`;
      if (typeof id === 'object' && id !== null) return `The 'id' argument is not a plain value.`;
      out.id = typeof id === 'string' ? id : String(id);
    }
    if ('simulate' in args) {
      const s = args.simulate;
      if (s === true || s === 'true') out.simulate = true;
      else if (s === false || s === 'false') out.simulate = false;
      else return `The 'simulate' argument is not a boolean.`;
    }
    return out;
  }

  /** The one shared act path — a simulated run walks it against a throwaway store. */
  private perform(entry: WorldToolEntry, tool: string, ready: ReadyCall, store: Store): ToolAnswer {
    const id = typeof ready.args.id === 'string' ? ready.args.id : null;
    const record = id === null ? null : store.get(entry.entity, id);

    const gateSentence = evaluateGates(entry.gates ?? [], record);
    if (gateSentence !== null) return refusal(gateSentence);

    switch (entry.form) {
      case 'list':
        return { result: store.entity(entry.entity), done: 'yes' };
      case 'get':
        if (record === null) return refusal(`No ${entry.entity} record ${String(id)} exists.`);
        return { result: record, done: 'yes' };
      case 'make': {
        const fields = ready.args.fields;
        const made = store.mintId(entry.entity);
        store.merge(entry.entity, made, isRecord(fields) ? fields : {});
        return { result: { made }, done: store.get(entry.entity, made) === null ? 'no' : 'yes' };
      }
      case 'set': {
        if (record === null || id === null) return refusal(`No ${entry.entity} record ${String(id)} exists.`);
        const set = ready.args.set;
        if (!isRecord(set)) return refusal(`The 'set' argument is not an object of fields.`);
        store.merge(entry.entity, id, set);
        return { result: store.get(entry.entity, id), done: 'yes' };
      }
      case 'remove': {
        if (record === null || id === null) return refusal(`No ${entry.entity} record ${String(id)} exists.`);
        store.remove(entry.entity, id);
        return { result: { removed: id }, done: store.get(entry.entity, id) === null ? 'yes' : 'no' };
      }
      case 'run':
        return this.desk.runCustom(this.declared.executors[tool], ready, store);
    }
  }
}
