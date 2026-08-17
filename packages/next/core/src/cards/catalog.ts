/** The guard factories: each returns the authored Guard shape with its phase filled
 *  AND compiles its own species semantics — a caller never hand-rolls them. A factory
 *  derives rule and deny from the SAME parameters, so prose/check parity is
 *  structural. A factory MINTS its guard's name as kind:tool. */
import type { Act, CallCtx, OwedRead, Json, SurfaceFacts } from '../contract/vocabulary.js';
import type { CompiledGuard, Guard } from './cards.js';

/** An authored guard that carries its own AgentFactory derivation. */
export interface SeedGuard extends Guard {
  readonly kind: string;
  compile(home: 'spec' | 'contract' | 'engine', facts: SurfaceFacts): CompiledGuard;
}

function installed(seed: SeedGuard, home: 'spec' | 'contract' | 'engine',
  checks: { readonly deny: (ctx: CallCtx) => string | null;
            readonly owe?: (ctx: CallCtx) => readonly OwedRead[] | null;
            readonly restate?: (ctx: CallCtx) => string | null },
  installedBecause?: string): CompiledGuard {
  const tools = seed.tool === undefined ? [] : typeof seed.tool === 'string' ? [seed.tool] : [...seed.tool];
  return {
    name: seed.name, rule: seed.rule, home, on: seed.on, tools, kind: seed.kind,
    judged: false, judgePolicy: null,
    installedBecause: installedBecause
      ?? (home === 'engine' ? 'the always-on floor' : `declared on the ${home} card`),
    deny: ctx => checks.deny(ctx as CallCtx),
    ...(checks.owe ? { owe: checks.owe } : {}),
    ...(checks.restate ? { restate: checks.restate } : {})
  };
}

function completedActs(ctx: CallCtx, tool: string): readonly Act[] {
  return [...ctx.pastActs, ...ctx.turnActs]
    .filter(a => a.call.tool === tool && (a.status === 'done' || a.status === 'unknown'));
}

function schemaPropertyNames(schema: Json): readonly string[] {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return [];
  const properties = (schema as { readonly [k: string]: Json }).properties;
  if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) return [];
  return Object.keys(properties);
}

/** The gated tool runs only after the prerequisite SUCCEEDED this conversation. A
 *  READ prerequisite is engine-performed (the owe verdict); a WRITE prerequisite
 *  denies, teaching the order. */
export function onlyAfter(tool: string, prerequisite: string): SeedGuard {
  const satisfied = (ctx: CallCtx): boolean =>
    [...ctx.pastActs, ...ctx.turnActs].some(a => a.call.tool === prerequisite && a.status === 'done');
  return {
    name: `onlyAfter:${tool}`,
    rule: `Run ${prerequisite} before ${tool}.`,
    tool,
    on: 'preTool',
    kind: 'onlyAfter',
    compile(home, facts) {
      const prereqFact = facts.tools[prerequisite];
      const isRead = prereqFact?.effect === 'read';
      return installed(this, home, {
        owe: ctx => {
          if (!isRead || satisfied(ctx)) return null;
          const wanted = new Set(schemaPropertyNames(prereqFact.schema));
          const args = Object.fromEntries(
            Object.entries(ctx.call.args).filter(([k]) => wanted.has(k)));
          return [{ alias: prerequisite, tool: prerequisite, args }];
        },
        deny: ctx => {
          if (satisfied(ctx)) return null;
          if (isRead) return null;
          return `${prerequisite} has not succeeded yet this conversation`;
        }
      });
    }
  };
}

/** The always-on floor: the same call never executes twice — the first completed
 *  act's result answers every identical re-proposal. */
export function noDuplicateCall(): SeedGuard {
  return {
    name: 'noDuplicateCall',
    rule: 'Never run the same call twice; the first result answers it.',
    on: 'preTool',
    kind: 'noDuplicateCall',
    compile(home) {
      return installed(this, home, {
        deny: () => null,
        restate: ctx => {
          const first = [...ctx.pastActs, ...ctx.turnActs]
            .find(a => a.call.key === ctx.call.key && (a.status === 'done' || a.status === 'unknown'));
          return first ? first.id : null;
        }
      });
    }
  };
}

/** Schema-auto: the declared required arg must arrive, and a whitespace-only value
 *  counts as MISSING. */
export function argRequired(tool: string, arg: string): SeedGuard {
  return {
    name: `argRequired:${tool}:${arg}`,
    rule: `Send '${arg}' on every ${tool} call.`,
    tool,
    on: 'preTool',
    kind: 'argRequired',
    compile(home) {
      return installed(this, home, {
        deny: ctx => {
          const value = ctx.call.args[arg];
          const missing = value === undefined || (typeof value === 'string' && value.trim() === '');
          return missing ? `'${arg}' is required and missing` : null;
        }
      }, `the declared schema requires '${arg}'`);
    }
  };
}

/** At most n completed calls of the tool per scope; done and unknown both count. */
export function maxCalls(tool: string, n: number,
  opts: { readonly scope: 'conversation' | 'turn'; readonly reason: string }): SeedGuard {
  return {
    name: `maxCalls:${tool}`,
    rule: opts.reason,
    tool,
    on: 'preTool',
    kind: 'maxCalls',
    compile(home) {
      return installed(this, home, {
        deny: ctx => {
          const acts = opts.scope === 'turn'
            ? completedActs({ ...ctx, pastActs: [] }, tool)
            : completedActs(ctx, tool);
          return acts.length >= n
            ? `${tool} already ran ${acts.length} time(s) this ${opts.scope}` : null;
        }
      });
    }
  };
}
