"""
run_notebooks.py
----------------
Runs the committee notebooks (00–06) locally against a folder of CSV tabs,
by default the synthetic test data, and reports which ones fail. The
notebooks on disk are not modified.

    python analysis/run_notebooks.py                       # fixtures/synthetic_v3
    python analysis/run_notebooks.py path/to/csv_folder    # another export
    python analysis/run_notebooks.py --kernel my-kernel    # a named Jupyter kernel

Triage output (notebook 06) is printed so the suggested categories can be checked.
"""

import argparse
import glob
import os
import sys

import nbformat
from nbclient import NotebookClient

HERE = os.path.dirname(os.path.abspath(__file__))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("data", nargs="?", default="fixtures/synthetic_v3", help="folder of <Tab>.csv files, relative to analysis/")
    ap.add_argument("--kernel", default="python3", help="Jupyter kernel name (default: python3)")
    args = ap.parse_args()

    os.chdir(HERE)
    ok = True
    for f in sorted(glob.glob("0*.ipynb")):
        nb = nbformat.read(f, as_version=4)
        for c in nb.cells:
            if c.cell_type == "code":
                c.source = c.source.replace("'PASTE_YOUR_SPREADSHEET_ID_HERE'", repr(args.data))
        try:
            NotebookClient(nb, kernel_name=args.kernel, timeout=300).execute()
            print("OK  ", f)
        except Exception as e:  # report and carry on with the next notebook
            ok = False
            print("FAIL", f, str(e)[-1500:])
            continue
        if f.startswith("06_"):
            for c in nb.cells:
                for o in c.get("outputs", []):
                    if "text" in o:
                        print(o["text"][:3000])
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
