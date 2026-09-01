// Microtest 9 — what a long tape costs, and what a cut costs.
//
// One scripted 24-turn desk session, replayed under four tape laws:
//
//   A  full tape, append-only        — the control. Nothing is ever rewritten or removed.
//   B  window-2 rewrite              — today's engine: only the last two turns keep their
//                                      act sentences, so every turn rewrites older bytes.
//   C  checkpoint compaction         — every 8 turns, turns older than the last 4 collapse
//                                      into one deterministic summary that KEEPS the facts.
//   D  checkpoint compaction, facts dropped — the same cut with a summary that forgets.
//
// The ruler: /completion with cache_prompt:true, reading timings.prompt_n — the tokens the
// server actually prefilled. Tokens served from the KV cache are excluded from it.
//
// The layout inside every arm is AS-IS: system = frozen head + the mutating STATE tail.
// The arms differ only in the tape.

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildHead, buildState, SEED_BOOKINGS } from '../07-prefill/prompts.mjs';
import {
  TOTAL_TURNS,
  WRITE_TURNS,
  MEMORY_TURNS,
  PLANTED,
  OPERATOR,
  TOOL_RESULTS,
  ACTS,
  mutate,
  summaryBlock,
  checkpointFor,
  KEEP_LIVE,
} from './cases.mjs';

const SERVER = process.env.SERVER ?? 'http://127.0.0.1:8081';
const OUT = new URL('.', import.meta.url).pathname;
const TRANSCRIPTS = `${OUT}transcripts`;
mkdirSync(TRANSCRIPTS, { recursive: true });

const N_PREDICT = 64;
const THINK_OFF = '<think>\n\n</think>\n\n';

