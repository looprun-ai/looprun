#!/usr/bin/env node
/**
 * Scaffold a GuardProof stub for one guard kind: positive / negative / neutral case slots (L1 verdicts
 * + an L3 loop slot), matching the REAL GuardProof type in packages/core/src/testing/proof.ts.
 *
 *   node skills/governance/scripts/scaffold-proof-cases.mjs <guardKind>            # print to stdout
 *   node skills/governance/scripts/scaffold-proof-cases.mjs <guardKind> --write    # append the stub
 *       # (as a comment block) to the matching catalog family file, ready to paste into its array
 *
 * See references/proof-case-authoring.md for how to fill the stub.
 */
import { existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const CORE_PROOFS = join(ROOT, 'packages', 'core', 'test', 'proofs');

// kind -> { hook, dim, auto?, family } (mirrors packages/core/GUARDS.md + the catalog split).
const FAMILY = {
  spatialInput: { file: 'catalog-spatial-input.ts', array: 'SPATIAL_INPUT_PROOFS' },
  runOutput: { file: 'catalog-run-output.ts', array: 'RUN_OUTPUT_PROOFS' },
  behavior: { file: 'catalog-behavior.ts', array: 'BEHAVIOR_PROOFS' },
};
const KINDS = {
  requiresBefore: { hook: 'preTool', dim: 'spatial', family: 'spatialInput' },
  forbidThisTurn: { hook: 'preTool', dim: 'spatial', family: 'spatialInput' },
  argRequired: { hook: 'preTool', dim: 'input', family: 'spatialInput' },
  argAbsent: { hook: 'preTool', dim: 'input', family: 'spatialInput' },
  argFormat: { hook: 'preTool', dim: 'input', family: 'spatialInput' },
  labelExists: { hook: 'preTool', dim: 'input', family: 'spatialInput' },
  labelProvenance: { hook: 'preTool', dim: 'input', family: 'spatialInput' },
  precondition: { hook: 'preTool', dim: 'run', family: 'runOutput' },
  maxCallsPerTurn: { hook: 'preTool', dim: 'run', family: 'runOutput' },
  maxCallsPerConversation: { hook: 'preTool', dim: 'run', family: 'runOutput' },
  noDuplicateCall: { hook: 'preTool', dim: 'run', auto: 'minimal', family: 'runOutput' },
  confirmFirst: { hook: 'preTool', dim: 'run', auto: 'base', family: 'runOutput' },
  noActAfterAskSameTurn: { hook: 'preTool', dim: 'run', family: 'runOutput' },
  destructiveThrottle: { hook: 'preTool', dim: 'run', auto: 'base', family: 'runOutput' },
  resultInvariant: { hook: 'postTool', dim: 'output', family: 'runOutput' },
  custom: { hook: 'preTool', dim: 'run', family: 'runOutput' },
  emptyReply: { hook: 'onReply', dim: 'behavior', auto: 'minimal', family: 'behavior' },
  noFabricatedSuccess: { hook: 'onReply', dim: 'behavior', family: 'behavior' },
  noFalseFailureClaim: { hook: 'onReply', dim: 'behavior', auto: 'minimal', family: 'behavior' },
  degenerationGuard: { hook: 'onReply', dim: 'behavior', auto: 'minimal', family: 'behavior' },
  destructiveClaimRequiresSuccess: { hook: 'onReply', dim: 'behavior', family: 'behavior' },
  pendingConfirmMustAsk: { hook: 'onReply', dim: 'behavior', family: 'behavior' },
  replyMustMention: { hook: 'onReply', dim: 'behavior', skip: true, family: 'behavior' },
  replyConfirmsLabels: { hook: 'onReply', dim: 'behavior', skip: true, family: 'behavior' },
  replyMaxOccurrences: { hook: 'onReply', dim: 'behavior', skip: true, family: 'behavior' },
  replySingleQuestion: { hook: 'onReply', dim: 'behavior', skip: true, family: 'behavior' },
  replyNoProductionClaim: { hook: 'onReply', dim: 'behavior', family: 'behavior' },
};

/** The signal tag the L3 loop surfaces for a NEGATIVE case at this hook. */
function signalHint(kind, meta) {
  if (meta.hook === 'preTool') return `expect: 'veto', tool: '<tool>'  // tag: ${meta.dim}:${kind}:<tool>`;
  if (meta.hook === 'postTool') return `expect: 'redrive', tool: '<tool>'  // tag: output:${kind}:<tool> (+ redrive)`;
  if (meta.hook === 'onReply') return `expect: 'redrive'  // tag: redrive:${kind}; correction step = a plain { text } part`;
  return `expect: 'refusal'  // tag: onInput:${kind} (turn tripwired, no tool calls)`;
}

function stub(kind, meta) {
  const autoLines = meta.auto
    ? `    auto: '${meta.auto}',  // constructor-installed — the spec builders rely on the AUTO instance\n` +
      (meta.auto === 'base'
        ? `    specTweaks: { destructiveTools: ['deleteItem', 'purgeAll'], confirmMechanism: { purgeAll: 'prior-ask' }, lexicon: { confirmAskRe: FIXTURE_LEXICON.confirmAskRe } },\n`
        : kind === 'noFalseFailureClaim'
          ? `    specTweaks: { lexicon: { falseFailureClaimRe: FIXTURE_LEXICON.falseFailureClaimRe } },\n`
          : '')
    : '';
  const skipLine = meta.skip
    ? `    collective: 'skip',  // content-contract reply guard — proven isolated only (see catalog.ts)\n`
    : '';
  return `  // --- GuardProof: ${kind} (${meta.hook} · dim ${meta.dim}) — fill against packages/core/GUARDS.md ---
  {
    guard: '${kind}',
    make: () => ${kind}(/* install params — use the collective-ruleset params from catalog.ts */),
    hook: '${meta.hook}',
    target: ${meta.hook === 'onReply' ? `'any'` : `['<tool>']`},
${autoLines}${skipLine}    cases: [
      {
        name: '<the compliant flow>',
        polarity: 'positive',
        ctx: { /* Partial<GuardCtx> where check() returns null */ },
        l1: 'silent',
        l3: {
          preset: 'seeded-media',
          turns: [{ userText: '<user ask>' }],
          script: [
            // steps of {tool,args} parts, ending with a NON-empty replyToUser
          ],
          expect: 'pass',
        },
      },
      {
        name: '<the violation>',
        polarity: 'negative',
        ctx: { /* Partial<GuardCtx> where check() returns the correction */ },
        l1: 'fires',
        l3: {
          preset: 'seeded-media',
          turns: [{ userText: '<user ask>' }],
          script: [
            // the violating step, then the recovery/terminal step(s)
          ],
          ${signalHint(kind, meta)}
          // alsoFires: ['<kind>'],  // only for a DECLARED legitimate co-fire in the collective run
        },
      },
      {
        name: '<the look-alike that must be left alone>',
        polarity: 'neutral',
        ctx: { /* the near-miss ctx */ },
        l1: 'silent',
      },
    ],
  },`;
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const kind = args.find((a) => !a.startsWith('--'));

  if (!kind) {
    console.error('usage: node skills/governance/scripts/scaffold-proof-cases.mjs <guardKind> [--write]');
    console.error('kinds: ' + Object.keys(KINDS).join(', '));
    console.error('(a NEW kind not listed here: pick the family by dim and follow the same stub shape)');
    process.exit(1);
  }
  const meta = KINDS[kind] ?? { hook: 'preTool', dim: 'run', family: 'runOutput', unknown: true };
  const family = FAMILY[meta.family];
  const text = stub(kind, meta);
  const where = `packages/core/test/proofs/${family.file} — paste INSIDE the ${family.array} array`;

  if (meta.unknown) {
    console.error(`scaffold: "${kind}" is not a known kind — emitting a generic preTool stub; adjust hook/dim/family yourself.`);
  }

  if (!write) {
    process.stdout.write(text + '\n');
    process.stdout.write(`\n// Target: ${where}.\n// Types: import type { GuardProof } from '@looprun-ai/core/testing'. See references/proof-case-authoring.md.\n`);
    return;
  }

  const target = join(CORE_PROOFS, family.file);
  if (!existsSync(target)) {
    console.error(`scaffold --write: ${target.replace(ROOT + '/', '')} does not exist.`);
    process.stdout.write('\n' + text + '\n');
    process.exit(1);
  }
  appendFileSync(
    target,
    `\n/* SCAFFOLD (${kind}) — move this entry INSIDE the ${family.array} array, fill it, then delete this comment:\n${text}\n*/\n`,
  );
  console.log(`scaffold: appended a commented ${kind} stub to ${family.file}. Move it into ${family.array}, fill it, then \`pnpm proofs:run\`.`);
}

main();
