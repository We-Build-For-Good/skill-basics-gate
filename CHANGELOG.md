# Changelog

## 2.0.0 (2026-10-20)

- Now a working tool, not only a checklist: `bin/basics-gate.mjs` (`wb4g-basics-gate`) runs 17 checks in Chromium and WebKit from a `basics-gate.config.json`. Ported from the gate We Build for Good runs on its own products, with machine paths and the product list moved to config.
- Honest statuses: NOT_RUN for checks that apply but could not run (no core loop configured, Lighthouse not installed or `--skip-perf`, targets that would not load). `--strict` blocks on them.
- A page that fails to render now fails the render checks; it was previously counted as a pass for the main-button and console checks.
- Sideways scroll and fit are measured against the layout viewport (`clientWidth`/`clientHeight`). The 1.x checklist said to compare `scrollWidth` with `innerWidth`, but under mobile emulation Chromium widens `innerWidth` to the content, so overflow on a phone never showed.
- Lighthouse runs without `--no-sandbox` and measures the `--base` URL when one is given (previously it always measured the configured base).
- Bad options, unknown products and invalid configs exit 2 with a message.
- Secret scanning and a full dead-link sweep are not automated; SKILL.md says so and gives commands.

## 1.1.0 (2026-10-20)

- The docs described running `node basics-gate.mjs`, but no script ships in this repo. Reworded as a checklist; checks 1-2 point to skill-visual-sensory-audit, the rest give concrete commands. Added the dead-link check to the README.
