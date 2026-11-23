// Helpers for the handover pipeline: configuration, prompts, running commands,
// Google endpoints, and the fingerprint of the backend files.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const env = process.env;

/** Everything a test may point elsewhere. Defaults are the real services. */
export const CONFIG = {
  repo: path.resolve(env.HANDOVER_REPO || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')),
  get dir() { return path.resolve(env.HANDOVER_DIR || path.join(this.repo, '.handover')); },
  clasp: env.HANDOVER_CLASP ? env.HANDOVER_CLASP.split(' ') : ['npx', '--yes', '@google/clasp@3.4.1'],
  webAppBase: env.HANDOVER_WEBAPP_BASE || 'https://script.google.com/macros/s/',
  oauthBase: env.HANDOVER_OAUTH_BASE || 'https://oauth2.googleapis.com',
  driveBase: env.HANDOVER_DRIVE_BASE || 'https://www.googleapis.com/drive/v3',
  siteUrl: env.HANDOVER_SITE_URL || 'https://svaradh.github.io/hpc-questionnaire/',
  deployCmd: env.HANDOVER_DEPLOY_CMD || 'npm run deploy',
  devCmd: env.HANDOVER_DEV_CMD || 'npx vite --port 5173 --strictPort',
  devUrl: env.HANDOVER_DEV_URL || 'http://localhost:5173/hpc-questionnaire/',
  openUrls: !env.HANDOVER_NO_OPEN,
  sitePollSeconds: Number(env.HANDOVER_SITE_POLL_SECONDS || 30),
  sitePollTries: Number(env.HANDOVER_SITE_POLL_TRIES || 20),
  domain: 'iiserb.ac.in',
  sheetTitle: 'HPC Questionnaire Response v3',
};

/**
 * The backend files, as uploaded: [path in the repository, name in the script project].
 * The rehearsal and the handover must upload exactly these, with the same content.
 */
export const BACKEND_FILES = [
  ['apps-script/Code.gs', 'Code.gs'],
  ['apps-script/SheetWriter.gs', 'SheetWriter.gs'],
  ['apps-script/ReportGenerator.gs', 'ReportGenerator.gs'],
  ['apps-script/bound/Setup.gs', 'Setup.gs'],
  ['apps-script/bound/BoundMenu.gs', 'BoundMenu.gs'],
  ['apps-script/appsscript.json', 'appsscript.json'],
];

export const REHEARSAL_RECORD = 'tools/handover/rehearsal.json';

/**
 * Permissions the backend code needs, by the Apps Script calls that need them. appsscript.json
 * lists its oauthScopes explicitly, so Google grants only those: a call whose permission is
 * missing fails when it runs (e.g. "Specified permissions are not sufficient to call
 * Session.getEffectiveUser"). Extend this table when the backend starts using another service.
 */
export const SCOPE_RULES = [
  [/\bSpreadsheetApp\.(openById|getActiveSpreadsheet|create|flush)\b/, 'https://www.googleapis.com/auth/spreadsheets'],
  [/\bSpreadsheetApp\.getUi\b/, 'https://www.googleapis.com/auth/script.container.ui'],
  [/\bDriveApp\./, 'https://www.googleapis.com/auth/drive'],
  [/\bDocumentApp\./, 'https://www.googleapis.com/auth/documents'],
  [/\bGmailApp\./, 'https://mail.google.com/'],
  [/\bUrlFetchApp\./, 'https://www.googleapis.com/auth/script.external_request'],
  [/\bSession\.(getEffectiveUser|getActiveUser)\b/, 'https://www.googleapis.com/auth/userinfo.email'],
];

/** Permissions the code in a { name: text } map uses but its appsscript.json does not list: [{ scope, file }]. */
export function missingScopes(files) {
  const listed = new Set((JSON.parse(files['appsscript.json']).oauthScopes) || []);
  const missing = [];
  for (const [re, scope] of SCOPE_RULES) {
    if (listed.has(scope)) continue;
    const file = Object.keys(files).find(n => n.endsWith('.gs') && re.test(files[n]));
    if (file) missing.push({ scope, file });
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Output and prompts
// ---------------------------------------------------------------------------

export const say = (...a) => console.log(...a);
export const ok = msg => console.log('  ✓ ' + msg);
export const bad = msg => console.log('  ✗ ' + msg);

/** Raised by a check that did not pass; the step offers to check again. */
export class Gate extends Error {}
/** The operator chose to stop; state is kept, so the run can resume. */
export class Stop extends Error {}

let scripted = null;
async function scriptedAnswers() {
  if (scripted === null) {
    scripted = env.HANDOVER_ANSWERS ? await import(pathToFileURL(path.resolve(env.HANDOVER_ANSWERS)).href) : false;
  }
  return scripted;
}

/**
 * Asks a question. Each prompt has a stable id, so tests can answer it
 * (HANDOVER_ANSWERS = a module exporting answer(id, state)).
 */
export async function ask(id, question, state = {}) {
  const s = await scriptedAnswers();
  if (s) {
    const a = await s.answer(id, state);
    if (a === undefined) throw new Error(`Test gave no answer to prompt "${id}"`);
    console.log(`${question}${a}`);
    return String(a);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { return await rl.question(question); } finally { rl.close(); }
}

export async function confirm(id, question, state) {
  for (;;) {
    const a = (await ask(id, question + ' [y/n] ', state)).trim().toLowerCase();
    if (a === 'y' || a === 'yes') return true;
    if (a === 'n' || a === 'no') return false;
    if (a === 'q') throw new Stop();
  }
}

/** Waits for a manual action. q stops the run (it can be resumed). */
export async function waitFor(id, question, state) {
  const a = (await ask(id, question + ' Press Enter when done (q to stop): ', state)).trim().toLowerCase();
  if (a === 'q') throw new Stop();
}

/**
 * Runs check() until it passes. When it raises Gate, shows why and lets the
 * operator fix the cause and check again, or stop.
 */
export async function untilPasses(id, check, state) {
  for (;;) {
    try { return await check(); } catch (e) {
      if (!(e instanceof Gate)) throw e;
      bad(e.message);
      await waitFor(id, '  Fix this, then check again.', state);
    }
  }
}

export function openUrl(url) {
  if (!CONFIG.openUrls) return;
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawnSync(cmd, [url], { stdio: 'ignore' });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export function git(...args) {
  const r = spawnSync('git', args, { cwd: CONFIG.repo, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

/** Runs clasp with the session's sign-in file. interactive: the user sees and types. */
export function clasp(args, { cwd, interactive = false, json = true } = {}) {
  const authFile = path.join(CONFIG.dir, 'clasprc.json');
  const full = [...CONFIG.clasp.slice(1), '-A', authFile, ...(json ? ['--json'] : []), ...args];
  if (interactive) {
    const r = spawnSync(CONFIG.clasp[0], full, { cwd: cwd || CONFIG.dir, stdio: 'inherit' });
    return { status: r.status };
  }
  const r = spawnSync(CONFIG.clasp[0], full, { cwd: cwd || CONFIG.dir, encoding: 'utf8' });
  const out = (r.stdout || '').trim(), err = (r.stderr || '').trim();
  let data = null;
  if (json && out) {
    // clasp may print a line before the JSON; take from the first { or [.
    const i = out.search(/[[{]/);
    try { data = JSON.parse(i >= 0 ? out.slice(i) : out); } catch { data = null; }
  }
  return { status: r.status, data, out, err };
}

/** Runs a shell command with output shown, killing it after timeoutMs. */
export function shell(cmd, { cwd = CONFIG.repo, timeoutMs = 15 * 60 * 1000, extraEnv = {} } = {}) {
  return new Promise(resolve => {
    const child = spawn(cmd, { cwd, shell: true, stdio: 'inherit', env: { ...process.env, ...extraEnv } });
    const timer = setTimeout(() => { child.kill('SIGTERM'); resolve({ status: null, timedOut: true }); }, timeoutMs);
    child.on('exit', status => { clearTimeout(timer); resolve({ status, timedOut: false }); });
  });
}

/** Starts a long-running command in the background; returns a stop() function. */
export function background(cmd, extraEnv = {}) {
  const child = spawn(cmd, { cwd: CONFIG.repo, shell: true, stdio: 'ignore', detached: true, env: { ...process.env, ...extraEnv } });
  return () => { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ } };
}

// ---------------------------------------------------------------------------
// Google endpoints (the session's sign-in; Drive access is limited to files clasp created)
// ---------------------------------------------------------------------------

export function readSignIn() {
  const file = path.join(CONFIG.dir, 'clasprc.json');
  if (!fs.existsSync(file)) return null;
  const store = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (store.tokens && store.tokens.default) || null;
}

export async function accessToken() {
  const c = readSignIn();
  if (!c || !c.refresh_token) throw new Gate('Not signed in.');
  const res = await fetch(`${CONFIG.oauthBase}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token, grant_type: 'refresh_token' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Gate(`Could not use the sign-in (${body.error || res.status}).`);
  return body.access_token;
}

export async function driveFile(id) {
  const token = await accessToken();
  const fields = 'name,trashed,owners(emailAddress),permissions(emailAddress,role,type,domain)';
  const res = await fetch(`${CONFIG.driveBase}/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Gate(`Drive could not read the sheet's details (${res.status}).`);
  return res.json();
}

export async function trashDriveFile(id) {
  const token = await accessToken();
  const res = await fetch(`${CONFIG.driveBase}/files/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
  if (!res.ok) throw new Gate(`Drive could not move the sheet to the bin (${res.status}).`);
}

/** Revokes the session's sign-in at Google (not just deleting the local copy). */
export async function revokeSignIn() {
  const c = readSignIn();
  if (!c || !c.refresh_token) return false;
  const res = await fetch(`${CONFIG.oauthBase}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: c.refresh_token }),
  });
  return res.ok;
}

/** GET on a web app; returns its JSON, or raises Gate with what came back instead. */
export async function webAppGet(url, params = {}) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  let res;
  try { res = await fetch(u, { redirect: 'follow' }); } catch (e) { throw new Gate(`The web app could not be reached (${e.message}).`); }
  const text = await res.text();
  try { return JSON.parse(text); } catch {
    if (/authori[sz]/i.test(text)) throw new Gate('The web app is not authorised yet: setupBackend has not been run (or its permission screen was not approved).');
    if (/accounts\.google\.com|ServiceLogin|Sign in/i.test(text)) {
      throw new Gate('The web app asks for a Google sign-in, so the form cannot reach it. Its access must be "Anyone" (ANYONE_ANONYMOUS in appsscript.json).');
    }
    throw new Gate(`The web app did not answer with data (HTTP ${res.status}).`);
  }
}

export const webAppUrl = deploymentId => `${CONFIG.webAppBase}${deploymentId}/exec`;
export const scriptEditorUrl = scriptId => `https://script.google.com/d/${scriptId}/edit`;
export const sheetUrl = sheetId => `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

// ---------------------------------------------------------------------------
// Fingerprint: the backend files with their exact content
// ---------------------------------------------------------------------------

const sha256 = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]));
  return v;
}

/** Content as compared: line endings and the final newline do not count; JSON by value. */
export function normalise(name, text) {
  if (name.endsWith('.json')) return JSON.stringify(sortKeys(JSON.parse(text)));
  return text.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';
}

/** { files: { name: sha256 }, fingerprint } for a { name: text } map. */
export function fingerprint(files) {
  const names = Object.keys(files).sort();
  const per = Object.fromEntries(names.map(n => [n, sha256(normalise(n, files[n]))]));
  return { files: per, fingerprint: sha256(names.map(n => `${n} ${per[n]}`).join('\n')) };
}

/** The backend files as they are in the repository: { name: text }. */
export function repoBackendFiles() {
  return Object.fromEntries(BACKEND_FILES.map(([src, name]) => [name, fs.readFileSync(path.join(CONFIG.repo, src), 'utf8')]));
}

/** Files in a pulled project folder (.gs/.js/.json, without clasp's own files). */
export function folderFiles(dir) {
  const out = {};
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('.')) continue;
    const full = path.join(dir, f);
    if (!fs.statSync(full).isFile() || !/\.(gs|js|json)$/.test(f)) continue;
    out[f.replace(/\.js$/, '.gs')] = fs.readFileSync(full, 'utf8');
  }
  return out;
}

/** Differences between two fingerprints, as readable lines. */
export function diffFingerprints(want, got) {
  const lines = [];
  for (const n of new Set([...Object.keys(want.files), ...Object.keys(got.files)])) {
    if (!(n in got.files)) lines.push(`${n}: missing`);
    else if (!(n in want.files)) lines.push(`${n}: not expected`);
    else if (want.files[n] !== got.files[n]) lines.push(`${n}: content differs`);
  }
  return lines;
}

export const sha256Hex = sha256;
