#!/usr/bin/env node
/**
 * screener.js — Unified Alpha Screener (Node.js Edition)
 * Hunts for Coiled Springs, Value/Growth Reversals, and AI/Gov Catalysts.
 * Usage: node screener.js [--universe=sp500]
 */
'use strict';
const yahooFinance = require('yahoo-finance2').default;
const yf = new yahooFinance({ suppressNotices: ['yahooSurvey'] });
const https = require('https');
const fs = require('fs');
const { getATR, getRSI, getSMA } = require('../lib/indicators.js');
const { sanityCheck } = require('../lib/sanity.js');

const UNIVERSE = [
  "AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","AVGO","TSM","AMD","ASML",
  "CRM","ADBE","NFLX","NOW","UBER","INTU","WDAY","SNOW","PLTR","DDOG","CRWD","PANW",
  "ZS","NET","MDB","TEAM","HUBS","SHOP","MELI","CPNG","SE","BABA","JD","PDD",
  "QCOM","TXN","INTC","AMAT","LRCX","MU","KLAC","ARM","MRVL","SMCI","VRT","ANET",
  "CEG","VST","TLN","GEV","CCJ","UUUU","BWXT","LEU", 
  "RDW","LUNR","ASTS","RKLB","SPIR","BKSY","PL","MAXR", 
  "RTX","LMT","GD","NOC","AVAV","KTOS", 
  "CLSK","MARA","RIOT","IREN","CORZ","WULF","CIFR" 
];

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
         return resolve(fetchUrl(res.headers.location));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function getSP500() {
  try {
    const raw = await fetchUrl('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies');
    const tableStart = raw.indexOf('id="constituents"');
    if (tableStart === -1) throw new Error("Constituents table not found");
    const tableEnd = raw.indexOf('</tbody>', tableStart);
    const tableHtml = raw.substring(tableStart, tableEnd);
    
    const rows = tableHtml.split('<tr');
    let tickers = new Set();
    
    for (let i = 2; i < rows.length; i++) {
        const row = rows[i];
        const cellMatch = row.match(/>\s*<(td|th)[^>]*>([\s\S]*?)<\/\1>/i);
        if (cellMatch) {
            let text = cellMatch[2].replace(/<[^>]*>/g, '').trim();
            text = text.replace('.', '-');
            if (text && /^[A-Z-]+$/.test(text)) {
                tickers.add(text);
            }
        }
    }
    
    if (tickers.size < 100) return UNIVERSE;
    return Array.from(tickers);
  } catch (e) {
    console.log("Error extracting SP500, defaulting to curated universe.", e.message);
    return UNIVERSE;
  }
}

function analyzeCatalysts(news) {
  let signals = [];
  const aiRegex = /\b(ai|artificial intelligence|llm|nvidia|gpu|data center|compute)\b/i;
  const govRegex = /\b(government|dod|pentagon|defense|nasa|contract|awarded)\b/i;
  const rumorRegex = /\b(rumor|acquisition|buyout|merger|spinoff)\b/i;

  let aiScore = 0, govScore = 0, rumorScore = 0;
  news.forEach(n => {
    const text = (n.title + " " + (n.summary || "")).toLowerCase();
    if (aiRegex.test(text)) { aiScore++; if(!signals.includes('🤖 AI Tailwind')) signals.push('🤖 AI Tailwind'); }
    if (govRegex.test(text)) { govScore++; if(!signals.includes('🏛️ Gov Contract')) signals.push('🏛️ Gov Contract'); }
    if (rumorRegex.test(text)) { rumorScore++; if(!signals.includes('🤫 M&A/Rumor')) signals.push('🤫 M&A/Rumor'); }
  });
  return { signals, aiScore, govScore, rumorScore };
}

