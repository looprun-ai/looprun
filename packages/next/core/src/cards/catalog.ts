/** The guard factories: each returns the authored Guard shape with its phase filled
 *  AND compiles its own species semantics — a caller never hand-rolls them. A factory
 *  derives rule and deny from the SAME parameters, so prose/check parity is
 *  structural. A factory MINTS its guard's name as kind:tool. Regex exists ONLY
 *  inside blockPattern, purgePattern and maskPattern. */
import type { Act, CallCtx, InputCtx, Json, OwedRead, ReplyCtx, ReportWord, ResultCtx,
              StateSnapshot, SurfaceFacts } from '../contract/vocabulary.js';
import { TurnFailure } from '../contract/vocabulary.js';
import type { CompiledGuard, Guard, GuardCtx } from './cards.js';

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

/** The phase-generic sibling of installed(): one deny over the factory's own ctx shape. */
function installedAt<C extends GuardCtx>(seed: SeedGuard, home: 'spec' | 'contract' | 'engine',
  deny: (ctx: C) => string | null, installedBecause?: string): CompiledGuard {
  const tools = seed.tool === undefined ? [] : typeof seed.tool === 'string' ? [seed.tool] : [...seed.tool];
  return {
    name: seed.name, rule: seed.rule, home, on: seed.on, tools, kind: seed.kind,
    judged: false, judgePolicy: null,
    installedBecause: installedBecause
      ?? (home === 'engine' ? 'the always-on floor' : `declared on the ${home} card`),
    deny: ctx => deny(ctx as C)
  };
}

/** The gated tool runs only after the prerequisite SUCCEEDED this conversation. A
 *  READ prerequisite raises the owe verdict: the engine pays the debt with ONE
 *  forced micro-step where the session's own model fills the read's args over a
 *  single-tool surface — the engine never derives another call's arguments. A WRITE
 *  prerequisite denies, teaching the order. A read already attempted this turn
 *  without success denies the same way — the debt is paid at most once per turn. */
