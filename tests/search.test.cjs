const test = require('node:test');
const assert = require('node:assert/strict');
const search = require('../app/search.js');
test('Vietnamese search ignores accents, case, đ and decomposed accents', () => {
  assert.equal(search.fold('ĐIỆN Biên'), 'dien bien');
  assert.ok(search.matches('Chuyện Đời Thường', 'doi thuong'));
  assert.ok(search.matches('Ha\u0300 Nội', 'hà nội'));
  assert.equal(search.matches('Thời sự', 'kinh tế'), false);
  assert.equal(search.matches('anything', '  '), false);
});
