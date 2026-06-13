'use strict';
/**
 * valuation.cjs — Capital-structure-aware ROIC / WACC / value spread.
 *
 * WHY THIS EXISTS
 * The naive formula ROIC = NOPAT / (bookEquity + totalDebt) breaks for two
 * very common company types and prints a FALSE negative value-spread:
 *   1. Captive-finance companies (DE, CAT, GE, auto OEMs, DFS): a large chunk
 *      of "totalDebt" funds a customer-loan / receivables book, not operating
 *      assets. Dumping it into invested capital crushes ROIC.
 *   2. Goodwill-heavy serial acquirers (TMO, DHR, ABT): book equity is inflated
 *      by acquisition goodwill, so book-based ROIC understates cash returns.
 *
 * This module computes ROIC with an adjustable invested-capital base, detects
 * those two cases from the available Yahoo fields, and returns BOTH the naive
 * and adjusted numbers plus an explicit `regime` tag so the renderer/linter can
 * tell a real value-destroyer apart from a measurement artifact.
 *
 * All inputs are plain numbers (no Yahoo coupling) so it is unit-testable.
 * Every function tolerates nulls and returns null rather than throwing.
 */

const DEFAULTS = {
  riskFreeRate: 0.044,      // ~10Y UST, refresh periodically
  equityRiskPremium: 0.050, // standard 4.5-5.5%
  costOfDebtPre: 0.057,     // pre-tax; overridden by interestExpense/totalDebt when available
  taxRate: 0.21,
};

/** CAPM cost of equity. */
function costOfEquity(beta, rf = DEFAULTS.riskFreeRate, erp = DEFAULTS.equityRiskPremium) {
  const b = (beta == null || isNaN(beta)) ? 1.0 : beta;
  return rf + b * erp;
}

/**
 * Detect whether a company runs a meaningful captive-finance operation.
 * Heuristic (no segment data from Yahoo, so we infer):
 *   - very high debt/equity (> 1.5) is the strongest tell for industrials, AND
 *   - sector is not itself a financial (banks legitimately carry high leverage).
 * Returns { isFinanceHeavy, isGoodwillHeavy }.
 */
function detectRegime({ debtToEquity, sector, priceToBook, returnOnEquity, roicNaive }) {
  const sec = (sector || '').toLowerCase();
  const isFinancialSector = /financ|bank|insurance/.test(sec);
  // Normalize debt/equity to a RATIO. Yahoo reports this as a percentage
  // (e.g. 248 means 2.48x). Anything > 5 is almost certainly percentage-format,
  // so divide by 100; values <= 5 are treated as already-ratio.
  let deRatio = debtToEquity;
  if (deRatio != null && deRatio > 5) deRatio = deRatio / 100;
  const isFinanceHeavy =
    !isFinancialSector && deRatio != null && deRatio > 1.5;
  // Goodwill tell: high P/B with a large gap between ROE and naive ROIC implies
  // book equity / invested capital is inflated relative to what earns the return.
  const isGoodwillHeavy =
    priceToBook != null && priceToBook > 3 &&
    returnOnEquity != null && roicNaive != null &&
    (returnOnEquity - roicNaive / 100) > 0.03;
  return { isFinanceHeavy, isGoodwillHeavy, isFinancialSector };
}

/**
 * Core computation.
 * @param {object} i inputs (all optional, null-tolerant):
 *   operatingMargin, totalRevenue, totalDebt, bookEquity, marketCap, cash,
 *   beta, debtToEquity, sector, priceToBook, returnOnEquity,
 *   interestExpense (for empirical cost of debt), financeArmDebtFraction (override)
 * @param {object} opts WACC assumptions override
 * @returns {object} full result with naive + adjusted + regime + spread
 */
