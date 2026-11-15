# Second LooK

Check a claim you saw online. The AI says what it thinks and how sure it is; the final call is yours.
If you start agreeing quickly without looking closer, Second Look asks for your own answer first.

## Run it

There is nothing to install or build, but the page must be opened through a local server
(double-clicking `index.html` will not load the demo answers).

- **PyCharm:** right-click `index.html` → Open In → Browser.
- **Terminal:**

  ```bash
  python -m http.server 8000
  ```

  Then visit <http://localhost:8000>.

## Run the tests

Needs [Node.js](https://nodejs.org) 20 or newer. Nothing else to install.

```bash
npm test
```

The tests cover the escalation rule, pause switch and session log (`tests/reliance.test.js`), the
handling of AI replies and demo answers (`tests/verdicts.test.js`), the hedge wording
(`tests/hedges.test.js`) and the prompt-test scoring (`tests/prompt-scoring.test.js`).

## Test the system prompt

The system prompt sent to the live AI is in `prompts/verdict-prompt.js`. To check it, a script sends
12 claims with known answers (`tests/prompt-cases.json`) to the Anthropic API and scores each reply
against the five criteria in `docs/prompt-criteria.md`. Every run adds a row to `docs/prompt-log.md`.

It needs an Anthropic API key, and each run makes 12 small paid API calls. Without a key it prints
"Skipped" and does nothing.

Windows (PowerShell):

```powershell
$env:ANTHROPIC_API_KEY = "your-key-here"
npm run prompt-tests -- --change "what you changed in the prompt"
```

macOS / Linux:

```bash
ANTHROPIC_API_KEY="your-key-here" npm run prompt-tests -- --change "what you changed in the prompt"
```

The loop: change the prompt, bump `PROMPT_VERSION`, run the script, read the new row in the log.
Never commit the key or paste it into a file in this repo.

## Demo mode and live mode

The app runs in **demo mode** by default: no API key and no AI call. Answers are pre-written in
`data/demo-responses.json`. Any other claim comes back as "UNCLEAR", low confidence, and says so in
its explanation.

Claims with a prepared answer: Ronaldo's Ballon d'Ors, Hal Jordan, the Eiffel Tower in summer,
cracking knuckles, lightning striking twice, the Great Wall from space, using 10% of our brains,
bats being blind, bulls and the colour red, goldfish memory, and coffee and growth.

**Live mode** is used when `apiUrl` is set in `js/config.js`. The claim is POSTed to that URL as
`{ "claim": "..." }` and the reply should be JSON:

```json
{ "verdict": "FALSE", "confidence": 88, "reasons": ["...", "..."] }
```

This repo does not include that server. Do not put an API key in `js/config.js`: it would be
visible to anyone who opens the page.

## Screens

1. **Start** – paste a claim or pick an example.
2. **Loading** – claim locked and buttons disabled while the AI responds. Can be cancelled.
3. **Verdict** – a first-person hedge sentence, the verdict, confidence as word + number + bar,
   then Agree / Disagree. The hedge is picked at random from 3 wordings per confidence level.
4. **"Why?" open** – the AI's reasoning, shown only when asked for.
5. **Second-look prompt** – the AI's answer is hidden until you make your own call.
6. **Your call vs the AI** – both answers side by side. No right/wrong is shown.
7. **Session summary** – counts, a log of every decision, and a CSV download.

### When the second-look prompt appears

All of these must be true (`js/reliance.js`):

- 5 agrees in a row
- each made in under 4 seconds
- "Why?" not opened on any of them
- the next verdict is Medium or Low confidence

Opening "Why?", disagreeing, or a slow agree resets the streak.

"Pause second-look prompts" (in the header, and under "Why am I seeing this?") switches the prompt
off until it is resumed or a new session starts. Decisions made while paused are marked in the log.

To see it quickly: agree fast with five High-confidence claims (Ronaldo, Hal Jordan, Great Wall,
10% of our brains, bats are blind), then check "The Eiffel Tower grows taller in summer".

### When things go wrong

- **Empty claim:** the button stays disabled and a hint says what to do.
- **Long claim:** input stops at 300 characters, with a message.
- **API error or timeout:** a "no answer" screen offers Try again, Use demo mode instead, or Edit claim.
- **Unreadable AI reply:** shown as UNCLEAR, Low confidence, with a note saying the reply could not be read.
- **Double-clicks:** a decision is logged once, and a second click cannot land on the next screen.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page shell: header, main area, footer |
| `css/styles.css` | Design tokens (colours, radii, type) and component styles |
| `js/config.js` | Settings: API URL, timeout, claim length limit |
| `js/verdicts.js` | Gets a verdict (demo file or live API) and validates the reply |
| `js/reliance.js` | Behaviour tracker, escalation rule, pause switch, CSV export. Pure logic |
| `js/hedges.js` | Hedge wording shown above the verdict. Pure logic |
| `js/app.js` | Screens and interaction |
| `data/demo-responses.json` | Pre-written answers for demo mode |
| `prompts/verdict-prompt.js` | System prompt for the live AI, with a version number |
| `tests/` | Unit tests, plus `prompt-cases.json` for the prompt tests |
| `scripts/run-prompt-tests.js` | Runs the prompt cases against the live API and logs the score |
| `docs/prompt-criteria.md` | The five success criteria for the prompt |
| `docs/prompt-log.md` | One row per prompt test run |
| `Vivid Description.md` | Design and screen notes for working on the project |

The session log is kept in memory for one session only. Nothing is stored or sent anywhere.
