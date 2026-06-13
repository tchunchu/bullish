'use strict';
/**
 * indicators_v2.cjs — tape-reading additions (daily-bar proxies for order flow).
 * Pure functions, null-tolerant. Merge into lib/indicators.cjs exports or require alongside.
 * All take `quotes` = [{date, open, high, low, close, volume}] oldest→newest.
 */
const { getSMA, getATR, getEMA } = require('./indicators.cjs');

const closesOf = q => q.map(x => x.close).filter(v => v != null);

function getBollinger(closes, period = 20, mult = 2) {
  if (!closes || closes.length < period) return null;
  const s = closes.slice(-period);
  const mid = s.reduce((a, b) => a + b) / period;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mid) ** 2, 0) / period);
  return { mid, upper: mid + mult * sd, lower: mid - mult * sd, width: (2 * mult * sd) / mid };
}

function getKeltner(quotes, period = 20, mult = 1.5) {
  if (!quotes || quotes.length < period + 1) return null;
  const mid = getEMA(closesOf(quotes), period);
  const atr = getATR(quotes, period);
  if (mid == null || atr == null) return null;
  return { mid, upper: mid + mult * atr, lower: mid - mult * atr };
}

/** TTM-squeeze: Bollinger fully inside Keltner = energy stored. */
function isSqueezed(quotes) {
  const bb = getBollinger(closesOf(quotes));
  const kc = getKeltner(quotes);
  if (!bb || !kc) return null;
  return bb.upper < kc.upper && bb.lower > kc.lower;
}

/** Percentile rank (0–100) of latest value within a lookback series. */
function percentileRank(series, lookback) {
  if (!series || series.length < 2) return null;
  const s = series.slice(-lookback);
  const last = s[s.length - 1];
  const below = s.filter(v => v < last).length;
  return +(100 * below / (s.length - 1)).toFixed(1);
}

/** BB-width percentile over `lookback` days. <20 = tight coil (NR/VCP zone). */
function bbWidthPercentile(closes, lookback = 126, period = 20) {
  if (!closes || closes.length < period + 10) return null;
  const widths = [];
  for (let i = period; i <= closes.length; i++) {
    const bb = getBollinger(closes.slice(0, i), period);
    if (bb) widths.push(bb.width);
  }
  return percentileRank(widths, lookback);
}

/** ATR as % of price, plus its percentile over lookback. */
function atrPctPercentile(quotes, lookback = 126, period = 14) {
  if (!quotes || quotes.length < period + 10) return null;
  const series = [];
  for (let i = period + 1; i <= quotes.length; i++) {
    const a = getATR(quotes.slice(0, i), period);
    const c = quotes[i - 1].close;
    if (a != null && c) series.push(a / c);
  }
  return { atrPct: +(series[series.length - 1] * 100).toFixed(2), pctile: percentileRank(series, lookback) };
}

/** Up/Down volume ratio over n days. >1.5 = accumulation; <0.7 = distribution. */
function upDownVolRatio(quotes, n = 50) {
  if (!quotes || quotes.length < n + 1) return null;
  let up = 0, dn = 0;
  const s = quotes.slice(-n);
  for (let i = 1; i < s.length; i++) {
    if (s[i].close > s[i - 1].close) up += s[i].volume || 0;
    else if (s[i].close < s[i - 1].close) dn += s[i].volume || 0;
  }
  return dn > 0 ? +(up / dn).toFixed(2) : null;
}

/** Today's close position in day range, 0–1. ≥0.7 = strong tape (buyers at close). */
function closingRange(q) {
  if (!q || q.high == null || q.low == null || q.high === q.low) return null;
  return +((q.close - q.low) / (q.high - q.low)).toFixed(2);
}

/** Volume dry-up: 10d avg vol vs 50d avg vol. <0.8 = supply exhausted (good in a base). */
function volDryUp(quotes) {
  const vols = quotes.map(q => q.volume).filter(v => v != null);
  const v10 = getSMA(vols, 10), v50 = getSMA(vols, 50);
  return (v10 != null && v50 > 0) ? +(v10 / v50).toFixed(2) : null;
}

/** OBV slope over n days, normalized by avg volume (sign + magnitude of accumulation). */
function obvSlope(quotes, n = 20) {
  if (!quotes || quotes.length < n + 1) return null;
  let obv = 0; const series = [0];
  for (let i = 1; i < quotes.length; i++) {
    const d = quotes[i].close - quotes[i - 1].close;
    obv += d > 0 ? (quotes[i].volume || 0) : d < 0 ? -(quotes[i].volume || 0) : 0;
    series.push(obv);
  }
  const s = series.slice(-n);
  const avgVol = getSMA(quotes.map(q => q.volume || 0), 50) || 1;
  return +(((s[s.length - 1] - s[0]) / n) / avgVol).toFixed(3);
}

/** Multi-window RS vs benchmark: weighted 1m/3m/6m excess return. */
function relStrength(closes, benchCloses) {
  const ret = (c, n) => (c.length > n && c[c.length - 1 - n]) ? c[c.length - 1] / c[c.length - 1 - n] - 1 : null;
  const windows = [[21, 0.5], [63, 0.3], [126, 0.2]];
  let rs = 0, w = 0;
  for (const [n, wt] of windows) {
    const a = ret(closes, n), b = ret(benchCloses, n);
    if (a != null && b != null) { rs += wt * (a - b); w += wt; }
  }
  return w > 0 ? +(100 * rs / w).toFixed(2) : null;
}

/** RS line (price/bench) at or near its high before price = institutional tell. */
function rsLineNearHigh(closes, benchCloses, lookback = 63, tolPct = 2) {
  const n = Math.min(closes.length, benchCloses.length);
  if (n < lookback) return null;
  const line = [];
  for (let i = n - lookback; i < n; i++) line.push(closes[i] / benchCloses[i]);
  const hi = Math.max(...line);
  return ((hi - line[line.length - 1]) / hi) * 100 <= tolPct;
}

/** Splits last `days` into 3 thirds; each third's high-low range should shrink. */
function contractionSequence(quotes, days = 45) {
  if (!quotes || quotes.length < days) return null;
  const s = quotes.slice(-days);
  const third = Math.floor(days / 3);
  const rng = seg => {
    const h = Math.max(...seg.map(q => q.high)), l = Math.min(...seg.map(q => q.low));
    return (h - l) / l;
  };
  const r1 = rng(s.slice(0, third)), r2 = rng(s.slice(third, 2 * third)), r3 = rng(s.slice(2 * third));
  return { contracting: r3 < r2 && r2 < r1, ranges: [r1, r2, r3].map(r => +(r * 100).toFixed(1)) };
}

module.exports = {
  getBollinger, getKeltner, isSqueezed, percentileRank, bbWidthPercentile,
  atrPctPercentile, upDownVolRatio, closingRange, volDryUp, obvSlope,
  relStrength, rsLineNearHigh, contractionSequence,
};
