"""
Turns the returned hardware-check PDF into an update of src/config/clusters.json, with people deciding.

    python tools/cluster-update/update_clusters.py read  <filled.pdf>      # report + proposal
    python tools/cluster-update/update_clusters.py apply <proposal.json>   # write accepted changes
    python tools/cluster-update/update_clusters.py release <tag>           # new analysis release, checked

read     checks the PDF is the form that was sent (docs/hardware-check/field-map.json), then writes into
         tools/cluster-update/work/<date>/ (not in git: it holds the convener's name and comments):
           report.md      every item: confirmed, the answer, or not answered
           proposal.json  the changes to clusters.json. "auto" = a clear number or yes/no, apply: true;
                          "review" = free text or a composite value, apply: false until someone decides
                          (set "new" and "apply": true); "info" = no place in clusters.json (quotas,
                          purge, downtime ...), for the committee.
apply    writes the entries with "apply": true, keeping the file's layout (a minimal diff), then says
         whether anything the FORM uses changed (queue list, scratch triggers, thresholds) and which
         trigger thresholds no longer follow from the clusters.
release  sets the new release tag for the notebooks, rebuilds and runs them, builds the form, and prints
         the commit / tag / deploy commands to run.
"""

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / 'src/config/clusters.json'
FIELD_MAP = ROOT / 'docs/hardware-check/field-map.json'
WORK = ROOT / 'tools/cluster-update/work'
FORM_KEYS = {('queues', 'minNodes'), ('queues', 'maxNodes'), ('queues', 'walltimeHours'),
             ('storage', 'usableTB'), ('storage', 'scratchFraction')}

# ---------------------------------------------------------------------------
# Reading the PDF
# ---------------------------------------------------------------------------


def read_pdf(pdf_path, field_map):
    from pypdf import PdfReader
    fields = PdfReader(str(pdf_path)).get_fields() or {}

    def val(name):
        f = fields.get(name) or {}
        v = f.get('/V')
        return '' if v is None else str(v).strip()

    # Same form? Every mapped field must exist with the same description (tooltip).
    wrong = []
    for e in field_map['fields']:
        if e['kind'] == 'row':
            tip = (fields.get(e['ok']) or {}).get('/TU')
            if tip != f"{e['item']}: correct as shown":
                wrong.append(e['item'])
        elif (fields.get(e['ans']) or {}).get('/TU') != e['item']:
            wrong.append(e['item'])
    if wrong:
        sys.exit('This PDF is not the hardware-check form that was sent (field map does not match: '
                 + '; '.join(wrong[:5]) + ('…' if len(wrong) > 5 else '') + ').')

    out = []
    for e in field_map['fields']:
        if e['kind'] == 'row':
            ok = val(e['ok']) not in ('', '/Off', 'Off')
            out.append({**e, 'confirmed': ok, 'text': val(e['fix'])})
        else:
            out.append({**e, 'confirmed': False, 'text': val(e['ans'])})
    return val('filled_by'), out

# ---------------------------------------------------------------------------
# Interpreting answers: (path, new value, status, note)
# path = (cluster id | None, section | None, item id | index | None, key)
# ---------------------------------------------------------------------------


NUM = r'(\d+(?:\.\d+)?)'


def numbers(t):
    return [float(x) for x in re.findall(NUM, t.replace(',', ''))]


def as_int_or_float(x):
    return int(x) if float(x).is_integer() else x


def yes_no(t):
    s = t.strip().lower()
    if re.match(r'^(not known|unknown|don.?t know|n/?a)\b', s):
        return 'unknown'
    if re.match(r'^(yes|y)\b', s):
        return True
    if re.match(r'^(no|n)\b', s):
        return False
    return None


def none_word(t):
    return bool(re.match(r'^\s*(none|no limit|unlimited|no)\s*\.?\s*$', t, re.I))


def one_number(t, unit=None):
    """The value when the answer is a single number (optionally with a unit): else None."""
    s = t.replace(',', '')
    if unit == 'GB' and re.search(r'\bTB\b', s, re.I):
        n = numbers(s)
        return as_int_or_float(n[0] * 1024) if len(n) == 1 else None
    n = numbers(s)
    return as_int_or_float(n[0]) if len(n) == 1 else None


