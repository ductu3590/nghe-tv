// Pure helpers for per-episode played overrides and locally ordered/pinned sources.
// The app stores their results on the TV; these helpers never access storage or the network.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NgheOrganize = factory();
}(this, function () {
  'use strict';
  var MAX_MARKS = 500;
  function own(object, key) { return Object.prototype.hasOwnProperty.call(object || {}, key); }
  function hasId(value) { return typeof value === 'string' && value.length > 0; }
  function cleanIds(ids) {
    var out = [];
    (Array.isArray(ids) ? ids : []).forEach(function (id) {
      if (hasId(id) && out.indexOf(id) < 0) out.push(id);
    });
    return out;
  }
  // A manual unread mark overrides even a completed resume position until the user
  // marks the episode as played again, or the caller records another completed play.
  function isPlayed(marks, url, progressPercent) {
    if (!hasId(url)) return false;
    var entry = own(marks, url) ? marks[url] : null;
    if (entry && typeof entry.done === 'boolean') return entry.done;
    return typeof progressPercent === 'number' && progressPercent >= 97;
  }
  function setPlayed(marks, url, done, now) {
    var next = {}, keys;
    if (marks && typeof marks === 'object' && !Array.isArray(marks)) {
      Object.keys(marks).forEach(function (key) {
        var entry = marks[key];
        if (hasId(key) && entry && typeof entry.done === 'boolean' && typeof entry.at === 'number' && isFinite(entry.at)) {
          next[key] = {done: entry.done, at: entry.at};
        }
      });
    }
    if (hasId(url) && typeof done === 'boolean' && typeof now === 'number' && isFinite(now)) next[url] = {done: done, at: now};
    keys = Object.keys(next).sort(function (a, b) { return next[b].at - next[a].at; });
    keys.slice(MAX_MARKS).forEach(function (key) { delete next[key]; });
    return next;
  }
  function pinned(pref, id) { return cleanIds(pref && pref.pinned).indexOf(id) >= 0; }
  function setPinned(pref, id, enabled) {
    var pins = cleanIds(pref && pref.pinned).filter(function (key) { return key !== id; });
    if (hasId(id) && enabled === true) pins.push(id);
    return {order: cleanIds(pref && pref.order), pinned: pins};
  }
  // Restore a saved order while allowing the remote source list to add/remove ids.
  // Pinned sources stay first, in their saved relative order.
  function orderSources(sources, pref) {
    var valid = (Array.isArray(sources) ? sources : []).filter(function (source) { return source && hasId(source.id); });
    var order = cleanIds(pref && pref.order), pins = cleanIds(pref && pref.pinned);
    return valid.map(function (source, index) {
      var rank = order.indexOf(source.id);
      return {source: source, initial: index, rank: rank < 0 ? order.length + index : rank, pin: pins.indexOf(source.id) >= 0};
    }).sort(function (a, b) {
      if (a.pin !== b.pin) return a.pin ? -1 : 1;
      return a.rank - b.rank || a.initial - b.initial;
    }).map(function (entry) { return entry.source; });
  }
  // Move by one position inside the pinned or unpinned group; pinning itself is separate.
  function moveSource(sources, pref, id, direction) {
    var result = {order: [], pinned: cleanIds(pref && pref.pinned)};
    var ordered = orderSources(sources, pref), at = -1, target, tmp;
    ordered.forEach(function (source, index) { if (source.id === id) at = index; });
    target = at + (direction < 0 ? -1 : direction > 0 ? 1 : 0);
    if (at >= 0 && target >= 0 && target < ordered.length && target !== at && pinned(result, ordered[at].id) === pinned(result, ordered[target].id)) {
      tmp = ordered[at]; ordered[at] = ordered[target]; ordered[target] = tmp;
    }
    result.order = ordered.map(function (source) { return source.id; });
    return result;
  }
  return {MAX_MARKS: MAX_MARKS, isPlayed: isPlayed, setPlayed: setPlayed, isPinned: pinned,
    setPinned: setPinned, orderSources: orderSources, moveSource: moveSource};
}));
