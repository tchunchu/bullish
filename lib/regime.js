'use strict';
/**
 * regime.js — Market regime engine: cheap, deterministic, cross-asset.
 */
const { getSMA } = require('./indicators.js');

const ret = (c, n) => (c && c.length > n) ? c[c.length - 1] / c[c.length - 1 - n] - 1 : null;
const slope20 = c => ret(c, 20);
const last = c => c && c.length ? c[c.length - 1] : null;

function ratioSeries(a, b) {
  if (!a || !b) return null;
  const n = Math.min(a.length, b.length);
  const out = [];
  for (let i = 0; i < n; i++) out.push(a[a.length - n + i] / b[b.length - n + i]);
  return out;
}

function classifyRegime(series = {}) {
  const sig = [];
  let score = 0, evaluated = 0;
  const add = (cond, w, posMsg, negMsg) => {
    if (cond == null) return;
    evaluated += w;
    if (cond) { score += w; sig.push(`+ ${posMsg}`); } else { sig.push(`− ${negMsg}`); }
  };

  const spy = series.SPY, vix = series.VIX;

  if (spy && spy.length >= 200) {
    const p = last(spy), m50 = getSMA(spy, 50), m200 = getSMA(spy, 200);
    add(p > m50 && m50 > m200, 3, 'SPY in uptrend (P>50>200)', 'SPY trend broken');
    add(slope20(spy) > 0, 1, 'SPY 20d slope up', 'SPY 20d slope down');
  }

  if (vix && vix.length >= 11) {
    const v = last(vix), v10 = vix[vix.length - 11];
    add(v < 20, 1, `VIX calm (${v.toFixed(1)})`, `VIX elevated (${v.toFixed(1)})`);
    add(v < v10 * 1.15, 1, 'VIX not spiking', `VIX +${(((v / v10) - 1) * 100).toFixed(0)}% in 10d`);
  }

  const credit = ratioSeries(series.HYG, series.IEF);
  if (credit && credit.length > 20) add(slope20(credit) > -0.005, 2, 'Credit firm (HYG/IEF)', 'Credit cracking (HYG/IEF falling)');

  const breadth = ratioSeries(series.RSP, series.SPY);
  if (breadth && breadth.length > 20) add(slope20(breadth) > -0.01, 1, 'Breadth participating (RSP/SPY)', 'Narrow tape (RSP/SPY falling)');

  if (series.QQQ && series.QQQ.length >= 50) {
    add(last(series.QQQ) > getSMA(series.QQQ, 50), 1, 'QQQ above 50d', 'QQQ below 50d');
  }

  const pct = evaluated > 0 ? score / evaluated : 0.5;
  let regime, exposure, weights;
  if (pct >= 0.7) {
    regime = 'RISK_ON'; exposure = 1.0;
    weights = { fundamentals: 0.25, quality: 0.15, valuation: 0.10, technical: 0.30, insider: 0.10, catalysts: 0.10 };
  } else if (pct >= 0.4) {
    regime = 'NEUTRAL'; exposure = 0.6;
    weights = { fundamentals: 0.30, quality: 0.20, valuation: 0.15, technical: 0.20, insider: 0.10, catalysts: 0.05 };
  } else {
    regime = 'RISK_OFF'; exposure = 0.25;
    weights = { fundamentals: 0.25, quality: 0.30, valuation: 0.25, technical: 0.10, insider: 0.10, catalysts: 0.00 };
  }

  return { regime, score: +(pct * 100).toFixed(0), exposure, weights, signals: sig };
}

function sectorLeadership(sectors = {}, bench) {
  const { relStrength } = require('./indicators_v2.js');
  return Object.entries(sectors)
    .map(([etf, closes]) => ({ etf, rs: relStrength(closes, bench) }))
    .filter(x => x.rs != null)
    .sort((a, b) => b.rs - a.rs);
}

module.exports = { classifyRegime, sectorLeadership, ratioSeries };
