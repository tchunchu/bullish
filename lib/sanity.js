/**
 * sanity.js — Data Clamping and Coherence Linter
 */

function clampData(val, min, max) {
    if (val === null || isNaN(val)) return null;
    return Math.max(min, Math.min(max, val));
}

function sanityCheck(financials) {
    let flags = [];
    
    // Revenue Growth Outliers (Clamp to 200% max to prevent Yahoo artifacts)
    if (financials.revGr > 2) {
        flags.push(`WARNING: Unrealistic revenue growth reported (${(financials.revGr * 100).toFixed(1)}%). Clamped to 200%.`);
        financials.revGr = 2.0;
    }
    
    return { sanitized: financials, flags };
}

function lintReport(htmlContent, roic, wacc, rsi, valuationMeta = {}) {
    let errors = [];

    const isBullish = htmlContent.includes("RATING: BUY") || htmlContent.includes("RATING: STRONG BUY");
    const isValueDestroyer = (roic != null && wacc != null) && (roic < wacc);
    const isBearishTech = rsi != null && rsi < 30;

    // A negative spread is only a real CONTRADICTION if there is no structural
    // reason (finance arm / goodwill) explaining it. valuationMeta carries the
    // regime + artifactFlag from computeValuation().
    const hasStructuralReason = valuationMeta.regime &&
        (valuationMeta.regime.isFinanceHeavy || valuationMeta.regime.isGoodwillHeavy);

    if (isBullish && isValueDestroyer && !hasStructuralReason) {
        errors.push("COHERENCE ERROR: BUY rating but ROIC < WACC (value destroyer) with no structural explanation. Reconcile the thesis or the math before publishing.");
    } else if (isBullish && isValueDestroyer && hasStructuralReason) {
        errors.push("VERIFY: ROIC < WACC on naive basis, but a capital-structure artifact (captive finance or goodwill) is likely. Confirm with the adjusted ROIC (" + (valuationMeta.roicAdjusted ?? 'n/a') + "%) before relying on the spread.");
    }

    if (isBullish && isBearishTech) {
        errors.push("COHERENCE WARNING: BUY rating on extremely oversold technicals (RSI < 30) — possible falling knife. Confirm entry timing.");
    }

    return errors;
}

module.exports = { clampData, sanityCheck, lintReport };
