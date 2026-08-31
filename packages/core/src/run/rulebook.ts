/** The ordered deterministic guard pipe: four frozen arrays built at construction,
 *  one per phase; first non-allow verdict wins on input/preTool; postTool and reply
 *  collect ALL violations (a postTool violation joins the reply corrections — the
 *  call already ran). Pure — judged guards are not here. The census IS the code:
 *  guards() returns the same arrays the four phase checks iterate. */
import type { GuardCensus, InputCtx, CallCtx, ResultCtx, ReplyCtx, Verdict } from '../contract/vocabulary.js';
import type { CompiledAgent, CompiledGuard } from '../cards/cards.js';
import { deepFreeze } from '../contract/freeze.js';
import { HonestyCheck } from './honesty-check.js';

export interface Violation { readonly guardName: string; readonly detail: string }

export class Rulebook {
  private readonly input: readonly CompiledGuard[];
  private readonly preTool: readonly CompiledGuard[];
  private readonly postTool: readonly CompiledGuard[];
  private readonly reply: readonly CompiledGuard[];
  private readonly limits: CompiledAgent['limits'];
  private readonly rewrites: CompiledAgent['rewrites'];

  constructor(compiled: CompiledAgent) {
    const phase = (on: CompiledGuard['on']): readonly CompiledGuard[] =>
      deepFreeze(compiled.guards.filter(g => g.on === on));
    this.input = phase('input');
    this.preTool = phase('preTool');
    this.postTool = phase('postTool');
    this.reply = deepFreeze(this.withHonesty(compiled, phase('reply')));
    this.limits = compiled.limits;
    this.rewrites = compiled.rewrites;
  }

  /** The honesty floor rides the reply walk at honesty priority — after the declared
   *  rows, before the engine floor; one bipartite matcher, two census rows. */
  private withHonesty(compiled: CompiledAgent,
                      reply: readonly CompiledGuard[]): readonly CompiledGuard[] {
    const matcher = new HonestyCheck(compiled.facts);
    const row = (name: 'claimIsGrounded' | 'claimIsComplete', rule: string): CompiledGuard => ({
      name, rule, home: 'engine', on: 'reply', tools: [], kind: name,
      judged: false, installedBecause: 'the always-on floor',
      deny: ctx => matcher.check(ctx as ReplyCtx).find(v => v.guardName === name)?.detail ?? null
    });
    const floorAt = reply.findIndex(g => g.home === 'engine');
    const rows = [
      row('claimIsGrounded', 'The report claims only what the recorded acts show.'),
      row('claimIsComplete', 'The report accounts for every act this turn performed.')
    ];
    return floorAt === -1
      ? [...reply, ...rows]
      : [...reply.slice(0, floorAt), ...rows, ...reply.slice(floorAt)];
  }

  /** A guard covering specific tools skips a call to any other tool — Set membership. */
  private covers(guard: CompiledGuard, tool: string): boolean {
    return guard.tools.length === 0 || guard.tools.includes(tool);
  }

  checkInput(ctx: InputCtx): Verdict {
    for (const guard of this.input) {
      const detail = guard.deny(ctx);
      if (detail !== null) return { kind: 'refuse', guardName: guard.name, detail };
    }
    return { kind: 'allow' };
  }

  checkPreTool(ctx: CallCtx): Verdict {
    for (const guard of this.preTool) {
      if (!this.covers(guard, ctx.call.tool)) continue;
      if (guard.restate) {
        const actId = guard.restate(ctx);
        if (actId !== null) return { kind: 'restate', actId };
      }
      if (guard.owe) {
        const reads = guard.owe(ctx);
        if (reads !== null) return { kind: 'owe', guardName: guard.name, rule: guard.rule, reads };
      }
      if (guard.hold) {
        const sentence = guard.hold(ctx);
        if (sentence !== null) return { kind: 'hold', guardName: guard.name, sentence };
      }
      const detail = guard.deny(ctx);
      if (detail !== null) return { kind: 'refuse', guardName: guard.name, detail };
    }
    return { kind: 'allow' };
  }

  checkPostTool(ctx: ResultCtx): readonly Violation[] {
    return this.collect(this.postTool, ctx, ctx.call.tool);
  }

  /** The honesty floor reads `ReplyCtx.report` and never the message: its verdict is
   *  about the machine-readable line, not about the words the operator receives. */
  private static readonly REPORT_ONLY: readonly string[] = ['claimIsGrounded', 'claimIsComplete'];

  checkReply(ctx: ReplyCtx): readonly Violation[] {
    return this.collect(this.bound(ctx), ctx, null);
  }

  /** The rows that charge the WORDS the operator will read — every declared reply
   *  guard, and none of the report-only floor. A turn the engine closes keeps no
   *  report of its own, so a refusal earned there would cost the operator the
   *  deterministic floor in exchange for a line nothing on the record ever holds. */
  checkDeliveredReply(ctx: ReplyCtx): readonly Violation[] {
    return this.collect(
      this.bound(ctx).filter(g => !Rulebook.REPORT_ONLY.includes(g.name)), ctx, null);
  }

  /** A reply guard declaring tools binds to them: it runs only on a turn whose acts
   *  touched one — the desk's other replies are not its jurisdiction. */
  private bound(ctx: ReplyCtx): readonly CompiledGuard[] {
    const acted = new Set(ctx.turnActs.map(a => a.call.tool));
    return this.reply.filter(g => g.tools.length === 0 || g.tools.some(t => acted.has(t)));
  }

  private collect(guards: readonly CompiledGuard[], ctx: ResultCtx | ReplyCtx, tool: string | null): readonly Violation[] {
    const violations: Violation[] = [];
    for (const guard of guards) {
      if (tool !== null && !this.covers(guard, tool)) continue;
      const detail = guard.deny(ctx);
      if (detail !== null) violations.push({ guardName: guard.name, detail });
    }
    return violations;
  }

  /** The same guard objects the phase checks iterate — never a parallel copy. */
  guards(): GuardCensus {
    return {
      guards: [...this.input, ...this.preTool, ...this.postTool, ...this.reply],
      rewrites: this.rewrites.map(r => ({ name: r.name, kind: r.kind })),
      limits: this.limits
    };
  }
}