async function screenTickerPass1(sym) {
  try {
    const d1 = Math.floor(Date.now() / 1000) - 180 * 24 * 3600;
    const [qs, ch] = await Promise.all([
      yf.quoteSummary(sym, { modules: ['financialData', 'defaultKeyStatistics'] }).catch(()=>null),
      yf.chart(sym, { period1: d1, interval: '1d' }).catch(()=>null)
    ]);

    if (!ch || !ch.quotes || ch.quotes.length < 50 || !qs) return null;

    const quotes = ch.quotes.filter(q => q.close !== null);
    const lastQuote = quotes[quotes.length - 1];
    const price = lastQuote.close;
    const vol = lastQuote.volume;

    const closes = quotes.map(q => q.close);
    const vols = quotes.map(q => q.volume);
    
    const sma50 = getSMA(closes, 50);
    const sma20 = getSMA(closes, 20);
    const avgVol = getSMA(vols, 20);
    const rsi = getRSI(quotes, 14);
    const atr = getATR(quotes, 14);

    const fd = qs.financialData || {};
    const { sanitized } = sanityCheck({ revGr: fd.revenueGrowth });
    const revGrowth = sanitized.revGr || 0;
    const margins = fd.operatingMargins || 0;

    let score = 0;
    let setupType = "WATCHING";

    const distTo50 = Math.abs((price - sma50) / sma50);
    const volSurge = vol > (avgVol * 1.3);
    if (distTo50 < 0.05 && volSurge && rsi > 50 && rsi < 70) {
      score += 40; setupType = "🔥 COILED SPRING";
    }

    if (rsi > 30 && rsi < 45 && price > sma20 && distTo50 > 0.1) {
      score += 30; setupType = "🌱 BOTTOM REVERSAL";
    }

    if (revGrowth > 0.15 && margins > 0) score += 20;
    if (revGrowth > 0.30) score += 10;
    
    if (score < 20) return null;

    const entry = price;
    
    // FIX: Swing-Low Stop
    const last20Lows = quotes.slice(-20).map(q => q.low);
    const swingLow = Math.min(...last20Lows);
    // If swing low is too close or above current price, fall back to 2x ATR
    const stop = (swingLow < price * 0.99) ? swingLow : (price - (atr * 2));
    
    const analystTarget = fd.targetMeanPrice;
    
    // Dynamic target based on standard 2.5x Risk/Reward if no analyst target exists
    let t1 = price + ((price - stop) * 2.5);
    let rr = (t1 - entry) / (entry - stop); 
    let upside = ((t1 - entry) / entry) * 100;
    
    // Override with Analyst Target if it implies positive R:R
    if (analystTarget && analystTarget > price) {
        t1 = analystTarget;
        rr = (t1 - entry) / (entry - stop);
        upside = ((t1 - entry) / entry) * 100;
    }

    return {
      sym, price, score, setupType, entry, stop, t1, rr, upside,
      revGrowth: (revGrowth * 100).toFixed(1) + '%'
    };
  } catch (e) { return null; }
}

async function screenTickerPass2(r) {
  try {
    const search = await yf.search(r.sym, { newsCount: 10 }).catch(()=>null);
    const newsData = analyzeCatalysts((search && search.news) ? search.news : []);
    
    if (newsData.aiScore > 0) r.score += 15;
    if (newsData.govScore > 0) r.score += 20;
    if (newsData.rumorScore > 0) r.score += 25;
    
    r.signals = newsData.signals.join(' | ') || 'No major recent catalyst';
    return r;
  } catch(e) {
    r.signals = 'Error fetching news';
    return r;
  }
}

