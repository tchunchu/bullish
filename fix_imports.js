import fs from 'fs';
import path from 'path';

function fixImports(dir) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.cjs')) {
      const filePath = path.join(dir, file);
      let content = fs.readFileSync(filePath, 'utf8');
      content = content.replace(/\.js/g, '.cjs');
      fs.writeFileSync(filePath, content);
    }
  }
}
fixImports('lib');
fixImports('screener');
