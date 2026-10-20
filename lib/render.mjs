// Browser checks: everything that needs a rendered page. Read-only: pages are loaded and
// clicked through, never submitted, logged into or paid for.
import path from 'node:path';

export const CTA_RE = /get started|start now|download|available now/i;
export const BAD_TARGET_RE = /invite-only|waitlist|coming soon/i;
export const ROUND_MAX_ASPECT = 1.35;
export const DESKTOP = 'desk-1280x800';
export const SHORT_VP = 'ios-375x548';
export const ORIG_VP = new Set(['ios-390x664', 'ios-375x667', DESKTOP]); // checks 3 and 4 stay on these

export function makeViewports(devices) {
  const phone = devices['iPhone 13'];
  return {
    'ios-390x664': { ...phone, viewport: { width: 390, height: 664 } },
    'ios-375x667': { ...phone, viewport: { width: 375, height: 667 } },
    [DESKTOP]: { viewport: { width: 1280, height: 800 } },
    // Small phone Safari with toolbars, and a large phone running the site as a Home Screen app
    [SHORT_VP]: { ...phone, viewport: { width: 375, height: 548 } },
    'ios-430x932-standalone': { ...phone, viewport: { width: 430, height: 932 } },
    loop: { ...phone, viewport: { width: 390, height: 844 } },
  };
}

export const label = r => `${r.engine} ${r.vk}${r.state ? ' [state ' + r.state + ']' : ''}`;
const useEngine = (eng, vk) => eng === 'chromium' || vk !== DESKTOP;

async function firstVisible(page, sel) {
  const hs = await page.locator(sel).elementHandles();
  for (const h of hs) {
    const ok = await h.evaluate(e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; });
    if (ok) return h;
  }
  return null;
}

// Check 13: elements meant to be circles stay circles. A pill button (radius 999px, 77x44) has a
// radius of at least half its width but is not meant to be round, so only boxes within
// ROUND_MAX_ASPECT of square count.
export const roundFn = maxAspect => {
  const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const selOf = e => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : '')).slice(0, 60);
  const round = [];
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect();
    if (r.width < 40 || r.height < 40 || !vis(e)) continue;
    const s = getComputedStyle(e);
    if (s.opacity === '0') continue;
    // Decorative: blurred glows, or no border and no background at all
    if (/blur/.test(s.filter) || /blur/.test(s.backdropFilter || '')) continue;
    const noBorder = ['Top', 'Right', 'Bottom', 'Left'].every(k => parseFloat(s['border' + k + 'Width']) < 1);
    if (!['circle', 'img', 'canvas', 'video', 'svg'].includes(e.tagName.toLowerCase()) && noBorder && (s.backgroundColor === 'rgba(0, 0, 0, 0)' || s.backgroundColor === 'transparent') && s.backgroundImage === 'none') continue;
    let isRound = e.tagName.toLowerCase() === 'circle';
    if (!isRound) {
      const corners = [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius];
      isRound = corners.every(c => { const v = parseFloat(c); return c.trim().endsWith('%') ? v >= 50 : v >= r.width * 0.5; });
    }
    if (!isRound || Math.abs(r.width - r.height) <= 2) continue;
    if (Math.max(r.width, r.height) / Math.min(r.width, r.height) > maxAspect) continue;
    round.push(`${selOf(e)} ${r.width.toFixed(1)}x${r.height.toFixed(1)}`);
  }
  return round;
};

// Check 14: images, canvases and videos keep their natural aspect ratio (more than 3% off fails).
export const mediaFn = () => {
  const out = [];
  for (const e of document.querySelectorAll('img,canvas,video')) {
    const s = getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    if (e.offsetWidth < 60) continue;
    if (s.objectFit === 'cover' || s.objectFit === 'contain') continue;
    const tag = e.tagName.toLowerCase();
    const nw = tag === 'img' ? (e.complete ? e.naturalWidth : 0) : tag === 'canvas' ? e.width : e.videoWidth;
    const nh = tag === 'img' ? (e.complete ? e.naturalHeight : 0) : tag === 'canvas' ? e.height : e.videoHeight;
    if (!nw || !nh) continue;
    const px = n => parseFloat(n) || 0;
    const rw = e.offsetWidth - px(s.paddingLeft) - px(s.paddingRight) - px(s.borderLeftWidth) - px(s.borderRightWidth);
    const rh = e.offsetHeight - px(s.paddingTop) - px(s.paddingBottom) - px(s.borderTopWidth) - px(s.borderBottomWidth);
    if (rw <= 0 || rh <= 0) continue;
    const nat = nw / nh, ren = rw / rh;
    if (Math.abs(ren / nat - 1) > 0.03) {
      const sel = (tag + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : '')).slice(0, 60);
      out.push(`${sel} natural ${nat.toFixed(3)} (${nw}x${nh}) rendered ${ren.toFixed(3)} (${rw.toFixed(0)}x${rh.toFixed(0)})`);
    }
  }
  return out;
};

