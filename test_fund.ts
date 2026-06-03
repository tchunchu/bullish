import yahooFinanceImport from 'yahoo-finance2';
const YahooFinance = "default" in yahooFinanceImport ? (yahooFinanceImport as any).default : yahooFinanceImport;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

async function run() {
  try {
    const result = await yahooFinance.fundamentalsTimeSeries('AAPL', { period1: "2023-01-01", module: "financials", type: "quarterly" });
    console.log(JSON.stringify(result, null, 2));
  } catch(e) { console.log(e); }
}
run();