async function post(path, body) {
  const r = await fetch(`${SERVER}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function tokenCount(content) {
  const r = await post('/tokenize', { content });
  return r.tokens.length;
}

async function eraseSlot() {
  const r = await fetch(`${SERVER}/slots/0?action=erase`, { method: 'POST' });
  if (!r.ok) throw new Error(`slot erase → ${r.status} ${await r.text()}`);
}

function render(system, messages) {
  let s = `<|im_start|>system\n${system}<|im_end|>\n`;
  for (const m of messages) s += `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`;
  return `${s}<|im_start|>assistant\n${THINK_OFF}`;
}

const calls = [];
let phase = 'init';

async function call(label, system, messages) {
  const prompt = render(system, messages);
  const promptTokens = await tokenCount(prompt);
  const t0 = Date.now();
  const r = await post('/completion', {
    prompt,
    cache_prompt: true,
    temperature: 0,
    top_k: 1,
    n_predict: N_PREDICT,
    stream: false,
  });
  const wallMs = Date.now() - t0;
  const t = r.timings;
  const rec = {
    label,
    phase,
    promptTokensTotal: promptTokens,
    prefillTokens: t.prompt_n,
    prefillMs: +t.prompt_ms.toFixed(1),
    decodeTokens: t.predicted_n,
    decodeMs: +t.predicted_ms.toFixed(1),
    wallMs,
    content: r.content,
    hasThinkTag: r.content.includes('<think>'),
  };
  calls.push(rec);
  process.stdout.write(
    `  ${label.padEnd(26)} ctx=${String(promptTokens).padStart(6)}  prefill=${String(rec.prefillTokens).padStart(6)}  wall=${String(wallMs).padStart(6)}ms\n`,
  );
  return rec;
}

// ── RAM sampling ───────────────────────────────────────────────────────────────
const samples = [];
let serverPid = null;
try {
  serverPid = execSync("pgrep -f 'llama-server.*8081'").toString().trim().split('\n')[0];
} catch {}
function sampleRam() {
  if (!serverPid) return;
  try {
    const rssKb = Number(execSync(`ps -o rss= -p ${serverPid}`).toString().trim());
    samples.push({ t: Date.now(), phase, rssMb: +(rssKb / 1024).toFixed(1) });
  } catch {}
}
const ramTimer = setInterval(sampleRam, 2000);

// ── the tape ───────────────────────────────────────────────────────────────────
// A sealed turn: what the operator said, what the desk answered, the tool exchange if
// there was one, and the act sentences that turn produced.
//
// `actsVisible` is the whole experiment: which sealed turns still carry their act lines
// in the bytes sent to the model on THIS call.

function renderTurn(sealed, showActs) {
  const msgs = [{ role: 'user', content: sealed.userText }];
  if (sealed.toolResult) {
    msgs.push({ role: 'assistant', content: sealed.toolCallText });
    msgs.push({ role: 'user', content: sealed.toolResult });
  }
  const acts = showActs && sealed.acts.length ? `\n${sealed.acts.join('\n')}` : '';
  msgs.push({ role: 'assistant', content: `${sealed.replyText}${acts}` });
  return msgs;
}

// Build the tape the model sees for the turn now being built.
function buildTape(arm, sealed, turnBeingBuilt) {
  if (arm === 'A') return sealed.flatMap((s) => renderTurn(s, true));

  if (arm === 'B') {
    // Today's engine: only the last TWO sealed turns keep their act sentences.
    const recorded = new Set(sealed.slice(-2));
    return sealed.flatMap((s) => renderTurn(s, recorded.has(s)));
  }

  // C and D: checkpoint compaction. Append-only between checkpoints.
  const cp = checkpointFor(turnBeingBuilt);
  if (cp === 0) return sealed.flatMap((s) => renderTurn(s, true));
  const compactedThrough = cp - KEEP_LIVE;
  const live = sealed.filter((s) => s.turn > compactedThrough);
  return [
    { role: 'user', content: summaryBlock(compactedThrough, arm === 'C') },
    ...live.flatMap((s) => renderTurn(s, true)),
  ];
}

const head = buildHead('bookings', { sharedFirst: true });

async function runArm(arm) {
  phase = `arm-${arm}`;
  await eraseSlot();
  console.log(`\n[ARM ${arm}]`);
  let bookings = SEED_BOOKINGS;
  const sealed = [];
  const perTurn = [];
  const memoryAnswers = {};

  for (let turn = 1; turn <= TOTAL_TURNS; turn++) {
    const before = calls.length;
    const userText = OPERATOR[turn - 1];
    const tape = buildTape(arm, sealed, turn);
    const system = `${head}\n${buildState(bookings)}\n`;

    const a = await call(`${arm} t${String(turn).padStart(2)} step1`, system, [
      ...tape,
      { role: 'user', content: userText },
    ]);

    const rec = { turn, userText, acts: ACTS[turn] ?? [], replyText: a.content };

    if (WRITE_TURNS.has(turn)) {
      rec.toolCallText = a.content;
      rec.toolResult = TOOL_RESULTS[turn];
      bookings = mutate(bookings, turn);
      const system2 = `${head}\n${buildState(bookings)}\n`;
      const b = await call(`${arm} t${String(turn).padStart(2)} step2`, system2, [
        ...tape,
        { role: 'user', content: userText },
        { role: 'assistant', content: a.content },
        { role: 'user', content: rec.toolResult },
      ]);
      rec.replyText = b.content;
    }

    sealed.push(rec);
    if (MEMORY_TURNS[turn]) memoryAnswers[turn] = { asked: MEMORY_TURNS[turn], userText, reply: rec.replyText };
    perTurn.push(turnSummary(turn, calls.slice(before)));
  }

  writeFileSync(
    `${TRANSCRIPTS}/arm-${arm}.json`,
    JSON.stringify({ arm, sealed, finalTape: buildTape(arm, sealed, TOTAL_TURNS) }, null, 2),
  );
  return { perTurn, memoryAnswers };
}

function turnSummary(turn, recs) {
  const sum = (f) => recs.reduce((s, r) => s + r[f], 0);
  return {
    turn,
    steps: recs.length,
    prefillTokens: sum('prefillTokens'),
    prefillMs: +sum('prefillMs').toFixed(1),
    decodeTokens: sum('decodeTokens'),
    contextTokensAtTurnEnd: recs[recs.length - 1].promptTokensTotal,
    wallMs: sum('wallMs'),
  };
}

// ── ruler verification ─────────────────────────────────────────────────────────
async function verifyRuler() {
  phase = 'ruler';
  await eraseSlot();
  console.log('\n[RULER VERIFICATION] same prompt twice');
  const msgs = [{ role: 'user', content: OPERATOR[0] }];
  const system = `${head}\n${buildState(SEED_BOOKINGS)}\n`;
  const first = await call('ruler cold', system, msgs);
  const second = await call('ruler identical', system, msgs);
  const REPREFILL_FLOOR = 600;
  return {
    firstPrefill: first.prefillTokens,
    secondPrefill: second.prefillTokens,
    reprefillFloorTokens: REPREFILL_FLOOR,
    collapsed: second.prefillTokens <= REPREFILL_FLOOR && second.prefillTokens < first.prefillTokens * 0.5,
  };
}

// ── main ───────────────────────────────────────────────────────────────────────
const props = await fetch(`${SERVER}/props`).then((r) => r.json());
const sizes = {
  headTokens: await tokenCount(head),
  stateTokens: await tokenCount(buildState(SEED_BOOKINGS)),
  summaryKeepFactsTokens: await tokenCount(summaryBlock(4, true)),
  summaryDropFactsTokens: await tokenCount(summaryBlock(4, false)),
};
console.log(`sizes: head=${sizes.headTokens} STATE=${sizes.stateTokens} summary(keep)=${sizes.summaryKeepFactsTokens} summary(drop)=${sizes.summaryDropFactsTokens}`);

phase = 'warmup';
await call('warmup', head, [{ role: 'user', content: 'Say ready.' }]);
sampleRam();
const idleRss = samples.length ? samples[samples.length - 1].rssMb : null;

const ruler = await verifyRuler();
if (!ruler.collapsed) console.error(`RULER FAILED: ${ruler.firstPrefill} → ${ruler.secondPrefill}`);

const armResults = {};
for (const arm of ['A', 'B', 'C', 'D']) {
  const t0 = Date.now();
  const r = await runArm(arm);
  armResults[arm] = { ...r, wallMsTotal: Date.now() - t0 };
}

clearInterval(ramTimer);

const results = {
  serving: {
    server: SERVER,
    nPredict: N_PREDICT,
    temperature: 0,
    thinkingOff: {
      method: 'empty <think></think> pair injected after the assistant tag',
      anyThinkTagInOutput: calls.some((c) => c.hasThinkTag),
    },
    nCtx: props.default_generation_settings?.n_ctx ?? null,
  },
  sizes,
  ruler,
  script: { totalTurns: TOTAL_TURNS, writeTurns: [...WRITE_TURNS], memoryTurns: MEMORY_TURNS, planted: PLANTED },
  arms: Object.fromEntries(
    Object.entries(armResults).map(([k, v]) => [
      k,
      {
        perTurn: v.perTurn,
        cumulativePrefill: v.perTurn.reduce((s, t) => s + t.prefillTokens, 0),
        contextAtTurn24: v.perTurn[v.perTurn.length - 1].contextTokensAtTurnEnd,
        wallMsTotal: v.wallMsTotal,
        memoryAnswers: v.memoryAnswers,
      },
    ]),
  ),
  ram: {
    pid: serverPid,
    idleAfterLoadMb: idleRss,
    peakMb: samples.length ? Math.max(...samples.map((s) => s.rssMb)) : null,
    samples: samples.length,
  },
  calls,
};

writeFileSync(`${OUT}results.json`, JSON.stringify(results, null, 2));
writeFileSync(`${TRANSCRIPTS}/ram-samples.json`, JSON.stringify(samples, null, 2));

console.log('\nARM          cum.prefill   ctx@t24   wall');
for (const [k, v] of Object.entries(results.arms)) {
  console.log(
    `  ${k}   ${String(v.cumulativePrefill).padStart(11)}   ${String(v.contextAtTurn24).padStart(7)}   ${(v.wallMsTotal / 1000).toFixed(0)}s`,
  );
}
