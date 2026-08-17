import type { Json, StateSnapshot } from '../../src/contract/vocabulary.js';
import { deepFreeze } from '../../src/contract/freeze.js';
import type { RecordsPort } from '../../src/contract/ports.js';

/** A RecordsPort over a mutable store the test scripts between calls; each snapshot
 *  is a frozen deep copy, so diffs compare real state generations. */
export class RecordsPortStub implements RecordsPort {
  private store: Record<string, Record<string, Record<string, Json>>> = {};

  set(entity: string, id: string, record: Record<string, Json>): void {
    this.store = { ...this.store, [entity]: { ...this.store[entity], [id]: record } };
  }

  remove(entity: string, id: string): void {
    const rest = { ...this.store[entity] };
    delete rest[id];
    this.store = { ...this.store, [entity]: rest };
  }

  snapshot(): StateSnapshot {
    return deepFreeze(JSON.parse(JSON.stringify(this.store)) as StateSnapshot);
  }
}
