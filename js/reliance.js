/* Second Look — behaviour tracker and escalation rule.
 *
 * Pure logic: no DOM, no network, no storage. The log lives in memory only.
 * Unit tests: tests/reliance.test.js
 *
 * Each logged decision:
 *   { claim, verdict, confidence, level, choice, ownCall, whyOpened,
 *     decisionSeconds, escalated, timestamp }
 *   choice:  'agree' | 'disagree' | 'own-call'
 *   ownCall: 'TRUE' | 'FALSE' | 'NOT SURE' for an own-call, otherwise ''
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SecondLook = root.SecondLook || {};
    root.SecondLook.reliance = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULTS = {
    STREAK_LENGTH: 5,                    // quick agrees in a row before a second-look prompt
    QUICK_SECONDS: 4,                    // an agree faster than this counts as quick
    ESCALATE_LEVELS: ['Medium', 'Low']   // only prompt when the AI is not highly confident
  };

  function csvCell(value) {
    var text = String(value);
    // Stop spreadsheet apps treating a pasted claim as a formula.
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function createTracker(overrides) {
    var config = {};
    Object.keys(DEFAULTS).forEach(function (key) {
      config[key] = overrides && overrides[key] !== undefined ? overrides[key] : DEFAULTS[key];
    });

    var entries = [];
    var streak = 0;

    /** True when the streak is long enough and this verdict's level qualifies. Changes nothing. */
    function shouldEscalate(level) {
      return streak >= config.STREAK_LENGTH && config.ESCALATE_LEVELS.indexOf(level) !== -1;
    }

    /**
     * Call once when a new verdict arrives. Returns true if this claim should go
     * into second-look mode, and resets the streak when it does.
     */
    function beginClaim(level) {
      if (!shouldEscalate(level)) return false;
      streak = 0;
      return true;
    }

    /**
     * Opening "Why?" counts as a closer look, so the streak starts over.
     * Pass an already-logged entry to flag it (used on the compare screen).
     */
    function noteWhyOpened(entry) {
      streak = 0;
      if (entry) entry.whyOpened = true;
    }

    /** Log a decision and update the streak. Returns the stored entry. */
    function record(details) {
      var entry = {
        claim: details.claim,
        verdict: details.verdict,
        confidence: details.confidence,
        level: details.level,
        choice: details.choice,
        ownCall: details.ownCall || '',
        whyOpened: !!details.whyOpened,
        decisionSeconds: details.decisionSeconds,
        escalated: !!details.escalated,
        timestamp: details.timestamp || new Date().toISOString()
      };
      entries.push(entry);

      var quickAgree = entry.choice === 'agree' &&
        entry.decisionSeconds < config.QUICK_SECONDS &&
        !entry.whyOpened;
      streak = quickAgree ? streak + 1 : 0;

      return entry;
    }

    function count(test) {
      return entries.filter(test).length;
    }

    function stats() {
      return {
        checked: entries.length,
        agreed: count(function (e) { return e.choice === 'agree'; }),
        disagreed: count(function (e) { return e.choice === 'disagree'; }),
        whyOpened: count(function (e) { return e.whyOpened; }),
        escalated: count(function (e) { return e.escalated; })
      };
    }

    function toCSV() {
      var header = [
        'claim', 'verdict', 'confidence', 'level', 'choice', 'own_call',
        'why_opened', 'decision_seconds', 'escalated', 'timestamp'
      ];
      var rows = entries.map(function (e) {
        return [
          e.claim, e.verdict, e.confidence, e.level, e.choice, e.ownCall,
          e.whyOpened, Number(e.decisionSeconds).toFixed(1), e.escalated, e.timestamp
        ].map(csvCell).join(',');
      });
      return [header.join(',')].concat(rows).join('\r\n') + '\r\n';
    }

    function reset() {
      entries = [];
      streak = 0;
    }

    return {
      config: config,
      shouldEscalate: shouldEscalate,
      beginClaim: beginClaim,
      noteWhyOpened: noteWhyOpened,
      record: record,
      streak: function () { return streak; },
      entries: function () { return entries.slice(); },
      stats: stats,
      toCSV: toCSV,
      reset: reset
    };
  }

  return {
    DEFAULTS: DEFAULTS,
    createTracker: createTracker
  };
});
