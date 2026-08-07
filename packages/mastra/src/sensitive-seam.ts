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
 *   · the RESULT on its way BACK — a field the contract declared is omitted or masked before the
 *     model reads the result and before the action history records it.
 *
 * A contract that declares neither gets its own value back, untouched and unwalked.
 */
import { filterSensitiveFields, scrubText } from '@looprun-ai/core/internal';
import type { DomainContract } from '@looprun-ai/core';

/**
 * The result a tool returned, with `contract.sensitiveFields` applied.
 *
 * ```
 *   filterToolResult({ phone: '555-0199', email: 'ops@x.example' }, contract)
 *   → { email: 'o•••@x.example' }        // sensitiveFields: { phone: 'omit', email: 'mask' }
 * ```
 */
export function filterToolResult(output: unknown, contract?: DomainContract): unknown {
  const fields = contract?.sensitiveFields;
  if (!fields || !Object.keys(fields).length) return output;
  return filterSensitiveFields(output, fields);
}

/**
 * Every STRING argument the contract declared free text, pattern-scrubbed IN the argument object the
 * call carries — the SAME object the guards registered in flight, the executor receives and the
 * action history records. One object is what keeps those three views of the call identical: a copy
 * would leave the world holding clean text while the record still matched on the raw form, and the
 * effect attestation that pairs them by arguments would stop pairing. The object is returned for the
 * caller's convenience; it is never a new one.
 *
 * A declaration matches by argument key (`'description'`) or by the call it belongs to
 * (`'fileClaim.description'`), so the same key on another tool is only reached by the bare form.
 *
 * ```
 *   scrubToolArgs('fileClaim', { description: 'boom cracked — call +1 415 555 0199' }, contract)
 *   → { description: 'boom cracked — call •••' }   // scrubTextFields: ['fileClaim.description']
 * ```
 */
export function scrubToolArgs(
  tool: string,
  args: Record<string, unknown>,
  contract?: DomainContract,
): Record<string, unknown> {
  const declared = contract?.scrubTextFields;
  if (!declared?.length) return args;
  const isFreeText = (key: string) => declared.some((f) => f === key || f === `${tool}.${key}`);
  for (const [k, v] of Object.entries(args)) if (typeof v === 'string' && isFreeText(k)) args[k] = scrubText(v);
  return args;
}
