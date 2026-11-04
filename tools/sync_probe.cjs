// The probe is packaged on its own, so it carries copies of the app's parser and source list.
// Run after editing app/feeds.js or app/sources.json: npm run sync (a test fails if the copies drift).
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const name of ['feeds.js', 'sources.json']) {
  fs.copyFileSync(path.join(root, 'app', name), path.join(root, 'probe', name));
  console.log('probe/' + name + ' ← app/' + name);
}