const measureFn = () => {
  const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const hid = [...document.querySelectorAll('[hidden]')].filter(e => getComputedStyle(e).display !== 'none')
    .map(e => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')).slice(0, 60));
  const taps = [...document.querySelectorAll('button,[role=button]')].filter(vis).map(e => {
    const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), t: (e.innerText || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30) };
  }).filter(x => x.w < 44 || x.h < 44).sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h));
  const links = [...document.querySelectorAll('a[href]')].map(a => a.href);
  const ctas = [...document.querySelectorAll('a[href],button')].filter(vis)
    .map(e => ({ t: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60), href: e.tagName === 'A' ? e.href : null }));
  // clientWidth/clientHeight, not innerWidth/innerHeight: under mobile emulation Chromium widens
  // innerWidth to the content, so an overflowing page would measure as fitting.
  const de = document.documentElement;
  return {
    sh: de.scrollHeight, ih: de.clientHeight,
    sw: de.scrollWidth, iw: de.clientWidth,
    hid, taps, links, ctas,
  };
};

// Checks 1 and 2 on a loaded page (reused by check 11 at 120% text).
async function fitAndCta(page, t, p, isPrimaryPage, vk, sh, ih) {
  const out = {};
  if (p.kind === 'app') {
    const bad = [];
    if (sh > ih) bad.push(`scrollHeight ${sh} > viewport height ${ih}`);
    if (isPrimaryPage) for (const sel of [t.primary, ...t.mustSee].filter(Boolean)) {
      const h = await firstVisible(page, sel);
      if (!h) { bad.push(`${sel} not found/visible`); continue; }
      const b = await h.evaluate(e => Math.round(e.getBoundingClientRect().bottom));
      if (b > ih) bad.push(`${sel} bottom ${b} > viewport height ${ih}`);
    }
    out.fit = bad;
  }
  if (isPrimaryPage && t.primary && vk !== DESKTOP) {
    let h = null, info = null;
    const bad = [];
    for (let attempt = 0; attempt < 6; attempt++) { // intro splashes usually clear within a few seconds
      h = await firstVisible(page, t.primary);
      if (!h) break;
      info = await h.evaluate(e => {
        const r = e.getBoundingClientRect();
        const de = document.documentElement;
        const x = Math.min(Math.max(r.left + r.width / 2, 0), de.clientWidth - 1), y = Math.min(Math.max(r.top + r.height / 2, 0), de.clientHeight - 1);
        const top = document.elementFromPoint(x, y);
        const hitBy = top && !(top === e || e.contains(top)) ? (top.tagName.toLowerCase() + (top.id ? '#' + top.id : '') + (typeof top.className === 'string' && top.className ? '.' + top.className.trim().split(/\s+/)[0] : '')) : null;
        return { bottom: Math.round(r.bottom), hitBy };
      });
      if (!info.hitBy) break;
      await page.waitForTimeout(1000);
    }
    if (!h) bad.push(`${t.primary} not found/visible`);
    else {
      if (info.bottom > ih) bad.push(`bottom ${info.bottom} > viewport height ${ih}`);
      if (info.hitBy) bad.push(`covered by ${info.hitBy}`);
    }
    out.cta = bad;
  }
  return out;
}

// Check 11: an approximation of a visitor's larger text setting.
async function bigPass(page, t, p, isPrimaryPage, vk, shots, tag) {
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '120%';
    const st = document.createElement('style');
    st.textContent = 'html{-webkit-text-size-adjust:auto!important}';
    document.head.appendChild(st);
  });
  await page.waitForTimeout(600);
  const m2 = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: document.documentElement.clientHeight }));
  const fc2 = await fitAndCta(page, t, p, isPrimaryPage, vk, m2.sh, m2.ih);
  const big = { fit: fc2.fit || null, cta: fc2.cta || null, round: await page.evaluate(roundFn, ROUND_MAX_ASPECT), media: await page.evaluate(mediaFn) };
  if ((fc2.fit && fc2.fit.length) || (fc2.cta && fc2.cta.length)) {
    const f = path.join(shots, `${p.id}-${tag}-120pct.png`);
    await page.screenshot({ path: f }).then(() => { big.shot = f; }).catch(() => {});
  }
  return big;
}

