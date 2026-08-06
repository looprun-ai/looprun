/**
 * The declarative PROOF format + the framework-free runners for the @looprun-ai/core testing kit.
 *
 * A {@link GuardProof} states, for ONE guard kind, the L1 (deterministic check in isolation) and optional
 * L3 (full loop) obligations across positive/negative/neutral cases. This file holds only the pieces that
 * need NO framework backend: the proof TYPES, the collective non-interference whitelist, the L1 runner,
 * and the spec builders (isolated / collective) over the fixture surface. The full-loop runners
 * (runProofLoop / expectedSignal / pickRecord / assertSignal) live in the backend package, since they
 * drive a real conversation.
 */
import { AgentSpecBase } from '../spec.js';
import type { AgentSpecConfig, Hook, ToolTarget } from '../spec.js';
import type { Guard, GuardCtx, Judge } from '../rules.js';
import { FixtureWorld, FIXTURE_TOOL_NAMES, FIXTURE_DOMAIN } from './fixture-world.js';
import type { FixturePreset } from './fixture-world.js';

export type ProofPolarity = 'positive' | 'negative' | 'neutral';
export type ProofExpect = 'veto' | 'downgrade' | 'redrive' | 'rewrite' | 'refusal' | 'pass';
export type PartialGuardCtx = Partial<GuardCtx>;

/** One conversation turn's input (structural — the backend's TurnInput shape). */
type ProofTurn = { userText: string; attachments?: string[] };
/** One scripted LLM response (structural — the fake model's ScriptStep shape). */
type ScriptStep = Array<{ tool: string; args: Record<string, unknown> } | { text: string }>;

export interface ProofLoopCase {
  preset: FixturePreset;
  turns: ProofTurn[];
  script: ScriptStep[];
  expect: ProofExpect;
  tool?: string;
  /** Which turnRecord to assert on (default: the last). */
  turn?: number;
  /** Guard kinds that LEGITIMATELY co-fire on this scenario in the COLLECTIVE run (two guards genuinely
   *  binding the same violation — e.g. a destructive claim that is also a pending, un-relayed
   *  confirmation). Added to that case's non-interference whitelist; keep it minimal and justified. */
  alsoFires?: string[];
  /** A judge to register for this loop case — ONLY for the `llmCheck` proof, whose guard delegates its
   *  verdict to it. Threaded into runSpecConversation deps by `runProofLoop`; every other proof leaves
   *  it undefined (deterministic guards ignore it). */
  judge?: Judge;
}

export interface ProofCase {
  name: string;
  polarity: ProofPolarity;
  ctx?: PartialGuardCtx;
  l1: 'fires' | 'silent';
  l3?: ProofLoopCase;
}

export interface GuardProof {
  /** MUST equal the guards.ts kind (the ratchet key). */
  guard: string;
  /** Instantiate the guard. Always required in practice (the runners throw without it); `auto` only
   *  controls whether buildIsolatedSpec/buildCollectiveSpec ADD it (an auto-installed kind is already on
   *  the spec via AgentSpecBase). */
  make?: () => Guard;
  hook: Hook;
  target: ToolTarget;
  /** Rely on AgentSpecBase auto-install (minimal/base layer) instead of addGuard. */
  auto?: 'minimal' | 'base';
  /** Spec config to merge (e.g. destructiveTools / destructiveLabels / lexicon for auto kinds). */
  specTweaks?: Partial<AgentSpecConfig>;
  /** 'skip' excludes this guard from the collective super-agent. Reserved for config-bound content-contract
   *  guards (e.g. mustAccountFor / claimIsGrounded / claimIsComplete, which need a per-agent `did`
   *  contract): an author binds those to ONE agent's specific contract — installing them agent-wide over
   *  arbitrary scenarios would fire on every unrelated turn by construction, which is a category error, not
   *  an interference finding. They are still fully proven isolated (L1 + L3). */
  collective?: 'include' | 'skip';
  cases: ProofCase[];
}

/** The collective non-interference whitelist — the kinds AgentSpecBase auto-installs. */
export const AUTO_LAYER_KINDS = [
  'noDuplicateCall',
  'degenerationGuard',
  'confirmFirst',
  'destructiveThrottle',
] as const;

/** Fill a GuardCtx from a partial: empty args, a fresh FixtureWorld('seeded-media') unless a world is
 *  given, empty observed, turnIndex 0. */
export function craftCtx(partial: PartialGuardCtx = {}): GuardCtx {
  return {
    args: {},
    world: new FixtureWorld('seeded-media'),
    observed: [],
    turnIndex: 0,
    userText: '',
    history: [],
    ...partial,
  };
}

/** Instantiate a proof's guard, or throw when `make` is absent (the runners require it). */
export function requireMake(proof: GuardProof): () => Guard {
  if (!proof.make) throw new Error(`GuardProof "${proof.guard}": make() is required to instantiate the guard.`);
  return proof.make;
}

/** L1 — run the guard's deterministic check in isolation against a crafted ctx. */
export async function runL1(proof: GuardProof, c: ProofCase): Promise<{ fired: boolean; reason: string | null }> {
  const guard = requireMake(proof)();
  const reason = await guard.check(craftCtx(c.ctx));
  return { fired: reason != null, reason: reason ?? null };
}

/** Build a spec that isolates ONE proof's guard over the fixture surface. */
export function buildIsolatedSpec(proof: GuardProof): AgentSpecBase {
  const cfg: AgentSpecConfig = {
    id: `proof-${proof.guard}`,
    mode: 'PROOF',
    persona: 'You are the proof agent.',
    tools: [...FIXTURE_TOOL_NAMES],
    contract: FIXTURE_DOMAIN,
    ...(proof.specTweaks ?? {}),
  };
  const spec = new AgentSpecBase(cfg);
  if (!proof.auto) {
    spec.addGuard(proof.hook, proof.target, requireMake(proof)(), { id: `agent:${proof.guard}` });
  }
  return spec;
}

/** Build ONE spec with EVERY non-auto proof guard installed — the collective non-interference harness.
 *  Auto kinds ride AgentSpecBase (destructiveTools + destructiveLabels). Duplicate kinds
 *  at different targets are fine; ids are made unique by suffixing `#2`, `#3`, … */
export function buildCollectiveSpec(proofs: GuardProof[]): AgentSpecBase {
  const spec = new AgentSpecBase({
    id: 'proof-collective',
    mode: 'PROOF',
    persona: 'You are the proof agent.',
    tools: [...FIXTURE_TOOL_NAMES],
    contract: FIXTURE_DOMAIN,
    destructiveTools: ['deleteItem', 'purgeAll'],
    // purgeAll acts on no identifiable record, so its consent question is built from this label.
    destructiveLabels: { purgeAll: 'delete every item' },
  });
  const used = new Set<string>();
  for (const proof of proofs) {
    if (proof.auto || proof.collective === 'skip') continue;
    let id = `agent:${proof.guard}`;
    let n = 1;
    while (used.has(id)) {
      n += 1;
      id = `agent:${proof.guard}#${n}`;
    }
    used.add(id);
    spec.addGuard(proof.hook, proof.target, requireMake(proof)(), { id });
  }
  return spec;
}
