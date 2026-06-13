import yahooFinanceImport from 'yahoo-finance2';
const YahooFinance = "default" in yahooFinanceImport ? (yahooFinanceImport as any).default : yahooFinanceImport;
const yahooFinance = new YahooFinance();

async function test() {
  const qs = await yahooFinance.quoteSummary('ADBE', { modules: ['calendarEvents', 'earningsHistory', 'financialData', 'price', 'earningsTrend'] }, { validateResult: false });
  console.log('Calendar Events:');
  console.log(JSON.stringify(qs.calendarEvents, null, 2));
  console.log('Earnings History last:');
  console.log(JSON.stringify(qs.earningsHistory?.history?.[qs.earningsHistory?.history?.length - 1], null, 2));
  if (qs.earningsTrend) {
     console.log('Earnings Trend:');
     console.log(JSON.stringify(qs.earningsTrend.trend?.[0], null, 2));
  }
}
test();
