/** THE READS LOG — what the tool calls of this conversation answered, and nothing else.
 *  Every answer lands whole and OPAQUE, keyed by (tool, canonical args key) and stamped
 *  with the moment it arrived on the injected clock. The engine never walks an answer's
 *  shape: a condition reads it with its author's own knowledge of the surface, and the
 *  engine walks only declared paths.
 *
 *  A row answers for its validity and no longer: a record read ten minutes ago is a
 *  record somebody else may have moved, so past `validForMs` the row is UNREAD — absent,
 *  not stale-but-present. Reading again replaces the row and restarts its life. */
import type { Json } from '../contract/vocabulary.js';

/** Five minutes: long enough for a desk to read, decide and act inside one turn. */
export const DEFAULT_READ_VALID_FOR_MS = 5 * 60 * 1000;

interface LogRow { readonly answer: Json; readonly at: number }

export class ReadsLog {
  private readonly rows = new Map<string, Map<string, LogRow>>();

  constructor(private readonly now: () => number,
              private readonly validForMs: number = DEFAULT_READ_VALID_FOR_MS) {}

  record(tool: string, argsKey: string, answer: Json): void {
    const byKey = this.rows.get(tool) ?? new Map<string, LogRow>();
    byKey.set(argsKey, { answer, at: this.now() });
    this.rows.set(tool, byKey);
  }

  /** The last valid answer of this read — null = unread, or past its life. With no
   *  args key, the newest valid answer across every key the tool was called with. */
  latest(tool: string, argsKey?: string): { readonly answer: Json; readonly at: number } | null {
    const cut = this.now() - this.validForMs;
    const byKey = this.rows.get(tool);
    if (byKey === undefined) return null;
    if (argsKey !== undefined) {
      const row = byKey.get(argsKey);
      return row !== undefined && row.at > cut ? row : null;
    }
    let newest: LogRow | null = null;
    for (const row of byKey.values()) {
      if (row.at > cut && (newest === null || row.at > newest.at)) newest = row;
    }
    return newest;
  }

  /** Every read with a valid answer, newest per (tool, args key) — the tail's view. */
  entries(): readonly { tool: string; argsKey: string; answer: Json; at: number }[] {
    const cut = this.now() - this.validForMs;
    const out: { tool: string; argsKey: string; answer: Json; at: number }[] = [];
    for (const [tool, byKey] of this.rows) {
      for (const [argsKey, row] of byKey) {
        if (row.at > cut) out.push({ tool, argsKey, answer: row.answer, at: row.at });
      }
    }
    return out;
  }
}
