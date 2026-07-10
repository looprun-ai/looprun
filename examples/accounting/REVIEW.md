# REVIEW — accounting (agentspec pipeline provenance)

Run date: 2026-07-10. Pipeline: A → G1 → G2 → G3 → E1/E2/E3 → N (measured loop T/S not run in
this pass). Executor: Claude (agentspec skill).

## Provenance / anti-contamination

- **Skill install method:** repo copy — the skill ships at `.claude/skills/agentspec/`
  (SKILL.md + references/ + scripts/) inside this project; followed as the sole instructions.
- **Inputs (complete list):** (1) the purpose sentence below; (2) the questionnaire defaults
  below; (3) the import surfaces of the installed packages (`looprun`, `@looprun-ai/eval` — public
  .d.ts only). **No external material** was read: no gold/certified specs, no other domain's
  bundles, no research-repo artifacts. Every business string here was derived fresh from the
  purpose sentence.
- All generation happened in this project directory; G1/G3/N validation used independent
  subagent judges/reviewers whose only inputs are named in each section.

## Stage A — ASK (simulated user, answers recorded verbatim)

| ask | answer |
|---|---|
| Q0 purpose | "Assistant for a small accounting firm: manage clients, bookkeeping entries (income/expenses), invoices and payments, and tax-filing deadlines." |
| A1 tool surface | "none" → G1 tool genesis ran |
| A2 docs / persona | "default" → derived silently: professional, precise, plain register; honest about deadlines/figures; neutral invented firm name **LedgerLine Accounting**; locale English; USD |

## Stage G1 — tool genesis (debate-validated)

### G1.1 dimension decomposition (from the purpose sentence)

- **Entities/lifecycles:** Client (created → contacts updatable → regime unset→set) ·
  Entry (append-only, reversible once) · Invoice (draft → sent → paid|void) ·
  TaxDeadline (registered → upcoming → overdue) · Filing (not_started → prepared → submitted) ·
  Notification (fire-and-forget).
- **Jobs:** onboard/update client, set regime, record/reverse/list entries, summarize account,
  create/send/void invoice, record payment, remind, list/register deadlines, prepare/submit filing.
- **Honesty reads:** listClients/getClient, listEntries/getAccountSummary, listInvoices/getInvoice,
  listTaxDeadlines.
- **Destructive candidates:** reverseEntry, sendInvoice, recordPayment, voidInvoice, submitFiling
  (all two-step `confirmed`).
- **Money/limits:** entry/invoice/payment amounts (positive, exact-match payments), regime rates.

### G1.3 debate (rigid Advocate vs 2 independent judges, T=2)

**Round 1: both judges DISSENT.** Consolidated findings and resolutions (one refinement round):

| finding (judge) | resolution |
|---|---|
| Client `status` field has no writer/lifecycle (J1.1, J2.4) | ACCEPTED — field deleted from reads and entity |
| No `updateClient` — invoice-delivery email uncorrectable (J1.2, J2.4) | ACCEPTED — `updateClient` added (contact fields only) |
| Entry immutability with no correction path (J1.3, J2.3) | ACCEPTED — `reverseEntry` added (two-step, append-only compensating entry, once per entry) |
| No deadline genesis (`createTaxDeadline`) (J1.4, J2.1) | ACCEPTED — tool added |
| Prepared-filing figures unreadable (J1.5, J2.9) | ACCEPTED — figures returned by the deadline read; `getFilingStatus` MERGED into `listTaxDeadlines` (one read per entity) |
| Amounts allow ≤0 (J1.6, J2.6) | ACCEPTED — `exclusiveMinimum: 0` on all three amounts |
| `createClient.email` unpatterned (J1.7, J2.7) | ACCEPTED — email `pattern` added (also on updateClient) |
| `sendInvoice` one-shot though externally irreversible (J1.8, J2.5) | ACCEPTED — two-step `confirmed` added; sendInvoice joins the destructive set |
| `recordPayment` mismatched-amount semantics undefined (J2.8) | ACCEPTED — amount must EQUAL the invoice amount exactly, else rejected |
| Notification log has no read tool (J2.2) | ACCEPTED via the judge's alternative — re-scoped as fire-and-forget (no log read); the honesty consequence ("past reminders cannot be verified") became a WORLD-MODEL rule, a billing behavior line + `// UNCHECKABLE` note, and eval case 15 |

