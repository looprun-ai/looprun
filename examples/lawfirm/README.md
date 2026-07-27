# Law firm — a looprun example seed

This directory is a SEED, not a generated bundle. It holds what the `agentspec` skill needs to
generate the agents, their deterministic world and their eval set — nothing that the skill would
produce itself.

## Purpose sentence

> Assistant for a small law firm: manage clients, legal matters, documents, court/filing deadlines and billable time entries.

## What it generates

2 agents: `client-matters`, `docket-documents`.

The tool surface this domain was generated against is in [`tools.json`](tools.json) — pass it to
the skill to regenerate the same agents against the same tools.
