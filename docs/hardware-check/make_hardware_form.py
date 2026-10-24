"""Builds cluster-hardware-check.pdf: a short fillable form for the HPC convener / in-charges
to confirm or correct the Gargi and Raman facts the questionnaire and analysis rely on.

Pre-filled values come from src/config/clusters.json, so re-run after editing it:
    python3 docs/hardware-check/make_hardware_form.py
"""
import json
from pathlib import Path

from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas

HERE = Path(__file__).resolve().parent
CFG = json.loads((HERE.parents[1] / 'src/config/clusters.json').read_text())
OUT = HERE / 'cluster-hardware-check.pdf'

W, H = A4
M = 15 * mm
INK, MUTED, RULE, BAND = HexColor('#1f2937'), HexColor('#6b7280'), HexColor('#d1d5db'), HexColor('#eef2f7')
COLS = [62 * mm, 52 * mm, 14 * mm]          # item | we use | correct? | (rest) correction
FONT, BOLD = 'Helvetica', 'Helvetica-Bold'


def cluster(cid):
    return next(c for c in CFG['clusters'] if c['id'] == cid)


def node(c, nid):
    return next((n for n in c['nodeTypes'] if n['id'] == nid), {})


def v(x, unit=''):
    return 'not known' if x is None else f'{x:g}{unit}' if isinstance(x, (int, float)) else str(x)


class Form:
    def __init__(self, path):
        self.c = canvas.Canvas(str(path), pagesize=A4)
        self.c.setTitle('Gargi and Raman hardware check')
        self.c.setAuthor('IISER Bhopal HPC Users\' Committee questionnaire')
        self.page = 0
        self.n = 0
        self.new_page()

    # ---- layout helpers -------------------------------------------------
    def new_page(self):
        if self.page:
            self.c.showPage()
        self.page += 1
        self.y = H - M
        self.c.setFont(FONT, 7.5)
        self.c.setFillColor(MUTED)
        self.c.drawRightString(W - M, M / 2, f'Gargi and Raman hardware check: page {self.page}')

    def need(self, h):
        if self.y - h < M:
            self.new_page()

    def text(self, s, size=9, font=FONT, color=INK, width=None, lead=None, x=None):
        lead = lead or size * 1.3
        lines = simpleSplit(s, font, size, width or (W - 2 * M))
        self.need(len(lines) * lead)
        self.c.setFont(font, size)
        self.c.setFillColor(color)
        for ln in lines:
            self.y -= lead
            self.c.drawString(x or M, self.y + 2, ln)

    def gap(self, h=4 * mm):
        self.y -= h

    def heading(self, s):
        self.need(22 * mm)
        self.gap(3 * mm)
        self.text(s, 12, BOLD)
        self.gap(1 * mm)
        self.header_row()

    def header_row(self):
        h = 6 * mm
        self.c.setFillColor(BAND)
        self.c.rect(M, self.y - h, W - 2 * M, h, stroke=0, fill=1)
        self.c.setFillColor(INK)
        self.c.setFont(BOLD, 8)
        x = M
        for label, w in zip(['Item', 'Value we currently use', 'Correct?', 'Correction / comment'], COLS + [0]):
            self.c.drawString(x + 1.5 * mm, self.y - h + 2 * mm, label)
            x += w
        self.y -= h

    def row(self, item, current, note=None):
        """One fact to confirm: a tick box if correct, a field for the correction."""
        self.n += 1
        wi, wc = COLS[0] - 3 * mm, COLS[1] - 3 * mm
        il = simpleSplit(item, FONT, 8.5, wi)
        nl = simpleSplit(note, FONT, 7, wi) if note else []
        cl = simpleSplit(current, FONT, 8.5, wc)
        h = max(9 * mm, (len(il) * 10.5 + len(nl) * 8.5 + 6), len(cl) * 10.5 + 6)
        if self.y - h < M:
            self.new_page()
            self.header_row()
        top = self.y
        self.c.setFillColor(INK)
        self.c.setFont(FONT, 8.5)
        yy = top - 10
        for ln in il:
            self.c.drawString(M + 1.5 * mm, yy, ln)
            yy -= 10.5
        self.c.setFillColor(MUTED)
        self.c.setFont(FONT, 7)
        for ln in nl:
            self.c.drawString(M + 1.5 * mm, yy + 1.5, ln)
            yy -= 8.5
        self.c.setFillColor(INK)
        self.c.setFont(FONT, 8.5)
        yy = top - 10
        for ln in cl:
            self.c.drawString(M + COLS[0] + 1.5 * mm, yy, ln)
            yy -= 10.5
        f = self.c.acroForm
        bx = M + COLS[0] + COLS[1] + 3.5 * mm
        f.checkbox(name=f'ok_{self.n}', tooltip=f'{item}: correct as shown', x=bx, y=top - 5 * mm - 2,
                   size=10, buttonStyle='check', borderColor=MUTED, fillColor=white, textColor=black,
                   forceBorder=True)
        fx = M + sum(COLS) + 1 * mm
        fw = W - M - fx - 1 * mm
        multiline = h > 10 * mm
        f.textfield(name=f'fix_{self.n}', tooltip=f'{item}: correction', x=fx, y=top - h + 1.5 * mm,
                    width=fw, height=h - 3 * mm, fontSize=8, borderWidth=0.5, borderColor=RULE,
                    fillColor=HexColor('#fbfbfd'), textColor=INK, forceBorder=True,
                    fieldFlags='multiline' if multiline else '')
        self.y = top - h
        self.c.setStrokeColor(RULE)
        self.c.setLineWidth(0.4)
        self.c.line(M, self.y, W - M, self.y)

    def ask(self, item, note=None, height=9 * mm):
        """A question with no current value: just an answer field across the full width."""
        self.n += 1
        il = simpleSplit(item, FONT, 8.5, COLS[0] - 3 * mm)
        nl = simpleSplit(note, FONT, 7, COLS[0] - 3 * mm) if note else []
        h = max(height, len(il) * 10.5 + len(nl) * 8.5 + 6)
        if self.y - h < M:
            self.new_page()
            self.header_row()
        top = self.y
        self.c.setFillColor(INK)
        self.c.setFont(FONT, 8.5)
        yy = top - 10
        for ln in il:
            self.c.drawString(M + 1.5 * mm, yy, ln)
            yy -= 10.5
        self.c.setFillColor(MUTED)
        self.c.setFont(FONT, 7)
        for ln in nl:
            self.c.drawString(M + 1.5 * mm, yy + 1.5, ln)
            yy -= 8.5
        fx = M + COLS[0] + 1 * mm
        self.c.acroForm.textfield(name=f'ans_{self.n}', tooltip=item, x=fx, y=top - h + 1.5 * mm,
                                  width=W - M - fx - 1 * mm, height=h - 3 * mm, fontSize=8,
                                  borderWidth=0.5, borderColor=RULE, fillColor=HexColor('#fbfbfd'),
                                  textColor=INK, forceBorder=True,
                                  fieldFlags='multiline' if h > 10 * mm else '')
        self.y = top - h
        self.c.setStrokeColor(RULE)
        self.c.setLineWidth(0.4)
        self.c.line(M, self.y, W - M, self.y)

    def save(self):
        self.c.save()


