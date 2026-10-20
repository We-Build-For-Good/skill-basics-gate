# Basics Gate: Pre-Deploy Hygiene Checklist

> **An open-source AI engineering protocol from [We Build for Good](https://webuildforgood.com)**  
> *Catch fundamental hygiene failures before they reach production.*

---

## Overview

`basics-gate` is a pre-deploy hygiene checklist for web applications and marketing sites, checked in a headless browser at mobile width: no console errors, no leaked secrets, no dead links, no horizontal scrolling, and no unexpected network requests.

This repository is the checklist, not a script. Two of the checks are automated by [skill-visual-sensory-audit](https://github.com/We-Build-For-Good/skill-visual-sensory-audit); [SKILL.md](SKILL.md) shows how to run the rest.

---

## The Mechanical Checks

* **Zero Console Errors**: Traps runtime exceptions and unhandled promise rejections.
* **No Horizontal Overflow**: Validates responsive mobile fit at 375px width.
* **CTA Above the Fold**: The primary action is visible without scrolling.
* **Network Allowlist**: Verifies that no rogue third-party analytics or CDNs fire on cold load.
* **Secret Leak Scan**: Client bundles contain no exposed API keys or environment secrets.
* **Dead Link Sweep**: Every internal link returns a 2xx response.

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
