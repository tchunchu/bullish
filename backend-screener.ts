import { parse } from "csv-parse/sync";
import fetch from "node-fetch";

// Dynamic import for yahoo-finance2
let yahooFinance: any;

export async function initYahooFinance() {
  if (!yahooFinance) {
    const yf = await import('yahoo-finance2');
    yahooFinance = yf.default || yf;
  }
  return yahooFinance;
}

export const DELISTED = new Set([
  "KSU","HES","PXD","MRO","PEAK","SBA","JNPR","PARA","IACI","DISH",
  "K","ATVI","SANA","NVNC","MANT","SMAR","ZI","NEP","NOVA","SQ",
  "CURO","REXNORD","HA","SAVE","IXYS","CSWI"
]);

export async function fetchWithRetryStooq(ticker: string, daysCount: number) {
  const end = new Date();
  const start = new Date(end.getTime() - daysCount * 24 * 60 * 60 * 1000);
  const t = ticker.replace('-', '').replace('.', '').toLowerCase();
  
  const d1 = start.toISOString().split('T')[0].replace(/-/g, '');
  const d2 = end.toISOString().split('T')[0].replace(/-/g, '');
  const url = `https://stooq.com/q/d/l/?s=${t}.us&d1=${d1}&d2=${d2}&i=d`;
  
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  
  if (!response.ok) return null;
  const text = await response.text();
  if (text.includes('No data')) return null;

  try {
    const records = parse(text, { columns: true, skip_empty_lines: true });
    return records.map((r: any) => ({
      date: r.Date,
      open: parseFloat(r.Open),
      high: parseFloat(r.High),
      low: parseFloat(r.Low),
      close: parseFloat(r.Close),
      volume: parseFloat(r.Volume)
    })).filter((r: any) => !isNaN(r.close));
  } catch(e) {
    return null;
  }
}

export async function fetchWithRetryYF(ticker: string, daysCount: number) {
  await initYahooFinance();
  const end = new Date();
  const start = new Date(end.getTime() - daysCount * 24 * 60 * 60 * 1000);
  try {
    const hist = await yahooFinance.historical(ticker, { period1: start, period2: end });
    return hist.map((r: any) => ({
      date: r.date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume
    }));
  } catch (e) {
    return null;
  }
}

export async function fetchOhlcv(ticker: string, daysCount: number = 420) {
  let df = await fetchWithRetryStooq(ticker, daysCount);
  if (!df || df.length < 30) {
    df = await fetchWithRetryYF(ticker, daysCount);
  }
  return df;
}

export async function fetchRtPrice(ticker: string) {
  await initYahooFinance();
  try {
    const quote = await yahooFinance.quote(ticker);
    return quote.regularMarketPrice || null;
  } catch (e) {
    return null;
  }
}

export async function fetchFund(ticker: string) {
  await initYahooFinance();
  const empty = {
    eps_ttm: null, eps_fwd: null, revenue: null, revenue_prev: null, revenue_yoy_pct: null,
    gross_profit: null, operating_income: null, net_income: null, ebitda: null, operating_cf: null,
    fcf: null, capex: null, total_debt: null, cash: null, total_equity: null, pe_trailing: null,
    pe_forward: null, pb: null, debt_to_equity: null, current_ratio: null, analyst_target: null,
    analyst_count: 0, shares_out: null, sector: null, description: null, market_cap: null
  };
  try {
    // Note: To save api calls, use quoteSummary
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: ['defaultKeyStatistics', 'financialData', 'summaryProfile']
    });
    const fd = summary.financialData || {};
    const dks = summary.defaultKeyStatistics || {};
    const sp = summary.summaryProfile || {};

    let rev = fd.totalRevenue;
    let yoy = fd.revenueGrowth ? fd.revenueGrowth * 100 : null;
    
    return {
      eps_ttm: dks.trailingEps,
      eps_fwd: dks.forwardEps,
      revenue: rev,
      revenue_prev: rev && yoy ? rev / (1 + (yoy / 100)) : null,
      revenue_yoy_pct: yoy,
      gross_profit: fd.grossProfits,
      operating_income: fd.operatingMargins ? rev * fd.operatingMargins : null,
      net_income: fd.netIncomeToCommon,
      ebitda: fd.ebitda,
      operating_cf: fd.operatingCashflow,
      fcf: fd.freeCashflow,
      capex: null,
      total_debt: fd.totalDebt,
      cash: fd.totalCash,
      total_equity: dks.bookValue,
      pe_trailing: summary.summaryDetail?.trailingPE,
      pe_forward: summary.summaryDetail?.forwardPE,
      pb: dks.priceToBook,
      debt_to_equity: fd.debtToEquity,
      current_ratio: fd.currentRatio,
      analyst_target: fd.targetMeanPrice,
      analyst_count: fd.numberOfAnalystOpinions || 0,
      shares_out: dks.sharesOutstanding,
      sector: sp.sector,
      description: sp.longBusinessSummary,
      market_cap: summary.summaryDetail?.marketCap
    };
  } catch (e) {
    return empty;
  }
}

// Math helpers
function sma(arr: number[], n: number) {
  return arr.map((_, i) => {
    if (i < n - 1) return null;
    const slice = arr.slice(i - n + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / n;
  });
}
function ema(arr: number[], n: number) {
  const k = 2 / (n + 1);
  const res: (number | null)[] = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    if (res[i - 1] === null) { res.push(arr[i]); continue; }
    res.push(arr[i] * k + res[i - 1]! * (1 - k));
  }
  return res;
}
export function getNewsSentiment(ticker: string) {
  return { score: 10, label: "🟢 BULLISH", n_recent: 5, n_relevant: 3, top_headline: "Good news expected for " + ticker, top_date: "10-10" };
}
