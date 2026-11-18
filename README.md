# Second Look

**README prose word count: about 1,490** (excluding code, commands, tables of file names and links)

An AI fact checker that supports appropriate reliance. Paste a claim or an AI answer; the AI gives a
verdict and says how sure it is, and the final call is yours. If you start agreeing quickly without
looking closer, Second Look asks for your own answer first.

Built for **Assignment 2, Intelligent Interactive Systems** (University of Birmingham).
Submitted version: tag [`v1.0-submission`](https://github.com/jesse-isokpehi/second-look/releases/tag/v1.0-submission).

## Project status

**Implemented (works in live mode)**
- Claim input (max 300 characters), loading state with cancel
- Live verdicts from the Claude API: TRUE / FALSE / UNCLEAR, confidence 0–100, up to 3 reasons
- Confidence shown four ways: a first-person hedge (3 wordings per level), a word label, a number and a bar
- "Why?" panel, hidden until asked for, labelled "Written by the AI · no sources yet"
- Reply validation in the browser: anything unreadable is shown as UNCLEAR
- Behaviour tracker and second-look prompt (rule below), with "Why am I seeing this?" and a pause toggle
- "Your call vs the AI" comparison and a session summary with CSV export
- Error handling: timeouts, dropped connections (one retry), API errors, double clicks

**Simulated**
- **Demo mode:** pre-written answers in `data/demo-responses.json`, used when no API key is set.
  A "Demo mode · responses simulated" badge is shown. Unknown claims return UNCLEAR.

**Not built (planned): what a production version would add**
- **Browser extension:** highlight text on any page or AI chat to see the verdict in a small pop-up beside it.
- **Real sources:** the "Why?" panel would link the evidence behind each verdict, such as Wikipedia pages, research papers and fact-checking sites.
- **Calibrated confidence:** adjust stated confidence to match how often the model is right (testing showed only High 88–99 or Low 10–25).
- **Cross-session tracking:** remember reliance habits, with a page to view and delete stored data.
- **Clearer UNCLEAR choices:** replace Agree / Disagree on UNCLEAR verdicts (found in the user check).
- **Evaluation:** a multi-week study of whether varied hedges stay noticed.

**Known limitations**
- Confidence is effectively two-level in testing (High 88–99, Low 10–25), so the prompt seldom fires on factual claims.
- "Disagree" is ambiguous on an UNCLEAR verdict (found in the user check; not yet changed).
- The session log lives in memory only and is cleared on a new session.

## Technology stack

| Part | Technology | What it does |
| --- | --- | --- |
| Front end | HTML, CSS, plain JavaScript (no framework) | Screens, tracker, hedges, validation |
| Server | Node.js 20+ `http` module, no dependencies | Serves the page, builds the prompt, keeps the API key off the browser |
| AI model | Claude API, `claude-sonnet-5-5` (Anthropic) | Returns the verdict, confidence and reasons as JSON |
| Prompt | `prompts/system-v1.txt` | System prompt; the claim is wrapped in `<claim>` tags |
| Tests | Node's built-in test runner (`node --test`) | Unit tests for tracker, verdicts, hedges, scoring and server |
| Prompt tests | `scripts/run-prompt-tests.js` | Scores live replies against `docs/prompt-criteria.md` |
| Font | Inter Tight (Google Fonts, SIL OFL 1.1) | Interface type |

**Still undecided:** the retrieval source and ranking method, and how to calibrate confidence.

## Running or inspecting the work

Needs [Node.js](https://nodejs.org) 20 or newer. Nothing else to install.

```bash
npm start
```

Then open <http://localhost:8000>. Press Ctrl+C to stop.

**Without an API key** the app runs in demo mode. This is the quickest way to inspect it.

**Live mode (use your own key):**

1. Copy `.env.example` to `.env`.
2. Put your Anthropic API key after `ANTHROPIC_API_KEY=` (no quotes, no spaces).
3. Run `npm start` again. The "Demo mode" badge disappears.

`.env` is git-ignored, so the key is never committed, and it stays on the local server. No key is
included in this repository.

**See the second-look prompt quickly:** open <http://localhost:8000/?demoStreak=1>. The app starts as
if five quick agrees had already happened, so the first Medium or Low answer shows the prompt. In
demo mode, try "The Eiffel Tower grows taller in summer".

**The rule** (`js/reliance.js`): 5 agrees in a row, each under 4 seconds, without opening "Why?",
then a Medium or Low verdict, while prompts are not paused. Disagreeing, opening "Why?" or a slow
agree resets the streak.

**Run the tests:**

```bash
npm test
```

**Run the prompt tests** (live key needed; each case is one small paid call):

```bash
npm run prompt-tests -- --repeat 3 --change "what you changed"
```

Each run adds a row to `docs/prompt-log.md`.

**Inspect without running:** the storyboards and architecture diagram are in `docs/figures/`, and the
screenshots they were built from are in `docs/screenshots/`.

## Development record

Grouped by stage. Links go to the commits.

**1. Idea and screens (31 Oct – 11 Nov)**
- Changed the project from a quiz to a live fact checker. A quiz on known answers tested my
  Assignment 1 hypothesis but did not help anyone check a claim; the fact checker keeps the same
  hedges inside a real task.
- Designed the screens and purple-brown theme as mockups first, then built page shells
  ([41450ae](https://github.com/jesse-isokpehi/second-look/commit/41450ae),
  [3297c04](https://github.com/jesse-isokpehi/second-look/commit/3297c04),
  [a28a306](https://github.com/jesse-isokpehi/second-look/commit/a28a306)).

**2. Core logic (12 Nov)**
- Moved demo answers into a data file and validated AI replies, so an unreadable reply becomes
  UNCLEAR instead of breaking the page
  ([4602247](https://github.com/jesse-isokpehi/second-look/commit/4602247),
  [c9bd8b5](https://github.com/jesse-isokpehi/second-look/commit/c9bd8b5)).
- Added the behaviour tracker and escalation rule with unit tests, then wired them into the screens
  ([76469c4](https://github.com/jesse-isokpehi/second-look/commit/76469c4),
  [e696580](https://github.com/jesse-isokpehi/second-look/commit/e696580)).

**3. Hedges, control and explanation dosage (15 Nov)**
- Added varied first-person hedges (3 per level) and logged which one was shown
  ([f513f60](https://github.com/jesse-isokpehi/second-look/commit/f513f60),
  [10b67fb](https://github.com/jesse-isokpehi/second-look/commit/10b67fb)).
- Added a pause toggle so the user stays in control of the prompt
  ([7ff9f18](https://github.com/jesse-isokpehi/second-look/commit/7ff9f18)).
- Limited explanations to 3 bullets and labelled them as AI-written with no sources
  ([37df318](https://github.com/jesse-isokpehi/second-look/commit/37df318)).

**4. Live mode and key safety (15 Nov)**
- Added `.env` and `.gitignore` before any key was used
  ([4131b59](https://github.com/jesse-isokpehi/second-look/commit/4131b59)).
- Added a local server so the key never reaches the browser
  ([349838d](https://github.com/jesse-isokpehi/second-look/commit/349838d)).
- Checked: `git status` showed `.env` untracked, and `git grep "sk-ant-"` found only the test placeholder.

**5. Prompt testing (15 Nov)**
- Wrote five pass criteria before the first run (`docs/prompt-criteria.md`) and a script that logs every
  run ([cc0342f](https://github.com/jesse-isokpehi/second-look/commit/cc0342f)).
- First run scored 41/49 because of two network failures, not model errors. I kept that run in the
  log, added a retry for dropped connections
  ([9f7a584](https://github.com/jesse-isokpehi/second-look/commit/9f7a584)), and the rerun scored 49/49.
- A perfect score meant the cases were too easy. Added harder cases with expected confidence bands and
    a `--repeat` option, plus a sixth criterion for the confidence band
  ([652864c](https://github.com/jesse-isokpehi/second-look/commit/652864c),
  [edad5b7](https://github.com/jesse-isokpehi/second-look/commit/edad5b7),
  [78a9f70](https://github.com/jesse-isokpehi/second-look/commit/78a9f70)).
  Result: 60/60 correct verdicts, no changes between repeats, 3/3 injections ignored, 54/60 in the
  expected band.
- Finding: confidence was effectively two-level and no Medium appeared, matching Zhou et al. (2024).
  I considered a v2 prompt but kept v1 for submission, because changing the prompt would not make the
  confidence calibrated. Recorded as a limitation instead.
- Terminal output for all three runs is in `docs/screenshots/tests/`.

**6. Trigger and user check (18 Nov)**
- Tested the trigger live. Rushed agrees took 0.7–1.3 s; considered decisions took 19–129 s, so I
  kept the 4-second threshold. The prompt then fired naturally, without the shortcut (Storyboard B).
- User check: another person tried their own claims. Most were predictions or opinions, which the
  system correctly returned as UNCLEAR. This exposed that "Disagree" is ambiguous on an UNCLEAR verdict.
- Full notes: `docs/dev-notes.md`. Prompt runs: `docs/prompt-log.md`.

## AI assistance

**Tools used**
- **Claude Code** (Anthropic): aided in some bits of code, tests and scripts from my specifications.
  Commits authored by "Claude" in the history are from Claude Code; I reviewed and merged them.
- **Claude** (claude.ai chat): helped plan the scope and milestones to structure development, checked the architecture diagram against the code, and compose the storyboards from my
  screenshots.
- **Claude design canvas:** screen mockups and theme before coding.
- **Claude API** (`claude-sonnet-5-5`): the live model inside the app. I paid for the key myself.

**What I decided, changed and checked (examples)**
- **Scope:** I chose to build a fact checker instead of a quiz, and chose which features to build
  now and which to leave as planned.
- **Design choices:** I chose to keep the word + number + bar even though Ojewale et al. (2026) found
  combined cues can increase over-reliance, and recorded the trade-off in the report.
- **Threshold:** I ran the live timing tests myself. When the prompt did not fire on one run, the
  suggested fix was to loosen the threshold; the log showed the streak had simply reset after an
  earlier prompt, so I kept 4 seconds.
- **Diagram:** the first AI-drawn diagram showed validation on the server and demo answers going
  through the server. Checking the code showed both happen in the browser, so it was corrected.
- **Report wording:** I corrected claims that did not match the evidence, for example "schema-validated
  JSON" (there is no formal schema) and a reversed description of the habituation research.
- **Storyboards:** I noticed screenshots came from mixed sessions, so I retook them in one live session.
- **Key safety:** I checked `.env` was never committed before every push.

## Additional files

- `docs/figures/`: `architecture.png`, `architecture.svg` and editable `architecture.mmd`
  (Figure 1), and `storyboard_A.png`, `storyboard_B.png`, `storyboard_C.png` (Figures 2–4)
- `docs/screenshots/`: the raw live-mode screenshots (A1–A5, B1–B5, C1–C3) used in the storyboards.
  To edit the diagram, paste `architecture.mmd` into <https://mermaid.live>.
- `docs/screenshots/tests/`: terminal output from the baseline, rerun and harder prompt-test runs
- `docs/dev-notes.md`: dated design decisions and checks
- `docs/prompt-criteria.md`, `docs/prompt-log.md`: prompt test criteria and every run
- `Vivid Description.md`: design and screen notes

No ZIP is needed; everything is in this repository.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page shell: header, main area, footer |
| `css/styles.css` | Design tokens and component styles |
| `server.js` | Local server: serves the page and calls the AI with the key from `.env` |
| `.env.example` | Template for `.env`, where your API key goes |
| `js/config.js` | Settings: timeout, claim length limit, server addresses |
| `js/verdicts.js` | Gets a verdict (demo file or live API) and validates the reply |
| `js/reliance.js` | Behaviour tracker, escalation rule, pause switch, CSV export |
| `js/hedges.js` | Hedge wording shown above the verdict |
| `js/app.js` | Screens and interaction |
| `data/demo-responses.json` | Pre-written answers for demo mode |
| `prompts/system-v1.txt` | System prompt for the live AI |
| `prompts/verdict-prompt.js` | Loads the newest prompt file |
| `tests/` | Unit tests and `prompt-cases.json` |
| `scripts/run-prompt-tests.js` | Runs the prompt cases against the live API and logs the score |
| `scripts/load-env.js` | Reads `.env` for the server and the prompt tests |

## Licence

MIT. See `LICENSE`.