#!/usr/bin/env node
// Tests for the handover pipeline (npm run handover:test). No Google account is used:
// the pipeline runs against fake-google.mjs, which executes the real backend code from
// apps-script/ in a simulation. Each scenario drives the pipeline through its prompts,
// including the failures every check is meant to catch.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { startFakeGoogle } from './fake-google.mjs';
import { World, Project } from './gas-sim.mjs';
import { fingerprint, BACKEND_FILES } from '../lib.mjs';

const HERE = import.meta.dirname;
const REAL_REPO = path.resolve(HERE, '..', '..', '..');
const PIPELINE = path.join(HERE, '..', 'handover.mjs');

let failures = 0, passes = 0;
function check(cond, msg) { if (cond) { passes++; console.log('  ok   ' + msg); } else { failures++; console.log('  FAIL ' + msg); } }

const sh = (cwd, ...a) => execFileSync(a[0], a.slice(1), { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A throwaway git repository with the backend files, .env.local and an origin. */
function makeRepo(tmp, base) {
  const repo = path.join(tmp, 'repo');
  for (const [src] of BACKEND_FILES) {
    fs.mkdirSync(path.dirname(path.join(repo, src)), { recursive: true });
    fs.copyFileSync(path.join(REAL_REPO, src), path.join(repo, src));
  }
  fs.mkdirSync(path.join(repo, 'tools', 'handover'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.gitignore'), '.handover/\n.env.local\n.env.*.local\n');
  fs.writeFileSync(path.join(repo, '.env.local'), `VITE_APPS_SCRIPT_URL=${base}/exec/old/exec\nVITE_GOOGLE_CLIENT_ID=fake-client-id\n`);
  sh(tmp, 'git', 'init', '-q', '--bare', 'origin.git');
  sh(repo, 'git', 'init', '-q', '-b', 'main');
  sh(repo, 'git', 'config', 'user.email', 'me@iiserb.ac.in');
  sh(repo, 'git', 'config', 'user.name', 'Test');
  sh(repo, 'git', 'add', '-A');
  sh(repo, 'git', 'commit', '-q', '-m', 'backend');
  sh(repo, 'git', 'remote', 'add', 'origin', path.join(tmp, 'origin.git'));
  sh(repo, 'git', 'push', '-q', '-u', 'origin', 'main');
  return repo;
}

function runPipeline(env, args, script) {
  const scriptFile = path.join(env.TMP, `script-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(scriptFile, JSON.stringify(script));
  return new Promise(resolve => {
    const child = spawn(process.execPath, [PIPELINE, ...args], {
      env: { ...process.env, ...env.vars, HANDOVER_TEST_SCRIPT: scriptFile }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('exit', code => { if (process.env.VERBOSE) dump({ out }); resolve({ code, out }); });
  });
}

const getState = async base => (await fetch(base + '/_control/state')).json();
const control = (base, route, body) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function dump(r) { console.log('---- pipeline output ----\n' + r.out + '\n-------------------------'); }

// ---------------------------------------------------------------------------

async function testSimulation() {
  console.log('\nBackend code in the simulation');
  const files = Object.fromEntries(BACKEND_FILES.filter(([, n]) => n.endsWith('.gs')).map(([src, n]) => [n, fs.readFileSync(path.join(REAL_REPO, src), 'utf8')]));
  const world = new World();
  const ss = world.newSpreadsheet();
  const p = new Project(world, { owner: 'c@iiserb.ac.in', containerId: ss.id, files });

  const plain = p.doGet({});
  check(JSON.stringify(Object.keys(plain)) === JSON.stringify(['status', 'windowOpen', 'deadline']), 'doGet without ?check answers the form exactly as before');
  const before = p.doGet({ check: 'setup' }).setup;
  check(before.spreadsheet === false && before.completedAt === '', 'setup check: not set up before setupBackend');

  p.run('setupBackend', [], { editor: true });
  const after = p.doGet({ check: 'setup' }).setup;
  check(after.spreadsheet && after.folder && after.missingTabs.length === 0 && after.completedAt, 'setup check: all set after setupBackend');
  const counts = ss.dataRowCounts();
  check(Object.keys(counts).length === 14 && !('Sheet1' in counts), '14 tabs, "Sheet1" removed');
  check(Object.values(counts).every(n => n === 0), 'test submission removed from every tab');
  check(world.mail.length === 1 && world.mail[0].to === 'c@iiserb.ac.in', 'one email to the owner');

  p.run('setupBackend', [], { editor: true });
  check(world.folders.size === 1, 'running setupBackend again reuses the reports folder');

  const standalone = new Project(world, { owner: 'c@iiserb.ac.in', files });
  let threw = false; try { standalone.run('setupBackend', [], { editor: true }); } catch { threw = true; }
  check(threw, 'setupBackend refuses to run in a standalone project');
}

async function testPipeline() {
  const fake = await startFakeGoogle();
  const base = fake.base;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'handover-test-'));
  const repo = makeRepo(tmp, base);
  const env = {
    TMP: tmp,
    vars: {
      HANDOVER_REPO: repo,
      HANDOVER_CLASP: `${process.execPath} ${path.join(HERE, 'fake-clasp.mjs')}`,
      HANDOVER_WEBAPP_BASE: `${base}/exec/`,
      HANDOVER_OAUTH_BASE: `${base}/oauth`,
      HANDOVER_DRIVE_BASE: `${base}/drive`,
      HANDOVER_SITE_URL: `${base}/site/`,
      HANDOVER_DEPLOY_CMD: `${process.execPath} ${path.join(HERE, 'fake-deploy.mjs')}`,
      HANDOVER_NO_OPEN: '1',
      HANDOVER_SITE_POLL_SECONDS: '0',
      HANDOVER_SITE_POLL_TRIES: '3',
      HANDOVER_ANSWERS: path.join(HERE, 'answers.mjs'),
      FAKE_GOOGLE_URL: base,
    },
  };
  const handoverDir = path.join(repo, '.handover');
  const TEST = 'test@iiserb.ac.in', CONVENER = 'convener@iiserb.ac.in', ME = 'me@iiserb.ac.in';

  try {
    // ---- 1. Rehearsal, with the mistakes people make ----
    console.log('\nRehearsal (wrong account first, API off, setupBackend not yet run)');
    await control(base, '/_control/nextLogin', { email: 'someone.else@iiserb.ac.in' });
    await control(base, '/_control/api', { email: TEST, on: false });
    let r = await runPipeline(env, ['rehearse', '--email', TEST], {
      'api-setting': [{}],
      'sign-in': [{ control: [['/_control/nextLogin', { email: TEST }]] }],
      'api-check': [{ control: [['/_control/api', { email: TEST, on: true }]] }],
      setup: [{}],
      'setup-check': [
        { control: [['/_control/authorise', { scriptId: '{{scriptId}}' }]] },
        { control: [['/_control/runSetup', { scriptId: '{{scriptId}}' }], ['/_control/deleteTab', { scriptId: '{{scriptId}}', tab: 'Queue' }]] },
        { control: [['/_control/runSetup', { scriptId: '{{scriptId}}' }], ['/_control/otherSheet', { scriptId: '{{scriptId}}' }]] },
        { control: [['/_control/runSetup', { scriptId: '{{scriptId}}' }]] },
      ],
      'setup-email': [{ answer: 'y' }],
      'test-submission-want': [{ answer: 'n' }],
      teardown: [{ answer: 'y' }],
    });
    let st = await getState(base);
    check(r.code === 0, 'rehearsal completes');
    if (r.code !== 0) dump(r);
    check(/Signed in as someone\.else@iiserb\.ac\.in, not test@/.test(r.out), 'wrong account is refused, and its sign-in revoked');
    check(/Apps Script API is still off/.test(r.out), 'API switched off is caught');
    check(/not authorised yet/.test(r.out), 'web app before setupBackend is caught');
    check(/cannot open its sheet/.test(r.out), 'authorised but setupBackend not run is caught');
    check(/Tabs missing: Queue/.test(r.out), 'a missing tab is caught');
    check(/writes to a different sheet/.test(r.out), 'backend pointing at another sheet is caught');
    check(/identical to the repository/.test(r.out), 'uploaded code read back and compared');
    const recPath = path.join(repo, 'tools/handover/rehearsal.json');
    const rec = fs.existsSync(recPath) ? JSON.parse(fs.readFileSync(recPath, 'utf8')) : {};
    const repoFiles = Object.fromEntries(BACKEND_FILES.map(([src, n]) => [n, fs.readFileSync(path.join(repo, src), 'utf8')]));
    check(rec.fingerprint === fingerprint(repoFiles).fingerprint, 'rehearsal record holds the fingerprint of the backend files');
    check(!JSON.stringify(rec).includes('@') && !JSON.stringify(rec).includes(st.scripts[0]?.sheetId), 'rehearsal record has no account or sheet details');
    check(st.scripts.length === 1 && st.scripts[0].owner === TEST, 'one sheet, owned by the test account');
    check(Object.values(st.scripts[0].tabs).every(n => n === 0) && Object.keys(st.scripts[0].tabs).length === 14, 'sheet has 14 empty tabs after the self-test');
    check(st.drive[st.scripts[0].sheetId].trashed === true, 'rehearsal sheet moved to the bin');
    check(st.tokens === 0, 'every sign-in revoked (the wrong one and the test one)');
    check(!fs.existsSync(handoverDir), 'session files removed');

    // ---- 2. Handover refused while the rehearsal record is not committed ----
    console.log('\nHandover refused: rehearsal record not committed');
    r = await runPipeline(env, ['handover', '--email', CONVENER], { 'preflight:gate': [{ answer: 'q' }] });
    check(r.code === 2 && /uncommitted changes/.test(r.out), 'refused on a working tree with changes');
    await runPipeline(env, ['abort'], {});
    sh(repo, 'git', 'add', '-A'); sh(repo, 'git', 'commit', '-q', '-m', 'rehearsal'); sh(repo, 'git', 'push', '-q');

    // ---- 3. Handover refused when the backend differs from the rehearsed one ----
    console.log('\nHandover refused: backend files changed after the rehearsal');
    fs.appendFileSync(path.join(repo, 'apps-script/Code.gs'), '\n// a later change\n');
    sh(repo, 'git', 'commit', '-q', '-am', 'change'); sh(repo, 'git', 'push', '-q');
    r = await runPipeline(env, ['handover', '--email', CONVENER], { 'preflight:gate': [{ answer: 'q' }] });
    check(r.code === 2 && /differ from the rehearsed ones \(Code\.gs: content differs\)/.test(r.out), 'refused, naming the changed file');
    await runPipeline(env, ['abort'], {});
    sh(repo, 'git', 'revert', '--no-edit', 'HEAD'); sh(repo, 'git', 'push', '-q');

    // ---- 4. Handover: corrupted upload, stop and resume, you given access, live switch ----
    console.log('\nHandover (upload altered in transit, stopped and resumed, you have access)');
    await control(base, '/_control/nextLogin', { email: CONVENER });
    await control(base, '/_control/corruptPush', { on: true });
    r = await runPipeline(env, ['handover', '--email', CONVENER], {
      'operator-email': [{ answer: ME }],
      'api-setting': [{}],
      'upload:gate': [{ control: [['/_control/corruptPush', { on: false }]] }],
      setup: [{ answer: 'q' }],
    });
    check(r.code === 2, 'stops when asked, keeping its place');
    if (r.code !== 2) dump(r);
    check(/not identical to the repository: Code\.gs: content differs/.test(r.out), 'altered upload is caught, then uploaded again');
    const saved = JSON.parse(fs.readFileSync(path.join(handoverDir, 'state.json'), 'utf8'));
    check(saved.done.includes('deploy') && !saved.done.includes('setup'), 'state kept up to the deploy');

    r = await runPipeline(env, ['handover', '--email', CONVENER], {
      setup: [{ control: [['/_control/runSetup', { scriptId: '{{scriptId}}' }], ['/_control/share', { sheetId: '{{sheetId}}', email: ME, role: 'writer' }]] }],
      'setup-email': [{ answer: 'y' }],
      'test-submission-want': [{ answer: 'n' }],
      access: [{ control: [['/_control/share', { sheetId: '{{sheetId}}', email: ME }]] }],
      'switch-confirm': [{ answer: 'y' }],
      'close-old': [{}],
      'close-old-check': [{ control: [['/_control/closeOld', {}]] }],
    });
    st = await getState(base);
    const conv = st.scripts.find(s => s.owner === CONVENER);
    check(r.code === 0, 'handover completes after resuming');
    if (r.code !== 0) dump(r);
    check(st.creates === 2, 'resuming did not create a second sheet');
    check(/me@iiserb\.ac\.in \(you\) has access/.test(r.out), 'your access to the new sheet is caught');
    check(/old backend still accepts submissions/.test(r.out), 'old backend left open is caught');
    const newUrl = `${base}/exec/${conv?.deployments[0]}/exec`;
    check(st.site.backend === newUrl, 'live site switched to the new backend');
    check(fs.readFileSync(path.join(repo, '.env.local'), 'utf8').includes(newUrl), '.env.local points at the new backend');
    check(fs.readFileSync(path.join(repo, '.env.before-handover.local'), 'utf8').includes('/exec/old/exec'), 'previous .env.local kept');
    check(st.old.windowOpen === false, 'old backend closed');
    check(st.drive[conv?.sheetId]?.trashed === false && Object.values(conv?.tabs || {}).every(n => n === 0), 'new sheet kept, empty');
    check(st.drive[conv?.sheetId]?.permissions.length === 1, 'only the new owner has access');
    check(st.tokens === 0, 'convener\'s sign-in revoked');
    check(!fs.existsSync(handoverDir), 'session files removed');
  } finally {
    await fake.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

try { await testSimulation(); } catch (e) { check(false, 'simulation ran without error: ' + e.message); }
await testPipeline();
console.log(`\n${passes} passed, ${failures} failed`);
process.exitCode = failures ? 1 : 0;
