const test = require('node:test');
const assert = require('node:assert/strict');
const organize = require('../app/organize.js');

test('manual played and unread marks override inferred completion until played again', () => {
  assert.equal(organize.isPlayed({}, 'a', 96), false);
  assert.equal(organize.isPlayed({}, '', 100), false);
  assert.equal(organize.isPlayed({}, 'a', 97), true);
  const unread = organize.setPlayed({}, 'a', false, 10);
  assert.equal(organize.isPlayed(unread, 'a', 100), false);
  const done = organize.setPlayed(unread, 'a', true, 20);
  assert.equal(organize.isPlayed(done, 'a', 0), true);
  assert.equal(organize.isPlayed(unread, 'a', 100), false);
  assert.deepEqual(organize.setPlayed({bad: null}, '', true, 10), {});
});

test('played marks are bounded and retain the newest entries', () => {
  let marks = {};
  for (let i = 0; i < 520; i++) marks = organize.setPlayed(marks, 'episode-' + i, true, i);
  assert.equal(Object.keys(marks).length, 500);
  assert.ok(!marks['episode-0']);
  assert.ok(marks['episode-519']);
});

test('source ordering handles removed and new ids and puts pinned sources first', () => {
  const sources = [{id:'a'}, {id:'b'}, {id:'c'}, {id:'new'}];
  const pref = {order:['c', 'missing', 'b', 'a'], pinned:['b', 'missing']};
  assert.deepEqual(organize.orderSources(sources, pref).map((x) => x.id), ['b', 'c', 'a', 'new']);
  assert.deepEqual(sources.map((x) => x.id), ['a', 'b', 'c', 'new']);
  assert.equal(organize.isPinned(pref, 'b'), true);
  assert.deepEqual(organize.setPinned(pref, 'b', false).pinned, ['missing']);
  assert.deepEqual(organize.setPinned(pref, 'a', true).pinned, ['b', 'missing', 'a']);
});

test('moving sources respects the pinned boundary and retains a stable order', () => {
  const sources = [{id:'a'}, {id:'b'}, {id:'c'}, {id:'d'}];
  const pref = {order:['a','b','c','d'], pinned:['a', 'b']};
  assert.deepEqual(organize.moveSource(sources, pref, 'b', -1).order, ['b','a','c','d']);
  assert.deepEqual(organize.moveSource(sources, pref, 'b', 1).order, ['a','b','c','d']);
  assert.deepEqual(organize.moveSource(sources, pref, 'd', -1).order, ['a','b','d','c']);
  assert.deepEqual(organize.moveSource(sources, pref, 'missing', 1).order, ['a','b','c','d']);
});