function computeValuation(i = {}, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const taxRate = o.taxRate;

  const operatingIncome =
    (i.operatingMargin != null && i.totalRevenue != null)
      ? i.operatingMargin * i.totalRevenue : null;
  const nopat = operatingIncome != null ? operatingIncome * (1 - taxRate) : null;

  const totalDebt  = i.totalDebt || 0;
  const bookEquity = i.bookEquity || 0;
  const cash       = i.cash || 0;
  const marketCap  = i.marketCap || 0;

  // ---- naive invested capital (what the old code used) ----
  const icNaive = bookEquity + totalDebt;
  const roicNaive = (nopat != null && icNaive > 0) ? (nopat / icNaive) * 100 : null;

  // ---- regime detection ----
  const regime = detectRegime({
    debtToEquity: i.debtToEquity, sector: i.sector,
    priceToBook: i.priceToBook, returnOnEquity: i.returnOnEquity, roicNaive,
  });

  // ---- adjusted invested capital ----
  // Finance-heavy: strip the estimated finance-arm debt out of invested capital.
  // We don't have segment data, so estimate the finance-funded portion. A
  // conservative, transparent rule: assume the debt ABOVE a "normal industrial"
  // leverage of 0.5x equity is finance-arm funding (matched by receivables).
  let financeArmDebt = 0;
  if (regime.isFinanceHeavy) {
    if (i.financeArmDebtFraction != null) {
      financeArmDebt = totalDebt * i.financeArmDebtFraction;
    } else {
      const normalIndustrialDebt = 0.5 * bookEquity; // baseline operating leverage
      financeArmDebt = Math.max(0, totalDebt - normalIndustrialDebt);
    }
  }
  const industrialDebt = totalDebt - financeArmDebt;
  // Adjusted IC nets cash and excludes finance-arm capital.
  const icAdjusted = Math.max(0, bookEquity + industrialDebt - cash);
  const roicAdjusted = (nopat != null && icAdjusted > 0) ? (nopat / icAdjusted) * 100 : null;

  // ---- WACC ----
  // Empirical cost of debt when interest expense available, else assumption.
  let costDebtPre = o.costOfDebtPre;
  if (i.interestExpense != null && totalDebt > 0) {
    const empirical = i.interestExpense / totalDebt;
    if (empirical > 0.01 && empirical < 0.15) costDebtPre = empirical; // sane bound
  }
  const ke = costOfEquity(i.beta, o.riskFreeRate, o.equityRiskPremium);
  const kdAT = costDebtPre * (1 - taxRate);
  // WACC weights: for finance-heavy names weight only INDUSTRIAL debt against
  // market equity (the finance book is self-funding), matching the adjusted ROIC base.
  const debtForWeight = regime.isFinanceHeavy ? industrialDebt : totalDebt;
  const V = marketCap + debtForWeight;
  const wacc = V > 0
    ? ((marketCap / V) * ke + (debtForWeight / V) * kdAT) * 100
    : null;

  // ---- choose the headline ROIC + label ----
  // Finance-arm adjustment uses defensible math (strip self-funding debt), so we
  // promote it to the headline. Goodwill we can only DETECT (no goodwill field
  // from Yahoo), so we FLAG it for analyst verification rather than silently
  // inventing an adjusted number we can't substantiate.
  const useAdjusted = regime.isFinanceHeavy;
  const roicHeadline = useAdjusted ? roicAdjusted : roicNaive;
  const spread = (roicHeadline != null && wacc != null)
    ? +(roicHeadline - wacc).toFixed(2) : null;

  let basisLabel = 'standard (book equity + total debt)';
  if (regime.isFinanceHeavy) basisLabel = 'industrial (captive-finance debt excluded, cash netted)';

  // Analyst-facing flag: when spread is negative AND we have a structural reason
  // to suspect the naive number understates true returns, say so explicitly.
  let artifactFlag = null;
  if (spread != null && spread < 0) {
    if (regime.isGoodwillHeavy)
      artifactFlag = 'Negative spread may be a goodwill artifact (acquisition-inflated book equity). Verify with cash ROIC ex-goodwill before treating as value destruction.';
    else if (regime.isFinanceHeavy)
      artifactFlag = 'Negative spread persists after finance-arm adjustment — investigate operating returns directly.';
  }

  return {
    nopat: nopat != null ? +(nopat / 1e9).toFixed(3) : null,
    roicNaive: roicNaive != null ? +roicNaive.toFixed(2) : null,
    roicAdjusted: roicAdjusted != null ? +roicAdjusted.toFixed(2) : null,
    roic: roicHeadline != null ? +roicHeadline.toFixed(2) : null, // headline
    wacc: wacc != null ? +wacc.toFixed(2) : null,
    spread,
    regime,
    basisLabel,
    artifactFlag,
    investedCapitalB: +(icAdjusted / 1e9).toFixed(2),
    financeArmDebtB: +(financeArmDebt / 1e9).toFixed(2),
    costOfEquityPct: +(ke * 100).toFixed(2),
    costOfDebtPreTaxPct: +(costDebtPre * 100).toFixed(2),
  };
}

module.exports = { computeValuation, costOfEquity, detectRegime, DEFAULTS };
