const test = require('node:test');
const assert = require('node:assert/strict');
const feeds = require('../app/feeds.js');

const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
<title><![CDATA[VOV &amp; bạn]]></title><itunes:image href="https://cdn.example.org/cover.jpg"/>
<item><title><![CDATA[Thời sự 6h &#8211; 4/11]]></title><guid>ep-2</guid><pubDate>Tue, 04 Nov 2026 06:00:00 +0700</pubDate>
<itunes:duration>01:02:03</itunes:duration><enclosure url="https://audio.example.org/a.mp3" type="audio/mpeg" length="1"/></item>
<item><title>Chỉ có chữ</title><pubDate>Mon, 03 Nov 2026 06:00:00 +0700</pubDate></item>
<item><title>Bài m4a</title><itunes:duration>643</itunes:duration><itunes:image href="https://cdn.example.org/ep.jpg"/>
<enclosure url="https://audio.example.org/b.m4a" type="audio/x-m4a"/></item>
<item><title>Link xấu</title><enclosure url="javascript:alert(1)//.mp3" type="audio/mpeg"/></item>
</channel></rss>`;

test('RSS: audio items only, entities and CDATA decoded, durations parsed, item art falls back to the show', () => {
  const feed = feeds.parseRss(RSS, 10);
  assert.equal(feed.title, 'VOV & bạn');
  assert.equal(feed.image, 'https://cdn.example.org/cover.jpg');
  assert.deepEqual(feed.items.map((item) => item.title), ['Thời sự 6h – 4/11', 'Bài m4a']);
  assert.equal(feed.items[0].id, 'ep-2');
  assert.equal(feed.items[0].duration, 3723);
  assert.equal(feed.items[0].image, 'https://cdn.example.org/cover.jpg');
  assert.equal(feed.items[1].image, 'https://cdn.example.org/ep.jpg');
  assert.equal(feed.items[1].duration, 643);
  assert.ok(feed.items[0].date > 0);
  assert.equal(feeds.parseRss(RSS, 1).items.length, 1);
  assert.deepEqual(feeds.parseRss(undefined).items, []);
});
test('a partial download parses only complete items, and enoughItems cuts right after the Nth one', () => {
  const cut = RSS.indexOf('<item><title>Bài m4a') + 30;
  assert.equal(feeds.parseRss(RSS.slice(0, cut), 10).items.length, 1);
  const at = feeds.enoughItems(RSS, 2);
  assert.ok(at > 0 && RSS.slice(0, at).endsWith('</item>'));
  assert.equal(feeds.parseRss(RSS.slice(0, at), 10).items.length, 1); // 2nd item has no audio
  assert.equal(feeds.enoughItems(RSS, 9), -1);
  assert.equal(feeds.enoughItems(null, 1), -1);
});
test('durations and URLs are validated', () => {
  assert.deepEqual(['643', '12:30', '01:02:03', '', 'abc', '1:2:3:4', undefined].map(feeds.parseDuration), [643, 750, 3723, 0, 0, 0, 0]);
  assert.equal(feeds.safeUrl('https://a.org/x y.mp3'), 'https://a.org/x%20y.mp3');
  assert.equal(feeds.safeUrl('https://a.org/Phàm.mp3'), 'https://a.org/Ph%C3%A0m.mp3');
  for (const bad of ['javascript:alert(1)', 'data:audio/mp3;base64,AA', 'ftp://a.org/x.mp3', '', null]) assert.equal(feeds.safeUrl(bad), '', String(bad));
});

const AZ_HOME = `<div><a title="Sách A - Tác giả" class="card-item" href="/vi/audiobook/sach-a"><div><img alt="Sách A" src="https://f.audioaz.com/a.webp?h=1"/></div></a>
<a class="card-item" href="/vi/audiobook/sach-b"><img alt="Sách B &amp; C" src="https://f.audioaz.com/b.webp"/></a>
<a title="Sách A - Tác giả" href="/vi/audiobook/sach-a">trùng</a><a href="/vi/page/dmca">DMCA</a></div>`;
const AZ_BOOK = '<audio hidden><source src="https://archive.org/download/x/Phần 1.mp3?cnt=0"/></audio><script>self.__next_f.push([1,"' +
  '\\"tracks\\":[{\\"id\\":2,\\"title\\":\\"Tập 2\\",\\"order\\":2,\\"audio_url\\":\\"https://archive.org/download/x/Phần [2].mp3\\",\\"stream_fallback\\":true},' +
  '{\\"id\\":1,\\"title\\":\\"Tập 1 \\\\u0026 mở đầu\\",\\"order\\":1,\\"audio_url\\":\\"https://archive.org/download/x/Phần 1.mp3\\"}]"])</script>';

test('AudioAZ: home cards become folders; a book page yields its ordered, encoded track list', () => {
  const books = feeds.audioazBooks(AZ_HOME);
  assert.deepEqual(books.map((book) => [book.id, book.title, book.folder]), [['sach-a', 'Sách A - Tác giả', true], ['sach-b', 'Sách B & C', true]]);
  assert.equal(books[0].url, 'https://audioaz.com/vi/audiobook/sach-a');
  assert.equal(books[0].image, 'https://f.audioaz.com/a.webp?h=1');
  const tracks = feeds.audioazTracks(AZ_BOOK);
  assert.deepEqual(tracks.map((track) => [track.order, track.title]), [[1, 'Tập 1 & mở đầu'], [2, 'Tập 2']]);
  assert.equal(tracks[0].url, 'https://archive.org/download/x/Ph%E1%BA%A7n%201.mp3');
  assert.equal(tracks[1].url, 'https://archive.org/download/x/Ph%E1%BA%A7n%20%5B2%5D.mp3');
  // Without the embedded data, the visible player's first source is still playable.
  assert.equal(feeds.audioazTracks('<source src="https://archive.org/download/x/a.mp3?cnt=0"/>').length, 1);
  assert.deepEqual(feeds.audioazTracks(''), []);
});

const WP = `<rss><channel><item><title>Sách một phần &#8211; Tác giả</title><link>https://sachnoivietnam.com/a.html</link>
<content:encoded><![CDATA[<img src="https://sachnoivietnam.com/wp-content/uploads/bia.jpg"/><audio src="https://sachnoivietnam.com/KhoSachNoi/A/S%C3%A1ch.mp3"></audio>]]></content:encoded></item>
<item><title>Sách nhiều phần</title><guid>b</guid><content:encoded><![CDATA[<a href="https://sachnoivietnam.com/KhoSachNoi/B/01_Mo_dau.mp3">1</a>
<a href="https://sachnoivietnam.com/KhoSachNoi/B/02.mp3">2</a><a href="https://sachnoivietnam.com/KhoSachNoi/B/01_Mo_dau.mp3">trùng</a>]]></content:encoded></item>
<item><title>Bài không có audio</title><content:encoded><![CDATA[<p>chữ</p>]]></content:encoded></item></channel></rss>`;

test('WordPress books: one file plays directly, several become a folder of parts, posts without audio are skipped', () => {
  const books = feeds.wordpressBooks(WP);
  assert.equal(books.length, 2);
  assert.equal(books[0].title, 'Sách một phần – Tác giả');
  assert.equal(books[0].folder, false);
  assert.equal(books[0].url, 'https://sachnoivietnam.com/KhoSachNoi/A/S%C3%A1ch.mp3');
  assert.equal(books[0].image, 'https://sachnoivietnam.com/wp-content/uploads/bia.jpg');
  assert.equal(books[1].folder, true);
  assert.deepEqual(books[1].tracks.map((track) => track.title), ['Phần 1 · 01 Mo dau', 'Phần 2 · 02']);
  assert.equal(feeds.wordpressBooks(WP, 1).length, 1);
});
