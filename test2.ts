import yahooFinanceImport from 'yahoo-finance2';
const YahooFinance = "default" in yahooFinanceImport ? (yahooFinanceImport as any).default : yahooFinanceImport;
const yahooFinance = new YahooFinance();

async function test2() {
  const qs = await yahooFinance.quoteSummary('ADBE', { modules: ['calendarEvents', 'earningsTrend'] }, { validateResult: false });
  console.log(JSON.stringify(qs, null, 2));
}

async function test3() {
  const qs = await yahooFinance.quoteSummary('NVDA', { modules: ['calendarEvents', 'earningsTrend', 'earningsHistory'] }, { validateResult: false });
  console.log("NVDA:");
  console.log(JSON.stringify(qs.earningsTrend?.trend?.[0], null, 2));
  console.log(JSON.stringify(qs.earningsHistory?.history?.[qs.earningsHistory?.history?.length - 1], null, 2));
}

test2();
test3();
