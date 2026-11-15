'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { levelFor, parseVerdict, matchDemo } = require('../js/verdicts.js');
const demoData = require('../data/demo-responses.json');

test('levelFor: High is 70-100, Medium is 40-69, Low is under 40', () => {
  assert.equal(levelFor(100), 'High');
  assert.equal(levelFor(70), 'High');
  assert.equal(levelFor(69), 'Medium');
  assert.equal(levelFor(40), 'Medium');
  assert.equal(levelFor(39), 'Low');
  assert.equal(levelFor(0), 'Low');
});

test('parseVerdict reads a well-formed reply', () => {
  const result = parseVerdict({ verdict: 'FALSE', confidence: 88, reasons: ['One', 'Two'] });
  assert.equal(result.verdict, 'FALSE');
  assert.equal(result.confidence, 88);
  assert.equal(result.level, 'High');
  assert.deepEqual(result.reasons, ['One', 'Two']);
  assert.equal(result.malformed, false);
});

test('parseVerdict reads JSON wrapped in prose or a code fence', () => {
  const reply = 'Here is my answer:\n```json\n{"verdict": "true", "confidence": "62%", "reasons": ["Because"]}\n```';
  const result = parseVerdict(reply);
  assert.equal(result.verdict, 'TRUE');
  assert.equal(result.confidence, 62);
  assert.equal(result.level, 'Medium');
  assert.equal(result.malformed, false);
});

test('parseVerdict: an UNCLEAR verdict is never shown above Low confidence', () => {
  const result = parseVerdict({ verdict: 'UNCLEAR', confidence: 95, reasons: ['Hmm'] });
  assert.equal(result.level, 'Low');
  assert.ok(result.confidence < 40);
});

test('parseVerdict keeps at most 3 reasons', () => {
  const result = parseVerdict({ verdict: 'TRUE', confidence: 80, reasons: ['1', '2', '3', '4', '5'] });
  assert.deepEqual(result.reasons, ['1', '2', '3']);
  assert.equal(result.malformed, false);
});

test('parseVerdict labels a normal reply as written by the AI with no sources', () => {
  const result = parseVerdict({ verdict: 'TRUE', confidence: 80, reasons: ['x'] });
  assert.equal(result.note, 'Written by the AI · no sources yet');
});

test('demo data: no prepared answer has more than 3 reasons', () => {
  for (const entry of demoData.claims.concat(demoData.fallback)) {
    assert.ok(entry.reasons.length <= 3, entry.claim || 'fallback');
  }
});

test('parseVerdict fills in a line when no reasons are given', () => {
  const result = parseVerdict({ verdict: 'TRUE', confidence: 80 });
  assert.equal(result.malformed, false);
  assert.equal(result.reasons.length, 1);
});

const malformedReplies = {
  'text that is not JSON': 'I think that is probably false.',
  'broken JSON': '{"verdict": "FALSE", "confidence": ',
  'an empty reply': '',
  'null': null,
  'an array': [1, 2, 3],
  'a missing verdict': { confidence: 80, reasons: ['x'] },
  'an unknown verdict word': { verdict: 'MAYBE', confidence: 80 },
  'a missing confidence': { verdict: 'TRUE' },
  'a confidence over 100': { verdict: 'TRUE', confidence: 140 },
  'a negative confidence': { verdict: 'TRUE', confidence: -5 },
  'a confidence that is not a number': { verdict: 'TRUE', confidence: 'very' }
};

for (const [name, reply] of Object.entries(malformedReplies)) {
  test('parseVerdict: ' + name + ' becomes UNCLEAR, Low confidence, flagged malformed', () => {
    const result = parseVerdict(reply);
    assert.equal(result.verdict, 'UNCLEAR');
    assert.equal(result.level, 'Low');
    assert.equal(result.malformed, true);
    assert.match(result.note, /could not be read/);
  });
}

test('demo data: the required claims have the expected verdict and level', () => {
  const expected = [
    ['Cristiano Ronaldo has 6 Ballon d’Ors', 'FALSE', 'High'],
    ['Hal Jordan is a Marvel character', 'FALSE', 'High'],
    ['The Eiffel Tower grows taller in summer', 'TRUE', 'Medium'],
    ['Cracking your knuckles causes arthritis', 'FALSE', 'Medium'],
    ['Lightning never strikes the same place twice', 'TRUE', 'Low']
  ];
  for (const [claim, verdict, level] of expected) {
    const result = matchDemo(claim, demoData);
    assert.equal(result.verdict, verdict, claim);
    assert.equal(result.level, level, claim);
    assert.equal(result.malformed, false, claim);
  }
});

test('demo data: every listed claim matches its own entry', () => {
  for (const entry of demoData.claims) {
    const result = matchDemo(entry.claim, demoData);
    assert.equal(result.verdict, entry.verdict, entry.claim);
    assert.equal(result.confidence, entry.confidence, entry.claim);
  }
});

test('demo data: matching ignores capitals and straight or curly apostrophes', () => {
  const result = matchDemo("CRISTIANO RONALDO HAS 6 BALLON D'ORS", demoData);
  assert.equal(result.verdict, 'FALSE');
});

test('demo data: an unknown claim gets the UNCLEAR, Low fallback', () => {
  const result = matchDemo('The moon is made of cheese', demoData);
  assert.equal(result.verdict, 'UNCLEAR');
  assert.equal(result.level, 'Low');
  assert.equal(result.malformed, false);
});
