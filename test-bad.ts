import https from 'https';

function fetchYahoo(ticker: string): Promise<number> {
  return new Promise((resolve, reject) => {
    https.get(`https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1mo`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.chart.error) {
              console.log(json.chart.error);
              resolve(0);
          } else {
              resolve(json.chart.result[0].timestamp.length);
          }
        } catch(e) { resolve(0); }
      });
    }).on('error', () => resolve(0));
  });
}

async function run() {
  const tickers = ['AAPL','MSFT','NVDA','AMZN','META','GOOGL','GOOG','TSLA','AVGO','COST','NFLX','TMUS','AMD','LIN','CSCO','ADBE','PEP','INTU','TXN','QCOM','HON','AMGN','AMAT','ISRG','BKNG','SBUX','GILD','MDLZ','ADI','VRTX','MU','REGN','LRCX','KLAC','MELI','SNPS','CDNS','PANW','ABNB','CRWD','MRVL','ADP','ORLY','MAR','FTNT','CTAS','WDAY','CEG','PAYX','KDP','MRNA','ODFL','PCAR','MNST','DXCM','FAST','ROST','CPRT','KHC','GEHC','DDOG','TEAM','IDXX','EXC','AEP','BKR','XEL','EA','CTSH','NXPI','ON','FANG','ZS','MCHP','ANSS','BIIB','TTD','VRSK','ILMN','DLTR','ALGN','ENPH','OKTA','MTCH','SWKS','ZBRA','NTNX','PAYC','LULU','EBAY','PDD','JD','BIDU','BILI','NTES','CSGP','ACGL','FSLR','ARM','DASH','ROP','CSX','UAL'];
  for (const t of tickers) {
     const n = await fetchYahoo(t);
     if (n < 5) console.log('INVALID:', t);
  }
}
run();
