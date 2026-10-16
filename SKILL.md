---
name: basics-gate
description: Automated pre-commit and pre-deploy hygiene probe. Mechanically checks that a web app or marketing site passes fundamental production hygiene on a real mobile viewport: zero console errors, zero secret leaks, zero dead links, no horizontal scroll, primary CTA visible above the fold, and strict network request allowlists to prevent rogue trackers.
license: MIT
metadata:
  author: We Build for Good
  version: "1.0.0"
---

# Basics Gate: Automated Pre-Commit Immune System

Most live product defects are not complex algorithmic bugs. They are basic hygiene failures:
* A broken link returning 404 on the pricing page.
* A console error crashing an interactive widget on mobile Safari.
* An unauthorized analytics script firing before user consent.
* A mobile layout that scrolls horizontally off-screen because a div has a fixed 600px width.
* An unrendered primary call-to-action buried beneath three screens of text.

The `basics-gate` protocol is a mechanical, fast pre-commit and pre-deploy immune system. It loads the application inside a headless browser (Playwright) at mobile viewport dimensions (375px width) and executes strict hygiene assertions before any branch is considered ready to merge or ship.

---

## The Prime Philosophy

**Never rely on manual vigilance for things a 30-second script can verify mechanically.**

If an AI claims "the frontend is clean", it must run the Basics Gate. If any priority-1 check fails, the branch fails automatically.

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

## Running the Gate

The gate can be run as an npm script or standalone Node.js file:

```bash
# Test local development server
node basics-gate.mjs --base http://localhost:3000

# Test live staging URL
node basics-gate.mjs --base https://staging.example.com
```

Exit code is `0` if all checks pass, and non-zero (`1`) if any P1 check fails, outputting exact failure traces and mobile screenshots.
