async function checkRepo() {
  try {
    const res = await fetch("https://api.github.com/repos/researchshipper/equity/contents/fullscrneer/lib");
    if (!res.ok) {
      console.log("fullscrneer/lib folder status:", res.status);
      return;
    }
    const data = await res.json();
    console.log("fullscrneer/lib contents:", data.map(f => ({ name: f.name, download_url: f.download_url })));
  } catch (err) {
    console.error("Error fetching repository contents:", err);
  }
}
checkRepo();
