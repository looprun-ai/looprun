#!/usr/bin/env node
// extract-fork.mjs — build a margin-probe fork context from TWO real eval-run case JSONs:
// the arm where the case PASSED and the arm where it FAILED. Finds the first divergent
// message, emits the shared message prefix (OpenAI chat format, replayable byte-faithfully)
// plus the two observed continuations (the fork targets).
//
//   node extract-fork.mjs <pass-run-case.json> <fail-run-case.json> <out.json>
//
// Convention: the FIRST file is the CORRECT trajectory. Divergence kinds:
//   tool-name  — same step, different tool chosen (margin at the tool-name token)
//   tool-arg   — same tool, first differing argument (margin at the value tokens)
//   reply-text — divergence inside a terminal reply's text
import fs from 'node:fs';

const [passFile, failFile, outFile] = process.argv.slice(2);
if (!outFile) {
  console.error('usage: extract-fork.mjs <pass-run-case.json> <fail-run-case.json> <out.json>');
  process.exit(1);
}
const P = JSON.parse(fs.readFileSync(passFile, 'utf8'));
const F = JSON.parse(fs.readFileSync(failFile, 'utf8'));
const pt = P.transcript ?? [];
const ft = F.transcript ?? [];

const simplify = (m) => {
  if (m.role === 'user') return JSON.stringify(m.content);
  if (m.role === 'assistant') {
    const calls = (Array.isArray(m.content) ? m.content : [])
      .filter((c) => c.type === 'tool-call')
      .map((c) => ({ n: c.toolName, i: c.input }));
    return JSON.stringify(calls);
  }
  if (m.role === 'tool') {
    const outs = (Array.isArray(m.content) ? m.content : [])
      .filter((c) => c.type === 'tool-result')
      .map((c) => ({ n: c.toolName, v: c.output?.value }));
    return JSON.stringify(outs);
  }
  return JSON.stringify(m);
};

let div = -1;
const n = Math.min(pt.length, ft.length);
for (let i = 0; i < n; i++) {
  if (simplify(pt[i]) !== simplify(ft[i])) { div = i; break; }
}
if (div === -1) {
  if (pt.length === ft.length) { console.error('transcripts are identical — no fork'); process.exit(2); }
  div = n; // one is a prefix of the other
}
const dm = pt[div], fm = ft[div];
if (dm?.role === 'tool' || fm?.role === 'tool') {
  console.error(`divergence at index ${div} is a TOOL RESULT — same calls, different world output; inspect manually`);
  process.exit(3);
}

// shared prefix → OpenAI chat messages
const messages = [];
for (let i = 0; i < div; i++) {
  const m = pt[i];
  if (m.role === 'user') {
    messages.push({ role: 'user', content: m.content });
  } else if (m.role === 'assistant') {
    const calls = (Array.isArray(m.content) ? m.content : []).filter((c) => c.type === 'tool-call');
    messages.push({
      role: 'assistant', content: '',
      tool_calls: calls.map((c) => ({
        id: c.toolCallId, type: 'function',
        function: { name: c.toolName, arguments: JSON.stringify(c.input) },
      })),
    });
  } else if (m.role === 'tool') {
    for (const c of (Array.isArray(m.content) ? m.content : []).filter((c) => c.type === 'tool-result')) {
      messages.push({ role: 'tool', tool_call_id: c.toolCallId, content: JSON.stringify(c.output?.value) });
    }
  }
}

// fork targets from the two divergent assistant steps
const firstCall = (m) => (Array.isArray(m?.content) ? m.content : []).find((c) => c.type === 'tool-call');
let expect = null;
const pc = firstCall(dm), fc = firstCall(fm);
if (pc && fc && pc.toolName !== fc.toolName) {
  expect = { kind: 'tool-name', correct: pc.toolName, wrong: fc.toolName };
} else if (pc && fc) {
  const keys = new Set([...Object.keys(pc.input ?? {}), ...Object.keys(fc.input ?? {})]);
  for (const k of keys) {
    const a = JSON.stringify(pc.input?.[k]), b = JSON.stringify(fc.input?.[k]);
    if (a !== b) { expect = { kind: 'tool-arg', tool: pc.toolName, arg: k, correct: String(pc.input?.[k] ?? ''), wrong: String(fc.input?.[k] ?? '') }; break; }
  }
}

const out = {
  caseId: P.caseId, divergenceIndex: div,
  passNext: pc ? { tool: pc.toolName, input: pc.input } : dm ?? null,
  failNext: fc ? { tool: fc.toolName, input: fc.input } : fm ?? null,
  expect, messages,
};
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
console.log(`${P.caseId}: divergence at msg[${div}] kind=${expect?.kind ?? 'UNCLASSIFIED'} ` +
  `correct=${expect?.correct ?? '?'} wrong=${expect?.wrong ?? '?'} — ${messages.length} shared msgs → ${outFile}`);
