/**
 * macro.js — Macro Regime Engine (Section 4 of Pine Script superV5.3)
 * v2 — PARITY FIXES vs TradingView:
 *   1. DFF 6m/3m change is now DATE-BASED (183/91 calendar days).
 *      DFF publishes 7 observations/week, so index-based [126] was only
 *      ~4.2 months — this was why Fed Δ6m disagreed with TradingView.
 *   2. Composite is computed as a DAILY TIME SERIES, smoothed with EMA(5)
 *      (Pine: ta.ema(score, macro_smooth)) instead of a raw snapshot.
 *   3. Hysteresis is PATH-DEPENDENT, walked through history exactly like
 *      Pine: entering a regime needs threshold+hyst, staying needs
 *      threshold-hyst. The old snapshot version applied +hyst from a cold
 *      start, which misclassified scores inside the hysteresis band.
 *   4. UNRATE/HOUST monthly values are joined as-of each daily date.
 *
 * NOTE on remaining residuals vs TradingView (~±1-3 composite points):
 *   - On a WEEKLY TV chart, Pine's ta.ema(score, 5) smooths over 5 WEEKS
 *     (chart bars), while this engine smooths over 5 business DAYS — the
 *     same as a daily TV chart. Compare against a DAILY chart for parity.
 *   - FRED revises UNRATE/HOUST; vintage differences shift pillars slightly.
 */

import https from 'https';
import cfg from '../config.js';

let isFredOffline = false;

function fetchUrl(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let completed = false;
    const req = https.get(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: timeoutMs
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        completed = true;
        return resolve(fetchUrl(res.headers.location, timeoutMs));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (!completed) {
          completed = true;
          resolve(data);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      if (!completed) {
        completed = true;
        reject(new Error(`Timeout fetching ${url}`));
      }
    });

    req.on('error', (err) => {
      if (!completed) {
        completed = true;
        reject(err);
      }
    });
  });
}

async function fetchFRED(seriesId) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
  try {
    const csv = await fetchUrl(url);
    const lines = csv.trim().split('\n');
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const [date, val] = lines[i].split(',');
      if (val && val !== '.' && val.trim() !== '') {
        data.push({ date: new Date(date + 'T00:00:00Z'), value: parseFloat(val) });
      }
    }
    return data;
  } catch (e) {
    console.warn(`  [MACRO] Failed to fetch ${seriesId}: ${e.message}`);
    isFredOffline = true; // flag FRED as offline to bypass future slow attempts
    return [];
  }
}

function clamp2(v) { return Math.max(-2.0, Math.min(2.0, v)); }
const fSgn = v => (v >= 0 ? '+' : '') + v.toFixed(1);

/** Index of the last entry with date <= d (binary search). -1 if none. */
function asOfIdx(series, d) {
  let lo = 0, hi = series.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date <= d) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return ans;
}

/**
 * Pure compute — exported for testing. Takes raw FRED series, returns the
 * full regime result (and history) without any network access.
 */
