---
name: basics-gate
description: "Run before calling a web app or marketing site ready to ship. Loads every configured page in real Chromium and WebKit at phone and desktop sizes and fails on the basics a visitor hits first: content wider than the screen, the main button below the fold or covered, console errors, failed requests, calls to hosts you did not list, missing served SEO tags, text that breaks at 120% size, squashed images, tracking links that 404, and a core loop that does not work. Reports what it could not check instead of passing it."
license: MIT
metadata:
  author: We Build for Good
  version: "2.0.0"
---

# Basics Gate

Most defects that reach real visitors are not clever bugs. They are basics: a page that scrolls sideways on a phone, a "Get started" button hidden under a cookie banner, a console error that stops a widget, an analytics call that fires before consent, a link with UTM tags that 404s.

This skill runs a mechanical check for those, in real browser engines, and gives a pass or fail with evidence for each one.

**Rule for the agent:** never say a frontend is "clean" or "ready" without running the gate against it and quoting the summary. A check that did not run is a gap, not a pass.

---

## Setup (once)

```bash
cd <this skill's folder>
npm install
npx playwright install chromium webkit
```

Optional, for check 17 (page speed): `npm install lighthouse`. Without it, check 17 is reported as NOT_RUN.

## Configure the product

Create `basics-gate.config.json` where you will run the gate (start from `examples/basics-gate.config.json`):

```json
{
  "products": [
    {
      "id": "my-site",
      "base": "https://www.example.com/",
      "kind": "site",
      "pages": ["", "pricing"],
      "primary": "a:has-text('Get started')",
      "allowHosts": ["www.example.com", "fonts.googleapis.com", "fonts.gstatic.com"],
      "coreLoop": [{ "goto": "" }, { "click": "a:has-text('Get started')" }, { "expect": "h1" }]
    }
  ]
}
```

| Key | Required | Meaning |
|---|---|---|
| `id` | yes | Short name used in reports and `--product`. |
| `base` | yes | The site's URL. |
| `kind` | yes | `app` must fit on one screen; `site` only needs its main button in the first screen. |
| `pages` | yes | Paths relative to `base`. `""` is the home page, the only page that gets the main-button checks. |
| `allowHosts` | yes | Every host the page may call before consent, including its own. Run once and read check 4's evidence to find them. |
| `primary` | no | Selector for the main action. Without it check 2 is skipped. |
| `mustSee` | no | Extra selectors (apps) that must sit above the fold. |
| `coreLoop` | no | Steps `{goto}`, `{click}`, `{fill, value}`, `{expect: selector}`, `{expectText}`, `{wait: ms}`. Without it check 16 is NOT_RUN. Never include a step that submits a real form, signs up, or pays. |
| `coreLoopPartial` | no | Why the loop stops early (for example, the next step would create a real account). |
| `sitemap` | no | `false` skips sitemap checks. `sitemapPages` lists pages that must be in `sitemap.xml` (default: the first page). |
| `appShell` | no | `true` for an installable full-screen web app (enables check 12). `appShellPages` sets which pages. |
| `fitPages` | no | Pages for check 11 (default: the first page). |
| `states` | no | `[{name, page, steps}]`: screens that only exist after a tap. Checks 1, 11, 13 and 14 re-run on each. |

## Run

```bash
node bin/basics-gate.mjs                                   # every product in ./basics-gate.config.json
node bin/basics-gate.mjs --product my-site --skip-perf     # one product, no Lighthouse
node bin/basics-gate.mjs --product my-site --base https://preview-123.example.dev/   # a preview build
node bin/basics-gate.mjs --strict                          # also block on checks that could not run
```

Other options: `--config <file>`, `--pages a,b` (`@base` means the base URL itself), `--out <dir>` (default `./basics-gate-output`), `--concurrency <n>`, `--json`.

Exit codes: **0** no P1 failures, **1** a P1 check failed or a product crashed (with `--strict`, also any NOT_RUN), **2** bad options, bad config, or browsers not installed.

The report (`<out>/<date>.md`, plus `latest.json` and screenshots of failing renders) has a product by check table, then every failure and gap with its evidence. The summary line says PASSED, PASSED WITH GAPS (some checks did not run), or BLOCKED.

## The checks

Statuses: PASS, FAIL, WARN (never blocks), SKIP (does not apply to this product), NOT_RUN (applies but could not be checked).

