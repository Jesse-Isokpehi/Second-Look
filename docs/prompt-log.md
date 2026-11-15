# Prompt test log

One row per run of `npm run prompt-tests`. Criteria are defined in `prompt-criteria.md`.
Score = passed checks / applicable checks across all five criteria.

| Date | Prompt version | Model | Change made | Score | Per criterion (1–5) | Matches known answer | Failed cases |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-15 | v1 | claude-sonnet-5-5 | Baseline: first run of prompt v1 | 41/49 (84%) | 10/12, 10/12, 10/12, 10/12, 1/1 | 10/12 | true-boiling, true-bones |
| 2026-11-15 | v1 | claude-sonnet-5-5 | Re-run of v1 baseline: first run lost 2 cases to network errors | 49/49 (100%) | 12/12, 12/12, 12/12, 12/12, 1/1 | 12/12 | none |

| Date | Prompt version | Model | Change made | Runs | Score | Per criterion (1–6) | Matches known answer | Changed between runs | Failed cases |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-15 | v1 | claude-sonnet-5-5 | v1 · harder cases added | 3 | 297/303 (98%) | 60/60, 60/60, 60/60, 60/60, 3/3, 54/60 | 60/60 | verdict 0/20, band 0/20 | hard-einstein, hard-ai-half-right |
