#!/usr/bin/env node
/**
 * screener.js — VCS-FCE Super Signal v5.3 Screener (Node.js Edition)
 * Combined Rating: MACRO × TECH × ANALYST
 *
 * Usage:
 *   node screener.js                          # Default curated universe
 *   node screener.js --universe=sp500         # S&P 500
 *   node screener.js --universe=ndx100        # NASDAQ 100
 *   node screener.js --universe=russell1000   # Russell 1000
 *   node screener.js --universe=russell2000   # Russell 2000
 *   node screener.js --demo                   # Demo mode (generated data)
 *   node screener.js --demo --universe=ndx100 # Demo mode with NDX100 tickers
 *
 * Output:
 *   screener_report.html  — Full dashboard
 *   top_tickers.txt       — Top N tickers for AI Neural Hunt
 *   screener_results.json — JSON export
 */
'use strict';

import yahooFinance from 'yahoo-finance2';
import fs from 'fs';

import cfg from './config.js';
import { analyzeTechnical } from './lib/technical.js';
import { computeMacroRegime } from './lib/macro.js';
import { computeRating } from './lib/rating.js';
import { computeRisk } from './lib/risk.js';
import { getUniverse, NDX100 } from './lib/universe.js';
import { generateReport, generateTopTickers, generateConsoleSummary } from './lib/report.js';

// ── Parse CLI args ────────────────────────────────────────────────
const args = process.argv.slice(2);
const universeArg = args.find(a => a.startsWith('--universe='));
const universeName = universeArg ? universeArg.split('=')[1] : 'default';
const isDemo = args.includes('--demo');
// --interval=1d (default) or --interval=1wk to match a WEEKLY TradingView chart.
// The technical engine is timeframe-relative: superV5.3 on a weekly chart will
// only match a screener run with --interval=1wk, never a daily run.
const intervalArg = args.find(a => a.startsWith('--interval='));
const interval = intervalArg ? intervalArg.split('=')[1] : '1d';
if (!['1d', '1wk'].includes(interval)) { console.error(`Unsupported --interval=${interval} (use 1d or 1wk)`); process.exit(1); }

/**
 * Generate realistic OHLCV data with specific technical patterns.
 * pattern: 'breakout' | 'coiling' | 'uptrend' | 'breather' | 'neutral' | 'distribution' | 'downtrend'
 */
