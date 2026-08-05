/**
 * The LLM-JUDGED guard kind (`llmCheck`) — the one guard whose verdict is a MODEL's, not a
 * deterministic predicate's. It exists for the jobs structure alone cannot decide: "is this reply
 * promising something the world never did?" — a judgement over prose that no arg/observed pattern
 * captures.
 *
 * IT READS THE ENVELOPE, NOT THE CONVERSATION. The guard fences the evidence the hook has into the
 * prompt — the reply plus both operation lists on onReply, the call on preTool, the result on postTool
 * — and nothing else goes in: no persona, no role-tagged turns, no user text. A question the envelope
 * carries no evidence for cannot be answered, however well it is worded.
 *
 * THE CONTRACT:
 *  - The MODEL is registered on the runtime options as a {@link Judge} and threaded onto the guard ctx,
 *    NEVER named in config. `llmCheck` only carries the trusted, pre-baked `rubric` (the question) and
 *    a `failMode`.
 *  - The GUARD composes the envelope and reads the answer; the seam carries a prompt in and raw text
 *    out. What comes back is VERDICT-ONLY: a deny reason, never free text delivered to the operator.
 *    `check` returns it verbatim as the deny (relayed through the runtime's own correction/redrive
 *    channel).
 *  - Prompt-injection is acknowledged and accepted: the rubric is trusted and fixed, the text under
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
 * An LLM-judged guard. `rubric` is the trusted question the judge answers; `failMode` decides what an
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
export function llmCheck(opts: { rubric: string; failMode?: 'open' | 'closed'; dim?: Dim }): Guard {
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
        text = await withTimeout(judge(judgePrompt(opts.rubric, ctx, ctx.renderOpts)), timeoutMs);
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
    prose: () => opts.rubric,
  };
}

/**
 * The `did × message` CONSISTENCY rubric — the pre-baked question the backstop asks.
 *
 * Domain-neutral by construction: it names only the two engine-owned fields of a `respond` payload and the
 * generic word "operation". Model-facing protocol prose (it is rendered into the trunk and handed to the
 * judge), never user-delivered text, so naming the declaration is legitimate here.
 */
const DID_MESSAGE_CONSISTENCY_RUBRIC =
  'Read the message the agent wrote to the user together with the operations it declared in `did`. ' +
  'Does the message state or imply an operation that `did` does not carry, or state an outcome that ' +
  'contradicts a declared intention? Report a violation ONLY for that mismatch — never for wording, ' +
  'tone or omission.';

/**
 * The `did × message` CONSISTENCY BACKSTOP — AVAILABLE, never auto-installed.
 *
 * The deterministic cross-check grounds the DECLARATION against the world ledger, but the `message` is
 * free prose beside it: an agent can declare an honest `inform` and still WRITE that it refunded the
 * order. No structural signal reads that — polarity and assertion live in the prose, which is exactly
 * what a pattern cannot judge, and the reason no honesty kind carries one. This is the
 * priced backstop for that residual: a trusted, pre-baked rubric answered by the judge.
 *
 * An author binds it where the stakes justify a model call per reply (financial, health); it is NOT part
 * of any auto-installed protocol, and it is never the primary guarantee — the structured cross-check is.
 * Its runtime `kind` is `llmCheck`, so the fail-loud judge gate and the TRUTH/SAFETY classification
 * see it for what it is.
 *
 * IT FAILS CLOSED BY DEFAULT — unlike bare {@link llmCheck}, whose `'open'` default suits an author-bound
 * lint. This guard is not a lint: it is the ONLY named mitigation of the prose residual, so a judge
 * outage (network, quota, model down, a 30 s hang) silently DELETING it is the whole attack — install it,
 * break the judge, and the backstop is gone with nothing recorded. A guarantee
 * that evaporates exactly when the seam it depends on fails is not a guarantee.
 *
 * AVAILABILITY COST, stated: while the judge is unreachable, every candidate reply is denied, so each
 * turn spends its redrives and then delivers the ENGINE-DERIVED closure — still a truthful, non-blank
 * answer, but not the model's own prose. An author who prefers the model's prose to the backstop opts in
 * explicitly with `didMessageConsistency({ failMode: 'open' })`; either way the non-run is recorded as an
 * `llmcheck-unreachable:<failMode>` correction.
 */
export function didMessageConsistency(opts?: { failMode?: 'open' | 'closed' }): Guard {
  return llmCheck({
    rubric: DID_MESSAGE_CONSISTENCY_RUBRIC,
    dim: 'behavior',
    failMode: opts?.failMode ?? 'closed',
  });
}
