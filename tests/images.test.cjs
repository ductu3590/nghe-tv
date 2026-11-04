const test = require('node:test');
const assert = require('node:assert/strict');
const images = require('../app/images.js');
test('image cache evicts older entries to a byte budget and skips oversized entries', () => {
  const entries = {old: {at:1,data:'x'.repeat(40)}, newer:{at:2,data:'y'.repeat(40)}, huge:{at:3,data:'z'.repeat(500)}};
  const kept = images.trim(entries, 100);
  assert.deepEqual(Object.keys(kept), ['newer']);
  assert.ok(JSON.stringify(kept).length <= 100);
  assert.equal(Object.keys(entries).length, 3);
});
