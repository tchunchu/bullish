/**
 * report.js — HTML Report Generation
 */

import fs from 'fs';

function fPrice(v) { return v != null ? '$' + v.toFixed(2) : '—'; }
function fPct(v) { return v != null ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : '—'; }
function fRR(v) { return v != null ? v.toFixed(2) + ':1' : '—'; }
function fMoney(v) {
  if (v == null) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  return '$' + v.toLocaleString();
}
function stars(n) { return n === 5 ? '★★★★★' : n === 4 ? '★★★★☆' : n === 3 ? '★★★☆☆' : n === 2 ? '★★☆☆☆' : n === 1 ? '★☆☆☆☆' : '☆☆☆☆☆'; }
function ratingColor(n) { return n === 5 ? '#00FF66' : n === 4 ? '#AAFF00' : n === 3 ? '#FFFF00' : n === 2 ? '#FFD700' : n === 1 ? '#FF8800' : '#FF2222'; }
function ratingBg(n) { return n === 5 ? 'rgba(0,255,102,0.12)' : n === 4 ? 'rgba(170,255,0,0.10)' : n === 3 ? 'rgba(255,255,0,0.08)' : 'rgba(255,136,0,0.08)'; }
function tierColor(t) { return t === 2 ? '#00FF66' : t === 1 ? '#AAFF00' : t === 0 ? '#FFFF00' : t === -1 ? '#FF8800' : '#FF2222'; }

export function generateSetupAnalysis(result) {
  const { tech, rating, risk, analyst, macro } = result;
  const tailwinds = [], risks = [], catalysts = [], entry = [], exit = [];

  if (tech.goLong) tailwinds.push('Confirmed breakout UP with volume');
  if (tech.breakoutReady) tailwinds.push('Coiled spring with buyers emerging — BREAKOUT READY');
  if (tech.coiled) tailwinds.push('Volatility squeeze — energy building');
  if (tech.obvDivergence) tailwinds.push('OBV divergence at low: smart money accumulating');
  if (tech.obvRising) tailwinds.push('OBV rising: positive money flow');
  if (tech.hlStruct) tailwinds.push('Higher-low structure intact: basing pattern');
  if (tech.isAccum) tailwinds.push('Accumulation detected: narrow range + volume');
  if (tech.matureUp) tailwinds.push('Mature buying pattern: multiple strong bull bars');
  if (tech.isBreatherBull) tailwinds.push('Bull breather: healthy pullback in uptrend');
  if (analyst && analyst.upGrade === 'STRONG') tailwinds.push(`Strong analyst upside ${fPct(analyst.analystUp)}`);
  if (macro && macro.regime === 1) tailwinds.push('Macro INVEST regime: broad tailwind');

  if (tech.distribution) risks.push('⚠ Distribution detected: selling into weakness');
  if (tech.goShort) risks.push('🔴 Confirmed breakout DOWN');
  if (tech.isDist) risks.push('Distribution bar: high volume, close near low');
  if (tech.trapUp) risks.push('Bull trap: false breakout above resistance');
  if (tech.bearDiv) risks.push('Bearish divergence: price high but OBV declining');
  if (tech.priceInDn) risks.push('Price below declining EMAs: bearish structure');
  if (tech.rsiWeak) risks.push('RSI oversold: potential further downside');
  if (risk && risk.g4 === 'POOR') risks.push('Poor risk:reward ratio');
  if (analyst && analyst.upGrade === 'NEGATIVE') risks.push('Price above analyst target: limited upside');
  if (macro && macro.regime === -1) risks.push('Macro CASH regime: broad headwind');

  if (tech.breakoutReady) catalysts.push('🔥 Volatility squeeze + buying pressure = imminent breakout');
  if (tech.goLong) catalysts.push('🔥 Breakout confirmed with volume');
  if (tech.isSqueeze) catalysts.push('Bollinger squeeze: volatility expansion coming');
  if (analyst && analyst.analystN > 10) catalysts.push(`${analyst.analystN} analysts covering: potential upgrade cycle`);

  if (tech.goLong) entry.push(`Aggressive entry at ${fPrice(result.price)} (breakout confirmed)`);
  if (tech.breakoutReady) entry.push(`Entry on breakout above recent highs, stop at ${fPrice(risk.stopLevel)}`);
  if (tech.isBreatherBull) entry.push(`Entry on dip near ${fPrice(tech.ema10)} (10 EMA support)`);
  if (tech.coiled) entry.push(`Wait for breakout confirmation above resistance`);
  entry.push(`Conservative entry: ${fPrice(risk.stopLevel)} stop, ${fPrice(risk.targetLevel)} target`);

  exit.push(`Stop loss: ${fPrice(risk.stopLevel)} (${risk.stopSource}, −${risk.riskPct}%)`);
  exit.push(`Target: ${fPrice(risk.targetLevel)} (${risk.targetSrc})`);
  exit.push(`R:R: ${fRR(risk.rr)} (${risk.g4})`);
  if (analyst && analyst.analystTgt) exit.push(`Analyst target: ${fPrice(analyst.analystTgt)}`);

  return {
    tailwinds: tailwinds.length > 0 ? tailwinds : ['No strong tailwinds identified'],
    risks: risks.length > 0 ? risks : ['No major risks identified'],
    catalysts: catalysts.length > 0 ? catalysts : ['No active catalysts'],
    entry: entry.length > 0 ? entry : ['Wait for setup'],
    exit: exit.length > 0 ? exit : ['No exit plan']
  };
}

