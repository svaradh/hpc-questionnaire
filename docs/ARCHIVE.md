# Archived versions

Earlier questionnaire versions are preserved as git tags (on GitHub: *Tags*). Check one out with `git checkout <tag>`.

| Tag | Commit | What it is |
|---|---|---|
| `v1-archive` | `fef6f4e` | Questionnaire v1 (schema 1.1.0) source, including the original analysis notebooks. This is the form that collected the pilot responses. |
| `v1-live-site` | `6d2379f` | The built v1 site on the `gh-pages` branch (the live form at the time of archiving). |
| `v2-committee-review` | `fffdc37` | Questionnaire v2 (schema 1.2.0) as reviewed by the committee. |
| `v2-archive` | `f869103` | Questionnaire v2 (schema 1.3.0) with the committee's feedback applied. Superseded by v3 (schema 2.0.0). |

## Responses

- **v1 pilot responses** stay in the original "HPC Questionnaire Responses" Google Sheet, which is the archive. That sheet
  has known stale header labels in `ScalingInfo` and `ServiceObservations` (see `TODO.md`). They are not migrated into v3:
  questions, units and dimensions changed, so values would not be comparable.
- **v3 responses** go to a new spreadsheet (see `TODO.md` → deployment).

## Until v3 is deployed

`main` and the live `gh-pages` site still serve v1. When v3 is merged and deployed, close the v1 submission window
(set `SUBMISSION_DEADLINE` in the v1 Apps Script project to a past date).
