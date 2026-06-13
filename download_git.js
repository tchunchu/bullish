import fs from 'fs';
import path from 'path';

async function download(url, filePath) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    fs.writeFileSync(filePath, text);
    console.log(`Saved ${filePath}`);
  } catch (err) {
    console.error(`Failed ${filePath}:`, err.message);
  }
}

const baseUrl = 'https://raw.githubusercontent.com/researchshipper/equity/finalupdate';
const files = [
  'screener/screener_v5.js',
  'screener/universe.js',
  'screener/render_v5.js',
  'screener/lint_pass2.js',
  'screener/SCREENER_MASTER.md',
  'lib/indicators.js',
  'lib/indicators_v2.js',
  'lib/regime.js',
  'lib/setups.js',
  'lib/scorecard.js'
];

async function run() {
  for (const f of files) {
    await download(`${baseUrl}/${f}`, f);
  }
}
run();
