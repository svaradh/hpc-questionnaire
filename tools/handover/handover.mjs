#!/usr/bin/env node
// Handover pipeline: builds a new questionnaire backend (response sheet, script project,
// web app, reports folder) in another person's Google account, checks each stage, and
// (in handover mode) switches the live form to it. See docs/HANDOVER.md.
//
//   node tools/handover/handover.mjs rehearse --email someone@iiserb.ac.in [--remote]
//   node tools/handover/handover.mjs handover --email convener@iiserb.ac.in [--remote]
//   node tools/handover/handover.mjs status
//   node tools/handover/handover.mjs abort
//
// Every step checks its result before the next starts. State is kept in .handover/
// (not in git), so a stopped run continues where it left off.

import fs from 'node:fs';
import path from 'node:path';
import {
  CONFIG, BACKEND_FILES, REHEARSAL_RECORD, say, ok, bad, Gate, Stop, ask, confirm, waitFor, untilPasses,
  openUrl, git, clasp, shell, background, readSignIn, accessToken, driveFile, trashDriveFile, revokeSignIn,
  webAppGet, webAppUrl, scriptEditorUrl, sheetUrl, fingerprint, repoBackendFiles, folderFiles,
  diffFingerprints, sha256Hex,
} from './lib.mjs';

const STATE_FILE = () => path.join(CONFIG.dir, 'state.json');
const PROJECT_DIR = () => path.join(CONFIG.dir, 'project');
const VERIFY_DIR = () => path.join(CONFIG.dir, 'verify');
const ENV_FILE = () => path.join(CONFIG.repo, '.env.local');
const ENV_BACKUP = () => path.join(CONFIG.repo, '.env.before-handover.local');

