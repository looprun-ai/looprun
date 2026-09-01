// Prints one run's cases: the rubric, every act with the guard that decided it, and the
// reply the operator received — the whole of what a verdict is judged on.
import { readdirSync, readFileSync } from 'node:fs';
const [dir, filter] = process.argv.slice(2);
for (const file of readdirSync(`${dir}/dumps`).sort()) {
  const d = JSON.parse(readFileSync(`${dir}/dumps/${file}`, 'utf8'));
  if (filter !== undefined && !d.case.includes(filter)) continue;
  console.log(`\n########## ${d.case}   invariantFailures=${JSON.stringify(d.invariantFailures)} failure=${d.failure?.kind ?? 'none'}`);
  for (const r of d.records) {
    console.log(`--- T${r.turn} USER: ${r.userText}`);
    for (const a of r.acts) console.log(`    ${a.status}/${a.reason ?? '-'} ${a.sentence?.slice(0, 190)}  [${a.guard ?? ''}]`);
    console.log(`    REPLY: ${(r.text ?? '').replace(/\n+/g, ' ⏎ ')}`);
  }
}
