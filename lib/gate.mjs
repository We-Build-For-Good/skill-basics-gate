// Runs every check for each product and turns the measurements into results.
// Statuses: PASS, FAIL, WARN (never blocks), SKIP (does not apply to this product),
// NOT_RUN (applies, but could not be checked: shown in the report, and blocks under --strict).
import fs from 'node:fs';
import path from 'node:path';
import { buildTargets } from './config.mjs';
import { browserPass, honestyCheck, runCoreLoop, shellProbe, makeViewports, label, SHORT_VP } from './render.mjs';
import { staticChecks, trackingProbe, shellStatic, textSizeAdjustSources, perfCheck } from './fetch-checks.mjs';

export const CHECKS = {
  1: ['Fit', 'P1'], 2: ['CTA visible', 'P1'], 3: ['No h-scroll', 'P1'], 4: ['Console/net/hosts', 'P1'],
  5: ['SEO served', 'P2'], 6: ['Inbound links', 'P2'], 7: ['[hidden]', 'P2'], 8: ['CTA honesty', 'P2'],
  9: ['Tap targets', 'P3'], 10: ['Text-size-adjust', 'P1'], 11: ['Fits at 120% text', 'P1 app/P2 site'],
  12: ['App shell', 'P1'], 13: ['Round stays round', 'P2'], 14: ['Media not distorted', 'P1'],
  15: ['Tracking links', 'P1'], 16: ['Core loop works', 'P1'], 17: ['Fast (Lighthouse)', 'P2'],
};
export const ALL = Object.keys(CHECKS).map(Number);

const mk = (sev, status, ev = [], note = '') => ({ sev, status, ev, note });

