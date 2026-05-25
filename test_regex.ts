const text = `
### B. Valuation Multiples Comparison Table
| Metric | ANET | CSCO | JNPR | Sector Avg |
|--------|----------|----------|----------|------------|
| Stock Price | $293.45 | $47.32 | $35.10 | $125.00 |

### C. Fair Value Calculation Steps
Some stuff.

## 4. 🏦 INSIDER ACTIVITY (Last 6 Months)
`;

const match = text.match(/(?:^|\n)(##\s*\d+\.\s*👥\s*[^#\n]*?(?:PEER\s*COMPARISON|VALUATION|OPERATIONAL)[^\n]*|###\s*B\.\s*Valuation\s*Multiples\s*Comparison\s*Table)/gi);
console.log("MATCH:", match);

if (match) {
  let headerText = '';
  let firstIdx = -1;
  for (const m of match) {
	const idx = text.indexOf(m);
	if (idx !== -1 && (firstIdx === -1 || idx < firstIdx)) {
	  firstIdx = idx;
	  headerText = m;
	}
  }
  console.log("firstIdx:", firstIdx);
  console.log("headerText:", headerText);

  const remaining = text.substring(firstIdx);
  const nextSectionMatch = remaining.substring(headerText.length).match(
    headerText.includes('###') 
      ? /(?:^|\n)(##\s+\d+|###\s+[C-Z]\.)/i 
      : /(?:^|\n)(##\s+\d+\.)/i
  );
  console.log("nextSectionMatch:", nextSectionMatch);
  if (nextSectionMatch) {
	const endIdx = headerText.length + nextSectionMatch.index;
	const peerSection = remaining.substring(0, endIdx);
	console.log("peerSection:\n", peerSection);
  }
}


