# Home services — a looprun example seed

This directory is a SEED, not a generated bundle. It holds what the `agentspec` skill needs to
generate the agents, their deterministic world and their eval set — nothing that the skill would
produce itself.

## Purpose sentence

> Assistant for a home-services company (cleaning, plumbing, electrical repairs): manage service requests, quotes, job scheduling, technicians and customer notifications.

## What it generates

2 agents: `intake-quoting`, `scheduling`.

The tool surface this domain was generated against is in [`tools.json`](tools.json) — pass it to
the skill to regenerate the same agents against the same tools.
