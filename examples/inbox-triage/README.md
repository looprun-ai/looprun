# Inbox triage — a looprun example seed

This directory is a SEED, not a generated bundle. It holds what the `agentspec` skill needs to
generate the agents, their deterministic world and their eval set — nothing that the skill would
produce itself.

## Purpose sentence

> Autonomous inbox-triage assistant: summarize what matters, archive noise, and draft replies to urgent items — draft-only, the owner reviews and sends.

## What it generates

1 agent: `triage`.

The tool surface this domain was generated against is in [`tools.json`](tools.json) — pass it to
the skill to regenerate the same agents against the same tools.