export function onlyAfter(tool: string, prerequisite: string): SeedGuard {
  const satisfied = (ctx: CallCtx): boolean =>
    [...ctx.pastActs, ...ctx.turnActs].some(a => a.call.tool === prerequisite && a.status === 'done');
  const attemptedThisTurn = (ctx: CallCtx): boolean =>
    ctx.turnActs.some(a => a.call.tool === prerequisite && a.status !== 'done');
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
          if (!isRead || satisfied(ctx) || attemptedThisTurn(ctx)) return null;
          return [{ alias: prerequisite, tool: prerequisite, args: {} }];
        },
        deny: ctx => {
          if (satisfied(ctx)) return null;
          if (isRead) {
            return attemptedThisTurn(ctx)
              ? `${prerequisite} did not succeed this conversation` : null;
          }
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

/** Declared on the schema, but forbidden to send. */
export function argAbsent(tool: string, arg: string): SeedGuard {
  return {
    name: `argAbsent:${tool}`,
    rule: `Never send '${arg}' on ${tool}.`,
    tool,
    on: 'preTool',
    kind: 'argAbsent',
    compile(home) {
      return installedAt<CallCtx>(this, home, ctx =>
        ctx.call.args[arg] === undefined ? null : `'${arg}' is declared but forbidden to send`);
    }
  };
}

/** The declared predicate over { record, state } must hold before the call runs.
 *  The record is the call's target row in the tool's OWN entity — the effect-block
 *  declaration names the entity, so a same-valued id in another entity can never be
 *  read by mistake. A state predicate on a stateless surface is loud, never a
 *  silent pass. */
export function precondition(tool: string | readonly string[],
  check: (ctx: { readonly record: Readonly<Record<string, Json>> | null;
                 readonly state: StateSnapshot }) => boolean,
  reason: string): SeedGuard {
  const tools = typeof tool === 'string' ? [tool] : [...tool];
  return {
    name: `precondition:${tools.join('+')}`,
    rule: reason,
    tool: tools,
    on: 'preTool',
    kind: 'precondition',
    compile(home, facts) {
      return installedAt<CallCtx>(this, home, ctx => {
        const state = ctx.state;
        if (state === null) {
          throw new TurnFailure('construction',
            `precondition on ${ctx.call.tool} needs a records snapshot, and this surface has none`);
        }
        const f = facts.tools[ctx.call.tool];
        const idValue = f?.target !== null && f?.target !== undefined ? ctx.call.args[f.target] : undefined;
        const record = f?.entity !== null && f?.entity !== undefined && typeof idValue === 'string'
          ? state[f.entity]?.[idValue] ?? null : null;
        return check({ record, state }) ? null : 'the declared precondition does not hold';
      });
    }
  };
}

/** postTool: the author check runs over the result; a violation joins the reply
 *  corrections — the call already ran, so it is never a veto. */
export function checkResult(tool: string,
  check: (ctx: ResultCtx) => string | null): SeedGuard {
  return {
    name: `checkResult:${tool}`,
    rule: `Every ${tool} result must pass its declared check.`,
    tool,
    on: 'postTool',
    kind: 'checkResult',
    compile(home) {
      return installedAt<ResultCtx>(this, home, ctx => check(ctx));
    }
  };
}

/** The report must cover every named record at the declared status — whole-value
 *  equality on the target, the polarity a FIELD, never parsed from prose. */
export function mustAccountFor(spec: { readonly records: readonly string[];
                                       readonly status: ReportWord }): SeedGuard {
  return {
    name: `mustAccountFor:${spec.records.join('+')}`,
    rule: `The report must account for ${spec.records.join(', ')} as ${spec.status}.`,
    on: 'reply',
    kind: 'mustAccountFor',
    compile(home) {
      return installedAt<ReplyCtx>(this, home, ctx => {
        for (const record of spec.records) {
          const covered = ctx.report.some(line => line.target === record && line.word === spec.status);
          if (!covered) return `the report does not account for ${record} as ${spec.status}`;
        }
        return null;
      });
    }
  };
}

function isTokenChar(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
    || c === '@' || c === '.' || c === '_' || c === '-' || c === '+';
}

function tokens(text: string): readonly string[] {
  const out: string[] = [];
  let current = '';
  for (const c of text) {
    if (isTokenChar(c)) current += c;
    else if (current !== '') { out.push(current); current = ''; }
  }
  if (current !== '') out.push(current);
  return out;
}

/** The arg's value must appear VERBATIM in the user's own words — contiguous whole
 *  tokens, whole-value equal; the guard searches, it never interprets. */
export function valueFromUser(tool: string, arg: string): SeedGuard {
  return {
    name: `valueFromUser:${tool}`,
    rule: `Send ${tool}'s '${arg}' only as the user wrote it.`,
    tool,
    on: 'preTool',
    kind: 'valueFromUser',
    compile(home) {
      return installedAt<CallCtx>(this, home, ctx => {
        const value = ctx.call.args[arg];
        if (typeof value !== 'string' || value === '') {
          return `'${arg}' must be a value the user wrote`;
        }
        const need = tokens(value);
        const have = tokens(ctx.userText);
        for (let i = 0; i + need.length <= have.length; i += 1) {
          if (need.every((t, j) => have[i + j] === t)) return null;
        }
        return `'${arg}' is not written in the user's own words`;
      });
    }
  };
}

/** The declared pattern DENIES — on the arriving text by default, on the reply when
 *  asked. The ONE lawful home of an author regex beside the two rewrite factories. */
export function blockPattern(name: string, pattern: RegExp, rule: string,
  opts?: { readonly on: 'input' | 'reply' }): SeedGuard {
  const phase = opts?.on ?? 'input';
  return {
    name,
    rule,
    on: phase,
    kind: 'blockPattern',
    compile(home) {
      return phase === 'input'
        ? installedAt<InputCtx>(this, home, ctx =>
            pattern.test(ctx.userText) ? `the text matches the blocked pattern '${name}'` : null)
        : installedAt<ReplyCtx>(this, home, ctx =>
            pattern.test(ctx.message) ? `the text matches the blocked pattern '${name}'` : null);
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
