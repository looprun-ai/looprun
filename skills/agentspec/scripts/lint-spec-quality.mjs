#!/usr/bin/env node
/**
 * PROTOTYPE — deterministic spec-QUALITY lint for generated AgentSpecs (complements lint-guards.mjs,
 * which covers purity/firewall). Motivated by a measured 2026-07-14 A/B finding: a generated
 * spec carried a three-step tool pipeline ONLY as behavior prose (no requiresBefore guard) — a checkable rule without its check(). Doctrine: prose is the
 * OPTIONAL half; if a rule is deterministically checkable, the guard must exist (or the bullet must
 * be explicitly marked UNCHECKABLE).
 *
 *   node lint-spec-quality.mjs <spec.ts file-or-dir> [...]
 *   exit 0 = clean · exit 1 = findings (file:line — <rule>: message)
 *
 * Pure node, source-text scan (same portability contract as lint-guards.mjs). Heuristic by design:
 * every finding carries a suggestion and can be silenced by fixing OR by an explicit
 * `// lint-quality-exempt: <reason>` on the same line.
 *
 * RULES
 *  Q1 prose-parity/ordering — a tool-name flow (A → B, "only after X", "X FIRST") in behavior/
 *     directive prose with no requiresBefore/precondition install covering the downstream tool.
 *  Q2 target-existence     — addGuard target tool not on the spec's surface tools list (typo/dead guard).
 *  Q3 prose-tool-hallucination — a surface-shaped tool token in prose that is on NO surface (stale name).
 *  Q4 requiresBefore-cycle — the declared ordering graph has a cycle (deadlock by construction).
 *  Q5 destructive-without-confirm — a delete-/remove-/disconnect-prefixed surface tool with no
 *     confirm-class guard (confirmFirst, destructiveThrottle, precondition, custom) targeting it.
 *  Q6 uncheckable-hygiene  — a bullet marked UNCHECKABLE that contains an ordering arrow between two
 *     surface tools (it IS checkable — declare the guard).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const EXEMPT = 'lint-quality-exempt';
const TERMINALS = new Set(['replyToUser', 'askUser']);
const CONFIRM_CLASS = /confirmFirst|destructiveThrottle|confirmed|precondition|custom\(/;

function files(paths) {
  const out = [];
  for (const p of paths) {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const f of readdirSync(p)) if (f.endsWith('-spec.ts') || f === 'index.ts') out.push(join(p, f));
    } else out.push(p);
  }
  return out;
}

/** Surface tools: every quoted token inside the first `tools: [ ... ]` block. */
function surfaceTools(src) {
  const m = src.match(/tools:\s*\[([\s\S]*?)\]/);
  if (!m) return new Set();
  return new Set([...m[1].matchAll(/['"`]([A-Za-z][A-Za-z0-9_]*)['"`]/g)].map((x) => x[1]));
}

/** addGuard installs: [{line, targets:[...]|'any', factories: 'requiresBefore(...)…' raw}] */
function guardInstalls(src, lines) {
  const out = [];
  const re = /this\.addGuard\(\s*'(\w+)'\s*,\s*(\[[^\]]*\]|'[^']*'|[A-Z_][A-Z0-9_]*)\s*,/g;
  let m;
  while ((m = re.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    const rawTargets = m[1] === 'preTool' || true ? m[2] : m[2];
    let targets;
    if (rawTargets.startsWith('[')) targets = [...rawTargets.matchAll(/['"`]([A-Za-z][A-Za-z0-9_]*)['"`]/g)].map((x) => x[1]);
    else if (rawTargets.startsWith("'")) targets = rawTargets === "'any'" ? 'any' : [rawTargets.slice(1, -1)];
    else {
      // a CONST array (e.g. STYLE_INJECTED_TOOLS) — resolve its literal if declared in-file
      const cm = src.match(new RegExp(`${rawTargets}\\s*=\\s*\\[([^\\]]*)\\]`));
      targets = cm ? [...cm[1].matchAll(/['"`]([A-Za-z][A-Za-z0-9_]*)['"`]/g)].map((x) => x[1]) : 'unresolved';
    }
    // capture the rest of the statement (up to the matching `);`) for factory classification
    const tail = src.slice(m.index, Math.min(src.length, m.index + 600));
    out.push({ line, hook: m[1], targets, tail, exempt: (lines[line - 1] ?? '').includes(EXEMPT) });
  }
  return out;
}

/** requiresBefore edges declared: [{line, tool, deps[]}] */
function orderingEdges(installs) {
  const edges = [];
  for (const g of installs) {
    const rb = g.tail.match(/requiresBefore\(\s*\[([^\]]*)\]/);
    if (!rb || g.targets === 'any' || g.targets === 'unresolved') continue;
    const deps = [...rb[1].matchAll(/['"`]([A-Za-z][A-Za-z0-9_]*)['"`]/g)].map((x) => x[1]);
    for (const t of g.targets) edges.push({ line: g.line, tool: t, deps });
  }
  return edges;
}

/** prose strings from behavior/persona/directive blocks: [{line, text}] — LINE-BASED scan (no
 *  multi-line lazy regex: catastrophic backtracking on 30KB spec files hangs node). A line counts as
 *  prose when it carries a string literal ≥40 chars and a behavior/persona/directive/cond/prose
 *  marker appeared within the previous 25 lines (cheap region heuristic). */
function proseStrings(lines) {
  const out = [];
  let lastMarker = -100;
  for (let i = 0; i < lines.length; i++) {
    if (/behavior\s*:|persona\s*:|directives\s*:|cond\s*:|directive\s*:|prose\s*[:(]/.test(lines[i])) lastMarker = i;
    if (i - lastMarker > 25) continue;
    const m = lines[i].match(/(['"`])(.{40,})\1/);
    if (m) out.push({ line: i + 1, text: m[2] });
  }
  return out;
}

function lintFile(path) {
  const src = readFileSync(path, 'utf8');
  const lines = src.split('\n');
  const findings = [];
  const F = (line, rule, msg) => { if (!(lines[line - 1] ?? '').includes(EXEMPT)) findings.push(`${path}:${line} — ${rule}: ${msg}`); };
  const surface = surfaceTools(src);
  if (!surface.size) return findings; // not a spec file (index.ts etc.)
  const installs = guardInstalls(src, lines);
  const edges = orderingEdges(installs);
  const prose = proseStrings(lines);
  const guardedBy = (tool, factoryRe) => installs.some((g) => (g.targets === 'any' || (Array.isArray(g.targets) && g.targets.includes(tool))) && factoryRe.test(g.tail));

  // Q1 prose-parity/ordering: arrows and "only after" chains between SURFACE tools
  for (const p of prose) {
    const arrows = [...p.text.matchAll(/([A-Za-z][A-Za-z0-9_]*)\s*(?:→|->)\s*([A-Za-z][A-Za-z0-9_]*)/g)]
      .filter(([, a, b]) => surface.has(a) && surface.has(b));
    const onlyAfter = [...p.text.matchAll(/([A-Za-z][A-Za-z0-9_]*)[^.]{0,40}\bonly after\b[^.]{0,40}?([A-Za-z][A-Za-z0-9_]*)/gi)]
      .filter(([, a, b]) => surface.has(a) && surface.has(b));
    for (const [, a, b] of arrows) {
      if (!edges.some((e) => e.tool === b && e.deps.includes(a))) {
        F(p.line, 'Q1-prose-parity', `prose declares ${a} → ${b} but no requiresBefore(['${a}']) is installed on '${b}' — declare the gate or mark the bullet UNCHECKABLE`);
      }
    }
    for (const [, b, a] of onlyAfter) {
      if (!edges.some((e) => e.tool === b && e.deps.includes(a)) && !guardedBy(b, /requiresBefore|precondition/)) {
        F(p.line, 'Q1-prose-parity', `prose says '${b}' only after '${a}' but no ordering guard covers '${b}'`);
      }
    }
  }
  // Q2 target-existence
  for (const g of installs) {
    if (!Array.isArray(g.targets)) continue;
    for (const t of g.targets) if (!surface.has(t) && !TERMINALS.has(t)) F(g.line, 'Q2-target-existence', `guard targets '${t}' which is not on the surface tools list`);
  }
  // Q3 prose-tool-hallucination: camelCase verb-first tokens in prose absent from surface+terminals.
  // FP filters (ground-truthed on the reference bundle): (a) NEGATED mentions ("has no refineImage")
  // are legitimate cross-references; (b) arg-name shapes ("written into editInstruction") — require
  // a CALL-ish context (call/calling/re-running/probe/via) or sentence-initial usage.
  const KNOWN_PREFIX = /^(get|list|create|update|delete|generate|save|add|remove|switch|connect|disconnect|redeem|schedule|dismiss|edit|refine|ingest|prepare|render|load|resend|set|assess|which|run|navigate|invite|plan|evaluate)[A-Z]/;
  for (const p of prose) {
    for (const m of p.text.matchAll(/\b[a-z]+[A-Z][A-Za-z0-9]+\b/g)) {
      const tok = m[0];
      if (!KNOWN_PREFIX.test(tok) || surface.has(tok) || TERMINALS.has(tok)) continue;
      const before = p.text.slice(Math.max(0, m.index - 30), m.index);
      if (/\b(no|not|without|sem|n[aã]o)\s+$/i.test(before)) continue;                 // negated
      if (!/\b(call(?:ing)?|re-?run(?:ning)?|probe|via|use[sd]?)\s+$/i.test(before)) continue; // not call-ish
      F(p.line, 'Q3-prose-tool-hallucination', `prose instructs calling '${tok}' which is on no surface (stale or invented name)`);
    }
  }
  // Q4 requiresBefore cycles
  const adj = new Map();
  for (const e of edges) for (const d of e.deps) { if (!adj.has(e.tool)) adj.set(e.tool, []); adj.get(e.tool).push(d); }
  const seen = new Set();
  const stack = new Set();
  const cyc = (n) => {
    if (stack.has(n)) return true;
    if (seen.has(n)) return false;
    seen.add(n); stack.add(n);
    for (const d of adj.get(n) ?? []) if (cyc(d)) return true;
    stack.delete(n); return false;
  };
  for (const n of adj.keys()) if (cyc(n)) { F(edges.find((e) => e.tool === n)?.line ?? 1, 'Q4-ordering-cycle', `requiresBefore graph has a cycle through '${n}' — deadlock by construction`); break; }
  // Q5 destructive-without-confirm — config-level protection counts: `destructiveTools: [...]`
  // feeds the Base auto confirm layer (ground-truthed FP: deleteVisualStyle protected via config).
  const destrCfg = new Set([...(src.match(/destructiveTools:\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/['"`]([A-Za-z][A-Za-z0-9_]*)['"`]/g)].map((x) => x[1]));
  for (const t of surface) {
    if (/^(delete|remove|disconnect)/.test(t) && !destrCfg.has(t) && !guardedBy(t, CONFIRM_CLASS)) {
      const tl = lines.findIndex((l) => l.includes(`'${t}'`)) + 1;
      F(tl || 1, 'Q5-destructive-without-confirm', `destructive surface tool '${t}' has no confirm-class guard and is not in destructiveTools`);
    }
  }
  // Q7 unnameable-flow: an arrow chain whose endpoints are NOT literal surface tools cannot be
  // gated or linted (the motivating gap: image prose says "post → concept → image" — words, not
  // tools — so its ordering was never declarable). Convention: flow prose names tools literally.
  // A 2-token arrow is usually a STATE transition ("draft → scheduled", "light → dark") — only a
  // CHAIN of ≥3 reads as a tool pipeline (ground-truthed: "post → concept → image" fires; pairs don't).
  for (const p of prose) {
    const m = p.text.match(/([A-Za-zÀ-ú][\wÀ-ú-]*)(\s*(?:→|->)\s*[A-Za-zÀ-ú][\wÀ-ú-]*){2,}/);
    if (!m) continue;
    const toks = m[0].split(/\s*(?:→|->)\s*/);
    if (toks.some((t) => surface.has(t))) continue; // tool-named chains are Q1's territory
    F(p.line, 'Q7-unnameable-flow', `pipeline "${m[0].slice(0, 50)}" uses non-tool names — name the tools literally (so the ordering is gateable) or mark UNCHECKABLE`);
  }
  // Q6 uncheckable-hygiene
  for (const p of prose) {
    if (/UNCHECKABLE/i.test(p.text) && /(?:→|->)/.test(p.text)) {
      const arrows = [...p.text.matchAll(/([A-Za-z][A-Za-z0-9_]*)\s*(?:→|->)\s*([A-Za-z][A-Za-z0-9_]*)/g)].filter(([, a, b]) => surface.has(a) && surface.has(b));
      if (arrows.length) F(p.line, 'Q6-uncheckable-hygiene', 'bullet marked UNCHECKABLE contains a surface-tool ordering arrow — that half IS checkable');
    }
  }
  return findings;
}

const args = process.argv.slice(2);
if (!args.length) { console.error('usage: lint-spec-quality.mjs <spec.ts|dir> [...]'); process.exit(2); }
let all = [];
for (const f of files(args)) if (basename(f) !== 'index.ts') all = all.concat(lintFile(f));
if (all.length) { for (const f of all) console.log(f); console.log(`\n${all.length} finding(s).`); process.exit(1); }
console.log('clean.');