async function runStep(page, st) {
  if (st.click) await page.locator(st.click + ':visible').first().click({ timeout: 6000 });
  else if (st.fill) await page.locator(st.fill + ':visible').first().fill(st.value ?? '', { timeout: 6000 });
  else if (st.wait) await page.waitForTimeout(st.wait);
  await page.waitForTimeout(250);
}

/** Renders every page at every viewport in Chromium, and at the phone viewports in WebKit. */
export async function browserPass(browsers, VP, t, p, shots) {
  const results = [];
  const allowSet = new Set(t.allow);
  for (const eng of ['chromium', 'webkit']) for (const [vk, dev] of Object.entries(VP)) {
    if (vk === 'loop' || !useEngine(eng, vk)) continue;
    const browser = browsers[eng];
    for (const url of t.urls) {
      const tag = `${eng}-${vk}-${url.replace(/[^a-z0-9]+/gi, '_').slice(-40)}`;
      const ctx = await browser.newContext({ ...dev });
      const page = await ctx.newPage();
      const errs = [], fails = [], offHosts = new Set();
      const doNet = eng === 'chromium' && vk === 'ios-390x664';
      if (doNet) {
        page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
        page.on('pageerror', e => errs.push('pageerror ' + e.message.slice(0, 140)));
        page.on('requestfailed', r => { if (/ERR_ABORTED/.test(r.failure()?.errorText || '')) return; fails.push('FAILED ' + (r.failure()?.errorText || '') + ' ' + r.url().slice(0, 110)); });
        page.on('response', r => { if (r.status() >= 400) fails.push(r.status() + ' ' + r.url().slice(0, 110)); });
        page.on('request', r => { try { const h = new URL(r.url()); if (/^https?:$/.test(h.protocol) && !allowSet.has(h.host)) offHosts.add(h.host); } catch {} });
      }
      const rec = { engine: eng, vk, url };
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
        await page.waitForTimeout(1200);
        Object.assign(rec, await page.evaluate(measureFn));
        rec.round = await page.evaluate(roundFn, ROUND_MAX_ASPECT);
        rec.media = await page.evaluate(mediaFn);
        const isPrimaryPage = url === t.primaryUrl;
        const fc = await fitAndCta(page, t, p, isPrimaryPage, vk, rec.sh, rec.ih);
        if (fc.fit) rec.fit = fc.fit;
        if (fc.cta) rec.cta = fc.cta;
        rec.hscroll = eng === 'chromium' && ORIG_VP.has(vk) && rec.sw > rec.iw + 1 ? `scrollWidth ${rec.sw} > ${rec.iw}` : null;
        if (doNet) { rec.errs = errs.slice(0, 6); rec.fails = fails.slice(0, 6); rec.offHosts = [...offHosts]; }
        const failed = (rec.fit && rec.fit.length) || (rec.cta && rec.cta.length) || rec.hscroll || (doNet && (errs.length || fails.length || offHosts.size));
        if (failed) {
          const f = path.join(shots, `${p.id}-${tag}.png`);
          await page.screenshot({ path: f }).then(() => { rec.shot = f; }).catch(() => {});
        }
        if (vk !== DESKTOP && t.fitUrls.includes(url)) rec.big = await bigPass(page, t, p, isPrimaryPage, vk, shots, tag);
      } catch (e) { rec.error = e.message.split('\n')[0].slice(0, 200); }
      results.push(rec);
      await ctx.close();
    }
    // Listed states: fresh page, run the steps, then checks 1, 11, 13 and 14 on the resulting screen.
    for (const st of p.states || []) {
      const surl = new URL(st.page || '', t.base).href;
      const tag = `${eng}-${vk}-state-${st.name}`;
      const ctx = await browser.newContext({ ...dev });
      const page = await ctx.newPage();
      const rec = { engine: eng, vk, url: surl, state: st.name };
      try {
        await page.goto(surl, { waitUntil: 'load', timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
        await page.waitForTimeout(1200);
        for (const step of st.steps || []) await runStep(page, step);
        await page.waitForTimeout(800);
        const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: document.documentElement.clientHeight }));
        rec.sh = m.sh; rec.ih = m.ih;
        rec.round = await page.evaluate(roundFn, ROUND_MAX_ASPECT);
        rec.media = await page.evaluate(mediaFn);
        const fc = await fitAndCta(page, t, p, false, vk, m.sh, m.ih);
        if (fc.fit) rec.fit = fc.fit;
        if (fc.fit && fc.fit.length) {
          const f = path.join(shots, `${p.id}-${tag}.png`);
          await page.screenshot({ path: f }).then(() => { rec.shot = f; }).catch(() => {});
        }
        if (vk !== DESKTOP) rec.big = await bigPass(page, t, p, false, vk, shots, tag);
      } catch (e) { rec.error = 'state step failed: ' + e.message.split('\n')[0].slice(0, 160); }
      results.push(rec);
      await ctx.close();
    }
  }
  return results;
}

