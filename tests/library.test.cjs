const test = require('node:test');
const assert = require('node:assert/strict');
const library = require('../app/library.js');
const item = (n) => ({url: `https://example.com/${n}.mp3`, title: `Episode ${n}`, sourceId:'news', image:'https://example.com/a.jpg'});

test('favorite sources toggle, deduplicate and remain bounded without mutating input', () => {
  const initial = ['vov', 'vov', null, 'vne'];
  assert.deepEqual(library.toggleSource(initial, 'vov'), ['vne']);
  assert.deepEqual(initial, ['vov', 'vov', null, 'vne']);
  assert.deepEqual(library.toggleSource(initial, 'other'), ['vov', 'vne', 'other']);
  assert.equal(library.toggleSource(Array.from({length:100}, (_, n) => `s${n}`), 'extra').length, 100);
});
test('favorites preserve playable and book metadata, reject malformed links and toggle by URL', () => {
  const book = {url:'https://example.com/book', title:'Book', folder:true, sourceId:'audioaz', tracks:[item('a'), item('b')]};
  const favs = library.toggleItem([], book);
  assert.deepEqual(favs[0], book);
  assert.notEqual(favs[0], book);
  assert.notEqual(favs[0].tracks, book.tracks);
  assert.deepEqual(library.toggleItem(favs, {url:book.url}), []);
  assert.deepEqual(library.toggleItem([], {url:'javascript:alert(1)'}), []);
});
test('queue is FIFO, excludes folders, avoids duplicates and can remove or consume entries', () => {
  let queue = library.enqueue([], item(1));
  const original = queue;
  queue = library.enqueue(queue, item(2));
  assert.deepEqual(original.map((x) => x.url), [item(1).url]);
  assert.deepEqual(library.enqueue(queue, item(1)).map((x) => x.url), [item(1).url,item(2).url]);
  assert.equal(library.enqueue(queue, {url:'https://example.com/book', folder:true}).length, 2);
  assert.deepEqual(library.removeQueued(queue, item(1).url).map((x) => x.url), [item(2).url]);
  const next = library.shiftQueued(queue);
  assert.equal(next.item.url, item(1).url);
  assert.deepEqual(next.queue.map((x) => x.url), [item(2).url]);
  assert.deepEqual(library.shiftQueued([]), {item:null, queue:[]});
});
test('malformed stored lists are sanitized and the queue retains the first 100 items', () => {
  assert.deepEqual(library.items('junk', true), []);
  const list = [null, {url:'file:///private'}, ...Array.from({length:105}, (_, n) => item(n)), item(0)];
  const queue = library.items(list, true);
  assert.equal(queue.length, 100);
  assert.equal(queue[0].url, item(0).url);
  assert.equal(queue[99].url, item(99).url);
  assert.equal(library.enqueue(queue, item(101)).length, 100);
});
