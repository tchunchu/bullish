# SCREENER MASTER — v5 (READ THIS FIRST, AGENT)

⚠️ **AUTHORITATIVE WORKFLOW. The legacy path (`screener.js` + `neuralmd.js`) is DEPRECATED.**
All code lives in THIS repo (`researchshipper/equity`, branch `update`). Do NOT fetch scripts from the network or any other repo.

---

## Exact run order — follow this, fail loudly, never fall back to legacy

```bash
# Step 1 — Quantitative screen (full S&P 500 + curated universe, top 15)
node screener/screener_v5.js --universe=sp500 --top=15
# Outputs: screener/screener_dump.json  screener/top_tickers.txt  screener/screener_log.jsonl (appended)

# Step 2 — LLM Pass 2 (YOU DO THIS — see rubric below)
# Read screener/screener_dump.json → web-search 7-day news per ticker → write screener/pass2.json

# Step 3 — Lint gate (HARD GATE — must exit 0 before rendering)
node screener/lint_pass2.js screener/pass2.json screener/screener_dump.json
# If it prints errors → fix pass2.json → re-run lint. DO NOT proceed until exit 0.

# Step 4 — Render (deterministic — never hand-write HTML)
node screener/render_v5.js
# Outputs: screener/screener_report_YYYY-MM-DD.html  (dated, history preserved)
#          screener/screener_report_v5.html           (latest alias, overwritten each run)
```

> **Hard rules for the agent:**
> - If `screener_v5.js` throws (missing module, network error) → **STOP and report the error**. Falling back to the old `screener.js` is FORBIDDEN — it has known bugs (unclamped stops, analyst-target R:R inflation) that v5 exists to fix.
> - Success criteria for Step 1: console shows a `Regime:` line, a table with `STATE` values in `{TRIGGERED, COILING, REVERSAL, EXTENDED}`, and both `screener_dump.json` + `top_tickers.txt` exist. If the output says "COILED SPRING" or "WATCHING" you ran the wrong script.
> - `render_v5.js` is the **only** permitted renderer. Never hand-write `screener_report_*.html`.

---

## What v5 does (sanity-check checklist)

| Gate | Logic |
|------|-------|
| **0. Regime** | SPY/QQQ/IWM/HYG/IEF/VIX/RSP → `RISK_ON / NEUTRAL / RISK_OFF`, exposure multiplier (1.0 / 0.6 / 0.25), sector ETF RS ranking. In `RISK_OFF` **only** TRIGGERED setups survive. |
| **1. Liquidity** | Price > $5, median daily dollar volume ≥ $20M. Non-negotiable. |
| **2. RS gate** | Weighted 1m/3m/6m excess return vs SPY; only **top 40%** advance to setup scoring. |
| **3. Setup state machine** | `lib/setups.js`: COILING → TRIGGERED (pivot break ≤3%, ≥1.4× vol, close-range ≥0.6) → EXTENDED (>5% past pivot — no chase). Stops clamped ≤8%. Targets = measured move from base depth, 2R floor. **Never analyst targets.** |
| **4. Earnings flag** | `earningsRisk: true` if earnings within 7 calendar days. |
| **5. Dump** | `screener_dump.json` — full per-ticker evidence for LLM Pass 2. LLM never invents numbers; it ranks over this file only. |

---

## Pass 2 — LLM reasoning rubric (HARD-GATED by lint)

Open `screener/screener_dump.json`. For each candidate in `candidates[]`:

1. **TAPE CHECK** — do `udvRatio50` (>1.3 = accum), `obvSlope20` (>0 = rising OBV), `rsLineHigh` (true = institutional tell), `closeRange` (≥0.7 = buyers at close) **confirm** or **contradict** the `setup.state`? Conflict → cap `conviction` at 5 and explain in `thesis`.
2. **NEWS FUEL** — `web_search "<sym> news"` last 7 days. Catalyst classes ranked by power: guidance raise > new contract/award > insider cluster buy > analyst action > sympathy play. A coil + fresh fuel beats a coil alone. Fuel on an EXTENDED name is a trap (already priced in).
3. **EARNINGS** — if `earningsRisk: true` → either set `conviction ≤ 4` **or** explicitly note binary-event sizing in `thesis`.
4. **REGIME** — respect `regime.exposure` as the max size multiplier. In `RISK_OFF` only TRIGGERED names merit capital.

### Output schema — strict JSON array written to `screener/pass2.json`

```json
[
  {
    "sym": "TICKER",
    "conviction": 7,
    "hold": "weeks",
    "thesis": "≤40 words. Use ONLY qualitative language — no decimal numbers unless they appear verbatim in the dump for this ticker.",
    "invalidation": "≤20 words. Plain English, no invented price levels.",
    "fuel": "≤25 words. State the catalyst found, or write exactly: No fresh catalyst found in 7-day search"
  }
]
```

> **E108 rule — the most common lint failure:** Any decimal number (e.g. `1.7`, `134.09`) in `thesis` or `invalidation` must exist verbatim in the dump for that ticker. If you want to reference a level, use plain language: "above the pivot" or "near the 50-day MA" rather than a price.

### Three-line portfolio note (append after the JSON array, as a comment)
Include total exposure used, sector concentration risk, and the one chart to watch today.

---

## File contract

| File | Producer | Consumer | Notes |
|------|----------|----------|-------|
| `screener/screener_dump.json` | `screener_v5.js` | LLM Pass 2 | Overwritten each run — contains latest evidence |
| `screener/top_tickers.txt` | `screener_v5.js` | `stock_analyzer/run_pipeline.js` | Comma-separated TRIGGERED+COILING syms |
| `screener/pass2.json` | LLM (you) | `lint_pass2.js` → `render_v5.js` | Must pass lint before render |
| `screener/screener_log.jsonl` | `screener_v5.js` (auto-append, **NEVER overwrite**) | `scorecard.js` forward-return ledger | One JSON line per TRIGGERED signal per date |
| `screener/screener_report_YYYY-MM-DD.html` | `render_v5.js` (deterministic) | Human review / repo history | Dated — never overwritten, history preserved |
| `screener/screener_report_v5.html` | `render_v5.js` | Quick "latest" link | Overwritten each run |
| `screener/scorecard.json` | `screener_v5.js` | Maintainer review | Win-rate, avg-R, cumR across all logged signals |

---

## Commit after every run

```bash
git add screener/screener_log.jsonl        # appended — ledger grows over time
git add screener/screener_dump.json        # overwritten — latest quant evidence
git add screener/pass2.json               # overwritten — latest LLM reasoning
git add screener/screener_report_$(date +%F).html  # dated — history preserved
git add lib/scorecard.js                   # only if changed
git commit -m "screener: daily run $(date +%F) — regime RISK_ON, N triggered"
git push origin update
```

---

## Verification & forward-return ledger

`screener_v5.js` auto-appends every TRIGGERED signal to `screener_log.jsonl` — one JSON line per signal, de-duplicated by `sym|date`. The scorecard computes +7/+30/+90d returns by matching post-entry quotes against each signal's `entry`, `stop`, `t1`. After 60+ signals you have empirical hit-rate data to tune the 1.4× volume threshold and 3% buy-zone.

---

## Legacy files (retained for git history only)

`screener.js`, `neuralmd.js`, `build_report.js`, `screener_report.html`, `neural_insights.txt` — **do not run these**. Delete them after 5 clean v5 daily runs.
