const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

console.log("Downloading get-pip.py...");
const file = fs.createWriteStream("get-pip.py");
https.get("https://bootstrap.pypa.io/get-pip.py", function(response) {
  response.pipe(file);
  file.on("finish", () => {
    file.close();
    console.log("Installing pip...");
    try {
      execSync("python3 get-pip.py --user", { stdio: 'inherit' });
      console.log("Installing packages...");
      execSync("python3 -m pip install pandas numpy yfinance requests", { stdio: 'inherit' });
      console.log("Python environment setup complete!");
    } catch(err) {
      console.error("Setup failed:", err.message);
    }
  });
});
