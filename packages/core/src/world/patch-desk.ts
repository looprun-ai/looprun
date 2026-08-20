/** The custom-executor law: the executor receives coerced args and a deep-frozen
 *  CLONE of the records (mutation throws; the live store is never handed out) and
 *  returns { result, patches }; the desk applies the patches through the shared
 *  gated, audited, attesting path — a custom tool's done is true by construction.
 *  Store is the world-package-private record container; it crosses no package
 *  boundary. */
import type { CustomExecutor, Json, Patch, ReadyCall, StateSnapshot, ToolAnswer } from '../contract/vocabulary.js';
import { deepFreeze } from '../contract/freeze.js';

type MutableRecords = Record<string, Record<string, Record<string, Json>>>;

export class Store {
  private readonly records: MutableRecords;
  private readonly counters: Record<string, number> = {};
  private readonly minted = new Set<string>();

  constructor(records: StateSnapshot) {
    this.records = structuredClone(records);
  }

  get(entity: string, id: string): Readonly<Record<string, Json>> | null {
    return this.records[entity]?.[id] ?? null;
  }

  entity(entity: string): Readonly<Record<string, Readonly<Record<string, Json>>>> {
    return this.records[entity] ?? {};
  }

  merge(entity: string, id: string, set: Readonly<Record<string, Json>>): void {
    const table = (this.records[entity] ??= {});
    table[id] = { ...table[id], ...set };
  }

  remove(entity: string, id: string): void {
    const table = this.records[entity];
    if (table !== undefined) delete table[id];
  }

  mintId(entity: string): string {
    const n = (this.counters[entity] = (this.counters[entity] ?? 0) + 1);
    const id = `${entity}_m${String(n)}`;
    this.minted.add(`${entity}/${id}`);
    return id;
  }

  /** Validates EVERY patch first, then applies — a patch set never half-applies.
   *  A patch may name an existing record or one minted in this run; anything else
   *  is the refusal sentence. */
  applyPatches(patches: readonly Patch[]): string | null {
    for (const p of patches) {
      const exists = this.get(p.entity, p.id) !== null || this.minted.has(`${p.entity}/${p.id}`);
      if ('make' in p && exists) {
        return `Patch makes ${p.entity}/${p.id}, and that record already exists.`;
      }
      if (!('make' in p) && !exists) {
        return `Patch names ${p.entity}/${p.id}, and no such record exists.`;
      }
    }
    for (const p of patches) {
      if ('remove' in p) this.remove(p.entity, p.id);
      else if ('make' in p) this.merge(p.entity, p.id, p.make);
      else this.merge(p.entity, p.id, p.set);
    }
    return null;
  }

  snapshot(): StateSnapshot {
    return deepFreeze(structuredClone(this.records));
  }
}

export class PatchDesk {
  runCustom(executor: CustomExecutor, call: ReadyCall, store: Store): ToolAnswer {
    const out = executor({ args: call.args, records: store.snapshot(),
                           mintId: e => store.mintId(e) });
    if ('refuse' in out) return { result: { refused: out.refuse }, done: 'no' };
    const refused = store.applyPatches(out.patches);
    if (refused !== null) return { result: { refused }, done: 'no' };
    return { result: out.result, done: 'yes' };
  }
}