function generateTable(results) {
  if (results.length === 0) return '<p style="color:var(--muted);padding:10px;">No tickers in this category</p>';
  return `<div class="table-wrap"><table>
<thead><tr>
  <th>Ticker</th><th>Rating</th><th>Price</th><th>Tech</th><th>Tier</th><th>State</th><th>Trend</th><th>VCS Δ</th><th>Conf</th><th>Upside</th><th>Analyst</th><th>Stop</th><th>Target</th><th>R:R</th><th>Shares</th><th>Pos $</th><th>Risk $</th><th>Why</th>
</tr></thead><tbody>
${results.map(r => {
  const c = ratingColor(r.rating.rating);
  const bg = ratingBg(r.rating.rating);
  return `<tr>
  <td class="ticker">${r.sym}</td>
  <td><span class="rating-badge" style="background:${bg};color:${c}">${stars(r.rating.rating)} ${r.rating.label}</span></td>
  <td>${fPrice(r.price)}</td>
  <td style="color:${tierColor(r.tech.techTier)}">${r.tech.techRating.toFixed(0)}</td>
  <td style="color:${tierColor(r.tech.techTier)}">${r.tech.techLbl}${r.tech.techExtra}</td>
  <td>${r.tech.stateStr}</td>
  <td>${r.tech.trendStatus}</td>
  <td style="color:${r.tech.fastDelta > 0 ? 'var(--green)' : 'var(--orange)'}">${r.tech.fastDelta > 0 ? '+' : ''}${r.tech.fastDelta}</td>
  <td>${r.tech.confScore}</td>
  <td style="color:${r.analyst && r.analyst.upGrade === 'STRONG' ? 'var(--green)' : r.analyst && r.analyst.upGrade === 'NEGATIVE' ? 'var(--red)' : 'var(--muted)'}">${r.analyst ? fPct(r.analyst.analystUp) : '—'}</td>
  <td>${r.analyst ? r.analyst.upGrade : '—'}</td>
  <td>${fPrice(r.risk.stopLevel)} <span style="color:var(--muted);font-size:0.8em">(${r.risk.stopSource})</span></td>
  <td>${fPrice(r.risk.targetLevel)}</td>
  <td style="color:${r.risk.g4 === 'EXCELLENT' ? 'var(--green)' : r.risk.g4 === 'POOR' ? 'var(--red)' : 'var(--yellow)'}">${fRR(r.risk.rr)} (${r.risk.g4})</td>
  <td>${r.risk.sharesFinal.toLocaleString()}</td>
  <td>${fMoney(r.risk.finalPositionDollars)}</td>
  <td>${fMoney(r.risk.finalRiskDollars)}</td>
  <td style="font-size:0.78em;color:var(--muted)">${r.rating.comboWhy}</td>
</tr>`;
}).join('\n')}
</tbody></table></div>`;
}

