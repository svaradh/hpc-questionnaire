# Updating the cluster details from the returned hardware-check PDF

When the convener returns `docs/hardware-check/cluster-hardware-check.pdf` filled in, this tool turns it
into an update of `src/config/clusters.json` and a new analysis release. People decide every change that
is not a plain number or yes/no. The convener's only task afterwards is to change `REPO_REF` in their
notebook.

## Steps

```bash
# 0. once: the Python set-up from README.md (pypdf is in requirements.txt)

# 1. Read the PDF. Checks it is the form that was sent, then writes a report and a proposal to
#    tools/cluster-update/work/<date>/ (not in git: it holds the convener's name and comments).
.venv/bin/python tools/cluster-update/update_clusters.py read ~/Downloads/cluster-hardware-check.pdf

# 2. Read work/<date>/report.md. In work/<date>/proposal.json:
#    "auto"   a plain number or yes/no; "apply": true already. Set it to false to skip.
#    "review" free text or a composite value (queues, high-memory node, storage split, charges);
#             set "new" to the value to use and "apply": true, or leave it.
#    "same"   already the value we use.    "info"  for the record only (quotas, purge, downtime ...).

# 3. Apply. Writes only "apply": true entries, keeps the file's layout, and reports whether anything
#    the FORM uses changed and which trigger thresholds no longer follow from the clusters.
.venv/bin/python tools/cluster-update/update_clusters.py apply tools/cluster-update/work/<date>/proposal.json
git diff src/config/clusters.json

# 4. Release (new tag name): sets the notebooks' release, rebuilds and runs them, builds the form,
#    rebuilds the guide, and prints the commit / tag / deploy commands.
.venv/bin/python tools/cluster-update/update_clusters.py release v3-YYYY-MM-DD
```

Then tell the convener the tag: they set `REPO_REF = '<tag>'` in the first cell of their copy of
notebook 07 (guide, section 2.6). Change the release name in the shared copy of the guide too.

## The form

`clusters.json` also feeds the form: its queue list (nodes and wall time per queue) and the trigger
thresholds and scratch sizes that decide when follow-up questions open. Most hardware-check answers
(group limits, queue ceilings, GPUs per node, which file system holds home, downtime) are used only by
the analysis. `apply` says when a change touches the form:

- **before the launch**: update the thresholds it lists, republish the form (`npm run deploy`), and
  make the release;
- **after responses have started**: usually leave the form as it is, so questions appear the same way
  for everyone; the analysis uses the corrected values anyway. A large correction is for the committee.

## What maps where

`docs/hardware-check/field-map.json` (written by `make_hardware_form.py` with the PDF) links each form
field to its place in `clusters.json`. The PDF the convener has was rebuilt and checked identical
(text, field names and descriptions) when the map was made. If the form is ever regenerated with
different rows, send the new PDF and use the map written with it.

Tests (nothing in the repository is changed): `.venv/bin/python tools/cluster-update/test_update_clusters.py`.
