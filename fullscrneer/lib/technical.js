/**
 * technical.js — VCS Technical Engine (Sections 5-6 of Pine Script)
 * Fully independent technical analysis, extensible with AI/neural overlays.
 */

import {
  getSMA, getEMA, getEMAarr, getATRarr, getRSIarr,
  getOBVarr, getADarr, getBBarr, percentRank,
  highest, lowest, pivotHighs, sumBool, change
} from './indicators.js';
import cfg from '../config.js';

export function analyzeTechnical(quotes) {
  if (!quotes || quotes.length < cfg.minBars) return null;

  const N = quotes.length;
  const last = N - 1;
  const closes = quotes.map(q => q.close);
  const highs  = quotes.map(q => q.high);
  const lows   = quotes.map(q => q.low);
  const volumes = quotes.map(q => q.volume);
  const hlc2   = quotes.map(q => (q.high + q.low) / 2);

  const atr14arr = getATRarr(quotes, 14);
  const atr20arr = getATRarr(quotes, 20);
  const atr14 = atr14arr[last];
  const atr20 = atr20arr[last];
  const volSma = getSMA(volumes, cfg.slow_len);
  const rsiArr = getRSIarr(quotes, cfg.rsi_len);
  const rsi14 = rsiArr[last];
  const obvArr = getOBVarr(quotes);
  const obvEma = getEMAarr(obvArr, cfg.obv_ema_len);
  const adArr = getADarr(quotes);
  const adEma3 = getEMAarr(adArr, 3);
  const adEma10 = getEMAarr(adArr, 10);
  const ma20 = getSMA(closes, cfg.short_ma_len);
  const ema10arr = getEMAarr(closes, 10);
  const ema30arr = getEMAarr(closes, 30);
  const ema50arr = getEMAarr(closes, 50);
  const ema10 = ema10arr[last];
  const ema30 = ema30arr[last];
  const ema50 = ema50arr[last];
  const bbArr = getBBarr(quotes, 20, 2.0);
  const bbWidthArr = bbArr.map(b => b.width);
  const hhDon = highest(highs, cfg.pivot_len, last);
  const llDon = lowest(lows, cfg.pivot_len, last);
  const donchRng = hhDon - llDon;
  const rangePos = donchRng > 0 ? (closes[last] - llDon) / donchRng : 0.5;

  // VCS Fast Delta
  const bpBar = [], spBar = [];
  for (let i = 0; i < N; i++) {
    const rng = highs[i] - lows[i];
    if (rng > 0) { bpBar.push((closes[i] - lows[i]) / rng * volumes[i]); spBar.push((highs[i] - closes[i]) / rng * volumes[i]); }
    else { bpBar.push(0); spBar.push(0); }
  }
  const bpSmaFast = getEMAarr(bpBar, cfg.fast_len);
  const spSmaFast = getEMAarr(spBar, cfg.fast_len);
  const totSmaFast = getEMAarr(bpBar.map((b, i) => b + spBar[i]), cfg.fast_len);
  const fastDeltaArr = [];
  for (let i = 0; i < N; i++) {
    fastDeltaArr.push(totSmaFast[i] > 0 ? (bpSmaFast[i] - spSmaFast[i]) / totSmaFast[i] * 100 : 0);
  }
  const fastDelta = fastDeltaArr[last];

  // Volume analysis
  const barPos = [];
  for (let i = 0; i < N; i++) {
    const rng = highs[i] - lows[i];
    barPos.push(rng > 0 ? (closes[i] - lows[i]) / rng : 0.5);
  }
  const heavyVol = volumes[last] > volSma * cfg.vol_multiplier;
  const volBullish = heavyVol && barPos[last] > 0.55;
  const volBearish = heavyVol && barPos[last] < 0.45;
  const adaptiveTrigBull = volBullish ? cfg.intensity_trig * 0.7 : cfg.intensity_trig;
  const adaptiveTrigBear = volBearish ? cfg.intensity_trig * 0.7 : cfg.intensity_trig;

  // Confluence
  const priceBull = closes[last] > ma20;
  const rsiBull = rsi14 > 50;
  const obvBull = obvArr[last] >= obvEma[last];
  const choBull = (adEma3[last] - adEma10[last]) > 0;
  const bullPts = (priceBull ? 1 : 0) + (rsiBull ? 1 : 0) + (obvBull ? 1 : 0) + (choBull ? 1 : 0);
  const netPts = bullPts - (4 - bullPts);
  const confScore = netPts >= 3 ? 3 : netPts >= 1 ? 1 : netPts === 0 ? 0 : netPts >= -2 ? -1 : -3;

  // Narrow / Absorbing / Accumulation / Distribution
  const rngBar = highs[last] - lows[last];
  const isNarrow = rngBar < atr20 * cfg.narrow_ratio;
  const absorbing = isNarrow && heavyVol;
  const isAccum = absorbing && rangePos < cfg.ad_pos_edge && barPos[last] > 0.55;
  const isDist = absorbing && rangePos > (1.0 - cfg.ad_pos_edge) && barPos[last] < 0.45;

  // Squeeze
  const bbWRank = percentRank(bbWidthArr, last, 100);
  const isSqueeze = bbWRank !== null && bbWRank <= cfg.sqz_pct;
  const prevSqueeze = last > 0 ? (() => { const r = percentRank(bbWidthArr, last - 1, 100); return r !== null && r <= cfg.sqz_pct; })() : false;

  // Breakout
  const priorHi = highest(highs, cfg.pivot_len, last - 1);
  const priorLo = lowest(lows, cfg.pivot_len, last - 1);
  const breakUp = closes[last] > priorHi && heavyVol;
  const breakDn = closes[last] < priorLo && heavyVol;

  // Confluence at any index (helper)
  function getConfScoreAt(idx) {
    const sma20slice = getSMA(closes.slice(0, idx + 1), cfg.short_ma_len);
    const pb = closes[idx] > sma20slice;
    const rb = rsiArr[idx] > 50;
    const ob = obvArr[idx] >= obvEma[idx];
    const ch = (adEma3[idx] - adEma10[idx]) > 0;
    const bp2 = (pb ? 1 : 0) + (rb ? 1 : 0) + (ob ? 1 : 0) + (ch ? 1 : 0);
    const np2 = bp2 - (4 - bp2);
    return np2 >= 3 ? 3 : np2 >= 1 ? 1 : np2 === 0 ? 0 : np2 >= -2 ? -1 : -3;
  }

  // Mature signals
  const bullBarArr = fastDeltaArr.map((fd, i) => fd > cfg.mid_trig && getConfScoreAt(i) >= 1);
  const bearBarArr = fastDeltaArr.map((fd, i) => fd < -cfg.mid_trig && getConfScoreAt(i) <= -1);
  const matureUp = sumBool(bullBarArr, cfg.maturity_n, last) >= cfg.maturity_k;
  const matureDn = sumBool(bearBarArr, cfg.maturity_n, last) >= cfg.maturity_k;

  // Go Long / Go Short
  const goLong = breakUp && fastDelta > adaptiveTrigBull && confScore >= 2 && (matureUp || prevSqueeze);
  const goShort = breakDn && fastDelta < -adaptiveTrigBear && confScore <= -2 && (matureDn || prevSqueeze);

  // Traps
  const trapUp = highs[last] > priorHi && closes[last] < priorHi && heavyVol;
  const trapDn = lows[last] < priorLo && closes[last] > priorLo && heavyVol;

  // Divergence
  const hiPivot = highest(closes, cfg.pivot_len, last);
  const loPivot = lowest(closes, cfg.pivot_len, last);
  const obvHiPivot = highest(obvArr, cfg.pivot_len, last);
  const obvLoPivot = lowest(obvArr, cfg.pivot_len, last);
  const bearDiv = closes[last] >= hiPivot && obvArr[last] < obvHiPivot;
  const bullDiv = closes[last] <= loPivot && obvArr[last] > obvLoPivot;

  // Order Blocks (simplified)
  const bullOBs = [], bearOBs = [];
  const pHighs = pivotHighs(volumes, cfg.ob_len, cfg.ob_len);
  let osDir = 0;
  for (let i = 0; i < N; i++) {
    if (i >= cfg.ob_len) {
      const upperOB = highest(highs, cfg.ob_len, i - 1);
      const lowerOB = lowest(lows, cfg.ob_len, i - 1);
      if (highs[i - cfg.ob_len] > upperOB) osDir = 1;
      else if (lows[i - cfg.ob_len] < lowerOB) osDir = 0;
    }
    const isPivot = pHighs.some(p => p.index === i - cfg.ob_len);
    if (isPivot && i >= cfg.ob_len) {
      const obIdx = i - cfg.ob_len;
      if (osDir === 1 && hlc2[obIdx] != null) bullOBs.push({ top: hlc2[obIdx], btm: lows[obIdx], avg: (hlc2[obIdx] + lows[obIdx]) / 2 });
      else if (osDir === 0 && hlc2[obIdx] != null) bearOBs.push({ top: highs[obIdx], btm: hlc2[obIdx], avg: (highs[obIdx] + hlc2[obIdx]) / 2 });
    }
  }
  const targetBullMit = cfg.ob_mit_mode === 'Close' ? lowest(closes, cfg.ob_len, last) : lowest(lows, cfg.ob_len, last);
  const targetBearMit = cfg.ob_mit_mode === 'Close' ? highest(closes, cfg.ob_len, last) : highest(highs, cfg.ob_len, last);
  const activeBullOBs = bullOBs.filter(ob => ob.btm > targetBullMit);
  const activeBearOBs = bearOBs.filter(ob => ob.top < targetBearMit);
  let nearestBullOB = null;
  for (const ob of activeBullOBs) { if (ob.top < closes[last] && (!nearestBullOB || ob.top > nearestBullOB.top)) nearestBullOB = ob; }
  let nearestBearOB = null;
  for (const ob of activeBearOBs) { if (ob.btm > closes[last] && (!nearestBearOB || ob.btm < nearestBearOB.btm)) nearestBearOB = ob; }

  // Trend
  const emaFastV = ema10arr[last];
  const emaSlowV = ema30arr[last];
  let trendDirRaw = 0;
  if (emaFastV > emaSlowV && closes[last] > emaSlowV) trendDirRaw = 1;
  else if (emaFastV < emaSlowV && closes[last] < emaSlowV) trendDirRaw = -1;
  const trendDirPersist = trendDirRaw;
  const trendStatus = trendDirPersist === 1 ? 'UPTREND' : trendDirPersist === -1 ? 'DOWNTREND' : 'NO TREND';

  // Breather
  let consecRed = 0;
  for (let i = last; i >= 0; i--) { if (closes[i] < quotes[i].open) consecRed++; else break; }
  const isBreatherBull = trendDirPersist === 1 && closes[last] < quotes[last].open
    && consecRed <= cfg.breather_max_bars && (closes[last] > emaSlowV || closes[last] > emaFastV * 0.98);

  // 52-week
  const hi52 = highest(highs, Math.min(252, N), last);
  const lo52 = lowest(lows, Math.min(252, N), last);
  const pctFromLo52 = (hi52 - lo52) > 0 ? ((closes[last] - lo52) / (hi52 - lo52)) * 100 : 50;
  const priceNearLow = pctFromLo52 < 35;

  // OBV analysis
  const obvDivergence = priceNearLow && obvArr[last] > obvEma[last];
  const obvSlope = change(obvArr, 20, last) || 0;
  const obvRising = obvSlope > 0;

  // Higher-low structure
  let hlStruct = false;
  if (N >= 30) {
    const lo10_0 = lowest(lows, 10, last);
    const lo10_10 = lowest(lows, 10, last - 10);
    const lo10_20 = lowest(lows, 10, last - 20);
    hlStruct = (lo10_0 > lo10_10 * 0.995) && (lo10_10 > lo10_20 * 0.995);
  }

  // RSI recovery
  const rsiVals = rsiArr.filter(v => v !== null);
  const rsi30dMin = lowest(rsiVals, 30, rsiVals.length - 1);
  const wasOversold = rsi30dMin < 35;
  const rsiRecovering = rsi14 >= 35 && rsi14 <= 60;
  const rsiNotExt = rsi14 < 65;

  // Fast delta improvement
  const fd10ago = last >= 10 ? fastDeltaArr[last - 10] : 0;
  const fdImproving = fastDelta > fd10ago + 3.0;
  const fdPositive = fastDelta > 5.0;

  // Distribution
  const priceInDn = ema10 < ema30 * 0.97;
  const rsiWeak = rsi14 < 30;
  const obvFalling = !obvRising && !(obvArr[last] > obvEma[last]);
  const confBearTech = bullPts <= 0;
  const distribution = priceInDn && obvFalling && confBearTech;

  // TECH PTS
  let techPts = 0;
  techPts += obvDivergence ? 30 : obvRising ? 15 : 0;
  techPts += hlStruct ? 25 : 0;
  techPts += (wasOversold && rsiRecovering) ? 20 : (rsiRecovering && rsiNotExt) ? 10 : 0;
  techPts += (fdPositive && fdImproving) ? 15 : fdPositive ? 8 : fdImproving ? 5 : 0;
  const confImproving = bullPts > (last >= 10 ? (() => {
    const pb = closes[last - 10] > getSMA(closes.slice(0, last - 9), cfg.short_ma_len);
    const rb = rsiArr[last - 10] > 50;
    const ob = obvArr[last - 10] >= obvEma[last - 10];
    const ch = (adEma3[last - 10] - adEma10[last - 10]) > 0;
    return (pb ? 1 : 0) + (rb ? 1 : 0) + (ob ? 1 : 0) + (ch ? 1 : 0);
  })() : bullPts);
  techPts += (confScore >= 2 && confImproving) ? 10 : confScore >= 2 ? 5 : 0;
  techPts += goLong ? 15 : 0;
  techPts += isAccum ? 10 : 0;
  techPts += isBreatherBull ? 8 : 0;
  techPts += matureUp ? 5 : 0;
  techPts -= distribution ? 25 : 0;
  techPts -= goShort ? 20 : 0;
  techPts -= isDist ? 15 : 0;
  techPts -= priceInDn ? 10 : 0;
  techPts -= rsiWeak ? 10 : 0;
  techPts -= trapUp ? 8 : 0;
  techPts -= bearDiv ? 10 : 0;
  techPts = Math.max(0, Math.min(100, techPts));

  // Bull / Bear Scores
  const vcsConfC = confScore === 3 ? 30 : confScore === 1 ? 14 : confScore === 0 ? 5 : 0;
  const vcsC = Math.max(0, Math.min(20, fastDelta / cfg.intensity_trig * 20));
  const brkC = goLong ? 20 : breakUp ? 10 : 0;
  const volmatC = (heavyVol ? 8 : 0) + (matureUp ? 7 : 0);
  const sqzaccC = (prevSqueeze && fastDelta > 0 ? 8 : 0) + (isAccum ? 7 : 0);
  const bearPen = bearDiv ? 10 : 0;
  const bullScore = Math.max(0, Math.min(100, vcsConfC + vcsC + brkC + volmatC + sqzaccC - bearPen));

  const bconfC = confScore === -3 ? 30 : confScore === -1 ? 14 : 0;
  const bvcsC = Math.max(0, Math.min(20, -fastDelta / cfg.intensity_trig * 20));
  const bbrkC = goShort ? 20 : breakDn ? 10 : 0;
  const bvolmatC = (heavyVol ? 8 : 0) + (matureDn ? 7 : 0);
  const bsqzdstC = (prevSqueeze && fastDelta < 0 ? 8 : 0) + (isDist ? 7 : 0);
  const bullPen = bullDiv ? 10 : 0;
  const bearScore = Math.max(0, Math.min(100, bconfC + bvcsC + bbrkC + bvolmatC + bsqzdstC - bullPen));

  // COIL / BREAKOUT READY
  const coiled = isSqueeze && confScore >= 0 && !distribution && !isDist;
  const breakoutReady = coiled && (fastDelta > cfg.mid_trig || isAccum || matureUp);

  // Live bull/bear differential
  const bbDiffN = (bullScore - bearScore + 100) / 2;

  // State adjustments
  let stateAdj = 0;
  stateAdj += goLong ? 15 : 0;
  stateAdj += breakoutReady ? 10 : coiled ? 5 : 0;
  stateAdj += isAccum ? 5 : 0;
  stateAdj += isBreatherBull ? 4 : 0;
  stateAdj -= goShort ? 20 : 0;
  stateAdj -= distribution ? 15 : 0;
  stateAdj -= isDist ? 8 : 0;
  stateAdj -= trapUp ? 6 : 0;
  stateAdj -= (fastDelta < -cfg.mid_trig && confScore <= -1) ? 8 : 0;

  // TECH RATING
  const techRating = Math.max(0, Math.min(100, techPts * 0.55 + bbDiffN * 0.45 + stateAdj));

  // TECH TIER
  let techTier = techRating >= cfg.tech_strong_th ? 2 : techRating >= cfg.tech_bull_th ? 1 : techRating >= cfg.tech_neut_th ? 0 : techRating >= cfg.tech_weak_th ? -1 : -2;
  if ((distribution || goShort) && techTier > -1) techTier = -1;
  if (goLong && techTier < 1) techTier = 1;

  const techLbl = techTier === 2 ? 'STRONG' : techTier === 1 ? 'BULLISH' : techTier === 0 ? 'NEUTRAL' : techTier === -1 ? 'WEAK' : 'BEARISH';
  const techExtra = goLong ? ' · BREAKOUT' : breakoutReady ? ' · BREAKOUT READY' : coiled ? ' · COILING' : distribution ? ' · DISTRIBUTING' : '';

  // State string
  let stateStr = 'NEUTRAL';
  if (goLong) stateStr = 'BREAKOUT ↑';
  else if (goShort) stateStr = 'BREAKOUT ↓';
  else if (breakoutReady) stateStr = 'BREAKOUT READY';
  else if (coiled) stateStr = 'COILING';
  else if (trapUp) stateStr = 'BULL TRAP';
  else if (trapDn) stateStr = 'BEAR TRAP';
  else if (isAccum) stateStr = 'ACCUMULATION';
  else if (isDist) stateStr = 'DISTRIBUTION';
  else if (fastDelta > adaptiveTrigBull && confScore >= 2) stateStr = 'STRONG BUYING';
  else if (fastDelta < -adaptiveTrigBear && confScore <= -2) stateStr = 'STRONG SELLING';
  else if (isBreatherBull) stateStr = 'BREATHER (dip)';
  else if (fastDelta > cfg.mid_trig) stateStr = 'MILD BUYING';
  else if (fastDelta < -cfg.mid_trig) stateStr = 'MILD SELLING';

  return {
    techPts: Math.round(techPts * 10) / 10,
    bullScore: Math.round(bullScore * 10) / 10,
    bearScore: Math.round(bearScore * 10) / 10,
    bbDiffN: Math.round(bbDiffN * 10) / 10,
    techRating: Math.round(techRating * 10) / 10,
    techTier, techLbl, techExtra, stateStr, trendStatus,
    fastDelta: Math.round(fastDelta * 10) / 10,
    confScore, bullPts,
    rsi14: Math.round(rsi14 * 10) / 10,
    obvDivergence, obvRising, hlStruct,
    pctFromLo52: Math.round(pctFromLo52 * 10) / 10,
    goLong, goShort, breakoutReady, coiled, isSqueeze,
    isAccum, isDist, distribution, isBreatherBull,
    trapUp, trapDn, bearDiv, bullDiv,
    heavyVol, matureUp, matureDn,
    nearestBullOB, nearestBearOB,
    priceInDn, rsiWeak, atr14,
    hi52, lo52,
    ema10: Math.round(ema10 * 100) / 100,
    ema30: Math.round(ema30 * 100) / 100,
    ema50: Math.round(ema50 * 100) / 100,
    ma20: Math.round(ma20 * 100) / 100,
    volSma: Math.round(volSma),
    volLast: volumes[last],
  };
}
