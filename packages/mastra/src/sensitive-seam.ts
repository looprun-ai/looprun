/**
 * @looprun-ai/mastra — the SENSITIVE-DATA SEAM: the two crossings of one tool call.
 *
 * The executor is not trusted to hide anything, so both crossings are governed on our side of the
 * boundary:
 *
 *   · ARGUMENTS on their way OUT — a free-text argument the contract declared is pattern-scrubbed
 *     after the guards allow the call and before the world receives it, so the value the executor
 *     stores and the value the action history records are the same clean text. The guards judge the
 *     REQUEST as it was written; the scrub runs on the call they admitted.
 *   · the RESULT on its way BACK — a field the contract declared sensitive is omitted or masked, and
 *     a result field it declared FREE TEXT is pattern-scrubbed, before the model reads the result and
 *     before the action history records it.
 *
 * A contract that declares neither gets its own value back, untouched and unwalked.
 */
import { filterSensitiveFields, keepWrittenArgs, scrubText } from '@looprun-ai/core/internal';
import type { DomainContract } from '@looprun-ai/core';

/** Dot-suffix match over a value's path, the rule `sensitiveFields` uses: a declaration of the same
 *  length or shorter matches when it ends the path, so `'getClaim.notes'` reaches that tool's `notes`
 *  and a bare `'notes'` reaches every `notes` at any depth of any call's result. */
function suffixMatcher(declared: readonly string[]): (path: readonly string[]) => boolean {
  const rules = declared.map((p) => p.split('.'));
  return (path) => rules.some((r) => r.length <= path.length && r.every((p, i) => p === path[path.length - r.length + i]));
}

/** Immutable deep walk: a NEW result whose declared free-text STRING fields are pattern-scrubbed. The
 *  walk starts at the call's own name, so a declaration may name the tool the field belongs to. */
function scrubResultText(tool: string, value: unknown, declared: readonly string[]): unknown {
  const matches = suffixMatcher(declared);
  const walk = (v: unknown, path: string[]): unknown => {
    if (typeof v === 'string') return matches(path) ? scrubText(v) : v;
    if (Array.isArray(v)) return v.map((x) => walk(x, path));
    if (v === null || typeof v !== 'object') return v;
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x, [...path, k])]));
  };
  return walk(value, [tool]);
}

/**
 * The result a tool returned, with the contract's two result declarations applied: `sensitiveFields`
 * removes or masks the field it named, `scrubTextFields` scrubs the free text inside the field it
 * named.
 *
 * ```
 *   filterToolResult('getClaim', { phone: '555-0199', notes: 'mail ops@x.example' }, contract)
 *   → { notes: 'mail •••' }
 *   // sensitiveFields: { phone: 'omit' }, scrubTextFields: ['getClaim.notes']
 * ```
 */
export function filterToolResult(tool: string, output: unknown, contract?: DomainContract): unknown {
  const fields = contract?.sensitiveFields;
  const declared = contract?.scrubTextFields;
  const filtered = fields && Object.keys(fields).length ? filterSensitiveFields(output, fields) : output;
  return declared?.length ? scrubResultText(tool, filtered, declared) : filtered;
}

/**
 * Every STRING argument the contract declared free text, pattern-scrubbed IN the argument object the
 * call carries — the SAME object the guards registered in flight, the executor receives and the
 * action history records, at every depth: a nested container is rewritten in place too. One object is
 * what keeps those three views of the call identical: a copy would leave the world holding clean text
 * while the record still matched on the raw form, and the effect attestation that pairs them by
 * arguments would stop pairing. The object is returned for the caller's convenience; it is never a
 * new one.
 *
 * The declaration reads as a dot-suffix over the argument path, the same rule the result side uses:
 * `'fileClaim.description'` names that call's own argument, `'claim.description'` reaches the field
 * inside whatever container carries it, and a bare `'description'` reaches every depth of every call.
 *
 * THE WRITTEN FORM'S FINGERPRINT IS KEPT ON THE OBJECT before the rewrite, because the guards judge the
 * call as the model wrote it while the record holds the clean text: a repeat of the same call arrives
 * raw and would otherwise fingerprint differently from the row that recorded it, and the repeat
 * detector would read one call sent twice as two different calls.
 *
 * ```
 *   scrubToolArgs('fileClaim', { claim: { description: 'boom cracked — call +1 415 555 0199' } }, contract)
 *   → { claim: { description: 'boom cracked — call •••' } }   // scrubTextFields: ['claim.description']
 * ```
 */
export function scrubToolArgs(
  tool: string,
  args: Record<string, unknown>,
  contract?: DomainContract,
): Record<string, unknown> {
  const declared = contract?.scrubTextFields;
  if (!declared?.length) return args;
  keepWrittenArgs(args);
  const matches = suffixMatcher(declared);
  const walk = (container: Record<string, unknown> | unknown[], path: string[]) => {
    // An array index is not part of the path — the same rule the result walk follows, so one
    // declaration reaches a field however many rows carry it.
    const entries: [string | number, unknown][] = Array.isArray(container)
      ? container.map((v, i) => [i, v])
      : Object.entries(container);
    for (const [key, v] of entries) {
      const here = Array.isArray(container) ? path : [...path, key as string];
      if (typeof v === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (matches(here)) (container as any)[key] = scrubText(v);
      } else if (v !== null && typeof v === 'object') {
        walk(v as Record<string, unknown> | unknown[], here);
      }
    }
  };
  walk(args, [tool]);
  return args;
}
