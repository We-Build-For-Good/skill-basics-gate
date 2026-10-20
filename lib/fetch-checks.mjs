// Checks that read the served HTML and CSS (what a crawler or a slow phone gets first),
// not the rendered DOM.

const UA_HDR = { 'user-agent': 'Mozilla/5.0 wb4g-basics-gate' };

export async function get(u, method = 'GET') {
  try {
    return await fetch(u, { method, redirect: 'follow', headers: UA_HDR, signal: AbortSignal.timeout(20000) });
  } catch {
    return { status: 0, url: u, headers: new Headers(), text: async () => '' };
  }
}

export const normPath = u => { const x = new URL(u); return x.pathname.replace(/\/+$/, '') || '/'; };
export const meta = (h, re) => { const m = h.match(re); return m ? m[1].trim() : null; };
const bodyText = h => h.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const sheetHrefs = h => [...h.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)].map(m => meta(m[0], /href=["']([^"']+)["']/i)).filter(Boolean);

/** Served CSS for a page: inline <style> blocks plus up to six linked stylesheets. */
export async function servedCss(html, pageUrl, fetcher = get) {
  const sources = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => ({ src: 'inline <style> on ' + pageUrl, text: m[1] }));
  for (const s of sheetHrefs(html).slice(0, 6)) {
    const href = new URL(s, pageUrl).href;
    const r = await fetcher(href);
    if (r.status === 200) sources.push({ src: href, text: await r.text() });
  }
  return sources;
}

/** Check 10: text-size-adjust of 100% or none on html or body. Returns the stylesheets that set it. */
export function textSizeAdjustSources(cssSources) {
  const re = /(?:-webkit-)?text-size-adjust\s*:\s*(100%|none)/i;
  const hits = [];
  for (const sc of cssSources) {
    for (const m of sc.text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sels = m[1].split(',').map(x => x.trim().toLowerCase());
      if ((sels.includes('html') || sels.includes('body')) && re.test(m[2])) { hits.push(sc.src); break; }
    }
  }
  return [...new Set(hits)];
}

/** Checks 5, 6 and 7 (static half): served SEO tags, sitemap, inbound links and the [hidden] rule. */
export async function staticChecks(t, p, rendered) {
  const origin = new URL(t.base).origin;
  const out = { seo: [], sitemap: {}, hiddenCss: null, crawl: null, cssSources: [] };
  const sm = await get(origin + '/sitemap.xml');
  const rb = await get(origin + '/robots.txt');
  let locs = [];
  if (sm.status === 200) {
    const b = await sm.text();
    locs = [...b.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]);
    out.sitemap.isXml = /<urlset|<sitemapindex/.test(b);
  }
  out.sitemap.status = sm.status; out.robots = rb.status; out.sitemap.n = locs.length;
  const smPaths = new Set(locs.filter(l => { try { return new URL(l).origin === origin || t.overridden; } catch { return false; } }).map(l => normPath(l)));
  const smPagesRel = p.sitemapPages || [p.pages[0]];
  for (let i = 0; i < t.urls.length; i++) {
    const url = t.urls[i];
    const x = await get(url);
    const h = await x.text();
    const r = {
      url, status: x.status,
      title: meta(h, /<title[^>]*>([^<]*)<\/title>/i),
      desc: meta(h, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || meta(h, /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i),
      canon: meta(h, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i),
      og: meta(h, /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i),
      h1: /<h1[\s>]/i.test(h), textLen: bodyText(h).length,
    };
    r.missing = [];
    if (x.status !== 200) r.missing.push('status ' + x.status);
    for (const k of ['title', 'desc', 'canon', 'og']) if (!r[k]) r.missing.push(k);
    if (!r.h1 && r.textLen < 80) r.missing.push('no h1 and no served body text (client-rendered shell)');
    const rel = t.pages[i];
    const inScope = p.sitemap !== false && (t.overridden ? i === 0 : smPagesRel.includes(rel));
    if (inScope && !smPaths.has(normPath(url))) r.missing.push('not in sitemap.xml');
    out.seo.push(r);
    out.cssSources.push(...await servedCss(h, url));
  }
  if (p.sitemap !== false) {
    if (sm.status !== 200) out.seo.push({ url: origin + '/sitemap.xml', missing: ['sitemap.xml status ' + sm.status] });
    if (rb.status !== 200) out.seo.push({ url: origin + '/robots.txt', missing: ['robots.txt status ' + rb.status] });
  }
  out.hiddenCss = /\[hidden\][^{}]*\{[^}]*display\s*:\s*none/i.test(out.cssSources.map(s => s.text).join('\n'));
  // Check 6: crawl the rendered links of the tested pages, then up to 40 fetched pages.
  const linked = new Map(); // normPath -> Set(from)
  const addLinks = (from, hrefs) => {
    for (const l of hrefs) {
      try {
        const u = new URL(l, from);
        if (u.origin !== origin) continue;
        const k = normPath(u.href);
        if (k === normPath(from)) continue;
        if (!linked.has(k)) linked.set(k, new Set());
        linked.get(k).add(normPath(from));
      } catch {}
    }
  };
  for (const r of rendered) if (r.vk === 'desk-1280x800' && r.links) addLinks(r.url, r.links);
  const seen = new Set(t.urls.map(normPath));
  const queue = [...linked.keys()].filter(k => !seen.has(k));
  let fetched = 0;
  while (queue.length && fetched < 40) {
    const k = queue.shift();
    if (seen.has(k)) continue;
    seen.add(k); fetched++;
    if (/\.(png|jpe?g|gif|svg|webp|pdf|ico|xml|txt|css|js|zip|mp4)$/i.test(k)) continue;
    const u = origin + k;
    const x = await get(u);
    if (x.status !== 200 || !/html/.test(x.headers.get('content-type') || '')) continue;
    const h = await x.text();
    const before = new Set(linked.keys());
    addLinks(u, [...h.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)].map(m => m[1]));
    for (const nk of linked.keys()) if (!before.has(nk) && !seen.has(nk)) queue.push(nk);
  }
  const smSame = locs.filter(l => { try { return new URL(l).origin === origin; } catch { return false; } });
  const orphans = [];
  for (const l of smSame.slice(0, 80)) { const k = normPath(l); if (!linked.has(k) || ![...linked.get(k)].some(f => f !== k)) orphans.push(k); }
  out.crawl = { sitemapSameOrigin: smSame.length, crawled: fetched + t.urls.length, orphans };
  return out;
}

