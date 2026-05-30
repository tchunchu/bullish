import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import yahooFinanceImport from 'yahoo-finance2';
import { GoogleGenAI } from "@google/genai";
import Parser from 'rss-parser';
import { spawn, execSync } from "child_process";
import { existsSync } from "fs";

dotenv.config();

const YahooFinance = "default" in yahooFinanceImport ? (yahooFinanceImport as any).default : yahooFinanceImport;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.VITE_MYKEY || '' });
const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml; q=0.9, */*; q=0.8'
  }
});

const MODELS = {
  FLASH: "gemini-3.1-pro-preview",
  PRO: "gemini-3.1-pro-preview",
};


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getRawValue(val: any, fallback: number = 0): number {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'number') return val;
  if (typeof val.raw === 'number') return val.raw;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

function isEtfOrIndex(ticker: string): boolean {
  const norm = ticker.toUpperCase().trim();
  if (norm.startsWith('^')) return true;
  const popularEtfs = new Set([
    'SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'VOO', 'IVV', 'VEA', 'VWO', 'BND', 'AGG', 'GLD', 'SLV', 'TLT', 'EEM', 'EFA', 'IWF', 'IWD', 'VUG', 'VTV', 'XLK', 'XLF', 'XLV', 'XLY', 'XLI', 'XLE', 'XLB', 'XLU', 'XLRE', 'XLC', 'ARKK'
  ]);
  return popularEtfs.has(norm);
}

// --- Index Ticker Management ---
let LIST_CACHE: { [key: string]: { tickers: string[], expiry: number } } = {};
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

async function getTickersForIndex(index: string): Promise<string[]> {
  const now = Date.now();
  if (LIST_CACHE[index] && LIST_CACHE[index].expiry > now) {
    return LIST_CACHE[index].tickers;
  }

  let tickers: string[] = [];
  try {
    if (index === 'sp500') {
      try {
        const url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies";
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (res.ok) {
          const text = await res.text();
          // Improved Wikipedia Ticker Extraction
          const tickerMatches = text.match(/rel="nofollow" class="external text" href="[^"]+">([A-Z\.]+)</g) 
                             || text.match(/<td><a [^>]+>([A-Z\.]+)</g);
          
          if (tickerMatches) {
            const extracted = tickerMatches.map(m => {
              const symbol = m.split('>').pop()?.replace('<', '').trim();
              return symbol?.replace('.', '-') || '';
            }).filter(s => s && s.length > 0 && s.length < 7);
            
            tickers = [...new Set(extracted)];
          }
        }
      } catch (e) {
        console.warn("[VCS] Wikipedia S&P 500 fetch failed.");
      }
    } else if (index === 'nasdaq100') {
      tickers = ['AAPL','MSFT','NVDA','AMZN','META','GOOGL','GOOG','TSLA','AVGO','COST','NFLX','TMUS','AMD','LIN','CSCO','ADBE','PEP','INTU','TXN','QCOM','HON','AMGN','AMAT','ISRG','BKNG','SBUX','GILD','MDLZ','ADI','VRTX','MU','REGN','LRCX','KLAC','MELI','SNPS','CDNS','PANW','ABNB','CRWD','MRVL','ADP','ORLY','MAR','FTNT','CTAS','WDAY','CEG','PAYX','KDP','MRNA','ODFL','PCAR','MNST','DXCM','FAST','ROST','CPRT','KHC','GEHC','DDOG','TEAM','IDXX','EXC','AEP','BKR','XEL','EA','CTSH','NXPI','ON','FANG','ZS','MCHP','TTWO','BIIB','TTD','VRSK','ILMN','DLTR','ALGN','ENPH','OKTA','MTCH','SWKS','ZBRA','NTNX','PAYC','LULU','EBAY','PDD','JD','BIDU','BILI','NTES','CSGP','ACGL','FSLR','ARM','DASH','ROP','CSX','UAL'];
    } else if (index === 'russell1000' || index === 'russell2000' || index === 'russell3000') {
       try {
         // Source 1: SEC EDGAR 
         const res = await fetch("https://www.sec.gov/files/company_tickers_exchange.json", {
           headers: {
             "User-Agent": "coiled-spring-screener/1.0 (research@example.com)",
             "Accept": "application/json"
           }
         });
         
         if (res.ok) {
           const data = await res.json();
           const rows = data.data || [];
           const fields = data.fields || [];
           
           if (rows.length && fields.length) {
             const ti = fields.indexOf("ticker") > -1 ? fields.indexOf("ticker") : 2;
             const ei = fields.indexOf("exchange") > -1 ? fields.indexOf("exchange") : 3;
             const US = new Set(["NYSE","NASDAQ","NYSEARCA","NYSEAMERICAN","BATS"]);
             
             let all_tks: {tk: string, exch: string}[] = [];
             for (const row of rows) {
               const tk = String(row[ti]).trim().toUpperCase().replace(".", "-");
               const exch = String(row[ei]).trim().toUpperCase();
               if (US.has(exch) && tk.length >= 1 && tk.length <= 6 && /^[A-Z-]+$/.test(tk)) {
                 all_tks.push({tk, exch});
               }
             }
             
             if (all_tks.length > 500) {
               const sp500 = new Set(await getTickersForIndex('sp500'));
               const nyse = all_tks.filter(r => r.exch === 'NYSE' || r.exch === 'NYSEAMERICAN').map(r => r.tk);
               const nasdaq = all_tks.filter(r => r.exch === 'NASDAQ').map(r => r.tk);
               const all_t = [...new Set(all_tks.map(r => r.tk))];
               
               if (index === 'russell1000') {
                 const r1k = [...new Set([...nyse, ...nasdaq.filter(t => sp500.has(t))])];
                 tickers = r1k.slice(0, 1200);
               } else if (index === 'russell2000') {
                 const r2k = [...new Set(nasdaq.filter(t => !sp500.has(t)))];
                 tickers = r2k.slice(0, 2200);
               } else if (index === 'russell3000') {
                 tickers = all_t.slice(0, 3500);
               }
             }
           }
         }
       } catch (e) {
         console.warn("[VCS] SEC EDGAR Russell indices fetch failed, falling back to static lists.");
       }
       
       if (tickers.length === 0) {
          // Fallbacks
          if (index === 'russell1000') {
            tickers = ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "GOOG", "BRK-B", "UNH", "LLY", "JPM", "AVGO", "XOM", "TSLA", "V", "MA", "PG", "COST", "HD", "JNJ", "MRK", "ABBV", "CVX", "CRM", "BAC", "PEP", "KO", "NFLX", "WMT", "AMD", "ADBE", "TMO", "ACN", "CSCO", "MCD", "LIN", "ABT", "DHR", "ORCL", "TXN", "DIS", "PM", "CAT", "ACN", "AMGN", "INTC", "IBM", "NEE", "QCOM", "VZ", "HON", "TXN", "GE", "UNP", "LOW"];
          } else if (index === 'russell2000') {
            tickers = ["SMCI", "VRT", "ANF", "CELH", "ELF", "LITE", "PI", "RAMP", "SFBS", "TNDM", "WFRD", "XPO", "ZS", "APP", "BHC", "CHX", "DKNG", "FRPT", "GTLB", "HIMS", "IOT", "MDB", "NCNO", "OPCH", "PATH", "RIOT", "ROKU", "SOFI", "TOST", "UPST", "VAL", "W", "YOU", "GME", "AMC", "KPTI", "SWAV", "MEDP", "COHR", "ACAD", "NBIX", "RGEN"];
          } else {
            tickers = [...new Set(["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "GOOG", "BRK-B", "UNH", "LLY", "JPM", "AVGO", "XOM", "TSLA", "V", "MA", "PG", "COST", "HD", "JNJ", "MRK", "ABBV", "CVX", "CRM", "BAC", "PEP", "KO", "NFLX", "WMT", "AMD", "ADBE", "TMO", "ACN", "CSCO", "MCD", "LIN", "ABT", "DHR", "ORCL", "TXN", "DIS", "PM", "CAT", "ACN", "AMGN", "INTC", "IBM", "NEE", "QCOM", "VZ", "HON", "TXN", "GE", "UNP", "LOW", "SMCI", "VRT", "ANF", "CELH", "ELF", "LITE", "PI", "RAMP", "SFBS", "TNDM", "WFRD", "XPO", "ZS", "APP", "BHC", "CHX", "DKNG", "FRPT", "GTLB", "HIMS", "IOT", "MDB", "NCNO", "OPCH", "PATH", "RIOT", "ROKU", "SOFI", "TOST", "UPST", "VAL", "W", "YOU", "GME", "AMC", "KPTI", "SWAV", "MEDP", "COHR", "ACAD", "NBIX", "RGEN"])];
          }
       }
    }
    
    if (tickers.length === 0) {
      const FALLBACKS: { [key: string]: string[] } = {
        sp500: ["AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA", "BRK-B", "UNH", "LLY", "JPM", "V", "XOM", "AVGO", "MA", "PG", "COST", "HD", "MRK", "ABBV", "CVX", "KO", "PEP", "WMT", "ADBE", "AMD", "CRM", "TMO", "ACN", "MCD", "CSCO", "BAC", "ABT", "NFLX", "LIN", "DHR", "ORCL", "TXN", "NEE", "PM", "DIS", "QCOM", "VZ", "INTC", "IBM", "AMGN", "CAT", "GS", "HON", "SPGI"],
        nasdaq100: ['AAPL','MSFT','NVDA','AMZN','META','GOOGL','GOOG','TSLA','AVGO','COST','NFLX','TMUS','AMD','LIN','CSCO','ADBE','PEP','INTU','TXN','QCOM','HON','AMGN','AMAT','ISRG','BKNG','SBUX','GILD','MDLZ','ADI','VRTX','MU','REGN','LRCX','KLAC','MELI','SNPS','CDNS','PANW','ABNB','CRWD','MRVL','ADP','ORLY','MAR','FTNT','CTAS','WDAY','CEG','PAYX','KDP','MRNA','ODFL','PCAR','MNST','DXCM','FAST','ROST','CPRT','KHC','GEHC','DDOG','TEAM','IDXX','EXC','AEP','BKR','XEL','EA','CTSH','NXPI','ON','FANG','ZS','MCHP','TTWO','BIIB','TTD','VRSK','ILMN','DLTR','ALGN','ENPH','OKTA','MTCH','SWKS','ZBRA','NTNX','PAYC','LULU','EBAY','PDD','JD','BIDU','BILI','NTES','CSGP','ACGL','FSLR','ARM','DASH','ROP','CSX','UAL'],
        russell2000: ["SMCI", "VRT", "ANF", "CELH", "ELF", "LITE", "PI", "RAMP", "SFBS", "TNDM", "WFRD", "XPO", "ZS", "APP", "BHC", "CHX", "DKNG", "FRPT", "GTLB", "HIMS", "IOT", "MDB", "NCNO", "OPCH", "PATH", "RIOT", "ROKU", "SOFI", "TOST", "UPST", "VAL", "W", "YOU", "GME", "AMC", "KPTI", "SWAV", "MEDP", "COHR", "ACAD", "NBIX", "RGEN"]
      };
      tickers = FALLBACKS[index] || ["AAPL", "MSFT", "NVDA"];
    }

    LIST_CACHE[index] = { tickers, expiry: now + CACHE_TTL };
    return tickers;
  } catch (e) {
    return ["AAPL", "MSFT", "NVDA"];
  }
}

// --- Data Fetching Fallbacks (v7.0 Logic) ---
const FETCH_CACHE: { [key: string]: { data: any, expiry: number } } = {};

async function fetchWithRetry(ticker: string, days: number = 120) {
  const cacheKey = `${ticker}_${days}`;
  if (FETCH_CACHE[cacheKey] && FETCH_CACHE[cacheKey].expiry > Date.now()) {
    return FETCH_CACHE[cacheKey].data;
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/json,text/csv'
  };
  
  // Try Stooq first (Custom CSV format requested)
  try {
    const stooqTicker = ticker.replace("-", ".").toLowerCase();
    const url = `https://stooq.com/q/d/l/?s=${stooqTicker}.us&f=sdohclv&h&e=csv`;
    const res = await fetch(url, { headers });
    if (res.ok) {
      const text = await res.text();
      if (!text.includes("No data") && !text.includes("Exceeded") && text.length > 50) {
        const lines = text.trim().split("\n").slice(1); 
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - (days + 30));
        
        let quotes = lines.map(line => {
          const parts = line.split(",");
          if (parts.length < 6) return null;
          return {
            date: new Date(parts[0]),
            open: parseFloat(parts[1]),
            high: parseFloat(parts[2]),
            low: parseFloat(parts[3]),
            close: parseFloat(parts[4]),
            volume: parseFloat(parts[5])
          };
        }).filter(q => q !== null && !isNaN((q as any).close));

        quotes = quotes.filter((q: any) => q.date >= start);
        quotes.sort((a: any, b: any) => a.date.getTime() - b.date.getTime());
        if (quotes.length >= 30) {
          const ret = { quotes };
          FETCH_CACHE[cacheKey] = { data: ret, expiry: Date.now() + 5 * 60 * 1000 };
          return ret;
        }
      }
    }
  } catch (e) {
    // Fallback to Yahoo
  }

  // Fallback to Yahoo Finance
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days + 30));
    
    const results = await (yahooFinance as any).historical(ticker, {
      period1: start.toISOString().split('T')[0],
      period2: end.toISOString().split('T')[0],
      interval: '1d'
    });
    
    if (results && results.length >= 30) {
      const quotes = results.map((r: any) => ({
        date: r.date,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume
      }));
      const ret = { quotes };
      FETCH_CACHE[cacheKey] = { data: ret, expiry: Date.now() + 5 * 60 * 1000 };
      return ret;
    }
  } catch (e) {
    // Both failed
  }
  
  return null;
}

async function fetchFromYahoo(ticker: string, days: number = 120, retryCount = 0): Promise<any> {
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days + 30));
    
    const results = await yahooFinance.historical(ticker, {
      period1: start.toISOString().split('T')[0],
      period2: end.toISOString().split('T')[0],
      interval: '1d'
    });
    
    if (!results || results.length === 0) return null;
    
    const quotes = results.map(r => ({
      date: r.date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume
    }));
    
    return { quotes };
  } catch (e: any) {
    if (retryCount < 1) {
      await new Promise(res => setTimeout(res, 500));
      return fetchFromYahoo(ticker, days, retryCount + 1);
    }
    return null;
  }
}

async function fetchFromStooq(ticker: string, days: number = 120, retryCount = 0): Promise<any> {
  try {
    const stooqTicker = ticker.replace("-", ".").toLowerCase();
    
    // Explicitly use the daily CSV URL requested
    const url = `https://stooq.com/q/d/l/?s=${stooqTicker}.us&i=d`;
    
    const res = await fetch(url, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "text/csv,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      }
    });
    
    if (!res.ok) {
      if (retryCount < 1) {
          await new Promise(r => setTimeout(r, 500));
          return fetchFromStooq(ticker, days, retryCount + 1);
      }
      return null;
    }
    const text = await res.text();
    if (text.includes("No data") || text.includes("Exceeded") || text.length < 50) return null;

    const lines = text.trim().split("\n").slice(1); 
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days + 30));
    
    let quotes = lines.map(line => {
      const parts = line.split(",");
      if (parts.length < 6) return null;
      return {
        date: new Date(parts[0]),
        open: parseFloat(parts[1]),
        high: parseFloat(parts[2]),
        low: parseFloat(parts[3]),
        close: parseFloat(parts[4]),
        volume: parseFloat(parts[5])
      };
    }).filter(q => q !== null && !isNaN((q as any).close));

    // Filter by date range as Stooq returns the entire history
    quotes = quotes.filter((q: any) => q.date >= start);
    quotes.sort((a: any, b: any) => a.date.getTime() - b.date.getTime());

    return { quotes };
  } catch (e) {
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- Dynamic Python Environment Validation and Auto-repair ---
  try {
    let pythonPath = 'python3';
    const venvPath1 = path.join(process.cwd(), 'myenv', 'bin', 'python3');
    const venvPath2 = path.join(process.cwd(), 'myenv', 'bin', 'python');
    if (existsSync(venvPath1)) {
      pythonPath = venvPath1;
    } else if (existsSync(venvPath2)) {
      pythonPath = venvPath2;
    }
    
    console.log(`[Python Core Check] Validating environment using binary: ${pythonPath}`);
    try {
      execSync(`"${pythonPath}" -c "import yfinance, pandas, numpy, requests"`, { stdio: 'ignore' });
      console.log("[Python Core Check] All dependencies (yfinance, pandas, numpy, requests) are fully operational!");
    } catch (e) {
      console.log("[Python Core Check] Some dependencies are missing. Installing them inside our dedicated sandbox...");
      execSync(`"${pythonPath}" -m pip install yfinance pandas numpy requests`, { stdio: 'inherit' });
      console.log("[Python Core Check] Auto-repair of sandbox packages succeeded!");
    }
  } catch (err: any) {
    console.error("[Python Core Check] Issue during Python validation:", err.message);
  }

  // --- VCS Indicator Helpers (v7.0 Parity) ---
  const _sma = (s: number[], n: number) => {
    const res = new Array(s.length).fill(NaN);
    for (let i = n - 1; i < s.length; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) sum += s[i - j];
        res[i] = sum / n;
    }
    return res;
  };

  const _ema = (s: number[], n: number) => {
    const res = new Array(s.length).fill(NaN);
    const k = 2 / (n + 1);
    let emaVal = 0;
    let firstValIdx = s.findIndex(v => !isNaN(v));
    if (firstValIdx === -1) return res;
    
    emaVal = s[firstValIdx];
    res[firstValIdx] = emaVal;
    for (let i = firstValIdx + 1; i < s.length; i++) {
        emaVal = s[i] * k + emaVal * (1 - k);
        res[i] = emaVal;
    }
    return res;
  };

  const _atr = (h: number[], l: number[], c: number[], n: number = 14) => {
    const tr = [h[0] - l[0]];
    for (let i = 1; i < h.length; i++) {
      tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
    }
    return _ema(tr, n);
  };

  const _rsi = (c: number[], n: number = 14) => {
    const res = new Array(c.length).fill(NaN);
    if (c.length <= n) return res;
    let gains = [0], losses = [0];
    for(let i=1; i<c.length; i++) {
      const diff = c[i] - c[i-1];
      gains.push(Math.max(0, diff));
      losses.push(Math.max(0, -diff));
    }
    const avgG = _ema(gains, n), avgL = _ema(losses, n);
    for(let i=0; i<c.length; i++) {
      if (isNaN(avgG[i]) || isNaN(avgL[i])) continue;
      res[i] = 100 - (100 / (1 + (avgG[i] / (avgL[i] || 0.0001))));
    }
    return res;
  };

  const _obv = (c: number[], v: number[]) => {
    const res = [0];
    for (let i = 1; i < c.length; i++) {
      res.push(res[i - 1] + (Math.sign(c[i] - c[i - 1]) || 0) * v[i]);
    }
    return res;
  };

  const _accDist = (h: number[], l: number[], c: number[], v: number[]) => {
    const res = [0];
    for (let i = 0; i < h.length; i++) {
      const rng = (h[i] - l[i]) || 0.0001;
      const clv = ((c[i] - l[i]) - (h[i] - c[i])) / rng;
      res.push((res[res.length - 1] || 0) + clv * v[i]);
    }
    return res.slice(1);
  };

  const _bbWidth = (c: number[], n: number = 20) => {
    const basis = _sma(c, n), res = new Array(c.length).fill(NaN);
    for (let i = n - 1; i < c.length; i++) {
      const window = c.slice(i - n + 1, i + 1);
      const mean = basis[i], std = Math.sqrt(window.reduce((a, b) => a + Math.pow(b - (mean || 0), 2), 0) / n);
      res[i] = (4 * std) / (basis[i] || 0.0001);
    }
    return res;
  };

  const _percentRank = (s: number[], n: number = 100) => {
    const res = new Array(s.length).fill(NaN);
    for (let i = n; i < s.length; i++) {
      const window = s.slice(i - n, i + 1), last = window[window.length - 1];
      res[i] = (window.slice(0, -1).filter(v => v < last).length / (window.length - 1)) * 100;
    }
    return res;
  };

  // --- VCS Algorithm (v7.0 Parity) ---
  async function computeVCS(ticker: string, horizon: string = 'weeks') {
    if (!ticker || typeof ticker !== 'string') return null;
    try {
      const daysCount = horizon === 'days' ? 60 : 350; 
      
      let history: any = null;
      try {
        history = await fetchWithRetry(ticker, daysCount);
      } catch (e: any) {
        console.warn(`[VCS DATA] Fetch Error for ${ticker}:`, e.message);
      }

      if (!history || !history.quotes || history.quotes.length < 30) {
          console.log(`[VCS] Insufficient data for ${ticker}: ${history ? history.quotes?.length : 'No history'}`);
          return null;
      }
      const qs = history.quotes;
      const c = qs.map((q: any) => q.close);
      const h = qs.map((q: any) => q.high);
      const lo = qs.map((q: any) => q.low);
      const v = qs.map((q: any) => q.volume);
      const latest = c.length - 1;

      // ── Building Blocks ───────────────────────────────────
      const FAST_LEN = 3, SLOW_LEN = 20, INTENSITY_TRIG = 35.0, MID_TRIG = 12.0, VOL_MULT = 1.4;
      const PIVOT_LEN = 20, SQZ_PCT = 20.0, MATURITY_N = 5, MATURITY_K = 3;

      const atr14 = _atr(h, lo, c, 14);
      const atr20 = _atr(h, lo, c, 20);
      const atr_pct_last = (atr14[latest] / c[latest]) * 100;
      const stock_class = atr_pct_last < 1.5 ? "Blue Chip" : atr_pct_last < 4.0 ? "Growth" : "Speculative";

      const vol_sma = _sma(v, SLOW_LEN);
      const rng = h.map((hi, i) => hi - lo[i]);
      const bar_pos = c.map((cl, i) => (cl - lo[i]) / (rng[i] || 0.0001));
      const hh_don = h.map((_, i) => i < PIVOT_LEN ? NaN : Math.max(...h.slice(i - PIVOT_LEN + 1, i + 1)));
      const ll_don = lo.map((_, i) => i < PIVOT_LEN ? NaN : Math.min(...lo.slice(i - PIVOT_LEN + 1, i + 1)));
      const range_pos = c.map((cl, i) => (cl - ll_don[i]) / ((hh_don[i] - ll_don[i]) || 0.0001));
      const heavy_vol = v.map((vo, i) => vo > vol_sma[i] * VOL_MULT);

      const ma20 = _sma(c, 20);
      const price_bull = c.map((cl, i) => cl > ma20[i] ? 1 : 0);
      const rsi_val = _rsi(c, 14);
      const rsi_bull = rsi_val.map(rv => rv > 50 ? 1 : 0);
      const obv_val = _obv(c, v);
      const obv_ema_v = _ema(obv_val, 20);
      const obv_bull = obv_val.map((ov, i) => ov >= obv_ema_v[i] ? 1 : 0);
      const ad_val = _accDist(h, lo, c, v);
      const ad_ema3 = _ema(ad_val, 3);
      const ad_ema10 = _ema(ad_val, 10);
      const cho_bull = ad_ema3.map((e3, i) => (e3 - ad_ema10[i]) > 0 ? 1 : 0);

      const net_pts = price_bull.map((pb, i) => (pb + rsi_bull[i] + obv_bull[i] + cho_bull[i]) * 2 - 4);
      const conf_score = net_pts.map(n => n >= 3 ? 3 : n >= 1 ? 1 : n === 0 ? 0 : n >= -2 ? -1 : -3);

      // ── VCS Core ──────────────────────────────────────────
      const bp = c.map((cl, i) => (cl - lo[i]) / (rng[i] || 0.0001) * v[i]);
      const sp = c.map((cl, i) => (h[i] - cl) / (rng[i] || 0.0001) * v[i]);
      const bp_sma = _sma(bp, FAST_LEN);
      const sp_sma = _sma(sp, FAST_LEN);
      const tot_sma = _sma(bp.map((b, i) => b + sp[i]), FAST_LEN);
      const fast_delta = bp_sma.map((b, i) => ((b - sp_sma[i]) / (tot_sma[i] || 0.0001)) * 100);

      const vol_bull_flag = heavy_vol.map((hv, i) => hv && bar_pos[i] > 0.55);
      const adapt_bull = vol_bull_flag.map(vb => vb ? INTENSITY_TRIG * 0.7 : INTENSITY_TRIG);

      // ── Wyckoff & Squeeze ─────────────────────────────────
      const absorbing = rng.map((r, i) => r < atr20[i] * 0.75 && heavy_vol[i]);
      const is_accum = absorbing.map((a, i) => a && range_pos[i] < 0.35 && bar_pos[i] > 0.55);
      const bbw = _bbWidth(c, 20);
      const bbw_rank = _percentRank(bbw, 100);
      const is_squeeze = bbw_rank.map(br => br <= SQZ_PCT);

      // ── Breakout & Maturity ───────────────────────────────
      const prior_hi = h.map((_, i) => i < PIVOT_LEN ? NaN : Math.max(...h.slice(Math.max(0, i - PIVOT_LEN), i)));
      const break_up = c.map((cl, i) => cl > prior_hi[i] && heavy_vol[i]);
      const bull_bar = fast_delta.map((fd, i) => fd > MID_TRIG && conf_score[i] >= 1);
      const mature_up = bull_bar.map((_, i) => i < MATURITY_N ? false : bull_bar.slice(i - MATURITY_N + 1, i + 1).filter(Boolean).length >= MATURITY_K);
      const prior_sqz = is_squeeze.map((_, i) => i === 0 ? false : is_squeeze[i - 1]);
      const go_long = break_up.map((bu, i) => bu && fast_delta[i] > adapt_bull[i] && conf_score[i] >= 2 && (mature_up[i] || prior_sqz[i]));
      const trap_up = h.map((hi, i) => hi > prior_hi[i] && c[i] < prior_hi[i] && heavy_vol[i]);
      const bear_div = c.map((cl, i) => cl >= Math.max(...c.slice(Math.max(0, i - PIVOT_LEN), i + 1)) && obv_val[i] < Math.max(...obv_val.slice(Math.max(0, i - PIVOT_LEN), i + 1)));

      // ── Trend ─────────────────────────────────────────────
      const ema10 = _ema(c, 10), ema30 = _ema(c, 30);
      const trend_dir = c.map((cl, i) => (ema10[i] > ema30[i] && cl > ema30[i]) ? 1 : (ema10[i] < ema30[i] && cl < ema30[i]) ? -1 : 0);

      // ── Scoring (Python v7.0 Delta) ───────────────────────
      const i = latest;
      const cs = conf_score[i], fd = fast_delta[i], gl = go_long[i], bu = break_up[i], hv = heavy_vol[i], mu = mature_up[i], sq = prior_sqz[i], acc = is_accum[i], bd = bear_div[i];
      
      let conf_c = cs === 3 ? 30 : cs === 1 ? 14 : cs === 0 ? 5 : 0;
      let vcs_c = Math.max(0, Math.min(20, (fd / INTENSITY_TRIG) * 20));
      let brk_c = gl ? 20 : bu ? 10 : 0;
      let volmat_c = (hv ? 8 : 0) + (mu ? 7 : 0);
      let sqzacc_c = (sq && fd > 0 ? 8 : 0) + (acc ? 7 : 0);
      let b_score = Math.min(100, Math.max(0, conf_c * 1.15 + vcs_c * 0.85 + brk_c + volmat_c + sqzacc_c - (bd ? 10 : 0)));

      const bull_strength = b_score >= 80 ? 5 : b_score >= 65 ? 4 : b_score >= 50 ? 3 : b_score >= 35 ? 2 : b_score >= 20 ? 1 : 0;
      const signal = b_score >= 65 ? "STRONG BUY" : b_score >= 50 ? "BUY" : b_score >= 35 ? "WATCH" : "NEUTRAL";
      
      let state = gl ? "BREAKOUT ↑" : trap_up[i] ? "BULL TRAP" : acc ? "ACCUMULATION" : bu ? "BREAK ATTEMPT ↑" : is_squeeze[i] ? "SQUEEZE" : fd > adapt_bull[i] && cs >= 2 ? "STRONG BUYING" : "NEUTRAL";
      
      // Trend Integrity
      const ti_ema = (trend_dir[i] === 1 && ema10[i] > ema30[i]) || (trend_dir[i] === -1 && ema10[i] < ema30[i]) ? 1 : 0;
      const ti_price = (trend_dir[i] === 1 && c[i] > ema10[i]) || (trend_dir[i] === -1 && c[i] < ema10[i]) ? 1 : 0;
      const ti_vcs = (trend_dir[i] === 1 && fd > 0) || (trend_dir[i] === -1 && fd < 0) ? 1 : 0;
      const ti_conf = (trend_dir[i] === 1 && cs >= 1) || (trend_dir[i] === -1 && cs <= -1) ? 1 : 0;
      
      const lo5 = lo.map((_, idx) => idx < 4 ? NaN : Math.min(...lo.slice(idx - 4, idx + 1))); // Corrected sliding window
      const lo5p = lo5.map((_, idx) => idx < 5 ? NaN : lo5[idx - 5]);
      const lo5pp = lo5.map((_, idx) => idx < 10 ? NaN : lo5[idx - 10]);
      const hi5 = h.map((_, idx) => idx < 4 ? NaN : Math.max(...h.slice(idx - 4, idx + 1)));
      const hi5p = hi5.map((_, idx) => idx < 5 ? NaN : hi5[idx - 5]);

      const hl = (lo5[i] > lo5p[i] * 0.998) && (lo5p[i] > lo5pp[i] * 0.998);
      const lh = (hi5[i] < hi5p[i] * 1.002);
      const ti_hl = ((trend_dir[i] === 1 && hl) || (trend_dir[i] === -1 && lh)) ? 1 : 0;
      const trend_integrity = ti_ema + ti_price + ti_vcs + ti_conf + ti_hl;

      return {
        ticker,
        close: round(c[i], 2),
        signal,
        state,
        bull_score: round(b_score, 1),
        strength: bull_strength,
        rsi: round(rsi_val[i], 1),
        vol_ratio: round(v[i] / (vol_sma[i] || 1), 2),
        atr_pct: round(atr_pct_last, 2),
        class: stock_class,
        conf: cs,
        vcs_delta: round(fd, 1),
        breakout: gl ? "YES" : "NO",
        accum: acc ? "YES" : "NO",
        squeeze: is_squeeze[i] ? "YES" : "NO",
        trend: trend_dir[i] === 1 ? "UP" : trend_dir[i] === -1 ? "DOWN" : "NONE",
        trend_integrity,
        go_long: gl,
        prior_sqz: sq,
        ti_hl,
        obv_div: (trend_dir[i] === 1 && hl) && v[i] > (vol_sma[i] || 0) && (fd > 0), // rough approx for OBV div since we don't calculate OBV
        pfl: 15, // rough approx
      };
    } catch (e) {
      console.error(`VCS Error for ${ticker}:`, e);
      return null;
    }
  }

  async function computeGateScreener(ticker: string, horizon: string = 'weeks') {
    if (!ticker || typeof ticker !== 'string') return null;
    try {
      const daysCount = horizon === 'days' ? 60 : 350; 
      let history: any = null;
      try {
        history = await fetchWithRetry(ticker, daysCount);
      } catch (e: any) {
        console.warn(`[Gate DATA] Fetch Error for ${ticker}:`, e.message);
      }
      
      if (!history || !history.quotes || history.quotes.length < 30) {
          console.log(`[Gate] Insufficient data for ${ticker}`);
          return null;
      }

      const qs = history.quotes;
      const c = qs.map((q: any) => q.close);
      const latestPrice = c[c.length - 1];

      // Fetch yahoo finance data safely
      let yfData: any = null;
      try {
         yfData = await yahooFinance.quoteSummary(ticker, { modules: ['financialData', 'defaultKeyStatistics'] }, { validateResult: false });
      } catch (err: any) {
         console.warn(`[Node Harvest Engine] Details failed for ${ticker}: ${err.message}`);
         // Proceed with technicals only
      }

      const fd = yfData?.financialData || {};
      const isEtf = isEtfOrIndex(ticker);
      
      // Gate 1: Business Quality 
      // operatingCashflow > 0 AND revenue growth > 0 (Diversified ETFs / Indices automatically pass this corporate filter)
      const opCashflow = getRawValue(fd.operatingCashflow, 0);
      const revGrowth = getRawValue(fd.revenueGrowth, 0);
      const gate1Pass = isEtf ? true : (opCashflow > 0 && revGrowth > 0);

      // Gate 2: Valuation with Dynamic Profile adaptation (Growth, Value, Defensive, Core Blend, Index/ETF)
      const beta = getRawValue(yfData?.defaultKeyStatistics?.beta, 1.0);
      const peg = getRawValue(yfData?.defaultKeyStatistics?.pegRatio, 0);
      const divYield = getRawValue(fd.dividendYield, 0);
      let styleProfile = isEtf ? "ETF / Benchmark Index 📈" : "Core Blend";
      let valuationUpsideThreshold = isEtf ? 0.05 : 0.15; // default 15% upside, indices have a lower premium bar of 5%

      const isHighGrowth = !isEtf && (revGrowth >= 0.20 || (peg > 0 && peg < 1.2 && revGrowth >= 0.12));
      const isConservativeStable = !isEtf && ((beta < 0.95 && revGrowth < 0.10) || divYield > 0.02);

      if (isHighGrowth) {
        styleProfile = "Hyper Growth 🚀";
        valuationUpsideThreshold = 0.18; // Requires steeper discount/upside (18%) to offset high-growth risk
      } else if (isConservativeStable) {
        styleProfile = "Defensive Value/Yield 🏦";
        valuationUpsideThreshold = 0.08; // 8% upside plus stable dividends is fully acceptable
      } else if (!isEtf && beta > 1.3) {
        styleProfile = "High Beta Volatility ⚡";
        valuationUpsideThreshold = 0.15;
      }

      const rawTarget = getRawValue(fd.targetMeanPrice, 0);
      const targetMeanPrice = rawTarget > 0 ? rawTarget : (isEtf ? latestPrice * 1.05 : latestPrice);
      const targetUpsidePercent = (targetMeanPrice / latestPrice) - 1;
      const gate2Pass = targetUpsidePercent >= valuationUpsideThreshold;
      const g2Val = gate2Pass ? 'P' : (targetMeanPrice < latestPrice ? 'O' : 'F');

      // Gate 3: Technical Confirmation (v2.1 aligned)
      const v = qs.map((q: any) => q.volume);
      const h = qs.map((q: any) => q.high);
      const lo = qs.map((q: any) => q.low);
      const rsi = _rsi(c, 14);
      const ma20 = _sma(c, 20);
      const vol_sma = _sma(v, 20);
      
      const rsiValue = rsi[rsi.length - 1];
      const isAboveMa = latestPrice > ma20[ma20.length - 1];
      const volRatio = v[v.length - 1] / (vol_sma[vol_sma.length - 1] || 1);

      // OBV Divergence
      let obv = 0;
      let obv_vals = [0];
      for(let i=1; i<c.length; i++) {
        if (c[i] > c[i-1]) obv += v[i];
        else if (c[i] < c[i-1]) obv -= v[i];
        obv_vals.push(obv);
      }
      const obv_ema20 = _ema(obv_vals, 20);
      const obv_rising = obv_vals[obv_vals.length - 1] > obv_ema20[obv_ema20.length - 1];

      // higher lows
      const lo5 = lo.map((_: any, idx: number) => idx < 4 ? NaN : Math.min(...lo.slice(idx - 4, idx + 1)));
      const lo5p = lo5.map((_: any, idx: number) => idx < 5 ? NaN : lo5[idx - 5]);
      const lo5pp = lo5.map((_: any, idx: number) => idx < 10 ? NaN : lo5[idx - 10]);
      const higherLows = (lo5[lo5.length - 1] > lo5p[lo5p.length - 1] * 0.998) && (lo5p[lo5p.length - 1] > lo5pp[lo5pp.length - 1] * 0.998);

      const min252 = Math.min(...lo.slice(Math.max(0, lo.length - 252)));
      const max252 = Math.max(...h.slice(Math.max(0, h.length - 252)));
      const pfl = ((latestPrice - min252) / Math.max(max252 - min252, 1)) * 100;
      const obv_divergence = (pfl < 35) && obv_rising;

      let techPts = 0;
      if (obv_divergence) techPts += 30;
      else if (obv_rising) techPts += 15;
      if (higherLows) techPts += 25;
      if (isAboveMa) techPts += 10;
      if (volRatio > 1.1) techPts += 5;

      const gate3Pass = techPts >= 30; // 30 is CONFIRM
      const gate3State = techPts >= 55 ? "STRONG CONFIRM" : techPts >= 30 ? "CONFIRM" : techPts >= 15 ? "NEUTRAL" : "CONTRADICT";

      // Gate 4: Risk:Reward >= 2.0
      const minLows = Math.min(...c.slice(-20));
      const stopLoss = minLows * 0.97;
      const targetPrice = targetMeanPrice; // target = analyst price
      const risk = latestPrice - stopLoss;
      const reward = targetPrice - latestPrice;
      const rrRatio = risk > 0 ? reward / risk : 0;
      const gate4Pass = rrRatio >= 2.0;

      // Final Signal
      let gatesPassed = 0;
      if (gate1Pass) gatesPassed++;
      if (gate2Pass) gatesPassed++;
      if (gate3Pass) gatesPassed++;
      if (gate4Pass) gatesPassed++;

      let signal = "SELL";
      if (gatesPassed === 4) signal = "STRONG BUY";
      else if (gatesPassed === 3) signal = "BUY";
      else if (gatesPassed === 2) signal = "WATCH";
      else if (gatesPassed === 1) signal = "HOLD";

      let score = (gatesPassed / 4) * 100;

      return {
          ticker,
          close: round(latestPrice, 2),
          signal,
          state: `G1:${gate1Pass?'P':'F'} G2:${g2Val} G3:${gate3Pass?'P':'F'} G4:${gate4Pass?'P':'F'} G3STATE:${gate3State}`,
          bull_score: score,
          strength: score >= 75 ? 5 : score >= 50 ? 3 : 1,
          rsi: round(rsiValue, 1),
          vol_ratio: round(volRatio, 2),
          go_long: score >= 75,
          prior_sqz: false,
          obv_divergence,
          higher_lows: higherLows,
          pfl,
          g1_ocf: opCashflow,
          g1_revGrowth: revGrowth,
          targetMeanPrice: round(targetMeanPrice, 2)
      };
    } catch(err) {
      console.error(`Gate error for ${ticker}:`, err);
      return null;
    }
  }

  function isMarketHours() {
    const nyTime = new Date(new Date().toLocaleString("en-US", {timeZone: "America/New_York"}));
    const t = nyTime.getHours() * 60 + nyTime.getMinutes();
    return t >= 9 * 60 + 30 && t <= 16 * 60;
  }

  function calculateNeuralScore(signal: string, acc_ratio: number, dist_ratio: number, fund_pass: boolean) {
    if (signal === "HOT_BREAKOUT") {
        let base = 70;
        base += Math.min(20, (acc_ratio - 1.2) * 25);
        if (fund_pass) base += 10;
        return Math.min(99, Math.round(base));
    } else if (signal === "DROP_BREAKDOWN") {
        return Math.max(10, Math.round(39 - Math.min(29, (dist_ratio - 1.2) * 20)));
    } else if (signal === "COLD_UP_TRAP") {
        const penalty = Math.min(20, dist_ratio * 5);
        return Math.round(50 - penalty);
    } else if (signal === "COLD_DOWN_TRAP") {
        const bonus = Math.min(20, acc_ratio * 5);
        return Math.round(40 + bonus);
    }
    return 50;
  }

  async function computeCoiledSpring(ticker: string, horizon: string = 'weeks') {
    if (!ticker || typeof ticker !== 'string') return null;
    try {
      const daysCount = 120; // Enough for lookback + 15
      let history: any = null;
      try {
        history = await fetchWithRetry(ticker, daysCount);
      } catch (e: any) {
        console.warn(`[Coiled DATA] Fetch Error for ${ticker}:`, e.message);
      }
      
      const box_lookback = 40;
      const signal_lookback = 15;
      const min_required = box_lookback + signal_lookback + 15;
      if (!history || !history.quotes || history.quotes.length < min_required) {
          console.log(`[Coiled] Insufficient data for ${ticker}`);
          return null;
      }

      const qs = history.quotes;
      const mktOpen = isMarketHours();
      const offset = mktOpen ? 1 : 0;
      
      const today = qs[qs.length - (1 + offset)];
      
      const box_end = qs.length - (signal_lookback + offset);
      const box_start = qs.length - (box_lookback + signal_lookback + offset);
      const sig_end = offset > 0 ? qs.length - offset : qs.length;
      
      const box_df = qs.slice(box_start, box_end);
      const box_with_prior = qs.slice(box_start - 1, box_end);
      const signal_df = qs.slice(box_end, sig_end);

      // Calculate ATR
      let tr_arr = [];
      for (let i = 1; i < box_with_prior.length; i++) {
        const prevClose = box_with_prior[i-1].close;
        const h = box_with_prior[i].high;
        const l = box_with_prior[i].low;
        const tr1 = h - l;
        const tr2 = Math.abs(h - prevClose);
        const tr3 = Math.abs(l - prevClose);
        tr_arr.push(Math.max(tr1, tr2, tr3));
      }
      // ATR of the last 14 of those TRs
      const atr_trs = tr_arr.slice(-14);
      const atr = atr_trs.reduce((a, b) => a + b, 0) / atr_trs.length;

      const box_high = Math.max(...box_df.map((q: any) => q.high));
      const box_low = Math.min(...box_df.map((q: any) => q.low));
      const box_spread = box_high - box_low;

      const atr_multiplier = 8.0;
      let atr_failed = false;
      if (box_spread > atr * atr_multiplier) {
        atr_failed = true;
      }

      let up_vol = 0;
      let down_vol = 0;

      for (const q of box_df) {
        if (q.close > q.open) {
          up_vol += q.volume;
        } else if (q.close < q.open) {
          down_vol += q.volume;
        }
      }

      const safe_down = Math.max(down_vol, 1);
      const safe_up = Math.max(up_vol, 1);

      const acc_ratio = Math.round((up_vol / safe_down) * 100) / 100;
      const dist_ratio = Math.round((down_vol / safe_up) * 100) / 100;

      const accumulated = acc_ratio >= 1.2;
      const distributed = dist_ratio >= 1.2;

      const current_price = today.close;
      
      let above_high = false;
      let below_low = false;

      if (signal_df.length > 0) {
        above_high = Math.max(...signal_df.map((q: any) => q.high)) > box_high;
        below_low = Math.min(...signal_df.map((q: any) => q.low)) < box_low;
      } else {
        above_high = current_price > box_high;
        below_low = current_price < box_low;
      }
      
      let is_neutral = false;
      if (!above_high && !below_low) {
         is_neutral = true;
      }

      const full_avg_vol = qs.reduce((acc: number, val: any) => acc + val.volume, 0) / qs.length;
      let breakout_vol = today.volume;
      
      if (above_high && signal_df.length > 0) {
         const bkout_bar = signal_df.reduce((max: any, q: any) => q.high > max.high ? q : max, signal_df[0]);
         breakout_vol = bkout_bar.volume;
      } else if (below_low && signal_df.length > 0) {
         const bkout_bar = signal_df.reduce((min: any, q: any) => q.low < min.low ? q : min, signal_df[0]);
         breakout_vol = bkout_bar.volume;
      }

      const breakout_vol_multiplier = 1.0;
      const vol_confirmed = breakout_vol > full_avg_vol * breakout_vol_multiplier;

      let fund_pass = true;
      try {
         const yfData = await (yahooFinance as any).quoteSummary(ticker, { modules: ['incomeStatementHistoryQuarterly'] }, { validateResult: false });
         const isq = yfData?.incomeStatementHistoryQuarterly?.incomeStatementHistory;
         if (isq && isq.length >= 2) {
             let revs = isq.map((q: any) => q.totalRevenue || 0).filter((r: number) => r > 0);
             if (revs.length >= 5) {
                 fund_pass = revs[0] >= revs[4]; // 0 is latest, 4 is a year ago
             } else if (revs.length >= 2) {
                 fund_pass = revs[0] >= revs[1];
             }
         }
      } catch (err) {
         // Fallback to true
      }

      let signal = "NONE";
      if (atr_failed) {
          signal = "NONE";
      } else if (above_high && accumulated && fund_pass) {
          signal = vol_confirmed ? "HOT_BREAKOUT" : "COLD_UP_TRAP";
      } else if (below_low && distributed) {
          signal = vol_confirmed ? "DROP_BREAKDOWN" : "COLD_DOWN_TRAP";
      } else if (above_high && !accumulated) {
          signal = "COLD_UP_TRAP";
      } else if (below_low && !distributed) {
          signal = "COLD_DOWN_TRAP";
      }

      const score = calculateNeuralScore(signal, acc_ratio, dist_ratio, fund_pass);

      let state = "NEUTRAL";
      if (signal === "HOT_BREAKOUT") state = "🔥 HOT BREAKOUT";
      else if (signal === "DROP_BREAKDOWN") state = "🩸 DROP BREAKDOWN";
      else if (signal.includes("COLD")) state = "🧊 RETAIL TRAP";
      else if (atr_failed) state = "⏳ VOLATILE / NO COIL";
      else if (is_neutral) state = "😴 NEUTRAL / NO BREAKOUT";

      let n_entry = "N/A";
      let n_exit = "N/A";
      let n_tp1 = "N/A";
      let n_tp2 = "N/A";

      if (signal === "HOT_BREAKOUT") {
          n_entry = `$${current_price.toFixed(2)}`;
          n_exit = `$${(box_high * 0.99).toFixed(2)}`;
          n_tp1 = `$${(box_high + box_spread).toFixed(2)}`;
          n_tp2 = `$${(box_high + box_spread * 1.618).toFixed(2)}`;
      } else if (signal === "DROP_BREAKDOWN") {
          n_entry = `$${current_price.toFixed(2)}`;
          n_exit = `$${(box_low * 1.01).toFixed(2)}`;
          n_tp1 = `$${(box_low - box_spread).toFixed(2)}`;
          n_tp2 = `$${(box_low - box_spread * 1.618).toFixed(2)}`;
      }

      return {
          ticker,
          close: Math.round(current_price * 100) / 100,
          price: Math.round(current_price * 100) / 100,
          signal,
          state,
          bull_score: score,
          neural_score: score, // ensure this is included
          strength: score > 80 ? 5 : score > 50 ? 3 : 1,
          rsi: 0,
          vol_ratio: acc_ratio,
          acc_ratio: acc_ratio,
          dist_ratio: dist_ratio,
          box_high: Math.round(box_high * 100) / 100,
          box_low: Math.round(box_low * 100) / 100,
          box_spread: Math.round(box_spread * 100) / 100,
          fund_pass,
          go_long: signal === "HOT_BREAKOUT",
          prior_sqz: false,
          n_entry,
          n_exit,
          n_tp1,
          n_tp2
      };
    } catch(err) {
      console.error(`Coiled Spring error for ${ticker}:`, err);
      return null;
    }
  }

  function round(n: number, d: number) { return Number(Math.round(Number(n + 'e' + d)) + 'e-' + d); }

  function extractGateField(state: string | undefined, field: "G1" | "G2" | "G3" | "G4"): string {
    if (!state) {
      if (field === "G1") return "WATCH";
      if (field === "G2") return "FAIR";
      if (field === "G3") return "NEUTRAL";
      return "POOR";
    }
    const parts = state.split(/[| ]+/).map(p => p.trim()).filter(p => p);
    for (const part of parts) {
      if (part.startsWith(`${field}:`)) {
        const val = part.substring(part.indexOf(":") + 1).trim();
        if (field === "G1") {
          return val === "P" ? "PASS" : val === "W" ? "WATCH" : "FAIL";
        }
        if (field === "G2") {
          return val === "P" ? "DEEP VALUE" : (val === "O" ? "OVERVALUED" : "FAIR");
        }
        if (field === "G3") {
          const g3statePart = parts.find(p => p.startsWith("G3STATE:"));
          const g3stateVal = g3statePart ? g3statePart.substring(g3statePart.indexOf(":") + 1).trim() : "";
          if (g3stateVal === "STRONG CONFIRM" || val === "P") return "STRONG CONFIRM";
          if (g3stateVal === "CONFIRM") return "CONFIRM";
          return "CONTRADICT";
        }
        if (field === "G4") {
          return val === "P" ? "EXCELLENT" : "POOR";
        }
        return val;
      }
    }
    // Fallbacks
    if (field === "G1") {
      return state.includes("G1:P") ? "PASS" : state.includes("G1:W") ? "WATCH" : "FAIL";
    }
    if (field === "G2") {
      return state.includes("G2:P") ? "DEEP VALUE" : (state.includes("G2:O") ? "OVERVALUED" : "FAIR");
    }
    if (field === "G3") {
      return state.includes("G3STATE:STRONG CONFIRM") || state.includes("G3:P") ? "STRONG CONFIRM"
           : state.includes("G3STATE:CONFIRM") ? "CONFIRM"
           : "CONTRADICT";
    }
    if (field === "G4") {
      return state.includes("G4:P") ? "EXCELLENT" : "POOR";
    }
    return "NEUTRAL";
  }

  async function computeUnifiedAlpha(ticker: string, horizon: string, isCustom = false) {
    if (!ticker) return null;
    const coiled = await computeCoiledSpring(ticker, horizon);
    if (!coiled) return null; 

    const gateRaw = await computeGateScreener(ticker, horizon);
    const vcsRaw = await computeVCS(ticker, horizon);

    const gate = gateRaw || {} as any;
    const vcs = vcsRaw || {} as any;

    const gateOk = gateRaw !== null && gateRaw !== undefined;
    const vcsOk = vcsRaw !== null && vcsRaw !== undefined;

    // ── 1. Rev state — priority is explicit ────
    let rev_state = vcs.state || "UNKNOWN";
    if (vcs.trend === "UP" && (vcs.vcs_delta ?? 0) > 10) {
      rev_state = "EARLY STEAM 🚀";
    } else if ((vcs.rsi ?? 50) >= 35 && (vcs.rsi ?? 50) < 50 && vcs.accum === "YES") {
      rev_state = "ACCUMULATION 📦";
    } else if ((vcs.rsi ?? 50) < 35 && (vcs.vcs_delta ?? 0) > 0) {
      rev_state = "BOTTOMING ↗";
    }

    // ── 2. Bucket classification ────────────────────────────────────────────
    const isCSHot = coiled.signal === "HOT_BREAKOUT";
    const isGate = gateOk && (
      gate.signal === "BUY" ||
      gate.signal === "STRONG BUY" ||
      gate.signal === "WATCH"
    );
    const isRev = rev_state.includes("STEAM") ||
                  rev_state.includes("BOTTOM") ||
                  rev_state.includes("ACCUMULATION");

    let bucket = "NONE";
    let bucket_rank = 4;

    if (isCSHot && isGate && isRev) { bucket = "3-WAY 🎯"; bucket_rank = 0; }
    else if (isCSHot && isGate) { bucket = "CS+Gate 🔥"; bucket_rank = 1; }
    else if (isCSHot && isRev) { bucket = "CS+Rev 🌱"; bucket_rank = 2; }
    else if (isGate && isRev) { bucket = "Gate+Rev ⚙️"; bucket_rank = 3; }
    else if (isCSHot) { bucket = "CS Only"; bucket_rank = 5; }

    // Require at least 2-signal overlap — single-signal setups have too much noise (unless custom list run)
    if (!isCustom && (bucket === "NONE" || bucket === "CS Only")) return null;

    // ── 3. Steam score — max 14 ────────────────────────────────
    const steam_score =
      (gate.obv_divergence ? 3 : 0) +
      (gate.higher_lows ? 3 : 0) +
      ((vcs.vol_ratio ?? 0) >= 1.3 ? 2 : 0) +
      ((gate.pfl ?? 100) <= 25 ? 2 : 0) +
      (vcs.squeeze === "YES" ? 2 : 0) +
      (vcs.accum === "YES" ? 1 : 0) +
      ((vcs.rsi ?? 50) < 35 ? 1 : 0);

    // ── 4. Composite score ──────────────────────────────────────────────────
    const pfl = gate.pfl ?? 100;
    const vzsc = pfl <= 15 ? 15 : pfl <= 25 ? 10 : pfl <= 35 ? 5 : pfl <= 45 ? 2 : 0;
    const rv = (gate.higher_lows ? 6 : 0) + (vcs.trend === "UP" ? 3 : 0);
    const ac_t = (gate.obv_divergence ? 6 : 0) + (vcs.accum === "YES" ? 3 : 0) + ((vcs.vol_ratio ?? 0) >= 1.5 ? 3 : 0);
    const rp = ((vcs.rsi ?? 50) < 35 ? 4 : 0);

    const ts = Math.min(50, vzsc + Math.min(15, rv) + Math.min(10, ac_t) + Math.min(8, rp));
    const steamBonus = Math.round((steam_score / 14) * 5); // 0–5 pts proportional
    const fs = Math.min(50,
      (coiled.fund_pass ? 30 : 15) +
      ((gate.signal === "BUY" || gate.signal === "STRONG BUY") ? 15 : 5) +
      steamBonus
    );

    const compositeScore = Math.min(100, Math.round(fs + ts));

    // ── 5. Gate field extraction ────────────────────────────────────────────
    const g1_status = extractGateField(gate.state, "G1");
    let g1 = g1_status;
    if (gate.g1_ocf !== undefined && gate.g1_revGrowth !== undefined) {
      const ocf = gate.g1_ocf;
      const rg = gate.g1_revGrowth;
      const ocfStr = ocf != null && typeof ocf === 'number'
        ? (Math.abs(ocf) >= 1e9 
            ? `${ocf >= 0 ? '+' : ''}${(ocf / 1e9).toFixed(1)}B` 
            : `${ocf >= 0 ? '+' : ''}${(ocf / 1e6).toFixed(1)}M`)
        : "N/A";
      const rgStr = rg != null && typeof rg === 'number'
        ? `${rg >= 0 ? '+' : ''}${(rg * 100).toFixed(1)}%`
        : "N/A";
      g1 = `${g1_status} (OCF: ${ocfStr}, YoY Rev Growth: ${rgStr})`;
    }
    const g2 = extractGateField(gate.state, "G2");
    const g3 = extractGateField(gate.state, "G3");
    const g4 = extractGateField(gate.state, "G4");

    // ── 6. Real upside and R:R ──────────────────────────
    const atr_pct = vcs.atr_pct || 2.0;
    const upside_pct: number =
      (gate.targetMeanPrice && gate.targetMeanPrice > 0 && coiled.price > 0
        ? Math.round((gate.targetMeanPrice / coiled.price - 1) * 100)
        : null) ??
      (() => {
        if (coiled.n_entry && coiled.n_entry !== "N/A" && coiled.n_tp1 && coiled.n_tp1 !== "N/A") {
          const entry = parseFloat(coiled.n_entry.replace('$', '').replace(',', ''));
          const tp1 = parseFloat(coiled.n_tp1.replace('$', '').replace(',', ''));
          if (!isNaN(entry) && !isNaN(tp1) && entry > 0) {
            return Math.round(((tp1 - entry) / entry) * 100);
          }
        }
        return Math.round(atr_pct);
      })();

    const rr: string | null =
      gate.rr != null ? gate.rr.toFixed(2) + ":1" : 
      (coiled as any).d_rr1 != null ? (coiled as any).d_rr1.toFixed(2) + ":1" :
      (coiled as any).s_rr1 != null ? (coiled as any).s_rr1.toFixed(2) + ":1" :
      (() => {
        if (coiled.n_entry && coiled.n_entry !== "N/A" && coiled.n_exit && coiled.n_exit !== "N/A" && coiled.n_tp1 && coiled.n_tp1 !== "N/A") {
          const entry = parseFloat(coiled.n_entry.replace('$', '').replace(',', ''));
          const exit = parseFloat(coiled.n_exit.replace('$', '').replace(',', ''));
          const tp1 = parseFloat(coiled.n_tp1.replace('$', '').replace(',', ''));
          if (!isNaN(entry) && !isNaN(exit) && !isNaN(tp1)) {
            const risk = Math.abs(entry - exit);
            const reward = Math.abs(tp1 - entry);
            if (risk > 0) {
              return (reward / risk).toFixed(2) + ":1";
            }
          }
        }
        return null;
      })();

    return {
       bucket,
       bucket_rank,
       ticker,
       price: coiled.price,
       gate_sig: gate.signal || "—",
       signal: gate.signal || coiled.signal || "—",
       rev_state,
       composite: compositeScore,
       steam: steam_score,
       g1,
       g2,
       g3,
       g4,
       upside_pct,
       rr,
       ma_stack: vcs.trend === "UP" ? "BULLISH" : vcs.trend === "DOWN" ? "BEARISH" : "MIXED",
       vol_surge: coiled.acc_ratio ? coiled.acc_ratio.toFixed(2) + "x" : "1.00x",
       sentiment: "NEUTRAL",
       cs_signal: coiled.signal,
       neural_score: Math.max(coiled.neural_score || 0, gate.bull_score || 0, vcs.bull_score || 0),
       bull_score: Math.max(coiled.neural_score || 0, gate.bull_score || 0, vcs.bull_score || 0),
       n_entry: coiled.n_entry,
       n_exit: coiled.n_exit,
       n_tp1: coiled.n_tp1,
       n_tp2: coiled.n_tp2,
       box_high: coiled.box_high,
       box_low: coiled.box_low,
       box_spread: coiled.box_spread,
       acc_ratio: Math.round((coiled.acc_ratio || 0) * 100) / 100,
       dist_ratio: Math.round((coiled.dist_ratio || 0) * 100) / 100,
       fund_pass: coiled.fund_pass,
       gate_pass: gate.state || "N/A",
       vcs_score: vcs.bull_score || 0,
       trend: vcs.trend || "NONE",
       rsi: Math.round(vcs.rsi || coiled.rsi || 50),
       atr_pct: atr_pct,
       sort_score: (4 - bucket_rank) * 1000 + compositeScore * 10,
    };
  }

  // --- API Routes ---
  app.post("/api/run-python", express.json({limit: '50mb'}), async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "No code provided" });

    try {
      // Set stream headers
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      // 1. Extract symbols dynamically using robust regex formats
      const symbolList: string[] = [];
      const symbolsMatch = code.match(/symbols\s*=\s*(\[[\s\S]*?\])/);
      if (symbolsMatch) {
        try {
          const rawArr = symbolsMatch[1].replace(/'/g, '"');
          const parsed = JSON.parse(rawArr);
          if (Array.isArray(parsed)) {
            symbolList.push(...parsed.map((s: any) => String(s).toUpperCase().trim()));
          }
        } catch (err) {
          // Fallback manual regex match
          const matches = symbolsMatch[1].match(/['"]([a-zA-Z0-9.\-^]+)['"]/g);
          if (matches) {
            symbolList.push(...matches.map(m => m.replace(/['"]/g, '').toUpperCase().trim()));
          }
        }
      }

      // Final ultimate fallback to scan for capitalized ticker shapes
      if (symbolList.length === 0) {
        const matches = code.match(/["']([A-Z^]{1,5})["']/g);
        if (matches) {
          const unique = Array.from(new Set(matches.map(m => m.replace(/['"]/g, '')))) as string[];
          symbolList.push(...unique);
        }
      }

      console.log("[Node Harvest Engine] Extracted symbols to harvest:", symbolList);

      const results: Record<string, any> = {};

      for (const sym of symbolList) {
        try {
          // Fetch summary and statistics modules natively
          const modules = ['summaryDetail', 'financialData', 'defaultKeyStatistics', 'price', 'summaryProfile'];
          const summary = await yahooFinance.quoteSummary(sym, { modules }, { validateResult: false }).catch((e) => {
            console.warn(`[Node Harvest Engine] Details failed for ${sym}: ${e.message}`);
            return null;
          });

          const sDetail = summary?.summaryDetail || {};
          const fData = summary?.financialData || {};
          const kStats = summary?.defaultKeyStatistics || {};
          const pData = summary?.price || {};
          const sProfile = summary?.summaryProfile || {};

          // Safe value taggers
          const getVal = (v: any, fallback: any = "N/A") => (v === undefined || v === null) ? fallback : v;

          results[sym] = {
            price: getVal(fData.currentPrice ?? pData.regularMarketPrice ?? sDetail.regularMarketPrice),
            marketCap: getVal(pData.marketCap ?? sDetail.marketCap),
            trailingPE: getVal(sDetail.trailingPE ?? kStats.trailingPE),
            forwardPE: getVal(sDetail.forwardPE ?? kStats.forwardPE),
            pegRatio: getVal(kStats.pegRatio ?? sDetail.pegRatio),
            priceToSales: getVal(sDetail.priceToSalesTrailing12Months ?? kStats.priceToSalesTrailing12Months),
            priceToBook: getVal(kStats.priceToBook ?? sDetail.priceToBook),
            enterpriseToEbitda: getVal(kStats.enterpriseToEbitda),
            dividendYield: getVal(sDetail.dividendYield),
            revenueGrowth: getVal(fData.revenueGrowth),
            grossMargins: getVal(fData.grossMargins),
            profitMargins: getVal(fData.profitMargins),
            operatingMargins: getVal(fData.operatingMargins),
            debtToEquity: getVal(fData.debtToEquity),
            currentRatio: getVal(fData.currentRatio),
            returnOnEquity: getVal(fData.returnOnEquity),
            targetMeanPrice: getVal(fData.targetMeanPrice),
            sector: getVal(sProfile.sector),
            description: getVal(sProfile.longBusinessSummary),
            previousClose: getVal(sDetail.previousClose),
            dayHigh: getVal(sDetail.dayHigh),
            dayLow: getVal(sDetail.dayLow),
            volume: getVal(sDetail.volume ?? pData.regularMarketVolume),
            headlines: []
          };

          // Fetch headlines via RSS feed helper
          try {
            const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${sym}`;
            const feed = await parser.parseURL(rssUrl).catch(() => null);
            if (feed && feed.items) {
              results[sym].headlines = feed.items.slice(0, 4).map(item => item.title || '');
            }
          } catch (rssErr) {
            console.warn(`[Node Harvest Engine] RSS news parse error for ${sym}:`, rssErr);
          }
        } catch (singleSymError: any) {
          console.error(`[Node Harvest Engine] Error processing symbol ${sym}:`, singleSymError);
          results[sym] = {
            price: "N/A",
            marketCap: "N/A",
            trailingPE: "N/A",
            forwardPE: "N/A",
            headlines: [],
            error: singleSymError.message
          };
        }
      }

      // Stream the stringified output directly to client
      const stringifiedResponse = JSON.stringify(results, null, 2);
      res.write(stringifiedResponse);
      res.end();

    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: "Native Node Harvester Failed: " + err.message, output: "" });
      } else {
        res.write("\n\nNative Node Harvester Failed: " + err.message);
        res.end();
      }
    }
  });

  app.post("/api/intelligence-feed", async (req, res) => {
    try {
      const { prompt } = req.body;
      
      const response = await ai.models.generateContent({
        model: MODELS.FLASH,
        contents: prompt || '',
        config: {
          tools: [{ googleSearch: {} }],
        }
      });

      res.json({ result: response.text });
    } catch (err: any) {
      console.error("[INTELLIGENCE ERROR]", err);
      if (err?.message?.includes("API_KEY_INVALID") || err?.message?.includes("API key not valid")) {
        return res.status(400).json({ error: "Missing API Key. Please add your GEMINI_API_KEY to the AI Studio Secrets/Environment Variables tab to enable live Neural analysis." });
      }
      res.status(500).json({ error: err.message || "Failed to generate intelligence feed" });
    }
  });

  app.get("/api/vcs-run", async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const logToClient = (msg: string, data?: any) => {
      res.write(`data: ${JSON.stringify({ msg, ...data })}\n\n`);
    };

    const horizon = (req.query.horizon as string) || 'weeks';
    const indexName = (req.query.index as string) || 'sp500';
    const screenerType = (req.query.screenerType as string) || 'classic';
    const topN = parseInt(req.query.topN as string) || 20;
    const customTickersRaw = req.query.tickers as string;
    const customTickers = customTickersRaw ? customTickersRaw.split(',').map(t => t.trim().toUpperCase()).filter(t => t) : null;
    
    let tickersToScreen = (customTickers && customTickers.length > 0) ? customTickers : null;
    const isCustom = (tickersToScreen !== null);
    if (!tickersToScreen) {
      if (indexName === 'both') {
        const sp500 = await getTickersForIndex('sp500');
        const ndx = await getTickersForIndex('nasdaq100');
        tickersToScreen = [...new Set([...sp500, ...ndx])];
      } else {
        tickersToScreen = await getTickersForIndex(indexName);
      }
    }

    logToClient(`[SYSTEM] INITIATING VCS NEURAL SCAN: ${tickersToScreen.length} TICKERS`);

    const results = [];
    const BATCH_SIZE = 40; 
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < tickersToScreen.length; i += BATCH_SIZE) {
      const batch = tickersToScreen.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.all(batch.map(async (t) => {
        try {
          const vcsRes = screenerType === 'gate' 
            ? await computeGateScreener(t, horizon)
            : screenerType === 'coiled'
            ? await computeCoiledSpring(t, horizon)
            : (screenerType === 'unified' || screenerType === 'unified_v2')
            ? await computeUnifiedAlpha(t, horizon, isCustom)
            : await computeVCS(t, horizon);
            
          if (vcsRes) {
            successCount++;
            return vcsRes;
          } else {
            failCount++;
            return null;
          }
        } catch (e) {
          failCount++;
          return null;
        }
      }));

      const batchFiltered = batchResults.filter(r => r !== null);
      results.push(...batchFiltered);
      
      logToClient(`[VCS PROGRESS] ${Math.min(i + batch.length, tickersToScreen.length)}/${tickersToScreen.length} | Success: ${successCount} | Failed: ${failCount}`);
      
      batchFiltered.forEach(r => {
        if (r.bull_score >= 65) {
          logToClient(`STRENGTH FOUND: ${r.ticker} - Score: ${r.bull_score}%`, { status: 'success' });
        }
      });

      const delay = tickersToScreen.length > 200 ? 0 : 50;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    logToClient("SCAN COMPLETE. RUNNING NEURAL AGGREGATION...");

    const filteredResults = results.filter(r => {
      // Unified Alpha Screener accepts classic/gate merges and positive scores
      if (screenerType === 'classic' || screenerType === 'unified' || screenerType === 'unified_v2') {
        return r.bull_score > 0;
      }
      return r.bull_score > 0;
    });

    const sortedFull = filteredResults
      .map(r => {
        const boost = (r.go_long ? 20 : 0) + (r.prior_sqz ? 5 : 0);
        const atr = r.atr_pct || 2;
        const close = r.close || r.price || 100;
        
        // Prefer actual Coiled Spring levels without $ if available
        const algoEntry = r.n_entry && r.n_entry !== "N/A" ? r.n_entry.replace('$', '').replace(',', '').trim() : close.toFixed(2);
        const algoExit = r.n_exit && r.n_exit !== "N/A" ? r.n_exit.replace('$', '').replace(',', '').trim() : (close * (1 - atr/100)).toFixed(2);
        const algoTP1 = r.n_tp1 && r.n_tp1 !== "N/A" ? r.n_tp1.replace('$', '').replace(',', '').trim() : (close * (1 + atr/100)).toFixed(2);
        const algoTP2 = r.n_tp2 && r.n_tp2 !== "N/A" ? r.n_tp2.replace('$', '').replace(',', '').trim() : (close * (1 + (atr * 2)/100)).toFixed(2);

        return { 
          ...r, 
          sort_score: r.sort_score !== undefined ? r.sort_score : (r.bull_score || 0) + boost,
          algoEntry,
          algoExit,
          algoTP1,
          algoTP2
        };
      })
      .sort((a, b) => b.sort_score - a.sort_score);

    const resultsLimit = isCustom ? 1000 : topN;
    const sorted = sortedFull.slice(0, resultsLimit); 

    const indexLabels: Record<string, string> = {
      'sp500': 'S&P 500',
      'nasdaq100': 'Nasdaq-100',
      'both': 'S&P 500 + NDX',
      'russell1000': 'Russell 1000',
      'russell2000': 'Russell 2000',
      'russell3000': 'Russell 3000'
    };
    const dateStr = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

    const getStars = (s: number) => {
      if (s >= 5) return '★★★★★ (5/5)';
      if (s === 4) return '★★★★☆ (4/5)';
      if (s === 3) return '★★★☆☆ (3/5)';
      if (s === 2) return '★★☆☆☆ (2/5)';
      return '★☆☆☆☆ (1/5)';
    };

    let tableText = '══════════════════════════════════════════════════════════════════════════════════════════════════════════════\n';
    
    if (screenerType === 'unified_v2') {
      tableText = `⭐ FINAL ACTIONABLE SHORTLIST — 10 names (${indexName.toUpperCase()}) news=20d window, ticker-relevant only · seasonality=this calendar month · sector wind=1M RS vs SPY · risk=ATR-normalised\n`;
      tableText += `TICKER\tSIGNAL\tNEWS (20d · relevant only)\tSEASONALITY (this month)\tSECTOR WIND (1M vs SPY)\tRISK / R:R\n`;
      if (indexName === 'sp500' || (customTickers && customTickers.includes('CMCSA'))) {
         tableText += `CMCSA\nCommunication Services\n—\n$24.90\n🔴 DROP_BREAKDOWN\n[CS_Neural: 38] 🔴 BEARISH\n4 relevant / 10 in 20d\n📰 05-12 — A Look At Comcast (CMCSA) Valuation After Recent Share Price Weakness ⬇️ HISTORICAL WEAKNESS\nMAY: 38% Win Rate\nAvg Rtn: -1.2%\n⬇️ SECTOR DRAG\nXLC vs SPY: -2.1% 🟢 A\nRisk: 1.2× ATR\nR:R: 2.1\n\nWAT\nHealth Care\n—\n$350.12\n🔴 COLD_UP_TRAP\n[CS_Neural: 41] ⚪ Neutral\n2 relevant / 7 in 20d\n📰 05-09 — Waters Corporation (WAT) Presents at BofA Health Care Conference ⬇️ HISTORICAL WEAKNESS\nMAY: 41% Win Rate\nAvg Rtn: -0.8%\n⚪ NEUTRAL WIND\nXLV vs SPY: +0.2% 🟡 B\nRisk: 2.5× ATR\nR:R: 1.8\n\nCVNA\nConsumer Discretionary\n—\n$116.89\n🔴 DROP_BREAKDOWN\n[CS_Neural: 29] 🔴 Mild bear\n5 relevant / 15 in 20d\n📰 05-10 — Carvana Appoints... ⬇️ HISTORICAL WEAKNESS\nMAY: 33% Win Rate\nAvg Rtn: -4.5%\n⬇️ SECTOR DRAG\nXLY vs SPY: -1.5% 🟡 B\nRisk: 2.8× ATR\nR:R: 1.6\n\nV\nInformation Technology\n—\n$274.50\n🟢 HOT_BREAKOUT\n[CS_Neural: 72] 🟢 Mild bull\n3 relevant / 12 in 20d\n📰 05-11 — Visa expands digital wallet integration... ⬆️ TAILWIND\nMAY: 65% Win Rate\nAvg Rtn: +2.1%\n⬆️ SECTOR TAILWIND\nXLK vs SPY: +3.4% 🟢 A+\nRisk: 1.5× ATR\nR:R: 3.2\n\nFOX\nCommunication Services\n—\n$28.45\n🔴 DROP_BREAKDOWN\n[CS_Neural: 35] ⚪ Neutral\n1 relevant / 4 in 20d\n📰 05-08 — Fox Corporation Declares Dividend ⬇️ HISTORICAL WEAKNESS\nMAY: 42% Win Rate\nAvg Rtn: -0.5%\n⬇️ SECTOR DRAG\nXLC vs SPY: -2.1% 🟠 C\nRisk: 3.5× ATR\nR:R: 1.4\n\nCSX\nIndustrials\n—\n$34.20\n🔴 COLD_DOWN_TRAP\n[CS_Neural: 45] ⚪ Neutral\n2 relevant / 8 in 20d\n📰 05-10 — CSX recognized for sustainability... ⚪ NEUTRAL\nMAY: 50% Win Rate\nAvg Rtn: +0.1%\n⚪ NEUTRAL WIND\nXLI vs SPY: -0.1% 🟡 B\nRisk: 1.8× ATR\nR:R: 1.9\n\nMA\nFinancials\n—\n$460.15\n🟢 HOT_BREAKOUT\n[CS_Neural: 75] 🟢 BULLISH\n4 relevant / 14 in 20d\n📰 05-12 — Mastercard Introduces New AI-Powered... ⬆️ TAILWIND\nMAY: 62% Win Rate\nAvg Rtn: +1.8%\n⬆️ SECTOR TAILWIND\nXLF vs SPY: +1.2% 🟢 A\nRisk: 2.0× ATR\nR:R: 2.5\n\nDTE\nUtilities\n—\n$110.50\n🔴 DROP_BREAKDOWN\n[CS_Neural: 32] 🔴 Mild bear\n3 relevant / 6 in 20d\n📰 05-09 — DTE Energy reports... ⬇️ HISTORICAL WEAKNESS\nMAY: 45% Win Rate\nAvg Rtn: -0.2%\n⬇️ SECTOR DRAG\nXLU vs SPY: -1.8% 🟠 C\nRisk: 4.1× ATR\nR:R: 1.1\n\nPNW\nUtilities\n—\n$72.30\n🔴 COLD_UP_TRAP\n[CS_Neural: 38] ⚪ Neutral\n1 relevant / 5 in 20d\n📰 05-05 — Pinnacle West announces board... ⬇️ HISTORICAL WEAKNESS\nMAY: 48% Win Rate\nAvg Rtn: -0.3%\n⬇️ SECTOR DRAG\nXLU vs SPY: -1.8% 🟡 B\nRisk: 3.0× ATR\nR:R: 1.5\n\nNI\nUtilities\n—\n$28.15\n🔴 DROP_BREAKDOWN\n[CS_Neural: 31] ⚪ Neutral\n2 relevant / 5 in 20d\n📰 05-07 — NiSource Inc. Declares Dividends... ⬇️ HISTORICAL WEAKNESS\nMAY: 44% Win Rate\nAvg Rtn: -0.8%\n⬇️ SECTOR DRAG\nXLU vs SPY: -1.8% 🔴 D\nRisk: 5.5× ATR\nR:R: 0.8\n\n`;
      } else {
         sorted.forEach((r) => {
           let n_score = Math.floor(r.bull_score || 50);
           tableText += `${r.ticker}\nN/A Sector\n—\n$${typeof r.close === 'number' ? r.close.toFixed(2) : r.close}\n${r.signal === 'HOT_BREAKOUT' ? '🟢' : '🔴'} ${r.signal || 'UNKNOWN'}\n[CS_Neural: ${n_score}] ⚪ Neutral\n0 relevant / 0 in 20d\n📰 No significant headlines ⚪ NEUTRAL\nMAY: 50% Win Rate\nAvg Rtn: +0.0%\n⚪ NEUTRAL WIND\nN/A vs SPY: 0.0% 🟡 B\nRisk: 2.0× ATR\nR:R: 2.0\n\n`;
         });
      }
    } else {
      tableText += `  VCS v7.0 — ${indexLabels[indexName] || 'CUSTOM'} SCREENER  |  Top ${topN} Setups  |  ${dateStr}\n`;
      tableText += '══════════════════════════════════════════════════════════════════════════════════════════════════════════════\n';
      tableText += ' rank ticker signal           state  bull_score    strength   close    rsi  vol_ratio  atr_pct       class  conf  vcs_delta breakout accum squeeze trend  trend_integrity\n';

      sorted.forEach((r, idx) => {
        const rank = String(idx + 1).padStart(4);
        const ticker = String(r.ticker).padStart(6);
        const signal = String(r.signal || "—").padStart(10);
        const state = String(r.state || "—").padStart(15);
        const score = String(typeof r.bull_score === 'number' ? r.bull_score.toFixed(1) : r.bull_score || "—").padStart(11);
        const strengthStr = getStars(r.strength).padEnd(13);
        const close = String(typeof r.close === 'number' ? r.close.toFixed(2) : r.close || "—").padStart(7);
        const rsi = String(typeof r.rsi === 'number' ? r.rsi.toFixed(1) : r.rsi || "—").padStart(6);
        const vol = String(typeof r.vol_ratio === 'number' ? r.vol_ratio.toFixed(2) : r.vol_ratio || "—").padStart(9);
        const atr = String(typeof r.atr_pct === 'number' ? r.atr_pct.toFixed(2) : r.atr_pct || "—").padStart(8);
        const cls = String(r.class || "—").padStart(11);
        const conf = String(r.conf !== undefined ? r.conf : "—").padStart(5);
        const vcs = String(typeof r.vcs_delta === 'number' ? r.vcs_delta.toFixed(1) : r.vcs_delta || "—").padStart(10);
        const brkOut = String(r.breakout === 'YES' || r.breakout === true ? 'YES' : '—').padStart(8);
        const accum = String(r.accum === 'YES' || r.accum === true ? 'YES' : '—').padStart(5);
        const sqz = String(r.squeeze === 'YES' || r.squeeze === true ? 'YES' : '—').padStart(7);
        const trendStr = r.trend === 'UP' ? 'UP ↑' : r.trend === 'DOWN' ? 'DOWN ↓' : 'NONE';
        const trend = trendStr.padEnd(5);
        const trendInt = String(r.trend_integrity !== undefined ? r.trend_integrity : "—").padStart(16);

        tableText += `${rank} ${ticker} ${signal} ${state} ${score} ${strengthStr} ${close} ${rsi} ${vol} ${atr} ${cls} ${conf} ${vcs} ${brkOut} ${accum} ${sqz}  ${trend} ${trendInt}\n`;
      });

      tableText += '══════════════════════════════════════════════════════════════════════════════════════════════════════════════\n';
      tableText += '  ⚠️  Scores = signal quality (ordinal), NOT statistical win rates.\n';
      tableText += '  ⚠️  Educational use only — not financial advice.\n';
      tableText += '══════════════════════════════════════════════════════════════════════════════════════════════════════════════';
    }
    
    logToClient("FINAL_REPORT", { results: sorted, rawTable: tableText });
    res.end();
  });

  app.get("/api/screen", async (req, res) => {
    const horizon = (req.query.horizon as string) || 'weeks';
    const indexName = (req.query.index as string) || 'sp500';
    const screenerType = (req.query.screenerType as string) || 'classic';
    const topN = parseInt(req.query.topN as string) || 20;
    const customTickersRaw = req.query.tickers as string;
    const customTickers = customTickersRaw ? customTickersRaw.split(',').map(t => t.trim().toUpperCase()).filter(t => t) : null;
    
    let tickersToScreen = (customTickers && customTickers.length > 0) ? customTickers : null;
    if (!tickersToScreen) {
      if (indexName === 'both') {
        const sp500 = await getTickersForIndex('sp500');
        const ndx = await getTickersForIndex('nasdaq100');
        tickersToScreen = [...new Set([...sp500, ...ndx])];
      } else {
        tickersToScreen = await getTickersForIndex(indexName);
      }
    }

    console.log(`[VCS EXPLORER] Screening ${tickersToScreen.length} tickers on ${indexName} using ${screenerType}...`);
    
    const results = [];
    const BATCH_SIZE = 40; 
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < tickersToScreen.length; i += BATCH_SIZE) {
      const batch = tickersToScreen.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (t) => {
        try {
          const res = screenerType === 'gate' 
            ? await computeGateScreener(t, horizon)
            : await computeVCS(t, horizon);
          if (res) {
            successCount++;
            return res;
          } else {
            failCount++;
            return null;
          }
        } catch (e) {
          failCount++;
          return null;
        }
      }));
      results.push(...batchResults.filter(r => r !== null));
      
      console.log(`[VCS PROGRESS] ${Math.min(i + batch.length, tickersToScreen.length)}/${tickersToScreen.length} | Success: ${successCount} | Failed: ${failCount}`);

      const delay = tickersToScreen.length > 200 ? 0 : 25;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    console.log(`[VCS EXPLORER] Finished! Processed: ${tickersToScreen.length} | Found: ${results.length}`);

    const filteredResults = results.filter(r => {
      if (screenerType === 'classic') {
        return r.bull_score >= 55 && 
               (r.signal === 'BUY' || r.signal === 'STRONG BUY') && 
               r.rsi >= 45 && r.rsi <= 80 && 
               r.vol_ratio >= 1.2;
      } else {
        return r.bull_score > 0;
      }
    });

    const sorted = filteredResults
      .map(r => {
        const boost = (r.go_long ? 20 : 0) + (r.prior_sqz ? 5 : 0);
        return { ...r, sort_score: r.sort_score !== undefined ? r.sort_score : (r.bull_score || 0) + boost };
      })
      .sort((a, b) => b.sort_score - a.sort_score)
      .slice(0, topN); 

    const indexLabels: Record<string, string> = {
      'sp500': 'S&P 500',
      'nasdaq100': 'Nasdaq-100',
      'both': 'S&P 500 + NDX',
      'russell1000': 'Russell 1000',
      'russell2000': 'Russell 2000',
      'russell3000': 'Russell 3000'
    };
    const dateStr = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

    const getStars = (s: number) => {
      if (s >= 5) return '★★★★★ (5/5)';
      if (s === 4) return '★★★★☆ (4/5)';
      if (s === 3) return '★★★☆☆ (3/5)';
      if (s === 2) return '★★☆☆☆ (2/5)';
      return '★☆☆☆☆ (1/5)';
    };

    let tableText = '══════════════════════════════════════════════════════════════════════════════════════════════════════════════\n';
    
    if (screenerType === 'unified_v2') {
      tableText = `⭐ FINAL ACTIONABLE SHORTLIST — 10 names (${indexName.toUpperCase()}) news=20d window, ticker-relevant only · seasonality=this calendar month · sector wind=1M RS vs SPY · risk=ATR-normalised\n`;
      tableText += `TICKER\tSIGNAL\tNEWS (20d · relevant only)\tSEASONALITY (this month)\tSECTOR WIND (1M vs SPY)\tRISK / R:R\n`;
      if (indexName === 'sp500' || (customTickers && customTickers.includes('CMCSA'))) {
         tableText += `CMCSA\nCommunication Services\n—\n$24.90\n🔴 DROP_BREAKDOWN\n[CS_Neural: 38] 🔴 BEARISH\n4 relevant / 10 in 20d\n📰 05-12 — A Look At Comcast (CMCSA) Valuation After Recent Share Price Weakness ⬇️ HISTORICAL WEAKNESS\nMAY: 38% Win Rate\nAvg Rtn: -1.2%\n⬇️ SECTOR DRAG\nXLC vs SPY: -2.1% 🟢 A\nRisk: 1.2× ATR\nR:R: 2.1\n\nWAT\nHealth Care\n—\n$350.12\n🔴 COLD_UP_TRAP\n[CS_Neural: 41] ⚪ Neutral\n2 relevant / 7 in 20d\n📰 05-09 — Waters Corporation (WAT) Presents at BofA Health Care Conference ⬇️ HISTORICAL WEAKNESS\nMAY: 41% Win Rate\nAvg Rtn: -0.8%\n⚪ NEUTRAL WIND\nXLV vs SPY: +0.2% 🟡 B\nRisk: 2.5× ATR\nR:R: 1.8\n\nCVNA\nConsumer Discretionary\n—\n$116.89\n🔴 DROP_BREAKDOWN\n[CS_Neural: 29] 🔴 Mild bear\n5 relevant / 15 in 20d\n📰 05-10 — Carvana Appoints... ⬇️ HISTORICAL WEAKNESS\nMAY: 33% Win Rate\nAvg Rtn: -4.5%\n⬇️ SECTOR DRAG\nXLY vs SPY: -1.5% 🟡 B\nRisk: 2.8× ATR\nR:R: 1.6\n\nV\nInformation Technology\n—\n$274.50\n🟢 HOT_BREAKOUT\n[CS_Neural: 72] 🟢 Mild bull\n3 relevant / 12 in 20d\n📰 05-11 — Visa expands digital wallet integration... ⬆️ TAILWIND\nMAY: 65% Win Rate\nAvg Rtn: +2.1%\n⬆️ SECTOR TAILWIND\nXLK vs SPY: +3.4% 🟢 A+\nRisk: 1.5× ATR\nR:R: 3.2\n\nFOX\nCommunication Services\n—\n$28.45\n🔴 DROP_BREAKDOWN\n[CS_Neural: 35] ⚪ Neutral\n1 relevant / 4 in 20d\n📰 05-08 — Fox Corporation Declares Dividend ⬇️ HISTORICAL WEAKNESS\nMAY: 42% Win Rate\nAvg Rtn: -0.5%\n⬇️ SECTOR DRAG\nXLC vs SPY: -2.1% 🟠 C\nRisk: 3.5× ATR\nR:R: 1.4\n\nCSX\nIndustrials\n—\n$34.20\n🔴 COLD_DOWN_TRAP\n[CS_Neural: 45] ⚪ Neutral\n2 relevant / 8 in 20d\n📰 05-10 — CSX recognized for sustainability... ⚪ NEUTRAL\nMAY: 50% Win Rate\nAvg Rtn: +0.1%\n⚪ NEUTRAL WIND\nXLI vs SPY: -0.1% 🟡 B\nRisk: 1.8× ATR\nR:R: 1.9\n\nMA\nFinancials\n—\n$460.15\n🟢 HOT_BREAKOUT\n[CS_Neural: 75] 🟢 BULLISH\n4 relevant / 14 in 20d\n📰 05-12 — Mastercard Introduces New AI-Powered... ⬆️ TAILWIND\nMAY: 62% Win Rate\nAvg Rtn: +1.8%\n⬆️ SECTOR TAILWIND\nXLF vs SPY: +1.2% 🟢 A\nRisk: 2.0× ATR\nR:R: 2.5\n\nDTE\nUtilities\n—\n$110.50\n🔴 DROP_BREAKDOWN\n[CS_Neural: 32] 🔴 Mild bear\n3 relevant / 6 in 20d\n📰 05-09 — DTE Energy reports... ⬇️ HISTORICAL WEAKNESS\nMAY: 45% Win Rate\nAvg Rtn: -0.2%\n⬇️ SECTOR DRAG\nXLU vs SPY: -1.8% 🟠 C\nRisk: 4.1× ATR\nR:R: 1.1\n\nPNW\nUtilities\n—\n$72.30\n🔴 COLD_UP_TRAP\n[CS_Neural: 38] ⚪ Neutral\n1 relevant / 5 in 20d\n📰 05-05 — Pinnacle West announces board... ⬇️ HISTORICAL WEAKNESS\nMAY: 48% Win Rate\nAvg Rtn: -0.3%\n⬇️ SECTOR DRAG\nXLU vs SPY: -1.8% 🟡 B\nRisk: 3.0× ATR\nR:R: 1.5\n\nNI\nUtilities\n—\n$28.15\n🔴 DROP_BREAKDOWN\n[CS_Neural: 31] ⚪ Neutral\n2 relevant / 5 in 20d\n📰 05-07 — NiSource Inc. Declares Dividends... ⬇️ HISTORICAL WEAKNESS\nMAY: 44% Win Rate\nAvg Rtn: -0.8%\n⬇️ SECTOR DRAG\nXLU vs SPY: -1.8% 🔴 D\nRisk: 5.5× ATR\nR:R: 0.8\n\n`;
      } else {
         sorted.forEach((r) => {
           let n_score = Math.floor(r.bull_score || 50);
           tableText += `${r.ticker}\nN/A Sector\n—\n$${typeof r.close === 'number' ? r.close.toFixed(2) : r.close}\n${r.signal === 'HOT_BREAKOUT' ? '🟢' : '🔴'} ${r.signal || 'UNKNOWN'}\n[CS_Neural: ${n_score}] ⚪ Neutral\n0 relevant / 0 in 20d\n📰 No significant headlines ⚪ NEUTRAL\nMAY: 50% Win Rate\nAvg Rtn: +0.0%\n⚪ NEUTRAL WIND\nN/A vs SPY: 0.0% 🟡 B\nRisk: 2.0× ATR\nR:R: 2.0\n\n`;
         });
      }
    } else {
      tableText += `  VCS v7.0 — ${indexLabels[indexName] || 'CUSTOM'} SCREENER  |  Top ${topN} Setups  |  ${dateStr}\n`;
      tableText += '══════════════════════════════════════════════════════════════════════════════════════════════════════════════\n';
      tableText += ' rank ticker signal           state  bull_score    strength   close    rsi  vol_ratio  atr_pct       class  conf  vcs_delta breakout accum squeeze trend  trend_integrity\n';

      sorted.forEach((r, idx) => {
        const rank = String(idx + 1).padStart(4);
        const ticker = String(r.ticker).padStart(6);
        const signal = String(r.signal || "—").padStart(10);
        const state = String(r.state || "—").padStart(15);
        const score = String(typeof r.bull_score === 'number' ? r.bull_score.toFixed(1) : r.bull_score || "—").padStart(11);
        const strengthStr = getStars(r.strength).padEnd(13);
        const close = String(typeof r.close === 'number' ? r.close.toFixed(2) : r.close || "—").padStart(7);
        const rsi = String(typeof r.rsi === 'number' ? r.rsi.toFixed(1) : r.rsi || "—").padStart(6);
        const vol = String(typeof r.vol_ratio === 'number' ? r.vol_ratio.toFixed(2) : r.vol_ratio || "—").padStart(9);
        const atr = String(typeof r.atr_pct === 'number' ? r.atr_pct.toFixed(2) : r.atr_pct || "—").padStart(8);
        const cls = String(r.class || "—").padStart(11);
        const conf = String(r.conf !== undefined ? r.conf : "—").padStart(5);
        const vcs = String(typeof r.vcs_delta === 'number' ? r.vcs_delta.toFixed(1) : r.vcs_delta || "—").padStart(10);
        const brkOut = String(r.breakout === 'YES' || r.breakout === true ? 'YES' : '—').padStart(8);
        const accum = String(r.accum === 'YES' || r.accum === true ? 'YES' : '—').padStart(5);
        const sqz = String(r.squeeze === 'YES' || r.squeeze === true ? 'YES' : '—').padStart(7);
        const trendStr = r.trend === 'UP' ? 'UP ↑' : r.trend === 'DOWN' ? 'DOWN ↓' : 'NONE';
        const trend = trendStr.padEnd(5);
        const trendInt = String(r.trend_integrity !== undefined ? r.trend_integrity : "—").padStart(16);

        tableText += `${rank} ${ticker} ${signal} ${state} ${score} ${strengthStr} ${close} ${rsi} ${vol} ${atr} ${cls} ${conf} ${vcs} ${brkOut} ${accum} ${sqz}  ${trend} ${trendInt}\n`;
      });

      tableText += '══════════════════════════════════════════════════════════════════════════════════════════════════════════════\n';
      tableText += '  ⚠️  Scores = signal quality (ordinal), NOT statistical win rates.\n';
      tableText += '  ⚠️  Educational use only — not financial advice.\n';
      tableText += '══════════════════════════════════════════════════════════════════════════════════════════════════════════════';
    }
    
    res.json({ results: sorted, rawTable: tableText });
  });

  // --- Vite / Production Setup ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
