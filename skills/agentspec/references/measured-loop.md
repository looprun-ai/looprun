# Stages T + S — TEST (the measured loop) and SHIP (certification)

## Ruler discipline (non-negotiable)

- Subject model default: `gemini-3.1-flash-lite-thinkoff` (needs `GOOGLE_GENERATIVE_AI_API_KEY`;
  the numeric thinking-off trap is already encoded in looprun). Judge: **the LLM judge only** — the frontier coding agent running the skill
  (never gemini, never mixed — measured ~4pt lenient). N≥3 to certify. Bar: **≥90%** unless the
  caller sets another.
- Live `→ pass/fail` lines during a run are the INVARIANT gate, not quality. Only the judged
  aggregate counts.

## Deployment targets — measure EVERY declared model, every iteration (measured 2026-07-16)

The A3 answer (questionnaire) declares the deployment models. The rule that prevents the measured
regression of 2026-07-16 (one bundle: 100% on the tuned tier, 82% on the untuned one):

- **Each T iteration runs ALL targets** (N=1 each) — the A3 selection **plus the always-on
  BASELINE** (the model running the skill, as a subagent playing the generated agent against
  the world; zero external dependency). A fix that helps one tier and hurts another is caught at
  the NEXT iteration, not at certification.
- **The bar holds PER TARGET** — the STOP rule fires only when every target (and the baseline) is
  at/above the bar.
- **Classify each fix as RULE vs FORM**: a missing/wrong rule lands in the SPEC (applies to all
  targets); a verbosity/phrasing/lexicon miss lands in that target's **profile** (prose render,
  lexicon, sampling — never the checks; see the profile convention in decompose-and-draft.md).
  Guards/checks NEVER fork per model.
- **Certification (S) is per target and bound to the artifact hash**: emit `model:score×reps` for
  every measured target into the cert/provenance record; any spec change afterwards invalidates
  ALL seals. N=1 mid-loop is directional only — nothing gets a seal below N=3.

Full walkthrough: `docs/guides/measured-loop.md` in the looprun repo.

## Near-tie flips — margin discipline for prose iteration (measured 2026-07-16)

Root cause of "fix one case, break another" on small/local tiers, measured on a minimal repro
(a read-vs-create decision fork):

- The action decision a case grades rides **one greedy token**. On flippy cases its margin
  (~0.25–0.5 nat) is the **residual of a prose equilibrium** — no single rule owns the decision
  (removing an unrelated section flips it).
- **Noise ≥ margin, twice over**: (a) ANY byte edit — however inert — shifts every margin by up to
  ±0.35 nat (one article swap did); (b) the KV-cache state shifts it ±0.2 nat — temp-0 determinism
  is real but **state-scoped**: same bytes reproduce only under the same cache history, which is why
  rep-vs-rep is byte-identical while a different run SHAPE (other cases before it) diverges. Judge
  noise on borderline rubrics stacks on top.

Rules this forces on the loop:

