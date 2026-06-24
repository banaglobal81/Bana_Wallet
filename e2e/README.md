# E2E (Playwright) — Riobx spot trading

End-to-end tests that drive the live Riobx site (`https://riobx.com`), focused
on the BTC/USDT spot page (`/en/spot/BTC_USDT`), which is auth-gated.

## Layout

| File | Project | Needs login |
|------|---------|-------------|
| `auth.setup.ts` | `setup` | yes — logs in once, saves session to `e2e/.auth/user.json` |
| `spot-gate.public.spec.ts` | `public` | no — verifies the auth gate + login form |
| `spot-btcusdt.spec.ts` | `authenticated` | reuses the saved session |
| `support/riobx.ts` | — | shared selectors + `login()` helper |

## Credentials

Copy the template and fill in a test account (the file is gitignored):

```bash
cp .env.e2e.example .env.e2e
# edit .env.e2e → RIOBX_EMAIL / RIOBX_PASSWORD
```

`playwright.config.ts` loads `.env.e2e` automatically. Real environment
variables take precedence (so CI secrets are never overridden).

## Running

```bash
npm run e2e          # full suite (setup → authenticated + public)
npm run e2e:public   # gate + login-form checks only, no creds needed
npm run e2e:ui       # interactive UI mode
npm run e2e:report   # open the last HTML report
```

Artifacts (`test-results/`, `playwright-report/`, `e2e/.auth/`) are gitignored.

## Note on selectors

Riobx login fields use dynamic React ids (e.g. `textinput-_r_0_`), so the
helpers target placeholders/roles. The authenticated assertions in
`spot-btcusdt.spec.ts` are intentionally tolerant — tighten them against the
real logged-in DOM after the first run with valid credentials.
