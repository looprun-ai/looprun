---
'@looprun-ai/core': patch
'looprun': patch
---

Document the **choose-gate** composition pattern (GUARDS.md + agentspec skill guard-catalog): a
`custom` preTool veto that, while an offer/pitch is OPEN in world state and unresolved this turn,
denies unrelated work so the MODEL (which reads user text) must choose engage-vs-dismiss — the
firewall-clean answer for intent-forked flows where an auto-dismiss `ChainSpec` is unshippable
(identical world footprint across engage/dismiss/persist). Includes the terminal-path twin
(state-gated `theme.stateBlock` OPEN block + anti-fabrication caveat) and the census obligation.
Validated: bench target case 0/3 → 3/3 (N=3, zero regression) + live production eval 10/10.

Also confirms v0.2.0 already shipped both prior-ask disjunct fixes (earlier-turn attempt +
lexicon-matched replyToUser probe) — this release is docs/skill only, no runtime code change.