def interpret(e):
    """Proposed changes for one answered item."""
    k, t = e['key'], e['text']
    parts = k.split('.')
    c = parts[0] if parts[0] in ('gargi', 'raman') else None
    info = [{'path': None, 'new': None, 'status': 'info', 'note': 'For the record (no place in clusters.json).'}]

    def auto(path, new, note=''):
        return [{'path': path, 'new': new, 'status': 'auto', 'note': note}]

    def review(path, suggestion=None, note=''):
        return [{'path': path, 'new': suggestion, 'status': 'review', 'note': note}]

    if re.fullmatch(r'\w+\.compute\.count', k):
        n = one_number(t)
        return auto((c, 'nodeTypes', 'compute', 'count'), int(n)) if n is not None else review((c, 'nodeTypes', 'compute', 'count'), note='Not a single number.')
    if re.fullmatch(r'\w+\.compute\.cpuCores', k):
        m = re.search(r'(\d+)\s*cores', t, re.I)
        out = auto((c, 'nodeTypes', 'compute', 'coresPerNode'), int(m.group(1))) if m else review((c, 'nodeTypes', 'compute', 'coresPerNode'), note='No "N cores" found.')
        return out + review((c, 'nodeTypes', 'compute', 'cpu'), note='CPU model text, if it changed.')
    if re.fullmatch(r'\w+\.compute\.memoryGB', k):
        n = one_number(t, 'GB')
        return auto((c, 'nodeTypes', 'compute', 'memoryGB'), n) if n is not None else review((c, 'nodeTypes', 'compute', 'memoryGB'))
    if k.endswith('.highmem'):
        return review((c, 'nodeTypes', 'highmem', None), note='Count, cores and memory of the high-memory node type: set each key.')
    if k == 'gargi.gpuNodes':
        return review(('gargi', 'gpuNodes', None, None), note='Gargi GPU nodes (none assumed).')
    if k.endswith('.interconnect'):
        return auto((c, None, None, 'interconnect'), t)
    if k.endswith('.storage.systemSize'):
        m = re.search(NUM + r'\s*TB', t.replace(',', ''), re.I)
        out = auto((c, 'storage', None, 'usableTB'), as_int_or_float(float(m.group(1)))) if m else review((c, 'storage', None, 'usableTB'), note='No "N TB" found.')
        return out + review((c, 'storage', None, 'system'), note='Storage system name, if it changed.')
    if k.endswith('.storage.split'):
        n = numbers(t)
        sug = round(n[1] / (n[0] + n[1]), 3) if len(n) == 2 and n[0] + n[1] > 0 else None
        return review((c, 'storage', None, 'scratchFraction'), sug, 'Scratch share of storage = scratch / (home + scratch); check the order of the two figures.')
    if k.endswith('.storage.homeOnFastPFS'):
        yn = yes_no(t)
        if yn in (True, False):   # home on the fast system too -> not "only scratch"
            return auto((c, 'storage', None, 'scratchOnlyOnFastPFS'), not yn,
                        f'Home on the fast system: {"Yes" if yn else "No"} -> scratchOnlyOnFastPFS {str(not yn).lower()}.')
        return auto((c, 'storage', None, 'scratchOnlyOnFastPFS'), None) if yn == 'unknown' else review((c, 'storage', None, 'scratchOnlyOnFastPFS'))
    if k.endswith('.storage.bandwidthGBs'):
        n = one_number(t)
        return auto((c, 'storage', None, 'bandwidthGBs'), n) if n is not None else review((c, 'storage', None, 'bandwidthGBs'))
    m = re.fullmatch(r'(\w+)\.groupLimits\.(maxRunningJobs|maxRunningNodes|maxQueuedJobs)', k)
    if m:
        path = (c, 'groupLimits', None, m.group(2))
        if none_word(t):
            return auto(path, None, '"none" (null = no limit).')
        n = one_number(t)
        return auto(path, int(n)) if n is not None else review(path)
    if k.endswith('.groupLimits.fairShare'):
        yn = yes_no(t)
        out = auto((c, 'groupLimits', None, 'fairShare'), yn) if yn in (True, False) else review((c, 'groupLimits', None, 'fairShare'))
        return out + (info if len(t) > 4 else [])
    if k.endswith('.queuesBoundToNodes'):
        yn = yes_no(t)
        if yn is False:
            return auto((c, None, None, 'computeQueuesShareNodes'), True, 'No queue is bound: as assumed.')
        return review((c, None, None, 'computeQueuesShareNodes'), False if yn is True else None,
                      'Queues bound to nodes changes how capacity is shared: discuss before applying.')
    m = re.fullmatch(r'(\w+)\.queues\.(\w+)', k)
    if m:
        q, s = m.group(2), t.replace(',', '')
        out = []
        r = re.search(r'(\d+)\s*(?:[–-]|to)\s*(\d+)\s*node', s, re.I) or re.search(r'(\d+)\s*node', s, re.I)
        if r:
            lo = int(r.group(1)); hi = int(r.group(2)) if r.lastindex == 2 else lo
            out += review((c, 'queues', q, 'minNodes'), lo) + review((c, 'queues', q, 'maxNodes'), hi)
        r = re.search(NUM + r'\s*(?:h|hours?)\b', s, re.I)
        if r:
            out += review((c, 'queues', q, 'walltimeHours'), as_int_or_float(float(r.group(1))))
        r = re.search(r'(\d+)\s*jobs?\s*at once', s, re.I)
        if r:
            out += review((c, 'queues', q, 'maxConcurrentJobs'), int(r.group(1)))
        r = re.search(r'(\d+)\s*nodes?\s*(?:in total|total|for all)', s, re.I)
        if r:
            out += review((c, 'queues', q, 'maxTotalNodes'), int(r.group(1)))
        r = re.search(r'(\d+)\s*(?:running\s*)?jobs?\s*(?:in total|total|for all)', s, re.I)
        if r:
            out += review((c, 'queues', q, 'maxTotalJobs'), int(r.group(1)))
        return out or review((c, 'queues', q, None), note='Queue correction: set each key it changes.')
    if k == 'raman.gpu.count':
        n = one_number(t)
        return auto(('raman', 'gpuNodes', 0, 'count'), int(n)) if n is not None else review(('raman', 'gpuNodes', 0, 'count'))
    if k == 'raman.gpu.gpusPerNode':
        n = one_number(t)
        return auto(('raman', 'gpuNodes', 0, 'gpusPerNode'), int(n)) if n is not None else review(('raman', 'gpuNodes', 0, 'gpusPerNode'))
    if k == 'raman.gpu.model':
        return auto(('raman', 'gpuNodes', 0, 'gpuModel'), t)
    if k == 'raman.gpu.coresMemory':
        return review(('raman', 'gpuNodes', 0, None), note='GPU node cores and memory: set coresPerNode / memoryGB.')
    if k == 'charges':
        return review((None, 'charges', None, None), note='Usage charges: set cpuPerCoreHour / cpuPerCoreHourSevenDayQueue / gpuPerCardHour.')
    if k == 'both.downtimeDays':
        n = numbers(t)
        note = 'Sets the availability parameter in notebook 07 (analysis/parameters.json), not clusters.json.'
        if n:
            note += f' {n[0]:g} days/year -> availability about {1 - n[0] / 365:.3f}.'
        return [{'path': None, 'new': None, 'status': 'info', 'note': note}]
    return info