1. **An N=1 full-run A/B cannot evaluate a prose edit on a local tier** — a ±2–3-case delta is
   noise. (The STOP rule's "prose trades one fail for another" is measured mechanics, not folklore.)
2. **A case that flips across reps/arms/re-runs is class-8, not a prose bug.** Don't write prose at
   it blindly — run the fork-pair margin loop, or pin the decision with a deterministic gate
   (class 2) when it resists widening.
3. **The fork-pair margin loop** (the instrument that turns prose iteration into process):
   extract the decision fork from the failing transcript (the exact step context where the wrong
   tool won) with `scripts/extract-fork.mjs`, build the **mirrored-intent twin** (the context where
   the OTHER tool is correct — the anti-magnet guard), and measure the top-k logprob margin directly
   on the engine (a local `llama-server`: `/apply-template` + `/completion` with `n_probs`,
   speculative decoding off — what `scripts/margin-probe.py` does). Iterate the ONE rule that should
   own the decision; **accept an edit iff the WORST-CASE margin across a noise battery (inert byte
   edits + cache states) improves on BOTH forks**; target ≥3× the noise band (≥ ~2 nat). Ownership
   check: leave-one-out the largest prompt section — the decision must survive on its rule alone.
   Proven 2026-07-16: 3 iterations, 1 accepted (worst-case 0.32→0.87, zero flips), 2
   plausible-looking edits REJECTED that a score-based N=1 would have shipped. Reference
   implementation: `scripts/margin-probe.py` (offline top-k margin probe over the byte-exact prompt
   render) + `scripts/extract-fork.mjs` (build the fork context from a passing + a failing run) +
   `scripts/dump-prompt.mjs` (the `--dump <dir>` producer — renders each agent's byte-exact
   `<agent>.system.txt` + `<agent>.tools.json` offline, exactly what `margin-probe.py` opens).
4. **When a full run IS needed** (bar checks, certification): fix the cache discipline (always-cold
   or always-self-primed server), keep the run SHAPE constant (same case-set composition — never
   compare a full-set run against a subset run), and judge borderline rubrics majority-of-3.
   Stable fails (0/N on every arm and quant) are NOT this class — they are genuine spec/model gaps;
   send them through the fail taxonomy (usually class 2/3).
5. **Per-target instrumentation** — the A3 targets pick the INSTRUMENT, never a fork of the spec
   (margin-loop outputs are universal rule edits and guards; guards/checks never vary per model):

   | declared target class | iteration instrument | certification |
   |---|---|---|
   | local / self-hosted (engine exposes logprobs) | **margin screen post-E2** + fork-pair margin loop for class-8 / near-ties | median of K PERTURBED runs + band (byte-identical reps = ONE sample) |
   | cloud API (no logprobs) | full-run discipline: N=1 directional per iteration, replication control (lesson #11), majority-of-3 judging on borderline rubrics | classic N=3 |
   | baseline "+1" (the skill-runner subagent) | full-run; ALSO supplies the correct trajectories that local fork extraction needs (`extract-fork.mjs` pass-arm) | per its role (quality floor) |

   **The perturbed band is a FLOOR, not a variance estimate around N=1.** A single unperturbed decode
   can catch *several* near-tie coins in their pass state at once, so an N=1 read over-states the true
   pass-rate by ~one case per coin; only a K-perturbed band (one distinct inert byte per replicate)
   exposes the floor. Measured on a local 35B run: N=1 read one case ABOVE its K=3 band because two
   near-tie coins both landed up in the single decode — the band rate held while the *identity* of the
   marginal fail flipped between them. Certify at the band floor, not the lucky N=1 point.

   **Margin screen (post-E2, local targets, minutes):** the world is deterministic and replayable
   without an LLM, so every case's first-decision context renders offline; one `margin-probe`
   completion per case flags the coin cases (top-2 gap < ~1 nat) BEFORE any judged run. From-scratch
   generations therefore need no banked history: evals' invariants + the baseline run supply the
   correct branches, T-iteration-1 supplies the failing ones.

   **Autonomous margin-probe (no prior runs) — `scripts/synth-fork.mjs`.** `extract-fork.mjs` needs a
   banked PASS run AND a banked FAIL run to find the divergence; on a from-scratch generation neither
   exists yet. `synth-fork.mjs` closes that gap: it builds the SAME fork-context JSON `margin-probe.py`
   consumes, but from a SYNTHESIZED context — a case + its deterministic world — with zero prior runs.
   It leverages the project's world seam (the `worldFactory` + `world.exec` from
   `looprun.eval.config.ts`, no model in the loop) to replay a case's world byte-faithfully through an
   AUTHORED trajectory, so the tool results the model sees at the fork are exactly what the runtime
   would return. You declare the decision fork (the correct tool vs the tempting/forbidden twin — the
   anti-magnet, read straight off the eval's `forbiddenToolCalls` + rubric) from the case + eval intent;
   the world supplies the rest.

   ```bash
   # spec.json: { "caseId","agent",
   #              "forkTurn": 0, "priorCalls": [ { "turn":0,"name":"listClients","args":{} } ],
   #              "expect": { "kind":"tool-name","correct":"setFiscalRegime","wrong":"createClient" } }
   node skills/agentspec/scripts/synth-fork.mjs spec.json fork.json
   # render the byte-exact system prompt + tool defs per agent into <dir> (the --dump producer):
   node skills/agentspec/scripts/dump-prompt.mjs <dir>          # writes <dir>/<agent>.{system.txt,tools.json}
   # then feed fork.json to margin-probe exactly like an extract-fork context:
   python3 skills/agentspec/scripts/margin-probe.py battery fork.json --dump <dir> --agent <id>
   ```

   `priorCalls` is the authored setup trajectory (empty = a first-decision screen; add the calls that
   precede the fork for a mid-turn/multi-step decision — the world executes them so the fork sees
   faithful results). This is authoring-only and ADDITIVE: nothing on the runtime/measurement path
   imports it, so it cannot move a measured number. The project is resolved the same way as the rest of
   the toolkit (`$LOOPRUN_ROOT`, else the nearest `looprun.eval.config.{ts,js}`); the world-stepper runs
   on the project's own tsx so it sees the project's harness + agent bundle. Use it to margin-screen a
   from-scratch domain before it has ever been run.

## Stage T — screening iterations (N=1)

Whole domain at once: `npx looprun-eval run` reads the config's `caseMap` and screens every agent
bucket (writes `eval-results/<date>-<domain>/<agent>.dump.json` + `.autofail.json` +
`.tasks.jsonl`). Per single bucket:

1. `npx looprun-eval run --agent <agent-id> --cases <case-ids-csv|full> [--reps 1]` — runs the
   bucket (no judging) and preps the judge tasks.
2. Judge the dump (packaged prompt = ruler v2, 2026-07-15 — turn-boundary + 3-way content matching + delivered-vs-internal rules; numbers from the old v1 prompt are not comparable, re-measure bars once): judge subagents over `<agent>.tasks.jsonl` using the packaged generic judge
   prompt (`npx looprun-eval judge-prompt` prints its path) + the domain rules
   (`evals/judge-prompt.md`) → `<agent>.verdicts.jsonl`; then fold verdicts + auto-fails back with
   `npx looprun-eval judge-merge <agent>.dump.json <agent>.verdicts.jsonl` (autofail wins; a
   missing verdict fails loudly) → `<agent>.judged.json`.
3. Classify EVERY fail with the closed taxonomy, fix in THIS preference order (cheapest,
   most-deterministic fix first):

| # | class | signature | fix |
|---|---|---|---|
| 1 | state-visibility gap | model couldn't know the state it needed | render the state in the trunk (directive / theme stateBlock line) |
| 2 | missing hard gate | wrong call order / illegal call executed | add a catalog kind at the right hook |
| 3 | scope gap | model fabricated because the tool is missing | add the missing TOOL to the surface |
| 4 | unconditioned prose | a directive misfired in the wrong state | add the CONDITION (Bucket-A fix) |
| 5 | fabrication pattern | claims work not done this turn | anti-fabrication reply-gate (existence-keyed) |
| 6 | language coin | tone/wording judgment call, trace correct | ACCEPT as residual (language-layer territory) — human gate #2 |
| 7 | **eval defect** | rubric unsatisfiable on preset / wrong label | fix the EVAL, re-run debate validation on it, log in EVALS.md — never bend the spec |
| 8 | **near-tie action coin** | same config flips across reps/arms/re-runs; trace-level tool choice changes with no spec change | fork-pair margin loop (§ Near-tie flips above); pin with a gate (class 2) if it resists widening — NEVER blind prose |

4. Re-screen ONLY the failed cases after each fix round (`--cases <failed-ids-csv>`). ≤3
   iterations (the measured convergence bound). Not converged after 3 → STOP, escalate to the user
   with the classified residuals (something upstream is wrong: decomposition, eval quality, or a
   model-tier wall).

Rules:
- One fix-class batch per iteration; never shotgun unrelated prose edits (prose is non-local —
  the maxCalls per-turn-cap lesson).
- Every fix = both halves updated (check + prose) where applicable.
- Class-6 residuals are ACCEPTED, not masked with brittle regexes.
- After any spec edit: `npx looprun-eval lint --spec-laws` must stay clean before re-running.

**STOP RULE (revised 2026-07-17 — the bar is a FLOOR, not a finish line).** The bar (≥90% or the
caller's) is the MINIMUM to ship, not where you stop. Once above the floor, KEEP ITERATING while
each round NET-improves, up to the 3-iteration cap — BUT past the floor the ONLY admissible fixes
are **margin-validated prose or deterministic gates**, never blind prose. Concretely, above the
floor:
- A marginal fail is almost always the near-tie / language-layer class. Route it (fail class 8):
  measure the decision margin (fork-pair, per the near-tie section) and accept a prose edit ONLY if
  the WORST-CASE margin improves on BOTH forks under the noise battery; or pin it with a gate; or
  declare it a model-tier ceiling. On a STRONG target (cloud tier), a TARGETED emphatic/iron-rule
  prose edit for the specific case is admissible and transfers cleanly (measured: the iron-rule
  style cracked exactly the residual language-layer cases on a lite cloud model, +13pt) — but on a
  LOCAL/weak target the SAME edit must pass the margin filter first or it re-triggers the
  whack-a-mole.
- **Re-measure the FULL affected bucket after ANY edit** (a per-target re-check hides sibling
  regressions). If a round nets ≤0, or any edit regresses a sibling, REVERT that edit.
- **STOP when:** a full round yields no net gain, OR the 3-iteration cap is hit, OR every remaining
  fail is a declared ceiling. Never stop merely because you touched the floor.

**Why the old "stop AT the bar" rule was too conservative (measured 2026-07-03 vs 2026-07-17).** The
2026-07-03 evidence (2 prose edits past 91.5% each regressed 2 siblings, net −2) was real — but the
cause was *blind* prose, not iterating per se. The margin instrument (the near-tie section) removes
that noise: past-the-floor fixes that are margin-validated or gated do NOT trade siblings. So the
discipline flipped from "stop at the bar" to "keep going with the margin filter on." A from-scratch
skill run reached the floor at iteration 2 and STOPPED under the OLD rule — leaving a handful of
residual near-tie cases on both the cloud and local tiers on the table that this rule now says to
pursue via margin/gate.

**Measured fix-effectiveness ranking (same run).** Highest-yield, most durable fixes first:
1. **Case→agent REMAP** (class 3) — moving a catch-all/triage case to the agent whose tools its job
   needs (edit the config's `caseMap`). Dropped 4 hard fails at once (the triage lesson from the
   lineage: a triage agent lumps tools it doesn't own). Always check this before writing prose.
2. **DROP an over-firing always-rendered directive** when a precondition already carries the rule —
   a statically-rendered "IF cond → do X" directive is evaluated by the MODEL and over-applies even
   when cond is false (the style-gate directive made the agent ask for a style that already existed).
   Prefer the precondition (rendered only with its condition) over a standing directive.
3. **RELAX an over-strict gate** the (simulated) owner over-specified vs the product — a confirm-first
   or precondition that blocks a REQUIRED single-turn call (e.g. a refresh or clear op the eval
   expects done in one turn). The eval is the arbiter, not the owner's stated ideal.
4. **Add the missing tool / complete the action** (under-action) — prose that finishes the action
   (resolve THEN apply the result), or adding a tool the job needs.
5. **Conditioned prose** (offer clauses, framing, pushback) — lowest yield, highest regression risk;
   the STOP rule governs it.

## Stage S — certification (N=3)

- `npx looprun-eval certify` (= `run --reps 3` into a `-cert` results dir; add `--agent`/`--cases`
  to certify one bucket) → judge all 3 reps (same judge flow per rep) → fold the certificate:
  `npx looprun-eval cert eval-results/<date>-<domain>-cert` → `cert.json` + `CERT.md` (bar
  default ≥90%).
- Certified = judged pass-rate ≥ the bar across all reps, no unexplained 0/3 core-fail
  (a 0/3 deterministic fail re-enters T; language coins at partial reps are the known
  cloud-variance class).
- Ship: specs + `REVIEW.md` (review findings/resolutions, questionnaire answers, fix log,
  inputs hash) + `EVALS.md` (if G3 ran) + cert bundle pointer (`eval-results/<date>-<domain>-cert/`).

## Cross-domain measured lessons (5 subjects from the lineage: a content-marketing assistant, home-services, lawyer, accounting, beauty)

These fail-classes recurred in EVERY domain — anticipate them at DRAFT time (E2) so the measured
loop converges in one iteration instead of chasing them per-domain.

1. **The confirm-probe reply is the #1 recurring fail.** A two-step destructive tool run with
   `confirmed=false` is a PROBE (it succeeds and returns "requires confirmation"). Any onReply guard
   that checks "the reply claims X happened" (`destructiveClaimRequiresSuccess`, `noFabricated*`,
   custom `noPhantom*`) will BLOCK the honest confirm-probe reply ("do you want to cancel? this can't
   be undone") → the runner exhausts its re-drives → a generic fallback surfaces → the case fails.
   **Rule:** every such guard MUST exempt (a) confirm-probe replies — the destructive tool ran only
   with `confirmed!==true` this turn AND the reply seeks confirmation (a `?` OR confirm-phrasing:
   `confirm / tem certeza / deseja / quer / please confirm / are you sure`), and (b) honest FAILURE
   reports (`already / cannot / not / could not / não / já`). Prefer the shared kinds
   (`destructiveClaimRequiresSuccess` + `pendingConfirmMustAsk`, which carry these exemptions)
   over ad-hoc `custom` claim-regex guards that forget them.
2. **Negation/failure-aware claim checks.** The same guards must not fire on a truthful negated
   report (`"não gerei"`, "already redeemed", "cannot void a paid invoice"). Key on
   existence/success in `observed`/`world`, and exempt failure-phrasing before the affirmative regex.
   For `falseFailureClaimRe` specifically, START from the default lexicon template in
   `guard-catalog.md` (attempt-context failure verbs only; never `cannot/unable/could not
   process|complete` — measured 2026-07-16, screen-rung wipeout + cloud-matrix delivery-stub).
3. **Book/act directly — don't ask permission for the primary non-destructive action.** The action
   the user requested (book, generate, record) is the goal; only genuinely destructive tools
   (cancel/pay/delete/submit) get a confirm step. An agent that asks "shall I book?" fails the
   happy-path invariant. State this in behavior prose.
4. **Keep an end-to-end flow in ONE agent.** If a documented flow needs two tools the decomposer put
   in different agents (e.g. register-on-interest `createClient` + `createAppointment`), the flow
   breaks. Add the shared tool to the owning agent (register-on-interest belongs to the booking
   agent), or the measured loop will force the re-map.
5. **The measured loop finds WORLD bugs, not just spec bugs.** A two-turn confirm flow that fails at
   the confirm turn ("already done") often means the world's `advanceTurn()` auto-completed the
   action between turns, or a probe took effect. Fix the world (a probe must be side-effect-free;
   `advanceTurn` must not auto-finish a user-gated two-turn action) — and add that check to G3
   debate validation.
6. **Over-strict owner gates vs the eval.** A confirm-first/precondition the (simulated) owner
   specified can block a REQUIRED single-turn call (refresh, clear ops, idempotent ops). The eval
   is the arbiter — relax the gate for explicit user requests / idempotent tools.
7. **Prompt LAYOUT is a measured variable — the trunk-static law (measured 2026-07-09, in the
   lineage — see CONTEXT.md).** Moving the per-agent role line from `behavior[0]` to the trunk HEAD
   (same bytes of information, new position) cost ~4pt on flash-lite (4 reps 85.5–88.9 vs 92.3×2)
   AND broke the shared static prefix across the domain's agents. Rules: business-common content
   (theme `voice`, invariants) at the head, byte-identical across agents; per-agent divergence as
   late as possible; ANY layout change gets a factorial A/B against the certified layout with a
   replication CONTROL cell first.
8. **Claim-regex reply guards need negation/draft exoneration.** A bare
   `(criei|gerei…)[^.!?\n]*(vídeo|reel)` span-match kills honest replies two ways: (a) a truthful
   NEGATED report (`"não consegui preparar os quadros para o vídeo"`) and (b) a TRUE claim about a
   different artifact in the same sentence (`"criei o RASCUNHO do seu Reel"` — the draft WAS
   created). Ship the negation-aware wrapper + a negative lookahead for draft/`rascunho`/`conceito`/
   post nouns. The failure smell: the exhaustion closure replacing a substantive on-rubric reply
   (recoveryEvents `redrive:noFabricated* → exhaustion-terminal`).
9. **The no-tools redrive cannot satisfy an action expectation.** A reply-check that effectively
   demands "do the tool call" makes the redrive unwinnable (toolChoice:'none') → closure. Keep the
   redrive correction focused on de-claiming ("state only what actually happened; do not announce
   future actions"); action-forcing belongs to preTool gates/directives, never onReply.
10. **Homonym tool pairs are a deterministic gate class.** When the surface carries two
   near-synonym tools (dismissOffer vs dismissPulseOffer), the model picks the wrong one; if
   a world/projection key discriminates the context (e.g. a pitch-state key), ship a state-keyed
   preTool redirect gate — never rely on prose alone.
11. **Unpinned subject endpoints DRIFT — replication control before any conclusion (measured
   2026-07-09).** The `gemini-3.1-flash-lite` alias moved ~3pt between two days. Before attributing
   a score delta to YOUR change: (a) re-run the byte-identical baseline TODAY (replication control);
   (b) if it fails to reproduce, re-judge YESTERDAY'S outputs with today's judge (ISO-J) — judge
   consistent ⇒ the subject model drifted; then RE-BASE the comparison to the same-day number.
   Never compare scores across days/rulers; pin the subject model version when the provider
   exposes one.

## Cost guard

Screening is per-bucket N=1; never run full-set N=3 until every bucket screens ≥ the bar − ~5pt.
Full runs go to the A3-declared targets (cloud + local) per the deployment-targets section; for
LOCAL tiers, prose iteration on flippy cases uses the fork-pair margin probe (near-tie section) —
a margin measurement costs ~1 min and zero judge calls vs a full run + judge round. The judged
ruler is ALWAYS the LLM judge; a local model is a measured TARGET, never the ruler.
