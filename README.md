# Second LooK

Check a claim you saw online. The AI says what it thinks and how sure it is; the final call is yours.
If you start agreeing quickly without looking closer, Second Look asks for your own answer first.

## Run it

Needs [Node.js](https://nodejs.org) 20 or newer. Nothing else to install.

```bash
npm start
```

Then visit <http://localhost:8000>. Press Ctrl+C in the terminal to stop.

Without an API key the app runs in **demo mode** with simulated answers. To use the real AI:

1. Copy `.env.example` to a new file called `.env`.
2. In `.env`, put your Anthropic API key after `ANTHROPIC_API_KEY=` (no quotes, no spaces).
3. Run `npm start` again. The "Demo mode" label disappears.

`.env` is ignored by git, so the key is never committed. The key stays on the local server
(`server.js`); it is never sent to the browser.

You can also open `index.html` without Node (PyCharm: right-click → Open In → Browser). That
always runs in demo mode. Double-clicking the file in a folder will not load the demo answers.

## Run the tests

Needs [Node.js](https://nodejs.org) 20 or newer. Nothing else to install.

```bash
npm test
```

The tests cover the escalation rule, pause switch and session log (`tests/reliance.test.js`), the
handling of AI replies and demo answers (`tests/verdicts.test.js`), the hedge wording
(`tests/hedges.test.js`), the prompt-test scoring (`tests/prompt-scoring.test.js`) and the local
server (`tests/server.test.js`, using a stand-in for the AI, so no key is needed).

## Test the system prompt

The system prompt sent to the live AI is in `prompts/verdict-prompt.js`. To check it, a script sends
12 claims with known answers (`tests/prompt-cases.json`) to the Anthropic API and scores each reply
against the five criteria in `docs/prompt-criteria.md`. Every run adds a row to `docs/prompt-log.md`.

It reads the key and model from `.env` (see "Run it" above), and each run makes 12 small paid API
calls. Without a key it prints "Skipped" and does nothing.

```bash
npm run prompt-tests -- --change "what you changed in the prompt"
```

The loop: change the prompt, bump `PROMPT_VERSION`, run the script, read the new row in the log.
Never put the key anywhere except `.env`.

## Demo mode and live mode

The app runs in **demo mode** by default: no API key and no AI call. Answers are pre-written in
`data/demo-responses.json`. Any other claim comes back as "UNCLEAR", low confidence, and says so in
its explanation.

Claims with a prepared answer: Ronaldo's Ballon d'Ors, Hal Jordan, the Eiffel Tower in summer,
cracking knuckles, lightning striking twice, the Great Wall from space, using 10% of our brains,
bats being blind, bulls and the colour red, goldfish memory, and coffee and growth.

**Live mode** is used when the app is started with `npm start` and `.env` contains a key. The page
sends the claim to the local server, which adds the system prompt (`prompts/verdict-prompt.js`) and
asks the model named by `MODEL` in `.env`. The reply is validated in the page before it is shown.

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

To see it the real way: agree fast with five High-confidence claims (Ronaldo, Hal Jordan, Great
Wall, 10% of our brains, bats are blind), then check "The Eiffel Tower grows taller in summer".

**Shortcut for demos and marking:** add `?demoStreak=1` to the address, e.g.
<http://localhost:8000/?demoStreak=1>. The app then starts as if five quick agrees had already
happened, so the first Medium or Low answer shows the prompt. A dashed note on the start screen
shows the shortcut is on. Nothing is added to the session log by the shortcut itself.

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
| `server.js` | Local server for `npm start`: serves the page and calls the AI with the key from `.env` |
| `.env.example` | Template for `.env`, where your API key goes |
| `js/config.js` | Settings: timeout, claim length limit, server addresses |
| `js/verdicts.js` | Gets a verdict (demo file or live API) and validates the reply |
| `js/reliance.js` | Behaviour tracker, escalation rule, pause switch, CSV export. Pure logic |
| `js/hedges.js` | Hedge wording shown above the verdict. Pure logic |
| `js/app.js` | Screens and interaction |
| `data/demo-responses.json` | Pre-written answers for demo mode |
| `prompts/verdict-prompt.js` | System prompt for the live AI, with a version number |
| `tests/` | Unit tests, plus `prompt-cases.json` for the prompt tests |
| `scripts/run-prompt-tests.js` | Runs the prompt cases against the live API and logs the score |
| `scripts/load-env.js` | Reads `.env` for the server and the prompt tests |
| `docs/prompt-criteria.md` | The five success criteria for the prompt |
| `docs/prompt-log.md` | One row per prompt test run |
| `Vivid Description.md` | Design and screen notes for working on the project |

The session log is kept in memory for one session only. Nothing is stored or sent anywhere.