# ---------------------------------------------------------------------------
# clusters.json: get / set, minimal-diff writing, form impact, thresholds
# ---------------------------------------------------------------------------


def locate(cfg, path):
    """The object holding the key, for a path (cluster, section, item, key)."""
    c, sec, item, _ = path
    obj = cfg if c is None else next(x for x in cfg['clusters'] if x['id'] == c)
    if sec is None:
        return obj
    obj = obj[sec]
    if item is None:
        return obj
    if isinstance(item, int):
        return obj[item]
    return next(x for x in obj if x.get('id') == item)


def path_text(path):
    return '.'.join(str(p) for p in path if p is not None)


JSON_VALUE = r'(?:"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|true|false|null)'


def text_set(text, path, value):
    """Changes one value in the file's text, keeping its layout. Returns the new text or None."""
    c, sec, item, key = path
    lines = text.split('\n')
    lo, hi = 0, len(lines)
    if c is not None:   # the cluster's block
        starts = [i for i, l in enumerate(lines) if re.search(r'^\s*"id": "(gargi|raman)",?\s*$', l)]
        mine = [i for i in starts if f'"{c}"' in lines[i]]
        if not mine:
            return None
        lo = mine[0]
        later = [i for i in starts if i > lo]
        hi = later[0] if later else len(lines)
    if sec in ('nodeTypes', 'queues'):
        cand = [i for i in range(lo, hi) if f'"id": "{item}"' in lines[i] and f'"{key}"' in lines[i]]
        sect = [i for i in range(lo, hi) if f'"{sec}": [' in lines[i]]
        cand = [i for i in cand if sect and i > sect[0] and (sec != 'nodeTypes' or not any(
            f'"queues": [' in lines[j] for j in range(sect[0], i)))]
    elif sec == 'gpuNodes':
        s = [i for i in range(lo, hi) if '"gpuNodes": [' in lines[i]]
        cand = [s[0] + 1] if s and f'"{key}"' in lines[s[0] + 1] else []
    elif sec in ('storage', 'groupLimits'):
        cand = [i for i in range(lo, hi) if lines[i].lstrip().startswith(f'"{sec}":') and f'"{key}"' in lines[i]]
    elif sec is None:
        cand = [i for i in range(lo, hi) if lines[i].lstrip().startswith(f'"{key}":')]
    else:   # a top-level block such as charges / thresholds
        s = [i for i in range(lo, hi) if lines[i].lstrip().startswith(f'"{sec}":')]
        cand = []
        if s:
            for i in range(s[0] + 1, hi):
                if lines[i].lstrip().startswith(f'"{key}":'):
                    cand = [i]
                    break
                if lines[i].strip().startswith('}'):
                    break
    if len(cand) != 1:
        return None
    i = cand[0]
    new, n = re.subn(rf'("{re.escape(key)}"\s*:\s*){JSON_VALUE}', lambda m: m.group(1) + json.dumps(value, ensure_ascii=False), lines[i], count=1)
    if n != 1:
        return None
    lines[i] = new
    return '\n'.join(lines)