/** Turns render records and static results into the 17 check results. Pure: no browser, no network. */
export function evaluate(p, t, rendered, st, honesty) {
  const C = {};
  const rr = f => rendered.filter(f);
  const rc = f => rendered.filter(r => r.engine === 'chromium' && f(r)); // checks 3-9 are Chromium only
  const renderErrs = f => rr(r => r.error && f(r)).map(r => `${label(r)} ${r.url}: render error ${r.error}`);
  // 1
  if (p.kind === 'app') {
    const ev = rr(r => r.fit && r.fit.length).map(r => `${label(r)}: ${r.fit.join('; ')}`);
    const errs = renderErrs(() => true);
    C[1] = mk('P1', ev.length || errs.length ? 'FAIL' : 'PASS', [...ev, ...errs]);
  } else C[1] = mk('P1', 'SKIP', [], 'site kind');
  // 2 (for sites, failing only at the short 375x548 viewport is P2)
  if (t.primary && t.primaryUrl) {
    const bad2 = rr(r => r.cta && r.cta.length);
    const ev = bad2.map(r => `${label(r)}: ${r.cta.join('; ')}`);
    const errs = renderErrs(r => r.url === t.primaryUrl && !r.state && r.vk !== 'desk-1280x800');
    const onlyShort = p.kind !== 'app' && bad2.length && !errs.length && bad2.every(r => r.vk === SHORT_VP);
    C[2] = mk(onlyShort ? 'P2' : 'P1', ev.length || errs.length ? 'FAIL' : 'PASS', [...ev, ...errs]);
  } else C[2] = mk('P1', 'SKIP', [], t.primary ? 'home page ("") not among the tested pages' : 'no "primary" selector in config');
  // 3
  {
    const ev = rc(r => r.hscroll).map(r => `${r.vk} ${r.url}: ${r.hscroll}`);
    const errs = renderErrs(r => r.engine === 'chromium' && !r.state);
    C[3] = mk('P1', ev.length || errs.length ? 'FAIL' : 'PASS', [...ev, ...errs]);
  }
  // 4
  {
    const ev = [];
    for (const r of rc(r => r.vk === 'ios-390x664' && !r.state)) {
      if (r.error) ev.push(`${r.url}: render error ${r.error}`);
      if (r.errs?.length) ev.push(`${r.url}: console errors x${r.errs.length}: ${r.errs.slice(0, 2).join(' | ')}`);
      if (r.fails?.length) ev.push(`${r.url}: failed/4xx requests x${r.fails.length}: ${r.fails.slice(0, 2).join(' | ')}`);
      if (r.offHosts?.length) ev.push(`${r.url}: request to non-allowed host(s): ${r.offHosts.join(', ')}`);
    }
    C[4] = mk('P1', ev.length ? 'FAIL' : 'PASS', ev);
  }
  // 5
  {
    const ev = st.seo.filter(s => s.missing.length).map(s => `${s.url}: ${s.missing.join(', ')}`);
    C[5] = mk('P2', ev.length ? 'FAIL' : 'PASS', ev);
  }
  // 6
  {
    const o = st.crawl.orphans;
    C[6] = st.crawl.sitemapSameOrigin
      ? mk('P2', o.length ? 'FAIL' : 'PASS', o.map(x => `${x} has no inbound link from any crawled page`), `crawled ${st.crawl.crawled}`)
      : mk('P2', p.sitemap === false ? 'SKIP' : 'NOT_RUN', [], 'no same-origin sitemap URLs to check');
  }
  // 7
  {
    const ev = [];
    if (!st.hiddenCss) ev.push('no [hidden]{display:none} rule found in served CSS');
    for (const r of rc(r => r.vk === 'ios-390x664' && r.hid?.length)) ev.push(`${r.url}: [hidden] elements displayed: ${r.hid.join(', ')}`);
    C[7] = mk('P2', ev.length ? 'FAIL' : 'PASS', ev);
  }
  // 8
  {
    const note = `${honesty.checked}/${honesty.found} CTA targets rendered`;
    if (honesty.bad.length) C[8] = mk('P2', 'FAIL', honesty.bad.map(b => `"${b.label}" -> ${b.href} says "${b.match}": ...${b.excerpt}...`), note);
    else if (honesty.errors.length) C[8] = mk('P2', 'NOT_RUN', honesty.errors, `${note}; ${honesty.errors.length} could not be loaded`);
    else C[8] = mk('P2', 'PASS', [], note);
  }
  // 9 (never blocks: 44x44 is the recommended size, WCAG 2.2 AA's minimum is 24x24)
  {
    const per = rc(r => r.vk === 'ios-390x664' && r.taps);
    const all = per.flatMap(r => r.taps.map(x => ({ ...x, url: r.url })));
    const under24 = all.filter(x => x.w < 24 || x.h < 24).length;
    const worst = all.sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h)).slice(0, 3);
    C[9] = mk('P3', all.length ? 'WARN' : 'PASS', worst.map(w => `${w.w}x${w.h} "${w.t}"`), `${all.length} under 44x44, ${under24} under 24x24`);
  }
  // 10
  {
    const hits = textSizeAdjustSources(st.cssSources);
    C[10] = hits.length
      ? mk('P1', 'PASS', [], 'set in ' + hits.join(', '))
      : mk('P1', 'FAIL', [`missing: no text-size-adjust:100%/none on html or body in ${st.cssSources.length} served stylesheet(s)`]);
  }
  // 11
  {
    const sev = p.kind === 'app' ? 'P1' : 'P2';
    const ran = rr(r => r.big);
    const ev = ran.flatMap(r => [...(r.big.fit || []), ...(r.big.cta || []).map(x => 'CTA ' + x)].map(x => `${label(r)} @120%: ${x}`));
    const applicable = ran.filter(r => r.big.fit || r.big.cta);
    const errs = renderErrs(r => t.fitUrls.includes(r.url) && r.vk !== 'desk-1280x800');
    if (applicable.length) C[11] = mk(sev, ev.length ? 'FAIL' : 'PASS', ev, `${applicable.length} renders at 120%`);
    else if (errs.length) C[11] = mk(sev, 'NOT_RUN', errs, 'fit pages did not render');
    else C[11] = mk(sev, 'SKIP', [], 'no fit check or primary on the fit page');
  }
  // 12 is async (needs fetches); filled in by runProduct.
  // 13
  {
    const seen = new Set(); const ev = [];
    const add = k => { if (!seen.has(k)) { seen.add(k); ev.push(k); } };
    for (const r of rr(r => r.round && r.round.length)) for (const x of r.round) add(`${label(r)}: ${x}`);
    for (const r of rr(r => r.big && r.big.round && r.big.round.length)) for (const x of r.big.round) add(`${label(r)} @120%: ${x}`);
    const errs = renderErrs(() => true);
    C[13] = mk('P2', ev.length || errs.length ? 'FAIL' : 'PASS', [...ev, ...errs]);
  }
  // 14
  {
    const seen = new Set(); const ev = [];
    const add = k => { if (!seen.has(k)) { seen.add(k); ev.push(k); } };
    for (const r of rr(r => r.media && r.media.length)) for (const x of r.media) add(`${label(r)} ${new URL(r.url).pathname}: ${x}`);
    for (const r of rr(r => r.big && r.big.media && r.big.media.length)) for (const x of r.big.media) add(`${label(r)} @120% ${new URL(r.url).pathname}: ${x}`);
    const errs = renderErrs(() => true);
    C[14] = mk('P1', ev.length || errs.length ? 'FAIL' : 'PASS', [...ev, ...errs]);
  }
  return C;
}