function generateDetailCard(r) {
  const analysis = generateSetupAnalysis(r);
  const c = ratingColor(r.rating.rating);
  const bg = ratingBg(r.rating.rating);
  return `<div class="detail-card" style="border-left:3px solid ${c}">
  <h3><span><span class="ticker">${r.sym}</span> <span style="color:var(--muted);font-weight:400;font-size:0.85em">${fPrice(r.price)}</span></span><span class="rating-badge" style="background:${bg};color:${c}">${stars(r.rating.rating)} ${r.rating.label}</span></h3>
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
    <span class="tag tag-${r.tech.techTier >= 1 ? 'green' : r.tech.techTier === 0 ? 'yellow' : 'red'}">${r.tech.techLbl}${r.tech.techExtra}</span>
    <span class="tag tag-blue">${r.tech.stateStr}</span>
    <span class="tag tag-${r.tech.trendStatus === 'UPTREND' ? 'green' : r.tech.trendStatus === 'DOWNTREND' ? 'red' : 'yellow'}">${r.tech.trendStatus}</span>
    ${r.analyst && r.analyst.analystOk ? `<span class="tag tag-${r.analyst.upGrade === 'STRONG' ? 'green' : r.analyst.upGrade === 'NEGATIVE' ? 'red' : 'yellow'}">Upside ${fPct(r.analyst.analystUp)} (${r.analyst.upGrade})</span>` : ''}
  </div>
  <div class="detail-section"><div class="detail-section-title">✅ Tailwinds</div><ul>${analysis.tailwinds.map(t => `<li style="color:var(--green)">${t}</li>`).join('')}</ul></div>
  <div class="detail-section"><div class="detail-section-title">⚠️ Risks</div><ul>${analysis.risks.map(t => `<li style="color:var(--red)">${t}</li>`).join('')}</ul></div>
  <div class="detail-section"><div class="detail-section-title">🔥 Catalysts</div><ul>${analysis.catalysts.map(t => `<li style="color:var(--yellow)">${t}</li>`).join('')}</ul></div>
  <div class="detail-section"><div class="detail-section-title">📍 Entry</div><ul>${analysis.entry.map(t => `<li>${t}</li>`).join('')}</ul></div>
  <div class="detail-section"><div class="detail-section-title">🚪 Exit / Stop / Target</div><ul>${analysis.exit.map(t => `<li>${t}</li>`).join('')}</ul></div>
  <div class="detail-section" style="border-left:3px solid var(--blue);padding-left:10px;"><div class="detail-section-title" style="color:var(--blue)">🔬 Double Verification</div><p class="n-text" style="color:var(--muted)">Awaiting AI Neural Hunt deep research for ${r.sym}. Verify: M&A rumors, gov contracts, SEC filings, social sentiment.</p></div>
</div>`;
}

