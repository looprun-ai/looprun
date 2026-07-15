---
"@looprun-ai/core": minor
"@looprun-ai/mastra": minor
"looprun": minor
---

Guard catalog trimmed 27 → 23 kinds — the runtime is now media-free and narration-free (the P8a
domain-neutrality law, completed). Pre-1.0 breaking API.

**Breaking API — migrate:**

- **Media/label input guards left the runtime.** `labelExists` and `labelProvenance` are no longer
  runtime kinds — the neutral core carries no media concept. A media-ish domain now authors them as
  `custom({ dim:'input' })` guards over its own world accessors:

  ```ts
  custom({
    kind: 'labelExists', dim: 'input',
    check: (ctx) => ctx.world.hasMediaLabel(String(ctx.args.label ?? '')) ? null : 'Unknown label — use a real one.',
    prose: () => 'the label must be a real one (do not invent it)',
  });
  ```

  `interface MediaWorld` is removed from `@looprun-ai/core`; a domain reads its own accessors through
  the world's index signature.
- **`maxCallsPerTurn` + `maxCallsPerConversation` → `maxCalls(tool, n, reason, { scope })`.** Scope is
  `'turn'` (default — same as the old `maxCallsPerTurn`) or `'conversation'` (the old
  `maxCallsPerConversation`). One kind, one deny message + prose.
  - `maxCallsPerTurn('t', 2, r)` → `maxCalls('t', 2, r)`
  - `maxCallsPerConversation('t', 3, r)` → `maxCalls('t', 3, r, { scope: 'conversation' })`
- **`replyNoProductionClaim(claimRe, reason)` → `noFabricatedSuccess(tool, { banRe: claimRe, reason })`.**
  The unconditional-ban mode of `noFabricatedSuccess` (a `banRe` checked before the ran-this-turn
  short-circuit, so it fires regardless of attempts) absorbs the former standalone kind.
- **`noFabricatedSuccess` media lookup → injected `refExists`.** The former hardcoded
  `world.hasMediaLabel` coupling in the invented-label branch is now the injected predicate
  `refExists?: (world, label) => boolean` (absent ⇒ only labels produced this turn are known). All
  scheme params (`claimRe`/`labelRe`/`verbClaimRe`/`banRe`/`refExists`) are optional — pass only what
  the domain needs; `banRe`-only makes it a pure ban.
- **`degenerationGuard` self-narration → `lexicon.selfNarrationRe`.** The always-on markup +
  line-repetition branches are unchanged. The third-person self-narration branch is now opt-in: it
  fires only when the bundle injects `cfg.lexicon.selfNarrationRe` (`degenerationGuard({ selfNarrationRe })`);
  absent ⇒ that branch is OFF and the runtime carries no narration language. The auto-installed
  `minimal:degenerationGuard` id and onReply order are unchanged, so a spec that ships no lexicon is
  byte-stable. To restore the pre-0.4.0 built-in behavior verbatim, pass the former regex back in:
  ```ts
  degenerationGuard({
    lexicon: { selfNarrationRe: /\b(?:I closed the turn|by calling replyToUser|The assistant (?:confirmed|called|then))\b/i },
  });
  ```
