import yahooFinance from 'yahoo-finance2';

async function fetchFromStooq(ticker: string, days: number = 120) {
  try {
    const stooqTicker = ticker.replace("-", ".").toLowerCase();
    
    // Explicitly use the daily CSV URL requested
    const url = `https://stooq.com/q/d/l/?s=${stooqTicker}.us&i=d`;
    console.log(url);
    const res = await fetch(url, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "text/csv,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      }
    });
    
    if (!res.ok) return null;
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

async function test() {
  const tickers = ['AAPL','MSFT','NVDA','AMZN','META','GOOGL','GOOG','TSLA','AVGO','COST','NFLX','TMUS','AMD','LIN','CSCO','ADBE','PEP','INTU','TXN','QCOM','HON','AMGN','AMAT','ISRG','BKNG','SBUX','GILD','MDLZ','ADI','VRTX','MU','REGN','LRCX','KLAC','MELI','SNPS','CDNS','PANW','ABNB','CRWD','MRVL','ADP','ORLY','MAR','FTNT','CTAS','WDAY','CEG','PAYX','KDP','MRNA','ODFL','PCAR','MNST','DXCM','FAST','ROST','CPRT','KHC','GEHC','DDOG','TEAM','IDXX','EXC','AEP','BKR','XEL','EA','CTSH','NXPI','ON','FANG','ZS','MCHP','ANSS','BIIB','TTD','VRSK','ILMN','DLTR','ALGN','ENPH','OKTA','MTCH','SWKS','ZBRA','NTNX','PAYC','LULU','EBAY','PDD','JD','BIDU','BILI','NTES','CSGP','ACGL','FSLR','ARM','DASH','ROP','CSX','UAL'];
  let failed = [];
  for (let t of tickers) {
    let yFailed = false;
    try {
      await yahooFinance.historical(t, { period1: new Date('2024-01-01') });
    } catch {
      yFailed = true;
    }

    if (yFailed) {
        let s = await fetchFromStooq(t);
        if (!s || s.quotes.length < 50) {
            console.log("Failed BOTH:", t);
            failed.push(t);
        }
    }
  }
  console.log("Overall failed:", failed);
}
test();
