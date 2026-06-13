const fs = require('fs');

async function fetchFromGit() {
  try {
    const res = await fetch("https://api.github.com/repos/researchshipper/equity/git/trees/finalupdate?recursive=1");
    const data = await res.json();
    for (const file of data.tree) {
      if ((file.path.startsWith('screener/') || file.path.startsWith('lib/')) && file.type === 'blob') {
        const url = `https://raw.githubusercontent.com/researchshipper/equity/finalupdate/${file.path}`;
        console.log("Fetching", url);
        const textRes = await fetch(url);
        const text = await textRes.text();
        const outDir = file.path.split('/').slice(0, -1).join('/');
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }
        fs.writeFileSync(file.path, text);
        console.log("Saved", file.path);
      }
    }
  } catch (err) {
    console.error(err);
  }
}
fetchFromGit();
