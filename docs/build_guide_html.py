"""
Builds docs/CONVENER-GUIDE.html from docs/CONVENER-GUIDE.md: one self-contained page that opens in any
browser, offline (no scripts, no web fonts). The Mermaid diagram, which only GitHub draws, is replaced by
the same pipeline drawn in plain SVG. Every in-page link is checked; the build fails if one is broken.

    python docs/build_guide_html.py

Run after editing the guide, and commit both files.
"""

import html
import re
import sys
from pathlib import Path

import markdown

HERE = Path(__file__).resolve().parent
SRC = HERE / 'CONVENER-GUIDE.md'
OUT = HERE / 'CONVENER-GUIDE.html'

INK, QUIET, EDGE, ACCENT = '#111827', '#4b5563', '#9ca3af', '#2563b0'


def box(cx, cy, w, name, l1, l2, kind='plain'):
    fill = f'fill="{ACCENT}" fill-opacity="0.12"' if kind == 'main' else 'fill="none"'
    stroke = ACCENT if kind == 'main' else EDGE
    width = 2 if kind == 'main' else 1.25
    dash = ' stroke-dasharray="5 4"' if kind == 'source' else ''
    body = INK if kind == 'main' else QUIET
    return (f'<rect x="{cx - w / 2}" y="{cy - 36}" width="{w}" height="72" rx="8" {fill} stroke="{stroke}" '
            f'stroke-width="{width}"{dash}/>'
            f'<text x="{cx}" y="{cy - 12}" text-anchor="middle" font-weight="600" fill="{INK}">{html.escape(name)}</text>'
            f'<text x="{cx}" y="{cy + 8}" text-anchor="middle" font-size="11.5" fill="{body}">{html.escape(l1)}</text>'
            f'<text x="{cx}" y="{cy + 24}" text-anchor="middle" font-size="11.5" fill="{body}">{html.escape(l2)}</text>')


def pipeline_svg():
    arrow = 'marker-end="url(#a)"'
    solid = [f'<path d="{d}" {arrow}/>' for d in (
        'M240 110H272', 'M488 110H520', 'M628 146V170H380V194', 'M380 266V290H200V314',
        'M380 290H560V314', 'M200 386V434', 'M560 386V434')]
    dashed = [f'<path d="{d}" {arrow}/>' for d in ('M132 194V146', 'M132 266V314')]
    return ''.join([
        '<figure class="diagram"><svg viewBox="0 0 760 530" role="img" font-size="13" '
        'font-family="-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" '
        'aria-label="Evidence flows from the form to the committee; decisions stay with people">',
        f'<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" '
        f'orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{EDGE}"/></marker></defs>',
        f'<text x="24" y="34" font-size="15" font-weight="600" fill="{INK}">Evidence flows from the form to the '
        'committee; decisions stay with people</text>',
        f'<g fill="none" stroke="{EDGE}" stroke-width="1.25">{"".join(solid)}</g>',
        f'<g fill="none" stroke="{EDGE}" stroke-width="1.25" stroke-dasharray="5 4">{"".join(dashed)}</g>',
        f'<text x="124" y="296" text-anchor="end" font-size="11.5" fill="{QUIET}">fixed release</text>',
        box(132, 110, 216, '1 Set-up', 'Developer builds, tests,', 'rehearses the handover'),
        box(380, 110, 216, '2 Handover', 'Empty backend built in the', "convener's Google account"),
        box(628, 110, 216, '3 Launch', 'Form link and slides sent', 'to research groups'),
        box(132, 230, 216, 'GitHub repository', 'Source of truth: code,', 'cluster details, guide', 'source'),
        box(380, 230, 216, '4 Responses', 'Form to script to sheet;', 'answers emailed back'),
        box(200, 350, 280, '6 Analysis (Colab)', 'Notebook builds the committee', 'report: counts, no group names'),
        box(560, 350, 280, '5 Per-group reports', 'HPC Committee menu makes', 'a Google Doc for one group'),
        box(380, 470, 400, '7 Committee decisions', 'Queues, limits, charging, expansion:',
            'decided by people, not automated', 'main'),
        '</svg><figcaption>The questionnaire pipeline, seven stages. Dashed: the repository the code comes '
        'from.</figcaption></figure>',
    ])


