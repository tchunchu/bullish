/**
 * rating.js — Combined Rating Engine (Section 8 of Pine Script)
 * MACRO × TECH matrix + modifiers → 0-5 rating
 */

import cfg from '../config.js';

export function computeRating(macro, tech, analyst, risk) {
  const macroEff = cfg.enable_macro ? (macro ? macro.regime : 1) : 1;
  const techTier = tech.techTier;

  let rating = 0;
  if (macroEff === 1) rating = techTier === 2 ? 5 : techTier === 1 ? 4 : techTier === 0 ? 3 : 1;
  else if (macroEff === 0) rating = techTier === 2 ? 4 : techTier === 1 ? 3 : techTier === 0 ? 2 : techTier === -1 ? 1 : 0;
  else rating = techTier === 2 ? 3 : techTier === 1 ? 2 : techTier === 0 ? 1 : 0;

  let ratingMods = [];

  if ((tech.breakoutReady || tech.goLong) && rating >= 3 && rating < 5) { rating += 1; ratingMods.push('+coil/breakout'); }
  if (analyst && analyst.upGrade === 'NEGATIVE' && rating > 2) { rating = 2; ratingMods.push('−capped: price > analyst target'); }
  if (analyst && analyst.upGrade === 'THIN' && rating > 3) { rating = 3; ratingMods.push('−capped: thin upside'); }
  if (rating === 5) {
    const strongUpside = analyst && analyst.upGrade === 'STRONG';
    const goodRR = risk && risk.g4 !== 'POOR';
    if (!(strongUpside && goodRR)) { rating = 4; ratingMods.push('−5★ needs strong upside + R:R'); }
  }
  if (risk && risk.g4 === 'POOR' && rating === 4) { rating = 3; ratingMods.push('−capped: R:R poor'); }

  const ratingLbl = rating === 5 ? 'STRONG BUY' : rating === 4 ? 'BUY' : rating === 3 ? 'WATCH' : rating === 2 ? 'HOLD' : rating === 1 ? 'SELL' : 'STRONG SELL';

  const macroLbl = macro ? macro.label : 'N/A';
  const macroScoreStr = macro ? Math.round(macro.score).toString() : 'N/A';
  const techRatingStr = tech.techRating.toFixed(0);
  const analystStr = analyst && analyst.analystOk ? `× Upside ${analyst.analystUp >= 0 ? '+' : ''}${analyst.analystUp}%` : '× no analyst data';
  const modsStr = ratingMods.length > 0 ? `  [${ratingMods.join(' ')}]` : '';
  const comboWhy = `Macro ${macroLbl}(${macroScoreStr}) × Tech ${tech.techLbl}(${techRatingStr}) ${analystStr}${modsStr}`;

  const starsMap = { 5: '★★★★★', 4: '★★★★☆', 3: '★★★☆☆', 2: '★★☆☆☆', 1: '★☆☆☆☆', 0: '☆☆☆☆☆' };

  return {
    rating, label: ratingLbl, stars: starsMap[rating] || '☆☆☆☆☆', comboWhy, ratingMods,
    isStrongBuy: rating === 5, isBuy: rating === 4, isWatch: rating === 3,
    isHold: rating === 2, isSell: rating <= 1,
  };
}
