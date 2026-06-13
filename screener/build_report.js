const fs = require('fs');
const path = require('path');

const DUMP_PATH = path.join(__dirname, 'screener_dump.json');
const LLM_PATH = path.join(__dirname, 'pass2.json');
const LOG_PATH = path.join(__dirname, 'screener_log.jsonl');
const OUTPUT_PATH = path.join(__dirname, 'screener_report_v5.html');

// 1. Read files
if (!fs.existsSync(DUMP_PATH)) {
    console.error("❌ Missing screener_dump.json");
    process.exit(1);
}
const dumpData = JSON.parse(fs.readFileSync(DUMP_PATH, 'utf8'));

let llmData = [];
if (fs.existsSync(LLM_PATH)) {
    llmData = JSON.parse(fs.readFileSync(LLM_PATH, 'utf8'));
} else {
    console.warn("⚠️ pass2.json not found. Report will only show basic quantitative data.");
}

// 2. Read the Log (screener_log.jsonl)
let logLines = [];
if (fs.existsSync(LOG_PATH)) {
    const rawLog = fs.readFileSync(LOG_PATH, 'utf8');
    logLines = rawLog.split('\n').filter(line => line.trim() !== '').map(line => {
        try { return JSON.parse(line); } catch (e) { return null; }
    }).filter(Boolean);
}

const generatedAt = dumpData.generatedAt || new Date().toISOString();

// 3. Merge Daily Data for Report
let mergedCandidates = dumpData.candidates.map(dumpItem => {
    const llmItem = llmData.find(c => c.sym === dumpItem.sym) || {};
    return {
        sym: dumpItem.sym,
        state: dumpItem.setup.state,
        entry: dumpItem.setup.entry,
        stop: dumpItem.setup.stop,
        t1: dumpItem.setup.t1,
        conviction: llmItem.conviction || 'N/A',
        hold: llmItem.hold || 'N/A',
        thesis: llmItem.thesis || 'Pending AI reasoning...',
        invalidation: llmItem.invalidation || 'N/A',
        fuel: llmItem.fuel || 'N/A',
        score: dumpItem.setup.score
    };
});

// Sort by conviction if available, then by quant score
mergedCandidates.sort((a, b) => {
    const convA = a.conviction === 'N/A' ? 0 : a.conviction;
    const convB = b.conviction === 'N/A' ? 0 : b.conviction;
    if (convB !== convA) return convB - convA;
    return b.score - a.score;
});

// 4. Build HTML
const getScoreClass = (score) => {
    if (score === 'N/A') return "";
    if (score >= 7) return "score-high";
    if (score >= 5) return "score-med";
    return "score-low";
};

const getBadgeClass = (state) => {
    if (state === "TRIGGERED") return "badge-triggered";
    if (state === "COILING") return "badge-coiling";
    return "badge-none";
};

const dailyRows = mergedCandidates.map(c => `
    <tr>
        <td><strong>${c.sym}</strong></td>
        <td><span class="badge ${getBadgeClass(c.state)}">${c.state}</span></td>
        <td><span class="${getScoreClass(c.conviction)}">${c.conviction !== 'N/A' ? c.conviction + ' / 10' : 'N/A'}</span></td>
        <td>${c.hold}</td>
        <td>${c.entry.toFixed(2)} &rarr; ${c.stop.toFixed(2)} &rarr; ${c.t1.toFixed(2)}</td>
        <td class="thesis-cell"><strong>Thesis:</strong> ${c.thesis}<br><span class="fuel-text"><strong>Catalyst:</strong> ${c.fuel}</span></td>
        <td class="invalidation-cell">${c.invalidation}</td>
    </tr>
`).join('');

// Reverse log for chronological descending display
const sortedLog = [...logLines].sort((a, b) => new Date(b.date) - new Date(a.date));
const logRows = sortedLog.map(l => `
    <tr>
        <td>${l.date.split('T')[0]}</td>
        <td><strong>${l.sym}</strong></td>
        <td><span class="badge badge-triggered">TRIGGERED</span></td>
        <td>${l.entry ? l.entry.toFixed(2) : 'N/A'}</td>
        <td>${l.stop ? l.stop.toFixed(2) : 'N/A'}</td>
        <td>${l.t1 ? l.t1.toFixed(2) : 'N/A'}</td>
        <td>${l.rs ? l.rs.toFixed(2) + '%' : 'N/A'}</td>
    </tr>
`).join('');