function generateDemoQuotes(basePrice, pattern, days) {
  const quotes = [];
  let price = basePrice;
  const atr = basePrice * 0.018;

  for (let i = 0; i < days; i++) {
    const date = new Date(Date.now() - (days - i) * 86400000);
    const phase = i / days;

    let open, high, low, close, volume;
    const baseVol = 800000 + Math.random() * 3000000;

    switch (pattern) {
      case 'breakout': {
        if (phase < 0.7) {
          const noise = (Math.random() - 0.5) * atr * 0.8;
          close = price + noise;
          price = price * (1 + 0.0003) + noise * 0.3;
          volume = baseVol * (0.7 + Math.random() * 0.3);
        } else if (phase < 0.85) {
          const noise = (Math.random() - 0.5) * atr * 0.3;
          close = price + noise;
          price = price * (1 + 0.0001) + noise * 0.1;
          volume = baseVol * (0.4 + Math.random() * 0.3);
        } else {
          const burst = atr * (1.5 + Math.random() * 2.0);
          close = price + burst;
          price = close;
          volume = baseVol * (2.0 + Math.random() * 2.0);
        }
        open = price - (close - price) * 0.2;
        high = Math.max(open, close) + Math.random() * atr * 0.5;
        low = Math.min(open, close) - Math.random() * atr * 0.5;
        break;
      }
      case 'coiling': {
        const range = atr * (1.0 - phase * 0.7);
        const noise = (Math.random() - 0.5) * range;
        close = price + noise + atr * 0.05;
        price = close;
        open = price - noise * 0.3;
        high = Math.max(open, close) + Math.random() * range * 0.3;
        low = Math.min(open, close) - Math.random() * range * 0.3;
        volume = baseVol * (0.6 + phase * 0.3 + Math.random() * 0.3);
        break;
      }
      case 'uptrend': {
        const trendMove = atr * 0.15;
        const noise = (Math.random() - 0.4) * atr;
        close = price + trendMove + noise;
        price = close;
        open = price - trendMove - noise * 0.3;
        high = Math.max(open, close) + Math.random() * atr * 0.4;
        low = Math.min(open, close) - Math.random() * atr * 0.4;
        volume = baseVol * (0.8 + Math.random() * 0.5);
        break;
      }
      case 'breather': {
        let dailyBias;
        if (phase < 0.6) dailyBias = atr * 0.12;
        else if (phase < 0.75) dailyBias = -atr * 0.05;
        else dailyBias = atr * 0.1;
        const noise = (Math.random() - 0.5) * atr * 0.8;
        close = price + dailyBias + noise;
        price = close;
        open = price - dailyBias - noise * 0.3;
        high = Math.max(open, close) + Math.random() * atr * 0.4;
        low = Math.min(open, close) - Math.random() * atr * 0.4;
        volume = phase > 0.6 && phase < 0.75 ? baseVol * 0.6 : baseVol * (0.8 + Math.random() * 0.5);
        break;
      }
      case 'neutral': {
        const noise = (Math.random() - 0.5) * atr;
        close = price + noise;
        price = price * (1 + 0.0001) + noise * 0.2;
        open = price - noise * 0.3;
        high = Math.max(open, close) + Math.random() * atr * 0.5;
        low = Math.min(open, close) - Math.random() * atr * 0.5;
        volume = baseVol * (0.7 + Math.random() * 0.4);
        break;
      }
      case 'distribution': {
        let dailyBias;
        if (phase < 0.4) dailyBias = atr * 0.1;
        else dailyBias = -atr * 0.08;
        const noise = (Math.random() - 0.5 + (phase > 0.4 ? -0.2 : 0)) * atr;
        close = price + dailyBias + noise;
        price = close;
        open = price - dailyBias - noise * 0.3;
        high = Math.max(open, close) + Math.random() * atr * 0.5;
        low = Math.min(open, close) - Math.random() * atr * 0.5;
        volume = phase > 0.4 ? baseVol * (1.2 + Math.random() * 0.5) : baseVol * (0.7 + Math.random() * 0.3);
        break;
      }
      case 'downtrend': {
        const trendMove = -atr * 0.12;
        const noise = (Math.random() - 0.45) * atr;
        close = price + trendMove + noise;
        price = close;
        open = price - trendMove - noise * 0.3;
        high = Math.max(open, close) + Math.random() * atr * 0.4;
        low = Math.min(open, close) - Math.random() * atr * 0.4;
        volume = baseVol * (0.8 + Math.random() * 0.5);
        break;
      }
      default: {
        const noise = (Math.random() - 0.5) * atr;
        close = price + noise;
        price = price + noise * 0.2;
        open = price - noise * 0.3;
        high = Math.max(open, close) + Math.random() * atr * 0.5;
        low = Math.min(open, close) - Math.random() * atr * 0.5;
        volume = baseVol;
      }
    }

    price = Math.max(basePrice * 0.3, price);
    close = Math.max(low, Math.min(high, close));
    quotes.push({ date, open, high, low, close, volume: Math.floor(volume) });
  }
  return quotes;
}