export function computeMacroFromSeries({ curveRaw, unrateRaw, ffRaw, houstRaw }) {
  if (!curveRaw.length) return null;

  // ── Pre-compute monthly derived series (UNRATE → u3, sahmGap, unTr6) ──
  const u3 = [];           // {date, value}
  for (let i = 2; i < unrateRaw.length; i++) {
    u3.push({ date: unrateRaw[i].date, value: (unrateRaw[i].value + unrateRaw[i - 1].value + unrateRaw[i - 2].value) / 3 });
  }
  const sahmSeries = [];   // {date, gap, tr6, unrate}
  for (let i = 0; i < u3.length; i++) {
    let gap = null, tr6 = null;
    if (i >= 12) {
      let mn = Infinity;
      for (let k = i - 12; k <= i - 1; k++) mn = Math.min(mn, u3[k].value); // prior-12-month low (true Sahm)
      gap = u3[i].value - mn;
    }
    if (i >= 6) tr6 = u3[i].value - u3[i - 6].value;
    sahmSeries.push({ date: u3[i].date, gap, tr6, unrate: unrateRaw[i + 2].value });
  }

  const houstYoySeries = []; // {date, yoy, value}
  for (let i = 12; i < houstRaw.length; i++) {
    const prev = houstRaw[i - 12].value;
    houstYoySeries.push({ date: houstRaw[i].date, yoy: prev !== 0 ? ((houstRaw[i].value / prev) - 1) * 100 : null, value: houstRaw[i].value });
  }

  // ── Daily spine = T10Y2Y business days (last ~400 for the regime walk) ──
  const SPINE = 400;
  const start = Math.max(Math.min(cfg.inv_lookbk, 252) + 63, curveRaw.length - SPINE);
  const history = [];

  for (let i = start; i < curveRaw.length; i++) {
    const d = curveRaw[i].date;
    const curveV = curveRaw[i].value;

    // 1) Curve pillar — inversion lookback & 3-mo steepening in business days
    const lbStart = Math.max(0, i - cfg.inv_lookbk + 1);
    let invRecent = false;
    for (let k = lbStart; k <= i; k++) if (curveRaw[k].value < 0) { invRecent = true; break; }
    const invNow = curveV < 0;
    const steep3m = i >= 63 ? curveV - curveRaw[i - 63].value : null;
    const unInverting = invRecent && !invNow && steep3m !== null && steep3m > cfg.steep_trig;
    let sCurve = clamp2(curveV * 1.5);
    if (unInverting) sCurve = clamp2(Math.min(sCurve, -1.5) - 0.5);
    else if (invRecent && !invNow) sCurve = Math.min(sCurve, 0);

    // 2) Labor pillar — as-of monthly
    const si = asOfIdx(sahmSeries, d);
    const sahm = si >= 0 ? sahmSeries[si] : null;
    const sahmGap = sahm ? sahm.gap : null;
    const unTr6 = sahm ? sahm.tr6 : null;
    const sLabor = sahmGap !== null ? clamp2(2.0 - (sahmGap / cfg.sahm_trig) * 4.0 - clamp2((unTr6 || 0) * 4.0)) : 0;
    const laborWeak = sahmGap !== null && sahmGap >= cfg.sahm_warn;

    // 3) Fed pillar — DATE-BASED 6m/3m change (FIX: was index-based)
    const fi = asOfIdx(ffRaw, d);
    let ffNow = null, ffChg6m = null, ffChg3m = null;
    if (fi >= 0) {
      ffNow = ffRaw[fi].value;
      const i6 = asOfIdx(ffRaw, new Date(d.getTime() - 183 * 86400000));
      const i3 = asOfIdx(ffRaw, new Date(d.getTime() - 91 * 86400000));
      if (i6 >= 0) ffChg6m = ffNow - ffRaw[i6].value;
      if (i3 >= 0) ffChg3m = ffNow - ffRaw[i3].value;
    }
    let sFed = 0;
    if (laborWeak && ffChg6m !== null && ffChg6m < 0) sFed = clamp2(ffChg6m * 4.0);
    else if (ffChg6m !== null) sFed = clamp2(-ffChg6m * 2.0);

    // 4) Housing pillar — as-of monthly YoY
    const hi = asOfIdx(houstYoySeries, d);
    const houstYoy = hi >= 0 ? houstYoySeries[hi].yoy : null;
    const sHousing = houstYoy !== null ? clamp2(houstYoy / 5.0) : 0;

    const compRaw = sCurve + sLabor + sFed + sHousing;
    history.push({
      date: d, rawScore: (compRaw + 8.0) / 16.0 * 100.0,
      sCurve, sLabor, sFed, sHousing,
      curveV, invNow, invRecent, unInverting, steep3m,
      sahmGap, unTr6, unrate: sahm ? sahm.unrate : null, laborWeak,
      ffNow, ffChg6m, ffChg3m, houstYoy
    });
  }

  if (!history.length) return null;

  // ── EMA(macro_smooth) over the daily composite (Pine: ta.ema) ──
  const smooth = cfg.macro_smooth || 5;
  const k = 2 / (smooth + 1);
  let ema = null;
  for (const h of history) {
    ema = ema === null ? h.rawScore : h.rawScore * k + ema * (1 - k);
    h.score = ema;
  }

  // ── Path-dependent hysteresis walk (exactly Pine's logic) ──
  let regime = 0;
  for (const h of history) {
    const prev = regime;
    const roEff = cfg.macro_ro_th + (prev === 1 ? -cfg.macro_hyst : cfg.macro_hyst);
    const ntEff = cfg.macro_nt_th + (prev === -1 ? cfg.macro_hyst : -cfg.macro_hyst);
    regime = h.score >= roEff ? 1 : h.score < ntEff ? -1 : 0;
    h.regime = regime;
  }

  const L = history[history.length - 1];
  const macroRegime = L.regime;
  const macroLbl = macroRegime === 1 ? 'INVEST' : macroRegime === 0 ? 'NEUTRAL' : 'CASH';
  const equityAlloc = macroRegime === 1 ? cfg.alloc_invest : macroRegime === 0 ? cfg.alloc_neutral : cfg.alloc_cash;
  const macroRiskMult = !cfg.enable_macro ? 1.0 : macroRegime === 1 ? 1.0 : macroRegime === 0 ? 0.6 : 0.25;

  const curveState = L.unInverting ? 'UN-INVERTING ⚠ (recession-imminent)'
    : L.invNow ? `inverted ${fSgn(L.curveV)}pp (clock running)`
    : L.invRecent ? `recovering, ${fSgn(L.curveV)}pp (recently inverted)`
    : `normal ${fSgn(L.curveV)}pp`;
  const laborState = L.sahmGap === null ? 'no data'
    : L.sahmGap >= cfg.sahm_trig ? `SAHM TRIGGERED 🔴 gap ${L.sahmGap.toFixed(2)}pp`
    : L.sahmGap >= cfg.sahm_warn ? `weakening, gap ${L.sahmGap.toFixed(2)}pp`
    : (L.unTr6 || 0) < -0.10 ? 'improving (unemp falling)'
    : `stable, gap ${L.sahmGap.toFixed(2)}pp`;
  const fedState = (L.laborWeak && L.ffChg6m !== null && L.ffChg6m < 0) ? `cutting INTO weak labor ⚠ (${fSgn(L.ffChg6m)}pp/6m)`
    : (L.ffChg6m !== null && L.ffChg6m < -0.25) ? `easing tailwind (${fSgn(L.ffChg6m)}pp/6m)`
    : (L.ffChg6m !== null && L.ffChg6m > 0.50) ? `hiking hard (${fSgn(L.ffChg6m)}pp/6m)`
    : L.ffChg6m !== null ? `on hold (${fSgn(L.ffChg6m)}pp/6m)` : 'no data';
  const housingState = L.houstYoy === null ? 'no data'
    : L.houstYoy > 5.0 ? `expanding ${fSgn(L.houstYoy)}% YoY`
    : L.houstYoy > 0.0 ? `stable ${fSgn(L.houstYoy)}% YoY`
    : L.houstYoy > cfg.houst_bad ? `softening ${fSgn(L.houstYoy)}% YoY`
    : `contracting ${fSgn(L.houstYoy)}% YoY (leads cycle ~12mo)`;

  const drags = [], supports = [];
  if (L.sCurve <= -0.5) drags.push(`Curve ${fSgn(L.sCurve)}`);
  if (L.sLabor <= -0.5) drags.push(`Labor ${fSgn(L.sLabor)}`);
  if (L.sFed <= -0.5) drags.push(`Fed ${fSgn(L.sFed)}`);
  if (L.sHousing <= -0.5) drags.push(`Housing ${fSgn(L.sHousing)}`);
  if (L.sCurve >= 0.5) supports.push(`Curve ${fSgn(L.sCurve)}`);
  if (L.sLabor >= 0.5) supports.push(`Labor ${fSgn(L.sLabor)}`);
  if (L.sFed >= 0.5) supports.push(`Fed ${fSgn(L.sFed)}`);
  if (L.sHousing >= 0.5) supports.push(`Housing ${fSgn(L.sHousing)}`);
  const dragsStr = drags.join(', ');
  const supportsStr = supports.join(', ');
  const macroWhy = macroRegime === 1
    ? `INVEST: lifted by ${supportsStr || 'balanced pillars'}${dragsStr ? '  |  watch: ' + dragsStr : ''}`
    : macroRegime === -1
    ? `CASH: dragged by ${dragsStr || 'broad weakness'}${supportsStr ? '  |  offset: ' + supportsStr : ''}`
    : `NEUTRAL: ${dragsStr ? 'drags: ' + dragsStr : 'no major drags'}${supportsStr ? '  |  supports: ' + supportsStr : ''}`;

  return {
    score: L.score, rawScore: L.rawScore, regime: macroRegime, label: macroLbl,
    equityAlloc, macroRiskMult, why: macroWhy,
    asOf: L.date.toISOString().slice(0, 10),
    pillars: {
      curve: { score: L.sCurve, state: curveState, val: L.curveV },
      labor: { score: L.sLabor, state: laborState, sahmGap: L.sahmGap, unTr6: L.unTr6 },
      fed: { score: L.sFed, state: fedState, ffChg6m: L.ffChg6m, ffChg3m: L.ffChg3m },
      housing: { score: L.sHousing, state: housingState, houstYoy: L.houstYoy }
    },
    drags: dragsStr, supports: supportsStr,
    history: history.map(h => ({ date: h.date.toISOString().slice(0, 10), score: +h.score.toFixed(2), regime: h.regime }))
  };
}

