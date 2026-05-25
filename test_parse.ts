import fs from 'fs';

const markdownSection = `
### B. Valuation Multiples Comparison Table
| Metric | ANET | CSCO | JNPR | Sector Avg |
|--------|----------|----------|----------|------------|
| Stock Price | $293.45 | $47.32 | $35.10 | $125.00 |
| Trailing P/E | 44.5 | 15.2 | 12.5 | 24.0 |
| Forward P/E | 38.2 | 14.5 | 11.2 | 22.0 |
| PEG Ratio | 1.8 | 2.1 | 1.9 | 1.9 |
| Revenue Growth YoY | 16.5% | 3.2% | -2.1% | 5.0% |
| Net Margin | 34.2% | 22.1% | 15.6% | 20.0% |
| EV / EBITDA | 28.5 | 10.2 | 8.5 | 15.0 |
| Free Cash Flow Yield | 2.5% | 6.5% | 8.2% | 5.0% |
`;

const lines = markdownSection.split('\n');
let tableHeaderIdx = -1;
let isMultiStockLayout = false;

// Scan for columns as tickers or metrics
for (let i = 0; i < lines.length; i++) {
  const l = lines[i].trim();
  if (l.startsWith('|')) {
	const lLower = l.toLowerCase();
	if (lLower.includes('metric')) {
	  tableHeaderIdx = i;
	  isMultiStockLayout = false;
	  break;
	} else if (lLower.includes('ticker') || lLower.includes('company')) {
	  tableHeaderIdx = i;
	  isMultiStockLayout = true;
	  break;
	}
  }
}

if (tableHeaderIdx === -1) {
  console.log('No table found');
  process.exit();
}

const parseNumValue = (valStr) => {
  if (!valStr) return null;
  let s = valStr.trim();
  s = s.replace(/[\$%xX,]/g, '');
  if (s.toUpperCase().endsWith('B')) s = s.substring(0, s.length - 1);
  if (s.toUpperCase().endsWith('M')) s = s.substring(0, s.length - 1);
  const match = s.match(/-?\d+(?:\.\d+)?/);
  if (match) {
	return parseFloat(match[0]);
  }
  return null;
};

const headerParts = lines[tableHeaderIdx]
  .split('|')
  .map(s => s.trim())
  .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

let dataPoints = [];
let columns = [];
let rows = [];

if (!isMultiStockLayout) {
  columns = headerParts.slice(1);
  for (let i = tableHeaderIdx + 2; i < lines.length; i++) {
	const l = lines[i].trim();
	if (!l.startsWith('|')) {
	  if (rows.length > 0) break;
	  continue;
	}
	const cells = l
	  .split('|')
	  .map(s => s.trim())
	  .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
	
	if (cells.length > 0) {
	  rows.push({
		metric: cells[0],
		values: cells.slice(1)
	  });
	}
  }

  let peRow = null;
  let growthRow = null;
  let marginRow = null;

  for (const r of rows) {
	const mLower = r.metric.toLowerCase();
	if (mLower.includes('p/e') || /\bpe\b/.test(mLower) || mLower.includes('multiple') || mLower.includes('ev/')) {
	  if (mLower.includes('forward')) {
		peRow = r.values;
	  } else if (!peRow) {
		peRow = r.values;
	  }
	}
	if (mLower.includes('growth') || mLower.includes('cagr') || mLower.includes('yoy') || mLower.includes('rev')) {
	  if (mLower.includes('revenue') || mLower.includes('sales')) {
		growthRow = r.values;
	  } else if (!growthRow) {
		growthRow = r.values;
	  }
	}
	if (mLower.includes('margin')) {
	  if (mLower.includes('net')) {
		marginRow = r.values;
	  } else if (!marginRow && (mLower.includes('gross') || mLower.includes('operating'))) {
		marginRow = r.values;
	  }
	}
  }

  console.log("rows:", rows);
  console.log("peRow:", peRow);
  console.log("growthRow:", growthRow);

  dataPoints = columns.map((colName, idx) => {
	const pe = parseNumValue(peRow?.[idx]);
	const growth = parseNumValue(growthRow?.[idx]);
	const margin = parseNumValue(marginRow?.[idx]);

	return {
	  name: colName,
	  pe: pe !== null ? pe : (peRow?.[idx] ? 0 : 0),
	  growth: growth !== null ? growth : (growthRow?.[idx] ? 0 : 0),
	  margin: margin,
	  rawPe: peRow?.[idx] || 'N/A',
	  rawGrowth: growthRow?.[idx] || 'N/A',
	  rawMargin: marginRow?.[idx] || 'N/A'
	};
  }).filter(dp => dp.name && dp.name.trim() !== '---' && (dp.rawPe !== 'N/A' || dp.rawGrowth !== 'N/A'));

}
console.log("dataPoints:", dataPoints);
