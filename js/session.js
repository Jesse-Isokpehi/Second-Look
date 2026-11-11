/* Second Look — session log, quick-agree streak and CSV export.
 *
 * The log lives in memory for one session only. Nothing is stored or sent.
 */
(function (SL) {
  'use strict';

  // Escalation trigger: this many agrees in a row, each faster than the limit,
  // with no "Why?" opened, and the next verdict is Medium or Low confidence.
  var STREAK_LENGTH = 5;
  var QUICK_LIMIT_MS = 4000;

  var entries = [];
  var quickAgreeStreak = 0;

  function reset() {
    entries = [];
    quickAgreeStreak = 0;
  }

  /** Should the next verdict be hidden behind a "guess first" prompt? */
  function shouldPrompt(result) {
    return quickAgreeStreak >= STREAK_LENGTH && result.level !== 'High';
  }

  /** Opening "Why?" counts as taking a closer look, so the streak starts over. */
  function noteWhyOpened() {
    quickAgreeStreak = 0;
  }

  /**
   * Log a decision.
   * action: 'agree' | 'disagree' | 'guess'
   * guess:  'TRUE' | 'FALSE' | 'NOT SURE' (only for action 'guess')
   */
  function record(details) {
    var entry = {
      claim: details.claim,
      verdict: details.result.verdict,
      level: details.result.level,
      pct: details.result.pct,
      action: details.action,
      guess: details.guess || '',
      whyOpened: !!details.whyOpened,
      timeMs: details.timeMs,
      prompted: details.action === 'guess',
      at: new Date().toISOString()
    };
    entries.push(entry);

    var quickAgree = entry.action === 'agree' && entry.timeMs < QUICK_LIMIT_MS && !entry.whyOpened;
    quickAgreeStreak = quickAgree ? quickAgreeStreak + 1 : 0;

    return entry;
  }

  function count(test) {
    return entries.filter(test).length;
  }

  function stats() {
    return {
      checked: entries.length,
      agreed: count(function (e) { return e.action === 'agree'; }),
      disagreed: count(function (e) { return e.action === 'disagree'; }),
      whyOpened: count(function (e) { return e.whyOpened; }),
      prompts: count(function (e) { return e.prompted; })
    };
  }

  function csvCell(value) {
    var text = String(value);
    // Stop spreadsheet apps treating a pasted claim as a formula.
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function toCSV() {
    var header = [
      'claim', 'ai_verdict', 'confidence_level', 'confidence_pct', 'action',
      'user_guess', 'opened_why', 'second_look_prompt', 'time_seconds', 'logged_at'
    ];
    var rows = entries.map(function (e) {
      return [
        e.claim, e.verdict, e.level, e.pct, e.action,
        e.guess, e.whyOpened ? 'yes' : 'no', e.prompted ? 'yes' : 'no',
        (e.timeMs / 1000).toFixed(1), e.at
      ].map(csvCell).join(',');
    });
    return [header.join(',')].concat(rows).join('\r\n') + '\r\n';
  }

  SL.session = {
    STREAK_LENGTH: STREAK_LENGTH,
    QUICK_LIMIT_MS: QUICK_LIMIT_MS,
    reset: reset,
    shouldPrompt: shouldPrompt,
    noteWhyOpened: noteWhyOpened,
    record: record,
    stats: stats,
    entries: function () { return entries.slice(); },
    toCSV: toCSV
  };
})(window.SecondLook = window.SecondLook || {});
