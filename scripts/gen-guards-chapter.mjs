#!/usr/bin/env node
/**
 * GENERATE, from `GUARD_CATALOG`, the two artifacts that must stay in lockstep with it:
 *
 *   1. the catalog half of `docs/tutorial/04-guards.md` — the chapter is half hand-written and half
 *      generated. Everything OUTSIDE the two markers (the vocabulary section, the `canonArgs` prose,
 *      the custom-guard authoring section, the recap) is the author's and is copied through
 *      untouched; everything BETWEEN them is rendered here and must never be edited by hand.
 *   2. `docs/tutorial/snippets/04-guards-examples.generated.ts` — every catalog `example`, compiled.
 *      The chapter fences those strings verbatim, so this module is what makes "the examples in this
 *      chapter typecheck" a fact: `pnpm -C docs/tutorial/snippets typecheck` compiles all 30 against
 *      the published `looprun` facade. Committed and drift-checked exactly like the chapter.
 *
 *   node scripts/gen-guards-chapter.mjs            write both
 *   node scripts/gen-guards-chapter.mjs --check    exit 1 if either differs (drift gate)
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
const EXAMPLES = join(REPO, 'docs', 'tutorial', 'snippets', '04-guards-examples.generated.ts');
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

/** THE CONSENT STORY — one section, rendered into the chapter's preamble. Consent is a literal the
 *  ENGINE writes onto the user's screen and the USER writes back; the agent writes no part of it. */
const CONSENT_STORY = [
  "### The consent story — a token the engine issues and the user types back",
  '',
  "Ask-before-you-act is not a thing your agent declares. It is a literal the ENGINE writes onto the user's",
  'screen and the USER writes back:',
  '',
  '```',
  '   ①  the world raises it   your tool answers requiresConfirmation and NAMES its record',
  '   ②  or the denial does    a tool with no simulate form is denied, and the denial raises the question',
  '                            from the label your spec declared',
  '   ③  the engine renders    the question lands in the delivered text, between the agent prose and the',
  '                            operation record',
  '   ④  the user answers      their next message either carries the token or does not',
  '   ⑤  confirmFirst allows   the act runs iff a consumed question is about THIS call',
  '```',
  '',
  'The whole turn:',
  '',
  '```',
  "turn 1   agent:   cancelBooking({ id: 'BK-1' })",
  "         world:   { requiresConfirmation: true, id: 'BK-1' }",
  '         screen:  Your booking BK-1 carries an 80.00 fee.',
  '',
  '                  To confirm BK-1, reply: CONFIRM BK-1',
  '',
  '                  No operation was carried out on this turn.',
  '',
  'turn 2   user:    "yes, CONFIRM BK-1"',
  "         agent:   cancelBooking({ id: 'BK-1', confirmed: true })   → allowed",
  '```',
  '',
  '`"go ahead"` is a human yes and is **denied** — the question is simply asked again. That is deliberate:',
  'consent fails closed, because the alternative is a model deciding what a person meant.',
  '',
  '**What you owe the engine.** A two-step tool returns `requiresConfirmation` and names its record under',
  'an identity key. A tool that acts on no identifiable record declares `destructiveLabels` — the words the',
  'question is built from — and without one it can raise no question, so it never runs. A conversation in',
  'another language declares `engineText`, because the user has to be able to READ the instruction they are',
  'being asked to type back.',
  '',
  '**`valueFromUser` is the sibling, one moment earlier.** Consent is about an ACT; `valueFromUser` is about',
  'a VALUE your agent fills in on the user\'s behalf. It allows only what the person actually said, compared',
  'as whole words — so an invented value is denied, and so is a paraphrase of a real one.',
  '',
].join('\n');

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
    'A fourth hook exists and has no section here: `onInput` fires before the model runs, and §1\'s',
    'matrix makes it legal for every `spatial`/`input`/`run` guard — but no shipped kind is installed',
    'there, because a rule that can refuse the whole turn before a call is even proposed is a domain',
    'decision, not a default. `custom` is how you reach it.',
    '',
    CONSENT_STORY,
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

/**
 * Every catalog `example`, as one compiled module. Each entry is an expression over the public
 * contract plus its own factory (the parity test asserts that), so the whole set collects into one
 * array of `Guard | ReplyMutator` — no per-row type annotation, and no runtime behaviour: the module
 * exists to be TYPECHECKED.
 */
function renderExamples(catalog) {
  const names = catalog.map((e) => e.name).sort();
  const widest = Math.max(...catalog.map((e) => e.name.length));
  return [
    '/**',
    ' * GENERATED — do not edit. `pnpm docs:guards` renders this from `GUARD_CATALOG`',
    ' * (`packages/core/src/guards/catalog.ts`); `--check` fails on drift.',
    ' *',
    ' * WHY IT EXISTS: chapter 04 §5 fences every one of these strings verbatim. Compiling them here',
    ' * is what makes the chapter\'s claim true — a catalog example that does not typecheck against the',
    ' * published `looprun` facade fails `pnpm -C docs/tutorial/snippets typecheck`, and therefore CI.',
    ' *',
    ' * Nothing imports this module. It is a compile-time assertion, not a runtime artifact.',
    ' */',
    `import {\n${names.map((n) => `  ${n},`).join('\n')}\n} from 'looprun';`,
    "import type { Guard, ReplyMutator } from 'looprun';",
    '',
    `/** The ${catalog.length} examples of chapter 04 §5, in catalog order. */`,
    'export const CATALOG_EXAMPLES: ReadonlyArray<Guard | ReplyMutator> = [',
    ...catalog.map((e) => `  /* ${e.name.padEnd(widest)} */ ${e.example},`),
    '];',
    '',
  ].join('\n');
}

const check = process.argv.includes('--check');
const catalog = await loadCatalog();

const artifacts = [
  { path: CHAPTER, next: splice(readFileSync(CHAPTER, 'utf8'), render(catalog)) },
  { path: EXAMPLES, next: renderExamples(catalog) },
];

let wrote = 0;
for (const { path, next } of artifacts) {
  const onDisk = readFileSync(path, 'utf8');
  if (next === onDisk) continue;
  if (check) {
    console.error(
      `docs:guards · DRIFT — ${relative(REPO, path)} does not match GUARD_CATALOG.\n` +
        'Run `pnpm -r build && pnpm docs:guards` and commit the result.',
    );
    process.exit(1);
  }
  writeFileSync(path, next);
  console.log(`docs:guards · wrote ${relative(REPO, path)}.`);
  wrote += 1;
}
if (wrote === 0) console.log(`docs:guards · both artifacts are up to date (${catalog.length} catalog rows).`);