| # | Check | Severity | Fails when |
|---|---|---|---|
| 1 | Fit (`kind: app`) | P1 | The page scrolls vertically, or `primary`/`mustSee` ends below the fold, at 390x664, 375x667 or 1280x800. |
| 2 | Main button visible | P1 | At phone sizes, `primary` is missing, below the fold, or covered (for example by a consent banner). Waits about 6 seconds for intro screens to clear. P2 for a site that only fails at 375x548. |
| 3 | No sideways scroll | P1 | Content is wider than the screen on any page at 390, 375 or 1280 wide. |
| 4 | Console, requests, hosts | P1 | At 390x664 on load: a console error, a 4xx/5xx or failed request, or a request to a host not in `allowHosts`. Nothing is consented to, so analytics that fire before consent fail here. |
| 5 | Served SEO | P2 | The served HTML (not the rendered page) lacks a title, description, canonical or og:title, is an empty client-rendered shell, or `sitemap.xml`/`robots.txt` is not 200. |
| 6 | Inbound links | P2 | A page in the sitemap that no other crawled page links to. |
| 7 | `[hidden]` rule | P2 | No `[hidden]{display:none}` in the served CSS, or a `[hidden]` element is displayed. |
| 8 | Honest buttons | P2 | A "Get started", "Download" or "Available now" link leads to a page saying invite-only, waitlist or coming soon. |
| 9 | Tap targets | P3 warn | Counts buttons under 44x44 (recommended) and under 24x24 (WCAG 2.2 AA minimum). Never blocks. |
| 10 | Text size on iPhone | P1 | No `text-size-adjust: 100%` (or `none`) on `html` or `body`, so iOS Safari can inflate text. |
| 11 | Larger text | P1 app, P2 site | Checks 1 and 2 fail again with text at 120%. |
| 12 | App shell | P1 | (`appShell: true`) The page rubber-bands, or it installs full-screen without `viewport-fit=cover` and safe-area padding. |
| 13 | Round stays round | P2 | Something drawn as a circle (40px or larger) renders as an oval. |
| 14 | Media not squashed | P1 | An image, canvas or video at least 60px wide is more than 3% off its natural shape. |
| 15 | Tracking links | P1 | The base URL with `?utm_source=basics-gate`, with and without the trailing slash, does not end 200 with the query kept. |
| 16 | Core loop works | P1 | A `coreLoop` step fails, or the path logs a console error, in Chromium or WebKit at 390x844. |
| 17 | Fast | P2 | Lighthouse mobile (median of 3): LCP over 2500ms, CLS over 0.1, or TBT over 200ms. |

Checks 1, 2, 11, 13 and 14 run in WebKit (the engine of iPhone Safari) and Chromium at phone sizes, Chromium only at desktop. Checks 3 to 9 run in Chromium. Phone sizes also include 375x548 (small phone with Safari's toolbars) and 430x932 (large phone, Home Screen app).

## What it does not check

Say so in any report that relies on the gate:

- **Secrets in client code.** Fetch the HTML and every script it loads and search them, for example `grep -E "sk_live_|postgres(ql)?://|/Users/|AKIA[0-9A-Z]{16}"`.
- **Every link works.** Check 4 catches failed requests while loading; it does not follow every `<a href>`. [skill-visual-sensory-audit](https://github.com/We-Build-For-Good/skill-visual-sensory-audit) and a link checker cover more.
- Screens after a tap that are not listed in `states`, layouts wider than 1280px, the exact height of a real Safari tab, back-button and restore behaviour, and whether the copy is true beyond check 8. These need a person or a test written for the product.

## Standard for new pages

What the checks enforce, as rules to build by:

- Set `-webkit-text-size-adjust: 100%` on `html`.
- Every screen still fits, with its main action visible, at 120% text and in a 375x548 Safari tab.
- An installable full-screen app sets `overscroll-behavior-y: none`, `viewport-fit=cover` and `env(safe-area-inset-*)` padding.
- Anything meant to be round has a fixed aspect ratio (`aspect-ratio: 1`), never stretched by flex or grid.
- Images, canvases and videos keep their natural shape: set one dimension and `height: auto`, or use `object-fit`.
- Every product URL, with and without the trailing slash, returns 200 and keeps its query string.
