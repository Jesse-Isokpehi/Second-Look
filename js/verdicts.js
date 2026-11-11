/* Second Look — the "AI".
 *
 * Demo mode: no API key and no network call. Responses are pre-written and
 * returned after a short delay so the loading state is visible.
 *
 * To plug in a real model later, replace `check()` with a call that resolves
 * to the same shape:
 *   { verdict: 'TRUE' | 'FALSE' | 'UNCLEAR', pct: 0-100, reasons: string[], source: string }
 */
(function (SL) {
  'use strict';

  var DEMO_MODE = true;
  var DELAY_MS = 1600;
  var AI_SOURCE_NOTE = 'Explanation written by the AI. It does not cite sources yet.';

  // Each entry matches when every keyword appears in the claim.
  var SIMULATED = [
    {
      keywords: ['ronaldo', 'ballon'],
      verdict: 'FALSE',
      pct: 88,
      reasons: [
        'Cristiano Ronaldo has won the Ballon d’Or five times: 2008, 2013, 2014, 2016 and 2017.',
        'The claim is off by one, which is an easy slip to make from memory.',
        'Fairly sure because award winners are well documented.'
      ]
    },
    {
      keywords: ['hal jordan'],
      verdict: 'FALSE',
      pct: 92,
      reasons: [
        'Hal Jordan is Green Lantern, a DC Comics character.',
        'He first appeared in DC’s Showcase #22 in 1959.',
        'Very sure because publisher ownership of a character is clear-cut.'
      ]
    },
    {
      keywords: ['eiffel', 'summer'],
      verdict: 'TRUE',
      pct: 86,
      reasons: [
        'The tower is made of iron, which expands as it warms up.',
        'On hot days it is reported to stand up to around 15 cm taller.',
        'Fairly sure because thermal expansion of metal is well understood.'
      ]
    },
    {
      keywords: ['knuckles', 'arthritis'],
      verdict: 'FALSE',
      pct: 64,
      reasons: [
        'Studies comparing people who crack their knuckles with people who don’t have not found more arthritis.',
        'The popping sound comes from gas bubbles in the joint fluid, not from damage.',
        'Less sure because those studies are small.'
      ]
    },
    {
      keywords: ['great wall', 'space'],
      verdict: 'FALSE',
      pct: 81,
      reasons: [
        'The wall is long but only a few metres wide, and a similar colour to the land around it.',
        'Astronauts have said they could not pick it out with the naked eye from orbit.',
        'Fairly sure, though “visible from space” depends on how high up you mean.'
      ]
    },
    {
      keywords: ['10%', 'brain'],
      verdict: 'FALSE',
      pct: 90,
      reasons: [
        'Brain scans show activity across the whole brain, even during sleep.',
        'Damage to almost any part of the brain has some effect.',
        'Very sure because this is a long-standing, well-studied myth.'
      ]
    },
    {
      keywords: ['bulls', 'red'],
      verdict: 'FALSE',
      pct: 62,
      reasons: [
        'Cattle are thought to have limited colour vision and cannot tell red apart well.',
        'It is the movement of the cape that seems to provoke the charge.',
        'Less sure because what “angers” an animal is hard to measure.'
      ]
    },
    {
      keywords: ['goldfish', 'memory'],
      verdict: 'FALSE',
      pct: 58,
      reasons: [
        'Studies have trained goldfish to remember signals for weeks or months.',
        'The “three seconds” idea seems to be a popular myth, not a research finding.',
        'Less sure because memory length varies between studies and tasks.'
      ]
    },
    {
      keywords: ['coffee', 'growth'],
      verdict: 'FALSE',
      pct: 60,
      reasons: [
        'No strong evidence links coffee to reduced height.',
        'The belief may come from old adverts rather than research.',
        'Less sure because caffeine still has other effects on children.'
      ]
    },
    {
      // Deliberately shaky: a low-confidence answer the user should question.
      keywords: ['lightning', 'twice'],
      verdict: 'TRUE',
      pct: 34,
      reasons: [
        'The saying is very widely repeated, which suggests there may be something to it.',
        'On the other hand, tall towers are reported to be struck many times a year, which points the other way.',
        'Not at all sure because these two points conflict.'
      ]
    }
  ];

  var NO_ANSWER = {
    verdict: 'UNCLEAR',
    pct: 30,
    reasons: [
      'Demo mode only has prepared answers for a small set of example claims.',
      'This claim is not one of them, so no real check was made.',
      'Treat this as “no answer” and check another source.'
    ],
    source: 'Simulated response. No AI model was asked about this claim.'
  };

  function levelFor(pct) {
    if (pct >= 70) return 'High';
    if (pct >= 40) return 'Medium';
    return 'Low';
  }

  function lookup(claim) {
    var text = claim.toLowerCase();
    for (var i = 0; i < SIMULATED.length; i++) {
      var entry = SIMULATED[i];
      var matches = entry.keywords.every(function (k) { return text.indexOf(k) !== -1; });
      if (matches) {
        return { verdict: entry.verdict, pct: entry.pct, reasons: entry.reasons, source: AI_SOURCE_NOTE };
      }
    }
    return NO_ANSWER;
  }

  /**
   * Ask the AI about a claim. Returns { promise, cancel }.
   * The promise never settles after cancel() is called.
   */
  function check(claim) {
    var timer = null;
    var promise = new Promise(function (resolve) {
      timer = setTimeout(function () {
        var found = lookup(claim);
        resolve({
          verdict: found.verdict,
          pct: found.pct,
          level: levelFor(found.pct),
          reasons: found.reasons.slice(),
          source: found.source
        });
      }, DELAY_MS);
    });
    return {
      promise: promise,
      cancel: function () { clearTimeout(timer); }
    };
  }

  SL.verdicts = {
    DEMO_MODE: DEMO_MODE,
    check: check,
    levelFor: levelFor
  };
})(window.SecondLook = window.SecondLook || {});
