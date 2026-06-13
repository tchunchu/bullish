/**
 * indicators.js — Correct Wilder's Smoothing for Technical Indicators
 */

function getATR(quotes, period) {
  if (!quotes || quotes.length <= period) return null;
  let trs = [];
  for (let i = 1; i < quotes.length; i++) {
    const h = quotes[i].high, l = quotes[i].low, pc = quotes[i-1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < trs.length; i++) {
    atr = ((atr * (period - 1)) + trs[i]) / period;
  }
  return atr;
}

function getRSI(quotes, period) {
  if (!quotes || quotes.length <= period) return null;
  let gains = [], losses = [];
  for (let i = 1; i < quotes.length; i++) {
    const diff = quotes[i].close - quotes[i-1].close;
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);
  }
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < gains.length; i++) {
    avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
    avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function getSMA(data, period) {
  if (!data || data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function getEMA(data, period) {
  if (!data || data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < data.length; i++) {
    ema = (data[i] * k) + (ema * (1 - k));
  }
  return ema;
}

function getMACD(quotes) {
  if (!quotes || quotes.length < 26) return null;
  const closes = quotes.map(q => q.close);
  const ema12 = getEMA(closes, 12);
  const ema26 = getEMA(closes, 26);
  if (ema12 === null || ema26 === null) return null;
  return ema12 - ema26;
}

function getADX(quotes, period) {
  if (!quotes || quotes.length <= period * 2) return null;
  let plusDM = [], minusDM = [], tr = [];
  for (let i = 1; i < quotes.length; i++) {
    const upMove = quotes[i].high - quotes[i-1].high;
    const downMove = quotes[i-1].low - quotes[i].low;
    plusDM.push((upMove > downMove && upMove > 0) ? upMove : 0);
    minusDM.push((downMove > upMove && downMove > 0) ? downMove : 0);
    const h = quotes[i].high, l = quotes[i].low, pc = quotes[i-1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let smoothedTR = tr.slice(0, period).reduce((a,b)=>a+b);
  let smoothedPlusDM = plusDM.slice(0, period).reduce((a,b)=>a+b);
  let smoothedMinusDM = minusDM.slice(0, period).reduce((a,b)=>a+b);
  let dx = [];
  for (let i = period; i < tr.length; i++) {
    smoothedTR = smoothedTR - (smoothedTR/period) + tr[i];
    smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM/period) + plusDM[i];
    smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM/period) + minusDM[i];
    const plusDI = 100 * (smoothedPlusDM / smoothedTR);
    const minusDI = 100 * (smoothedMinusDM / smoothedTR);
    const currentDX = 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI || 1);
    dx.push(currentDX);
  }
  let adx = dx.slice(0, period).reduce((a,b)=>a+b) / period;
  for (let i = period; i < dx.length; i++) {
    adx = ((adx * (period - 1)) + dx[i]) / period;
  }
  return adx;
}

module.exports = { getATR, getRSI, getSMA, getEMA, getMACD, getADX };
