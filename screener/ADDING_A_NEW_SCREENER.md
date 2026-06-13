# ADDING A NEW SCREENER — TWO-PASS ARCHITECTURAL PATTERN

This guide explains the authoritative architectural pattern used to build high-performance stock screeners in this platform. By splitting operations into a **High-Performance Quantitative Pass 1** and a **Deep AI Synthesis Pass 2**, we achieve lightning fast scans, total resiliency, zero unnecessary token spend, and deep qualitative intelligence.

---

## The Coiled Spring Architecture Recap

### Pass 1: High-Performance Quantitative Filter (Server-Side)
* **Goal**: Process a large index (S&P 500, Nasdaq 100) or selected custom tickers instantly.
* **Mechanism**:
  1. Retrieves raw historical market candle quotes (resiliently retrying and sanitizing `null` values or premarket/holiday data halts).
  2. Runs high-speed deterministic math (e.g. standard Average True Range (ATR), Relative Strength index (RSI), Obv Slope, Up-Down Volume ratio (Institiutional Accumulation), and Custom Box consolidation limits).
  3. Classifies momentum state machines (`COILING`, `TRIGGERED`, `REVERSAL`, `EXTENDED`).
  4. Returns lightweight, fully calculated JSON records.

### Pass 2: Qualitative LLM Synthesis & Catalyst Scan (Gemini Client/Server Side)
* **Goal**: Perform qualitative equity research on only the Top N (e.g., Top 15) qualifiers identified in Pass 1.
* **Mechanism**:
  1. Feeds the structured results from Pass 1 into Gemini (`gemini-3.5-flash` or similar models).
  2. Enables Gemini's **Google Search tool** dynamically (`googleSearch: {}`).
  3. Commands the model to perform active, real-time live searches for recent catalysts (7-day or 20-day news on product releases, guidance changes, insider trades, earnings reports).
  4. Hard-gates the tape readings verbatim against Pass 1 attributes (the Tape Check).
  5. Outputs a strict, schema-validated JSON array of qualitative insights (thesis, valid target, invalidation level, oil/fuel catalyst).

---

## Step-by-Step Guide to Adding a New Screener

Suppose you are implementing a **"Golden Cross Gap Broker"** screener (scanning for tickers moving through 50/200 MAs with morning gap-ups and high relative volume).

### Step 1: Define the Mathematical Logic (Pass 1)
In `/lib/setups.cjs` or a new module, write a helper function that takes the sanitized historical quotes and analyzes them.

```javascript
// lib/setups.cjs (or a newly created gap_up_setup.js)
function classifyGoldenGap(quotes) {
  if (quotes.length < 200) return { state: 'NO_DATA', score: 0 };
  
  const today = quotes[quotes.length - 1];
  const yesterday = quotes[quotes.length - 2];
  
  // Calculate MAs
  const sma50 = getSMA(quotes, 50);
  const sma200 = getSMA(quotes, 200);
  
  // Check conditions
  const goldenCross = sma50 > sma200 && (quotes[quotes.length - 10].sma50 <= quotes[quotes.length - 10].sma200); // crossover recently
  const gapUp = today.open > yesterday.close * 1.015; // > 1.5% gap up
  const highRelVol = today.volume > getAverageVolume(quotes, 20) * 1.4; // spike
  
  let score = 30;
  if (goldenCross) score += 30;
  if (gapUp) score += 20;
  if (highRelVol) score += 20;

  let state = 'NEUTRAL';
  if (goldenCross && gapUp && highRelVol) {
    state = 'TRIGGERED';
  } else if (goldenCross) {
    state = 'COILING'; // waiting for breakout
  }

  return { state, score, pivot: yesterday.close * 1.015 };
}
```

### Step 2: Integrate Your Setup into the Server API (`server.ts`)
Create a new function `computeGoldenGap(ticker, horizon)` in `/server.ts` that:
1. Calls the upgraded, robust `fetchWithRetry(ticker, days)` function.
2. Runs the setup classifier.
3. Retrieves real-time ticker prices (if active) and analyst estimates.
4. Returns the standardized ticker record.

```typescript
// server.ts
async function computeGoldenGap(ticker: string, horizon: string = 'weeks') {
  try {
    const history = await fetchWithRetry(ticker, 250);
    if (!history || !history.quotes || history.quotes.length < 200) return null;
    
    const qs = history.quotes;
    const today = qs[qs.length - 1];
    const latestPrice = today.close;
    
    const setup = classifyGoldenGap(qs);
    if (setup.state === 'NO_DATA') return null;
    
    // Add real-time quote validation, growth metrics, and levels...
    return {
      ticker,
      price: latestPrice,
      signal: setup.state === 'TRIGGERED' ? 'GOLDEN_GAP' : 'NONE',
      state: setup.state,
      bull_score: setup.score,
      // ...rest of fields matching the standardized UI row contract
    };
  } catch (e) {
    return null;
  }
}
```

### Step 3: Wire into the Screener Dispatcher (`server.ts`)
Make sure your new screener is dispatched correctly in the `/api/screen` (or `/api/vcs-run`) endpoints.

```typescript
// inside app.get("/api/screen")
const res = screenerType === 'gate' 
  ? await computeGateScreener(t, horizon)
  : screenerType === 'coiled'
  ? await computeCoiledSpring(t, horizon)
  : screenerType === 'golden_gap'
  ? await computeGoldenGap(t, horizon) // Your new screener!
  : await computeVCS(t, horizon);
```

### Step 4: Write the Pass 2 LLM Prompt (Frontend - `src/App.tsx`)
In `/src/App.tsx`, compile the specialized prompt instructions that the AI must follow when scanning the raw setups of your new screener.

```typescript
// src/App.tsx
const goldenGapPrompt = `
You are a professional quantitative and equity analyst reviewing the "Golden Cross Gap" Pass 2 Neural Scan.
Analyze each of the provided candidates:

INSTRUCTIONS:
1. CATALYST DISCOVERY: Use the Google Search tool for each stock's news in the last 7 days. Focus on news prompting gaps: earnings beats, FDA approvals, custom chip partnerships, or capital expenditures.
2. VOLUME VALIDATION: Check if volume surge is genuine institutional participation.
3. Thesis: Compose a strict <= 40 word thesis outlining the gap-up cause and momentum outlook.

Output schema must be a strict JSON array of objects with keys: ticker, conviction, thesis, fuel, stopLoss.
`;
```

Submit this prompt dynamically using the `GoogleGenAI` model to overlay beautiful, customized qualitative commentary and high-conviction catalysts on top of your mathematical list.

---

By adhering to this two-pass split, your screeners remain extremely fast, lightweight, resilient to market data nulls or trading halt changes, and fully supercharged by the latest real-time web-grounded AI reasoning!