**Round 2 (on the refined artifact): both judges DISSENT (narrow), all nine round-1 refinements
verified as applied; grounds 1/3/5/6 clean.** Converging round-2 findings and round-3 resolutions:

| finding (judge) | resolution |
|---|---|
| TaxDeadline has no correction path; duplicate triple undefined (J1.1, J2.2, J2.4) | ACCEPTED — `cancelTaxDeadline` added (two-step, ONLY while filing not_started; removal from the calendar); createTaxDeadline REJECTS a duplicate client+tax+period triple (world + description) |
| sendClientNotification description said "the message is logged", contradicting fire-and-forget; ungated though external (J1.2, J2.1) | ACCEPTED — description reworded (fire-and-forget, no read-back, never claim past reminders); single-step EXEMPTION rationale documented in BOTH tools.json and WORLD-MODEL.md (changes no financial records; full content visible in the call args; gating would over-gate the primary requested action) |
| reverseEntry `reason` should be required (audit parity with voidInvoice) (J1.3) | ACCEPTED — required[] gains `reason`; the world rejects a missing reason |
| listEntries rows should carry reversal linkage (J2.3 minor) | ACCEPTED — reversal entries carry `reverses:<id>`, reversed originals `reversedBy:<id>` |

Both judges signaled convergence on these items; G1 closed as VALID at round 3 (T=2 budget:
draft → round-1 refine → round-2 verdicts → round-3 converging fixes applied).

Final surface: **21 tools** (grew from the 18-tool draft under debate pressure: +updateClient,
+reverseEntry, +createTaxDeadline, +cancelTaxDeadline, −getFilingStatus merged). Destructive set
(6): reverseEntry, sendInvoice, recordPayment, voidInvoice, submitFiling, cancelTaxDeadline.
sendClientNotification = the documented single-step exemption.

## Stage G2 — generated subject

- `src/world/tools.ts` — TOOL_DEFS generated from tools.json (21 defs, regenerated after each
  G1 round).
- `src/world/world.ts` — `AccountingWorld` + `worldFactory(preset, seed)`. Purity: fixed
  `REFERENCE_NOW = '2026-07-01T09:00:00.000Z'`; all date logic is lexicographic ISO-string
  comparison; zero Date.now/new Date/Math.random anywhere under src/ or evals/. Probes are
  side-effect-free; `advanceTurn()` increments a counter only; results are `{success:boolean,…}`
  with `requiresConfirmation:true` on destructive probes; terminal tools handled in `exec`.
- `src/world/presets.ts` — 8 boundary presets (steady-books, fresh-client-no-regime, empty-books,
  unpaid-invoice-overdue, invoice-paid, overdue-tax-deadline, filing-prepared, filing-submitted).
- `npx looprun-eval check` — green (config + world seams validated, no LLM).

## Stage G3 — eval generation

22 cases + CASE_MAP in `evals/cases.ts`; domain RULES-only judge prompt in
`evals/judge-prompt.md`; per-case debate + dimension map + post-E2 UNCHECKABLE sweep in
`evals/EVALS.md`. **Debate: both judges ACCEPT all 22 in round 1 (consensus); 0 discarded.**
Independence: cases authored from tools.json + WORLD-MODEL + presets/world only — the specs did
not exist yet when the cases were written.

## Stage E1 — decomposition (human gate #1 table)

Clustered by TOOL-NEED (never intent); every end-to-end flow inside ONE agent
(create→send invoice; prepare→submit filing; record→reverse entry).

