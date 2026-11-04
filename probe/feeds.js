// Pure parsers for the sources Nghe reads directly (no server in between).
// ES5 only: this file runs on the Tizen 6.5 browser and in Node tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NgheFeeds = factory();
}(this, function () {
  'use strict';
  var NAMED = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
    laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’'};

  function fromCode(code) {
    if (!(code > 0 && code < 0x110000)) return '';
    if (code < 0x10000) return String.fromCharCode(code);
    code -= 0x10000;
    return String.fromCharCode(0xD800 + (code >> 10), 0xDC00 + (code & 0x3FF));
  }
  // Text of an XML/HTML node: CDATA unwrapped, entities decoded, tags removed, spaces collapsed.
  function cleanText(value) {
    if (typeof value !== 'string') return '';
    var text = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ');
    text = text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, function (all, name) {
      if (name.charAt(0) === '#') return fromCode(name.charAt(1).toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10));
      return Object.prototype.hasOwnProperty.call(NAMED, name.toLowerCase()) ? NAMED[name.toLowerCase()] : all;
    });
    return text.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }
  function tag(block, name) {
    var match = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i').exec(block);
    return match ? match[1] : '';
  }
  function attr(block, name, attribute) {
    var match = new RegExp('<' + name + '\\s[^>]*' + attribute + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i').exec(block);
    return match ? cleanText(match[2] !== undefined ? match[2] : match[3]) : '';
  }
  // Only http(s) URLs ever reach the page; anything else (javascript:, data:) is dropped.
  function safeUrl(value) {
    var url = cleanText(value);
    if (!/^https?:\/\//i.test(url)) return '';
    if (/[^\x21-\x7e]/.test(url)) { // spaces or Vietnamese letters in a file name; keep existing %XX as they are
      try { url = encodeURI(decodeURI(url)); } catch (error) { url = encodeURI(url); }
    }
    return /^https?:\/\/[\x21-\x7e]+$/.test(url) && !/["'<>\\]/.test(url) ? url : '';
  }
  // 643 · 12:30 · 01:02:03 → seconds; anything else → 0.
  function parseDuration(value) {
    var text = cleanText(value);
    if (/^\d+$/.test(text)) return parseInt(text, 10);
    if (!/^\d+(:\d{1,2}){1,2}$/.test(text)) return 0;
    var parts = text.split(':'), total = 0;
    for (var i = 0; i < parts.length; i += 1) total = total * 60 + parseInt(parts[i], 10);
    return total;
  }
  function parseDate(value) {
    var time = Date.parse(cleanText(value));
    return isNaN(time) ? 0 : time;
  }
  function isAudio(url, type) {
    return /^audio\//i.test(type || '') || /\.(mp3|m4a|aac|ogg|opus)(\?|#|$)/i.test(url || '');
  }
  // RSS 2.0 podcast feed → {title, image, items}. Works on a partial download: only complete <item>s count.
  function parseRss(text, limit) {
    var max = limit || 40, source = typeof text === 'string' ? text : '';
    var head = source.split(/<item[\s>]/i)[0];
    var channelImage = safeUrl(attr(head, 'itunes:image', 'href') || tag(tag(head, 'image'), 'url'));
    var feed = {title: cleanText(tag(head, 'title')), image: channelImage, items: []};
    var pattern = /<item[\s>][\s\S]*?<\/item>/gi, match;
    while ((match = pattern.exec(source)) && feed.items.length < max) {
      var block = match[0], url = safeUrl(attr(block, 'enclosure', 'url')), type = attr(block, 'enclosure', 'type');
      if (!url || !isAudio(url, type)) continue;
      feed.items.push({
        id: cleanText(tag(block, 'guid')) || url,
        title: cleanText(tag(block, 'title')) || 'Không có tiêu đề',
        url: url,
        date: parseDate(tag(block, 'pubDate')),
        duration: parseDuration(tag(block, 'itunes:duration')),
        image: safeUrl(attr(block, 'itunes:image', 'href')) || channelImage
      });
    }
    return feed;
  }
  // Where to stop a large feed download: just after the last complete item, once enough items arrived.
  function enoughItems(text, wanted) {
    var count = 0, at = -1, pattern = /<\/item>/gi, match;
    while ((match = pattern.exec(text || ''))) { count += 1; at = pattern.lastIndex; if (count >= wanted) break; }
    return count >= wanted ? at : -1;
  }

  // ---- AudioAZ (personal use): home page cards and the track list embedded in a book page ----
  function audioazBooks(html, base) {
    var books = [], seen = {}, origin = base || 'https://audioaz.com';
    var pattern = /<a\s[^>]*href="(\/vi\/audiobook\/[a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/gi, match;
    while ((match = pattern.exec(html || ''))) {
      if (seen[match[1]]) continue;
      var whole = match[0], title = attr(whole, 'a', 'title') || attr(match[2], 'img', 'alt');
      if (!title) continue;
      seen[match[1]] = true;
      books.push({id: match[1].split('/').pop(), title: title, url: origin + match[1], image: safeUrl(attr(match[2], 'img', 'src')), folder: true});
    }
    return books;
  }
  var ESCAPES = {b: '\b', f: '\f', n: '\n', r: '\r', t: '\t'};
  function unescapeLayer(value) {
    return value.replace(/\\(u[0-9a-fA-F]{4}|["\\\/bfnrt])/g, function (all, code) {
      if (code.charAt(0) === 'u') return String.fromCharCode(parseInt(code.slice(1), 16));
      return Object.prototype.hasOwnProperty.call(ESCAPES, code) ? ESCAPES[code] : code;
    });
  }
  // Two layers: the JS string literal that carries the page data, then the JSON inside it.
  function unescapeJsString(value) { return unescapeLayer(unescapeLayer(value)); }
  function audioazTracks(html) {
    var text = html || '', tracks = [], seen = {}, match;
    // The page embeds its data as an escaped JS string: \"title\":\"…\",\"order\":1,\"audio_url\":\"…\"
    var pattern = /\\"title\\":\\"((?:[^"\\]|\\\\.)*)\\",\\"order\\":(\d+),\\"audio_url\\":\\"((?:[^"\\]|\\\\.)*)\\"/g;
    while ((match = pattern.exec(text))) {
      var url = safeUrl(unescapeJsString(match[3]));
      if (!url || seen[url]) continue;
      seen[url] = true;
      tracks.push({id: url, title: cleanText(unescapeJsString(match[1])), order: parseInt(match[2], 10), url: url});
    }
    if (!tracks.length) { // fallback: the visible player's first <source>
      var first = safeUrl(attr(text, 'source', 'src'));
      if (first && isAudio(first)) tracks.push({id: first, title: 'Phần 1', order: 1, url: first});
    }
    tracks.sort(function (a, b) { return a.order - b.order; });
    return tracks;
  }

  // ---- WordPress feeds whose posts link their mp3 files (Sách Nói Việt Nam, personal use) ----
  function wordpressBooks(text, limit) {
    var books = [], pattern = /<item[\s>][\s\S]*?<\/item>/gi, match, max = limit || 50;
    while ((match = pattern.exec(text || '')) && books.length < max) {
      var block = match[0], body = tag(block, 'content:encoded') + ' ' + tag(block, 'description');
      var raw = body.replace(/<!\[CDATA\[|\]\]>/g, ''), files = [], seen = {}, found;
      var audio = /https?:\/\/[^"'\s<>]+?\.(?:mp3|m4a)(?:\?[^"'\s<>]*)?/gi;
      while ((found = audio.exec(raw))) {
        var url = safeUrl(found[0]);
        if (url && !seen[url]) { seen[url] = true; files.push(url); }
      }
      if (!files.length) continue;
      var image = /https?:\/\/[^"'\s<>]+?\.(?:jpe?g|png|webp)/i.exec(raw);
      var title = cleanText(tag(block, 'title'));
      books.push({
        id: cleanText(tag(block, 'guid')) || cleanText(tag(block, 'link')) || files[0],
        title: title || 'Sách nói',
        date: parseDate(tag(block, 'pubDate')),
        image: image ? safeUrl(image[0]) : '',
        folder: files.length > 1,
        url: files.length === 1 ? files[0] : '',
        tracks: files.map(function (file, index) {
          var name = decodeURIComponentSafe(file.split('/').pop().replace(/\.(mp3|m4a)(\?.*)?$/i, ''));
          return {id: file, title: files.length > 1 ? 'Phần ' + (index + 1) + ' · ' + name : title, order: index + 1, url: file};
        })
      });
    }
    return books;
  }
  function decodeURIComponentSafe(value) {
    try { return decodeURIComponent(value).replace(/[_+]/g, ' '); } catch (error) { return value; }
  }

  return {cleanText: cleanText, safeUrl: safeUrl, parseDuration: parseDuration, parseRss: parseRss, enoughItems: enoughItems,
    audioazBooks: audioazBooks, audioazTracks: audioazTracks, wordpressBooks: wordpressBooks, isAudio: isAudio};
}));
