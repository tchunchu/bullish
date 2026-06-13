'use strict';
/**
 * setups.js — Deterministic setup STATE MACHINE.
 */
const { getATR, getSMA } = require('./indicators.js');
const {
  bbWidthPercentile, atrPctPercentile, isSqueezed, volDryUp,
  contractionSequence, closingRange, upDownVolRatio, obvSlope,
} = require('./indicators_v2.js');

function compressionScore(quotes) {
  const closes = quotes.map(q => q.close).filter(v => v != null);
  let score = 0; const parts = {};

  const bbp = bbWidthPercentile(closes);
  if (bbp != null && bbp <= 20) { score += 25; parts.bbTight = bbp; }
  else if (bbp != null && bbp <= 35) { score += 12; parts.bbTight = bbp; }

  const ap = atrPctPercentile(quotes);
  if (ap && ap.pctile != null && ap.pctile <= 25) { score += 15; parts.atrPctile = ap.pctile; }

  if (isSqueezed(quotes) === true) { score += 15; parts.ttmSqueeze = true; }

  const dry = volDryUp(quotes);
  if (dry != null && dry < 0.8) { score += 15; parts.volDryUp = dry; }
  else if (dry != null && dry < 1.0) { score += 7; parts.volDryUp = dry; }

  const cs = contractionSequence(quotes);
  if (cs && cs.contracting) { score += 15; parts.vcp = cs.ranges; }

  const udv = upDownVolRatio(quotes);
  if (udv != null && udv > 1.3) { score += 15; parts.accum = udv; }
  else if (udv != null && udv > 1.0) { score += 7; parts.accum = udv; }

  return { score: Math.min(100, score), parts };
}

function pivotLevel(quotes, lookback = 60) {
  if (!quotes || quotes.length < lookback + 1) return null;
  const prior = quotes.slice(-(lookback + 1), -1);
  return Math.max(...prior.map(q => q.high));
}

function classifySetup(quotes, opts = {}) {
  const maxStopPct = opts.maxStopPct ?? 0.08;
  if (!quotes || quotes.length < 70) return { state: 'NO_DATA' };

  const today = quotes[quotes.length - 1];
  const price = today.close;
  const atr = getATR(quotes, 14);
  const vols = quotes.map(q => q.volume).filter(v => v != null);
  const avgVol50 = getSMA(vols, 50);
  const closes = quotes.map(q => q.close);
  const ma20 = getSMA(closes, 20);
  const ma50 = getSMA(closes, 50);
  const pivot = pivotLevel(quotes);
  if (!pivot || !atr || !avgVol50) return { state: 'NO_DATA' };

  const comp = compressionScore(quotes.slice(0, -1));
  const cr = closingRange(today);
  const volThrust = today.volume != null && today.volume >= 1.4 * avgVol50;
  const distPastPivot = (price - pivot) / pivot;

  const swingLow = Math.min(...quotes.slice(-10).map(q => q.low));
  let stop = Math.max(swingLow, price - 2 * atr);
  stop = Math.min(stop, price - atr);
  stop = Math.max(stop, price * (1 - maxStopPct));
  if (stop >= price) stop = price - 1.5 * atr;

  const baseLow = Math.min(...quotes.slice(-45).map(q => q.low));
  const baseDepth = pivot - baseLow;
  const t1 = +Math.max(pivot + baseDepth * 0.5, price + 2 * (price - stop)).toFixed(2);
  const t2 = +(pivot + baseDepth).toFixed(2);
  const rr = +((t1 - price) / (price - stop)).toFixed(2);

  const base = { pivot: +pivot.toFixed(2), entry: +price.toFixed(2), stop: +stop.toFixed(2), t1, t2, rr, atr: +atr.toFixed(2), compression: comp };

  if (distPastPivot > 0.05 || price > pivot + 1.5 * atr) {
    return { state: 'EXTENDED', score: 10, ...base,
      detail: `+${(distPastPivot * 100).toFixed(1)}% past pivot — chase risk. Alert on retest of ${pivot.toFixed(2)}.` };
  }

  if (price > pivot && distPastPivot <= 0.03 && volThrust && cr != null && cr >= 0.6 && comp.score >= 40) {
    return { state: 'TRIGGERED', score: 90 + Math.round(comp.score / 10), ...base,
      detail: `Pivot break +${(distPastPivot * 100).toFixed(1)}% on ${(today.volume / avgVol50).toFixed(1)}x vol, close-range ${cr}. Coil score ${comp.score}.` };
  }

  const nearPivot = (pivot - price) / pivot;
  if (price <= pivot && nearPivot <= 0.08 && comp.score >= 55 && ma50 != null && price > ma50 * 0.97) {
    return { state: 'COILING', score: 50 + Math.round(comp.score / 4), ...base,
      detail: `Coil ${comp.score}/100, ${(nearPivot * 100).toFixed(1)}% below pivot ${pivot.toFixed(2)}. ALERT: break of pivot on ≥1.4x vol.` };
  }

  const lo60 = Math.min(...quotes.slice(-60).map(q => q.low));
  const offLow = (price - lo60) / lo60;
  const reclaim20 = ma20 != null && price > ma20 && quotes[quotes.length - 2].close <= ma20;
  if (offLow > 0.05 && offLow < 0.20 && reclaim20 && volThrust) {
    return { state: 'REVERSAL', score: 55, ...base,
      detail: `Reclaimed 20d MA on volume, +${(offLow * 100).toFixed(1)}% off 60d low.` };
  }

  return { state: 'NONE', score: comp.score >= 45 ? 20 : 0, ...base,
    detail: comp.score >= 45 ? `Compressing (${comp.score}) but pivot ${pivot.toFixed(2)} is ${(nearPivot * 100).toFixed(1)}% away.` : 'No setup.' };
}

module.exports = { classifySetup, compressionScore, pivotLevel };
