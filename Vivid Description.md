# Second Look

A one-page web app for checking a claim seen online. The AI gives a verdict and says how sure it is;
the user makes the final call. If the user starts agreeing quickly without looking closer, the app
hides the AI's answer and asks for their own call first.

## Project layout

- Plain HTML, CSS and JavaScript. No framework, no build step, no runtime dependencies.
- `index.html` – page shell (header, main, footer). Screens are rendered into `<main>`.
- `css/styles.css` – design tokens as CSS variables at the top, then component styles.
- `js/config.js` – settings (API URL, timeout, claim length limit).
- `js/verdicts.js` – gets a verdict (demo file or live API) and validates the reply.
- `js/reliance.js` – behaviour tracker and escalation rule. Pure logic, no DOM.
- `js/app.js` – screens and interaction. One state object, one `render()` per change.
- `data/demo-responses.json` – pre-written answers for demo mode.
- `tests/` – unit tests, run with `npm test` (Node's built-in test runner, nothing to install).

## Conventions

- Scripts are classic `<script>` files that attach to `window.SecondLook`; `verdicts.js` and
  `reliance.js` also export for Node so they can be unit tested.
- Keep logic that can be tested out of `app.js`. Rule values are named config, not magic numbers.
- Colours, radii and fonts come from the CSS variables in `styles.css`; do not hard-code new ones.
- Anything the user types is escaped with `esc()` before it goes into HTML.
- Every control is a real `<button>`, `<textarea>` or `<label>`. No click handlers on divs.
- Never put an API key in front-end code.

## Visual design

- **Font:** Inter Tight (Google Fonts), with a system sans-serif fallback.
- **Page:** background `#FBF7F5`. Cards are white with a 1px `#E6DADF` border and 14px radius.
- **Header strip:** `#F4EAEF` with a `#E3D3DB` bottom border.
- **Colour:** brand purple-brown `#5C3346` (primary buttons, logo); text `#2B1E24`; muted text `#6E5A63`.
- **Logo:** "SECONDLOOK" in bold caps, where the two O's are an inline SVG pair of glasses
  (two lenses, bridge, small nose, short arms) with an equal gap either side.
- **Confidence badges:**
  - High (70–100): solid `#5C3346`, white text.
  - Medium (40–69): `#F1DCE6` background, `#5C3346` text, `#B98AA2` border.
  - Low (under 40, or UNCLEAR): white background, `#4E4449` text, dashed `#8C8088` border.
  - Always show word + number + bar. Confidence must never rely on colour alone.
- **Footer:** "The AI can make mistakes. Its confidence is its own estimate, not a guarantee."
- **Focus:** a visible 3px `#5C3346` outline on every focusable control.
- **Phone width:** header and button rows wrap, the summary table scrolls inside its own box,
  and the page never scrolls sideways.

## Screens

One page, different states.

**Header on every screen:** logo on the left; on the right "Demo mode · responses simulated"
(only in demo mode), "Claims checked: N" and "End session" (hidden on the summary itself).

1. **Start** – tag "Have a second look", heading "Seen a claim online? Check it here.", claim
   textarea (placeholder: e.g. "Cristiano Ronaldo has 6 Ballon d'Ors"), button "Take a second look",
   example chips: "Hal Jordan is a Marvel character", "The Eiffel Tower grows taller in summer",
   "Cracking your knuckles causes arthritis". The button is disabled while the box is empty, and
   input stops at 300 characters with a message.
2. **Loading** – claim locked, "Taking a look…" spinner, buttons disabled, Cancel link.
3. **Verdict** – claim, verdict, badge + bar, Agree / Disagree / "Why does the AI think this?".
4. **Why open** – explanation panel with a Hide button.
5. **Second-look prompt (escalation)** – banner "Time for a second look", AI answer hidden,
   "I think it's TRUE" / "I think it's FALSE" / "Not sure".
6. **Your call vs the AI** – both answers side by side. Never says who was right.
7. **Session summary** – shown when "End session" is clicked. Heading "How you used the AI this
   session", tiles (Claims checked, Agreed, Disagreed, Opened "Why?", Second-look prompts), a table
   of every decision with escalated rows highlighted, "Download log (CSV)" and "Start a new session".

There is also a **No answer** state for API errors and timeouts: a friendly message with
"Try again", "Use demo mode instead" and "Edit claim".

## Escalation rule

Values live in `DEFAULTS` in `js/reliance.js`.

- `STREAK_LENGTH = 5`, `QUICK_SECONDS = 4`.
- A decision counts towards the streak when it is Agree, made in under `QUICK_SECONDS`, with
  "Why?" not opened. Decision time runs from the verdict being shown to the choice being made.
- The streak resets on Disagree, on opening "Why?", or on a slow decision.
- When the streak is at least `STREAK_LENGTH` and the next verdict is Medium or Low, that claim
  goes into second-look mode and the streak resets.

## Data

- Session data lives in memory only. Nothing is stored or sent anywhere; a reload clears it.
- Log entry: `{ claim, verdict, confidence, level, choice, ownCall, whyOpened, decisionSeconds,
  escalated, timestamp }`, where `choice` is `agree`, `disagree` or `own-call`.
- A reply from the AI that cannot be read is shown as UNCLEAR, Low confidence, and says so.
