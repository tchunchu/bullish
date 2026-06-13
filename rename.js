import fs from 'fs';
import path from 'path';

const dirs = ['lib', 'screener'];

for (const dir of dirs) {
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.js') && file !== 'screener.js') {
        fs.renameSync(path.join(dir, file), path.join(dir, file.replace('.js', '.cjs')));
      }
    }
  }
}