def queue_text(q):
    nodes = f"{q['minNodes']}" if q['minNodes'] == q['maxNodes'] else f"{q['minNodes']}–{q['maxNodes']}"
    return f"{nodes} node(s), {v(q['walltimeHours'])} h, {q['maxConcurrentJobs']} job(s) at once"


def main():
    g, r = cluster('gargi'), cluster('raman')
    f = Form(OUT)

    f.text('Gargi and Raman hardware check', 16, BOLD)
    f.gap(1 * mm)
    f.text('For the HPC convener / in-charges. About 10 minutes.', 9.5, color=MUTED)
    f.gap(2 * mm)
    f.text('The HPC workload questionnaire compares what research groups report against the capacity of Gargi '
           'and Raman. These are the hardware and policy figures it currently uses. Where a figure is right, tick '
           '"Correct?". Where it is wrong or missing, type the right value in the last column. "Not known" '
           'is a fine answer. Approximate figures are welcome; please say so.', 9)
    f.gap(2 * mm)
    f.text('Fill this in a PDF reader (Adobe Acrobat Reader, macOS Preview, or a browser), save, and send it back.',
           8.5, color=MUTED)

    f.gap(2 * mm)
    f.text('Filled in by (name, role, date)', 9, BOLD)
    f.gap(1 * mm)
    f.n += 1
    f.c.acroForm.textfield(name='filled_by', tooltip='Filled in by (name, role, date)', x=M, y=f.y - 8 * mm,
                           width=W - 2 * M, height=7 * mm, fontSize=9, borderWidth=0.5, borderColor=RULE,
                           fillColor=HexColor('#fbfbfd'), textColor=INK, forceBorder=True)
    f.y -= 9 * mm

    # ---- Gargi -----------------------------------------------------------
    gc, gh = node(g, 'compute'), node(g, 'highmem')
    f.heading('1. Gargi')
    f.row('Standard compute nodes in service', f"{gc['count']} nodes", 'Nodes users can actually run on today.')
    f.row('CPU and cores per standard node', f"{gc['cpu']}, {gc['coresPerNode']} cores",
          'Cores available to jobs (after any reserved for the system).')
    f.row('Memory per standard node', f"{gc['memoryGB']} GB")
    f.row('High-memory nodes: count, cores, memory', f"{gh['count']} nodes, {gh['coresPerNode']} cores, {gh['memoryGB']} GB")
    f.row('GPU nodes', 'None')
    f.row('Interconnect', g['interconnect'])
    f.row('Parallel storage: system and usable size', f"{g['storage']['system']}, {v(g['storage']['usableTB'])} TB")
    f.row('Home : scratch split of that storage', f"{100 - g['storage']['scratchFraction'] * 100:g} : {g['storage']['scratchFraction'] * 100:g} (assumed)",
          'Or give the two sizes in TB.')
    f.row('Storage bandwidth', f"{v(g['storage']['bandwidthGBs'])} GB/s")
    f.ask('Quotas: home per user / per group; scratch per user', 'Write "none" if there is no quota.')
    f.ask('Scratch clean-up (purge) policy', 'e.g. files older than 30 days deleted; or none.')
    f.ask('Local disk on compute nodes (size usable by jobs)', 'e.g. /tmp on SSD, 400 GB; or none.')

    f.heading('2. Gargi queues')
    for q in g['queues']:
        f.row(f"Queue: {q['id']}" + (' (high-memory nodes)' if q.get('nodeType') == 'highmem' else ''), queue_text(q))
    f.ask('Limits across all queues', 'e.g. max running jobs or cores per user or per group; fair-share in use?')

    # ---- Raman -----------------------------------------------------------
    rc, rh = node(r, 'compute'), node(r, 'highmem')
    gpu = (r.get('gpuNodes') or [{}])[0]
    f.heading('3. Raman')
    f.row('Standard compute nodes in service', f"{rc['count']} nodes",
          'Nodes users can actually run on today (some older nodes may be down).')
    f.row('CPU and cores per standard node', f"{rc['cpu']}, {rc['coresPerNode']} cores",
          'We assumed 2 sockets x 12 cores = 24. Please confirm.')
    f.row('Memory per standard node', f"{rc['memoryGB']} GB")
    f.row('High-memory node(s): count, CPU, cores, memory',
          f"{rh['count']} node, {rh['cpu']}, {rh['coresPerNode']} cores, {rh['memoryGB']} GB",
          'Cores assumed; please confirm the number of sockets.')
    f.row('GPU nodes: count', f"{v(gpu.get('count'))} node")
    f.row('GPUs per GPU node', v(gpu.get('gpusPerNode')))
    f.row('GPU model and memory per GPU', v(gpu.get('gpuModel')), 'e.g. NVIDIA V100 32 GB.')
    f.row('GPU node: CPU cores and memory', f"{gpu.get('coresPerNode')} cores, {gpu.get('memoryGB')} GB")
    f.ask('GPU node: NVLink between GPUs?', 'Yes / No / Not known.')
    f.row('Interconnect', r['interconnect'])
    f.row('Parallel storage: system and usable size', f"{r['storage']['system']}, {v(r['storage']['usableTB'])} TB")
    f.row('Home : scratch split of that storage', f"{100 - r['storage']['scratchFraction'] * 100:g} : {r['storage']['scratchFraction'] * 100:g} (assumed)",
          'Or give the two sizes in TB.')
    f.row('Storage bandwidth', f"{v(r['storage']['bandwidthGBs'])} GB/s")
    f.ask('Quotas: home per user / per group; scratch per user', 'Write "none" if there is no quota.')
    f.ask('Scratch clean-up (purge) policy')
    f.ask('Local disk on compute nodes (size usable by jobs)')
    f.ask('Expected remaining service life of Raman', 'e.g. warranty end, planned retirement year, or not known.')

    f.heading('4. Raman queues')
    for q in r['queues']:
        tag = {'highmem': ' (high-memory node)', 'gpu': ' (GPU node)'}.get(q.get('nodeType'), '')
        f.row(f"Queue: {q['id']}{tag}", queue_text(q))
    f.ask('Limits across all queues', 'e.g. max running jobs or cores per user or per group; fair-share in use?')

    # ---- Both ------------------------------------------------------------
    ch = CFG['charges']
    f.heading('5. Both clusters')
    f.row('Usage charges', f"CPU INR {ch['cpuPerCoreHour']:.2f}/core-h (7-day queue {ch['cpuPerCoreHourSevenDayQueue']:.2f}); "
          f"GPU INR {ch['gpuPerCardHour']:.2f}/card-h")
    f.ask('Planned downtime per year (days), each cluster', 'Maintenance, power shutdowns. Helps set how many core-hours can really be delivered.')
    f.ask('Average utilisation over the last 12 months (%), each cluster', 'From Slurm accounting, if available; otherwise not known.')
    f.ask('Can a Slurm accounting export be shared (per group, last 12 months)?',
          'Core-hours, GPU-hours, job sizes and waits per group. Used only to check reported figures against records.')
    f.ask('Anything else the committee should know', height=22 * mm)

    f.save()
    print(f'wrote {OUT} ({f.page} pages, {f.n} fields)')


if __name__ == '__main__':
    main()
