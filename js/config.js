/* Second Look — settings.
 *
 * apiUrl empty  -> demo mode: answers come from data/demo-responses.json.
 * apiUrl set    -> live mode: the claim is POSTed to that URL as { "claim": "..." }.
 *                  The reply should be JSON like
 *                  { "verdict": "TRUE" | "FALSE" | "UNCLEAR", "confidence": 0-100, "reasons": ["..."] }
 *
 * Never put an API key in this file: everything here is visible in the browser.
 */
window.SECOND_LOOK_CONFIG = window.SECOND_LOOK_CONFIG || {
  apiUrl: '',
  timeoutMs: 15000,
  demoDataUrl: 'data/demo-responses.json',
  maxClaimLength: 300
};
