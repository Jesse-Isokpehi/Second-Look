# Development notes

Dated design decisions and checks, in order. Prompt test runs are in `prompt-log.md`.

15 Nov: First prompt-test run scored 41/49; the two failures were network errors (fetch failed), not model errors. Reran the same v1 prompt: 49/49. Recorded both runs in prompt-log.md rather than deleting the failed one.

15 Nov: A perfect score showed the test set was too easy: confidence clustered at 92–99 on well-known myths. Because the second-look prompt only triggers on Medium/Low verdicts, this means it would rarely fire on typical claims. Added harder cases with expected confidence bands before touching the prompt.

15 Nov: Harder test cases (20 cases × 3 runs): verdicts 60/60 correct and fully consistent, but confidence was effectively two-level: High (88–99) for all factual claims including mixed and false-premise ones, Low (10–25) for opinion and unknowable ones. No Medium answers appeared. This matches Zhou et al. (2024). Implication: the second-look prompt would only trigger on opinion claims. Decided to change the prompt (v2) rather than the band threshold, because moving the threshold changes which errors happen without improving the evidence (Week 2 L04, signal detection).

16 Nov: Tested the second-look trigger. With the demo shortcut, the prompt fired on the first Medium answer (JP Morgan, 68%) and reset the streak. Four further agrees at 1–2 s were one short of the five needed, so the next Low answer (coffee) correctly did not trigger. Rushed agrees took 1–2 s and considered ones 19–58 s, so I kept the 4 s threshold: it separates automatic from deliberate decisions in this data.

16 Nov: Considered decisions across the full live session ranged 19–129 s (the 129 s was the coffee claim under the second-look prompt), still far above the 4 s threshold.

16 Nov: In a fresh live session the second-look prompt fired naturally, without the demo shortcut, after five agrees of about 1 s each (Storyboard B).

16 Nov: User check. Another person tried their own claims in live mode. Most were predictions or opinions (football results, share prices), which the system correctly returned as UNCLEAR. Found that "Disagree" is ambiguous on an UNCLEAR verdict: it is not clear what the user disagrees with. Left unchanged for submission and recorded as a limitation.

17 Nov: Kept prompt v1 for submission instead of the v2 planned on 15 Nov. A v2 prompt could spread confidence across the bands, but it would still be the model's self-report, not calibrated confidence, so it would not fix the underlying problem. Two-level confidence is recorded as a limitation, and calibration stays planned.

17 Nov: Built the report figures from live-mode screenshots (docs/screenshots). Retook Storyboard A in one session after noticing the first set mixed sessions (the counter jumped and the hedge wording changed). Corrected the architecture diagram after checking it against the code: validation and demo answers both run in the browser, not on the server.