/**
 * analyst.js — Fetch analyst target prices and recommendations from Yahoo Finance
 */

import yahooFinance from 'yahoo-finance2';
import cfg from '../config.js';

const yf = new yahooFinance({ suppressNotices: ['yahooSurvey'] });

export async function fetchAnalystData(sym) {
  try {
    const qs = await yf.quoteSummary(sym, {
      modules: ['financialData', 'recommendationTrend']
    }).catch(() => null);

    if (!qs || !qs.financialData) return null;

    const fd = qs.financialData;
    const currentPrice = fd.currentPrice || fd.regularMarketPrice;
    const tgtMean = fd.targetMeanPrice;
    const tgtHigh = fd.targetHighPrice;
    const tgtLow = fd.targetLowPrice;

    let sb = 0, b = 0, h = 0, s = 0, ss = 0;
    if (qs.recommendationTrend && qs.recommendationTrend.trend && qs.recommendationTrend.trend.length > 0) {
      const rec = qs.recommendationTrend.trend[0];
      sb = rec.strongBuy || 0;
      b = rec.buy || 0;
      h = rec.hold || 0;
      s = rec.sell || 0;
      ss = rec.strongSell || 0;
    }

    const analystN = sb + b + h + s + ss;
    const tgtIsMean = tgtMean != null && tgtMean > 0;
    const tgtRaw = tgtMean;
    let analystTgt = null, analystOk = false;
    if (tgtRaw && currentPrice && tgtRaw > currentPrice * 0.30 && tgtRaw < currentPrice * 3.0) {
      analystTgt = tgtRaw;
      analystOk = true;
    }
    const analystUp = analystOk && currentPrice ? ((analystTgt / currentPrice) - 1) * 100 : null;

    let upGrade = 'NO DATA';
    if (analystUp !== null) {
      if (analystUp >= cfg.up_strong) upGrade = 'STRONG';
      else if (analystUp >= cfg.up_ok) upGrade = 'OK';
      else if (analystUp >= -5.0) upGrade = 'THIN';
      else upGrade = 'NEGATIVE';
    }

    return { tgtMean: tgtRaw, tgtHigh, tgtLow, analystN, sb, b, h, s, ss, analystTgt, analystOk, analystUp: analystUp !== null ? Math.round(analystUp * 100) / 100 : null, upGrade, tgtIsMean, currentPrice };
  } catch (e) {
    return null;
  }
}