// ── NDX 100 Demo Profiles ─────────────────────────────────────────
// [symbol, basePrice, pattern, analystUpside%]
const NDX100_PROFILES = {
  // ── Breakout candidates (strong setups with volume) ──
  'NVDA':  [135, 'breakout', 28],
  'PLTR':  [120, 'breakout', 35],
  'AVGO':  [210, 'breakout', 22],
  'APP':   [320, 'breakout', 25],
  'CEG':   [170, 'breakout', 30],
  // ── Coiling / squeeze (energy building) ──
  'ARM':   [160, 'coiling', 25],
  'CRWD':  [380, 'coiling', 18],
  'DDOG':  [150, 'coiling', 20],
  'PANW':  [195, 'coiling', 21],
  'MDB':   [255, 'coiling', 22],
  'NET':   [105, 'coiling', 24],
  'ZS':    [205, 'coiling', 19],
  'SNPS':  [500, 'coiling', 15],
  'CDNS':  [210, 'coiling', 14],
  // ── Uptrend (steady climb) ──
  'META':  [640, 'uptrend', 18],
  'MSFT':  [450, 'uptrend', 16],
  'AMZN':  [205, 'uptrend', 20],
  'GOOG':  [180, 'uptrend', 14],
  'GOOGL': [178, 'uptrend', 14],
  'UBER':  [78,  'uptrend', 18],
  'MELI':  [2350,'uptrend', 16],
  'CTSH':  [82,  'uptrend', 12],
  'PCAR':  [115, 'uptrend', 10],
  'CTAS':  [580, 'uptrend', 11],
  'ROP':   [560, 'uptrend', 13],
  'FAST':  [78,  'uptrend', 11],
  'ORLY':  [1320,'uptrend', 9],
  // ── Breather (uptrend + pullback = dip buying) ──
  'AAPL':  [198, 'breather', 12],
  'QCOM':  [160, 'breather', 15],
  'TXN':   [185, 'breather', 14],
  'BKNG':  [5200,'breather', 17],
  'INTU':  [740, 'breather', 16],
  'WDAY':  [290, 'breather', 18],
  'CMCSA': [40,  'breather', 13],
  'REGN':  [730, 'breather', 15],
  'ROST':  [148, 'breather', 11],
  // ── Neutral (no strong signal) ──
  'NFLX':  [1280,'neutral', 10],
  'ADBE':  [440, 'neutral', 12],
  'AMD':   [125, 'neutral', 19],
  'PYPL':  [78,  'neutral', 16],
  'SBUX':  [95,  'neutral', 11],
  'PEP':   [172, 'neutral', 8],
  'KLAC':  [820, 'neutral', 13],
  'MRVL':  [78,  'neutral', 22],
  'LRCX':  [950, 'neutral', 11],
  'CPRT':  [58,  'neutral', 10],
  'KDP':   [34,  'neutral', 7],
  'KHC':   [32,  'neutral', 5],
  'MNST':  [48,  'neutral', 9],
  'DLTR':  [82,  'neutral', 10],
  'VRSK':  [290, 'neutral', 8],
  'ANSS':  [350, 'neutral', 9],
  'IDXX':  [420, 'neutral', 10],
  'ILMN':  [120, 'neutral', 8],
  'BIIB':  [220, 'neutral', 7],
  'GILD':  [115, 'neutral', 6],
  'PAYX':  [145, 'neutral', 8],
  'CHTR':  [380, 'neutral', 9],
  'DXCM':  [85,  'neutral', 14],
  'TEAM':  [210, 'neutral', 17],
  'ABNB':  [155, 'neutral', 18],
  'HON':   [215, 'neutral', 8],
  'LIN':   [470, 'neutral', 7],
  'ADI':   [245, 'neutral', 10],
  'FANG':  [145, 'neutral', 12],
  'EXC':   [44,  'neutral', 7],
  'GEHC':  [85,  'neutral', 13],
  'ODFL':  [175, 'neutral', 8],
  'FTNT':  [105, 'neutral', 16],
  'XEL':   [68,  'neutral', 6],
  'EA':    [155, 'neutral', 9],
  'TTWO':  [260, 'neutral', 13],
  'MDLZ':  [42,  'neutral', 6],
  'ON':    [58,  'neutral', 15],
  'ADP':   [310, 'neutral', 7],
  'ADSK':  [310, 'neutral', 13],
  'SNOW':  [175, 'neutral', 15],
  'NXPI':  [235, 'neutral', 12],
  // ── Distribution (topping / selling into strength) ──
  'TSLA':  [345, 'distribution', 8],
  'COIN':  [260, 'distribution', 6],
  'SMCI':  [42,  'distribution', -8],
  'AXON':  [680, 'distribution', 5],
  // ── Downtrend (bearish) ──
  'INTC':  [23,  'downtrend', -12],
  'AEP':   [105, 'downtrend', 3],
  'WBD':   [12,  'downtrend', -15],
  'MRK':   [100, 'downtrend', -5],
  // ── Newer / speculative ──
  'DASH':  [190, 'breather', 16],
  'MCHP':  [85,  'coiling', 14],
  'LULU':  [340, 'neutral', 9],
  'MAR':   [260, 'breather', 11],
  'TTD':   [65,  'distribution', 10],
  'SHOP':  [82,  'breather', 15],
  'PDD':   [135, 'uptrend', 25],
  'MNST':  [48,  'neutral', 9],
  'TMO':   [530, 'neutral', 8],
  'AZN':   [72,  'neutral', 18],
  'BKR':   [42,  'uptrend', 22],
  'CCJ':   [58,  'breakout', 28],
  'UUUU':  [9,   'breakout', 40],
  'LEU':   [220, 'uptrend', 32],
  'BWXT':  [125, 'uptrend', 15],
};

