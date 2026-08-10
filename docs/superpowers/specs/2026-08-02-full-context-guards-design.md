# Full-context guards — design (firewall retired)

Date: 2026-08-02 · Status: CLOSED — shipped. `llmCheck` lives in
`packages/core/src/guards/llm-check.ts`. · Repo: looprun ·
Pre-1.0 law: NO retroactive compatibility — old bundles/numbers are disposable; nothing in
this design defers to them.

## Rulings (user, 2026-08-02)

1. **Guards see EVERYTHING.** The full conversation history — user messages included — plus
   every signal the runtime holds. The "magnet firewall" (guards blind to user text) is
   RETIRED: guards are deterministic code (or explicit LLM adjudicators); "influence" does
   not apply. What the firewall actually protected decomposes into laws with better owners:
   intent-based tool routing stays banned (a loop-shaping law, not a guard law), and
   pattern-matching over text stays banned (the no-regex law, structurally enforced in the
   config surface).
2. **Text participates FREELY** in guard decisions — including exemptions. No veto-only
   restriction.
3. **A guard may use an LLM to decide.** LLM adjudication becomes a first-class guard kind.

## Deliverables

### 1. `GuardCtx.history` — the whole conversation

```ts
history: ReadonlyArray<{
  turnIndex: number;
  userText: string;                 // NEW — the user's message, verbatim
  reply: string;                    // the delivered assistant reply
  toolCalls: …;                     // executed (args/result/ok/tookEffect)
  attemptedCalls: …;                // guard-vetoed attempts
  guardEvents: string[];            // what fired, incl. deny/redrive kinds
}>
```

Available to EVERY hook. `onInput` receives the real incoming user text (today it gets a
hard-coded `args: {}` — that dies). `observed` stays as the flat call view; `history` is the
turn-structured superset. Nothing the runtime knows is withheld: attachments, produced
labels, veto streak, post-tool violations ride along where they already exist.

### 2. LLM-adjudicated guard kind

```jsonc
{ "kind": "llmCheck", "hook": "onReply" | "preTool", "tools": ["…"] | "any",
  "rubric": "…",            // the trusted, pre-baked question the adjudicator answers
  "failMode": "open" | "closed" }   // adjudicator unreachable → allow (default) or deny
```

- The MODEL is host-registered (like `custom` executors — a `DefineWorldOptions`-style
  `adjudicator` seam on the runtime options), never named in config. Verdict-only contract:
  the adjudicator returns `{violation: string | null}`; its output is a deny reason, never
  free text delivered to the operator.
- The adjudicator reads the rubric + the relevant `history` slice (user text included, per
  ruling 2). Prompt-injection is acknowledged and accepted: the rubric is trusted and fixed,
  the output channel is a verdict, and the residual risk is priced by evals, not by
  blindness.
- Hooks become async-capable (an LLM check awaits; deterministic guards stay sync).

### 3. Regex removal — NOW, not at migration

Pre-1.0 disposability applies: the deferred items close immediately.
- `pendingConfirmMustAsk` loses its replyToUser-regex branch (the `askUser` structural
  branch + `llmCheck` cover the job).
- Every regex-typed guard parameter (`askRe`, `claimRe`, `banRe`, `offerRe`, …) is REMOVED
  from the engine guard surface. Jobs that genuinely need text judgment become `llmCheck`
  rubrics; jobs with structural signals use the structural primitives. TS bundles that
  break are disposable (regenerated/ported when next needed) — no shims, no dual paths.
- The config surface keeps its structural ban (no pattern fields); `llmCheck.rubric` is
  prose, not a pattern.

### 4. Doctrine + docs rewrite (same increment)

- `rules.ts` firewall comment → replaced by the new contract (full context; no-regex law;
  intent-routing ban restated as a loop law).
- `GUARDS.md`/generated catalog + tutorial ch03/ch04 rows for `history`, `onInput`, `llmCheck`.
- Skill side (agentspec, separate commit, leak-review): T1 R1 charter re-scoped — hunts
  PATTERN-MATCHING over text and intent-based tool routing; reading text is no longer a
  finding. N4's "firewall-safe" vocabulary retired; `uncheckable` rules may now become
  `llmCheck` guards instead of prose-only.

### 5. Testing

- history: property test — every hook sees the full prior conversation incl. userText;
  onInput carries the incoming text.
- llmCheck: fake adjudicator fixture (deny fires, exemption path, failMode both ways,
  async ordering with deterministic guards).
- Regex removal: the engine compiles with zero `RegExp`-typed guard params (grep-gate in
  the purity/lint lane); `pendingConfirmMustAsk` structural branch proof updated.
- Case-35 fixture re-expressed as an `llmCheck` rubric ("did this yes license THAT act?")
  to prove the kind closes what structure alone could not.

## Out of scope

Re-measurement of any subject (happens when the user wants a number); porting TS bundles;
the attestation/judge layers.
