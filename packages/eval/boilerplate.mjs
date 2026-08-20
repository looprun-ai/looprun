/** Repeated wording across a compiled prompt, found by the longest shared runs of text rather
 *  than by shared rare words. Boilerplate is invisible to a rare-word pairing precisely because
 *  it is everywhere: "read the member record, state the role it carries" appears in five rules,
 *  so every one of its words is common vocabulary and no pair scores. A run of characters, in
 *  contrast, gets MORE damning the more lines carry it.
 *
 *  Usage: node boilerplate.mjs <subject-dir> [minRun]
 *  Prints each repeated run, the bytes it costs across every card it is stamped on, and the
 *  rules that carry it. The top row is the cheapest wording to write once. */
import { AgentFactory, factsFromWorld, PromptWriter } from '@looprun-ai/core';

const MIN_RUN = Number(process.argv[3] ?? 40);
const dir = process.argv[2];
if (dir === undefined) throw new Error('usage: node boilerplate.mjs <subject-dir> [minRun]');

const { contract, specs, subjectWorld } = await import(`${dir}/subject.ts`);
const facts = factsFromWorld(subjectWorld);

/** Every authored sentence the model reads, with the act cards it is stamped on. A contract
 *  rule counts once per act it names in a lane, because that is how many times it is sent. */
const lines = new Map();
for (const spec of Object.values(specs)) {
  const compiled = new AgentFactory().governed(spec, contract, facts);
  for (const line of new PromptWriter(compiled).system().split('\n')) {
    if (line.trim().length > 0) bump(lines, line.trim(), `system/${spec.name}`);
  }
  for (const guard of compiled.guards) {
    if (guard.home !== 'contract') continue;
    for (const tool of guard.tools) {
      if (facts.tools[tool] !== undefined) bump(lines, guard.rule, `${guard.name}@${tool}`);
    }
  }
}

function bump(map, text, where) {
  const held = map.get(text);
  if (held === undefined) map.set(text, { copies: 1, where: [where] });
  else { held.copies += 1; held.where.push(where); }
}

/** The longest run two texts share, by extending every matching start. Quadratic in the pair,
 *  which is fine: a subject has hundreds of rules, not millions. */
function longestShared(a, b) {
  let best = '';
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      let n = 0;
      while (i + n < a.length && j + n < b.length && a[i + n] === b[j + n]) n += 1;
      if (n > best.length) best = a.slice(i, i + n);
    }
  }
  return best;
}

const texts = [...lines.keys()];
const runs = new Map();
for (let i = 0; i < texts.length; i += 1)
  for (let j = i + 1; j < texts.length; j += 1) {
    const run = longestShared(texts[i], texts[j]);
    if (run.trim().length < MIN_RUN) continue;
    const key = run.trim();
    const held = runs.get(key) ?? new Set();
    held.add(texts[i]);
    held.add(texts[j]);
    runs.set(key, held);
  }

const rows = [...runs.entries()].map(([run, carriers]) => {
  const stamps = [...carriers].reduce((n, text) => n + lines.get(text).copies, 0);
  return { run, carriers: carriers.size, stamps, cost: run.length * (stamps - 1) };
}).sort((a, b) => b.cost - a.cost);

const total = rows.reduce((n, r) => n + r.cost, 0);
console.log(`${rows.length} repeated runs of ${MIN_RUN}+ chars — ${total} B paid for wording already sent\n`);
for (const r of rows.slice(0, 12)) {
  console.log(`${String(r.cost).padStart(5)} B  ${r.run.length} chars × ${r.stamps} stamps in ${r.carriers} rules`);
  console.log(`         "${r.run.slice(0, 96)}"`);
}