export function generateReport(results, macroResult) {
  const timestamp = new Date().toISOString().split('T')[0] + ' ' + new Date().toTimeString().split(' ')[0];
  const strongBuys = results.filter(r => r.rating.rating === 5);
  const buys = results.filter(r => r.rating.rating === 4);
  const watches = results.filter(r => r.rating.rating === 3);

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>VCS-FCE Super Signal v5.3 Screener</title>
<style>
:root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--green:#00FF66;--lime:#AAFF00;--yellow:#FFFF00;--orange:#FF8800;--red:#FF2222;--blue:#58a6ff}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
.container{max-width:1600px;margin:0 auto;padding:20px}
h1{font-size:1.6em;margin-bottom:4px}
h2{font-size:1.2em;margin:20px 0 10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px}
.subtitle{color:var(--muted);font-size:0.85em;margin-bottom:16px}
.tabs{display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:20px}
.tab{padding:10px 24px;cursor:pointer;color:var(--muted);font-weight:600;border-bottom:3px solid transparent;transition:all .2s}
.tab:hover{color:var(--text)}.tab.active{color:var(--green);border-bottom-color:var(--green)}
.tab-content{display:none}.tab-content.active{display:block}
.macro-banner{display:flex;gap:16px;margin-bottom:20px;padding:16px;background:var(--surface);border-radius:8px;border:1px solid var(--border);flex-wrap:wrap}
.macro-item{flex:1;min-width:150px;text-align:center}
.macro-label{font-size:.7em;color:var(--muted);text-transform:uppercase;letter-spacing:1px}
.macro-value{font-size:1.4em;font-weight:800}
.macro-detail{font-size:.75em;color:var(--muted)}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.82em}
th{background:var(--surface);color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-size:.75em;padding:8px 10px;text-align:left;border-bottom:2px solid var(--border);position:sticky;top:0;z-index:1}
td{padding:7px 10px;border-bottom:1px solid var(--border);vertical-align:top}
tr:hover{background:rgba(255,255,255,.03)}
.ticker{font-weight:800;font-size:1.05em}
.rating-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-weight:800;font-size:.85em}
.detail-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px;margin-top:20px}
.detail-card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px}
.detail-card h3{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.detail-section{margin-bottom:12px}
.detail-section-title{font-size:.75em;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
.detail-section ul{padding-left:16px;font-size:.85em}
.detail-section li{margin-bottom:2px}
.tag{display:inline-block;padding:1px 6px;border-radius:3px;font-size:.78em;font-weight:600;margin:1px 2px}
.tag-green{background:rgba(0,255,102,.15);color:var(--green)}
.tag-red{background:rgba(255,34,34,.15);color:var(--red)}
.tag-yellow{background:rgba(255,255,0,.15);color:var(--yellow)}
.tag-blue{background:rgba(88,166,255,.15);color:var(--blue)}
.stats-row{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
.stat-box{flex:1;min-width:120px;padding:12px;background:var(--surface);border-radius:8px;border:1px solid var(--border);text-align:center}
.stat-label{font-size:.7em;color:var(--muted);text-transform:uppercase;letter-spacing:1px}
.stat-value{font-size:1.6em;font-weight:800}
.neural-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px;margin-top:20px}
.neural-card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:20px}
.neural-card h2{color:var(--text);text-transform:none;letter-spacing:0;margin-bottom:12px;display:flex;align-items:center;gap:10px}
.n-badge{padding:2px 10px;border-radius:4px;font-weight:800;font-size:.8em}
.n-section{margin-bottom:14px;padding-left:10px;border-left:3px solid var(--border)}
.n-title{font-size:.82em;font-weight:700;color:var(--muted);margin-bottom:4px}
.n-text{font-size:.85em;line-height:1.5}
</style></head><body><div class="container">
<h1>⚡ VCS-FCE Super Signal v5.3 Screener</h1>
<div class="subtitle">MACRO × TECH × ANALYST Combined Rating | ${timestamp} | Educational use only — not financial advice</div>
<div class="macro-banner">
  <div class="macro-item"><div class="macro-label">Macro Regime</div><div class="macro-value" style="color:${macroResult ? ratingColor(macroResult.regime === 1 ? 5 : macroResult.regime === -1 ? 0 : 3) : 'var(--muted)'}">${macroResult ? macroResult.label : 'N/A'}</div><div class="macro-detail">${macroResult ? macroResult.score.toFixed(0) + '/100' : '—'}</div></div>
  <div class="macro-item"><div class="macro-label">Equity Alloc</div><div class="macro-value" style="color:var(--lime)">${macroResult ? macroResult.equityAlloc.toFixed(0) + '%' : '—'}</div><div class="macro-detail">Cash ${(100 - (macroResult ? macroResult.equityAlloc : 50)).toFixed(0)}%</div></div>
  <div class="macro-item"><div class="macro-label">Yield Curve</div><div class="macro-value" style="color:${macroResult && macroResult.pillars.curve.score >= 0.5 ? 'var(--green)' : macroResult && macroResult.pillars.curve.score <= -0.5 ? 'var(--red)' : 'var(--muted)'}">${macroResult ? (macroResult.pillars.curve.score >= 0 ? '+' : '') + macroResult.pillars.curve.score.toFixed(1) : '—'}</div><div class="macro-detail">${macroResult ? macroResult.pillars.curve.state : '—'}</div></div>
  <div class="macro-item"><div class="macro-label">Labor/Sahm</div><div class="macro-value" style="color:${macroResult && macroResult.pillars.labor.score >= 0.5 ? 'var(--green)' : macroResult && macroResult.pillars.labor.score <= -0.5 ? 'var(--red)' : 'var(--muted)'}">${macroResult ? (macroResult.pillars.labor.score >= 0 ? '+' : '') + macroResult.pillars.labor.score.toFixed(1) : '—'}</div><div class="macro-detail">${macroResult ? macroResult.pillars.labor.state : '—'}</div></div>
  <div class="macro-item"><div class="macro-label">Fed Policy</div><div class="macro-value" style="color:${macroResult && macroResult.pillars.fed.score >= 0.5 ? 'var(--green)' : macroResult && macroResult.pillars.fed.score <= -0.5 ? 'var(--red)' : 'var(--muted)'}">${macroResult ? (macroResult.pillars.fed.score >= 0 ? '+' : '') + macroResult.pillars.fed.score.toFixed(1) : '—'}</div><div class="macro-detail">${macroResult ? macroResult.pillars.fed.state : '—'}</div></div>
  <div class="macro-item"><div class="macro-label">Housing</div><div class="macro-value" style="color:${macroResult && macroResult.pillars.housing.score >= 0.5 ? 'var(--green)' : macroResult && macroResult.pillars.housing.score <= -0.5 ? 'var(--red)' : 'var(--muted)'}">${macroResult ? (macroResult.pillars.housing.score >= 0 ? '+' : '') + macroResult.pillars.housing.score.toFixed(1) : '—'}</div><div class="macro-detail">${macroResult ? macroResult.pillars.housing.state : '—'}</div></div>
</div>
<div class="stats-row">
  <div class="stat-box"><div class="stat-label">Total Scanned</div><div class="stat-value">${results.length}</div></div>
  <div class="stat-box"><div class="stat-label">Strong Buy</div><div class="stat-value" style="color:var(--green)">${strongBuys.length}</div></div>
  <div class="stat-box"><div class="stat-label">Buy</div><div class="stat-value" style="color:var(--lime)">${buys.length}</div></div>
  <div class="stat-box"><div class="stat-label">Watch</div><div class="stat-value" style="color:var(--yellow)">${watches.length}</div></div>
</div>
<div class="tabs">
  <div class="tab active" onclick="switchTab('screener',this)">📊 Screener Table</div>
  <div class="tab" onclick="switchTab('details',this)">🔍 Setup Analysis</div>
  <div class="tab" onclick="switchTab('neural',this)">🧠 AI Neural Hunt</div>
</div>
<div id="tab-screener" class="tab-content active">
  <h2>★★★★★ Strong Buy</h2>${generateTable(strongBuys)}
  <h2>★★★★☆ Buy</h2>${generateTable(buys)}
  ${watches.length > 0 ? `<h2>★★★☆☆ Watch</h2>${generateTable(watches.slice(0, 25))}` : ''}
</div>
<div id="tab-details" class="tab-content">
  <h2>Setup Analysis — Tailwinds · Risks · Catalysts · Entry/Exit</h2>
  <div class="detail-grid">${[...strongBuys, ...buys].slice(0, 20).map(r => generateDetailCard(r)).join('\n')}</div>
</div>
<div id="tab-neural" class="tab-content">
  <h2>🧠 AI Neural Hunt — Double Verification</h2>
  <p style="color:var(--muted);margin:10px 0;">Run <code>node neuralmd.js neural_insights.txt</code> to inject deep research cards here.</p>
  <p style="color:var(--muted);font-size:0.85em;">Top tickers for deep research: <strong>${results.slice(0, 10).map(r => r.sym).join(', ')}</strong></p>
  <!--AI_NEURAL_HUNT_CONTENT-->
  <div class="neural-grid"><div style="text-align:center;color:var(--muted);padding:40px;grid-column:1/-1;">
    <p style="font-size:1.2em;">Awaiting AI Neural Hunt execution</p>
    <p>For each top ticker, perform deep web_search for: Unannounced M&A rumors, Government contract awards, AI infrastructure partnerships, macro tailwinds.<br>Double verify facts from alternative data sources, Reddit/Twitter sentiment, and recent SEC filings.</p>
  </div></div>
  <!-- End AI_NEURAL_HUNT_CONTENT -->
</div>
</div>
<script>
function switchTab(name,el){document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));document.getElementById('tab-'+name).classList.add('active');el.classList.add('active')}
</script></body></html>`;
}

export function generateTopTickers(results, count) {
  return results.slice(0, count).map(r => r.sym).join(',');
}

export function generateConsoleSummary(results) {
  const buys = results.filter(r => r.rating.rating >= 4);
  if (buys.length === 0) { console.log('\n  📋 No Strong Buy or Buy tickers found.\n'); return; }

  console.log('\n╔═══════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  ★★★★★ STRONG BUY  &  ★★★★☆ BUY  TICKERS                                                    ║');
  console.log('╠══════════╦══════════╦═════════╦═════════════╦═══════════╦════════╦════════╦══════════════════╣');
  console.log('║ Ticker   ║ Rating   ║ Price   ║ Tech Score  ║ State     ║ Upside ║ R:R    ║ Why              ║');
  console.log('╠══════════╬══════════╬═════════╬═════════════╬═══════════╬════════╬════════╬══════════════════╣');

  for (const r of buys) {
    const sym = r.sym.padEnd(8);
    const rat = (stars(r.rating.rating) + ' ' + r.rating.label).padEnd(9);
    const prc = fPrice(r.price).padEnd(8);
    const tech = (r.tech.techRating.toFixed(0) + '/' + r.tech.techLbl).padEnd(12);
    const state = r.tech.stateStr.substring(0, 10).padEnd(10);
    const up = r.analyst ? fPct(r.analyst.analystUp).padEnd(7) : '—     '.padEnd(7);
    const rr = fRR(r.risk.rr).padEnd(7);
    const why = r.rating.comboWhy.substring(0, 17).padEnd(17);
    console.log(`║ ${sym} ║ ${rat} ║ ${prc} ║ ${tech} ║ ${state} ║ ${up} ║ ${rr} ║ ${why} ║`);
  }
  console.log('╚══════════╩══════════╩═════════╩═════════════╩═══════════╩════════╩════════╩══════════════════╝');
}
