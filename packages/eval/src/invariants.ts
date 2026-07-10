/**
 * @looprun-ai/eval — the deterministic TOOL-CALL invariant gate (auto-fail, no LLM).
 *
 * Semantics mirror the certified pipeline exactly: `anyArgs` is a shallow subset match
 * (`obs.args[k] !== expected` fails); a forbidden call fires only if it `tookEffect`.
 * Denied (guard-vetoed) calls never reach the world, so they are absent from `observed`.
 */
import type { ReqCall } from './types.js';

export interface ObsCall {
  name: string;
  args: Record<string, unknown>;
  tookEffect: boolean;
}

/** name + every key/value in `anyArgs` present in the observed call's args (subset match). */
export function toolCallMatches(obs: ObsCall, req: ReqCall): boolean {
  if (obs.name !== req.name) return false;
  if (!req.anyArgs) return true;
  for (const [k, expected] of Object.entries(req.anyArgs)) {
    if (obs.args[k] !== expected) return false;
  }
  return true;
}

/** Tool-call invariants for one case, evaluated against the observed (executed) calls. */
export function toolCallFailures(
  inv: { requiredToolCalls?: ReqCall[]; forbiddenToolCalls?: ReqCall[] } | undefined,
  observed: ObsCall[],
): string[] {
  const out: string[] = [];
  for (const req of inv?.requiredToolCalls ?? []) {
    if (!observed.some((o) => toolCallMatches(o, req))) {
      out.push(
        `requiredToolCall ${req.name}(${JSON.stringify(req.anyArgs ?? {})}) missing — ` +
          `observed [${observed.map((o) => o.name).join(', ') || '(none)'}]`,
      );
    }
  }
  for (const forb of inv?.forbiddenToolCalls ?? []) {
    if (observed.some((o) => toolCallMatches(o, forb) && o.tookEffect)) {
      out.push(`forbiddenToolCall ${forb.name}(${JSON.stringify(forb.anyArgs ?? {})}) took effect`);
    }
  }
  return out;
}
