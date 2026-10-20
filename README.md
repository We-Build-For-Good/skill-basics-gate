# Basics Gate

> **An open-source AI engineering tool from [We Build for Good](https://webuildforgood.com)**
> *Catch the basics a visitor hits first, before they reach production.*

---

## Overview

`basics-gate` loads every page you configure in real Chromium and WebKit (the engine of iPhone Safari) at phone and desktop sizes, and checks 17 basics: content wider than the screen, the main button below the fold or covered, console errors, failed requests, calls to hosts you did not list, served SEO tags, text that breaks at 120% size, squashed images, tracking links that 404, a core loop that does not work, and page speed.

It is read-only: it loads and clicks through pages, and never submits a form, logs in or pays. Every check reports PASS, FAIL, WARN, SKIP (does not apply) or NOT_RUN (could not be checked). A check that did not run is never shown as a pass, and `--strict` makes it block.

The full list of checks, the config format and what the gate does not cover are in [SKILL.md](SKILL.md).

## Quick start

```bash
git clone https://github.com/We-Build-For-Good/skill-basics-gate.git
cd skill-basics-gate
npm install
npx playwright install chromium webkit
cp examples/basics-gate.config.json basics-gate.config.json   # then put your own site in
node bin/basics-gate.mjs --skip-perf
```

Exit codes: 0 no P1 failures, 1 blocked, 2 bad options, config or missing browsers. Page speed (check 17) needs `npm install lighthouse`; without it the check is NOT_RUN.

## Tests

```bash
npm test
```

The suite includes an end-to-end run against two local fixture sites: one that passes, and one that must fail the sideways-scroll, console-error, text-size and squashed-image checks. It is skipped if the Playwright browsers are not installed.

---

## Installation as an agent skill

### For Claude Code
```bash
git clone https://github.com/We-Build-For-Good/skill-basics-gate.git ~/.claude/skills/basics-gate
cd ~/.claude/skills/basics-gate && npm install && npx playwright install chromium webkit
```

### For Cursor
```bash
mkdir -p .cursor/skills
git clone https://github.com/We-Build-For-Good/skill-basics-gate.git .cursor/skills/basics-gate
```

### For Antigravity / Open Agent Skills
```bash
mkdir -p .agents/skills
git clone https://github.com/We-Build-For-Good/skill-basics-gate.git .agents/skills/basics-gate
```

---

## License

MIT License. Developed and maintained by [We Build for Good](https://webuildforgood.com).