// ── Fetch real data from Yahoo Finance ────────────────────────────
async function fetchTickerData(sym) {
  try {
    // Weekly bars need ~5.2x the calendar window for the same bar count
    const days = interval === '1wk' ? Math.ceil(cfg.chartDays * 5.2) : cfg.chartDays;
    const d1 = Math.floor(Date.now() / 1000) - days * 24 * 3600;
    const [ch, qs] = await Promise.all([
      yahooFinance.chart(sym, { period1: d1, interval }).catch(() => null),
      yahooFinance.quoteSummary(sym, { modules: ['financialData', 'recommendationTrend', 'defaultKeyStatistics'] }).catch(() => null)
    ]);

    if (!ch || !ch.quotes || ch.quotes.length < cfg.minBars) return null;

    const quotes = ch.quotes
      .filter(q => q.close != null && q.volume != null)
      .map(q => ({ date: q.date, open: q.open || q.close, high: q.high || q.close, low: q.low || q.close, close: q.close, volume: q.volume || 0 }));

    if (quotes.length < cfg.minBars) return null;

    const price = quotes[quotes.length - 1].close;

    let analystData = null;
    if (qs && qs.financialData) {
      const fd = qs.financialData;
      const currentPrice = fd.currentPrice || price;
      const tgtMean = fd.targetMeanPrice;
      let sb = 0, b = 0, h = 0, s = 0, ss = 0;
      if (qs.recommendationTrend && qs.recommendationTrend.trend && qs.recommendationTrend.trend.length > 0) {
        const rec = qs.recommendationTrend.trend[0];
        sb = rec.strongBuy || 0; b = rec.buy || 0; h = rec.hold || 0; s = rec.sell || 0; ss = rec.strongSell || 0;
      }
      const analystN = sb + b + h + s + ss;
      const tgtIsMean = tgtMean != null && tgtMean > 0;
      let analystTgt = null, analystOk = false;
      if (tgtMean && currentPrice && tgtMean > currentPrice * 0.30 && tgtMean < currentPrice * 3.0) {
        analystTgt = tgtMean; analystOk = true;
      }
      const analystUp = analystOk && currentPrice ? ((analystTgt / currentPrice) - 1) * 100 : null;
      let upGrade = 'NO DATA';
      if (analystUp !== null) {
        if (analystUp >= cfg.up_strong) upGrade = 'STRONG';
        else if (analystUp >= cfg.up_ok) upGrade = 'OK';
        else if (analystUp >= -5.0) upGrade = 'THIN';
        else upGrade = 'NEGATIVE';
      }
      analystData = { tgtMean, tgtHigh: fd.targetHighPrice, tgtLow: fd.targetLowPrice, analystN, sb, b, h, s, ss, analystTgt, analystOk, analystUp: analystUp !== null ? Math.round(analystUp * 100) / 100 : null, upGrade, tgtIsMean, currentPrice };
    }

    const fd = qs ? (qs.financialData || {}) : {};
    return { quotes, price, vol: quotes[quotes.length - 1].volume, analystData, revGrowth: fd.revenueGrowth || 0, margins: fd.operatingMargins || 0 };
  } catch (e) { return null; }
}

