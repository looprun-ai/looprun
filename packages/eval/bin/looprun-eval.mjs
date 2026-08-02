#!/usr/bin/env node
/**
 * looprun-eval — the subject runner + measured loop of a looprun project.
 *
 *   looprun-eval run  --subject <dir> [--model <id>] [--base-url <url>] [--api-key-env <ENV>]
 *                     [--case id[,id]] [--ungoverned] [--thinking] [--out <dir>]
 *   looprun-eval validate --subject <dir> [--reached-floor <ratio>]
 *   looprun-eval judge-input <run-dir> [--chunk <N>]
 *   looprun-eval fold --dump <cases.jsonl> --verdicts <verdicts.jsonl> [--out <RESULTS.md>]
 *   looprun-eval fold --sync <run-dir> <run-dir> … [--out <SYNC.md>]
 *   looprun-eval cert <run-dir> [--bar 0.9] [--model <label>] [--date <iso>] [--note <text>]
 *   looprun-eval campaign run <campaign.json> [--resume]
 *   looprun-eval campaign status <out-dir>
 *   looprun-eval campaign resume <out-dir> [--judge-model <label>]
 *   looprun-eval seal <subject-dir> [--verify] [--target model:rate:reps ...] [--bar 0.9] [--date <iso>]
 *   looprun-eval lint [paths…] [--spec-laws --subject <dir>]
 */
const HELP = `looprun-eval <command>

  run [flags]        Run the subject's cases N=1 → cases.jsonl + SUMMARY.md.
                     --subject <dir> (required) --model <id> --base-url <url>
                     --api-key-env <ENV> --case id[,id] --ungoverned --thinking --out <dir>
                     Target default: the subject's ask/targets.json (flags/env override).
  validate [flags]   Schema + references + premise-coherence over a subject, offline (no spend).
                     --subject <dir> (required) [--reached-floor <ratio>] Exits 1 on any blocking issue.
  judge-input <dir>  Build the blind per-case JSONL the judge reads (turn boundaries preserved,
                     no arm/rep labels, deterministic order). [--chunk <N>] → judge-input.partK.jsonl.
                     CAVEAT: the EMITTED files are blind, but a run-dir NAME you chose can still leak
                     the arm via its path — keep dir names neutral when the path reaches the judge.
  fold [flags]       Merge judge verdicts into RESULTS.md (final pass = invariants AND judge).
                     --dump <cases.jsonl> --verdicts <verdicts.jsonl> [--out <RESULTS.md>]
                     --sync <dir> <dir> …  Force one verdict per byte-identical transcript across run
                     dirs (mechanical, no judge) → verdicts.synced.jsonl per dir + SYNC.md.
  cert <dir> [dir…]  Fold cases.jsonl + verdicts.jsonl → cert.json + CERT.md (reps=1, stated).
                     2+ dirs = multi-rep BAND → cert-band.json + CERT-BAND.md; certified only
                     if the FLOOR over reps clears the bar. [--out <dir>] for the band files.
                     [--verdicts <file>] reads that verdicts filename per dir (default verdicts.jsonl;
                     use verdicts.synced.jsonl to certify off 'fold --sync' output).
  campaign <sub>     One verb for the whole measured campaign (preflight → reps + control → judging
                     PAUSE → fold/sync → cert BAND). Sub-verbs:
                     run <campaign.json> [--resume]   preflight, run every arm, PAUSE with judging.json
                     status <out-dir>                 per-phase progress from the dirs (no daemon)
                     resume <out-dir> [--judge-model <label>]  verify verdicts, monitor gate, cert BAND
  seal <subject>     Mint ship/seal.json (hash-bound) — or --verify an existing one.
                     [--bar 0.9] [--model <label>] [--date <iso>] [--note <text>]
  lint [paths…]      Purity/firewall/contract lint. [--spec-laws --subject <dir>]

Quality verdicts come ONLY from the LLM judge — the run's streamed pass/fail lines are the
deterministic invariant gate.
`;

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
function has(name) {
  return process.argv.includes(`--${name}`);
}

const VALUE_FLAGS = new Set(['--subject', '--model', '--base-url', '--api-key-env', '--case', '--out', '--dump', '--verdicts', '--bar', '--date', '--note', '--target', '--reached-floor', '--chunk', '--judge-model']);

