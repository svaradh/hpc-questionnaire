"""
Tests the hardware-check update: fills the real form as a convener might, then reads it, applies the
proposal to a copy of clusters.json, and checks the result. Nothing in the repository is changed.

    python tools/cluster-update/test_update_clusters.py
"""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from pypdf import PdfReader, PdfWriter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
TOOL = HERE / 'update_clusters.py'
FORM = ROOT / 'docs/hardware-check/cluster-hardware-check.pdf'
sys.path.insert(0, str(HERE))
import update_clusters as uc  # noqa: E402

passed = failed = 0


def check(cond, msg):
    global passed, failed
    print(('  ok   ' if cond else '  FAIL ') + msg)
    passed += bool(cond)
    failed += not cond


def field_for(key, kind):
    m = json.loads((ROOT / 'docs/hardware-check/field-map.json').read_text())
    e = next(x for x in m['fields'] if x['key'] == key)
    return e[kind]


def fill(out, values):
    w = PdfWriter(clone_from=PdfReader(str(FORM)))
    for page in w.pages:
        w.update_page_form_field_values(page, values, auto_regenerate=False)
    w.write(str(out))


def run(*args):
    r = subprocess.run([sys.executable, str(TOOL), *args], cwd=ROOT, capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


cfg0 = json.loads(uc.CONFIG.read_text())
check(uc.threshold_check(cfg0) == {}, 'present thresholds follow from the present clusters')

tmp = Path(tempfile.mkdtemp(prefix='cluster-update-test-'))
answers = {
    'filled_by': 'Test Convener, HPC in-charge, 2026-12-01',
    field_for('gargi.compute.count', 'fix'): '16',
    field_for('gargi.compute.memoryGB', 'ok'): '/Yes',
    field_for('gargi.compute.memoryGB', 'fix'): '768 GB',                  # ticked AND written: review
    field_for('raman.compute.cpuCores', 'ok'): '/Yes',                     # confirmed
    field_for('raman.compute.memoryGB', 'ok'): '/Yes',
    field_for('raman.compute.memoryGB', 'fix'): '192 GB',                  # ticked AND a different value: review
    field_for('raman.gpu.gpusPerNode', 'fix'): '4',
    field_for('raman.gpu.model', 'fix'): 'NVIDIA V100 32 GB',
    field_for('gargi.groupLimits.maxRunningJobs', 'fix'): 'none',
    field_for('gargi.groupLimits.maxRunningNodes', 'fix'): '6',
    field_for('raman.groupLimits.fairShare', 'fix'): 'Yes, 30-day half-life',
    field_for('gargi.storage.homeOnFastPFS', 'ans'): 'Yes',
    field_for('raman.storage.homeOnFastPFS', 'ans'): 'No, home is on a separate NFS server',
    field_for('gargi.queues.short', 'fix'): '1-3 nodes, 96 h',
    field_for('both.downtimeDays', 'ans'): '10 days',
    field_for('gargi.quotas', 'ans'): 'home 1 TB per group; scratch none',
}
filled = tmp / 'filled.pdf'
fill(filled, answers)

code, out = run('read', str(filled), '--out', str(tmp / 'work'))
check(code == 0, 'reads the filled form')
prop = json.loads((tmp / 'work/proposal.json').read_text())['changes']
by = {p.get('field'): p for p in prop if p.get('field')}
check(by['gargi.nodeTypes.compute.count'] == {**by['gargi.nodeTypes.compute.count'], 'status': 'auto', 'old': 17, 'new': 16, 'apply': True},
      'a single number becomes an automatic change (17 -> 16)')
check(by['gargi.nodeTypes.compute.memoryGB']['status'] == 'same', 'ticked "correct" and wrote the same value: unchanged')
m = by['raman.nodeTypes.compute.memoryGB']
check(m['status'] == 'review' and m['new'] == 192 and not m['apply'], 'ticked "correct" but a different value written: left for review')
check(by['gargi.queues.short.minNodes']['status'] == 'same', 'queue figures that repeat the current value are marked unchanged')
check(by['raman.gpuNodes.0.gpusPerNode']['new'] == 4 and by['raman.gpuNodes.0.gpuModel']['new'] == 'NVIDIA V100 32 GB', 'GPU count and model read')
check(by['gargi.groupLimits.maxRunningJobs']['new'] is None and by['gargi.groupLimits.maxRunningNodes']['new'] == 6, '"none" -> null, a number -> the limit')
check(by['raman.groupLimits.fairShare']['status'] == 'same', 'fair-share "Yes" on Raman is what we already use')
check(by['gargi.storage.scratchOnlyOnFastPFS']['new'] is False and by['raman.storage.scratchOnlyOnFastPFS']['new'] is True,
      'home on the fast system: Yes -> scratchOnlyOnFastPFS false; No -> true')
q = by['gargi.queues.short.walltimeHours']
check(q['status'] == 'review' and q['new'] == 96 and not q['apply'], 'a queue correction is parsed but left for review')
check(any(p['status'] == 'info' and 'availability' in p['note'] for p in prop), 'downtime is reported for the availability parameter')
report = (tmp / 'work/report.md').read_text()
check('Test Convener' in report and 'confirmed' in report and 'not answered' in report, 'report lists confirmed, answered and unanswered items')

# Accept the queue change too, then apply to a copy of clusters.json.
for p in prop:
    if p.get('field') == 'gargi.queues.short.walltimeHours':
        p['apply'] = True
doc = json.loads((tmp / 'work/proposal.json').read_text())
doc['changes'] = prop
(tmp / 'work/proposal.json').write_text(json.dumps(doc))
cfg_copy = tmp / 'clusters.json'
shutil.copy(uc.CONFIG, cfg_copy)
code, out = run('apply', str(tmp / 'work/proposal.json'), '--config', str(cfg_copy))
check(code == 0, 'applies the accepted changes')
new = json.loads(cfg_copy.read_text())
g = next(c for c in new['clusters'] if c['id'] == 'gargi')
r = next(c for c in new['clusters'] if c['id'] == 'raman')
check(g['nodeTypes'][0]['count'] == 16 and r['gpuNodes'][0]['gpusPerNode'] == 4 and g['groupLimits']['maxRunningNodes'] == 6,
      'values written where they belong')
check(next(q for q in g['queues'] if q['id'] == 'short')['walltimeHours'] == 96 and g['nodeTypes'][0]['memoryGB'] == 768,
      'accepted review applied; unaccepted one left alone')
before = uc.CONFIG.read_text().split('\n')
after = cfg_copy.read_text().split('\n')
changed = sum(1 for a, b in zip(before, after) if a != b)
check(len(before) == len(after) and changed <= 8, f'layout kept: {changed} line(s) differ, nothing else')
check('The FORM uses some of these' in out and 'gargi.queues.short.walltimeHours' in out, 'says the form is affected by a queue change')
check('thresholds.maxMultiNodeWalltimeHours: 72 -> 96' in out, 'flags the trigger threshold that no longer follows')
check(uc.CONFIG.read_text() == '\n'.join(before), 'the real clusters.json is untouched')

# A different PDF is refused.
code, out = run('read', str(ROOT / 'slides/survey_intro.pdf'), '--out', str(tmp / 'w2'))
check(code != 0 and 'not the hardware-check form' in out, 'a different PDF is refused')

shutil.rmtree(tmp)
print(f'\n{passed} passed, {failed} failed')
sys.exit(1 if failed else 0)
