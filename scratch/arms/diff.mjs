// Compares two arms case by case: whether the delivered replies are byte-identical, and
// where the act traces part company.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
const [off, on] = process.argv.slice(2);
const load = (dir, file) => JSON.parse(readFileSync(`${dir}/dumps/${file}`, 'utf8'));
const trace = d => d.records.flatMap(r => r.acts.map(a => `${a.call.tool}:${a.status}/${a.reason ?? '-'}:${a.guard ?? ''}`)).join(' | ');
const replies = d => d.records.map(r => r.text ?? '').join('\n@@@\n');
for (const file of readdirSync(`${off}/dumps`).sort()) {
  if (!existsSync(`${on}/dumps/${file}`)) { console.log(`MISSING-ON  ${file}`); continue; }
  const a = load(off, file), b = load(on, file);
  const sameReply = replies(a) === replies(b), sameTrace = trace(a) === trace(b);
  console.log(`${sameReply ? 'reply=same ' : 'reply=MOVED'} ${sameTrace ? 'trace=same ' : 'trace=MOVED'}  ${a.case}`);
}
