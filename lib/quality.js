'use strict';
/**
 * quality.js — Deterministic quality & scoring engine (InvestSkill-inspired).
 *
 * WHY THIS EXISTS
 * The "best of InvestSkill" is its quality rigor: the Piotroski F-Score,
 * Earnings-Quality checks, Economic Value Added (EVA), Margin-of-Safety bands,
 * and a 0–10 weighted composite. InvestSkill is a *prompt* framework, so an LLM
 * eyeballs those numbers — which hallucinates (e.g. it guessed ANET's F-Score at
 * 7/9 when the real Yahoo statements give 5/9).
 *
 * This module computes every one of those metrics DETERMINISTICALLY from Yahoo's
 * `fundamentalsTimeSeries` annual statements (two most-recent fiscal years), so
 * the report is anchored on measured data, not memory. Pure functions, all
 * null-tolerant, no Yahoo coupling -> unit-testable and double-verifiable.
 *
 * A "statement" object is one fiscal year with (all optional) numeric fields:
 *   totalRevenue, grossProfit, costOfRevenue, operatingIncome, netIncome,
 *   totalAssets, currentAssets, currentLiabilities, longTermDebt, totalDebt,
 *   operatingCashFlow, dilutedAverageShares
 */

const n = v => (v != null && !Number.isNaN(+v)) ? +v : null;
const div = (a, b) => (n(a) != null && n(b) != null && b !== 0) ? a / b : null;

/**
 * Piotroski F-Score (0–9) from current vs prior fiscal-year statements.
 * Each of the 9 criteria returns {label, pass:0|1|null, detail}.
 * pass=null means "could not evaluate" (missing field) and scores 0 but is flagged.
 */
function piotroski(cur = {}, prv = {}) {
  const roaC = div(cur.netIncome, cur.totalAssets);
  const roaP = div(prv.netIncome, prv.totalAssets);
  const crC = div(cur.currentAssets, cur.currentLiabilities);
  const crP = div(prv.currentAssets, prv.currentLiabilities);
  const gmC = div(cur.grossProfit, cur.totalRevenue);
  const gmP = div(prv.grossProfit, prv.totalRevenue);
  const atC = div(cur.totalRevenue, cur.totalAssets);
  const atP = div(prv.totalRevenue, prv.totalAssets);
  // Leverage = long-term debt / total assets (lower is better)
  const levC = div(cur.longTermDebt ?? cur.totalDebt, cur.totalAssets);
  const levP = div(prv.longTermDebt ?? prv.totalDebt, prv.totalAssets);
  const accrualOk = (n(cur.operatingCashFlow) != null && n(cur.totalAssets) != null && roaC != null)
    ? (cur.operatingCashFlow / cur.totalAssets) > roaC : null;

  const pct = v => v == null ? '—' : (v * 100).toFixed(1) + '%';
  const f2 = v => v == null ? '—' : v.toFixed(2);

  const C = [
    { label: 'ROA > 0', pass: n(cur.netIncome) != null ? (cur.netIncome > 0 ? 1 : 0) : null,
      detail: `Net income ${cur.netIncome != null ? (cur.netIncome / 1e9).toFixed(2) + 'B' : '—'}` },
    { label: 'Operating Cash Flow > 0', pass: n(cur.operatingCashFlow) != null ? (cur.operatingCashFlow > 0 ? 1 : 0) : null,
      detail: `CFO ${cur.operatingCashFlow != null ? (cur.operatingCashFlow / 1e9).toFixed(2) + 'B' : '—'}` },
    { label: 'Rising ROA (YoY)', pass: (roaC != null && roaP != null) ? (roaC > roaP ? 1 : 0) : null,
      detail: `${pct(roaC)} vs ${pct(roaP)}` },
    { label: 'Accruals (CFO/Assets > ROA)', pass: accrualOk == null ? null : (accrualOk ? 1 : 0),
      detail: `cash earnings ${accrualOk ? 'exceed' : 'below'} reported` },
    { label: 'Lower Leverage (YoY)', pass: (levC != null && levP != null) ? (levC <= levP ? 1 : 0) : null,
      detail: `LTD/assets ${pct(levC)} vs ${pct(levP)}` },
    { label: 'Higher Current Ratio (YoY)', pass: (crC != null && crP != null) ? (crC > crP ? 1 : 0) : null,
      detail: `${f2(crC)} vs ${f2(crP)}` },
    { label: 'No Share Dilution (YoY)', pass: (n(cur.dilutedAverageShares) != null && n(prv.dilutedAverageShares) != null)
        ? (cur.dilutedAverageShares <= prv.dilutedAverageShares * 1.001 ? 1 : 0) : null,
      detail: `${cur.dilutedAverageShares != null ? (cur.dilutedAverageShares / 1e6).toFixed(0) + 'M' : '—'} vs ${prv.dilutedAverageShares != null ? (prv.dilutedAverageShares / 1e6).toFixed(0) + 'M' : '—'}` },
    { label: 'Higher Gross Margin (YoY)', pass: (gmC != null && gmP != null) ? (gmC > gmP ? 1 : 0) : null,
      detail: `${pct(gmC)} vs ${pct(gmP)}` },
    { label: 'Higher Asset Turnover (YoY)', pass: (atC != null && atP != null) ? (atC > atP ? 1 : 0) : null,
      detail: `${f2(atC)} vs ${f2(atP)}` },
  ];

  const evaluated = C.filter(c => c.pass !== null).length;
  const score = C.reduce((s, c) => s + (c.pass === 1 ? 1 : 0), 0);
  let verdict;
  if (score >= 8) verdict = 'Strong (high-quality)';
  else if (score >= 5) verdict = 'Average';
  else verdict = 'Weak (deterioration risk)';

  return { score, max: 9, evaluated, criteria: C, verdict };
}

