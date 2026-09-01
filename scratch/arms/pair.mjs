// One case, its rubric, and the replies both arms delivered — what a verdict is judged on.
import { readdirSync, readFileSync } from 'node:fs';
const [off, on, from, to] = process.argv.slice(2);
const rubrics = new Map();
for (const f of readdirSync(off).filter(x => x.startsWith('judge-input'))) {
  for (const line of readFileSync(`${off}/${f}`, 'utf8').trim().split('\n')) {
    const j = JSON.parse(line); rubrics.set(j.case, j.rubric);
  }
}
const files = readdirSync(`${off}/dumps`).sort().slice(Number(from), Number(to));
for (const file of files) {
  const a = JSON.parse(readFileSync(`${off}/dumps/${file}`, 'utf8'));
  const b = JSON.parse(readFileSync(`${on}/dumps/${file}`, 'utf8'));
  console.log(`\n===== ${a.case}   OFF:${a.failure?.kind ?? 'ok'}${JSON.stringify(a.invariantFailures)}  ON:${b.failure?.kind ?? 'ok'}${JSON.stringify(b.invariantFailures)}`);
  console.log(rubrics.get(a.case));
  for (const [tag, d] of [['OFF', a], ['ON ', b]]) {
    for (const r of d.records) {
      console.log(`  ${tag} T${r.turn} <${r.userText}>`);
      console.log(`      ${(r.text ?? '').replace(/\n+/g, ' | ')}`);
    }
  }
}
