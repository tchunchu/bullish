import yahooFinanceImport from 'yahoo-finance2';
const yahooFinance = "default" in yahooFinanceImport ? new (yahooFinanceImport as any).default() : new (yahooFinanceImport as any)();

async function fetchFromYahoo(ticker: string, days: number = 120) {
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
    console.error(`fetchFromYahoo error for ${ticker}:`, e.message);
    return null;
  }
}

const runNode = async () => {
    try {
        const res = await fetch("http://localhost:3000/api/run-python", {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ code: `
import numpy as np
print(np.__version__)
            `})
        });
        console.log(res.status);
        console.log(await res.text());
    } catch(err) {
        console.error(err);
    }
}
runNode();