function loadState() { return fs.existsSync(STATE_FILE()) ? JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8')) : null; }
function saveState(s) { fs.mkdirSync(CONFIG.dir, { recursive: true }); fs.writeFileSync(STATE_FILE(), JSON.stringify(s, null, 2), { mode: 0o600 }); }

/** Text for the person whose account is used: shown on screen, to read out or send. */
function forAccountOwner(s, lines) {
  say('');
  say(s.remote ? `  → Send to ${s.email} (or read out on the call):` : `  → For ${s.email}, in a browser window signed in to that account:`);
  for (const l of lines) say('     ' + l);
  say('');
}

function envValue(text, key) {
  const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

// ---------------------------------------------------------------------------
// Steps. Each runs, then checks its result; a failed check raises Gate.
// ---------------------------------------------------------------------------

const STEPS = [
  {
    id: 'preflight', title: 'Check this copy of the repository', modes: ['rehearse', 'handover'],
    async run(s) {
      const [maj, min] = process.versions.node.split('.').map(Number);
      if (maj < 20 || (maj === 20 && min < 11)) throw new Gate(`Node 20.11 or later is needed (this is ${process.versions.node}).`);
      ok(`Node ${process.versions.node}`);

      if (!new RegExp(`^[^@\\s]+@${CONFIG.domain.replace('.', '\\.')}$`).test(s.email)) throw new Gate(`${s.email} is not an @${CONFIG.domain} address.`);
      ok(`Account to build in: ${s.email}`);

      for (const [src] of BACKEND_FILES) if (!fs.existsSync(path.join(CONFIG.repo, src))) throw new Gate(`Missing ${src}.`);
      const files = BACKEND_FILES.map(([src]) => src);
      if (git('status', '--porcelain', '--', ...files)) throw new Gate('The backend files have changes that are not committed. Commit them first, so the run matches a commit.');
      s.commit = git('rev-parse', 'HEAD');
      s.fingerprint = fingerprint(repoBackendFiles());
      ok(`Backend files committed (commit ${s.commit.slice(0, 7)}, fingerprint ${s.fingerprint.fingerprint.slice(0, 12)})`);

      // The form calls the web app without a Google sign-in. Deployed through the API, the
      // manifest decides who may call it: "ANYONE" would mean anyone signed in to Google.
      const wa = JSON.parse(repoBackendFiles()['appsscript.json']).webapp || {};
      if (wa.access !== 'ANYONE_ANONYMOUS' || wa.executeAs !== 'USER_DEPLOYING') {
        throw new Gate('apps-script/appsscript.json: webapp must have "executeAs": "USER_DEPLOYING" and "access": "ANYONE_ANONYMOUS" (the form calls it without a Google sign-in).');
      }
      ok('Web app settings: runs as its owner, callable without a Google sign-in');

      if (!fs.existsSync(ENV_FILE()) || !envValue(fs.readFileSync(ENV_FILE(), 'utf8'), 'VITE_GOOGLE_CLIENT_ID')) {
        throw new Gate('.env.local with VITE_GOOGLE_CLIENT_ID is needed (README: Setting up on a new computer).');
      }

      if (s.mode === 'handover') {
        if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') throw new Gate('Check out main first.');
        if (git('status', '--porcelain')) throw new Gate('The working tree has uncommitted changes. Commit or stash them first.');
        git('fetch', '--quiet', 'origin', 'main');
        if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) throw new Gate('main differs from origin/main. Push or pull first.');
        ok('On main, clean, same as origin/main');

        const recPath = path.join(CONFIG.repo, REHEARSAL_RECORD);
        if (!fs.existsSync(recPath)) throw new Gate(`No rehearsal on record (${REHEARSAL_RECORD}). Run "rehearse" with a test account first.`);
        const rec = JSON.parse(fs.readFileSync(recPath, 'utf8'));
        if (rec.fingerprint !== s.fingerprint.fingerprint) {
          const d = diffFingerprints({ files: rec.files }, s.fingerprint);
          throw new Gate(`The backend files differ from the rehearsed ones (${d.join('; ')}). Rehearse again.`);
        }
        ok(`Same backend files as the rehearsal of ${rec.date} (commit ${String(rec.commit).slice(0, 7)})`);

        s.oldWebAppUrl = envValue(fs.readFileSync(ENV_FILE(), 'utf8'), 'VITE_APPS_SCRIPT_URL');
        if (!s.oldWebAppUrl) throw new Gate('.env.local has no VITE_APPS_SCRIPT_URL (the present backend).');
        ok('Present backend URL read from .env.local');

        if (!s.operatorEmail) {
          let def = '';
          try { def = git('config', 'user.email'); } catch { /* none */ }
          const a = (await ask('operator-email', `Your own Google address, to check that you have no access to the new sheet${def ? ` [${def}]` : ''}: `, s)).trim();
          s.operatorEmail = a || def;
        }
        if (!s.operatorEmail) throw new Gate('Your own address is needed for the access check.');
        if (s.operatorEmail.toLowerCase() === s.email.toLowerCase()) throw new Gate('The new owner and you are the same account. Use rehearse for a trial in your own account.');
        ok(`You: ${s.operatorEmail}`);
      }

      const v = clasp(['--version'], { json: false, cwd: CONFIG.repo });
      if (v.status !== 0) throw new Gate(`clasp could not be started: ${v.err || v.out}`);
      ok(`clasp ${v.out.split('\n').pop()}`);
    },
  },
  {
    id: 'api-setting', title: 'Turn on the Apps Script API (in the new owner\'s account)', modes: ['rehearse', 'handover'],
    async run(s) {
      const url = 'https://script.google.com/home/usersettings';
      forAccountOwner(s, [
        `1. Open ${url}`,
        '2. Turn on "Google Apps Script API" (one switch). It lets this tool create the project.',
      ]);
      if (!s.remote) openUrl(url);
      await waitFor('api-setting', '  When the switch is on:', s);
      say('  (Checked after signing in.)');
    },
  },
  {
    id: 'sign-in', title: 'Sign in as the new owner (for this session only)', modes: ['rehearse', 'handover'],
    async run(s) {
      await untilPasses('sign-in', async () => {
        if (!readSignIn()) {
          if (s.remote) {
            forAccountOwner(s, [
              '1. Open the link that clasp prints below and sign in as ' + s.email + '.',
              '2. Approve. The browser then shows an error page at http://localhost:8888/... That is expected.',
              '3. Copy that whole address from the address bar and send it back; it is pasted below.',
              '   (It works once and expires within minutes.)',
            ]);
          } else {
            forAccountOwner(s, ['A Google sign-in page opens. Choose ' + s.email + ' and approve.',
              '(If the browser is signed in to another account, use "Use another account".)']);
          }
          const r = clasp(['login', ...(s.remote ? ['--no-localhost'] : [])], { interactive: true, json: false });
          if (r.status !== 0) throw new Gate('Sign-in did not complete.');
          try { fs.chmodSync(path.join(CONFIG.dir, 'clasprc.json'), 0o600); } catch { /* not created */ }
        }
        const who = clasp(['show-authorized-user']);
        const email = who.data && who.data.email;
        if (!email) { fs.rmSync(path.join(CONFIG.dir, 'clasprc.json'), { force: true }); throw new Gate('Could not read who is signed in. Sign in again.'); }
        if (email.toLowerCase() !== s.email.toLowerCase()) {
          await revokeSignIn().catch(() => {});
          fs.rmSync(path.join(CONFIG.dir, 'clasprc.json'), { force: true });
          throw new Gate(`Signed in as ${email}, not ${s.email}. That sign-in was revoked; sign in again with the right account.`);
        }
        ok(`Signed in as ${email}`);
      }, s);
    },
  },
  {
    id: 'api-check', title: 'Check the Apps Script API is on', modes: ['rehearse', 'handover'],
    async run(s) {
      await untilPasses('api-check', async () => {
        const r = clasp(['list-scripts']);
        if (r.status !== 0) {
          const msg = `${r.err} ${r.out}`;
          if (/Apps Script API|usersettings|has not been used|not enabled/i.test(msg)) {
            throw new Gate('The Apps Script API is still off for this account. Turn it on at https://script.google.com/home/usersettings (it can take a minute to apply).');
          }
          throw new Gate(`Listing projects failed: ${msg.trim()}`);
        }
        ok('Apps Script API is on');
      }, s);
    },
  },
  {
    id: 'create', title: 'Create the response sheet with its script project', modes: ['rehearse', 'handover'],
    async run(s) {
      if (!s.scriptId) {
        fs.rmSync(PROJECT_DIR(), { recursive: true, force: true });
        fs.mkdirSync(PROJECT_DIR(), { recursive: true });
        const r = clasp(['create-script', '--type', 'sheets', '--title', CONFIG.sheetTitle, '--rootDir', '.'], { cwd: PROJECT_DIR() });
        if (r.status !== 0 || !r.data || !r.data.scriptId || !r.data.parentId) throw new Gate(`Creating the sheet failed: ${(r.err || r.out).trim()}`);
        s.scriptId = r.data.scriptId; s.sheetId = r.data.parentId;
        saveState(s);
      }
      ok(`Sheet "${CONFIG.sheetTitle}" with its script project`);
      const f = await driveFile(s.sheetId);
      const owners = (f.owners || []).map(o => (o.emailAddress || '').toLowerCase());
      if (!owners.includes(s.email.toLowerCase())) throw new Gate(`The sheet is owned by ${owners.join(', ') || 'nobody known'}, not ${s.email}.`);
      if (f.trashed) throw new Gate('The sheet is in the bin.');
      ok(`Owned by ${s.email}`);
    },
  },
  {
    id: 'upload', title: 'Upload the backend code and check it is identical', modes: ['rehearse', 'handover'],
    async run(s) {
      const files = repoBackendFiles();
      const want = fingerprint(files);
      if (want.fingerprint !== s.fingerprint.fingerprint) throw new Gate('The backend files changed since this run started. Run "abort" and start again.');
      const claspJson = JSON.stringify({ scriptId: s.scriptId, parentId: s.sheetId, rootDir: '.', scriptExtensions: ['.gs'], jsonExtensions: ['.json'] }, null, 2);

      for (const dir of [PROJECT_DIR(), VERIFY_DIR()]) {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, '.clasp.json'), claspJson);
      }
      for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(PROJECT_DIR(), name), text);

      const push = clasp(['push', '--force'], { cwd: PROJECT_DIR() });
      if (push.status !== 0) throw new Gate(`Upload failed: ${(push.err || push.out).trim()}`);
      ok(`Uploaded ${Object.keys(files).length} files`);

      const pull = clasp(['pull'], { cwd: VERIFY_DIR() });
      if (pull.status !== 0) throw new Gate(`Reading the project back failed: ${(pull.err || pull.out).trim()}`);
      const got = fingerprint(folderFiles(VERIFY_DIR()));
      const d = diffFingerprints(want, got);
      if (d.length) throw new Gate(`The project in the account is not identical to the repository: ${d.join('; ')}`);
      ok(`Read back: identical to the repository (fingerprint ${got.fingerprint.slice(0, 12)})`);
      s.uploadedFingerprint = got.fingerprint;
    },
  },
  {
    id: 'deploy', title: 'Deploy the web app', modes: ['rehearse', 'handover'],
    async run(s) {
      if (!s.deploymentId) {
        const r = clasp(['create-deployment', '-d', 'HPC questionnaire web app'], { cwd: PROJECT_DIR() });
        if (r.status !== 0 || !r.data || !r.data.deploymentId) throw new Gate(`Deploying failed: ${(r.err || r.out).trim()}`);
        s.deploymentId = r.data.deploymentId;
        s.webAppUrl = webAppUrl(s.deploymentId);
        saveState(s);
      }
      const list = clasp(['list-deployments'], { cwd: PROJECT_DIR() });
      const ids = Array.isArray(list.data) ? list.data.map(d => d.deploymentId) : [];
      if (!ids.includes(s.deploymentId)) throw new Gate('The new deployment is not listed in the project.');
      ok('Web app deployed');
    },
  },
  {
    id: 'setup', title: 'Run setupBackend once (the new owner, in the script editor)', modes: ['rehearse', 'handover'],
    async run(s) {
      const editor = scriptEditorUrl(s.scriptId);
      forAccountOwner(s, [
        `1. Open ${editor}`,
        '2. In the file list, click Setup.gs. In the toolbar, choose setupBackend in the function menu and click Run.',
        '3. Google asks for permission: Review permissions → choose ' + s.email + ' → Allow.',
        '   (It lists Sheets, Drive, Gmail and Docs: the backend writes the responses, saves reports',
        '    and sends confirmation emails, all as this account.)',
        '4. Wait for "Execution completed" in the log at the bottom (about half a minute).',
      ]);
      if (!s.remote) openUrl(editor);
      await waitFor('setup', '  When the log says "Execution completed":', s);

      await untilPasses('setup-check', async () => {
        const h = await webAppGet(s.webAppUrl, { check: 'setup' });
        const st = h.setup;
        if (!st) throw new Gate('The web app does not report its setup. Is this the code from this repository?');
        if (!st.spreadsheet) throw new Gate('The backend cannot open its sheet: setupBackend has not completed.');
        if (st.spreadsheetIdSha256 !== sha256Hex(s.sheetId)) throw new Gate('The backend writes to a different sheet from the one created.');
        if (!st.folder) throw new Gate('The reports folder is missing.');
        if (st.missingTabs && st.missingTabs.length) throw new Gate(`Tabs missing: ${st.missingTabs.join(', ')}.`);
        if (!st.completedAt) throw new Gate('setupBackend did not finish (look at the log in the editor for the error).');
        if (h.windowOpen !== true) throw new Gate('Submissions are closed in the new backend (SUBMISSION_DEADLINE is set).');
        ok('Backend set up: sheet, reports folder, all tabs, test submission written and removed');
      }, s);

      await untilPasses('setup-email', async () => {
        const got = await confirm('setup-email', `  Did ${s.email} receive the email "HPC Questionnaire: backend set up"?`, s);
        if (!got) throw new Gate('No email: look in Spam, and in the editor\'s Executions list for an error from GmailApp. Run setupBackend again after fixing it.');
        ok('Email received');
      }, s);
    },
  },
  {
    id: 'test-submission', title: 'Test submission through the form (optional)', modes: ['rehearse', 'handover'],
    async run(s) {
      const recommended = s.mode === 'rehearse';
      say(recommended
        ? '  Recommended in a rehearsal: it checks sign-in, submission and the confirmation email end to end.'
        : '  The rehearsal tested this with identical code. A test here leaves a test row in the new owner\'s sheet.');
      if (!(await confirm('test-submission-want', '  Do a test submission now?', s))) { say('  Skipped.'); return; }

      // BROWSER=none: Vite does not open its own tab (vite.config has open: true); the URL is opened below.
      const stop = background(CONFIG.devCmd, { VITE_APPS_SCRIPT_URL: s.webAppUrl, BROWSER: 'none' });
      try {
        let up = false;
        for (let i = 0; i < 60 && !up; i++) {
          try { up = (await fetch(CONFIG.devUrl)).ok; } catch { await new Promise(r => setTimeout(r, 1000)); }
        }
        if (!up) throw new Gate(`The local form did not start at ${CONFIG.devUrl}.`);
        ok(`Local form running at ${CONFIG.devUrl}, sending to the new backend`);
        say('     Open it on this computer, sign in, fill in and submit a short test response.');
        say('     (Sign-in fails if http://localhost:5173 is not an authorised origin of the form\'s Google client.)');
        openUrl(CONFIG.devUrl);
        await untilPasses('test-submission-check', async () => {
          if (!(await confirm('test-submission-done', '  Did the form show a submission ID, and did the row appear in the new sheet and the email arrive?', s))) {
            throw new Gate('Not confirmed. The browser console and the editor\'s Executions list show errors.');
          }
          ok('Test submission received');
          s.testSubmissionDone = true;
        }, s);
      } finally { stop(); }
    },
  },
  {
    id: 'access', title: 'Check who can open the new sheet', modes: ['rehearse', 'handover'],
    async run(s) {
      await untilPasses('access', async () => {
        const f = await driveFile(s.sheetId);
        const owner = s.email.toLowerCase();
        if (!(f.owners || []).some(o => (o.emailAddress || '').toLowerCase() === owner)) throw new Gate(`${s.email} is no longer the owner.`);
        if (!Array.isArray(f.permissions)) {
          if (!(await confirm('access-manual', '  Drive did not list the sharing. In the sheet\'s Share dialog, is the new owner the only person listed?', s))) {
            throw new Gate('Remove the others in the Share dialog.');
          }
          return;
        }
        const others = f.permissions.filter(p => !(p.type === 'user' && (p.emailAddress || '').toLowerCase() === owner));
        if (s.operatorEmail && others.some(p => (p.emailAddress || '').toLowerCase() === s.operatorEmail.toLowerCase())) {
          throw new Gate(`${s.operatorEmail} (you) has access. The new owner should remove you in the sheet's Share dialog.`);
        }
        if (others.some(p => p.type === 'anyone' || p.type === 'domain')) throw new Gate('The sheet is shared by link or with the whole domain. Set General access to Restricted.');
        ok(`Owner: ${s.email}`);
        if (!others.length) { ok('Nobody else has access'); return; }
        for (const p of others) say(`     also: ${p.emailAddress || p.domain || p.type} (${p.role})`);
        if (!(await confirm('access-others', '  Are these people meant to have access?', s))) throw new Gate('Remove them in the sheet\'s Share dialog.');
      }, s);
    },
  },
  {
    id: 'switch-site', title: 'Switch the live form to the new backend', modes: ['handover'],
    async run(s) {
      if (!s.siteDeployed) {
        say(`  This rebuilds ${CONFIG.siteUrl} so that new submissions go to ${s.email}'s backend.`);
        if (!(await confirm('switch-confirm', '  Switch the live form now?', s))) throw new Stop();
        const text = fs.readFileSync(ENV_FILE(), 'utf8');
        if (!fs.existsSync(ENV_BACKUP())) fs.writeFileSync(ENV_BACKUP(), text, { mode: 0o600 });
        fs.writeFileSync(ENV_FILE(), text.replace(/^VITE_APPS_SCRIPT_URL=.*$/m, `VITE_APPS_SCRIPT_URL=${s.webAppUrl}`));
        ok('.env.local now points at the new backend (previous copy: .env.before-handover.local)');
        const r = await shell(CONFIG.deployCmd);
        if (r.status !== 0) {
          bad(r.timedOut ? 'The deploy timed out.' : `The deploy failed (exit ${r.status}).`);
          say('     If gh-pages hung, publish dist/ by hand as in TODO.md (the node_modules/.cache/gh-pages clone),');
          say('     then continue: the next check only looks at the live site.');
        }
        s.siteDeployed = true; saveState(s);
      }
      await untilPasses('switch-check', async () => {
        for (let i = 1; i <= CONFIG.sitePollTries; i++) {
          const found = await liveSiteBackend(s);
          if (found === 'new') { ok('The live form sends to the new backend'); return; }
          say(`     live site not updated yet (${i}/${CONFIG.sitePollTries}); GitHub Pages can take a few minutes`);
          await new Promise(r => setTimeout(r, CONFIG.sitePollSeconds * 1000));
        }
        throw new Gate('The live site still has the old backend.');
      }, s);
    },
  },
  {
    id: 'close-old', title: 'Close the old backend', modes: ['handover'],
    async run(s) {
      const now = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 19) + '+05:30';
      say('  Pages opened before the switch still send to the old backend. Close it:');
      say('     1. Open your v3 Apps Script project (script.google.com → the questionnaire\'s v3 web-app project).');
      say('     2. Project Settings (gear) → Script Properties → Add (or edit) SUBMISSION_DEADLINE');
      say(`        with the value ${now}  → Save.`);
      say('     Anyone on an old page is then told the window has closed, and reloading gives the new form.');
      await waitFor('close-old', '  When saved:', s);
      await untilPasses('close-old-check', async () => {
        const h = await webAppGet(s.oldWebAppUrl);
        if (h.windowOpen !== false) throw new Gate('The old backend still accepts submissions (windowOpen is true).');
        ok('The old backend is closed');
      }, s);
    },
  },
  {
    id: 'record', title: 'Record the rehearsal', modes: ['rehearse'],
    async run(s) {
      const rec = {
        _comment: 'Written by tools/handover/handover.mjs rehearse. The handover refuses to run unless the backend files have this fingerprint. No account details are kept here.',
        date: new Date().toISOString().slice(0, 10),
        commit: s.commit,
        fingerprint: s.fingerprint.fingerprint,
        files: s.fingerprint.files,
        checks: s.done.slice(),
        testSubmission: !!s.testSubmissionDone,
      };
      fs.writeFileSync(path.join(CONFIG.repo, REHEARSAL_RECORD), JSON.stringify(rec, null, 2) + '\n');
      ok(`Written to ${REHEARSAL_RECORD}. Commit it, so the handover can check against it.`);
    },
  },
  {
    id: 'teardown', title: 'Remove the rehearsal backend', modes: ['rehearse'],
    async run(s) {
      if (!(await confirm('teardown', `  Move the rehearsal sheet (with its script and web app) in ${s.email}'s Drive to the bin?`, s))) { say('  Kept.'); return; }
      await trashDriveFile(s.sheetId);
      ok('Sheet moved to the bin');
      say(`     Also remove by hand in ${s.email}'s Drive: the folder "HPC Committee Reports" that setupBackend created.`);
    },
  },
  {
    id: 'sign-out', title: 'Sign out: revoke this session\'s access', modes: ['rehearse', 'handover'],
    async run(s) {
      if (readSignIn()) {
        const revoked = await revokeSignIn();
        if (!revoked) bad('Google did not confirm the revocation.');
        let stillWorks = true;
        try { await accessToken(); } catch (e) { if (e instanceof Gate) stillWorks = false; else throw e; }
        if (stillWorks) throw new Gate(`The sign-in still works. ${s.email} can remove "clasp" at https://myaccount.google.com/connections`);
        fs.rmSync(path.join(CONFIG.dir, 'clasprc.json'), { force: true });
      }
      ok('This computer no longer has access to the account');
    },
  },
];

