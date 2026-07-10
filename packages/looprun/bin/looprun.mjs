#!/usr/bin/env node
/**
 * looprun CLI — project init + local model management.
 *
 *   looprun init [--local <alias>] [--yes]
 *   looprun models status [alias]
 *   looprun models pull <alias> [--yes]
 *   looprun models serve <alias>
 */
import { createInterface } from 'node:readline/promises';

const HELP = `looprun <command>

  init [--local <alias>] [--yes]   Check the environment; optionally pull a local model.
  models status [alias]            Binary / model file / server health per alias.
  models pull <alias> [--yes]      Download the model GGUF (asks consent — sizes are 3–21 GB).
  models serve <alias>             Start llama-server with the validated flags (Ctrl-C stops).

Local model aliases: qwen3.5-4b (~2.9 GB) · qwen3.6-35b-a3b (~21 GB)
`;

async function confirm(question) {
  if (process.argv.includes('--yes') || !process.stdin.isTTY) return process.argv.includes('--yes');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

function progressBar() {
  let last = -1;
  return (pct) => {
    if (pct === last) return;
    last = pct;
    process.stderr.write(`\rdownloading… ${pct}%${pct >= 100 ? '\n' : ''}`);
  };
}

async function statusFor(models, alias) {
  const st = await models.localModelStatus(alias);
  const spec = models.resolveAlias(alias);
  console.log(`\n${spec.alias} — ${spec.note}`);
  console.log(`  binary : ${st.binary.ok ? st.binary.path : 'MISSING'}${st.binary.note ? `  (${st.binary.note})` : ''}`);
  console.log(`  model  : ${st.modelFile.exists ? st.modelFile.path : `NOT DOWNLOADED (~${spec.approxSizeGB} GB) → looprun models pull ${spec.alias}`}`);
  console.log(`  server : ${st.server.up ? `UP at ${st.server.baseURL}` : `down (looprun models serve ${spec.alias})`}`);
}

async function main() {
  const models = await import('@looprun/models');
  const [cmd, sub, ...rest] = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  if (!cmd || cmd === 'help' || process.argv.includes('--help')) {
    console.log(HELP);
    return;
  }

  if (cmd === 'init') {
    console.log('looprun init — environment check\n');
    const hasGoogle = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    console.log(`  GOOGLE_GENERATIVE_AI_API_KEY : ${hasGoogle ? 'set' : 'NOT SET (needed for the gemini validation model)'}`);
    for (const alias of ['qwen3.5-4b', 'qwen3.6-35b-a3b']) await statusFor(models, alias);
    const localIdx = process.argv.indexOf('--local');
    if (localIdx > -1) {
      const alias = process.argv[localIdx + 1];
      const spec = models.resolveAlias(alias);
      if (await confirm(`\nDownload ${spec.alias} (~${spec.approxSizeGB} GB) now?`)) {
        const rt = new models.LlamaCppRuntime();
        await rt.ensureModel(spec, { download: true, onProgress: progressBar() });
        console.log('done.');
      } else {
        console.log(`skipped — run: looprun models pull ${spec.alias}`);
      }
    }
    console.log('\nNext: npm i looprun && npx skills add looprun --skill agentspec');
    return;
  }

  if (cmd === 'models') {
    if (sub === 'status') {
      const aliases = rest.length ? rest : ['qwen3.5-4b', 'qwen3.6-35b-a3b'];
      for (const alias of aliases) await statusFor(models, alias);
      return;
    }
    if (sub === 'pull') {
      const alias = rest[0];
      if (!alias) throw new Error('usage: looprun models pull <alias>');
      const spec = models.resolveAlias(alias);
      if (!(await confirm(`Download ${spec.alias} (~${spec.approxSizeGB} GB) from ${spec.hfRepo}?`))) {
        console.log('aborted (pass --yes to skip the prompt).');
        process.exitCode = 1;
        return;
      }
      const rt = new models.LlamaCppRuntime();
      const path = await rt.ensureModel(spec, { download: true, onProgress: progressBar() });
      console.log(`model ready: ${path}`);
      return;
    }
    if (sub === 'serve') {
      const alias = rest[0];
      if (!alias) throw new Error('usage: looprun models serve <alias>');
      const spec = models.resolveAlias(alias);
      const rt = new models.LlamaCppRuntime();
      const { baseURL, alreadyRunning } = await rt.ensureServer(spec, { autoStart: true });
      console.log(alreadyRunning ? `already serving at ${baseURL}` : `serving ${spec.alias} at ${baseURL} — Ctrl-C to stop`);
      if (!alreadyRunning) await new Promise(() => {}); // foreground: the child dies with us
      return;
    }
  }

  console.error(`unknown command: ${[cmd, sub].filter(Boolean).join(' ')}\n`);
  console.log(HELP);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exitCode = 1;
});
