---
'@looprun-ai/core': minor
'@looprun-ai/mastra': minor
'@looprun-ai/models': minor
'@looprun-ai/server': minor
'@looprun-ai/eval': minor
'@looprun-ai/vercel': minor
'looprun': minor
---

Consent to a destructive act is a token the engine issues and the user types back.

A call that answers `requiresConfirmation` names its record and the engine opens a question bound to it;
a destructive tool with no preview form is denied, and the denial opens a question from the label the
spec declared. The engine renders the question into the delivered text, the runtime reads the next
incoming message once and marks the question consumed if the user's own words carry its token, and
`confirmFirst` allows the act only when a consumed question is about that call. No model participates in
a consent decision, and nothing the agent emits is admitted as evidence of one.

**Breaking changes**

- `confirmFirst` takes one option, `flag`, and it says which call ACTS — the preview runs freely because
  it is how the world raises the question. `flag: false` is the one-step shape. `via` and `within` are
  gone.
- `noActAfterAskSameTurn` and `pendingConfirmMustAsk` are removed. A token can only arrive in a user
  message, so no turn can ask and act on the answer at once; and the engine renders the question itself,
  so there is no relay to force.
- `askedEarlier` is now `valueFromUser({ arg })`: the value recorded on the user's behalf must be one the
  user actually said, compared as a contiguous run of whole tokens over everything they have said. An
  invented value is denied and so is a paraphrase.
- `AgentSpecConfig.destructiveLabels` is required for a destructive tool that acts on no identifiable
  record — without one it can raise no question, so it never runs. Two labels whose first two words agree
  derive the same token and throw at construction.
- `DomainContract.engineText` carries the engine's own user-facing sentences (the record closures and the
  consent question). A conversation held in another language must declare it: the user has to be able to
  read the instruction whose token they type back.
- `RECORD_CLOSURE_SOME` / `RECORD_CLOSURE_NONE` are replaced by `DEFAULT_ENGINE_TEXT` on
  `@looprun-ai/core/internal`.
- A reply-only `controls.terminal` policy and destructive tools may now share a spec: reply-only bounds
  the agent, not the engine.
- A two-step world result must name its record under an identity key alongside `requiresConfirmation`,
  or the engine has nothing to bind the question to.
