// Stands in for `npm run deploy` in the handover tests: "publishes" the backend URL
// that .env.local now holds to the fake live site.
import fs from 'node:fs';
import path from 'node:path';

const env = fs.readFileSync(path.join(process.env.HANDOVER_REPO, '.env.local'), 'utf8');
const backend = (env.match(/^VITE_APPS_SCRIPT_URL=(.*)$/m) || [])[1] || '';
await fetch(process.env.FAKE_GOOGLE_URL + '/_control/site', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backend }),
});
console.log('fake deploy: site now uses ' + backend);
