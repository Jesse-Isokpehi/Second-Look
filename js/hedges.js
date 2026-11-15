/* Second Look — hedge wording shown above the verdict.
 *
 * The AI's confidence is also put into words, in the first person. Three
 * variants per level are picked at random so the wording changes between
 * claims and is less likely to be skimmed past (a "polymorphic cue").
 *
 * Pure logic, unit tested in tests/hedges.test.js.
 * "{verdict}" is replaced with TRUE or FALSE.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SecondLook = root.SecondLook || {};
    root.SecondLook.hedges = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HEDGES = {
    High: [
      'I’m confident this is {verdict}.',
      'I’m fairly certain this is {verdict}.',
      'Based on what I know, this is {verdict}.'
    ],
    Medium: [
      'I’m not sure, but I think this is {verdict}.',
      'I lean towards {verdict}, but I could be wrong.',
      'This is probably {verdict}, though I’m uncertain.'
    ],
    Low: [
      'I really can’t tell, but my guess is {verdict}.',
      'I’m unsure — this might be {verdict}.',
      'I don’t have enough to go on; possibly {verdict}.'
    ],
    // No TRUE or FALSE to put in the sentence.
    Unclear: [
      'I really can’t tell whether this is true or false.',
      'I’m unsure — I can’t call this one either way.',
      'I don’t have enough to go on to give an answer.'
    ]
  };

  /**
   * Pick a hedge for a verdict. `random` is a function returning 0 <= n < 1
   * (Math.random by default; tests pass their own).
   * Returns { id, text }, e.g. { id: 'medium-2', text: 'I lean towards FALSE, but I could be wrong.' }
   */
  function pickHedge(level, verdict, random) {
    var group = verdict === 'UNCLEAR' ? 'Unclear' : level;
    var variants = HEDGES[group] || HEDGES.Low;
    var index = Math.min(variants.length - 1, Math.floor((random || Math.random)() * variants.length));
    return {
      id: group.toLowerCase() + '-' + (index + 1),
      text: variants[index].replace('{verdict}', verdict)
    };
  }

  return {
    HEDGES: HEDGES,
    pickHedge: pickHedge
  };
});
