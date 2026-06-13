import fs from 'fs';
import path from 'path';

function fixJson(dir) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.cjs')) {
      const filePath = path.join(dir, file);
      let content = fs.readFileSync(filePath, 'utf8');
      content = content.replace(/\.cjson/g, '.json');
      fs.writeFileSync(filePath, content);
    }
  }
}
fixJson('screener');
fixJson('lib');
