import fs from 'fs';

async function fetchGithubTree() {
  const url = 'https://api.github.com/repos/researchshipper/equity/git/trees/finalupdate?recursive=1';
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const files = data.tree.map(t => t.path);
      console.log(files.join('\n'));
    } else {
      console.log(`Failed to fetch tree - ${res.status}`);
    }
  } catch (e) {
    console.error(e);
  }
}
fetchGithubTree();