async function appShellCheck(browser, device, p, t) {
  if (!p.appShell) return mk('P1', 'SKIP', [], 'appShell not set');
  const ev = [];
  let anyStandalone = false;
  const shellPages = t.overridden ? [t.urls[0]] : (p.appShellPages || ['']).map(pg => new URL(pg, t.base).href);
  for (const su of shellPages) {
    const tagp = new URL(su).pathname;
    const s = await shellStatic(su);
    let probe = null;
    try { probe = await shellProbe(browser, device, su); } catch (e) { ev.push(`${tagp}: render error ${e.message.split('\n')[0].slice(0, 100)}`); }
    if (probe && !['none', 'contain'].includes(probe.ov.html) && !['none', 'contain'].includes(probe.ov.body)) ev.push(`${tagp}: overscroll-behavior-y is html:"${probe.ov.html}" body:"${probe.ov.body}" (needs none or contain): page rubber-bands`);
    if (s.standalone) {
      anyStandalone = true;
      if (!/viewport-fit\s*=\s*cover/i.test(s.viewport)) ev.push(`${tagp}: standalone (${s.why.join(', ')}) but viewport meta lacks viewport-fit=cover (viewport: "${s.viewport}")`);
      if (!s.cssInset && !probe?.jsInset) ev.push(`${tagp}: standalone (${s.why.join(', ')}) but no served CSS or loaded script uses env(safe-area-inset-*)`);
    }
  }
  return mk('P1', ev.length ? 'FAIL' : 'PASS', ev, `${shellPages.map(u => new URL(u).pathname).join(', ')}${anyStandalone ? ' standalone' : ' not standalone'}`);
}

async function coreLoopCheck(browsers, device, p, t) {
  if (!p.coreLoop) return mk('P1', 'NOT_RUN', [], 'no coreLoop in config: nobody has checked that the product works');
  const ev = [];
  for (const engine of ['chromium', 'webkit']) {
    let r;
    try { r = await runCoreLoop(browsers[engine], engine, p.coreLoop, t.base, device); } catch (e) { r = { engine, failed: 'loop crashed: ' + e.message.slice(0, 120), errs: [] }; }
    if (r.failed) ev.push(`${engine}: ${r.failed}`);
    if (r.errs.length) ev.push(`${engine}: console errors x${r.errs.length}: ${r.errs.slice(0, 3).join(' | ')}`);
  }
  return mk('P1', ev.length ? 'FAIL' : 'PASS', ev, p.coreLoopPartial ? `partial: ${p.coreLoopPartial}` : '');
}

export async function runProduct(browsers, VP, p, opts, shots) {
  const t = buildTargets(p, opts);
  const rendered = await browserPass(browsers, VP, t, p, shots);
  const st = await staticChecks(t, p, rendered);
  const honesty = await honestyCheck(browsers.chromium, t, rendered);
  const C = evaluate(p, t, rendered, st, honesty);
  C[12] = await appShellCheck(browsers.chromium, VP['ios-390x664'], p, t);
  {
    const ev = [];
    for (const u of new Set([t.base, t.base.replace(/\/+$/, '')])) { const e = await trackingProbe(u); if (e) ev.push(e); }
    C[15] = mk('P1', ev.length ? 'FAIL' : 'PASS', ev);
  }
  C[16] = await coreLoopCheck(browsers, VP.loop, p, t);
  C[17] = mk('P2', 'NOT_RUN', [], 'not run yet');
  return { id: p.id, kind: p.kind, base: t.base, pages: t.urls, checks: C };
}

/** Exit status for a set of results: P1 failures and crashed products block; NOT_RUN blocks only under strict. */
export function summarise(results, strict = false) {
  const p1Failures = [];
  const notRun = [];
  for (const r of results) {
    if (r.error) { p1Failures.push(`${r.id} crashed: ${r.error}`); continue; }
    for (const n of ALL) {
      const c = r.checks[n];
      if (c.status === 'FAIL' && c.sev === 'P1') p1Failures.push(`${r.id} check ${n}`);
      if (c.status === 'NOT_RUN') notRun.push(`${r.id} check ${n}`);
    }
  }
  const blocked = p1Failures.length > 0 || (strict && notRun.length > 0);
  return { p1Failures, notRun, blocked };
}