def derived_thresholds(cfg):
    """The trigger thresholds that follow from the clusters (largeRunCores is a committee choice)."""
    qs = [(c, q) for c in cfg['clusters'] for q in c['queues']]
    compute = {c['id']: next(n for n in c['nodeTypes'] if n['id'] == 'compute') for c in cfg['clusters']}
    plain = [(c, q) for c, q in qs if not q.get('nodeType')]
    return {
        'maxMultiNodeWalltimeHours': max(q['walltimeHours'] for _, q in plain if q['maxNodes'] > 1),
        'maxSingleNodeWalltimeHours': max(q['walltimeHours'] for _, q in qs if q.get('nodeType') != 'gpu'),
        'maxGpuWalltimeHours': max((q['walltimeHours'] for _, q in qs if q.get('nodeType') == 'gpu'), default=None),
        'maxCoresPerJob': max(q['maxNodes'] * compute[c['id']]['coresPerNode'] for c, q in plain),
        'largestStandardNodeMemoryGB': max(n['memoryGB'] for n in compute.values()),
        'debugWalltimeHours': max((q['walltimeHours'] for _, q in qs if q['id'] == 'debug'), default=None),
    }


def threshold_check(cfg):
    want = derived_thresholds(cfg)
    have = cfg['thresholds']
    return {k: (have.get(k), v) for k, v in want.items() if have.get(k) != v}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def cmd_read(args):
    field_map = json.loads(FIELD_MAP.read_text())
    filled_by, items = read_pdf(args.pdf, field_map)
    cfg = json.loads(CONFIG.read_text())
    out_dir = Path(args.out) if args.out else WORK / dt.date.today().isoformat()
    out_dir.mkdir(parents=True, exist_ok=True)

    proposal, lines = [], [f'# Hardware check: answers\n', f'Filled in by: {filled_by or "(not given)"}  ',
                           f'Read from: {Path(args.pdf).name} on {dt.date.today().isoformat()}\n']
    counts = {'confirmed': 0, 'answered': 0, 'unanswered': 0}
    for e in items:
        where = e['item']
        if e['kind'] == 'row' and e['confirmed'] and not e['text']:
            counts['confirmed'] += 1
            lines.append(f'- **{where}**: confirmed ({e["current"]})')
            continue
        if not e['text']:
            counts['unanswered'] += 1
            lines.append(f'- **{where}**: not answered' + (f' (we use: {e["current"]})' if e['kind'] == 'row' else ''))
            continue
        counts['answered'] += 1
        conflict = e['kind'] == 'row' and e['confirmed']
        lines.append(f'- **{where}**: "{e["text"]}"' + (f' (we use: {e["current"]})' if e['kind'] == 'row' else '')
                     + (' **(also ticked "correct")**' if conflict else ''))
        for p in interpret(e):
            entry = {'item': where, 'answer': e['text'], 'status': p['status'], 'note': p['note']}
            if p['path'] is not None and p['path'][3] is not None:
                obj = locate(cfg, p['path'])
                entry.update(path=list(p['path']), field=path_text(p['path']), old=obj.get(p['path'][3]), new=p['new'])
            elif p['path'] is not None:
                entry.update(path=list(p['path']), field=path_text(p['path']), new=None,
                             note=p['note'] + ' Split into one entry per key before applying.')
            if conflict and entry['status'] == 'auto':
                entry['status'] = 'review'
                entry['note'] = (entry['note'] + ' Ticked "correct" but also gave a value.').strip()
            if entry['status'] in ('auto', 'review') and 'old' in entry and entry.get('old') == entry.get('new') \
                    and (entry['status'] == 'auto' or entry.get('new') is not None):
                entry['status'] = 'same'
            entry['apply'] = entry['status'] == 'auto'
            proposal.append(entry)

    lines.insert(3, f'Confirmed: {counts["confirmed"]} · answered or corrected: {counts["answered"]} · '
                    f'not answered: {counts["unanswered"]}\n')
    lines.append('\n## Proposed changes to clusters.json\n')
    for p in proposal:
        if p['status'] in ('auto', 'review', 'same'):
            lines.append(f'- [{p["status"]}] `{p.get("field", "?")}`: {json.dumps(p.get("old"))} → {json.dumps(p.get("new"))}'
                         + (f' — {p["note"]}' if p['note'] else ''))
    lines.append('\n## For the record (not in clusters.json)\n')
    for p in proposal:
        if p['status'] == 'info':
            lines.append(f'- **{p["item"]}**: "{p["answer"]}" — {p["note"]}')
    (out_dir / 'report.md').write_text('\n'.join(lines) + '\n')
    (out_dir / 'proposal.json').write_text(json.dumps(
        {'_how': 'Entries with "apply": true are written by "apply". For a "review" entry, set "new" and "apply": true, '
                 'or leave "apply": false. "same" = already the value used.', 'source': Path(args.pdf).name,
         'changes': proposal}, indent=1, ensure_ascii=False) + '\n')
    n = {s: sum(1 for p in proposal if p['status'] == s) for s in ('auto', 'review', 'same', 'info')}
    print(f'{counts["confirmed"]} confirmed, {counts["answered"]} answered, {counts["unanswered"]} not answered.')
    print(f'Proposal: {n["auto"]} automatic, {n["review"]} to review, {n["same"]} unchanged, {n["info"]} for the record.')
    print(f'Wrote {out_dir / "report.md"} and {out_dir / "proposal.json"}')


