/* Second Look — settings.
 *
 * Demo or live is decided automatically:
 *   - Started with `npm start` and a key in .env  -> live mode. The page asks the local
 *     server (serverConfigUrl) and then sends claims to serverCheckUrl.
 *   - Anything else                                -> demo mode: answers come from
 *     data/demo-responses.json.
 *
 * apiUrl is normally left empty. Set it only to point the page at a different service
 * that accepts { "claim": "..." } and replies with
 *   { "verdict": "TRUE" | "FALSE" | "UNCLEAR", "confidence": 0-100, "reasons": ["..."] }
 *
 * Never put an API key in this file: everything here is visible in the browser.
 * The key belongs in .env, which only the server reads.
 */
window.SECOND_LOOK_CONFIG = window.SECOND_LOOK_CONFIG || {
  apiUrl: '',
  serverConfigUrl: 'api/config',
  serverCheckUrl: 'api/check',
  timeoutMs: 15000,
  demoDataUrl: 'data/demo-responses.json',
  maxClaimLength: 300
};