const isRiskOff = dumpData.regime.regime === 'RISK_OFF' ? 'regime-off' : '';

const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Screener Report - v5</title>
    <style>
        :root {
            --bg-color: #f4f7fa; --container-bg: #ffffff; --text-color: #333333;
            --header-bg: #2c3e50; --header-text: #ffffff; --table-header: #34495e;
            --table-row-even: #f8f9fa; --border-color: #e0e0e0;
            --highlight-green: #27ae60; --highlight-red: #c0392b;
            --highlight-yellow: #f39c12; --highlight-blue: #2980b9;
        }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: var(--bg-color); color: var(--text-color); margin: 0; padding: 20px; line-height: 1.6; }
        .container { max-width: 1200px; margin: 0 auto; background-color: var(--container-bg); border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; padding: 20px; }
        header { background-color: var(--header-bg); color: var(--header-text); padding: 20px; border-radius: 6px; margin-bottom: 20px; }
        h1 { margin: 0 0 10px 0; font-size: 24px; }
        h2 { font-size: 20px; border-bottom: 2px solid var(--border-color); padding-bottom: 5px; margin-top: 40px; color: var(--table-header); }
        .regime-banner { display: inline-block; background-color: var(--highlight-green); color: white; padding: 5px 12px; border-radius: 4px; font-weight: bold; font-size: 14px; }
        .regime-off { background-color: var(--highlight-red); }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid var(--border-color); }
        th { background-color: var(--table-header); color: white; font-weight: 600; font-size: 14px; text-transform: uppercase; }
        tbody tr:nth-child(even) { background-color: var(--table-row-even); }
        tbody tr:hover { background-color: #edf2f7; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; text-align: center; }
        .badge-triggered { background-color: #d4edda; color: #155724; }
        .badge-coiling { background-color: #fff3cd; color: #856404; }
        .badge-none { background-color: #e2e3e5; color: #383d41; }
        .score-high { color: var(--highlight-green); font-weight: bold; }
        .score-med { color: var(--highlight-yellow); font-weight: bold; }
        .score-low { color: var(--highlight-red); font-weight: bold; }
        .thesis-cell { font-size: 13px; max-width: 350px; }
        .invalidation-cell { font-size: 13px; max-width: 200px; color: #666; font-style: italic; }
        .fuel-text { color: var(--highlight-blue); font-size: 12px; display: block; margin-top: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Quantitative Screener Output (v5)</h1>
            <div class="regime-banner ${isRiskOff}">
                REGIME: ${dumpData.regime.regime} (Score: ${dumpData.regime.score}) | Exposure: ${dumpData.regime.exposure}x
            </div>
            <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.8;">Generated: ${new Date(generatedAt).toLocaleString()}</p>
        </header>

        <h2>Today's Screener Results</h2>
        <table>
            <thead>
                <tr>
                    <th>Ticker</th>
                    <th>State</th>
                    <th>Conviction</th>
                    <th>Hold Time</th>
                    <th>Levels (Entry → Stop → T1)</th>
                    <th>Thesis & Catalyst</th>
                    <th>Invalidation</th>
                </tr>
            </thead>
            <tbody>
                ${dailyRows}
            </tbody>
        </table>

        <h2>Historical Trigger Tracker (screener_log.jsonl)</h2>
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Ticker</th>
                    <th>State</th>
                    <th>Entry Price</th>
                    <th>Stop Loss</th>
                    <th>Target 1</th>
                    <th>Relative Strength</th>
                </tr>
            </thead>
            <tbody>
                ${logRows}
            </tbody>
        </table>
    </div>
</body>
</html>`;

fs.writeFileSync(OUTPUT_PATH, htmlTemplate);
console.log('✅ Successfully generated unified HTML report at: ' + OUTPUT_PATH);