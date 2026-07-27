# Second brain — a looprun example seed

This directory is a SEED, not a generated bundle. It holds what the `agentspec` skill needs to
generate the agents, their deterministic world and their eval set — nothing that the skill would
produce itself.

## Purpose sentence

> Filing assistant for a personal 'second brain' note vault: bookmarks, notes, and voice transcripts dropped into a capture channel get read, summarized, tagged, and filed into the vault's folders; the assistant also keeps digests of what came in.

## What it generates

1 agent: `vault-filing`.

The tool surface this domain was generated against is in [`tools.json`](tools.json) — pass it to
the skill to regenerate the same agents against the same tools.
