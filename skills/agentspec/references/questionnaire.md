# Stage A — ASK: one question, send-or-skip asks

The DX target: the user's total day-0 typing fits in one chat message. Exactly **one mandatory
question** (the purpose); every other input is either discovered from files or requested with a
**send-or-skip ask** — a prompt answerable in seconds with a path, a paste, a few words, or a skip
word. Never ask the user to think about architecture; that is what the pipeline is for.

Ask in the USER'S language (the wordings below are English; mirror whatever the user speaks).

## Q0 — the ONE question (always asked, first, alone if the rest is discoverable)

> **"What is the agent's / your business's purpose? (one sentence is enough)"**

The purpose sentence seeds everything downstream: tool genesis (when no tools exist), the domain
decomposition, the theme derivation, and the eval dimensions. If the user already stated the
purpose in their opening message, do NOT re-ask — record it and move on.

## Send-or-skip asks (only for inputs discovery could not find; batch with Q0 in ONE message)

| ask | wording | on skip |
|---|---|---|
| A1 — tool surface | "Send the `tools.json` / tools directory / MCP endpoint (a path, or paste it here) — or reply **'none'**." | 'none' ⇒ run **G1 tool genesis** (`references/tool-genesis.md`) |
| A2 — docs + persona/policy | "Send product/policy/persona docs (paths or paste) — or **describe the tone and the key rules in a few words** — or reply **'default'**." | 'default' ⇒ derive persona register, locale and invariants from the purpose sentence + G1 output; log the derivations |
| A3 — deployment models (MULTI-select) | "Which models will this agent RUN on in production? **[1]** none specific / not sure · **[2]** a cloud model (needs its API key) · **[3]** a local model (needs the local server up) · **[4]** other — type the id/endpoint. Multiple selections welcome." | '[1]'/skip ⇒ targets = ∅; the T-loop still measures the **always-on BASELINE** (below) |

**A3 semantics (measured 2026-07-16 — the subject model steers agent quality BOTH ways: the same
bundle scored 100% on the declared tier and 82% on the undeclared one):**
- **Baseline (+1, always measured):** besides the selected targets, the T-loop ALWAYS measures the
  model running the skill (a Claude subagent playing the generated agent against the world — zero
  external dependency). Every generation ships with at least one measured number; the baseline also
  owns the **default profile**.
- **Default profile = the certified natural-prose render** (default lexicon/sampling) — an
  UNDECLARED model that shows up later runs with it (guards work day-0 on any model; quality is
  certified only for measured targets). Telegraphic/compact restyles are an opt-in end-of-loop
  experiment per target, never the default (measured 2026-07-16: net-negative on the local tier).
- **Onboarding a model later**: run the existing eval N=1 with the default profile → bar passed ⇒
  certify N=3; failed ⇒ ONE T-round calibrating a profile (FORM/lexicon only — the spec does not
  regenerate). Certification is bound to the ARTIFACT hash: any spec change after certification
  invalidates every model's seal and requires re-certifying.

Rules for any ask you are tempted to add: it must be answerable with a **path, a paste, ≤10 words,
or a skip word**. If answering would require the user to reason about decomposition, guards, flows,
or evals — do not ask; derive it and put it on the gate-#1 approval table instead.

## Derive silently (never ask these)

| decision | derive from |
|---|---|
| tool vocabulary + schemas | tools.json / MCP listing / G1 output |
| destructive-tool candidates | schema `confirmed`-style flag; verbs delete/cancel/remove/archive/reset/pay/submit; doc phrases "cannot be undone" |
| reply language/locale | docs + example content + the language the user writes in |
| state accessors available to checks | the world class / `projection()` (generated for a new domain — G2) |
| flow-edge candidates | produces/consumes pairs in schemas + doc protocol descriptions |
| quotas, gates, caps | docs (they become preconditions directly) |
| topology (K agents) | E1 tool-need clustering (presented at gate #1, not asked) |
| persona register (voice) | persona/policy doc when given, else the purpose sentence |

## Human gate #1 — the approval TABLE

The old topology / destructive-designation / hidden-invariants questions are NOT asked up front.
Instead, after G1 (if run) + E1, present ONE approval table the user corrects rather than answers:

- **Agents** — agent → tools → the jobs it owns (the E1 clustering; tool-need, never intent).
- **Tool surface** — when tool genesis ran: the generated tool list (name + one-line description),
  destructive tools marked.
- **Destructive list** — the derived confirm-first + one-per-turn set. The user adds/removes rows.
- **Theme summary** — derived locale + the core-invariant headlines + the per-agent persona lines.
- One free-text row: *"Any hard rule missing here? (quotas, prohibitions, confirmation flows) —
  or reply 'ok' to approve."* — each answer becomes BOTH halves of a rule (prose + check) or, if
  uncheckable from state, a conditioned behavior line + an eval dimension.

Approval of this table IS human gate #1. Gate #2 (residual acceptance) happens at S.

## Rules

- Q0 + the applicable asks go out together in ONE batch (one AskUserQuestion call / one message).
- Record every answer verbatim in the run's `REVIEW.md` (provenance).
- Defaults when the user is simulated or answers "you decide": A1 = 'none' only if no tool
  file is discoverable (genesis), A2 = 'default'; gate-#1 table approved as derived.