/** Check 8: buttons that promise "get started" or "download" must not lead to a waitlist. */
export async function honestyCheck(browser, t, rendered) {
  const origin = new URL(t.base).origin;
  const found = new Map();
  for (const r of rendered) if (r.engine === 'chromium' && r.vk === 'ios-390x664' && r.ctas) for (const c of r.ctas) if (c.href && CTA_RE.test(c.t)) {
    const u = c.href.split('#')[0];
    if (!found.has(u)) found.set(u, { label: c.t, from: r.url });
  }
  const bad = [], errors = [];
  let checked = 0;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  for (const [u, info] of found) {
    if (checked >= 8) break;
    if (new URL(u).origin !== origin) continue;
    checked++;
    try {
      const pg = await ctx.newPage();
      const resp = await pg.goto(u, { waitUntil: 'load', timeout: 20000 });
      await pg.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await pg.waitForTimeout(800);
      if (resp && /html/.test(resp.headers()['content-type'] || '')) {
        const txt = await pg.evaluate(() => document.body.innerText);
        const m = txt.match(BAD_TARGET_RE);
        if (m) bad.push({ label: info.label, href: u, match: m[0], excerpt: txt.slice(Math.max(0, m.index - 40), m.index + 80).replace(/\s+/g, ' ') });
      }
      await pg.close();
    } catch (e) { errors.push(`${u}: ${e.message.split('\n')[0].slice(0, 100)}`); }
  }
  await ctx.close();
  return { checked, found: found.size, bad, errors };
}

/** Check 16: the product's core loop. Steps must never submit forms or create real records. */
export async function runCoreLoop(browser, engine, steps, baseUrl, device) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 160)));
  let failed = null;
  const STEP_MS = 10000;
  const vis = sel => page.locator(sel).filter({ visible: true }).first();
  for (const [i, st] of steps.entries()) {
    const desc = `step ${i + 1} ${JSON.stringify(st)}`;
    try {
      if (st.goto !== undefined) { await page.goto(new URL(st.goto, baseUrl).href, { waitUntil: 'load', timeout: 30000 }); await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {}); }
      else if (st.click) await vis(st.click).click({ timeout: STEP_MS });
      else if (st.fill) await vis(st.fill).fill(st.value, { timeout: STEP_MS });
      else if (st.expect) await vis(st.expect).waitFor({ state: 'visible', timeout: STEP_MS });
      else if (st.expectText) await page.getByText(st.expectText, { exact: false }).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: STEP_MS });
      else if (st.wait) await page.waitForTimeout(st.wait);
      else throw new Error('unknown step type');
    } catch (e) { failed = `${desc}: ${e.message.split('\n')[0].slice(0, 140)}`; break; }
  }
  await page.waitForTimeout(500);
  await ctx.close();
  return { engine, failed, errs };
}

/** Check 12 helper: overscroll behaviour and script-set safe-area insets on a rendered page. */
export async function shellProbe(browser, device, url) {
  const ctx = await browser.newContext({ ...device });
  const pg = await ctx.newPage();
  let jsInset = false;
  const jsReads = [];
  // Inline-style insets (for example React style={{ paddingTop: 'env(safe-area-inset-top)' }}) live in scripts, not CSS.
  pg.on('response', r => { if (r.request().resourceType() === 'script' && r.status() === 200) jsReads.push(r.text().then(x => { if (/env\(\s*safe-area-inset-/i.test(x)) jsInset = true; }).catch(() => {})); });
  try {
    await pg.goto(url, { waitUntil: 'load', timeout: 30000 });
    await pg.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    await pg.waitForTimeout(1000);
    await Promise.all(jsReads);
    const ov = await pg.evaluate(() => ({ html: getComputedStyle(document.documentElement).overscrollBehaviorY, body: getComputedStyle(document.body).overscrollBehaviorY }));
    return { ov, jsInset };
  } finally { await ctx.close(); }
}