CSS = """
:root { --ink:#111827; --muted:#4b5563; --rule:#d1d5db; --accent:#1a4e8a; --tint:#f4f6f9; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--tint); color: var(--ink);
  font: 16px/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
main { max-width: 860px; margin: 2rem auto; padding: 2rem 2.5rem 3rem; background: #fff;
  border: 1px solid var(--rule); border-radius: 10px; }
h1 { font-size: 1.7rem; line-height: 1.25; color: #0f2f57; margin: 2.2rem 0 .8rem; }
h1:first-child { margin-top: 0; }
h2 { font-size: 1.3rem; color: #0f2f57; margin: 2rem 0 .6rem; padding-bottom: .25rem;
  border-bottom: 2px solid var(--accent); }
h3 { font-size: 1.08rem; color: var(--accent); margin: 1.4rem 0 .4rem; }
a { color: #2563b0; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 2rem 0; }
code { font: .88em/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #f1f3f6;
  padding: .1em .3em; border-radius: 4px; overflow-wrap: anywhere; }
table { border-collapse: collapse; width: 100%; margin: .8rem 0 1rem; font-size: .93rem; }
th, td { border: 1px solid var(--rule); padding: .45rem .6rem; text-align: left; vertical-align: top; }
th { background: #f4f6f9; }
li { margin: .25rem 0; }
li > ol, li > ul { margin: .3rem 0; }
.diagram { margin: 1.2rem 0; }
.diagram svg { width: 100%; height: auto; }
.diagram figcaption { color: var(--muted); font-size: .85rem; text-align: center; }
.top { position: fixed; right: 1rem; bottom: 1rem; background: #fff; border: 1px solid var(--rule);
  border-radius: 6px; padding: .3rem .6rem; font-size: .85rem; text-decoration: none; }
.built { color: var(--muted); font-size: .8rem; margin-top: 2.5rem; }
@media (max-width: 700px) { main { margin: 0; border-radius: 0; padding: 1.2rem; } }
@media print { body { background: #fff; } main { border: 0; margin: 0; padding: 0; max-width: none; }
  .top { display: none; } h2, h3 { break-after: avoid; } tr, .diagram { break-inside: avoid; } }
"""


def build():
    text = SRC.read_text(encoding='utf-8')
    # The diagram: Mermaid needs GitHub to draw it; the HTML carries the same picture as SVG.
    text, n = re.subn(r'```mermaid\n.*?\n```', '<!--DIAGRAM-->', text, count=1, flags=re.S)
    if n != 1:
        sys.exit('No Mermaid diagram found in the guide.')
    # Python-Markdown nests list content at 4 spaces; the guide indents it by 3 (GitHub accepts both).
    text = re.sub(r'(?m)^ {3}(?=\S)', '    ', text)
    # A list item right after an indented continuation line would be read as more of that paragraph
    # (GitHub starts a new item there); a blank line between them keeps the list a list.
    text = re.sub(r'(?m)^( {4,}\S.*)\n(?=(?:\d+\.|[-*]) )', r'\1\n\n', text)
    md = markdown.Markdown(extensions=['tables', 'fenced_code', 'sane_lists', 'toc'],
                           extension_configs={'toc': {'permalink': False}})
    body = md.convert(text).replace('<!--DIAGRAM-->', pipeline_svg()).replace('<p>' + pipeline_svg() + '</p>', pipeline_svg())
    title = re.search(r'^# (.+)$', text, re.M).group(1)

    ids = set(re.findall(r'id="([^"]+)"', body))
    broken = sorted({h for h in re.findall(r'href="#([^"]+)"', body) if h not in ids})
    if broken:
        sys.exit('Broken in-page links: ' + ', '.join(broken))

    page = (f'<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            f'<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            f'<title>{html.escape(title)}</title>\n<style>{CSS}</style>\n</head>\n<body>\n<main id="top">\n'
            f'{body}\n<p class="built">This page is generated from <code>docs/CONVENER-GUIDE.md</code> in '
            f'<a href="https://github.com/svaradh/hpc-questionnaire">the repository</a>, which is the '
            f'authoritative version.</p>\n</main>\n<a class="top" href="#top">Back to top</a>\n</body>\n</html>\n')
    OUT.write_text(page, encoding='utf-8')
    links = len(re.findall(r'href="#', body))
    print(f'wrote {OUT.relative_to(HERE.parent)} ({links} in-page links, all resolve)')


if __name__ == '__main__':
    build()
