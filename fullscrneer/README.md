# ⚡ VCS-FCE Super Signal v5.3 Screener

A standalone Node.js screener that converts the TradingView **VCS-FCE Super Signal v5.3** indicator into a batch screener. Applies the full **MACRO × TECH × ANALYST** combined rating logic across entire index universes.

## 🔄 Rating System

The combined 0–5 rating is computed from:

| Rating | Label | Meaning |
|--------|-------|---------|
| 5 ★★★★★ | **STRONG BUY** | Macro INVEST + Tech STRONG + Strong analyst upside + Good R:R |
| 4 ★★★★☆ | **BUY** | Macro/tech aligned + positive analyst |
| 3 ★★★☆☆ | **WATCH** | Some alignment, needs more confirmation |
| 2 ★★☆☆☆ | **HOLD** | Weak setup or capped by negative analyst/poor R:R |
| 1 ★☆☆☆☆ | **SELL** | Macro/tech conflict or bearish |
| 0 ☆☆☆☆☆ | **STRONG SELL** | All bearish |

### Rating Matrix (Macro × Tech)

|  | Tech STRONG | Tech BULLISH | Tech NEUTRAL | Tech WEAK | Tech BEAR |
|--|-------------|--------------|--------------|-----------|-----------|
| **INVEST** | 5 | 4 | 3 | 1 | 1 |
| **NEUTRAL** | 4 | 3 | 2 | 1 | 0 |
| **CASH** | 3 | 2 | 1 | 0 | 0 |

### Modifiers
- **+1** if coiled/breakout ready (capped at 5)
- **Cap at 2** if analyst NEGATIVE
- **Cap at 3** if thin analyst upside
- **5 requires** STRONG analyst upside AND non-poor R:R
- **Cap at 3** if R:R is POOR

## ⚡ Setup

```bash
cd screener
npm install
```

## 🔄 Execution Order

### STEP 1 — Run the Technical Screener

```bash
# Default curated universe (tech/defense/AI sectors)
node screener.js

# S&P 500
node screener.js --universe=sp500

# NASDAQ 100
node screener.js --universe=ndx100

# Russell 1000
node screener.js --universe=russell1000

# Russell 2000
node screener.js --universe=russell2000

# Demo mode (generated data, no network required)
node screener.js --demo
```

This generates:
- `screener_report.html` — Full dashboard with 3 tabs
- `top_tickers.txt` — Top 10 tickers for AI Neural Hunt
- `screener_results.json` — JSON export for programmatic use

### STEP 2 — Read Top Tickers

```bash
cat top_tickers.txt
```

### STEP 3 — AI Neural Hunt (Double Verification)

For each top ticker, perform deep research hunting for:
- Unannounced M&A rumors
- Government contract awards (DoD/NASA)
- AI infrastructure partnerships
- Macro tailwinds specific to the company
- **Double verify** facts from SEC filings, social sentiment, alternative data

### STEP 4 — Write `neural_insights.txt`

Format your research exactly like this, separated by `---`:

```
TICKER: NVDA
RATING: STRONG BUY
ENTRY: 135.00
EXIT: 172.80
VAL_MOAT: Dominant GPU ecosystem with CUDA moat. 80%+ data center market share.
TAILWINDS_RISKS: Tailwind: AI infrastructure buildout accelerating. Risk: China export restrictions.
FUEL_NEWS: Blackwell GPU ramp exceeding expectations. Major cloud providers increasing capex.
STORY_CHANGERS: 1. Custom ASIC business could double TAM. 2. Sovereign AI infrastructure deals.
DOUBLE_VERIFY: Confirmed via SEC 10-K filing, verified cloud capex via earnings transcripts.
---
TICKER: PLTR
RATING: STRONG BUY
ENTRY: 120.00
EXIT: 162.00
VAL_MOAT: Foundry platform creates deep enterprise lock-in. Government contracts provide stable base.
TAILWINDS_RISKS: Tailwind: Enterprise AI adoption wave. Risk: High valuation leaves no margin of safety.
FUEL_NEWS: AIP platform adoption accelerating. New TITAN contract with US Army announced.
STORY_CHANGERS: 1. Commercial revenue now exceeding government. 2. AIP bootcamp model driving adoption.
DOUBLE_VERIFY: TITAN contract confirmed via DoD press release. Commercial KPIs verified via earnings.
```