| agent | tools (n) | jobs | destructive | layer | cases |
|---|---|---|---|---|---|
| `client-books` | listClients, getClient, createClient, updateClient, setFiscalRegime, recordEntry, reverseEntry, listEntries, getAccountSummary (9) | onboarding, contacts, regimes, books, summaries | reverseEntry | Base | 01–08 (8) |
| `billing` | listClients, getClient, createInvoice, listInvoices, getInvoice, sendInvoice, recordPayment, voidInvoice, sendClientNotification (9) | invoices, payments, voids, reminders | sendInvoice, recordPayment, voidInvoice | Base | 09–15 (7) |
| `tax-filing` | listClients, getClient, listTaxDeadlines, createTaxDeadline, cancelTaxDeadline, prepareFiling, submitFiling, sendClientNotification (8) | compliance calendar (register/cancel), prepare/submit filings, deadline reminders | submitFiling, cancelTaxDeadline | Base | 16–22 (7) |

Shared read-only tools repeat across agents (listClients, getClient, sendClientNotification) —
allowed by the ≤15 law. **Pitfall guard (by design):** `setFiscalRegime` (the enabler of the tax
regime-gate) lives in `client-books`, NOT in `tax-filing` — the tax agent cannot satisfy its own
gate, and the gate's deny prose routes the USER to the client-records workflow.

**Theme summary (rides this gate):** locale English · voice = LedgerLine staff assistant,
professional/precise/plain, honest-to-a-fault · 7 core invariants (anti-fabrication first,
id discipline, two-step destructive protocol, append-only books, no-tax-advice boundary,
regime-is-user-knowledge, honesty-on-failure last) · personas: one role line per agent (above).

**Gate #1 approval:** simulated-user defaults per the run brief — table approved as derived;
free-text row ("any hard rule missing?") = "ok".

## Stage E2/E3 — drafted artifacts

- `src/agents/accounting/theme.ts` — ACCOUNTING_THEME (no persona key; stateBlock reads
  `projection()` defensively; deterministic exhaustionReply).
- `src/agents/accounting/{client-books,billing,tax-filing}-spec.ts` — AgentSpecBase each
  (destructive tools present on all three); per-agent persona field; conditioned behavior prose;
  agent-layer guards: billing `noVoidClosedInvoice` (run), tax `regimeOnRecord` +
  `filingMustBePrepared` (run); reply checks pendingConfirmMustAsk +
  destructiveClaimRequiresSuccess (domain claimRe + negation/reminder exemptRe) +
  noFalseFailureClaim; jargonScrub mutator. No `flow` edges by choice: the rendered Flow section
  is a hard ordering directive, and preset-borne drafts/prepared filings make "createInvoice
  before sendInvoice" / "prepareFiling before submitFiling" FALSE as conversation-order rules —
  the state gates carry the ordering instead.
- `// UNCHECKABLE` notes: 1 per spec (unknown-client contact details; past reminders; tax-advice
  boundary) — each has an eval case (06, 15, 22; see EVALS.md sweep).

## Stage N — adversarial review (5 reviewers + verifier, ≤2 rounds)

[PENDING — findings, verdicts, and resolutions recorded below when the reviewers report]

## Acceptance gates

[Recorded at the end of the run]

## Measured loop (Stage T) — iteration log

**Screen r0 (gemini-3.1-flash-lite-thinkoff, N=1): 21/22 through the invariant gate** (autofail: 08 —
the model INVENTED amount=400 from the unreadable "4??" and recorded the entry; the forbidden-call
gate caught it). Judge verdicts on the 21: see *.judged.json.

- **Iteration 1 — class 4 (unconditioned prose):** the garbled-recovery line existed but did not name
  the anti-pattern. Strengthened: "NEVER infer an amount, date or description from unreadable
  characters (e.g. \"4??\" is NOT an amount); if any required field of a write is uncertain, do not
  call the write at all; ask first." Re-screen: 08 PASS (trace listClients → askUser, one concrete
  question about the amount).

## Stage S — certification (human gate #2)

**N=3 vs gemini-3.1-flash-lite-thinkoff: 66/66 = 100% → CERTIFIED.** Zero invariant auto-fails; the
iteration-1 garbled-recovery fix held in all 3 reps. Known non-critical residual: 13-void-paid-invoice
`useful-next-step` (honest refusal, no next step offered) — non-gating in all reps.
Bundle: eval-results/2026-07-10-accounting-cert/.
