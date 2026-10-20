// Options, config loading and validation. No defaults are invented: a missing or
// invalid config is a usage error (exit 2), never an empty passing run.
import fs from 'node:fs';
import path from 'node:path';

export class UsageError extends Error {}

const VALUE_FLAGS = { '--config': 'config', '--product': 'product', '--base': 'base', '--pages': 'pages', '--out': 'out', '--concurrency': 'concurrency' };
const BOOL_FLAGS = { '--skip-perf': 'skipPerf', '--strict': 'strict', '--json': 'json', '--help': 'help', '-h': 'help' };

export function parseArgs(argv) {
  const o = { config: null, product: null, base: null, pages: null, out: null, concurrency: 4, skipPerf: false, strict: false, json: false, help: false, errors: [] };
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    let inline = null;
    const eq = arg.indexOf('=');
    if (arg.startsWith('--') && eq > 0) { inline = arg.slice(eq + 1); arg = arg.slice(0, eq); }
    if (BOOL_FLAGS[arg]) o[BOOL_FLAGS[arg]] = true;
    else if (VALUE_FLAGS[arg]) {
      const v = inline ?? (i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[++i] : null);
      if (v === null || v === '') o.errors.push(`${arg} needs a value.`);
      else o[VALUE_FLAGS[arg]] = v;
    } else o.errors.push(`Unknown option: ${arg}`);
  }
  if (typeof o.concurrency === 'string') {
    const n = Number(o.concurrency);
    if (!Number.isInteger(n) || n < 1) o.errors.push('--concurrency must be a whole number of 1 or more.');
    else o.concurrency = n;
  }
  if (o.base) { try { new URL(o.base); } catch { o.errors.push(`--base is not a URL: ${o.base}`); } }
  if (o.pages) o.pages = o.pages.split(',').map(s => s.trim());
  if (o.product) o.product = o.product.split(',').map(s => s.trim()).filter(Boolean);
  return o;
}

const isHttpUrl = s => { try { return /^https?:$/.test(new URL(s).protocol); } catch { return false; } };
const isStrArray = a => Array.isArray(a) && a.every(x => typeof x === 'string');
const STEP_KEYS = ['goto', 'click', 'fill', 'expect', 'expectText', 'wait'];

/** Returns a list of problems; an empty list means the config is usable. */
export function validateConfig(cfg) {
  const errs = [];
  const products = Array.isArray(cfg) ? cfg : cfg?.products;
  if (!Array.isArray(products) || products.length === 0) return ['Config needs a non-empty "products" array.'];
  const ids = new Set();
  products.forEach((p, i) => {
    const at = `products[${i}]${p && p.id ? ` (${p.id})` : ''}`;
    if (!p || typeof p !== 'object') { errs.push(`${at}: must be an object.`); return; }
    if (typeof p.id !== 'string' || !p.id) errs.push(`${at}: "id" is required.`);
    else if (ids.has(p.id)) errs.push(`${at}: duplicate id.`);
    else ids.add(p.id);
    if (!isHttpUrl(p.base)) errs.push(`${at}: "base" must be an http(s) URL.`);
    if (!['app', 'site'].includes(p.kind)) errs.push(`${at}: "kind" must be "app" or "site".`);
    if (!isStrArray(p.pages) || p.pages.length === 0) errs.push(`${at}: "pages" must be a non-empty array of paths ("" is the home page).`);
    if (!isStrArray(p.allowHosts) || p.allowHosts.length === 0) errs.push(`${at}: "allowHosts" must list every host the page may call (at least its own).`);
    if (p.primary !== undefined && typeof p.primary !== 'string') errs.push(`${at}: "primary" must be a selector string.`);
    for (const k of ['mustSee', 'fitPages', 'sitemapPages', 'appShellPages']) if (p[k] !== undefined && !isStrArray(p[k])) errs.push(`${at}: "${k}" must be an array of strings.`);
    if (p.coreLoop !== undefined) {
      if (!Array.isArray(p.coreLoop) || p.coreLoop.length === 0) errs.push(`${at}: "coreLoop" must be a non-empty array of steps.`);
      else p.coreLoop.forEach((st, j) => {
        if (!st || !STEP_KEYS.some(k => st[k] !== undefined)) errs.push(`${at}: coreLoop[${j}] needs one of ${STEP_KEYS.join(', ')}.`);
        if (st && st.fill !== undefined && typeof st.value !== 'string') errs.push(`${at}: coreLoop[${j}] "fill" needs a string "value".`);
      });
    }
    if (p.states !== undefined && (!Array.isArray(p.states) || p.states.some(s => !s || typeof s.name !== 'string'))) errs.push(`${at}: "states" must be an array of {name, page, steps}.`);
  });
  return errs;
}

export function loadConfig(file) {
  const found = file ? path.resolve(file) : path.resolve('basics-gate.config.json');
  if (!fs.existsSync(found)) {
    throw new UsageError(file ? `Config not found: ${found}` : 'No basics-gate.config.json in this directory. Create one (see examples/basics-gate.config.json) or pass --config.');
  }
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(found, 'utf8')); } catch (e) { throw new UsageError(`Could not read ${found}: ${e.message}`); }
  const errs = validateConfig(cfg);
  if (errs.length) throw new UsageError(`Invalid config ${found}:\n  ${errs.join('\n  ')}`);
  return { products: Array.isArray(cfg) ? cfg : cfg.products, path: found };
}

export function selectProducts(products, wanted) {
  if (!wanted) return products;
  const unknown = wanted.filter(id => !products.some(p => p.id === id));
  if (unknown.length) throw new UsageError(`Unknown product id: ${unknown.join(', ')}. Known: ${products.map(p => p.id).join(', ')}.`);
  return products.filter(p => wanted.includes(p.id));
}

/** Resolves the URLs to test. --base points the product at a preview or another page of the same site. */
export function buildTargets(p, opts = {}) {
  let base = p.base;
  let pages = p.pages;
  const allow = [...p.allowHosts];
  const overridden = Boolean(opts.base);
  if (opts.base) {
    const nb = new URL(opts.base);
    const ob = new URL(p.base);
    base = opts.base;
    allow.push(nb.host);
    if (opts.pages) pages = opts.pages;
    else if (nb.origin === ob.origin && nb.pathname.replace(/\/+$/, '') !== ob.pathname.replace(/\/+$/, '')) pages = ['@base'];
  } else if (opts.pages) pages = opts.pages;
  const urls = pages.map(pg => (pg === '@base' ? new URL(base).href : new URL(pg, base).href));
  const primaryIdx = pages.findIndex(pg => pg === '');
  const fitUrls = p.fitPages && pages === p.pages ? p.fitPages.map(pg => new URL(pg, base).href) : [urls[0]];
  return { base, pages, urls, overridden, primaryUrl: primaryIdx >= 0 ? urls[primaryIdx] : null, primary: p.primary || null, mustSee: p.mustSee || [], allow, fitUrls };
}