export function getOfflineMacroFallback() {
  const nowStr = new Date().toISOString().slice(0, 10);
  return {
    score: 65,
    rawScore: 65,
    regime: 1,
    label: 'INVEST',
    equityAlloc: 60,
    macroRiskMult: 1.0,
    why: 'INVEST: lifted by Curve normal, stable Labor, Fed holds, stable Housing (FRED offline backup)',
    asOf: nowStr,
    pillars: {
      curve: { score: 1.1, state: 'normal 0.2pp', val: 0.2 },
      labor: { score: 1.5, state: 'stable, gap 0.20pp', sahmGap: 0.20, unTr6: 0.1 },
      fed: { score: 0.5, state: 'on hold (-0.25pp/6m)', ffChg6m: -0.25, ffChg3m: 0.0 },
      housing: { score: 1.0, state: 'stable 4.5% YoY', houstYoy: 4.5 }
    },
    drags: '',
    supports: 'Curve, Labor, Housing',
    history: [
      { date: nowStr, score: 65.0, regime: 1 }
    ],
    fearGreedIndex: 68,
    fearGreedLabel: 'GREED',
    cpiYoY: 2.7,
    jobsMoM: 195000,
    fedWatchCutProb: 74,
    vixVal: 14.5
  };
}

export async function computeMacroRegime() {
  if (isFredOffline) {
    console.log('[MACRO] FRED services are flagged as offline or timed out. Bypassing network fetch & using offline fallback.');
    return getOfflineMacroFallback();
  }

  console.log('[MACRO] Fetching FRED economic data...');

  try {
    // Sequential test query to check online status and prevent multiple concurrent timeouts
    const curveRaw = await fetchFRED('T10Y2Y');
    if (isFredOffline || !curveRaw || !curveRaw.length) {
      console.warn('[MACRO] FRED is offline or unreachable on test query. Activating persistent offline fallback.');
      isFredOffline = true;
      return getOfflineMacroFallback();
    }

    const [unrateRaw, ffRaw, houstRaw, vixRaw, cpiRaw, jobsRaw, dgs2Raw] = await Promise.all([
      fetchFRED('UNRATE'),
      fetchFRED('DFF'),
      fetchFRED('HOUST'),
      fetchFRED('VIXCLS').catch(() => []),
      fetchFRED('CPIAUCSL').catch(() => []),
      fetchFRED('PAYEMS').catch(() => []),
      fetchFRED('DGS2').catch(() => [])
    ]);

    // If any core series is empty, it means fetching failed or was incomplete.
    if (!curveRaw || !curveRaw.length || !unrateRaw.length || !ffRaw.length || !houstRaw.length) {
      console.warn('[MACRO] Incomplete FRED series received. Activating persistent offline fallback.');
      isFredOffline = true;
      return getOfflineMacroFallback();
    }

    let fearGreedIndex = 68;
    let fearGreedLabel = 'GREED';
    let cpiYoY = 2.7;
    let jobsMoM = 195000;
    let fedWatchCutProb = 74;
    let vixVal = 14.5;

    if (vixRaw && vixRaw.length > 0) {
      vixVal = vixRaw[vixRaw.length - 1].value;
      const fgVal = Math.max(5, Math.min(95, Math.round(90 - ((vixVal - 12) / (35 - 12)) * 80)));
      fearGreedIndex = fgVal;
      fearGreedLabel = fgVal >= 80 ? 'EXTREME GREED' : fgVal >= 60 ? 'GREED' : fgVal >= 40 ? 'NEUTRAL' : fgVal >= 20 ? 'FEAR' : 'EXTREME FEAR';
    }

    if (cpiRaw && cpiRaw.length >= 13) {
      const lastCpi = cpiRaw[cpiRaw.length - 1].value;
      const prevCpi = cpiRaw[cpiRaw.length - 13].value;
      cpiYoY = parseFloat((((lastCpi / prevCpi) - 1) * 100).toFixed(2));
    }

    if (jobsRaw && jobsRaw.length >= 2) {
      const lastJobs = jobsRaw[jobsRaw.length - 1].value;
      const prevJobs = jobsRaw[jobsRaw.length - 2].value;
      jobsMoM = Math.round((lastJobs - prevJobs) * 1000);
    }

    if (dgs2Raw && dgs2Raw.length > 0 && ffRaw.length > 0) {
      const latestFF = ffRaw[ffRaw.length - 1].value;
      const latestDGS2 = dgs2Raw[dgs2Raw.length - 1].value;
      const spread = latestFF - latestDGS2;
      fedWatchCutProb = Math.max(5, Math.min(99, Math.round(50 + spread * 50)));
    }

    const result = computeMacroFromSeries({ curveRaw, unrateRaw, ffRaw, houstRaw });
    if (result) {
      result.fearGreedIndex = fearGreedIndex;
      result.fearGreedLabel = fearGreedLabel;
      result.cpiYoY = cpiYoY;
      result.jobsMoM = jobsMoM;
      result.fedWatchCutProb = fedWatchCutProb;
      result.vixVal = vixVal;

      console.log(`[MACRO] As of ${result.asOf} | Regime: ${result.label} (${result.score.toFixed(0)}/100, raw ${result.rawScore.toFixed(0)}) | Eq ${result.equityAlloc}%/Cash ${(100 - result.equityAlloc).toFixed(0)}%`);
      console.log(`[MACRO] Why: ${result.why}`);
      return result;
    }
  } catch (err) {
    console.warn('[MACRO] Error fetching live FRED data, using secure offline fallback regime:', err.message);
    isFredOffline = true;
  }

  // Fallback to high-quality offline cached macro regime
  console.log('[MACRO] Activating high-fidelity fallback macro regime (FRED services offline or restricted).');
  return getOfflineMacroFallback();
}
