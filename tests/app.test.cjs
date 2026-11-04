const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const preview = require('../tools/preview.cjs');

const SCRIPTS = ['app/app.js', 'app/feeds.js', 'app/player.js', 'probe/probe.js'];

test('never takes Home, Power or brand keys; only registers media keys the TV reports as supported', () => {
  for (const file of SCRIPTS) {
    const source = read(file);
    assert.ok(!/registerKey\(\s*['"](?!Media)/.test(source), file + ' registers a non-media key');
    assert.ok(!/\b10252\b|\b10182\b/.test(source), file + ' hard-codes a key code'); // codes come from getSupportedKeys
    assert.ok(!source.includes('innerHTML'), file);
    assert.ok(!/\beval\(|new Function\(/.test(source), file);
  }
  const app = read('app/app.js');
  assert.match(app, /var MEDIA_KEYS = \['MediaPlayPause'/);
  assert.match(app, /getSupportedKeys\(\)\.forEach/);
  assert.match(app, /tv\.tvinputdevice\.registerKey\(name\)/);
});
test('launcher JS stays ES5 for the Tizen 6.5 browser', () => {
  for (const file of SCRIPTS) {
    const source = read(file).replace(/\/\/[^\n]*/g, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
    assert.ok(!source.includes('=>'), file + ' arrow function');
    assert.ok(!/\b(let|const|class)\s/.test(source), file + ' let/const/class');
    assert.ok(!source.includes('`'), file + ' template literal');
    assert.ok(!/\b(async|await)\b/.test(source), file + ' async');
  }
});
test('pages keep a strict CSP: no inline script, style or handlers; network only over https', () => {
  for (const page of ['app/index.html', 'probe/index.html']) {
    const html = read(page);
    assert.ok(!/<script(?![^>]*src=)/.test(html), page);
    assert.ok(!/<style/.test(html) && !/\sstyle=/.test(html) && !/\son[a-z]+=/.test(html), page);
    assert.match(html, /script-src 'self'; style-src 'self'/);
    assert.match(html, /connect-src 'self' https:/);
    assert.match(html, /object-src 'none'/);
    assert.ok(!/http:/.test(html.match(/Content-Security-Policy" content="([^"]+)"/)[1]), page + ' allows plain http');
  }
});
test('widgets ask only for internet and the input device; the app is not a background app (the probe tests that)', () => {
  const names = (xml) => [...xml.matchAll(/privilege name="http:\/\/tizen\.org\/privilege\/([^"]+)"/g)].map((m) => m[1]).sort();
  const app = read('app/config.xml'), probe = read('probe/config.xml');
  assert.deepEqual(names(app), ['internet', 'tv.inputdevice']);
  assert.deepEqual(names(probe), ['internet', 'tv.inputdevice']);
  assert.match(app, /<tizen:application id="NgheTV0001\.Nghe" package="NgheTV0001"/);
  assert.match(probe, /<tizen:application id="NgheProbe1\.Probe" package="NgheProbe1"/);
  assert.match(app, /background-support="disable"/);
  assert.match(probe, /background-support="enable"/);
});
test('sources.json: valid tabs, unique ids, https feeds of known types, every host listed for the preview proxy', () => {
  const data = JSON.parse(read('app/sources.json'));
  const ids = new Set();
  assert.ok(Array.isArray(data.tabs) && data.tabs.length >= 1);
  for (const tab of data.tabs) {
    assert.ok(tab.id && tab.title && tab.sources.length, tab.id);
    for (const source of tab.sources) {
      assert.ok(!ids.has(source.id), 'duplicate ' + source.id); ids.add(source.id);
      assert.ok(['rss', 'audioaz', 'wordpress'].includes(source.type), source.id);
      assert.ok(preview.proxyTarget(source.url, data.hosts), source.id + ' host missing from hosts');
      if (source.next) assert.ok(['newer', 'list'].includes(source.next), source.id);
    }
  }
  assert.ok(preview.proxyTarget('https://raw.githubusercontent.com/ductu3590/nghe-tv/main/app/sources.json', data.hosts));
  assert.match(read('app/app.js'), /raw\.githubusercontent\.com\/ductu3590\/nghe-tv\/main\/app\/sources\.json/);
});
test('the probe carries exact copies of the parser and source list (run npm run sync)', () => {
  assert.equal(read('probe/feeds.js'), read('app/feeds.js'));
  assert.equal(read('probe/sources.json'), read('app/sources.json'));
});
test('preview proxy forwards only https URLs on listed hosts', () => {
  const hosts = ['anchor.fm', 'vnecdn.net'];
  assert.ok(preview.proxyTarget('https://anchor.fm/s/1/podcast/rss', hosts));
  assert.ok(preview.proxyTarget('https://audio.vnecdn.net/a.mp3', hosts));
  for (const bad of ['http://anchor.fm/x', 'https://evil.example/x', 'https://anchor.fm.evil.example/x', 'https://notvnecdn.net/x', 'file:///etc/passwd', 'not a url', '']) {
    assert.equal(preview.proxyTarget(bad, hosts), null, bad);
  }
  assert.match(read('tools/preview.cjs'), /listen\(port, '127\.0\.0\.1'/);
});
test('the app reads every source directly on the TV; the proxy exists only in the desktop preview', () => {
  const app = read('app/app.js');
  assert.match(app, /var PREVIEW = !tv && \/\^http\/\.test\(location\.protocol\)/);
  assert.match(app, /function viaProxy\(url\) \{ return PREVIEW && \/\^https:\\\/\\\/\/\.test\(url\) \? '\/proxy\?url=' \+ encodeURIComponent\(url\) : url; \}/);
});
