/** The honest-report rule: exact bipartite matching of the report against the
 *  turn's acts, both directions, order-free. Every line is target-bound; every word
 *  has a defined evidence class — refused covers every terminal denial, by the
 *  system or by a rule; the act's own reason keeps the fine grain.
 *  A declaration is (tool, target, word) with NO figure field, so a declared figure
 *  cannot exist to corroborate — figures reach the user only through engine-rendered
 *  record lines. Hiding = a leftover must-claim act; lying = a claim matching no
 *  act; the denial names the tool. A held act supports a held line. The census shows
 *  this floor as its two rows — claimIsGrounded and claimIsComplete — one matcher
 *  underneath; lieCheck() is the JUDGED half, a declared factory, never installed
 *  here. */
import type { Act, ReplyCtx, ReportLine, SurfaceFacts } from '../contract/vocabulary.js';

export interface HonestyViolation { readonly guardName: 'claimIsGrounded' | 'claimIsComplete';
                                    readonly detail: string }

function wordMatches(act: Act, word: ReportLine['word']): boolean {
  switch (word) {
    case 'done': return act.status === 'done';
    case 'unknown': return act.status === 'unknown';
    case 'held': return act.reason === 'held';
    case 'refused': return act.reason === 'refused' || act.reason === 'blocked';
    case 'no_tool_called': return false;   // its evidence class is the ABSENCE of an act
  }
}

export class HonestyCheck {
  private readonly facts: SurfaceFacts;

  constructor(facts: SurfaceFacts) {
    this.facts = facts;
  }

  /** Write and destructive acts are owed as claims at every status; reads are
   *  engine-rendered, never owed. */
  static mustClaim(act: Act): boolean {
    return act.effect !== 'read';
  }

  check(ctx: ReplyCtx): readonly HonestyViolation[] {
    const violations: HonestyViolation[] = [];
    const unclaimed = new Set(ctx.turnActs.filter(a => HonestyCheck.mustClaim(a)));
    // Reads are never OWED as claims, but a row echoing a read that ran is a
    // TRUE row and grounds against it — each read grounds at most one row.
    const reads = new Set(ctx.turnActs.filter(a => a.effect === 'read'));

    for (const line of ctx.report) {
      // A row naming a tool that exists nowhere on the surface is a ghost: the
      // correction names the mistake, or the model drops the row.
      if (this.facts.tools[line.tool] === undefined) {
        violations.push({ guardName: 'claimIsGrounded',
          detail: `no tool named '${line.tool}' exists on this surface — name the tool exactly as the surface names it, or drop the row; a turn with no acts on the record sends an EMPTY report` });
        continue;
      }
      // no_tool_called is the agent's own word for a decision to act in words
      // only: it grounds on the ABSENCE of an act, and an act of that tool and
      // target this turn makes it a contradiction — the act's status is the
      // only truthful word then.
      if (line.word === 'no_tool_called') {
        const shadow = ctx.turnActs.find(a => {
          if (a.call.tool !== line.tool) return false;
          const target = this.targetOf(a);
          return target === null || target === line.target;
        });
        if (shadow !== undefined) {
          violations.push({ guardName: 'claimIsGrounded',
            detail: `'${line.tool} ${line.target}: no_tool_called' contradicts this turn's record — ${line.tool} has an act, and its truthful word is its status` });
        }
        continue;
      }
      const fits = (a: Act): boolean => {
        if (a.call.tool !== line.tool || !wordMatches(a, line.word)) return false;
        const target = this.targetOf(a);
        return target === null || target === line.target;
      };
      // A specific-target act pairs before a target-less one, so a wildcard
      // act can never consume the slot an exact pairing needs.
      const pool = [...unclaimed];
      const grounding = pool.find(a => fits(a) && this.targetOf(a) === line.target)
        ?? pool.find(fits);
      if (grounding !== undefined) {
        unclaimed.delete(grounding);
        continue;
      }
      const readEcho = [...reads].find(fits);
      if (readEcho !== undefined) {
        reads.delete(readEcho);
        continue;
      }
      // When an act for that tool and target EXISTS, the row's word is what is
      // wrong — hand the model the truthful word; only an actless claim earns
      // the no_tool_called route.
      const sameCall = ctx.turnActs.find(a => {
        if (a.call.tool !== line.tool) return false;
        const target = this.targetOf(a);
        return target === null || target === line.target;
      });
      const wordOf = (a: Act): ReportLine['word'] =>
        a.status === 'done' ? 'done'
        : a.status === 'unknown' ? 'unknown'
        : a.reason === 'held' ? 'held' : 'refused';
      violations.push({ guardName: 'claimIsGrounded',
        detail: sameCall !== undefined
          ? `the word is wrong on '${line.tool} ${line.target}: ${line.word}' — that call's truthful word this turn is '${wordOf(sameCall)}'; write { tool: '${line.tool}', target: '${line.target}', word: '${wordOf(sameCall)}' }`
          : `nothing this turn grounds the claim '${line.tool} ${line.target}: ${line.word}' — run the call so the record answers it, or, if you chose to act in words only, replace that row with exactly { tool: '${line.tool}', target: '${line.target}', word: 'no_tool_called' } and keep your message` });
    }

    for (const act of unclaimed) {
      violations.push({ guardName: 'claimIsComplete',
        detail: `nothing in your report accounts for what ${act.call.tool} did to ${this.targetOf(act) ?? 'its target'}` });
    }
    return violations;
  }

  /** A blank or absent target value leaves the act target-less: the tool and word
   *  alone identify it, and any written target grounds against it. */
  private targetOf(act: Act): string | null {
    const targetArg = this.facts.tools[act.call.tool]?.target ?? null;
    if (targetArg === null) return null;
    const value = act.call.args[targetArg];
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  }
}
