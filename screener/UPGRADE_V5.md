# SCREENER V5 UPGRADE — Integration Notes

## What changed and why (one line each)
1. **Setup state machine** (`lib/setups.js`) — old COILED SPRING fired *after* the move (vol surge = spring already released). New: `COILING` (watch + alert level) → `TRIGGERED` (pivot break ≤3% past pivot, ≥1.4x vol, closing-range ≥0.6 — the actual entry) → `EXTENDED` (>5% / >1.5 ATR past pivot — refuse the chase, alert on retest). This is the not-too-early/not-too-late mechanic, deterministic.
2. **Tape-reading indicators** (`lib/indicators_v2.js`) — BB-width percentile, TTM squeeze, ATR%-percentile, VCP contraction sequence, volume dry-up, up/down-volume ratio, OBV slope, closing range, RS line vs SPY. Daily-bar proxies for order flow — no tick data needed.
3. **Regime engine** (`lib/regime.js`) — SPY trend + VIX + HYG/IEF credit + RSP/SPY breadth + QQQ → `RISK_ON / NEUTRAL / RISK_OFF`, exposure multiplier (1.0 / 0.6 / 0.25), and **regime-adaptive composite weights** (risk-on → technical 30%; risk-off → quality+valuation 55%). Feed `regime.weights` into `quality.compositeScore` (replace its hardcoded weights with an optional param).
4. **Relative-strength gate** — weighted 1m/3m/6m excess return vs SPY; only top-40% survivors ranked. Plus sector-ETF leadership so you screen *within leading groups*.
5. **Bug fixes carried in** — swing-low stop unclamped (could be 30% away) → stop = max(swingLow, price−2·ATR) capped at 8%; analyst-target R:R inflation → measured-move target (base depth from pivot, 2R floor from entry); earnings-within-7-days flag (binary-event risk for swing holds).
6. **LLM reasons last, over a dump** — `screener_dump.json` contains all evidence + an embedded rubric. The LLM ranks/argues over the file only (matches your stock_analyzer philosophy); lint its JSON output the same way you lint report.json.

## Install
```bash
cp indicators_v2.js setups.js regime.js  equity/lib/
cp screener_v5.js                        equity/screener/
# extract the UNIVERSE array from screener.js into screener/universe.js:
#   module.exports = [ "AAPL", ... ];
node selftest_v2.js   # 13/13 offline (synthetic coil/breakout/regime series)
node screener/screener_v5.js --top=15
```
Fix one pre-existing issue in UNIVERSE: `MAXR` is delisted (acquired 2023) — remove it.

## Valuation: make WACC live (5-line patch to lib/valuation.js + stockfetch.js)
`DEFAULTS.riskFreeRate` is frozen at 4.4% while `news/marketdata.js` already fetches ^TNX. In `stockfetch.js`, before `computeValuation`:
```js
// live risk-free + regime-adjusted ERP (VIX>25 → +50bp risk premium)
let rf = 0.044, erp = 0.050;
try {
  const tnx = await yf.chart('^TNX', { period1: Math.floor(Date.now()/1000)-7*86400, interval:'1d' });
  const y = tnx?.quotes?.at(-1)?.close; if (y > 0.5 && y < 12) rf = y / 100;
  const vix = await yf.chart('^VIX', { period1: Math.floor(Date.now()/1000)-7*86400, interval:'1d' });
  const v = vix?.quotes?.at(-1)?.close; if (v > 25) erp = 0.055; if (v > 32) erp = 0.060;
} catch {}
const val = computeValuation({...inputs}, { riskFreeRate: rf, equityRiskPremium: erp });
```
Every report's WACC/EVA/spread now tracks the actual rate cycle instead of a 2024 snapshot.

## quality.js: accept regime weights
Change `compositeScore(m = {})` → `compositeScore(m = {}, weightsOverride = null)` and use `weightsOverride || { ...current defaults }`. The screener/pipeline passes `regime.weights`. Risk-off automatically demands quality + margin of safety; risk-on lets momentum carry.

## LLM Pass-2 contract (replaces regex catalyst scoring)
Paste `screener_dump.json` + this to the agent:
```
You are the reasoning layer over a deterministic screen. Use ONLY numbers in the
file — never memory, never invented prices. For each candidate:
1. TAPE CHECK: do udvRatio50 (>1.3 accum), obvSlope20 (>0), rsLineHigh,
   closeRange CONFIRM the setup.state? Any conflict → cap conviction at 5 and say why.
2. NEWS FUEL: web_search "<sym> news" last 7 days. Catalyst classes (ranked):
   guidance raise > new contract/award > insider cluster buy > analyst action > sympathy.
   A coil + fresh fuel beats a coil alone; fuel on EXTENDED is a trap (priced in).
3. EARNINGS: earningsRisk=true → either conviction ≤4 or explicitly size for the gap.
4. REGIME: respect regime.exposure as max size; in RISK_OFF only TRIGGERED merits capital.
Output strict JSON array: [{sym, conviction:1-10, hold:"days|weeks|months",
thesis:<=40w, invalidation:<=20w, fuel:<=25w}]. Then a 3-line portfolio note:
total exposure used, sector concentration, the one chart to watch.
```
Then lint: every cited price must exist in the dump (same E012 discipline as Market Beat).

## Daily operating loop (the whole system, ~5 min of compute)
```
1. node screener/screener_v5.js          # regime + coils + triggers + dump
2. LLM Pass-2 over screener_dump.json    # conviction + fuel check
3. TRIGGERED + conviction ≥7 → node stock_analyzer/run_pipeline.js SYM peers…  (deep quality gate)
4. COILING names → alerts file (pivot level + 1.4x vol condition) — re-run intraday near close;
   the 3:30–4:00pm ET print is the highest-signal bar of the day and your 15-min delay barely hurts there.
5. Market Beat insider clusters ∩ COILING list = your highest-conviction overlap (insiders buying INTO a coil).
```

## Next-level backlog (in payoff order)
1. **Forward-return scorecard for the screener** — you already built exactly this for insiders (`insiders.js score`). Clone it: log every TRIGGERED signal to `screener_log.jsonl`, score +7/+30/+90d. In 60 days you have your own hit-rate data and can tune the 1.4x vol / 3% buy-zone thresholds empirically instead of by lore. This is the single biggest upgrade — it turns the screener into a self-measuring system.
2. **Gap-risk overlay** — skip TRIGGERED entries that gapped >1 ATR at the open (fill quality with 15-min-delayed data is your real constraint; closes are safe, opens are not).
3. **Cross-asset tells per theme** — uranium names gated on CCJ/URA RS, bitcoin miners on BTC-USD trend, defense on geopolitical-vol proxy. One ratio per theme bucket in regime.js.
4. **Short-interest squeeze flag** — `quoteSummary defaultKeyStatistics.shortPercentOfFloat` >15% on a COILING name = squeeze accelerant; add to dump.
5. **Earnings-drift module** — post-earnings gap-up >5% on >2x vol that holds 2 days = PEAD entry; well-documented 30–60d drift, perfectly suited to your hold horizon and delayed data.
