---
name: basics-gate
description: "Pre-deploy hygiene checklist for a web app or marketing site on a mobile viewport: no console errors, no horizontal scroll, primary CTA above the fold, no unexpected network requests, no leaked secrets, no dead links. Says which checks a tool can run for you and which you run by hand."
license: MIT
metadata:
  author: We Build for Good
  version: "1.1.0"
---

# Basics Gate: Pre-Deploy Hygiene Checklist

Most live product defects are not complex algorithmic bugs. They are basic hygiene failures:
* A broken link returning 404 on the pricing page.
* A console error crashing an interactive widget on mobile Safari.
* An unauthorized analytics script firing before user consent.
* A mobile layout that scrolls horizontally off-screen because a div has a fixed 600px width.
* An unrendered primary call-to-action buried beneath three screens of text.

The `basics-gate` protocol is a short checklist run before a branch is called ready to ship: load the page in a real headless browser at a 375px mobile width and check the six basics below. This repository contains the checklist only, not a script; the section "Running the checks" says which tool covers which check.

---

## The Prime Philosophy

**Never rely on manual vigilance for things a 30-second script can verify mechanically.**

If an AI claims "the frontend is clean", it must have run these checks and show the output. If any check fails, the branch is not ready.

---

## The Core Mechanical Checks

### Check 1: Zero Console Errors
* The browser console is monitored during page load and initial interactions.
* Any unhandled JavaScript exception, network fetch failure, or React hydration error fails the gate.

### Check 2: Mobile Viewport Fit (No Horizontal Overflow)
* Evaluated at 375px viewport width (standard iPhone baseline).
* `document.documentElement.scrollWidth` must exactly equal `window.innerWidth`. If any element creates horizontal page scrolling, the gate fails.

### Check 3: Primary CTA Above the Mobile Fold
* The primary action button (e.g. "Get Started", "Try Demo", "Sign In") must be fully rendered within the initial 667px vertical viewport without requiring user scrolling.

### Check 4: Network Request Allowlist (Zero Unauthorized Outbound Calls)
* Every network request fired during initial page load is intercepted and verified against a strict domain allowlist.
* Catches rogue third-party tracking scripts, unauthorized CDNs, or unconsented analytics libraries firing on cold load.

### Check 5: Secret & Credential Leak Scan
* Scans the rendered HTML and client-side JavaScript bundles for accidental leaks:
  * Private API keys (`sk_live_...`).
  * Database connection strings (`postgres://...`).
  * Personal developer paths or internal environment variables.

### Check 6: Dead Link Sweep
* Extracts all internal `<a href>` links on the page and verifies they return HTTP 200 OK. Catches dead anchors and missing routes.

---

## Running the checks

No script ships with this skill. Checks 1 and 2 (plus failed requests, broken images and small tap targets) are automated by [skill-visual-sensory-audit](https://github.com/We-Build-For-Good/skill-visual-sensory-audit):

```bash
wb4g-visual-audit https://staging.example.com    # exit 0 clean, 1 defects found
```

The others need a short script of your own (Playwright works well) or a manual pass:

* **Check 3 (CTA above the fold):** at 375x667, read the primary button's `getBoundingClientRect()`; its bottom must be within the viewport height.
* **Check 4 (network allowlist):** record every request host during load (`page.on('request')`) and compare it to your list of expected hosts.
* **Check 5 (secrets):** fetch the HTML and every script it loads and search them, e.g. `grep -E "sk_live_|postgres(ql)?://|/Users/|AKIA[0-9A-Z]{16}"`.
* **Check 6 (dead links):** collect internal `<a href>` values and request each one; anything other than 2xx (after redirects) fails.

Record each check's output with the branch and commit it was run against.
