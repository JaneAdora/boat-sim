#!/usr/bin/env node
/**
 * Build assertion (Act 2 plan, stage 0/5): the dev slice harness and the
 * unshipped Act 2 beat data must be absent from production bundles. Run after
 * `npm run build`; exits 1 (failing CI/ship) if any marker leaks into dist.
 *
 * Markers: TB_DEV_HARNESS tags every harness code block; 'drowned-choir'
 * exists only in Act 2 beat data until the act ships (at which point this
 * script's MARKERS list is updated — deliberately, in the ship stage).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../dist/assets', import.meta.url).pathname;
const MARKERS = ['TB_DEV_HARNESS', 'drowned-choir', 'tide-stayed', 'setPersistEnabled'];

let files;
try {
  files = readdirSync(DIST).filter((f) => f.endsWith('.js'));
} catch {
  console.error(`assert-no-harness: no dist/assets — run npm run build first`);
  process.exit(1);
}

const leaks = [];
for (const f of files) {
  const src = readFileSync(join(DIST, f), 'utf8');
  for (const m of MARKERS) {
    if (src.includes(m)) leaks.push(`${f}: contains "${m}"`);
  }
}

if (leaks.length) {
  console.error('assert-no-harness: FAIL — dev harness leaked into the production bundle:');
  for (const l of leaks) console.error('  ' + l);
  process.exit(1);
}
console.log(`assert-no-harness: OK (${files.length} bundle file(s) clean)`);