// ── Screen a single ticker ────────────────────────────────────────
function screenTicker(sym, tickerData, macroResult) {
  const { quotes, price, vol, analystData, revGrowth, margins } = tickerData;
  const tech = analyzeTechnical(quotes);
  if (!tech) return null;

  const risk = computeRisk(price, tech, analystData);

  if (macroResult) {
    const macroRiskMult = macroResult.macroRiskMult;
    const riskPctEff = cfg.risk_pct_inp * macroRiskMult;
    const riskDollarsTarget = cfg.portfolio_size * (riskPctEff / 100);
    const riskPts = price - risk.stopLevel;
    let sharesRaw = riskPts > 0 ? riskDollarsTarget / riskPts : 0;
    let posDollars = price > 0 ? sharesRaw * price : 0;
    const maxAlloc = cfg.portfolio_size * (cfg.max_alloc_pct / 100);
    if (posDollars > maxAlloc) { posDollars = maxAlloc; sharesRaw = price > 0 ? posDollars / price : 0; }
    risk.sharesFinal = Math.max(0, Math.floor(sharesRaw));
    risk.finalPositionDollars = Math.round(price > 0 ? risk.sharesFinal * price : 0);
    risk.finalRiskDollars = Math.round(riskPts > 0 ? risk.sharesFinal * riskPts : 0);
    risk.portfolioPct = Math.round((risk.finalPositionDollars / cfg.portfolio_size) * 100 * 100) / 100;
    risk.portfolioRiskPct = Math.round((risk.finalRiskDollars / cfg.portfolio_size) * 100 * 100) / 100;
  }

  const rating = computeRating(macroResult, tech, analystData, risk);

  return { sym, price, vol, tech, analyst: analystData, risk, rating, revGrowth: (revGrowth * 100).toFixed(1) + '%', margins, macroRiskMult: macroResult ? macroResult.macroRiskMult : 1.0 };
}