(async () => {
  const args = process.argv.slice(2);
  const useSP500 = args.includes('--universe=sp500');
  
  let universe = UNIVERSE;
  if (useSP500) {
      console.log("Fetching S&P 500 constituents from Wikipedia...");
      const sp500 = await getSP500();
      // MERGE the S&P 500 with the highly-curated AI/Space/Defense list
      universe = Array.from(new Set([...UNIVERSE, ...sp500]));
      console.log(`Merged list contains ${universe.length} total tickers.`);
  }
  
  console.log(`\n================================================================`);
  console.log(`🚀 UNIFIED ALPHA SCREENER | Hunting ${universe.length} Tickers...`);
  console.log(`================================================================\n`);

  let pass1Results = [];
  const concurrency = 10;
  
  process.stdout.write(`[1/2] Running Technical/Fundamental Gate...\n`);
  for (let i = 0; i < universe.length; i += concurrency) {
    const chunk = universe.slice(i, i + concurrency);
    process.stdout.write(`\rScanning batch ${Math.floor(i / concurrency) + 1} of ${Math.ceil(universe.length / concurrency)}...`);
    const promises = chunk.map(sym => screenTickerPass1(sym));
    const chunkResults = await Promise.all(promises);
    pass1Results.push(...chunkResults.filter(r => r !== null));
    await new Promise(r => setTimeout(r, 200)); 
  }
  
  pass1Results.sort((a, b) => b.score - a.score);
  const semiFinalists = pass1Results.slice(0, 40);
  
  console.log(`\n\n[2/2] Running Deep NLP Analysis on ${semiFinalists.length} Semi-Finalists...\n`);
  let finalResults = [];
  for (let i = 0; i < semiFinalists.length; i += concurrency) {
    const chunk = semiFinalists.slice(i, i + concurrency);
    process.stdout.write(`\rNLP Scanning batch ${Math.floor(i / concurrency) + 1}...`);
    const promises = chunk.map(r => screenTickerPass2(r));
    const chunkResults = await Promise.all(promises);
    finalResults.push(...chunkResults);
    await new Promise(r => setTimeout(r, 200));
  }

  const filtered = finalResults.sort((a,b)=>b.score - a.score);

  let htmlContent = `<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Arena Screener Dashboard</title>
  <style>
    :root { --bg: #0f172a; --panel: #1e293b; --text: #f8fafc; --muted: #94a3b8; --border: rgba(255,255,255,0.1); --accent: #3b82f6; }
    body { font-family: -apple-system, system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 32px; line-height: 1.6;}
    
    .tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
    .tab { background: transparent; color: var(--muted); border: none; padding: 12px 24px; font-size: 15px; font-weight: 600; cursor: pointer; border-radius: 8px 8px 0 0; }
    .tab.active { background: rgba(59,130,246,0.15); color: #60a5fa; border-bottom: 2px solid #60a5fa; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }

    table { width: 100%; border-collapse: collapse; background: var(--panel); border-radius: 12px; overflow: hidden; margin-bottom: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.3);}
    th, td { padding: 16px; text-align: left; border-bottom: 1px solid var(--border); }
    th { background: rgba(0,0,0,0.3); font-size: 12px; text-transform: uppercase; color: var(--muted); }
    .pos { color: #34d399; font-weight: 600;} .neg { color: #f87171; } .upside { color: #60a5fa; font-weight: bold; }
    .badge { padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; background: rgba(255,255,255,0.1); }
    
    /* Neural Cards */
    .neural-grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); }
    .neural-card { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); border-top: 4px solid var(--accent); }
    .neural-card h2 { margin: 0 0 16px; font-size: 24px; color: #fff; display:flex; justify-content:space-between; align-items:center;}
    .n-badge { font-size:12px; padding: 4px 10px; border-radius: 12px; background: rgba(52,211,153,0.1); color: #34d399; border: 1px solid rgba(52,211,153,0.3); }
    .n-section { margin-bottom: 16px; padding: 16px; background: rgba(255,255,255,0.02); border-radius: 8px; }
    .n-title { font-size: 12px; text-transform: uppercase; color: var(--muted); font-weight: 700; margin-bottom: 8px; letter-spacing: 0.05em;}
    .n-text { font-size: 14px; color: #cbd5e1; margin:0;}
  </style>
  <script>
    function switchTab(id, el) {
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        el.classList.add('active');
    }
  </script>
  </head><body>
  <h1 style="color: #60a5fa; margin-bottom: 8px; display:flex; align-items:center; gap:12px;">
    🚀 Unified Alpha Screener <span style="font-size:16px; font-weight:normal; color:var(--muted)">v4</span>
  </h1>
  
  <div class="tabs">
    <button class="tab active" onclick="switchTab('tech-scan', this)">📊 Technical Scan (Top 15)</button>
    <button class="tab" onclick="switchTab('ai-neural', this)">🧠 AI Neural Hunt (Top 10)</button>
  </div>

  <div id="tech-scan" class="tab-content active">
  <table>
    <thead><tr><th>Ticker</th><th>Setup</th><th>Price</th><th>Upside</th><th>Rev Gr</th><th>Dynamic R:R</th><th>Entry</th><th>Stop (Swing Low)</th><th>Analyst Target</th><th>Noise Signals</th></tr></thead>
    <tbody>
`;

  filtered.slice(0, 15).forEach(r => {
    htmlContent += `<tr>
      <td><strong style="font-size:16px;">${r.sym}</strong></td>
      <td><span class="badge">${r.setupType || 'WATCHING'}</span></td>
      <td>$${r.price.toFixed(2)}</td>
      <td class="upside">+${r.upside ? r.upside.toFixed(1) : 0}%</td>
      <td class="pos">${r.revGrowth}</td>
      <td style="color:#fbbf24; font-weight:bold;">${r.rr ? r.rr.toFixed(1) : 0}x</td>
      <td style="color:#60a5fa">$${r.entry.toFixed(2)}</td>
      <td class="neg">$${r.stop.toFixed(2)}</td>
      <td class="pos">$${r.t1.toFixed(2)}</td>
      <td style="font-size:13px; color:#cbd5e1;">${r.signals}</td>
    </tr>`;
  });

  htmlContent += `</tbody></table>
  </div>
  
  <div id="ai-neural" class="tab-content">
    <div style="background: rgba(245,158,11,0.05); border: 1px solid rgba(245,158,11,0.3); padding: 16px; border-radius: 12px; margin-bottom: 24px; color: #fbbf24; font-size: 14px;">
        <strong>Double Verification Directive:</strong> The AI Agent has bypassed standard finance aggregators to hunt the deep web for unannounced rumors, regulatory risks, and catalyst validations for the top setups below.
    </div>
    
    <!-- AI_NEURAL_HUNT_CONTENT -->
    <div style="text-align:center; padding: 40px; color: var(--muted); border: 1px dashed var(--border); border-radius: 12px;">
        <p>Awaiting AI Neural Hunt execution. Run <code>node neuralmd.js neural_insights.txt</code> to populate this tab.</p>
    </div>
  </div>
  </body></html>`;
  
  fs.writeFileSync('screener_report.html', htmlContent);
  fs.writeFileSync('top_tickers.txt', filtered.slice(0, 10).map(r => r.sym).join(','));
  console.log(`\n✅ Screener dashboard saved to screener_report.html`);
  console.log(`✅ Top 10 tickers saved to top_tickers.txt for AI Neural Hunt\n`);
})();
