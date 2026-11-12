'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTracker, DEFAULTS } = require('../js/reliance.js');

/** Log one decision. Defaults to a quick agree on a High-confidence verdict. */
function decide(tracker, overrides) {
  return tracker.record(Object.assign({
    claim: 'A claim',
    verdict: 'FALSE',
    confidence: 90,
    level: 'High',
    choice: 'agree',
    whyOpened: false,
    decisionSeconds: 2,
    escalated: false,
    timestamp: '2026-01-01T00:00:00.000Z'
  }, overrides));
}

function quickAgrees(tracker, times) {
  for (let i = 0; i < times; i++) decide(tracker);
}

test('config: defaults are 5 quick agrees, each under 4 seconds', () => {
  assert.equal(DEFAULTS.STREAK_LENGTH, 5);
  assert.equal(DEFAULTS.QUICK_SECONDS, 4);
});

test('streak builds by one for each quick agree with Why? closed', () => {
  const tracker = createTracker();
  assert.equal(tracker.streak(), 0);
  decide(tracker);
  assert.equal(tracker.streak(), 1);
  quickAgrees(tracker, 3);
  assert.equal(tracker.streak(), 4);
});

test('streak resets on Disagree', () => {
  const tracker = createTracker();
  quickAgrees(tracker, 3);
  decide(tracker, { choice: 'disagree' });
  assert.equal(tracker.streak(), 0);
});

test('streak resets when Why? is opened, before any decision is made', () => {
  const tracker = createTracker();
  quickAgrees(tracker, 3);
  tracker.noteWhyOpened();
  assert.equal(tracker.streak(), 0);
});

test('an agree made after opening Why? does not count towards the streak', () => {
  const tracker = createTracker();
  quickAgrees(tracker, 3);
  decide(tracker, { whyOpened: true });
  assert.equal(tracker.streak(), 0);
});

test('streak resets on a slow decision', () => {
  const tracker = createTracker();
  quickAgrees(tracker, 3);
  decide(tracker, { decisionSeconds: 6 });
  assert.equal(tracker.streak(), 0);
});

test('a decision taking exactly QUICK_SECONDS is not quick', () => {
  const tracker = createTracker();
  quickAgrees(tracker, 3);
  decide(tracker, { decisionSeconds: DEFAULTS.QUICK_SECONDS });
  assert.equal(tracker.streak(), 0);
});

test('triggers on a Medium verdict once the streak is long enough', () => {
  const tracker = createTracker();
  quickAgrees(tracker, 5);
  assert.equal(tracker.beginClaim('Medium'), true);
});

test('triggers on a Low verdict once the streak is long enough', () => {
  const tracker = createTracker();
  quickAgrees(tracker, 5);
  assert.equal(tracker.beginClaim('Low'), true);
});

test('does not trigger on a High verdict, and the streak is kept', () => {
  const tracker = createTracker();
  quickAgrees(tracker, 5);
  assert.equal(tracker.beginClaim('High'), false);
  assert.equal(tracker.streak(), 5);
  // The next Medium verdict still triggers.
  decide(tracker);
  assert.equal(tracker.beginClaim('Medium'), true);
});

test('does not trigger before the streak reaches STREAK_LENGTH', () => {
  const tracker = createTracker();
  quickAgrees(tracker, 4);
  assert.equal(tracker.beginClaim('Medium'), false);
  assert.equal(tracker.beginClaim('Low'), false);
});

test('streak resets after a trigger, so the next claim is not escalated again', () => {
  const tracker = createTracker();
  quickAgrees(tracker, 5);
  assert.equal(tracker.beginClaim('Low'), true);
  assert.equal(tracker.streak(), 0);
  assert.equal(tracker.beginClaim('Low'), false);
});

test('shouldEscalate only reports; it does not reset the streak', () => {
  const tracker = createTracker();
  quickAgrees(tracker, 5);
  assert.equal(tracker.shouldEscalate('Medium'), true);
  assert.equal(tracker.streak(), 5);
});

test('an own-call decision does not count towards the streak', () => {
  const tracker = createTracker();
  quickAgrees(tracker, 2);
  decide(tracker, { choice: 'own-call', ownCall: 'TRUE', escalated: true, level: 'Low' });
  assert.equal(tracker.streak(), 0);
});

test('config values can be changed without touching the rule', () => {
  const tracker = createTracker({ STREAK_LENGTH: 2, QUICK_SECONDS: 10 });
  decide(tracker, { decisionSeconds: 8 });
  decide(tracker, { decisionSeconds: 8 });
  assert.equal(tracker.beginClaim('Medium'), true);
});

test('record stores every field of the log entry', () => {
  const tracker = createTracker();
  const entry = decide(tracker, {
    claim: 'Goldfish have a three-second memory',
    confidence: 58,
    level: 'Medium',
    choice: 'disagree',
    whyOpened: true,
    decisionSeconds: 7.25
  });
  assert.deepEqual(entry, {
    claim: 'Goldfish have a three-second memory',
    verdict: 'FALSE',
    confidence: 58,
    level: 'Medium',
    choice: 'disagree',
    ownCall: '',
    whyOpened: true,
    decisionSeconds: 7.25,
    escalated: false,
    timestamp: '2026-01-01T00:00:00.000Z'
  });
  assert.equal(tracker.entries().length, 1);
});

test('record adds a timestamp when none is given', () => {
  const tracker = createTracker();
  const entry = tracker.record({ claim: 'x', verdict: 'TRUE', confidence: 80, level: 'High', choice: 'agree', decisionSeconds: 1 });
  assert.ok(!Number.isNaN(Date.parse(entry.timestamp)));
});

test('stats count each kind of decision', () => {
  const tracker = createTracker();
  quickAgrees(tracker, 2);
  decide(tracker, { choice: 'disagree', whyOpened: true });
  decide(tracker, { choice: 'own-call', ownCall: 'FALSE', escalated: true });
  assert.deepEqual(tracker.stats(), { checked: 4, agreed: 2, disagreed: 1, whyOpened: 1, escalated: 1 });
});

test('noteWhyOpened can flag an entry that is already logged', () => {
  const tracker = createTracker();
  const entry = decide(tracker, { choice: 'own-call', ownCall: 'TRUE', escalated: true });
  tracker.noteWhyOpened(entry);
  assert.equal(tracker.entries()[0].whyOpened, true);
  assert.equal(tracker.stats().whyOpened, 1);
});

test('toCSV writes a header and one quoted row per decision', () => {
  const tracker = createTracker();
  decide(tracker, { claim: 'He said "hello", twice' });
  const lines = tracker.toCSV().trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], 'claim,verdict,confidence,level,choice,own_call,why_opened,decision_seconds,escalated,timestamp');
  assert.equal(lines[1], '"He said ""hello"", twice","FALSE","90","High","agree","","false","2.0","false","2026-01-01T00:00:00.000Z"');
});

test('toCSV neutralises claims that look like spreadsheet formulas', () => {
  const tracker = createTracker();
  decide(tracker, { claim: '=SUM(A1:A9)' });
  assert.ok(tracker.toCSV().includes('"\'=SUM(A1:A9)"'));
});

test('reset clears the log and the streak', () => {
  const tracker = createTracker();
  quickAgrees(tracker, 5);
  tracker.reset();
  assert.equal(tracker.entries().length, 0);
  assert.equal(tracker.streak(), 0);
  assert.equal(tracker.beginClaim('Low'), false);
});