export function renderMarkdown({ date, secs, results, summary, opts, shots }) {
  const cell = c => (c.status === 'WARN' ? `WARN (${c.note.split(' ')[0]})` : c.status);
  let md = `# Basics Gate run ${date}\n\nRun time: ${secs}s. Products: ${results.length}. ${opts.base ? 'Base override: ' + opts.base : 'Target: configured base URLs.'}\n\n`;
  md += '| Product | ' + ALL.map(n => `${n} ${CHECKS[n][0]} (${CHECKS[n][1]})`).join(' | ') + ' |\n|---|' + '---|'.repeat(ALL.length) + '\n';
  for (const r of results) md += `| ${r.id} | ` + ALL.map(n => cell(r.checks[n])).join(' | ') + ' |\n';
  md += `\nP1 failures: ${summary.p1Failures.length ? summary.p1Failures.join(', ') : 'none'}\n`;
  md += `Not run (not checked, so not passed): ${summary.notRun.length ? summary.notRun.join(', ') : 'none'}\n\n## Failures and gaps with evidence\n`;
  for (const r of results) for (const n of ALL) {
    const c = r.checks[n];
    if (!['FAIL', 'WARN', 'NOT_RUN'].includes(c.status)) continue;
    md += `\n### ${r.id} / ${n} ${CHECKS[n][0]} (${c.sev}, ${c.status})${c.note ? ' - ' + c.note : ''}\n` + c.ev.slice(0, 12).map(e => `- ${e}`).join('\n') + '\n';
  }
  const shotFiles = fs.existsSync(shots) ? fs.readdirSync(shots) : [];
  md += `\nScreenshots (failures only): ${shotFiles.length ? shots : 'none'}\n`;
  return md;
}

/** Launches the browsers, runs every product, then Lighthouse one product at a time. */
export async function runGate(products, opts, pw) {
  const t0 = Date.now();
  const date = new Date().toISOString().slice(0, 10);
  const out = path.resolve(opts.out || 'basics-gate-output');
  const shots = path.join(out, date + '-screens');
  fs.mkdirSync(shots, { recursive: true });
  const VP = makeViewports(pw.devices);
  const browsers = { chromium: await pw.chromium.launch(), webkit: await pw.webkit.launch() };
  const results = [];
  const queue = [...products];
  try {
    await Promise.all(Array.from({ length: Math.min(opts.concurrency || 4, queue.length) }, async () => {
      while (queue.length) {
        const p = queue.shift();
        if (!opts.json) process.stderr.write(`running ${p.id}\n`);
        try { results.push(await runProduct(browsers, VP, p, opts, shots)); }
        catch (e) {
          results.push({ id: p.id, kind: p.kind, base: p.base, pages: [], error: e.message.split('\n')[0],
            checks: Object.fromEntries(ALL.map(n => [n, mk(CHECKS[n][1].slice(0, 2), 'NOT_RUN', [], 'gate crashed on this product')])) });
        }
      }
    }));
  } finally {
    await browsers.chromium.close();
    await browsers.webkit.close();
  }
  // Lighthouse runs after everything else, one product at a time, so parallel browsers do not skew the numbers.
  for (const r of results) {
    if (r.error) continue;
    if (opts.skipPerf) { r.checks[17] = mk('P2', 'NOT_RUN', [], '--skip-perf'); continue; }
    if (!opts.json) process.stderr.write(`perf ${r.id}\n`);
    const res = await perfCheck(r.pages[0], pw.chromium.executablePath());
    r.checks[17] = { sev: 'P2', ...res };
  }
  results.sort((a, b) => products.findIndex(p => p.id === a.id) - products.findIndex(p => p.id === b.id));
  const secs = Math.round((Date.now() - t0) / 1000);
  const summary = summarise(results, opts.strict);
  const md = renderMarkdown({ date, secs, results, summary, opts, shots });
  const reportPath = path.join(out, date + '.md');
  fs.writeFileSync(reportPath, md);
  fs.writeFileSync(path.join(out, 'latest.json'), JSON.stringify({ date, seconds: secs, ...summary, results }, null, 1));
  return { date, secs, results, summary, md, reportPath };
}