def cmd_apply(args):
    prop = json.loads(Path(args.proposal).read_text())
    path_cfg = Path(args.config) if args.config else CONFIG
    text = path_cfg.read_text()
    cfg = json.loads(text)
    done, refused = [], []
    for p in prop['changes']:
        if not p.get('apply'):
            continue
        path = tuple(p['path']) if p.get('path') else None
        if not path or path[3] is None:
            refused.append(f'{p.get("field", p["item"])}: no single key (split it first)')
            continue
        try:
            obj = locate(cfg, path)
        except (StopIteration, KeyError, IndexError):
            refused.append(f'{p["field"]}: not found in clusters.json')
            continue
        if path[3] not in obj:
            refused.append(f'{p["field"]}: no such key')
            continue
        old = obj[path[3]]
        obj[path[3]] = p['new']
        new_text = text_set(text, path, p['new'])
        if new_text is None:
            refused.append(f'{p["field"]}: could not place the change in the file')
            obj[path[3]] = old
            continue
        text = new_text
        done.append((path, old, p['new']))
    if json.loads(text) != cfg:
        sys.exit('Internal check failed: the written file does not match the intended changes. Nothing written.')
    path_cfg.write_text(text)
    for path, old, new in done:
        print(f'  set {path_text(path)}: {json.dumps(old)} -> {json.dumps(new)}')
    for r in refused:
        print(f'  NOT applied: {r}')
    form = [path_text(p) for p, _, _ in done if (p[1], p[3]) in FORM_KEYS or p[1] == 'thresholds']
    print(f'{len(done)} change(s) written to {path_cfg.relative_to(ROOT) if path_cfg.is_relative_to(ROOT) else path_cfg}.')
    if form:
        print('The FORM uses some of these (queue list or scratch triggers): ' + ', '.join(form))
        print('  Before launch: republish the form with the release. After launch: decide with the committee.')
    else:
        print('Nothing the form uses changed: an analysis release is enough (no need to republish the form).')
    stale = threshold_check(cfg)
    if stale:
        print('Trigger thresholds that no longer follow from the clusters (now -> derived):')
        for k, (have, want) in stale.items():
            print(f'  thresholds.{k}: {have} -> {want}')
        print('  Update them (they change when follow-up questions open) only if the form is to be republished.')