### STEP 5 — Generate Final Dashboard

```bash
node neuralmd.js neural_insights.txt
```

This injects the AI research cards into the Neural Hunt tab, producing `final_screener_report.html`.

## 📊 Output Columns

| Column | Description |
|--------|-------------|
| Ticker | Symbol |
| Rating | ★★★★★ rating + label |
| Price | Current/last close |
| Tech Score | 0-100 technical rating (55% structural + 45% live + state adjustments) |
| Tech Tier | STRONG/BULLISH/NEUTRAL/WEAK/BEARISH |
| State | Current market state (BREAKOUT, COILING, ACCUMULATION, DISTRIBUTION, etc.) |
| Trend | UPTREND/DOWNTREND/NO TREND |
| VCS Δ | Fast delta (buying/selling pressure indicator) |
| Conf | Confluence score (-3 to +3) |
| Upside | % to analyst mean target |
| Analyst | STRONG/OK/THIN/NEGATIVE |
| Stop | Stop-loss level (OB or structure-based) |
| Target | Target price (analyst mean or ATR fallback) |
| R:R | Risk:Reward ratio |
| Shares | Position size (shares) |
| Pos $ | Position value |
| Risk $ | Risk amount |
| Why | Combination explanation |

## 🏗 Architecture

```
screener/
├── screener.js          # Main entry point
├── neuralmd.js          # AI Neural Hunt injection step
├── config.js            # All parameters (matches Pine Script inputs)
├── package.json
├── lib/
│   ├── indicators.js    # Pure technical indicators (ATR, RSI, SMA, EMA, OBV, BB, etc.)
│   ├── technical.js     # VCS Technical Engine (independent, extensible with AI)
│   ├── macro.js         # Macro Regime (FRED: yield curve, Sahm, Fed, housing)
│   ├── analyst.js       # Analyst targets (Yahoo Finance)
│   ├── rating.js        # Combined Rating 0-5 (Macro × Tech matrix + modifiers)
│   ├── risk.js          # R:R and position sizing
│   ├── report.js        # HTML report generation
│   ├── universe.js      # Index constituent fetching
│   └── sanity.js        # Data sanity checks
```

### Technical Engine (Independent & Extensible)

The `lib/technical.js` module is designed to be:
- **Independent** — Can be used standalone without macro/analyst layers
- **Extensible** — AI/neural overlays can be added as a post-processing step
- **Faithful** — Implements the full VCS v7.0 engine from the Pine Script

To extend with AI:
1. Run `screener.js` to get technical scores
2. Apply AI/neural adjustments to `tech_pts` or `tech_rating`
3. Re-run `rating.js` with the modified technical scores
4. Re-generate the report

## ⚙️ Data Sources

| Data | Source | API Key Required |
|------|--------|------------------|
| OHLCV + Analyst | Yahoo Finance (`yahoo-finance2`) | No |
| Yield Curve (T10Y2Y) | FRED | No (CSV download) |
| Unemployment (UNRATE) | FRED | No (CSV download) |
| Fed Funds (DFF) | FRED | No (CSV download) |
| Housing Starts (HOUST) | FRED | No (CSV download) |
| S&P 500 Constituents | Wikipedia | No |
| NDX 100 Constituents | Curated list | No |
| Russell Constituents | SlickCharts | No |

Optional: Set `FRED_API_KEY` environment variable for faster FRED API access.

## ⚠️ Disclaimer

This is **educational use only — not financial advice**. The VCS-FCE Super Signal is a technical analysis tool that does not guarantee returns. Always do your own research and consider your risk tolerance before making investment decisions.
