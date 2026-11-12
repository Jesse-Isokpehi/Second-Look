/* Second Look — getting a verdict.
 *
 * Demo mode reads pre-written answers from data/demo-responses.json.
 * Live mode POSTs the claim to the URL in js/config.js.
 *
 * Every verdict has the same shape:
 *   { verdict: 'TRUE' | 'FALSE' | 'UNCLEAR', confidence: 0-100, level: 'High' | 'Medium' | 'Low',
 *     reasons: string[], note: string, malformed: boolean }
 *
 * levelFor, matchDemo and parseVerdict are pure and unit tested (tests/verdicts.test.js).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SecondLook = root.SecondLook || {};
    root.SecondLook.verdicts = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HIGH_FROM = 70;
  var MEDIUM_FROM = 40;
  var VERDICTS = ['TRUE', 'FALSE', 'UNCLEAR'];
  var MIN_LOADING_MS = 1200; // keep the loading state visible long enough to read

  var AI_NOTE = 'Explanation written by the AI. It does not cite sources yet.';
  var MALFORMED_NOTE = 'The AI’s reply could not be read, so this is shown as UNCLEAR with low confidence.';

  function levelFor(confidence) {
    if (confidence >= HIGH_FROM) return 'High';
    if (confidence >= MEDIUM_FROM) return 'Medium';
    return 'Low';
  }

  function build(verdict, confidence, reasons, note, malformed) {
    // An UNCLEAR answer is never shown as more than Low confidence.
    if (verdict === 'UNCLEAR') confidence = Math.min(confidence, MEDIUM_FROM - 1);
    return {
      verdict: verdict,
      confidence: confidence,
      level: levelFor(confidence),
      reasons: reasons,
      note: note,
      malformed: !!malformed
    };
  }

  function malformedVerdict() {
    return build('UNCLEAR', 0, [
      'The AI sent back a reply that was not in the expected format.',
      'No verdict or confidence could be read from it.',
      'Try again, or check another source.'
    ], MALFORMED_NOTE, true);
  }

  /** Pull the first {...} block out of a text reply (models often wrap JSON in prose or code fences). */
  function extractJSON(text) {
    var start = text.indexOf('{');
    var end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (e) {
      return null;
    }
  }

  /**
   * Turn whatever the AI sent into a verdict. Accepts an object or a string.
   * Anything that cannot be trusted becomes UNCLEAR / low confidence with malformed: true.
   */
  function parseVerdict(raw, note) {
    var data = raw;
    if (typeof data === 'string') data = extractJSON(data);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return malformedVerdict();

    var verdict = typeof data.verdict === 'string' ? data.verdict.trim().toUpperCase() : '';
    if (VERDICTS.indexOf(verdict) === -1) return malformedVerdict();

    var confidence = data.confidence;
    if (typeof confidence === 'string' && confidence.trim() !== '') confidence = Number(confidence.replace('%', ''));
    if (typeof confidence !== 'number' || !isFinite(confidence) || confidence < 0 || confidence > 100) {
      return malformedVerdict();
    }

    var reasons = Array.isArray(data.reasons)
      ? data.reasons.filter(function (r) { return typeof r === 'string' && r.trim(); }).slice(0, 5)
      : [];
    if (!reasons.length) reasons = ['The AI did not give its reasoning for this answer.'];

    return build(verdict, Math.round(confidence), reasons, typeof data.note === 'string' ? data.note : (note || AI_NOTE));
  }

  /** Find the prepared demo answer for a claim, or the fallback. */
  function matchDemo(claim, data) {
    var text = String(claim).toLowerCase().replace(/[’‘]/g, "'");
    var entries = (data && data.claims) || [];
    for (var i = 0; i < entries.length; i++) {
      var keywords = entries[i].keywords || [];
      var hit = keywords.length > 0 && keywords.every(function (k) { return text.indexOf(k.toLowerCase()) !== -1; });
      if (hit) return parseVerdict(entries[i], AI_NOTE);
    }
    return parseVerdict(data && data.fallback);
  }

  // ---------- browser only: the actual requests ----------

  function fail(kind) {
    var error = new Error(kind);
    error.kind = kind; // 'timeout' | 'network' | 'server'
    return error;
  }

  var demoData = null;

  function loadDemoData(url, signal) {
    if (demoData) return Promise.resolve(demoData);
    return fetch(url, { signal: signal }).then(function (response) {
      if (!response.ok) throw fail('server');
      return response.json();
    }).then(function (data) {
      demoData = data;
      return data;
    });
  }

  function askLive(claim, url, signal) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claim: claim }),
      signal: signal
    }).then(function (response) {
      if (!response.ok) throw fail('server');
      return response.text();
    }).then(function (text) {
      return parseVerdict(text);
    });
  }

  /**
   * Ask about a claim. Returns { promise, cancel }.
   * The promise rejects with error.kind 'timeout', 'network' or 'server'.
   * After cancel() the promise never settles.
   */
  function check(claim, options) {
    var controller = new AbortController();
    var cancelled = false;
    var timedOut = false;
    var started = Date.now();

    var timer = setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs);

    var request = options.demo
      ? loadDemoData(options.demoDataUrl, controller.signal).then(function (data) { return matchDemo(claim, data); })
      : askLive(claim, options.apiUrl, controller.signal);

    var promise = new Promise(function (resolve, reject) {
      request.then(function (result) {
        if (cancelled) return;
        var wait = options.demo ? Math.max(0, MIN_LOADING_MS - (Date.now() - started)) : 0;
        setTimeout(function () { if (!cancelled) resolve(result); }, wait);
      }, function (error) {
        if (cancelled) return;
        if (timedOut) reject(fail('timeout'));
        else reject(error && error.kind ? error : fail('network'));
      }).then(function () { clearTimeout(timer); });
    });

    return {
      promise: promise,
      cancel: function () {
        cancelled = true;
        clearTimeout(timer);
        controller.abort();
      }
    };
  }

  return {
    HIGH_FROM: HIGH_FROM,
    MEDIUM_FROM: MEDIUM_FROM,
    levelFor: levelFor,
    parseVerdict: parseVerdict,
    matchDemo: matchDemo,
    check: check
  };
});