/** 'new', 'old' or 'unknown': which backend the live site's script contains. */
async function liveSiteBackend(s) {
  try {
    const html = await (await fetch(CONFIG.siteUrl, { cache: 'no-store' })).text();
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map(m => new URL(m[1], CONFIG.siteUrl).href);
    for (const src of srcs) {
      const js = await (await fetch(src, { cache: 'no-store' })).text();
      if (js.includes(s.webAppUrl)) return 'new';
      if (s.oldWebAppUrl && js.includes(s.oldWebAppUrl)) return 'old';
    }
  } catch { /* try again */ }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function finish(s) {
  say('');
  if (s.mode === 'rehearse') {
    say('Rehearsal complete. Commit tools/handover/rehearsal.json; the handover checks against it.');
  } else {
    say(`Handover complete. ${s.email} owns the backend:`);
    say(`  Response sheet:  ${sheetUrl(s.sheetId)}`);
    say(`  Script project:  ${scriptEditorUrl(s.scriptId)}`);
    say(`  Web app:         ${s.webAppUrl}`);
    say('  Reports folder:  "HPC Committee Reports" in their Drive (link in the setup email)');
    say('  Next for them: docs/HANDOVER.md, "After the handover" (analysis notebook, sharing).');
  }
  fs.rmSync(CONFIG.dir, { recursive: true, force: true });
  say('Session files removed from this computer.');
}

async function runSteps(s) {
  const steps = STEPS.filter(st => st.modes.includes(s.mode));
  for (const [i, st] of steps.entries()) {
    if (s.done.includes(st.id)) continue;
    say(`\n[${i + 1}/${steps.length}] ${st.title}`);
    await untilPasses(`${st.id}:gate`, () => st.run(s), s);
    s.done.push(st.id);
    saveState(s);
  }
  finish(s);
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = { cmd };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--email') opts.email = rest[++i];
    else if (rest[i] === '--remote') opts.remote = true;
    else throw new Error(`Unknown option ${rest[i]}`);
  }
  return opts;
}

