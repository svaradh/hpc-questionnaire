# Survey introduction slides

`survey_intro.tex` — Beamer deck (metropolis theme) introducing the HPC Workload Characterisation Survey:
purpose and scope, who fills it in, terms, job patterns, the form's sections and follow-ups, submission
and how the committee evaluates responses. `survey_intro.pdf` is the built deck.

Build (TeX Live with XeLaTeX):

    cd slides && latexmk -xelatex survey_intro.tex

Placeholders in orange (`\TBD{…}`) — form link, deadline, department volunteers, committee contact —
are to be filled in before presenting.

`figures/` holds screenshots of the form (schema 2.6.0) with neutral placeholder entries ("Example code").
If the form changes, retake them so the slides match.
