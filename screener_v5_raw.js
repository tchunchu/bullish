#!/usr/bin/env node
'use strict';
/**
 * screener_v5.js — Regime-gated, RS-ranked, state-machine setup screener.
 *
 * PIPELINE (all deterministic; LLM reasons LAST over a dumped JSON):
 *   0. REGIME    SPY/QQQ/IWM/HYG/IEF/VIX/RSP → RISK_ON/NEUTRAL/RISK_OFF
 *                + sector ETF leadership ranking. Risk-off → only TRIGGERED
 *                A+ setups survive, exposure multiplier printed on every row.
 *   1. LIQUIDITY $20M+ median daily dollar volume, price > $5. Non-negotiable.
 *   2. RS GATE   weighted 1/3/6-month excess return vs SPY; keep top 40% only.
 *                (Leaders break out; laggards break down. Cheapest alpha filter.)
 *   3. SETUPS    lib/setups.js state machine:
 *                TRIGGERED (act today) > COILING (alert level) > REVERSAL > EXTENDED (wait).
 *   4. EARNINGS  flag if earnings within 7 calendar days (binary-event risk).
 *   5. DUMP      screener_dump.json — full per-ticker evidence for the LLM pass.
 *                LLM never invents numbers; it ranks/argues over THIS file only.
 *
 * Usage: node screener_v5.js [--universe=sp500] [--top=15]
 */
const yahooFinance = require('yahoo-finance2').default;
const yf = new yahooFinance({ suppressNotices: ['yahooSurvey'] });
const fs = require('fs');
const { getSMA, getRSI, getATR } = require('../lib/indicators.js');
const { relStrength, rsLineNearHigh, upDownVolRatio, obvSlope, closingRange } = require('../lib/indicators_v2.js');
const { classifySetup } = require('../lib/setups.js');
const { classifyRegime, sectorLeadership } = require('../lib/regime.js');
const { evaluateSignals, parseJsonl } = require('../lib/scorecard.js');

const REGIME_SYMS = ['SPY', 'QQQ', 'IWM', 'HYG', 'IEF', '^VIX', 'RSP'];
const SECTOR_ETFS = ['XLK', 'XLE', 'XLF', 'XLI', 'XLV', 'XLY', 'XLP', 'XLU', 'XLB', 'XLC', 'XLRE'];

// keep the curated universe from screener.js (import or paste); placeholder require:
const { resolveUniverse } = require('./universe.js'); // single source of truth (curated + optional S&P 500)

async function chartCloses(sym, days = 420) {
  const d1 = Math.floor(Date.now() / 1000) - days * 24 * 3600;
  const ch = await yf.chart(sym, { period1: d1, interval: '1d' }).catch(() => null);
  const quotes = (ch?.quotes || []).filter(q => q.close != null);
  return { quotes, closes: quotes.map(q => q.close) };
}

async function fetchRegime() {
  const series = {}, sectors = {};
  for (const s of REGIME_SYMS) series[s.replace('^', '')] = (await chartCloses(s)).closes;
  for (const s of SECTOR_ETFS) sectors[s] = (await chartCloses(s, 200)).closes;
  const regime = classifyRegime(series);
  const leaders = sectorLeadership(sectors, series.SPY);
  return { regime, leaders, spyCloses: series.SPY };
}