const HELP = `Usage:
  node tools/handover/handover.mjs rehearse --email <test account> [--remote]
  node tools/handover/handover.mjs handover --email <new owner>   [--remote]
  node tools/handover/handover.mjs status
  node tools/handover/handover.mjs abort
--remote: the account owner does their steps on their own computer (links are sent to them).
See docs/HANDOVER.md.`;

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const existing = loadState();

  if (o.cmd === 'status') {
    if (!existing) { say('No handover in progress.'); return; }
    say(`${existing.mode} for ${existing.email}${existing.remote ? ' (remote)' : ''}, started ${existing.startedAt}`);
    say(`Done: ${existing.done.join(', ') || 'nothing yet'}`);
    return;
  }
  if (o.cmd === 'abort') {
    if (!existing) { say('No handover in progress.'); return; }
    if (readSignIn()) { await revokeSignIn().catch(() => {}); ok('Sign-in revoked'); }
    if (existing.sheetId) say(`Created in ${existing.email}'s Drive and left there: ${sheetUrl(existing.sheetId)} (move it to the bin if not wanted).`);
    fs.rmSync(CONFIG.dir, { recursive: true, force: true });
    ok('Session files removed');
    return;
  }
  if (o.cmd !== 'rehearse' && o.cmd !== 'handover') { say(HELP); process.exitCode = o.cmd ? 1 : 0; return; }
  if (!o.email) { say(HELP); process.exitCode = 1; return; }

  let s = existing;
  if (s && (s.mode !== o.cmd || s.email.toLowerCase() !== o.email.toLowerCase())) {
    say(`A ${s.mode} for ${s.email} is in progress. Finish it, or run "abort" first.`);
    process.exitCode = 1; return;
  }
  if (!s) s = { mode: o.cmd, email: o.email, remote: !!o.remote, startedAt: new Date().toISOString(), done: [] };
  else { s.remote = !!o.remote; say(`Continuing the ${s.mode} for ${s.email} (done: ${s.done.join(', ') || 'nothing yet'}).`); }
  saveState(s);

  try {
    await runSteps(s);
  } catch (e) {
    saveState(s);
    if (e instanceof Stop) { say('\nStopped. Run the same command again to continue, or "abort" to undo the session.'); process.exitCode = 2; return; }
    throw e;
  }
}

main().catch(e => { console.error('\nError: ' + (e.stack || e.message)); process.exitCode = 1; });
