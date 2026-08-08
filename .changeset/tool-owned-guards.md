---
'@looprun-ai/core': minor
'@looprun-ai/mastra': minor
'@looprun-ai/eval': minor
---

A guard that governs a tool is declared once on the domain contract and reaches the model in the
tool's own description, on both execution paths.

**@looprun-ai/core**

- `DomainContract.changeAllowed` → `DomainContract.guards: ContractGuardBinding[]`. A binding names
  a hook, a target (literal tools or a named set), a guard, an id and an optional priority; each
  installing lane resolves the named sets against its own declarations at construction:
  `'writeTools'` = `contract.writeTools ∩ lane.tools − exempt`, `'destructiveTools'` =
  `lane.destructiveTools − exempt`. The domain-wide write gate is now the canonical binding — a
  `precondition` on `'writeTools'` at priority `changeAllowed`, id `changeAllowed:precondition`.
  `exempt` withdraws names from a named set only; a stray entry throws at construction. New exported
  types: `ContractGuardBinding`, `DeclaredToolSet`.
- Every prose override arrives as `opts.prose`: `forbidThisTurn(reason, { prose })`,
  `precondition(ok, reason, { prose })`, `resultInvariant(pred, reason, { prose })` (each was a 3rd
  positional string), and `requiresBefore(deps, { within, prose })` accepts one.
- The `## Tool rules` assembled-prompt section is gone. A tool-targeted binding's prose composes into
  that tool's OWN description — `composeToolDescription(def, spec)` (internal barrel), one `- `
  bullet per rule under the fixed heading `RULES YOU MUST FOLLOW TO CALL THIS TOOL`, in priority
  order, de-duplicated per tool. `target:'any'` prose keeps its sections (`## Global tool rules`,
  `## Input rules`, `## Reply rules`). `PromptLine.tool` is removed.

**@looprun-ai/mastra**

- Native-tools mode requires the declared surface: `tools` without `toolDefs` throws at
  construction. The file is RECONCILED against the live host tools (`reconcileNativeSurface`) —
  a declared name the host lacks, a live tool the file misses, or a schema that no longer
  projection-matches (`schemaProjection` over `zod-to-json-schema` output) throws. Admitted host
  tools keep their own `execute` and are served with the composed description. The certification
  drift gate is unchanged and keeps fingerprinting the live schemas.
- `buildWorldTools(toolDefs, surface, getSession, spec, contract)` — `spec` is the new 4th
  parameter; the world seam serves composed descriptions for domain tools (terminals keep their
  protocol-owned description).

**@looprun-ai/eval**

- The write-gate parity lint reads the contract's binding list: the domain-wide gate is detected as
  a `contract.guards` binding at priority `changeAllowed`, and the advisory names that form.