function positionals() {
  const argv = process.argv.slice(2);
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (VALUE_FLAGS.has(a)) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

async function main() {
  const api = await import('@looprun-ai/eval');
  const [cmd, ...rest] = positionals();

  if (!cmd || cmd === 'help' || has('help')) {
    console.log(HELP);
    return;
  }

  if (cmd === 'run') {
    const subject = flag('subject');
    if (!subject) throw new Error('run: --subject <dir> is required');
    const outDir = await api.runCommand({
      subject,
      model: flag('model', undefined),
      baseUrl: flag('base-url', undefined),
      apiKeyEnv: flag('api-key-env', undefined),
      cases: flag('case', undefined)?.split(',').map((s) => s.trim()).filter(Boolean),
      ungoverned: has('ungoverned'),
      thinking: has('thinking'),
      out: flag('out', undefined),
    });
    console.log(outDir);
    return;
  }

  if (cmd === 'validate') {
    const subject = flag('subject');
    if (!subject) throw new Error('validate: --subject <dir> is required');
    const report = await api.validateCommand({
      subject,
      reachedFloor: has('reached-floor') ? Number(flag('reached-floor')) : undefined,
    });
    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (cmd === 'judge-input') {
    const dir = rest[0];
    if (!dir) throw new Error('usage: looprun-eval judge-input <run-dir> [--chunk <N>]');
    const paths = api.judgeInputCommand({ dir, chunk: has('chunk') ? Number(flag('chunk')) : undefined });
    for (const p of paths) console.log(p);
    return;
  }

  if (cmd === 'fold') {
    if (has('sync')) {
      const dirs = rest;
      if (dirs.length < 2) throw new Error('fold --sync: needs at least 2 run dirs');
      console.log(api.foldCommand({ sync: dirs, out: flag('out', undefined) }));
      return;
    }
    const dump = flag('dump');
    const verdicts = flag('verdicts');
    if (!dump || !verdicts) throw new Error('fold: --dump and --verdicts are required');
    console.log(api.foldCommand({ dump, verdicts, out: flag('out', undefined) }));
    return;
  }

  if (cmd === 'cert') {
    const [dir, ...moreDirs] = rest;
    if (!dir) throw new Error('usage: looprun-eval cert <run-dir> [<run-dir> ...]');
    const summary = api.certCommand({
      dir,
      dirs: moreDirs,
      model: flag('model', undefined),
      bar: has('bar') ? Number(flag('bar')) : undefined,
      date: flag('date', undefined),
      note: flag('note', undefined),
      out: flag('out', undefined),
      verdicts: flag('verdicts', undefined),
    });
    if (moreDirs.length) {
      console.log(
        `band ${(summary.floor * 100).toFixed(1)}%–${(summary.ceil * 100).toFixed(1)}% over ${summary.cases} case(s) × ${summary.reps} reps → ` +
          `${summary.certified ? 'CERTIFIED' : 'BELOW BAR'} (bar ${(summary.bar * 100).toFixed(0)}% as FLOOR) → CERT-BAND.md`,
      );
    } else {
      console.log(
        `overall ${(summary.passRate * 100).toFixed(1)}% over ${summary.cases} case(s) → ` +
          `${summary.certified ? 'CERTIFIED' : 'BELOW BAR'} (bar ${(summary.bar * 100).toFixed(0)}%, reps=1) → ${dir}/CERT.md`,
      );
    }
    if (!summary.certified) process.exitCode = 1;
    return;
  }

  if (cmd === 'campaign') {
    const [sub, target] = rest;
    if (!['run', 'status', 'resume'].includes(sub)) {
      throw new Error('usage: looprun-eval campaign <run|status|resume> …');
    }
    if (!target) throw new Error(`campaign ${sub}: a ${sub === 'run' ? '<campaign.json>' : '<out-dir>'} argument is required`);
    await api.campaignCommand({
      action: sub,
      ...(sub === 'run' ? { config: target } : { out: target }),
      resume: has('resume'),
      judgeModel: flag('judge-model', undefined),
      log: (l) => console.log(l),
    });
    return;
  }

  if (cmd === 'seal') {
    const dir = rest[0] ?? flag('subject', undefined);
    if (!dir) { console.error('seal: <subject-dir> required'); process.exit(2); }
    if (has('verify')) {
      const v = api.verifySeal(dir);
      if (v.ok) { console.log(`seal VALID — artifactHash matches (${v.actual.slice(0, 16)}…)`); return; }
      console.error(`seal VOID — artifacts changed after certification.\n  sealed:  ${v.expected}\n  on disk: ${v.actual}\nRe-certify or re-open the pipeline; never re-stamp.`);
      process.exit(1);
    }
    const targets = (flag('target', '') || '').split(',').filter(Boolean).map((t) => {
      const [model, rate, reps] = t.split(':');
      return { model, rate: Number(rate), reps: Number(reps ?? 1) };
    });
    if (!targets.length) { console.error('seal: --target model:rate:reps[,…] required to mint'); process.exit(2); }
    const seal = api.mintSeal(dir, { targets, bar: has('bar') ? Number(flag('bar')) : 0.9, date: flag('date', undefined), note: flag('note', undefined) });
    console.log(`seal minted → ${dir}/ship/seal.json (hash ${seal.artifactHash.slice(0, 16)}…)`);
    return;
  }

  if (cmd === 'lint') {
    const paths = rest.length ? rest : ['src', 'evals'];
    const violations = api.lintPaths(paths);
    for (const v of violations) console.error(`${v.file}:${v.line} [${v.rule}] ${v.message}`);
    let specLawFails = [];
    if (has('spec-laws')) {
      const subjectDir = flag('subject');
      if (!subjectDir) throw new Error('lint --spec-laws: --subject <dir> is required');
      const subject = await api.loadSubject(subjectDir);
      specLawFails = api.lintSpecLaws(subject.specs);
      for (const m of specLawFails) console.error(`[spec-laws] ${m}`);
      // Execution-based spec-quality checks over the ASSEMBLED specs (unsat pairs, order cycles).
      const execFails = await api.lintSpecExecution(subject.specs);
      for (const m of execFails) console.error(`[spec-exec] ${m}`);
      // Artifact-quality laws over the assembled specs (inert guards, absent tools, unenforced
      // orderings, armed seams) and subject laws (exam coverage, the world's ok/failed contract).
      const qualityFails = api.lintSpecQuality(subject.specs, subject.toolDefs);
      for (const m of qualityFails) console.error(`[spec-quality] ${m}`);
      const subjectFails = api.lintSubject(subject);
      for (const m of subjectFails) console.error(`[subject] ${m}`);
      specLawFails = specLawFails.concat(execFails, qualityFails, subjectFails);
    }
    const total = violations.length + specLawFails.length;
    console.log(total ? `lint: ${total} violation(s)` : 'lint: clean');
    if (total) process.exitCode = 1;
    return;
  }

  console.error(`unknown command: ${cmd}\n`);
  console.log(HELP);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exitCode = 1;
});
