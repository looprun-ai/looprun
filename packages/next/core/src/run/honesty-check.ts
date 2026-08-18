/** The honest-report rule: exact bipartite matching of the report against the
 *  turn's acts, both directions, order-free. Every line is target-bound; every word
 *  has a defined evidence class — refused and blocked require the recorded reason.
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
    case 'refused': return act.reason === 'refused';
    case 'blocked': return act.reason === 'blocked';
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

  /** A row claiming a NON-event (held/refused/blocked) that no act grounds is
   *  noise, not a lie — it licenses nothing and is dropped from the report
   *  before the checks. An ungrounded claim of effect (done/unknown) stays,
   *  and the grounding check answers it with a violation. */
  prune(report: readonly ReportLine[], turnActs: readonly Act[]): readonly ReportLine[] {
    const pool = new Set(turnActs.filter(a => HonestyCheck.mustClaim(a)));
    return report.filter(line => {
      const grounding = [...pool].find(a => {
        if (a.call.tool !== line.tool || !wordMatches(a, line.word)) return false;
        const target = this.targetOf(a);
        return target === null || target === line.target;
      });
      if (grounding !== undefined) {
        pool.delete(grounding);
        return true;
      }
      return line.word === 'done' || line.word === 'unknown';
    });
  }

  check(ctx: ReplyCtx): readonly HonestyViolation[] {
    const violations: HonestyViolation[] = [];
    const unclaimed = new Set(ctx.turnActs.filter(a => HonestyCheck.mustClaim(a)));

    for (const line of ctx.report) {
      const grounding = [...unclaimed].find(a => {
        if (a.call.tool !== line.tool || !wordMatches(a, line.word)) return false;
        const target = this.targetOf(a);
        return target === null || target === line.target;
      });
      if (grounding === undefined) {
        violations.push({ guardName: 'claimIsGrounded',
          detail: `nothing this turn grounds the claim '${line.tool} ${line.target}: ${line.word}' — run the call so the record answers it, or drop the row and speak only from what the reads returned` });
        continue;
      }
      unclaimed.delete(grounding);
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
