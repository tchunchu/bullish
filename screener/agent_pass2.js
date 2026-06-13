import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function runPass2() {
  const dump = JSON.parse(fs.readFileSync('screener/screener_dump.json', 'utf8'));
  const prompt = `
You are a professional quantitative and equity analyst reviewing the Coiled Spring Pass 2 Neural Scan.
Analyze each of the candidates below based on the screener dump.

INSTRUCTIONS:
1. TAPE CHECK — do udvRatio50 (>1.3 = accum), obvSlope20 (>0 = rising OBV), rsLineHigh (true = institutional tell), closeRange (≥0.7 = buyers at close) confirm or contradict the setup.state? Conflict → cap conviction at 5 and explain in thesis.
2. NEWS FUEL — Use the Google Search tool for each stock's news in the last 7 days. Focus on news prompting gaps: earnings beats, FDA approvals, custom chip partnerships, or capital expenditures.
3. EARNINGS — if earningsRisk: true → either set conviction ≤ 4 or explicitly note binary-event sizing in thesis.
4. REGIME — respect regime.exposure as max size multiplier. In RISK_OFF only TRIGGERED names merit capital.

DUMP OVERVIEW:
Regime: ${dump.regime.regime} (Exposure: ${dump.regime.exposure})
Candidates:
${JSON.stringify(dump.candidates.map(c => ({
  sym: c.sym, setup: c.setup, tape: c.tape, earningsRisk: c.earningsRisk
})), null, 2)}

Output schema must be a strict JSON array of objects with exactly these keys:
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
No other text.
`;

  console.log("Requesting Gemini Pass 2 evaluation...");
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: prompt
  });

  let raw = response.text || "[]";
  const jsonStart = raw.indexOf('[');
  const jsonEnd = raw.lastIndexOf(']');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    raw = raw.slice(jsonStart, jsonEnd + 1);
  }
  
  fs.writeFileSync('screener/pass2.json', raw);
  console.log("Saved pass2.json");
}

runPass2().catch(err => {
  console.error("Pass 2 LLM error:", err);
  process.exit(1);
});