async function screenOne(sym, spyCloses, regime) {
  const { quotes, closes } = await chartCloses(sym);
  if (quotes.length < 120) return null;
  const last = quotes[quotes.length - 1];

  // 1. liquidity gate
  const dollarVols = quotes.slice(-20).map(q => (q.close || 0) * (q.volume || 0)).sort((a, b) => a - b);
  const medDollarVol = dollarVols[Math.floor(dollarVols.length / 2)];
  if (last.close < 5 || medDollarVol < 20e6) return null;

  // 2. relative strength
  const rs = relStrength(closes, spyCloses);
  if (rs == null) return null;

  // 3. setup state machine
  const setup = classifySetup(quotes);
  if (setup.state === 'NO_DATA' || setup.state === 'NONE') {
    if (setup.score < 20) return null; // keep high-compression NONEs as deep watch
  }
  // regime gate: in RISK_OFF only TRIGGERED survives
  if (regime.regime === 'RISK_OFF' && setup.state !== 'TRIGGERED') return null;

  // tape extras for the LLM dump
  const tape = {
    udvRatio50: upDownVolRatio(quotes),
    obvSlope20: obvSlope(quotes),
    closeRange: closingRange(last),
    rsLineHigh: rsLineNearHigh(closes, spyCloses),
    rsi14: +(getRSI(quotes, 14) || 0).toFixed(1),
    atrPct: +((getATR(quotes, 14) / last.close) * 100).toFixed(2),
    vsMa50: +(((last.close / getSMA(closes, 50)) - 1) * 100).toFixed(1),
    vsMa200: closes.length >= 200 ? +(((last.close / getSMA(closes, 200)) - 1) * 100).toFixed(1) : null,
  };

  // 4. earnings proximity (binary-event risk for swing holds)
  let earningsInDays = null;
  try {
    const qs = await yf.quoteSummary(sym, { modules: ['calendarEvents', 'financialData'] });
    const ed = qs?.calendarEvents?.earnings?.earningsDate?.[0];
    if (ed) earningsInDays = Math.round((new Date(ed) - Date.now()) / 86400000);
    var revGr = qs?.financialData?.revenueGrowth ?? null;
    var margins = qs?.financialData?.operatingMargins ?? null;
  } catch { var revGr = null, margins = null; }

  return {
    sym, price: +last.close.toFixed(2), rs, setup, tape,
    earningsInDays, earningsRisk: earningsInDays != null && earningsInDays >= 0 && earningsInDays <= 7,
    fund: { revGrowthPct: revGr != null ? +(revGr * 100).toFixed(1) : null, opMarginPct: margins != null ? +(margins * 100).toFixed(1) : null },
    medDollarVolM: +(medDollarVol / 1e6).toFixed(0),
  };
}

