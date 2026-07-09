# Stages T + S — TEST (the measured loop) and SHIP (certification)

## Ruler discipline (non-negotiable)

- Subject model default: `gemini-3.1-flash-lite-thinkoff` (needs `GOOGLE_GENERATIVE_AI_API_KEY`;
  the numeric thinking-off trap is already encoded in looprun). Judge: **Claude judge only**
  (never gemini, never mixed — measured ~4pt lenient). N≥3 to certify. Bar: **≥90%** unless the
  caller sets another.
- Live `→ pass/fail` lines during a run are the INVARIANT gate, not quality. Only the judged
  aggregate counts.

Full walkthrough: `docs/guides/measured-loop.md` in the looprun repo.

## Stage T — screening iterations (N=1)

Whole domain at once: `npx looprun-eval run` reads the config's `caseMap` and screens every agent
bucket (writes `eval-results/<date>-<domain>/<agent>.dump.json` + `.autofail.json` +
`.tasks.jsonl`). Per single bucket:

1. `npx looprun-eval run --agent <agent-id> --cases <case-ids-csv|full> [--reps 1]` — runs the
   bucket (no judging) and preps the judge tasks.
2. Judge the dump: Claude subagents over `<agent>.tasks.jsonl` using the packaged generic judge
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

4. Re-screen ONLY the failed cases after each fix round (`--cases <failed-ids-csv>`). ≤3
   iterations (the measured convergence bound). Not converged after 3 → STOP, escalate to the user
   with the classified residuals (something upstream is wrong: decomposition, eval quality, or a
   model-tier wall).

Rules:
- One fix-class batch per iteration; never shotgun unrelated prose edits (prose is non-local —
  the maxCallsPerTurn lesson).
- Every fix = both halves updated (check + prose) where applicable.
- Class-6 residuals are ACCEPTED, not masked with brittle regexes.
- After any spec edit: `npx looprun-eval lint --spec-laws` must stay clean before re-running.

**STOP RULE (measured 2026-07-03, on the lineage's first generation run — do not skip).** Once the
aggregate is at/above the bar, STOP. Do not chase individual language-layer cases with more prose.
Measured evidence: after hitting 91.5% (> the 90% bar, > the gold's 91.2%), two targeted prose
edits each fixed their target case but REGRESSED two sibling cases apiece (net −2). Prose is
non-local (the magnet's chronic mild form); past the bar, the marginal case is almost always the
language layer, and prose tuning there trades one fail for another. Re-measure the FULL affected
bucket after any prose edit — a per-target re-check hides the sibling regressions. If an edit
doesn't net-improve the bucket, REVERT it.

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
The loop runs cloud-only (flash-lite). A local smoke run
(`npx looprun-eval run --model qwen3.5-4b`) comes only AFTER certification — never inside the
loop, and never as the ruler.
