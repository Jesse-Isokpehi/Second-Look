'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HEDGES, pickHedge } = require('../js/hedges.js');

test('there are exactly 3 hedge variants for each confidence level', () => {
  for (const level of ['High', 'Medium', 'Low', 'Unclear']) {
    assert.equal(HEDGES[level].length, 3, level);
  }
});

test('every High, Medium and Low variant has a place for the verdict', () => {
  for (const level of ['High', 'Medium', 'Low']) {
    for (const text of HEDGES[level]) assert.ok(text.includes('{verdict}'), text);
  }
});

test('pickHedge puts the verdict into the sentence', () => {
  const hedge = pickHedge('Medium', 'FALSE', () => 0.5);
  assert.equal(hedge.id, 'medium-2');
  assert.equal(hedge.text, 'I lean towards FALSE, but I could be wrong.');
});

test('pickHedge can return each of the 3 variants', () => {
  const ids = [0, 0.4, 0.99].map((n) => pickHedge('High', 'TRUE', () => n).id);
  assert.deepEqual(ids, ['high-1', 'high-2', 'high-3']);
});

test('pickHedge uses the wording for the given level', () => {
  assert.match(pickHedge('High', 'TRUE', () => 0).text, /confident/);
  assert.match(pickHedge('Low', 'TRUE', () => 0).text, /can’t tell/);
});

test('pickHedge: an UNCLEAR verdict gets its own wording with no TRUE or FALSE', () => {
  for (const n of [0, 0.4, 0.99]) {
    const hedge = pickHedge('Low', 'UNCLEAR', () => n);
    assert.match(hedge.id, /^unclear-[123]$/);
    assert.ok(!hedge.text.includes('{verdict}'));
    assert.ok(!hedge.text.includes('UNCLEAR'));
  }
});

test('pickHedge without a random function still returns a valid variant', () => {
  const hedge = pickHedge('Low', 'FALSE');
  assert.match(hedge.id, /^low-[123]$/);
  assert.ok(hedge.text.includes('FALSE'));
});
