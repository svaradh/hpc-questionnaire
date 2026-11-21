#!/usr/bin/env node
// Stands in for clasp in the handover tests (HANDOVER_CLASP="node .../fake-clasp.mjs").
// Takes the same arguments and writes the same files (.clasprc.json store, .clasp.json,
// pulled project files) as clasp 3, and talks to fake-google.mjs at FAKE_GOOGLE_URL.

import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.FAKE_GOOGLE_URL;
const args = process.argv.slice(2);
let authFile = path.join(process.env.HOME, '.clasprc.json'), json = false;
const rest = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-A') authFile = args[++i];
  else if (args[i] === '--json') json = true;
  else rest.push(args[i]);
}
const [cmd, ...opts] = rest;
const opt = name => { const i = opts.indexOf(name); return i >= 0 ? opts[i + 1] : undefined; };

const out = data => console.log(json ? JSON.stringify(data, null, 2) : String(data));
const fail = msg => { console.error(msg); process.exit(1); };

function creds() {
  if (!fs.existsSync(authFile)) return null;
  return (JSON.parse(fs.readFileSync(authFile, 'utf8')).tokens || {}).default || null;
}

async function call(route, body = {}) {
  const c = creds();
  const res = await fetch(BASE + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: c && c.refresh_token, ...body }) });
  const data = await res.json();
  if (!res.ok) fail(data.error || `HTTP ${res.status}`);
  return data;
}

const project = () => JSON.parse(fs.readFileSync(path.join(process.cwd(), '.clasp.json'), 'utf8'));

function writeFiles(dir, files) {
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
}

const commands = {
  async '--version'() { console.log('3.4.1 (fake)'); },
  async login() {
    const c = await call('/clasp/login');
    fs.writeFileSync(authFile, JSON.stringify({ tokens: { default: c } }, null, 2));
    console.log('Logged in.');
  },
  async 'show-authorized-user'() {
    const c = creds();
    if (!c) return out({ loggedIn: false });
    const res = await fetch(BASE + '/clasp/whoami', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: c.refresh_token }) });
    const d = await res.json();
    out({ loggedIn: true, email: d.email, clientId: c.client_id, clientType: 'default' });
  },
  async 'list-scripts'() { out(await call('/clasp/list')); },
  async 'create-script'() {
    if (fs.existsSync(path.join(process.cwd(), '.clasp.json'))) fail('Project file (.clasp.json) already exists.');
    const r = await call('/clasp/create', { type: opt('--type'), title: opt('--title') });
    const dir = path.resolve(process.cwd(), opt('--rootDir') || '.');
    writeFiles(dir, r.files);
    fs.writeFileSync(path.join(process.cwd(), '.clasp.json'), JSON.stringify({ scriptId: r.scriptId, rootDir: opt('--rootDir') || '.', parentId: r.parentId }));
    out({ scriptId: r.scriptId, parentId: r.parentId, files: Object.keys(r.files) });
  },
  async push() {
    const p = project();
    const dir = path.resolve(process.cwd(), p.rootDir || '.');
    const files = {};
    for (const f of fs.readdirSync(dir)) if (!f.startsWith('.') && /\.(gs|js|json)$/.test(f)) files[f] = fs.readFileSync(path.join(dir, f), 'utf8');
    out(await call('/clasp/push', { scriptId: p.scriptId, files }));
  },
  async pull() {
    const p = project();
    const files = await call('/clasp/pull', { scriptId: p.scriptId });
    writeFiles(path.resolve(process.cwd(), p.rootDir || '.'), files);
    out({ pulledFiles: Object.keys(files), deletedFiles: [] });
  },
  async 'create-deployment'() { out(await call('/clasp/deploy', { scriptId: project().scriptId })); },
  async 'list-deployments'() { out(await call('/clasp/deployments', { scriptId: project().scriptId })); },
};

if (!commands[cmd]) fail(`fake clasp: unknown command ${cmd}`);
await commands[cmd]();
