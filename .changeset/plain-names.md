---
'@looprun-ai/core': minor
'@looprun-ai/eval': minor
---

Seven concepts carry the plain word for what they are.

`actionHistory` is what was done this conversation. `simulate` asks a world what would happen and
`simulationResult` is what that answer carries. `assembledPrompt` is the prompt an agent reads.
`approvalRequest` is the request the runtime opens for one act on one record, carrying the code that
answers it. A `variant` is one side of a comparison and a `range` is the spread across repetitions.

Breaking, `@looprun-ai/core`: `TurnLedger` → `TurnActionHistory`, `createLedger` →
`createActionHistory`, `deriveClaimsFromLedger` → `deriveClaimsFromActionHistory`, `Challenge` →
`ApprovalRequest`, `challengeToken` → `approvalCode`, `challengeMatchesCall` →
`approvalMatchesCall`, `issueChallengeForVeto` → `issueApprovalForVeto`, `closeChallengesFor` →
`closeApprovalsFor`, `consumeChallenges` → `consumeApprovals`, `renderScopedSpecTrunk` →
`renderAssembledPrompt`, `renderTrunkBlocks` → `renderPromptBlocks`, `foldTrunk` → `foldPrompt`,
`checkTrunkStatic` → `checkPromptStatic`, `TrunkBlock`/`TrunkRow`/`TrunkLine` →
`PromptBlock`/`PromptRow`/`PromptLine`, `TrunkPolarity` → `PromptPolarity`, `TrunkRenderOptions` →
`PromptRenderOptions`.

Breaking, `@looprun-ai/eval`: `CertBand` → `CertRange`, `CertBandOptions` → `CertRangeOptions`,
`buildCertBand` → `buildCertRange`, `renderCertBandMd` → `renderCertRangeMd`. The artefacts
`cert-band.json` and `CERT-BAND.md` are now `cert-range.json` and `CERT-RANGE.md`.

Breaking, world authors: the helper `probe()` is `simulate()`, the world-result key `preview` is
`simulationResult`, and the audit outcome `'preview'` is `'simulated'`.

`spec.surface.systemPrompt` is unchanged — it is one block an author writes, not the assembly. The
offline measuring instrument keeps the word `probe`.
