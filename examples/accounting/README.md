# Accounting firm — a looprun example seed

This directory is a SEED, not a generated bundle. It holds what the `agentspec` skill needs to
generate the agents, their deterministic world and their eval set — nothing that the skill would
produce itself.

## Purpose sentence

> Assistant for a small accounting firm: manage clients, bookkeeping entries (income/expenses), invoices and payments, and tax-filing deadlines.

## What it generates

3 agents: `client-books`, `billing`, `tax-filing`.

The tool surface this domain was generated against is in [`tools.json`](tools.json) — pass it to
the skill to regenerate the same agents against the same tools.
