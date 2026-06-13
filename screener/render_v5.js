#!/usr/bin/env node
/**
 * render_v5.js  — Deterministic HTML renderer.
 *
 * Reads pass2.json + screener_dump.json + screener_log.jsonl and writes
 * screener_report_YYYY-MM-DD.html  (dated, never overwritten).
 * Also writes screener_report_v5.html as the "latest" symlink-equivalent.
 *
 * THIS FILE IS THE SINGLE SOURCE OF TRUTH for report format and colour palette.
 * Never hand-edit the HTML output. All style changes belong here.
 *
 * Usage:
 *   node screener/render_v5.js                          # uses files in screener/
 *   node screener/render_v5.js --pass2=path/to/p2.json # override pass2 path
 *
 * Exit codes:  0 = OK,  1 = fatal (missing screener_dump.json or parse error)
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ─── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (prefix) => (args.find(a => a.startsWith(prefix)) || '').split('=')[1];

const DIR         = path.join(__dirname);  // screener/
const DUMP_PATH   = flag('--dump=')   || path.join(DIR, 'screener_dump.json');
const PASS2_PATH  = flag('--pass2=')  || path.join(DIR, 'pass2.json');
const LOG_PATH    = flag('--log=')    || path.join(DIR, 'screener_log.jsonl');

// ─── Load inputs ───────────────────────────────────────────────────────────
if (!fs.existsSync(DUMP_PATH)) {
  console.error(`❌ render_v5: missing ${DUMP_PATH}  — run screener_v5.js first`);
  process.exit(1);
}
const dump = JSON.parse(fs.readFileSync(DUMP_PATH, 'utf8'));

let pass2 = [];
if (fs.existsSync(PASS2_PATH)) {
  pass2 = JSON.parse(fs.readFileSync(PASS2_PATH, 'utf8'));
} else {
  console.warn(`⚠️  render_v5: ${PASS2_PATH} not found — report will show quant data only.`);
}

let logLines = [];
if (fs.existsSync(LOG_PATH)) {
  logLines = fs.readFileSync(LOG_PATH, 'utf8')
    .split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// ─── Merge dump + pass2 ────────────────────────────────────────────────────
const p2Map = Object.fromEntries(pass2.map(r => [r.sym, r]));

const candidates = dump.candidates.map(d => {
  const p = p2Map[d.sym] || {};
  return {
    sym:          d.sym,
    price:        d.price,
    rs:           d.rs,
    state:        d.setup.state,
    score:        d.setup.score,
    entry:        d.setup.entry,
    stop:         d.setup.stop,
    t1:           d.setup.t1,
    t2:           d.setup.t2,
    rr:           d.setup.rr,
    atr:          d.setup.atr,
    pivot:        d.setup.pivot,
    detail:       d.setup.detail,
    medDollarVolM: d.medDollarVolM,
    earningsRisk: d.earningsRisk,
    earningsInDays: d.earningsInDays,
    tape:         d.tape  || {},
    fund:         d.fund  || {},
    // LLM layer
    conviction:   typeof p.conviction === 'number' ? p.conviction : null,
    hold:         p.hold         || null,
    thesis:       p.thesis       || null,
    invalidation: p.invalidation || null,
    fuel:         p.fuel         || null,
  };
});

// Sort: conviction desc → quant score desc
candidates.sort((a, b) => {
  const cA = a.conviction ?? 0;
  const cB = b.conviction ?? 0;
  return (cB - cA) || (b.score - a.score);
});

const regime  = dump.regime       || {};
const leaders = dump.sectorLeaders || [];
const genAt   = dump.generatedAt  || new Date().toISOString();
const dateStr = genAt.slice(0, 10);

// ─── Colour palette (single source of truth) ───────────────────────────────
const C = {
  bg:           '#0d1117',
  surface:      '#161b22',
  border:       '#30363d',
  borderLight:  '#21262d',
  textPrimary:  '#e6edf3',
  textSecond:   '#8b949e',
  textMuted:    '#484f58',
  textBody:     '#cdd9e5',
  green:        '#00d084',
  greenDark:    '#00b894',
  yellow:       '#f9ca24',
  red:          '#e17055',
  redDark:      '#d63031',
  purple:       '#6c5ce7',
  mono:         '#b2bec3',
};

const stateColor = s => ({
  TRIGGERED: C.green,
  COILING:   C.yellow,
  REVERSAL:  C.purple,
  EXTENDED:  C.red,
  NONE:      '#636e72',
}[s] || C.mono);

const convColor = c =>
  c == null ? null :
  c >= 8    ? C.green  :
  c >= 6    ? C.yellow : C.red;

const regimeColor = r =>
  r === 'RISK_ON'  ? C.green  :
  r === 'NEUTRAL'  ? C.yellow : C.red;

// ─── Auto-generated portfolio note ────────────────────────────────────────
function buildPortfolioNote(candidates, regime, dateStr) {
  const triggered = candidates.filter(c => c.state === 'TRIGGERED');
  const coiling   = candidates.filter(c => c.state === 'COILING' && (c.conviction ?? 0) >= 7);

  const triggeredSummary = triggered.length
    ? triggered.map(c => `${c.sym} (conviction ${c.conviction ?? '—'}, entry $${c.entry.toFixed(2)}→T1 $${c.t1.toFixed(2)})`).join('; ')
    : 'None today — set alerts on COILING names below.';

  const coilingSummary = coiling.length
    ? coiling.map(c => `${c.sym} (pivot $${c.pivot.toFixed(2)})`).join(', ')
    : 'None at conviction ≥7.';

  // Sector concentration warning
  const sectorMap = {};
  candidates.forEach(c => {
    const etf = (leaders.find(l => l.etf) || {}).etf; // best-effort grouping
    // Simple heuristic grouping by known memberships
    const group =
      ['TROW','BEN','IVZ','KEY','BLK','MS','GS','JPM','BAC'].includes(c.sym) ? 'XLF/Financials' :
      ['INVH','EQR','IRM','EQIX','AMT','PLD','SPG','O'].includes(c.sym)      ? 'XLRE/REITs'     :
      ['AAPL','MSFT','NVDA','AMD','AVGO','CRM','NOW'].includes(c.sym)         ? 'XLK/Tech'       :
      ['PSX','CVX','XOM','COP','MPC','VLO'].includes(c.sym)                  ? 'XLE/Energy'     :
      ['WST','ABT','MDT','SYK','BMY'].includes(c.sym)                        ? 'XLV/Healthcare' :
      ['IEX','HON','GE','EMR','ITW'].includes(c.sym)                         ? 'XLI/Industrials': 'Other';
    sectorMap[group] = (sectorMap[group] || []);
    sectorMap[group].push(c.sym);
  });
  const concentrated = Object.entries(sectorMap)
    .filter(([, v]) => v.length >= 3)
    .map(([k, v]) => `${k}: ${v.join(', ')} (${v.length} names)`)
    .join(' | ');

  const watchChart = triggered[0]
    ? `${triggered[0].sym} — TRIGGERED; watch for second day ≥1.4× vol above $${triggered[0].entry.toFixed(2)} to confirm institutional follow-through. Measured move target $${triggered[0].t1.toFixed(2)}.`
    : coiling[0]
    ? `${coiling[0].sym} — highest-conviction COILING; alert at pivot $${coiling[0].pivot.toFixed(2)} on ≥1.4× vol.`
    : 'No high-conviction actionable today — monitor existing positions.';

  return `
    <p style="font-size:14px;color:${C.textBody};line-height:1.7;">
      <strong style="color:${C.textPrimary};">Regime:</strong>
      ${regime.regime} ×${regime.exposure} — ${regime.regime === 'RISK_ON' ? 'full allocation eligible.' : regime.regime === 'NEUTRAL' ? 'reduce size by 40%.' : 'only TRIGGERED names merit capital at ×0.25 size.'}<br>

      <strong style="color:${C.textPrimary};">TRIGGERED:</strong> ${triggeredSummary}<br>

      <strong style="color:${C.textPrimary};">COILING alerts (conv ≥7):</strong> ${coilingSummary} — set pivot alerts at levels shown, check the 3:30–4:00 pm ET close.<br>

      ${concentrated ? `<strong style="color:${C.yellow};">⚠ Sector concentration:</strong> ${concentrated} — cap group weight.<br>` : ''}

      <strong style="color:${C.textPrimary};">Chart to watch:</strong> ${watchChart}
    </p>`;
}

// ─── HTML helpers ──────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const badge = (label, bg, fg = '#111') =>
  `<span style="background:${bg};color:${fg};padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;white-space:nowrap;">${esc(label)}</span>`;

const pill = (val, bg, fg = '#111') =>
  `<span style="background:${bg};color:${fg};padding:4px 11px;border-radius:50%;font-weight:800;font-size:15px;">${esc(val)}</span>`;

// ─── Tape mini-summary (always from dump numbers) ─────────────────────────
function tapeSummary(tape, fund) {
  const items = [];
  if (tape.udvRatio50 != null) {
    const udv = tape.udvRatio50;
    items.push(`<span style="color:${udv > 1.3 ? C.green : udv < 0.8 ? C.red : C.mono};">UDV ${udv}</span>`);
  }
  if (tape.obvSlope20 != null)
    items.push(`<span style="color:${tape.obvSlope20 > 0 ? C.green : C.red};">OBV ${tape.obvSlope20 > 0 ? '↑' : '↓'}</span>`);
  if (tape.rsLineHigh != null)
    items.push(`<span style="color:${tape.rsLineHigh ? C.green : C.mono};">RS-line ${tape.rsLineHigh ? '🔝' : 'off-high'}</span>`);
  if (tape.rsi14 != null)
    items.push(`<span style="color:${tape.rsi14 > 70 ? C.red : tape.rsi14 < 40 ? C.yellow : C.mono};">RSI ${tape.rsi14}</span>`);
  if (fund.revGrowthPct != null)
    items.push(`<span style="color:${fund.revGrowthPct > 10 ? C.green : fund.revGrowthPct < 0 ? C.red : C.mono};">RevGr ${fund.revGrowthPct}%</span>`);
  if (fund.opMarginPct != null)
    items.push(`<span style="color:${fund.opMarginPct > 20 ? C.green : C.mono};">Marg ${fund.opMarginPct}%</span>`);
  return items.join(' &nbsp; ');
}

// ─── Candidate rows ────────────────────────────────────────────────────────
const dailyRows = candidates.map(c => {
  const convBg  = convColor(c.conviction);
  const convCell = c.conviction != null
    ? pill(c.conviction, convBg)
    : `<span style="color:${C.textSecond};">—</span>`;

  const holdCell = c.hold
    ? `<span style="font-weight:600;">${esc(c.hold)}</span>`
    : `<span style="color:${C.textSecond};">—</span>`;

  const thesisCell = c.thesis
    ? `<div style="font-weight:600;margin-bottom:5px;line-height:1.5;">${esc(c.thesis)}</div>
       <div style="color:${C.yellow};font-size:12px;">⚡ ${esc(c.fuel)}</div>`
    : `<span style="color:${C.textSecond};font-style:italic;">Pending LLM analysis</span>`;

  const invalidCell = c.invalidation
    ? `<span style="color:${C.red};font-size:12px;">${esc(c.invalidation)}</span>`
    : '—';

  return `
  <tr>
    <td style="font-weight:700;font-size:16px;white-space:nowrap;">
      ${esc(c.sym)}
      ${c.earningsRisk ? `<span style="color:${C.red};font-size:11px;margin-left:4px;display:block;">⚠️ EARN ${c.earningsInDays}d</span>` : ''}
    </td>
    <td>${badge(c.state, stateColor(c.state))}</td>
    <td style="text-align:center;">${convCell}</td>
    <td style="text-align:center;">${holdCell}</td>
    <td style="font-family:monospace;font-size:13px;white-space:nowrap;">
      $${c.entry.toFixed(2)} →
      <span style="color:${C.red};">$${c.stop.toFixed(2)}</span> →
      <span style="color:${C.green};">$${c.t1.toFixed(2)}</span>
      <br><small style="color:${C.mono};">R:R ${c.rr} &nbsp;|&nbsp; RS ${c.rs}%</small>
    </td>
    <td style="max-width:360px;">${thesisCell}</td>
    <td style="max-width:200px;">
      ${invalidCell}
      <div style="margin-top:6px;font-size:11px;color:${C.textSecond};">${tapeSummary(c.tape, c.fund)}</div>
    </td>
  </tr>`;
}).join('');

// ─── Log rows ──────────────────────────────────────────────────────────────
const sortedLog = [...logLines].sort((a, b) => new Date(b.date) - new Date(a.date));

const logRows = sortedLog.length
  ? sortedLog.map(l => `
  <tr>
    <td style="white-space:nowrap;color:${C.textSecond};">${esc(l.date?.slice(0,10) ?? '—')}</td>
    <td style="font-weight:700;">${esc(l.sym)}</td>
    <td>${badge('TRIGGERED', C.green)}</td>
    <td style="font-family:monospace;">$${l.entry?.toFixed(2) ?? '—'}</td>
    <td style="font-family:monospace;color:${C.red};">$${l.stop?.toFixed(2) ?? '—'}</td>
    <td style="font-family:monospace;color:${C.green};">$${l.t1?.toFixed(2) ?? '—'}</td>
    <td>${l.rr ?? '—'}</td>
    <td>${l.rs != null ? l.rs.toFixed(2) + '%' : '—'}</td>
    <td><span style="color:${regimeColor(l.regime)};font-weight:600;">${esc(l.regime ?? '—')}</span></td>
  </tr>`).join('')
  : `<tr><td colspan="9" style="text-align:center;padding:24px;color:${C.textMuted};">No historical signals yet — TRIGGERED names will appear here automatically after each run.</td></tr>`;

// ─── Regime signals list ───────────────────────────────────────────────────
const signalsList = (regime.signals || []).map(s =>
  `<li style="padding:3px 0;color:${s.startsWith('+') ? C.green : C.red};">${esc(s)}</li>`
).join('');

// ─── Sector badges ─────────────────────────────────────────────────────────
const sectorBadges = leaders.slice(0, 6).map(s =>
  `<span style="display:inline-block;margin:2px 3px;padding:3px 10px;border-radius:10px;font-size:12px;font-weight:600;background:${s.rs > 0 ? C.greenDark : C.redDark};color:#fff;">
    ${esc(s.etf)} ${s.rs > 0 ? '+' : ''}${s.rs}
  </span>`
).join('');

// ─── CSS ───────────────────────────────────────────────────────────────────
const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: ${C.bg};
    color: ${C.textPrimary};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.55;
    font-size: 14px;
  }
  .container { max-width: 1440px; margin: 0 auto; padding: 28px 24px; }

  /* Typography */
  h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.3px; }
  h2 { font-size: 18px; font-weight: 700; margin: 36px 0 14px;
       border-left: 4px solid ${C.yellow}; padding-left: 12px; }
  h3 { font-size: 13px; font-weight: 600; color: ${C.textSecond}; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
  .subtitle { color: ${C.textSecond}; font-size: 13px; margin: 6px 0 28px; }

  /* Regime strip */
  .regime-bar { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 30px; }
  .regime-card {
    background: ${C.surface}; border: 1px solid ${C.border};
    border-radius: 10px; padding: 16px 20px; flex: 1; min-width: 220px;
  }
  .regime-badge {
    display: inline-block; padding: 5px 18px; border-radius: 20px;
    font-weight: 800; font-size: 15px; margin-bottom: 8px;
  }

  /* Cards */
  .card {
    background: ${C.bg}; border: 1px solid ${C.border};
    border-radius: 12px; padding: 20px; margin-bottom: 26px; overflow-x: auto;
  }
  .card-dark { background: ${C.surface}; }

  /* Table */
  table { width: 100%; border-collapse: collapse; }
  th {
    background: ${C.surface}; color: ${C.textSecond};
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.07em; padding: 10px 12px; text-align: left;
    border-bottom: 2px solid ${C.border}; white-space: nowrap;
  }
  td { padding: 13px 12px; border-bottom: 1px solid ${C.borderLight}; vertical-align: top; }
  tbody tr:hover td { background: ${C.surface}; }
  tbody tr:last-child td { border-bottom: none; }

  /* Footer */
  .footer {
    text-align: center; color: ${C.textMuted}; font-size: 12px;
    margin-top: 48px; padding: 20px; border-top: 1px solid ${C.borderLight};
  }
  @media (max-width: 768px) {
    .regime-bar { flex-direction: column; }
    .container { padding: 16px; }
  }
`;

// ─── Portfolio note (auto-generated from data) ────────────────────────────
const portfolioNote = buildPortfolioNote(candidates, regime, dateStr);

// ─── Full HTML ─────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Screener v5 — ${dateStr}</title>
<style>${CSS}</style>
</head>
<body>
<div class="container">

  <h1>📊 Equity Screener — v5</h1>
  <div class="subtitle">
    Generated: ${esc(genAt)}
    &nbsp;|&nbsp; Universe: S&amp;P 500 + Curated
    &nbsp;|&nbsp; Workflow: <code>SCREENER_MASTER.md</code>
    &nbsp;|&nbsp; Renderer: <code>render_v5.js</code> (deterministic)
  </div>

  <!-- ── REGIME PANEL ── -->
  <div class="regime-bar">
    <div class="regime-card">
      <h3>Market Regime</h3>
      <span class="regime-badge" style="background:${regimeColor(regime.regime)};color:#111;">${esc(regime.regime ?? '—')}</span>
      <div style="color:${C.textSecond};font-size:13px;">Score ${regime.score}/100 &nbsp;|&nbsp; Size ×${regime.exposure}</div>
    </div>
    <div class="regime-card">
      <h3>Regime Signals</h3>
      <ul style="list-style:none;font-size:13px;">${signalsList}</ul>
    </div>
    <div class="regime-card">
      <h3>Sector Leadership (RS vs SPY)</h3>
      <div style="margin-top:4px;">${sectorBadges}</div>
    </div>
  </div>

  <!-- ── CANDIDATES TABLE ── -->
  <h2>Today's Screener Candidates</h2>
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>Ticker</th>
          <th>State</th>
          <th style="text-align:center;">Conv.</th>
          <th style="text-align:center;">Hold</th>
          <th>Entry → Stop → T1</th>
          <th>Thesis &amp; ⚡ Catalyst</th>
          <th>Invalidation &amp; Tape</th>
        </tr>
      </thead>
      <tbody>${dailyRows}</tbody>
    </table>
  </div>

  <!-- ── AUTO PORTFOLIO NOTE ── -->
  <h2>📋 Portfolio Note — ${dateStr}</h2>
  <div class="card card-dark">${portfolioNote}</div>

  <!-- ── HISTORICAL LEDGER ── -->
  <h2>📒 Historical Trigger Ledger</h2>
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Ticker</th>
          <th>State</th>
          <th>Entry</th>
          <th>Stop</th>
          <th>T1</th>
          <th>R:R</th>
          <th>RS%</th>
          <th>Regime</th>
        </tr>
      </thead>
      <tbody>${logRows}</tbody>
    </table>
  </div>

  <div class="footer">
    Screener v5 &nbsp;|&nbsp; researchshipper/equity · update branch &nbsp;|&nbsp; ${dateStr}<br>
    All price levels sourced from <code>screener_dump.json</code>. LLM reasoning applied over dump numbers only.
    Forward returns tracked in <code>screener_log.jsonl</code> via <code>scorecard.js</code>.
  </div>

</div>
</body>
</html>`;

// ─── Write outputs ─────────────────────────────────────────────────────────
const datedPath  = path.join(DIR, `screener_report_${dateStr}.html`);
const latestPath = path.join(DIR, `screener_report_v5.html`);

fs.writeFileSync(datedPath,  html, 'utf8');
fs.writeFileSync(latestPath, html, 'utf8');

console.log(`✅ render_v5: report written`);
console.log(`   dated  → ${datedPath}`);
console.log(`   latest → ${latestPath}`);
