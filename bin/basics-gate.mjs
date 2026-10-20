#!/usr/bin/env node
// We Build for Good: Basics Gate CLI.
// Exit codes: 0 no P1 failures, 1 a P1 check failed (or, with --strict, a check could not run),
// 2 bad options, bad config, or browsers not installed.
import { parseArgs, loadConfig, selectProducts, UsageError } from '../lib/config.mjs';
import { runGate } from '../lib/gate.mjs';

const HELP = `
We Build for Good: Basics Gate (wb4g-basics-gate)

Loads each product's pages in real Chromium and WebKit at phone and desktop sizes and checks
the basics a visitor hits first. Read-only: it never submits a form, logs in or pays.

Usage:
  wb4g-basics-gate [options]

Options:
  --config <file>      Product config (default: ./basics-gate.config.json)
  --product <id[,id]>  Only these products
  --base <url>         Test a preview (or another page of the same site) instead of "base"
  --pages <a,b>        Pages relative to the base ("" = home, @base = the base URL itself)
  --out <dir>          Report directory (default: ./basics-gate-output)
  --concurrency <n>    Products checked in parallel (default 4)
  --skip-perf          Skip check 17 (Lighthouse); it is reported as NOT_RUN
  --strict             Exit 1 when any check could not run (NOT_RUN), not only on P1 failures
  --json               Print the results as JSON
  --help, -h           Show this help

Exit codes: 0 no P1 failures, 1 blocked, 2 bad options, config or missing browsers.
`;

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    throw new UsageError('Playwright is not installed. Run: npm install (in this repo), then npx playwright install chromium webkit');
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(HELP); return 0; }
  if (opts.errors.length) { opts.errors.forEach(e => console.error(`Error: ${e}`)); return 2; }
  let products, pw;
  try {
    products = selectProducts(loadConfig(opts.config).products, opts.product);
    if (opts.base && products.length !== 1) throw new UsageError('--base needs exactly one product (use --product).');
    pw = await loadPlaywright();
  } catch (e) {
    if (e instanceof UsageError) { console.error(`Error: ${e.message}`); return 2; }
    throw e;
  }
  let run;
  try {
    run = await runGate(products, opts, pw);
  } catch (e) {
    if (/Executable doesn't exist|browserType\.launch/i.test(e.message)) {
      console.error('Error: browsers are not installed. Run: npx playwright install chromium webkit');
      return 2;
    }
    throw e;
  }
  if (opts.json) console.log(JSON.stringify({ date: run.date, seconds: run.secs, ...run.summary, results: run.results }, null, 1));
  else {
    console.log(run.md.split('\n## Failures')[0]);
    console.log(`report: ${run.reportPath}`);
    if (run.summary.blocked) console.log(run.summary.p1Failures.length ? 'BLOCKED: P1 failures above.' : 'BLOCKED (--strict): some checks did not run.');
    else if (run.summary.notRun.length) console.log('PASSED WITH GAPS: no P1 failures, but some checks did not run (listed above).');
    else console.log('PASSED: no P1 failures and every check ran.');
  }
  return run.summary.blocked ? 1 : 0;
}

main().then(
  code => { process.exitCode = code; },
  err => { console.error(`Fatal error: ${err.message}`); process.exitCode = 1; }
);
