import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, validateConfig, selectProducts, buildTargets, UsageError } from '../lib/config.mjs';
import { trackingProbe, textSizeAdjustSources } from '../lib/fetch-checks.mjs';
import { evaluate, summarise } from '../lib/gate.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'bin', 'basics-gate.mjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'basics-gate-'));

function run(args, cwd = ROOT) {
  return new Promise(resolve => {
    execFile(process.execPath, [BIN, ...args], { cwd, timeout: 240000 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr });
    });
  });
}

function serve(handler) {
  return new Promise(resolve => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, origin: `http://127.0.0.1:${srv.address().port}` }));
  });
}

function serveDir(dir, extra = () => false) {
  return serve((q, res) => {
    const u = new URL(q.url, 'http://x');
    if (extra(u, res)) return;
    const name = u.pathname === '/' ? 'index.html' : u.pathname.slice(1) + (path.extname(u.pathname) ? '' : '.html');
    const file = path.join(dir, name);
    if (!file.startsWith(dir) || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(file));
  });
}

const product = over => ({ id: 'x', base: 'https://x.test/', kind: 'site', pages: [''], allowHosts: ['x.test'], ...over });

// ---------- options and config ----------

test('parseArgs rejects unknown options and bad values instead of ignoring them', () => {
  assert.deepEqual(parseArgs(['--prodcut', 'a']).errors, ['Unknown option: --prodcut', 'Unknown option: a']);
  assert.match(parseArgs(['--concurrency', 'zero']).errors[0], /whole number/);
  assert.match(parseArgs(['--base', 'not a url']).errors[0], /not a URL/);
  assert.match(parseArgs(['--config']).errors[0], /needs a value/);
  const o = parseArgs(['--product=a,b', '--pages', ',about', '--strict']);
  assert.deepEqual(o.product, ['a', 'b']);
  assert.deepEqual(o.pages, ['', 'about']);
  assert.equal(o.strict, true);
});

test('validateConfig names every problem and accepts the shipped example', () => {
  assert.deepEqual(validateConfig({}), ['Config needs a non-empty "products" array.']);
  const errs = validateConfig({ products: [{ id: 'a', base: 'ftp://a', kind: 'web', pages: [], allowHosts: [] }, { id: 'a', base: 'https://a/', kind: 'site', pages: [''], allowHosts: ['a'], coreLoop: [{ nope: 1 }] }] });
  assert.ok(errs.some(e => /"base" must be an http/.test(e)));
  assert.ok(errs.some(e => /"kind" must be/.test(e)));
  assert.ok(errs.some(e => /"pages" must be/.test(e)));
  assert.ok(errs.some(e => /"allowHosts"/.test(e)));
  assert.ok(errs.some(e => /duplicate id/.test(e)));
  assert.ok(errs.some(e => /coreLoop\[0\] needs one of/.test(e)));
  const example = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', 'basics-gate.config.json'), 'utf8'));
  assert.deepEqual(validateConfig(example), []);
});

test('selectProducts refuses an unknown id rather than running nothing', () => {
  assert.throws(() => selectProducts([product()], ['y']), UsageError);
  assert.equal(selectProducts([product()], ['x']).length, 1);
});

test('buildTargets: --base on another page of the same site tests only that page', () => {
  const p = product({ pages: ['', 'pricing'], primary: 'a' });
  const t = buildTargets(p, { base: 'https://x.test/tools' });
  assert.deepEqual(t.urls, ['https://x.test/tools']);
  assert.equal(t.primaryUrl, null);
  const preview = buildTargets(p, { base: 'https://preview.x.test/' });
  assert.deepEqual(preview.urls, ['https://preview.x.test/', 'https://preview.x.test/pricing']);
  assert.ok(preview.allow.includes('preview.x.test'));
  assert.equal(preview.overridden, true);
});

test('CLI: no config, unknown product and bad options exit 2', async () => {
  const dir = tmp();
  const none = await run([], dir);
  assert.equal(none.code, 2);
  assert.match(none.stderr, /No basics-gate.config.json/);
  const cfg = path.join(dir, 'c.json');
  fs.writeFileSync(cfg, JSON.stringify({ products: [product()] }));
  const unknown = await run(['--config', cfg, '--product', 'nope'], dir);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /Unknown product id: nope/);
  assert.equal((await run(['--bogus'], dir)).code, 2);
});

// ---------- individual checks ----------

test('check 15: tracking probe passes good URLs and fails a 404 and a query-dropping redirect', async () => {
  const { srv, origin } = await serve((q, res) => {
    const u = new URL(q.url, 'http://x');
    if (u.pathname === '/ok') { res.writeHead(200); res.end('ok'); }
    else if (u.pathname === '/redir-drops') { res.writeHead(301, { location: '/ok' }); res.end(); }
    else if (u.pathname === '/redir-keeps') { res.writeHead(301, { location: '/ok' + u.search }); res.end(); }
    else { res.writeHead(404); res.end(); }
  });
  try {
    assert.equal(await trackingProbe(origin + '/ok'), null);
    assert.equal(await trackingProbe(origin + '/redir-keeps'), null);
    assert.match(await trackingProbe(origin + '/redir-drops'), /dropped the query string/);
    assert.match(await trackingProbe(origin + '/missing'), /-> 404/);
  } finally { srv.close(); }
});

test('check 10: text-size-adjust must be on html or body, comments do not count', () => {
  assert.deepEqual(textSizeAdjustSources([{ src: 'a.css', text: 'html{-webkit-text-size-adjust:100%}' }]), ['a.css']);
  assert.deepEqual(textSizeAdjustSources([{ src: 'b.css', text: '/* html{text-size-adjust:none} */ p{color:red}' }]), []);
  assert.deepEqual(textSizeAdjustSources([{ src: 'c.css', text: '.x{text-size-adjust:100%}' }]), []);
});