// ── Demo mode ─────────────────────────────────────────────────────
async function runDemo() {
  // Select profiles based on universe
  let profiles;
  if (universeName === 'ndx100') {
    // Full NDX 100 with assigned patterns
    profiles = NDX100_PROFILES;
    console.log('\n🧪 DEMO MODE — NASDAQ 100 with realistic pattern assignments\n');
  } else {
    // Use NDX 100 profiles as default
    profiles = NDX100_PROFILES;
    console.log('\n🧪 DEMO MODE — Using generated market data for demonstration\n');
  }

  // Demo macro regime
  const macroResult = {
    score: 62, regime: 1, label: 'INVEST',
    equityAlloc: 80, macroRiskMult: 1.0,
    why: 'INVEST: lifted by Curve +0.8, Labor +1.2, Fed +0.5  |  watch: Housing -0.3',
    pillars: {
      curve: { score: 0.8, state: 'normal +0.42pp', val: 0.42 },
      labor: { score: 1.2, state: 'stable, gap 0.12pp', sahmGap: 0.12, unTr6: -0.05 },
      fed: { score: 0.5, state: 'on hold (-0.15pp/6m)', ffChg6m: -0.15, ffChg3m: -0.05 },
      housing: { score: -0.3, state: 'softening -1.5% YoY', houstYoy: -1.5 }
    },
    drags: 'Housing -0.3', supports: 'Curve +0.8, Labor +1.2, Fed +0.5'
  };
  console.log(`[MACRO] Regime: ${macroResult.label} (${macroResult.score}/100) | Eq ${macroResult.equityAlloc}%/Cash 20%`);
  console.log(`[MACRO] Why: ${macroResult.why}`);

  const profileEntries = Object.entries(profiles);
  const results = [];

  for (const [sym, [basePrice, pattern, analystUpside]] of profileEntries) {
    process.stdout.write(`\r[SCREEN] Processing ${sym.padEnd(6)} (${results.length + 1}/${profileEntries.length})`);

    const quotes = generateDemoQuotes(basePrice, pattern, 300);
    const price = quotes[quotes.length - 1].close;
    const vol = quotes[quotes.length - 1].volume;

    const analystUp = analystUpside;
    let upGrade = 'NO DATA';
    if (analystUp >= cfg.up_strong) upGrade = 'STRONG';
    else if (analystUp >= cfg.up_ok) upGrade = 'OK';
    else if (analystUp >= -5.0) upGrade = 'THIN';
    else upGrade = 'NEGATIVE';

    const analystTgt = price * (1 + analystUp / 100);
    const analystData = {
      tgtMean: analystTgt, tgtHigh: analystTgt * 1.1, tgtLow: analystTgt * 0.9,
      analystN: Math.floor(10 + Math.random() * 30),
      sb: Math.floor(Math.random() * 10), b: Math.floor(Math.random() * 10),
      h: Math.floor(Math.random() * 8), s: Math.floor(Math.random() * 3), ss: Math.floor(Math.random() * 2),
      analystTgt, analystOk: analystUpside > -5,
      analystUp: Math.round(analystUp * 100) / 100, upGrade, tgtIsMean: true,
      currentPrice: price
    };

    const isBullish = ['breakout', 'coiling', 'uptrend', 'breather'].includes(pattern);
    const tickerData = {
      quotes, price, vol, analystData,
      revGrowth: isBullish ? 0.1 + Math.random() * 0.3 : -0.05 + Math.random() * 0.1,
      margins: isBullish ? 0.15 + Math.random() * 0.2 : Math.random() * 0.05
    };
    const result = screenTicker(sym, tickerData, macroResult);
    if (result) results.push(result);
  }

  console.log(`\r[SCREEN] Complete — ${results.length} tickers scored                    `);
  return { results, macroResult };
}

