#!/usr/bin/env node
/**
 * GENERATE the catalog half of `docs/tutorial/04-guards.md` from `GUARD_CATALOG`.
 *
 * The chapter is half hand-written and half generated. Everything OUTSIDE the two markers
 * (the vocabulary section, the `canonArgs` prose, the custom-guard authoring section, the recap)
 * is the author's and is copied through untouched; everything BETWEEN them is rendered from the
 * catalog data and must never be edited by hand.
 *
 *   node scripts/gen-guards-chapter.mjs            write the generated region
 *   node scripts/gen-guards-chapter.mjs --check    exit 1 if the file on disk differs (drift gate)
 *
 * BUILD DEPENDENCY: `GUARD_CATALOG` is read from the BUILT package
 * (`packages/core/dist/internal.js` — it ships on `@looprun-ai/core/internal`, outline §6 decision 4),
 * so `pnpm -r build` — or at least `pnpm -C packages/core build` — must have run first. Reading the
 * built artifact rather than the TypeScript source is deliberate: the chapter documents what the
 * package actually ships.
 *
 * Rendering law: `summary` and `whenToUse` are emitted VERBATIM and `example` is fenced verbatim.
 * The generator never paraphrases catalog prose — a wording fix belongs in `src/guards/catalog.ts`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const CHAPTER = join(REPO, 'docs', 'tutorial', '04-guards.md');
const CORE_DIST = join(REPO, 'packages', 'core', 'dist', 'internal.js');

const START = '<!-- BEGIN GENERATED: guard catalog — `node scripts/gen-guards-chapter.mjs` -->';
const END = '<!-- END GENERATED: guard catalog -->';

/** The phase sections, in turn order. `custom` is pulled out of its hook into its own group: its hook
 *  follows the `dim` the author passes, so it belongs to no single phase (outline §3's group table). */
const SECTIONS = [
  {
    hook: 'preTool',
    title: '`preTool` — before the call runs',
    blurb:
      'A call has been proposed and not yet executed. A deny returns to the model AS the tool result, in the governance envelope, and the model retries inside the same generation — so the correction text is written as an instruction. Nothing has happened to the world yet, which is why every gate that must PREVENT something lives here.',
  },
  {
    hook: 'postTool',
    title: '`postTool` — the call has run',
    blurb:
      'The only hook that sees `ctx.result`. It cannot veto anything — the effect already happened — so its job is to stop the RESULT from being reported as something it was not: a violation here joins the reply redrive set.',
  },
  {
    hook: 'onReply',
    title: '`onReply` — the reply exists, and has not been sent',
    blurb:
      'The reply text is in `ctx.reply` and no tool can run any more. A deny costs a bounded no-tools re-generation and, if that still violates, the deterministic honest closure — so these kinds are written to fire on what was ASSERTED, never on what was merely mentioned.',
  },
  {
    hook: 'onReplyMutate',
    title: '`onReplyMutate` — rewrite the reply, never veto it',
    blurb:
      'A `ReplyMutator`, not a `Guard`: it is applied to the reply before the `onReply` checks run and it has no pass/fail. Bind it with `spec.addMutator(...)`, not `addGuard`.',
  },
];

const ESCAPE_HATCH = {
  title: 'The escape hatch — when no kind fits',
  blurb:
    'One factory, and it is the only one whose hook you choose: `custom` follows the `dim` you pass it (`spatial`/`input`/`run` → the tool hooks, `output` → `postTool`, `behavior` → `onReply`), which is why it is listed apart from the phase sections rather than under one of them. Section 6 walks through writing one.',
};

async function loadCatalog() {
  try {
    const mod = await import(pathToFileURL(CORE_DIST).href);
    return mod.GUARD_CATALOG;
  } catch (cause) {
    throw new Error(
      `cannot read GUARD_CATALOG from ${relative(REPO, CORE_DIST)} — build the package first ` +
        `(\`pnpm -C packages/core build\`).\n  cause: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

const slug = (name) => name.toLowerCase();

function renderEntry(entry, index) {
  return [
    `#### ${index}. \`${entry.name}\``,
    '',
    entry.summary,
    '',
    `**When to reach for it.** ${entry.whenToUse}`,
    '',
    '```ts',
    entry.example,
    '```',
    '',
  ].join('\n');
}

function renderSection(heading, blurb, entries, numberFrom) {
  const rows = entries
    .map((e, i) => `| [\`${e.name}\`](#${numberFrom + i}-${slug(e.name)}) | \`${e.category}.ts\` | ${e.summary} |`)
    .join('\n');
  return [
    `### ${heading}`,
    '',
    blurb,
    '',
    '| factory | file | what it enforces |',
    '|---|---|---|',
    rows,
    '',
    ...entries.map((e, i) => renderEntry(e, numberFrom + i)),
  ].join('\n');
}

function render(catalog) {
  const custom = catalog.filter((e) => e.category === 'custom');
  const byHook = (hook) => catalog.filter((e) => e.hook === hook && e.category !== 'custom');

  const counts = SECTIONS.map((s) => `${byHook(s.hook).length} ${s.hook}`).join(' · ');
  const parts = [
    '<!-- Rendered from `packages/core/src/guards/catalog.ts`. Do NOT edit between the markers: run',
    '     `pnpm docs:guards` (it needs a built core), and fix wording in the catalog itself. -->',
    '',
    `## 5. The catalog — ${catalog.length} factories`,
    '',
    `Grouped by the hook each one is installed on, because the hook decides what a rule can see and`,
    `therefore what it can enforce (chapter 03 §8). ${counts} · 1 escape hatch.`,
    '',
  ];

  let n = 1;
  for (const section of SECTIONS) {
    const entries = byHook(section.hook);
    parts.push(renderSection(section.title, section.blurb, entries, n));
    n += entries.length;
  }
  parts.push(renderSection(ESCAPE_HATCH.title, ESCAPE_HATCH.blurb, custom, n));

  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function splice(file, generated) {
  const startAt = file.indexOf(START);
  const endAt = file.indexOf(END);
  if (startAt === -1 || endAt === -1 || endAt < startAt) {
    throw new Error(`${relative(REPO, CHAPTER)} is missing the generated-region markers:\n  ${START}\n  ${END}`);
  }
  return `${file.slice(0, startAt + START.length)}\n\n${generated}\n\n${file.slice(endAt)}`;
}

const check = process.argv.includes('--check');
const catalog = await loadCatalog();
const onDisk = readFileSync(CHAPTER, 'utf8');
const next = splice(onDisk, render(catalog));

if (next === onDisk) {
  console.log(`docs:guards · ${relative(REPO, CHAPTER)} is up to date (${catalog.length} catalog rows).`);
  process.exit(0);
}
if (check) {
  console.error(
    `docs:guards · DRIFT — ${relative(REPO, CHAPTER)} does not match GUARD_CATALOG.\n` +
      'Run `pnpm -r build && pnpm docs:guards` and commit the result.',
  );
  process.exit(1);
}
writeFileSync(CHAPTER, next);
console.log(`docs:guards · wrote ${relative(REPO, CHAPTER)} (${catalog.length} catalog rows).`);
