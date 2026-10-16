# Basics Gate: Automated Pre-Commit Immune System

> **An open-source AI engineering protocol from [We Build for Good](https://webuildforgood.com)**  
> *Catch fundamental hygiene failures before they reach production.*

---

## Overview

`basics-gate` is an automated hygiene testing protocol for web applications and marketing sites.

It uses headless browser rendering (Playwright) to verify that an application passes non-negotiable production hygiene on mobile viewports: zero console errors, zero secret leaks, zero dead links, no horizontal scrolling, and zero unconsented network requests.

---

## The Mechanical Checks

* **Zero Console Errors**: Traps runtime exceptions and unhandled promise rejections.
* **No Horizontal Overflow**: Validates responsive mobile fit at 375px width.
* **CTA Above the Fold**: Guarantees the primary action is visible without scrolling.
* **Network Allowlist**: Verifies that no rogue third-party analytics or CDNs fire on cold load.
* **Secret Leak Scan**: Blocks client bundles containing exposed API keys or environment secrets.

---

## Installation

### For Claude Code
```bash
git clone https://github.com/We-Build-For-Good/skill-basics-gate.git ~/.claude/skills/basics-gate
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
