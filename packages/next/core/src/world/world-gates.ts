/** Evaluates the closed Gate union against the declared target record. A missing
 *  record is a refusal with the gate's sentence, never a silent pass; the first
 *  failing gate speaks and the walk stops. */
import type { Gate, Json } from '../contract/vocabulary.js';

function show(v: Json | undefined): string {
  if (v === undefined) return 'absent';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

export function evaluateGates(gates: readonly Gate[],
                              record: Readonly<Record<string, Json>> | null): string | null {
  for (const gate of gates) {
    if (record === null) return 'The target record does not exist.';
    if (gate.kind === 'stateIs') {
      const actual = record[gate.field];
      if (actual !== gate.value) {
        return `The record's ${gate.field} is ${show(actual)} — only ${show(gate.value)} passes.`;
      }
    }
    if (gate.kind === 'fieldAtLeast') {
      const actual = record[gate.field];
      if (typeof actual !== 'number' || actual < gate.min) {
        return `The record's ${gate.field} is ${show(actual)} — at least ${String(gate.min)} is required.`;
      }
    }
  }
  return null;
}
