// A small simulation of the Apps Script services the backend uses, enough to run the
// real Code.gs / SheetWriter.gs / Setup.gs on this machine: setupBackend and
// doGet(?check=setup). Used by the handover tests only; it is not Google's runtime.
//
// One Project = one script project with its files, Script Properties and (if bound)
// its container spreadsheet. Each call runs in a fresh context, as Apps Script does,
// so file-level vars (SPREADSHEET_ID = properties...) are re-read every time.

import vm from 'node:vm';
import crypto from 'node:crypto';

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  each(fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.r - 1 + i, this.c - 1 + j, i, j); }
  clearContent() { this.each((y, x) => { if (this.sheet.rows[y]) this.sheet.rows[y][x] = ''; }); return this; }
  setValues(v) { this.each((y, x, i, j) => this.sheet.set(y, x, v[i][j])); return this; }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { out.push([]); for (let j = 0; j < this.nc; j++) out[i].push(this.sheet.get(this.r - 1 + i, this.c - 1 + j)); } return out; }
  getRow() { return this.r; }
  setFontWeight() { return this; } setFontColor() { return this; } setBackground() { return this; } setFontSize() { return this; }
}

class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  getName() { return this.name; }
  set(y, x, v) { while (this.rows.length <= y) this.rows.push([]); const row = this.rows[y]; while (row.length <= x) row.push(''); row[x] = v; }
  get(y, x) { return (this.rows[y] && this.rows[y][x] !== undefined) ? this.rows[y][x] : ''; }
  width() { return Math.max(0, ...this.rows.map(r => r.length)); }
  getMaxColumns() { return Math.max(26, this.width()); }
  getLastRow() { for (let y = this.rows.length - 1; y >= 0; y--) if (this.rows[y].some(v => v !== '')) return y + 1; return 0; }
  getLastColumn() { return this.width(); }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  getDataRange() { return new Range(this, 1, 1, this.getLastRow(), Math.max(1, this.width())); }
  appendRow(values) { const y = this.getLastRow(); values.forEach((v, x) => this.set(y, x, v)); }
  deleteRow(i) { this.rows.splice(i - 1, 1); }
  setFrozenRows() {}
}

export class Spreadsheet {
  constructor(id) { this.id = id; this.sheets = [new Sheet('Sheet1')]; }
  getId() { return this.id; }
  getUrl() { return `https://docs.google.com/spreadsheets/d/${this.id}/edit`; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets.slice(); }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
  /** Data rows (below the header) per tab, for tests. */
  dataRowCounts() { return Object.fromEntries(this.sheets.map(s => [s.name, Math.max(0, s.getLastRow() - 1)])); }
}

/** State shared by all projects of one fake Google account set. */
export class World {
  constructor() { this.spreadsheets = new Map(); this.folders = new Map(); this.mail = []; }
  newSpreadsheet() { const id = 'sheet-' + crypto.randomUUID().slice(0, 8); const ss = new Spreadsheet(id); this.spreadsheets.set(id, ss); return ss; }
}

export class Project {
  /** files: { name: source } (.gs sources only are executed). */
  constructor(world, { owner, containerId = null, files = {} }) {
    Object.assign(this, { world, owner, containerId, files, props: {} });
  }

  services(editor) {
    const world = this.world, project = this;
    const props = {
      getProperty: k => (k in project.props ? project.props[k] : null),
      setProperty: (k, v) => { project.props[k] = String(v); return props; },
    };
    const openById = id => {
      const ss = id && world.spreadsheets.get(id);
      if (!ss) throw new Error('Unexpected error while getting the method or property openById on object SpreadsheetApp.');
      return ss;
    };
    return {
      PropertiesService: { getScriptProperties: () => props },
      SpreadsheetApp: {
        // In the editor a bound project sees its container; a web-app call sees none.
        getActiveSpreadsheet: () => (editor && project.containerId ? openById(project.containerId) : null),
        openById,
        flush() {},
        getUi: () => { throw new Error('No UI in the simulation'); },
      },
      DriveApp: {
        createFolder(name) {
          const id = 'folder-' + crypto.randomUUID().slice(0, 8);
          const f = { id, name, trashed: false, getId: () => id, getUrl: () => `https://drive.google.com/drive/folders/${id}`, isTrashed: () => f.trashed };
          world.folders.set(id, f); return f;
        },
        getFolderById(id) { const f = id && world.folders.get(id); if (!f) throw new Error('No item with the given ID could be found.'); return f; },
      },
      Session: { getEffectiveUser: () => ({ getEmail: () => project.owner }) },
      GmailApp: { sendEmail: (to, subject, body) => world.mail.push({ from: project.owner, to, subject, body }) },
      Utilities: {
        getUuid: () => crypto.randomUUID(),
        DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
        // Apps Script returns signed bytes (-128..127).
        computeDigest: (alg, text) => [...crypto.createHash(alg).update(String(text), 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)),
      },
      Logger: { log() {} },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
      ContentService: {
        MimeType: { JSON: 'json' },
        createTextOutput: text => { const o = { text, setMimeType: () => o, getContent: () => text }; return o; },
      },
    };
  }

  /** Runs fnName in a fresh global context. editor: true = Run from the script editor. */
  run(fnName, args = [], { editor = false } = {}) {
    const ctx = vm.createContext({ ...this.services(editor), console });
    for (const [name, src] of Object.entries(this.files)) {
      if (name.endsWith('.gs') || name.endsWith('.js')) vm.runInContext(src, ctx, { filename: name });
    }
    if (typeof ctx[fnName] !== 'function') throw new Error(`Script function not found: ${fnName}`);
    return ctx[fnName](...args);
  }

  doGet(parameter = {}) { return JSON.parse(this.run('doGet', [{ parameter }]).getContent()); }
}
