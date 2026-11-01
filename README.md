# Cairn Pipeline Analyzer

Cairn Pipeline Analyzer is a free enterprise sales tool that tests whether CRM pipeline confidence is supported by buyer evidence, stakeholder engagement, risk signals, and next-step discipline. CRM data stays in the browser.

[Open the live analyzer](https://cairn-pipeline-analyzer.vercel.app/) · [Product overview](https://patrickarvia.com/pipeline-analyzer/) · [Cairn GTM](https://cairngtm.com/) · [Built by Patrick Arvia](https://patrickarvia.com/)

Current version: V2.

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

## Contradiction Ledger

Evidence gaps and contradictions are different: missing or inferred evidence alone does not establish a contradiction. A contradiction requires a CRM claim about confidence, stage, timing, or progression that conflicts with its supporting evidence.

The ledger groups contradictions by opportunity. Contradiction-exposed pipeline counts each opportunity once, even when that opportunity contains multiple contradictions. **Critical** and **Material** are transparent rule-based severity labels, not a health score.

- **Critical:** Commit in stage or forecast with any unsupported Commit-critical claim (grouped into one entry); an upcoming close within 0–30 days without supported timeline or next step, or with stale/unknown momentum; an open opportunity with a past close date.
- **Material:** Negotiation, Contract, Legal, Procurement, Closing, or Final with explicitly contradicted procurement or security/legal; advanced stages with stale buyer activity or only 0–1 mapped stakeholders. Advanced stages use the Evidence Core's Proposal, Evaluation, Pilot/POC, and later-stage matching. Unknown process evidence alone does not trigger a process contradiction.

Past-due detection excludes stages explicitly labeled closed, won, lost, cancelled/canceled, or disqualified; exports have no separate open/closed status mapping. Dates use the existing calendar-day comparison. Stable family IDs prevent repeated entries for multiple failed fields in the same family. Evidence and contradiction filters combine in Deal Review without changing audit totals or the full-pipeline CSV.

## Next Proof Required

Proof requirements derive directly from the ordered Evidence Core blockers. Cairn surfaces one highest-priority proof per assumption-dependent opportunity, with additional blocker counts. The full-pipeline Proof Queue follows existing blocker priority, then opportunity amount, independently of Deal Review filters.

Requirements are stage-aware and describe observable mapped CRM evidence, not generic advice. Resolving the next proof clears that blocker only; other blockers may remain. Evidence-Supported deals have no blocking proof requirement. No AI or probabilistic scoring is used.

## Interface refinement — Phases 1 and 2

The enterprise/editorial visual direction and the evidence rules remain unchanged.

- The HubSpot card now presents an explicit connected/read-only state and lets users disconnect through the existing session endpoint. Expired sessions show reconnection guidance.
- File import has accessible inline feedback for parsing, invalid inputs, worksheet selection, and the detected row/column count. Uploaded file, worksheet, and imported source remain visible during field mapping and in results.
- Field mapping preserves the native accessible dropdowns and adds optional per-field search when the source contains more than eight columns. Mapping badges distinguish auto-selected suggestions, manually confirmed fields, and unmapped fields; missing core columns produce a clear, non-blocking warning.
- A three-step workflow indicator and real, batch-based analysis progress provide feedback without invented delays or percentages.
- Results add an evidence-support summary, subdued KPI reveal motion, and clearer empty states. Animations respect reduced-motion preferences.
- Core model regression tests and optional browser tests verify that calculations, CSV exports, mapping, upload/reset, and mobile behavior remain intact.

## Preserved workflows

CSV upload and drag/drop, automatic and manual field mapping, the Cairn visual system, reset, filtering, and browser-only CSV download remain available. The demo loads 12 fictional enterprise opportunities with a dedicated **Analyze sample pipeline** CTA and sample labels. Demo dates are generated relative to the local calendar day when loaded, using UTC calendar-day arithmetic to preserve the intended scenarios across timezones and DST. Amounts and business evidence remain unchanged.

The analysis CSV includes Opportunity, Amount, Stage, Forecast, Close Date, Evidence Status, Primary Blocking Gap, Supported Evidence, Evidence Gaps, and Recommendations. The export also includes Contradiction Count, Highest Contradiction Severity, and readable Contradictions. The export adds Next Proof Claim, Next Proof Current State, Next Proof Required, Next Proof Target State, and Additional Blocking Proof Count. Full Evidence Ledger remains outside this update.

## Validation

Run the dependency-free model regression checks with `node tests/evidence-core.cjs` and `node tests/contradictions.cjs`, plus `node tests/next-proof.cjs`. Contradiction tests cover all six families, grouping, unique exposure, combined filters, and CSV fields. Optional browser checks run with `node tests/browser.cjs` when Playwright and Chromium are available; set `CHROME_PATH` to use an installed Chrome executable. They cover stage differences, Commit requirements, activity/date boundaries, negative versus missing evidence, zero/empty totals, and waterfall accounting.

The relative-date sample preserves the September 28, 2026 baseline: $2,220,000 Headline Pipeline, $715,000 Evidence-Supported (4 deals), and $1,505,000 Assumption Gap (8 deals). All eight assumption-dependent deals are deducted once. Browser validation also covers desktop/mobile layouts, console errors, demo, filtering, upload, drag/drop, auto/manual mapping, reset, and CSV export.


## HubSpot read-only import

The `crm-integrations` branch adds the first CRM integration path:

`Connect HubSpot → OAuth → import open deals → Cairn field mapping → existing evidence analysis`

The integration is intentionally read-only. Uploaded CSV/Excel files continue to stay in the browser. HubSpot records are fetched only when the user imports them and are returned directly to the browser; Cairn does not persist imported CRM records in this MVP.

The OAuth access token is encrypted into a short-lived HttpOnly, Secure, SameSite=Lax cookie. The first version does not persist a refresh token, so a user reconnects after the HubSpot access token expires.

Required HubSpot scopes:

- `oauth`
- `crm.objects.deals.read`
- `crm.schemas.deals.read`

Configure the HubSpot app redirect URL as:

`https://cairn-pipeline-analyzer.vercel.app/api/hubspot/callback`

Then add these Vercel environment variables (see `.env.example`):

- `HUBSPOT_CLIENT_ID`
- `HUBSPOT_CLIENT_SECRET`
- `HUBSPOT_REDIRECT_URI`
- `HUBSPOT_APP_URL`
- `HUBSPOT_COOKIE_SECRET`

The importer uses HubSpot's current date-based OAuth token endpoint and 2026-09 CRM API paths. It imports up to 500 open deals per request, resolves pipeline stage IDs to labels, converts enum values to their display labels, and includes matching custom deal properties so Cairn's existing field mapper can identify evidence fields such as champion, budget, procurement, security/legal, decision process, and customer timeline.

## Deploy

Production is deployed through Vercel from `main`. Pull-request branches generate Vercel Preview deployments.

Live product: [Cairn Pipeline Analyzer](https://cairn-pipeline-analyzer.vercel.app).

## Salesforce read-only opportunity import — development preview

This branch adds a Salesforce **External Client App (ECA)** OAuth 2.0 web-server connection using PKCE and server-side client credentials:

`Connect Salesforce → OAuth → import up to 500 open opportunities → review field mapping → evidence audit`

The API makes read-only GET requests to Salesforce Opportunity describe and SOQL query resources. It does not create, update, or delete Salesforce records, persist imported opportunity data on Cairn's server, or retain refresh tokens. OAuth state, PKCE verifier, and the short-lived (30-minute) session use Secure, HttpOnly, SameSite=Lax cookies; the access token is encrypted with AES-256-GCM.

**Setup for an internal test org**

1. In Salesforce Setup, create an External Client App (ECA), not a new legacy Connected App (new creation restricted since Spring '26).
2. Enable OAuth with the **Web Server Flow**, allow the callback URL `https://cairn-pipeline-analyzer.vercel.app/api/salesforce/callback`, select **Manage user data via APIs (api)** scope, and enable PKCE (S256). Keep the web-server client secret private and use an appropriately restricted Salesforce user. For development against a sandbox org, set `SALESFORCE_LOGIN_URL=https://test.salesforce.com`.
3. Configure `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`, `SALESFORCE_COOKIE_SECRET`, `SALESFORCE_REDIRECT_URI`, `SALESFORCE_APP_URL`, and optional `SALESFORCE_LOGIN_URL` in the Vercel project environment, never in git. Restart deployment after updating environment variables. The exact callback host must match the deployed app.
4. Authorize the ECA from a Salesforce account with Opportunity read access and the required object/field permissions. For use by organizations beyond the app's creator, review Salesforce's ECA distribution and installation requirements; this initial integration has not been packaged for public multi-tenant distribution.

**Behavior and limits**

- Only opportunities with `IsClosed = false` are queried. The importer selects core Opportunity fields plus up to 26 relevant readable custom fields matching Cairn's evidence aliases. It reads at most the first 500 ordered by close date, reports truncation, and sends them directly to the browser.
- Salesforce uses the `api` OAuth scope, which is **not itself a read-only permission**. The integration's implementation uses GET-only APIs; actual data access is governed by the authenticated user's Salesforce permissions. Configure a read-only integration user for additional protection.
- Salesforce fields such as `LastActivityDate` reflect CRM activity and do not independently prove buyer engagement. Users should review field mapping and evidence, particularly Next Step, Champion, Budget, and customer-owned next meetings.
- The Analyzer currently displays pipeline amounts in **USD only**. If an opportunity explicitly declares a non-USD CurrencyIsoCode, import is blocked rather than mixing currencies. If currency cannot be verified automatically, the UI reminds users to confirm it. No FX conversion or Salesforce write-back is provided.
- Read-only API token sessions last 30 minutes and require reconnect; no automatic refresh is implemented.
- Run `node tests/salesforce.cjs` to check OAuth state/PKCE, imports, permissions/error cases, and currency guard using mocked Salesforce API responses. Run `node tests/salesforce-browser.cjs` with Playwright available to verify the browser flow against mock endpoints. Existing regression suite remains unchanged.

A real Salesforce ECA, org consent, and test Opportunity data are **required before calling the live OAuth connection validated**. Do not merge this experimental integration without that check.
