import fs from 'fs';
import path from 'path';

const baseUrl = 'https://raw.githubusercontent.com/researchshipper/equity/main/fullscrneer';
const files = [
  'README.md',
  'config.js',
  'neuralmd.js',
  'screener.js',
  'lib/analyst.js',
  'lib/indicators.js',
  'lib/macro.js',
  'lib/rating.js',
  'lib/report.js',
  'lib/risk.js',
  'lib/sanity.js',
  'lib/technical.js',
  'lib/universe.js'
];

async function download(file) {
  const url = `${baseUrl}/${file}`;
  const filePath = path.join('fullscrneer', file);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  console.log(`Downloading ${url} -> ${filePath}...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  }
  const text = await res.text();
  fs.writeFileSync(filePath, text, 'utf-8');
}

async function run() {
  for (const f of files) {
    await download(f);
  }
  console.log('Done downloading fullscrneer!');
}

run();
