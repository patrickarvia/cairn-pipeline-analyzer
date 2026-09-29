# Cairn Pipeline Analyzer V2

Browser-based pipeline evidence analyzer by Cairn GTM. No build, backend, database, charting dependency, or data upload is required; CRM data stays in the browser.

[Open the live Cairn Pipeline Analyzer](https://cairn-pipeline-analyzer.vercel.app)

## Evidence Core

Each opportunity has eleven claims: buyer momentum, customer-owned next step, champion, economic buyer / executive sponsor, stakeholder coverage, budget, procurement, security / legal, business problem, decision process, and close-date basis. Claims use **Supported / Inferred / Unknown / Stale / Contradicted**, replacing penalty scoring.

The overall result is **Evidence Supported** or **Assumption Dependent**. Evidence is evaluated relative to the CRM stage:

- All stages require a documented business problem, recent or inferred buyer momentum, at least an inferred next step, and a defensible close date. Missing close dates and near-term dates (45 days or less) without a documented customer timeline block support.
- Discovery and other early stages do not require economic buyer, champion, budget, procurement, or security proof.
- Proposal, Evaluation, Pilot/POC, and later stages require supported champion, economic buyer, and budget; stakeholder coverage and decision process may be inferred.
- Negotiation, Contract, Legal, Procurement, Closing, and Final stages also require understood procurement and security/legal (complete, started, in progress, review, or explicitly not required).
- Commit in either stage or forecast requires Supported momentum, next step, stakeholder coverage, authority, budget, decision process, timeline, and commercial process evidence. Missing stage blocks support.

Activity within 14 days is Supported, 15–30 days is Inferred, and older activity is Stale. Future activity dates are Unknown. A next step and a meeting today or later support the next-step claim; either alone is Inferred. Explicit negative evidence is distinct from missing evidence. Unrecognized structured status values remain Unknown. These are rule-based interpretations of mapped fields, not independent verification of buyer intent.

## Metrics and Evidence Waterfall

- **Headline Pipeline:** all analyzed opportunity value and deal count.
- **Evidence-Supported:** value and count whose CRM position meets the stage-aware rules.
- **Assumption Gap:** Headline Pipeline minus Evidence-Supported, with the assumption-dependent deal count.

Every blocking claim is retained, but each assumption-dependent deal receives one primary blocker. Priority runs from stale, aging, or unknown buyer momentum through business case, authority, next step, stakeholders, buying process, close date, commercial process, and other evidence gaps.

The responsive Evidence Waterfall starts with Headline Pipeline, deducts each deal **exactly once** under its highest-priority blocker, and ends with Evidence-Supported Pipeline. Multiple gaps never cause a deal's value to be double-counted. All deductions sum to the Assumption Gap. Deal-review filters do not change the full-pipeline audit or CSV export.

## Preserved workflows

CSV upload and drag/drop, automatic and manual field mapping, the Cairn visual system, reset, filtering, and browser-only CSV download remain available. The demo loads 12 fictional enterprise opportunities with a dedicated **Analyze sample pipeline** CTA and sample labels. Demo dates are generated relative to the local calendar day when loaded, using UTC calendar-day arithmetic to preserve the intended scenarios across timezones and DST. Amounts and business evidence remain unchanged.

The analysis CSV includes Opportunity, Amount, Stage, Forecast, Close Date, Evidence Status, Primary Blocking Gap, Supported Evidence, Evidence Gaps, and Recommendations. Full Evidence Ledger, Contradiction Ledger, and Next Proof Required are outside this update.

## Validation

Run the dependency-free model regression checks with `node tests/evidence-core.cjs`. They cover stage differences, Commit requirements, activity/date boundaries, negative versus missing evidence, zero/empty totals, and waterfall accounting.

The relative-date sample preserves the September 28, 2026 baseline: $2,220,000 Headline Pipeline, $715,000 Evidence-Supported (4 deals), and $1,505,000 Assumption Gap (8 deals). All eight assumption-dependent deals are deducted once. Browser validation also covers desktop/mobile layouts, console errors, demo, filtering, upload, drag/drop, auto/manual mapping, reset, and CSV export.

## Deploy

Publish `index.html` through the repository's existing GitHub Pages workflow. This branch is intended for review; do not merge or deploy until approved.
