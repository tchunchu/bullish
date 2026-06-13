/**
 * universe.js — Fetch index constituent tickers
 */

import https from 'https';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return resolve(fetchUrl(res.headers.location));
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

const NDX100 = [
  "AAPL","ABNB","ADBE","ADI","ADP","ADSK","AEP","AMAT","AMGN","AMZN",
  "ANSS","APP","ARM","ASML","AVGO","AXON","AZN","BIIB","BKNG","BKR",
  "CDNS","CDW","CEG","CHTR","CMCSA","COIN","CPRT","CRWD","CTAS",
  "CTSH","DASH","DDOG","DLTR","DXCM","EA","EXC","FANG","FAST","FTNT",
  "GEHC","GILD","GOOG","GOOGL","HON","IDXX","ILMN","INTC","INTU","ISRG",
  "KDP","KHC","KLAC","LIN","LRCX","LULU","MAR","MCHP","MDB","MDLZ",
  "MELI","META","MNST","MRVL","MSFT","MU","NFLX","NVDA","NXPI","ODFL",
  "ON","ORLY","PANW","PAYX","PCAR","PDD","PEP","PLTR","PYPL","QCOM",
  "REGN","ROP","ROST","SBUX","SMCI","SNPS","TEAM","TMUS","TSLA","TTD",
  "TTWO","TXN","UAL","VRTX","VRSK","VRNT","WBD","WDAY","XEL","ZS"
];

const DEFAULT_UNIVERSE = [
  "AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","AVGO","TSM","AMD","ASML",
  "CRM","ADBE","NFLX","NOW","UBER","INTU","WDAY","SNOW","PLTR","DDOG","CRWD","PANW",
  "ZS","NET","MDB","TEAM","HUBS","SHOP","MELI","CPNG","SE","BABA","JD","PDD",
  "QCOM","TXN","INTC","AMAT","LRCX","MU","KLAC","ARM","MRVL","SMCI","VRT","ANET",
  "CEG","VST","TLN","GEV","CCJ","UUUU","BWXT","LEU",
  "RDW","LUNR","ASTS","RKLB","SPIR","BKSY","PL","MAXR",
  "RTX","LMT","GD","NOC","AVAV","KTOS",
  "CLSK","MARA","RIOT","IREN","CORZ","WULF","CIFR",
  "JPM","BAC","GS","MS","V","MA","UNH","JNJ","PG","KO",
  "WMT","HD","COST","DIS","CMCSA","TMO","ABT","LLY","MRK"
];

async function getSP500() {
  try {
    const raw = await fetchUrl('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies');
    const tickers = new Set();
    const tableStart = raw.indexOf('id="constituents"');
    if (tableStart === -1) throw new Error("Constituents table not found");
    const tableHtml = raw.substring(tableStart, tableStart + 200000);
    const lines = tableHtml.split('<tr');
    for (let i = 2; i < lines.length; i++) {
      const row = lines[i];
      const cellMatch = row.match(/>\s*<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/i);
      if (cellMatch) {
        let text = cellMatch[1].replace(/<[^>]*>/g, '').trim();
        text = text.replace('.', '-');
        if (text && /^[A-Z\-]+$/.test(text) && text.length <= 5) tickers.add(text);
      }
    }
    if (tickers.size < 100) throw new Error("Too few tickers extracted");
    return Array.from(tickers);
  } catch (e) {
    console.log(`[UNIVERSE] Error extracting SP500: ${e.message}, using default`);
    return DEFAULT_UNIVERSE;
  }
}

async function getRussell1000() {
  try {
    const raw = await fetchUrl('https://www.slickcharts.com/russell1000');
    const tickers = new Set();
    const regex = /<a href="\/symbol\/([A-Z]+)"/g;
    let match;
    while ((match = regex.exec(raw)) !== null) tickers.add(match[1]);
    if (tickers.size < 200) throw new Error("Too few");
    return Array.from(tickers);
  } catch (e) {
    console.log(`[UNIVERSE] Russell 1000 fetch failed: ${e.message}, using SP500 as proxy`);
    return getSP500();
  }
}

async function getRussell2000() {
  try {
    const raw = await fetchUrl('https://www.slickcharts.com/russell2000');
    const tickers = new Set();
    const regex = /<a href="\/symbol\/([A-Z]+)"/g;
    let match;
    while ((match = regex.exec(raw)) !== null) tickers.add(match[1]);
    if (tickers.size < 200) throw new Error("Too few");
    return Array.from(tickers);
  } catch (e) {
    console.log(`[UNIVERSE] Russell 2000 fetch failed: ${e.message}, using default`);
    return DEFAULT_UNIVERSE;
  }
}

function getNDX100() { return NDX100; }

export async function getUniverse(name) {
  switch (name) {
    case 'sp500': console.log('[UNIVERSE] Loading S&P 500...'); return getSP500();
    case 'russell1000': console.log('[UNIVERSE] Loading Russell 1000...'); return getRussell1000();
    case 'russell2000': console.log('[UNIVERSE] Loading Russell 2000...'); return getRussell2000();
    case 'ndx100': console.log('[UNIVERSE] Loading NDX 100...'); return getNDX100();
    default: console.log('[UNIVERSE] Using default curated universe...'); return DEFAULT_UNIVERSE;
  }
}

export { DEFAULT_UNIVERSE, NDX100 };
