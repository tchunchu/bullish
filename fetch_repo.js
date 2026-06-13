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
  await download('https://raw.githubusercontent.com/researchshipper/equity/update/screener/screener_v5.js', 'screener_v5_raw.js');
  await download('https://raw.githubusercontent.com/researchshipper/equity/update/lib/setups.js', 'setups_raw.js');
}

run();
