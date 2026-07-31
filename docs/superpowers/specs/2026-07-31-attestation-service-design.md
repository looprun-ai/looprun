# Attestation service — design

Third-party certification layer on top of the local SHIP seal. Free at launch: the service
exists to gather the telemetry that drives looprun's quality engineering.

## Two layers, not a replacement

```
┌─ LAYER 1: seal.json (unchanged) ───────────────────────────────┐
│  artifactHash = integrity · offline · self-service             │
│  LoopRunAgent sealed execution verifies THIS — zero network    │
└────────────────────────────────────────────────────────────────┘
                            ▲ service signs over the artifactHash
┌─ LAYER 2: ship/attestation.json (NEW, optional) ───────────────┐
│  ed25519 signature by the looprun service over the seal        │
│  · verifiable OFFLINE with the published public key            │
│  · public page looprun.ai/c/<id> (badge / confirmation)        │
│  · absence breaks nothing — an upgrade, never a requirement    │
└────────────────────────────────────────────────────────────────┘
```

Open-source posture: layer 1 stays fully functional without the service (no phone-home,
air-gapped runs untouched). The attestation format and its verification are open protocol;
only the service is a product.

## Decisions (settled in brainstorm 2026-07-30/31)

| decision | choice |
|---|---|
| What the service verifies before signing | **Ladder (D)**: launch = stamp + register (existence + date); paid tiers later verify the evidence package (B) or re-run the cert (C) |
| Submitter identity | **Light account (B)**: GitHub OAuth or e-mail; attestation names the registrant |
| Payload | **Structured telemetry, mandatory** for free attestation; **transcripts opt-in** (incentivized — e.g. "full evidence" badge) |
| Privacy claim | "No artifact content, prompt, transcript or business string leaves your machine — only public engine vocabulary, numbers and hashes." Client-authored identifiers (case slugs, custom-guard names, agent names) are **hashed** before upload; payload is inspectable before sending |
| Crypto | **Ed25519 in-house (approach A)** + two sigstore borrows: `kid` (key id) in every attestation from day 1, and a public append-only transparency log of attested hashes. Migration to sigstore later changes only the stamp, not the product |
| Business | Free at launch (data is the payment); ladder tiers are the future paid product |

## Telemetry payload (the reason the service is free)

Mandatory with every attestation request:

- `seal.json` content (targets: model/rate/reps, bar) + engine version
- Structural counts: agents / tools / cases / guards
- Per-case verdict: pass/fail/exhausted + fail class + firing guard (case id HASHED)
- Guard-fire census for the whole run (fires per guard, mute guards)
- Margin/probe outcomes (oscillating cases, rounds)
- Serving config: model, quant, RAM tier, spec ON/off, measured tok/s

What it answers: dominant fail classes per model/version/tier; guard hygiene census;
exhaustion correlations; engine-version regressions. What it cannot answer (needs text):
whether a guard fired WRONGLY, why a specific reply failed — covered by opt-in transcripts
or a targeted follow-up request.

## Attestation format

`ship/attestation.json`:

```json
{
  "id": "att_<ulid>",
  "artifactHash": "<sha256 from seal.json>",
  "sealSha256": "<sha256 of seal.json bytes>",
  "registrant": "github:someuser",
  "attestedAt": "2026-07-31T12:00:00Z",
  "tier": "registered",            // ladder: registered | evidence-verified | service-run
  "kid": "looprun-attest-2026a",
  "sig": "<ed25519 over the canonical JSON of all fields above>"
}
```

Offline verification: fetch (or bundle) the public key for `kid`, `crypto.verify` the
canonical payload — Node built-ins, zero dependencies. Online confirmation: `looprun.ai/c/<id>`.

## Components

| unit | responsibility |
|---|---|
| `@looprun-ai/eval` `attest` command | Build telemetry payload (hash client-authored ids), show it for inspection, POST, write `ship/attestation.json`, verify locally |
| `@looprun-ai/eval` `verify` (extended) | Layer 1 (hash) as today; layer 2 optional: signature check with bundled/published keys |
| Attestation service (new, separate repo) | HTTP API: OAuth, validate seal consistency, sign (key in KMS), persist, append to transparency log, serve `/c/<id>` |
| Transparency log | Public append-only list of `(attestedAt, artifactHash, id)` |

Runtime impact: **none**. Sealed execution keeps verifying the hash only; attestation
verification is opt-in policy, never a network call at startup.

## Error handling (protocol level)

- Service must refuse: seal.json inconsistent with declared artifactHash fields, malformed
  telemetry, replayed submission of an identical (registrant, artifactHash) → return the
  existing attestation instead of minting a duplicate.
- Verification is VOID-never-restamped, same law as the seal: any mismatch = invalid, no
  auto-repair.

## Testing (when built)

- Golden attestation fixture: sign with a test key, verify offline; tamper each field →
  verification fails.
- Payload builder: plant a client-authored slug → assert it never appears in cleartext.
- Replay: same submission twice → same attestation id.

## Next steps

Deliberately NOT planned yet — tracked in `BACKLOG.md` ("Attestation service"). No
implementation before those entries are prioritized.