(async () => {
  const args = process.argv.slice(2);
  const top = +(args.find(a => a.startsWith('--top='))?.split('=')[1] || 15);

  console.log('🌍 [0/3] Regime + sector leadership…');
  const { regime, leaders, spyCloses } = await fetchRegime();
  console.log(`   Regime: ${regime.regime} (${regime.score}/100) | exposure x${regime.exposure}`);
  regime.signals.forEach(s => console.log(`     ${s}`));
  console.log(`   Leading sectors: ${leaders.slice(0, 4).map(l => `${l.etf}(${l.rs > 0 ? '+' : ''}${l.rs})`).join('  ')}`);

  const universe = await resolveUniverse(args); // --universe=sp500 merges S&P 500

  console.log(`\n🔬 [1/3] Screening ${universe.length} tickers (liquidity → RS → setup state machine)…`);
  const results = [];
  const conc = 8;
  for (let i = 0; i < universe.length; i += conc) {
    const chunk = await Promise.all(universe.slice(i, i + conc).map(s => screenOne(s, spyCloses, regime)));
    results.push(...chunk.filter(Boolean));
    process.stdout.write(`\r   batch ${Math.floor(i / conc) + 1}/${Math.ceil(universe.length / conc)}`);
    await new Promise(r => setTimeout(r, 250));
  }

  // 2. RS gate: keep top 40% by RS within survivors
  results.sort((a, b) => b.rs - a.rs);
  const rsCut = results[Math.floor(results.length * 0.4)]?.rs ?? -Infinity;
  const leadersOnly = results.filter(r => r.rs >= rsCut);

  // final rank: state priority, then setup score, then RS
  const statePri = { TRIGGERED: 3, COILING: 2, REVERSAL: 1, NONE: 0, EXTENDED: 0 };
  leadersOnly.sort((a, b) =>
    (statePri[b.setup.state] - statePri[a.setup.state]) ||
    (b.setup.score - a.setup.score) || (b.rs - a.rs));

  const final = leadersOnly.slice(0, top);

  console.log(`\n\n📊 [2/3] ${final.length} candidates (regime ${regime.regime}, size x${regime.exposure}):\n`);
  console.log('SYM     STATE       SCORE  RS%    PRICE     ENTRY→STOP→T1       R:R   EARN  DETAIL');
  for (const r of final) {
    const s = r.setup;
    console.log(`${r.sym.padEnd(7)} ${s.state.padEnd(11)} ${String(s.score).padEnd(6)} ${String(r.rs).padEnd(6)} $${String(r.price).padEnd(8)} ${s.entry}→${s.stop}→${s.t1}  ${String(s.rr).padEnd(5)} ${r.earningsRisk ? '⚠️' + r.earningsInDays + 'd' : '—'}    ${s.detail}`);
  }

  // 3. LLM evidence dump — the model reasons over THIS, never from memory
  const dump = {
    generatedAt: new Date().toISOString(),
    regime, sectorLeaders: leaders,
    instructions: 'Rank these candidates for 5-60 day swing holds. Use ONLY numbers in this file. For each: (1) does the tape evidence (udvRatio, obvSlope, rsLineHigh, closeRange) confirm or contradict the setup state? (2) does fund growth/margin justify holding through volatility? (3) is the sector a leader? (4) earnings risk handling. Output strict JSON: [{sym, conviction:1-10, hold:"days|weeks|months", thesis:<=40 words, invalidation:<=20 words}]. Flag any candidate where evidence conflicts.',
    candidates: final,
  };
  fs.writeFileSync('screener_dump.json', JSON.stringify(dump, null, 2));
  fs.writeFileSync('top_tickers.txt', final.map(r => r.sym).join(','));

  // ── Forward-return ledger: auto-APPEND every TRIGGERED signal (never overwrite). ──
  // One JSON line per signal. Scorecard later computes +7/+30/+90d returns per row.
  const dateStr = new Date().toISOString().slice(0, 10);
  const lines = final.filter(r => r.setup.state === 'TRIGGERED').map(r => JSON.stringify({
    date: dateStr, sym: r.sym, entry: r.setup.entry, stop: r.setup.stop, t1: r.setup.t1,
    pivot: r.setup.pivot, rr: r.setup.rr, score: r.setup.score, rs: r.rs,
    regime: regime.regime, exposure: regime.exposure,
  }));
  const priorLog = fs.existsSync('screener_log.jsonl') ? parseJsonl(fs.readFileSync('screener_log.jsonl', 'utf8')) : [];
  const already = new Set(priorLog.map(x => `${x.sym}|${x.date}`));
  const fresh = lines.filter(l => { const o = JSON.parse(l); return !already.has(`${o.sym}|${o.date}`); });
  if (fresh.length) {
    fs.appendFileSync('screener_log.jsonl', fresh.join('\n') + '\n');
    console.log(`📒 Appended ${fresh.length} TRIGGERED signal(s) to screener_log.jsonl (commit this file).`);
  } else if (lines.length) {
    console.log('📒 TRIGGERED signal(s) already logged today — no duplicate append.');
  }

  // ── Scorecard: evaluate the FULL ledger (history) so the report shows tracking. ──
  try {
    const ledger = fs.existsSync('screener_log.jsonl') ? parseJsonl(fs.readFileSync('screener_log.jsonl', 'utf8')) : [];
    if (ledger.length) {
      const syms = [...new Set(ledger.map(x => x.sym))];
      const quotesBySym = {};
      for (const sym of syms) quotesBySym[sym] = (await chartCloses(sym, 200)).quotes;
      const card = evaluateSignals(ledger, quotesBySym);
      card.asOf = new Date().toISOString();
      fs.writeFileSync('scorecard.json', JSON.stringify(card, null, 2));
      const st = card.stats;
      console.log(`📈 Scorecard: ${st.total} signals | ${st.open} open | win rate ${st.winRatePct ?? '—'}% | avg R ${st.avgR ?? '—'} | cum R ${st.cumR ?? '—'} → scorecard.json`);
    }
  } catch (e) { console.log('⚠️  scorecard generation failed (non-fatal):', e.message); }
  console.log(`\n✅ [3/3] screener_dump.json written — feed to LLM for the reasoning pass (Pass 2).`);
})();