def cmd_release(args):
    tag = args.tag
    if not re.fullmatch(r'v3-\d{4}-\d{2}-\d{2}[a-z]?', tag):
        sys.exit('Tag should look like v3-YYYY-MM-DD (a letter may follow for a second release that day).')
    if subprocess.run(['git', 'rev-parse', '-q', '--verify', f'refs/tags/{tag}'], cwd=ROOT, capture_output=True).returncode == 0:
        sys.exit(f'Tag {tag} exists already: choose another.')
    sc = ROOT / 'analysis/sheets_client.py'
    s = sc.read_text()
    s2, n = re.subn(r'^DEFAULT_REF = "[^"]+"', f'DEFAULT_REF = "{tag}"', s, count=1, flags=re.M)
    if n != 1:
        sys.exit('DEFAULT_REF not found in analysis/sheets_client.py')
    sc.write_text(s2)
    old_tag = re.search(r'^DEFAULT_REF = "([^"]+)"', s, re.M).group(1)
    guide = ROOT / 'docs/CONVENER-GUIDE.md'
    g = guide.read_text()
    if old_tag in g:
        guide.write_text(g.replace(old_tag, tag))
        print(f'  ok  guide names {tag} (was {old_tag}); also change it in the shared copy of the guide')
    py = str(ROOT / '.venv/bin/python') if (ROOT / '.venv/bin/python').exists() else sys.executable
    steps = [([py, 'analysis/_build_notebooks.py'], 'notebooks rebuilt'),
             ([py, 'analysis/run_notebooks.py', '--kernel', 'hpc-venv'], 'notebooks run'),
             (['npm', 'run', '-s', 'build'], 'form builds'),
             ([py, 'docs/build_guide_html.py'], 'guide HTML rebuilt')]
    for cmd, what in steps:
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        if r.returncode != 0 or 'FAIL' in r.stdout:
            print(r.stdout[-2000:], r.stderr[-2000:])
            sys.exit(f'Stopped: {what} failed. Nothing committed.')
        print(f'  ok  {what}')
    print(f'\nRelease {tag} is ready. To publish it:')
    print('  git add -A src/config/clusters.json analysis docs && git commit -m "Cluster details from the hardware check; release ' + tag + '"')
    print(f'  git push && git tag -a {tag} -m "Release {tag}" && git push origin {tag}')
    print('  npm run deploy        # only if the form uses something that changed (see "apply")')
    print(f'Then tell the convener: set REPO_REF = \'{tag}\' in the first cell of their notebook 07 copy.')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('read'); r.add_argument('pdf'); r.add_argument('--out')
    a = sub.add_parser('apply'); a.add_argument('proposal'); a.add_argument('--config')
    rl = sub.add_parser('release'); rl.add_argument('tag')
    args = ap.parse_args()
    {'read': cmd_read, 'apply': cmd_apply, 'release': cmd_release}[args.cmd](args)


if __name__ == '__main__':
    main()
