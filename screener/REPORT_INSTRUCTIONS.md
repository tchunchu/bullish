# Report Generation Guide — v5

> **This doc covers Steps 3 & 4 of the daily workflow.**
> For the full run order see `SCREENER_MASTER.md` — that file is always authoritative.

---

## How the report pipeline works

```
screener_dump.json   ←  screener_v5.js  (Step 1 — quant)
       +
pass2.json           ←  LLM / agent     (Step 2 — reasoning)
       │
       ▼
lint_pass2.js        →  exit 0 required (Step 3 — hard gate)
       │
       ▼
render_v5.js         →  screener_report_YYYY-MM-DD.html  (Step 4 — deterministic render)
                         screener_report_v5.html          (latest alias)
```

**The renderer is deterministic.** Every colour, column, sort order and section is locked in `render_v5.js`. The LLM's only input to the HTML is the six fields per row in `pass2.json`. Changing the report format means editing `render_v5.js` — never hand-editing HTML output.

---

## Step 3 — Lint gate

```bash
node screener/lint_pass2.js screener/pass2.json screener/screener_dump.json
```

Must print `✅ lint_pass2: N rows clean — proceed to render_v5.js`.

If it prints errors (E101–E110) → fix `pass2.json` → re-run lint. **Do NOT run `render_v5.js` until exit 0.**

The most common failures:
| Code | Fix |
|------|-----|
| E102 | Add the missing field (all 6 required: sym, conviction, hold, thesis, invalidation, fuel) |
| E103 | `conviction` must be a plain integer, e.g. `7` not `"7"` or `7.5` |
| E107 | `fuel` cannot be blank or "N/A" — write what you found, or exactly: `No fresh catalyst found in 7-day search` |
| E108 | Remove or rephrase any decimal number in `thesis`/`invalidation` that doesn't appear verbatim in the dump for that ticker |
| E109 | Shorten `thesis` to ≤40 words, `invalidation` to ≤20, `fuel` to ≤25 |
| E110 | Every `TRIGGERED` ticker in the dump must appear in `pass2.json` |

---

## Step 4 — Render

```bash
node screener/render_v5.js
```

Optional flags:
```bash
node screener/render_v5.js --dump=path/to/other_dump.json   # override dump path
node screener/render_v5.js --pass2=path/to/other_p2.json    # override pass2 path
node screener/render_v5.js --log=path/to/other_log.jsonl    # override log path
```

Outputs:
- `screener/screener_report_YYYY-MM-DD.html` — dated (history preserved, never overwritten)
- `screener/screener_report_v5.html` — latest alias (overwritten each run)

---

## What the report contains (section by section)

| Section | Source | Notes |
|---------|--------|-------|
| **Regime panel** | `dump.regime` | Colour-coded RISK_ON/NEUTRAL/RISK_OFF; all 7 signal bullets; top-6 sector ETF RS badges |
| **Candidates table** | `dump.candidates` + `pass2.json` | Sorted conviction desc → quant score desc. Tape mini-row (UDV, OBV, RS-line, RSI, RevGr, Margin) sourced from dump only |
| **Portfolio note** | Auto-generated from data | TRIGGERED summary, COILING alerts, sector concentration warning, "chart to watch" — all computed from `candidates[]`, no hard-coded text |
| **Historical ledger** | `screener_log.jsonl` | All TRIGGERED signals ever logged, newest first |

---

## Report colour palette (single source of truth: `render_v5.js`)

| Meaning | Hex |
|---------|-----|
| Background | `#0d1117` |
| Surface / card | `#161b22` |
| Border | `#30363d` |
| Green (TRIGGERED, conviction ≥8, positive signals) | `#00d084` |
| Yellow (COILING, conviction 6–7, neutral) | `#f9ca24` |
| Red (stop, EXTENDED, negative, conviction ≤5) | `#e17055` |
| Purple (REVERSAL) | `#6c5ce7` |
| Catalyst lightning bolt | `#f9ca24` |
| Muted text / monospace | `#b2bec3` |

Do not override colours in `pass2.json` or anywhere else. All styling is centrally managed.

---

## Git commit after every run

```bash
git add screener/screener_log.jsonl
git add screener/screener_dump.json
git add screener/pass2.json
git add "screener/screener_report_$(date +%F).html"
git commit -m "screener: daily run $(date +%F)"
git push origin update
```

Files that go into `lib/` when updated:
```bash
git add lib/indicators.js lib/indicators_v2.js lib/setups.js lib/regime.js lib/scorecard.js
```
