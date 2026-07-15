/**
 * @looprun-ai/core `/testing` — the framework-free half of the shippable, domain-NEUTRAL testing kit.
 *
 * A deterministic fixture world + generic tool defs / theme / lexicon, and the declarative proof format
 * with the L1 (isolated check) runner plus the isolated / collective spec builders. Nothing here carries
 * business vocabulary or a framework dependency. The full-loop runners (which drive a real conversation)
 * live in the backend package's `/testing` entry (@looprun-ai/mastra).
 */
export * from './fixture-world.js';
export * from './proof.js';
