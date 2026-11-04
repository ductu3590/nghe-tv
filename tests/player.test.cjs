const test = require('node:test');
const assert = require('node:assert/strict');
const player = require('../app/player.js');

test('time labels', () => {
  assert.deepEqual([0, 5, 65, 3723, -3, NaN, undefined].map(player.formatTime), ['0:00', '0:05', '1:05', '1:02:03', '0:00', '0:00', '0:00']);
});
test('seeking stays inside the track', () => {
  assert.equal(player.seek(10, -15, 100), 0);
  assert.equal(player.seek(95, 15, 100), 99);
  assert.equal(player.seek(40, 15, NaN), 55); // live or unknown length
  assert.equal(player.seek(undefined, 15, 100), 15);
});
test('auto-next follows the source order, stops at the ends, and is off by default', () => {
  assert.equal(player.nextIndex(5, 2, 'newer'), 1);
  assert.equal(player.nextIndex(5, 0, 'newer'), -1);
  assert.equal(player.nextIndex(5, 2, 'list'), 3);
  assert.equal(player.nextIndex(5, 4, 'list'), -1);
  assert.equal(player.nextIndex(5, 2, undefined), -1);
  assert.equal(player.nextIndex(0, 0, 'list'), -1);
  assert.equal(player.nextIndex(5, 9, 'list'), -1);
});
test('sleep timer cycles through minutes and the end-of-track option', () => {
  assert.deepEqual([0, 15, 30, 60, 'end', 7].map(player.nextSleep), [15, 30, 60, 'end', 0, 0]);
  assert.match(player.sleepLabel('end'), /Hết bài/);
  assert.equal(player.sleepLabel(0), 'Hẹn giờ: tắt');
  assert.equal(player.sleepLabel(30), 'Tự dừng sau 30 phút');
});
test('resume: only after 15 s and before the last 30 s; progress keeps the newest 200 entries', () => {
  let map = player.saveProgress({}, 'a', 120.7, 600, 1000);
  assert.deepEqual(map.a, {t: 120, d: 600, at: 1000});
  assert.equal(player.resumeAt(map, 'a'), 120);
  assert.equal(player.resumeAt(player.saveProgress(map, 'a', 10, 600, 2000), 'a'), 0);
  assert.equal(player.resumeAt(player.saveProgress(map, 'a', 580, 600, 2000), 'a'), 0);
  assert.equal(player.resumeAt(map, 'missing'), 0);
  assert.equal(player.percent(map, 'a'), 20);
  for (let i = 0; i < 230; i += 1) map = player.saveProgress(map, 'u' + i, 30, 60, 3000 + i);
  assert.equal(Object.keys(map).length, 200);
  assert.ok(!('a' in map) && 'u229' in map);
  assert.deepEqual(player.saveProgress({bad: null, worse: {t: 1}}, 'x', 1, 2, 5), {x: {t: 1, d: 2, at: 5}});
});
test('recents: newest first, one per URL, at most 20', () => {
  let list = [];
  for (let i = 0; i < 25; i += 1) list = player.addRecent(list, {url: 'u' + (i % 22), title: String(i)});
  assert.equal(list.length, 20);
  assert.equal(list[0].title, '24');
  assert.equal(list.filter((item) => item.url === 'u2').length, 1);
  assert.deepEqual(player.addRecent('junk', {url: 'x'}), [{url: 'x'}]);
});
test('cache freshness and list subtitles', () => {
  assert.equal(player.isFresh({at: 100}, 150, 100), true);
  assert.equal(player.isFresh({at: 100}, 250, 100), false);
  assert.equal(player.isFresh({at: 300}, 250, 100), false); // clock went backwards
  assert.equal(player.isFresh(null, 1, 1), false);
  const now = new Date(2026, 10, 4, 9).getTime();
  assert.equal(player.subtitle({date: new Date(2026, 10, 4, 6).getTime(), duration: 888}, 40, now), 'Hôm nay · 14:48 · đã nghe 40%');
  assert.equal(player.subtitle({date: new Date(2026, 10, 3, 21).getTime()}, 99, now), '3/11 · đã nghe xong');
  assert.equal(player.subtitle({folder: true, tracks: [1, 2]}, 0, now), '2 phần');
});

test('playback speed cycles through the supported options', () => {
  assert.deepEqual([1, 1.25, 1.5, 0.75, 99].map(player.nextSpeed), [1.25, 1.5, 0.75, 1, 1]);
});

test('speed verification detects a TV that accepts a value but plays at normal speed', () => {
  assert.equal(player.speedMatches(1.25, 4, 4), false);
  assert.equal(player.speedMatches(1.5, 6, 4), true);
  assert.equal(player.speedMatches(0.75, 3, 4), true);
  assert.equal(player.speedMatches(1.5, 0, 4), false);
});
