---
'@looprun-ai/eval': minor
'@looprun-ai/core': minor
---

`looprun-eval lint --spec-laws` gains the artifact-quality and subject laws.

Nine checks over the assembled specs — a tool the model is offered and nothing executes, a guard
bound where it can never fire, prose naming an absent or off-surface tool, an ordering the trunk
asserts and no gate enforces, a flow edge rendered as "do not skip a step" with nothing behind it,
an irreversible-looking tool nobody declared destructive, prose written as a post-hoc accusation,
and a seam armed with no sentence to go with it.

Two subject laws, both for defects with no symptom. A guard no case targets passes in BOTH arms of
a discrimination run, so it is neither an alarm nor a failure — it reads as coverage and has never
fired. A world that returns its refusals as successful-looking results leaves `ok` true, and every
honesty kind short-circuits to null: guards installed, inventory green, suite passing, nothing able
to fire. Plus a declared preset that throws, and a factory that accepts an unknown preset in
silence.

Every check reads the assembled objects — bindings, targets, `guard.meta`, the rendered `prose()`
— rather than pattern-matching call sites. A source-text lint goes blind the moment a spec builds
its surface through a constant, and stays green while the bundle rots.

In core, `noFabricatedSuccess` now records `meta.armed` (which seams are armed, as booleans, never
the patterns). This is what lets the armed-seam law be checked by reading the runtime instead of
re-encoding it. `ARMED_SEAMS`, `DENY_ONLY_PROSE_KINDS` and `CONFIRM_CLASS_KINDS` — exported for
lints that did not exist — now have consumers.
