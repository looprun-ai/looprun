# Stage E3 — ENGINEER: the domain THEME (`src/agents/<domain>/theme.ts`)

The theme is the business-COMMON layer: the strings shared by every agent of a domain. It is a
**generated artifact with one owner — the skill** — exactly like the specs. The looprun trunk
renderer (`renderScopedSpecTrunk` in @looprun-ai/core, or any host equivalent) is pure assembly
machinery and holds ZERO business strings (SKILL.md hard rule) — a generated spec or theme owns
every business string; you install the runtime as-is.

Run E3 from the same inputs as E2 (docs + A2 answer + tool schemas + the world's projection
keys) — it can run in parallel with the spec drafters.

Layout law (why the shape below is not negotiable — trunk-static, SKILL.md hard rules): the
rendered trunk is `voice → core invariants → per-agent sections (flow/rules/governance/behavior)
→ language`, with the spec's role line as the first Behavior bullet. This maximizes the shared
static prefix across a domain's agents; prompt LAYOUT is a measured variable (2026-07-09: moving
the role line to the head cost ~4pt on flash-lite).

## The TrunkTheme shape (what to emit)

```ts
import type { TrunkTheme } from 'looprun';
export const <DOMAIN>_THEME: TrunkTheme = { voice, stateBlock, coreInvariants, languageClause, exhaustionReply };
```

**NO per-agent persona** (the persona-on-spec law — the role line lives on each spec's `persona`
field). A theme persona would create a second owner for persona text — the persona-duplication
defect class. The lint (`looprun-eval lint`, and the portable `scripts/lint-guards.mjs`) rejects a
theme file that carries a `persona` key.

### 0. `voice: string` — the shared business voice (the trunk's opening)

The domain-COMMON voice paragraph, derived from the persona/policy doc (or the purpose sentence):
who the assistant is for this business, its register/tone, and the outcome-confirmation style —
WITHOUT any per-agent role content and WITHOUT account-volatile facts (account names/state ride
the stateBlock tail — the state-in-tail law). It opens the trunk and must be BYTE-IDENTICAL across
every agent of the domain (trunk-static law).

### 1. `coreInvariants: string[]` — the always-render "NEVER violate" rules

Derive from the docs/policy (+ the gate-#1 free-text row), in this preference order:

| # | invariant class | source | example shape |
|---|---|---|---|
| 1 | **anti-fabrication** (ALWAYS first) | universal | "Read before you claim: NEVER invent a <entity/figure> — these come ONLY from the tools (<read tools>). If you did not read it from a tool, you do not know it." |
| 2 | id/label discipline | tool schemas | "Reference entities by their real id — <examples>. Never invent or guess one." |
| 3 | two-step destructive protocol | the approved destructive list | "Confirm before you <verbs>: <tools> are two-step — confirmed=false first, relay the question, confirmed=true ONLY after explicit agreement in a later turn." |
| 4 | domain-safety / professional boundary | policy docs | "You are a support tool, NOT a <licensed professional> — never <advise/diagnose/opine>; surface tool data and defer." |
| 5 | confidentiality / consent | policy docs | "NEVER disclose one client's data to another…" |
| 6 | validity rules | docs + schemas | past-date invalid, prepared-before-submitted, regime-before-filing… |
| 7 | honesty-on-failure (ALWAYS last) | universal | "Never claim <write> happened unless the tool returned success this turn; report real failures honestly." |

Bucket-A applies to every line: state the CONDITION, never a state snapshot that can be false.
Keep it to the handful that actually bind (6–9 lines) — the per-agent rules live in the specs.

### 2. `languageClause: string`

The exact "## Output language (ABSOLUTE)" block, locale from the docs/A2 answer (or the user's own
language as default): English-prompt-for-parsing-only + reply ENTIRELY in the user's language
(+ the business default locale when one exists).

### 3. `stateBlock(world): string` — the state-render mapping

- Returns **BODY lines only** — the runtime renders them under its own `## Account state` heading
  on the USER-MESSAGE tail (the state-in-tail law; never in the system prompt).
- Reads ONLY the world's `projection()` keys (the same keys deterministic checks may read) through
  defensive helpers (`yn`/`num`/`str` with safe defaults) so an unrelated world never throws.
- Include a line for every state the RULES reference: if an invariant or gate keys on
  `hasAddress` / `quotaRemaining` / `conflictFound`, the model must SEE that state (fail class 1:
  state-visibility gap). Purity: no Date.now / Math.random / I/O.

### 4. `exhaustionReply(world, okTools, produced, violations): string`

The deterministic honest-abstain closure, a pure function of VERIFIED observations: names only the
tools that succeeded + labels/ids minted this turn; structurally unable to fabricate; never empty.
Reply in the business locale when one is fixed, else neutral English.

## Placement + wiring

- Emit `src/agents/<domain>/theme.ts` next to the specs, and register the bundle in the domain
  `index.ts` (`SPECS` + `THEME`).
- Every spec of the domain points at the SAME theme object via its config's `theme: THEME` field
  (imported from `./theme.js`) — that is a REFERENCE for DX, not content; the runtime renders
  `renderScopedSpecTrunk(world, spec, uploads, theme)` and a host-provided theme always overrides
  the spec's reference. The project config may also set the top-level `theme` (optional when every
  spec carries one).
- `looprun.eval.config.ts` is the harness seam (world/tools/cases/caseMap); the theme lives in the
  generated bundle, never in the library.

## Review

The theme goes through N (NITPICK) like a spec: N2 (Bucket-A) audits the invariants, N4 diffs the
docs' common rules against `coreInvariants` (+ verifies per-agent rules landed in a spec instead),
N1 confirms `stateBlock` reads projection keys only. Mechanical half: `npx looprun-eval lint`
(theme-persona law; `--spec-laws` adds the config-level checks) or the portable
`node scripts/lint-guards.mjs <theme.ts>`.