// Regression: the original gate reported PASS for checks 2 and 4 when the page never rendered,
// and SKIP (not a gap) when no core loop was configured.
test('a page that fails to render fails the render checks instead of passing them', () => {
  const p = product({ primary: 'a.cta' });
  const t = buildTargets(p);
  const rendered = [
    { engine: 'chromium', vk: 'ios-390x664', url: t.urls[0], error: 'net::ERR_CONNECTION_REFUSED' },
    { engine: 'webkit', vk: 'ios-375x667', url: t.urls[0], error: 'Could not connect' },
  ];
  const st = { seo: [], crawl: { sitemapSameOrigin: 0, orphans: [], crawled: 0 }, hiddenCss: true, cssSources: [] };
  const C = evaluate(p, t, rendered, st, { checked: 0, found: 0, bad: [], errors: [] });
  for (const n of [2, 3, 4, 13, 14]) assert.equal(C[n].status, 'FAIL', `check ${n} should fail, got ${C[n].status}`);
  assert.equal(C[11].status, 'NOT_RUN');
  assert.equal(C[6].status, 'NOT_RUN');
});

test('summarise: P1 failures and crashes block; NOT_RUN blocks only with --strict', () => {
  const ok = { id: 'a', checks: Object.fromEntries([...Array(17)].map((_, i) => [i + 1, { sev: 'P2', status: 'PASS', ev: [] }])) };
  ok.checks[16] = { sev: 'P1', status: 'NOT_RUN', ev: [] };
  assert.equal(summarise([ok]).blocked, false);
  assert.deepEqual(summarise([ok]).notRun, ['a check 16']);
  assert.equal(summarise([ok], true).blocked, true);
  assert.equal(summarise([{ id: 'b', error: 'boom', checks: {} }]).blocked, true);
  const failing = { id: 'c', checks: { ...ok.checks, 3: { sev: 'P1', status: 'FAIL', ev: ['x'] } } };
  assert.deepEqual(summarise([failing]).p1Failures, ['c check 3']);
});

// ---------- end to end against local fixture sites (needs Playwright browsers) ----------

let browsersReady = true;
try {
  const { chromium, webkit } = await import('playwright');
  browsersReady = fs.existsSync(chromium.executablePath()) && fs.existsSync(webkit.executablePath());
} catch { browsersReady = false; }
const e2e = browsersReady ? test : test.skip;

e2e('end to end: the good fixture passes and the bad fixture fails the right P1 checks', { timeout: 300000 }, async () => {
  const fixtures = path.join(ROOT, 'test', 'fixtures');
  const good = await serveDir(path.join(fixtures, 'good'), (u, res) => {
    if (u.pathname === '/sitemap.xml') { res.writeHead(200, { 'content-type': 'application/xml' }); res.end(`<?xml version="1.0"?><urlset><url><loc>${good.origin}/</loc></url><url><loc>${good.origin}/about</loc></url></urlset>`); return true; }
    if (u.pathname === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('User-agent: *\nAllow: /\n'); return true; }
    return false;
  });
  const bad = await serveDir(path.join(fixtures, 'bad'));
  const dir = tmp();
  try {
    const host = o => new URL(o).host;
    const cfg = path.join(dir, 'basics-gate.config.json');
    fs.writeFileSync(cfg, JSON.stringify({ products: [
      { id: 'good', base: good.origin + '/', kind: 'site', pages: ['', 'about'], primary: 'a.cta', allowHosts: [host(good.origin)], coreLoop: [{ goto: '' }, { click: 'a.cta' }, { expect: 'h1' }] },
      { id: 'bad', base: bad.origin + '/', kind: 'site', pages: [''], primary: 'a.cta', allowHosts: [host(bad.origin)] },
    ] }));
    const r = await run(['--skip-perf', '--json', '--out', path.join(dir, 'out')], dir);
    assert.equal(r.code, 1, r.stderr);
    const out = JSON.parse(r.stdout);
    const byId = Object.fromEntries(out.results.map(x => [x.id, x.checks]));
    const p1Fails = id => Object.entries(byId[id]).filter(([, c]) => c.sev === 'P1' && c.status === 'FAIL').map(([n]) => Number(n));
    assert.deepEqual(p1Fails('good'), [], JSON.stringify(byId.good, null, 1));
    assert.equal(byId.good[16].status, 'PASS');
    assert.equal(byId.good[17].status, 'NOT_RUN');
    for (const n of [3, 4, 10, 14]) assert.ok(p1Fails('bad').includes(n), `bad fixture should fail check ${n}: ${JSON.stringify(byId.bad[n])}`);
    assert.match(byId.bad[4].ev.join(' '), /fixture error/);
    assert.equal(byId.bad[16].status, 'NOT_RUN');
    assert.ok(fs.existsSync(path.join(dir, 'out', 'latest.json')));
    // The good product alone passes; --strict then blocks on the skipped Lighthouse run.
    const goodOnly = await run(['--product', 'good', '--skip-perf', '--out', path.join(dir, 'out2')], dir);
    assert.equal(goodOnly.code, 0, goodOnly.stdout + goodOnly.stderr);
    assert.match(goodOnly.stdout, /PASSED WITH GAPS/);
    const strict = await run(['--product', 'good', '--skip-perf', '--strict', '--out', path.join(dir, 'out3')], dir);
    assert.equal(strict.code, 1);
  } finally { good.srv.close(); bad.srv.close(); }
});
