/**
 * The LLM-JUDGED guard kind (`llmCheck`) — the one guard whose verdict is a MODEL's, not a
 * deterministic predicate's. It exists for the jobs structure alone cannot decide: "did the operator's
 * yes license THIS act?", "is this reply promising something the world never did?" — judgements no
 * arg/observed pattern captures.
 *
 * IT READS THE ENVELOPE, NOT THE CONVERSATION. The guard fences the evidence the hook has into the
 * prompt: the person's own recent turns on every hook, plus the reply and both operation lists on
 * onReply, the call on preTool, the result on postTool. Nothing the AGENT said goes in — no persona,
 * no role-tagged turns, no prior replies. A question the envelope carries no evidence for cannot be
 * answered, however well it is worded.
 *
 * THE CONTRACT:
 *  - The MODEL is registered on the runtime options as a {@link Judge} and threaded onto the guard ctx,
 *    NEVER named in config. `llmCheck` only carries the trusted, pre-baked `question` and a `failMode`.
 *  - The GUARD composes the envelope and reads the answer; the seam carries a prompt in and raw text
 *    out. What comes back is VERDICT-ONLY: a deny reason, never free text delivered to the operator.
 *    `check` returns it verbatim as the deny (relayed through the runtime's own correction/redrive
 *    channel).
 *  - Prompt-injection is acknowledged and accepted: the question is trusted and fixed, the text under
 *    judgement arrives fenced as data, the output channel is a verdict, and the residual risk is priced
 *    by evals — not by blinding the guard to the text.
 *  - This guard is ASYNC (it awaits the judge). Deterministic guards stay sync; the runtime awaits
 *    every `check` uniformly, so an llmCheck coexists ordered with the sync guards on the same hook.
 *
 * PURITY: no LLM call, clock or entropy lives HERE — the guard only DELEGATES to the injected seam, so
 * the purity lint holds. The impurity is the judge, outside the guard surface.
 */
import type { Guard, Dim } from '../rules.js';
import {
  judgePrompt,
  readJudgeVerdict,
  JUDGE_UNREACHABLE,
  JUDGE_UNREADABLE,
} from '../runtime/judge-prompt.js';
import { LIE_QUESTION } from '../runtime/lie-check.js';

/** The deny a `failMode:'closed'` guard emits when its judge is UNREACHABLE (threw/rejected/timed
 *  out) — a generic, figure-free correction, never the judge's own words (there are none: it
 *  failed). The SAME reason for a rejection and a timeout: both mean "could not verify". */
const CLOSED_FAIL_DENY =
  'A required policy check could not be completed — do not proceed until it can be verified.';

/** Default judge timeout when the registration seam did not set `judgeTimeoutMs`. A hung judge past
 *  this deadline is treated as unreachable → `failMode` decides. */
const DEFAULT_JUDGE_TIMEOUT_MS = 30000;

/** A never-settling judge would HANG the turn (failMode only fires on a SETTLED rejection). So the
 *  guard races the judge against a timeout; on expiry the race rejects and the `catch` applies
 *  failMode, exactly as for a thrown/rejected judge. The timer is always cleared. */
function withTimeout(run: Promise<string>, timeoutMs: number): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`judge timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([run, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * An LLM-judged guard. `question` is the trusted question the judge answers; `failMode` decides what an
 * UNREACHABLE judge means — `'open'` (default) allows, `'closed'` denies. `dim` selects the hook family
 * the runtime installs it on (`'behavior'` → onReply, the default; `'run'` → preTool) — the eval loader
 * passes it from the config `hook`. A named violation becomes the deny reason verbatim; `NONE` allows.
 *
 * A call that does not reach a verdict never denies on its own. `failMode` prices a REJECTION and
 * nothing else:
 *
 * ```
 *   threw / rejected / timed out   judge-unreachable + llmcheck-unreachable:<failMode>   failMode decides
 *   answered with empty text       judge-unreachable                                     allow
 *   answered illegibly             judge-unreadable                                      allow
 * ```
 */
export function llmCheck(opts: { question: string; failMode?: 'open' | 'closed'; dim?: Dim }): Guard {
  const failMode = opts.failMode ?? 'open';
  const dim: Dim = opts.dim ?? 'behavior';
  return {
    kind: 'llmCheck',
    dim,
    async check(ctx) {
      const judge = ctx.judge;
      if (!judge) {
        // Unreachable in a well-formed run: assertJudgePresent fails loud at conversation start.
        // If we are here, the host wired an llmCheck past that gate — an author bug, so throw (never a
        // silent allow that would delete the gate).
        throw new Error(
          'llmCheck: no judge on the guard ctx — register one on the runtime options (deps.judge); ' +
            'assertJudgePresent should have caught this at conversation start.',
        );
      }
      const timeoutMs = ctx.judgeTimeoutMs ?? DEFAULT_JUDGE_TIMEOUT_MS;
      let text: string;
      try {
        text = await withTimeout(judge(judgePrompt(opts.question, ctx, ctx.renderOpts)), timeoutMs);
      } catch {
        // Judge UNREACHABLE (threw / rejected / TIMED OUT) — failMode decides. A seam failure (network,
        // model, hang), NOT an author bug in the guard, so it is priced, not re-thrown.
        //
        // RECORDED EITHER WAY. Left unrecorded, a fail-OPEN unreachable judge is indistinguishable from
        // an approving one: the guard returns null, nothing is written anywhere, and no eval, log or
        // operator can tell "the check ran and approved" from "the check never ran".
        // The turn's correction log is the runtime's own record of what happened to a call or a reply, so
        // the non-run goes there — `notes` is the SAME `turnCorrections` array on every hook's ctx
        // (preTool, postTool, onReply), so a call-side dim:'run' llmCheck records its non-run exactly as
        // a reply-side one does. Two facts, two markers: the call did not answer, and a guard priced that
        // silence at its own failMode.
        ctx.notes?.push(JUDGE_UNREACHABLE);
        ctx.notes?.push(`llmcheck-unreachable:${failMode}`);
        return failMode === 'closed' ? CLOSED_FAIL_DENY : null;
      }
      // SETTLED WITHOUT A VERDICT. A call that answered nothing, or answered something that is not a
      // verdict, found no violation — and scoring either as a detection would let one broken endpoint
      // deny every reply in the session. `failMode` does not fire here: it prices a REJECTION, and this
      // call did not reject.
      if (!text.trim()) {
        ctx.notes?.push(JUDGE_UNREACHABLE);
        return null;
      }
      const { violation, readable } = readJudgeVerdict(text);
      if (!readable) ctx.notes?.push(JUDGE_UNREADABLE);
      return violation;
    },
    prose: () => opts.question,
  };
}

/**
 * THE LIE BACKSTOP — the engine's own question, bound by an author who wants the deny.
 *
 * The structured cross-check grounds the DECLARATION against the ledger; the `message` beside it is
 * free prose, and an agent can declare an honest `inform` and still write that it refunded the
 * order. No structural signal reads that. This is the priced backstop for that residual, and it is
 * never the primary guarantee: the cross-check and the operation record are.
 *
 * IT FAILS CLOSED BY DEFAULT, unlike a bare {@link llmCheck}. A judge outage silently deleting the
 * only named mitigation of the prose residual is the whole attack. The availability cost is stated
 * rather than hidden: while the judge rejects, every candidate reply is denied, so each turn spends
 * its redrives and delivers the engine-derived closure.
 */
export function llmCheckLie(opts?: { failMode?: 'open' | 'closed' }): Guard {
  return llmCheck({ question: LIE_QUESTION, dim: 'behavior', failMode: opts?.failMode ?? 'closed' });
}
