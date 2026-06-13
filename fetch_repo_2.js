import fs from 'fs';

async function download(url, filename) {
  try {
    console.log(`Downloading ${url}...`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
    }
    const text = await res.text();
    fs.writeFileSync(filename, text, 'utf-8');
    console.log(`Successfully saved to ${filename}`);
  } catch (err) {
    console.error(`Error downloading ${url}:`, err);
  }
}

async function run() {
  await download('https://raw.githubusercontent.com/researchshipper/equity/update/lib/indicators_v2.js', 'indicators_v2_raw.js');
}

run();
