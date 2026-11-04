// Small, local-only lists for favorite sources, favorite items and the playback queue.
// ES5 only. The caller owns persistence and playback; these helpers do not mutate their inputs.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NgheLibrary = factory();
}(this, function () {
  'use strict';
  var MAX_SOURCES = 100, MAX_ITEMS = 100, MAX_TRACKS = 200;
  function validUrl(url) {
    return typeof url === 'string' && /^https?:\/\/[^\s"'<>\\]+$/i.test(url);
  }
  function itemCopy(item, isTrack) {
    if (!item || !validUrl(item.url)) return null;
    var out = {url: item.url}, fields = ['title', 'id', 'image', 'sourceId', 'sourceTitle'];
    fields.forEach(function (name) { if (typeof item[name] === 'string') out[name] = item[name]; });
    ['date', 'duration'].forEach(function (name) {
      if (typeof item[name] === 'number' && isFinite(item[name]) && item[name] >= 0) out[name] = item[name];
    });
    if (item.folder && !isTrack) out.folder = true;
    if (out.folder && Array.isArray(item.tracks)) {
      out.tracks = [];
      item.tracks.forEach(function (track) {
        if (out.tracks.length >= MAX_TRACKS) return;
        var copy = itemCopy(track, true);
        if (copy) out.tracks.push(copy);
      });
    }
    return out;
  }
  function sourceIds(ids) {
    var out = [];
    (Array.isArray(ids) ? ids : []).forEach(function (id) {
      if (typeof id === 'string' && id && out.indexOf(id) < 0 && out.length < MAX_SOURCES) out.push(id);
    });
    return out;
  }
  function toggleSource(ids, id) {
    var out = sourceIds(ids), at = out.indexOf(id);
    if (at >= 0) out.splice(at, 1);
    else if (typeof id === 'string' && id && out.length < MAX_SOURCES) out.push(id);
    return out;
  }
  function items(list, playableOnly) {
    var out = [], urls = [];
    (Array.isArray(list) ? list : []).forEach(function (entry) {
      if (out.length >= MAX_ITEMS) return;
      var copy = itemCopy(entry, false);
      if (!copy || (playableOnly && copy.folder) || urls.indexOf(copy.url) >= 0) return;
      urls.push(copy.url); out.push(copy);
    });
    return out;
  }
  function toggleItem(list, entry) {
    var out = items(list, false), copy = itemCopy(entry, false), at = -1;
    if (!copy) return out;
    out.some(function (item, index) { if (item.url === copy.url) { at = index; return true; } return false; });
    if (at >= 0) out.splice(at, 1);
    else if (out.length < MAX_ITEMS) out.push(copy);
    return out;
  }
  function enqueue(list, entry) {
    var out = items(list, true), copy = itemCopy(entry, false);
    if (!copy || copy.folder || out.length >= MAX_ITEMS) return out;
    if (!out.some(function (item) { return item.url === copy.url; })) out.push(copy);
    return out;
  }
  function removeQueued(list, url) {
    return items(list, true).filter(function (item) { return item.url !== url; });
  }
  function shiftQueued(list) {
    var out = items(list, true), first = out.shift() || null;
    return {item: first, queue: out};
  }
  return {MAX_SOURCES: MAX_SOURCES, MAX_ITEMS: MAX_ITEMS, sourceIds: sourceIds, items: items,
    toggleSource: toggleSource, toggleItem: toggleItem, enqueue: enqueue, removeQueued: removeQueued, shiftQueued: shiftQueued};
}));
