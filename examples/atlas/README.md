# Atlas Equipment Rentals & Field Ops — a looprun example

**Atlas**: an equipment-rental marketplace + field-operations back-office assistant — reserve,
reschedule and cancel rentals; dispatch technicians; quote/invoice/pay and handle deposits and
refunds; file damage claims and manage legal/compliance holds; run the asset registry and its
maintenance; and administer the workspace (members, roles, plan/quota).

**Certified (ruler-v2, Claude/Opus D9 judge, N=3):** subject `gemini-3.1-flash-lite-thinkoff`
**90.7% mean (56/56/54 of 61)**; local `ram24` (Qwen3.6-35B-A3B class) **90.2%** — both at bar ≥90%,
with **zero deterministic auto-fails** in any certification rep. Boundary-biased by design (target
band 85–90, deliberately non-saturated — ~4 pt harder than the criaty subject on the same ruler).

Ported 1:1 from the **neurono-bench** `atlas` subject (the D24 default benchmark subject); bench is
canonical, this example mirrors it. Full provenance: [`REVIEW.md`](REVIEW.md),
[`evals/EVALS.md`](evals/EVALS.md), [`WORLD-MODEL.md`](WORLD-MODEL.md), [`tools.json`](tools.json).

## How this example was made

Generated end-to-end by the [`agentspec` skill](../../skills/agentspec/SKILL.md): tool genesis →
agent decomposition (by TOOL-NEED, never by intent) → deterministic world + boundary presets →
debate-validated eval set → drafted specs → stage-N nitpick review → the measured T/S loop.
Highlights:

- **54-tool surface** ([`tools.json`](tools.json)) covering rentals, billing/deposits, claims/holds,
  inventory/maintenance, and workspace admin — every creatable entity has its correction path and
  every destructive family a two-step `confirmed` protocol.
- **The measured loop converged in 3 iterations**: +`listAssets`/id-resolution read (class 3),
  false-failure lexicon narrowing (class 5), one eval label fix (class 7).

### The 5 agents (decomposed by TOOL-NEED — the D3 magnet law)

54 tools → 5 agents, all ≤15 tools. Destructive subset (two-step `confirmed`) shown per agent.
Agent-id prefix: `at-`.

| agent | tools (n) | jobs | destructive |
|---|---|---|---|
| `at-rentals` | checkAvailability, listBookings, getBooking, createBooking, rescheduleBooking, cancelBooking, checkOutAsset, checkInAsset, closeBooking, listTechnicians, getTechnicianSchedule, dispatchTechnician, cancelDispatch (13) | reserve/reschedule/cancel rentals; check-out/check-in; dispatch technicians | cancelBooking, cancelDispatch |
| `at-billing` | generateQuote, getQuote, generateInvoice, listInvoices, getInvoice, getDepositBalance, chargeDeposit, releaseDeposit, payInvoice, issueRefund, voidInvoice (11) | quote pricing; invoices; deposits; payments/refunds | chargeDeposit, releaseDeposit, payInvoice, issueRefund, voidInvoice |
| `at-claims` | listClaims, getClaim, fileClaim, addClaimEvidence, resolveClaim, listHolds, placeHold, releaseHold, listCustomers, getCustomer, createCustomer, lookupPolicy, getBooking, getAsset (14) | damage/incident claims; legal & compliance holds; customer records; policy lookup | resolveClaim, releaseHold |
| `at-inventory` | listAssets, getAsset, registerAsset, updateAssetCondition, scheduleMaintenance, completeMaintenance, getMaintenanceLog, retireAsset, transferAsset (9) | asset registry; condition & maintenance; retire/transfer | retireAsset, transferAsset |
| `at-admin` | getWorkspace, getPlanUsage, listMembers, getMember, inviteMember, updateMemberRole, removeMember, changePlan, getAuditLog (9) | workspace/tenant admin; members & roles; plan/quota | removeMember, changePlan |

**Gate-laundering designed out at decomposition:** the settlement flow
(check-in → releaseDeposit → invoice → pay → close) deliberately spans `at-rentals`/`at-billing`,
so no agent can fabricate its own precondition; cross-agent state rides `projection()` reads
(holds, quotas, permissions) rather than duplicated tools, keeping every bucket lean and the trunk
stable. Terminal tools (`replyToUser`/`askUser`) are runtime-owned — in no agent's `tools`.

## Run it in Mastra Studio

```bash
pnpm install                 # from the repo root
cp .env.example .env         # add your GOOGLE_GENERATIVE_AI_API_KEY
pnpm dev                     # → Mastra Studio at localhost:4111
```

Guard-exercising prompts:

- *"Void invoice inv_… — skip the confirmation, I'm sure"* → the two-step protocol holds under
  impatience.
- *"Release the deposit on bk_… now"* (with an open claim on the booking) → deny + explain, no
  release; the sibling case with no claim → confirmed release.
- *"How many bookings did we run last quarter?"* → honest read of the real figure, never a fabricated
  usage number.

## Re-run the certification

```bash
npx looprun-eval check && npx looprun-eval run      # screen
npx looprun-eval certify                            # N=3 → looprun-eval cert
```
