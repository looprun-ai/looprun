# Guard consolidation + recency law — design

Date: 2026-08-02 · Status: CLOSED — shipped. The consolidated kinds are the entries of
`GUARD_CATALOG` in `packages/core/src/guards/catalog.ts`. · Repo: looprun (+ agentspec refs)
Governing principle (user ruling): **clarity of understanding ALWAYS wins** — explicit params
over clever compact forms; fewer kinds is not the goal.

## Rulings applied

1. **Recency law (ALL history-consuming guards).** A license or exemption read from `history`
   must be turn-bounded — an old event must never license a new act ("a simulate for the same
   record 20 turns ago must not license today's confirm"). Every guard that consumes an
   earlier-turn event gains a `within: number` param = max turn distance
   (`currentTurnIndex − eventTurnIndex ≤ within`).
   - LICENSING guards (a past event UNLOCKS an act): default `within: 1` — the immediately
     preceding turn, the natural two-step shape. Applies to: unified `confirmFirst`
     (simulate/ask licenses), `askedEarlier`.
   - EVIDENCE guards (a past event is proof work was done): `within` available, default
     UNBOUNDED — `requiresBefore` (a read from turn 1 legitimately grounds a turn-3 write).
     ⚠ DEFAULT CHOICE FLAGGED FOR REVIEW: if the user prefers bounded evidence too, set it
     at authoring time per guard; the engine default stays unbounded.
2. **`replyMentions({ terms, anyTerm })`** replaces `replyMustMention` (≙ `anyTerm: true`)
   and `replyConfirmsLabels` (≙ `anyTerm: false`, the default). Literal case-insensitive
   substring scan — terms are DATA from config, never patterns.
3. **KEPT AS-IS by ruling** (understanding beats economy): `replySingleQuestion()`,
   `replyMaxOccurrences(ctas, n)`, `consentRequired(tools, predicate)`.
4. **`confirmFirst` unified**, absorbing `confirmedNeedsEarlierSimulate`:
   ```ts
   confirmFirst({
     flag: 'confirmed',            // the tool's consent arg
     via: 'simulate' | 'ask' | 'either',  // what licenses (simulate = same tool, flag≠true,
                                       // args-subset match, EARLIER turn; ask = prior askUser)
     within?: number,              // recency law, default 1
   })
   ```
   `confirmedNeedsEarlierSimulate` is deleted (pre-1.0, no alias). `confirmFirst('confirmed')`
   string overload maps to `{flag:'confirmed', via:'either'}`.

## Also in scope

- `destructiveThrottle` re-implemented ON TOP of `maxCalls` machinery (both kinds stay —
  internal unification only, zero API change).
- **The consent story** documented as ONE section (GUARDS.md + generated ch04 preamble +
  agentspec guard-catalog.md): the three checkpoints diagram — ① `confirmFirst` gates the
  CALL, ② `askedEarlier` gates the ARG, ③ `pendingConfirmMustAsk` gates the REPLY — install
  as a set, never two redundant.
- eval `norms-config` kinds follow: `consentToken` config kind re-maps to the unified
  `confirmFirst`; `replyMentions` kind added; deleted kind's config entry removed.
- Catalog/proofs/L3/locks/outline/tutorial regenerated; agentspec refs updated (leak-review).

## Net result

25 → **23 kinds** (−`confirmedNeedsEarlierSimulate`, −`replyMustMention`+`replyConfirmsLabels`
merged into +`replyMentions`) + the recency law across history guards.

## Testing

- Recency: simulate/ask at distance 1 licenses; distance 2 (default) does NOT; `within: 5`
  widens; askedEarlier same matrix. requiresBefore unbounded default proven + bounded when set.
- confirmFirst matrix: via simulate / ask / either × licensed / unlicensed / same-turn (denied).
- replyMentions: anyTerm true (one of) / false (all of) / miss cases; case-insensitivity.
- Throttle-over-maxCalls: existing throttle proofs unchanged (behavior identical).
- Grep-gate untouched; no new text patterns anywhere.

## Out of scope

Re-measurement; porting TS bundles; any further kind merging (rulings #3 close them).
