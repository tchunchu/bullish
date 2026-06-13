import fs from 'fs';

function wrap(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/require\(['"]([^'"]+)\.js['"]\)/g, 'require("$1.cjs")');
  fs.writeFileSync(file.replace('.js', '.cjs'), content);
  fs.unlinkSync(file);
}

['screener_v5.js', 'universe.js', 'render_v5.js', 'lint_pass2.js'].forEach(f => {
  if (fs.existsSync(`screener/${f}`)) wrap(`screener/${f}`);
});
['indicators.js', 'indicators_v2.js', 'regime.js', 'setups.js', 'scorecard.js'].forEach(f => {
  if (fs.existsSync(`lib/${f}`)) wrap(`lib/${f}`);
});
