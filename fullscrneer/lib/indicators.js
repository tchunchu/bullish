/**
 * indicators.js — Pure technical indicator calculations
 * Standalone, no external dependencies. Operates on arrays of OHLCV objects.
 */

export function getSMA(arr, period) {
  if (arr.length < period) return null;
  const slice = arr.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

export function getEMAarr(arr, period) {
  const k = 2 / (period + 1);
  const ema = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    ema.push(arr[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function getEMA(arr, period) {
  const ema = getEMAarr(arr, period);
  return ema[ema.length - 1];
}

export function trueRange(bar, prevBar) {
  if (!prevBar) return bar.high - bar.low;
  return Math.max(
    bar.high - bar.low,
    Math.abs(bar.high - prevBar.close),
    Math.abs(bar.low - prevBar.close)
  );
}

export function getATR(quotes, period) {
  if (quotes.length < period + 1) return null;
  let atr = 0;
  for (let i = 1; i <= period; i++) {
    atr += trueRange(quotes[i], quotes[i - 1]);
  }
  atr /= period;
  for (let i = period + 1; i < quotes.length; i++) {
    const tr = trueRange(quotes[i], quotes[i - 1]);
    atr = (atr * (period - 1) + tr) / period;
  }
  return atr;
}

export function getATRarr(quotes, period) {
  const result = new Array(quotes.length).fill(null);
  if (quotes.length < period + 1) return result;
  let atr = 0;
  for (let i = 1; i <= period; i++) {
    atr += trueRange(quotes[i], quotes[i - 1]);
  }
  atr /= period;
  result[period] = atr;
  for (let i = period + 1; i < quotes.length; i++) {
    const tr = trueRange(quotes[i], quotes[i - 1]);
    atr = (atr * (period - 1) + tr) / period;
    result[i] = atr;
  }
  return result;
}

export function getRSI(quotes, period) {
  if (quotes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = quotes[i].close - quotes[i - 1].close;
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < quotes.length; i++) {
    const diff = quotes[i].close - quotes[i - 1].close;
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function getRSIarr(quotes, period) {
  const result = new Array(quotes.length).fill(null);
  if (quotes.length < period + 1) return result;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = quotes[i].close - quotes[i - 1].close;
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  if (avgLoss === 0) result[period] = 100;
  else result[period] = 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < quotes.length; i++) {
    const diff = quotes[i].close - quotes[i - 1].close;
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    if (avgLoss === 0) result[i] = 100;
    else result[i] = 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

export function getOBVarr(quotes) {
  const obv = [0];
  for (let i = 1; i < quotes.length; i++) {
    if (quotes[i].close > quotes[i - 1].close) obv.push(obv[i - 1] + quotes[i].volume);
    else if (quotes[i].close < quotes[i - 1].close) obv.push(obv[i - 1] - quotes[i].volume);
    else obv.push(obv[i - 1]);
  }
  return obv;
}

export function getADarr(quotes) {
  const ad = [0];
  for (let i = 1; i < quotes.length; i++) {
    const rng = quotes[i].high - quotes[i].low;
    const mfm = rng > 0 ? (quotes[i].close - quotes[i].low - (quotes[i].high - quotes[i].close)) / rng : 0;
    ad.push(ad[i - 1] + mfm * quotes[i].volume);
  }
  return ad;
}

export function getBBarr(quotes, period = 20, dev = 2.0) {
  const result = [];
  for (let i = 0; i < quotes.length; i++) {
    if (i < period - 1) { result.push({ basis: null, width: null, upper: null, lower: null }); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += quotes[j].close;
    const basis = sum / period;
    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) sqSum += (quotes[j].close - basis) ** 2;
    const stdev = Math.sqrt(sqSum / period);
    result.push({
      basis,
      width: basis !== 0 ? (dev * 2 * stdev) / basis : 0,
      upper: basis + dev * stdev,
      lower: basis - dev * stdev
    });
  }
  return result;
}

export function percentRank(arr, idx, lookback) {
  if (idx < lookback - 1 || arr[idx] == null) return null;
  const val = arr[idx];
  let count = 0;
  const start = Math.max(0, idx - lookback + 1);
  let total = 0;
  for (let i = start; i <= idx; i++) {
    if (arr[i] != null) {
      total++;
      if (arr[i] <= val) count++;
    }
  }
  return total > 0 ? (count / total) * 100 : null;
}

export function highest(arr, lookback, endIdx) {
  endIdx = endIdx != null ? endIdx : arr.length - 1;
  const start = Math.max(0, endIdx - lookback + 1);
  let mx = -Infinity;
  for (let i = start; i <= endIdx; i++) {
    if (arr[i] != null && arr[i] > mx) mx = arr[i];
  }
  return mx === -Infinity ? null : mx;
}

export function lowest(arr, lookback, endIdx) {
  endIdx = endIdx != null ? endIdx : arr.length - 1;
  const start = Math.max(0, endIdx - lookback + 1);
  let mn = Infinity;
  for (let i = start; i <= endIdx; i++) {
    if (arr[i] != null && arr[i] < mn) mn = arr[i];
  }
  return mn === Infinity ? null : mn;
}

export function pivotHighs(highs, leftLen, rightLen) {
  const pivots = [];
  for (let i = leftLen; i < highs.length - rightLen; i++) {
    let isPivot = true;
    for (let j = i - leftLen; j < i; j++) { if (highs[j] >= highs[i]) { isPivot = false; break; } }
    if (!isPivot) continue;
    for (let j = i + 1; j <= i + rightLen; j++) { if (highs[j] >= highs[i]) { isPivot = false; break; } }
    if (isPivot) pivots.push({ index: i, value: highs[i] });
  }
  return pivots;
}

export function pivotLows(lows, leftLen, rightLen) {
  const pivots = [];
  for (let i = leftLen; i < lows.length - rightLen; i++) {
    let isPivot = true;
    for (let j = i - leftLen; j < i; j++) { if (lows[j] <= lows[i]) { isPivot = false; break; } }
    if (!isPivot) continue;
    for (let j = i + 1; j <= i + rightLen; j++) { if (lows[j] <= lows[i]) { isPivot = false; break; } }
    if (isPivot) pivots.push({ index: i, value: lows[i] });
  }
  return pivots;
}

export function sumBool(arr, n, endIdx) {
  endIdx = endIdx != null ? endIdx : arr.length - 1;
  let s = 0;
  const start = Math.max(0, endIdx - n + 1);
  for (let i = start; i <= endIdx; i++) if (arr[i]) s++;
  return s;
}

export function change(arr, n, endIdx) {
  endIdx = endIdx != null ? endIdx : arr.length - 1;
  const start = endIdx - n;
  if (start < 0 || arr[endIdx] == null || arr[start] == null) return null;
  return arr[endIdx] - arr[start];
}
