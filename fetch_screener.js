import fs from 'fs';

async function fetchGithubFile(path) {
  const url = `https://raw.githubusercontent.com/researchshipper/equity/finalupdate/${path}`;
  const res = await fetch(url);
  const text = await res.text();
  console.log(`\n--- ${path} ---\n`, text);
}

async function run() {
  await fetchGithubFile('screener/screener_v5.js');
  await fetchGithubFile('lib/setups.js');
}
run();