/** Check 15: url + ?utm_source=basics-gate must end 200 and keep the query string. Returns null when it passes. */
export async function trackingProbe(url, fetcher = get) {
  const probe = url + (url.includes('?') ? '&' : '?') + 'utm_source=basics-gate';
  const r = await fetcher(probe);
  const final = r.url || probe;
  const keeps = /[?&]utm_source=basics-gate(&|$)/.test(final);
  if (r.status === 200 && keeps) return null;
  return `${probe} -> ${r.status}${r.status === 200 && !keeps ? ' (redirect dropped the query string)' : ''} final ${final}`;
}

/** Check 12 (static half): is the page installable as a standalone app, and does it handle the notch? */
export async function shellStatic(url) {
  const h0 = await (await get(url)).text();
  const cssAll = (await servedCss(h0, url)).map(s => s.text).join('\n');
  let standalone = /apple-mobile-web-app-capable/i.test(h0);
  const why = standalone ? ['apple-mobile-web-app-capable meta'] : [];
  const mlink = meta(h0.match(/<link[^>]+rel=["']manifest["'][^>]*>/i)?.[0] || '', /href=["']([^"']+)["']/i);
  if (mlink) {
    try {
      const mj = JSON.parse(await (await get(new URL(mlink, url).href)).text());
      if (mj.display === 'standalone') { standalone = true; why.push('manifest display:standalone'); }
    } catch {}
  }
  const viewport = meta(h0, /<meta[^>]+name=["']viewport["'][^>]*content=["']([^"']*)["']/i) || '';
  return { standalone, why, viewport, cssInset: /env\(\s*safe-area-inset-/i.test(cssAll) };
}

// Check 17: Lighthouse mobile, performance only, median of three runs.
export const PERF = { lcp: 2500, cls: 0.1, tbt: 200, runs: 3 };
const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

/** Returns {status, ev, note}. Lighthouse is optional: when it is not installed the check is NOT_RUN, never PASS. */
export async function perfCheck(url, chromePath) {
  let lighthouse, chromeLauncher;
  try {
    ({ default: lighthouse } = await import('lighthouse'));
    chromeLauncher = await import('chrome-launcher');
  } catch {
    return { status: 'NOT_RUN', ev: [], note: 'lighthouse is not installed (npm install lighthouse to run check 17)' };
  }
  try {
    const runs = [];
    for (let i = 0; i < PERF.runs; i++) {
      const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ['--headless=new'] });
      try {
        const r = await lighthouse(url, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance'], formFactor: 'mobile', screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2, disabled: false } });
        const a = r.lhr.audits;
        const num = k => a[k]?.numericValue;
        if (num('largest-contentful-paint') == null) throw new Error(r.lhr.runtimeError?.message || 'no LCP');
        runs.push({ lcp: num('largest-contentful-paint'), cls: num('cumulative-layout-shift'), tbt: num('total-blocking-time') });
      } finally { await chrome.kill(); }
    }
    const m = { lcp: median(runs.map(r => r.lcp)), cls: median(runs.map(r => r.cls)), tbt: median(runs.map(r => r.tbt)) };
    const ok = m.lcp <= PERF.lcp && m.cls <= PERF.cls && m.tbt <= PERF.tbt;
    const line = `LCP ${Math.round(m.lcp)}ms, CLS ${m.cls.toFixed(3)}, TBT ${Math.round(m.tbt)}ms (median of ${runs.length}) ${url}`;
    return { status: ok ? 'PASS' : 'FAIL', ev: [line], note: line, metrics: m };
  } catch (e) {
    return { status: 'NOT_RUN', ev: [], note: 'lighthouse error: ' + String(e.message).split('\n')[0].slice(0, 160) };
  }
}
