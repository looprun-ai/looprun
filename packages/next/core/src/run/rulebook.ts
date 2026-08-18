/** The ordered deterministic guard pipe: four frozen arrays built at construction,
 *  one per phase; first non-allow verdict wins on input/preTool; postTool and reply
 *  collect ALL violations (a postTool violation joins the reply corrections — the
 *  call already ran). Pure — judged guards are not here. The census IS the code:
 *  guards() returns the same arrays the four phase checks iterate. */
import type { GuardCensus, InputCtx, CallCtx, ResultCtx, ReplyCtx, Verdict } from '../contract/vocabulary.js';
import type { CompiledAgent, CompiledGuard } from '../cards/cards.js';
import { deepFreeze } from '../contract/freeze.js';

export interface Violation { readonly guardName: string; readonly detail: string }

export class Rulebook {
  private readonly input: readonly CompiledGuard[];
  private readonly preTool: readonly CompiledGuard[];
  private readonly postTool: readonly CompiledGuard[];
  private readonly reply: readonly CompiledGuard[];
  private readonly limits: CompiledAgent['limits'];

  constructor(compiled: CompiledAgent) {
    const phase = (on: CompiledGuard['on']): readonly CompiledGuard[] =>
      deepFreeze(compiled.guards.filter(g => g.on === on));
    this.input = phase('input');
    this.preTool = phase('preTool');
    this.postTool = phase('postTool');
    this.reply = phase('reply');
    this.limits = compiled.limits;
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
        if (reads !== null) return { kind: 'owe', reads };
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

  checkReply(ctx: ReplyCtx): readonly Violation[] {
    return this.collect(this.reply, ctx, null);
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
      rewrites: [],
      limits: this.limits
    };
  }
}
