# Increment 1 — GuardCatalog data-only + trunk policies

Date: 2026-08-02 · Status: approved · Repo: looprun · Depends on: umbrella
`2026-08-02-config-only-architecture-design.md`

## Problem

Generated bundles install guards through free TypeScript (`custom()` + hand regexes). The Atlas
run measured 9 defective regexes, deny messages leaking world facts, an exhaustion stub that
fabricated a success, and byte-identical observed-ledger predicates drifting across specs. All of
it is authoring surface the engine should not offer to generation.

## Deliverables

### 1. `norms/<agent>.json` schema (zod) + loader

```jsonc
{
  "id": "fleet",
  "persona": "…",                          // case-invariant string
  "tools": ["listAssets", "…"],
  "destructiveTools": ["retireAsset"],
  "guards": [
    { "kind": "requiresBefore", "tool": "changePlan", "reads": ["getPlanUsage"] },
    { "kind": "consentToken",   "tools": ["issueRefund", "chargeDeposit"] },
    { "kind": "askedEarlier",   "tool": "completeMaintenance", "arg": "condition" },
    { "kind": "precondition",   "tool": "inviteMember", "predicate": { "op": "lt",
        "left": {"count": "members"}, "right": {"limit": "seats"} },
      "prose": "…" }
  ],
  "uncheckable": [ { "ruleId": "D44", "prose": "…" } ],   // prose + judge, never code
  "behavior": ["…"],                        // style/voice ONLY — never a rule with an owner
  "scope": { "lane": "…", "others": [ … ] }
}
```

- **No field of the schema accepts a regex or free predicate function.** `z.instanceof(RegExp)`
  and string-pattern fields do not exist. The ban is structural (the run's rule C).
- Guard prose lives ON the guard entry — a rejected check keeps its prose in `uncheckable`,
  never displaced to `behavior` (the run's finding A).
- `predicate` is a small closed expression language over WORLD/ARGS/OBSERVED structure only:
  `count/limit/field/arg` refs + `lt/lte/eq/neq/in/absent` ops. No string matching.

### 2. Structural primitives (engine-owned, replacing the run's hand code)

| primitive | replaces (measured defect) |
|---|---|
| `askedEarlier` — a terminal `askUser` (or an ask-classified reply, see §4) occurred in an EARLIER turn, optionally about `arg` | CONDITION_ASK_RE (case 72, two failed rounds) |
| `consentToken` (config kind) — SHIPPED as structural earlier-simulate inference: the confirmed call is admitted only when an EARLIER-turn simulate over the SAME (tool, args-hash) is found in the ledger. No literal token is minted or carried; the (tool, args-hash) match over prior turns IS the consent signal. Closes the case-35 class ("one yes spent on another act"). A future strengthening could mint and carry an actual token bound to (tool, args-hash) — that variant requires a tool-contract change (the tool must accept and echo the token) and is NOT shipped. | the case-35 class ("one yes spent on another act") — closes it structurally |
| `attemptedEarlier`, `succeededEarlier`, `tookEffect` lookups over the ledger | per-spec `TERMINALS`/`agreedEarlier` copies (drift) |
| `siblingCallsThisStep` staleness helper documented for all gates | case-72 same-step staleness |

### 3. Trunk policies (ship together — they are what makes deny/abstain safe)

- **Deny renderer**: a deny NAMES THE READ that would establish the fact and never interpolates
  world figures or roles. Guard configs supply only the read name(s) and a reason id; the engine
  renders. Kills the "deny hands the model unread facts" class (cases 39/47/49/77/83).
- **Exhaustion abstain**: derived from the ledger — a WRITE is announced as done only when
  `tookEffect === true`; reads list as reads. Never authored per-subject. Kills the lying stub
  (case 04).

### 4. Text classification WITHOUT regex

Where a rule genuinely needs "is this reply an ask / a claim", the engine offers ONLY:
- structural signals first (`askUser` terminal, simulate presence, ledger effects);
- if a reply-text judgment is unavoidable, it is a JUDGE matter (`uncheckable` + rubric) — the
  deterministic layer never string-matches. `pendingConfirmMustAsk`'s replyToUser-regex branch is
  slated for removal; the `askUser` branch remains. **DEFERRED (not removed in increment 1):**
  removing the regex branch now would void coworking's measured numbers mid-increment, so it lands
  with the bundle migration (increments 2–3). See BACKLOG: "`pendingConfirmMustAsk` regex branch
  removal (spec §4)".

### 5. E1 — invariants see ATTEMPTS

`evaluateInvariants` (eval pkg) evaluates forbidden calls over the DUMP's attempted calls
(guard-vetoed included), matching the existing docstring "a matching call was ATTEMPTED at all".
Dumps mark each call `attempted|executed|vetoed`. Cert output states which basis was used.

## Testing

- Schema round-trip: every catalog kind loads from JSON and installs the same guard object the
  TS API would.
- Regex-ban proof: a config carrying any pattern-like field fails validation with a named error.
- consentToken: simulate→confirm across turns passes; same-turn or token-less confirm is denied;
  two acts sharing one yes produce two distinct tokens (case-35 reproduction as fixture).
- askedEarlier: fires false when the ask is in the SAME turn; true for an earlier `askUser`
  (case-72 reproduction as fixture).
- Deny renderer: snapshot proves no digits/roles from world state appear in rendered denies.
- E1: a scripted model whose forbidden call is guard-vetoed now FAILS the invariant (today it
  passes) — the fabricated-premium reproduction.

## Out of scope

World and cases stay TS until increments 2–3. No migration of existing bundles here; the
coworking/atlas ports happen per subject after the loaders land.