/**
 * Earnings Quality: accruals ratio + cash-conversion. Lower accruals & CFO/NI>1
 * indicate cash-backed, high-quality earnings.
 */
function earningsQuality(cur = {}, prv = {}) {
  const avgAssets = (n(cur.totalAssets) != null && n(prv.totalAssets) != null)
    ? (cur.totalAssets + prv.totalAssets) / 2 : n(cur.totalAssets);
  const accrualRatio = (n(cur.netIncome) != null && n(cur.operatingCashFlow) != null && avgAssets)
    ? (cur.netIncome - cur.operatingCashFlow) / avgAssets : null;
  // Cash-conversion (CFO/NI) is meaningless when net income is ~0 or negative:
  // a tiny denominator makes the ratio explode (e.g. 51x). Guard against it so we
  // never display a misleading number. Require NI to be a positive, non-trivial
  // share of revenue before trusting the ratio.
  let cashConversion = null, ccUnreliable = false;
  const niPositiveMaterial = n(cur.netIncome) != null && cur.netIncome > 0 &&
    (n(cur.totalRevenue) == null || cur.netIncome / cur.totalRevenue > 0.01);
  if (niPositiveMaterial) {
    cashConversion = div(cur.operatingCashFlow, cur.netIncome);
  } else if (n(cur.netIncome) != null) {
    ccUnreliable = true; // NI <= 0 or immaterial -> ratio not meaningful
  }

  let verdict = 'Unknown', flag = 'neutral';
  if (ccUnreliable) {
    verdict = 'N/M — net income ~0 or negative'; flag = 'neutral';
  } else if (cashConversion != null) {
    if (cashConversion >= 1.0 && (accrualRatio == null || accrualRatio <= 0.05)) { verdict = 'High — cash-backed'; flag = 'positive'; }
    else if (cashConversion >= 0.7) { verdict = 'Adequate'; flag = 'neutral'; }
    else { verdict = 'Low — possible inflation'; flag = 'negative'; }
  }
  return {
    accrualRatioPct: accrualRatio != null ? +(accrualRatio * 100).toFixed(2) : null,
    cashConversion: cashConversion != null ? +cashConversion.toFixed(3) : null,
    cashConvReliable: !ccUnreliable,
    verdict, flag,
  };
}

/**
 * Economic Value Added = (ROIC − WACC) × Invested Capital.
 * ROIC/WACC/IC come from valuation.js so this stays consistent with the headline spread.
 */
function eva({ roicPct, waccPct, investedCapitalB }) {
  if (roicPct == null || waccPct == null || investedCapitalB == null) return { evaB: null, verdict: 'n/a' };
  const evaB = +(((roicPct - waccPct) / 100) * investedCapitalB).toFixed(2);
  const spread = roicPct - waccPct;
  const verdict = spread > 0 ? 'Creating value (ROIC > WACC)'
    : spread < 0 ? 'Destroying value (ROIC < WACC)' : 'Break-even';
  return { evaB, spreadPct: +spread.toFixed(2), verdict };
}

/**
 * Margin of Safety vs an intrinsic/target value (we use analyst mean as the
 * Yahoo-sourced base). Returns discount% (positive = trading below value) + band.
 */
function marginOfSafety(price, intrinsic) {
  if (n(price) == null || n(intrinsic) == null || intrinsic === 0) return { discountPct: null, band: 'n/a' };
  const discountPct = +(((intrinsic - price) / intrinsic) * 100).toFixed(1);
  let band;
  if (discountPct > 30) band = 'Significant — compelling value';
  else if (discountPct >= 10) band = 'Moderate — attractive';
  else if (discountPct >= 0) band = 'Limited — fairly valued';
  else band = 'None — premium to value';
  return { discountPct, band };
}