// ── Live mode ─────────────────────────────────────────────────────
async function runLive() {
  const universe = await getUniverse(universeName);
  console.log(`[UNIVERSE] ${universe.length} tickers loaded (${universeName})\n`);

  let macroResult = null;
  if (cfg.enable_macro) {
    try { macroResult = await computeMacroRegime(); }
    catch (e) {
      console.log(`[MACRO] Error: ${e.message}. Defaulting to NEUTRAL.`);
      macroResult = { score: 50, regime: 0, label: 'NEUTRAL', equityAlloc: 55, macroRiskMult: 0.6, why: 'Macro data unavailable', pillars: { curve: { score: 0, state: 'no data' }, labor: { score: 0, state: 'no data' }, fed: { score: 0, state: 'no data' }, housing: { score: 0, state: 'no data' } }, drags: '', supports: '' };
    }
  }

  console.log(`\n[SCREEN] Fetching data for ${universe.length} tickers (concurrency: ${cfg.concurrency})...\n`);

  const results = [];
  let skipped = 0;
  const batchSize = cfg.concurrency;

  for (let i = 0; i < universe.length; i += batchSize) {
    const chunk = universe.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(universe.length / batchSize);
    process.stdout.write(`\r[SCREEN] Batch ${batchNum}/${totalBatches} — ${results.length} scored, ${skipped} skipped`);

    const promises = chunk.map(async (sym) => {
      const data = await fetchTickerData(sym);
      if (!data) return null;
      return screenTicker(sym, data, macroResult);
    });

    const chunkResults = await Promise.all(promises);
    for (const r of chunkResults) { if (r) results.push(r); else skipped++; }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\r[SCREEN] Complete — ${results.length} scored, ${skipped} skipped                    `);
  return { results, macroResult };
}

// ── Main ──────────────────────────────────────────────────────────
(async () => {
  console.log('\n================================================================');
  console.log('⚡ VCS-FCE Super Signal v5.3 Screener');
  console.log('   MACRO × TECH × ANALYST Combined Rating');
  console.log('================================================================\n');

  const { results, macroResult } = isDemo ? await runDemo() : await runLive();

  if (isDemo) {
    // HARD WATERMARK: demo data is FABRICATED (synthetic prices, hardcoded
    // macro, hardcoded analyst upside). Tag every row so it can never be
    // mistaken for a real screen.
    console.log('\n⛔⛔⛔  DEMO MODE — ALL DATA BELOW IS FABRICATED. DO NOT TRADE ON IT.  ⛔⛔⛔\n');
    for (const r of results) {
      r.demo = true;
      r.sym = r.sym + ' [FAKE]';
      if (r.rating && r.rating.comboWhy) r.rating.comboWhy = '[DEMO — FABRICATED DATA] ' + r.rating.comboWhy;
    }
    if (macroResult) macroResult.why = '[DEMO — FABRICATED DATA] ' + macroResult.why;
  } else {
    console.log(`[RUN] LIVE data | interval=${interval} | ${new Date().toISOString().slice(0, 10)} — compare against a ${interval === '1wk' ? 'WEEKLY' : 'DAILY'} TradingView chart only`);
  }

  results.sort((a, b) => {
    if (b.rating.rating !== a.rating.rating) return b.rating.rating - a.rating.rating;
    return b.tech.techRating - a.tech.techRating;
  });

  const limited = results.slice(0, cfg.maxResults);

  generateConsoleSummary(limited);

  const html = generateReport(limited, macroResult);
  fs.writeFileSync('screener_report.html', html);
  console.log('\n✅ Screener dashboard saved to screener_report.html');

  const topTickers = generateTopTickers(limited, cfg.topForNeural);
  fs.writeFileSync('top_tickers.txt', topTickers);
  console.log(`✅ Top ${cfg.topForNeural} tickers saved to top_tickers.txt for AI Neural Hunt`);

  const jsonData = limited.map(r => ({
    sym: r.sym, price: r.price, rating: r.rating.rating, ratingLabel: r.rating.label,
    techRating: r.tech.techRating, techTier: r.tech.techLbl, state: r.tech.stateStr,
    trend: r.tech.trendStatus, fastDelta: r.tech.fastDelta, confScore: r.tech.confScore,
    analystUp: r.analyst ? r.analyst.analystUp : null, upGrade: r.analyst ? r.analyst.upGrade : 'NO DATA',
    rr: r.risk.rr, rrGrade: r.risk.g4, stop: r.risk.stopLevel, target: r.risk.targetLevel,
    shares: r.risk.sharesFinal, comboWhy: r.rating.comboWhy,
  }));
  fs.writeFileSync('screener_results.json', JSON.stringify(jsonData, null, 2));
  console.log('✅ JSON data saved to screener_results.json');

  const strongBuys = limited.filter(r => r.rating.rating === 5).length;
  const buys = limited.filter(r => r.rating.rating === 4).length;
  const watches = limited.filter(r => r.rating.rating === 3).length;
  console.log(`\n📊 Summary: ${strongBuys} Strong Buy | ${buys} Buy | ${watches} Watch | ${limited.filter(r => r.rating.rating <= 1).length} Sell`);
  console.log('================================================================\n');
})();
