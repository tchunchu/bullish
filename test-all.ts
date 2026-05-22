import yahooFinance from 'yahoo-finance2';

async function test() {
  const tickers = ['AAPL','MSFT','NVDA','AMZN','META','GOOGL','GOOG','TSLA','AVGO','COST','NFLX','TMUS','AMD','LIN','CSCO','ADBE','PEP','INTU','TXN','QCOM','HON','AMGN','AMAT','ISRG','BKNG','SBUX','GILD','MDLZ','ADI','VRTX','MU','REGN','LRCX','KLAC','MELI','SNPS','CDNS','PANW','ABNB','CRWD','MRVL','ADP','ORLY','MAR','FTNT','CTAS','WDAY','CEG','PAYX','KDP','MRNA','ODFL','PCAR','MNST','DXCM','FAST','ROST','CPRT','KHC','GEHC','DDOG','TEAM','IDXX','EXC','AEP','BKR','XEL','EA','CTSH','NXPI','ON','FANG','ZS','MCHP','ANSS','BIIB','TTD','VRSK','ILMN','DLTR','ALGN','ENPH','OKTA','MTCH','SWKS','ZBRA','NTNX','PAYC','LULU','EBAY','PDD','JD','BIDU','BILI','NTES','CSGP','ACGL','FSLR','ARM','DASH','ROP','CSX','UAL'];
  let failed = [];
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 200);
  for (let t of tickers) {
    try {
      let r = (await yahooFinance.historical(t, { period1: start })) as any;
      if (!r || r.length < 30) failed.push(t);
    } catch {
      failed.push(t);
    }
  }
  console.log("Failed in YF:", failed);
}
test();
