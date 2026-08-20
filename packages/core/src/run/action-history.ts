/** The append-only truth: mints act ids, records masked rows only, answers
 *  canonical-identity lookups, seals turns as frozen history shared by reference. */
import type { Act, TurnRecord } from '../contract/vocabulary.js';
import type { CanonicalCall } from '../contract/canonical-call.js';
import { deepFreeze } from '../contract/freeze.js';
import type { TurnDraft } from './session.js';

export class ActionHistory {
  private nextId = 1;
  private readonly records: TurnRecord[] = [];
  private readonly acts: Act[] = [];

  mint(): string {
    const id = `a${this.nextId}`;
    this.nextId += 1;
    return id;
  }

  /** Records into the DRAFT only — a failed turn leaves nothing behind; seal folds. */
  add(act: Act, draft: TurnDraft): Act {
    const frozen = deepFreeze(act);
    draft.acts.push(frozen);
    return frozen;
  }

  ofTurn(turn: number): readonly Act[] {
    return this.acts.filter(a => a.turn === turn);
  }

  /** Duplicate check over the sealed conversation, canonical key. */
  seen(call: CanonicalCall, turn: number): Act | null {
    return this.acts.find(a => a.turn <= turn && a.call.key === call.key) ?? null;
  }

  /** done + unknown on destructive tools — fail-closed. */
  destructiveInTurn(turn: number): number {
    return this.acts.filter(a => a.turn === turn && a.effect === 'destructive'
      && (a.status === 'done' || a.status === 'unknown')).length;
  }

  sealed(): readonly TurnRecord[] {
    return this.records;
  }

  /** Every sealed act of the conversation, flat, oldest first. A fresh array each
   *  call — the ctx freeze must never reach the live store; the ACTS stay shared
   *  by reference. */
  pastActs(): readonly Act[] {
    return [...this.acts];
  }

  sealTurn(record: TurnRecord): void {
    this.records.push(record);
    this.acts.push(...record.acts);
  }
}
