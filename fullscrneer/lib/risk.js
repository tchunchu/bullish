/**
 * risk.js — Risk:Reward & Position Sizing (Section 7 of Pine Script)
 */

import cfg from '../config.js';

export function computeRisk(close, tech, analyst) {
  const atr14 = tech.atr14 || close * 0.02;
  const support20 = tech.lo52 ? tech.lo52 * 0.95 : close * 0.92;

  let stopLevel, obInPlay = false, stopSource = 'struct';
  if (tech.nearestBullOB) {
    const obDistAvg = close - tech.nearestBullOB.avg;
    if (obDistAvg > 0 && obDistAvg < 2.5 * atr14) {
      stopLevel = tech.nearestBullOB.btm - 0.2 * atr14;
      obInPlay = true;
      stopSource = 'OB';
    }
  }
  if (!obInPlay) {
    stopLevel = Math.min(support20 * (1 - cfg.stop_struct_pct / 100), close * 0.92);
  }

  let targetLevel, targetSrc;
  if (analyst && analyst.analystOk && analyst.analystTgt) {
    targetLevel = analyst.analystTgt;
    targetSrc = analyst.tgtIsMean ? 'Analyst mean' : 'Analyst median';
  } else {
    targetLevel = close + 2.5 * atr14;
    targetSrc = 'ATR fallback';
  }

  const riskPts = close - stopLevel;
  const rewardPts = targetLevel - close;
  const rr = riskPts > 0 ? rewardPts / riskPts : null;
  const riskPct = riskPts / close * 100;

  let g4 = 'POOR';
  if (rr !== null) { if (rr >= cfg.g4_ex_rr) g4 = 'EXCELLENT'; else if (rr >= cfg.g4_ac_rr) g4 = 'ACCEPTABLE'; }

  const riskPctEff = cfg.risk_pct_inp;
  const riskDollarsTarget = cfg.portfolio_size * (riskPctEff / 100);
  let sharesRaw = riskPts > 0 ? riskDollarsTarget / riskPts : 0;
  let positionDollarsRaw = close > 0 ? sharesRaw * close : 0;
  const maxAllocDollars = cfg.portfolio_size * (cfg.max_alloc_pct / 100);
  if (positionDollarsRaw > maxAllocDollars) { positionDollarsRaw = maxAllocDollars; sharesRaw = close > 0 ? positionDollarsRaw / close : 0; }

  const sharesFinal = Math.max(0, Math.floor(sharesRaw));
  const finalPositionDollars = close > 0 ? sharesFinal * close : 0;
  const finalRiskDollars = riskPts > 0 ? sharesFinal * riskPts : 0;
  const portfolioPct = cfg.portfolio_size > 0 ? (finalPositionDollars / cfg.portfolio_size) * 100 : 0;
  const portfolioRiskPct = cfg.portfolio_size > 0 ? (finalRiskDollars / cfg.portfolio_size) * 100 : 0;

  return {
    stopLevel: Math.round(stopLevel * 100) / 100, stopSource, obInPlay,
    targetLevel: Math.round(targetLevel * 100) / 100, targetSrc,
    riskPts: Math.round(riskPts * 100) / 100, rewardPts: Math.round(rewardPts * 100) / 100,
    rr: rr !== null ? Math.round(rr * 100) / 100 : null,
    riskPct: Math.round(riskPct * 100) / 100, g4,
    sharesFinal, finalPositionDollars: Math.round(finalPositionDollars),
    finalRiskDollars: Math.round(finalRiskDollars),
    portfolioPct: Math.round(portfolioPct * 100) / 100,
    portfolioRiskPct: Math.round(portfolioRiskPct * 100) / 100,
  };
}
