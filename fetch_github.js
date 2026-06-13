import fs from 'fs';

async function fetchGithubTree() {
  const urls = [
    'https://raw.githubusercontent.com/researchshipper/equity/finalupdate/screener/SCREENER_MASTER.md',
    'https://raw.githubusercontent.com/researchshipper/equity/finalupdate/README.md'
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`\n--- ${url} ---\n`, await res.text());
      } else {
        console.log(`Failed to fetch ${url} - ${res.status}`);
      }
    } catch (e) {
      console.error(e);
    }
  }
}
fetchGithubTree();
