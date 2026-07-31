/** The agent-ruleset ESCAPE HATCH — a guard whose check and prose the author writes by hand. */
import type { Guard, GuardCtx, Dim } from '../rules.js';

export function custom(opts: {
  kind: string;
  dim: Dim;
  check: (ctx: GuardCtx) => string | null | Promise<string | null>;
  prose: () => string;
}): Guard {
  return { kind: opts.kind, dim: opts.dim, check: opts.check, prose: opts.prose };
}
