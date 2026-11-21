// A fake of the Google services the handover pipeline touches, for the tests:
// clasp's project calls (through fake-clasp.mjs), the web app, OAuth, Drive, and the
// live site. Web-app calls run the uploaded backend code in gas-sim.mjs, so the
// pipeline's checks are tested against the real Code.gs / Setup.gs.
// /_control/* lets a test play the people: sign in, switch the API on, run setupBackend...

import http from 'node:http';
import crypto from 'node:crypto';
import { World, Project } from './gas-sim.mjs';

export function startFakeGoogle() {
  const world = new World();
  const st = {
    world,
    nextLogin: null,            // who signs in at the next clasp login
    apiOff: new Set(),          // accounts with the Apps Script API off
    tokens: new Map(),          // refresh token -> email (revoked ones removed)
    scripts: new Map(),         // scriptId -> { project, sheetId, owner, authorised, deployments: [] }
    deployments: new Map(),     // deploymentId -> scriptId
    drive: new Map(),           // sheetId -> { owner, permissions: [], trashed }
    corruptPush: false,
    site: { backend: '' },
    old: { windowOpen: true },
    logins: 0,
    creates: 0,
  };

  const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const userOf = rt => st.tokens.get(rt) || null;

  async function readBody(req) {
    let raw = ''; for await (const c of req) raw += c;
    if (!raw) return {};
    if ((req.headers['content-type'] || '').includes('x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
    return JSON.parse(raw);
  }

  function bearerUser(req) {
    const m = (req.headers.authorization || '').match(/^Bearer at-(.+)$/);
    return m ? userOf(m[1]) : null;
  }

  const routes = {
    // ---- clasp ----
    'POST /clasp/login': () => {
      if (!st.nextLogin) return [400, { error: 'nobody signed in' }];
      const rt = 'rt-' + crypto.randomUUID();
      st.tokens.set(rt, st.nextLogin); st.logins++;
      return [200, { client_id: 'fake-client', client_secret: 'fake-secret', type: 'authorized_user', refresh_token: rt, access_token: 'at-' + rt }];
    },
    'POST /clasp/whoami': b => { const u = userOf(b.refresh_token); return u ? [200, { email: u }] : [401, { error: 'invalid_grant' }]; },
    'POST /clasp/list': b => {
      const u = userOf(b.refresh_token); if (!u) return [401, { error: 'invalid_grant' }];
      if (st.apiOff.has(u)) return [403, { error: 'User has not enabled the Apps Script API. Enable it by visiting https://script.google.com/home/usersettings' }];
      return [200, [...st.scripts.entries()].filter(([, v]) => v.owner === u).map(([id]) => ({ id }))];
    },
    'POST /clasp/create': b => {
      const u = userOf(b.refresh_token); if (!u) return [401, { error: 'invalid_grant' }];
      if (st.apiOff.has(u)) return [403, { error: 'User has not enabled the Apps Script API.' }];
      const ss = world.newSpreadsheet();
      const scriptId = 'script-' + crypto.randomUUID().slice(0, 8);
      const files = { 'Code.gs': 'function myFunction() {\n}\n', 'appsscript.json': JSON.stringify({ timeZone: 'America/New_York', runtimeVersion: 'V8' }) };
      st.scripts.set(scriptId, { project: new Project(world, { owner: u, containerId: ss.id, files }), sheetId: ss.id, owner: u, authorised: false, deployments: [] });
      st.drive.set(ss.id, { owner: u, permissions: [{ type: 'user', role: 'owner', emailAddress: u }], trashed: false });
      st.creates++;
      return [200, { scriptId, parentId: ss.id, files }];
    },
    'POST /clasp/push': b => {
      const s = ownScript(b); if (!s) return [403, { error: 'not found or not yours' }];
      const files = { ...b.files };
      if (st.corruptPush) files['Code.gs'] = files['Code.gs'] + '\n// changed in transit\n';
      s.project.files = files;
      return [200, Object.keys(files)];
    },
    'POST /clasp/pull': b => { const s = ownScript(b); return s ? [200, s.project.files] : [403, { error: 'not found or not yours' }]; },
    'POST /clasp/deploy': b => {
      const s = ownScript(b); if (!s) return [403, { error: 'not found or not yours' }];
      const id = 'dep-' + crypto.randomUUID().slice(0, 8);
      s.deployments.push(id); st.deployments.set(id, b.scriptId);
      return [200, { deploymentId: id, versionNumber: s.deployments.length }];
    },
    'POST /clasp/deployments': b => { const s = ownScript(b); return s ? [200, s.deployments.map(d => ({ deploymentId: d }))] : [403, { error: 'not found' }]; },

    // ---- OAuth ----
    'POST /oauth/token': b => (userOf(b.refresh_token) ? [200, { access_token: 'at-' + b.refresh_token }] : [400, { error: 'invalid_grant' }]),
    'POST /oauth/revoke': b => { const had = st.tokens.delete(b.token); return had ? [200, {}] : [400, { error: 'invalid_token' }]; },

    // ---- control (the tests acting as people) ----
    'POST /_control/nextLogin': b => { st.nextLogin = b.email; return [200, {}]; },
    'POST /_control/api': b => { if (b.on) st.apiOff.delete(b.email); else st.apiOff.add(b.email); return [200, {}]; },
    'POST /_control/runSetup': b => {
      const s = st.scripts.get(b.scriptId); if (!s) return [404, { error: 'no script' }];
      s.authorised = true;
      try { s.project.run('setupBackend', [], { editor: true }); return [200, { ok: true }]; } catch (e) { return [200, { ok: false, error: e.message }]; }
    },
    'POST /_control/authorise': b => { st.scripts.get(b.scriptId).authorised = true; return [200, {}]; },
    'POST /_control/deleteTab': b => {
      const s = st.scripts.get(b.scriptId); const ss = world.spreadsheets.get(s.sheetId);
      ss.deleteSheet(ss.getSheetByName(b.tab)); return [200, {}];
    },
    'POST /_control/otherSheet': b => { st.scripts.get(b.scriptId).project.props.SPREADSHEET_ID = world.newSpreadsheet().id; return [200, {}]; },
    'POST /_control/share': b => {
      const d = st.drive.get(b.sheetId);
      d.permissions = d.permissions.filter(p => p.emailAddress !== b.email);
      if (b.role) d.permissions.push({ type: 'user', role: b.role, emailAddress: b.email });
      return [200, {}];
    },
    'POST /_control/corruptPush': b => { st.corruptPush = !!b.on; return [200, {}]; },
    'POST /_control/closeOld': () => { st.old.windowOpen = false; return [200, {}]; },
    'POST /_control/site': b => { st.site.backend = b.backend; return [200, {}]; },
    'GET /_control/state': () => [200, {
      scripts: [...st.scripts.entries()].map(([id, s]) => ({
        id, sheetId: s.sheetId, owner: s.owner, authorised: s.authorised, deployments: s.deployments,
        props: s.project.props, tabs: world.spreadsheets.get(s.sheetId).dataRowCounts(),
      })),
      drive: Object.fromEntries(st.drive), mail: world.mail, tokens: st.tokens.size, logins: st.logins, creates: st.creates,
      site: st.site, old: st.old,
    }],
  };

  function ownScript(b) {
    const u = userOf(b.refresh_token); const s = st.scripts.get(b.scriptId);
    return u && s && s.owner === u && !st.drive.get(s.sheetId).trashed ? s : null;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const body = await readBody(req);

      // Web app: /exec/<deploymentId>/exec
      const exec = url.pathname.match(/^\/exec\/([^/]+)\/exec$/);
      if (exec && req.method === 'GET') {
        if (exec[1] === 'old') return json(res, 200, { status: 'ok', windowOpen: st.old.windowOpen, deadline: null });
        const s = st.scripts.get(st.deployments.get(exec[1]));
        if (!s || st.drive.get(s.sheetId).trashed) { res.writeHead(404); return res.end('<html>Not found</html>'); }
        let access = '';
        try { access = (JSON.parse(s.project.files['appsscript.json']).webapp || {}).access; } catch { /* no manifest */ }
        if (access !== 'ANYONE_ANONYMOUS') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html><a href="https://accounts.google.com/ServiceLogin">Sign in</a></html>'); }
        if (!s.authorised) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html>Authorization is required to perform that action.</html>'); }
        return json(res, 200, s.project.doGet(Object.fromEntries(url.searchParams)));
      }

      // Drive
      const drv = url.pathname.match(/^\/drive\/files\/([^/]+)$/);
      if (drv) {
        const u = bearerUser(req); const d = st.drive.get(drv[1]);
        if (!u) return json(res, 401, { error: 'unauthenticated' });
        if (!d || d.owner !== u) return json(res, 404, { error: 'not found' });
        if (req.method === 'PATCH') { if (body.trashed) d.trashed = true; return json(res, 200, {}); }
        return json(res, 200, { name: 'sheet', trashed: d.trashed, owners: [{ emailAddress: d.owner }], permissions: d.permissions });
      }

      // Live site
      if (url.pathname === '/site/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html><script type="module" crossorigin src="/site/assets/index-abc.js"></script></html>'); }
      if (url.pathname === '/site/assets/index-abc.js') { res.writeHead(200); return res.end(`const u="${st.site.backend}";`); }

      const route = routes[`${req.method} ${url.pathname}`];
      if (!route) return json(res, 404, { error: 'no route ' + url.pathname });
      const [code, out] = route(body);
      return json(res, code, out);
    } catch (e) { json(res, 500, { error: e.stack }); }
  });

  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ base, state: st, close: () => new Promise(r => server.close(r)) });
  }));
}