/**
 * 0–10 weighted composite from already-computed, Yahoo-derived inputs.
 * Sub-scores are deterministic functions of measured metrics. Insider is optional;
 * if absent its weight is redistributed proportionally so the scale stays 0–10.
 *
 * @param {object} m {
 *   revGr, netMgn, roe,          // fundamentals
 *   fScore, evaSpreadPct, cashConversion, // quality
 *   marginOfSafetyPct,           // valuation
 *   price, ma50, ma200, rsi, macd, goldenCross, // technical
 *   insiderScore                 // optional 1–10
 * }
 */
function compositeScore(m = {}, weightsOverride = null) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---- Fundamentals / Growth (0–10)
  let fund = 5;
  if (m.revGr != null) fund = clamp(2 + m.revGr / 6, 0, 10);       // ~48% growth -> 10
  if (m.netMgn != null) fund = clamp((fund + clamp(m.netMgn / 4, 0, 10)) / 2, 0, 10); // 40% margin -> 10
  fund = +fund.toFixed(1);

  // ---- Quality (0–10): F-Score (0–9 -> 0–10) blended with EVA spread & cash conversion
  let qual = 5;
  if (m.fScore != null) qual = (m.fScore / 9) * 10;
  if (m.evaSpreadPct != null) qual = (qual + clamp(5 + m.evaSpreadPct / 4, 0, 10)) / 2; // +20% spread -> 10
  if (m.cashConversion != null) qual = clamp(qual + (m.cashConversion >= 1 ? 0.5 : -0.5), 0, 10);
  qual = +qual.toFixed(1);

  // ---- Valuation / Margin of Safety (0–10)
  let val = 5;
  if (m.marginOfSafetyPct != null) val = clamp(5 + m.marginOfSafetyPct / 6, 0, 10); // +30% MoS -> 10, -30% -> 0
  val = +val.toFixed(1);

  // ---- Technical (0–10)
  let tech = 5, tParts = 0, tSum = 0;
  if (m.price != null && m.ma50 != null) { tSum += m.price > m.ma50 ? 10 : 3; tParts++; }
  if (m.price != null && m.ma200 != null) { tSum += m.price > m.ma200 ? 10 : 3; tParts++; }
  if (m.goldenCross != null) { tSum += m.goldenCross ? 9 : 3; tParts++; }
  if (m.rsi != null) { tSum += (m.rsi > 70 ? 4 : m.rsi < 30 ? 6 : 7); tParts++; }
  if (m.macd != null) { tSum += m.macd > 0 ? 8 : 4; tParts++; }
  if (tParts) tech = +(tSum / tParts).toFixed(1);

  // ---- Insider (optional, 1–10 already)
  const hasInsider = m.insiderScore != null;
  const insider = hasInsider ? clamp(+m.insiderScore, 0, 10) : null;

  // ---- weights
  // Regime-adaptive weights: pass regime.weights from lib/regime.js to make the
  // composite risk-on (technical-heavy) vs risk-off (quality/valuation-heavy).
  let weights = weightsOverride
    ? { ...weightsOverride }
    : { fundamentals: 0.25, quality: 0.20, valuation: 0.20, technical: 0.15, catalysts: 0.10, insider: 0.10 };
  // We don't auto-score "catalysts" (qualitative); fold its weight into fundamentals.
  weights.fundamentals += (weights.catalysts || 0); delete weights.catalysts;
  if (!hasInsider) {
    // redistribute insider weight proportionally across the rest
    const w = weights.insider; delete weights.insider;
    const tot = weights.fundamentals + weights.quality + weights.valuation + weights.technical;
    for (const k of Object.keys(weights)) weights[k] += (weights[k] / tot) * w;
  }

  let composite = weights.fundamentals * fund + weights.quality * qual
    + weights.valuation * val + weights.technical * tech
    + (hasInsider ? weights.insider * insider : 0);
  composite = +composite.toFixed(1);

  let signal, action, conviction;
  if (composite >= 8) { signal = 'BULLISH'; action = 'BUY'; conviction = 'STRONG'; }
  else if (composite >= 6) { signal = 'BULLISH'; action = 'BUY'; conviction = 'MODERATE'; }
  else if (composite >= 4) { signal = 'NEUTRAL'; action = 'HOLD'; conviction = 'WEAK'; }
  else if (composite >= 2) { signal = 'BEARISH'; action = 'SELL'; conviction = 'MODERATE'; }
  else { signal = 'BEARISH'; action = 'SELL'; conviction = 'STRONG'; }

  return {
    composite,
    subScores: { fundamentals: fund, quality: qual, valuation: val, technical: tech, insider },
    weights,
    signal, action, conviction,
  };
}

module.exports = { piotroski, earningsQuality, eva, marginOfSafety, compositeScore };
